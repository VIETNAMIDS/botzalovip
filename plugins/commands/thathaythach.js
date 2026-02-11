'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { collectMessageIds } = require('../utils/messageUtils');

const AUTO_DELETE_TIME = 120000;
const IMAGE_DIR = path.join(__dirname, '../../temp/canvas');
const QA_PATH = path.join(__dirname, '../../assets/thathaythach.json');

function ensureStores() {
  if (!(global.thtMessages instanceof Map)) {
    global.thtMessages = new Map();
  }
}

function loadQA() {
  try {
    if (!fs.existsSync(QA_PATH)) {
      return { truth: [], dare: [] };
    }
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

async function createChoiceImage() {
  const width = 1100;
  const height = 700;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0ea5e9');
  bg.addColorStop(1, '#a78bfa');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, 60, 60, width - 120, height - 120, 40);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('THẬT HAY THÁCH', 90, 150);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '28px Arial';
  ctx.fillText('Reply số để chọn (cute mode)', 90, 205);

  // Choice cards
  const cardW = 420;
  const cardH = 240;
  const gap = 50;
  const startX = 90;
  const startY = 260;

  // TRUTH
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, startX, startY, cardW, cardH, 30);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 52px Arial';
  ctx.fillText('1', startX + 30, startY + 75);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.fillText('THẬT', startX + 90, startY + 75);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '26px Arial';
  ctx.fillText('Câu hỏi thật lòng', startX + 90, startY + 120);

  // DARE
  const x2 = startX + cardW + gap;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, x2, startY, cardW, cardH, 30);
  ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 52px Arial';
  ctx.fillText('2', x2 + 30, startY + 75);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.fillText('THÁCH', x2 + 90, startY + 75);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '26px Arial';
  ctx.fillText('Thử thách vui nhộn', x2 + 90, startY + 120);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '24px Arial';
  ctx.fillText(`⏱️ Hết hạn sau ${Math.floor(AUTO_DELETE_TIME / 1000)}s`, 90, 620);

  return canvas;
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

module.exports.config = {
  name: 'thathaythach',
  aliases: ['tht'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Game Thật hay Thách bằng ảnh canvas cute (reply 1/2)',
  category: 'Giải trí',
  usage: '<prefix>thathaythach',
  cooldowns: 5,
};

module.exports.run = async function ({ api, event }) {
  const threadId = event?.threadId;
  const type = event?.type;
  if (!threadId || typeof type === 'undefined') return;

  ensureStores();
  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const canvas = await createChoiceImage();
  const outPath = path.join(IMAGE_DIR, `tht_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  const sent = await api.sendMessage({
    msg: '🎲 Thật hay Thách? Reply 1 hoặc 2!',
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME,
  }, threadId, type);

  let ids = collectMessageIds(sent);
  if (!Array.isArray(ids) || ids.length === 0) {
    if (sent != null && (typeof sent === 'string' || typeof sent === 'number')) {
      ids = [String(sent)];
    } else if (sent && typeof sent === 'object') {
      const fallbackId = sent.globalMsgId || sent.messageId || sent.msgId || sent.cliMsgId;
      if (fallbackId) ids = [String(fallbackId)];
    }
  }

  const senderId = event?.data?.uidFrom || event?.authorId || event?.senderID;
  const expiresAt = Date.now() + AUTO_DELETE_TIME;

  for (const id of ids) {
    global.thtMessages.set(String(id), {
      threadId: String(threadId),
      senderId: senderId != null ? String(senderId) : null,
      createdAt: Date.now(),
      expiresAt,
    });
  }

  setTimeout(() => {
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {}
  }, 15000);

  // Auto cleanup state
  setTimeout(() => {
    const now = Date.now();
    for (const [k, v] of global.thtMessages.entries()) {
      if (v?.expiresAt && v.expiresAt < now) global.thtMessages.delete(k);
    }
  }, AUTO_DELETE_TIME + 5000);
};

module.exports.__internal = {
  loadQA,
  pickRandom,
  createQAImage,
};
