'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const AUTO_DELETE_TIME = 120000;
const IMAGE_DIR = path.join(__dirname, '../../temp/canvas');
const QA_PATH = path.join(__dirname, '../../assets/thathaythach.json');

module.exports.config = {
  event_type: ['message'],
  name: 'thathaythachReply',
  version: '1.0.0',
  author: 'Cascade',
  description: 'Bắt reply chọn Thật/Thách cho game thathaythach',
  dependencies: {}
};

const REPLY_COOLDOWN_MS = 3000;

function ensureStores() {
  if (!(global.thtMessages instanceof Map)) {
    global.thtMessages = new Map();
  }
  if (!(global.thtReplyCooldown instanceof Map)) {
    global.thtReplyCooldown = new Map();
  }
}

function loadQA() {
  try {
    if (!fs.existsSync(QA_PATH)) return { truth: [], dare: [] };
    const parsed = JSON.parse(fs.readFileSync(QA_PATH, 'utf8'));
    const truth = Array.isArray(parsed?.truth) ? parsed.truth.map(String).map(s => s.trim()).filter(Boolean) : [];
    const dare = Array.isArray(parsed?.dare) ? parsed.dare.map(String).map(s => s.trim()).filter(Boolean) : [];
    return { truth, dare };
  } catch {
    return { truth: [], dare: [] };
  }
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let drawY = y;

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const width = ctx.measureText(test).width;
    if (width > maxWidth && line) {
      ctx.fillText(line, x, drawY);
      line = w;
      drawY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, drawY);
    drawY += lineHeight;
  }
  return drawY;
}

async function createQAImage({ mode, text }) {
  const width = 1100;
  const height = 760;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  if (mode === 'truth') {
    bg.addColorStop(0, '#22c55e');
    bg.addColorStop(1, '#06b6d4');
  } else {
    bg.addColorStop(0, '#f97316');
    bg.addColorStop(1, '#ef4444');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, 60, 60, width - 120, height - 120, 40);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px Arial';
  ctx.fillText(mode === 'truth' ? 'THẬT' : 'THÁCH', 90, 150);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '30px Arial';
  const y = wrapText(ctx, text, 90, 240, width - 180, 44);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '24px Arial';
  ctx.fillText('Gõ thathaythach để chơi tiếp.', 90, Math.min(y + 60, 640));

  return canvas;
}

function getRecordFromReply(event) {
  const quote = event?.data?.quote;
  if (!quote) return null;
  const ids = [
    quote.globalMsgId,
    quote.msgId,
    quote.messageId,
    quote.cliMsgId,
    quote?.data?.msgId,
    quote?.data?.cliMsgId,
  ].filter(Boolean).map(String);

  ensureStores();
  for (const id of ids) {
    const rec = global.thtMessages.get(id);
    if (rec) return rec;
  }
  return null;
}

function getLatestActiveRecordForThread(threadId) {
  ensureStores();
  const now = Date.now();
  let latest = null;
  for (const [, record] of global.thtMessages.entries()) {
    if (!record) continue;
    if (String(record.threadId) !== String(threadId)) continue;
    if (record.expiresAt && record.expiresAt < now) continue;
    if (!latest || (record.createdAt || 0) > (latest.createdAt || 0)) latest = record;
  }
  return latest;
}

module.exports.run = async ({ api, event }) => {
  try {
    const threadId = event?.threadId;
    const type = event?.type;
    const data = event?.data;
    if (!threadId || typeof type === 'undefined' || !data) return;

    const rawContent = data?.content?.title ?? data?.content;
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';
    if (!content) return;

    // accept 1/2, thật/thách
    const token = content.toLowerCase();
    const pick = token === '1' || token === 'thật' || token === 'that' ? 'truth'
      : token === '2' || token === 'thách' || token === 'thach' ? 'dare'
      : null;
    if (!pick) return;

    let record = getRecordFromReply(event);
    if (!record) record = getLatestActiveRecordForThread(threadId);
    if (!record) return;

    if (String(record.threadId) !== String(threadId)) return;

    const now = Date.now();
    if (record.expiresAt && record.expiresAt < now) {
      await api.sendMessage({ msg: '⏱️ Lượt chơi đã hết hạn. Gõ thathaythach để chơi lại!', ttl: 20000 }, threadId, type);
      return;
    }

    // Anti spam
    ensureStores();
    const senderId = data?.uidFrom || event?.authorId || event?.senderID;
    const cdKey = `${String(threadId)}:${String(senderId || 'unknown')}`;
    const last = global.thtReplyCooldown.get(cdKey) || 0;
    if (now - last < REPLY_COOLDOWN_MS) return;
    global.thtReplyCooldown.set(cdKey, now);

    const qa = loadQA();
    const list = pick === 'truth' ? qa.truth : qa.dare;
    const question = pickRandom(list) || (pick === 'truth' ? 'Nói thật đi: bạn đang nghĩ gì?' : 'Thử thách: gửi 1 sticker bất kỳ!');

    fs.mkdirSync(IMAGE_DIR, { recursive: true });
    const canvas = await createQAImage({ mode: pick, text: question });
    const outPath = path.join(IMAGE_DIR, `tht_${pick}_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
    await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

    await api.sendMessage({
      msg: pick === 'truth' ? '✅ Bạn chọn THẬT!' : '🔥 Bạn chọn THÁCH!',
      attachments: [outPath],
      ttl: AUTO_DELETE_TIME,
    }, threadId, type);

    setTimeout(() => {
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
    }, 15000);
  } catch (error) {
    console.error('[thathaythachReply] Lỗi xử lý:', error?.message || error);
  }
};
