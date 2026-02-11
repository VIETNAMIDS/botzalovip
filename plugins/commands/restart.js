const { TextStyle } = require('zca-js');
const fs = require('fs');
const path = require('path');

const AUTO_DELETE_TTL = 60000;
const RESTART_NOTICE_PATH = path.join(process.cwd(), 'temp', 'restart_notice.json');

module.exports.config = {
  name: 'restart',
  aliases: ['rs'],
  version: '1.0.0',
  role: 2,
  author: 'ShinTHL09',
  description: 'Khởi động lại bot',
  category: 'Hệ thống',
  usage: 'restart',
  cooldowns: 2,
  dependencies: {}
};

module.exports.run = async ({ event, api }) => {
  const { threadId, type, data } = event;  
  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
  }

  if (global.__treoToolMode === true) {
    return sendColored(api, threadId, type, '⚠️ TREO đang chạy, bot ở chế độ TOOL nên không thể restart.');
  }
  
  await sendColored(api, threadId, type, '🔄 Tiến hành khởi động lại bot...');

  try {
    const dir = path.dirname(RESTART_NOTICE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      threadId,
      type,
      uidFrom: data?.uidFrom || null,
      ts: Date.now()
    };
    fs.writeFileSync(RESTART_NOTICE_PATH, JSON.stringify(payload), 'utf8');
  } catch {
    // ignore
  }
  
  return process.exit(2);
};

function sendColored(api, threadId, type, text) {
  const msg = typeof text === 'string' ? text : String(text ?? '');
  const payload = {
    msg,
    styles: buildMultiColorStyle(msg),
    ttl: AUTO_DELETE_TTL
  };
  return api.sendMessage(payload, threadId, type);
}

function buildMultiColorStyle(message) {
  const text = typeof message === 'string' ? message : String(message ?? '');
  if (!text.length) return [{ start: 0, len: 0, st: TextStyle.Yellow }];

  const palette = [TextStyle.Yellow, TextStyle.Green, TextStyle.Blue, TextStyle.Pink];
  const styles = [];
  const total = text.length;
  const maxSegments = 8;
  const baseChunk = Math.max(1, Math.floor(total / maxSegments));
  let cursor = 0;

  while (cursor < total) {
    const remaining = total - cursor;
    const chunkSize = styles.length >= maxSegments - 1
      ? remaining
      : Math.min(remaining, baseChunk + Math.floor(Math.random() * 3));
    const st = palette[Math.floor(Math.random() * palette.length)];
    styles.push({ start: cursor, len: chunkSize, st });
    cursor += chunkSize;
  }

  return styles;
}
