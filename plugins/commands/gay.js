const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

async function createGayTestImage(userInfo, gayPercent) {
  const width = 800;
  const height = 600;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background với cover hoặc rainbow gradient
  const coverUrl = userInfo?.cover || null;
  if (coverUrl) {
    try {
      const cover = await loadImage(coverUrl);
      
      const scale = Math.max(width / cover.width, height / cover.height);
      const coverWidth = cover.width * scale;
      const coverHeight = cover.height * scale;
      const x = (width - coverWidth) / 2;
      const y = (height - coverHeight) / 2;
      
      ctx.drawImage(cover, x, y, coverWidth, coverHeight);
      
      // Overlay rainbow với opacity
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, 'rgba(255, 0, 128, 0.3)');
      gradient.addColorStop(0.2, 'rgba(255, 154, 0, 0.3)');
      gradient.addColorStop(0.4, 'rgba(255, 255, 0, 0.3)');
      gradient.addColorStop(0.6, 'rgba(0, 255, 0, 0.3)');
      gradient.addColorStop(0.8, 'rgba(0, 255, 255, 0.3)');
      gradient.addColorStop(1, 'rgba(128, 0, 255, 0.3)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    } catch (e) {
      console.error('[TESTGAY] Lỗi load cover:', e.message || e);
      // Fallback rainbow gradient
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#FF0080');
      gradient.addColorStop(0.2, '#FF9A00');
      gradient.addColorStop(0.4, '#FFFF00');
      gradient.addColorStop(0.6, '#00FF00');
      gradient.addColorStop(0.8, '#00FFFF');
      gradient.addColorStop(1, '#8000FF');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    // Rainbow gradient mặc định
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#FF0080');
    gradient.addColorStop(0.2, '#FF9A00');
    gradient.addColorStop(0.4, '#FFFF00');
    gradient.addColorStop(0.6, '#00FF00');
    gradient.addColorStop(0.8, '#00FFFF');
    gradient.addColorStop(1, '#8000FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  // Vẽ sparkles trang trí
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 8 + 4;
    
    ctx.font = `${size}px Arial`;
    ctx.textAlign = 'center';
    const sparkles = ['✨', '⭐', '🌟', '💫'];
    const sparkle = sparkles[Math.floor(Math.random() * sparkles.length)];
    ctx.fillText(sparkle, x, y);
  }

  // Card container với glass effect
  const cardX = 50;
  const cardY = 80;
  const cardWidth = width - 100;
  const cardHeight = height - 160;
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 10;
  
  // Rounded rectangle
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 25);
  ctx.fill();
  
  ctx.shadowColor = 'transparent';
  
  // Border gradient
  const borderGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
  borderGradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
  borderGradient.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title
  ctx.font = 'bold 48px Arial';
  const titleGradient = ctx.createLinearGradient(0, 150, 0, 200);
  titleGradient.addColorStop(0, '#FF0080');
  titleGradient.addColorStop(1, '#8000FF');
  ctx.fillStyle = titleGradient;
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 10;
  ctx.fillText('🏳️‍🌈 TEST ĐỘ GAY 🏳️‍🌈', width / 2, 150);
  ctx.shadowColor = 'transparent';

  // Avatar với rainbow border
  const avatarSize = 120;
  const avatarX = width / 2 - avatarSize / 2;
  const avatarY = 180;
  
  const avatarUrl = userInfo?.avatar || null;
  if (avatarUrl) {
    try {
      const avatar = await loadImage(avatarUrl);
      
      // Rainbow border
      const borderSize = 8;
      const rainbowGradient = ctx.createLinearGradient(
        avatarX - borderSize, avatarY - borderSize,
        avatarX + avatarSize + borderSize, avatarY + avatarSize + borderSize
      );
      rainbowGradient.addColorStop(0, '#FF0080');
      rainbowGradient.addColorStop(0.2, '#FF9A00');
      rainbowGradient.addColorStop(0.4, '#FFFF00');
      rainbowGradient.addColorStop(0.6, '#00FF00');
      rainbowGradient.addColorStop(0.8, '#00FFFF');
      rainbowGradient.addColorStop(1, '#8000FF');
      
      ctx.fillStyle = rainbowGradient;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + borderSize, 0, Math.PI * 2);
      ctx.fill();
      
      // Avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } catch (e) {
      console.error('[TESTGAY] Lỗi load avatar:', e.message || e);
      // Default avatar
      ctx.fillStyle = '#FF0080';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 60px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('👤', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 20);
    }
  }

  // Tên user
  const displayName = userInfo?.name || userInfo?.displayName || 'Người dùng';
  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 8;
  ctx.fillText(displayName, width / 2, 350);

  // Phần trăm gay với hiệu ứng
  ctx.font = 'bold 72px Arial';
  const percentGradient = ctx.createLinearGradient(0, 380, 0, 450);
  percentGradient.addColorStop(0, '#FF0080');
  percentGradient.addColorStop(1, '#FFFF00');
  ctx.fillStyle = percentGradient;
  ctx.fillText(`${gayPercent}%`, width / 2, 420);

  // Progress bar
  const barWidth = 400;
  const barHeight = 20;
  const barX = width / 2 - barWidth / 2;
  const barY = 440;
  
  // Background bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth, barHeight, 10);
  ctx.fill();
  
  // Progress bar với rainbow
  const progressWidth = (barWidth * gayPercent) / 100;
  const progressGradient = ctx.createLinearGradient(barX, barY, barX + progressWidth, barY);
  progressGradient.addColorStop(0, '#FF0080');
  progressGradient.addColorStop(0.3, '#FF9A00');
  progressGradient.addColorStop(0.6, '#FFFF00');
  progressGradient.addColorStop(1, '#00FF00');
  ctx.fillStyle = progressGradient;
  ctx.beginPath();
  ctx.roundRect(barX, barY, progressWidth, barHeight, 10);
  ctx.fill();

  // Tin nhắn hài hước tiếng Việt (56 câu)
  const messages = [
    // 0-10% (Straight)
    'Straight như thanh sắt! Không cong nổi! 📏',
    'Thẳng như đường thẳng hàng! 📐',
    'Straight 100%, không có gì để bàn! 🚀',
    'Thẳng như cột điện! ⚡',
    'Straight như đường ray tàu hỏa! 🚄',
    'Thẳng tắp, không có gì phải nghi ngờ! 💯',
    'Straight như thanh kiếm samurai! ⚔️',
    'Thẳng như đường kẻ! 📏',
    'Straight 100%, certified! ✅',
    'Thẳng như mũi tên! 🏹',
    
    // 11-30% (Hơi sus)
    'Chắc bạn phải gay một chút rồi đấy! Sus! 🤔',
    'Hơi có dấu hiệu đấy! Nghi ngờ quá! 👀',
    'Sus alert! Có gì đó không ổn! 🚨',
    'Hmmm... có vẻ hơi cong rồi đấy! 🤨',
    'Bạn này hơi màu hồng rồi! 🩷',
    'Sus quá! Chắc có gì đó! 👁️',
    'Hơi nghiêng về bên kia rồi! ↗️',
    'Có dấu hiệu của rainbow! 🌈',
    'Bắt đầu có màu sắc rồi! 🎨',
    'Hơi cong một chút! Nghi ngờ! 🤔',
    
    // 31-50% (Bi vibes)
    'Ơ hay, bạn ăn cả hai team à? Ngon! 💖💙💜',
    'Bisexual energy detected! Ăn cả hai! 🍽️',
    'Bạn này chơi cả hai bên! Giỏi! 👏',
    'Ăn cả ngọt lẫn mặn! Tài năng! 🍭🧂',
    'Bi vibes strong! Cả hai đều ok! 💕',
    'Chơi đa dạng! Respect! 🙌',
    'Ăn buffet tình yêu! All you can eat! 🍽️',
    'Đa zi năng! Cả hai đều được! ⚡',
    'Flexible quá! Uốn éo được! 🤸',
    'Chơi cả hai team! Pro player! 🎮',
    
    // 51-70% (Pretty gay)
    'Chắc bạn phải gay nhiều lắm! Màu hồng quá! 🌈✨',
    'Pretty gay! Có màu sắc rồi! 🎨',
    'Bạn này đã có màu rainbow! 🌈',
    'Gay alert! Phát hiện màu hồng! 🩷',
    'Cong rồi! Không thẳng nữa! 〰️',
    'Màu sắc xuất hiện! Rainbow mode! 🌈',
    'Gay vibes detected! Beep beep! 🚨',
    'Có màu hồng trong máu! 💗',
    'Rainbow energy activated! ⚡🌈',
    'Cong cong, không thẳng! 🌊',
    
    // 71-90% (Very gay)
    'Bạn này gay quá trời luôn! Cong rồi! 🏳️‍🌈',
    'Very gay! Cong như cầu vồng! 🌈',
    'Gay panic mode! Cong tít! 😱',
    'Siêu cong! Không thẳng được nữa! 〰️',
    'Gay quá trời! Rainbow overload! 🌈⚡',
    'Cong như chữ C! 🌙',
    'Gay energy maximum! Full power! 💪🌈',
    'Cong như sông Mekong! 🌊',
    'Gay alert level 9000! 🚨',
    'Cong tít mù khô! 🌀',
    
    // 91-100% (Ultra gay)
    'SIÊU GAY! Bạn là nữ hoàng/vua gay rồi! 👑🌈',
    'ULTRA GAY! Legendary status! 👑',
    'GAY SUPREME! Bạn là icon! ✨👑',
    'MEGA GAY! Nữ hoàng/vua của rainbow! 🌈👑',
    'ULTIMATE GAY! Thần tượng LGBT! 🏳️‍🌈⭐',
    'GAY MASTER! Sensei của cộng đồng! 🥋🌈'
  ];
  
  // Random câu theo khoảng %
  let selectedMessages = [];
  if (gayPercent <= 10) {
    selectedMessages = messages.slice(0, 10); // Câu 0-9 (Straight)
  } else if (gayPercent <= 30) {
    selectedMessages = messages.slice(10, 20); // Câu 10-19 (Sus)
  } else if (gayPercent <= 50) {
    selectedMessages = messages.slice(20, 30); // Câu 20-29 (Bi)
  } else if (gayPercent <= 70) {
    selectedMessages = messages.slice(30, 40); // Câu 30-39 (Pretty gay)
  } else if (gayPercent <= 90) {
    selectedMessages = messages.slice(40, 50); // Câu 40-49 (Very gay)
  } else {
    selectedMessages = messages.slice(50); // Câu 50+ (Ultra gay)
  }
  
  const message = selectedMessages[Math.floor(Math.random() * selectedMessages.length)];

  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(`🇻🇳 ${message}`, width / 2, 500);

  // Footer chỉ tiếng Việt
  const footerMessages = [
    '💖 Tình yêu là tình yêu 💖',
    '🌈 Yêu ai thì yêu, đừng ngại! 🌈',
    '✨ Gay hay straight đều ok! ✨',
    '🏳️‍🌈 Cong hay thẳng đều đẹp! 🏳️‍🌈',
    '💕 Tình yêu không có giới hạn! 💕',
    '🌟 Hãy là chính mình! 🌟',
    '💖 Yêu thương không phân biệt! 💖',
    '🌈 Màu sắc nào cũng đẹp! 🌈',
    '✨ Sống thật với bản thân! ✨',
    '🏳️‍🌈 Pride Việt Nam! 🏳️‍🌈'
  ];
  
  const randomFooter = footerMessages[Math.floor(Math.random() * footerMessages.length)];
  ctx.font = '18px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillText(randomFooter, width / 2, 540);

  // Lưu file
  const cacheDir = path.join(__dirname, '../../cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const filePath = path.join(cacheDir, `gay_test_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

// Thời gian tự động xóa (milliseconds)
const AUTO_DELETE_TIME = 60000; // 60 giây

module.exports.config = {
  name: 'testgay',
  aliases: ['gay', 'gaypercent', 'testdogay'],
  version: '2.1.0',
  role: 0,
  author: 'Cascade',
  description: 'Test độ gay với ảnh Canva siêu đẹp, câu tiếng Việt hài hước - Auto delete',
  category: 'Giải trí',
  usage: 'testgay | testgay @user | reply + testgay',
  cooldowns: 5,
  dependencies: { canvas: '' }
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  const senderId = data?.uidFrom;
  if (!senderId) {
    return api.sendMessage('❌ Không xác định được người gửi.', threadId, type);
  }

  // Xác định target user (người được test)
  let targetId = senderId; // Mặc định test chính mình
  let targetName = 'Bạn';

  // Kiểm tra mention hoặc reply
  if (data?.mentions && data.mentions.length > 0) {
    // Có mention @user
    targetId = data.mentions[0].uid;
    targetName = data.mentions[0].displayName || 'Người được tag';
  } else if (data?.quote) {
    // Reply tin nhắn của ai đó
    targetId = data.quote.uidFrom;
    targetName = 'Người được reply';
  }

  // Lấy thông tin target user
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
  } catch (e) {
    console.log('[TESTGAY] Không thể lấy thông tin target user:', e.message || e);
  }

  // Random % gay (dựa trên target user ID để consistent)
  const gayPercent = Math.floor((parseInt(targetId.slice(-4), 16) % 101));

  let imagePath = null;
  try {
    imagePath = await createGayTestImage(userInfo, gayPercent);

    if (imagePath && fs.existsSync(imagePath)) {
      console.log(`[TESTGAY] 💾 Đã tạo file: ${path.basename(imagePath)}`);

      // Gửi tin nhắn với TTL để tự động xóa
      await api.sendMessage({
        msg: `🏳️‍🌈 Kết quả test độ gay của ${userInfo.name}: ${gayPercent}%\n⏱️ Tin nhắn sẽ tự động xóa sau ${AUTO_DELETE_TIME/1000}s`,
        attachments: [imagePath],
        ttl: AUTO_DELETE_TIME // Tự động xóa tin nhắn
      }, threadId, type);

      console.log(`[TESTGAY] 📤 Đã gửi ảnh với TTL ${AUTO_DELETE_TIME/1000}s`);

      // Cleanup file sau khi gửi
      setTimeout(() => {
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`[TESTGAY] ✅ Đã xóa file: ${path.basename(imagePath)}`);
          }
        } catch (err) {
          console.error(`[TESTGAY] ❌ Lỗi xóa file:`, err.message || err);
        }
      }, AUTO_DELETE_TIME);
    } else {
      return api.sendMessage('❌ Không tạo được ảnh test gay, vui lòng thử lại sau.', threadId, type);
    }
  } catch (err) {
    console.error('[TESTGAY] Lỗi tạo ảnh test gay:', err);
    return api.sendMessage('❌ Đã xảy ra lỗi khi tạo ảnh test gay.', threadId, type);
  }
};
