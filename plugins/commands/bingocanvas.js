'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const AUTO_DELETE_TIME = 120000;
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

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCard() {
  const pool = Array.from({ length: 75 }, (_, i) => i + 1);
  const pick = shuffled(pool).slice(0, 24);
  const grid = [];
  let k = 0;
  for (let r = 0; r < 5; r++) {
    const row = [];
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) row.push('FREE');
      else row.push(pick[k++]);
    }
    grid.push(row);
  }
  return grid;
}

function draw({ playerName, grid }) {
  const width = 1100;
  const height = 760;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(1, '#102a43');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 50, 50, width - 100, height - 100, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('🎯 BINGO CARD', 80, 130);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '24px Arial';
  ctx.fillText(`${playerName} • Reply số ô để tự chơi cùng bạn bè`, 80, 172);

  const boardX = 180;
  const boardY = 230;
  const cell = 115;

  const letters = ['B', 'I', 'N', 'G', 'O'];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < 5; i++) {
    roundRect(ctx, boardX + i * cell, boardY - 70, cell - 8, 60, 16);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(96,165,250,0.35)' : 'rgba(34,197,94,0.35)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px Arial';
    ctx.fillText(letters[i], boardX + i * cell + (cell - 8) / 2, boardY - 40);
  }

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x = boardX + c * cell;
      const y = boardY + r * cell;
      roundRect(ctx, x, y, cell - 8, cell - 8, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const v = grid[r][c];
      if (v === 'FREE') {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 26px Arial';
        ctx.fillText('FREE', x + (cell - 8) / 2, y + (cell - 8) / 2);
      } else {
        ctx.fillStyle = '#e5e7eb';
        ctx.font = 'bold 38px Arial';
        ctx.fillText(String(v), x + (cell - 8) / 2, y + (cell - 8) / 2);
      }
    }
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '22px Arial';
  ctx.fillText('Gõ: bingocanvas (tự tạo 1 thẻ mới)', 80, 680);

  return canvas;
}

module.exports.config = {
  name: 'bingocanvas',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Tạo thẻ Bingo 5x5 bằng canvas',
  category: 'Game',
  usage: 'bingocanvas',
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

  const grid = makeCard();
  const canvas = draw({ playerName, grid });

  const outPath = path.join(IMAGE_DIR, `bingo_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  await api.sendMessage({
    msg: '🎯 Bingo card của bạn đây!',
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME
  }, threadId, type);

  setTimeout(() => {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }, 15000);
};
