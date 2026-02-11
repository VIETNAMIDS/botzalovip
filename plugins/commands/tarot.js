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

function pickTarot() {
  const deck = [
    { name: 'The Fool', msg: 'Khởi đầu mới, đừng sợ sai.', color: '#60a5fa', w: 10 },
    { name: 'The Magician', msg: 'Bạn có đủ công cụ để thắng.', color: '#22c55e', w: 10 },
    { name: 'The Lovers', msg: 'Tình cảm & lựa chọn quan trọng.', color: '#f472b6', w: 10 },
    { name: 'The Chariot', msg: 'Tiến lên, kỷ luật là chìa khóa.', color: '#fbbf24', w: 10 },
    { name: 'Strength', msg: 'Bình tĩnh, bạn mạnh hơn bạn nghĩ.', color: '#34d399', w: 10 },
    { name: 'Wheel of Fortune', msg: 'Vận may xoay chiều, nắm lấy cơ hội.', color: '#a78bfa', w: 10 },
    { name: 'The Tower', msg: 'Biến cố giúp bạn tỉnh ra.', color: '#ef4444', w: 10 },
    { name: 'The Star', msg: 'Hy vọng, chữa lành, tiến triển tốt.', color: '#38bdf8', w: 10 },
    { name: 'The Sun', msg: 'Năng lượng cao, mọi thứ sáng lên.', color: '#fde68a', w: 10 },
    { name: 'The World', msg: 'Hoàn thành, chốt kèo đẹp.', color: '#22c55e', w: 10 }
  ];
  const sum = deck.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * sum;
  for (const c of deck) {
    r -= c.w;
    if (r <= 0) return c;
  }
  return deck[0];
}

function draw({ playerName, card }) {
  const width = 1100;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#070a16');
  bg.addColorStop(1, '#1b0a2c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 50, 50, width - 100, height - 100, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('🔮 TAROT 1 LÁ', 80, 130);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '26px Arial';
  ctx.fillText(`${playerName}`, 80, 175);

  const cardX = 360;
  const cardY = 220;
  const cardW = 380;
  const cardH = 420;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;

  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  const cg = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  cg.addColorStop(0, 'rgba(255,255,255,0.12)');
  cg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.restore();

  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.strokeStyle = card.color;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = card.color;
  ctx.textAlign = 'center';
  ctx.font = 'bold 42px Arial';
  ctx.fillText(card.name, width / 2, cardY + 110);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '28px Arial';
  ctx.fillText(card.msg, width / 2, cardY + 185);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '22px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Gõ: tarot', 80, 660);

  return canvas;
}

module.exports.config = {
  name: 'tarot',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Rút 1 lá tarot bằng canvas',
  category: 'Game',
  usage: 'tarot',
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

  const card = pickTarot();
  const canvas = draw({ playerName, card });

  const outPath = path.join(IMAGE_DIR, `tarot_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  await api.sendMessage({
    msg: `🔮 Tarot: ${card.name}`,
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME
  }, threadId, type);

  setTimeout(() => {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }, 15000);
};
