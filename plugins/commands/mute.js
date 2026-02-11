const fs = require("fs").promises;
const { createCanvas, loadImage } = require("canvas");

module.exports.config = {
  name: "mute",
  version: "2.0.0",
  role: 1,
  author: "Cascade + Premium Design",
  description: "Cấm chat thành viên với thiết kế premium",
  category: "Nhóm",
  usage: "mute @user <thời_gian> | mute all <thời_gian> | mute unmute all | mute help\nVí dụ: mute @user 10m | mute all 1h | mute unmute all",
  cooldowns: 2,
  dependencies: {
    "canvas": ""
  }
};

const PERMANENT_MUTE = -1; // vĩnh viễn
function nowSec() { return Math.floor(Date.now() / 1000); }
function formatSeconds(sec) {
  if (sec === PERMANENT_MUTE) return 'vô thời hạn';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}
function parseTime(input) {
  if (!input) return PERMANENT_MUTE;
  const txt = String(input).trim().toLowerCase();
  if (['perma','perm','permanent','vĩnh','vinh','forever','∞','-1'].includes(txt)) return PERMANENT_MUTE;
  const match = txt.match(/^(\d+)(s|m|h)?$/);
  if (!match) return PERMANENT_MUTE;
  const value = parseInt(match[1]);
  const unit = match[2] || 's';
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    default: return value;
  }
}

// === HELPER DRAWING FUNCTIONS ===
function createPremiumBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Particles
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGlassCard(ctx, x, y, w, h, radius) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// === CREATE MUTE IMAGE ===
async function createMuteImage(users, duration, isMuteAll = false) {
  const canvas = createCanvas(1400, 950);
  const ctx = canvas.getContext('2d');
  const centerX = 700;

  // Enhanced background with red tint
  const gradient = ctx.createLinearGradient(0, 0, 1400, 950);
  gradient.addColorStop(0, '#2d1b1e');
  gradient.addColorStop(0.5, '#1e1b2d');
  gradient.addColorStop(1, '#1b1e2d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1400, 950);

  // Animated circles với red theme
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = i % 2 === 0 ? '#ef4444' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(200 + i * 100, 200 + (i % 3) * 250, 80 + i * 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Main card với red accent
  const mainCardWidth = 1100;
  const mainCardX = (1400 - mainCardWidth) / 2;
  
  // Card glow effect
  ctx.save();
  ctx.shadowColor = 'rgba(239, 68, 68, 0.3)';
  ctx.shadowBlur = 40;
  drawGlassCard(ctx, mainCardX, 80, mainCardWidth, 790, 40);
  ctx.restore();

  // Warning strips ở góc
  ctx.save();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
  ctx.beginPath();
  ctx.moveTo(mainCardX, 80);
  ctx.lineTo(mainCardX + 200, 80);
  ctx.lineTo(mainCardX, 280);
  ctx.closePath();
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(mainCardX + mainCardWidth, 80);
  ctx.lineTo(mainCardX + mainCardWidth - 200, 80);
  ctx.lineTo(mainCardX + mainCardWidth, 280);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Large warning icon với animation effect
  ctx.save();
  const iconY = 220;
  
  // Outer pulse rings
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(239, 68, 68, ${0.2 - i * 0.06})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, iconY, 80 + i * 25, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Main red circle với gradient
  const iconGradient = ctx.createRadialGradient(centerX, iconY, 0, centerX, iconY, 80);
  iconGradient.addColorStop(0, '#f87171');
  iconGradient.addColorStop(1, '#dc2626');
  ctx.fillStyle = iconGradient;
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(centerX, iconY, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // Octagon warning border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  const sides = 8;
  const radius = 85;
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = iconY + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  
  // Mute icon emoji style (lớn hơn)
  ctx.font = 'bold 80px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔇', centerX, iconY);
  
  ctx.restore();

  // Title với style mạnh mẽ hơn
  ctx.save();
  ctx.font = 'bold 52px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
  ctx.shadowBlur = 25;
  ctx.fillText(isMuteAll ? 'CẤM CHAT TẤT CẢ' : 'CẤM CHAT', centerX, 360);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Subtitle badge
  const subtitleText = isMuteAll ? 'Toàn bộ thành viên trong nhóm' : `${users.length} thành viên bị hạn chế`;
  ctx.font = '30px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText(subtitleText, centerX, 410);

  // User list với cards đẹp hơn
  let currentY = 480;
  if (!isMuteAll && users.length > 0) {
    const displayUsers = users.slice(0, 4);
    const cardWidth = 800;
    const cardX = (1400 - cardWidth) / 2;
    
    displayUsers.forEach((user, i) => {
      // User card
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.lineWidth = 2;
      ctx.roundRect(cardX, currentY, cardWidth, 50, 15);
      ctx.fill();
      ctx.stroke();
      
      // User name
      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${user.name}`, cardX + 30, currentY + 32);
      
      // Red dot indicator
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cardX + cardWidth - 30, currentY + 25, 8, 0, Math.PI * 2);
      ctx.fill();
      
      currentY += 60;
    });
    
    if (users.length > 4) {
      ctx.font = 'bold 26px Arial';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.textAlign = 'center';
      ctx.fillText(`+${users.length - 4} người khác...`, centerX, currentY + 10);
      currentY += 50;
    } else {
      currentY += 10;
    }
  } else {
    currentY += 30;
  }

  // Duration badge với design mạnh mẽ
  const durationText = duration === PERMANENT_MUTE ? '∞ VÔ THỜI HẠN' : formatSeconds(duration).toUpperCase();
  const badgeWidth = 450;
  const badgeX = (1400 - badgeWidth) / 2;
  
  // Badge glow
  ctx.save();
  ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
  ctx.shadowBlur = 30;
  
  const badgeGradient = ctx.createLinearGradient(badgeX, currentY, badgeX + badgeWidth, currentY);
  badgeGradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
  badgeGradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.3)');
  badgeGradient.addColorStop(1, 'rgba(239, 68, 68, 0.2)');
  ctx.fillStyle = badgeGradient;
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
  ctx.lineWidth = 3;
  ctx.roundRect(badgeX, currentY, badgeWidth, 85, 25);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  
  // Time icon
  ctx.font = 'bold 40px Arial';
  ctx.fillStyle = '#ef4444';
  ctx.textAlign = 'center';
  ctx.fillText('⏱️', centerX, currentY + 30);
  
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(durationText, centerX, currentY + 65);

  // Footer
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.textAlign = 'center';
  ctx.fillText('💫 BONZ MÃI VIP 💫', centerX, 900);

  return canvas.toBuffer('image/png');
}

// === CREATE MUTE HELP IMAGE ===
async function createMuteHelpImage() {
  const canvas = createCanvas(1400, 1100);
  const ctx = canvas.getContext('2d');
  const centerX = 700;

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 1400, 1100);
  gradient.addColorStop(0, '#2d1b1e');
  gradient.addColorStop(0.5, '#1e1b2d');
  gradient.addColorStop(1, '#1b1e2d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1400, 1100);

  // Decorative circles
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = i % 2 === 0 ? '#ef4444' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(150 + i * 120, 180 + (i % 3) * 280, 70 + i * 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Main card
  const mainCardWidth = 1100;
  const mainCardX = (1400 - mainCardWidth) / 2;
  
  ctx.save();
  ctx.shadowColor = 'rgba(239, 68, 68, 0.3)';
  ctx.shadowBlur = 40;
  drawGlassCard(ctx, mainCardX, 70, mainCardWidth, 960, 40);
  ctx.restore();

  // Header icon
  ctx.save();
  const iconY = 160;
  
  // Icon background
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(centerX, iconY, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  ctx.font = 'bold 70px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔇', centerX, iconY);
  ctx.restore();

  // Title
  ctx.font = 'bold 55px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
  ctx.shadowBlur = 20;
  ctx.fillText('Hướng Dẫn Cấm Chat', centerX, 270);
  ctx.shadowBlur = 0;

  // Subtitle
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText('Lệnh Mute', centerX, 315);

  let currentY = 380;
  const cardWidth = 900;
  const cardX = (1400 - cardWidth) / 2;

  // Command section 1: Mute user
  ctx.save();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.lineWidth = 2;
  ctx.roundRect(cardX, currentY, cardWidth, 110, 20);
  ctx.fill();
  ctx.stroke();
  
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.textAlign = 'center';
  ctx.fillText('📌 CẤM CHAT THÀNH VIÊN', centerX, currentY + 35);
  
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#ef4444';
  ctx.fillText('mute @user <thời_gian>', centerX, currentY + 75);
  ctx.restore();

  // Examples for mute user
  currentY += 130;
  const examples1 = [
    'mute @user 10m',
    'mute @user1 @user2 1h',
    'mute @user perma'
  ];

  examples1.forEach((example) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.roundRect(cardX, currentY, cardWidth, 50, 12);
    ctx.fill();
    ctx.stroke();

    ctx.font = '26px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(example, centerX, currentY + 32);
    currentY += 58;
  });

  // Command section 2: Mute all
  currentY += 15;
  ctx.save();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.lineWidth = 2;
  ctx.roundRect(cardX, currentY, cardWidth, 110, 20);
  ctx.fill();
  ctx.stroke();
  
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.textAlign = 'center';
  ctx.fillText('🚫 CẤM CHAT TẤT CẢ', centerX, currentY + 35);
  
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#ef4444';
  ctx.fillText('mute all <thời_gian>', centerX, currentY + 75);
  ctx.restore();

  // Examples for mute all
  currentY += 130;
  const examples2 = [
    'mute all 30m',
    'mute all 2h'
  ];

  examples2.forEach((example) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.roundRect(cardX, currentY, cardWidth, 50, 12);
    ctx.fill();
    ctx.stroke();

    ctx.font = '26px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(example, centerX, currentY + 32);
    currentY += 58;
  });

  // Command section 3: Unmute all
  currentY += 15;
  ctx.save();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
  ctx.lineWidth = 2;
  ctx.roundRect(cardX, currentY, cardWidth, 110, 20);
  ctx.fill();
  ctx.stroke();
  
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.textAlign = 'center';
  ctx.fillText('✅ MỞ KHÓA CHAT TẤT CẢ', centerX, currentY + 35);
  
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#10b981';
  ctx.fillText('mute unmute all', centerX, currentY + 75);
  ctx.restore();

  // Info note
  currentY += 140;
  ctx.save();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
  ctx.lineWidth = 2;
  ctx.roundRect(cardX, currentY, cardWidth, 70, 20);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 25px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('⏱️ Thời gian: 10s, 5m, 2h hoặc perma (vô thời hạn)', centerX, currentY + 42);
  ctx.restore();

  // Footer
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillText('💫 BONZ MÃI VIP 💫', centerX, 1060);

  return canvas.toBuffer('image/png');
}

// === CREATE UNMUTE ALL IMAGE ===
async function createUnmuteAllImage() {
  const canvas = createCanvas(1400, 900);
  const ctx = canvas.getContext('2d');
  const centerX = 700;

  // Background with green tint
  const gradient = ctx.createLinearGradient(0, 0, 1400, 900);
  gradient.addColorStop(0, '#1b2e1e');
  gradient.addColorStop(0.5, '#1b2d1e');
  gradient.addColorStop(1, '#1e2d1b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1400, 900);

  // Decorative circles với green theme
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = i % 2 === 0 ? '#10b981' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(200 + i * 100, 200 + (i % 3) * 250, 80 + i * 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Main card với green accent
  const mainCardWidth = 1100;
  const mainCardX = (1400 - mainCardWidth) / 2;
  
  ctx.save();
  ctx.shadowColor = 'rgba(16, 185, 129, 0.3)';
  ctx.shadowBlur = 40;
  drawGlassCard(ctx, mainCardX, 100, mainCardWidth, 700, 40);
  ctx.restore();

  // Success strips ở góc
  ctx.save();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.beginPath();
  ctx.moveTo(mainCardX, 100);
  ctx.lineTo(mainCardX + 200, 100);
  ctx.lineTo(mainCardX, 300);
  ctx.closePath();
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(mainCardX + mainCardWidth, 100);
  ctx.lineTo(mainCardX + mainCardWidth - 200, 100);
  ctx.lineTo(mainCardX + mainCardWidth, 300);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Success icon
  ctx.save();
  const iconY = 250;
  
  // Outer pulse rings
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(16, 185, 129, ${0.2 - i * 0.06})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, iconY, 80 + i * 25, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Main green circle với gradient
  const iconGradient = ctx.createRadialGradient(centerX, iconY, 0, centerX, iconY, 80);
  iconGradient.addColorStop(0, '#34d399');
  iconGradient.addColorStop(1, '#059669');
  ctx.fillStyle = iconGradient;
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(centerX, iconY, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // Checkmark
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(centerX - 30, iconY);
  ctx.lineTo(centerX - 10, iconY + 25);
  ctx.lineTo(centerX + 35, iconY - 25);
  ctx.stroke();
  
  ctx.restore();

  // Title
  ctx.save();
  ctx.font = 'bold 52px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
  ctx.shadowBlur = 25;
  ctx.fillText('ĐÃ MỞ KHÓA CHAT', centerX, 390);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Subtitle
  ctx.font = '32px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillText('Tất cả thành viên', centerX, 450);

  // Description
  ctx.font = '28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText('Mọi người đã có thể chat bình thường', centerX, 520);

  // Success badge
  const badgeWidth = 450;
  const badgeX = (1400 - badgeWidth) / 2;
  const badgeY = 580;
  
  ctx.save();
  ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';
  ctx.shadowBlur = 30;
  
  const badgeGradient = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeWidth, badgeY);
  badgeGradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
  badgeGradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.3)');
  badgeGradient.addColorStop(1, 'rgba(16, 185, 129, 0.2)');
  ctx.fillStyle = badgeGradient;
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
  ctx.lineWidth = 3;
  ctx.roundRect(badgeX, badgeY, badgeWidth, 85, 25);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  
  ctx.font = 'bold 40px Arial';
  ctx.fillStyle = '#10b981';
  ctx.textAlign = 'center';
  ctx.fillText('✅', centerX, badgeY + 28);
  
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('CHAT ĐÃ ĐƯỢC MỞ', centerX, badgeY + 62);

  // Footer
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillText('💫 BONZ MÃI VIP 💫', centerX, 820);

  return canvas.toBuffer('image/png');
}

module.exports.run = async ({ api, event, args, Threads }) => {
  const { threadId, type, data } = event;
  const mentions = data?.mentions || [];

  // Check help command
  const firstArg = (args[0] || '').toLowerCase();
  if (firstArg === 'help' || firstArg === 'h') {
    try {
      const imageBuffer = await createMuteHelpImage();
      const imageFileName = `mute_help_${Date.now()}.png`;
      await fs.writeFile(imageFileName, imageBuffer);
      
      await api.sendMessage({
        msg: '📖 Hướng dẫn sử dụng lệnh Mute',
        attachments: [imageFileName]
      }, threadId, type);
      
      setTimeout(async () => {
        try { await fs.unlink(imageFileName); } catch (_) {}
      }, 30000);
      return;
    } catch (error) {
      console.error('Lỗi tạo ảnh help:', error);
      return api.sendMessage(
        '📖 HƯỚNG DẪN LỆNH MUTE\n\n' +
        '1️⃣ Cấm chat thành viên:\nmute @user <thời_gian>\nVD: mute @user 10m\n\n' +
        '2️⃣ Cấm chat tất cả:\nmute all <thời_gian>\nVD: mute all 1h\n\n' +
        '3️⃣ Mở khóa tất cả:\nmute unmute all\n\n' +
        '⏱️ Thời gian: 10s, 5m, 2h hoặc perma (vô thời hạn)',
        threadId,
        type
      );
    }
  }

  // Check unmute all command
  if (firstArg === 'unmute') {
    const secondArg = (args[1] || '').toLowerCase();
    if (secondArg === 'all') {
      try {
        const thread = await Threads.getData(threadId);
        const tData = thread?.data || {};
        
        // Xóa mute all
        if (tData.muteList) {
          delete tData.muteList['-1'];
          await Threads.setData(threadId, tData);
        }
        
        // Tạo ảnh
        try {
          const imageBuffer = await createUnmuteAllImage();
          const imageFileName = `unmute_all_${Date.now()}.png`;
          await fs.writeFile(imageFileName, imageBuffer);
          
          await api.sendMessage({
            msg: '✅ Đã mở khóa chat cho tất cả',
            attachments: [imageFileName]
          }, threadId, type);
          
          setTimeout(async () => {
            try { await fs.unlink(imageFileName); } catch (_) {}
          }, 30000);
          return;
        } catch (imgError) {
          console.error('Lỗi tạo ảnh unmute:', imgError);
          return api.sendMessage('✅ Đã mở khóa chat cho tất cả thành viên', threadId, type);
        }
      } catch (err) {
        return api.sendMessage(`❌ Không thể unmute: ${err?.message || err}`, threadId, type);
      }
    }
  }

  try {
    // Lấy dữ liệu nhóm
    const thread = await Threads.getData(threadId);
    const tData = thread?.data || {};
    tData.muteList = tData.muteList || {};

    // Trường hợp mute all
    if ((args[0] || '').toLowerCase() === 'all') {
      const duration = parseTime(args[1]);
      const expires = duration === PERMANENT_MUTE ? PERMANENT_MUTE : nowSec() + duration;
      tData.muteList['-1'] = { name: 'All Users', timeMute: expires };
      await Threads.setData(threadId, tData);
      
      // Tạo ảnh
      try {
        const imageBuffer = await createMuteImage([], duration, true);
        const imageFileName = `mute_all_${Date.now()}.png`;
        await fs.writeFile(imageFileName, imageBuffer);
        
        await api.sendMessage({
          msg: '🚫 Đã cấm chat tất cả thành viên',
          attachments: [imageFileName]
        }, threadId, type);
        
        setTimeout(async () => {
          try { await fs.unlink(imageFileName); } catch (_) {}
        }, 30000);
        return;
      } catch (imgError) {
        console.error('Lỗi tạo ảnh mute:', imgError);
        const msg = duration === PERMANENT_MUTE
          ? '✅ Đã cấm chat tất cả thành viên: vô thời hạn'
          : `✅ Đã cấm chat tất cả thành viên: ${formatSeconds(duration)}`;
        return api.sendMessage(msg, threadId, type);
      }
    }

    // Mute theo mentions
    if (!mentions.length) {
      return api.sendMessage('⚠️ Vui lòng tag người cần cấm hoặc dùng: mute all <thời_gian>', threadId, type);
    }

    const duration = parseTime(args[0]);
    const expires = duration === PERMANENT_MUTE ? PERMANENT_MUTE : nowSec() + duration;

    const users = [];
    for (const m of mentions) {
      const uid = String(m.uid);
      const name = (data.content || '').substr(m.pos, m.len).replace('@','');
      tData.muteList[uid] = { name, timeMute: expires };
      users.push({ name, uid });
    }

    await Threads.setData(threadId, tData);
    
    // Tạo ảnh
    try {
      const imageBuffer = await createMuteImage(users, duration, false);
      const imageFileName = `mute_${Date.now()}.png`;
      await fs.writeFile(imageFileName, imageBuffer);
      
      await api.sendMessage({
        msg: `🚫 Đã cấm chat ${users.length} người`,
        attachments: [imageFileName]
      }, threadId, type);
      
      setTimeout(async () => {
        try { await fs.unlink(imageFileName); } catch (_) {}
      }, 30000);
    } catch (imgError) {
      console.error('Lỗi tạo ảnh mute:', imgError);
      const results = users.map(u => `• ${u.name} (${duration === PERMANENT_MUTE ? 'vô thời hạn' : formatSeconds(duration)})`);
      return api.sendMessage(`✅ Đã cấm chat:\n${results.join('\n')}`, threadId, type);
    }
  } catch (err) {
    return api.sendMessage(`❌ Không thể mute: ${err?.message || err}`, threadId, type);
  }
};
