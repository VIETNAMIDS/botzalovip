const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

async function createHornyTestImage(userInfo, hornyPercent) {
  const width = 1080;
  const height = 1080;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Modern gradient background với tone tươi sáng
  const gradient = ctx.createRadialGradient(width/2, height/2, 100, width/2, height/2, width);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(0.5, '#764ba2');
  gradient.addColorStop(1, '#f093fb');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Geometric shapes background
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 200 + 100;
    
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (i % 3 === 0) {
      ctx.arc(x, y, size, 0, Math.PI * 2);
    } else if (i % 3 === 1) {
      ctx.rect(x, y, size, size);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x + size/2, y + size);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Main card với glass morphism effect
  const cardX = 90;
  const cardY = 150;
  const cardWidth = width - 180;
  const cardHeight = height - 300;

  // Glass card background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 40);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Glass border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 40);
  ctx.stroke();

  // Top accent bar
  const accentGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY);
  accentGradient.addColorStop(0, '#f093fb');
  accentGradient.addColorStop(0.5, '#f5576c');
  accentGradient.addColorStop(1, '#ffd966');
  ctx.fillStyle = accentGradient;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardWidth, 8, [40, 40, 0, 0]);
  ctx.fill();

  // Title với modern typography
  ctx.font = 'bold 72px "Arial Black", Arial';
  const titleY = cardY + 100;
  
  // Main title
  const titleTextGradient = ctx.createLinearGradient(0, titleY - 50, 0, titleY + 20);
  titleTextGradient.addColorStop(0, '#ffffff');
  titleTextGradient.addColorStop(1, '#ffd966');
  ctx.fillStyle = titleTextGradient;
  ctx.textAlign = 'center';
  ctx.fillText('TEST ĐỘ DÂM', width/2, titleY);

  // Emoji decoration
  ctx.font = '48px Arial';
  ctx.fillText('🔥', cardX + 120, titleY);
  ctx.fillText('💕', width - cardX - 120, titleY);

  // Avatar section với modern style
  const avatarSize = 200;
  const avatarX = width/2 - avatarSize/2;
  const avatarY = cardY + 150;
  const avatarUrl = userInfo?.avatar || null;

  // Avatar glow effect
  ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
  ctx.shadowBlur = 30;
  
  try {
    if (avatarUrl) {
      const avatar = await loadImage(avatarUrl);
      
      // Outer glow ring
      const glowGradient = ctx.createRadialGradient(
        avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2,
        avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 + 15
      );
      glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      glowGradient.addColorStop(1, 'rgba(240, 147, 251, 0.5)');
      
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 + 15, 0, Math.PI * 2);
      ctx.fill();

      // Avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } else {
      throw new Error('No avatar URL');
    }
  } catch (error) {
    // Fallback
    ctx.fillStyle = '#f093fb';
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 100px Arial';
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 0;
    ctx.fillText('😊', width/2, avatarY + avatarSize/2 + 35);
  }
  
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Name tag với badge style
  const nameY = avatarY + avatarSize + 50;
  const displayName = userInfo?.name || userInfo?.displayName || 'Người dùng';
  
  ctx.font = 'bold 42px Arial';
  const nameWidth = ctx.measureText(displayName).width;
  const badgeWidth = nameWidth + 60;
  const badgeHeight = 65;
  const badgeX = width/2 - badgeWidth/2;
  const badgeY = nameY - 45;

  // Badge background
  const badgeGradient = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeWidth, badgeY);
  badgeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  badgeGradient.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
  ctx.fillStyle = badgeGradient;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 33);
  ctx.fill();

  // Badge border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Name text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(displayName, width/2, nameY);

  // Percentage display - Big and bold
  const percentY = nameY + 120;
  ctx.font = 'bold 140px Arial Black';
  
  // Gradient cho số %
  const percentGradient = ctx.createLinearGradient(0, percentY - 100, 0, percentY + 20);
  percentGradient.addColorStop(0, '#ffffff');
  percentGradient.addColorStop(0.5, '#ffd966');
  percentGradient.addColorStop(1, '#f5576c');
  ctx.fillStyle = percentGradient;
  
  // Text shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 5;
  ctx.fillText(`${hornyPercent}%`, width/2, percentY);
  ctx.shadowColor = 'transparent';

  // Modern progress bar
  const barWidth = 600;
  const barHeight = 35;
  const barX = width/2 - barWidth/2;
  const barY = percentY + 50;

  // Bar background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth, barHeight, 18);
  ctx.fill();

  // Progress fill với animated gradient
  const progressWidth = (barWidth * hornyPercent) / 100;
  const progressGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
  progressGradient.addColorStop(0, '#f093fb');
  progressGradient.addColorStop(0.3, '#f5576c');
  progressGradient.addColorStop(0.6, '#ffd966');
  progressGradient.addColorStop(1, '#4facfe');
  
  ctx.fillStyle = progressGradient;
  ctx.beginPath();
  ctx.roundRect(barX, barY, progressWidth, barHeight, 18);
  ctx.fill();

  // Progress glow
  ctx.shadowColor = 'rgba(245, 87, 108, 0.6)';
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Level indicator
  let levelEmoji = '😇';
  let levelText = 'THIÊN THẦN';
  let levelColor = '#4facfe';
  
  if (hornyPercent <= 15) {
    levelEmoji = '😇';
    levelText = 'THIÊN THẦN';
    levelColor = '#4facfe';
  } else if (hornyPercent <= 35) {
    levelEmoji = '🌸';
    levelText = 'TRONG SÁNG';
    levelColor = '#a8e6cf';
  } else if (hornyPercent <= 65) {
    levelEmoji = '😊';
    levelText = 'BÌNH THƯỜNG';
    levelColor = '#ffd966';
  } else if (hornyPercent <= 85) {
    levelEmoji = '🔥';
    levelText = 'NÓNG BỎNG';
    levelColor = '#ff8b94';
  } else {
    levelEmoji = '💥';
    levelText = 'CỰC MẠNH';
    levelColor = '#f5576c';
  }

  // Level badge
  const levelY = barY + 90;
  ctx.font = 'bold 36px Arial';
  const levelBadgeText = `${levelEmoji} ${levelText} ${levelEmoji}`;
  const levelTextWidth = ctx.measureText(levelBadgeText).width;
  const levelBadgeWidth = levelTextWidth + 50;
  const levelBadgeX = width/2 - levelBadgeWidth/2;

  ctx.fillStyle = levelColor;
  ctx.beginPath();
  ctx.roundRect(levelBadgeX, levelY - 30, levelBadgeWidth, 50, 25);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(levelBadgeText, width/2, levelY + 5);

  // Fun message
  const messages = {
    low: [
      'Trong trắng như mây trời! ☁️',
      'Tâm hồn siêu thanh khiết! ✨',
      'Thiên thần giáng trần đây rồi! 👼'
    ],
    medium: [
      'Cân bằng hoàn hảo! ⚖️',
      'Vừa đủ sương sương! 😌',
      'Level an toàn và lành mạnh! 🌈'
    ],
    high: [
      'Nhiệt độ đang tăng cao! 🌡️',
      'Có vẻ hơi nóng đây! 🔥',
      'Cần làm mát ngay! 💦'
    ],
    ultra: [
      'Báo động đỏ! 🚨',
      'Siêu năng lượng! ⚡',
      'Off the charts! 💥'
    ]
  };

  let msgBucket = 'low';
  if (hornyPercent <= 35) msgBucket = 'low';
  else if (hornyPercent <= 65) msgBucket = 'medium';
  else if (hornyPercent <= 85) msgBucket = 'high';
  else msgBucket = 'ultra';

  const message = messages[msgBucket][Math.floor(Math.random() * messages[msgBucket].length)];
  ctx.font = 'italic 32px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(message, width/2, levelY + 70);

  // Footer
  ctx.font = '24px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText('Chỉ để giải trí', width/2, cardY + cardHeight - 30);

  // Save file
  const cacheDir = path.join(__dirname, '../../cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const filePath = path.join(cacheDir, `horny_test_${Date.now()}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  return filePath;
}

const AUTO_DELETE_TIME = 60000;

module.exports.config = {
  name: 'dam',
  aliases: ['horny', 'checkdam', 'damcheck'],
  version: '3.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Đo mức độ dâm - Modern Canva Design với glass morphism',
  category: 'Giải trí',
  usage: 'dam | dam @user | reply + dam',
  cooldowns: 5,
  dependencies: { canvas: '' }
};

module.exports.run = async ({ api, event }) => {
  const { threadId, type, data } = event;
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  const senderId = data?.uidFrom;
  if (!senderId) {
    return api.sendMessage('❌ Không xác định được người gửi.', threadId, type);
  }

  let targetId = senderId;
  let targetName = 'Bạn';

  if (data?.mentions && data.mentions.length > 0) {
    targetId = data.mentions[0].uid;
    targetName = data.mentions[0].displayName || 'Người được tag';
  } else if (data?.quote) {
    targetId = data.quote.uidFrom;
    targetName = 'Người được reply';
  }

  let userInfo = { name: targetName };
  try {
    const info = await api.getUserInfo(targetId);
    const profile = info?.changed_profiles?.[targetId] || {};
    userInfo = {
      name: profile.displayName || targetName,
      displayName: profile.displayName || targetName,
      avatar: profile.avatar || profile.avatarUrl || null,
      cover: profile.coverPhoto || profile.cover || null
    };
  } catch (err) {
    console.error('[TESTDAM] Không thể lấy thông tin user:', err.message || err);
  }

  const hornyPercent = Math.floor((parseInt(targetId.slice(-4), 16) % 101));

  try {
    const imagePath = await createHornyTestImage(userInfo, hornyPercent);
    if (!fs.existsSync(imagePath)) throw new Error('Image not created');

    await api.sendMessage({
      msg: `🎨 Test độ dâm của ${userInfo.name}: ${hornyPercent}%\n✨ Modern Design\n⏱️ Tự động xoá sau ${AUTO_DELETE_TIME / 1000}s`,
      attachments: [imagePath],
      ttl: AUTO_DELETE_TIME
    }, threadId, type);

    setTimeout(() => {
      try {
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      } catch (cleanupErr) {
        console.error('[TESTDAM] Lỗi xoá file:', cleanupErr.message || cleanupErr);
      }
    }, AUTO_DELETE_TIME);
  } catch (error) {
    console.error('[TESTDAM] Lỗi tạo ảnh độ dâm:', error);
    return api.sendMessage('❌ Không thể tạo ảnh test độ dâm, thử lại sau nhé.', threadId, type);
  }
};