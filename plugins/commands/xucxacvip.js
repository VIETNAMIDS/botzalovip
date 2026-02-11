'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const AUTO_DELETE_TIME = 60000;
const IMAGE_DIR = path.join(__dirname, '../../temp/canvas');

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

function roll() {
  return 1 + Math.floor(Math.random() * 6);
}

function drawPips(ctx, x, y, s, n) {
  const dot = (dx, dy) => {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.fillStyle = '#0f172a';
  const map = {
    1: [[0.5, 0.5]],
    2: [[0.3, 0.3], [0.7, 0.7]],
    3: [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
    4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
    5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
    6: [[0.3, 0.25], [0.7, 0.25], [0.3, 0.5], [0.7, 0.5], [0.3, 0.75], [0.7, 0.75]]
  };
  (map[n] || map[1]).forEach(([dx, dy]) => dot(dx, dy));
}

function draw({ playerName, a, b }) {
  const width = 1100;
  const height = 700;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#041019');
  bg.addColorStop(1, '#2a0944');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 50, 50, width - 100, height - 100, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('🎲 XÚC XẮC VIP', 80, 130);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '26px Arial';
  ctx.fillText(`${playerName}`, 80, 175);

  const diceSize = 220;
  const dx1 = 260;
  const dy = 260;
  const dx2 = 620;

  const drawDice = (x, y, n, accent) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;

    roundRect(ctx, x, y, diceSize, diceSize, 28);
    const face = ctx.createLinearGradient(x, y, x + diceSize, y + diceSize);
    face.addColorStop(0, '#ffffff');
    face.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = face;
    ctx.fill();

    ctx.shadowBlur = 0;
    roundRect(ctx, x, y, diceSize, diceSize, 28);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.stroke();

    drawPips(ctx, x, y, diceSize, n);
    ctx.restore();
  };

  drawDice(dx1, dy, a, '#22c55e');
  drawDice(dx2, dy, b, '#60a5fa');

  const sum = a + b;
  const label = sum >= 10 ? 'TÀI' : 'XỈU';
  ctx.fillStyle = sum >= 10 ? '#22c55e' : '#f59e0b';
  ctx.font = 'bold 54px Arial';
  ctx.fillText(`TỔNG: ${sum} (${label})`, 80, 620);

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '22px Arial';
  ctx.fillText('Gõ: xucxacvip', 80, 660);

  return canvas;
}

module.exports.config = {
  name: 'xucxacvip',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Xúc xắc VIP (canvas) - 2 viên',
  category: 'Game',
  usage: 'xucxacvip',
  cooldowns: 3,
  dependencies: { canvas: '' }
};

module.exports.run = async ({ api, event }) => {
  const threadId = event?.threadId;
  const type = event?.type;
  if (!threadId || typeof type === 'undefined') return;

  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  let playerName = 'Player';
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    if (senderId) {
      const info = await api.getUserInfo(senderId);
      const u = info?.changed_profiles?.[senderId] || info?.[senderId];
      playerName = u?.displayName || u?.name || playerName;
    }
  } catch {}

  const a = roll();
  const b = roll();
  const sum = a + b;

  const canvas = draw({ playerName, a, b });
  const outPath = path.join(IMAGE_DIR, `xucxacvip_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  await api.sendMessage({
    msg: `🎲 Kết quả: ${a} + ${b} = ${sum}`,
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME
  }, threadId, type);

  setTimeout(() => {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }, 15000);
};
