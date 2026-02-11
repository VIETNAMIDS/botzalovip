const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

const TEMP_DIR = path.join(process.cwd(), 'temp', 'images');

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

async function loadImageBuffer(source) {
  try {
    if (!source) return null;

    if (Buffer.isBuffer(source)) {
      return sharp(source).png().toBuffer();
    }

    if (typeof source === 'string') {
      if (source.startsWith('http://') || source.startsWith('https://')) {
        const response = await axios.get(source, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Referer: source,
          },
        });
        return sharp(Buffer.from(response.data)).png().toBuffer();
      }

      if (fs.existsSync(source)) {
        const data = await fs.promises.readFile(source);
        return sharp(data).png().toBuffer();
      }
    }

    return null;
  } catch (error) {
    if (error?.response?.status === 404) {
      return null;
    }
    console.warn('[imageUtil] Không thể load buffer ảnh:', error?.message || error);
    return null;
  }
}

async function saveTempImage(buffer, extension = '.png') {
  ensureTempDir();
  const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
  const filePath = path.join(TEMP_DIR, `img_${Date.now()}_${Math.random().toString(36).slice(2)}${safeExt}`);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

module.exports = {
  loadImageBuffer,
  saveTempImage,
};
