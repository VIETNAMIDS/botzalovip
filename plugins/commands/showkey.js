module.exports.config = {
  name: "showkey",
  version: "2.0.0",
  role: 1,
  author: "Cascade & Bonz",
  description: "Bật/tắt làm nổi bật tin nhắn của chủ nhóm/admin với Canvas",
  category: "Nhóm",
  usage: "showkey [on/off|1/0]",
  cooldowns: 2
};

const { createCanvas } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const input = (args?.[0] || '').toString().toLowerCase();

  // Nếu không nhập gì hoặc sai format
  if (!input || !["on", "off", "1", "0"].includes(input)) {
    const helpImage = await createHelpImage();
    await api.sendMessage({
      msg: "⚠️ Vui lòng chọn on/off hoặc 1/0\nCú pháp: showkey [on/off|1/0]",
      attachments: [helpImage]
    }, threadId, type);
    
    setTimeout(async () => {
      try { await fs.unlink(helpImage); } catch (_) {}
    }, 5000);
    return;
  }

  const enable = input === "on" || input === "1"; // true = highlight tin nhắn admin

  try {
    await api.updateGroupSettings({ signAdminMsg: enable }, String(threadId));
    
    const statusTxt = enable 
      ? "đã BẬT hiển thị nổi bật tin nhắn của admin" 
      : "đã TẮT hiển thị nổi bật tin nhắn của admin";
    
    const notifImage = await createNotificationImage(statusTxt, enable);
    await api.sendMessage({
      msg: `✅ ${statusTxt}`,
      attachments: [notifImage]
    }, threadId, type);
    
    setTimeout(async () => {
      try { await fs.unlink(notifImage); } catch (_) {}
    }, 5000);
    
  } catch (err) {
    const errorImage = await createErrorImage(err?.message || err);
    await api.sendMessage({
      msg: `❌ Không thể cập nhật cài đặt: ${err?.message || err}`,
      attachments: [errorImage]
    }, threadId, type);
    
    setTimeout(async () => {
      try { await fs.unlink(errorImage); } catch (_) {}
    }, 5000);
  }
};

// ========== HELPER FUNCTIONS ==========

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

async function createNotificationImage(statusText, isEnabled) {
  const width = 1000;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Pattern
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let i = 0; i < width; i += 40) {
    for (let j = 0; j < height; j += 40) {
      ctx.fillRect(i, j, 20, 20);
    }
  }

  // Colors
  const color1 = isEnabled ? '#10b981' : '#ef4444';
  const color2 = isEnabled ? '#059669' : '#dc2626';
  const icon = isEnabled ? '✅' : '❌';

  // Main card
  const cardGradient = ctx.createLinearGradient(0, 80, width, 80);
  cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
  cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
  
  roundRect(ctx, 50, 80, width - 100, height - 160, 20);
  ctx.fillStyle = cardGradient;
  ctx.fill();
  
  const borderGradient = ctx.createLinearGradient(50, 80, width - 50, 80);
  borderGradient.addColorStop(0, color1);
  borderGradient.addColorStop(1, color2);
  
  roundRect(ctx, 50, 80, width - 100, height - 160, 20);
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 4;
  ctx.stroke();
  
  ctx.shadowColor = color1;
  ctx.shadowBlur = 25;
  roundRect(ctx, 50, 80, width - 100, height - 160, 20);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Icon
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = color1;
  ctx.fillText(icon, width / 2, 120);

  // Status text
  const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
  titleGradient.addColorStop(0, color1);
  titleGradient.addColorStop(1, color2);
  
  ctx.fillStyle = titleGradient;
  ctx.font = 'bold 36px Arial';
  ctx.shadowColor = color1;
  ctx.shadowBlur = 20;
  ctx.fillText(statusText.toUpperCase(), width / 2, 210);
  ctx.shadowBlur = 0;

  // Description
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('Hiển thị nổi bật tin nhắn của Admin', width / 2, 260);

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('BONZ BOT - SHOWKEY SYSTEM', width / 2, height - 25);

  const tempDir = path.join(__dirname, '../../cache');
  try {
    await fs.mkdir(tempDir, { recursive: true });
  } catch (e) {}
  
  const imagePath = path.join(tempDir, `showkey_notif_${Date.now()}.png`);
  await fs.writeFile(imagePath, canvas.toBuffer('image/png'));
  
  return imagePath;
}

async function createErrorImage(errorMsg) {
  const width = 1000;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Pattern
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let i = 0; i < width; i += 40) {
    for (let j = 0; j < height; j += 40) {
      ctx.fillRect(i, j, 20, 20);
    }
  }

  // Main card
  const cardGradient = ctx.createLinearGradient(0, 80, width, 80);
  cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
  cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
  
  roundRect(ctx, 50, 80, width - 100, height - 160, 20);
  ctx.fillStyle = cardGradient;
  ctx.fill();
  
  const borderGradient = ctx.createLinearGradient(50, 80, width - 50, 80);
  borderGradient.addColorStop(0, '#ef4444');
  borderGradient.addColorStop(1, '#dc2626');
  
  roundRect(ctx, 50, 80, width - 100, height - 160, 20);
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 4;
  ctx.stroke();
  
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 25;
  roundRect(ctx, 50, 80, width - 100, height - 160, 20);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Icon
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ef4444';
  ctx.fillText('❌', width / 2, 120);

  // Error title
  const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
  titleGradient.addColorStop(0, '#ef4444');
  titleGradient.addColorStop(1, '#dc2626');
  
  ctx.fillStyle = titleGradient;
  ctx.font = 'bold 40px Arial';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 20;
  ctx.fillText('LỖI', width / 2, 200);
  ctx.shadowBlur = 0;

  // Error message
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('Không thể cập nhật cài đặt', width / 2, 250);
  
  ctx.font = '20px Arial';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(errorMsg.substring(0, 50), width / 2, 280);

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('BONZ BOT - SHOWKEY SYSTEM', width / 2, height - 25);

  const tempDir = path.join(__dirname, '../../cache');
  try {
    await fs.mkdir(tempDir, { recursive: true });
  } catch (e) {}
  
  const imagePath = path.join(tempDir, `showkey_error_${Date.now()}.png`);
  await fs.writeFile(imagePath, canvas.toBuffer('image/png'));
  
  return imagePath;
}

async function createHelpImage() {
  const width = 1200;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(0.5, '#1e293b');
  bgGradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Pattern
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let i = 0; i < width; i += 60) {
    for (let j = 0; j < height; j += 60) {
      ctx.fillRect(i, j, 30, 30);
    }
  }

  // Header
  const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
  headerGradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
  headerGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.2)');
  headerGradient.addColorStop(1, 'rgba(250, 204, 21, 0.2)');
  
  roundRect(ctx, 50, 30, width - 100, 140, 25);
  ctx.fillStyle = headerGradient;
  ctx.fill();
  
  const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
  borderGradient.addColorStop(0, '#8b5cf6');
  borderGradient.addColorStop(0.5, '#ec4899');
  borderGradient.addColorStop(1, '#facc15');
  
  roundRect(ctx, 50, 30, width - 100, 140, 25);
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
  ctx.shadowBlur = 30;
  roundRect(ctx, 50, 30, width - 100, 140, 25);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Title
  const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
  titleGradient.addColorStop(0, '#8b5cf6');
  titleGradient.addColorStop(0.5, '#ec4899');
  titleGradient.addColorStop(1, '#facc15');
  
  ctx.fillStyle = titleGradient;
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px Arial';
  ctx.shadowColor = 'rgba(139, 92, 246, 0.8)';
  ctx.shadowBlur = 25;
  ctx.fillText('⭐ NỔI BẬT TIN NHẮN ADMIN', width / 2, 110);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('Hướng dẫn sử dụng lệnh ShowKey', width / 2, 150);

  // Info card
  const cardY = 220;
  const cardHeight = 480;
  
  const cardGradient = ctx.createLinearGradient(80, cardY, width - 80, cardY);
  cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.6)');
  cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.6)');
  
  roundRect(ctx, 80, cardY, width - 160, cardHeight, 20);
  ctx.fillStyle = cardGradient;
  ctx.fill();
  
  const cardBorderGradient = ctx.createLinearGradient(80, cardY, width - 80, cardY);
  cardBorderGradient.addColorStop(0, '#8b5cf6');
  cardBorderGradient.addColorStop(1, '#ec4899');
  
  roundRect(ctx, 80, cardY, width - 160, cardHeight, 20);
  ctx.strokeStyle = cardBorderGradient;
  ctx.lineWidth = 3;
  ctx.stroke();
  
  ctx.shadowColor = '#8b5cf6';
  ctx.shadowBlur = 20;
  roundRect(ctx, 80, cardY, width - 160, cardHeight, 20);
  ctx.stroke();
  ctx.shadowBlur = 0;

  let yPos = cardY + 60;

  // Section: Công dụng
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'left';
  ctx.font = 'bold 38px Arial';
  ctx.fillText('📌 CÔNG DỤNG', 120, yPos);
  yPos += 60;

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('Bật/tắt tính năng làm nổi bật tin nhắn', 140, yPos);
  yPos += 40;
  ctx.fillText('của Chủ nhóm và Phó nhóm', 140, yPos);
  yPos += 80;

  // Section: Lệnh
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 38px Arial';
  ctx.fillText('💡 CÚ PHÁP', 120, yPos);
  yPos += 60;

  // Commands
  const commands = [
    { cmd: 'showkey on', desc: '- Bật nổi bật tin nhắn' },
    { cmd: 'showkey off', desc: '- Tắt nổi bật tin nhắn' },
    { cmd: 'showkey 1', desc: '- Bật (cách khác)' },
    { cmd: 'showkey 0', desc: '- Tắt (cách khác)' }
  ];

  commands.forEach(item => {
    // Bullet
    const bulletGradient = ctx.createRadialGradient(145, yPos - 8, 0, 145, yPos - 8, 8);
    bulletGradient.addColorStop(0, '#10b981');
    bulletGradient.addColorStop(1, '#059669');
    
    ctx.fillStyle = bulletGradient;
    ctx.beginPath();
    ctx.arc(145, yPos - 8, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Command
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(item.cmd, 170, yPos);
    
    // Description
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(item.desc, 170 + ctx.measureText(item.cmd).width + 15, yPos);
    
    yPos += 45;
  });

  // Footer
  const footerY = height - 80;
  const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
  footerGradient.addColorStop(0, 'rgba(139, 92, 246, 0.15)');
  footerGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.15)');
  footerGradient.addColorStop(1, 'rgba(250, 204, 21, 0.15)');
  
  roundRect(ctx, 50, footerY, width - 100, 60, 20);
  ctx.fillStyle = footerGradient;
  ctx.fill();
  
  roundRect(ctx, 50, footerY, width - 100, 60, 20);
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 3;
  ctx.stroke();
  
  const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
  footerTextGradient.addColorStop(0, '#8b5cf6');
  footerTextGradient.addColorStop(0.5, '#ec4899');
  footerTextGradient.addColorStop(1, '#facc15');
  
  ctx.fillStyle = footerTextGradient;
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px Arial';
  ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
  ctx.shadowBlur = 15;
  ctx.fillText('💎 BONZ MÃI ĐẸP TRAI - 0785000270', width / 2, footerY + 40);
  ctx.shadowBlur = 0;

  const tempDir = path.join(__dirname, '../../cache');
  try {
    await fs.mkdir(tempDir, { recursive: true });
  } catch (e) {}
  
  const imagePath = path.join(tempDir, `showkey_help_${Date.now()}.png`);
  await fs.writeFile(imagePath, canvas.toBuffer('image/png'));
  
  return imagePath;
}