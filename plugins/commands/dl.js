const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { processVideo, processAudio } = require('../../utils/index');
const { downloadMedia } = require('./autodown');

const API_ENDPOINTS = [
  'https://api.zeidteam.xyz/media-downloader/atd',
  'https://api.zeidteam.xyz/media-downloader/atd2',
  'https://api.zeidteam.xyz/media-downloader/atd3',
];
const MAX_IMAGE_ATTACHMENTS = 5;

module.exports.config = {
  name: 'dl',
  aliases: ['download', 'tải', 'dowload'],
  version: '2.0.0',
  role: 0,
  author: 'Bonz, Cascade',
  description: 'Tải media từ URL (TikTok, YouTube, Instagram, v.v.) thông qua Zeid API.',
  usage: 'dl <link> (hoặc reply link)',
  cooldowns: 3,
};

function extractUrl(event, args) {
  const urlArg = args?.[0];
  if (typeof urlArg === 'string' && /https?:\/\//i.test(urlArg)) {
    return urlArg.trim();
  }

  const reply = event.data?.quote || event.data?.messageReply;
  const scanText = (text) => (typeof text === 'string' ? text.match(/https?:\/\/[\S]+/i)?.[0] : null);

  if (reply) {
    const replyContent = reply?.content?.title ?? reply?.content ?? reply?.message ?? '';
    const match = scanText(replyContent);
    if (match) return match;
  }

  const currentContent = event.data?.content ?? event.data?.message ?? '';
  return scanText(currentContent) || null;
}

function buildMetaText(apiData) {
  const lines = [];
  if (apiData?.title) lines.push(`🎬 ${apiData.title}`);
  if (apiData?.author) lines.push(`👤 ${apiData.author}`);
  if (apiData?.unique_id) lines.push(`🆔 ${apiData.unique_id}`);
  return lines.length ? lines.join('\n') : '📥 Đang gửi media đã tải.';
}

function rankMedia(medias, desiredType) {
  if (!Array.isArray(medias)) return { video: null, images: [], audio: null };
  const normalized = medias.map((item) => ({ ...item, type: (item?.type || '').toLowerCase() }));
  const videoList = normalized.filter((m) => m.type === 'video');
  const imageList = normalized.filter((m) => m.type === 'image');
  const audioList = normalized.filter((m) => m.type === 'audio');

  const preferVideo = (list) => {
    const priorities = ['hd_no_watermark', 'no_watermark', '1080', '720', '480'];
    for (const token of priorities) {
      const match = list.find((m) => (m.quality || '').toLowerCase().includes(token));
      if (match) return match;
    }
    return list[0] || null;
  };

  const selectedVideo = preferVideo(videoList);
  const selectedAudio = audioList[0] || null;
  return {
    video: desiredType === 'audio' ? null : selectedVideo,
    audio: selectedAudio,
    images: imageList.slice(0, MAX_IMAGE_ATTACHMENTS),
  };
}

function parseMedias(data) {
  return Array.isArray(data?.medias)
    ? data.medias
    : Array.isArray(data?.data?.medias)
      ? data.data.medias
      : [];
}

async function fetchZeidData(url) {
  let lastError;
  for (const endpoint of API_ENDPOINTS) {
    try {
      const { data } = await axios.get(`${endpoint}?url=${encodeURIComponent(url)}`, { timeout: 20000 });
      const medias = parseMedias(data);
      if (!medias.length) {
        lastError = new Error('Không tìm thấy media trong phản hồi API.');
        continue;
      }
      return { apiData: data, medias };
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError?.response?.status
    ? `Zeid API trả về ${lastError.response.status}`
    : lastError?.message || 'Không thể kết nối Zeid API';
  throw new Error(message);
}

async function sendVideo(api, event, media, metaText) {
  const videoPath = await downloadMedia(media.url, 'video');
  if (!videoPath) throw new Error('Không thể tải file video.');
  const processed = await processVideo(videoPath, event.threadId, event.type);
  await api.sendVideo({
    msg: metaText,
    videoUrl: processed.videoUrl,
    thumbnailUrl: processed.thumbnailUrl,
    duration: processed.metadata?.duration,
    width: processed.metadata?.width,
    height: processed.metadata?.height,
    ttl: 3600000,
  }, event.threadId, event.type);
}

async function sendImages(api, event, images, metaText) {
  const attachments = [];
  try {
    for (const image of images) {
      const file = await downloadMedia(image.url, 'image');
      if (file) attachments.push(file);
    }
    if (!attachments.length) throw new Error('Không tải được hình ảnh.');
    await api.sendMessage({ msg: metaText, attachments, ttl: 3600000 }, event.threadId, event.type);
  } finally {
    attachments.forEach((file) => {
      try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    });
  }
}

async function sendAudio(api, event, audio, metaText) {
  const audioPath = await downloadMedia(audio.url, 'audio');
  if (!audioPath) throw new Error('Không thể tải file audio.');
  const voiceUrl = await processAudio(audioPath, event.threadId, event.type);
  await api.sendMessage({ msg: `${metaText}\n\n🎵 Audio`, ttl: 3600000 }, event.threadId, event.type);
  await api.sendVoice({ voiceUrl, ttl: 3600000 }, event.threadId, event.type);
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;
  const url = extractUrl(event, args);
  if (!url) {
    return api.sendMessage({ msg: '❗ Vui lòng cung cấp link hoặc reply 1 tin nhắn chứa link.', ttl: 20000 }, threadId, type);
  }

  await api.sendMessage({ msg: '⏳ Đang tải media, vui lòng chờ...', ttl: 30000 }, threadId, type);

  try {
    const { apiData, medias } = await fetchZeidData(url);
    const metaText = buildMetaText(apiData);
    const { video, images, audio } = rankMedia(medias);

    if (video) {
      await sendVideo(api, event, video, metaText);
      return;
    }

    if (images.length) {
      await sendImages(api, event, images, metaText);
      if (audio) {
        await sendAudio(api, event, audio, metaText);
      }
      return;
    }

    if (audio) {
      await sendAudio(api, event, audio, metaText);
      return;
    }

    throw new Error('API không trả về media phù hợp để gửi.');
  } catch (error) {
    console.error('[DL] Lỗi tải media:', error?.message || error);
    return api.sendMessage({ msg: `❌ Không thể tải media: ${error?.message || error}`, ttl: 20000 }, threadId, type);
  }
};
