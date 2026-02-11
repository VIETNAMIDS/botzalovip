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

function pickCard() {
  const cards = [
    { t: '💎 JACKPOT', msg: 'Bạn gặp may cực lớn!', color: '#a78bfa', w: 6 },
    { t: '⭐ MAY MẮN', msg: 'Hôm nay có tin vui.', color: '#22c55e', w: 18 },
    { t: '🍀 BÌNH THƯỜNG', msg: 'Ổn áp, cứ chill.', color: '#60a5fa', w: 34 },
    { t: '😵 XUI', msg: 'Nên tránh drama.', color: '#f59e0b', w: 26 },
    { t: '💥 TOANG', msg: 'Thôi đừng liều nữa.', color: '#ef4444', w: 16 }
  ];
  const sum = cards.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * sum;
  for (const it of cards) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return cards[2];
}

function draw({ playerName, card }) {
  const width = 1100;
  const height = 680;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#071018');
  bg.addColorStop(1, '#25103a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 50, 50, width - 100, height - 100, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('🃏 LẬT BÀI 1 LÁ', 80, 130);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '26px Arial';
  ctx.fillText(`${playerName}`, 80, 175);

  const cardX = 390;
  const cardY = 230;
  const cardW = 320;
  const cardH = 360;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;

  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  const g = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.strokeStyle = card.color;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = card.color;
  ctx.font = 'bold 44px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(card.t, width / 2, cardY + 140);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '28px Arial';
  ctx.fillText(card.msg, width / 2, cardY + 210);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '22px Arial';
  ctx.fillText('Gõ: latbai', 80, 600);

  return canvas;
}

module.exports.config = {
  name: 'latbai',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Lật 1 lá bài định mệnh (canvas)',
  category: 'Game',
  usage: 'latbai',
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

  const card = pickCard();
  const canvas = draw({ playerName, card });

  const outPath = path.join(IMAGE_DIR, `latbai_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  await api.sendMessage({
    msg: `🃏 Bạn lật được: ${card.t}`,
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME
  }, threadId, type);

  setTimeout(() => {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }, 15000);
};
