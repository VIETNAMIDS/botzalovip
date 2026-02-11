const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { ThreadType } = require('zca-js');

const TEMP_DIR = path.join(__dirname, 'cache', 'sticker');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

module.exports.config = {
  name: 'sticker',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Tạo sticker từ ảnh/GIF (reply hoặc link)',
  category: 'Tiện ích',
  usage: 'sticker [reply ảnh/GIF hoặc kèm link]',
  cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  if (type !== ThreadType.Group) {
    return api.sendMessage('Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  try {
    const source = await resolveSource(event, args);
    if (!source) {
      return api.sendMessage('❌ Vui lòng reply ảnh/GIF hoặc kèm link hợp lệ.', threadId, type);
    }

    const stickerPaths = await buildStickerVariants(source.buffer, source.ext);

    await api.sendCustomSticker(
      { threadId, type },
      stickerPaths.static,
      stickerPaths.animation || stickerPaths.static,
      498,
      332,
      0
    );

    cleanupFiles(stickerPaths);
  } catch (error) {
    console.error('[sticker] error:', error);
    return api.sendMessage('❌ Không thể tạo sticker. Vui lòng thử lại với ảnh/GIF khác.', threadId, type);
  }
};

async function resolveSource(event, args) {
  const reply = event.messageReply || event.repliedMessage;
  if (reply && reply.data && reply.data.attachments && reply.data.attachments.length > 0) {
    const attachment = reply.data.attachments[0];
    if (attachment.href) {
      const buffer = await downloadFile(attachment.href);
      return { buffer, ext: guessExtensionFromMime(attachment.contentType || attachment.mimeType) };
    }
  }

  const url = args.find(arg => /^https?:\/\//i.test(arg));
  if (url) {
    const buffer = await downloadFile(url);
    return { buffer, ext: guessExtensionFromUrl(url) };
  }

  return null;
}

async function downloadFile(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(response.data);
}

function guessExtensionFromMime(mime = '') {
  const lower = mime.toLowerCase();
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('png')) return 'png';
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  return 'png';
}

function guessExtensionFromUrl(url) {
  const lower = url.toLowerCase();
  if (lower.includes('.gif')) return 'gif';
  if (lower.includes('.webp')) return 'webp';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'jpg';
  if (lower.includes('.png')) return 'png';
  return 'png';
}

async function buildStickerVariants(buffer, ext) {
  const baseName = `sticker_${Date.now()}`;
  const staticPath = path.join(TEMP_DIR, `${baseName}.webp`);
  const animationPath = path.join(TEMP_DIR, `${baseName}_anim.webp`);

  if (ext === 'gif' || ext === 'webp') {
    await sharp(buffer, { animated: true })
      .resize(498, 332, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90, effort: 5, loop: 0 })
      .toFile(animationPath);

    await sharp(buffer)
      .resize(498, 332, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toFile(staticPath);

    return { static: staticPath, animation: animationPath };
  }

  await sharp(buffer)
    .resize(498, 332, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toFile(staticPath);

  return { static: staticPath, animation: null };
}

function cleanupFiles(paths) {
  for (const file of Object.values(paths)) {
    if (!file) continue;
    setTimeout(() => {
      fs.unlink(file, () => {});
    }, 10000);
  }
}
