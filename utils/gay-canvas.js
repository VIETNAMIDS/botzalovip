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

async function createCharacterGayCard(characterData) {
  const { characterName, gender, GayLevel, comment, avatarUrl } = characterData;

  const canvasWidth = 800;
  const canvasHeight = 600;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bgGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  bgGradient.addColorStop(0, '#ff9ff3');
  bgGradient.addColorStop(0.5, '#f368e0');
  bgGradient.addColorStop(1, '#a8e6cf');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Decorative elements
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * canvasWidth;
    const y = Math.random() * canvasHeight;
    const size = 10 + Math.random() * 20;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px "Comic Sans MS", Arial';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#ff69b4';
  ctx.lineWidth = 4;
  ctx.strokeText('🏳️‍🌈 GAY TEST 🏳️‍🌈', canvasWidth / 2, 80);
  ctx.fillText('🏳️‍🌈 GAY TEST 🏳️‍🌈', canvasWidth / 2, 80);

  // Avatar
  if (avatarUrl) {
    try {
      const avatar = await loadImage(avatarUrl);
      const avatarSize = 150;
      const avatarX = canvasWidth / 2 - avatarSize / 2;
      const avatarY = 120;

      // Avatar background
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 10, 0, Math.PI * 2);
      ctx.fill();

      // Clip and draw avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // Avatar border
      ctx.strokeStyle = '#ff69b4';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
      ctx.stroke();

    } catch (error) {
      console.error('Error loading avatar:', error);
    }
  }

  // Character info
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px "Comic Sans MS", Arial';
  ctx.textAlign = 'center';
  ctx.fillText(characterName, canvasWidth / 2, 320);

  // Gender
  ctx.fillStyle = '#ffb8b1';
  ctx.font = 'bold 24px "Comic Sans MS", Arial';
  ctx.fillText(`Giới tính: ${gender}`, canvasWidth / 2, 360);

  // Gay Level with progress bar
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px "Comic Sans MS", Arial';
  ctx.fillText(`Tỉ lệ Gay: ${GayLevel}%`, canvasWidth / 2, 410);

  // Progress bar background
  const barWidth = 400;
  const barHeight = 30;
  const barX = canvasWidth / 2 - barWidth / 2;
  const barY = 430;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Progress bar fill
  const fillWidth = (GayLevel / 100) * barWidth;
  const barGradient = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
  barGradient.addColorStop(0, '#ff9ff3');
  barGradient.addColorStop(1, '#ff69b4');
  ctx.fillStyle = barGradient;
  ctx.fillRect(barX, barY, fillWidth, barHeight);

  // Progress bar border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  // Comment
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px "Comic Sans MS", Arial';
  ctx.textAlign = 'center';

  const words = comment.split(' ');
  let line = '';
  let y = 490;
  const maxWidth = 600;

  for (const word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line.trim(), canvasWidth / 2, y);
      line = word + ' ';
      y += 30;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), canvasWidth / 2, y);

  // Footer
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = 'bold 16px "Comic Sans MS", Arial';
  ctx.fillText('🌈 Created by Bonz Bot 🌈', canvasWidth / 2, canvasHeight - 30);

  // Save to temp file
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = `gay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
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
  createCharacterGayCard,
  clearImagePath
};
