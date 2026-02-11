const fs = require("fs").promises;
const { createCanvas } = require("canvas");

module.exports.config = {
  name: "lockview",
  version: "3.0.0",
  role: 1,
  author: "Cascade + Premium Design by AI",
  description: "Bật/tắt chặn xem danh sách thành viên với thiết kế siêu đẹp",
  category: "Nhóm",
  usage: "lockview [on/off|1/0]",
  cooldowns: 2,
  dependencies: {
    "canvas": ""
  }
};

// Hàm vẽ glassmorphism effect
function drawGlassCard(ctx, x, y, width, height, radius) {
  ctx.save();
  
  // Background blur effect
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 20;
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  
  // Border gradient
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.roundRect(x, y, width, height, radius);
  ctx.stroke();
  
  ctx.restore();
}

// Vẽ particle effects
function drawParticles(ctx, centerX, centerY, color, count = 20) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const distance = 150 + Math.random() * 50;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    const size = 3 + Math.random() * 5;
    
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Tạo ảnh khi khoá/mở view member - PREMIUM VERSION
async function createLockViewImage(isLocked) {
  const canvas = createCanvas(1400, 900);
  const ctx = canvas.getContext('2d');

  // Ultra gradient background
  const gradient = ctx.createRadialGradient(700, 450, 100, 700, 450, 800);
  if (isLocked) {
    gradient.addColorStop(0, '#ff0844');
    gradient.addColorStop(0.3, '#8e2de2');
    gradient.addColorStop(0.6, '#4a00e0');
    gradient.addColorStop(1, '#000428');
  } else {
    gradient.addColorStop(0, '#00f2fe');
    gradient.addColorStop(0.3, '#4facfe');
    gradient.addColorStop(0.6, '#0093E9');
    gradient.addColorStop(1, '#0f2027');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1400, 900);

  // Animated circles background
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 5; i++) {
    const x = 200 + i * 250;
    const y = 200 + (i % 2) * 300;
    const radius = 150 + i * 30;
    
    ctx.strokeStyle = isLocked ? '#ff0844' : '#00f2fe';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Main glass card
  drawGlassCard(ctx, 100, 100, 1200, 700, 50);

  // Particles effect
  drawParticles(ctx, 700, 350, isLocked ? 'rgba(255, 8, 68, 0.6)' : 'rgba(0, 242, 254, 0.6)');

  // Giant 3D Eye Icon
  const centerX = 700;
  const centerY = 350;

  if (isLocked) {
    // 3D Blocked Eye with shadow
    ctx.save();
    
    // Shadow layer
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(centerX + 10, centerY + 10, 140, 85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    
    // Eye base (3D effect with gradient)
    const eyeGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 140);
    eyeGradient.addColorStop(0, '#ff0844');
    eyeGradient.addColorStop(0.5, '#8e2de2');
    eyeGradient.addColorStop(1, '#4a00e0');
    
    ctx.fillStyle = eyeGradient;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 140, 85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Inner eye circle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 100, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupil with glow
    ctx.shadowColor = '#ff0844';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 45, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(centerX - 15, centerY - 15, 18, 0, Math.PI * 2);
    ctx.fill();
    
    // Diagonal slash with glow
    ctx.shadowColor = '#ff0844';
    ctx.shadowBlur = 40;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 35;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX - 170, centerY - 120);
    ctx.lineTo(centerX + 170, centerY + 120);
    ctx.stroke();
    
    ctx.shadowBlur = 0;
    ctx.restore();
    
    // Glitch effect bars
    ctx.fillStyle = 'rgba(255, 8, 68, 0.3)';
    ctx.fillRect(centerX - 200, centerY - 30, 400, 10);
    ctx.fillRect(centerX - 150, centerY + 50, 300, 8);
    
  } else {
    // 3D Open Eye with sparkle
    ctx.save();
    
    // Shadow layer
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(centerX + 10, centerY + 10, 140, 85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    
    // Eye base (3D effect with gradient)
    const eyeGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 140);
    eyeGradient.addColorStop(0, '#00f2fe');
    eyeGradient.addColorStop(0.5, '#4facfe');
    eyeGradient.addColorStop(1, '#0093E9');
    
    ctx.fillStyle = eyeGradient;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 140, 85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Inner eye circle with gradient
    const innerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 60);
    innerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 100, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupil with glow
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 45, 0, Math.PI * 2);
    ctx.fill();
    
    // Multiple highlights for sparkle
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(centerX - 18, centerY - 18, 20, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(centerX + 12, centerY - 8, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Sparkle stars around eye
    const sparkles = [
      {x: centerX - 180, y: centerY - 100, size: 25},
      {x: centerX + 180, y: centerY - 80, size: 20},
      {x: centerX - 160, y: centerY + 90, size: 18},
      {x: centerX + 170, y: centerY + 100, size: 22}
    ];
    
    ctx.fillStyle = '#ffffff';
    sparkles.forEach(sparkle => {
      // Four-pointed star
      ctx.save();
      ctx.translate(sparkle.x, sparkle.y);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, -sparkle.size);
        ctx.lineTo(0, sparkle.size);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.restore();
    });
    
    ctx.restore();
  }

  // 3D Member silhouettes with depth
  const silhouetteY = centerY + 160;
  const silhouettes = [
    {x: centerX - 200, scale: 0.8, opacity: isLocked ? 0.2 : 0.8},
    {x: centerX - 100, scale: 0.9, opacity: isLocked ? 0.15 : 0.9},
    {x: centerX, scale: 1.0, opacity: isLocked ? 0.1 : 1.0},
    {x: centerX + 100, scale: 0.9, opacity: isLocked ? 0.15 : 0.9},
    {x: centerX + 200, scale: 0.8, opacity: isLocked ? 0.2 : 0.8}
  ];

  silhouettes.forEach(s => {
    ctx.save();
    ctx.globalAlpha = s.opacity;
    
    const baseSize = 30 * s.scale;
    const bodySize = 40 * s.scale;
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(s.x + 3, silhouetteY + 3, baseSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Head with gradient
    const headGradient = ctx.createRadialGradient(s.x, silhouetteY, 0, s.x, silhouetteY, baseSize);
    headGradient.addColorStop(0, isLocked ? '#8e2de2' : '#4facfe');
    headGradient.addColorStop(1, isLocked ? '#4a00e0' : '#0093E9');
    ctx.fillStyle = headGradient;
    ctx.beginPath();
    ctx.arc(s.x, silhouetteY, baseSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Body
    ctx.beginPath();
    ctx.arc(s.x, silhouetteY + baseSize * 1.8, bodySize, Math.PI, 0, true);
    ctx.fill();
    
    ctx.restore();
  });

  // Frosted glass status container
  ctx.save();
  drawGlassCard(ctx, 250, 570, 900, 180, 30);
  
  // Status text with glow
  ctx.textAlign = 'center';
  ctx.shadowColor = isLocked ? '#ff0844' : '#00f2fe';
  ctx.shadowBlur = 20;
  
  ctx.font = 'bold 90px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(isLocked ? '🚫 ĐANG CHẶN' : '✨ CHO PHÉP', 700, 650);
  
  ctx.shadowBlur = 0;
  
  // Description
  ctx.font = '38px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  const description = isLocked 
    ? 'Không thể xem danh sách thành viên'
    : 'Có thể xem danh sách thành viên đầy đủ';
  ctx.fillText(description, 700, 705);
  
  ctx.restore();

  // Badge style footer
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.roundRect(500, 810, 400, 50, 25);
  ctx.fill();
  
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.textAlign = 'center';
  ctx.fillText('💫 BONZ MÃI VIP 💫', 700, 845);

  return canvas.toBuffer('image/png');
}

// Tạo ảnh help - PREMIUM VERSION
async function createLockViewHelpImage() {
  const canvas = createCanvas(1400, 1100);
  const ctx = canvas.getContext('2d');

  // Ultra gradient background
  const gradient = ctx.createLinearGradient(0, 0, 1400, 1100);
  gradient.addColorStop(0, '#fc466b');
  gradient.addColorStop(0.3, '#3f5efb');
  gradient.addColorStop(0.6, '#00f2fe');
  gradient.addColorStop(1, '#4facfe');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1400, 1100);

  // Decorative circles
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(200 + i * 150, 200 + (i % 2) * 400, 100 + i * 20, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Main glass card
  drawGlassCard(ctx, 100, 80, 1200, 940, 50);

  // Header with icon
  ctx.font = 'bold 70px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 20;
  ctx.fillText('👁️ LOCKVIEW GUIDE', 700, 180);
  ctx.shadowBlur = 0;

  // Subtitle badge
  ctx.fillStyle = 'rgba(255, 193, 7, 0.25)';
  ctx.roundRect(450, 200, 500, 50, 25);
  ctx.fill();
  
  ctx.font = '28px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Community Groups Only', 700, 235);

  let currentY = 320;

  // Commands in modern cards
  const commands = [
    { cmd: 'lockview on', desc: 'Chặn xem danh sách thành viên', icon: '🚫', color: '#ff0844' },
    { cmd: 'lockview off', desc: 'Cho phép xem danh sách', icon: '✅', color: '#00f2fe' },
    { cmd: 'lockview 1', desc: 'Chặn (tương đương on)', icon: '🔒', color: '#8e2de2' },
    { cmd: 'lockview 0', desc: 'Cho phép (tương đương off)', icon: '🔓', color: '#4facfe' }
  ];

  commands.forEach((cmd, index) => {
    // Command card with gradient
    const cardGradient = ctx.createLinearGradient(200, currentY, 1200, currentY + 80);
    cardGradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    cardGradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
    
    ctx.fillStyle = cardGradient;
    ctx.roundRect(200, currentY, 1000, 80, 20);
    ctx.fill();
    
    // Border glow
    ctx.strokeStyle = `${cmd.color}40`;
    ctx.lineWidth = 2;
    ctx.roundRect(200, currentY, 1000, 80, 20);
    ctx.stroke();

    // Icon
    ctx.font = '40px Arial';
    ctx.fillStyle = cmd.color;
    ctx.textAlign = 'left';
    ctx.fillText(cmd.icon, 230, currentY + 52);

    // Command text
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cmd.cmd, 300, currentY + 50);

    // Description
    ctx.font = '26px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(cmd.desc, 550, currentY + 50);

    currentY += 105;
  });

  // Info comparison boxes
  currentY += 30;
  const boxWidth = 520;
  const boxHeight = 200;
  const boxSpacing = 60;
  const boxStartX = (1400 - (boxWidth * 2 + boxSpacing)) / 2;

  // Locked box
  const lockedGradient = ctx.createLinearGradient(boxStartX, currentY, boxStartX, currentY + boxHeight);
  lockedGradient.addColorStop(0, 'rgba(255, 8, 68, 0.3)');
  lockedGradient.addColorStop(1, 'rgba(142, 45, 226, 0.3)');
  ctx.fillStyle = lockedGradient;
  ctx.roundRect(boxStartX, currentY, boxWidth, boxHeight, 25);
  ctx.fill();
  
  ctx.strokeStyle = 'rgba(255, 8, 68, 0.5)';
  ctx.lineWidth = 3;
  ctx.roundRect(boxStartX, currentY, boxWidth, boxHeight, 25);
  ctx.stroke();

  ctx.font = '60px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('👁️‍🗨️', boxStartX + boxWidth / 2, currentY + 75);

  ctx.font = 'bold 32px Arial';
  ctx.fillText('TRẠNG THÁI CHẶN', boxStartX + boxWidth / 2, currentY + 125);

  ctx.font = '24px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText('Chỉ Admin xem được', boxStartX + boxWidth / 2, currentY + 160);
  ctx.fillText('danh sách đầy đủ', boxStartX + boxWidth / 2, currentY + 190);

  // Unlocked box
  const unlockedGradient = ctx.createLinearGradient(boxStartX + boxWidth + boxSpacing, currentY, boxStartX + boxWidth + boxSpacing, currentY + boxHeight);
  unlockedGradient.addColorStop(0, 'rgba(0, 242, 254, 0.3)');
  unlockedGradient.addColorStop(1, 'rgba(79, 172, 254, 0.3)');
  ctx.fillStyle = unlockedGradient;
  ctx.roundRect(boxStartX + boxWidth + boxSpacing, currentY, boxWidth, boxHeight, 25);
  ctx.fill();
  
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.5)';
  ctx.lineWidth = 3;
  ctx.roundRect(boxStartX + boxWidth + boxSpacing, currentY, boxWidth, boxHeight, 25);
  ctx.stroke();

  ctx.font = '60px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('👁️', boxStartX + boxWidth + boxSpacing + boxWidth / 2, currentY + 75);

  ctx.font = 'bold 32px Arial';
  ctx.fillText('TRẠNG THÁI CHO PHÉP', boxStartX + boxWidth + boxSpacing + boxWidth / 2, currentY + 125);

  ctx.font = '24px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText('Tất cả thành viên đều', boxStartX + boxWidth + boxSpacing + boxWidth / 2, currentY + 160);
  ctx.fillText('xem được danh sách', boxStartX + boxWidth + boxSpacing + boxWidth / 2, currentY + 190);

  // Warning banner
  currentY += 250;
  const warningGradient = ctx.createLinearGradient(250, currentY, 1150, currentY);
  warningGradient.addColorStop(0, 'rgba(255, 193, 7, 0.3)');
  warningGradient.addColorStop(1, 'rgba(255, 152, 0, 0.3)');
  ctx.fillStyle = warningGradient;
  ctx.roundRect(250, currentY, 900, 80, 20);
  ctx.fill();
  
  ctx.strokeStyle = 'rgba(255, 193, 7, 0.6)';
  ctx.lineWidth = 2;
  ctx.roundRect(250, currentY, 900, 80, 20);
  ctx.stroke();

  ctx.font = 'bold 30px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('⚠️ Chỉ hoạt động với Community Groups', 700, currentY + 50);

  // Premium footer
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.roundRect(550, 1010, 300, 50, 25);
  ctx.fill();
  
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText('💫 BONZ MÃI VIP 💫', 700, 1045);

  return canvas.toBuffer('image/png');
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const input = (args?.[0] || '').toString().toLowerCase();

  if (!input || input === 'help' || input === 'h') {
    try {
      const imageBuffer = await createLockViewHelpImage();
      const imageFileName = `lockview_help_premium_${Date.now()}.png`;
      await fs.writeFile(imageFileName, imageBuffer);
      
      await api.sendMessage({
        msg: "✨ Hướng dẫn sử dụng Lockview - Premium Edition",
        attachments: [imageFileName]
      }, threadId, type);
      
      setTimeout(async () => {
        try { await fs.unlink(imageFileName); } catch (_) {}
      }, 30000);
      return;
    } catch (error) {
      console.error('Error creating help image:', error);
      return api.sendMessage(
        "⚠️ Vui lòng chọn on/off hoặc 1/0\nCú pháp: lockview [on/off|1/0]",
        threadId,
        type
      );
    }
  }

  if (!["on", "off", "1", "0"].includes(input)) {
    return api.sendMessage(
      "⚠️ Vui lòng chọn on/off hoặc 1/0\nCú pháp: lockview [on/off|1/0]",
      threadId,
      type
    );
  }

  const enable = input === "on" || input === "1";

  try {
    await api.updateGroupSettings({ lockViewMember: enable }, String(threadId));
    
    try {
      const imageBuffer = await createLockViewImage(enable);
      const imageFileName = `lockview_premium_${enable ? 'locked' : 'unlocked'}_${Date.now()}.png`;
      await fs.writeFile(imageFileName, imageBuffer);
      
      const statusTxt = enable 
        ? "✨ Đã chặn xem danh sách thành viên!" 
        : "✨ Đã cho phép xem danh sách thành viên!";
      
      await api.sendMessage({
        msg: statusTxt,
        attachments: [imageFileName]
      }, threadId, type);
      
      setTimeout(async () => {
        try { await fs.unlink(imageFileName); } catch (_) {}
      }, 30000);
    } catch (imgError) {
      console.error('Error creating lockview image:', imgError);
      const statusTxt = enable 
        ? "✅ Đã CHẶN xem danh sách thành viên" 
        : "✅ Đã CHO PHÉP xem danh sách thành viên";
      return api.sendMessage(statusTxt, threadId, type);
    }
  } catch (err) {
    return api.sendMessage(`❌ Không thể cập nhật cài đặt: ${err?.message || err}`, threadId, type);
  }
};