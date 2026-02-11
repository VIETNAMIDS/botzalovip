const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { processAudio } = require('../../utils/index');
const { getCachedMedia, setCachedMedia } = require('../utils/musicCache');
const {
  registerSelection,
  handleReplySelection,
  triggerSelectionByUser,
} = require('../utils/musicSelections');
const { collectMessageIds } = require('../utils/messageUtils');
const { createSearchResultImage, createNowPlayingImage } = require('../utils/searchCanvas');
const { downloadToFile } = require('../utils/musicDownloader');

const SOUND_CLOUD_CACHE = path.join(process.cwd(), 'temp', 'soundcloud');
const SEARCH_LIMIT = 20;
const SELECTION_TIMEOUT = 120000;
const FALLBACK_CLIENT_IDS = [
  process.env.SOUNDCLOUD_CLIENT_ID,
  'pS7pP9l7xBrdU4SFKcNw6m7p0h6d6l5n',
  '2t9loNQH90kzJcsFCODdigxfp325aq4z',
  'a3e059563d7fd3372b49b37f00a00bcf',
].filter(Boolean);
const SOUND_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://soundcloud.com/',
};

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(value);
}

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function resolveClientId() {
  if (resolveClientId.cached && resolveClientId.cachedExpires > Date.now()) {
    return resolveClientId.cached;
  }

  const candidates = [
    ...FALLBACK_CLIENT_IDS,
    'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX',
    'LBCcHmRB8XSStWL6wKH2HPACspQlXcBf',
    'fDoItMDbsbZz8dY16ZzARCZmzgHBPotA',
  ];

  for (const id of candidates) {
    try {
      await axios.get('https://api-v2.soundcloud.com/search/tracks', {
        params: { q: 'test', client_id: id, limit: 1 },
        timeout: 5000,
        headers: SOUND_HEADERS,
      });
      resolveClientId.cached = id;
      resolveClientId.cachedExpires = Date.now() + 15 * 60 * 1000;
      return id;
    } catch (error) {
      console.warn('[SC] Client ID thất bại:', id.slice(0, 8), error?.response?.status || error?.message || error);
    }
  }

  const scrapedId = await scrapeClientId();
  if (scrapedId) {
    try {
      await axios.get('https://api-v2.soundcloud.com/search/tracks', {
        params: { q: 'test', client_id: scrapedId, limit: 1 },
        timeout: 5000,
        headers: SOUND_HEADERS,
      });
      resolveClientId.cached = scrapedId;
      resolveClientId.cachedExpires = Date.now() + 15 * 60 * 1000;
      return scrapedId;
    } catch (error) {
      console.warn('[SC] Client ID scrape vẫn lỗi:', error?.response?.status || error?.message || error);
    }
  }

  const fallback = candidates[0];
  resolveClientId.cached = fallback;
  resolveClientId.cachedExpires = Date.now() + 2 * 60 * 1000;
  return fallback;
}

async function scrapeClientId() {
  try {
    const homepage = await axios.get('https://soundcloud.com/discover', {
      headers: SOUND_HEADERS,
      timeout: 10000,
    });

    const directMatch = homepage.data.match(/client_id["']?\s*[:=]\s*["']?([a-zA-Z0-9]{32})["']?/);
    if (directMatch) {
      console.log('[SC] Lấy được client_id trực tiếp từ trang:', directMatch[1].slice(0, 8));
      return directMatch[1];
    }

    // try any JS scripts referenced on the page (widen search)
    const scriptUrls = Array.from(homepage.data.matchAll(/<script[^>]+src="([^"]+)"/g))
      .map((m) => m[1])
      .filter(Boolean)
      .slice(0, 20);

    for (const scriptUrl of scriptUrls) {
      try {
        const absoluteUrl = scriptUrl.startsWith('http') ? scriptUrl : `https:${scriptUrl}`;
        const scriptRes = await axios.get(absoluteUrl, {
          headers: SOUND_HEADERS,
          timeout: 10000,
        });
        // try several common patterns for client_id in JS
        const match = scriptRes.data.match(/client_id["']?\s*[:=]\s*["']?([a-zA-Z0-9]{32})["']?/) ||
                      scriptRes.data.match(/client_id=([a-zA-Z0-9]{32})/) ||
                      scriptRes.data.match(/client_id":"([a-zA-Z0-9]{32})"/);
        if (match) {
          console.log('[SC] Scrape được client_id từ script:', match[1].slice(0, 8));
          return match[1];
        }
      } catch (error) {
        console.warn('[SC] Không đọc được script client_id:', error?.message || error);
      }
    }
  } catch (error) {
    console.warn('[SC] Lỗi scrape client_id:', error?.message || error);
  }
  return null;
}

async function fallbackScrapeSearch(query) {
  try {
    const url = `https://soundcloud.com/search/sounds?q=${encodeURIComponent(query)}`;
    const res = await axios.get(url, { headers: SOUND_HEADERS, timeout: 10000 });
    const html = res.data || '';
    const hrefs = Array.from(html.matchAll(/href="(\/[^" >]+\/[^" >]+)"/g)).map(m => m[1]);
    const uniq = Array.from(new Set(hrefs)).filter(h => h.startsWith('/') && !h.includes('discover') && !h.includes('charts')).slice(0, SEARCH_LIMIT);
    const results = [];
    for (const pathUrl of uniq) {
      try {
        const trackPage = await axios.get(`https://soundcloud.com${pathUrl}`, { headers: SOUND_HEADERS, timeout: 8000 });
        const titleMatch = trackPage.data.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
        const thumbMatch = trackPage.data.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
        results.push({
          id: null,
          key: `scrape:${pathUrl}`,
          title: titleMatch ? titleMatch[1] : pathUrl.replace('/', ''),
          artist: null,
          duration: 0,
          url: `https://soundcloud.com${pathUrl}`,
          thumbnail: thumbMatch ? thumbMatch[1] : null,
          playCount: 0,
          likeCount: 0,
        });
      } catch (e) {
        continue;
      }
    }
    return results;
  } catch (e) {
    return [];
  }
}

async function searchSoundCloud(query) {
  try {
  const clientId = await resolveClientId();
    if (!clientId) throw new Error('Không có client_id SoundCloud hợp lệ');
  const response = await axios.get('https://api-v2.soundcloud.com/search/tracks', {
    params: {
      q: query,
      client_id: clientId,
      limit: SEARCH_LIMIT,
    },
    timeout: 10000,
    headers: SOUND_HEADERS,
  });
  const items = Array.isArray(response?.data?.collection) ? response.data.collection : [];
  return items
    .filter((item) => item?.id && item?.permalink_url)
    .map((item) => ({
      id: item.id,
      key: String(item.id),
      title: item.title,
      artist: item.user?.username || 'Không rõ',
      duration: Number(item.duration || 0) / 1000,
      url: item.permalink_url,
      thumbnail: item.artwork_url?.replace('-large', '-t500x500') || item.user?.avatar_url || null,
      playCount: item.playback_count || 0,
      likeCount: item.likes_count || 0,
    }));
  } catch (err) {
    console.warn('[SC] API search failed, falling back to HTML scrape:', err?.message || err);
    const scraped = await fallbackScrapeSearch(query);
    if (scraped && scraped.length) return scraped;
    throw err;
  }
}

async function getStreamUrl(track) {
  const clientId = await resolveClientId();
  const response = await axios.get('https://api-v2.soundcloud.com/tracks', {
    params: {
      ids: track.id,
      client_id: clientId,
    },
    timeout: 10000,
  });
  const fullTrack = Array.isArray(response?.data) ? response.data[0] : null;
  const transcoding = fullTrack?.media?.transcodings?.find((t) => t.format?.protocol === 'progressive')
    || fullTrack?.media?.transcodings?.[0];
  if (!transcoding?.url) return null;
  const streamResponse = await axios.get(`${transcoding.url}?client_id=${clientId}`, { timeout: 10000 });
  return streamResponse?.data?.url || null;
}

async function sendTrack(api, event, track) {
  const cached = getCachedMedia('soundcloud', track.id);
  if (cached?.fileUrl) {
    try {
      const nowPlayingPath = await createNowPlayingImage({
        platform: 'SoundCloud',
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        thumbnailM: track.thumbnail,
      });
      if (nowPlayingPath) {
        await api.sendMessage({ msg: '', attachments: [nowPlayingPath], ttl: 300000 }, event.threadId, event.type);
        fs.promises.unlink(nowPlayingPath).catch(() => {});
      }
    } catch {}
    await api.sendVoice({
      voiceUrl: cached.fileUrl,
      ttl: 360000,
    }, event.threadId, event.type);
    return;
  }

  const streamUrl = await getStreamUrl(track);
  if (!streamUrl) {
    throw new Error('Không tìm thấy stream hợp lệ');
  }

  ensureDirExists(SOUND_CLOUD_CACHE);
  const tempPath = await downloadToFile(streamUrl, '.mp3');
  try {
    let nowPlayingPath = null;
    try {
      nowPlayingPath = await createNowPlayingImage({
        platform: 'SoundCloud',
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        thumbnailM: track.thumbnail,
      });
    } catch {}
    if (nowPlayingPath) {
      await api.sendMessage({ msg: '', attachments: [nowPlayingPath], ttl: 300000 }, event.threadId, event.type);
      fs.promises.unlink(nowPlayingPath).catch(() => {});
    }
    const voiceUrl = await processAudio(tempPath, event.threadId, event.type);
    if (!voiceUrl) throw new Error('Không thể xử lý audio.');
    await api.sendVoice({ voiceUrl, ttl: 360000 }, event.threadId, event.type);
    setCachedMedia('soundcloud', track.id, {
      fileUrl: voiceUrl,
      title: track.title,
      artist: track.artist,
      duration: track.duration,
    });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function formatListMessage(tracks) {
  const lines = ['🎧 Danh sách SoundCloud'];
  tracks.forEach((track, index) => {
    lines.push(`${index + 1}. ${track.title}`);
    lines.push(`   👤 ${track.artist}`);
    lines.push(`   ⏱️ ${(track.duration || 0).toFixed(0)} giây | ▶️ ${formatNumber(track.playCount)} | ❤️ ${formatNumber(track.likeCount)}`);
  });
  lines.push('\n👉 Reply số để chọn bài (ví dụ: 1)');
  return lines.join('\n');
}

async function soundcloudCommand({ api, event, args }) {
  const { threadId, type, data } = event;
  const senderId = String(data?.uidFrom || event.senderID || event.authorId);
  if (!args.length) {
    await api.sendMessage({ msg: '❗ Cách dùng: sc <từ khóa>\nReply số để chọn bài.' }, threadId, type);
    return;
  }

  const firstArg = args[0];
  if (/^\d+$/.test(firstArg)) {
    const handled = await triggerSelectionByUser(threadId, senderId, args.join(' '), api, event, 'soundcloud');
    if (!handled) {
      await api.sendMessage({ msg: '⚠️ Không tìm thấy danh sách SoundCloud gần đây. Gõ lệnh tra cứu mới nhé.' }, threadId, type);
    }
    return;
  }

  const query = args.join(' ').trim();
  await api.sendMessage({ msg: `🔍 Đang tìm kiếm SoundCloud cho "${query}"...`, ttl: 60000 }, threadId, type);

  let tracks;
  try {
    tracks = await searchSoundCloud(query);
  } catch (error) {
    console.error('[SC] Lỗi tìm kiếm:', error?.message || error);
    await api.sendMessage({ msg: '❌ Không thể tìm kiếm SoundCloud lúc này. Hãy thử lại sau ít phút.' }, threadId, type);
    return;
  }

  if (!tracks.length) {
    await api.sendMessage({ msg: `❌ Không tìm thấy kết quả cho "${query}".` }, threadId, type);
    return;
  }

  const canvasData = tracks.map((track) => ({
    title: track.title,
    artistsNames: track.artist,
    duration: Math.round(track.duration || 0),
    listen: track.playCount,
    like: track.likeCount,
    thumbnailM: track.thumbnail,
    source: 'SOUNDCLOUD',
  }));

  const defaultAvatar = path.join(process.cwd(), 'assets', 'bi_bon.png');
  const imagePath = await createSearchResultImage(canvasData, {
    template: 'zing',
    title: `SoundCloud • ${query}`,
    avatar: defaultAvatar,
    buttonText: 'SoundCloud',
  });
  const listMessage = formatListMessage(tracks);
  let sent;
  if (imagePath) {
    // send only image (no external text)
    sent = await api.sendMessage({ msg: '', attachments: [imagePath], ttl: SELECTION_TIMEOUT }, threadId, type);
  } else {
    // fallback to text if image generation failed
    sent = await api.sendMessage({ msg: listMessage, ttl: SELECTION_TIMEOUT }, threadId, type);
  }
  const messageIds = collectMessageIds(sent);

  registerSelection({
    messageIds,
    threadId,
    senderId,
    platform: 'soundcloud',
    items: tracks,
    ttl: SELECTION_TIMEOUT,
    metadata: { imagePath },
    async onSelect({ index, api: execApi, event: execEvent, record }) {
      if (record.metadata?.processing) {
        return true;
      }

      const safeThreadId = record.threadId || execEvent?.threadId || threadId;
      const safeType = typeof execEvent?.type !== 'undefined' ? execEvent.type : type;
      const ctxEvent = {
        ...(execEvent || {}),
        threadId: safeThreadId,
        type: safeType,
        data: (execEvent && execEvent.data) ? execEvent.data : event.data,
      };

      const targetIndex = index - 1;
      if (targetIndex < 0 || targetIndex >= record.items.length) {
        await execApi.sendMessage({ msg: '⚠️ Số thứ tự không hợp lệ.', ttl: 20000 }, safeThreadId, safeType);
        return true;
      }

      const track = record.items[targetIndex];
      record.metadata.processing = true;
      try {
        // If track has no id (scraped fallback), send the link instead of attempting download
        if (!track.id) {
          await execApi.sendMessage({ msg: `🔗 Mở nghe: ${track.url}` }, safeThreadId, safeType);
        } else {
      try {
        await sendTrack(execApi, ctxEvent, track);
      } catch (error) {
        console.error('[SC] Lỗi gửi media:', error?.message || error);
        await execApi.sendMessage({ msg: `❌ Không thể gửi bài hát: ${error?.message || error}` }, safeThreadId, safeType);
          }
        }
      } finally {
        record.metadata.processing = false;
        if (record.metadata?.imagePath) {
          fs.promises.unlink(record.metadata.imagePath).catch(() => {});
        }
      }

      return true;
    },
  });

  if (imagePath) {
    const timer = setTimeout(() => {
      fs.promises.unlink(imagePath).catch(() => {});
    }, SELECTION_TIMEOUT + 10000);
    if (typeof timer.unref === 'function') timer.unref();
  }
}

module.exports = {
  config: {
    name: 'sc',
    aliases: ['soundcloud'],
    version: '1.1.0',
    role: 0,
    author: 'Cascade',
    description: 'Tìm kiếm và phát nhạc SoundCloud',
    category: 'Âm nhạc',
    cooldowns: 5,
  },
  onLoad() {
    ensureDirExists(SOUND_CLOUD_CACHE);
  },
  run: soundcloudCommand,
  handleEvent: async ({ api, event }) => handleReplySelection(api, event, 'soundcloud'),
  provider: {
    platform: 'soundcloud',
    async search(query, limit = SEARCH_LIMIT) {
      const prev = SEARCH_LIMIT;
      try {
        // reuse existing logic; cap at requested limit
        const results = await searchSoundCloud(query);
        return results.slice(0, Math.max(1, Number(limit) || prev));
      } catch (err) {
        throw err;
      }
    },
    async play({ api, event, item }) {
      if (!item) throw new Error('Thiếu dữ liệu bài hát SoundCloud');
      if (!item.id) {
        await api.sendMessage({ msg: `🔗 Mở nghe: ${item.url}` }, event.threadId, event.type);
        return;
      }
      await sendTrack(api, event, item);
    },
  },
};