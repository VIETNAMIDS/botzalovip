const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytdl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { processVideo, processAudio } = require('../../utils/index');
const { getCachedMedia, setCachedMedia } = require('../utils/musicCache');
const {
  registerSelection,
  handleReplySelection,
  triggerSelectionByUser,
} = require('../utils/musicSelections');
const { collectMessageIds } = require('../utils/messageUtils');
const { createSearchResultImage } = require('../utils/searchCanvas');
const { getCachedVideo, setCachedVideo } = require('../utils/videoCache');

ffmpeg.setFfmpegPath(ffmpegPath);

const TEMP_DIR = path.join(__dirname, 'temp');
const SEARCH_LIMIT = 20;
const DISPLAY_LIMIT = 10;
const SELECTION_TIMEOUT = 120000; // 120 giây
const QUALITY_PRESETS = {
  audio: {
    format: 'bestaudio[ext=m4a]/bestaudio/best',
    label: 'Audio',
    type: 'audio',
    ext: 'm4a'
  },
  mp3: {
    format: 'bestaudio[ext=m4a]/bestaudio/best',
    label: 'Audio',
    type: 'audio',
    ext: 'm4a'
  },
  low: {
    format: 'bestvideo[height<=360][vcodec^=avc1]+bestaudio/best[height<=360][vcodec^=avc1]',
    label: '360p',
    type: 'video',
    ext: 'mp4'
  },
  '360': {
    format: 'bestvideo[height<=360][vcodec^=avc1]+bestaudio/best[height<=360][vcodec^=avc1]',
    label: '360p',
    type: 'video',
    ext: 'mp4'
  },
  '360p': {
    format: 'bestvideo[height<=360][vcodec^=avc1]+bestaudio/best[height<=360][vcodec^=avc1]',
    label: '360p',
    type: 'video',
    ext: 'mp4'
  },
  '720': {
    format: 'bestvideo[height<=720][fps<=60][vcodec^=avc1]+bestaudio/best[height<=720][fps<=60][vcodec^=avc1]',
    label: '720p',
    type: 'video',
    ext: 'mp4'
  },
  '720p': {
    format: 'bestvideo[height<=720][fps<=60][vcodec^=avc1]+bestaudio/best[height<=720][fps<=60][vcodec^=avc1]',
    label: '720p',
    type: 'video',
    ext: 'mp4'
  },
  high: {
    format: 'bestvideo[height<=1080][fps<=60][vcodec^=avc1]+bestaudio/best[height<=1080][fps<=60][vcodec^=avc1]',
    label: '1080p',
    type: 'video',
    ext: 'mp4'
  },
  '1080': {
    format: 'bestvideo[height<=1080][fps<=60][vcodec^=avc1]+bestaudio/best[height<=1080][fps<=60][vcodec^=avc1]',
    label: '1080p',
    type: 'video',
    ext: 'mp4'
  },
  '1080p': {
    format: 'bestvideo[height<=1080][fps<=60][vcodec^=avc1]+bestaudio/best[height<=1080][fps<=60][vcodec^=avc1]',
    label: '1080p',
    type: 'video',
    ext: 'mp4'
  },
  max: {
    format: 'bestvideo[vcodec^=avc1]+bestaudio/best[vcodec^=avc1]',
    label: 'Cao nhất',
    type: 'video',
    ext: 'mp4'
  }
};

const QUALITY_TOKENS = new Set(Object.keys(QUALITY_PRESETS));

const YT_DESKTOP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Referer: 'https://www.youtube.com/',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
};

const YT_ANDROID_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  Referer: 'https://m.youtube.com/',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
};

function buildHeaderArray(headers) {
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
}

function normalizeExtractorArgs(args) {
  if (!args) return [];
  if (Array.isArray(args)) return args.slice();
  return [args];
}

function combineExtractorArgs(baseArgs, extraArgs = []) {
  const merged = normalizeExtractorArgs(baseArgs);
  for (const arg of normalizeExtractorArgs(extraArgs)) {
    if (!merged.includes(arg)) {
      merged.push(arg);
    }
  }
  return merged.length ? merged : undefined;
}

function mergeHeaderArrays(primary = [], secondary = []) {
  const seen = new Set();
  const merged = [];
  for (const source of [primary, secondary]) {
    for (const entry of source || []) {
      if (entry && !seen.has(entry)) {
        seen.add(entry);
        merged.push(entry);
      }
    }
  }
  return merged.length ? merged : undefined;
}

const BASE_YTDL_ARGS = {
  noWarnings: true,
  preferFreeFormats: true,
  noCheckCertificates: true,
  quiet: true,
};

const YTDL_CLIENT_PROFILES = {
  android: {
    addHeader: buildHeaderArray(YT_ANDROID_HEADERS),
    userAgent: YT_ANDROID_HEADERS['User-Agent'],
    referer: YT_ANDROID_HEADERS.Referer,
    extractorArgs: ['youtube:player_client=android'],
  },
  desktop: {
    addHeader: buildHeaderArray(YT_DESKTOP_HEADERS),
    userAgent: YT_DESKTOP_HEADERS['User-Agent'],
    referer: YT_DESKTOP_HEADERS.Referer,
  }
};

function isForbiddenError(error) {
  if (!error) return false;
  const message = [error.stderr, error.stdout, error.message]
    .filter(Boolean)
    .join(' ');
  return /403/.test(message);
}

async function execYtdl(target, options = {}, enableFallback = true) {
  const clientOrder = enableFallback ? ['android', 'desktop'] : ['android'];
  let lastError;

  for (let idx = 0; idx < clientOrder.length; idx += 1) {
    const client = clientOrder[idx];
    const profile = YTDL_CLIENT_PROFILES[client];
    if (!profile) continue;

    const mergedOptions = {
      ...BASE_YTDL_ARGS,
      ...profile,
      ...options,
      addHeader: mergeHeaderArrays(profile.addHeader, options.addHeader),
      extractorArgs: combineExtractorArgs(options.extractorArgs, profile.extractorArgs),
    };

    if (options.userAgent) mergedOptions.userAgent = options.userAgent;
    if (options.referer) mergedOptions.referer = options.referer;

    try {
      return await ytdl(target, mergedOptions);
    } catch (error) {
      lastError = error;
      const isLastAttempt = idx === clientOrder.length - 1;
      if (!isForbiddenError(error) || isLastAttempt) {
        throw error;
      }
      console.warn(`[YT] Client ${client} bị 403, thử client khác...`);
    }
  }

  throw lastError || new Error('yt-dlp không thể chạy với bất kỳ client nào.');
}

const config = {
  name: 'yt',
  aliases: ['youtube'],
  version: '1.2.0',
  role: 0,
  author: 'Cascade',
  description: 'Tìm kiếm và tải video/âm thanh từ YouTube',
  category: 'Tiện ích',
  usage: 'yt <từ khóa | link> [quality|audio] / yt <index> [quality]',
  cooldowns: 5,
  dependencies: {
    'youtube-dl-exec': '',
    'fluent-ffmpeg': '',
    'ffmpeg-static': '',
    axios: ''
  }
};

module.exports.config = config;

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function getQualityPreset(input) {
  if (!input) return {
    format: 'bestvideo[height<=720][fps<=60][vcodec^=avc1]+bestaudio/best[height<=720][fps<=60][vcodec^=avc1]',
    label: '720p',
    type: 'video',
    ext: 'mp4'
  };

  const key = String(input).toLowerCase();
  return QUALITY_PRESETS[key] || {
    format: 'bestvideo[height<=720][fps<=60][vcodec^=avc1]+bestaudio/best[height<=720][fps<=60][vcodec^=avc1]',
    label: '720p',
    type: 'video',
    ext: 'mp4'
  };
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Không rõ';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

function formatViews(count) {
  if (!Number.isFinite(count)) return 'Không rõ';
  return count.toLocaleString('vi-VN');
}

function isYoutubeUrl(text) {
  if (!text) return false;
  return /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i.test(text);
}

function getVideoKey(video) {
  return video?.id || video?.videoId || video?.encodeId || video?.url || video?.webpage_url;
}

function formatVideoList(videos) {
  const lines = ['🎬 Kết quả tìm kiếm YouTube'];
  videos.forEach((video, index) => {
    const idx = index + 1;
    lines.push(`${idx}. ${video.title || 'Không rõ tiêu đề'}`);
    lines.push(`   👤 ${video.channel || 'Không rõ kênh'}`);
    lines.push(`   ⏱️ ${video.durationText || formatDuration(video.duration)} | 👀 ${video.viewText || formatViews(video.viewCount)}`);
  });
  lines.push('\n👉 Trả lời tin nhắn này bằng số (tuỳ chọn thêm audio|360p|720p|1080p|max).');
  lines.push('Ví dụ: 1 audio hoặc 2 720p');
  return lines.join('\n');
}

function resolveQualityFromModifiers(modifiers = []) {
  const qualityToken = modifiers.find((token) => QUALITY_TOKENS.has(token));
  return getQualityPreset(qualityToken);
}

async function searchYoutube(query, limit = SEARCH_LIMIT) {
  try {
    const data = await execYtdl(`ytsearch${limit}:${query}`, {
      ...BASE_YTDL_ARGS,
      dumpSingleJson: true,
      skipDownload: true,
    });

    const entries = Array.isArray(data?.entries) ? data.entries : [];
    return entries
      .filter((entry) => entry?.webpage_url && entry?.title)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        url: entry.webpage_url,
        duration: entry.duration,
        durationText: formatDuration(entry.duration),
        channel: entry.uploader || 'Không rõ',
        viewCount: entry.view_count,
        viewText: formatViews(entry.view_count),
        thumbnail: Array.isArray(entry.thumbnails) && entry.thumbnails.length
          ? entry.thumbnails[entry.thumbnails.length - 1].url
          : entry.thumbnail || null
      }));
  } catch (error) {
    console.error('[YT] Lỗi tìm kiếm:', error.message || error);
    return [];
  }
}

async function downloadYoutubeMedia(videoUrl, preset) {
  ensureTempDir();
  const baseName = `yt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const outputTemplate = path.join(TEMP_DIR, `${baseName}.%(ext)s`);

  const ytdlOptions = {
    ...BASE_YTDL_ARGS,
    format: preset.format,
    output: outputTemplate,
    restrictFilenames: true,
  };

  if (preset.type === 'video' && preset.ext) {
    ytdlOptions.mergeOutputFormat = preset.ext;
  }

  await execYtdl(videoUrl, ytdlOptions);

  const files = await fs.promises.readdir(TEMP_DIR);
  const match = files.find((file) => file.startsWith(baseName));
  if (!match) {
    throw new Error('Không tìm thấy file sau khi tải.');
  }
  return path.join(TEMP_DIR, match);
}

async function convertToMp3(inputPath) {
  const targetPath = path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}.mp3`
  );

  if (path.extname(inputPath).toLowerCase() === '.mp3') {
    return inputPath;
  }

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .format('mp3')
      .on('end', resolve)
      .on('error', reject)
      .save(targetPath);
  });

  return targetPath;
}

async function fetchVideoInfo(url) {
  try {
    const info = await execYtdl(url, {
      ...BASE_YTDL_ARGS,
      dumpSingleJson: true,
      skipDownload: true,
    });
    return {
      id: info?.id,
      title: info?.title || 'Video YouTube',
      url: info?.webpage_url || url,
      duration: info?.duration,
      durationText: formatDuration(info?.duration),
      channel: info?.uploader || 'Không rõ',
      thumbnail: Array.isArray(info?.thumbnails) && info.thumbnails.length
        ? info.thumbnails[info.thumbnails.length - 1].url
        : info?.thumbnail || null
    };
  } catch (error) {
    console.error('[YT] Lỗi lấy thông tin video:', error.message || error);
    return null;
  }
}

async function sendAudio(api, event, video, preset) {
  const { threadId, type } = event;
  let tempPath;
  let mp3Path;
  try {
    tempPath = await downloadYoutubeMedia(video.url, preset);
    mp3Path = await convertToMp3(tempPath);

    const voiceUrl = await processAudio(mp3Path, threadId, type);
    if (!voiceUrl) {
      throw new Error('Không thể xử lý audio.');
    }

    await api.sendMessage({
      msg: `🎵 Âm thanh YouTube
🎬 ${video.title}
📺 ${video.channel}`
    }, threadId, type);

    await api.sendVoice({
      voiceUrl,
      ttl: 360000
    }, threadId, type);
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    if (mp3Path && mp3Path !== tempPath && fs.existsSync(mp3Path)) {
      fs.unlinkSync(mp3Path);
    }
  }
}

async function sendVideo(api, event, video, preset) {
  const { threadId, type } = event;
  let tempPath;
  try {
    tempPath = await downloadYoutubeMedia(video.url, preset);
    const message = [
      '▶️ Video từ YouTube',
      `🎬 ${video.title}`,
      `📺 ${video.channel}`,
      `⏱️ ${video.durationText}`,
      `📊 Chất lượng: ${preset.label}`
    ].join('\n');

    let sent = false;
    try {
      await api.sendMessage({
        msg: message,
        attachments: [tempPath],
        ttl: 3600000
      }, threadId, type);
      sent = true;
    } catch (err) {
      console.error('[YT] Gửi video trực tiếp thất bại, thử fallback:', err?.message || err);
    }

    if (!sent) {
      const videoData = await processVideo(tempPath, threadId, type);
      if (!videoData) {
        throw new Error('Không thể xử lý video.');
      }

      await api.sendVideo({
        videoUrl: videoData.videoUrl,
        thumbnailUrl: videoData.thumbnailUrl || video.thumbnail,
        duration: videoData.metadata?.duration,
        width: videoData.metadata?.width,
        height: videoData.metadata?.height,
        msg: message,
        ttl: 3600000
      }, threadId, type);
    }
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

async function ytCommand({ api, event, args }) {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event.senderID || event.authorId;
  const senderName = data?.dName || 'bạn';

  if (!Array.isArray(args) || args.length === 0) {
    await api.sendMessage({
      msg: '❗ Cách dùng: yt <từ khóa | link> [quality|audio]\nVí dụ: yt sơn tùng || yt https://youtu.be/... audio'
    }, threadId, type);
    return;
  }

  const firstArg = args[0];
  const lastTokenRaw = args[args.length - 1];
  const lastToken = lastTokenRaw ? String(lastTokenRaw).toLowerCase() : null;
  const lastIsQuality = lastToken && QUALITY_TOKENS.has(lastToken);

  if (/^\d+$/.test(firstArg)) {
    const selectionText = args.join(' ');
    const handled = await triggerSelectionByUser(threadId, senderId, selectionText, api, event);
    if (!handled) {
      await api.sendMessage({
        msg: '⏳ Không tìm thấy danh sách YouTube gần đây hoặc lựa chọn không hợp lệ. Hãy tìm kiếm lại bằng yt <từ khóa>.'
      }, threadId, type);
    }
    return;
  }

  if (isYoutubeUrl(firstArg)) {
    const preset = getQualityPreset(lastIsQuality ? lastToken : null);

    await api.sendMessage({
      msg: '⏳ Đang xử lý link YouTube...'
    }, threadId, type);

    const info = await fetchVideoInfo(firstArg);
    if (!info) {
      await api.sendMessage({ msg: '❌ Không thể lấy thông tin video từ link này.' }, threadId, type);
      return;
    }

    try {
      if (preset.type === 'audio') {
        await sendAudio(api, event, info, preset);
      } else {
        await sendVideo(api, event, info, preset);
      }
    } catch (error) {
      console.error('[YT] Lỗi xử lý link:', error.message || error);
      await api.sendMessage({
        msg: `❌ Đã xảy ra lỗi khi xử lý: ${error.message || error}`
      }, threadId, type);
    }
    return;
  }

  const queryTokens = [...args];
  let defaultQualityToken = null;
  if (lastIsQuality) {
    defaultQualityToken = lastToken;
    queryTokens.pop();
  }

  const query = queryTokens.join(' ').trim();
  if (!query) {
    await api.sendMessage({ msg: '⚠️ Vui lòng nhập từ khóa tìm kiếm YouTube.' }, threadId, type);
    return;
  }

  await api.sendMessage({
    msg: `🔍 Đang tìm kiếm YouTube cho: ${query}`,
    ttl: 120000
  }, threadId, type);

  const results = await searchYoutube(query);
  if (!results.length) {
    await api.sendMessage({
      msg: `❌ Không tìm thấy kết quả cho "${query}".`
    }, threadId, type);
    return;
  }

  const normalizedResults = results.slice(0, SEARCH_LIMIT).map((video) => ({
    ...video,
    duration: Number.isFinite(video.duration) ? video.duration : Number(video.duration) || 0,
    durationText: video.durationText || formatDuration(video.duration),
    viewText: video.viewText || formatViews(video.viewCount),
    key: getVideoKey(video),
  }));

  const canvasData = normalizedResults.slice(0, DISPLAY_LIMIT).map((video) => ({
    title: video.title,
    artistsNames: video.channel,
    duration: Math.round(video.duration || 0),
    listen: video.viewCount || 0,
    like: video.likeCount || 0,
    thumbnailM: video.thumbnail,
    source: 'YOUTUBE',
  }));

  const defaultAvatar = path.join(process.cwd(), 'assets', 'bi_bon.png');
  const imagePath = await createSearchResultImage(canvasData, {
    template: 'zing',
    title: `YouTube • ${query}`,
    avatar: defaultAvatar,
    buttonText: 'YouTube',
  });

  const listMessage = formatVideoList(normalizedResults);
  const defaultPreset = getQualityPreset(defaultQualityToken);
  const messagePayload = {
    msg: defaultQualityToken
      ? `${listMessage}\n\n🔧 Mặc định tải: ${defaultPreset.label}`
      : listMessage,
    ttl: SELECTION_TIMEOUT,
  };

  if (imagePath) {
    messagePayload.attachments = [imagePath];
  }

  const sent = await api.sendMessage(messagePayload, threadId, type);

  const messageIds = collectMessageIds(sent);
  registerSelection({
    messageIds,
    threadId,
    senderId,
    platform: 'youtube',
    items: normalizedResults,
    ttl: SELECTION_TIMEOUT,
    metadata: {
      defaultQualityToken,
      imagePath,
    },
    async onSelect({ index, modifiers, api: apiSelect, event: eventSelect, record }) {
      const targetIndex = index - 1;
      if (targetIndex < 0 || targetIndex >= record.items.length) {
        if (apiSelect) {
          await apiSelect.sendMessage({
            msg: '⚠️ Số thứ tự không hợp lệ. Vui lòng chọn lại.',
            ttl: 20000,
          }, threadId, type);
        }
        return true;
      }

      const execApi = apiSelect || api;
      const execEvent = eventSelect || event;
      const modifiersLower = Array.isArray(modifiers) ? modifiers.map((m) => m.toLowerCase()) : [];
      const preset = resolveQualityFromModifiers(modifiersLower)
        || getQualityPreset(record.metadata?.defaultQualityToken)
        || getQualityPreset();

      const chosen = record.items[targetIndex];
      try {
        if (preset.type === 'audio') {
          await sendAudio(execApi, execEvent, chosen, preset);
        } else {
          await execApi.sendMessage({
            msg: `⏳ Đang tải "${chosen.title}" với chất lượng ${preset.label}...`,
            ttl: 120000,
          }, execEvent.threadId, execEvent.type);
          await sendVideo(execApi, execEvent, chosen, preset);
        }
      } catch (error) {
        console.error('[YT] Lỗi gửi media:', error?.message || error);
        await execApi.sendMessage({
          msg: `❌ Không thể gửi media: ${error?.message || error}`,
          ttl: 20000,
        }, execEvent.threadId, execEvent.type);
      } finally {
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

module.exports.run = async (params) => ytCommand(params);

module.exports.helpers = {
  config,
  getQualityPreset,
  sendAudio,
  sendVideo,
  SELECTION_TIMEOUT,
};

module.exports.handleEvent = async function ({ api, event }) {
  await handleReplySelection(api, event);
};
