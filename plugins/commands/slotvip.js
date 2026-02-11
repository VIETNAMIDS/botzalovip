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

function pickSlotSymbol() {
  const symbols = [
    { s: '🍒', w: 35 },
    { s: '🍋', w: 30 },
    { s: '🍉', w: 22 },
    { s: '🍇', w: 20 },
    { s: '⭐', w: 12 },
    { s: '💎', w: 8 },
    { s: '7️⃣', w: 5 }
  ];
  const sum = symbols.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * sum;
  for (const it of symbols) {
    r -= it.w;
    if (r <= 0) return it.s;
  }
  return '🍒';
}

function calcPayout(a, b, c, bet) {
  if (a === b && b === c) {
    if (a === '7️⃣') return Math.floor(bet * 7);
    if (a === '💎') return Math.floor(bet * 5);
    if (a === '⭐') return Math.floor(bet * 4);
    return Math.floor(bet * 3);
  }
  if (a === b || b === c || a === c) return Math.floor(bet * 1.5);
  return 0;
}

function draw({ playerName, bet, result, payout }) {
  const width = 1100;
  const height = 650;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(1, '#1b1030');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 50, 50, width - 100, height - 100, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 54px Arial';
  ctx.fillText('🎰 SLOT VIP', 80, 125);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '26px Arial';
  ctx.fillText(`${playerName} • cược: ${bet.toLocaleString()} coins`, 80, 170);

  const slotX = 160;
  const slotY = 250;
  const slotW = width - 320;
  const slotH = 220;

  roundRect(ctx, slotX, slotY, slotW, slotH, 22);
  const panel = ctx.createLinearGradient(slotX, slotY, slotX, slotY + slotH);
  panel.addColorStop(0, 'rgba(0,0,0,0.55)');
  panel.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = panel;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const cellW = Math.floor((slotW - 80) / 3);
  for (let i = 0; i < 3; i++) {
    const x = slotX + 40 + i * cellW;
    roundRect(ctx, x, slotY + 40, cellW - 10, slotH - 80, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
  }

  ctx.font = 'bold 92px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    const x = slotX + 40 + i * cellW + (cellW - 10) / 2;
    const y = slotY + slotH / 2;
    ctx.fillStyle = '#fff';
    ctx.fillText(result[i], x, y);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const win = payout > 0;
  ctx.fillStyle = win ? '#22c55e' : '#ef4444';
  ctx.font = 'bold 44px Arial';
  ctx.fillText(win ? `+${payout.toLocaleString()} coins` : 'THUA RỒI', 80, 560);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '22px Arial';
  ctx.fillText('Gõ: slotvip [số coins] (mặc định 1000)', 80, 605);

  return canvas;
}

module.exports.config = {
  name: 'slotvip',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Mini game Slot VIP bằng canvas (1 lượt quay)',
  category: 'Game',
  usage: 'slotvip [bet]',
  cooldowns: 3,
  dependencies: { canvas: '' }
};

module.exports.run = async ({ api, event, args = [] }) => {
  const threadId = event?.threadId;
  const type = event?.type;
  if (!threadId || typeof type === 'undefined') return;

  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const betRaw = args[0] != null ? Number(String(args[0]).replace(/[^0-9]/g, '')) : 1000;
  const bet = Number.isFinite(betRaw) && betRaw > 0 ? Math.min(Math.max(betRaw, 100), 1_000_000) : 1000;

  let playerName = 'Player';
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    if (senderId) {
      const info = await api.getUserInfo(senderId);
      const u = info?.changed_profiles?.[senderId] || info?.[senderId];
      playerName = u?.displayName || u?.name || playerName;
    }
  } catch {}

  const result = [pickSlotSymbol(), pickSlotSymbol(), pickSlotSymbol()];
  const payout = calcPayout(result[0], result[1], result[2], bet);

  const canvas = draw({ playerName, bet, result, payout });
  const outPath = path.join(IMAGE_DIR, `slotvip_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  await api.sendMessage({
    msg: payout > 0 ? `🎰 Trúng! +${payout.toLocaleString()} coins` : '🎰 Xịt rồi! thử lại nha',
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME
  }, threadId, type);

  setTimeout(() => {
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {}
  }, 15000);
};
