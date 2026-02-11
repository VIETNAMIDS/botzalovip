module.exports.config = {
  name: "userinfo",
  version: "2.0.0",
  role: 0,
  author: "Cascade & Bonz",
  description: "Xem thông tin chi tiết người dùng Zalo với Canvas",
  category: "Tiện ích",
  usage: "userinfo [@mention] | userinfo [uid] | userinfo text",
  cooldowns: 3,
  aliases: ["info", "user"]
};

const { ThreadType } = require("zca-js");
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

module.exports.run = async ({ args, event, api }) => {
  const { threadId, type, data } = event;
  const senderId = data.uidFrom;
  
  const isTextMode = args.includes("text") || args.includes("-t");
  
  try {
    let targetUserId;
    
    if (data.mentions && data.mentions.length > 0) {
      targetUserId = data.mentions[0].uid;
    } else if (args.length > 0 && !isTextMode) {
      const arg = args[0];
      if (arg !== "text" && arg !== "-t") {
        targetUserId = arg;
      } else {
        targetUserId = senderId;
      }
    } else {
      targetUserId = senderId;
    }
    
    const userInfo = await getUserInfoData(api, targetUserId);
    
    if (!userInfo) {
      return api.sendMessage(
        "❌ Không thể lấy thông tin người dùng này.",
        threadId,
        type
      );
    }
    
    if (isTextMode) {
      await sendUserInfoText(api, threadId, type, userInfo);
    } else {
      await sendUserInfoCanvas(api, threadId, type, userInfo);
    }
    
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người dùng:", error);
    return api.sendMessage(
      "❌ Đã xảy ra lỗi khi lấy thông tin người dùng. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }
};

async function getUserInfoData(api, userId) {
  try {
    const userInfoResponse = await api.getUserInfo(userId);
    const userInfo = userInfoResponse?.unchanged_profiles?.[userId] 
                  || userInfoResponse?.changed_profiles?.[userId];
    
    if (!userInfo) return null;
    
    return getAllInfoUser(userInfo);
  } catch (error) {
    console.error("Error getting user info:", error);
    return null;
  }
}

function getAllInfoUser(userInfo) {
  const currentTime = Date.now();
  const lastActionTime = userInfo.lastActionTime || 0;
  const isOnline = currentTime - lastActionTime <= 300000;

  return {
    uid: userInfo.userId || "Không xác định",
    name: formatName(userInfo.zaloName || userInfo.displayName),
    avatar: userInfo.avatar,
    cover: userInfo.cover,
    gender: formatGender(userInfo.gender),
    genderId: userInfo.gender,
    businessAccount: userInfo.bizPkg?.label ? "Có" : "Không",
    businessType: getTextTypeBusiness(userInfo.bizPkg?.pkgId),
    isActive: userInfo.isActive,
    isActivePC: userInfo.isActivePC,
    isActiveWeb: userInfo.isActiveWeb,
    isValid: userInfo.isValid,
    username: userInfo.username || "Không có",
    birthday: formatDate(userInfo.dob || userInfo.sdob) || "Ẩn",
    phone: userInfo.phone || "Ẩn",
    lastActive: formatTimestamp(userInfo.lastActionTime),
    createdDate: formatTimestamp(userInfo.createdTs),
    bio: userInfo.status || "Không có thông tin bio",
    isOnline: isOnline,
    lastActionTime: userInfo.lastActionTime
  };
}

async function sendUserInfoCanvas(api, threadId, type, userInfo) {
  // Helper: Rounded rectangle
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

  // Helper: Draw image to fill entire area (cover fit - full background)
  function drawImageFullBackground(ctx, image, width, height) {
    const imgRatio = image.width / image.height;
    const canvasRatio = width / height;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (imgRatio > canvasRatio) {
      // Image rộng hơn -> fit theo height, crop width
      drawHeight = height;
      drawWidth = height * imgRatio;
      offsetX = (width - drawWidth) / 2;
      offsetY = 0;
    } else {
      // Image cao hơn -> fit theo width, crop height
      drawWidth = width;
      drawHeight = width / imgRatio;
      offsetX = 0;
      offsetY = (height - drawHeight) / 2;
    }
    
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }

  // Helper: Draw circular image
  function drawCircularImage(ctx, image, x, y, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // Draw image as cover (centered và fill full)
    const imgRatio = image.width / image.height;
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (imgRatio > 1) {
      drawHeight = radius * 2;
      drawWidth = drawHeight * imgRatio;
      offsetX = -(drawWidth - radius * 2) / 2;
      offsetY = 0;
    } else {
      drawWidth = radius * 2;
      drawHeight = drawWidth / imgRatio;
      offsetX = 0;
      offsetY = -(drawHeight - radius * 2) / 2;
    }
    
    ctx.drawImage(image, x + offsetX, y + offsetY, drawWidth, drawHeight);
    ctx.restore();
    
    // Border gradient
    const borderGradient = ctx.createLinearGradient(x, y, x + radius * 2, y + radius * 2);
    borderGradient.addColorStop(0, '#8b5cf6');
    borderGradient.addColorStop(0.5, '#ec4899');
    borderGradient.addColorStop(1, '#facc15');
    
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Online status indicator
    if (userInfo.isOnline) {
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(x + radius * 2 - 15, y + radius * 2 - 15, 20, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + radius * 2 - 15, y + radius * 2 - 15, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const width = 1200;
  const height = 1400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Cover image as FULL BACKGROUND
  let hasCover = false;
  if (userInfo.cover) {
    try {
      const coverResponse = await axios.get(userInfo.cover, { responseType: 'arraybuffer', timeout: 5000 });
      const coverImage = await loadImage(Buffer.from(coverResponse.data));
      
      // Vẽ ảnh cover làm background toàn màn hình
      drawImageFullBackground(ctx, coverImage, width, height);
      hasCover = true;
      
      // Overlay tối để nội dung dễ nhìn hơn
      const overlayGradient = ctx.createLinearGradient(0, 0, 0, height);
      overlayGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
      overlayGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.6)');
      overlayGradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
      ctx.fillStyle = overlayGradient;
      ctx.fillRect(0, 0, width, height);
      
    } catch (e) {
      console.warn("Không thể tải cover:", e.message);
    }
  }
  
  // Nếu không có cover, dùng background gradient
  if (!hasCover) {
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);
    
    // Pattern overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 60) {
      for (let j = 0; j < height; j += 60) {
        ctx.fillRect(i, j, 30, 30);
      }
    }
  }

  // Header
  const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
  headerGradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
  headerGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.3)');
  headerGradient.addColorStop(1, 'rgba(250, 204, 21, 0.3)');
  
  roundRect(ctx, 40, 30, width - 80, 120, 25);
  ctx.fillStyle = headerGradient;
  ctx.fill();
  
  const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
  borderGradient.addColorStop(0, '#8b5cf6');
  borderGradient.addColorStop(0.5, '#ec4899');
  borderGradient.addColorStop(1, '#facc15');
  
  roundRect(ctx, 40, 30, width - 80, 120, 25);
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
  ctx.shadowBlur = 30;
  roundRect(ctx, 40, 30, width - 80, 120, 25);
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
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 25;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillText('👤 THÔNG TIN NGƯỜI DÙNG', width / 2, 105);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Avatar
  const avatarY = 180;
  const avatarSize = 180;
  const avatarX = (width - avatarSize) / 2;

  let avatarImage = null;
  if (userInfo.avatar) {
    try {
      const avatarResponse = await axios.get(userInfo.avatar, { responseType: 'arraybuffer', timeout: 5000 });
      avatarImage = await loadImage(Buffer.from(avatarResponse.data));
      drawCircularImage(ctx, avatarImage, avatarX, avatarY, avatarSize / 2);
    } catch (e) {
      console.warn("Không thể tải avatar:", e.message);
    }
  }
  
  if (!avatarImage) {
    // Default gradient circle
    const defaultGradient = ctx.createRadialGradient(
      avatarX + avatarSize / 2, avatarY + avatarSize / 2, 0,
      avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2
    );
    defaultGradient.addColorStop(0, '#8b5cf6');
    defaultGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = defaultGradient;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Icon
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 70px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('👤', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 20);
  }

  // Name and status
  const nameY = avatarY + avatarSize + 50;
  
  const nameGradient = ctx.createLinearGradient(0, 0, width, 0);
  nameGradient.addColorStop(0, '#fbbf24');
  nameGradient.addColorStop(1, '#f59e0b');
  
  ctx.fillStyle = nameGradient;
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillText(userInfo.name, width / 2, nameY);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Online status
  const statusY = nameY + 45;
  const onlineStatus = userInfo.isOnline ? "🟢 Online" : "⚫ Offline";
  ctx.fillStyle = userInfo.isOnline ? '#10b981' : '#94a3b8';
  ctx.font = 'bold 32px Arial';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 15;
  ctx.fillText(onlineStatus, width / 2, statusY);
  ctx.shadowBlur = 0;

  // Info card
  const cardY = statusY + 60;
  const cardHeight = 600;
  
  const cardGradient = ctx.createLinearGradient(60, cardY, width - 60, cardY);
  cardGradient.addColorStop(0, 'rgba(15, 23, 42, 0.85)');
  cardGradient.addColorStop(1, 'rgba(30, 41, 59, 0.85)');
  
  roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
  ctx.fillStyle = cardGradient;
  ctx.fill();
  
  roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 3;
  ctx.stroke();
  
  ctx.shadowColor = '#8b5cf6';
  ctx.shadowBlur = 20;
  roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Info items
  let infoY = cardY + 50;
  const leftX = 100;
  const lineHeight = 65;

  // Helper: Draw info row
  function drawInfoRow(icon, label, value, y) {
    // Icon
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(icon, leftX, y);
    
    // Label
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(label + ':', leftX + 45, y);
    
    // Value
    const valueGradient = ctx.createLinearGradient(0, 0, width, 0);
    valueGradient.addColorStop(0, '#10b981');
    valueGradient.addColorStop(1, '#059669');
    
    ctx.fillStyle = valueGradient;
    ctx.font = 'bold 24px Arial';
    
    // Wrap text nếu quá dài
    const maxWidth = width - leftX - 100;
    const labelWidth = ctx.measureText(label + ': ').width + 45;
    
    if (ctx.measureText(value).width > maxWidth - labelWidth) {
      // Xuống dòng
      ctx.fillText(value, leftX + 45, y + 30);
      return 30; // Trả về chiều cao thêm
    } else {
      // Cùng dòng
      ctx.fillText(value, leftX + labelWidth, y);
      return 0;
    }
  }

  // Personal info section
  infoY += drawInfoRow('🆔', 'UID', userInfo.uid, infoY);
  infoY += lineHeight;
  
  infoY += drawInfoRow(userInfo.genderId === 0 ? '👨' : userInfo.genderId === 1 ? '👩' : '🤖', 'Giới tính', userInfo.gender.replace('👨 ', '').replace('👩 ', '').replace('🤖 ', ''), infoY);
  infoY += lineHeight;
  
  infoY += drawInfoRow('🎂', 'Sinh nhật', userInfo.birthday, infoY);
  infoY += lineHeight;
  
  infoY += drawInfoRow('📱', 'SĐT', userInfo.phone, infoY);
  infoY += lineHeight;
  
  infoY += drawInfoRow('👤', 'Username', userInfo.username, infoY);
  infoY += lineHeight;
  
  // Business info
  if (userInfo.businessAccount === "Có") {
    infoY += drawInfoRow('💼', 'Tài khoản DN', `${userInfo.businessAccount} (${userInfo.businessType})`, infoY);
    infoY += lineHeight;
  }
  
  // Bio section với wrapping tốt hơn
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('📝', leftX, infoY);
  
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('Bio:', leftX + 45, infoY);
  
  const bioValueGradient = ctx.createLinearGradient(0, 0, width, 0);
  bioValueGradient.addColorStop(0, '#10b981');
  bioValueGradient.addColorStop(1, '#059669');
  
  ctx.fillStyle = bioValueGradient;
  ctx.font = '22px Arial';
  
  const bioMaxWidth = width - leftX - 100;
  const bioWords = userInfo.bio.split(' ');
  let bioLine = '';
  let bioY = infoY + 30;
  let bioLines = 0;
  
  for (let word of bioWords) {
    const testLine = bioLine + word + ' ';
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > bioMaxWidth && bioLine !== '') {
      ctx.fillText(bioLine.trim(), leftX + 45, bioY);
      bioLine = word + ' ';
      bioY += 28;
      bioLines++;
      if (bioLines >= 2) break; // Giới hạn 2 dòng
    } else {
      bioLine = testLine;
    }
  }
  if (bioLines < 2) {
    ctx.fillText(bioLine.trim(), leftX + 45, bioY);
  }
  infoY = bioY + 40;
  
  // Activity info
  infoY += drawInfoRow('🕐', 'Hoạt động', userInfo.lastActive, infoY);
  infoY += lineHeight;
  
  infoY += drawInfoRow('📅', 'Ngày tạo', userInfo.createdDate, infoY);

  // Footer
  const footerY = height - 80;
  const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
  footerGradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
  footerGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.2)');
  footerGradient.addColorStop(1, 'rgba(250, 204, 21, 0.2)');
  
  roundRect(ctx, 40, footerY, width - 80, 60, 20);
  ctx.fillStyle = footerGradient;
  ctx.fill();
  
  roundRect(ctx, 40, footerY, width - 80, 60, 20);
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
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 15;
  ctx.fillText(`💎 BONZ MÃI ĐẸP TRAI - 0785000270`, width / 2, footerY + 40);
  ctx.shadowBlur = 0;

  // Save and send
  const tempPath = path.join(__dirname, '../../cache');
  try {
    await fs.mkdir(tempPath, { recursive: true });
  } catch (e) {}
  
  const imagePath = path.join(tempPath, `userinfo_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(imagePath, buffer);

  await api.sendMessage({ 
    msg: `👤 Thông tin người dùng: ${userInfo.name}`, 
    attachments: [imagePath] 
  }, threadId, type);

  setTimeout(async () => {
    try {
      await fs.unlink(imagePath);
    } catch (_) {}
  }, 5000);
}

async function sendUserInfoText(api, threadId, type, userInfo) {
  const userInfoText = Object.entries(userInfo)
    .filter(([key]) => !['avatar', 'cover', 'genderId', 'lastActionTime'].includes(key))
    .map(([key, value]) => {
      const keyMap = {
        uid: "🆔 UID",
        name: "📛 Tên",
        gender: "👥 Giới tính",
        birthday: "🎂 Sinh nhật",
        phone: "📱 Số điện thoại",
        username: "👤 Username",
        businessAccount: "💼 Tài khoản DN",
        businessType: "📊 Loại DN",
        bio: "📝 Bio",
        isOnline: "⏰ Online",
        lastActive: "🕐 Hoạt động",
        createdDate: "📅 Ngày tạo",
        isActive: "✅ Active",
        isActivePC: "💻 Active PC",
        isActiveWeb: "🌐 Active Web",
        isValid: "✔️ Valid"
      };
      
      const displayKey = keyMap[key] || key;
      const displayValue = typeof value === 'boolean' ? (value ? 'Có' : 'Không') : value;
      
      return `${displayKey}: ${displayValue}`;
    })
    .join("\n");
    
  await api.sendMessage({ msg: userInfoText }, threadId, type);
}

function formatName(name) {
  if (!name) return "Không xác định";
  return name.length > 30 ? name.slice(0, 27) + "..." : name;
}

function formatGender(gender) {
  if (gender === 0 || gender === "male") return "👨 Nam";
  if (gender === 1 || gender === "female") return "👩 Nữ";
  return "🤖 Không xác định";
}

function getTextTypeBusiness(type) {
  if (type === 1) return "Basic";
  if (type === 3) return "Pro";
  if (type === 2) return "Không xác định";
  return "Chưa Đăng Ký";
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "Ẩn";
  
  try {
    if (typeof timestamp === "number") {
      timestamp = timestamp > 1e10 ? timestamp : timestamp * 1000;
      const date = new Date(timestamp);
      
      return date.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    return "Ẩn";
  } catch (error) {
    return "Ẩn";
  }
}

function formatDate(date) {
  if (!date) return "Ẩn";
  
  try {
    if (typeof date === "number") {
      const timestamp = date > 1e10 ? date : date * 1000;
      const dateObj = new Date(timestamp);
      
      return dateObj.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    return date || "Ẩn";
  } catch (error) {
    return "Ẩn";
  }
}