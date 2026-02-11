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

function carveMaze(w, h) {
  const visited = Array.from({ length: h }, () => Array(w).fill(false));
  const walls = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ t: true, r: true, b: true, l: true })));

  const dirs = [
    { dx: 0, dy: -1, a: 't', b: 'b' },
    { dx: 1, dy: 0, a: 'r', b: 'l' },
    { dx: 0, dy: 1, a: 'b', b: 't' },
    { dx: -1, dy: 0, a: 'l', b: 'r' }
  ];

  const stack = [{ x: 0, y: 0 }];
  visited[0][0] = true;

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const shuffled = [...dirs].sort(() => Math.random() - 0.5);
    let moved = false;

    for (const d of shuffled) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (visited[ny][nx]) continue;
      walls[cur.y][cur.x][d.a] = false;
      walls[ny][nx][d.b] = false;
      visited[ny][nx] = true;
      stack.push({ x: nx, y: ny });
      moved = true;
      break;
    }

    if (!moved) stack.pop();
  }

  return walls;
}

function draw({ playerName, size, walls }) {
  const width = 1100;
  const height = 760;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(1, '#1f1137');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 50, 50, width - 100, height - 100, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 54px Arial';
  ctx.fillText('🧱 MAZE CHALLENGE', 80, 130);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '24px Arial';
  ctx.fillText(`${playerName} • tìm đường từ START đến END`, 80, 172);

  const gridSize = 18;
  const cell = 28;
  const ox = 270;
  const oy = 220;

  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const w = walls[y][x];
      const x1 = ox + x * cell;
      const y1 = oy + y * cell;
      const x2 = x1 + cell;
      const y2 = y1 + cell;

      if (w.t) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke(); }
      if (w.r) { ctx.beginPath(); ctx.moveTo(x2, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      if (w.b) { ctx.beginPath(); ctx.moveTo(x1, y2); ctx.lineTo(x2, y2); ctx.stroke(); }
      if (w.l) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); ctx.stroke(); }
    }
  }

  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('START', ox, oy - 15);

  ctx.fillStyle = '#fbbf24';
  ctx.fillText('END', ox + (gridSize - 1) * cell - 20, oy + gridSize * cell + 30);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '22px Arial';
  ctx.fillText('Gõ: mazecanvas (tạo mê cung mới)', 80, 680);

  return canvas;
}

module.exports.config = {
  name: 'mazecanvas',
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Tạo mê cung ngẫu nhiên bằng canvas',
  category: 'Game',
  usage: 'mazecanvas',
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

  const gridSize = 18;
  const walls = carveMaze(gridSize, gridSize);
  const canvas = draw({ playerName, size: gridSize, walls });

  const outPath = path.join(IMAGE_DIR, `maze_${Date.now()}_${Math.random().toString(16).slice(2)}.png`);
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));

  await api.sendMessage({
    msg: '🧱 Mê cung mới đã sẵn sàng!',
    attachments: [outPath],
    ttl: AUTO_DELETE_TIME
  }, threadId, type);

  setTimeout(() => {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }, 15000);
};
