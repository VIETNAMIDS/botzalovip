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

function pickPrize() {
  const prizes = [
    { label: '💰 +500 coins', w: 26 },
    { label: '💰 +1.000 coins', w: 22 },
    { label: '💰 +2.000 coins', w: 16 },
    { label: '💰 +5.000 coins', w: 8 },
    { label: '🎁 QUÀ BÍ ẨN', w: 10 },
    { label: '😵 XỊT', w: 18 }
  ];
  const sum = prizes.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * sum;
  for (const p of prizes) {
    r -= p.w;
    if (r <= 0) return p.label;
  }
  return prizes[0].label;
}

function drawWheel({ playerName, prize }) {
  const width = 1100;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#050816');
  bg.addColorStop(1, '#210a3b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 40, 40, width - 80, height - 80, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('🎡 VÒNG QUAY MAY MẮN', 80, 125);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '26px Arial';
  ctx.fillText(`${playerName}`, 80, 170);

  const cx = 550;
  const cy = 400;
  const r = 210;

  const slices = [
    { t: '💰500', c: '#60a5fa' },
    { t: '💰1k', c: '#34d399' },
    { t: '💰2k', c: '#fbbf24' },
    { t: '💰5k', c: '#f87171' },
    { t: '🎁', c: '#a78bfa' },
    { t: 'XỊT', c: '#94a3b8' }
  ];

  const angle0 = Math.random() * Math.PI * 2;
  const step = (Math.PI * 2) / slices.length;

  for (let i = 0; i < slices.length; i++) {
    const a1 = angle0 + i * step;
    const a2 = a1 + step;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a1, a2);
    ctx.closePath();
    ctx.fillStyle = slices[i].c;
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const mid = (a1 + a2) / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * (r * 0.62), cy + Math.sin(mid) * (r * 0.62));
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillStyle = '#0b1020';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(slices[i].t, 0, 10);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 60, 0, Math.PI * 2);
  ctx.fillStyle = '#0b1020';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('SPIN', cx, cy + 10);

  ctx.beginPath();
  ctx.moveTo(cx, cy - r - 25);
  ctx.lineTo(cx - 22, cy - r + 20);
  ctx.lineTo(cx + 22, cy - r + 20);
  ctx.closePath();
  ctx.fillStyle = '#fbbf24';
  ctx.fill();

  ctx.textAlign = 'left';
  const win = !/xịt/i.test(prize);
  ctx.fillStyle = win ? '#22c55e' : '#ef4444';
  ctx.font = 'bold 44px Arial';
  ctx.fillText(`KẾT QUẢ: ${prize}`, 80, 640);

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '22px Arial';
  ctx.fillText('Gõ: vongquay', 80, 680);

  return canvas;
}

module.exports.config = {
  name: 'vongquay',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Vòng quay may mắn (canvas) - 1 lượt',
  category: 'Game',
  usage: 'vongquay',
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

  const prize = pickPrize();
  const canvas = drawWheel({ playerName, prize });

  const outPath = path.join(IMAGE_DIR, `vongquay_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  await api.sendMessage({
    msg: `🎡 Bạn quay được: ${prize}`,
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME
  }, threadId, type);

  setTimeout(() => {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }, 15000);
};
