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

async function createCharacterDamCard(characterData) {
  const { characterName, gender, DamLevel, comment, avatarUrl } = characterData;

  const canvasWidth = 800;
  const canvasHeight = 600;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Cute rainbow background gradient
  const bgGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  bgGradient.addColorStop(0, '#ff9ff3'); // pink
  bgGradient.addColorStop(0.25, '#a29bfe'); // purple
  bgGradient.addColorStop(0.5, '#74b9ff'); // blue
  bgGradient.addColorStop(0.75, '#fd79a8'); // coral
  bgGradient.addColorStop(1, '#ffeaa7'); // yellow
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Decorative elements
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * canvasWidth;
    const y = Math.random() * canvasHeight;
    const size = 8 + Math.random() * 15;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Super cute title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px "Comic Sans MS", Arial';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#ff69b4';
  ctx.lineWidth = 4;
  ctx.strokeText('💖 DÂM TEST CUTE 💖', canvasWidth / 2, 80);
  ctx.fillText('💖 DÂM TEST CUTE 💖', canvasWidth / 2, 80);

  // Avatar
  if (avatarUrl) {
    try {
      const avatar = await loadImage(avatarUrl);
      const avatarSize = 150;
      const avatarX = canvasWidth / 2 - avatarSize / 2;
      const avatarY = 120;

      // Cute rainbow avatar background
      const avatarColors = ['#ff9ff3', '#a29bfe', '#74b9ff', '#fd79a8'];
      for (let i = 0; i < avatarColors.length; i++) {
        ctx.fillStyle = avatarColors[i];
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 12 - i * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // White inner background
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 8, 0, Math.PI * 2);
      ctx.fill();

      // Clip and draw avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // Cute pink border
      ctx.strokeStyle = '#ff69b4';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
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
  ctx.fillStyle = '#ffeaa7';
  ctx.font = 'bold 24px "Comic Sans MS", Arial';
  ctx.fillText(`Giới tính: ${gender}`, canvasWidth / 2, 360);

  // Dam Level with progress bar
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px "Comic Sans MS", Arial';
  ctx.fillText(`Tỉ lệ Dâm: ${DamLevel}%`, canvasWidth / 2, 410);

  // Progress bar background
  const barWidth = 400;
  const barHeight = 30;
  const barX = canvasWidth / 2 - barWidth / 2;
  const barY = 430;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Progress bar fill
  const fillWidth = (DamLevel / 100) * barWidth;
  const barGradient = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
  barGradient.addColorStop(0, '#ff6b6b');
  barGradient.addColorStop(1, '#ff3838');
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

  // Cute footer
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 18px "Comic Sans MS", Arial';
  ctx.strokeStyle = '#ff69b4';
  ctx.lineWidth = 2;
  ctx.strokeText('🌸 Created by Bonz Bot - Cute Version 🌸', canvasWidth / 2, canvasHeight - 30);
  ctx.fillText('🌸 Created by Bonz Bot - Cute Version 🌸', canvasWidth / 2, canvasHeight - 30);

  // Save to temp file
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = `dam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
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
  createCharacterDamCard,
  clearImagePath
};
