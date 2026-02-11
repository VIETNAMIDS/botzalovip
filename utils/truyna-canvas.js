const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// Đăng ký font nếu có
try {
  const fontPath = path.join(process.cwd(), 'assets', 'fonts', 'UTMAvoBold.ttf');
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: 'UTMAvoBold' });
  }
} catch (e) {
  console.log('Font not found, using default fonts');
}

async function createTruynaImage(userName, avatarUrl) {
  const canvasWidth = 900;
  const canvasHeight = 1200;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Cute pastel background
  const bgGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  bgGradient.addColorStop(0, '#ffeaa7'); // soft yellow
  bgGradient.addColorStop(0.3, '#fab1a0'); // soft peach
  bgGradient.addColorStop(0.7, '#ff9ff3'); // soft pink
  bgGradient.addColorStop(1, '#a8e6cf'); // soft mint
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Decorative elements - cute clouds and hearts
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * canvasWidth;
    const y = Math.random() * canvasHeight;
    const size = 15 + Math.random() * 25;
    // Draw cute cloud
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y, size * 1.2, 0, Math.PI * 2);
    ctx.arc(x + size * 1.2, y, size, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y - size * 0.4, size * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wanted poster border
  ctx.strokeStyle = '#ff3838';
  ctx.lineWidth = 12;
  ctx.strokeRect(30, 30, canvasWidth - 60, canvasHeight - 60);

  ctx.strokeStyle = '#ff69b4';
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, canvasWidth - 80, canvasHeight - 80);

  // Title - WANTED
  ctx.fillStyle = '#ff3838';
  ctx.font = 'bold 72px "Comic Sans MS", Arial';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeText('WANTED', canvasWidth / 2, 100);
  ctx.fillText('WANTED', canvasWidth / 2, 100);

  // Subtitle
  ctx.fillStyle = '#8b4513';
  ctx.font = 'bold 28px "Comic Sans MS", Arial';
  ctx.fillText('CUTE CRIMINAL', canvasWidth / 2, 140);
  ctx.fillText('ĐANG BỊ TRUY NÃ', canvasWidth / 2, 175);

  // Avatar area with cute frame
  const avatarX = canvasWidth / 2 - 120;
  const avatarY = 220;
  const avatarSize = 240;

  // Cute avatar background - star shape
  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI * 2) / 10 - Math.PI / 2;
    const radius = i % 2 === 0 ? avatarSize / 2 + 20 : avatarSize / 2 + 40;
    const x = avatarX + avatarSize / 2 + Math.cos(angle) * radius;
    const y = avatarY + avatarSize / 2 + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Avatar border
  ctx.strokeStyle = '#ff69b4';
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI * 2) / 10 - Math.PI / 2;
    const radius = avatarSize / 2 + 15;
    const x = avatarX + avatarSize / 2 + Math.cos(angle) * radius;
    const y = avatarY + avatarSize / 2 + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // Load and draw avatar
  if (avatarUrl) {
    try {
      const avatar = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } catch (error) {
      console.error('Error loading avatar:', error);
      // Draw cute default face
      ctx.fillStyle = '#ffb8b1';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();

      // Cute face
      ctx.fillStyle = '#ffffff';
      // Eyes
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2 - 40, avatarY + avatarSize / 2 - 20, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2 + 40, avatarY + avatarSize / 2 - 20, 8, 0, Math.PI * 2);
      ctx.fill();

      // Mouth
      ctx.strokeStyle = '#8b4513';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 20, 15, 0, Math.PI);
      ctx.stroke();
    }
  }

  // Criminal information
  let infoY = avatarY + avatarSize + 60;
  const infoX = 80;

  // Name
  ctx.fillStyle = '#8b4513';
  ctx.font = 'bold 36px "Comic Sans MS", Arial';
  ctx.textAlign = 'left';
  ctx.fillText('👤 TÊN:', infoX, infoY);
  ctx.fillStyle = '#ff3838';
  ctx.fillText(userName, infoX + 120, infoY);
  infoY += 50;

  // Alias
  ctx.fillStyle = '#8b4513';
  ctx.font = 'bold 28px "Comic Sans MS", Arial';
  ctx.fillText('🎭 BÍ DANH:', infoX, infoY);
  ctx.fillStyle = '#ff3838';
  ctx.fillText(`${userName} Cute`, infoX + 160, infoY);
  infoY += 40;

  // Crime
  ctx.fillStyle = '#8b4513';
  ctx.font = 'bold 28px "Comic Sans MS", Arial';
  ctx.fillText('🚨 TỘI DANH:', infoX, infoY);
  ctx.fillStyle = '#ff3838';
  const crimes = ['Quá dễ thương', 'Lừa tim người khác', 'Spam cute quá mức', 'Biến mọi thứ thành màu hồng'];
  const randomCrime = crimes[Math.floor(Math.random() * crimes.length)];
  ctx.fillText(randomCrime, infoX + 150, infoY);
  infoY += 40;

  // Reward
  ctx.fillStyle = '#8b4513';
  ctx.font = 'bold 28px "Comic Sans MS", Arial';
  ctx.fillText('💰 MỨC THƯỞNG:', infoX, infoY);
  ctx.fillStyle = '#ff69b4';
  ctx.font = 'bold 32px "Comic Sans MS", Arial';
  const rewards = ['1 nụ hôn', '1 cái ôm', '1 lời khen cute', 'Vĩnh viễn dễ thương'];
  const randomReward = rewards[Math.floor(Math.random() * rewards.length)];
  ctx.fillText(randomReward, infoX + 180, infoY);
  infoY += 50;

  // Description
  ctx.fillStyle = '#8b4513';
  ctx.font = 'bold 24px "Comic Sans MS", Arial';
  ctx.fillText('📝 MÔ TẢ:', infoX, infoY);
  infoY += 35;

  const descriptions = [
    `• Độ tuổi: ${18 + Math.floor(Math.random() * 20)} tuổi`,
    `• Đặc điểm: Quá cute và đáng yêu`,
    `• Sở thích: Làm mọi người cười`,
    `• Cảnh báo: Có thể gây nghiện cute`,
    `• Ghi chú: Không nguy hiểm, chỉ dễ thương`
  ];

  ctx.fillStyle = '#333333';
  ctx.font = 'bold 20px "Comic Sans MS", Arial';
  descriptions.forEach(desc => {
    ctx.fillText(desc, infoX + 20, infoY);
    infoY += 30;
  });

  infoY += 20;

  // Contact info
  ctx.fillStyle = '#8b4513';
  ctx.font = 'bold 22px "Comic Sans MS", Arial';
  ctx.fillText('📞 THÔNG TIN LIÊN HỆ:', infoX, infoY);
  infoY += 30;

  ctx.fillStyle = '#333333';
  ctx.font = 'bold 18px "Comic Sans MS", Arial';
  ctx.fillText('• Gọi ngay cho: Bộ phận Cute Care', infoX + 20, infoY);
  infoY += 25;
  ctx.fillText('• Hotline: 1800-CUTE', infoX + 20, infoY);
  infoY += 25;
  ctx.fillText('• Website: www.cutecare.vn', infoX + 20, infoY);

  // Cute warning
  infoY += 40;
  ctx.fillStyle = '#ff3838';
  ctx.font = 'bold 24px "Comic Sans MS", Arial';
  ctx.textAlign = 'center';
  ctx.fillText('⚠️ CẢNH BÁO: NGHI PHẠM QUÁ DỄ THƯƠNG!', canvasWidth / 2, infoY);
  infoY += 30;
  ctx.fillText('KHÔNG ĐƯỢC BẮT HOẶC TRỪNG PHẠT!', canvasWidth / 2, infoY);

  // Footer
  ctx.fillStyle = '#ff69b4';
  ctx.font = 'bold 20px "Comic Sans MS", Arial';
  ctx.fillText('🌈 Created by Bonz Bot - For Fun Only 🌈', canvasWidth / 2, canvasHeight - 40);

  // Cute corner decorations
  ctx.fillStyle = '#ff69b4';
  for (let i = 0; i < 4; i++) {
    const cornerX = i % 2 === 0 ? 60 : canvasWidth - 60;
    const cornerY = i < 2 ? 60 : canvasHeight - 60;

    // Draw small stars in corners
    for (let s = 0; s < 5; s++) {
      const angle = (s * Math.PI * 2) / 5;
      const starX = cornerX + Math.cos(angle) * 15;
      const starY = cornerY + Math.sin(angle) * 15;
      ctx.beginPath();
      ctx.arc(starX, starY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Save to temp file
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = `truyna_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
  const filePath = path.join(tempDir, fileName);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

async function clearImagePath(imagePath) {
  try {
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  } catch (error) {
    console.error('Error clearing image path:', error);
  }
}

module.exports = {
  createTruynaImage,
  clearImagePath
};
