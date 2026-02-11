const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const AUTO_DELETE_TIME = 60_000;

module.exports.config = {
  name: "checkkey",
  version: "4.0.0",
  role: 0,
  author: "Bonz & Cascade",
  description: "Xem danh sách người cầm key nhóm với giao diện SIÊU CHẤT",
  category: "Nhóm",
  usage: "checkkey",
  cooldowns: 5,
  aliases: ["listkey", "keyadmin"]
};

module.exports.run = async ({ api, event }) => {
  const { threadId, type } = event;

  try {
    const groupInfo = await api.getGroupInfo(threadId);
    
    if (!groupInfo || !groupInfo.gridInfoMap) {
      return api.sendMessage("❌ Không thể lấy thông tin nhóm!", threadId, type);
    }

    const details = groupInfo.gridInfoMap[threadId];
    
    if (!details) {
      return api.sendMessage("❌ Không tìm thấy thông tin nhóm này!", threadId, type);
    }

    const creatorId = details.creatorId;
    const allAdminIds = details.adminIds || [];
    const deputyIds = allAdminIds.filter(id => id !== creatorId);
    const groupName = details.name || "Unknown Group";

    // Load avatar helper
    async function loadAvatar(url) {
      try {
        const response = await axios.get(url, { 
          responseType: 'arraybuffer', 
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return await loadImage(Buffer.from(response.data));
      } catch (e) {
        return null;
      }
    }

    // Get creator info
    let creatorName = "Unknown";
    let creatorAvatar = null;
    const deputyList = [];

    if (creatorId) {
      try {
        const creatorInfo = await api.getUserInfo(creatorId);
        const profile = creatorInfo?.changed_profiles?.[creatorId];
        creatorName = profile?.displayName || creatorInfo?.data?.displayName || "Unknown";
        
        const avatarUrl = profile?.avatar || profile?.avatarUrl;
        if (avatarUrl) {
          creatorAvatar = await loadAvatar(avatarUrl);
        }
      } catch (e) {
        console.log("Error getting creator info:", e.message);
      }
    }

    // Get deputy info
    for (let i = 0; i < Math.min(deputyIds.length, 12); i++) {
      const deputyId = deputyIds[i];
      try {
        const userInfo = await api.getUserInfo(deputyId);
        const profile = userInfo?.changed_profiles?.[deputyId];
        const userName = profile?.displayName || userInfo?.data?.displayName || "Unknown";
        
        const avatarUrl = profile?.avatar || profile?.avatarUrl;
        let avatar = null;
        if (avatarUrl) {
          avatar = await loadAvatar(avatarUrl);
        }
        
        deputyList.push({ name: userName, id: deputyId, avatar });
      } catch (e) {
        deputyList.push({ name: "Unknown", id: deputyId, avatar: null });
      }
    }

    // Canvas dimensions
    const width = 900;
    const headerHeight = 220;
    const creatorCardHeight = 160;
    const itemHeight = 75;
    const footerHeight = 100;
    
    const deputyHeight = deputyList.length > 0 ? 
      70 + (deputyList.length * itemHeight) + 30 : 80;
    
    const height = headerHeight + creatorCardHeight + deputyHeight + footerHeight;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // ========== BACKGROUND ELITE ==========
    // Dark base
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Gradient overlay
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, 'rgba(102, 126, 234, 0.15)');
    bgGradient.addColorStop(0.5, 'rgba(118, 75, 162, 0.15)');
    bgGradient.addColorStop(1, 'rgba(240, 147, 251, 0.15)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Animated particles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 3 + 1;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // ========== HEADER ==========
    // Gradient bar top
    const topGradient = ctx.createLinearGradient(0, 0, width, 0);
    topGradient.addColorStop(0, '#667eea');
    topGradient.addColorStop(0.3, '#FFD700');
    topGradient.addColorStop(0.7, '#f093fb');
    topGradient.addColorStop(1, '#667eea');
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, width, 5);

    // Header background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    roundRect(ctx, 30, 20, width - 60, 180, 20, true);

    // Glow effect behind text
    const glowGradient = ctx.createRadialGradient(width/2, 80, 0, width/2, 80, 150);
    glowGradient.addColorStop(0, 'rgba(255, 215, 0, 0.2)');
    glowGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(width/2 - 200, 40, 400, 100);

    // Main title
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px Arial';
    
    // Text outline
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 8;
    ctx.strokeText('🔑 KEY HOLDERS', width / 2, 85);
    
    // Text fill with gradient
    const textGradient = ctx.createLinearGradient(0, 60, 0, 100);
    textGradient.addColorStop(0, '#FFD700');
    textGradient.addColorStop(1, '#FFA500');
    ctx.fillStyle = textGradient;
    ctx.fillText('🔑 KEY HOLDERS', width / 2, 85);

    // Subtitle
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(groupName.length > 40 ? groupName.substring(0, 40) + '...' : groupName, width / 2, 125);

    // Stats box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundRect(ctx, width/2 - 180, 145, 360, 45, 22, true);
    
    // Stats text
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`👥 Tổng: ${allAdminIds.length}`, width/2 - 100, 173);
    
    ctx.fillStyle = '#4ECDC4';
    ctx.fillText(`|`, width/2, 173);
    
    ctx.fillStyle = '#f093fb';
    ctx.fillText(`Phó: ${deputyIds.length}`, width/2 + 100, 173);

    let yPos = headerHeight + 20;

    // ========== CREATOR CARD ==========
    // Card background with glow
    ctx.shadowColor = 'rgba(255, 215, 0, 0.3)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    
    const creatorCardGradient = ctx.createLinearGradient(0, yPos, 0, yPos + 130);
    creatorCardGradient.addColorStop(0, 'rgba(255, 215, 0, 0.15)');
    creatorCardGradient.addColorStop(1, 'rgba(255, 215, 0, 0.05)');
    ctx.fillStyle = creatorCardGradient;
    roundRect(ctx, 50, yPos, width - 100, 130, 20, true);
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Golden border
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.lineWidth = 3;
    roundRect(ctx, 50, yPos, width - 100, 130, 20, false, true);

    // Corner decoration
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(50, yPos, 60, 5);
    ctx.fillRect(50, yPos, 5, 60);
    ctx.fillRect(width - 110, yPos, 60, 5);
    ctx.fillRect(width - 55, yPos, 5, 60);

    // Crown badge
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(90, yPos + 30, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#0a0a0f';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('👑', 90, yPos + 38);

    // Label
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('TRƯỞNG NHÓM', 130, yPos + 35);

    // Avatar
    const avatarX = 80;
    const avatarY = yPos + 60;
    const avatarSize = 50;

    if (creatorAvatar) {
      drawAvatar(ctx, creatorAvatar, avatarX, avatarY, avatarSize, '#FFD700', 4, true);
    } else {
      drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize, '#FFD700');
    }

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(creatorName, 160, yPos + 85);

    // ID
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '18px Arial';
    ctx.fillText(`ID: ${creatorId}`, 160, yPos + 110);

    // VIP badge
    const vipGradient = ctx.createLinearGradient(0, yPos + 80, 0, yPos + 110);
    vipGradient.addColorStop(0, '#FF6B6B');
    vipGradient.addColorStop(1, '#C44569');
    ctx.fillStyle = vipGradient;
    roundRect(ctx, width - 180, yPos + 85, 110, 35, 17, true);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⭐ ADMIN', width - 125, yPos + 107);

    yPos += creatorCardHeight;

    // ========== DEPUTIES ==========
    if (deputyList.length > 0) {
      yPos += 20;

      // Section header
      const sectionGradient = ctx.createLinearGradient(50, yPos, width - 50, yPos);
      sectionGradient.addColorStop(0, 'rgba(78, 205, 196, 0.2)');
      sectionGradient.addColorStop(0.5, 'rgba(78, 205, 196, 0.1)');
      sectionGradient.addColorStop(1, 'rgba(78, 205, 196, 0.2)');
      ctx.fillStyle = sectionGradient;
      roundRect(ctx, 50, yPos, width - 100, 50, 15, true);

      ctx.fillStyle = '#4ECDC4';
      ctx.font = 'bold 26px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`⚪ PHÓ NHÓM (${deputyList.length})`, 80, yPos + 33);

      yPos += 70;

      // Deputy list
      deputyList.forEach((deputy, index) => {
        const itemY = yPos + (index * itemHeight);

        // Background
        ctx.fillStyle = index % 2 === 0 ? 
          'rgba(255, 255, 255, 0.04)' : 
          'rgba(255, 255, 255, 0.02)';
        roundRect(ctx, 50, itemY, width - 100, itemHeight - 5, 12, true);

        // Accent line for top 3
        if (index < 3) {
          const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
          ctx.fillStyle = colors[index];
          ctx.fillRect(50, itemY, 5, itemHeight - 5);
        }

        // Rank number
        const rankX = 85;
        const rankY = itemY + 35;
        
        if (index < 3) {
          const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
          ctx.fillStyle = rankColors[index];
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        }
        
        ctx.beginPath();
        ctx.arc(rankX, rankY, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(index + 1, rankX, rankY + 6);

        // Avatar
        const depAvatarX = 130;
        const depAvatarY = itemY + 10;
        const depAvatarSize = 50;

        if (deputy.avatar) {
          drawAvatar(ctx, deputy.avatar, depAvatarX, depAvatarY, depAvatarSize, '#4ECDC4', 3, false);
        } else {
          drawDefaultAvatar(ctx, depAvatarX, depAvatarY, depAvatarSize, '#4ECDC4');
        }

        // Name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'left';
        const nameText = deputy.name.length > 30 ? 
          deputy.name.substring(0, 30) + '...' : 
          deputy.name;
        ctx.fillText(nameText, 210, itemY + 33);

        // ID
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '16px Arial';
        ctx.fillText(`ID: ${deputy.id}`, 210, itemY + 55);

        // Status indicator (decorative)
        if (index < 6) {
          ctx.fillStyle = '#4ECDC4';
          ctx.beginPath();
          ctx.arc(width - 90, itemY + 35, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(78, 205, 196, 0.2)';
          ctx.beginPath();
          ctx.arc(width - 90, itemY + 35, 10, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = '14px Arial';
          ctx.textAlign = 'right';
          ctx.fillText('Online', width - 105, itemY + 38);
        }
      });

      if (deputyIds.length > 12) {
        const moreY = yPos + (deputyList.length * itemHeight) + 20;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = 'italic 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`✨ Và ${deputyIds.length - 12} người khác...`, width / 2, moreY);
      }
    } else {
      yPos += 20;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      roundRect(ctx, 50, yPos, width - 100, 60, 15, true);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('📝 Hiện tại chưa có phó nhóm nào', width / 2, yPos + 38);
    }

    // ========== FOOTER ==========
    const footerY = height - footerHeight;

    // Gradient line
    const footerLineGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerLineGradient.addColorStop(0, 'rgba(102, 126, 234, 0.5)');
    footerLineGradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.5)');
    footerLineGradient.addColorStop(1, 'rgba(240, 147, 251, 0.5)');
    ctx.strokeStyle = footerLineGradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, footerY);
    ctx.lineTo(width, footerY);
    ctx.stroke();

    // Footer background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, footerY, width, footerHeight);

    // Footer text
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('💎 BONZ MÃI ĐẸP TRAI', width / 2, footerY + 40);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '18px Arial';
    ctx.fillText('📞 0785000270', width / 2, footerY + 68);

    // Bottom gradient bar
    const bottomGradient = ctx.createLinearGradient(0, height - 5, width, height - 5);
    bottomGradient.addColorStop(0, '#667eea');
    bottomGradient.addColorStop(0.5, '#FFD700');
    bottomGradient.addColorStop(1, '#f093fb');
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, height - 5, width, 5);

    // Save and send
    const tempDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const imagePath = path.join(tempDir, `checkkey_${Date.now()}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(imagePath, buffer);

    await api.sendMessage({
      msg: `✨ Danh sách key nhóm (Tin nhắn sẽ tự xóa sau ${AUTO_DELETE_TIME / 1000}s)`,
      attachments: [imagePath],
      ttl: AUTO_DELETE_TIME
    }, threadId, type);

    // Xóa file ảnh sau 65s (sau khi xóa message)
    setTimeout(() => {
      try {
        fs.unlinkSync(imagePath);
        console.log("[CHECKKEY] Image file deleted");
      } catch (e) {
        console.log("Error deleting temp file:", e.message);
      }
    }, 65000);

  } catch (error) {
    console.error('[CHECKKEY] Error:', error);
    await api.sendMessage({
      msg: `❌ Lỗi khi kiểm tra key nhóm!\n🔍 Chi tiết: ${error.message}`,
      ttl: AUTO_DELETE_TIME
    }, threadId, type);
  }
};

// ========== HELPER FUNCTIONS ==========
function roundRect(ctx, x, y, width, height, radius, fill = false, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawAvatar(ctx, image, x, y, size, borderColor, borderWidth, isGlow) {
  // Glow effect for creator
  if (isGlow) {
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 20;
  }

  // Border circle
  ctx.fillStyle = borderColor;
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2 + borderWidth, 0, Math.PI * 2);
  ctx.fill();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Clip and draw image
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();

  // Inner highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2 - 3, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDefaultAvatar(ctx, x, y, size, color) {
  // Background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Icon
  ctx.fillStyle = color;
  ctx.font = `bold ${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👤', x + size/2, y + size/2);
}