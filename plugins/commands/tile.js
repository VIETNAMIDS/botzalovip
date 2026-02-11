const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');

const AUTO_DELETE_TIME = 60000;

const appendDeleteNotice = (message, ttl = AUTO_DELETE_TIME) =>
  `${message}
⏱️ Tin nhắn sẽ tự động xóa sau ${Math.floor(ttl / 1000)}s`;

async function sendWithAutoDelete(api, threadId, type, { message, attachments, mentions }, ttl = AUTO_DELETE_TIME) {
  const payload = { ttl };

  if (message) {
    payload.msg = appendDeleteNotice(message, ttl);
  }

  if (attachments?.length) {
    payload.attachments = attachments;
  }

  if (mentions?.length) {
    payload.mentions = mentions;
  }

  await api.sendMessage(payload, threadId, type);
}

async function ensureFileReady(filePath, retries = 5, delay = 120) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.isFile() && stats.size > 0) {
        return true;
      }
    } catch (err) {
      // ignore and retry
    }
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

module.exports.config = {
  name: 'tile',
  version: '2.0.0',
  role: 0,
  author: 'ShinTHL09 - Upgraded',
  description: 'Xem tỉ lệ hợp đôi giữa 2 người với giao diện đẹp',
  category: 'Giải trí',
  usage: 'tile [tag1] [tag2]',
  cooldowns: 2,
  dependencies: {
    'canvas': '',
    'axios': ''
  }
};

// Download ảnh
const downloadImage = async (url, filePath) => {
  try {
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      timeout: 10000 
    });
    await fs.promises.writeFile(filePath, response.data);
  } catch (error) {
    console.error("Lỗi tải ảnh:", error.message);
    throw error;
  }
};

// Tạo random tỉ lệ
const getRandomMatchRate = () => Math.floor(Math.random() * 101);

// Lấy màu dựa trên tỉ lệ
const getColorByRate = (rate) => {
  if (rate >= 80) return { bg: '#ff1744', text: '#ffffff', heart: '💖' };
  if (rate >= 60) return { bg: '#ff4081', text: '#ffffff', heart: '💕' };
  if (rate >= 40) return { bg: '#f48fb1', text: '#ffffff', heart: '💗' };
  if (rate >= 20) return { bg: '#f8bbd0', text: '#333333', heart: '💓' };
  return { bg: '#e1bee7', text: '#333333', heart: '💔' };
};

// Vẽ avatar tròn
const drawCircularAvatar = async (ctx, imagePath, x, y, radius) => {
  const img = await loadImage(imagePath);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
  
  // Viền avatar
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
};

// Tạo ảnh canvas
const createMatchImage = async (avatarPath1, avatarPath2, name1, name2, rate) => {
  const width = 800;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const colors = getColorByRate(rate);

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.bg);
  gradient.addColorStop(1, '#c2185b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Tiêu đề
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px "Arial"';
  ctx.textAlign = 'center';
  ctx.fillText('💕 TỈ LỆ HỢP ĐÔI 💕', width / 2, 70);

  // Avatar 1
  await drawCircularAvatar(ctx, avatarPath1, 200, 250, 100);
  
  // Avatar 2
  await drawCircularAvatar(ctx, avatarPath2, 600, 250, 100);

  // Tên người 1
  ctx.font = 'bold 28px "Arial"';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(name1.length > 15 ? name1.substring(0, 15) + '...' : name1, 200, 390);

  // Tên người 2
  ctx.fillText(name2.length > 15 ? name2.substring(0, 15) + '...' : name2, 600, 390);

  // Icon trái tim giữa
  ctx.font = '60px "Arial"';
  ctx.fillText(colors.heart, width / 2, 270);

  // Box tỉ lệ
  const boxWidth = 400;
  const boxHeight = 100;
  const boxX = (width - boxWidth) / 2;
  const boxY = 430;

  // Shadow cho box
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;

  // Vẽ box
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 20);
  ctx.fill();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Text trong box
  ctx.fillStyle = colors.bg;
  ctx.font = 'bold 50px "Arial"';
  ctx.textAlign = 'center';
  ctx.fillText(`${rate}%`, width / 2, boxY + 68);

  // Label
  ctx.font = 'bold 20px "Arial"';
  ctx.fillStyle = colors.bg;
  ctx.fillText('MỨC ĐỘ PHÙ HỢP', width / 2, boxY - 15);

  return canvas.toBuffer('image/png');
};

module.exports.run = async function({ api, event }) {
  const { threadId, type, data } = event;
  const senderId = event.data.uidFrom;
  const tempDir = path.join(__dirname, 'temp');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    const mentions = data.mentions;
    
    if (!mentions || mentions.length === 0) {
      await sendWithAutoDelete(api, threadId, type, {
        message: '❌ Cần phải tag ít nhất 1 người để xem tỉ lệ hợp nhau!'
      });
      return;
    }

    // Xác định 2 người cần so sánh
    let uid1, uid2;
    
    if (mentions.length === 1) {
      uid1 = mentions[0].uid;
      uid2 = senderId;
    } else {
      uid1 = mentions[0].uid;
      uid2 = mentions[1].uid;
    }

    // Lấy thông tin user
    const [info1, info2] = await Promise.all([
      api.getUserInfo(uid1),
      api.getUserInfo(uid2)
    ]);

    const user1 = info1.changed_profiles[uid1];
    const user2 = info2.changed_profiles[uid2];

    if (!user1 || !user2) {
      await sendWithAutoDelete(api, threadId, type, {
        message: '❌ Không thể lấy thông tin người dùng. Vui lòng thử lại!'
      });
      return;
    }

    const name1 = user1.displayName || "Unknown";
    const name2 = user2.displayName || "Unknown";

    // Download avatars
    const avatarPath1 = path.join(tempDir, `tile_${uid1}.jpg`);
    const avatarPath2 = path.join(tempDir, `tile_${uid2}.jpg`);
    
    await Promise.all([
      downloadImage(user1.avatar, avatarPath1),
      downloadImage(user2.avatar, avatarPath2)
    ]);

    // Tạo tỉ lệ random
    const matchRate = getRandomMatchRate();

    // Tạo ảnh canvas
    const resultImagePath = path.join(tempDir, `tile_result_${Date.now()}.png`);
    const imageBuffer = await createMatchImage(avatarPath1, avatarPath2, name1, name2, matchRate);
    await fs.promises.writeFile(resultImagePath, imageBuffer);

    const fileReady = await ensureFileReady(resultImagePath, 6, 150);
    if (!fileReady) {
      await sendWithAutoDelete(api, threadId, type, {
        message: '❌ Không thể tạo ảnh kết quả. Vui lòng thử lại sau!'
      });
      return;
    }

    // Tạo message text
    let emoji = '';
    if (matchRate >= 80) emoji = '🔥 PERFECT MATCH!';
    else if (matchRate >= 60) emoji = '💕 RẤT PHÙ HỢP!';
    else if (matchRate >= 40) emoji = '💗 PHÙ HỢP!';
    else if (matchRate >= 20) emoji = '💓 CÓ THỂ THỬ!';
    else emoji = '💔 KHÔNG PHÙ HỢP...';

    const text = `${emoji}\n\n👤 ${name1}\n💞\n👤 ${name2}\n\n📊 Tỉ lệ hợp đôi: ${matchRate}%`;

    // Gửi message
    await sendWithAutoDelete(api, threadId, type, {
      message: text,
      attachments: [resultImagePath],
      mentions: [
        { uid: uid1, pos: text.indexOf(name1), len: name1.length },
        { uid: uid2, pos: text.indexOf(name2), len: name2.length }
      ]
    });

    // Cleanup
    setTimeout(() => {
      [avatarPath1, avatarPath2, resultImagePath].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });
    }, AUTO_DELETE_TIME + 2000);

  } catch (err) {
    console.error("Lỗi khi xem tỉ lệ:", err);
    sendWithAutoDelete(api, threadId, type, {
      message: '❌ Đã xảy ra lỗi khi xem tỉ lệ. Vui lòng thử lại sau!'
    });
  }
};