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

function drawHeart(ctx, x, y, width, height, fillColor, strokeColor = null, strokeWidth = 0) {
  ctx.save();

  const topCurveHeight = height * 0.25;
  const bottomCurveHeight = height * 0.75;

  ctx.beginPath();
  ctx.moveTo(x, y + topCurveHeight);

  // Vẽ nửa trái tim bên trái
  ctx.bezierCurveTo(
    x, y - height * 0.08,
    x - width * 0.45, y - height * 0.15,
    x - width * 0.5, y + height * 0.25
  );

  ctx.bezierCurveTo(
    x - width * 0.5, y + height * 0.55,
    x, y + height * 0.85,
    x, y + height
  );

  // Vẽ nửa trái tim bên phải
  ctx.bezierCurveTo(
    x, y + height * 0.85,
    x + width * 0.5, y + height * 0.55,
    x + width * 0.5, y + height * 0.25
  );

  ctx.bezierCurveTo(
    x + width * 0.5, y - height * 0.15,
    x, y - height * 0.08,
    x, y + topCurveHeight
  );

  ctx.closePath();

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  if (strokeColor && strokeWidth > 0) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  }

  ctx.restore();
}

async function createPremiumHeartTemplate(avatarPaths, profile1, profile2, compatibility, theme = 'light') {
  const canvasWidth = 900;
  const canvasHeight = 700;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Cấu hình màu sắc theo theme
  const colors = {
    light: {
      bgGradient: ['#fce4ec', '#f3e5f5', '#e8eaf6', '#e3f2fd'],
      patternColor: 'rgba(200, 150, 255, 0.2)',
      nameBg: 'rgba(255, 255, 255, 0.92)',
      nameBorder: 'rgba(255, 180, 255, 0.5)',
      nameText: '#663366',
      messageBg: ['rgba(255, 235, 255, 0.98)', 'rgba(235, 245, 255, 0.98)'],
      messageBorder: 'rgba(200, 140, 255, 0.7)',
      messageText: '#663366',
      titleGradient: ['#ff3366', '#cc66ff', '#3366ff'],
      titleShadow: 'rgba(0, 0, 0, 0.5)',
      titleStroke: 'rgba(255, 255, 255, 0.9)',
      decorBorder: 'rgba(180, 120, 255, 0.3)',
      watermark: 'rgba(120, 120, 120, 0.6)',
      heartShadow: 'rgba(0, 0, 0, 0.4)',
      heartGlow: '#ff66ff'
    },
    dark: {
      bgGradient: ['#1a1a2e', '#16213e', '#0f3460', '#1a1a2e'],
      patternColor: 'rgba(150, 100, 255, 0.15)',
      nameBg: 'rgba(40, 40, 60, 0.85)',
      nameBorder: 'rgba(150, 100, 255, 0.4)',
      nameText: '#e6e6ff',
      messageBg: ['rgba(60, 40, 80, 0.9)', 'rgba(40, 60, 80, 0.9)'],
      messageBorder: 'rgba(150, 100, 255, 0.5)',
      messageText: '#e6e6ff',
      titleGradient: ['#ff3366', '#9966ff', '#3366ff'],
      titleShadow: 'rgba(0, 0, 0, 0.7)',
      titleStroke: 'rgba(200, 200, 255, 0.8)',
      decorBorder: 'rgba(120, 80, 200, 0.4)',
      watermark: 'rgba(180, 180, 220, 0.5)',
      heartShadow: 'rgba(0, 0, 0, 0.6)',
      heartGlow: '#ff33cc'
    }
  };

  const themeColors = colors[theme];

  // 1. Background gradient theo theme
  const bgGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  themeColors.bgGradient.forEach((color, index) => {
    const stop = index / (themeColors.bgGradient.length - 1);
    bgGradient.addColorStop(stop, color);
  });

  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Pattern trái tim nhỏ theo theme
  ctx.fillStyle = themeColors.patternColor;
  for (let i = 0; i < canvasWidth; i += 100) {
    for (let j = 0; j < canvasHeight; j += 100) {
      if ((i + j) % 200 === 0) {
        drawHeart(ctx, i, j, 25, 20, themeColors.patternColor, null, 0);
      }
    }
  }

  // 3. Load avatar
  const images = await Promise.all(avatarPaths.map(p => loadImage(p)));

  // 4. Avatar trái
  const avatarLeft = await resizeAndCropCircle(images[0], 160);

  // Bóng đổ
  ctx.save();
  ctx.shadowColor = theme === 'dark' ? 'rgba(150, 80, 220, 0.6)' : 'rgba(180, 100, 255, 0.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.arc(180, 220, 85, 0, Math.PI * 2);
  ctx.fillStyle = theme === 'dark' ? 'rgba(150, 80, 220, 0.4)' : 'rgba(180, 100, 255, 0.3)';
  ctx.fill();
  ctx.restore();

  // Viền gradient
  ctx.save();
  const borderGradient1 = ctx.createRadialGradient(180, 220, 70, 180, 220, 85);
  borderGradient1.addColorStop(0, 'rgba(255, 102, 204, 0.9)');
  borderGradient1.addColorStop(0.5, 'rgba(204, 102, 255, 0.7)');
  borderGradient1.addColorStop(1, 'rgba(153, 102, 255, 0.5)');

  ctx.beginPath();
  ctx.arc(180, 220, 85, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = borderGradient1;
  ctx.stroke();

  // Clip và vẽ avatar
  ctx.beginPath();
  ctx.arc(180, 220, 78, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatarLeft, 180 - 78, 220 - 78, 156, 156);
  ctx.restore();

  // 5. Avatar phải
  const avatarRight = await resizeAndCropCircle(images[1], 160);

  // Bóng đổ
  ctx.save();
  ctx.shadowColor = theme === 'dark' ? 'rgba(80, 150, 220, 0.6)' : 'rgba(100, 180, 255, 0.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.arc(720, 220, 85, 0, Math.PI * 2);
  ctx.fillStyle = theme === 'dark' ? 'rgba(80, 150, 220, 0.4)' : 'rgba(120, 220, 250, 0.3)';
  ctx.fill();
  ctx.restore();

  // Viền gradient
  ctx.save();
  const borderGradient2 = ctx.createRadialGradient(720, 220, 70, 720, 220, 85);
  borderGradient2.addColorStop(0, 'rgba(204, 102, 255, 0.9)');
  borderGradient2.addColorStop(0.5, 'rgba(102, 153, 255, 0.7)');
  borderGradient2.addColorStop(1, 'rgba(102, 204, 255, 0.5)');

  ctx.beginPath();
  ctx.arc(720, 220, 85, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = borderGradient2;
  ctx.stroke();

  // Clip và vẽ avatar
  ctx.beginPath();
  ctx.arc(720, 220, 78, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatarRight, 720 - 78, 220 - 78, 156, 156);
  ctx.restore();

  // 6. TRÁI TIM CHÍNH GIỮA
  const heartX = canvasWidth / 2;
  const heartY = 240;
  const heartSize = 140;

  // Màu viền trái tim
  let heartBorderColor, heartGlowColor;
  if (compatibility >= 80) {
    heartBorderColor = '#ff3366';
    heartGlowColor = '#ff33ff';
  } else if (compatibility >= 60) {
    heartBorderColor = '#ff6699';
    heartGlowColor = '#ff66ff';
  } else if (compatibility >= 40) {
    heartBorderColor = '#ff99cc';
    heartGlowColor = '#ff99ff';
  } else {
    heartBorderColor = '#ffccff';
    heartGlowColor = '#ffccff';
  }

  // Vẽ trái tim được lấp đầy
  drawPercentageHeart(ctx, heartX, heartY, heartSize, compatibility, heartBorderColor, theme, heartGlowColor);

  // 7. HIỂN THỊ PHẦN TRĂM
  ctx.save();

  ctx.font = 'bold 68px "Arial Rounded MT Bold", "Arial", sans-serif';

  const textGradient = ctx.createLinearGradient(
    heartX - 50, heartY - 30,
    heartX + 50, heartY + 30
  );
  textGradient.addColorStop(0, '#ffffff');
  textGradient.addColorStop(0.3, '#ffffcc');
  textGradient.addColorStop(0.7, heartGlowColor);
  textGradient.addColorStop(1, '#ffffff');

  ctx.fillStyle = textGradient;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = heartGlowColor;
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  ctx.fillText(`${compatibility}%`, heartX, heartY);

  ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 4;
  ctx.strokeText(`${compatibility}%`, heartX, heartY);

  ctx.strokeStyle = theme === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeText(`${compatibility}%`, heartX, heartY);

  ctx.restore();

  // 8. Tên người dùng
  const name1 = profile1.displayName || profile1.zaloName || profile1.username || 'Bạn';
  const name2 = profile2.displayName || profile2.zaloName || profile2.username || 'Người ấy';

  // Background cho tên
  ctx.save();
  ctx.shadowColor = theme === 'dark' ? 'rgba(150, 100, 255, 0.4)' : 'rgba(200, 140, 255, 0.3)';
  ctx.shadowBlur = 15;

  ctx.fillStyle = themeColors.nameBg;
  ctx.strokeStyle = themeColors.nameBorder;
  ctx.lineWidth = 2;

  // Tên bên trái
  ctx.beginPath();
  ctx.roundRect(80, 330, 200, 55, 30);
  ctx.fill();
  ctx.stroke();

  // Tên bên phải
  ctx.beginPath();
  ctx.roundRect(620, 330, 200, 55, 30);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Vẽ text tên
  ctx.save();
  ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
  ctx.shadowColor = theme === 'dark' ? 'rgba(255, 200, 255, 0.5)' : 'rgba(255, 180, 255, 0.4)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = themeColors.nameText;
  ctx.textAlign = 'center';

  const shortName1 = truncateText(ctx, name1, 180);
  ctx.fillText(shortName1, 180, 360);

  const shortName2 = truncateText(ctx, name2, 180);
  ctx.fillText(shortName2, 720, 360);
  ctx.restore();

  // 9. Đường kết nối
  ctx.save();
  ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 120, 220, 0.7)' : 'rgba(255, 120, 220, 0.6)';
  ctx.lineWidth = 5;
  ctx.setLineDash([10, 6]);

  ctx.shadowColor = theme === 'dark' ? 'rgba(255, 100, 200, 0.5)' : 'rgba(255, 120, 220, 0.4)';
  ctx.shadowBlur = 10;

  // Đường cong từ avatar trái
  ctx.beginPath();
  ctx.moveTo(265, 220);
  ctx.quadraticCurveTo(heartX - 150, 180, heartX - 90, heartY);
  ctx.stroke();

  // Đường cong từ avatar phải
  ctx.beginPath();
  ctx.moveTo(635, 220);
  ctx.quadraticCurveTo(heartX + 150, 180, heartX + 90, heartY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.restore();

  // 10. KHUNG THÔNG ĐIỆP
  const message = getLoveMessage(compatibility);
  const messageY = 470;

  const messageGradient = ctx.createLinearGradient(
    canvasWidth/2 - 340, messageY - 60,
    canvasWidth/2 + 340, messageY + 60
  );
  messageGradient.addColorStop(0, themeColors.messageBg[0]);
  messageGradient.addColorStop(1, themeColors.messageBg[1]);

  ctx.save();
  ctx.shadowColor = theme === 'dark' ? 'rgba(150, 100, 255, 0.3)' : 'rgba(200, 140, 255, 0.2)';
  ctx.shadowBlur = 20;

  ctx.fillStyle = messageGradient;
  ctx.strokeStyle = themeColors.messageBorder;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(canvasWidth/2 - 340, messageY - 60, 680, 120, 30);
  ctx.fill();

  ctx.shadowColor = themeColors.titleShadow;
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.restore();

  // Thông điệp
  ctx.save();
  ctx.font = 'italic 26px "Comic Sans MS", "Segoe UI", sans-serif';
  ctx.shadowColor = theme === 'dark' ? 'rgba(255, 200, 255, 0.4)' : 'rgba(255, 180, 255, 0.3)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = themeColors.messageText;
  ctx.textAlign = 'center';
  ctx.fillText(message, canvasWidth / 2, messageY);
  ctx.restore();

  // 11. TIÊU ĐỀ CHÍNH
  ctx.save();
  ctx.font = 'bold 48px "Impact", "Arial Black", sans-serif';

  const titleGradient = ctx.createLinearGradient(
    canvasWidth/2 - 200, 80,
    canvasWidth/2 + 200, 80
  );
  titleGradient.addColorStop(0, themeColors.titleGradient[0]);
  titleGradient.addColorStop(0.5, themeColors.titleGradient[1]);
  titleGradient.addColorStop(1, themeColors.titleGradient[2]);

  ctx.fillStyle = titleGradient;
  ctx.textAlign = 'center';

  ctx.shadowColor = heartGlowColor;
  ctx.shadowBlur = 25;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 4;

  ctx.fillText('TỈ LỆ TÌNH DUYÊN', canvasWidth / 2, 100);

  ctx.shadowColor = themeColors.titleStroke;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = themeColors.titleStroke;
  ctx.lineWidth = 4;
  ctx.strokeText('TỈ LỆ TÌNH DUYÊN', canvasWidth / 2, 100);

  ctx.shadowColor = heartGlowColor;
  ctx.shadowBlur = 15;
  ctx.strokeStyle = heartGlowColor;
  ctx.lineWidth = 2;
  ctx.strokeText('TỈ LỆ TÌNH DUYÊN', canvasWidth / 2, 100);
  ctx.restore();

  // 12. Trái tim bay xung quanh
  const heartColors = ['#ff3366', '#ff6699', '#ff99cc', '#cc66ff', '#9966ff', '#6699ff'];
  for (let i = 0; i < 12; i++) {
    const x = 50 + Math.random() * (canvasWidth - 100);
    const y = 120 + Math.random() * 150;
    const size = 20 + Math.random() * 30;
    const color = heartColors[Math.floor(Math.random() * heartColors.length)];
    const opacity = theme === 'dark' ? 0.15 + Math.random() * 0.2 : 0.2 + Math.random() * 0.3;

    ctx.save();
    ctx.globalAlpha = opacity;
    const borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.8)';
    drawHeart(ctx, x, y, size, size * 0.85, color, borderColor, 1.5);
    ctx.restore();
  }

  // Save to temp file
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = `ghepdoi_${theme}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
  const filePath = path.join(tempDir, fileName);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

// Các hàm helper
async function resizeAndCropCircle(image, size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, 0, 0, size, size);
  return canvas;
}

function drawPercentageHeart(ctx, x, y, size, percentage, color, theme = 'light', glowColor = null) {
  const heartWidth = size * 1.8;
  const heartHeight = size * 1.6;

  let bgColor1, bgColor2;
  if (theme === 'dark') {
    bgColor1 = 'rgba(50, 50, 50, 0.4)';
    bgColor2 = 'rgba(30, 30, 30, 0.2)';
  } else {
    bgColor1 = 'rgba(255, 255, 255, 0.4)';
    bgColor2 = 'rgba(240, 240, 240, 0.2)';
  }

  // Glow effect
  ctx.save();
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 60;
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = 50;
  }
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  drawHeart(ctx, x, y, heartWidth * 1.1, heartHeight * 1.1, 'rgba(255, 255, 255, 0.2)', null, 0);
  ctx.restore();

  // Background heart
  ctx.save();
  ctx.shadowColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;

  const bgGradient = ctx.createRadialGradient(x, y, 0, x, y, heartWidth/2);
  bgGradient.addColorStop(0, bgColor1);
  bgGradient.addColorStop(0.7, bgColor2);
  bgGradient.addColorStop(1, theme === 'dark' ? 'rgba(20, 20, 20, 0.1)' : 'rgba(230, 230, 230, 0.1)');

  const borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.9)';
  drawHeart(ctx, x, y, heartWidth, heartHeight, bgGradient, borderColor, 4);
  ctx.restore();

  // Fill heart
  ctx.save();
  drawHeart(ctx, x, y, heartWidth, heartHeight, null, null, 0);
  ctx.clip();

  const fillStartY = y + heartHeight * 0.5;
  const fillHeight = (percentage / 100) * heartHeight * 1.5;

  const fillGradient = ctx.createLinearGradient(x, fillStartY - fillHeight, x, fillStartY);

  if (percentage >= 80) {
    fillGradient.addColorStop(0, '#ff1a66');
    fillGradient.addColorStop(0.3, '#ff3388');
    fillGradient.addColorStop(0.6, '#ff66aa');
    fillGradient.addColorStop(1, glowColor || '#ff88cc');
  } else if (percentage >= 60) {
    fillGradient.addColorStop(0, '#ff3388');
    fillGradient.addColorStop(0.3, '#ff66aa');
    fillGradient.addColorStop(0.7, '#ff88cc');
    fillGradient.addColorStop(1, glowColor || '#ffaadd');
  } else {
    fillGradient.addColorStop(0, '#ff66aa');
    fillGradient.addColorStop(0.5, '#ff88cc');
    fillGradient.addColorStop(0.9, '#ffaadd');
    fillGradient.addColorStop(1, glowColor || '#ffccee');
  }

  ctx.fillStyle = fillGradient;

  const fillWidth = heartWidth * 0.95;
  const fillX = x - fillWidth/2;
  const fillY = fillStartY - fillHeight;

  ctx.beginPath();
  ctx.roundRect(fillX, fillY, fillWidth, fillHeight, 20);
  ctx.fill();

  ctx.restore();

  // Border heart
  const borderGradient = ctx.createLinearGradient(
    x - heartWidth/2, y - heartHeight/2,
    x + heartWidth/2, y + heartHeight/2
  );
  borderGradient.addColorStop(0, '#ffffff');
  borderGradient.addColorStop(0.5, color);
  borderGradient.addColorStop(1, '#ffffff');

  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = borderGradient;

  drawHeart(ctx, x, y, heartWidth, heartHeight, null, borderGradient, 5);

  // Light effect
  ctx.save();
  const lightSize = heartWidth * 0.12;
  ctx.beginPath();
  ctx.arc(x - heartWidth * 0.15, y - heartHeight * 0.1, lightSize, 0, Math.PI * 2);

  const lightGradient = ctx.createRadialGradient(
    x - heartWidth * 0.15, y - heartHeight * 0.1, 0,
    x - heartWidth * 0.15, y - heartHeight * 0.1, lightSize
  );
  lightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
  lightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = lightGradient;
  ctx.fill();
  ctx.restore();
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (ctx.measureText(text + '...').width > maxWidth) {
    text = text.slice(0, -1);
  }
  return text + '...';
}

function getLoveMessage(percent) {
  if (percent >= 90) return 'Hai bạn là cặp đôi hoàn hảo, cưới nhau đi!';
  if (percent >= 80) return 'Tình yêu này đẹp như mơ, hãy nắm lấy nhé!';
  if (percent >= 70) return 'Có sự kết nối mạnh mẽ, hãy thử tìm hiểu nhau!';
  if (percent >= 60) return 'Một chút duyên, một chút nợ – đủ để bắt đầu!';
  if (percent >= 50) return 'Có thể chỉ là một cái duyên nhỏ, nhưng biết đâu đó là khởi đầu?';
  if (percent >= 40) return 'Tình yêu cần thời gian, hãy cho nhau cơ hội!';
  if (percent >= 30) return 'Chưa chắc hợp, nhưng không gì là không thể!';
  if (percent >= 20) return 'Còn xa vời, nhưng không gì là không thể!';
  if (percent >= 10) return 'Tình duyên mong manh như sương sớm!';
  return 'Có lẽ bạn nên thử... người khác 😅';
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
  createPremiumHeartTemplate,
  clearImagePath
};
