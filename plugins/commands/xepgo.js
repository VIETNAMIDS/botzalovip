'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { collectMessageIds } = require('../utils/messageUtils');

const AUTO_DELETE_TIME = 10 * 60 * 1000;

function ensureStores() {
  if (!(global.xepgoGames instanceof Map)) global.xepgoGames = new Map(); // threadId -> game
  if (!(global.xepgoBoardMessages instanceof Map)) global.xepgoBoardMessages = new Map(); // msgId -> {threadId, expiresAt, allowedPlayers}
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

function makeMentions(name, uid, text) {
  const tag = `@${name}`;
  const index = text.indexOf(tag);
  if (index < 0) return [];
  return [
    {
      pos: index,
      len: tag.length,
      uid: String(uid),
    },
  ];
}

async function getDisplayName(api, uid) {
  try {
    if (!api?.getUserInfo) return String(uid);
    const info = await api.getUserInfo(String(uid));
    const u = info?.changed_profiles?.[String(uid)] || info?.[String(uid)] || info?.data?.[String(uid)];
    return u?.displayName || u?.name || String(uid);
  } catch {
    return String(uid);
  }
}

function registerBoardMessages(messageIds, record) {
  ensureStores();
  for (const id of Array.from(new Set((messageIds || []).filter(Boolean).map(String)))) {
    global.xepgoBoardMessages.set(id, record);
  }
}

function createEmptyBoard() {
  return Array.from({ length: 10 }, () => Array(10).fill(0));
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function generatePieces() {
  const shapes = [
    // Single
    { w: 1, h: 1, cells: [[0, 0]] },

    // 1x2 / 2x1
    { w: 2, h: 1, cells: [[0, 0], [1, 0]] },
    { w: 1, h: 2, cells: [[0, 0], [0, 1]] },

    // 1x3 / 3x1
    { w: 3, h: 1, cells: [[0, 0], [1, 0], [2, 0]] },
    { w: 1, h: 3, cells: [[0, 0], [0, 1], [0, 2]] },

    // 1x4 / 4x1
    { w: 4, h: 1, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { w: 1, h: 4, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },

    // 2x2
    { w: 2, h: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },

    // L shapes 2x2 minus one
    { w: 2, h: 2, cells: [[0, 0], [1, 0], [0, 1]] },
    { w: 2, h: 2, cells: [[0, 0], [1, 0], [1, 1]] },
    { w: 2, h: 2, cells: [[0, 0], [0, 1], [1, 1]] },
    { w: 2, h: 2, cells: [[1, 0], [0, 1], [1, 1]] },

    // 3-block corner
    { w: 3, h: 2, cells: [[0, 0], [1, 0], [0, 1]] },
    { w: 3, h: 2, cells: [[0, 0], [1, 0], [2, 0], [0, 1]] },

    // T 3x2
    { w: 3, h: 2, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },

    // 3x3 mini blocks
    { w: 3, h: 3, cells: [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]] },
  ];

  const colors = ['#fb7185', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6'];
  const pick = () => shapes[Math.floor(Math.random() * shapes.length)];

  const pieces = [];
  for (let i = 0; i < 3; i++) {
    const shape = pick();
    pieces.push({
      id: i + 1,
      ...shape,
      color: colors[i % colors.length],
    });
  }
  return pieces;
}

function canPlace(board, piece, x, y) {
  for (const [dx, dy] of piece.cells) {
    const xx = x + dx;
    const yy = y + dy;
    if (xx < 0 || xx >= 10 || yy < 0 || yy >= 10) return false;
    if (board[yy][xx] !== 0) return false;
  }
  return true;
}

function placePiece(board, piece, x, y) {
  const next = cloneBoard(board);
  for (const [dx, dy] of piece.cells) {
    next[y + dy][x + dx] = 1;
  }
  return next;
}

function clearLines(board) {
  let cleared = 0;
  const next = cloneBoard(board);

  // Rows
  for (let y = 0; y < 10; y++) {
    let full = true;
    for (let x = 0; x < 10; x++) {
      if (next[y][x] === 0) { full = false; break; }
    }
    if (full) {
      cleared++;
      for (let x = 0; x < 10; x++) next[y][x] = 0;
    }
  }

  // Cols
  for (let x = 0; x < 10; x++) {
    let full = true;
    for (let y = 0; y < 10; y++) {
      if (next[y][x] === 0) { full = false; break; }
    }
    if (full) {
      cleared++;
      for (let y = 0; y < 10; y++) next[y][x] = 0;
    }
  }

  return { board: next, cleared };
}

function computeScoreDelta(piece) {
  return Array.isArray(piece?.cells) ? piece.cells.length : 0;
}

function anyMoveAvailable(board, pieces) {
  for (const piece of pieces) {
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (canPlace(board, piece, x, y)) return true;
      }
    }
  }
  return false;
}

function parseCoord(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim().toUpperCase();

  // Numeric cell: 1-100 (row-major)
  if (/^\d{1,3}$/.test(t)) {
    const n = parseInt(t, 10);
    if (n >= 1 && n <= 100) {
      const idx = n - 1;
      return { x: idx % 10, y: Math.floor(idx / 10) };
    }
  }

  const m = t.match(/^([A-J])\s*(10|[1-9])$/);
  if (!m) return null;
  const col = m[1].charCodeAt(0) - 'A'.charCodeAt(0);
  const row = parseInt(m[2], 10) - 1;
  if (col < 0 || col >= 10 || row < 0 || row >= 10) return null;
  return { x: col, y: row };
}

function parsePlaceArgs(args) {
  const raw = (args || []).join(' ').trim();
  if (!raw) return null;

  // formats:
  // place 1 A1
  // place 1 55
  // 1 A1
  // 1 55
  // đặt 1 A1
  const m = raw.match(/^(?:place|dat|đặt)?\s*(\d)\s+([A-J]\s*(?:10|[1-9]))$/i);

  if (m) {
    const pieceIndex = parseInt(m[1], 10);
    const coord = parseCoord(m[2]);
    if (!coord) return null;
    if (!(pieceIndex >= 1 && pieceIndex <= 3)) return null;
    return { pieceIndex, coord };
  }

  const mNum = raw.match(/^(?:place|dat|đặt)?\s*(\d)\s+(\d{1,3})$/i);
  if (mNum) {
    const pieceIndex = parseInt(mNum[1], 10);
    const coord = parseCoord(mNum[2]);
    if (!coord) return null;
    if (!(pieceIndex >= 1 && pieceIndex <= 3)) return null;
    return { pieceIndex, coord };
  }

  return null;
}

function renderGameImage(game, outPath) {
  const cell = 46;
  const grid = 10;
  const boardSize = cell * grid;
  const padding = 60;
  const headerH = 130;
  const pieceAreaH = 230;
  const width = Math.max(900, padding * 2 + boardSize + 360);
  const height = headerH + padding + boardSize + padding + pieceAreaH;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(0.45, '#172554');
  bg.addColorStop(1, '#1f2937');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // stars
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25 + 0.05})`;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2 + 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // header card
  const cardX = 40;
  const cardY = 25;
  const cardW = width - 80;
  const cardH = 95;
  ctx.shadowColor = 'rgba(236,72,153,0.35)';
  ctx.shadowBlur = 25;
  roundRect(ctx, cardX, cardY, cardW, cardH, 24);
  const cardG = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
  cardG.addColorStop(0, 'rgba(236,72,153,0.22)');
  cardG.addColorStop(1, 'rgba(59,130,246,0.18)');
  ctx.fillStyle = cardG;
  ctx.fill();
  ctx.shadowBlur = 0;

  roundRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 42px Arial, sans-serif';
  ctx.fillText('🪵 XẾP GỖ CUTE', cardX + 28, cardY + 34);

  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`⭐ Score: ${game.score}`, cardX + 30, cardY + 70);

  // board frame
  const boardX = padding;
  const boardY = headerH + padding - 10;

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 30;
  roundRect(ctx, boardX - 18, boardY - 18, boardSize + 36, boardSize + 36, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.shadowBlur = 0;

  roundRect(ctx, boardX - 18, boardY - 18, boardSize + 36, boardSize + 36, 18);
  ctx.strokeStyle = 'rgba(148,163,184,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // coordinates
  const files = 'ABCDEFGHIJ'.split('');
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let x = 0; x < 10; x++) {
    ctx.fillText(files[x], boardX + x * cell + cell / 2, boardY - 28);
    ctx.fillText(files[x], boardX + x * cell + cell / 2, boardY + boardSize + 26);
  }
  for (let y = 0; y < 10; y++) {
    ctx.fillText(String(y + 1), boardX - 28, boardY + y * cell + cell / 2);
    ctx.fillText(String(y + 1), boardX + boardSize + 28, boardY + y * cell + cell / 2);
  }

  // grid
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const px = boardX + x * cell;
      const py = boardY + y * cell;
      const isDark = (x + y) % 2 === 1;
      ctx.fillStyle = isDark ? '#f1f5f9' : '#ffffff';
      ctx.fillRect(px, py, cell, cell);

      ctx.strokeStyle = 'rgba(148,163,184,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, cell, cell);

      if (game.board[y][x] === 0) {
        const idx = y * 10 + x + 1;
        ctx.fillStyle = isDark ? 'rgba(15,23,42,0.22)' : 'rgba(15,23,42,0.18)';
        ctx.font = '13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(idx), px + cell / 2, py + cell / 2);
      }

      if (game.board[y][x] === 1) {
        const cx = px + cell / 2;
        const cy = py + cell / 2;
        const r = cell * 0.36;
        const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
        g.addColorStop(0, 'rgba(52,211,153,0.95)');
        g.addColorStop(1, 'rgba(16,185,129,0.92)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(px + 6, py + 6, cell - 12, cell - 12, 10) : roundRect(ctx, px + 6, py + 6, cell - 12, cell - 12, 10);
        ctx.fill();

        ctx.strokeStyle = 'rgba(5,150,105,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // Pieces panel
  const panelX = boardX + boardSize + 70;
  const panelY = boardY;
  const panelW = width - panelX - padding;
  const panelH = boardSize;

  ctx.shadowColor = 'rgba(99,102,241,0.25)';
  ctx.shadowBlur = 25;
  roundRect(ctx, panelX, panelY, panelW, panelH, 18);
  const pG = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
  pG.addColorStop(0, 'rgba(15,23,42,0.75)');
  pG.addColorStop(1, 'rgba(2,6,23,0.55)');
  ctx.fillStyle = pG;
  ctx.fill();
  ctx.shadowBlur = 0;

  roundRect(ctx, panelX, panelY, panelW, panelH, 18);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('🎁 3 MIẾNG GỖ', panelX + 18, panelY + 18);

  ctx.font = '18px Arial';
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.fillText('Reply: 1 A1  |  2 C5  |  3 J10', panelX + 18, panelY + 52);

  // draw pieces
  const pieceBoxY = panelY + 95;
  const pieceBoxH = 150;
  const gap = 18;
  const boxW = panelW - 36;

  for (let i = 0; i < 3; i++) {
    const piece = game.pieces[i];
    const bx = panelX + 18;
    const by = pieceBoxY + i * (pieceBoxH + gap);

    roundRect(ctx, bx, by, boxW, pieceBoxH, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (!piece) {
      ctx.fillStyle = 'rgba(226,232,240,0.9)';
      ctx.font = 'bold 20px Arial';
      ctx.fillText(`#${i + 1}`, bx + 14, by + 10);
      ctx.font = '16px Arial';
      ctx.fillText('(đã dùng)', bx + 14, by + 42);
      continue;
    }

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`#${piece.id}`, bx + 14, by + 10);

    const maxDim = Math.max(piece.w, piece.h);
    const pCell = Math.min(30, Math.floor((pieceBoxH - 48) / maxDim));
    const startX = bx + 80;
    const startY = by + 40;

    for (const [dx, dy] of piece.cells) {
      const px = startX + dx * pCell;
      const py = startY + dy * pCell;
      ctx.fillStyle = piece.color;
      roundRect(ctx, px, py, pCell - 4, pCell - 4, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(226,232,240,0.9)';
    ctx.font = '16px Arial';
    ctx.fillText(`+${computeScoreDelta(piece)} điểm`, bx + 14, by + 42);
  }

  // footer hints
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const fy = boardY + boardSize + 55;
  ctx.fillText('💡 Tip: Xóa hàng/cột đầy để được bonus!', boardX, fy);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);
}

async function renderAndSend(api, event, game, text, mentions = []) {
  const { threadId, type } = event;
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const outPng = path.join(tempDir, `xepgo_${threadId}_${Date.now()}.png`);

  renderGameImage(game, outPng);

  const sent = await api.sendMessage({ msg: text, attachments: [outPng], mentions }, threadId, type);
  try {
    const ids = typeof collectMessageIds === 'function' ? collectMessageIds(sent) : [];
    registerBoardMessages(ids, {
      threadId,
      expiresAt: Date.now() + AUTO_DELETE_TIME,
      allowedPlayers: [String(game.playerId)],
    });
  } catch {}

  try { fs.unlinkSync(outPng); } catch {}
}

module.exports.config = {
  name: 'xepgo',
  aliases: ['xepgocute', 'wood', 'woodblock'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Game Xếp Gỗ (Wood Block Puzzle) - Canvas cute dễ chơi',
  category: 'Game',
  usage: 'xepgo [new|place <1-3> <A1-J10>|board|reset|help]',
  cooldowns: 2,
};

module.exports.run = async function ({ api, event, args }) {
  ensureStores();
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId || event?.senderID;
  if (!threadId || !senderId) return;

  const sub = String(args?.[0] || 'board').toLowerCase();

  const sendText = async (msg, ttl = 20000) => {
    try {
      await api.sendMessage({ msg, ttl }, threadId, type);
    } catch {}
  };

  if (sub === 'help') {
    return sendText(
      '🪵 XẾP GỖ (CUTE)\n' +
      '- xepgo new: bắt đầu game\n' +
      '- xepgo board: xem bàn\n' +
      '- xepgo place 1 A1: đặt miếng #1 tại A1\n' +
      '- Có thể reply trực tiếp lên ảnh: 1 A1\n' +
      '- xepgo reset: xoá game',
      30000
    );
  }

  if (sub === 'reset') {
    global.xepgoGames.delete(threadId);
    return sendText('✅ Đã reset game Xếp Gỗ. Gõ `xepgo new` để chơi lại.');
  }

  if (sub === 'new') {
    const game = {
      threadId,
      playerId: String(senderId),
      board: createEmptyBoard(),
      pieces: generatePieces(),
      score: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'playing',
    };
    global.xepgoGames.set(threadId, game);

    const name = await getDisplayName(api, String(senderId));
    const text = `🎮 @${name} bắt đầu Xếp Gỗ!\nReply: 1 A1 để đặt miếng.`;
    const mentions = makeMentions(name, senderId, text);
    await renderAndSend(api, event, game, text, mentions);
    return;
  }

  const game = global.xepgoGames.get(threadId);
  if (!game || game.status !== 'playing') {
    return sendText('❌ Chưa có game. Gõ `xepgo new` để bắt đầu.');
  }

  if (String(game.playerId) !== String(senderId)) {
    const ownerName = await getDisplayName(api, String(game.playerId));
    return sendText(`⚠️ Game này của @${ownerName}. Bạn không phải người chơi.`, 20000);
  }

  if (sub === 'board') {
    const name = await getDisplayName(api, String(senderId));
    const text = `🧩 @${name} - Score: ${game.score}\nReply: 1 55 (đặt theo số 1-100) hoặc 1 A1 (tọa độ)`;
    const mentions = makeMentions(name, senderId, text);
    await renderAndSend(api, event, game, text, mentions);
    return;
  }

  if (sub === 'place' || sub === 'dat' || sub === 'đặt') {
    const parsed = parsePlaceArgs(args.slice(1));
    if (!parsed) {
      return sendText('❌ Cú pháp: `xepgo place <1-3> <A1-J10>` (vd: xepgo place 1 A1)');
    }

    const piece = game.pieces[parsed.pieceIndex - 1];
    if (!piece) return sendText('❌ Không tìm thấy miếng này.');

    const { x, y } = parsed.coord;
    if (!canPlace(game.board, piece, x, y)) {
      return sendText('❌ Không đặt được tại vị trí đó (bị trùng hoặc vượt biên).');
    }

    let board2 = placePiece(game.board, piece, x, y);
    const { board: board3, cleared } = clearLines(board2);
    board2 = board3;

    const gained = computeScoreDelta(piece) + (cleared > 0 ? cleared * 10 : 0);

    // remove used piece
    const nextPieces = game.pieces.slice();
    nextPieces[parsed.pieceIndex - 1] = null;

    // if all used -> regen
    const allUsed = nextPieces.every((p) => !p);
    const pieces2 = allUsed ? generatePieces() : nextPieces;

    game.board = board2;
    game.pieces = pieces2;
    game.score += gained;
    game.updatedAt = Date.now();

    const stillHasMove = anyMoveAvailable(game.board, game.pieces.filter(Boolean));
    if (!stillHasMove) {
      game.status = 'ended';
      const name = await getDisplayName(api, String(senderId));
      const text = `💥 Hết nước đi rồi @${name}!\n🏁 Final score: ${game.score}`;
      const mentions = makeMentions(name, senderId, text);
      await renderAndSend(api, event, game, text, mentions);
      return;
    }

    const name = await getDisplayName(api, String(senderId));
    const coordText = `${String.fromCharCode('A'.charCodeAt(0) + x)}${y + 1}`;
    const numText = String(y * 10 + x + 1);
    const bonus = cleared > 0 ? ` (+${cleared * 10} bonus)` : '';
    const text = `✅ @${name} đặt miếng #${parsed.pieceIndex} tại ${coordText} (#${numText}).\n+${computeScoreDelta(piece)} điểm${bonus} | Score: ${game.score}`;
    const mentions = makeMentions(name, senderId, text);
    await renderAndSend(api, event, game, text, mentions);
    return;
  }

  // Allow shortcut: xepgo 1 A1
  const shortcut = parsePlaceArgs(args);
  if (shortcut) {
    return module.exports.run({ api, event, args: ['place', String(shortcut.pieceIndex), `${String.fromCharCode(65 + shortcut.coord.x)}${shortcut.coord.y + 1}`] });
  }

  return sendText('❌ Lệnh không hợp lệ. Gõ `xepgo help` để xem hướng dẫn.');
};
