const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');
const { collectMessageIds } = require('../utils/messageUtils');

// We will require chess.js at runtime (installed via npm). Fallback to simple validator notice if not present.
let ChessLib = null;
try { ChessLib = require('chess.js').Chess; } catch (_) { ChessLib = null; }

module.exports.config = {
  name: 'chess',
  aliases: ['covua', 'cova', 'chess2'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Cờ vua 2 người với ảnh bàn cờ đẹp (canvas)',
  category: 'Game',
  usage: 'chess [create @user [bet]|accept|decline|move <uci>|board|resign|stats]',
  cooldowns: 2
};

// Global states
if (!global.gameLeaderboard) global.gameLeaderboard = {};
if (!global.gameLeaderboard.chess) global.gameLeaderboard.chess = {};
if (!global.chessGames) global.chessGames = new Map(); // key: threadId => game state

// Assets config
const ASSET_DIR = path.join(__dirname, '..', '..', 'assets', 'chess');
const PIECES = {
  wK: 'wK.png', wQ: 'wQ.png', wR: 'wR.png', wB: 'wB.png', wN: 'wN.png', wP: 'wP.png',
  bK: 'bK.png', bQ: 'bQ.png', bR: 'bR.png', bB: 'bB.png', bN: 'bN.png', bP: 'bP.png'
};

 function chessCallBool(chess, candidates = []) {
   if (!chess) return false;
   for (const name of candidates) {
     const fn = chess[name];
     if (typeof fn === 'function') {
       try {
         return Boolean(fn.call(chess));
       } catch {
         return false;
       }
     }
   }
   return false;
 }

 function chessInCheckmate(chess) {
   return chessCallBool(chess, ['in_checkmate', 'isCheckmate', 'is_checkmate']);
 }

 function chessInCheck(chess) {
   return chessCallBool(chess, ['in_check', 'isCheck', 'is_check']);
 }

 function chessInStalemate(chess) {
   return chessCallBool(chess, ['in_stalemate', 'isStalemate', 'is_stalemate']);
 }

 function chessInDraw(chess) {
   return chessCallBool(chess, ['in_draw', 'isDraw', 'is_draw']);
 }

 function chessIsGameOver(chess) {
   return chessCallBool(chess, ['is_game_over', 'isGameOver', 'is_gameover', 'game_over']);
 }

 function chessIsThreefoldRepetition(chess) {
   return chessCallBool(chess, ['is_threefold_repetition', 'isThreefoldRepetition', 'is_threefold']);
 }

 function chessHasInsufficientMaterial(chess) {
   return chessCallBool(chess, ['insufficient_material', 'isInsufficientMaterial', 'insufficientMaterial']);
 }

function ensureProfile(uid, name) {
  try { return profiles.ensureProfile(uid, name || 'Người chơi'); } catch { return { id: uid, name: name || 'Người chơi', coins: 0 }; }
}

function getDisplayName(api, uid) {
  return api.getUserInfo(uid).then(info => {
    return info?.changed_profiles?.[uid]?.displayName || 'Người chơi';
  }).catch(() => 'Người chơi');
}

function headerFor(gameName, uid, nameOverride) {
  try {
    const prof = profiles.getProfile(uid) || { id: uid, name: nameOverride || 'Người chơi', coins: 0 };
    return makeHeader(gameName, { name: nameOverride || prof.name, uid, coins: prof.coins });
  } catch {
    return `👤 Tên: ${nameOverride || 'Người chơi'} | 🎮 Game: ${gameName} | 🆔 UID: ${uid}`;
  }
}

function parseMentionedUid(event) {
  try {
    // Zalo internal format: mentions appear in event.mentions? If not, we rely on quoted/reply
    const mentions = event?.mentions || [];
    if (Array.isArray(mentions) && mentions.length > 0) {
      return mentions[0].uid;
    }
  } catch {}
  return null;
}

function ensureStats(uid) {
  if (!uid || String(uid) === 'BOT') {
    return null;
  }
  if (!global.gameLeaderboard.chess[uid]) {
    global.gameLeaderboard.chess[uid] = { wins: 0, losses: 0, draws: 0, totalBet: 0, totalWin: 0 };
  }
  return global.gameLeaderboard.chess[uid];
}

function buildMentions(tagName, uid, messageText = '') {
  const tagText = `@${tagName}`;
  const length = tagText.length;
  const fromIndex = typeof messageText === 'string' ? messageText.indexOf(tagText) : -1;
  if (fromIndex < 0) return [];
  return [
    { id: String(uid), tag: tagText, fromIndex, length },
    { uid: String(uid), tag: tagText, fromIndex, length },
    { uid: String(uid), offset: fromIndex, length },
    { uid: String(uid), pos: fromIndex, len: length }
  ];
}

function ensureBoardMessageStore() {
  if (!(global.chessBoardMessages instanceof Map)) {
    global.chessBoardMessages = new Map();
  }
}

function registerBoardMessages(messageIds, record) {
  ensureBoardMessageStore();
  const ids = Array.isArray(messageIds) ? messageIds.filter(Boolean).map(String) : [];
  if (!ids.length) return;
  for (const id of ids) {
    global.chessBoardMessages.set(id, record);
  }
}

function getAllowedPlayersFromGame(game) {
  if (!game) return [];
  if (game.vsBot) return [String(game.player)];
  const arr = [game.white, game.black].filter(Boolean).map(String);
  return Array.from(new Set(arr));
}

function loadPieceImageSyncCache() {
  const cache = {};
  for (const [key, file] of Object.entries(PIECES)) {
    const fp = path.join(ASSET_DIR, file);
    if (fs.existsSync(fp)) cache[key] = fp;
  }
  return cache;
}

const pieceImageCache = loadPieceImageSyncCache();

function pieceKeyFromSymbol(s) {
  switch (s) {
    case 'k': return 'bK';
    case 'q': return 'bQ';
    case 'r': return 'bR';
    case 'b': return 'bB';
    case 'n': return 'bN';
    case 'p': return 'bP';
    case 'K': return 'wK';
    case 'Q': return 'wQ';
    case 'R': return 'wR';
    case 'B': return 'wB';
    case 'N': return 'wN';
    case 'P': return 'wP';
    default: return null;
  }
}

function pieceUnicodeFromKey(key) {
  switch (key) {
    case 'wK': return '♔';
    case 'wQ': return '♕';
    case 'wR': return '♖';
    case 'wB': return '♗';
    case 'wN': return '♘';
    case 'wP': return '♙';
    case 'bK': return '♚';
    case 'bQ': return '♛';
    case 'bR': return '♜';
    case 'bB': return '♝';
    case 'bN': return '♞';
    case 'bP': return '♟';
    default: return null;
  }
}

function drawUnicodePiece(ctx, key, x, y, sq) {
  const glyph = pieceUnicodeFromKey(key);
  if (!glyph) return;
  const isWhite = key.startsWith('w');

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.max(6, Math.floor(sq * 0.12));
  ctx.shadowOffsetY = Math.max(2, Math.floor(sq * 0.04));

  // Base circle to make piece stand out on both square colors
  const cx0 = x + sq / 2;
  const cy0 = y + sq / 2;
  const r0 = sq * 0.34;
  const base = ctx.createRadialGradient(cx0 - r0 * 0.3, cy0 - r0 * 0.3, r0 * 0.2, cx0, cy0, r0);
  if (isWhite) {
    base.addColorStop(0, 'rgba(255,255,255,0.95)');
    base.addColorStop(1, 'rgba(226,232,240,0.90)');
  } else {
    base.addColorStop(0, 'rgba(31,41,55,0.96)');
    base.addColorStop(1, 'rgba(17,24,39,0.92)');
  }
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(cx0, cy0, r0, 0, Math.PI * 2);
  ctx.fill();

  // Reset shadow for crisp glyph
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Prefer fonts that usually contain chess glyphs
  ctx.font = `${Math.floor(sq * 0.78)}px "Segoe UI Symbol", "Noto Sans Symbols2", "DejaVu Sans", sans-serif`;

  const cx = x + sq / 2;
  const cy = y + sq / 2 + sq * 0.04;

  // Stroke for contrast on both square colors
  ctx.lineWidth = Math.max(2, Math.floor(sq * 0.06));
  ctx.strokeStyle = isWhite ? 'rgba(15,23,42,0.55)' : 'rgba(241,245,249,0.75)';
  ctx.strokeText(glyph, cx, cy);

  // Fill
  ctx.fillStyle = isWhite ? '#111827' : '#f8fafc';
  ctx.fillText(glyph, cx, cy);
  ctx.restore();
}

async function renderBoardPNG(chess, outPath, options = {}) {
  const size = options.size || 640;
  const sq = Math.floor(size / 8);
  const margin = options.margin ?? 70;
  const boardSize = sq * 8;
  const canvas = createCanvas(boardSize + margin * 2, boardSize + margin * 2);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw board squares
  const light = '#eeeed2';
  const dark = '#769656';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const x = margin + c * sq;
      const y = margin + r * sq;
      const isDark = (r + c) % 2 === 1;
      ctx.fillStyle = isDark ? dark : light;
      ctx.fillRect(x, y, sq, sq);
    }
  }

  // Rank/file coordinates (4 sides)
  ctx.fillStyle = '#e5e7eb';
  ctx.font = `${Math.floor(sq * 0.22)}px sans-serif`;
  ctx.textBaseline = 'middle';
  const files = 'abcdefgh'.split('');
  for (let c = 0; c < 8; c++) {
    const ch = files[c];
    const x = margin + c * sq + sq / 2;
    ctx.textAlign = 'center';
    ctx.fillText(ch, x, margin + boardSize + (margin * 0.45));
    ctx.fillText(ch, x, margin - (margin * 0.45));
  }
  for (let r = 0; r < 8; r++) {
    const num = String(8 - r);
    const y = margin + r * sq + sq / 2;
    ctx.textAlign = 'center';
    ctx.fillText(num, margin - (margin * 0.45), y);
    ctx.fillText(num, margin + boardSize + (margin * 0.45), y);
  }

  // Pieces from FEN
  const fen = chess.fen().split(' ')[0];
  const rows = fen.split('/');
  for (let r = 0; r < 8; r++) {
    let col = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) { col += parseInt(ch, 10); continue; }
      const key = pieceKeyFromSymbol(ch);
      if (!key) { col++; continue; }
      const x = margin + col * sq;
      const y = margin + r * sq;

      // Try draw image piece; fallback to letter
      const imgPath = pieceImageCache[key];
      if (imgPath) {
        // eslint-disable-next-line no-await-in-loop
        const img = await loadImage(imgPath);
        const scale = 0.88;
        const dx = x + (sq * (1 - scale)) / 2;
        const dy = y + (sq * (1 - scale)) / 2;
        const ds = sq * scale;
        ctx.drawImage(img, dx, dy, ds, ds);
      } else {
        drawUnicodePiece(ctx, key, x, y, sq);
      }
      col++;
    }
  }

  // Draw square coordinates inside each square (small, for easier moves)
  ctx.save();
  ctx.font = `${Math.floor(sq * 0.16)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const coord = `${files[c]}${8 - r}`;
      const x = margin + c * sq + 4;
      const y = margin + r * sq + 3;
      const isDark = (r + c) % 2 === 1;
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)';
      ctx.fillText(coord, x, y);
    }
  }
  ctx.restore();

  // Turn and status text
  ctx.fillStyle = '#e5e7eb';
  ctx.font = `${Math.floor(sq * 0.28)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const status = chessInCheckmate(chess)
    ? 'Checkmate'
    : chessInCheck(chess)
      ? 'Check'
      : chessInStalemate(chess)
        ? 'Stalemate'
        : chessInDraw(chess)
          ? 'Draw'
          : chessIsGameOver(chess)
            ? 'Game Over'
            : '';
  const turn = chess.turn() === 'w' ? 'White' : 'Black';
  const label = `Turn: ${turn}${status ? ' | ' + status : ''}`;
  ctx.fillText(label, margin, 6);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e5e7eb';
  ctx.font = `${Math.floor(sq * 0.22)}px "Segoe UI Symbol", "Noto Sans Symbols2", "DejaVu Sans", sans-serif`;
  const legend = 'Trắng: ♙ Tốt  ♘ Mã  ♗ Tượng  ♖ Xe  ♕ Hậu  ♔ Vua   |   Đen: ♟ Tốt  ♞ Mã  ♝ Tượng  ♜ Xe  ♛ Hậu  ♚ Vua';
  ctx.fillText(legend, margin, canvas.height - 10);

  // Save
  await fs.promises.writeFile(outPath, canvas.toBuffer('image/png'));
  return outPath;
}

function parseBet(n) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function parseMoveArgs(args) {
  // Accept formats: e2e4, e7e8q (promotion), optionally with spaces
  const s = (args[0] || '').trim();
  return s;
}

function pickRandomBotMove(chess) {
  if (!chess || typeof chess.moves !== 'function') return null;
  try {
    const moves = chess.moves({ verbose: true });
    if (!Array.isArray(moves) || moves.length === 0) return null;
    const chosen = moves[Math.floor(Math.random() * moves.length)];
    if (!chosen) return null;
    return { from: chosen.from, to: chosen.to, promotion: chosen.promotion };
  } catch {
    return null;
  }
}

async function renderAndSendBoard({ api, threadId, type, send, chess, text }) {
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const outPng = path.join(tempDir, `chess_${threadId}_${Date.now()}.png`);
  await renderBoardPNG(chess, outPng, { size: 640 });
  const sent = await send(text, [outPng]);
  try {
    const ids = typeof collectMessageIds === 'function' ? collectMessageIds(sent) : [];
    registerBoardMessages(ids, {
      threadId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
  } catch {}
  try { fs.unlinkSync(outPng); } catch {}
}

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;

  let userName = 'Người chơi';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người chơi';
  } catch {}
  try {
    const profName = (profiles.getProfile(senderId) || {}).name;
    if (profName) userName = profName;
  } catch {}

  const action = (args[0] || '').toLowerCase();

  async function send(content, attachments) {
    const parts = Array.isArray(content) ? content : [String(content)];
    parts.unshift(headerFor('Chess', senderId, userName));
    const msg = { msg: parts.join('\n') };
    if (attachments && attachments.length) msg.attachments = attachments;
    return api.sendMessage(msg, threadId, type);
  }

  async function sendRich({ text, attachments = [], mentions = [] }) {
    const parts = Array.isArray(text) ? text : [String(text)];
    parts.unshift(headerFor('Chess', senderId, userName));
    const payload = { msg: parts.join('\n') };
    if (attachments && attachments.length) payload.attachments = attachments;
    if (mentions && mentions.length) payload.mentions = mentions;
    return api.sendMessage(payload, threadId, type);
  }

  if (!action || action === 'help') {
    const help = [
      '♟️ CỜ VUA - LỆNH:',
      '• chess bot - Chơi với bot (bot đi ngẫu nhiên hợp lệ)',
      '• chess create @user [bet] - Mời chơi',
      '• chess accept | chess decline - Chấp nhận/Từ chối',
      '• chess move e2e4 - Đi nước (UCI). Phong cấp: e7e8q',
      '• chess board - Xem bàn hiện tại (ảnh)',
      '• chess resign - Đầu hàng',
      '• chess stats - Thống kê',
      '',
      ChessLib ? '' : '⚠️ Lưu ý: Chưa cài chess.js. Admin chạy: npm i chess.js'
    ].filter(Boolean).join('\n');
    return send(help);
  }

  if (action === 'stats') {
    const s = ensureStats(senderId);
    const total = s.wins + s.losses + s.draws;
    const winRate = total ? ((s.wins / total) * 100).toFixed(1) : '0.0';
    const lines = [
      `📊 Thống kê cờ vua - ${userName}`,
      `Tổng trận: ${total} | 🏆 Thắng: ${s.wins} | 💥 Thua: ${s.losses} | 🤝 Hòa: ${s.draws}`,
      `Win rate: ${winRate}%`,
      `Tổng cược: ${s.totalBet.toLocaleString()} | Tổng thắng: ${s.totalWin.toLocaleString()}`
    ];
    return send(lines.join('\n'));
  }

  // Create/Invite
  if (action === 'bot' || action === 'solo') {
    if (!ChessLib) return send('⚠️ Admin chưa cài chess.js. Vui lòng cài: npm i chess.js');

    const existing = global.chessGames.get(threadId);
    if (existing && existing.status === 'playing') {
      return send('❌ Đang có ván cờ trong đoạn chat này. Gõ: chess resign để kết thúc ván hiện tại.');
    }

    const chess = new ChessLib();
    const game = {
      status: 'playing',
      bet: 0,
      createdAt: Date.now(),
      chess,
      vsBot: true,
      player: String(senderId),
      bot: 'BOT',
      white: String(senderId),
      black: 'BOT',
      turnStartAt: Date.now(),
    };
    global.chessGames.set(threadId, game);

    const startText = '🤖 Bắt đầu ván cờ với bot! Bạn cầm Trắng.\nLượt @' + userName + '. Dùng: chess move e2e4';
    const startMentions = buildMentions(userName, senderId, startText);
    await renderAndSendBoard({
      api,
      threadId,
      type,
      send: (t, a) => sendRich({ text: t, attachments: a, mentions: startMentions }),
      chess,
      text: startText
    });
    return;
  }

  if (action === 'create') {
    const targetUid = parseMentionedUid(event) || args[1];
    if (!targetUid) return send('❌ Vui lòng tag hoặc nhập UID đối thủ: chess create @user [bet]');
    if (String(targetUid) === String(senderId)) return send('❌ Không thể mời chính mình.');

    let bet = 0;
    if (args.length >= 3) bet = parseBet(args[2]);

    // Ensure wallet and balance
    const prof = ensureProfile(senderId, userName);
    if ((prof?.coins ?? 0) < bet) return send(`❌ Số dư không đủ để đặt cược ${bet.toLocaleString()}`);

    // Save pending game
    const game = {
      status: 'pending',
      inviter: senderId,
      invitee: String(targetUid),
      bet,
      createdAt: Date.now()
    };
    global.chessGames.set(threadId, game);

    const oppName = await getDisplayName(api, String(targetUid));
    const lines = [
      '♟️ Bạn đã mời chơi cờ vua!',
      `Đối thủ: ${oppName} (UID: ${targetUid})`,
      `Cược: ${bet.toLocaleString()}`,
      'Đối thủ gõ: chess accept hoặc chess decline'
    ];
    return send(lines.join('\n'));
  }

  // Must have a game in thread afterwards
  const game = global.chessGames.get(threadId);
  if (!game) return send('❌ Chưa có ván cờ nào trong đoạn chat này. Gõ "chess bot" hoặc "chess create @user [bet]" để bắt đầu.');

  const isVsBot = !!game.vsBot;
  const isParticipant = isVsBot
    ? String(senderId) === String(game.player)
    : String(senderId) === String(game.white) || String(senderId) === String(game.black);

  if (action === 'accept') {
    if (game.status !== 'pending') return send('❌ Không có lời mời nào cần chấp nhận.');
    if (String(game.invitee) !== String(senderId)) return send('❌ Chỉ người được mời mới có thể chấp nhận.');

    const inviterProf = ensureProfile(game.inviter);
    const inviteeProf = ensureProfile(game.invitee);
    if ((inviterProf?.coins ?? 0) < game.bet) return send('❌ Người mời không đủ tiền cược. Hủy ván.');
    if ((inviteeProf?.coins ?? 0) < game.bet) return send('❌ Bạn không đủ tiền cược.');

    // Deduct bet
    try { inviterProf.coins = (inviterProf.coins || 0) - game.bet; } catch {}
    try { inviteeProf.coins = (inviteeProf.coins || 0) - game.bet; } catch {}
    try { profiles.saveProfiles(); } catch {}

    // Start chess
    let chess = null;
    if (!ChessLib) return send('⚠️ Admin chưa cài chess.js. Vui lòng cài: npm i chess.js');
    chess = new ChessLib();

    game.status = 'playing';
    game.chess = chess;
    game.white = game.inviter; // inviter plays white
    game.black = game.invitee;
    game.turnStartAt = Date.now();

    // Render board
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const outPng = path.join(tempDir, `chess_${threadId}_${Date.now()}.png`);
    await renderBoardPNG(chess, outPng, { size: 640 });

    const whiteName = await getDisplayName(api, game.white);
    const blackName = await getDisplayName(api, game.black);
    const mentionUid = String(game.white) === 'BOT' ? null : game.white;
    const mentionText = mentionUid
      ? `✅ Lời mời đã được chấp nhận. Ván cờ bắt đầu!
Trắng: ${whiteName} | Đen: ${blackName}
Cược mỗi bên: ${game.bet.toLocaleString()}
Lượt @${whiteName}. Dùng: chess move e2e4`
      : `✅ Lời mời đã được chấp nhận. Ván cờ bắt đầu!
Trắng: ${whiteName} | Đen: ${blackName}
Cược mỗi bên: ${game.bet.toLocaleString()}
Lượt Trắng. Dùng: chess move e2e4`;
    const mentionArr = mentionUid ? buildMentions(whiteName, mentionUid, mentionText) : [];
    const msg = [
      '✅ Lời mời đã được chấp nhận. Ván cờ bắt đầu!',
      `Trắng: ${whiteName} | Đen: ${blackName}`,
      `Cược mỗi bên: ${game.bet.toLocaleString()}`,
      'Lượt Trắng. Dùng: chess move e2e4'
    ].join('\n');
    await sendRich({ text: mentionText, attachments: [outPng], mentions: mentionArr });
    try { fs.unlinkSync(outPng); } catch {}
    return;
  }

  if (action === 'decline') {
    if (game.status !== 'pending') return send('❌ Không có lời mời nào cần từ chối.');
    if (String(game.invitee) !== String(senderId)) return send('❌ Chỉ người được mời mới có thể từ chối.');

    global.chessGames.delete(threadId);
    return send('🚫 Đã từ chối lời mời cờ vua.');
  }

  if (game.status !== 'playing') {
    return send('❌ Ván cờ chưa bắt đầu.');
  }

  // Determine turn
  const isWhiteTurn = game.chess.turn() === 'w';
  const expectedUid = isWhiteTurn ? game.white : game.black;

  if (action === 'board') {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const outPng = path.join(tempDir, `chess_${threadId}_${Date.now()}.png`);
    await renderBoardPNG(game.chess, outPng, { size: 640 });

    let mentionUid = null;
    if (game.chess.turn() === 'w') mentionUid = game.white;
    if (game.chess.turn() === 'b') mentionUid = game.black;
    if (String(mentionUid) === 'BOT') mentionUid = null;

    if (mentionUid) {
      const mentionName = await getDisplayName(api, String(mentionUid));
      const text = `🖼️ Bàn cờ hiện tại.\nLượt @${mentionName}.`;
      const mentions = buildMentions(mentionName, mentionUid, text);
      await sendRich({ text, attachments: [outPng], mentions });
    } else {
      const who = game.chess.turn() === 'w' ? 'Trắng' : 'Đen';
      await sendRich({ text: `🖼️ Bàn cờ hiện tại.\nLượt ${who}.`, attachments: [outPng] });
    }
    try { fs.unlinkSync(outPng); } catch {}
    return;
  }

  if (action === 'resign') {
    if (!isParticipant) {
      return send('❌ Bạn không ở trong ván này.');
    }
    const resignSide = String(senderId) === String(game.white) ? 'white' : 'black';
    const winner = resignSide === 'white' ? game.black : game.white;

    const loserUid = String(senderId);
    const winnerUid = String(winner);
    const sLoser = ensureStats(loserUid);
    const sWinner = ensureStats(winnerUid);
    if (sLoser) {
      sLoser.losses++;
      sLoser.totalBet += game.bet;
    }
    if (sWinner) {
      sWinner.wins++;
      sWinner.totalBet += game.bet;
    }
    if (!game.vsBot) {
      if (sWinner) {
        sWinner.totalWin += game.bet * 2;
      }
      try {
        const wProf = profiles.getProfile(winnerUid);
        wProf.coins = (wProf.coins || 0) + game.bet * 2;
        profiles.saveProfiles();
      } catch {}
    }

    global.chessGames.delete(threadId);
    return send(game.vsBot ? '🏳️ Bạn đã đầu hàng. Bot thắng.' : '🏳️ Bạn đã đầu hàng. Đối thủ thắng và nhận toàn bộ cược.');
  }

  if (action === 'move') {
    if (!isParticipant) {
      return send('❌ Bạn không ở trong ván này.');
    }
    if (String(senderId) !== String(expectedUid)) {
      const who = isWhiteTurn ? 'Trắng' : 'Đen';
      const tail = game.vsBot ? ' (bot đang đi)' : '';
      return send(`❌ Chưa tới lượt bạn. Lượt ${who}.${tail}`);
    }
    if (!ChessLib) return send('⚠️ Admin chưa cài chess.js. Vui lòng cài: npm i chess.js');

    const uci = parseMoveArgs(args.slice(1));
    if (!uci || uci.length < 4) return send('❌ Cú pháp: chess move e2e4 [q|r|b|n]');

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci[4];

    const moveObj = { from, to };
    if (promotion && 'qrbn'.includes(promotion)) moveObj.promotion = promotion;

    const res = game.chess.move(moveObj);
    if (!res) return send('❌ Nước đi không hợp lệ. Hãy thử lại.');

    if (chessInCheckmate(game.chess)) {
      // Determine winner by side who just moved
      const moverIsWhite = res.color === 'w';
      const winnerUid = moverIsWhite ? game.white : game.black;
      const loserUid = moverIsWhite ? game.black : game.white;

      const sW = ensureStats(winnerUid);
      const sL = ensureStats(loserUid);
      if (sW) {
        sW.wins++;
        sW.totalBet += game.bet;
        if (!game.vsBot) sW.totalWin += game.bet * 2;
      }
      if (sL) {
        sL.losses++;
        sL.totalBet += game.bet;
      }
      if (!game.vsBot) {
        try {
          const wProf = profiles.getProfile(winnerUid);
          wProf.coins = (wProf.coins || 0) + game.bet * 2;
          profiles.saveProfiles();
        } catch {}
      }

      await renderAndSendBoard({ api, threadId, type, send: (t, a) => sendRich({ text: t, attachments: a }), chess: game.chess, text: '♚ Checkmate! Ván cờ kết thúc.' });
      global.chessGames.delete(threadId);
      return;
    }

    if (
      chessInDraw(game.chess)
      || chessInStalemate(game.chess)
      || chessIsThreefoldRepetition(game.chess)
      || chessHasInsufficientMaterial(game.chess)
    ) {
      const sW = ensureStats(game.white);
      const sB = ensureStats(game.black);
      if (sW) {
        sW.draws++;
        sW.totalBet += game.bet;
      }
      if (sB) {
        sB.draws++;
        sB.totalBet += game.bet;
      }
      if (!game.vsBot) {
        try {
          const wProf = profiles.getProfile(game.white);
          wProf.coins = (wProf.coins || 0) + game.bet;
          const bProf = profiles.getProfile(game.black);
          bProf.coins = (bProf.coins || 0) + game.bet;
          profiles.saveProfiles();
        } catch {}
      }

      await renderAndSendBoard({ api, threadId, type, send: (t, a) => sendRich({ text: t, attachments: a }), chess: game.chess, text: '🤝 Ván cờ hòa.' });
      global.chessGames.delete(threadId);
      return;
    }

    if (game.vsBot) {
      const botMove = pickRandomBotMove(game.chess);
      if (botMove) {
        const botRes = game.chess.move(botMove);
        if (botRes) {
          if (chessInCheckmate(game.chess)) {
            const moverIsWhite = botRes.color === 'w';
            const winnerUid = moverIsWhite ? game.white : game.black;
            const loserUid = moverIsWhite ? game.black : game.white;
            const sW = ensureStats(winnerUid);
            const sL = ensureStats(loserUid);
            if (sW) {
              sW.wins++;
              sW.totalBet += game.bet;
            }
            if (sL) {
              sL.losses++;
              sL.totalBet += game.bet;
            }
            await renderAndSendBoard({ api, threadId, type, send: (t, a) => sendRich({ text: t, attachments: a }), chess: game.chess, text: `🤖 Bot đã đi: ${botMove.from}-${botMove.to}${botMove.promotion ? '=' + botMove.promotion : ''}\n♚ Checkmate! Ván cờ kết thúc.` });
            global.chessGames.delete(threadId);
            return;
          }
          if (
            chessInDraw(game.chess)
            || chessInStalemate(game.chess)
            || chessIsThreefoldRepetition(game.chess)
            || chessHasInsufficientMaterial(game.chess)
          ) {
            const sW = ensureStats(game.white);
            const sB = ensureStats(game.black);
            if (sW) {
              sW.draws++;
              sW.totalBet += game.bet;
            }
            if (sB) {
              sB.draws++;
              sB.totalBet += game.bet;
            }
            await renderAndSendBoard({ api, threadId, type, send: (t, a) => sendRich({ text: t, attachments: a }), chess: game.chess, text: `🤖 Bot đã đi: ${botMove.from}-${botMove.to}${botMove.promotion ? '=' + botMove.promotion : ''}\n🤝 Ván cờ hòa.` });
            global.chessGames.delete(threadId);
            return;
          }
        }
      }

      const afterText = `✅ Bạn đã đi: ${from}-${to}${promotion ? '=' + promotion : ''}.\n🤖 Bot đã đi: ${botMove?.from || '?'}-${botMove?.to || '?'}${botMove?.promotion ? '=' + botMove.promotion : ''}.\nLượt @${userName}.`;
      const afterMentions = buildMentions(userName, senderId, afterText);
      await renderAndSendBoard({ api, threadId, type, send: (t, a) => sendRich({ text: t, attachments: a, mentions: afterMentions }), chess: game.chess, text: afterText });
      return;
    }

    const nextWho = game.chess.turn() === 'w' ? 'Trắng' : 'Đen';
    let mentionUid = null;
    if (game.chess.turn() === 'w') mentionUid = game.white;
    if (game.chess.turn() === 'b') mentionUid = game.black;
    if (String(mentionUid) === 'BOT') mentionUid = null;
    let mentionName = 'người chơi';
    if (mentionUid) {
      mentionName = await getDisplayName(api, String(mentionUid));
    }
    const text = mentionUid
      ? `✅ Đã đi: ${from}-${to}${promotion ? '=' + promotion : ''}.\nLượt @${mentionName} (${nextWho}).`
      : `✅ Đã đi: ${from}-${to}${promotion ? '=' + promotion : ''}. Lượt ${nextWho}.`;
    const mentions = mentionUid ? buildMentions(mentionName, mentionUid, text) : [];
    await renderAndSendBoard({
      api,
      threadId,
      type,
      send: (t, a) => sendRich({ text: t, attachments: a, mentions }),
      chess: game.chess,
      text
    });
    return;
  }

  return send('❌ Lệnh không hợp lệ. Gõ "chess help" để xem hướng dẫn.');
};
