const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');

const AUTO_DELETE_TIME = 60000;

const appendDeleteNotice = (message, ttl = AUTO_DELETE_TIME) =>
  `${message}\n⏱️ Tin nhắn sẽ tự động xóa sau ${Math.floor(ttl / 1000)}s`;

async function sendWithAutoDelete(
  api,
  threadId,
  type,
  { message, attachments, mentions },
  ttl = AUTO_DELETE_TIME
) {
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
    } catch (err) {
      // ignore and retry
    }
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

// Data files
const DATA_DIR = path.join(__dirname, '../../data');
const TOP_DATA_FILE = path.join(DATA_DIR, 'top_data.json');
const TOP_SETTINGS_FILE = path.join(DATA_DIR, 'top_settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==================== RANK SYSTEM ====================
const RANK_SYSTEM = [
  { key: 'SAT', name: 'Sắt', min: 0, max: 49, color: '#475569', icon: '⚙️', stars: 2 },
  { key: 'DONG', name: 'Đồng', min: 50, max: 199, color: '#CD7F32', icon: '🥉', stars: 3 },
  { key: 'BAC', name: 'Bạc', min: 200, max: 399, color: '#C0C0C0', icon: '🥈', stars: 3 },
  { key: 'VANG', name: 'Vàng', min: 400, max: 699, color: '#FFD700', icon: '🥇', stars: 4 },
  { key: 'BACH_KIM', name: 'Bạch Kim', min: 700, max: 1099, color: '#E5E4E2', icon: '💎', stars: 4 },
  { key: 'KIM_CUONG', name: 'Kim Cương', min: 1100, max: 1599, color: '#5CE1FF', icon: '💠', stars: 5 },
  { key: 'TINH_ANH', name: 'Tinh Anh', min: 1600, max: 2199, color: '#7C3AED', icon: '🌌', stars: 5 },
  { key: 'CAO_THU', name: 'Cao Thủ', min: 2200, max: 2999, color: '#FF0080', icon: '🚀', stars: 5 },
  { key: 'HUYEN_THOAI', name: 'Huyền Thoại', min: 3000, max: 3999, color: '#FF6B6B', icon: '🐉', stars: 6 },
  { key: 'THAN_THOAI', name: 'Thần Thoại', min: 4000, max: Infinity, color: '#FACC15', icon: '🏵️', stars: 6 }
];

const MAX_RANK = RANK_SYSTEM[RANK_SYSTEM.length - 1];

function getNextRank(key) {
  const idx = RANK_SYSTEM.findIndex(r => r.key === key);
  if (idx >= 0 && idx < RANK_SYSTEM.length - 1) {
    return RANK_SYSTEM[idx + 1];
  }
  return null;
}

function hexToRgb(hex) {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function rgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightenColor(hex, amount = 0.2) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel) => Math.min(255, Math.round(channel + (255 - channel) * amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Không rõ';
  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return 'Vừa xong';
  const minutes = Math.floor(diff / (60 * 1000));
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(timestamp).toLocaleDateString('vi-VN');
}

function getRankFromMessages(messageCount) {
  for (const rank of RANK_SYSTEM) {
    if (messageCount >= rank.min && messageCount <= rank.max) {
      const span = isFinite(rank.max) ? rank.max - rank.min : null;
      const progressRaw = span && span > 0 ? ((messageCount - rank.min) / span) * 100 : 100;
      const progress = Math.max(0, Math.min(100, progressRaw));
      const starRatio = span && span > 0 ? (messageCount - rank.min) / span : 1;
      const currentStars = span && span > 0
        ? Math.max(1, Math.min(rank.stars, Math.ceil(starRatio * rank.stars)))
        : rank.stars;

      return {
        ...rank,
        currentStars,
        progress,
        nextRankAt: isFinite(rank.max) ? rank.max + 1 : null
      };
    }
  }

  return {
    ...MAX_RANK,
    currentStars: MAX_RANK.stars,
    progress: 100,
    nextRankAt: null
  };
}

// Helper function: Load top data
function loadTopData() {
  try {
    if (fs.existsSync(TOP_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOP_DATA_FILE, 'utf8'));
      return data;
    }
  } catch (error) {
    console.error('[TOP] Lỗi load top data:', error);
  }
  return { messageCount: {}, lastUpdate: 0 };
}

// Helper function: Save top data
function saveTopData(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(TOP_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[TOP] Lỗi save top data:', error);
  }
}

function loadTopSettings() {
  try {
    if (fs.existsSync(TOP_SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(TOP_SETTINGS_FILE, 'utf8'));
      if (settings && typeof settings === 'object') {
        return {
          threads: settings.threads && typeof settings.threads === 'object' ? settings.threads : {}
        };
      }
    }
  } catch (error) {
    console.error('[TOP] Lỗi load top settings:', error);
  }
  return { threads: {} };
}

function saveTopSettings(settings) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(TOP_SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('[TOP] Lỗi save top settings:', error);
  }
}

function getTopSettings() {
  if (!global.__topSettingsCache) {
    global.__topSettingsCache = loadTopSettings();
  }
  return global.__topSettingsCache;
}

function updateTopSettings(mutator) {
  const settings = getTopSettings();
  const next = mutator(settings);
  const finalSettings = next || settings;
  saveTopSettings(finalSettings);
  global.__topSettingsCache = finalSettings;
  return finalSettings;
}

function setThreadTracking(threadId, enabled) {
  const normalizedId = String(threadId || '');
  if (!normalizedId) return { changed: false, enabled: false };

  let changed = false;

  const resultSettings = updateTopSettings((settings) => {
    if (!settings.threads) {
      settings.threads = {};
    }

    const current = settings.threads[normalizedId]?.enabled === true;
    if (enabled && !current) {
      settings.threads[normalizedId] = { enabled: true, updatedAt: Date.now() };
      changed = true;
    } else if (!enabled && current) {
      settings.threads[normalizedId] = { enabled: false, updatedAt: Date.now() };
      changed = true;
    } else if (!settings.threads[normalizedId]) {
      settings.threads[normalizedId] = { enabled: Boolean(enabled), updatedAt: Date.now() };
    }

    return settings;
  });

  const effective = resultSettings.threads?.[normalizedId]?.enabled === true;
  return { changed, enabled: effective };
}

function isThreadTrackingEnabled(threadId) {
  const normalizedId = String(threadId || '');
  if (!normalizedId) return false;
  const settings = getTopSettings();
  return settings.threads?.[normalizedId]?.enabled === true;
}

// Helper function: Update message count
function updateMessageCount(userId, userName, threadId) {
  try {
    const topData = loadTopData();
    
    if (!topData.messageCount[threadId]) {
      topData.messageCount[threadId] = {};
    }
    
    if (!topData.messageCount[threadId][userId]) {
      topData.messageCount[threadId][userId] = {
        count: 0,
        name: userName,
        lastUpdate: Date.now()
      };
    }
    
    topData.messageCount[threadId][userId].count++;
    topData.messageCount[threadId][userId].name = userName;
    topData.messageCount[threadId][userId].lastUpdate = Date.now();
    topData.lastUpdate = Date.now();
    
    saveTopData(topData);
  } catch (error) {
    console.error('[TOP] Lỗi update message count:', error);
  }
}

// ==================== CREATE RANK IMAGE ====================
async function createRankImage(topUsers, threadId, api) {
  try {
    const itemHeight = 160;
    const headerHeight = 320;
    const footerHeight = 140;
    const canvasHeight = headerHeight + (topUsers.length * itemHeight) + footerHeight + 50;

    const canvas = createCanvas(1400, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Background - Dark gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#0a0e27');
    bgGradient.addColorStop(0.5, '#16213e');
    bgGradient.addColorStop(1, '#0a0e27');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < canvas.width; i += 60) {
      for (let j = 0; j < canvas.height; j += 60) {
        ctx.fillRect(i, j, 30, 30);
      }
    }

    // Header background
    const headerGradient = ctx.createLinearGradient(0, 0, canvas.width, 260);
    headerGradient.addColorStop(0, rgba('#FF0080', 0.25));
    headerGradient.addColorStop(0.45, rgba('#7C3AED', 0.25));
    headerGradient.addColorStop(0.75, rgba('#5CE1FF', 0.25));
    headerGradient.addColorStop(1, rgba('#FACC15', 0.25));
    ctx.fillStyle = headerGradient;
    roundRect(ctx, 30, 30, canvas.width - 60, 260, 26);
    ctx.fill();

    // Header border & glow
    ctx.save();
    ctx.shadowColor = rgba('#FACC15', 0.45);
    ctx.shadowBlur = 35;
    ctx.strokeStyle = '#FF69B4';
    ctx.lineWidth = 3;
    roundRect(ctx, 30, 30, canvas.width - 60, 260, 26);
    ctx.stroke();
    ctx.restore();

    // Title
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 72px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = rgba('#FACC15', 0.6);
    ctx.shadowBlur = 45;
    ctx.fillText(' BẢNG XẾP HẠNG CHIẾN TRƯỜNG ', canvas.width / 2, 120);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 36px "Segoe UI", Arial';
    ctx.fillText('Elite Topchat League', canvas.width / 2, 180);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '28px "Segoe UI", Arial';
    ctx.fillText(`Top ${topUsers.length} chiến binh hoạt động mạnh nhất`, canvas.width / 2, 230);

    const highestCount = topUsers[0]?.count || 0;
    const totalMessages = topUsers.reduce((sum, user) => sum + user.count, 0);
    ctx.fillStyle = '#CBD5F5';
    ctx.font = '24px "Segoe UI", Arial';
    ctx.fillText(` Tổng tương tác: ${totalMessages.toLocaleString()} tin • Kỷ lục: ${highestCount.toLocaleString()} tin`, canvas.width / 2, 270);

    // Draw each rank card
    const startY = headerHeight;

    for (let i = 0; i < topUsers.length; i++) {
      const user = topUsers[i];
      const rank = getRankFromMessages(user.count);
      const y = startY + (i * itemHeight);

      // Card background
      const cardHeight = itemHeight - 30;
      const cardGradient = ctx.createLinearGradient(50, y, 50, y + cardHeight);
      if (i === 0) {
        cardGradient.addColorStop(0, rgba('#FFD700', 0.35));
        cardGradient.addColorStop(1, rgba('#FF8C00', 0.18));
      } else if (i === 1) {
        cardGradient.addColorStop(0, rgba('#C0C0C0', 0.35));
        cardGradient.addColorStop(1, rgba('#A9A9A9', 0.18));
      } else if (i === 2) {
        cardGradient.addColorStop(0, rgba('#CD7F32', 0.35));
        cardGradient.addColorStop(1, rgba('#B8860B', 0.18));
      } else {
        cardGradient.addColorStop(0, rgba(rank.color, 0.14));
        cardGradient.addColorStop(1, rgba('#111827', 0.65));
      }

      ctx.fillStyle = cardGradient;
      ctx.save();
      ctx.shadowColor = rgba(rank.color, i < 3 ? 0.55 : 0.25);
      ctx.shadowBlur = i < 3 ? 45 : 20;
      roundRect(ctx, 50, y, canvas.width - 100, cardHeight, 18);
      ctx.fill();
      ctx.restore();

      // Card border with rank color (gradient)
      const borderGradient = ctx.createLinearGradient(50, y, canvas.width - 50, y);
      borderGradient.addColorStop(0, lightenColor(rank.color, 0.5));
      borderGradient.addColorStop(0.5, rank.color);
      borderGradient.addColorStop(1, lightenColor(rank.color, 0.3));
      ctx.strokeStyle = borderGradient;
      ctx.lineWidth = 3;
      roundRect(ctx, 50, y, canvas.width - 100, cardHeight, 18);
      ctx.stroke();

      // Position number
      const positionColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#A5B4FC';
      ctx.fillStyle = positionColor;
      ctx.font = 'bold 42px "Segoe UI"';
      ctx.textAlign = 'center';
      ctx.fillText(`#${i + 1}`, 110, y + 50);

      // Medal for top 3
      if (i < 3) {
        const medal = i === 0 ? '👑' : (i === 1 ? '🥈' : '🥉'); // Changed medal text
        ctx.font = '38px Arial';
        ctx.fillText(medal, 110, y + 95);
      }

      // Avatar
      try {
        let avatarPath = await downloadAvatar(user.userId, api);
        if (!avatarPath) {
          avatarPath = createDefaultAvatar(user.name, user.userId);
        }

        const avatar = await loadImage(avatarPath);

        // Draw avatar with border
        ctx.save();
        ctx.beginPath();
        ctx.arc(200, y + 65, 52, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, 150, y + 15, 105, 105);
        ctx.restore();

        // Avatar border
        ctx.strokeStyle = lightenColor(rank.color, 0.4);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(200, y + 65, 52, 0, Math.PI * 2);
        ctx.stroke();

      } catch (error) {
        // Default avatar circle
        const defaultGradient = ctx.createLinearGradient(155, y + 15, 245, y + 105);
        defaultGradient.addColorStop(0, '#667eea');
        defaultGradient.addColorStop(1, '#764ba2');

        ctx.fillStyle = defaultGradient;
        ctx.beginPath();
        ctx.arc(200, y + 65, 52, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 38px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(user.name.charAt(0).toUpperCase(), 200, y + 88);
      }

      // User name
      ctx.fillStyle = 'white';
      ctx.font = 'bold 34px "Segoe UI"';
      ctx.textAlign = 'left';
      const maxNameWidth = 420;

      let displayName = user.name;
      if (ctx.measureText(displayName).width > maxNameWidth) {
        while (ctx.measureText(displayName + '...').width > maxNameWidth && displayName.length > 1) {
          displayName = displayName.slice(0, -1);
        }
        displayName += '...';
      }
      ctx.fillText(displayName, 270, y + 40);

      // Rank badge
      const rankBadgeX = 270;
      const rankBadgeY = y + 78;
      const nextRank = getNextRank(rank.key);

      // Rank background
      const badgeGradient = ctx.createLinearGradient(rankBadgeX, rankBadgeY, rankBadgeX + 220, rankBadgeY);
      badgeGradient.addColorStop(0, rgba(rank.color, 0.8));
      badgeGradient.addColorStop(1, rgba(lightenColor(rank.color, 0.4), 0.9));
      ctx.fillStyle = badgeGradient;
      roundRect(ctx, rankBadgeX, rankBadgeY, 220, 44, 12);
      ctx.fill();

      ctx.strokeStyle = rgba('#FFFFFF', 0.35);
      ctx.lineWidth = 2;
      roundRect(ctx, rankBadgeX, rankBadgeY, 220, 44, 12);
      ctx.stroke();

      // Rank icon and name
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px "Segoe UI"';
      ctx.textAlign = 'left';
      ctx.fillText(`${rank.icon} ${rank.name}`, rankBadgeX + 14, rankBadgeY + 30);

      // Stars
      const starX = rankBadgeX + 234;
      ctx.font = '22px "Segoe UI"';
      for (let s = 0; s < rank.stars; s++) {
        ctx.fillStyle = s < rank.currentStars ? '#FACC15' : rgba('#FACC15', 0.2);
        ctx.fillText('★', starX + (s * 23), rankBadgeY + 30); // Changed star text
      }

      // Message count
      ctx.fillStyle = '#FACC15';
      ctx.font = 'bold 38px "Segoe UI"';
      ctx.textAlign = 'right';
      ctx.fillText(user.count.toLocaleString(), canvas.width - 250, y + 54);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '24px "Segoe UI"';
      ctx.fillText('tin nhắn', canvas.width - 100, y + 54);

      // Progress to next rank
      const progressBarX = canvas.width - 440;
      const progressBarY = y + 100;
      const progressBarWidth = 340;
      const progressBarHeight = 18;

      ctx.fillStyle = rgba('#0f172a', 0.65);
      roundRect(ctx, progressBarX, progressBarY, progressBarWidth, progressBarHeight, 9);
      ctx.fill();

      const progressGradient = ctx.createLinearGradient(progressBarX, 0, progressBarX + progressBarWidth, 0);
      progressGradient.addColorStop(0, lightenColor(rank.color, 0.1));
      progressGradient.addColorStop(1, '#FACC15');
      ctx.fillStyle = progressGradient;
      roundRect(ctx, progressBarX, progressBarY, (progressBarWidth * rank.progress) / 100, progressBarHeight, 9);
      ctx.fill();

      ctx.fillStyle = '#E2E8F0';
      ctx.font = 'bold 16px "Segoe UI"';
      ctx.textAlign = 'left';
      const nextLabel = nextRank ? `Cần ${nextRank.min - user.count} tin để lên ${nextRank.name}` : 'Đã đạt cấp cao nhất';
      ctx.fillText(`${Math.floor(rank.progress)}% • ${nextLabel}`, progressBarX, progressBarY - 8);

      ctx.fillStyle = '#64748b';
      ctx.font = '15px "Segoe UI"';
      ctx.textAlign = 'right';
      ctx.fillText(`Hoạt động: ${formatRelativeTime(user.lastUpdate)}`, canvas.width - 70, progressBarY - 8);
    }

    // Footer
    const footerY = canvas.height - 100;
    const footerGradient = ctx.createLinearGradient(0, footerY, canvas.width, footerY + 80);
    footerGradient.addColorStop(0, rgba('#FF0080', 0.18));
    footerGradient.addColorStop(0.5, rgba('#7C3AED', 0.2));
    footerGradient.addColorStop(1, rgba('#5CE1FF', 0.18));

    ctx.fillStyle = footerGradient;
    roundRect(ctx, 40, footerY - 10, canvas.width - 80, 100, 18);
    ctx.fill();

    ctx.strokeStyle = rgba('#FACC15', 0.5);
    ctx.lineWidth = 2;
    roundRect(ctx, 40, footerY - 10, canvas.width - 80, 100, 18);
    ctx.stroke();

    ctx.fillStyle = '#E0E7FF';
    ctx.font = 'bold 24px "Segoe UI"';
    ctx.textAlign = 'center';
    ctx.fillText(` Cập nhật: ${new Date().toLocaleString('vi-VN')}`, canvas.width / 2, footerY + 20);
    ctx.fillStyle = '#C084FC';
    ctx.font = '20px "Segoe UI"';
    ctx.fillText(' BONZ ELITE COMMUNITY • Kết nối & bùng nổ tương tác mỗi ngày', canvas.width / 2, footerY + 50);
    ctx.fillStyle = '#FACC15';
    ctx.font = '18px "Segoe UI"';
    ctx.fillText('0785 000 270 • Hotline hỗ trợ & tư vấn VIP', canvas.width / 2, footerY + 75);

    // Save image
    const cacheDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    
    const fileName = `rank_${threadId}_${Date.now()}.png`;
    const filePath = path.join(cacheDir, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);
    
    console.log('[RANK] Đã tạo ảnh rank:', filePath);
    return filePath;
    
  } catch (error) {
    console.error('[RANK] Lỗi tạo ảnh rank:', error);
    return null;
  }
}

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

module.exports.config = {
  name: "top",
  aliases: ["rank", "xephang", "topchat", "leaderboard"],
  version: "3.0.0",
  role: 0,
  author: "Bonz",
  description: "Hiển thị bảng xếp hạng với hệ thống rank như Liên Quân",
  category: "Thống kê",
  usage: "top [on|off|status]",
  cooldowns: 5,
  dependencies: { canvas: "", axios: "" }
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const command = (args?.[0] || "").toLowerCase();

  if (["on", "off", "status"].includes(command)) {
    if (command === "status") {
      const enabled = isThreadTrackingEnabled(threadId);
      const message = enabled
        ? "✅ Hệ thống đếm tin nhắn TOP đang bật cho nhóm này."
        : "ℹ️ Hệ thống đếm tin nhắn TOP đang tắt. Dùng 'top on' để bật.";
      return sendWithAutoDelete(api, threadId, type, { message });
    }

    const desired = command === "on";
    const { changed, enabled } = setThreadTracking(threadId, desired);

    if (desired && enabled) {
      const msg = changed
        ? "✅ Đã bật đếm tương tác TOP cho nhóm! Mỗi tin nhắn sẽ được ghi lại."
        : "✅ Hệ thống TOP vốn đã bật. Tiếp tục ghi nhận tin nhắn.";
      return sendWithAutoDelete(api, threadId, type, { message: msg });
    }

    if (!desired && !enabled) {
      const msg = changed
        ? "🛑 Đã tắt đếm tương tác TOP cho nhóm này. Dùng 'top on' để bật lại."
        : "ℹ️ Hệ thống TOP vốn đã tắt.";
      return sendWithAutoDelete(api, threadId, type, { message: msg });
    }

    // Khi yêu cầu tắt nhưng vẫn còn đánh dấu bật (do lỗi lưu), xử lý nhẹ
    return sendWithAutoDelete(api, threadId, type, {
      message: "⚠️ Không thể cập nhật trạng thái TOP ngay lúc này. Thử lại sau."
    });
  }

  try {
    const senderId = data?.uidFrom || event.authorId;
    
    const topData = loadTopData();
    const threadData = topData.messageCount[threadId] || {};
    
    if (Object.keys(threadData).length === 0) {
      return sendWithAutoDelete(api, threadId, type, {
        message:
          "⚔️ Chưa có chiến binh nào trên bảng xếp hạng!\n\n" +
          "💡 Hãy chat nhiều để leo rank từ Đồng → Cao Thủ!\n" +
          "🏆 Mỗi tin nhắn = 1 điểm rank\n\n" +
          "📊 Hệ thống rank:\n" +
          "🥉 Đồng (0-99)\n" +
          "🥈 Bạc (100-299)\n" +
          "🥇 Vàng (300-599)\n" +
          "💎 Bạch Kim (600-999)\n" +
          "💠 Kim Cương (1000-1499)\n" +
          "⚔️ Chiến Tướng (1500-1999)\n" +
          "👑 Cao Thủ (2000+)"
      });
    }
    
    const sortedUsers = Object.entries(threadData)
      .map(([userId, userData]) => ({
        userId,
        name: userData.name || 'Unknown User',
        count: userData.count || 0,
        lastUpdate: userData.lastUpdate || 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    if (sortedUsers.length === 0) {
      return sendWithAutoDelete(api, threadId, type, {
        message: "📊 Không có dữ liệu người dùng!"
      });
    }
    
    await sendWithAutoDelete(api, threadId, type, {
      message: "⚔️ Đang tạo bảng xếp hạng chiến trường..."
    });

    const imagePath = await createRankImage(sortedUsers, threadId, api);

    if (imagePath && (await ensureFileReady(imagePath))) {
      const topUser = sortedUsers[0];
      const topRank = getRankFromMessages(topUser.count);
      const totalMessages = sortedUsers.reduce((sum, user) => sum + user.count, 0);

      await sendWithAutoDelete(
        api,
        threadId,
        type,
        {
          message:
            `⚔️ BẢNG XẾP HẠNG CHIẾN TRƯỜNG ⚔️\n\n` +
            `👑 Quán quân: ${topUser.name}\n` +
            `${topRank.icon} Rank: ${topRank.name} - ${topRank.currentStars}/${topRank.stars}★\n` +
            `💬 Điểm rank: ${topUser.count.toLocaleString()}\n\n` +
            `📊 Thống kê:\n` +
            `• Tổng chiến binh: ${sortedUsers.length}\n` +
            `• Tổng tin nhắn: ${totalMessages.toLocaleString()}\n\n` +
            `⏰ Cập nhật: ${new Date().toLocaleString('vi-VN')}`,
          attachments: [imagePath]
        }
      );

      setTimeout(() => {
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        } catch (e) {
          console.log('[RANK] Lỗi xóa file:', e.message);
        }
      }, AUTO_DELETE_TIME);
      
    } else {
      // Fallback text
      let response = `⚔️ BẢNG XẾP HẠNG (Top ${sortedUsers.length})\n\n`;
      
      sortedUsers.slice(0, 10).forEach((user, index) => {
        const rank = getRankFromMessages(user.count);
        const medal = index === 0 ? '👑' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '📍'));
        response += `${medal} #${index + 1} ${user.name}\n`;
        response += `   ${rank.icon} ${rank.name} ${rank.currentStars}★ - ${user.count.toLocaleString()} điểm\n\n`;
      });
      
      if (sortedUsers.length > 10) {
        response += `\n...và ${sortedUsers.length - 10} chiến binh khác`;
      }
      
      response += `\n\n📊 Tổng: ${sortedUsers.reduce((sum, user) => sum + user.count, 0).toLocaleString()} tin nhắn`;
      
      return sendWithAutoDelete(api, threadId, type, { message: response });
    }
    
  } catch (error) {
    console.error("[RANK] Lỗi:", error);
    return sendWithAutoDelete(api, threadId, type, {
      message: "❌ Có lỗi xảy ra khi tạo bảng xếp hạng!"
    });
  }
};

module.exports.updateMessageCount = updateMessageCount;
module.exports.loadTopData = loadTopData;

module.exports.handleEvent = async function ({ event, eventType, api }) {
  if (eventType !== 'message') return;
  if (!event) return;

  const { threadId, data } = event;
  if (!threadId || !data) return;

  if (!isThreadTrackingEnabled(threadId)) {
    return;
  }

  const senderId = data?.uidFrom || event?.authorId || event?.senderID;
  if (!senderId) return;

  const normalizedSender = String(senderId);
  const botId = String(api?.getCurrentUserID?.() || global.botID || "");
  if (botId && normalizedSender === String(botId)) {
    return;
  }

  const userName = data?.dName || data?.displayName || data?.authorName || normalizedSender;

  updateMessageCount(normalizedSender, userName, threadId);
};