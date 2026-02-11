const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { createCanvas } = require('canvas');

// Định nghĩa màu sắc
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[91m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  blue: "\x1b[94m",
  cyan: "\x1b[96m",
  white: "\x1b[97m",
  bold: "\x1b[1m"
};

module.exports.config = {
  name: "bot",
  version: "3.3.0",
  role: 2,
  author: "Bonz",
  description: "Bật/tắt bot hoàn toàn - chỉ admin (Auto delete messages)",
  category: "Hệ thống",
  usage: "bot [meo/off/on]",
  cooldowns: 1
};

// Thời gian xóa file (milliseconds)
const AUTO_DELETE_TIME = 60000; // 60 giây

const appendDeleteNotice = (message, ttl = AUTO_DELETE_TIME) =>
  `${message}\n⏱️ Tin nhắn sẽ tự động xóa sau ${Math.floor(ttl / 1000)}s`;

async function sendTextWithAutoDelete(api, threadId, type, message, deleteAfter = AUTO_DELETE_TIME) {
  try {
    const sentMessage = await api.sendMessage({
      msg: appendDeleteNotice(message, deleteAfter),
      ttl: deleteAfter
    }, threadId, type);

    console.log(`[BOT] 📤 Đã gửi tin nhắn với TTL ${deleteAfter / 1000}s`);
    return { messageId: sentMessage?.messageId };
  } catch (error) {
    console.error('[BOT] ❌ Lỗi gửi tin nhắn auto delete:', error.message || error);
    throw error;
  }
}

async function sendImageWithAutoDelete(api, threadId, type, message, buffer, deleteAfter = AUTO_DELETE_TIME) {
  let imagePath = null;

  try {
    const tempDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log(`[BOT] 📁 Tạo thư mục cache: ${tempDir}`);
    }

    imagePath = path.join(tempDir, `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`);
    fs.writeFileSync(imagePath, buffer);
    console.log(`[BOT] 💾 Đã tạo file: ${path.basename(imagePath)}`);

    // Gửi tin nhắn với TTL (tự động xóa tin nhắn)
    const sentMessage = await api.sendMessage({
      msg: appendDeleteNotice(message, deleteAfter),
      attachments: [imagePath],
      ttl: deleteAfter // Tự động xóa tin nhắn sau deleteAfter milliseconds
    }, threadId, type);

    console.log(`[BOT] 📤 Đã gửi ảnh với TTL ${deleteAfter/1000}s`);

    // Tự động xóa FILE ảnh sau thời gian chỉ định
    setTimeout(() => {
      if (!imagePath) {
        console.log(`[BOT] ⚠️ Không có imagePath để xóa`);
        return;
      }

      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log(`[BOT] ✅ Đã xóa file: ${path.basename(imagePath)}`);
        } else {
          console.log(`[BOT] ⚠️ File không tồn tại: ${path.basename(imagePath)}`);
        }
      } catch (err) {
        console.error(`[BOT] ❌ Lỗi xóa file ${path.basename(imagePath)}:`, err.message);
      }
    }, deleteAfter);

    return { imagePath, messageId: sentMessage?.messageId };
  } catch (error) {
    console.error('[BOT] ❌ Lỗi gửi ảnh:', error);

    // Nếu có lỗi, thử xóa file ngay
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
        console.log(`[BOT] 🗑️ Đã xóa file do lỗi: ${path.basename(imagePath)}`);
      } catch (e) {
        console.error(`[BOT] ❌ Không thể xóa file lỗi:`, e.message);
      }
    }

    throw error;
  }
}

async function createBotImage(status = 'online', mode = 'status') {
  const width = 1000;
  const height = mode === 'status' ? 640 : 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const accent = status === 'online' ? '#10b981' : '#ef4444';
  const accentDark = status === 'online' ? '#047857' : '#b91c1c';

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.5, '#1f2937');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const drawRoundedRect = (x, y, w, h, r) => {
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
  };

  // Header
  drawRoundedRect(50, 40, width - 100, 120, 20);
  const headerGradient = ctx.createLinearGradient(50, 40, width - 50, 160);
  headerGradient.addColorStop(0, accent + '33');
  headerGradient.addColorStop(1, accentDark + '33');
  ctx.fillStyle = headerGradient;
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  drawRoundedRect(50, 40, width - 100, 120, 20);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.shadowColor = accent + '99';
  ctx.shadowBlur = 18;
  ctx.fillText('🤖 BOT CONTROL', width / 2, 115);
  ctx.shadowBlur = 0;

  if (mode === 'status') {
    // Status card
    drawRoundedRect(80, 200, width - 160, 180, 20);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fill();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    drawRoundedRect(80, 200, width - 160, 180, 20);
    ctx.stroke();

    ctx.font = 'bold 70px Arial';
    ctx.fillStyle = accent;
    ctx.fillText(status === 'online' ? '✅' : '❌', width / 2, 260);

    ctx.font = 'bold 40px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(status === 'online' ? 'BOT ĐANG HOẠT ĐỘNG' : 'BOT ĐANG TẮT', width / 2, 320);

    // Command list
    drawRoundedRect(80, 420, width - 160, 150, 18);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 2;
    drawRoundedRect(80, 420, width - 160, 150, 18);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = '#d1d5db';
    ctx.fillText('📋 LỆNH HỖ TRỢ', 110, 465);

    ctx.font = '24px Arial';
    ctx.fillStyle = '#a5f3fc';
    ctx.fillText('• bot on', 120, 510);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText('- Bật bot cho tất cả mọi người', 220, 510);

    ctx.fillStyle = '#fecaca';
    ctx.fillText('• bot meo / bot off', 120, 550);
    ctx.fillStyle = '#fee2e2';
    ctx.fillText('- Tắt bot (chỉ admin)', 320, 550);
  } else {
    const isOn = mode === 'turned_on';
    drawRoundedRect(70, 200, width - 140, 220, 24);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fill();

    ctx.strokeStyle = isOn ? '#34d399' : '#f87171';
    ctx.lineWidth = 3;
    drawRoundedRect(70, 200, width - 140, 220, 24);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 80px Arial';
    ctx.fillStyle = isOn ? '#34d399' : '#f87171';
    ctx.fillText(isOn ? '🚀' : '😴', width / 2, 270);

    ctx.font = 'bold 46px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(isOn ? 'BOT ĐÃ BẬT!' : 'BOT ĐÃ TẮT!', width / 2, 335);

    ctx.font = '24px Arial';
    ctx.fillStyle = isOn ? '#bbf7d0' : '#fecaca';
    ctx.fillText(
      isOn ? '✅ Bot sẽ phản hồi tất cả các lệnh' : '🔒 Bot đã ngủ, dùng "bot on" để bật lại',
      width / 2,
      380
    );
  }

  // Footer
  drawRoundedRect(70, height - 90, width - 140, 60, 18);
  const footerGradient = ctx.createLinearGradient(70, height - 90, width - 70, height - 30);
  footerGradient.addColorStop(0, accent + '22');
  footerGradient.addColorStop(1, accentDark + '22');
  ctx.fillStyle = footerGradient;
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  drawRoundedRect(70, height - 90, width - 140, 60, 18);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = '20px Arial';
  ctx.fillStyle = '#cbd5f5';
  ctx.fillText('💎 BONZ MÃI ĐẸP TRAI - 0785000270', width / 2, height - 52);

  return canvas.toBuffer('image/png');
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const userId = event.data?.uidFrom || event.senderID;
  const input = (args?.[0] || '').toString().toLowerCase();

  // Kiểm tra trạng thái bot hiện tại
  const isOffline = global.config?.bot_offline === true;

  if (!input) {
    try {
      const buffer = await createBotImage(isOffline ? 'offline' : 'online', 'status');
      await sendImageWithAutoDelete(
        api,
        threadId,
        type,
        `🤖 Trạng thái bot: ${isOffline ? 'TẮT' : 'BẬT'}`,
        buffer
      );
    } catch (error) {
      console.error('Error creating bot status image:', error);
      await sendTextWithAutoDelete(api, threadId, type, '❌ Lỗi khi tạo ảnh status');
      return;
    }
    return;
  }

  if (input === "meo" || input === "off") {
    // Chỉ admin mới tắt được bot
    const isAdmin = global.users?.admin?.includes(userId.toString()) || 
                   global.users?.owner_bot?.includes(userId.toString()) ||
                   global.config?.admin_bot?.includes(userId.toString()) ||
                   global.config?.owner_bot?.includes(userId.toString());

    if (!isAdmin) {
      await sendTextWithAutoDelete(api, threadId, type, `${colors.red}❌ Chỉ admin mới có thể tắt bot!${colors.reset}`);
      return;
    }

    try {
      // Cập nhật global config
      global.config.bot_offline = true;

      // Cập nhật file config.yml
      const configPath = path.join(__dirname, '../../config.yml');
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(fileContent);
      
      config.bot_offline = true;
      
      const updatedYaml = YAML.stringify(config);
      fs.writeFileSync(configPath, updatedYaml, 'utf8');

      // Tạo và gửi ảnh với auto delete
      const buffer = await createBotImage('offline', 'turned_off');
      await sendImageWithAutoDelete(api, threadId, type, '😴 Bot đã tắt', buffer);

      console.log(`[BOT] ✅ Bot đã tắt bởi user ${userId}`);
      return;
    } catch (err) {
      await sendTextWithAutoDelete(api, threadId, type, `❌ Lỗi khi tắt bot: ${err?.message || err}`);
      return;
    }
  }
  else if (input === "on") {
    try {
      // Cập nhật global config
      global.config.bot_offline = false;

      // Cập nhật file config.yml
      const configPath = path.join(__dirname, '../../config.yml');
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(fileContent);
      
      config.bot_offline = false;
      
      const updatedYaml = YAML.stringify(config);
      fs.writeFileSync(configPath, updatedYaml, 'utf8');

      // Tạo và gửi ảnh với auto delete
      const buffer = await createBotImage('online', 'turned_on');
      await sendImageWithAutoDelete(api, threadId, type, '🚀 Bot đã bật', buffer);

      console.log(`[BOT] ✅ Bot đã bật bởi user ${userId}`);
      return;
    } catch (err) {
      await sendTextWithAutoDelete(api, threadId, type, `❌ Lỗi khi bật bot: ${err?.message || err}`);
      return;
    }
  }
  else {
    try {
      const buffer = await createBotImage(isOffline ? 'offline' : 'online', 'status');
      await sendImageWithAutoDelete(
        api,
        threadId,
        type,
        '⚠️ Lệnh không hợp lệ',
        buffer
      );
    } catch (error) {
      console.error('Error creating bot image:', error);
      await sendTextWithAutoDelete(api, threadId, type, '❌ Lỗi khi tạo ảnh');
      return;
    }
  }
};