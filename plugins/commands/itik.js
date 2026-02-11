const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const sharp = require("sharp");

const AUTO_DELETE_TIME = 60000;
const CACHE_DIR = path.join(__dirname, "../../cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

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

  return api.sendMessage(payload, threadId, type);
}

async function ensureFileReady(filePath, retries = 5, delay = 120) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.isFile() && stats.size > 0) {
        return true;
      }
    } catch (_) {
      // ignore and retry
    }

    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return false;
}

module.exports.config = {
  name: "itik",
  version: "1.1.0",
  role: 0,
  author: "NLam182 (Zeid_Team) - Enhanced by Bonz",
  description: "Xem thông tin TikTok với tự xóa tin nhắn",
  category: "Tiện ích",
  usage: "itik <username>",
  cooldowns: 2,
  dependencies: {
    "canvas": "",
    "sharp": ""
  }
};

module.exports.run = async function({ args, event, api, Users }) {
  const { threadId, type } = event;

  if (!args[0]) {
    return sendWithAutoDelete(api, threadId, type, {
      message: '⚠️ Vui lòng nhập username để lấy thông tin.\n💡 Ví dụ: itik @username'
    });
  }

  const username = String(args[0]).replace(/^@+/, '');

  try {
    const makeUrl = (u, at = true) => `https://api.zeidteam.xyz/tiktok/user-info?username=${at ? '@' : ''}${u}`;
    let response;
    try {
      response = await axios.get(makeUrl(username, true), { timeout: 15000 });
    } catch (_) {
      response = await axios.get(makeUrl(username, false), { timeout: 15000 });
    }

    if (response?.data && (response.data.code === 0 || response.data.success === true)) {
      const ud = response.data?.data?.user || {};
      const st = response.data?.data?.stats || {};

      // Format số với dấu phẩy
      const formatNumber = (num) => {
        if (!num && num !== 0) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      };

      // Tạo canvas
      const canvas = createCanvas(1200, 1600);
      const ctx = canvas.getContext('2d');

      // Gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, 1600);
      gradient.addColorStop(0, '#FF0050');
      gradient.addColorStop(0.5, '#00F2EA');
      gradient.addColorStop(1, '#000000');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1200, 1600);

      // White card background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.roundRect(50, 50, 1100, 1500, 30);
      ctx.fill();

      // Header với icon TikTok
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 60px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🎵 TIKTOK INFO', 600, 150);

      // Load và vẽ avatar
      let avatarY = 220;
      const imageUrl = ud.avatarMedium || ud.avatarLarger || ud.avatarThumb;
      if (imageUrl) {
        try {
          // Download avatar
          const avatarResponse = await axios.get(imageUrl, { 
            responseType: 'arraybuffer',
            timeout: 15000 
          });
          
          // Convert sang PNG bằng sharp (hỗ trợ mọi format: webp, avif, jpg, png...)
          const pngBuffer = await sharp(Buffer.from(avatarResponse.data))
            .resize(200, 200, { fit: 'cover' })
            .png()
            .toBuffer();

          const tempAvatarFile = path.join(CACHE_DIR, `temp_avatar_${username}_${Date.now()}.png`);
          await fs.promises.writeFile(tempAvatarFile, pngBuffer);

          // Load từ file PNG
          const avatar = await loadImage(tempAvatarFile);
          
          // Vẽ viền avatar
          ctx.save();
          ctx.beginPath();
          ctx.arc(600, avatarY + 100, 105, 0, Math.PI * 2);
          ctx.strokeStyle = '#FF0050';
          ctx.lineWidth = 8;
          ctx.stroke();
          
          // Vẽ avatar tròn
          ctx.beginPath();
          ctx.arc(600, avatarY + 100, 100, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(avatar, 500, avatarY, 200, 200);
          ctx.restore();
          
          // Xóa file tạm
          try { await fs.promises.unlink(tempAvatarFile); } catch (_) {}
          
          avatarY += 220;
        } catch (e) {
          console.log('Avatar load error:', e);
          avatarY = 220; // Không có avatar thì bỏ qua
        }
      }

      // Tên & Username
      let currentY = avatarY + (imageUrl ? 20 : 80);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 56px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(ud.nickname || 'Unknown', 600, currentY);
      
      currentY += 60;
      ctx.font = '36px Arial';
      ctx.fillStyle = '#666666';
      const usernameText = '@' + (ud.uniqueId || username);
      ctx.fillText(usernameText, 600, currentY);
      
      if (ud.verified) {
        const textWidth = ctx.measureText(usernameText).width;
        ctx.fillStyle = '#FF0050';
        ctx.font = 'bold 36px Arial';
        ctx.fillText(' ✓', 600 + textWidth / 2 + 10, currentY);
      }

      // Tiểu sử
      if (ud.signature) {
        currentY += 60;
        ctx.font = '28px Arial';
        ctx.fillStyle = '#444444';
        ctx.textAlign = 'center';
        const maxWidth = 1000;
        const lines = wrapText(ctx, ud.signature, maxWidth);
        lines.slice(0, 3).forEach(line => {
          ctx.fillText(line, 600, currentY);
          currentY += 40;
        });
      }

      // Stats boxes
      currentY += 60;
      const statBoxWidth = 250;
      const statBoxHeight = 150;
      const statSpacing = 50;
      const startX = (1200 - (statBoxWidth * 4 + statSpacing * 3)) / 2;

      const stats = [
        { label: 'Followers', value: formatNumber(st.followerCount), emoji: '👥', color: '#FF0050' },
        { label: 'Following', value: formatNumber(st.followingCount), emoji: '🫂', color: '#00F2EA' },
        { label: 'Hearts', value: formatNumber(st.heartCount), emoji: '❤️', color: '#FF0050' },
        { label: 'Videos', value: formatNumber(st.videoCount), emoji: '🎬', color: '#00F2EA' }
      ];

      stats.forEach((stat, index) => {
        const x = startX + (statBoxWidth + statSpacing) * index;
        
        // Box background
        ctx.fillStyle = stat.color;
        ctx.globalAlpha = 0.1;
        ctx.roundRect(x, currentY, statBoxWidth, statBoxHeight, 20);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Emoji
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(stat.emoji, x + statBoxWidth / 2, currentY + 60);

        // Value
        ctx.font = 'bold 36px Arial';
        ctx.fillStyle = '#000000';
        ctx.fillText(stat.value, x + statBoxWidth / 2, currentY + 105);

        // Label
        ctx.font = '20px Arial';
        ctx.fillStyle = '#666666';
        ctx.fillText(stat.label, x + statBoxWidth / 2, currentY + 135);
      });

      // Info section
      currentY += 220;
      ctx.textAlign = 'left';
      const infoX = 150;

      const infos = [
        { label: '🆔 ID:', value: ud.id || '—' },
        { label: '🔒 Trạng thái:', value: ud.privateAccount ? 'Riêng tư' : 'Công khai' },
        { label: '👶 Độ tuổi:', value: ud.isUnderAge18 ? 'Dưới 18' : 'Trên 18' }
      ];

      if (ud.ins_id) infos.push({ label: '📷 Instagram:', value: ud.ins_id });
      if (ud.twitter_id) infos.push({ label: '🐦 Twitter:', value: ud.twitter_id });
      if (ud.youtube_channel_title) infos.push({ label: '▶️ YouTube:', value: ud.youtube_channel_title });

      ctx.font = '28px Arial';
      infos.forEach(info => {
        ctx.fillStyle = '#666666';
        ctx.fillText(info.label, infoX, currentY);
        ctx.fillStyle = '#000000';
        ctx.fillText(info.value, infoX + 280, currentY);
        currentY += 50;
      });

      // Footer
      currentY = 1480;
      ctx.font = 'bold 24px Arial';
      ctx.fillStyle = '#999999';
      ctx.textAlign = 'center';
      ctx.fillText('💫 Bonz Mãi VIP', 600, currentY);

      // Save image
      const buffer = canvas.toBuffer('image/png');
      const imageFileName = path.join(CACHE_DIR, `tiktok_${username}_${Date.now()}.png`);
      await fs.promises.writeFile(imageFileName, buffer);

      if (await ensureFileReady(imageFileName)) {
        await sendWithAutoDelete(api, threadId, type, {
          message: `✨ Thông tin TikTok của @${ud.uniqueId || username}`,
          attachments: [imageFileName]
        });

        setTimeout(async () => {
          try {
            await fs.promises.unlink(imageFileName);
          } catch (_) {}
        }, AUTO_DELETE_TIME);
      } else {
        await sendWithAutoDelete(api, threadId, type, {
          message: `✨ Thông tin TikTok của @${ud.uniqueId || username}\n⚠️ Không gửi được ảnh, hiển thị dạng văn bản.`
        });
      }

    } else {
      await sendWithAutoDelete(api, threadId, type, {
        message: '❌ Không tìm thấy thông tin người dùng.'
      });
    }
  } catch (error) {
    console.error(error);
    await sendWithAutoDelete(api, threadId, type, {
      message: '⚠️ Có lỗi xảy ra: ' + error.message
    });
  }
};

// Helper function để wrap text
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}