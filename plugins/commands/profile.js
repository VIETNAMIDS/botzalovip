// Profile command: manage and show user profile
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const profiles = require('../shared/profiles');
let userProfile = null;
try { userProfile = require('./userProfile.js'); } catch { userProfile = (global.userProfile || global.userProfileHelper) || null; }

function fmtNum(n) { try { return Number(n||0).toLocaleString('vi-VN'); } catch { return String(n||0); } }
function ts(d) { try { return new Date(d||Date.now()).toLocaleString('vi-VN'); } catch { return String(d||''); } }

// Tạo ảnh profile canvas - Modern Design
async function createProfileImage(profileData, avatarUrl) {
  const width = 1400;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient đẹp hơn
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(0.5, '#1e293b');
  bgGradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Pattern overlay tinh tế
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let i = 0; i < width; i += 40) {
    for (let j = 0; j < height; j += 40) {
      ctx.fillRect(i, j, 20, 20);
    }
  }

  // Helper: Draw rounded rectangle
  function roundRect(x, y, w, h, r) {
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

  // Header section - Modern style
  const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
  headerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
  headerGradient.addColorStop(0.5, 'rgba(147, 51, 234, 0.2)');
  headerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.2)');
  
  roundRect(40, 40, width - 80, 140, 20);
  ctx.fillStyle = headerGradient;
  ctx.fill();
  
  // Header border gradient
  roundRect(40, 40, width - 80, 140, 20);
  const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
  borderGradient.addColorStop(0, '#3b82f6');
  borderGradient.addColorStop(0.5, '#9333ea');
  borderGradient.addColorStop(1, '#ec4899');
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Avatar section - Left side của header
  const avatarSize = 100;
  const avatarX = 70;
  const avatarY = 60;
  
  try {
    if (avatarUrl) {
      const avatar = await loadImage(avatarUrl);
      
      // Draw avatar with circular clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
      
      // Avatar border với gradient
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 + 3, 0, Math.PI * 2);
      ctx.strokeStyle = borderGradient;
      ctx.lineWidth = 4;
      ctx.stroke();
      
      // Glow effect cho avatar
      ctx.shadowColor = '#3b82f6';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  } catch (e) {
    // Nếu không load được avatar, vẽ placeholder
    ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('👤', avatarX + avatarSize/2, avatarY + avatarSize/2 + 15);
  }

  // Title với shadow đẹp - Dời sang phải để tránh avatar
  ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('HỒ SƠ NGƯỜI CHƠI', width / 2 + 50, 100);
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Player info với màu sắc
  ctx.font = 'bold 28px Arial';
  const yInfo = 145;
  
  // Name
  ctx.fillStyle = '#60a5fa';
  const nameText = profileData.name;
  const nameWidth = ctx.measureText(nameText).width;
  
  // ID
  ctx.fillStyle = '#a78bfa';
  const idText = ` • ID: ${profileData.uid}`;
  const idWidth = ctx.measureText(idText).width;
  
  // Time
  ctx.fillStyle = '#f472b6';
  const timeText = ` • ${ts(profileData.updatedAt)}`;
  
  const totalWidth = nameWidth + idWidth + ctx.measureText(timeText).width;
  const startX = (width - totalWidth) / 2;
  
  ctx.fillStyle = '#60a5fa';
  ctx.fillText(nameText, startX + nameWidth/2, yInfo);
  
  ctx.fillStyle = '#a78bfa';
  ctx.fillText(idText, startX + nameWidth + idWidth/2, yInfo);
  
  ctx.fillStyle = '#f472b6';
  ctx.fillText(timeText, startX + nameWidth + idWidth + ctx.measureText(timeText).width/2, yInfo);

  // Helper: Draw modern stat card
  function drawModernCard(title, stats, xPos, yPos, cardWidth, accentColor) {
    const cardHeight = 80 + (stats.length * 42);
    const padding = 25;
    
    // Card background với gradient
    const cardGradient = ctx.createLinearGradient(xPos, yPos, xPos, yPos + cardHeight);
    cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
    cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
    
    roundRect(xPos, yPos, cardWidth, cardHeight, 15);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    // Card border với accent color
    roundRect(xPos, yPos, cardWidth, cardHeight, 15);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    // Glow effect cho border
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 15;
    roundRect(xPos, yPos, cardWidth, cardHeight, 15);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Title bar
    const titleBarHeight = 55;
    ctx.save();
    roundRect(xPos, yPos, cardWidth, titleBarHeight, 15);
    ctx.clip();
    
    const titleGradient = ctx.createLinearGradient(xPos, yPos, xPos + cardWidth, yPos);
    titleGradient.addColorStop(0, accentColor + '40');
    titleGradient.addColorStop(1, accentColor + '10');
    ctx.fillStyle = titleGradient;
    ctx.fillRect(xPos, yPos, cardWidth, titleBarHeight);
    ctx.restore();
    
    // Title text
    ctx.textAlign = 'left';
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 32px Arial';
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 10;
    ctx.fillText(title, xPos + padding, yPos + 38);
    ctx.shadowBlur = 0;
    
    // Stats
    ctx.font = '24px Arial';
    stats.forEach((stat, i) => {
      const yOffset = yPos + titleBarHeight + 35 + (i * 42);
      
      // Bullet point
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(xPos + padding, yOffset - 7, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Stat text
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(stat, xPos + padding + 20, yOffset);
    });
    
    return cardHeight;
  }

  // Layout cards
  const startY = 220;
  const gap = 30;
  const cardWidth = (width - 120) / 2;
  
  let leftY = startY;
  let rightY = startY;
  const leftX = 40;
  const rightX = width / 2 + 20;

  // Boss card
  const boss = profileData.games?.boss || {};
  const bossStats = [
    `Thắng: ${fmtNum(boss.wins||0)} trận • Cấp độ: ${fmtNum(boss.level||1)}`,
    `Tier cao nhất: ${boss.bestTier||'I'}`,
    `Xu kiếm được: ${fmtNum(boss.coinsEarned||0)}`,
    `Chơi lần cuối: ${boss.lastPlayed ? ts(boss.lastPlayed) : 'Chưa chơi'}`
  ];
  const bossHeight = drawModernCard('🎮 BOSS BATTLE', bossStats, leftX, leftY, cardWidth, '#ef4444');
  leftY += bossHeight + gap;

  // Caro card
  const caro = profileData.games?.caro || {};
  const caroStats = [
    `Thắng: ${fmtNum(caro.wins||0)} • Thua: ${fmtNum(caro.losses||0)} • Hòa: ${fmtNum(caro.draws||0)}`,
    `Tỷ lệ thắng: ${caro.wins ? ((caro.wins/(caro.wins+caro.losses+caro.draws))*100).toFixed(1) : 0}%`,
    `Chơi lần cuối: ${caro.lastPlayed ? ts(caro.lastPlayed) : 'Chưa chơi'}`
  ];
  const caroHeight = drawModernCard('⭕ CARO BATTLE', caroStats, rightX, rightY, cardWidth, '#10b981');
  rightY += caroHeight + gap;

  // Fishing card
  const fish = profileData.games?.fishing || {};
  const fishStats = [
    `Cấp độ: ${fmtNum(fish.level||1)} • Kinh nghiệm: ${fmtNum(fish.exp||0)}`,
    `Xu hiện có: ${fmtNum(fish.coins||0)}`,
    `Huyền thoại: ${fmtNum(fish.legendary||0)} • Quý hiếm: ${fmtNum(fish.rare||0)}`,
    `Chơi lần cuối: ${fish.lastPlayed ? ts(fish.lastPlayed) : 'Chưa chơi'}`
  ];
  const fishHeight = drawModernCard('🎣 FISHING', fishStats, leftX, leftY, cardWidth, '#06b6d4');
  leftY += fishHeight + gap;

  // Casino card
  const casino = profileData.games?.casino || {};
  const casinoStats = [];
  if (casino.taixiu) {
    casinoStats.push(`Tài Xỉu: ${fmtNum(casino.taixiu.wins||0)}T-${fmtNum(casino.taixiu.losses||0)}T • Jackpot: ${fmtNum(casino.taixiu.jackpots||0)}`);
  }
  if (casino.blackjack) {
    casinoStats.push(`Blackjack: ${fmtNum(casino.blackjack.wins||0)}T-${fmtNum(casino.blackjack.losses||0)}T`);
  }
  if (casino.poker) {
    casinoStats.push(`Poker: ${fmtNum(casino.poker.wins||0)}T-${fmtNum(casino.poker.losses||0)}T`);
  }
  if (casino.roulette) {
    casinoStats.push(`Roulette: ${fmtNum(casino.roulette.wins||0)}T-${fmtNum(casino.roulette.losses||0)}T`);
  }
  
  if (casinoStats.length === 0) {
    casinoStats.push('Chưa có dữ liệu');
  }
  
  drawModernCard('🎰 CASINO', casinoStats, rightX, rightY, cardWidth, '#f59e0b');

  // Footer với style hiện đại
  const footerY = height - 70;
  const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
  footerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
  footerGradient.addColorStop(0.5, 'rgba(147, 51, 234, 0.15)');
  footerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
  
  roundRect(40, footerY, width - 80, 50, 15);
  ctx.fillStyle = footerGradient;
  ctx.fill();
  
  roundRect(40, footerY, width - 80, 50, 15);
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Footer text
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.font = '22px Arial';
  ctx.fillText('BONZ MAI ĐẸP TRAI - 0785000270', width / 2, footerY + 33);

  return canvas.toBuffer('image/png');
}

module.exports.config = {
  name: 'profile',
  version: '3.0.0',
  role: 0,
  author: 'Bonz',
  description: 'Xem hồ sơ người chơi - Modern UI Design',
  category: 'Hệ thống',
  usage: 'profile [create [tên]|setname <tén>|@tag|uid|help]',
  cooldowns: 3
};

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  let targetId = event?.data?.uidFrom || event?.authorId;
  let targetName = 'Người chơi';

  const action = (args[0]||'').toLowerCase();
  if (action === 'help') {
    return api.sendMessage(
      [
        '📇 PROFILE - Hồ sơ người chơi',
        '',
        '• profile create [tên]   → Tạo hồ sơ (lần đầu bắt buộc để chơi game)',
        '• profile setname <tên>  → Đổi tên hồ sơ',
        '• profile                → Xem hồ sơ của bạn',
        '• profile @tag           → Xem hồ sơ người được tag',
        '• profile <uid>          → Xem hồ sơ theo UID',
      ].join('\n'), threadId, type
    );
  }

  // Create profile
  if (action === 'create') {
    const nameArg = args.slice(1).join(' ').trim();
    const prof = profiles.ensureProfile(targetId, nameArg || null);
    return api.sendMessage(`✅ Đã tạo hồ sơ cho m: ${prof.name}\n🆔 UID: ${prof.id}`, threadId, type);
  }

  // Set display name
  if (action === 'setname' && args[1]) {
    const newName = args.slice(1).join(' ').trim();
    if (!profiles.hasProfile(targetId)) {
      profiles.ensureProfile(targetId, newName);
      return api.sendMessage(`✅ Đã tạo hồ sơ và đặt tên: ${newName}`, threadId, type);
    }
    const ok = profiles.setProfileName(targetId, newName);
    return api.sendMessage(ok ? `✅ Đã đổi tên hồ sơ: ${newName}` : '❌ Đổi tên thất bại.', threadId, type);
  }

  // Resolve target by mention or uid
  try {
    if (event.mentions && Object.keys(event.mentions).length > 0) {
      targetId = Object.keys(event.mentions)[0];
      targetName = event.mentions[targetId];
    } else if (args[0] && /^\d+$/.test(args[0])) {
      targetId = String(args[0]);
    }
  } catch {}

  // Try read display name and avatar
  let avatarUrl = null;
  try {
    const info = await api.getUserInfo(targetId);
    targetName = info?.changed_profiles?.[targetId]?.displayName || targetName;
    avatarUrl = info?.changed_profiles?.[targetId]?.avatar || info?.avatar || null;
  } catch {}

  // Load profile (shared store)
  let base = profiles.getProfile(targetId);
  if (!base) {
    return api.sendMessage('⚠️ M chưa có hồ sơ. Gõ: profile create <tên> để tạo, rồi chơi game nhé.', threadId, type);
  }

  // Optionally augment with aggregated game stats if available
  let p = base;
  try {
    if (userProfile && typeof userProfile.get === 'function') {
      const agg = userProfile.get(targetId, base.name || targetName) || {};
      // Ưu tiên tên Zalo nếu base.name là ID
      const displayName = (base.name && base.name !== targetId) ? base.name : targetName;
      p = Object.assign({ uid: base.id, name: displayName, updatedAt: base.createdAt }, agg);
    } else {
      const displayName = (base.name && base.name !== targetId) ? base.name : targetName;
      p = { uid: base.id, name: displayName, updatedAt: base.createdAt, games: {} };
    }
  } catch {}

  // Tạo ảnh profile với avatar từ Zalo
  const buffer = await createProfileImage(p, avatarUrl);
  const tempDir = path.join(__dirname, '../../cache');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const imagePath = path.join(tempDir, `profile_${Date.now()}.png`);
  fs.writeFileSync(imagePath, buffer);

  await api.sendMessage({
    msg: '📇 Hồ sơ người chơi',
    attachments: [imagePath]
  }, threadId, type);

  setTimeout(() => {
    try {
      fs.unlinkSync(imagePath);
    } catch (e) {}
  }, 5000);
};