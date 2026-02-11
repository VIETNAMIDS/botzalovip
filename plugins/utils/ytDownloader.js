const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ZEID_ENDPOINT = 'https://api.zeidteam.xyz/media-downloader/atd';
const DOWNLOAD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: 'https://www.youtube.com/'
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeExt(ext, preset) {
  if (typeof ext !== 'string' || !ext.trim()) {
    return preset?.ext || (preset?.type === 'audio' ? 'm4a' : 'mp4');
  }
  return ext.toLowerCase().replace(/[^a-z0-9]/g, '') || (preset?.ext || 'mp4');
}

async function streamToFile(sourceUrl, destinationPath) {
  const response = await axios.get(sourceUrl, {
    responseType: 'stream',
    timeout: 30000,
    headers: DOWNLOAD_HEADERS,
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destinationPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', (err) => {
      writer.destroy();
      reject(err);
    });
  });

  return destinationPath;
}

function normalizeMedias(data) {
  if (!data) return [];
  if (Array.isArray(data.medias)) return data.medias;
  if (Array.isArray(data.data?.medias)) return data.data.medias;
  return [];
}

function selectMedia(medias, preset) {
  if (!Array.isArray(medias) || medias.length === 0) return null;
  const targetType = (preset?.type === 'audio') ? 'audio' : 'video';
  const candidates = medias.filter((item) => (item?.type || '').toLowerCase().includes(targetType));
  const list = candidates.length ? candidates : medias;

  const preferenceTokens = [];
  if (targetType === 'video') {
    if (preset?.label) preferenceTokens.push(String(preset.label).toLowerCase());
    preferenceTokens.push('hd_no_watermark', 'no_watermark', '1080', '720', '480');
  } else {
    preferenceTokens.push('audio', 'music', 'song');
  }

  for (const token of preferenceTokens) {
    const match = list.find((item) => {
      const q = (item?.quality || item?.qualityLabel || '').toLowerCase();
      return token && q.includes(token);
    });
    if (match) return match;
  }

  return list[0] || null;
}

async function downloadViaZeidApi({ targetUrl, tempDir, preset }) {
  if (!targetUrl) {
    throw new Error('Thiếu URL cần tải.');
  }
  ensureDir(tempDir);
  const { data } = await axios.get(`${ZEID_ENDPOINT}?url=${encodeURIComponent(targetUrl)}`, { timeout: 15000 });
  const medias = normalizeMedias(data);
  const media = selectMedia(medias, preset);
  if (!media || !media.url) {
    throw new Error('Zeid API không trả về media phù hợp.');
  }

  const ext = sanitizeExt(media.ext || media.extension || media.format, preset);
  const filename = `zeid_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = path.join(tempDir, filename);

  await streamToFile(media.url, filePath);
  return filePath;
}

module.exports = {
  downloadViaZeidApi,
};
