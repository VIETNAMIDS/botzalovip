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

function pickTicket() {
  const tickets = [
    { t: 'ĐẠI CÁT', msg: 'Hôm nay làm gì cũng thuận lợi.', color: '#22c55e', w: 12 },
    { t: 'CÁT', msg: 'May mắn vừa đủ, cứ tự tin.', color: '#84cc16', w: 20 },
    { t: 'BÌNH', msg: 'Bình bình thôi, đừng nóng vội.', color: '#60a5fa', w: 28 },
    { t: 'HUNG', msg: 'Cẩn thận lời nói và quyết định.', color: '#f59e0b', w: 24 },
    { t: 'ĐẠI HUNG', msg: 'Nên nghỉ ngơi, tránh tranh cãi.', color: '#ef4444', w: 16 }
  ];
  const sum = tickets.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * sum;
  for (const it of tickets) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return tickets[2];
}

function draw({ playerName, ticket }) {
  const width = 1100;
  const height = 680;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0a0f1f');
  bg.addColorStop(1, '#18122b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 50, 50, width - 100, height - 100, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 58px Arial';
  ctx.fillText('🧧 RÚT THĂM MAY MẮN', 80, 135);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '26px Arial';
  ctx.fillText(`${playerName}`, 80, 180);

  const cardX = 140;
  const cardY = 250;
  const cardW = width - 280;
  const cardH = 260;

  roundRect(ctx, cardX, cardY, cardW, cardH, 22);
  const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = ticket.color + 'AA';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = ticket.color;
  ctx.font = 'bold 86px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(ticket.t, width / 2, cardY + 120);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '30px Arial';
  ctx.fillText(ticket.msg, width / 2, cardY + 190);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '22px Arial';
  ctx.fillText('Gõ: ruttam', 80, 600);

  return canvas;
}

module.exports.config = {
  name: 'ruttam',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Rút thăm (quẻ) may mắn bằng canvas',
  category: 'Game',
  usage: 'ruttam',
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

  const ticket = pickTicket();
  const canvas = draw({ playerName, ticket });
  const outPath = path.join(IMAGE_DIR, `ruttam_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  await api.sendMessage({
    msg: `🧧 Kết quả: ${ticket.t}`,
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME
  }, threadId, type);

  setTimeout(() => {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }, 15000);
};
