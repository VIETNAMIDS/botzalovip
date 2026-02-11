'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { collectMessageIds } = require('../utils/messageUtils');

const AUTO_DELETE_TIME = 120000;
const IMAGE_DIR = path.join(__dirname, '../../temp/canvas');

const WORD_BANK_PATH = path.join(__dirname, '../../assets/doantu_words.json');

const WORDS = [
  'con meo',
  'viet nam',
  'banh mi',
  'dien thoai',
  'may tinh',
  'cau vong',
  'ca phe',
  'khu vuon',
  'dong ho',
  'sieu nhan',
  'xe may',
  'may bay',
];

function loadWordBank() {
  try {
    if (!fs.existsSync(WORD_BANK_PATH)) return null;
    const raw = fs.readFileSync(WORD_BANK_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const cleaned = parsed
      .map((x) => (x != null ? String(x).trim() : ''))
      .filter(Boolean);
    return cleaned.length ? cleaned : null;
  } catch (e) {
    return null;
  }
}

function normalizeText(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function pickWord() {
  const bank = loadWordBank() || WORDS;
  const raw = bank[Math.floor(Math.random() * bank.length)] || 'viet nam';
  const answer = String(raw).trim();
  return {
    answer,
    answerNorm: normalizeText(answer)
  };
}

function makeMasked(answer) {
  const chars = Array.from(answer);
  const lettersIdx = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/[a-z0-9]/i.test(c)) lettersIdx.push(i);
  }

  const revealCount = Math.max(1, Math.floor(lettersIdx.length * 0.25));
  const reveal = new Set();
  while (reveal.size < revealCount && lettersIdx.length) {
    reveal.add(lettersIdx[Math.floor(Math.random() * lettersIdx.length)]);
  }

  return chars
    .map((c, i) => {
      if (c === ' ') return '   ';
      if (!/[a-z0-9]/i.test(c)) return c;
      return reveal.has(i) ? c.toUpperCase() : '_';
    })
    .join(' ');
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

async function createPuzzleImage({ masked, hintText }) {
  const width = 1200;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#111827');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, 70, 70, width - 140, height - 140, 40);
  ctx.fill();

  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('GAME ĐOÁN TỪ', 90, 150);

  ctx.fillStyle = 'rgba(229,231,235,0.85)';
  ctx.font = '28px Arial';
  ctx.fillText('Reply vào ảnh này để đoán từ/cụm từ.', 90, 205);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 66px Arial';
  const textX = 90;
  const textY = 360;
  ctx.fillText(masked, textX, textY);

  ctx.fillStyle = 'rgba(229,231,235,0.85)';
  ctx.font = '30px Arial';
  ctx.fillText(hintText, 90, 450);

  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.font = '24px Arial';
  ctx.fillText(`⏱️ Hết hạn sau ${Math.floor(AUTO_DELETE_TIME / 1000)}s`, 90, 640);

  return canvas;
}

function ensureStore() {
  if (!(global.doantuMessages instanceof Map)) {
    global.doantuMessages = new Map();
  }
}

module.exports.config = {
  name: 'doantu',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Game đoán từ bằng ảnh canvas (reply để trả lời)',
  category: 'Giải trí',
  usage: '<prefix>doantu',
  cooldowns: 5,
};

module.exports.run = async function ({ api, event }) {
  const threadId = event?.threadId;
  const type = event?.type;
  if (!threadId || typeof type === 'undefined') return;

  ensureStore();
  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const { answer, answerNorm } = pickWord();
  const masked = makeMasked(answer);
  const hintText = `💡 Gợi ý: ${answer.split(' ').length} từ`;

  const canvas = await createPuzzleImage({ masked, hintText });
  const outPath = path.join(IMAGE_DIR, `doantu_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  const sent = await api.sendMessage({
    msg: '🧩 Reply vào ảnh để đoán từ!',
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
  const expiresAt = Date.now() + AUTO_DELETE_TIME;

  for (const id of ids) {
    global.doantuMessages.set(String(id), {
      threadId: String(threadId),
      answer,
      answerNorm,
      createdAt: Date.now(),
      expiresAt,
    });
  }

  setTimeout(() => {
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {}
  }, 15000);
};
