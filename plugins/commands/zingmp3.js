const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const {
  getCachedMedia,
  setCachedMedia
} = require('../utils/musicCache');
const {
  registerSelection,
  handleReplySelection,
  triggerSelectionByUser,
} = require('../utils/musicSelections');
const { collectMessageIds } = require('../utils/messageUtils');
const { downloadAndConvertAudio } = require('../utils/musicDownloader');
const { createSearchResultImage, createNowPlayingImage } = require('../utils/searchCanvas');

const ZING_BASE_URL = 'https://zingmp3.vn';
const DEFAULT_ZING_CONFIG = {
  apiKey: 'X5BM3w8N7MKozC0B85o4KMlzLZKhV00y',
  secretKey: 'acOrvUS15XRW2o9JksiK1KgQ6Vbds8ZW',
  version: '1.11.13',
};
const UNOFFICIAL_ZING_API = 'https://zingmp3.vercel.app/api';
const CONFIG_CANDIDATES = [
  path.join(__dirname, '../config.json'),
  path.join(__dirname, '../../config/zingmp3.json'),
  path.join(process.cwd(), 'config', 'zingmp3.json')
];
const SEARCH_RESULT_LIMIT = 20;
const SELECTION_TTL_MS = 60_000;

let API_KEY = '';
let SECRET_KEY = '';
let VERSION = '1.11.11';
let CTIME = String(Math.floor(Date.now() / 1000));

// prevent duplicate sends in short time windows (signature -> { ts, result })
const recentSends = new Map(); // threadId -> { signature, ts, result }

async function sendOnce(api, threadId, type, payload) {
  try {
    const signature = payload.attachments && payload.attachments.length ? `img:${String(payload.attachments[0])}` : `msg:${String(payload.msg || '')}`;
    const now = Date.now();
    const entry = recentSends.get(threadId);
    if (entry && entry.signature === signature && (now - entry.ts) < 3000) {
      return entry.result;
    }
    const sent = await api.sendMessage(payload, threadId, type);
    recentSends.set(threadId, { signature, ts: now, result: sent });
    // cleanup after some time
    setTimeout(() => {
      const cur = recentSends.get(threadId);
      if (cur && cur.ts === now) recentSends.delete(threadId);
    }, 5000);
    return sent;
  } catch (err) {
    throw err;
  }
}

function loadConfig() {
  for (const candidate of CONFIG_CANDIDATES) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const configData = JSON.parse(fs.readFileSync(candidate, 'utf8')) || {};
      const { zingmp3 } = configData;
      if (zingmp3 && typeof zingmp3 === 'object') {
        API_KEY = zingmp3.apiKey || API_KEY;
        SECRET_KEY = zingmp3.secretKey || SECRET_KEY;
        VERSION = zingmp3.version || VERSION;
        return;
      }
    } catch (error) {
      console.warn('[ZINGMP3] Không đọc được config', candidate, error?.message || error);
    }
  }

  API_KEY = process.env.ZINGMP3_API_KEY || API_KEY;
  SECRET_KEY = process.env.ZINGMP3_SECRET_KEY || SECRET_KEY;
  VERSION = process.env.ZINGMP3_VERSION || VERSION;

  if (!API_KEY || !SECRET_KEY) {
    ({
      apiKey: API_KEY,
      secretKey: SECRET_KEY,
      version: VERSION = VERSION || DEFAULT_ZING_CONFIG.version,
    } = {
      apiKey: DEFAULT_ZING_CONFIG.apiKey,
      secretKey: DEFAULT_ZING_CONFIG.secretKey,
      version: DEFAULT_ZING_CONFIG.version,
    });
  }
}

loadConfig();

function refreshCTime() {
  CTIME = String(Math.floor(Date.now() / 1000));
}

function getHash256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function getHmac512(str, key) {
  return crypto.createHmac('sha512', key).update(Buffer.from(str, 'utf8')).digest('hex');
}

function sortParams(params) {
  return Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
}

const SIG_KEYS = new Set(['ctime', 'id', 'type', 'page', 'count', 'version']);

function encodeParamsToString(params, separator = '') {
  const encode = encodeURIComponent;
  return Object.keys(params)
    .map((key) => {
      const value = encode(params[key]);
      return value.length > 5000 ? '' : `${encode(key)}=${value}`;
    })
    .filter(Boolean)
    .join(separator);
}

function getStringParams(params) {
  const sorted = sortParams(params);
  const filtered = {};
  for (const key of Object.keys(sorted)) {
    const value = sorted[key];
    if (SIG_KEYS.has(key) && value !== null && value !== undefined && value !== '') {
      filtered[key] = value;
    }
  }
  return encodeParamsToString(filtered, '');
}

function getSig(pathname, params) {
  const stringParams = getStringParams(params);
  return getHmac512(pathname + getHash256(stringParams), SECRET_KEY);
}

async function getCookie() {
  try {
    const res = await axios.get(ZING_BASE_URL);
    if (Array.isArray(res.headers['set-cookie']) && res.headers['set-cookie'].length > 0) {
      return res.headers['set-cookie'][res.headers['set-cookie'].length - 1];
    }
  } catch (error) {
    console.warn('[ZINGMP3] Lỗi lấy cookie:', error?.message || error);
  }
  return null;
}

async function requestZing(pathname, params = {}) {
  if (!API_KEY || !SECRET_KEY) {
    throw new Error('Thiếu API_KEY hoặc SECRET_KEY cho ZingMP3. Hãy cấu hình trong config/zingmp3.json.');
  }

  const cookie = await getCookie();

  const requestParams = {
    ...params,
    apiKey: API_KEY,
    ctime: CTIME,
    version: VERSION
  };

  const sig = getSig(pathname, requestParams);

  const url = `${ZING_BASE_URL}${pathname}`;
  const response = await axios.get(url, {
    headers: cookie ? { Cookie: cookie } : undefined,
    params: {
      ...requestParams,
      sig
    }
  });

  if (response.data?.err && response.data.err !== 0) {
    throw new Error(response.data.msg || `Zing API error ${response.data.err}`);
  }

  return response.data;
}

function normalizeArtistsNames(song) {
  if (!song) return '';
  if (song.artistsNames) return song.artistsNames;
  if (Array.isArray(song.artists)) {
    return song.artists.map((artist) => artist.name || artist.alias).filter(Boolean).join(', ');
  }
  return '';
}

function normalizeSong(song) {
  if (!song) return null;
  return {
    encodeId: song.encodeId || song.id || song.songId,
    title: song.title || song.name,
    alias: song.alias,
    artistsNames: normalizeArtistsNames(song),
    artists: song.artists,
    duration: song.duration || song.length,
    releaseDate: song.releaseDate,
    streamingStatus: song.streamingStatus ?? 1,
    listen: song.listen || song.totalFollow || song.totalListen,
    like: song.like,
    thumbnail: song.thumbnail,
    thumbnailM: song.thumbnailM || song.thumbnail,
  };
}

async function requestZingFallback(endpoint, params = {}) {
  const response = await axios.get(`${UNOFFICIAL_ZING_API}${endpoint}`, { params });
  if (response.data?.err === 0) {
    return response.data;
  }
  throw new Error(response.data?.msg || `Zing fallback error ${response.data?.err}`);
}

async function chartHome() {
  refreshCTime();
  return requestZing('/api/v2/page/get/chart-home', {});
}

async function searchSongs(keyword, limit = 30) {
  refreshCTime();
  try {
    return await requestZing('/api/v2/search', {
      q: keyword,
      type: 'song',
      count: limit,
      allowCorrect: 1
    });
  } catch (error) {
    const fallback = await requestZingFallback('/search', {
      q: keyword,
      type: 'song'
    });
    const songs = (fallback?.data?.songs || []).slice(0, limit).map(normalizeSong).filter(Boolean);
    return {
      data: {
        items: songs
      }
    };
  }
}

async function getSongDetail(songId) {
  refreshCTime();
  try {
    return await requestZing('/api/v2/page/get/song', {
      id: songId
    });
  } catch (error) {
    const fallback = await requestZingFallback('/song', {
      id: songId
    });
    return {
      data: normalizeSong(fallback?.data)
    };
  }
}

async function getStreaming(songId) {
  refreshCTime();
  try {
    return await requestZing('/api/v2/song/get/streaming', {
      id: songId
    });
  } catch (error) {
    const fallback = await requestZingFallback('/song/streaming', {
      id: songId
    });
    return {
      data: fallback?.data || {}
    };
  }
}

async function getLyric(songId) {
  refreshCTime();
  try {
    return await requestZing('/api/v2/lyric/get/lyric', {
      id: songId,
      BGId: 0
    });
  } catch (error) {
    const fallback = await requestZingFallback('/lyric', {
      id: songId
    });
    return {
      data: fallback?.data || {}
    };
  }
}

function extractZingUrl(text = '') {
  const pattern = /https?:\/\/zingmp3\.vn\/[^\s]+/i;
  const match = text.match(pattern);
  return match ? match[0] : null;
}

async function getChartRankInfo(songId) {
  try {
    const chart = await chartHome();
    const items = chart?.data?.RTChart?.items;
    if (Array.isArray(items)) {
      const found = items.find((item) => item.encodeId === songId);
      if (found) {
        return {
          rank: items.indexOf(found) + 1,
          score: found.score
        };
      }
    }
  } catch (error) {
    console.warn('[ZINGMP3] Không lấy được chart:', error?.message || error);
  }
  return null;
}

async function processSongData(songId, songData) {
  const [songInfo, streamingInfo] = await Promise.all([
    songData ? { data: songData } : getSongDetail(songId),
    getStreaming(songId)
  ]);

  if (songInfo?.err === -1023) {
    throw new Error(songInfo.msg || 'Bài hát yêu cầu tài khoản VIP.');
  }

  if (!streamingInfo?.data) {
    throw new Error(streamingInfo?.msg || 'Không lấy được link phát nhạc.');
  }

  let linkMusic = streamingInfo.data['320'];
  let quality = '320kbps';
  if (!linkMusic || /vip/i.test(String(linkMusic))) {
    linkMusic = streamingInfo.data['128'];
    quality = '128kbps';
  }

  return {
    songData: songInfo?.data,
    linkMusic,
    quality
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('vi-VN');
}

function formatSongList(songs) {
  const lines = ['🎶 Kết quả tìm kiếm ZingMP3'];
  songs.forEach((song, index) => {
    const idx = index + 1;
    const duration = song.duration ? `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, '0')}` : 'Không rõ';
    const premiumTag = song.streamingStatus === 2 ? ' (VIP)' : '';
    lines.push(`${idx}. ${song.title}${premiumTag}`);
    lines.push(`   👤 ${song.artistsNames}`);
    lines.push(`   ⏱️ ${duration} • 👂 ${formatNumber(song.listen || 0)}`);
  });
  lines.push('\n👉 Bạn có thể:');
  lines.push('• Trả lời tin nhắn này bằng số (ví dụ: 1 hoặc 1 lyric).');
  lines.push('• Hoặc dùng lệnh: zingmp3 pick <số> [lyric] (ví dụ: zingmp3 pick 1 lyric).');
  return lines.join('\n');
}
async function sendSong(api, event, song, options = {}) {
  const { threadId, type } = event;

  const { songData, linkMusic, quality } = await processSongData(song.encodeId, song);
  const chartInfo = await getChartRankInfo(song.encodeId);

  const messageLines = [
    '🎵 ZingMP3',
    `📛 ${songData?.title || song.title}`,
    `👤 ${songData?.artistsNames || song.artistsNames || 'Không rõ'}`,
    `🎧 Chất lượng: ${quality}`,
  ];

  if (chartInfo?.rank) {
    messageLines.push(`🏆 BXH: Top ${chartInfo.rank}`);
  }

  const stats = [];
  if (songData?.listen) stats.push(`${formatNumber(songData.listen)} lượt nghe`);
  if (songData?.like) stats.push(`${formatNumber(songData.like)} lượt thích`);
  if (stats.length) {
    messageLines.push(`📊 ${stats.join(' • ')}`);
  }

  let nowPlayingPath = null;
  try {
    nowPlayingPath = await createNowPlayingImage({
      platform: 'ZingMP3',
      title: songData?.title || song.title,
      artist: songData?.artistsNames || song.artistsNames || 'Không rõ',
      duration: songData?.duration || song.duration || 0,
      thumbnailM: songData?.thumbnailM || song.thumbnailM || songData?.thumbnail || song.thumbnail,
    });
  } catch {}

  if (nowPlayingPath) {
    await api.sendMessage({ msg: '', attachments: [nowPlayingPath], ttl: 300000 }, threadId, type);
  } else {
    await api.sendMessage({
      msg: messageLines.join('\n'),
      ttl: 300000,
    }, threadId, type);
  }

  let voiceUrl;
  const cached = getCachedMedia('zingmp3', song.encodeId, quality);
  if (cached?.fileUrl) {
    voiceUrl = cached.fileUrl;
  } else {
    voiceUrl = await downloadAndConvertAudio(linkMusic, api, event);
    if (voiceUrl) {
      setCachedMedia('zingmp3', song.encodeId, {
        fileUrl: voiceUrl,
        title: songData?.title || song.title,
        artist: songData?.artistsNames || song.artistsNames,
      }, quality);
    }
  }

  if (voiceUrl) {
    await api.sendVoice({
      voiceUrl,
      ttl: 1800000,
    }, threadId, type);
  } else {
    await api.sendMessage({
      msg: `⚠️ Không thể xử lý âm thanh. Bạn có thể nghe trực tiếp: ${linkMusic}`,
      ttl: 300000,
    }, threadId, type);
  }

  if (nowPlayingPath) {
    fs.promises.unlink(nowPlayingPath).catch(() => {});
  }

  if (options.includeLyric) {
    try {
      const lyric = await getLyric(song.encodeId);
      if (lyric?.data?.sentences) {
        const lyricText = lyric.data.sentences
          .map((sentence) => sentence.words.map((word) => word.data).join(' '))
          .filter((line) => line.trim().length)
          .join('\n');
        if (lyricText) {
          await api.sendMessage({
            msg: `📜 Lyrics:\n${lyricText.substring(0, 4000)}`,
            ttl: 360000,
          }, threadId, type);
        }
      }
    } catch (error) {
      console.warn('[ZINGMP3] Không lấy được lời bài hát:', error?.message || error);
    }
  }
}

module.exports.config = {
  name: 'zingmp3',
  aliases: ['zing'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade (adapted)',
  description: 'Tìm kiếm và phát nhạc ZingMP3',
  category: 'Giải trí',
  usage: 'zingmp3 <từ khóa> | zingmp3 pick <số> [lyric]',
  cooldowns: 5,
  dependencies: {
    axios: ''
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event.senderID || event.authorId;
  const senderName = data?.dName || 'bạn';

  if (!API_KEY || !SECRET_KEY) {
    return api.sendMessage({
      msg: '❌ Chưa cấu hình API Key/Secret Key cho ZingMP3. Vui lòng tạo file config/zingmp3.json chứa { "zingmp3": { "apiKey": "...", "secretKey": "..." } }',
      ttl: 60000
    }, threadId, type);
  }

  if (!args || args.length === 0) {
    return api.sendMessage({
      msg: '🎶 Dùng: zingmp3 <từ khóa>\nVí dụ: zingmp3 Anh Thế Là Đủ\nHoặc: zingmp3 pick 1 lyric',
      ttl: 60000
    }, threadId, type);
  }

  const sub = String(args[0]).toLowerCase();

  if (sub === 'pick' || sub === 'play') {
    if (args.length < 2) {
      return api.sendMessage({
        msg: '⚠️ Vui lòng nhập số bài hát, ví dụ: zingmp3 pick 1',
        ttl: 30000,
      }, threadId, type);
    }

    const parsed = [args[1], ...args.slice(2)].join(' ');
    const handled = await triggerSelectionByUser(threadId, senderId, parsed, api, event);
    if (!handled) {
      await api.sendMessage({
        msg: '⏳ Không tìm thấy danh sách gần đây hoặc lựa chọn không hợp lệ. Hãy tìm kiếm lại bằng zingmp3 <từ khóa>.',
        ttl: 30000,
      }, threadId, type);
    }
    return;
  }

  const keyword = args.join(' ').trim();
  const directUrl = extractZingUrl(keyword);

  if (directUrl) {
    const parts = directUrl.split('/');
    const lastSegment = parts[parts.length - 1] || '';
    const songId = lastSegment.split('.')[0];
    if (!songId) {
      return api.sendMessage({ msg: '❌ Link ZingMP3 không hợp lệ.', ttl: 30000 }, threadId, type);
    }

    try {
      const songInfo = await getSongDetail(songId);
      if (!songInfo?.data) {
        throw new Error('Không tìm thấy bài hát.');
      }
      await sendSong(api, event, songInfo.data, {});
    } catch (error) {
      await api.sendMessage({
        msg: `❌ Không thể phát bài hát từ link: ${error?.message || error}`,
        ttl: 30000
      }, threadId, type);
    }
    return;
  }

  try {
    const result = await searchSongs(keyword, SEARCH_RESULT_LIMIT);
    const items = result?.data?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return api.sendMessage({
        msg: `❌ Không tìm thấy bài hát nào với từ khóa: ${keyword}`,
        ttl: 30000
      }, threadId, type);
    }

    const songs = await Promise.all(items.slice(0, SEARCH_RESULT_LIMIT).map(async (item) => {
      try {
        const detail = await getSongDetail(item.encodeId);
        return { ...item, ...(detail?.data || {}) };
      } catch (error) {
        console.warn('[ZINGMP3] Không lấy được chi tiết bài hát:', error?.message || error);
        return item;
      }
    }));

    const canvasSongs = songs.map((song) => ({
      ...song,
      source: 'ZINGMP3',
    }));
    const defaultAvatar = path.join(process.cwd(), 'assets', 'bi_bon.png');
    const imagePath = await createSearchResultImage(canvasSongs, {
      template: 'zing',
      title: `ZingMP3 • ${keyword}`,
      avatar: defaultAvatar,
      buttonText: 'ZingMP3',
    });
    let sent;
    if (imagePath) {
      // send only the image attachment (no external text)
      // include empty msg to avoid API implementations that expect a string msg
      sent = await sendOnce(api, threadId, type, { msg: '', attachments: [imagePath], ttl: 120000 });
    } else {
      // fallback: if image couldn't be created, send textual list
      sent = await sendOnce(api, threadId, type, { msg: formatSongList(songs), ttl: 120000 });
    }

    const messageIds = collectMessageIds(sent);
    registerSelection({
      messageIds,
      threadId,
      senderId,
      platform: 'zingmp3',
      items: songs,
      ttl: SELECTION_TTL_MS,
      async onSelect({ index, modifiers, record, api: apiSelect, event: eventSelect }) {
        const targetIndex = index - 1;
        if (targetIndex < 0 || targetIndex >= record.items.length) {
          if (apiSelect) {
            await apiSelect.sendMessage({
              msg: '❌ Số bài hát không nằm trong danh sách. Vui lòng chọn lại.',
              ttl: 20000,
            }, threadId, type);
          }
          return true;
        }

        const includeLyric = modifiers.includes('lyric');
        const song = record.items[targetIndex];
        const ctxEvent = eventSelect || event;
        await sendSong(apiSelect || api, ctxEvent, song, { includeLyric });
        try {
          if (imagePath) {
            await fs.promises.unlink(imagePath);
          }
        } catch {}
        return true;
      },
    });
  } catch (error) {
    console.error('[ZINGMP3] Lỗi xử lý lệnh:', error);
    await api.sendMessage({
      msg: `${senderName} ơi, đã xảy ra lỗi khi xử lý lệnh ZingMP3: ${error?.message || error}`,
      ttl: 60000
    }, threadId, type);
  }
};

module.exports.handleEvent = async function ({ api, event }) {
  await handleReplySelection(api, event);
};

module.exports.provider = {
  platform: 'zingmp3',
  async search(query, limit = SEARCH_RESULT_LIMIT) {
    const result = await searchSongs(query, Math.max(1, Number(limit) || SEARCH_RESULT_LIMIT));
    const items = result?.data?.items;
    if (!Array.isArray(items)) return [];
    return items.slice(0, Math.max(1, Number(limit) || SEARCH_RESULT_LIMIT));
  },
  async play({ api, event, item, modifiers = [] }) {
    if (!item) throw new Error('Thiếu dữ liệu bài hát ZingMP3');
    const includeLyric = Array.isArray(modifiers) && modifiers.includes('lyric');
    await sendSong(api, event, item, { includeLyric });
  },
};
