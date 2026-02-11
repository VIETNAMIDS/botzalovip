const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { Reactions } = require('zca-js');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');

const AUTO_DELETE_TIME = 60000;
const TURN_TIME = 60000;

function appendDeleteNotice(message, ttl = AUTO_DELETE_TIME) {
  return `${message}\n⏱️ Tin nhắn sẽ tự động xóa sau ${Math.floor(ttl / 1000)}s`;
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function extractMessageIds(payload) {
  try {
    if (typeof payload === 'string' || typeof payload === 'number') {
      const id = String(payload);
      return { msgId: id, cliMsgId: null, globalMsgId: id };
    }
    const data = payload?.data || payload;
    const msgId = data?.msgId || data?.messageId || data?.globalMsgId || data?.msgID;
    const cliMsgId = data?.cliMsgId || data?.clientMsgId;
    const globalMsgId = data?.globalMsgId || data?.msgId || data?.messageId;
    return {
      msgId: msgId != null ? String(msgId) : null,
      cliMsgId: cliMsgId != null ? String(cliMsgId) : null,
      globalMsgId: globalMsgId != null ? String(globalMsgId) : null
    };
  } catch {
    return { msgId: null, cliMsgId: null, globalMsgId: null };
  }
}

// Tối ưu: Giảm thời gian chờ file để phản hồi nhanh hơn
async function ensureFileReady(filePath, retries = 3, delay = 50) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.isFile() && stats.size > 0) return true;
    } catch (err) {}
    if (attempt < retries) await wait(delay);
  }
  return false;
}

async function sendWithAutoDelete(api, threadId, type, { message, attachments, mentions }, ttl = AUTO_DELETE_TIME, onSent = null) {
  const payload = { ttl };
  if (message) payload.msg = appendDeleteNotice(message, ttl);
  if (attachments?.length) payload.attachments = attachments;
  if (mentions?.length) payload.mentions = mentions;
  
  const sent = await api.sendMessage(payload, threadId, type);
  const ids = extractMessageIds(sent);
  if (typeof onSent === 'function') {
    try { onSent(sent, ids); } catch (err) { console.error('Error in onSent:', err); }
  }
  return { sent, ids };
}

const gameStates = new Map();
const pendingChallenges = new Map();

function ensureBoardMessageStore() {
  if (!(global.caroBoardMessages instanceof Map)) {
    global.caroBoardMessages = new Map();
  }
}

function clearBoardMessagesForGame(gameKey) {
  ensureBoardMessageStore();
  if (!gameKey) return;
  for (const [msgId, record] of global.caroBoardMessages.entries()) {
    if (record?.gameKey === gameKey) {
      global.caroBoardMessages.delete(msgId);
    }
  }
}

async function deleteBoardMessagesForGame(api, threadId, type, gameKey) {
  ensureBoardMessageStore();
  if (!api || !threadId || !gameKey) return;
  const targets = [];
  for (const [keyId, record] of global.caroBoardMessages.entries()) {
    if (record?.gameKey === gameKey && record?.threadId === threadId) {
      targets.push({ keyId: String(keyId), record });
    }
  }
  if (!targets.length) return;

  for (const { keyId, record } of targets) {
    try {
      if (typeof api?.deleteMessage === 'function') {
        const msgId = record?.msgId || record?.globalMsgId || keyId;
        const cliMsgId = record?.cliMsgId || "";
        await api.deleteMessage({ threadId, type, data: { msgId, cliMsgId } }, false);
      } else if (typeof api?.unsendMessage === 'function') {
        await api.unsendMessage(record?.globalMsgId || record?.msgId || keyId);
      }
    } catch {
      // ignore
    } finally {
      try { global.caroBoardMessages.delete(String(keyId)); } catch {}
    }
  }
}

const leaderboard = require('./leaderboard.js');

const BOARD_SIZES = {
  small: { size: 9, winLength: 4, name: '🍀 9x9 NHỎ', icon: '🟢' },
  medium: { size: 13, winLength: 5, name: '⭐ 13x13 TIÊU CHUẨN', icon: '🟡' },
  large: { size: 15, winLength: 5, name: '🔥 15x15 LỚN', icon: '🟠' },
  super: { size: 19, winLength: 5, name: '💎 19x19 SIÊU TO', icon: '🔴' }
};

function createBoard(size) {
  return Array(size * size).fill('⬜');
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

function drawParticles(ctx, width, height) {
  // Giảm số lượng particles để vẽ nhanh hơn
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 2 + 1;
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.2 + 0.05})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStars(ctx, width, height, count = 8) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 3 + 1.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3 + 0.15})`;
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      ctx.lineTo(Math.cos((18 + j * 72) * Math.PI / 180) * size, -Math.sin((18 + j * 72) * Math.PI / 180) * size);
      ctx.lineTo(Math.cos((54 + j * 72) * Math.PI / 180) * (size / 2), -Math.sin((54 + j * 72) * Math.PI / 180) * (size / 2));
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function createMenuImage(playerName, playerId, coins) {
  const width = 1400;
  const height = 1100;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#1a1a2e');
  bgGradient.addColorStop(0.25, '#16213e');
  bgGradient.addColorStop(0.5, '#0f3460');
  bgGradient.addColorStop(0.75, '#533483');
  bgGradient.addColorStop(1, '#e94560');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  const glowGradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width);
  glowGradient.addColorStop(0, 'rgba(233, 69, 96, 0.15)');
  glowGradient.addColorStop(0.5, 'rgba(83, 52, 131, 0.1)');
  glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGradient;
  ctx.fillRect(0, 0, width, height);

  drawStars(ctx, width, height, 20);

  const headerX = 50;
  const headerY = 40;
  const headerW = width - 100;
  const headerH = 180;

  ctx.shadowColor = '#e94560';
  ctx.shadowBlur = 40;
  roundRect(ctx, headerX, headerY, headerW, headerH, 30);
  const headerGradient = ctx.createLinearGradient(headerX, headerY, headerX, headerY + headerH);
  headerGradient.addColorStop(0, 'rgba(233, 69, 96, 0.3)');
  headerGradient.addColorStop(0.5, 'rgba(83, 52, 131, 0.3)');
  headerGradient.addColorStop(1, 'rgba(15, 52, 96, 0.3)');
  ctx.fillStyle = headerGradient;
  ctx.fill();
  ctx.shadowBlur = 0;

  roundRect(ctx, headerX, headerY, headerW, headerH, 30);
  const borderGradient = ctx.createLinearGradient(headerX, headerY, headerW, headerY + headerH);
  borderGradient.addColorStop(0, '#ff6b6b');
  borderGradient.addColorStop(0.25, '#feca57');
  borderGradient.addColorStop(0.5, '#48dbfb');
  borderGradient.addColorStop(0.75, '#ff9ff3');
  borderGradient.addColorStop(1, '#54a0ff');
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.shadowColor = '#ff6b6b';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 72px Arial, sans-serif';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 8;
  ctx.strokeText('🎮 CỜ CARO 🎮', width / 2, headerY + 70);
  ctx.fillText('🎮 CỜ CARO 🎮', width / 2, headerY + 70);
  ctx.shadowBlur = 0;

  ctx.font = 'bold 26px Arial, sans-serif';
  const playerInfo = `✨ ${playerName} ✨ | 🆔 ${playerId} | 💰 ${coins.toLocaleString()} coins`;
  roundRect(ctx, width/2 - 350, headerY + 100, 700, 50, 25);
  const playerBgGradient = ctx.createLinearGradient(width/2 - 350, 0, width/2 + 350, 0);
  playerBgGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
  playerBgGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
  playerBgGradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
  ctx.fillStyle = playerBgGradient;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(playerInfo, width / 2, headerY + 135);

  let yPos = headerY + headerH + 40;

  ctx.font = 'bold 34px Arial, sans-serif';
  roundRect(ctx, 50, yPos - 5, 520, 55, 15);
  const titleGradient = ctx.createLinearGradient(50, yPos, 570, yPos);
  titleGradient.addColorStop(0, 'rgba(72, 219, 251, 0.4)');
  titleGradient.addColorStop(1, 'rgba(255, 159, 243, 0.4)');
  ctx.fillStyle = titleGradient;
  ctx.fill();
  roundRect(ctx, 50, yPos - 5, 520, 55, 15);
  ctx.strokeStyle = '#48dbfb';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ff9ff3';
  ctx.shadowBlur = 20;
  ctx.textAlign = 'left';
  ctx.fillText('📐 CHỌN BÀN CỜ', 80, yPos + 32);
  ctx.shadowBlur = 0;
  yPos += 80;

  const boardOptions = [
    { key: 'small', label: '🍀 BÀN NHỎ 9x9', desc: '⚡ Nhanh gọn • 4 ô thắng', color: '#26de81' },
    { key: 'medium', label: '⭐ BÀN TIÊU CHUẨN 13x13', desc: '⚖️ Cân bằng • 5 ô thắng', color: '#fed330' },
    { key: 'large', label: '🔥 BÀN LỚN 15x15', desc: '💪 Thử thách • 5 ô thắng', color: '#fc5c65' },
    { key: 'super', label: '💎 BÀN SIÊU TO 19x19', desc: '👑 Pro Mode • 5 ô thắng', color: '#a55eea' }
  ];

  const cardWidth = (width - 160) / 2;
  const cardHeight = 130;

  boardOptions.forEach((option, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const cardX = 60 + col * (cardWidth + 20);
    const cardY = yPos + row * (cardHeight + 15);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 8;

    const cardGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
    cardGradient.addColorStop(0, 'rgba(37, 41, 51, 0.95)');
    cardGradient.addColorStop(1, 'rgba(22, 28, 45, 0.98)');

    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 20);
    ctx.fillStyle = cardGradient;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    roundRect(ctx, cardX, cardY, 12, cardHeight, 10);
    const accentGradient = ctx.createLinearGradient(cardX, cardY, cardX + 12, cardY);
    accentGradient.addColorStop(0, option.color);
    accentGradient.addColorStop(1, option.color + '80');
    ctx.fillStyle = accentGradient;
    ctx.fill();

    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 20);
    ctx.strokeStyle = option.color + '50';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText(option.label, cardX + 40, cardY + 45);

    ctx.fillStyle = option.color;
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText(option.desc, cardX + 40, cardY + 80);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText(`→ caro start ${option.key}`, cardX + 40, cardY + 110);
  });

  yPos += Math.ceil(boardOptions.length / 2) * (cardHeight + 15) + 50;

  ctx.font = 'bold 34px Arial, sans-serif';
  roundRect(ctx, 50, yPos - 5, 450, 55, 15);
  const modeTitleGradient = ctx.createLinearGradient(50, yPos, 500, yPos);
  modeTitleGradient.addColorStop(0, 'rgba(255, 159, 243, 0.4)');
  modeTitleGradient.addColorStop(1, 'rgba(72, 219, 251, 0.4)');
  ctx.fillStyle = modeTitleGradient;
  ctx.fill();
  roundRect(ctx, 50, yPos - 5, 450, 55, 15);
  ctx.strokeStyle = '#ff9ff3';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#48dbfb';
  ctx.shadowBlur = 20;
  ctx.textAlign = 'left';
  ctx.fillText('🎯 CHẾ ĐỘ CHƠI', 80, yPos + 32);
  ctx.shadowBlur = 0;
  yPos += 80;

  const modeCards = [
    { icon: '🤖', title: 'CHƠI VỚI BOT AI', desc: 'Thử thách trí tuệ nhân tạo', color: '#45aaf2', commands: ['caro start [size]', 'caro start small/large/super'] },
    { icon: '⚔️', title: 'THÁCH ĐẤU PvP', desc: 'Đấu với người chơi khác', color: '#fd9644', commands: ['caro challenge @tag', 'caro accept', 'caro decline'] }
  ];

  const modeCardWidth = (width - 140) / 2;
  const modeCardHeight = 170;

  modeCards.forEach((mode, i) => {
    const cardX = 50 + i * (modeCardWidth + 20);
    const cardY = yPos;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 8;

    const cardGradient = ctx.createLinearGradient(cardX, cardY, cardX + modeCardWidth, cardY + modeCardHeight);
    cardGradient.addColorStop(0, 'rgba(37, 41, 51, 0.95)');
    cardGradient.addColorStop(1, 'rgba(22, 28, 45, 0.98)');

    roundRect(ctx, cardX, cardY, modeCardWidth, modeCardHeight, 25);
    ctx.fillStyle = cardGradient;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    roundRect(ctx, cardX, cardY, modeCardWidth, 18, 25);
    const topGradient = ctx.createLinearGradient(cardX, cardY, cardX + modeCardWidth, cardY);
    topGradient.addColorStop(0, mode.color);
    topGradient.addColorStop(1, mode.color + '80');
    ctx.fillStyle = topGradient;
    ctx.fill();

    roundRect(ctx, cardX, cardY, modeCardWidth, modeCardHeight, 25);
    ctx.strokeStyle = mode.color + '60';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '55px Arial';
    ctx.fillText(mode.icon, cardX + 25, cardY + 75);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText(mode.title, cardX + 100, cardY + 45);

    ctx.fillStyle = mode.color;
    ctx.font = '17px Arial, sans-serif';
    ctx.fillText(mode.desc, cardX + 100, cardY + 72);

    ctx.font = 'bold 15px Arial, sans-serif';
    mode.commands.forEach((cmd, idx) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillText(cmd, cardX + 25, cardY + 115 + idx * 22);
    });
  });

  yPos += modeCardHeight + 40;

  ctx.font = 'bold 34px Arial, sans-serif';
  roundRect(ctx, 50, yPos - 5, 380, 55, 15);
  const howTitleGradient = ctx.createLinearGradient(50, yPos, 430, yPos);
  howTitleGradient.addColorStop(0, 'rgba(38, 222, 129, 0.4)');
  howTitleGradient.addColorStop(1, 'rgba(72, 219, 251, 0.4)');
  ctx.fillStyle = howTitleGradient;
  ctx.fill();
  roundRect(ctx, 50, yPos - 5, 380, 55, 15);
  ctx.strokeStyle = '#26de81';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#26de81';
  ctx.shadowBlur = 20;
  ctx.textAlign = 'left';
  ctx.fillText('📝 HƯỚNG DẪN', 80, yPos + 32);
  ctx.shadowBlur = 0;
  yPos += 80;

  const howToText = ['💡 Gõ số ô muốn đánh (1 - 361)', '💬 Hoặc reply số vào ảnh bàn cờ', '🎯 Thắng khi có 5 ô liên tiếp', '🏆 Thắng nhận ngay +50 coins'];
  ctx.font = '20px Arial, sans-serif';
  howToText.forEach((text, i) => {
    const textWidth = ctx.measureText(text).width;
    roundRect(ctx, 70, yPos + i * 32 - 5, textWidth + 30, 32, 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(text, 90, yPos + i * 32 + 18);
  });

  const footerY = height - 90;
  const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
  footerGradient.addColorStop(0, 'rgba(72, 219, 251, 0.15)');
  footerGradient.addColorStop(0.3, 'rgba(255, 159, 243, 0.15)');
  footerGradient.addColorStop(0.7, 'rgba(233, 69, 96, 0.15)');
  footerGradient.addColorStop(1, 'rgba(165, 94, 234, 0.15)');

  roundRect(ctx, 40, footerY, width - 80, 70, 25);
  ctx.fillStyle = footerGradient;
  ctx.fill();

  roundRect(ctx, 40, footerY, width - 80, 70, 25);
  const footerBorderGradient = ctx.createLinearGradient(0, footerY, width, footerY);
  footerBorderGradient.addColorStop(0, '#48dbfb');
  footerBorderGradient.addColorStop(0.5, '#ff9ff3');
  footerBorderGradient.addColorStop(1, '#e94560');
  ctx.strokeStyle = footerBorderGradient;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.shadowColor = '#ff9ff3';
  ctx.shadowBlur = 15;
  ctx.fillText('💖 CHÚC BẠN CHƠI VUI VẺ 💖 | 🎮 CARO Premium', width / 2, footerY + 42);
  ctx.shadowBlur = 0;

  ctx.font = '20px Arial';
  ctx.fillText('✨', 80, 80);
  ctx.fillText('💫', width - 80, 80);
  ctx.fillText('⭐', 80, height - 100);
  ctx.fillText('✨', width - 80, height - 100);

  return canvas.toBuffer('image/png');
}

function createBoardImage(board, size, title = 'CỜ CARO', subtitle = '', playerName = '', playerId = '', coins = 0, winLine = null, lastMove = null) {
  const cellSize = size <= 9 ? 55 : size <= 13 ? 48 : size <= 15 ? 42 : 38;
  const boardPixelSize = cellSize * size;
  const padding = 60;
  const headerHeight = 200;
  const footerHeight = 100;
  const width = Math.max(750, boardPixelSize + padding * 2);
  const height = headerHeight + boardPixelSize + padding * 2 + footerHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#1a1a2e');
  bgGradient.addColorStop(0.3, '#16213e');
  bgGradient.addColorStop(0.6, '#0f3460');
  bgGradient.addColorStop(1, '#533483');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  const glowGradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width);
  glowGradient.addColorStop(0, 'rgba(83, 52, 131, 0.2)');
  glowGradient.addColorStop(0.5, 'rgba(15, 52, 96, 0.1)');
  glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGradient;
  ctx.fillRect(0, 0, width, height);

  drawStars(ctx, width, height, 12);

  const headerX = 40;
  const headerY = 35;
  const headerW = width - 80;
  const headerH = 160;

  ctx.shadowColor = '#533483';
  ctx.shadowBlur = 35;
  roundRect(ctx, headerX, headerY, headerW, headerH, 25);
  const headerGradient = ctx.createLinearGradient(headerX, headerY, headerX, headerY + headerH);
  headerGradient.addColorStop(0, 'rgba(83, 52, 131, 0.3)');
  headerGradient.addColorStop(0.5, 'rgba(15, 52, 96, 0.3)');
  headerGradient.addColorStop(1, 'rgba(233, 69, 96, 0.2)');
  ctx.fillStyle = headerGradient;
  ctx.fill();
  ctx.shadowBlur = 0;

  const borderGradient = ctx.createLinearGradient(headerX, headerY, headerX + headerW, headerY + headerH);
  borderGradient.addColorStop(0, '#e94560');
  borderGradient.addColorStop(0.3, '#ff9ff3');
  borderGradient.addColorStop(0.6, '#48dbfb');
  borderGradient.addColorStop(1, '#26de81');

  roundRect(ctx, headerX, headerY, headerW, headerH, 25);
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.shadowColor = '#ff6b6b';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px Arial, sans-serif';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 6;
  ctx.strokeText(title, width / 2, headerY + 60);
  ctx.fillText(title, width / 2, headerY + 60);
  ctx.shadowBlur = 0;

  if (subtitle) {
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillStyle = '#fed330';
    ctx.shadowColor = '#fed330';
    ctx.shadowBlur = 10;
    ctx.fillText(subtitle, width / 2, headerY + 95);
    ctx.shadowBlur = 0;
  }

  ctx.font = '19px Arial, sans-serif';
  const playerInfo = `✨ ${playerName} ✨ | 🆔 ${playerId} | 💰 ${coins.toLocaleString()}`;
  roundRect(ctx, width/2 - 300, headerY + 110, 600, 38, 19);
  const playerBgGradient = ctx.createLinearGradient(width/2 - 300, 0, width/2 + 300, 0);
  playerBgGradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  playerBgGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
  playerBgGradient.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
  ctx.fillStyle = playerBgGradient;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText(playerInfo, width / 2, headerY + 135);

  const boardX = (width - boardPixelSize) / 2;
  const boardY = headerHeight + padding - 20;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 25;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;

  const boardGradient = ctx.createLinearGradient(boardX - 20, boardY - 20, boardX - 20, boardY + boardPixelSize + 20);
  boardGradient.addColorStop(0, '#f8fafc');
  boardGradient.addColorStop(1, '#e2e8f0');

  roundRect(ctx, boardX - 20, boardY - 20, boardPixelSize + 40, boardPixelSize + 40, 15);
  ctx.fillStyle = boardGradient;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  roundRect(ctx, boardX - 20, boardY - 20, boardPixelSize + 40, boardPixelSize + 40, 15);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= size; i++) {
    ctx.beginPath();
    ctx.moveTo(boardX + i * cellSize, boardY);
    ctx.lineTo(boardX + i * cellSize, boardY + boardPixelSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(boardX, boardY + i * cellSize);
    ctx.lineTo(boardX + boardPixelSize, boardY + i * cellSize);
    ctx.stroke();
  }

  if (winLine && Array.isArray(winLine) && winLine.length > 0) {
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    const firstCell = winLine[0];
    const lastCell = winLine[winLine.length - 1];
    const startX = boardX + (firstCell % size) * cellSize + cellSize / 2;
    const startY = boardY + Math.floor(firstCell / size) * cellSize + cellSize / 2;
    const endX = boardX + (lastCell % size) * cellSize + cellSize / 2;
    const endY = boardY + Math.floor(lastCell / size) * cellSize + cellSize / 2;
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = cellSize * 0.4;

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = i * size + j;
      const cell = board[index];
      const x = boardX + j * cellSize + cellSize / 2;
      const y = boardY + i * cellSize + cellSize / 2;

      if (lastMove === index) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.beginPath();
        ctx.arc(x, y, cellSize * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (cell === '❌') {
        const xGradient = ctx.createLinearGradient(x - cellSize * 0.3, y - cellSize * 0.3, x + cellSize * 0.3, y + cellSize * 0.3);
        xGradient.addColorStop(0, '#ef4444');
        xGradient.addColorStop(0.5, '#dc2626');
        xGradient.addColorStop(1, '#b91c1c');
        ctx.strokeStyle = xGradient;
        ctx.lineWidth = size <= 9 ? 5 : 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const offset = cellSize * 0.28;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(x - offset, y - offset);
        ctx.lineTo(x + offset, y + offset);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + offset, y - offset);
        ctx.lineTo(x - offset, y + offset);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (cell === '⭕') {
        const oGradient = ctx.createRadialGradient(x, y, 0, x, y, cellSize * 0.32);
        oGradient.addColorStop(0, '#60a5fa');
        oGradient.addColorStop(0.5, '#3b82f6');
        oGradient.addColorStop(1, '#2563eb');
        ctx.strokeStyle = oGradient;
        ctx.lineWidth = size <= 9 ? 5 : 4;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(x, y, cellSize * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.font = `${fontSize}px Arial, sans-serif`;
        ctx.fillText(String(index + 1), x, y);
      }
    }
  }

  const footerY = height - 85;
  const footerGradient = ctx.createLinearGradient(40, footerY, width - 40, footerY);
  footerGradient.addColorStop(0, 'rgba(72, 219, 251, 0.12)');
  footerGradient.addColorStop(0.4, 'rgba(255, 159, 243, 0.12)');
  footerGradient.addColorStop(0.6, 'rgba(233, 69, 96, 0.12)');
  footerGradient.addColorStop(1, 'rgba(165, 94, 234, 0.12)');

  roundRect(ctx, 40, footerY, width - 80, 65, 22);
  ctx.fillStyle = footerGradient;
  ctx.fill();

  roundRect(ctx, 40, footerY, width - 80, 65, 22);
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 19px Arial, sans-serif';
  ctx.shadowColor = '#ff9ff3';
  ctx.shadowBlur = 10;
  ctx.fillText(`💖 Caro ${size}x${size} | Chơi game không giới hạn 💖`, width / 2, footerY + 38);
  ctx.shadowBlur = 0;

  ctx.font = '16px Arial';
  ctx.fillText('✨', 60, footerY + 35);
  ctx.fillText('💫', width - 60, footerY + 35);

  return canvas.toBuffer('image/png');
}

function checkWin(board, size, winLength) {
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = i * size + j;
      const player = board[index];
      if (player === '⬜') continue;
      if (j <= size - winLength) {
        let count = 0;
        for (let k = 0; k < winLength; k++) {
          if (board[i * size + j + k] === player) count++;
        }
        if (count === winLength) return player;
      }
      if (i <= size - winLength) {
        let count = 0;
        for (let k = 0; k < winLength; k++) {
          if (board[(i + k) * size + j] === player) count++;
        }
        if (count === winLength) return player;
      }
      if (i <= size - winLength && j <= size - winLength) {
        let count = 0;
        for (let k = 0; k < winLength; k++) {
          if (board[(i + k) * size + j + k] === player) count++;
        }
        if (count === winLength) return player;
      }
      if (i <= size - winLength && j >= winLength - 1) {
        let count = 0;
        for (let k = 0; k < winLength; k++) {
          if (board[(i + k) * size + j - k] === player) count++;
        }
        if (count === winLength) return player;
      }
    }
  }
  return null;
}

function evaluatePattern(board, size, winLength, player) {
  let score = 0;
  function checkLine(positions, player) {
    let count = 0, empty = 0, blocked = 0;
    for (const pos of positions) {
      if (board[pos] === player) count++;
      else if (board[pos] === '⬜') empty++;
      else blocked++;
    }
    return { count, empty, blocked };
  }
  const wl = Math.max(3, Math.min(Number(winLength) || 5, 6));
  const patterns = wl === 4
    ? { win: 100000, three: 5000, openThree: 15000, two: 400, openTwo: 1500, one: 30, openOne: 80 }
    : { win: 100000, four: 12000, openFour: 60000, three: 1500, openThree: 9000, two: 120, openTwo: 700 };
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const checkSegment = (offsetI, offsetJ) => {
        const positions = [];
        for (let k = 0; k < wl; k++) positions.push((i + k * offsetI) * size + (j + k * offsetJ));
        const result = checkLine(positions, player);
        if (result.count === wl) score += patterns.win;
        else if (wl === 4) {
          if (result.count === 3 && result.empty === 1) score += result.blocked === 0 ? patterns.openThree : patterns.three;
          else if (result.count === 2 && result.empty === 2) score += result.blocked === 0 ? patterns.openTwo : patterns.two;
          else if (result.count === 1 && result.empty === 3) score += result.blocked === 0 ? patterns.openOne : patterns.one;
        } else {
          if (result.count === 4 && result.empty === 1) score += result.blocked === 0 ? patterns.openFour : patterns.four;
          else if (result.count === 3 && result.empty === 2) score += result.blocked === 0 ? patterns.openThree : patterns.three;
          else if (result.count === 2 && result.empty === 3) score += result.blocked === 0 ? patterns.openTwo : patterns.two;
        }
      };
      if (j <= size - wl) checkSegment(0, 1);
      if (i <= size - wl) checkSegment(1, 0);
      if (i <= size - wl && j <= size - wl) checkSegment(1, 1);
      if (i <= size - wl && j >= wl - 1) checkSegment(1, -1);
    }
  }
  return score;
}

function evaluateBoard(board, size, winLength) {
  const winner = checkWin(board, size, winLength);
  if (winner === '⭕') return 100000;
  if (winner === '❌') return -100000;
  return evaluatePattern(board, size, winLength, '⭕') - evaluatePattern(board, size, winLength, '❌');
}

function getCandidateMoves(board, size, radius = 2, maxMoves = 18) {
  const total = size * size;
  const filled = [];
  for (let i = 0; i < total; i++) {
    if (board[i] !== '⬜') filled.push(i);
  }
  if (filled.length === 0) {
    const center = Math.floor(total / 2);
    return board[center] === '⬜' ? [center] : [0];
  }

  const near = new Set();
  for (const idx of filled) {
    const r0 = Math.floor(idx / size);
    const c0 = idx % size;
    for (let dr = -radius; dr <= radius; dr++) {
      const r = r0 + dr;
      if (r < 0 || r >= size) continue;
      for (let dc = -radius; dc <= radius; dc++) {
        const c = c0 + dc;
        if (c < 0 || c >= size) continue;
        const pos = r * size + c;
        if (board[pos] === '⬜') near.add(pos);
      }
    }
  }

  const centerR = (size - 1) / 2;
  const centerC = (size - 1) / 2;
  const candidates = Array.from(near);
  candidates.sort((a, b) => {
    const ar = Math.floor(a / size), ac = a % size;
    const br = Math.floor(b / size), bc = b % size;
    const da = Math.abs(centerR - ar) + Math.abs(centerC - ac);
    const db = Math.abs(centerR - br) + Math.abs(centerC - bc);
    return da - db;
  });

  return candidates.slice(0, Math.max(1, Math.min(Number(maxMoves) || 18, 40)));
}

function minimaxAB(board, size, winLength, depth, alpha, beta, currentPlayer, startMs, timeLimitMs) {
  if (Date.now() - startMs > timeLimitMs) return evaluateBoard(board, size, winLength);

  const winner = checkWin(board, size, winLength);
  if (winner === '⭕') return 100000;
  if (winner === '❌') return -100000;
  if (depth <= 0) return evaluateBoard(board, size, winLength);

  const moves = getCandidateMoves(board, size, 2, depth >= 2 ? 14 : 18);
  if (!moves.length) return 0;

  if (currentPlayer === '⭕') {
    let best = -Infinity;
    for (const move of moves) {
      if (board[move] !== '⬜') continue;
      board[move] = '⭕';
      const val = minimaxAB(board, size, winLength, depth - 1, alpha, beta, '❌', startMs, timeLimitMs);
      board[move] = '⬜';
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
      if (Date.now() - startMs > timeLimitMs) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    if (board[move] !== '⬜') continue;
    board[move] = '❌';
    const val = minimaxAB(board, size, winLength, depth - 1, alpha, beta, '⭕', startMs, timeLimitMs);
    board[move] = '⬜';
    if (val < best) best = val;
    if (val < beta) beta = val;
    if (beta <= alpha) break;
    if (Date.now() - startMs > timeLimitMs) break;
  }
  return best;
}

function getBotMove(board, size, winLength) {
  const totalCells = size * size;
  
  // 1. Thắng ngay lập tức nếu có thể
  for (let i = 0; i < totalCells; i++) {
    if (board[i] === '⬜') {
      board[i] = '⭕';
      if (checkWin(board, size, winLength) === '⭕') { board[i] = '⬜'; return i; }
      board[i] = '⬜';
    }
  }
  
  // 2. Chặn người chơi thắng ngay
  for (let i = 0; i < totalCells; i++) {
    if (board[i] === '⬜') {
      board[i] = '❌';
      if (checkWin(board, size, winLength) === '❌') { board[i] = '⬜'; return i; }
      board[i] = '⬜';
    }
  }
  
  // 3. Tìm các ô gần quân cờ (bán kính 2)
  const candidates = [];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = i * size + j;
      if (board[index] === '⬜') {
        let hasNearby = false;
        for (let di = -2; di <= 2 && !hasNearby; di++) {
          for (let dj = -2; dj <= 2 && !hasNearby; dj++) {
            const ni = i + di, nj = j + dj;
            if (ni >= 0 && ni < size && nj >= 0 && nj < size) {
              const nIndex = ni * size + nj;
              if (board[nIndex] !== '⬜') hasNearby = true;
            }
          }
        }
        if (hasNearby) candidates.push(index);
      }
    }
  }
  
  // Nếu bàn cờ còn trống hoàn toàn, đánh giữa
  if (candidates.length === 0) {
    const center = Math.floor(totalCells / 2);
    if (board[center] === '⬜') return center;
    candidates.push(...Array.from({ length: totalCells }, (_, i) => i).filter(i => board[i] === '⬜'));
  }

  const empties = board.reduce((acc, c) => acc + (c === '⬜' ? 1 : 0), 0);
  let depth = 2;
  if (size <= 9) depth = empties > 50 ? 2 : 3;
  else if (size <= 13) depth = empties > 120 ? 2 : 3;
  else depth = 2;

  const startMs = Date.now();
  const timeLimitMs = size <= 9 ? 320 : 260;

  let bestMove = candidates[0];
  let bestScore = -Infinity;
  const scoredCandidates = candidates.slice();
  scoredCandidates.sort((a, b) => {
    board[a] = '⭕';
    const sa = evaluateBoard(board, size, winLength);
    board[a] = '⬜';
    board[b] = '⭕';
    const sb = evaluateBoard(board, size, winLength);
    board[b] = '⬜';
    return sb - sa;
  });

  const topMoves = scoredCandidates.slice(0, size <= 9 ? 14 : 12);
  for (const move of topMoves) {
    if (board[move] !== '⬜') continue;
    board[move] = '⭕';
    const score = minimaxAB(board, size, winLength, depth - 1, -Infinity, Infinity, '❌', startMs, timeLimitMs);
    board[move] = '⬜';
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (Date.now() - startMs > timeLimitMs) break;
  }

  return bestMove;
}

// Đếm pattern nhanh cho AI
function countPatterns(board, size, pos, player) {
  const row = Math.floor(pos / size);
  const col = pos % size;
  let count = 0;
  
  // 4 hướng: ngang, dọc, chéo xuống, chéo lên
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  
  for (const [dr, dc] of directions) {
    let line = [pos];
    // Đi về phía trước
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r >= 0 && r < size && c >= 0 && c < size) line.push(r * size + c);
      else break;
    }
    // Đi về phía sau
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r >= 0 && r < size && c >= 0 && c < size) line.push(r * size + c);
      else break;
    }
    
    // Đếm quân liên tiếp
    let consecutive = 0;
    let hasEmpty = false;
    for (const p of line) {
      if (board[p] === player) consecutive++;
      else if (board[p] === '⬜') hasEmpty = true;
      else break;
    }
    if (consecutive >= 4 && hasEmpty) count += 100;
    else if (consecutive >= 3 && hasEmpty) count += 20;
    else if (consecutive >= 2 && hasEmpty) count += 5;
  }
  
  return count;
}

module.exports.config = {
  name: "caro",
  version: "7.0.0",
  role: 0,
  author: "Bonz",
  description: "Chơi cờ caro với AI hoặc PvP - nhiều kích thước bàn cờ cute",
  category: "Game",
  usage: "caro [start/challenge/accept/move/status/reset/help] [small/medium/large/super]",
  cooldowns: 3
};

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId || event?.senderID;
  
  let userName = 'Người chơi';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người chơi';
  } catch {}
  try {
    const profName = (profiles.getProfile(senderId) || {}).name;
    if (profName && profName !== senderId) userName = profName;
  } catch {}

  try {
    if (!profiles.hasProfile(senderId)) {
      await sendWithAutoDelete(api, threadId, type, { message: "⚠️ Bạn chưa có hồ sơ game!\n💡 Gõ: 'profile create <tên>' để tạo trước." });
      return;
    }
  } catch {}

  function makeHeaderLine() {
    try {
      const prof = profiles.getProfile(senderId) || { id: senderId, name: userName, coins: 0 };
      return require('../shared/gameHeader').makeHeader('Caro', { name: prof.name || userName, uid: senderId, coins: prof.coins });
    } catch { return `👤 ${userName} | 🎮 Caro | 🆔 ${senderId}`; }
  }
  
  async function send(content, ttl = AUTO_DELETE_TIME) {
    const parts = Array.isArray(content) ? content : [String(content)];
    parts.unshift(makeHeaderLine());
    await sendWithAutoDelete(api, threadId, type, { message: parts.join('\n') }, ttl);
  }
  
  async function sendBoardImage(board, size, title, subtitle, message, options = {}) {
    const { gameKey = null, allowedPlayers = [], mentions = [] } = options;
    try {
      const prof = profiles.getProfile(senderId) || { id: senderId, name: userName, coins: 0 };
      const buffer = createBoardImage(board, size, title, subtitle, prof.name || userName, senderId, prof.coins || 0);
      const tempDir = path.join(__dirname, '../../cache');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const imagePath = path.join(tempDir, `caro_${Date.now()}.png`);
      fs.writeFileSync(imagePath, buffer);
      const ready = await ensureFileReady(imagePath);
      if (!ready) { await send('❌ Lỗi khi chuẩn bị ảnh bàn cờ'); return; }

      if (gameKey) {
        await deleteBoardMessagesForGame(api, threadId, type, String(gameKey));
      }

      const result = await sendWithAutoDelete(api, threadId, type, { message, attachments: [imagePath], mentions }, AUTO_DELETE_TIME);
      setTimeout(() => { try { fs.unlinkSync(imagePath); } catch {} }, AUTO_DELETE_TIME + 2000);
      if (gameKey) {
        clearBoardMessagesForGame(gameKey);
        const ids = result?.ids || {};
        const keyId = ids.globalMsgId || ids.msgId || ids.cliMsgId;
        if (Array.isArray(allowedPlayers) && allowedPlayers.length > 0 && keyId) {
          ensureBoardMessageStore();
          global.caroBoardMessages.set(String(keyId), {
            threadId,
            gameKey,
            allowedPlayers: allowedPlayers.map(String),
            expiresAt: Date.now() + AUTO_DELETE_TIME,
            createdAt: Date.now(),
            msgId: ids.msgId || null,
            cliMsgId: ids.cliMsgId || null,
            globalMsgId: ids.globalMsgId || null
          });
        } else if (Array.isArray(allowedPlayers) && allowedPlayers.length > 0) {
          // Fallback: vẫn lưu 1 key theo timestamp để caroreply có thể tìm theo activeRecord
          // (không dựa quote) trong trường hợp SDK không trả message id
          ensureBoardMessageStore();
          const fallbackKey = `${threadId}:${Date.now()}`;
          global.caroBoardMessages.set(String(fallbackKey), {
            threadId,
            gameKey,
            allowedPlayers: allowedPlayers.map(String),
            expiresAt: Date.now() + AUTO_DELETE_TIME,
            createdAt: Date.now(),
            msgId: null,
            cliMsgId: null,
            globalMsgId: null
          });
        }
      }
      const ids = result?.ids || {};
      return {
        msgId: ids.msgId != null ? String(ids.msgId) : null,
        cliMsgId: ids.cliMsgId != null ? String(ids.cliMsgId) : null,
        globalMsgId: ids.globalMsgId != null ? String(ids.globalMsgId) : null
      };
    } catch (error) {
      console.error('Error sending board:', error);
      await send('❌ Lỗi khi tạo ảnh bàn cờ');
    }
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

  function clearTurnTimer(game) {
    if (!game) return;
    if (game.turnTimer) {
      try { clearTimeout(game.turnTimer); } catch {}
      game.turnTimer = null;
    }
  }

  function clearTurnCountdown(game) {
    if (!game) return;
    if (game.turnCountdown) {
      try { clearInterval(game.turnCountdown); } catch {}
      game.turnCountdown = null;
    }

    if (game.startBurst) {
      try { clearInterval(game.startBurst); } catch {}
      game.startBurst = null;
    }
  }

  function getBoardDestinationFromGame(game, gameKey) {
    try {
      const ids = game?.lastBoardIds && typeof game.lastBoardIds === 'object' ? game.lastBoardIds : null;
      const msgId = ids?.msgId || ids?.globalMsgId || game?.lastBoardMsgId || null;
      const cliMsgId = ids?.cliMsgId || '';
      if (!msgId && !cliMsgId) return null;
      return {
        data: { msgId: msgId ? String(msgId) : null, cliMsgId: String(cliMsgId || '') },
        threadId,
        type
      };
    } catch {
      return null;
    }
  }

  function setLastBoardIds(game, ids) {
    if (!game) return;
    const normalized = ids && typeof ids === 'object'
      ? {
        msgId: ids.msgId != null ? String(ids.msgId) : null,
        cliMsgId: ids.cliMsgId != null ? String(ids.cliMsgId) : null,
        globalMsgId: ids.globalMsgId != null ? String(ids.globalMsgId) : null
      }
      : { msgId: null, cliMsgId: null, globalMsgId: null };
    game.lastBoardIds = normalized;
    game.lastBoardMsgId = normalized.globalMsgId || normalized.msgId || normalized.cliMsgId || null;
  }

  function pickBoardMessageId(threadId, gameKey) {
    try {
      ensureBoardMessageStore();
      const now = Date.now();
      let best = null;
      for (const [keyId, record] of global.caroBoardMessages.entries()) {
        if (!record) continue;
        if (record.threadId !== threadId) continue;
        if (record.gameKey !== gameKey) continue;
        if (record.expiresAt && record.expiresAt < now) continue;
        // Map preserves insertion order, so the last matching record is the latest board message.
        best = {
          msgId: record.msgId || record.globalMsgId || keyId,
          cliMsgId: record.cliMsgId || ''
        };
      }
      return best?.msgId ? { msgId: String(best.msgId), cliMsgId: String(best.cliMsgId || '') } : null;
    } catch {
      return null;
    }
  }

  async function sendReactionSafely(reaction, destination) {
    if (!destination || !destination.data || (!destination.data.msgId && !destination.data.cliMsgId)) return false;
    try {
      // Preferred (matches spamicon.js): api.addReaction(Reactions.X, destination)
      if (typeof api?.addReaction === 'function') {
        try {
          await api.addReaction(reaction, destination);
          return true;
        } catch {}
      }

      if (typeof api?.setMessageReaction === 'function') {
        const mid = String(destination.data.msgId || destination.data.cliMsgId || '');
        if (!mid) return false;
        // Variant A: (reaction, messageId, threadId, isSelf)
        try {
          await api.setMessageReaction(reaction, mid, threadId, true);
          return true;
        } catch {}
        // Variant B: (reaction, messageId, callback, isSelf)
        try {
          await new Promise((resolve) => {
            api.setMessageReaction(reaction, mid, () => resolve(true), true);
          });
          return true;
        } catch {}
        // Variant C: (messageId, reaction)
        try {
          await api.setMessageReaction(mid, reaction);
          return true;
        } catch {}
      }
      if (typeof api?.sendReaction === 'function') {
        const mid = String(destination.data.msgId || destination.data.cliMsgId || '');
        if (!mid) return false;
        try {
          await api.sendReaction(mid, reaction);
          return true;
        } catch {}
      }
    } catch {}
    return false;
  }

  function startBurst60Icons(game, destination) {
    if (!game || game.gameOver) return;
    if (!destination) return;
    if (game.startBurst) {
      try { clearInterval(game.startBurst); } catch {}
      game.startBurst = null;
    }

    const pool = [
      Reactions.HEART,
      Reactions.LIKE,
      Reactions.WOW,
      Reactions.SUN,
      Reactions.HANDCLAP,
      Reactions.COOL,
      Reactions.OK,
      Reactions.ROSE,
      Reactions.KISS,
      Reactions.THINK,
      Reactions.BOMB,
      Reactions.LAUGH,
      Reactions.HAHA
    ].filter(Boolean);

    let sent = 0;
    game.startBurst = setInterval(() => {
      if (game.gameOver) {
        clearTurnCountdown(game);
        return;
      }
      const reaction = pool.length ? pool[sent % pool.length] : Reactions.HAHA;
      sendReactionSafely(reaction, destination).catch?.(() => {});
      sent += 1;
      if (sent >= 60) {
        try { clearInterval(game.startBurst); } catch {}
        game.startBurst = null;
      }
    }, 350);
  }

  function startTurnCountdownReaction(game, threadId, type, gameKey) {
    if (!game || game.gameOver) return;
    clearTurnCountdown(game);
    if (!api) return;

    const destination = getBoardDestinationFromGame(game, gameKey);
    if (!destination) return;

    const pool = [
      Reactions.HEART,
      Reactions.LIKE,
      Reactions.WOW,
      Reactions.SUN,
      Reactions.HANDCLAP,
      Reactions.COOL,
      Reactions.OK,
      Reactions.ROSE,
      Reactions.KISS,
      Reactions.THINK,
      Reactions.BOMB,
      Reactions.LAUGH
    ].filter(Boolean);
    const startedAt = Date.now();

    const tryReact = async (reaction) => {
      await sendReactionSafely(reaction, destination);
    };

    // initial icon
    tryReact(pool.length ? pool[0] : Reactions.HAHA);

    game.turnCountdown = setInterval(() => {
      if (game.gameOver) {
        clearTurnCountdown(game);
        return;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed >= TURN_TIME) {
        clearTurnCountdown(game);
        return;
      }
      const secondsLeft = Math.max(0, Math.ceil((TURN_TIME - elapsed) / 1000));
      const icon = pool.length ? pool[secondsLeft % pool.length] : Reactions.HAHA;
      tryReact(icon);
    }, 1000);
  }

  async function endGameByTimeout(game, loserUid, loserName, winnerUid, winnerName, subtitle, allowedPlayers) {
    if (!game) return;
    clearTurnTimer(game);
    clearTurnCountdown(game);
    game.gameOver = true;
    game.winner = winnerName;

    const winnerIsHuman = winnerUid && winnerUid !== 'bot';
    const winnerText = winnerIsHuman ? `@${winnerName}` : `${winnerName}`;
    const msg = `⏳ HẾT GIỜ!\n\n@${loserName} đã quá 60s không đánh\n🏆 ${winnerText} thắng!`;

    const mentions = [
      ...buildMentions(loserName, loserUid, msg),
      ...(winnerIsHuman ? buildMentions(winnerName, winnerUid, msg) : [])
    ];

    try {
      if (winnerIsHuman) {
        profiles.updateStats(winnerUid, 'caro', true);
        profiles.addCoins(winnerUid, 50);
      }
      if (loserUid && loserUid !== 'bot') {
        profiles.updateStats(loserUid, 'caro', false);
      }
    } catch {}

    await sendBoardImage(game.board, game.boardSize, game.boardName, subtitle, msg, { gameKey: `${threadId}`, allowedPlayers, mentions });
    clearBoardMessagesForGame(`${threadId}`);
    gameStates.delete(threadId);
    pendingChallenges.delete(threadId);
  }

  function scheduleTurnTimeout(game) {
    if (!game || game.gameOver) return;
    clearTurnTimer(game);
    clearTurnCountdown(game);

    const isPvp = game.gameMode === 'pvp';
    const isBotMode = game.gameMode === 'bot';

    let loserUid = null;
    let loserName = null;
    let winnerUid = null;
    let winnerName = null;
    let subtitle = '';
    let allowedPlayers = [];

    if (isBotMode) {
      if (game.currentPlayer !== 'user') return;
      loserUid = game.player1;
      loserName = game.player1Name;
      winnerUid = 'bot';
      winnerName = 'Bot AI';
      subtitle = `${game.player1Name} vs Bot AI`;
      allowedPlayers = [game.player1];
    } else if (isPvp) {
      if (game.currentPlayer === 'player1') {
        loserUid = game.player1;
        loserName = game.player1Name;
        winnerUid = game.player2;
        winnerName = game.player2Name;
      } else {
        loserUid = game.player2;
        loserName = game.player2Name;
        winnerUid = game.player1;
        winnerName = game.player1Name;
      }
      subtitle = `${game.player1Name} vs ${game.player2Name}`;
      allowedPlayers = [game.player1, game.player2];
    } else {
      return;
    }

    startTurnCountdownReaction(game, threadId, type, `${threadId}`);

    game.turnTimer = setTimeout(() => {
      endGameByTimeout(game, loserUid, loserName, winnerUid, winnerName, subtitle, allowedPlayers)
        .catch((err) => console.error('Timeout end game error:', err?.message || err));
    }, TURN_TIME);
  }

  async function sendMenuImage() {
    try {
      const prof = profiles.getProfile(senderId) || { id: senderId, name: userName, coins: 0 };
      const buffer = createMenuImage(prof.name || userName, senderId, prof.coins || 0);
      const tempDir = path.join(__dirname, '../../cache');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const imagePath = path.join(tempDir, `caro_menu_${Date.now()}.png`);
      fs.writeFileSync(imagePath, buffer);
      const ready = await ensureFileReady(imagePath);
      if (!ready) { await send('❌ Lỗi khi chuẩn bị ảnh menu'); return; }
      await sendWithAutoDelete(api, threadId, type, { message: '📋 Hướng dẫn Cờ Caro ✨', attachments: [imagePath] });
      setTimeout(() => { try { fs.unlinkSync(imagePath); } catch {} }, AUTO_DELETE_TIME + 2000);
    } catch (error) {
      console.error('Error creating menu:', error);
      await send('❌ Lỗi khi tạo menu');
    }
  }

  let action = (args[0] || '').toLowerCase();
  if (action && /^\d+$/.test(action)) { args = ['move', action, ...args.slice(1)]; action = 'move'; }

  if (!action || action === 'help') return sendMenuImage();

  if (action === 'start') {
    let boardConfig = BOARD_SIZES.medium;
    const sizeArg = args[1]?.toLowerCase();
    if (sizeArg && BOARD_SIZES[sizeArg]) boardConfig = BOARD_SIZES[sizeArg];
    else if (sizeArg && (sizeArg === '9' || sizeArg === '9x9')) boardConfig = BOARD_SIZES.small;
    else if (sizeArg && (sizeArg === '15' || sizeArg === '15x15')) boardConfig = BOARD_SIZES.large;
    else if (sizeArg && (sizeArg === '19' || sizeArg === '19x19')) boardConfig = BOARD_SIZES.super;

    const newGame = {
      board: createBoard(boardConfig.size),
      boardSize: boardConfig.size,
      winLength: boardConfig.winLength,
      boardName: boardConfig.name,
      boardIcon: boardConfig.icon,
      currentPlayer: 'user',
      gameOver: false,
      winner: null,
      moves: 0,
      gameMode: 'bot',
      player1: senderId,
      player1Name: userName,
      player2: 'bot',
      player2Name: 'Bot AI'
    };
    
    gameStates.set(threadId, newGame);
    
    const startMsg = `🎮 ${userName} vs Bot AI\n${boardConfig.icon} ${boardConfig.name}\n🎯 Cần ${boardConfig.winLength} ô liên tiếp để thắng\n\n@${userName} đến lượt bạn\n💡 Gõ số ô muốn đánh (ví dụ: 45)\n💬 Reply số vào ảnh cũng được`;
    const mentions = buildMentions(userName, senderId, startMsg);
    setLastBoardIds(newGame, await sendBoardImage(newGame.board, boardConfig.size, `🎮 ${boardConfig.name}`, `${userName} vs Bot AI`, startMsg, { gameKey: `${threadId}`, allowedPlayers: [senderId], mentions }));
    startBurst60Icons(newGame, getBoardDestinationFromGame(newGame, `${threadId}`));
    scheduleTurnTimeout(newGame);
    return;
  }

  if (action === 'challenge' || action === 'pvp') {
    const currentGame = gameStates.get(threadId);
    if (currentGame && !currentGame.gameOver) { await send('❌ Đã có game đang chơi! Gõ "caro reset" trước'); return; }
    const pendingChallenge = pendingChallenges.get(threadId);
    if (pendingChallenge) { await send('⏳ Đã có thách đấu đang chờ!'); return; }

    let challengedId = null, challengedName = 'Người chơi';
    if (event.mentions && Object.keys(event.mentions).length > 0) {
      challengedId = Object.keys(event.mentions)[0];
      challengedName = event.mentions[challengedId];
    } else if (event.data?.mentions && Array.isArray(event.data.mentions) && event.data.mentions.length > 0) {
      challengedId = event.data.mentions[0].uid;
      try { const info = await api.getUserInfo(challengedId); challengedName = info?.changed_profiles?.[challengedId]?.displayName || 'Người chơi'; } catch { challengedName = 'Người chơi'; }
    } else if (event.quote && event.quote.uidFrom) {
      challengedId = event.quote.uidFrom;
      try { const info = await api.getUserInfo(challengedId); challengedName = info?.changed_profiles?.[challengedId]?.displayName || 'Người chơi'; } catch { challengedName = 'Người chơi'; }
    } else if (args[1] && /^\d+$/.test(args[1])) {
      challengedId = args[1];
      try { const info = await api.getUserInfo(challengedId); challengedName = info?.changed_profiles?.[challengedId]?.displayName || `User ${challengedId}`; } catch { challengedName = `User ${challengedId}`; }
    } else {
      await sendWithAutoDelete(api, threadId, type, { message: '❌ Phải tag người hoặc reply tin nhắn!\n\n💡 CÁCH DÙNG:\n• caro challenge @tên\n• Reply tin nhắn rồi gõ: caro challenge\n• Hoặc: caro challenge <ID>' });
      return;
    }

    if (challengedId === senderId) { await sendWithAutoDelete(api, threadId, type, { message: '❌ Không thể thách đấu chính mình!' }); return; }

    const boardSize = BOARD_SIZES.medium.size;
    const winLength = BOARD_SIZES.medium.winLength;
    const boardName = BOARD_SIZES.medium.name;

    pendingChallenges.set(threadId, { challenger: senderId, challenged: challengedId, challengerName: userName, challengedName, boardSize, winLength, boardName, timestamp: Date.now() });

    const msg = `⚔️ THÁCH ĐẤU!\n\n🎯 ${userName} thách @${challengedName}\n📏 ${boardName}\n🎯 ${winLength} ô liên tiếp\n\n✅ @${challengedName} gõ: caro accept\n❌ Hoặc: caro decline`;
    const challengeMentions = buildMentions(challengedName, challengedId, msg);
    await sendWithAutoDelete(api, threadId, type, { message: msg, mentions: challengeMentions });
    return;
  }

  if (action === 'accept') {
    const challenge = pendingChallenges.get(threadId);
    if (!challenge) { await sendWithAutoDelete(api, threadId, type, { message: '❌ Không có thách đấu nào!' }); return; }
    if (senderId !== challenge.challenged) { await sendWithAutoDelete(api, threadId, type, { message: `❌ Chỉ ${challenge.challengedName} mới accept được!` }); return; }

    pendingChallenges.delete(threadId);

    const newGame = {
      board: createBoard(challenge.boardSize),
      boardSize: challenge.boardSize,
      winLength: challenge.winLength,
      currentPlayer: 'player1',
      gameOver: false,
      winner: null,
      moves: 0,
      gameMode: 'pvp',
      player1: challenge.challenger,
      player1Name: challenge.challengerName,
      player2: challenge.challenged,
      player2Name: challenge.challengedName
    };

    gameStates.set(threadId, newGame);

    const startMsg = `🎮 ${challenge.challengerName} vs ${challenge.challengedName}\n🎯 Cần ${challenge.winLength} ô liên tiếp\n\n❌ ${challenge.challengerName} (Player 1)\n⭕ ${challenge.challengedName} (Player 2)\n\n@${challenge.challengerName} đến lượt bạn\n💡 Gõ số ô muốn đánh (ví dụ: 85)\n💬 Reply số vào ảnh cũng được`;
    const mentions = buildMentions(challenge.challengerName, challenge.challenger, startMsg);
    setLastBoardIds(newGame, await sendBoardImage(newGame.board, challenge.boardSize, challenge.boardName, `${challenge.challengerName} vs ${challenge.challengedName}`, startMsg, { gameKey: `${threadId}`, allowedPlayers: [challenge.challenger, challenge.challenged], mentions }));
    startBurst60Icons(newGame, getBoardDestinationFromGame(newGame, `${threadId}`));
    scheduleTurnTimeout(newGame);
    return;
  }

  if (action === 'decline') {
    const challenge = pendingChallenges.get(threadId);
    if (!challenge) { await sendWithAutoDelete(api, threadId, type, { message: '❌ Không có thách đấu nào!' }); return; }
    if (senderId !== challenge.challenged) { await sendWithAutoDelete(api, threadId, type, { message: `❌ Chỉ ${challenge.challengedName} mới decline được!` }); return; }
    pendingChallenges.delete(threadId);
    const declineMsg = `❌ @${challenge.challengerName} bị từ chối thách đấu!`;
    const declineMentions = buildMentions(challenge.challengerName, challenge.challenger, declineMsg);
    await sendWithAutoDelete(api, threadId, type, { message: declineMsg, mentions: declineMentions });
    return;
  }

  if (action === 'move' || action === 'm') {
    const game = gameStates.get(threadId);
    if (!game) { await sendWithAutoDelete(api, threadId, type, { message: '❌ Chưa có game! Gõ "caro start"' }); return; }
    if (game.gameOver) { await sendWithAutoDelete(api, threadId, type, { message: '✅ Game đã kết thúc! Gõ "caro start"' }); return; }

    const position = parseInt(args[1]);
    if (!position || position < 1 || position > game.boardSize * game.boardSize) { await sendWithAutoDelete(api, threadId, type, { message: `❌ Vị trí không hợp lệ!\n💡 Nhập số từ 1-${game.boardSize * game.boardSize}` }); return; }

    const index = position - 1;
    if (game.board[index] !== '⬜') { await sendWithAutoDelete(api, threadId, type, { message: '❌ Ô này đã có quân!' }); return; }

    if (game.gameMode === 'pvp') {
      if (game.currentPlayer === 'player1' && senderId !== game.player1) { await send(`❌ Lượt của ${game.player1Name}!`); return; }
      if (game.currentPlayer === 'player2' && senderId !== game.player2) { await send(`❌ Lượt của ${game.player2Name}!`); return; }
    } else {
      if (game.currentPlayer !== 'user') { await send('❌ Không phải lượt của bạn!'); return; }
    }

    clearTurnTimer(game);
    clearTurnCountdown(game);

    if (game.gameMode === 'pvp') game.board[index] = game.currentPlayer === 'player1' ? '❌' : '⭕';
    else game.board[index] = '❌';
    game.moves++;

    const userWin = checkWin(game.board, game.boardSize, game.winLength);
    if (userWin) {
      game.gameOver = true;
      game.winner = game.gameMode === 'pvp' ? (game.currentPlayer === 'player1' ? game.player1Name : game.player2Name) : userName;
      try {
        profiles.updateStats(senderId, 'caro', true);
        profiles.addCoins(senderId, 50);
        if (game.gameMode === 'pvp') { const loserId = game.currentPlayer === 'player1' ? game.player2 : game.player1; profiles.updateStats(loserId, 'caro', false); }
      } catch {}
      const mentionUid = game.gameMode === 'pvp'
        ? (game.currentPlayer === 'player1' ? game.player1 : game.player2)
        : senderId;
      const mentionName = game.gameMode === 'pvp'
        ? (game.currentPlayer === 'player1' ? game.player1Name : game.player2Name)
        : userName;
      const tagText = `@${mentionName}`;
      const winMsg = game.gameMode === 'pvp'
        ? `${tagText} THẮNG!\n\n💰 +50 coins\n🎯 ${game.moves} nước`
        : `${tagText} CHIẾN THẮNG!\n\n💰 +50 coins\n🎯 ${game.moves} nước`;
      const mentions = buildMentions(mentionName, mentionUid, winMsg);
      setLastBoardIds(game, await sendBoardImage(game.board, game.boardSize, game.boardName, `🏆 ${game.winner} thắng!`, winMsg, { gameKey: `${threadId}`, allowedPlayers: [game.player1, game.gameMode === 'pvp' ? game.player2 : senderId], mentions }));
      clearTurnTimer(game);
      clearTurnCountdown(game);
      clearBoardMessagesForGame(`${threadId}`);
      gameStates.delete(threadId);
      pendingChallenges.delete(threadId);
      return;
    }

    const isFull = game.board.every(cell => cell !== '⬜');
    if (isFull) {
      game.gameOver = true;
      setLastBoardIds(game, await sendBoardImage(game.board, game.boardSize, game.boardName, '🤝 Hòa!', '🤝 HÒA!\n\nBàn cờ đã đầy!', { gameKey: `${threadId}`, allowedPlayers: [game.player1, game.gameMode === 'pvp' ? game.player2 : senderId] }));
      clearTurnTimer(game);
      clearTurnCountdown(game);
      clearBoardMessagesForGame(`${threadId}`);
      gameStates.delete(threadId);
      pendingChallenges.delete(threadId);
      return;
    }

    if (game.gameMode === 'bot') {
      game.currentPlayer = 'bot';
      const botMove = getBotMove(game.board, game.boardSize, game.winLength);
      if (botMove !== -1) {
        game.board[botMove] = '⭕';
        game.moves++;
        const botWin = checkWin(game.board, game.boardSize, game.winLength);
        if (botWin) {
          game.gameOver = true;
          game.winner = 'Bot AI';
          try { profiles.updateStats(senderId, 'caro', false); } catch {}
          const loseMsg = `@${userName} THUA RỒI!\n\n🤖 BOT THẮNG!\n\n🎯 ${game.moves} nước`;
          const mentions = buildMentions(userName, senderId, loseMsg);
          setLastBoardIds(game, await sendBoardImage(game.board, game.boardSize, game.boardName, '🤖 Bot thắng!', loseMsg, { gameKey: `${threadId}`, allowedPlayers: [game.player1], mentions }));
          clearTurnTimer(game);
          clearTurnCountdown(game);
          clearBoardMessagesForGame(`${threadId}`);
          gameStates.delete(threadId);
          pendingChallenges.delete(threadId);
          return;
        }
        const isFull2 = game.board.every(cell => cell !== '⬜');
        if (isFull2) {
          game.gameOver = true;
          setLastBoardIds(game, await sendBoardImage(game.board, game.boardSize, game.boardName, '🤝 Hòa!', '🤝 HÒA!\n\nBàn cờ đã đầy!', { gameKey: `${threadId}`, allowedPlayers: [game.player1] }));
          clearTurnTimer(game);
          clearTurnCountdown(game);
          clearBoardMessagesForGame(`${threadId}`);
          gameStates.delete(threadId);
          pendingChallenges.delete(threadId);
          return;
        }
        game.currentPlayer = 'user';
        const turnMsg = `🤖 Bot đánh ô ${botMove + 1}\n\n@${userName} đến lượt bạn\n💬 Có thể reply số vào ảnh`;
        const mentions = buildMentions(userName, senderId, turnMsg);
        setLastBoardIds(game, await sendBoardImage(
          game.board,
          game.boardSize,
          game.boardName,
          `${userName} vs Bot AI`,
          turnMsg,
          { gameKey: `${threadId}`, allowedPlayers: [game.player1], mentions }
        ));
        scheduleTurnTimeout(game);
        return;
      }
    } else {
      game.currentPlayer = game.currentPlayer === 'player1' ? 'player2' : 'player1';
      const nextPlayer = game.currentPlayer === 'player1' ? game.player1Name : game.player2Name;
      const nextSymbol = game.currentPlayer === 'player1' ? '❌' : '⭕';
      const nextUid = game.currentPlayer === 'player1' ? game.player1 : game.player2;
      const turnMsg = `${nextSymbol} @${nextPlayer} đến lượt bạn\n💬 Có thể reply số vào ảnh`;
      const mentions = buildMentions(nextPlayer, nextUid, turnMsg);
      setLastBoardIds(game, await sendBoardImage(game.board, game.boardSize, game.boardName, `${game.player1Name} vs ${game.player2Name}`, turnMsg, { gameKey: `${threadId}`, allowedPlayers: [game.player1, game.player2], mentions }));
      scheduleTurnTimeout(game);
      return;
    }
  }

  if (action === 'status') {
    const game = gameStates.get(threadId);
    if (!game) return send('❌ Chưa có game nào!');
    const subtitle = game.gameMode === 'pvp' ? `${game.player1Name} vs ${game.player2Name}` : `${game.player1Name} vs Bot AI`;
    let statusMsg = `📊 Trạng thái:\n`;
    statusMsg += `🎮 Chế độ: ${game.gameMode === 'pvp' ? 'PvP' : 'Bot'}\n`;
    statusMsg += `🎯 Nước đi: ${game.moves}\n`;
    if (game.gameOver) statusMsg += `✅ Kết thúc: ${game.winner || 'Hòa'}`;
    else statusMsg += game.gameMode === 'pvp' ? `⏳ Lượt: ${game.currentPlayer === 'player1' ? game.player1Name : game.player2Name}` : `⏳ Lượt: ${game.currentPlayer === 'user' ? 'Bạn' : 'Bot'}`;
    return sendBoardImage(game.board, game.boardSize, game.boardName, subtitle, statusMsg);
  }

  if (action === 'reset') {
    const game = gameStates.get(threadId);
    if (!game) return send('❌ Không có game nào để reset!');
    clearTurnTimer(game);
    clearTurnCountdown(game);
    gameStates.delete(threadId);
    pendingChallenges.delete(threadId);
    return send('♻️ Game đã được reset!\n💡 Gõ "caro start" để chơi lại');
  }

  if (action === 'leaderboard' || action === 'lb') {
    try {
      const lb = leaderboard.getLeaderboard('caro', 10);
      if (!lb || lb.length === 0) return send('📊 Chưa có dữ liệu bảng xếp hạng!');
      let msg = '🏆 BẢNG XẾP HẠNG CỜ CARO\n\n';
      lb.forEach((entry, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const winRate = entry.total > 0 ? ((entry.wins / entry.total) * 100).toFixed(1) : '0.0';
        msg += `${medal} ${entry.name}\n   📊 ${entry.wins}W-${entry.losses}L (${winRate}%)\n\n`;
      });
      return send(msg.trim());
    } catch (error) {
      console.error('Leaderboard error:', error);
      return send('❌ Lỗi khi lấy bảng xếp hạng');
    }
  }

  return send('❌ Lệnh không hợp lệ!\n💡 Gõ "caro help" để xem hướng dẫn');
};
