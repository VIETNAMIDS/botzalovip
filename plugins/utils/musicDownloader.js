const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { processAudio } = require('../../utils/index');

const TEMP_DIR = path.join(process.cwd(), 'temp', 'music');

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

async function downloadToFile(url, extension = '.bin') {
  ensureTempDir();
  const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
  const filePath = path.join(TEMP_DIR, `music_${Date.now()}_${Math.random().toString(36).slice(2)}${safeExt}`);

  const writer = fs.createWriteStream(filePath);
  const response = await axios.get(url, {
    responseType: 'stream',
    headers: {
      Referer: url,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 20000,
  });

  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    let finished = false;

    writer.on('finish', () => {
      finished = true;
      resolve();
    });

    writer.on('error', (err) => {
      if (!finished) {
        writer.close(() => reject(err));
      }
    });
  });

  return filePath;
}

async function downloadAndConvertAudio(url, api, event) {
  let tempPath = null;
  try {
    tempPath = await downloadToFile(url, '.mp3');
    const voiceUrl = await processAudio(tempPath, event.threadId, event.type);
    return voiceUrl;
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
}

async function fetchBuffer(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 10000,
    headers: {
      Referer: url,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  return Buffer.from(response.data);
}

module.exports = {
  downloadToFile,
  downloadAndConvertAudio,
  fetchBuffer,
};
