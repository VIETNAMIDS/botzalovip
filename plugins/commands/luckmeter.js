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

function pickLuck() {
  const v = Math.floor(Math.random() * 101);
  let tag = 'BÌNH THƯỜNG';
  let color = '#60a5fa';
  if (v >= 85) { tag = 'SIÊU MAY'; color = '#22c55e'; }
  else if (v >= 70) { tag = 'MAY'; color = '#34d399'; }
  else if (v >= 45) { tag = 'BÌNH THƯỜNG'; color = '#60a5fa'; }
  else if (v >= 25) { tag = 'HƠI XUI'; color = '#f59e0b'; }
  else { tag = 'XUI'; color = '#ef4444'; }
  return { v, tag, color };
}

function draw({ playerName, luck }) {
  const width = 1100;
  const height = 650;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#071018');
  bg.addColorStop(1, '#1b0f2c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 50, 50, width - 100, height - 100, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('🍀 LUCK METER', 80, 130);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '26px Arial';
  ctx.fillText(`${playerName}`, 80, 175);

  const barX = 120;
  const barY = 280;
  const barW = 860;
  const barH = 60;

  roundRect(ctx, barX, barY, barW, barH, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();

  const fillW = Math.floor((barW * luck.v) / 100);
  roundRect(ctx, barX, barY, fillW, barH, 22);
  const fg = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  fg.addColorStop(0, luck.color);
  fg.addColorStop(1, '#f472b6');
  ctx.fillStyle = fg;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  roundRect(ctx, barX, barY, barW, barH, 22);
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 54px Arial';
  ctx.fillText(`${luck.v}%`, 80, 430);

  ctx.fillStyle = luck.color;
  ctx.font = 'bold 44px Arial';
  ctx.fillText(luck.tag, 260, 430);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '22px Arial';
  ctx.fillText('Gõ: luckmeter', 80, 560);

  return canvas;
}

module.exports.config = {
  name: 'luckmeter',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Đo độ may mắn (canvas) 0-100%',
  category: 'Game',
  usage: 'luckmeter',
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

  const luck = pickLuck();
  const canvas = draw({ playerName, luck });

  const outPath = path.join(IMAGE_DIR, `luck_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  await api.sendMessage({
    msg: `🍀 ${playerName}: ${luck.v}% (${luck.tag})`,
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME
  }, threadId, type);

  setTimeout(() => {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }, 15000);
};
