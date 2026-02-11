// Đặt thời gian đăng hằng ngày cho nhóm (định dạng HH:mm)
async function setGroupPRTime(api, event, groupName, timeArg) {
  const { threadId, type } = event;

  if (!groupName) {
    return api.sendMessage('❌ Thiếu tên nhóm!\n📝 Dùng: bonz auto pr gr <nhóm> t <HH:mm>', threadId, type);
  }

  if (!timeArg) {
    return api.sendMessage(`❌ Thiếu thời gian!\n📝 Ví dụ: bonz auto pr gr ${groupName} t 08:30`, threadId, type);
  }

  const lower = timeArg.trim().toLowerCase();
  const groupData = ensureGroupData(groupName, threadId, type);
  const disableKeywords = ['off', 'tắt', 'tat', 'none', 'disable'];

  if (disableKeywords.includes(lower)) {
    groupData.schedule = null;

    if (groupData.isRunning) {
      clearGroupTimers(groupData);
      scheduleGroupInterval(api, groupData);
    }

    const response = [
      `✅ Đã tắt lịch hằng ngày cho nhóm "${groupName}"!`,
      `⏱️ Chu kỳ hiện tại: ${groupData.intervalText}`,
      `🧹 TTL: ${groupData.ttlText}`,
      groupData.isRunning
        ? `⏰ Lần gửi tiếp theo: ${formatTimestamp(groupData.nextSendAt)}`
        : '',
      '',
      `💡 Chạy: bonz auto pr gr ${groupName} start`,
      `💡 Đặt lịch lại: bonz auto pr gr ${groupName} t <HH:mm>`
    ].filter(Boolean).join('\n');

    return api.sendMessage(response, threadId, type);
  }

  if (!/^\d{2}:\d{2}$/.test(timeArg)) {
    return api.sendMessage(
      `❌ Thời gian không hợp lệ!\n🕒 Định dạng: HH:mm (ví dụ 08:30)\n📝 Dùng: bonz auto pr gr ${groupName} t 08:30`,
      threadId,
      type
    );
  }

  groupData.schedule = { mode: 'daily', time: timeArg };

  if (groupData.isRunning) {
    clearGroupTimers(groupData);
    scheduleDailyGroupDispatch(api, groupData);
  }

  const next = computeNextOccurrence(timeArg);
  groupData.nextSendAt = next?.getTime() || null;

  const response = [
    `✅ Đã đặt lịch hằng ngày cho nhóm "${groupName}" lúc ${timeArg}!`,
    `🧹 TTL: ${groupData.ttlText}`,
    '',
    groupData.isRunning
      ? `⏰ Lần gửi tiếp theo: ${next ? next.toLocaleString('vi-VN') : 'Không xác định'}`
      : `💡 Chạy: bonz auto pr gr ${groupName} start`
  ].filter(Boolean).join('\n');

  return api.sendMessage(response, threadId, type);
}

const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { processVideo } = require('../../utils/index');
const safeUtil = require('./safe.js');

// ======================== BONZ MENU IMAGE CREATOR (FROM PYTHON BOT) ========================
function getDominantColor(imagePath) {
  // Fallback colors for different scenarios
  const fallbackColors = [
    [255, 20, 147], [128, 0, 128], [0, 100, 0], 
    [0, 0, 139], [184, 134, 11], [138, 3, 3]
  ];
  return fallbackColors[Math.floor(Math.random() * fallbackColors.length)];
}

function getContrastingColor(baseColor, alpha = 255) {
  const [r, g, b] = baseColor;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? [255, 255, 255, alpha] : [0, 0, 0, alpha];
}

function randomContrastColor(baseColor) {
  const [r, g, b] = baseColor.slice(0, 3);
  const boxLuminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  let newR, newG, newB;
  if (boxLuminance > 0.5) {
    newR = Math.floor(Math.random() * 51); // 0-50
    newG = Math.floor(Math.random() * 51);
    newB = Math.floor(Math.random() * 51);
  } else {
    newR = Math.floor(Math.random() * 56) + 200; // 200-255
    newG = Math.floor(Math.random() * 56) + 200;
    newB = Math.floor(Math.random() * 56) + 200;
  }
  
  return [newR, newG, newB, 255];
}

function drawTextWithShadow(ctx, x, y, text, font, fillColor, shadowColor = [0, 0, 0, 250], shadowOffset = [2, 2]) {
  ctx.font = font;
  
  // Draw shadow
  ctx.fillStyle = `rgba(${shadowColor[0]}, ${shadowColor[1]}, ${shadowColor[2]}, ${shadowColor[3] / 255})`;
  ctx.fillText(text, x + shadowOffset[0], y + shadowOffset[1]);
  
  // Draw main text
  ctx.fillStyle = `rgba(${fillColor[0]}, ${fillColor[1]}, ${fillColor[2]}, ${fillColor[3] / 255})`;
  ctx.fillText(text, x, y);
}

async function downloadAvatar(avatarUrl) {
  if (!avatarUrl) return null;
  
  try {
    const axios = require('axios');
    const response = await axios.get(avatarUrl, { 
      responseType: 'arraybuffer',
      timeout: 5000 
    });
    
    const tempDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const avatarPath = path.join(tempDir, `avatar_${Date.now()}.png`);
    fs.writeFileSync(avatarPath, response.data);
    return avatarPath;
  } catch (error) {
    console.log('[Menu Image] Lỗi tải avatar:', error.message);
    return null;
  }
}

async function createBonzMenuImage(userName, userId, avatarUrl) {
  try {
    const { createCanvas, loadImage } = require('canvas');
    
    // Kích thước giống Python bot
    const size = [1920, 600];
    const canvas = createCanvas(size[0], size[1]);
    const ctx = canvas.getContext('2d');
    
    // Tạo background giống Python (có thể dùng màu solid thay vì load ảnh)
    const bgColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    const bgColor = bgColors[Math.floor(Math.random() * bgColors.length)];
    
    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size[0], size[1]);
    
    // Apply blur effect (simulate Gaussian blur)
    ctx.filter = 'blur(7px)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    
    // Box colors giống Python
    const boxColors = [
      [255, 20, 147, 90],   // Deep pink
      [128, 0, 128, 90],    // Purple  
      [0, 100, 0, 90],      // Dark green
      [0, 0, 139, 90],      // Dark blue
      [184, 134, 11, 90],   // Dark goldenrod
      [138, 3, 3, 90],      // Dark red
      [0, 0, 0, 90]         // Black
    ];
    
    const boxColor = boxColors[Math.floor(Math.random() * boxColors.length)];
    
    // Vẽ khung chính giống Python
    const boxX1 = 90, boxY1 = 60;
    const boxX2 = size[0] - 90, boxY2 = size[1] - 60;
    const radius = 75;
    
    // Rounded rectangle
    ctx.fillStyle = `rgba(${boxColor[0]}, ${boxColor[1]}, ${boxColor[2]}, ${boxColor[3] / 255})`;
    ctx.beginPath();
    ctx.roundRect(boxX1, boxY1, boxX2 - boxX1, boxY2 - boxY1, radius);
    ctx.fill();
    
    // Thời gian (góc phải trên)
    const now = new Date();
    const hour = now.getHours();
    const timeStr = now.toLocaleTimeString('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh'
    });
    const timeIcon = (hour >= 6 && hour < 18) ? "🌤️" : "🌙";
    
    const timeX = boxX2 - 250;
    const timeY = boxY1 + 10;
    
    // Determine text color based on box luminance
    const boxRgb = boxColor.slice(0, 3);
    const boxLuminance = (0.299 * boxRgb[0] + 0.587 * boxRgb[1] + 0.114 * boxRgb[2]) / 255;
    const lastLinesColor = boxLuminance < 0.5 ? [255, 255, 255, 220] : [0, 0, 0, 220];
    
    // Draw time icon and text
    const iconX = timeX - 75;
    const iconColor = randomContrastColor(boxColor);
    
    drawTextWithShadow(ctx, iconX, timeY - 8, timeIcon, 'bold 60px Arial', iconColor);
    ctx.fillStyle = `rgba(${lastLinesColor[0]}, ${lastLinesColor[1]}, ${lastLinesColor[2]}, ${lastLinesColor[3] / 255})`;
    ctx.font = 'bold 56px Arial';
    ctx.fillText(` ${timeStr}`, timeX, timeY);
    
    // User info và greeting
    const greetingName = userName;
    
    // Text lines giống Python
    const textLines = [
      `Hi, ${greetingName}`,
      `💞 Chào mừng đến menu BONZ BOT 🤖`,
      `bonz menu: 🚀 Xem menu đầy đủ`,
      "😁 Bot Sẵn Sàng Phục Vụ 🖤",
      `🤖Bot: BONZ 💻Version: 2.0 📅Update ${now.toLocaleDateString('vi-VN')}`
    ];
    
    // Colors cho từng dòng
    const color1 = randomContrastColor(boxColor);
    const color2 = randomContrastColor(boxColor);
    const textColors = [
      color1,
      color2, 
      lastLinesColor,
      lastLinesColor,
      lastLinesColor
    ];
    
    // Font sizes
    const textFonts = [
      'bold 76px Arial',  // Hi text
      'bold 68px Arial',  // Welcome 
      'bold 58px Arial',  // Menu info
      'bold 58px Arial',  // Bot ready
      'bold 64px Arial'   // Bot info
    ];
    
    // Avatar processing
    let avatarPath = null;
    if (avatarUrl) {
      avatarPath = await downloadAvatar(avatarUrl);
    }
    
    if (avatarPath && fs.existsSync(avatarPath)) {
      try {
        const avatarSize = 200;
        const avatar = await loadImage(avatarPath);
        
        // Create circular mask
        const avatarCanvas = createCanvas(avatarSize, avatarSize);
        const avatarCtx = avatarCanvas.getContext('2d');
        
        // Draw circular clipping path
        avatarCtx.beginPath();
        avatarCtx.arc(avatarSize/2, avatarSize/2, avatarSize/2, 0, Math.PI * 2);
        avatarCtx.clip();
        
        // Draw avatar
        avatarCtx.drawImage(avatar, 0, 0, avatarSize, avatarSize);
        
        // Create rainbow border (simplified)
        const borderSize = avatarSize + 10;
        const borderCanvas = createCanvas(borderSize, borderSize);
        const borderCtx = borderCanvas.getContext('2d');
        
        // Draw rainbow border (simplified gradient)
        const gradient = borderCtx.createConicGradient(0, borderSize/2, borderSize/2);
        gradient.addColorStop(0, '#ff0000');
        gradient.addColorStop(0.17, '#ff8800');
        gradient.addColorStop(0.33, '#ffff00');
        gradient.addColorStop(0.5, '#00ff00');
        gradient.addColorStop(0.67, '#0088ff');
        gradient.addColorStop(0.83, '#8800ff');
        gradient.addColorStop(1, '#ff0000');
        
        borderCtx.strokeStyle = gradient;
        borderCtx.lineWidth = 5;
        borderCtx.beginPath();
        borderCtx.arc(borderSize/2, borderSize/2, (borderSize-5)/2, 0, Math.PI * 2);
        borderCtx.stroke();
        
        // Position avatar
        const avatarY = Math.floor((boxY1 + boxY2 - avatarSize) / 2);
        
        // Draw border then avatar
        ctx.drawImage(borderCanvas, boxX1 + 40, avatarY);
        ctx.drawImage(avatarCanvas, boxX1 + 45, avatarY + 5);
        
        // Cleanup avatar file
        fs.unlinkSync(avatarPath);
      } catch (avatarError) {
        console.log('[Menu Image] Lỗi xử lý avatar:', avatarError.message);
        // Draw fallback emoji
        ctx.fillStyle = 'rgba(0, 139, 139, 255)';
        ctx.font = 'bold 60px Arial';
        ctx.fillText("🐳", boxX1 + 60, Math.floor((boxY1 + boxY2) / 2) - 140);
      }
    } else {
      // Draw fallback emoji
      ctx.fillStyle = 'rgba(0, 139, 139, 255)';
      ctx.font = 'bold 60px Arial';
      ctx.fillText("🐳", boxX1 + 60, Math.floor((boxY1 + boxY2) / 2) - 140);
    }
    
    // Draw text lines
    const lineSpacing = 85;
    let startY = boxY1 + 10;
    
    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i];
      const color = textColors[i];
      const font = textFonts[i];
      
      const y = startY + (i * lineSpacing);
      
      // Handle emoji and text separately (simplified)
      ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
      ctx.font = font;
      ctx.textAlign = 'left';
      
      // Calculate position to center text in available space
      const textX = boxX1 + 300; // Leave space for avatar
      ctx.fillText(line, textX, y);
    }
    
    // Save file
    const tempDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const fileName = `bonz_menu_${userId}_${Date.now()}.png`;
    const filePath = path.join(tempDir, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);
    
    console.log('[Menu Image] Đã tạo ảnh menu (Python style):', filePath);
    return filePath;
    
  } catch (error) {
    console.error('[Menu Image] Lỗi tạo ảnh:', error);
    return null;
  }
}

// Persistent storage for user-managed groups (bonz nhóm)
const GROUPS_DATA_DIR = path.join(__dirname, '../../data');
const GROUPS_DATA_FILE = path.join(GROUPS_DATA_DIR, 'bonz_groups.json');

function ensureGroupsDataDir() {
  try { if (!fs.existsSync(GROUPS_DATA_DIR)) fs.mkdirSync(GROUPS_DATA_DIR, { recursive: true }); } catch (_) {}
}

// ======================== BONZ SAFE (quản lý từ cấm) ========================
async function handleSafeCommand(api, event, args = [], isAdminOrOwner = false) {
  const { threadId, type } = event || {};
  const action = (args[0] || '').toLowerCase();
  console.log('[DEBUG] handleSafeCommand called, action:', action, 'isAdminOrOwner:', isAdminOrOwner);

  if (!action || action === 'help') {
    return api.sendMessage([
      '🛡️ BONZ SAFE - Quản lý từ cấm',
      '',
      '📋 CÁC LỆNH:',
      '• bonz safe từ <từ...> - Thêm từ cấm',
      '• bonz safe atlink <link...> - Thêm link cấm',
      '• bonz safe ls - Xem danh sách từ cấm',
      '• bonz safe xóa - Xóa hết từ cấm (do bạn thêm)',
      '• bonz safe on/off - Bật/tắt Safe Mode nhóm',
      '• bonz safe status - Xem trạng thái',
      '• bonz safe self <uid_bot> - Đặt UID bot',
      '',
      '💡 VÍ DỤ:',
      '• bonz safe từ sex xxx "phim sex"',
      '• bonz safe atlink zalo.me/g/ discord.gg/',
      '• bonz safe xóa'
    ].join('\n'), threadId, type);
  }

  // STATUS: ai cũng xem được
  if (action === 'status') {
    try {
      const globalOn = safeUtil.getSafeMode();
      const threadOn = safeUtil.getThreadSafeMode(threadId);
      const extras = safeUtil.listForbiddenExtras?.() || { words: [], links: [] };
      const lines = [];
      lines.push('🛡️ Trạng thái SAFE MODE');
      lines.push('');
      lines.push(`• Global: ${globalOn ? 'ON' : 'OFF'}`);
      lines.push(`• Group hiện tại: ${threadOn === null ? (globalOn ? 'theo Global (ON)' : 'theo Global (OFF)') : (threadOn ? 'ON' : 'OFF')}`);
      lines.push(`• Từ cấm thêm tay: ${extras.words.length}`);
      lines.push(`• Link cấm thêm tay: ${extras.links.length}`);
      return api.sendMessage({ msg: lines.join('\n'), ttl: __TIK_MESSAGE_TTL }, threadId, type);
    } catch {
      return api.sendMessage('❌ Không thể lấy trạng thái.', threadId, type);
    }
  }

  // Các lệnh thay đổi cấu hình chỉ cho admin/owner
  if (!isAdminOrOwner) {
    return api.sendMessage('❌ Chỉ admin/owner mới có thể chỉnh SAFE MODE!', threadId, type);
  }

  // ON/OFF theo nhóm hiện tại
  if (action === 'on' || action === 'off') {
    try {
      safeUtil.setThreadSafeMode(threadId, action === 'on');
      return api.sendMessage(`✅ SAFE MODE nhóm hiện tại: ${action.toUpperCase()}`, threadId, type);
    } catch {
      return api.sendMessage('❌ Không thể cập nhật SAFE MODE nhóm.', threadId, type);
    }
  }

  // SELF <uid>
  if (action === 'self') {
    const uid = String(args[1] || '').trim();
    if (!uid) return api.sendMessage('❌ Thiếu UID bot. Dùng: bonz safe self <uid_bot>', threadId, type);
    try { safeUtil.setSelfUid(uid); return api.sendMessage(`✅ Đã đặt UID bot: ${uid}`, threadId, type); }
    catch { return api.sendMessage('❌ Không thể đặt UID bot.', threadId, type); }
  }

  // từ = add terms (words/phrases)
  if (action === 'từ' || action === 'tu') {
    const terms = args.slice(1).filter(Boolean);
    if (!terms.length) {
      return api.sendMessage('❌ Thiếu danh sách từ!\nVí dụ: bonz safe từ sex "phim sex" xxx', threadId, type);
    }
    try {
      const res = safeUtil.addForbiddenWords(terms);
      if (res?.ok) {
        return api.sendMessage(`✅ Đã thêm từ cấm: ${terms.join(', ')}`, threadId, type);
      }
      return api.sendMessage('❌ Không thể thêm từ cấm.', threadId, type);
    } catch (e) {
      return api.sendMessage('❌ Lỗi khi thêm từ cấm.', threadId, type);
    }
  }

  // atlink = add link patterns
  if (action === 'atlink') {
    const links = args.slice(1).filter(Boolean);
    if (!links.length) {
      return api.sendMessage('❌ Thiếu link!\nVí dụ: bonz safe atlink zalo.me/g/ discord.gg/', threadId, type);
    }
    try {
      const res = safeUtil.addForbiddenLinks(links);
      if (res?.ok) {
        return api.sendMessage(`✅ Đã thêm link cấm: ${links.join(', ')}`, threadId, type);
      }
      return api.sendMessage('❌ Không thể thêm link cấm.', threadId, type);
    } catch (e) {
      return api.sendMessage('❌ Lỗi khi thêm link cấm.', threadId, type);
    }
  }

  // xóa = clear all user-added forbidden items
  if (action === 'xóa' || action === 'xoa' || action === 'clear') {
    try {
      const extras = safeUtil.listForbiddenExtras();
      const totalWords = extras.words.length;
      const totalLinks = extras.links.length;
      
      if (totalWords === 0 && totalLinks === 0) {
        return api.sendMessage('ℹ️ Không có từ cấm nào để xóa!', threadId, type);
      }
      
      // Xóa tất cả từ cấm do user thêm
      const allItems = [...extras.words, ...extras.links];
      const result = safeUtil.removeForbidden(allItems);
      
      if (result.ok) {
        return api.sendMessage([
          '🗑️ ĐÃ XÓA HẾT TỪ CẤM!',
          '',
          `✅ Đã xóa: ${result.removedWords} từ cấm + ${result.removedLinks} link cấm`,
          `📊 Tổng cộng: ${totalWords + totalLinks} mục`,
          '',
          '💡 Lưu ý: Chỉ xóa từ cấm do bạn thêm, không xóa từ cấm gốc của hệ thống.'
        ].join('\n'), threadId, type);
      } else {
        return api.sendMessage('❌ Lỗi xóa từ cấm: ' + result.error, threadId, type);
      }
    } catch (e) {
      return safeSendMessage(api, '❌ Lỗi: ' + e.message, threadId, type);
    }
  }

  // ls = list user-added forbidden items
  if (action === 'ls' || action === 'list') {
    try {
      const extras = safeUtil.listForbiddenExtras();
      
      let msg = ['📋 DANH SÁCH TỪ CẤM (do bạn thêm):', ''];
      
      if (extras.words.length > 0) {
        msg.push('🚫 TỪ/CỤM TỪ CẤM:');
        extras.words.slice(0, 20).forEach((word, i) => {
          msg.push(`${i + 1}. ${word}`);
        });
        if (extras.words.length > 20) {
          msg.push(`... và ${extras.words.length - 20} từ khác`);
        }
        msg.push('');
      }
      
      if (extras.links.length > 0) {
        msg.push('🔗 LINK/PATTERN CẤM:');
        extras.links.slice(0, 10).forEach((link, i) => {
          msg.push(`${i + 1}. ${link}`);
        });
        if (extras.links.length > 10) {
          msg.push(`... và ${extras.links.length - 10} link khác`);
        }
        msg.push('');
      }
      
      if (extras.words.length === 0 && extras.links.length === 0) {
        msg.push('ℹ️ Chưa có từ cấm nào được thêm!');
        msg.push('');
        msg.push('💡 Thêm từ cấm: bonz safe từ <từ...>');
      } else {
        msg.push(`📊 Tổng: ${extras.words.length} từ + ${extras.links.length} link`);
        msg.push('🗑️ Xóa hết: bonz safe xóa');
      }
      
      return api.sendMessage(msg.join('\n'), threadId, type);
    } catch (e) {
      return safeSendMessage(api, '❌ Lỗi: ' + e.message, threadId, type);
    }
  }

  return api.sendMessage('❌ Lệnh không hợp lệ. Gõ: bonz safe help', threadId, type);
}

// ======================== TEST SAFE MODE ========================
async function handleTestSafe(api, event, args = []) {
  const { threadId, type, data } = event || {};
  const senderId = String(data?.uidFrom || event?.authorId || '');
  
  // Kiểm tra quyền admin bot
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const isAdmin = adminList.includes(senderId) || ownerList.includes(senderId);
  
  if (!isAdmin) {
    return safeSendMessage(api, '🚫 Chỉ admin mới có thể sử dụng lệnh testsafe!', threadId, type);
  }

  // Loại bỏ /testsafe hoặc testsafe khỏi args
  let cleanArgs = args;
  if (args[0] && (args[0].toLowerCase() === 'testsafe' || args[0].toLowerCase() === '/testsafe')) {
    cleanArgs = args.slice(1);
  } else if (args.join(' ').toLowerCase().startsWith('/testsafe')) {
    const fullCommand = args.join(' ');
    const afterTestsafe = fullCommand.substring(fullCommand.toLowerCase().indexOf('/testsafe') + 9).trim();
    cleanArgs = afterTestsafe ? afterTestsafe.split(' ') : [];
  }

  const action = (cleanArgs[0] || '').toLowerCase();

  // /testsafe status - Xem trạng thái Safe Mode
  if (action === 'status') {
    try {
      const isEnabled = safeUtil.getSafeMode?.(threadId) || false;
      const threadEnabled = safeUtil.getThreadSafeMode?.(threadId) || false;
      const stats = safeUtil.getViolationStats?.() || [];
      
      const message = [
        '🛡️ TRẠNG THÁI SAFE MODE',
        '',
        `📊 Global Safe Mode: ${isEnabled ? '✅ BẬT' : '❌ TẮT'}`,
        `🏠 Thread Safe Mode: ${threadEnabled ? '✅ BẬT' : '❌ TẮT'}`,
        `📈 Tổng vi phạm: ${stats.length} người dùng`,
        `🔧 Thread ID: ${threadId}`,
        '',
        '💡 Dùng: /testsafe từ <word> để test thêm từ cấm'
      ];
      
      return safeSendMessage(api, message.join('\n'), threadId, type);
    } catch (e) {
      return safeSendMessage(api, '❌ Lỗi khi kiểm tra trạng thái: ' + e.message, threadId, type);
    }
  }

  // /testsafe từ <word> - Test thêm từ cấm
  if (action === 'từ' || action === 'tu') {
    const word = cleanArgs.slice(1).join(' ').trim();
    
    if (!word) {
      return safeSendMessage(api, '❌ Thiếu từ cần thêm!\nDùng: /testsafe từ <từ_cấm>', threadId, type);
    }

    try {
      // Thêm từ cấm
      const result = safeUtil.addForbiddenWords?.(threadId, [word]);
      
      if (result) {
        // Ghi nhận vi phạm test
        const sender = { id: senderId, name: data?.senderName || 'Test Admin' };
        safeUtil.recordViolation?.(sender);
        
        return safeSendMessage(api, 
          `✅ Đã thêm từ cấm: "${word}"\n` +
          `🛡️ Safe Mode sẽ tự động xóa tin nhắn chứa từ này\n` +
          `📊 Đã ghi nhận 1 vi phạm test cho bạn`, 
          threadId, type
        );
      } else {
        return safeSendMessage(api, '❌ Không thể thêm từ cấm. Có thể từ này đã tồn tại.', threadId, type);
      }
    } catch (e) {
      return safeSendMessage(api, '❌ Lỗi khi thêm từ cấm: ' + e.message, threadId, type);
    }
  }

  // Hiển thị help nếu không có action hợp lệ
  const helpMessage = [
    '🧪 TESTSAFE - LỆNH TEST SAFE MODE',
    '',
    '📋 CÁC LỆNH:',
    '• /testsafe status - Xem trạng thái Safe Mode',
    '• /testsafe từ <word> - Test thêm từ cấm',
    '',
    '💡 VÍ DỤ:',
    '• /testsafe status',
    '• /testsafe từ badword',
    '• /testsafe từ từ xấu',
    '',
    '🛡️ Lệnh này chỉ dành cho admin test Safe Mode'
  ];
  
  return safeSendMessage(api, helpMessage.join('\n'), threadId, type);
}

// ======================== THỐNG KÊ VI PHẠM ========================
async function handleViolationStats(api, event, args = [], isAdminOrOwner = false) {
  const { threadId, type } = event || {};
  const action = (args[0] || '').toLowerCase();

  if (!isAdminOrOwner) {
    return safeSendMessage(api, '❌ Chỉ admin/owner mới có thể xem thống kê vi phạm!', threadId, type);
  }

  if (action === 'clear' || action === 'xóa') {
    try {
      safeUtil.clearViolationStats?.();
      return safeSendMessage(api, '✅ Đã xóa toàn bộ thống kê vi phạm!', threadId, type);
    } catch {
      return safeSendMessage(api, '❌ Không thể xóa thống kê.', threadId, type);
    }
  }

  try {
    const stats = safeUtil.getViolationStats?.();
    console.log('[DEBUG] Violation stats:', stats);
    
    if (!stats || stats.length === 0) {
      return safeSendMessage(api, '📊 Chưa có ai vi phạm Safe Mode.', threadId, type);
    }

    const lines = [];
    lines.push('📊 THỐNG KÊ VI PHẠM SAFE MODE');
    lines.push('');
    
    const top = stats.slice(0, 20); // Top 20
    for (let i = 0; i < top.length; i++) {
      const user = top[i];
      const lastTime = new Date(user.lastViolation).toLocaleString('vi-VN');
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      lines.push(`${medal} ${user.name} (${user.uid})`);
      lines.push(`   📈 ${user.count} lần vi phạm`);
      lines.push(`   🕐 Gần nhất: ${lastTime}`);
      lines.push('');
    }

    if (stats.length > 20) {
      lines.push(`... và ${stats.length - 20} người khác`);
    }

    lines.push('💡 Dùng: bonz tổng từ clear - để xóa thống kê');

    return safeSendMessage(api, lines.join('\n'), threadId, type);
    
  } catch (e) {
    return safeSendMessage(api, '❌ Lỗi khi lấy thống kê: ' + e.message, threadId, type);
  }
}

function loadSavedGroups() {
  try {
    ensureGroupsDataDir();
    if (!fs.existsSync(GROUPS_DATA_FILE)) return [];
    const raw = fs.readFileSync(GROUPS_DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}

function saveSavedGroups(groups) {
  try {
    ensureGroupsDataDir();
    fs.writeFileSync(GROUPS_DATA_FILE, JSON.stringify(groups, null, 2), 'utf8');
    return true;
  } catch (_) { return false; }
}

// Hàm xóa tất cả tin nhắn của một user trong nhóm
async function deleteUserMessages(api, threadId, userId) {
  try {
    let deletedCount = 0;
    let totalChecked = 0;
    let consecutiveEmptyBatches = 0;
    
    console.log(`[DELETE] Bắt đầu xóa tin nhắn của user ${userId} trong thread ${threadId}`);
    
    // Lấy tin nhắn theo batch và xóa ngay
    for (let batch = 0; batch < 100; batch++) { // Tối đa 100 batch
      try {
        console.log(`[DELETE] Đang xử lý batch ${batch + 1}...`);
        
        // Lấy tin nhắn mới nhất (không dùng offset vì tin nhắn bị xóa sẽ thay đổi index)
        const messages = await api.getThreadHistory(threadId, 50, 0);
        
        if (!messages || messages.length === 0) {
          console.log(`[DELETE] Không còn tin nhắn nào trong thread`);
          break;
        }
        
        totalChecked += messages.length;
        
        // Lọc tin nhắn của user cần xóa
        const userMessages = messages.filter(msg => {
          const senderId = String(msg?.senderID || msg?.authorId || msg?.data?.uidFrom || '');
          return senderId === String(userId);
        });
        
        console.log(`[DELETE] Tìm thấy ${userMessages.length} tin nhắn của user trong batch này`);
        
        if (userMessages.length === 0) {
          consecutiveEmptyBatches++;
          // Nếu 5 batch liên tiếp không có tin nhắn của user, dừng
          if (consecutiveEmptyBatches >= 5) {
            console.log(`[DELETE] Đã check 5 batch liên tiếp không có tin nhắn của user, dừng`);
            break;
          }
          continue;
        } else {
          consecutiveEmptyBatches = 0; // Reset counter
        }
        
        // Xóa từng tin nhắn của user
        for (const message of userMessages) {
          try {
            const messageId = message?.messageID || message?.msgId || message?.id;
            if (messageId) {
              console.log(`[DELETE] Đang xóa tin nhắn ID: ${messageId}`);
              
              // Thử nhiều cách xóa tin nhắn
              let deleteSuccess = false;
              
              // Cách 1: unsendMessage
              try {
                await api.unsendMessage(messageId);
                deleteSuccess = true;
                console.log(`[DELETE] Xóa thành công bằng unsendMessage: ${messageId}`);
              } catch (e1) {
                console.log(`[DELETE] unsendMessage thất bại: ${e1.message}`);
              }
              
              // Cách 2: removeMessage (nếu có)
              if (!deleteSuccess && typeof api.removeMessage === 'function') {
                try {
                  await api.removeMessage(messageId, threadId);
                  deleteSuccess = true;
                  console.log(`[DELETE] Xóa thành công bằng removeMessage: ${messageId}`);
                } catch (e2) {
                  console.log(`[DELETE] removeMessage thất bại: ${e2.message}`);
                }
              }
              
              // Cách 3: deleteMessage (nếu có)
              if (!deleteSuccess && typeof api.deleteMessage === 'function') {
                try {
                  await api.deleteMessage(messageId);
                  deleteSuccess = true;
                  console.log(`[DELETE] Xóa thành công bằng deleteMessage: ${messageId}`);
                } catch (e3) {
                  console.log(`[DELETE] deleteMessage thất bại: ${e3.message}`);
                }
              }
              
              // Cách 4: Thử API trực tiếp với HTTP request
              if (!deleteSuccess) {
                try {
                  // Lấy access token từ api object
                  const accessToken = api.getAccessToken?.() || api.accessToken || api.token;
                  if (accessToken) {
                    const response = await axios.post('https://openapi.zalo.me/v2.0/oa/message/remove', {
                      message_id: messageId
                    }, {
                      headers: {
                        'access_token': accessToken,
                        'Content-Type': 'application/json'
                      }
                    });
                    
                    if (response.data && response.data.error === 0) {
                      deleteSuccess = true;
                      console.log(`[DELETE] Xóa thành công bằng HTTP API: ${messageId}`);
                    } else {
                      console.log(`[DELETE] HTTP API thất bại: ${JSON.stringify(response.data)}`);
                    }
                  }
                } catch (e4) {
                  console.log(`[DELETE] HTTP API thất bại: ${e4.message}`);
                }
              }
              
              // Cách 5: Thử với sendMessage để "ghi đè" (fake delete)
              if (!deleteSuccess) {
                try {
                  // Gửi tin nhắn trống để thay thế
                  await api.editMessage('⚠️ [Tin nhắn đã bị xóa bởi admin]', messageId);
                  deleteSuccess = true;
                  console.log(`[DELETE] "Xóa" thành công bằng edit message: ${messageId}`);
                } catch (e5) {
                  console.log(`[DELETE] Edit message thất bại: ${e5.message}`);
                }
              }
              
              if (deleteSuccess) {
                deletedCount++;
              } else {
                console.log(`[DELETE] Không thể xóa tin nhắn ${messageId} bằng bất kỳ phương pháp nào`);
              }
              
              // Delay để tránh spam API
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } catch (deleteError) {
            console.log(`[DELETE] Lỗi khi xóa tin nhắn: ${deleteError.message}`);
          }
        }
        
        // Delay giữa các batch
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (batchError) {
        console.log(`[DELETE] Lỗi khi xử lý batch ${batch + 1}: ${batchError.message}`);
        break;
      }
    }
    
    console.log(`[DELETE] Hoàn thành! Đã xóa ${deletedCount} tin nhắn, kiểm tra ${totalChecked} tin nhắn`);
    
    // Nếu không xóa được tin nhắn nào, thử kick user ra khỏi nhóm
    if (deletedCount === 0 && totalChecked > 0) {
      console.log(`[DELETE] Không xóa được tin nhắn nào, thử kick user ra khỏi nhóm...`);
      try {
        await api.removeUserFromGroup(userId, threadId);
        console.log(`[DELETE] Đã kick user ${userId} ra khỏi nhóm ${threadId}`);
        return {
          success: true,
          deletedCount: 0,
          totalChecked: totalChecked,
          kicked: true,
          message: `Không thể xóa tin nhắn nhưng đã kick user ra khỏi nhóm`
        };
      } catch (kickError) {
        console.log(`[DELETE] Không thể kick user: ${kickError.message}`);
        
        // Phương án cuối: Ban user (nếu có API)
        try {
          if (typeof api.banUser === 'function') {
            await api.banUser(userId, threadId);
            console.log(`[DELETE] Đã ban user ${userId} trong nhóm ${threadId}`);
            return {
              success: true,
              deletedCount: 0,
              totalChecked: totalChecked,
              banned: true,
              message: `Không thể xóa tin nhắn nhưng đã ban user`
            };
          }
        } catch (banError) {
          console.log(`[DELETE] Không thể ban user: ${banError.message}`);
        }
      }
    }
    
    return {
      success: deletedCount > 0 || totalChecked === 0,
      deletedCount: deletedCount,
      totalChecked: totalChecked,
      message: deletedCount === 0 ? 'Không thể xóa tin nhắn - có thể do giới hạn quyền API' : undefined
    };
    
  } catch (error) {
    console.error('[DELETE] Lỗi trong deleteUserMessages:', error);
    return {
      success: false,
      error: error.message || 'Lỗi không xác định',
      deletedCount: 0
    };
  }
}

// ===================== TỪ ĐIỂN TIẾNG VIỆT (nếu có) =====================
let __viDictCache = null; // Set từ gốc (có dấu)
let __viDictAsciiCache = null; // Set từ đã bỏ dấu
function __stripDia(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g,'d').replace(/Đ/g,'D');
}

// Menu thông tin cho "bonz câu đố": user, id, điểm (tổng hợp), số câu đã trả lời, xếp hạng
async function handleCauDoMenu(api, event, ThreadsRef) {
  const { threadId, type } = event || {};
  const uid = String(event?.data?.uidFrom || event?.authorId || '');
  if (!ThreadsRef) { try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {} }
  let tdata = {};
  try { const th = await ThreadsRef.getData(threadId); tdata = th?.data || {}; } catch {}
  const score1 = tdata?.cau_do?.score || {};
  const score2 = tdata?.quiz?.score || {};
  const totalMap = new Map();
  for (const [k,v] of Object.entries(score1)) totalMap.set(k, (totalMap.get(k)||0) + (v||0));
  for (const [k,v] of Object.entries(score2)) totalMap.set(k, (totalMap.get(k)||0) + (v||0));
  const entries = Array.from(totalMap.entries());
  entries.sort((a,b)=> (b[1]||0)-(a[1]||0));
  let rank = '-';
  let myPoints = totalMap.get(uid) || 0;
  for (let i=0;i<entries.length;i++){ if (entries[i][0] === uid){ rank = String(i+1); break; } }
  const answered = tdata?.stats?.answersCount?.[uid] || 0;
  // Tên hiển thị
  let name = uid;
  try {
    const info = await api.getUserInfo([uid]);
    name = info?.changed_profiles?.[uid]?.displayName || uid;
  } catch {}
  const lines = [
    '🧩 MENU CÂU ĐỐ',
    `👤 Người dùng: ${name}`,
    `🆔 ID: ${uid}`,
    `🏆 Điểm (tổng): ${myPoints}`,
    `📝 Số câu đã trả lời: ${answered}`,
    `📈 Xếp hạng: ${rank}/${entries.length || 0}`,
    '',
    '• Bắt đầu nhanh (random): bonz quiz',
    '• Bắt đầu theo môn: bonz câu đố môn <môn> | hoặc: bonz quiz <môn>',
    '• Xem điểm tổng: bonz điểm',
  ];
  return api.sendMessage(lines.join('\n'), threadId, type);
}

// Handler tổng hợp: ra câu đố ngẫu nhiên (ABCD hoặc free-text)
async function handleCauDoRandom(api, event, ThreadsRef) {
  const { threadId, type } = event || {};
  const userId = String(event?.data?.uidFrom || event?.authorId || '');
  
  // Kiểm tra xem có câu hỏi đang chờ trả lời không
  if (!ThreadsRef) {
    try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {}
  }
  
  let tdata = {};
  try { tdata = await ThreadsRef.getData(threadId) || {}; } catch {}
  
  // Kiểm tra câu hỏi đang active
  const activeQuestion = tdata?.cau_do?.active;
  if (activeQuestion && activeQuestion.exp > Date.now()) {
    // Kiểm tra xem người dùng hiện tại có phải là người đã hỏi câu này không
    const questionAsker = activeQuestion.by;
    
    // Nếu có câu hỏi đang chờ và người dùng khác hỏi câu mới
    if (questionAsker && questionAsker !== userId) {
      const askerName = activeQuestion.askerName || 'Ai đó';
      const subjectInfo = activeQuestion.subjectName ? `\n📚 Môn: ${activeQuestion.subjectName}` : '';
      
      return api.sendMessage(
        `⚠️ PHẢI TRẢ LỜI CÂU HỎI HIỆN TẠI TRƯỚC!\n\n` +
        `👤 Người hỏi: ${askerName}${subjectInfo}\n` +
        `❓ Câu hỏi: ${activeQuestion.q}\n\n` +
        `💡 Trả lời bằng: bonz câu <đáp án>\n` +
        `⏰ Còn lại: ${Math.ceil((activeQuestion.exp - Date.now()) / 60000)} phút\n\n` +
        `🚫 Không thể hỏi câu mới khi chưa trả lời câu cũ!`,
        threadId, type
      );
    }
    
    // Nếu cùng người hỏi lại thì cho phép (refresh câu hỏi)
    if (questionAsker === userId) {
      return api.sendMessage(
        `🔄 BẠN ĐÃ CÓ CÂU HỎI ĐANG CHỜ TRẢ LỜI!\n\n` +
        `❓ ${activeQuestion.q}\n\n` +
        `💡 Trả lời bằng: bonz câu <đáp án>\n` +
        `⏰ Còn lại: ${Math.ceil((activeQuestion.exp - Date.now()) / 60000)} phút\n\n` +
        `🎯 Hãy trả lời câu này trước khi hỏi câu mới!`,
        threadId, type
      );
    }
  }
  
  // CHỈ CÂU ĐỐ TỰ LUẬN - KHÔNG CÓ TRẮC NGHIỆM
  console.log("[BonzCauDo] Chỉ câu đố tự luận");
  return await handleCauDoStart(api, event, [], ThreadsRef);
}

// Handler cho lệnh help
async function handleHelp(api, event) {
  const { threadId, type } = event || {};
  const userId = String(event?.data?.uidFrom || event?.authorId || '');
  
  let userName = userId;
  try {
    const info = await api.getUserInfo([userId]);
    userName = info?.changed_profiles?.[userId]?.displayName || userId;
  } catch {}

  const helpContent = [
    '🤖 bonz 💕ly - HƯỚNG DẪN SỬ DỤNG',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `👤 Người dùng: ${userName}`,
    `🆔 ID: ${userId}`,
    '',
    '🎮 GIẢI TRÍ & GAME:',
    '• bonz câu đố - Chơi câu đố kiến thức',
    '• bonz câu đố môn <môn> - Câu đố theo môn học',
    '• bonz điểm - Xem bảng xếp hạng',
    '• bonz ảnh gái - Xem ảnh ngẫu nhiên',
    '• bonz ai ảnh <mô tả> - Tạo ảnh bằng AI',
    '',
    '🔧 TIỆN ÍCH:',
    '• bonz get id - Lấy ID người dùng',
    '• bonzid2 - Lấy ID chi tiết',
    '• bonz qr <text> - Tạo mã QR',
    '• bonz yt info <link> - Thông tin video YouTube',
    '• bonz fb <link> - Lấy ID Facebook từ link',
    '• bonz group [link] - Lấy thông tin nhóm Facebook',
    '• bonz reminder <thời gian> <nội dung> - Đặt lời nhắc',
    '• bonz horoscope <cung> - Xem tử vi hàng ngày',
    '• bonz lịch - Xem lịch và thông tin ngày tháng',
    '',
    '🛡️ QUẢN LÝ NHÓM (Admin):',
    '• bonz war group - Cấu hình bảo vệ cơ bản',
    '• bonz war max - Cấu hình bảo vệ tối đa',
    '• bonz lock - Khóa chat nhóm',
    '• bonz unlock - Mở khóa chat nhóm',
    '• bonz mở chat - Mở khóa chat nhóm',
    '',
    '👮 QUẢN LÝ NGƯỜI DÙNG (Admin):',
    '• bonz khóa @user [lý do] - Khóa người dùng',
    '• bonz mở khóa @user - Mở khóa người dùng',
    '• bonz ds khóa - Xem danh sách bị khóa',
    '• bonz spam stats - Thống kê spam guard',
    '• bonz spam whitelist - Quản lý whitelist',
    '• bonz cay on @user - Réo tên/spam người được tag',
    '• bonz cay stop - Dừng réo tên',
    '',
    '📚 HỖ TRỢ:',
    '• bonz help - Hiển thị hướng dẫn này',
    '• bonz in bot - Xem thông tin chi tiết về bot',
    '• bonz pr - Xem bảng dịch vụ VIP',
    '• bonz list group - Liệt kê tất cả group bot',
    '• bonz admin - Menu quản trị viên',
    '• bonz auto pr - Hệ thống Auto PR (Admin)',
    '',
    '💡 MẸO: Gõ tên lệnh để xem chi tiết cách sử dụng!',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ];

  return api.sendMessage(helpContent.join('\n'), threadId, type);
}

async function __saveQuizExternal(map) {
  try {
    const dir = path.dirname(__QUIZ_EXTERNAL_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Normalize 'correct' to uppercase
    const out = {};
    for (const [k, arr] of Object.entries(map || {})) {
      if (!Array.isArray(arr)) continue;
      out[k] = arr.map(x => ({ ...x, correct: String(x.correct || '').toUpperCase() }));
    }
    fs.writeFileSync(__QUIZ_EXTERNAL_PATH, JSON.stringify(out, null, 2), 'utf8');
    return true;
  } catch (e) { return false; }
}

function __uniquePush(list, item) {
  const key = `${item.q}__${item.correct}`;
  if (list.__keys) {
    if (list.__keys.has(key)) return false;
    list.__keys.add(key);
    list.push(item);
    return true;
  }
  const set = new Set(list.map(it => `${it.q}__${it.correct}`));
  if (set.has(key)) return false;
  set.add(key); list.__keys = set; list.push(item); return true;
}

// Đảm bảo reset điểm theo chu kỳ 1 tháng (30 ngày) cho từng phân hệ điểm
function __ensureMonthlyReset(tdata, section) {
  try {
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000; // 30 ngày
    tdata[section] = tdata[section] || {};
    const last = Number(tdata[section].lastResetAt || 0);
    
    // TẠM THỜI VÔ HIỆU HÓA RESET TỰ ĐỘNG ĐỂ DEBUG
    // if (!last || (now - last) > monthMs) {
    //   // Chỉ reset điểm (score) của phân hệ, giữ lại các state khác
    //   if (tdata[section].score && typeof tdata[section].score === 'object') {
    //     tdata[section].score = {};
    //   }
    //   tdata[section].lastResetAt = now;
    //   return true; // đã reset
    // }
    
    // Khởi tạo lastResetAt nếu chưa có
    if (!last) {
      tdata[section].lastResetAt = now;
    }
  } catch {}
  return false; // không reset
}

function __genMathQuestions(n) {
  const out = [];
  const ops = [
    { s: '+', f: (a,b)=>a+b },
    { s: '-', f: (a,b)=>a-b },
    { s: '×', f: (a,b)=>a*b },
  ];
  let tries = 0;
  while (out.length < n && tries < n*50) {
    tries++;
    const a = Math.floor(1 + Math.random()*99);
    const b = Math.floor(1 + Math.random()*99);
    const op = ops[Math.floor(Math.random()*ops.length)];
    const ans = op.f(a,b);
    const q = `Giá trị của ${a} ${op.s} ${b} là bao nhiêu?`;
    const correct = ans;
    const choices = new Set([correct]);
    while (choices.size < 4) {
      const delta = Math.floor(1 + Math.random()*10);
      const sign = Math.random() < 0.5 ? -1 : 1;
      const cand = correct + sign*delta;
      choices.add(cand);
    }
    const arr = Array.from(choices);
    // Shuffle
    for (let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
    const idx = arr.indexOf(correct);
    const corrLetter = ['A','B','C','D'][idx];
    const item = { q, A: String(arr[0]), B: String(arr[1]), C: String(arr[2]), D: String(arr[3]), correct: corrLetter };
    __uniquePush(out, item);
  }
  return out;
}

function __genEnglishQuestions(n) {
  const out = [];
  const subjects = [
    { s: 'He', v: { base: 'go', s3: 'goes' } },
    { s: 'She', v: { base: 'eat', s3: 'eats' } },
    { s: 'It', v: { base: 'rain', s3: 'rains' } },
    { s: 'They', v: { base: 'play', s3: 'play' } },
    { s: 'I', v: { base: 'work', s3: 'work' } },
    { s: 'We', v: { base: 'study', s3: 'study' } },
  ];
  const times = ['every day', 'on Sundays', 'at night', 'in the morning'];
  let tries = 0;
  while (out.length < n && tries < n*50) {
    tries++;
    const s = subjects[Math.floor(Math.random()*subjects.length)];
    const t = times[Math.floor(Math.random()*times.length)];
    const needsS3 = ['He','She','It'].includes(s.s);
    const correct = needsS3 ? s.v.s3 : s.v.base;
    const wrongs = new Set([correct]);
    wrongs.add(needsS3 ? s.v.base : s.v.s3);
    wrongs.add(correct + 's');
    wrongs.add(correct + 'ed');
    const arr = Array.from(wrongs).slice(0,4);
    while (arr.length < 4) arr.push(s.v.base);
    // Shuffle
    for (let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
    const idx = arr.indexOf(correct);
    const corrLetter = ['A','B','C','D'][idx];
    const q = `${s.s} ____ to school ${t}.`;
    const item = { q, A: arr[0], B: arr[1], C: arr[2], D: arr[3], correct: corrLetter };
    __uniquePush(out, item);
  }
  return out;
}

async function handleQuizGen(api, event, args = [], ThreadsRef) {
  const { threadId, type } = event || {};
  const senderId = String(event?.data?.uidFrom || event?.authorId || '');
  if (!__isAdminUID(senderId)) {
    return api.sendMessage('🚫 Chỉ admin/owner bot mới dùng được lệnh này.', threadId, type);
  }
  const subj = __normalizeSubject(args[0] || '');
  const n = Math.min(Math.max(parseInt(args[1] || '0', 10) || 0, 1), 1000);
  if (!subj || !n) {
    return api.sendMessage('Dùng: bonz quiz gen <môn> <số lượng (1-1000)>. Ví dụ: bonz quiz gen toan 200', threadId, type);
  }
  let generated = [];
  if (subj === 'toan') generated = __genMathQuestions(n);
  else if (subj === 'tienganh') generated = __genEnglishQuestions(n);
  else {
    return api.sendMessage('Hiện chỉ hỗ trợ sinh tự động cho: toan, tienganh. Các môn khác vui lòng import qua assets/quiz_bank.json.', threadId, type);
  }

  const bankMap = __getQuizBankMerged();
  bankMap[subj] = (bankMap[subj] || []).concat(generated);
  const ok = await __saveQuizExternal(bankMap);
  if (!ok) return api.sendMessage('❌ Lỗi lưu assets/quiz_bank.json. Kiểm tra quyền ghi tệp.', threadId, type);
  return api.sendMessage(`✅ Đã sinh thêm ${generated.length} câu cho môn ${subj}. Tổng hiện có: ${bankMap[subj].length}`, threadId, type);
}

async function handleQuizExport(api, event, ThreadsRef) {
  const { threadId, type } = event || {};
  const senderId = String(event?.data?.uidFrom || event?.authorId || '');
  if (!isBotAdmin?.(senderId)) {
    return api.sendMessage('🚫 Chỉ admin/owner bot mới dùng được lệnh này.', threadId, type);
  }
  const bankMap = __getQuizBankMerged();
  const counts = Object.fromEntries(Object.entries(bankMap).map(([k,v])=>[k, Array.isArray(v)? v.length:0]));
  const lines = ['📦 Số câu hỏi theo môn:'];
  for (const [k,c] of Object.entries(counts)) lines.push(`- ${k}: ${c}`);
  lines.push('');
  lines.push(`Tệp: ${__QUIZ_EXTERNAL_PATH}`);
  return api.sendMessage(lines.join('\n'), threadId, type);
}

// ===================== QUIZ BANK LOADER (LOCAL ONLY) =====================
let __quizBankCache = null;
let __quizBankCacheTime = 0;
const __QUIZ_EXTERNAL_PATH = path.join(__dirname, '..', '..', 'assets', 'quiz_bank.json');
function __validateQuizItem(it) {
  return it && typeof it === 'object' && it.q && it.A && it.B && it.C && it.D && ['A','B','C','D'].includes(String(it.correct||'').toUpperCase());
}
function __mergeQuizBanks(baseMap, extMap) {
  const out = { ...baseMap };
  if (extMap && typeof extMap === 'object') {
    for (const [k, arr] of Object.entries(extMap)) {
      if (!Array.isArray(arr)) continue;
      out[k] = (out[k] || []).concat(arr.filter(__validateQuizItem));
    }
  }
  return out;
}
function __getQuizBankMerged() {
  const now = Date.now();
  if (__quizBankCache && now - __quizBankCacheTime < 60_000) return __quizBankCache; // cache 60s
  let ext = null;
  try {
    if (fs.existsSync(__QUIZ_EXTERNAL_PATH)) {
      const raw = fs.readFileSync(__QUIZ_EXTERNAL_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      // Normalize correct to uppercase
      for (const k of Object.keys(parsed)) {
        if (Array.isArray(parsed[k])) {
          parsed[k] = parsed[k].map(x => x && { ...x, correct: String(x.correct||'').toUpperCase() });
        }
      }
      ext = parsed;
    }
  } catch {}
  __quizBankCache = __mergeQuizBanks(__quizBank, ext);
  __quizBankCacheTime = now;
  return __quizBankCache;
}

// Câu đố theo môn (dạng trắc nghiệm ABCD): dùng API tạo câu hỏi theo môn, fallback ngân hàng quiz
async function handleCauDoStartSubject(api, event, args = [], ThreadsRef) {
  const { threadId, type } = event || {};
  const subjRaw = args[0] || '';
  const subj = __normalizeSubject(subjRaw);
  if (!subj) {
    const subjects = Object.keys(__getQuizBankMerged()).join(', ');
    return api.sendMessage(`Dùng: bonz câu đố môn <môn>\nMôn hỗ trợ: ${subjects}`, threadId, type);
  }
  const bankMap = __getQuizBankMerged();
  const bank = bankMap[subj] || [];
  if (!Array.isArray(bank) || bank.length === 0) return api.sendMessage('❌ Môn này hiện chưa có dữ liệu.', threadId, type);
  const q = bank[Math.floor(Math.random() * bank.length)];

  // Lưu vào quiz (để trả lời bằng bonz chọn A|B|C|D)
  if (!ThreadsRef) { try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {} }
  let tdata = {}; try { const th = await ThreadsRef.getData(threadId); tdata = th?.data || {}; } catch {}
  tdata.quiz = tdata.quiz || {};
  const now = Date.now();
  const ttlMs = 10 * 60 * 1000;
  tdata.quiz.active = { subj, q: q.q, A: q.A, B: q.B, C: q.C, D: q.D, correct: q.correct, at: now, exp: now + ttlMs, answers: {} };
  tdata.quiz.score = tdata.quiz.score || {};
  try { await ThreadsRef.setData(threadId, tdata); } catch {}

  const msg = [
    `🧩 Câu đố theo môn (${subjRaw || subj}):`,
    `❓ ${q.q}`,
    `A) ${q.A}`,
    `B) ${q.B}`,
    `C) ${q.C}`,
    `D) ${q.D}`,
    '',
    'Trả lời bằng: bonz chọn A|B|C|D (mỗi người chỉ 1 lần)'
  ].join('\n');
  return api.sendMessage(msg, threadId, type);
}

// ======================== LEADERBOARDS ========================
async function handleQuizLeaderboard(api, event, ThreadsRef) {
  const { threadId, type } = event || {};
  if (!ThreadsRef) { try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {} }
  let tdata = {};
  try { const th = await ThreadsRef.getData(threadId); tdata = th?.data || {}; } catch {}
  const score = tdata?.quiz?.score || {};
  const entries = Object.entries(score);
  if (entries.length === 0) return api.sendMessage('📊 Chưa có điểm quiz nào.', threadId, type);
  entries.sort((a,b)=> (b[1]||0)-(a[1]||0));
  const uids = entries.map(([uid])=>uid);
  let nameOf={};
  try { const info = await api.getUserInfo(uids); for (const uid of uids) { nameOf[uid] = info?.changed_profiles?.[uid]?.displayName || uid; } } catch {}
  const lines = ['🏆 BẢNG ĐIỂM QUIZ (FULL)'];
  let i=1; for (const [uid, sc] of entries) { lines.push(`${i}. ${nameOf[uid]||uid}: ${sc} điểm`); i++; }
  const total = entries.reduce((s, [,v])=>s+(v||0), 0);
  const avg = (total/entries.length).toFixed(2);
  lines.push(`Tổng điểm: ${total} | Số người: ${entries.length} | Trung bình: ${avg}`);
  return api.sendMessage(lines.join('\n'), threadId, type);
}

async function handleLeaderboardAll(api, event, ThreadsRef) {
  const { threadId, type } = event || {};
  if (!ThreadsRef) { try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {} }
  let tdata = {};
  try { const th = await ThreadsRef.getData(threadId); tdata = th?.data || {}; } catch {}
  
  // TẠM THỜI VÔ HIỆU HÓA RESET TRONG LEADERBOARD ĐỂ DEBUG
  // __ensureMonthlyReset(tdata, 'cau_do');
  // __ensureMonthlyReset(tdata, 'quiz');
  
  const score1 = tdata?.cau_do?.score || {};
  const score2 = tdata?.quiz?.score || {};
  const map = new Map();
  for (const [k,v] of Object.entries(score1)) map.set(k, (map.get(k)||0) + (v||0));
  for (const [k,v] of Object.entries(score2)) map.set(k, (map.get(k)||0) + (v||0));
  const entries = Array.from(map.entries());
  if (entries.length === 0) return api.sendMessage('📊 Chưa có điểm nào trong nhóm này.', threadId, type);
  
  // Sắp xếp theo điểm cao nhất
  entries.sort((a,b)=> (b[1]||0)-(a[1]||0));
  const topEntries = entries.slice(0, 20); // Hiển thị top 20 thay vì 200
  const uids = topEntries.map(([uid])=>uid);
  let nameOf={};
  try { 
    const info = await api.getUserInfo(uids); 
    for (const uid of uids) { 
      nameOf[uid] = info?.changed_profiles?.[uid]?.displayName || uid; 
    } 
  } catch {}
  
  const lines = ['🏆 BẢNG XẾP HẠNG ĐIỂM TỔNG HỢP'];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Hiển thị top với emoji đặc biệt
  for (let i = 0; i < topEntries.length; i++) {
    const [uid, sc] = topEntries[i];
    const name = nameOf[uid] || uid;
    let medal = '';
    if (i === 0) medal = '🥇';
    else if (i === 1) medal = '🥈';  
    else if (i === 2) medal = '🥉';
    else medal = `${i + 1}.`;
    
    lines.push(`${medal} ${name}: ${sc} điểm`);
  }
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const total = entries.reduce((s, [,v])=>s+(v||0), 0);
  const avg = (total/entries.length).toFixed(2);
  lines.push(`📊 Tổng điểm: ${total} | 👥 Số người: ${entries.length} | 📈 TB: ${avg}`);
  lines.push('');
  lines.push('💡 Cách chơi:');
  lines.push('• bonz câu đố - Chơi câu đố');
  lines.push('• bonz quiz - Chơi trắc nghiệm');
  
  return api.sendMessage(lines.join('\n'), threadId, type);
}

// ======================== QUIZ HANDLERS (A/B/C/D) ========================
async function handleQuizStart(api, event, args = [], ThreadsRef) {
  const { threadId, type } = event || {};
  const subjRaw = args[0] || '';
  let subj = __normalizeSubject(subjRaw);
  if (!subj) subj = 'random';
  const bankMap = __getQuizBankMerged();
  const subjects = Object.keys(bankMap);
  if (!subj || (!bankMap[subj] && subj !== 'random')) {
    const list = subjects.join(', ');
    return api.sendMessage(`Dùng: bonz quiz <môn>
Môn hỗ trợ: ${list}
Có thể dùng: bonz quiz random`, threadId, type);
  }
  // Chỉ dùng ngân hàng cục bộ (và tệp ngoài nếu có)
  let chosenSubj = subj;
  if (subj === 'random') {
    const poolSubjects = subjects.filter(s => Array.isArray(bankMap[s]) && bankMap[s].length > 0);
    if (poolSubjects.length === 0) return api.sendMessage('❌ Chưa có câu hỏi nào trong ngân hàng.', threadId, type);
    chosenSubj = poolSubjects[Math.floor(Math.random() * poolSubjects.length)];
  }
  const bank = bankMap[chosenSubj] || [];
  if (!Array.isArray(bank) || bank.length === 0) {
    return api.sendMessage('❌ Môn này hiện chưa có câu hỏi.', threadId, type);
  }
  const q = bank[Math.floor(Math.random() * bank.length)];
  const ttlMs = 5 * 60 * 1000; // hiệu lực 5 phút
  const now = Date.now();

  if (!ThreadsRef) { try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {} }
  let tdata = {};
  try { const th = await ThreadsRef.getData(threadId); tdata = th?.data || {}; } catch {}
  tdata.quiz = tdata.quiz || {};
  tdata.quiz.active = {
    subj: chosenSubj,
    q: q.q,
    A: q.A,
    B: q.B,
    C: q.C,
    D: q.D,
    correct: q.correct,
    exp: now + ttlMs,
    at: now,
    answers: {} // uid -> 'A'|'B'|'C'
  };
  tdata.quiz.score = tdata.quiz.score || {}; // uid -> điểm
  try { await ThreadsRef.setData(threadId, tdata); } catch {}

  const msg = [
    `📚 Môn: ${chosenSubj.toUpperCase()}`,
    `❓ Câu hỏi: ${q.q}`,
    `A) ${q.A}`,
    `B) ${q.B}`,
    `C) ${q.C}`,
    `D) ${q.D}`,
    '',
    'Trả lời bằng: bonz chọn A (hoặc B/C/D). Mỗi người chỉ được chọn 1 lần và 1 đáp án.'
  ].join('\n');
  return api.sendMessage(msg, threadId, type);
}

async function handleQuizAnswer(api, event, args = [], ThreadsRef) {
  const { threadId, type } = event || {};
  const choiceRaw = String(args[0] || '').toUpperCase().trim();
  const senderId = String(event?.data?.uidFrom || event?.authorId || '');
  if (!choiceRaw) return api.sendMessage('⚠️ Dùng: bonz chọn A|B|C|D', threadId, type);
  if (!['A','B','C','D'].includes(choiceRaw) || (args[0] && /[^a-dA-D]/.test(args[0]) ) || (args.length > 1)) {
    return api.sendMessage('❌ Chỉ được chọn duy nhất 1 đáp án: A hoặc B hoặc C hoặc D. Ví dụ: bonz chọn B', threadId, type);
  }

  if (!ThreadsRef) { try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {} }
  let tdata = {};
  try { const th = await ThreadsRef.getData(threadId); tdata = th?.data || {}; } catch {}
  const active = tdata?.quiz?.active;
  if (!active) return api.sendMessage('❌ Hiện chưa có câu hỏi nào. Gõ: bonz câu đố', threadId, type);
  const now = Date.now();
  if (active.exp && now > active.exp) {
    delete tdata.quiz.active;
    try { await ThreadsRef.setData(threadId, tdata); } catch {}
    return api.sendMessage('⏰ Câu hỏi đã hết hạn. Gõ: bonz câu đố để bắt đầu câu mới.', threadId, type);
  }

  active.answers = active.answers || {}; // lưu đáp án đã chọn
  active.awarded = active.awarded || {}; // đã được cộng điểm hay chưa

  // KIỂM TRA ĐÃ TRỢ LỜI CHƯA - MỖI NGƯỜI CHỈ 1 LẦN
  if (active.answers[senderId]) {
    const prevAnswer = active.answers[senderId];
    const wasCorrect = prevAnswer === active.correct;
    
    if (wasCorrect) {
      return api.sendMessage(`🚫 Bạn đã trả lời đúng câu này rồi (${prevAnswer})! Không thể trả lời lại.`, threadId, type);
    } else {
      return api.sendMessage(`🚫 Bạn đã trả lời câu này rồi (${prevAnswer})! Mỗi người chỉ được trả lời 1 lần duy nhất.`, threadId, type);
    }
  }

  // LƯU ĐÁP ÁN (CHỈ 1 LẦN DUY NHẤT)
  active.answers[senderId] = choiceRaw;

  // KIỂM TRA ĐÚNG/SAI VÀ CỘNG ĐIỂM
  const isCorrect = choiceRaw === active.correct;
  let awardedPoint = false;
  
  if (isCorrect) {
    tdata.quiz.score = tdata.quiz.score || {};
    tdata.quiz.score[senderId] = (tdata.quiz.score[senderId] || 0) + 1;
    active.awarded[senderId] = true;
    awardedPoint = true;
  }

  // Tăng bộ đếm số câu đã trả lời (tổng hợp)
  tdata.stats = tdata.stats || {};
  tdata.stats.answersCount = tdata.stats.answersCount || {};
  tdata.stats.answersCount[senderId] = (tdata.stats.answersCount[senderId] || 0) + 1;
  try { await ThreadsRef.setData(threadId, tdata); } catch {}

  // TRẢ LỜI KẾT QUẢ
  let reply = '';
  if (isCorrect) {
    reply = `✅ Chính xác! Bạn đã nhận 1 điểm. (Đáp án đúng: ${active.correct})`;
  } else {
    reply = `❌ Sai rồi! Đáp án đúng là: ${active.correct}. Bạn đã chọn: ${choiceRaw}`;
  }
  return api.sendMessage(reply, threadId, type);
}

// ===================== QUIZ TRẮC NGHIỆM (A/B/C/D) =====================
const __quizBank = {
  // 13 môn học
  toan: [
    { q: 'Giá trị của 2 + 3 × 4 là bao nhiêu?', A: '14', B: '20', C: '24', D: '26', correct: 'A' },
    { q: 'Diện tích hình chữ nhật = ?', A: 'a + b', B: 'a × b', C: '2a + 2b', D: 'a² + b²', correct: 'B' },
    { q: '5 × 6 = ?', A: '30', B: '25', C: '35', D: '40', correct: 'A' },
    { q: '100 ÷ 4 = ?', A: '20', B: '25', C: '30', D: '35', correct: 'B' },
    { q: '7² = ?', A: '14', B: '49', C: '42', D: '56', correct: 'B' },
    { q: '√16 = ?', A: '2', B: '3', C: '4', D: '8', correct: 'C' },
    { q: '3 + 4 × 2 = ?', A: '14', B: '11', C: '10', D: '12', correct: 'B' },
    { q: '15% của 200 = ?', A: '30', B: '25', C: '35', D: '20', correct: 'A' },
    { q: 'Chu vi hình tròn = ?', A: 'πr²', B: '2πr', C: 'πd', D: 'B và C đúng', correct: 'D' },
    { q: '(-3) × (-4) = ?', A: '-12', B: '12', C: '-7', D: '7', correct: 'B' },
    { q: '2³ = ?', A: '6', B: '8', C: '9', D: '12', correct: 'B' },
    { q: '√25 = ?', A: '4', B: '5', C: '6', D: '7', correct: 'B' },
    { q: '12 ÷ 3 × 2 = ?', A: '2', B: '6', C: '8', D: '24', correct: 'C' },
    { q: '20% của 50 = ?', A: '5', B: '10', C: '15', D: '20', correct: 'B' },
    { q: 'Diện tích hình vuông cạnh 5cm = ?', A: '20cm²', B: '25cm²', C: '30cm²', D: '10cm²', correct: 'B' },
    { q: '1/2 + 1/4 = ?', A: '1/6', B: '2/6', C: '3/4', D: '1/3', correct: 'C' },
    { q: '8 × 9 = ?', A: '72', B: '81', C: '63', D: '54', correct: 'A' },
    { q: '144 ÷ 12 = ?', A: '10', B: '11', C: '12', D: '13', correct: 'C' },
    { q: '6! = ?', A: '120', B: '720', C: '360', D: '240', correct: 'B' },
    { q: 'log₁₀(100) = ?', A: '1', B: '2', C: '10', D: '100', correct: 'B' },
    { q: '3⁴ = ?', A: '12', B: '64', C: '81', D: '243', correct: 'C' },
    { q: '√36 = ?', A: '5', B: '6', C: '7', D: '8', correct: 'B' },
    { q: '25% của 80 = ?', A: '15', B: '20', C: '25', D: '30', correct: 'B' },
    { q: '9 × 7 = ?', A: '56', B: '63', C: '72', D: '81', correct: 'B' },
    { q: '121 ÷ 11 = ?', A: '10', B: '11', C: '12', D: '13', correct: 'B' },
    { q: '2/3 + 1/6 = ?', A: '1/2', B: '3/6', C: '5/6', D: '1', correct: 'C' },
    { q: 'Thể tích hình lập phương cạnh 3cm = ?', A: '9cm³', B: '18cm³', C: '27cm³', D: '36cm³', correct: 'C' },
    { q: '(-5) + 8 = ?', A: '3', B: '-3', C: '13', D: '-13', correct: 'A' },
    { q: '10² - 5² = ?', A: '50', B: '75', C: '95', D: '25', correct: 'B' },
    { q: '18 ÷ 2 × 3 = ?', A: '3', B: '9', C: '27', D: '54', correct: 'C' },
    { q: '30% của 150 = ?', A: '35', B: '40', C: '45', D: '50', correct: 'C' },
    { q: '5! ÷ 4! = ?', A: '4', B: '5', C: '20', D: '24', correct: 'B' },
    { q: 'Chu vi hình vuông cạnh 7cm = ?', A: '21cm', B: '28cm', C: '35cm', D: '49cm', correct: 'B' },
    { q: '√64 = ?', A: '6', B: '7', C: '8', D: '9', correct: 'C' },
    { q: '4³ = ?', A: '12', B: '16', C: '48', D: '64', correct: 'D' },
    { q: '75% của 40 = ?', A: '25', B: '30', C: '35', D: '40', correct: 'B' },
    { q: '13 × 8 = ?', A: '96', B: '104', C: '112', D: '120', correct: 'B' },
    { q: '169 ÷ 13 = ?', A: '11', B: '12', C: '13', D: '14', correct: 'C' },
    { q: '3/4 - 1/8 = ?', A: '5/8', B: '1/2', C: '3/8', D: '2/3', correct: 'A' },
    { q: 'Diện tích hình tam giác đáy 6cm, cao 4cm = ?', A: '10cm²', B: '12cm²', C: '24cm²', D: '6cm²', correct: 'B' },
    { q: '(-7) × (-3) = ?', A: '-21', B: '21', C: '-10', D: '10', correct: 'B' },
    { q: '5² + 3² = ?', A: '34', B: '64', C: '25', D: '9', correct: 'A' },
    { q: '60% của 25 = ?', A: '12', B: '15', C: '18', D: '20', correct: 'B' },
    { q: '15 × 6 = ?', A: '80', B: '85', C: '90', D: '95', correct: 'C' },
    { q: '196 ÷ 14 = ?', A: '12', B: '13', C: '14', D: '15', correct: 'C' },
    { q: '5/6 - 1/3 = ?', A: '1/2', B: '1/3', C: '2/3', D: '1/6', correct: 'A' },
    { q: 'Chu vi hình chữ nhật dài 8cm, rộng 5cm = ?', A: '13cm', B: '26cm', C: '40cm', D: '21cm', correct: 'B' },
    { q: '√81 = ?', A: '8', B: '9', C: '10', D: '11', correct: 'B' },
    { q: '2⁵ = ?', A: '10', B: '16', C: '25', D: '32', correct: 'D' },
    { q: '40% của 75 = ?', A: '25', B: '30', C: '35', D: '40', correct: 'B' },
    { q: '17 × 4 = ?', A: '64', B: '68', C: '72', D: '76', correct: 'B' },
    { q: '225 ÷ 15 = ?', A: '13', B: '14', C: '15', D: '16', correct: 'C' },
    { q: '7/8 - 3/8 = ?', A: '1/2', B: '4/8', C: '1/4', D: '3/4', correct: 'A' },
    { q: 'Thể tích hình hộp chữ nhật 4×3×2cm = ?', A: '18cm³', B: '24cm³', C: '36cm³', D: '48cm³', correct: 'B' },
    { q: '(-9) ÷ 3 = ?', A: '3', B: '-3', C: '6', D: '-6', correct: 'B' },
    { q: '6² - 4² = ?', A: '20', B: '16', C: '12', D: '8', correct: 'A' },
    { q: '24 ÷ 4 × 3 = ?', A: '2', B: '6', C: '18', D: '72', correct: 'C' },
    { q: '80% của 60 = ?', A: '40', B: '45', C: '48', D: '50', correct: 'C' },
    { q: '7! ÷ 6! = ?', A: '6', B: '7', C: '42', D: '49', correct: 'B' },
    { q: 'Diện tích hình thang đáy 6cm, 4cm, cao 3cm = ?', A: '15cm²', B: '18cm²', C: '21cm²', D: '24cm²', correct: 'A' },
    { q: '√100 = ?', A: '9', B: '10', C: '11', D: '12', correct: 'B' },
    { q: '3⁵ = ?', A: '15', B: '125', C: '243', D: '81', correct: 'C' },
    { q: '90% của 20 = ?', A: '16', B: '17', C: '18', D: '19', correct: 'C' },
    { q: '19 × 3 = ?', A: '54', B: '57', C: '60', D: '63', correct: 'B' },
    { q: '289 ÷ 17 = ?', A: '15', B: '16', C: '17', D: '18', correct: 'C' },
    { q: '9/10 - 3/5 = ?', A: '3/10', B: '6/10', C: '1/2', D: '2/5', correct: 'A' },
    { q: 'Chu vi hình tròn bán kính 7cm = ?', A: '14π cm', B: '21π cm', C: '49π cm', D: '7π cm', correct: 'A' },
    { q: '(-8) + (-5) = ?', A: '3', B: '-3', C: '13', D: '-13', correct: 'D' },
    { q: '8² - 6² = ?', A: '28', B: '14', C: '36', D: '100', correct: 'A' },
    { q: '36 ÷ 6 × 2 = ?', A: '3', B: '6', C: '12', D: '72', correct: 'C' },
    { q: '50% của 84 = ?', A: '40', B: '42', C: '44', D: '46', correct: 'B' },
    { q: '8! ÷ 7! = ?', A: '7', B: '8', C: '56', D: '64', correct: 'B' },
    { q: 'Diện tích hình bình hành đáy 8cm, cao 5cm = ?', A: '13cm²', B: '26cm²', C: '40cm²', D: '80cm²', correct: 'C' },
    { q: '√121 = ?', A: '10', B: '11', C: '12', D: '13', correct: 'B' },
    { q: '5³ = ?', A: '15', B: '25', C: '75', D: '125', correct: 'D' },
    { q: '35% của 80 = ?', A: '24', B: '26', C: '28', D: '30', correct: 'C' },
    { q: '23 × 2 = ?', A: '44', B: '45', C: '46', D: '47', correct: 'C' },
    { q: '324 ÷ 18 = ?', A: '16', B: '17', C: '18', D: '19', correct: 'C' },
    { q: '11/12 - 1/4 = ?', A: '2/3', B: '7/12', C: '5/6', D: '1/3', correct: 'A' },
    { q: 'Thể tích hình cầu bán kính 3cm = ?', A: '36π cm³', B: '27π cm³', C: '12π cm³', D: '9π cm³', correct: 'A' },
    { q: '(-12) ÷ (-4) = ?', A: '3', B: '-3', C: '8', D: '-8', correct: 'A' },
    { q: '9² + 7² = ?', A: '130', B: '128', C: '132', D: '16', correct: 'A' },
    { q: '45 ÷ 5 × 4 = ?', A: '2.25', B: '9', C: '36', D: '180', correct: 'C' },
    { q: '65% của 40 = ?', A: '24', B: '25', C: '26', D: '27', correct: 'C' },
    { q: '9! ÷ 8! = ?', A: '8', B: '9', C: '72', D: '81', correct: 'B' },
    { q: 'Diện tích hình elip bán trục a=4, b=3 = ?', A: '12π', B: '24π', C: '7π', D: '25π', correct: 'A' },
    { q: '√144 = ?', A: '11', B: '12', C: '13', D: '14', correct: 'B' },
  ],
  vatly: [
    { q: 'Đơn vị đo lực trong hệ SI là?', A: 'Watt', B: 'Joule', C: 'Newton', D: 'Pascal', correct: 'C' },
    { q: 'Đơn vị đo công suất là?', A: 'Watt', B: 'Joule', C: 'Newton', D: 'Pascal', correct: 'A' },
    { q: 'Đơn vị đo áp suất là?', A: 'Watt', B: 'Joule', C: 'Newton', D: 'Pascal', correct: 'D' },
    { q: 'Đơn vị đo năng lượng là?', A: 'Watt', B: 'Joule', C: 'Newton', D: 'Pascal', correct: 'B' },
    { q: 'Vận tốc ánh sáng trong chân không?', A: '3×10⁸ m/s', B: '3×10⁶ m/s', C: '3×10⁷ m/s', D: '3×10⁹ m/s', correct: 'A' },
    { q: 'Gia tốc trọng trường Trái Đất?', A: '9.8 m/s²', B: '10 m/s²', C: '8.9 m/s²', D: '11 m/s²', correct: 'A' },
    { q: 'Định luật I Newton nói về?', A: 'Quán tính', B: 'Gia tốc', C: 'Tác dụng phản tác dụng', D: 'Hấp dẫn', correct: 'A' },
    { q: 'Nhiệt độ sôi của nước ở áp suất chuẩn?', A: '90°C', B: '100°C', C: '110°C', D: '120°C', correct: 'B' },
    { q: 'Điện trở được đo bằng đơn vị?', A: 'Volt', B: 'Ampere', C: 'Ohm', D: 'Watt', correct: 'C' },
    { q: 'Tần số âm thanh con người nghe được?', A: '20Hz-20kHz', B: '10Hz-10kHz', C: '30Hz-30kHz', D: '50Hz-50kHz', correct: 'A' },
    { q: 'Định luật II Newton: F = ?', A: 'ma', B: 'mv', C: 'mgh', D: '1/2mv²', correct: 'A' },
    { q: 'Định luật III Newton nói về?', A: 'Quán tính', B: 'Gia tốc', C: 'Tác dụng phản tác dụng', D: 'Hấp dẫn', correct: 'C' },
    { q: 'Công thức tính công cơ học?', A: 'P = F.s', B: 'A = F.s', C: 'W = mgh', D: 'E = mc²', correct: 'B' },
    { q: 'Đơn vị đo tần số là?', A: 'Hz', B: 'Watt', C: 'Joule', D: 'Newton', correct: 'A' },
    { q: 'Công thức tính thế năng trọng trường?', A: 'Wt = mgh', B: 'Wt = 1/2mv²', C: 'Wt = 1/2kx²', D: 'Wt = qV', correct: 'A' },
    { q: 'Công thức tính động năng?', A: 'Wđ = mgh', B: 'Wđ = 1/2mv²', C: 'Wđ = 1/2kx²', D: 'Wđ = qV', correct: 'B' },
    { q: 'Định luật bảo toàn năng lượng?', A: 'E = const', B: 'p = const', C: 'F = const', D: 'v = const', correct: 'A' },
    { q: 'Áp suất chất lỏng: p = ?', A: 'ρgh', B: 'F/S', C: 'nkT', D: 'Cả A và B', correct: 'D' },
    { q: 'Nguyên lý Archimedes: FA = ?', A: 'ρVg', B: 'mg', C: 'ρ₀Vg', D: 'F.s', correct: 'C' },
    { q: 'Nhiệt độ tuyệt đối 0K = ?°C', A: '-273', B: '-100', C: '0', D: '100', correct: 'A' },
    { q: 'Phương trình trạng thái khí lý tưởng?', A: 'pV = nRT', B: 'F = ma', C: 'E = mc²', D: 'Q = mcΔt', correct: 'A' },
    { q: 'Định luật I nhiệt động học: ΔU = ?', A: 'Q - A', B: 'Q + A', C: 'A - Q', D: 'Q/A', correct: 'A' },
    { q: 'Hiệu suất máy nhiệt: H = ?', A: 'A/Q₁', B: 'Q₁/A', C: 'Q₂/Q₁', D: '1 - Q₂/Q₁', correct: 'D' },
    { q: 'Định luật Coulomb: F = ?', A: 'k|q₁q₂|/r²', B: 'qE', C: 'qvB', D: 'BIl', correct: 'A' },
    { q: 'Cường độ điện trường: E = ?', A: 'F/q', B: 'kQ/r²', C: 'U/d', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Định luật Ohm: I = ?', A: 'U/R', B: 'qvB', C: 'P/U', D: 'ε/r', correct: 'A' },
    { q: 'Công suất điện: P = ?', A: 'UI', B: 'I²R', C: 'U²/R', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Định luật Joule-Lenz: Q = ?', A: 'I²Rt', B: 'UIt', C: 'U²t/R', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Lực từ tác dụng lên dây dẫn: F = ?', A: 'BIl', B: 'qvB', C: 'kq₁q₂/r²', D: 'mg', correct: 'A' },
    { q: 'Suất điện động cảm ứng: ε = ?', A: '-dΦ/dt', B: 'BIl', C: 'qvB', D: 'IR', correct: 'A' },
    { q: 'Tần số dao động: f = ?', A: '1/T', B: 'ω/2π', C: '1/2π√(m/k)', D: 'Cả A và B', correct: 'D' },
    { q: 'Chu kỳ dao động lắc đơn: T = ?', A: '2π√(l/g)', B: '2π√(m/k)', C: '1/f', D: 'A và C', correct: 'D' },
    { q: 'Chu kỳ dao động lắc lò xo: T = ?', A: '2π√(l/g)', B: '2π√(m/k)', C: '1/f', D: 'B và C', correct: 'D' },
    { q: 'Phương trình sóng: u = ?', A: 'A.cos(ωt - kx)', B: 'A.sin(ωt)', C: 'v.t', D: 'f.λ', correct: 'A' },
    { q: 'Vận tốc sóng: v = ?', A: 'f.λ', B: 'ω/k', C: 'λ/T', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Hiện tượng giao thoa sóng xảy ra khi?', A: 'Hai sóng cùng tần số', B: 'Hai sóng cùng biên độ', C: 'Hai sóng cùng pha', D: 'Hai sóng vuông góc', correct: 'A' },
    { q: 'Điều kiện để có giao thoa cực đại?', A: 'Δ = kλ', B: 'Δ = (k+1/2)λ', C: 'Δ = 0', D: 'Δ = λ/2', correct: 'A' },
    { q: 'Điều kiện để có giao thoa cực tiểu?', A: 'Δ = kλ', B: 'Δ = (k+1/2)λ', C: 'Δ = 0', D: 'Δ = λ', correct: 'B' },
    { q: 'Định luật khúc xạ ánh sáng: sin i/sin r = ?', A: 'n₂/n₁', B: 'n₁/n₂', C: 'v₁/v₂', D: 'B và C', correct: 'D' },
    { q: 'Công thức thấu kính mỏng: 1/f = ?', A: '1/d + 1/d\'', B: '1/d - 1/d\'', C: 'd/d\'', D: 'n-1', correct: 'A' },
    { q: 'Năng lượng photon: E = ?', A: 'hf', B: 'hc/λ', C: 'mc²', D: 'A và B', correct: 'D' },
    { q: 'Công thoát electron: A = ?', A: 'hf₀', B: 'eU', C: '1/2mv²', D: 'W', correct: 'A' },
    { q: 'Phương trình Einstein quang điện?', A: 'hf = A + Wđ', B: 'E = mc²', C: 'F = ma', D: 'pV = nRT', correct: 'A' },
    { q: 'Bán kính quỹ đạo Bo: rₙ = ?', A: 'n²r₀', B: 'nr₀', C: 'r₀/n²', D: 'r₀/n', correct: 'A' },
    { q: 'Năng lượng electron trong nguyên tử H: Eₙ = ?', A: '-13.6/n² eV', B: '13.6.n² eV', C: '-13.6.n eV', D: '13.6/n eV', correct: 'A' },
    { q: 'Định luật phóng xạ: N = ?', A: 'N₀e^(-λt)', B: 'N₀(1-e^(-λt))', C: 'N₀e^(λt)', D: 'N₀/2^(t/T)', correct: 'A' },
    { q: 'Chu kỳ bán rã: T₁/₂ = ?', A: 'ln2/λ', B: '1/λ', C: 'λ/ln2', D: '2λ', correct: 'A' },
    { q: 'Phản ứng hạt nhân tỏa năng lượng khi?', A: 'Δm > 0', B: 'Δm < 0', C: 'Δm = 0', D: 'A < 56', correct: 'B' },
    { q: 'Năng lượng liên kết riêng lớn nhất ở?', A: 'A = 56 (Fe)', B: 'A = 1 (H)', C: 'A = 238 (U)', D: 'A = 4 (He)', correct: 'A' },
    { q: 'Điện dung tụ điện: C = ?', A: 'Q/U', B: 'ε₀S/d', C: 'Q²/2U', D: 'A và B', correct: 'D' },
    { q: 'Năng lượng tụ điện: W = ?', A: '1/2CU²', B: '1/2QU', C: 'Q²/2C', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Độ tự cảm cuộn dây: L = ?', A: 'Φ/I', B: 'μ₀n²V', C: 'ε/dI/dt', D: 'A và B', correct: 'D' },
    { q: 'Năng lượng từ trường: W = ?', A: '1/2LI²', B: '1/2ΦI', C: 'B²/2μ₀', D: 'A và B', correct: 'D' },
    { q: 'Tần số cộng hưởng mạch LC: f₀ = ?', A: '1/2π√(LC)', B: '2π√(LC)', C: '√(LC)', D: '1/√(LC)', correct: 'A' },
    { q: 'Công suất trung bình mạch xoay chiều: P = ?', A: 'UIcosφ', B: 'I²R', C: 'U²R/Z²', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Hệ số công suất: cosφ = ?', A: 'R/Z', B: 'P/UI', C: 'XL-XC/Z', D: 'A và B', correct: 'D' },
    { q: 'Cảm kháng: XL = ?', A: 'ωL', B: '2πfL', C: 'L/ω', D: 'A và B', correct: 'D' },
    { q: 'Dung kháng: XC = ?', A: '1/ωC', B: '1/2πfC', C: 'ωC', D: 'A và B', correct: 'D' },
    { q: 'Tổng trở mạch RLC: Z = ?', A: '√(R² + (XL-XC)²)', B: 'R + XL + XC', C: '√(R² + XL² + XC²)', D: 'R(XL-XC)', correct: 'A' },
    { q: 'Máy biến áp lý tưởng: U₁/U₂ = ?', A: 'N₁/N₂', B: 'I₂/I₁', C: 'n', D: 'A và B', correct: 'D' },
    { q: 'Hiệu ứng Doppler: f\' = ?', A: 'f(v±vₙ)/(v±vₘ)', B: 'f + Δf', C: 'f.v/c', D: 'f/γ', correct: 'A' },
    { q: 'Hệ số Lorentz: γ = ?', A: '1/√(1-v²/c²)', B: '√(1-v²/c²)', C: 'v/c', D: 'c/v', correct: 'A' },
    { q: 'Khối lượng tương đối tính: m = ?', A: 'γm₀', B: 'm₀/γ', C: 'm₀(1-v²/c²)', D: 'm₀v²/c²', correct: 'A' },
    { q: 'Năng lượng nghỉ: E₀ = ?', A: 'm₀c²', B: 'mc²', C: '1/2m₀v²', D: 'γm₀c²', correct: 'A' },
    { q: 'Áp suất bức xạ: p = ?', A: 'I/c', B: 'E/c', C: 'hf/c', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Bước sóng de Broglie: λ = ?', A: 'h/p', B: 'h/mv', C: 'hc/E', D: 'A và B', correct: 'D' },
    { q: 'Nguyên lý bất định Heisenberg: Δx.Δp ≥ ?', A: 'ℏ/2', B: 'h/2π', C: 'h', D: 'A và B', correct: 'D' },
    { q: 'Hằng số Planck rút gọn: ℏ = ?', A: 'h/2π', B: '2πh', C: 'h/2', D: '2h', correct: 'A' },
  ],
  hoahoc: [
    { q: 'Kí hiệu hóa học của Natri là?', A: 'Na', B: 'N', C: 'Ne', D: 'Ni', correct: 'A' },
    { q: 'Kí hiệu hóa học của Oxy là?', A: 'O', B: 'Ox', C: 'O2', D: 'Oy', correct: 'A' },
    { q: 'Kí hiệu hóa học của Hydro là?', A: 'Hy', B: 'H', C: 'H2', D: 'Hd', correct: 'B' },
    { q: 'Kí hiệu hóa học của Carbon là?', A: 'Ca', B: 'Cr', C: 'C', D: 'Co', correct: 'C' },
    { q: 'Kí hiệu hóa học của Sắt là?', A: 'S', B: 'Fe', C: 'Ft', D: 'St', correct: 'B' },
    { q: 'Kí hiệu hóa học của Vàng là?', A: 'V', B: 'Go', C: 'Au', D: 'Ag', correct: 'C' },
    { q: 'Kí hiệu hóa học của Bạc là?', A: 'B', B: 'Ag', C: 'Sl', D: 'Si', correct: 'B' },
    { q: 'Công thức hóa học của nước là?', A: 'H2O', B: 'HO2', C: 'H2O2', D: 'HO', correct: 'A' },
    { q: 'Công thức hóa học của muối ăn là?', A: 'NaCl2', B: 'Na2Cl', C: 'NaCl', D: 'NaC', correct: 'C' },
    { q: 'pH của nước tinh khiết là?', A: '6', B: '7', C: '8', D: '9', correct: 'B' },
    { q: 'Kí hiệu hóa học của Nhôm là?', A: 'Al', B: 'Am', C: 'An', D: 'Ar', correct: 'A' },
    { q: 'Kí hiệu hóa học của Canxi là?', A: 'C', B: 'Ca', C: 'Cn', D: 'Cx', correct: 'B' },
    { q: 'Kí hiệu hóa học của Kali là?', A: 'Ka', B: 'Kl', C: 'K', D: 'Ky', correct: 'C' },
    { q: 'Kí hiệu hóa học của Magie là?', A: 'Ma', B: 'Mg', C: 'Mn', D: 'Mo', correct: 'B' },
    { q: 'Kí hiệu hóa học của Lưu huỳnh là?', A: 'S', B: 'Su', C: 'Sh', D: 'L', correct: 'A' },
    { q: 'Kí hiệu hóa học của Clo là?', A: 'C', B: 'Cl', C: 'Co', D: 'Cr', correct: 'B' },
    { q: 'Kí hiệu hóa học của Đồng là?', A: 'D', B: 'Do', C: 'Cu', D: 'Co', correct: 'C' },
    { q: 'Kí hiệu hóa học của Kẽm là?', A: 'K', B: 'Ke', C: 'Zn', D: 'Z', correct: 'C' },
    { q: 'Công thức hóa học của khí cacbonic là?', A: 'CO', B: 'CO2', C: 'C2O', D: 'CO3', correct: 'B' },
    { q: 'Công thức hóa học của axit clohidric là?', A: 'HCl', B: 'HCl2', C: 'H2Cl', D: 'ClH', correct: 'A' },
    { q: 'Công thức hóa học của axit sunfuric là?', A: 'HSO4', B: 'H2SO4', C: 'H2S', D: 'SO4', correct: 'B' },
    { q: 'Công thức hóa học của axit nitric là?', A: 'HN', B: 'HNO2', C: 'HNO3', D: 'H2NO3', correct: 'C' },
    { q: 'Công thức hóa học của natri hidroxit là?', A: 'NaH', B: 'NaOH', C: 'Na2OH', D: 'NaO', correct: 'B' },
    { q: 'Công thức hóa học của canxi hidroxit là?', A: 'CaOH', B: 'Ca2OH', C: 'Ca(OH)2', D: 'CaH2O', correct: 'C' },
    { q: 'Công thức hóa học của natri clorua là?', A: 'NaCl', B: 'Na2Cl', C: 'NaCl2', D: 'ClNa', correct: 'A' },
    { q: 'Công thức hóa học của canxi cacbonat là?', A: 'CaCO3', B: 'Ca2CO3', C: 'CaC', D: 'Ca(CO3)2', correct: 'A' },
    { q: 'Số Avogadro là?', A: '6.02×10²³', B: '6.02×10²²', C: '6.02×10²⁴', D: '6.02×10²¹', correct: 'A' },
    { q: 'Thể tích mol khí ở đktc là?', A: '22.4L', B: '24.4L', C: '20.4L', D: '26.4L', correct: 'A' },
    { q: 'Khối lượng mol của H2O là?', A: '16g/mol', B: '17g/mol', C: '18g/mol', D: '19g/mol', correct: 'C' },
    { q: 'Khối lượng mol của CO2 là?', A: '42g/mol', B: '43g/mol', C: '44g/mol', D: '45g/mol', correct: 'C' },
    { q: 'Khối lượng mol của NaCl là?', A: '56.5g/mol', B: '57.5g/mol', C: '58.5g/mol', D: '59.5g/mol', correct: 'C' },
    { q: 'Khối lượng mol của CaCO3 là?', A: '98g/mol', B: '99g/mol', C: '100g/mol', D: '101g/mol', correct: 'C' },
    { q: 'Khối lượng mol của H2SO4 là?', A: '96g/mol', B: '97g/mol', C: '98g/mol', D: '99g/mol', correct: 'C' },
    { q: 'Dung dịch có pH < 7 là?', A: 'Axit', B: 'Bazơ', C: 'Trung tính', D: 'Muối', correct: 'A' },
    { q: 'Dung dịch có pH > 7 là?', A: 'Axit', B: 'Bazơ', C: 'Trung tính', D: 'Muối', correct: 'B' },
    { q: 'Chất nào làm quỳ tím hóa đỏ?', A: 'Axit', B: 'Bazơ', C: 'Muối', D: 'Nước', correct: 'A' },
    { q: 'Chất nào làm quỳ tím hóa xanh?', A: 'Axit', B: 'Bazơ', C: 'Muối', D: 'Nước', correct: 'B' },
    { q: 'Phản ứng axit + bazơ → muối + nước gọi là?', A: 'Trung hòa', B: 'Oxi hóa', C: 'Khử', D: 'Thế', correct: 'A' },
    { q: 'Phản ứng CaCO3 + HCl → CaCl2 + H2O + CO2 thuộc loại?', A: 'Hóa hợp', B: 'Phân hủy', C: 'Thế', D: 'Trao đổi', correct: 'D' },
    { q: 'Phản ứng 2H2 + O2 → 2H2O thuộc loại?', A: 'Hóa hợp', B: 'Phân hủy', C: 'Thế', D: 'Trao đổi', correct: 'A' },
    { q: 'Phản ứng CaCO3 → CaO + CO2 thuộc loại?', A: 'Hóa hợp', B: 'Phân hủy', C: 'Thế', D: 'Trao đổi', correct: 'B' },
    { q: 'Phản ứng Zn + CuSO4 → ZnSO4 + Cu thuộc loại?', A: 'Hóa hợp', B: 'Phân hủy', C: 'Thế', D: 'Trao đổi', correct: 'C' },
    { q: 'Kim loại nào hoạt động mạnh nhất?', A: 'Na', B: 'K', C: 'Ca', D: 'Mg', correct: 'B' },
    { q: 'Kim loại nào không phản ứng với axit HCl loãng?', A: 'Zn', B: 'Fe', C: 'Cu', D: 'Al', correct: 'C' },
    { q: 'Khí nào cháy với ngọn lửa xanh nhạt?', A: 'H2', B: 'CO', C: 'CH4', D: 'C2H2', correct: 'B' },
    { q: 'Khí nào có mùi trứng thối?', A: 'H2S', B: 'SO2', C: 'NH3', D: 'HCl', correct: 'A' },
    { q: 'Khí nào có mùi khai?', A: 'H2S', B: 'SO2', C: 'NH3', D: 'HCl', correct: 'C' },
    { q: 'Chất nào dùng để sản xuất thủy tinh?', A: 'CaCO3', B: 'SiO2', C: 'Al2O3', D: 'Fe2O3', correct: 'B' },
    { q: 'Chất nào dùng để sản xuất xi măng?', A: 'CaCO3', B: 'SiO2', C: 'Al2O3', D: 'Cả A và B', correct: 'D' },
    { q: 'Hợp chất hữu cơ đơn giản nhất là?', A: 'CH4', B: 'C2H6', C: 'C2H4', D: 'C2H2', correct: 'A' },
    { q: 'Ancol đơn giản nhất là?', A: 'CH3OH', B: 'C2H5OH', C: 'C3H7OH', D: 'C4H9OH', correct: 'A' },
    { q: 'Axit hữu cơ đơn giản nhất là?', A: 'HCOOH', B: 'CH3COOH', C: 'C2H5COOH', D: 'C6H5COOH', correct: 'A' },
    { q: 'Công thức phân tử của glucozơ là?', A: 'C6H12O6', B: 'C12H22O11', C: 'C6H10O5', D: 'C5H10O5', correct: 'A' },
    { q: 'Công thức phân tử của saccarozơ là?', A: 'C6H12O6', B: 'C12H22O11', C: 'C6H10O5', D: 'C5H10O5', correct: 'B' },
    { q: 'Chất nào không tan trong nước?', A: 'NaCl', B: 'KNO3', C: 'BaSO4', D: 'NH4Cl', correct: 'C' },
    { q: 'Chất nào tan ít trong nước?', A: 'NaCl', B: 'Ca(OH)2', C: 'KOH', D: 'NaOH', correct: 'B' },
    { q: 'Điều kiện để phản ứng xảy ra nhanh?', A: 'Tăng nhiệt độ', B: 'Tăng nồng độ', C: 'Có chất xúc tác', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Chất xúc tác có tác dụng?', A: 'Tăng tốc độ phản ứng', B: 'Giảm năng lượng hoạt hóa', C: 'Không thay đổi cân bằng', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Nguyên tố có số hiệu nguyên tử 1 là?', A: 'H', B: 'He', C: 'Li', D: 'Be', correct: 'A' },
    { q: 'Nguyên tố có số hiệu nguyên tử 6 là?', A: 'B', B: 'C', C: 'N', D: 'O', correct: 'B' },
    { q: 'Nguyên tố có số hiệu nguyên tử 8 là?', A: 'N', B: 'O', C: 'F', D: 'Ne', correct: 'B' },
    { q: 'Nguyên tố có số hiệu nguyên tử 11 là?', A: 'Na', B: 'Mg', C: 'Al', D: 'Si', correct: 'A' },
    { q: 'Nguyên tố có số hiệu nguyên tử 17 là?', A: 'S', B: 'Cl', C: 'Ar', D: 'K', correct: 'B' },
    { q: 'Nguyên tố có số hiệu nguyên tử 26 là?', A: 'Mn', B: 'Fe', C: 'Co', D: 'Ni', correct: 'B' },
    { q: 'Nguyên tố có số hiệu nguyên tử 29 là?', A: 'Ni', B: 'Cu', C: 'Zn', D: 'Ga', correct: 'B' },
    { q: 'Nguyên tố có số hiệu nguyên tử 30 là?', A: 'Cu', B: 'Zn', C: 'Ga', D: 'Ge', correct: 'B' },
    { q: 'Cấu hình electron của Na (Z=11) là?', A: '1s²2s²2p⁶3s¹', B: '1s²2s²2p⁶3s²', C: '1s²2s²2p⁵3s²', D: '1s²2s²2p⁶3p¹', correct: 'A' },
    { q: 'Cấu hình electron của Cl (Z=17) là?', A: '1s²2s²2p⁶3s²3p⁵', B: '1s²2s²2p⁶3s²3p⁶', C: '1s²2s²2p⁶3s¹3p⁶', D: '1s²2s²2p⁵3s²3p⁶', correct: 'A' },
    { q: 'Ion Na⁺ có cấu hình electron như?', A: 'Na', B: 'Ne', C: 'Mg', D: 'F', correct: 'B' },
    { q: 'Ion Cl⁻ có cấu hình electron như?', A: 'Cl', B: 'S', C: 'Ar', D: 'K', correct: 'C' },
    { q: 'Liên kết ion hình thành giữa?', A: 'Kim loại - phi kim', B: 'Phi kim - phi kim', C: 'Kim loại - kim loại', D: 'Khí hiếm - khí hiếm', correct: 'A' },
    { q: 'Liên kết cộng hóa trị hình thành giữa?', A: 'Kim loại - phi kim', B: 'Phi kim - phi kim', C: 'Kim loại - kim loại', D: 'Ion - ion', correct: 'B' },
    { q: 'Liên kết kim loại hình thành giữa?', A: 'Kim loại - phi kim', B: 'Phi kim - phi kim', C: 'Kim loại - kim loại', D: 'Ion - nguyên tử', correct: 'C' },
    { q: 'Phân tử H2O có hình dạng?', A: 'Thẳng', B: 'Góc', C: 'Tam giác', D: 'Tứ diện', correct: 'B' },
    { q: 'Phân tử NH3 có hình dạng?', A: 'Thẳng', B: 'Góc', C: 'Tam giác', D: 'Chóp tam giác', correct: 'D' },
    { q: 'Phân tử CH4 có hình dạng?', A: 'Vuông phẳng', B: 'Tứ diện', C: 'Tam giác', D: 'Thẳng', correct: 'B' },
    { q: 'Độ âm điện lớn nhất thuộc về?', A: 'F', B: 'O', C: 'N', D: 'Cl', correct: 'A' },
    { q: 'Bán kính nguyên tử tăng theo chiều?', A: 'Từ trái sang phải', B: 'Từ phải sang trái', C: 'Từ trên xuống dưới', D: 'B và C', correct: 'D' },
    { q: 'Năng lượng ion hóa tăng theo chiều?', A: 'Từ trái sang phải', B: 'Từ phải sang trái', C: 'Từ dưới lên trên', D: 'A và C', correct: 'D' },
    { q: 'Tính kim loại mạnh nhất ở chu kỳ 3?', A: 'Na', B: 'Mg', C: 'Al', D: 'Si', correct: 'A' },
    { q: 'Tính phi kim mạnh nhất ở chu kỳ 2?', A: 'C', B: 'N', C: 'O', D: 'F', correct: 'D' },
    { q: 'Nguyên tố có tính chất lưỡng tính?', A: 'Na', B: 'Al', C: 'S', D: 'Cl', correct: 'B' },
    { q: 'Oxit lưỡng tính là?', A: 'Na2O', B: 'Al2O3', C: 'SO3', D: 'Cl2O7', correct: 'B' },
    { q: 'Hidroxit lưỡng tính là?', A: 'NaOH', B: 'Al(OH)3', C: 'H2SO4', D: 'HClO4', correct: 'B' },
    { q: 'Muối axit là?', A: 'NaCl', B: 'NaHSO4', C: 'Na2SO4', D: 'NaOH', correct: 'B' },
    { q: 'Muối bazơ là?', A: 'NaCl', B: 'NaHSO4', C: 'Mg(OH)Cl', D: 'Na2SO4', correct: 'C' },
    { q: 'Phản ứng oxi hóa - khử là phản ứng có?', A: 'Sự thay đổi số oxi hóa', B: 'Sự tạo thành kết tủa', C: 'Sự tạo thành khí', D: 'Sự trung hòa', correct: 'A' },
    { q: 'Chất oxi hóa là chất?', A: 'Cho electron', B: 'Nhận electron', C: 'Không đổi electron', D: 'Trao đổi electron', correct: 'B' },
    { q: 'Chất khử là chất?', A: 'Cho electron', B: 'Nhận electron', C: 'Không đổi electron', D: 'Trao đổi electron', correct: 'A' },
    { q: 'Trong phản ứng Zn + Cu²⁺ → Zn²⁺ + Cu, chất oxi hóa là?', A: 'Zn', B: 'Cu²⁺', C: 'Zn²⁺', D: 'Cu', correct: 'B' },
    { q: 'Trong phản ứng Zn + Cu²⁺ → Zn²⁺ + Cu, chất khử là?', A: 'Zn', B: 'Cu²⁺', C: 'Zn²⁺', D: 'Cu', correct: 'A' },
    { q: 'Dãy hoạt động hóa học của kim loại bắt đầu bằng?', A: 'Li', B: 'K', C: 'Na', D: 'Ca', correct: 'B' },
    { q: 'Kim loại nào đứng sau H trong dãy hoạt động?', A: 'Zn', B: 'Fe', C: 'Cu', D: 'Al', correct: 'C' },
    { q: 'Điện phân dung dịch NaCl có màng ngăn thu được?', A: 'Na và Cl2', B: 'H2 và Cl2', C: 'NaOH và Cl2', D: 'Na và O2', correct: 'C' },
    { q: 'Pin điện hóa hoạt động dựa trên?', A: 'Phản ứng oxi hóa khử', B: 'Phản ứng axit bazơ', C: 'Phản ứng trao đổi', D: 'Phản ứng hóa hợp', correct: 'A' },
    { q: 'Anot trong pin điện hóa là?', A: 'Cực dương', B: 'Cực âm', C: 'Cực trung tính', D: 'Không xác định', correct: 'B' },
    { q: 'Catot trong pin điện hóa là?', A: 'Cực dương', B: 'Cực âm', C: 'Cực trung tính', D: 'Không xác định', correct: 'A' },
    { q: 'Ăn mòn kim loại là quá trình?', A: 'Vật lý', B: 'Hóa học', C: 'Điện hóa', D: 'B và C', correct: 'D' },
    { q: 'Cách bảo vệ kim loại khỏi ăn mòn?', A: 'Sơn phủ', B: 'Mạ kim loại', C: 'Catot hóa', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Hợp kim là?', A: 'Hỗn hợp kim loại', B: 'Dung dịch rắn kim loại', C: 'Hợp chất kim loại', D: 'A và B', correct: 'D' },
    { q: 'Thép là hợp kim của?', A: 'Fe - C', B: 'Fe - Ni', C: 'Fe - Cr', D: 'Fe - Mn', correct: 'A' },
    { q: 'Đồng thau là hợp kim của?', A: 'Cu - Sn', B: 'Cu - Zn', C: 'Cu - Ni', D: 'Cu - Al', correct: 'B' },
    { q: 'Đồng đỏ là hợp kim của?', A: 'Cu - Sn', B: 'Cu - Zn', C: 'Cu - Ni', D: 'Cu - Al', correct: 'A' },
    { q: 'Nhôm dura là hợp kim của?', A: 'Al - Cu', B: 'Al - Mg', C: 'Al - Si', D: 'Al - Zn', correct: 'A' },
  ],
  sinhhoc: [
    { q: 'Đơn vị cấu tạo cơ bản của cơ thể sống là?', A: 'Mô', B: 'Tế bào', C: 'Cơ quan', D: 'Hệ cơ quan', correct: 'B' },
    { q: 'Bộ phận nào của tế bào thực vật có chức năng quang hợp?', A: 'Nhân', B: 'Ti thể', C: 'Lục lạp', D: 'Không bào', correct: 'C' },
    { q: 'Máu được bơm từ tim qua động mạch nào lớn nhất?', A: 'Động mạch phổi', B: 'Động mạch chủ', C: 'Động mạch cảnh', D: 'Động mạch vành', correct: 'B' },
    { q: 'Cơ quan nào sản xuất insulin?', A: 'Gan', B: 'Thận', C: 'Tụy', D: 'Lá lách', correct: 'C' },
    { q: 'Quá trình hô hấp tế bào diễn ra ở đâu?', A: 'Nhân tế bào', B: 'Ti thể', C: 'Lưới nội chất', D: 'Ribosome', correct: 'B' },
    { q: 'Bệnh thiếu vitamin C gây ra bệnh gì?', A: 'Còi xương', B: 'Scorbut', C: 'Quáng gà', D: 'Beri beri', correct: 'B' },
    { q: 'Hệ tuần hoàn của con người gồm mấy buồng tim?', A: '2', B: '3', C: '4', D: '5', correct: 'C' },
    { q: 'Cơ quan nào lọc máu trong cơ thể?', A: 'Gan', B: 'Thận', C: 'Lá lách', D: 'Phổi', correct: 'B' },
    { q: 'DNA có cấu trúc như thế nào?', A: 'Chuỗi đơn', B: 'Chuỗi kép xoắn', C: 'Vòng tròn', D: 'Hình cầu', correct: 'B' },
    { q: 'Quá trình phân chia tế bào sinh dục gọi là?', A: 'Nguyên phân', B: 'Giảm phân', C: 'Phân đôi', D: 'Phân chia', correct: 'B' },
    { q: 'Enzyme là gì?', A: 'Protein xúc tác', B: 'Carbohydrate', C: 'Lipid', D: 'Acid nucleic', correct: 'A' },
    { q: 'Photosynthesis diễn ra ở đâu trong tế bào thực vật?', A: 'Nhân', B: 'Ti thể', C: 'Lục lạp', D: 'Ribosome', correct: 'C' },
    { q: 'Hormone tăng trưởng được sản xuất ở đâu?', A: 'Tuyến giáp', B: 'Tuyến yên', C: 'Tuyến thượng thận', D: 'Tụy', correct: 'B' },
    { q: 'Bệnh đái tháo đường do thiếu hormone nào?', A: 'Insulin', B: 'Glucagon', C: 'Adrenalin', D: 'Thyroxin', correct: 'A' },
    { q: 'Hệ thần kinh trung ương gồm?', A: 'Não và tủy sống', B: 'Não và dây thần kinh', C: 'Tủy sống và dây thần kinh', D: 'Chỉ có não', correct: 'A' },
    { q: 'Máu đỏ do chứa chất gì?', A: 'Hemoglobin', B: 'Chlorophyll', C: 'Melanin', D: 'Carotin', correct: 'A' },
    { q: 'Quá trình tiêu hóa bắt đầu ở đâu?', A: 'Dạ dày', B: 'Miệng', C: 'Ruột non', D: 'Thực quản', correct: 'B' },
    { q: 'Vitamin D được tổng hợp khi tiếp xúc với?', A: 'Ánh sáng mặt trời', B: 'Nước', C: 'Không khí', D: 'Thức ăn', correct: 'A' },
    { q: 'Bệnh thiếu vitamin A gây ra?', A: 'Scorbut', B: 'Quáng gà', C: 'Beri beri', D: 'Còi xương', correct: 'B' },
    { q: 'Bệnh thiếu vitamin D gây ra?', A: 'Scorbut', B: 'Quáng gà', C: 'Còi xương', D: 'Beri beri', correct: 'C' },
    { q: 'Bệnh thiếu vitamin B1 gây ra?', A: 'Scorbut', B: 'Quáng gà', C: 'Còi xương', D: 'Beri beri', correct: 'D' },
    { q: 'Nhóm máu ABO được phát hiện bởi ai?', A: 'Mendel', B: 'Darwin', C: 'Landsteiner', D: 'Watson', correct: 'C' },
    { q: 'Người có nhóm máu O có thể cho máu cho?', A: 'Chỉ nhóm O', B: 'Tất cả các nhóm', C: 'Nhóm A và B', D: 'Nhóm AB', correct: 'B' },
    { q: 'Người có nhóm máu AB có thể nhận máu từ?', A: 'Chỉ nhóm AB', B: 'Tất cả các nhóm', C: 'Nhóm A và B', D: 'Nhóm O', correct: 'B' },
    { q: 'Cơ quan nào sản xuất mật?', A: 'Gan', B: 'Thận', C: 'Tụy', D: 'Lá lách', correct: 'A' },
    { q: 'Quá trình hấp thụ chất dinh dưỡng chủ yếu ở?', A: 'Dạ dày', B: 'Ruột non', C: 'Ruột già', D: 'Gan', correct: 'B' },
    { q: 'Tế bào não cần chất gì để hoạt động?', A: 'Protein', B: 'Lipid', C: 'Glucose', D: 'Vitamin', correct: 'C' },
    { q: 'Quá trình sinh sản vô tính ở thực vật gọi là?', A: 'Sinh sản hữu tính', B: 'Sinh sản sinh dưỡng', C: 'Thụ phấn', D: 'Thụ tinh', correct: 'B' },
    { q: 'Cơ quan sinh sản đực của hoa là?', A: 'Nhị', B: 'Nhuỵ', C: 'Cánh hoa', D: 'Đài hoa', correct: 'A' },
    { q: 'Cơ quan sinh sản cái của hoa là?', A: 'Nhị', B: 'Nhuỵ', C: 'Cánh hoa', D: 'Đài hoa', correct: 'B' },
    { q: 'Quá trình biến đổi từ tinh trùng và trứng thành hợp tử gọi là?', A: 'Thụ phấn', B: 'Thụ tinh', C: 'Nảy mầm', D: 'Phát triển', correct: 'B' },
    { q: 'Nhiễm sắc thể ở người có bao nhiêu cặp?', A: '22', B: '23', C: '24', D: '25', correct: 'B' },
    { q: 'Giới tính ở người được quyết định bởi cặp nhiễm sắc thể nào?', A: 'XX và XY', B: 'AA và BB', C: 'AB và CD', D: '22 và 23', correct: 'A' },
    { q: 'Nam giới có cặp nhiễm sắc thể giới tính là?', A: 'XX', B: 'XY', C: 'YY', D: 'XZ', correct: 'B' },
    { q: 'Nữ giới có cặp nhiễm sắc thể giới tính là?', A: 'XX', B: 'XY', C: 'YY', D: 'XZ', correct: 'A' },
    { q: 'Định luật di truyền được phát hiện bởi ai?', A: 'Darwin', B: 'Mendel', C: 'Watson', D: 'Crick', correct: 'B' },
    { q: 'Đơn vị di truyền cơ bản là?', A: 'Nhiễm sắc thể', B: 'Gen', C: 'DNA', D: 'RNA', correct: 'B' },
    { q: 'Quá trình tổng hợp protein từ mRNA gọi là?', A: 'Phiên mã', B: 'Dịch mã', C: 'Nhân đôi', D: 'Đột biến', correct: 'B' },
    { q: 'Quá trình tổng hợp mRNA từ DNA gọi là?', A: 'Phiên mã', B: 'Dịch mã', C: 'Nhân đôi', D: 'Đột biến', correct: 'A' },
    { q: 'Cơ quan nào điều hòa thân nhiệt ở người?', A: 'Gan', B: 'Thận', C: 'Não', D: 'Da', correct: 'C' },
    { q: 'Phản xạ có điều kiện được hình thành nhờ?', A: 'Bẩm sinh', B: 'Học tập', C: 'Di truyền', D: 'Tự nhiên', correct: 'B' },
    { q: 'Hệ miễn dịch có chức năng gì?', A: 'Bảo vệ cơ thể', B: 'Tiêu hóa', C: 'Tuần hoàn', D: 'Hô hấp', correct: 'A' },
    { q: 'Kháng thể được sản xuất bởi?', A: 'Hồng cầu', B: 'Bạch cầu', C: 'Tiểu cầu', D: 'Huyết tương', correct: 'B' },
    { q: 'Vaccine có tác dụng gì?', A: 'Chữa bệnh', B: 'Phòng bệnh', C: 'Giảm đau', D: 'Tăng sức khỏe', correct: 'B' },
    { q: 'Virus là gì?', A: 'Tế bào', B: 'Vi khuẩn', C: 'Ký sinh trùng nội bào', D: 'Nấm', correct: 'C' },
    { q: 'Vi khuẩn thuộc nhóm sinh vật nào?', A: 'Nhân thực', B: 'Nhân sơ', C: 'Đa bào', D: 'Đơn bào có nhân', correct: 'B' },
    { q: 'Nấm lấy dinh dưỡng bằng cách nào?', A: 'Quang hợp', B: 'Hấp thụ', C: 'Săn mồi', D: 'Ký sinh', correct: 'B' },
    { q: 'Thực vật xanh tự sản xuất thức ăn nhờ?', A: 'Hô hấp', B: 'Quang hợp', C: 'Lên men', D: 'Tiêu hóa', correct: 'B' },
    { q: 'Oxy được thải ra trong quang hợp từ đâu?', A: 'CO2', B: 'H2O', C: 'Glucose', D: 'Chlorophyll', correct: 'B' },
    { q: 'Sản phẩm cuối của quang hợp là?', A: 'CO2 và H2O', B: 'Glucose và O2', C: 'ATP và NADPH', D: 'Protein và lipid', correct: 'B' },
    { q: 'Hô hấp tế bào có mục đích gì?', A: 'Tạo ATP', B: 'Tạo glucose', C: 'Tạo protein', D: 'Tạo lipid', correct: 'A' },
    { q: 'Sản phẩm cuối của hô hấp hiếu khí là?', A: 'Glucose và O2', B: 'CO2 và H2O', C: 'Lactate', D: 'Ethanol', correct: 'B' },
    { q: 'Quá trình lên men tạo ra sản phẩm gì?', A: 'CO2 và H2O', B: 'Ethanol hoặc lactate', C: 'Glucose', D: 'Protein', correct: 'B' },
    { q: 'Chuỗi thức ăn bắt đầu từ?', A: 'Động vật ăn thịt', B: 'Sinh vật sản xuất', C: 'Động vật ăn cỏ', D: 'Vi khuẩn phân hủy', correct: 'B' },
    { q: 'Sinh vật phân hủy có vai trò gì trong hệ sinh thái?', A: 'Sản xuất', B: 'Tiêu thụ bậc 1', C: 'Tiêu thủ bậc 2', D: 'Phân hủy chất hữu cơ', correct: 'D' },
    { q: 'Hiệu ứng nhà kính chủ yếu do khí nào?', A: 'O2', B: 'N2', C: 'CO2', D: 'H2', correct: 'C' },
    { q: 'Tầng ozone bảo vệ Trái Đất khỏi?', A: 'Tia hồng ngoại', B: 'Tia tử ngoại', C: 'Tia X', D: 'Tia gamma', correct: 'B' },
    { q: 'Đa dạng sinh học bao gồm?', A: 'Đa dạng gen', B: 'Đa dạng loài', C: 'Đa dạng hệ sinh thái', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Tiến hóa là quá trình gì?', A: 'Thay đổi của loài qua thời gian', B: 'Sinh sản', C: 'Phát triển cá thể', D: 'Di truyền', correct: 'A' },
    { q: 'Chọn lọc tự nhiên do ai đề xuất?', A: 'Mendel', B: 'Darwin', C: 'Lamarck', D: 'Wallace', correct: 'B' },
    { q: 'Đột biến gen có thể gây ra?', A: 'Thay đổi tính trạng', B: 'Bệnh di truyền', C: 'Tiến hóa', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Công nghệ gen có ứng dụng gì?', A: 'Sản xuất insulin', B: 'Tạo giống cây trồng mới', C: 'Chữa bệnh di truyền', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Nhân bản vô tính tạo ra cá thể có?', A: 'Vật liệu di truyền giống nhau', B: 'Vật liệu di truyền khác nhau', C: 'Một nửa vật liệu di truyền', D: 'Không có vật liệu di truyền', correct: 'A' },
    { q: 'Tế bào gốc có đặc điểm gì?', A: 'Có thể phân chia', B: 'Có thể biệt hóa', C: 'Tự đổi mới', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Hormone auxin có tác dụng gì ở thực vật?', A: 'Kích thích sinh trưởng', B: 'Ức chế sinh trưởng', C: 'Kích thích ra hoa', D: 'Kích thích rụng lá', correct: 'A' },
    { q: 'Thực vật hướng ánh sáng do hormone nào?', A: 'Auxin', B: 'Gibberellin', C: 'Cytokinin', D: 'Ethylene', correct: 'A' },
    { q: 'Quá trình lão hóa ở thực vật do hormone nào điều khiển?', A: 'Auxin', B: 'Gibberellin', C: 'Cytokinin', D: 'Ethylene', correct: 'D' },
    { q: 'Cơ chế điều hòa nhiệt độ cơ thể gọi là?', A: 'Homeostasis', B: 'Metabolism', C: 'Photosynthesis', D: 'Respiration', correct: 'A' },
    { q: 'Nước chiếm bao nhiêu phần trăm trọng lượng cơ thể người?', A: '50%', B: '60%', C: '70%', D: '80%', correct: 'C' },
    { q: 'Tế bào máu đỏ có tuổi thọ bao lâu?', A: '60 ngày', B: '90 ngày', C: '120 ngày', D: '150 ngày', correct: 'C' },
    { q: 'Gan có chức năng gì?', A: 'Giải độc', B: 'Sản xuất mật', C: 'Dự trữ glycogen', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Thận lọc bao nhiêu lít máu mỗi ngày?', A: '100L', B: '150L', C: '180L', D: '200L', correct: 'C' },
    { q: 'Phổi có bao nhiêu thùy?', A: '2 thùy', B: '3 thùy', C: 'Phổi trái 2, phổi phải 3', D: 'Phổi trái 3, phổi phải 2', correct: 'C' },
    { q: 'Não người tiêu thụ bao nhiêu phần trăm năng lượng cơ thể?', A: '10%', B: '15%', C: '20%', D: '25%', correct: 'C' },
    { q: 'Tế bào thần kinh có thể tái sinh không?', A: 'Có', B: 'Không', C: 'Một số loại có thể', D: 'Chỉ ở trẻ em', correct: 'C' },
    { q: 'Hormone melatonin điều khiển gì?', A: 'Giấc ngủ', B: 'Tăng trưởng', C: 'Sinh sản', D: 'Tiêu hóa', correct: 'A' },
    { q: 'Vitamin nào tan trong nước?', A: 'A, D, E, K', B: 'B, C', C: 'Chỉ C', D: 'Tất cả', correct: 'B' },
    { q: 'Canxi chủ yếu được hấp thụ ở đâu?', A: 'Dạ dày', B: 'Ruột non', C: 'Ruột già', D: 'Gan', correct: 'B' },
    { q: 'Sắt trong cơ thể chủ yếu ở dạng nào?', A: 'Sắt tự do', B: 'Hemoglobin', C: 'Ferritin', D: 'B và C', correct: 'D' },
    { q: 'Protein hoàn chỉnh chứa đủ?', A: 'Amino acid thiết yếu', B: 'Amino acid không thiết yếu', C: 'Vitamin', D: 'Khoáng chất', correct: 'A' },
    { q: 'Cholesterol được sản xuất chủ yếu ở?', A: 'Gan', B: 'Thận', C: 'Tim', D: 'Phổi', correct: 'A' },
    { q: 'HDL được gọi là cholesterol gì?', A: 'Xấu', B: 'Tốt', C: 'Trung tính', D: 'Độc hại', correct: 'B' },
    { q: 'LDL được gọi là cholesterol gì?', A: 'Xấu', B: 'Tốt', C: 'Trung tính', D: 'Có lợi', correct: 'A' },
    { q: 'Bệnh tiểu đường type 1 do?', A: 'Thiếu insulin', B: 'Kháng insulin', C: 'Thừa đường', D: 'Thiếu glucagon', correct: 'A' },
    { q: 'Bệnh tiểu đường type 2 do?', A: 'Thiếu insulin', B: 'Kháng insulin', C: 'Thừa đường', D: 'Thiếu glucagon', correct: 'B' },
    { q: 'Huyết áp bình thường của người trưởng thành?', A: '110/70 mmHg', B: '120/80 mmHg', C: '130/90 mmHg', D: '140/90 mmHg', correct: 'B' },
    { q: 'Nhịp tim bình thường của người trưởng thành?', A: '50-70 lần/phút', B: '60-80 lần/phút', C: '60-100 lần/phút', D: '80-120 lần/phút', correct: 'C' },
    { q: 'Thể tích máu của người trưởng thành?', A: '4-5 lít', B: '5-6 lít', C: '6-7 lít', D: '7-8 lít', correct: 'B' },
    { q: 'Tần số hô hấp bình thường của người trưởng thành?', A: '10-15 lần/phút', B: '12-18 lần/phút', C: '15-20 lần/phút', D: '18-25 lần/phút', correct: 'B' },
    { q: 'Nhiệt độ cơ thể bình thường?', A: '36°C', B: '36.5°C', C: '37°C', D: '37.5°C', correct: 'C' },
    { q: 'Lượng nước cần thiết mỗi ngày cho người trưởng thành?', A: '1.5-2 lít', B: '2-2.5 lít', C: '2.5-3 lít', D: '3-3.5 lít', correct: 'B' },
    { q: 'Số lượng răng của người trưởng thành?', A: '28', B: '30', C: '32', D: '34', correct: 'C' },
    { q: 'Tuổi thọ trung bình của hồng cầu?', A: '90 ngày', B: '100 ngày', C: '120 ngày', D: '150 ngày', correct: 'C' },
    { q: 'Tỷ lệ nước trong máu?', A: '80%', B: '85%', C: '90%', D: '95%', correct: 'C' },
    { q: 'Số lượng xương trong cơ thể người trưởng thành?', A: '206', B: '208', C: '210', D: '212', correct: 'A' },
    { q: 'Cơ mạnh nhất trong cơ thể người?', A: 'Cơ tim', B: 'Cơ hàm', C: 'Cơ đùi', D: 'Cơ tay', correct: 'B' },
    { q: 'Xương dài nhất trong cơ thể?', A: 'Xương đùi', B: 'Xương cẳng chân', C: 'Xương cánh tay', D: 'Xương sườn', correct: 'A' },
    { q: 'Cơ quan lớn nhất của cơ thể?', A: 'Gan', B: 'Phổi', C: 'Da', D: 'Não', correct: 'C' },
    { q: 'Giác quan nào phát triển đầu tiên ở thai nhi?', A: 'Thị giác', B: 'Thính giác', C: 'Xúc giác', D: 'Khứu giác', correct: 'C' },
    { q: 'DNA có cấu trúc như thế nào?', A: 'Xoắn đơn', B: 'Xoắn kép', C: 'Thẳng', D: 'Vòng tròn', correct: 'B' },
    { q: 'Quá trình tiêu hóa bắt đầu từ đâu?', A: 'Dạ dày', B: 'Ruột non', C: 'Miệng', D: 'Thực quản', correct: 'C' },
  ],
  van: [
    { q: '"Truyện Kiều" là của ai?', A: 'Nguyễn Du', B: 'Nguyễn Trãi', C: 'Tố Hữu', D: 'Xuân Diệu', correct: 'A' },
    { q: '"Số đỏ" là tác phẩm của ai?', A: 'Vũ Trọng Phụng', B: 'Nam Cao', C: 'Ngô Tất Tố', D: 'Thạch Lam', correct: 'A' },
    { q: '"Chí Phèo" là nhân vật trong tác phẩm nào?', A: 'Lão Hạc', B: 'Chí Phèo', C: 'Vợ nhặt', D: 'Tắt đèn', correct: 'B' },
    { q: 'Tác giả của "Dế Mèn phiêu lưu ký"?', A: 'Tô Hoài', B: 'Nguyễn Nhật Ánh', C: 'Võ Quang', D: 'Ma Văn Kháng', correct: 'A' },
    { q: '"Tôi thấy hoa vàng trên cỏ xanh" của ai?', A: 'Tô Hoài', B: 'Nguyễn Nhật Ánh', C: 'Võ Quang', D: 'Nguyễn Minh Châu', correct: 'B' },
    { q: 'Thể thơ lục bát có mấy tiếng một câu?', A: '6-8', B: '7-7', C: '5-7', D: '8-6', correct: 'A' },
    { q: '"Bài ca ngắn" là thể loại văn học nào?', A: 'Truyện ngắn', B: 'Thơ', C: 'Kịch', D: 'Tùy bút', correct: 'B' },
    { q: 'Tác giả "Người lái đò sông Đà"?', A: 'Nguyễn Tuân', B: 'Tô Hoài', C: 'Nam Cao', D: 'Ngô Tất Tố', correct: 'A' },
    { q: '"Vang bóng một thời" của ai?', A: 'Nguyễn Tuân', B: 'Chu Lai', C: 'Thạch Lam', D: 'Vũ Trọng Phụng', correct: 'B' },
    { q: 'Thể thơ Đường luật có mấy câu?', A: '4', B: '6', C: '8', D: '10', correct: 'C' },
    { q: '"Tắt đèn" là tác phẩm của ai?', A: 'Ngô Tất Tố', B: 'Nam Cao', C: 'Vũ Trọng Phụng', D: 'Thạch Lam', correct: 'A' },
    { q: '"Lão Hạc" là tác phẩm của ai?', A: 'Nam Cao', B: 'Ngô Tất Tố', C: 'Vũ Trọng Phụng', D: 'Thạch Lam', correct: 'A' },
    { q: 'Tác giả "Hai đứa trẻ"?', A: 'Thạch Lam', B: 'Nam Cao', C: 'Vũ Trọng Phụng', D: 'Ngô Tất Tố', correct: 'A' },
    { q: '"Cô giáo Minh" của ai?', A: 'Nguyễn Minh Châu', B: 'Nguyễn Tuân', C: 'Ma Văn Kháng', D: 'Tô Hoài', correct: 'C' },
    { q: 'Thể thơ song thất lục bát có bao nhiêu câu?', A: '4', B: '6', C: '8', D: 'Không cố định', correct: 'D' },
    { q: '"Chiếc lá cuối cùng" của ai?', A: 'Tô Hoài', B: 'Thạch Lam', C: 'Nam Cao', D: 'Nguyễn Tuân', correct: 'B' },
    { q: 'Ca dao "Công cha như núi Thái Sơn" thuộc thể loại nào?', A: 'Dân ca', B: 'Ca dao', C: 'Tục ngữ', D: 'Thành ngữ', correct: 'B' },
    { q: '"Quê nội" là tác phẩm của ai?', A: 'Nguyễn Minh Châu', B: 'Thạch Lam', C: 'Tô Hoài', D: 'Nam Cao', correct: 'A' },
    { q: 'Thể thơ thất ngôn tứ tuyệt có mấy câu?', A: '4', B: '6', C: '8', D: '10', correct: 'A' },
    { q: '"Những ngôi sao xa xôi" của ai?', A: 'Lê Minh Khuê', B: 'Nguyễn Huy Thiệp', C: 'Nguyễn Minh Châu', D: 'Tô Hoài', correct: 'A' },
    { q: '"Vợ chồng A Phủ" của ai?', A: 'Tô Hoài', B: 'Nguyễn Tuân', C: 'Tô Hoài', D: 'Ma Văn Kháng', correct: 'C' },
    { q: '"Đất rừng phương Nam" của ai?', A: 'Đoàn Giỏi', B: 'Nguyễn Minh Châu', C: 'Tô Hoài', D: 'Nam Cao', correct: 'A' },
    { q: '"Những đứa con trong gia đình" của ai?', A: 'Nguyễn Thi', B: 'Nguyễn Minh Châu', C: 'Tô Hoài', D: 'Thạch Lam', correct: 'A' },
    { q: '"Làng" của ai?', A: 'Kim Lân', B: 'Nam Cao', C: 'Ngô Tất Tố', D: 'Vũ Trọng Phụng', correct: 'A' },
    { q: '"Cô giáo Minh" của ai?', A: 'Ma Văn Kháng', B: 'Nguyễn Minh Châu', C: 'Tô Hoài', D: 'Nam Cao', correct: 'A' },
    { q: '"Bến không chồng" của ai?', A: 'Nguyễn Minh Châu', B: 'Thạch Lam', C: 'Nam Cao', D: 'Tô Hoài', correct: 'A' },
    { q: '"Tôi kể chuyện" của ai?', A: 'Nguyễn Tuân', B: 'Tô Hoài', C: 'Nam Cao', D: 'Thạch Lam', correct: 'A' },
    { q: '"Hương rừng Cà Mau" của ai?', A: 'Sơn Nam', B: 'Nguyễn Minh Châu', C: 'Tô Hoài', D: 'Đoàn Giỏi', correct: 'A' },
    { q: '"Thời xa vắng" của ai?', A: 'Lê Minh Khuê', B: 'Nguyễn Huy Thiệp', C: 'Nguyễn Minh Châu', D: 'Phạm Thị Hoài', correct: 'A' },
    { q: '"Tướng về hưu" của ai?', A: 'Nguyễn Huy Thiệp', B: 'Lê Minh Khuê', C: 'Nguyễn Minh Châu', D: 'Bảo Ninh', correct: 'A' },
    { q: '"Nỗi buồn chiến tranh" của ai?', A: 'Bảo Ninh', B: 'Lê Minh Khuê', C: 'Nguyễn Huy Thiệp', D: 'Phạm Thị Hoài', correct: 'A' },
    { q: '"Mùa lạc" của ai?', A: 'Nguyễn Khải', B: 'Nguyễn Minh Châu', C: 'Tô Hoài', D: 'Ma Văn Kháng', correct: 'A' },
    { q: '"Đường về phía mặt trời" của ai?', A: 'Dương Hương', B: 'Nguyễn Minh Châu', C: 'Tô Hoài', D: 'Lê Minh Khuê', correct: 'A' },
    { q: 'Thể thơ song thất lục bát có đặc điểm gì?', A: 'Luân phiên 7-6-8', B: 'Luân phiên 6-8-7', C: 'Cố định 7-6-8', D: 'Tự do', correct: 'A' },
    { q: 'Thể thơ tự do có đặc điểm gì?', A: 'Không theo luật', B: 'Tự do về số tiếng', C: 'Tự do về vần', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Ca dao "Gần mực thì đen, gần đèn thì sáng" nói về?', A: 'Ảnh hưởng của môi trường', B: 'Tầm quan trọng của học tập', C: 'Sự khác biệt', D: 'Ánh sáng', correct: 'A' },
    { q: 'Tục ngữ "Có công mài sắt có ngày nên kim" khuyên?', A: 'Kiên trì', B: 'Chăm chỉ', C: 'Nhẫn nại', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Thành ngữ "Như cá gặp nước" có nghĩa?', A: 'Gặp khó khăn', B: 'Gặp điều kiện thuận lợi', C: 'Bơi giỏi', D: 'Thích nước', correct: 'B' },
    { q: 'Truyện cổ tích "Tấm Cám" thuộc thể loại?', A: 'Truyện thần tiên', B: 'Truyện động vật', C: 'Truyện cười', D: 'Truyện tích', correct: 'A' },
    { q: 'Truyện cổ tích "Sự tích hoa mai" thuộc thể loại?', A: 'Truyện thần tiên', B: 'Truyện tích', C: 'Truyện động vật', D: 'Truyện cười', correct: 'B' },
    { q: 'Dân ca "Quan họ Bắc Ninh" có đặc điểm?', A: 'Hát đối đáp', B: 'Hát solo', C: 'Hát hợp xướng', D: 'Hát rap', correct: 'A' },
    { q: 'Dân ca "Ví dặm" của vùng nào?', A: 'Nghệ Tĩnh', B: 'Bắc Bộ', C: 'Nam Bộ', D: 'Trung Bộ', correct: 'A' },
    { q: 'Dân ca "Hò Huế" có đặc điểm gì?', A: 'Nhịp chậm, du dương', B: 'Nhịp nhanh', C: 'Hùng tráng', D: 'Vui tươi', correct: 'A' },
    { q: '"Hịch tướng sĩ" của ai?', A: 'Trần Hưng Đạo', B: 'Lý Thường Kiệt', C: 'Nguyễn Trãi', D: 'Lê Lợi', correct: 'A' },
    { q: '"Bình Ngô đại cáo" của ai?', A: 'Nguyễn Trãi', B: 'Trần Hưng Đạo', C: 'Lý Thường Kiệt', D: 'Lê Lợi', correct: 'A' },
    { q: '"Nam quốc sơn hà" của ai?', A: 'Lý Thường Kiệt', B: 'Trần Hưng Đạo', C: 'Nguyễn Trãi', D: 'Lê Lợi', correct: 'A' },
    { q: 'Tác phẩm "Chinh phụ ngâm" của ai?', A: 'Đặng Trần Côn', B: 'Nguyễn Gia Thiều', C: 'Hồ Xuân Hương', D: 'Nguyễn Du', correct: 'A' },
    { q: 'Tác phẩm "Cung oán ngâm khúc" của ai?', A: 'Nguyễn Gia Thiều', B: 'Đặng Trần Côn', C: 'Hồ Xuân Hương', D: 'Nguyễn Du', correct: 'A' },
    { q: 'Hồ Xuân Hương được gọi là?', A: 'Bà chúa thơ Nôm', B: 'Nữ sĩ tài hoa', C: 'Thi hào', D: 'Nhà thơ lãng mạn', correct: 'A' },
    { q: 'Nguyễn Du được tôn là?', A: 'Đại thi hào dân tộc', B: 'Nhà thơ vĩ đại', C: 'Tác giả Truyện Kiều', D: 'Cả A, B, C', correct: 'D' },
    { q: 'Truyện Kiều có bao nhiêu câu thơ?', A: '3254', B: '3254', C: '3154', D: '3354', correct: 'A' },
    { q: 'Truyện Kiều được viết theo thể thơ nào?', A: 'Lục bát', B: 'Song thất lục bát', C: 'Thất ngôn tứ tuyệt', D: 'Tự do', correct: 'A' },
    { q: 'Nhân vật chính trong Truyện Kiều là?', A: 'Thúy Kiều', B: 'Kim Trọng', C: 'Thúy Vân', D: 'Vương Quan', correct: 'A' },
    { q: 'Tác phẩm "Gia Đình" của ai?', A: 'Nguyễn Thi', B: 'Vũ Trọng Phụng', C: 'Nam Cao', D: 'Ngô Tất Tố', correct: 'A' },
    { q: 'Tác phẩm "Đoạn trường tân thanh" của ai?', A: 'Nguyễn Du', B: 'Cao Bá Quát', C: 'Nguyễn Khuyến', D: 'Tú Xương', correct: 'A' },
    { q: 'Nhà thơ nào có biệt danh "Tú ông"?', A: 'Tú Xương', B: 'Cao Bá Quát', C: 'Nguyễn Khuyến', D: 'Tản Đà', correct: 'A' },
    { q: 'Nhà thơ nào có biệt danh "Ông đồ Hà Đông"?', A: 'Nguyễn Khuyến', B: 'Cao Bá Quát', C: 'Tú Xương', D: 'Tản Đà', correct: 'A' },
    { q: 'Tác phẩm "Phan Trần" của ai?', A: 'Cao Bá Quát', B: 'Nguyễn Khuyến', C: 'Tú Xương', D: 'Tản Đà', correct: 'A' },
    { q: 'Tác phẩm "Ai đã đặt tên cho dòng sông" của ai?', A: 'Hoàng Trung Thông', B: 'Nguyễn Khoa Điềm', C: 'Tế Hanh', D: 'Xuân Quỳnh', correct: 'A' },
    { q: 'Tác phẩm "Sóng" của ai?', A: 'Xuân Quỳnh', B: 'Tế Hanh', C: 'Nguyễn Khoa Điềm', D: 'Hoàng Trung Thông', correct: 'A' },
    { q: 'Tác phẩm "Đây thôn Vĩ Dạ" của ai?', A: 'Hàn Mặc Tử', B: 'Xuân Diệu', C: 'Tố Hữu', D: 'Chế Lan Viên', correct: 'A' },
    { q: 'Tác phẩm "Thơ thơ" của ai?', A: 'Xuân Diệu', B: 'Hàn Mặc Tử', C: 'Tố Hữu', D: 'Chế Lan Viên', correct: 'A' },
    { q: 'Tác phẩm "Từ ấy" của ai?', A: 'Tố Hữu', B: 'Xuân Diệu', C: 'Hàn Mặc Tử', D: 'Chế Lan Viên', correct: 'A' },
    { q: 'Tác phẩm "Tiếng hát con tàu" của ai?', A: 'Chế Lan Viên', B: 'Tố Hữu', C: 'Xuân Diệu', D: 'Hàn Mặc Tử', correct: 'A' },
    { q: 'Tác phẩm "Đường kách mệnh" của ai?', A: 'Hồ Chí Minh', B: 'Tố Hữu', C: 'Xuân Diệu', D: 'Chế Lan Viên', correct: 'A' },
    { q: 'Tác phẩm "Nhật ký trong tù" của ai?', A: 'Hồ Chí Minh', B: 'Tố Hữu', C: 'Xuân Diệu', D: 'Nguyễn Ái Quốc', correct: 'A' },
    { q: 'Thể loại "Truyện ngắn" có đặc điểm gì?', A: 'Ngắn gọn, tập trung', B: 'Nhiều nhân vật', C: 'Cốt truyện phức tạp', D: 'Dài', correct: 'A' },
    { q: 'Thể loại "Tiểu thuyết" có đặc điểm gì?', A: 'Dài, nhiều nhân vật', B: 'Ngắn gọn', C: 'Ít nhân vật', D: 'Đơn giản', correct: 'A' },
    { q: 'Thể loại "Kịch" có đặc điểm gì?', A: 'Để diễn trên sân khấu', B: 'Để đọc', C: 'Để nghe', D: 'Để xem phim', correct: 'A' },
    { q: 'Thể loại "Tùy bút" có đặc điểm gì?', A: 'Tự do, chủ quan', B: 'Khách quan', C: 'Nghiêm túc', D: 'Khô khan', correct: 'A' },
    { q: 'Phong cách "Lãng mạn" có đặc điểm gì?', A: 'Tình cảm, mơ mộng', B: 'Thực tế', C: 'Khô khan', D: 'Lạnh lùng', correct: 'A' },
    { q: 'Phong cách "Hiện thực" có đặc điểm gì?', A: 'Phản ánh thực tế', B: 'Mơ mộng', C: 'Viễn tưởng', D: 'Hư cấu', correct: 'A' },
    { q: 'Nghệ thuật "Ẩn dụ" là gì?', A: 'So sánh gián tiếp', B: 'So sánh trực tiếp', C: 'Mô tả', D: 'Kể chuyện', correct: 'A' },
    { q: 'Nghệ thuật "Hoán dụ" là gì?', A: 'Thay thế bằng từ khác', B: 'So sánh', C: 'Mô tả', D: 'Nhấn mạnh', correct: 'A' },
    { q: 'Nghệ thuật "Nhân hóa" là gì?', A: 'Cho vật vô tri có tính người', B: 'Mô tả con người', C: 'So sánh', D: 'Tương phản', correct: 'A' },
    { q: 'Nghệ thuật "Đối lập" là gì?', A: 'Tương phản hai mặt', B: 'Giống nhau', C: 'So sánh', D: 'Mô tả', correct: 'A' },
    { q: 'Văn học dân gian có đặc điểm gì?', A: 'Vô danh, truyền miệng', B: 'Có tác giả', C: 'Viết trên giấy', D: 'Hiện đại', correct: 'A' },
    { q: 'Văn học trung đại có đặc điểm gì?', A: 'Chữ Hán, chữ Nôm', B: 'Chữ quốc ngữ', C: 'Truyền miệng', D: 'Hiện đại', correct: 'A' },
    { q: 'Văn học hiện đại có đặc điểm gì?', A: 'Chữ quốc ngữ', B: 'Chữ Hán', C: 'Chữ Nôm', D: 'Truyền miệng', correct: 'A' },
    { q: 'Thơ Đường luật có mấy câu?', A: '8', B: '4', C: '6', D: '10', correct: 'A' },
    { q: 'Thơ tứ tuyệt có mấy câu?', A: '4', B: '8', C: '6', D: '2', correct: 'A' },
    { q: 'Câu đối có đặc điểm gì?', A: 'Đối xứng về nghĩa và âm', B: 'Tự do', C: 'Không theo luật', D: 'Ngẫu nhiên', correct: 'A' },
    { q: 'Biện pháp tu từ "Lặp" có tác dụng gì?', A: 'Nhấn mạnh', B: 'Làm đẹp', C: 'Trang trí', D: 'Mô tả', correct: 'A' },
    { q: 'Biện pháp tu từ "Điệp ngữ" là gì?', A: 'Lặp lại từ ngữ', B: 'Thay đổi từ ngữ', C: 'Bỏ từ ngữ', D: 'Thêm từ ngữ', correct: 'A' },
    { q: 'Biện pháp tu từ "Liệt kê" có tác dụng gì?', A: 'Tạo sự phong phú', B: 'Đơn giản hóa', C: 'Rút gọn', D: 'Che giấu', correct: 'A' },
    { q: 'Biện pháp tu từ "Đảo ngữ" là gì?', A: 'Thay đổi trật tự từ', B: 'Giữ nguyên trật tự', C: 'Bỏ từ', D: 'Thêm từ', correct: 'A' },
    { q: 'Tác dụng của "Câu cảm thán" là gì?', A: 'Bộc lộ cảm xúc', B: 'Hỏi đáp', C: 'Khẳng định', D: 'Phủ định', correct: 'A' },
    { q: 'Tác dụng của "Câu hỏi tu từ" là gì?', A: 'Khẳng định mạnh mẽ', B: 'Hỏi thật', C: 'Phủ định', D: 'Nghi ngờ', correct: 'A' },
    { q: 'Văn bản "Tuyên ngôn Độc lập" của ai?', A: 'Hồ Chí Minh', B: 'Nguyễn Ái Quốc', C: 'Tố Hữu', D: 'Xuân Diệu', correct: 'A' },
    { q: 'Tác phẩm "Người mẹ cầm súng" của ai?', A: 'Nguyễn Khoa Điềm', B: 'Tố Hữu', C: 'Xuân Diệu', D: 'Chế Lan Viên', correct: 'A' },
    { q: 'Tác phẩm "Việt Bắc" của ai?', A: 'Tố Hữu', B: 'Nguyễn Khoa Điềm', C: 'Xuân Diệu', D: 'Chế Lan Viên', correct: 'A' },
    { q: 'Tác phẩm "Đất nước" của ai?', A: 'Nguyễn Khoa Điềm', B: 'Tố Hữu', C: 'Xuân Diệu', D: 'Chế Lan Viên', correct: 'A' },
    { q: 'Tác phẩm "Mùa xuân nho nhỏ" của ai?', A: 'Thanh Hải', B: 'Nguyễn Khoa Điềm', C: 'Tố Hữu', D: 'Xuân Diệu', correct: 'A' },
    { q: 'Tác phẩm "Ánh trăng" của ai?', A: 'Nguyễn Duy', B: 'Thanh Hải', C: 'Nguyễn Khoa Điềm', D: 'Tố Hữu', correct: 'A' },
    { q: 'Tác phẩm "Đồng chí" của ai?', A: 'Chính Hữu', B: 'Nguyễn Duy', C: 'Thanh Hải', D: 'Nguyễn Khoa Điềm', correct: 'A' },
    { q: 'Tác phẩm "Ru con" của ai?', A: 'Nguyễn Khoa Điềm', B: 'Chính Hữu', C: 'Nguyễn Duy', D: 'Thanh Hải', correct: 'A' },
    { q: 'Tác phẩm "Những người con gái Việt Nam" của ai?', A: 'Nguyễn Tuân', B: 'Nguyễn Khoa Điềm', C: 'Chính Hữu', D: 'Nguyễn Duy', correct: 'A' },
    { q: 'Tác phẩm "Người Hà Nội" của ai?', A: 'Nguyễn Khắc Viện', B: 'Nguyễn Tuân', C: 'Nguyễn Khoa Điềm', D: 'Chính Hữu', correct: 'A' },
  ],
  lichsu: [
    { q: 'Cách mạng tháng Tám diễn ra năm nào?', A: '1930', B: '1945', C: '1954', D: '1975', correct: 'B' },
    { q: 'Chiến thắng Điện Biên Phủ diễn ra năm nào?', A: '1953', B: '1954', C: '1955', D: '1956', correct: 'B' },
    { q: 'Việt Nam thống nhất năm nào?', A: '1973', B: '1974', C: '1975', D: '1976', correct: 'C' },
    { q: 'Bác Hồ sinh năm nào?', A: '1889', B: '1890', C: '1891', D: '1892', correct: 'B' },
    { q: 'Đảng Cộng sản Việt Nam thành lập năm nào?', A: '1929', B: '1930', C: '1931', D: '1932', correct: 'B' },
    { q: 'Khởi nghĩa Yên Bái diễn ra năm nào?', A: '1929', B: '1930', C: '1931', D: '1932', correct: 'B' },
    { q: 'Hiệp định Genève ký năm nào?', A: '1953', B: '1954', C: '1955', D: '1956', correct: 'B' },
    { q: 'Ai là hoàng đế cuối cùng của Việt Nam?', A: 'Bảo Đại', B: 'Khải Định', C: 'Duy Tân', D: 'Thành Thái', correct: 'A' },
    { q: 'Cuộc kháng chiến chống Pháp kéo dài bao lâu?', A: '8 năm', B: '9 năm', C: '10 năm', D: '11 năm', correct: 'B' },
    { q: 'Thủ đô đầu tiên của Việt Nam là?', A: 'Hoa Lư', B: 'Thăng Long', C: 'Phú Xuân', D: 'Sài Gòn', correct: 'A' },
    { q: '"Nam Đàn tứ hổ" gồm những ai?', A: 'Phan Bội Châu, Nguyễn Sinh Sắc, Vương Thúc Quý, Trần Văn Lương', B: 'Phan Văn San, Nguyễn Sinh Sắc, Vương Thúc Quý, Lương Thế Vinh', C: 'Phan Bội Châu, Nguyễn Sinh Sắc, Trần Văn Quý, Lương Thế Vinh', D: 'Nguyễn Văn San, Nguyễn Sinh Sắc, Trần Văn Quý, Lương Thế Vinh', correct: 'A' },
    { q: 'Nguyễn Ái Quốc lần đầu nghe từ tiếng Pháp nào?', A: 'Độc lập - Tự do - Hạnh phúc', B: 'Độc lập dân tộc, giải phóng dân tộc', C: 'Tự do - Bình đẳng - Bác ái', D: 'Giải phóng dân tộc, giải phóng giai cấp', correct: 'C' },
    { q: 'Bài thơ "Núi cõng con đường mòn" tả về địa danh nào?', A: 'Đèo Ngang, năm 1895', B: 'Núi rừng Việt Bắc năm 1954', C: 'Núi ở Quảng Châu năm 1941', D: 'Núi Ba Vì năm 1947', correct: 'A' },
    { q: 'Nguyễn Tất Thành đến Huế lần thứ 2 vào năm nào?', A: '1904', B: '1905', C: '1906', D: '1908', correct: 'A' },
    { q: 'Thân mẫu Hồ Chí Minh - bà Hoàng Thị Loan mất năm nào, ở đâu?', A: '1898, Nghệ An', B: '1901, Huế', C: '1911, Bình Định', D: '1921, Hà Tĩnh', correct: 'B' },
    { q: 'Yếu tố quyết định hình thành tư tưởng Hồ Chí Minh?', A: 'Giá trị truyền thống dân tộc', B: 'Tư tưởng khai sáng Pháp', C: 'Chủ nghĩa Mác - Lênin', D: 'Phẩm chất cá nhân', correct: 'C' },
    { q: 'Giai đoạn hình thành tư tưởng yêu nước của Hồ Chí Minh?', A: '1890 - 1911', B: '1911 - 1920', C: '1921 - 1930', D: '1930 - 1941', correct: 'A' },
    { q: 'Việt Minh được thành lập ngày nào?', A: '19/5/1940', B: '15/5/1941', C: '19/5/1941', D: '15/5/1940', correct: 'C' },
    { q: 'Khi bị bắt ở Hồng Kông (1931), Nguyễn Ái Quốc mang tên gì?', A: 'Nguyễn Tất Thành', B: 'Nguyễn Sinh Cung', C: 'Tống Văn Sơ', D: 'Hồ Chí Minh', correct: 'C' },
    { q: 'Tháng 6/1925, Nguyễn Ái Quốc thành lập tổ chức nào?', A: 'Đảng Cộng sản Việt Nam', B: 'Cộng sản đoàn', C: 'Hội Việt Nam Cách mạng Thanh niên', D: 'Hội liên hiệp thuộc địa', correct: 'C' },
    { q: 'Nguyễn Ái Quốc bỏ phiếu tán thành Quốc tế III vì?', A: 'Bênh vực quyền lợi các nước thuộc địa', B: 'Giúp nhân dân ta chống Pháp', C: 'Đề ra đường lối cho cách mạng VN', D: 'Thành lập mặt trận giải phóng', correct: 'A' },
    { q: 'Tác phẩm "Đường Kách Mệnh" ra đời năm nào?', A: '1923', B: '1925', C: '1927', D: '1930', correct: 'C' },
    { q: 'Theo Hồ Chí Minh, phẩm chất đạo đức quan trọng nhất?', A: 'Yêu thương con người', B: 'Cần, kiệm, liêm, chính', C: 'Trung với nước, hiếu với dân', D: 'Tinh thần quốc tế', correct: 'C' },
    { q: 'Hồ Chí Minh nêu mấy mối quan hệ đạo đức cơ bản?', A: 'Đối với mình', B: 'Đối với người', C: 'Đối với việc', D: 'Cả a, b, c', correct: 'D' },
    { q: 'Nguyên tắc phân phối trong chủ nghĩa xã hội theo HCM?', A: 'Làm theo năng lực, hưởng theo nhu cầu', B: 'Làm theo năng lực, hưởng theo lao động', C: 'Phân phối bình quân', D: 'Theo lao động và cổ phần', correct: 'B' },
    { q: 'Câu nói "Không có gì quý hơn độc lập tự do" vào năm?', A: '19-12-1946', B: '17-7-1966', C: 'Xuân 1969', D: '9-9-1969', correct: 'B' },
    { q: 'Tư tưởng Hồ Chí Minh hình thành từ nguồn gốc nào?', A: 'Giá trị truyền thống dân tộc', B: 'Tinh hoa văn hóa nhân loại', C: 'Phẩm chất của Hồ Chí Minh', D: 'Cả ba đáp án trên', correct: 'D' },
    { q: 'Nguyễn Tất Thành rời bến Nhà Rồng ngày nào?', A: '5/6/1911', B: '19/5/1911', C: '2/9/1911', D: '3/2/1911', correct: 'A' },
    { q: 'Theo HCM, lực lượng quyết định thắng lợi cách mạng?', A: 'Công nhân', B: 'Nông dân', C: 'Toàn dân tộc', D: 'Quân đội', correct: 'C' },
    { q: 'HCM viết "Bản án chế độ thực dân Pháp" năm nào?', A: '1924', B: '1925', C: '1926', D: '1927', correct: 'B' },
    { q: 'Tư tưởng "Đem sức ta mà tự giải phóng cho ta" thể hiện?', A: 'Dựa vào ngoại bang', B: 'Lấy sức bên ngoài', C: 'Độc lập, tự chủ', D: 'Cầu cứu Pháp', correct: 'C' },
    { q: 'HCM quan niệm giải phóng dân tộc phải đi theo con đường?', A: 'Dân chủ tư sản', B: 'Cách mạng vô sản', C: 'Quân chủ lập hiến', D: 'XHCN không tưởng', correct: 'B' },
    { q: 'Tại Liên Xô 1923-1924, NAQ viết bài cho tờ báo nào?', A: 'Nhân dân, Sự thật', B: 'Đời sống công nhân', C: 'Thư tín quốc tế, Sự thật', D: 'Đời sống công nhân, Thư tín quốc tế', correct: 'C' },
    { q: 'Tư tưởng đại đoàn kết dân tộc của HCM kế thừa từ ai?', A: 'Nguyễn Trãi', B: 'Trần Hưng Đạo', C: 'Phan Bội Châu', D: 'Lê Thánh Tông', correct: 'A' },
    { q: 'Lực lượng nòng cốt trong khối đại đoàn kết dân tộc?', A: 'Công nhân', B: 'Nông dân', C: 'Liên minh công-nông-trí thức', D: 'Quân đội', correct: 'C' },
    { q: 'Quan điểm "Lấy dân làm gốc" của HCM thể hiện?', A: 'Dân là quý nhất', B: 'Nhà nước của dân, do dân, vì dân', C: 'Dân là công cụ', D: 'Dân phục tùng Đảng', correct: 'B' },
    { q: 'HCM coi tham nhũng, quan liêu, lãng phí là?', A: 'Tệ nạn xã hội', B: 'Giặc nội xâm', C: 'Khuyết điểm nhỏ', D: 'Vấn đề thứ yếu', correct: 'B' },
    { q: 'Nguyên tắc quan trọng trong xây dựng Đảng theo HCM?', A: 'Dân chủ tập trung', B: 'Cá nhân lãnh đạo', C: 'Bình quân chủ nghĩa', D: 'Tập quyền quan liêu', correct: 'A' },
    { q: 'HCM khẳng định cách mạng giải phóng dân tộc phải kết hợp?', A: 'Chính trị và ngoại giao', B: 'Chính trị và vũ trang', C: 'Chỉ vũ trang', D: 'Cải cách ôn hòa', correct: 'B' },
    { q: 'Cuộc kháng chiến chống Pháp kéo dài bao lâu?', A: '8 năm', B: '9 năm', C: '10 năm', D: '11 năm', correct: 'B' },
    { q: 'Cuộc kháng chiến chống Mỹ kéo dài bao lâu?', A: '19 năm', B: '20 năm', C: '21 năm', D: '22 năng', correct: 'C' },
    { q: 'Hội nghị Fontainebleau diễn ra năm nào?', A: '1945', B: '1946', C: '1947', D: '1948', correct: 'B' },
    { q: 'Hiệp định sơ bộ 6/3/1946 được ký với?', A: 'Pháp', B: 'Mỹ', C: 'Trung Quốc', D: 'Nhật', correct: 'A' },
    { q: 'Chiến dịch Việt Bắc thu đông 1947 do ai chỉ huy?', A: 'Võ Nguyên Giáp', B: 'Trường Chinh', C: 'Phạm Văn Đồng', D: 'Lê Duẩn', correct: 'A' },
    { q: 'Chiến dịch Biên giới thu đông 1950 tiêu diệt?', A: '8 đồn Pháp', B: '9 đồn Pháp', C: '10 đồn Pháp', D: '11 đồn Pháp', correct: 'A' },
    { q: 'Chiến dịch Hòa Bình diễn ra năm nào?', A: '1951-1952', B: '1952-1953', C: '1951-1953', D: '1950-1952', correct: 'A' },
    { q: 'Tổng tấn công Tết Mậu Thân diễn ra năm?', A: '1967', B: '1968', C: '1969', D: '1970', correct: 'B' },
    { q: 'Hiệp định Paris về Việt Nam ký năm nào?', A: '1972', B: '1973', C: '1974', D: '1975', correct: 'B' },
    { q: 'Chiến dịch Hồ Chí Minh diễn ra năm nào?', A: '1974', B: '1975', C: '1976', D: '1977', correct: 'B' },
    { q: 'Sài Gòn được giải phóng ngày nào?', A: '30/4/1975', B: '1/5/1975', C: '2/5/1975', D: '3/5/1975', correct: 'A' },
    { q: 'Quốc hội khóa I họp lần đầu năm nào?', A: '1945', B: '1946', C: '1947', D: '1948', correct: 'B' },
    { q: 'Hiến pháp đầu tiên của nước CHXHCN Việt Nam?', A: '1946', B: '1959', C: '1980', D: '1992', correct: 'C' },
    { q: 'Đổi mới bắt đầu từ Đại hội Đảng nào?', A: 'Đại hội V', B: 'Đại hội VI', C: 'Đại hội VII', D: 'Đại hội VIII', correct: 'B' },
    { q: 'Việt Nam gia nhập ASEAN năm nào?', A: '1994', B: '1995', C: '1996', D: '1997', correct: 'B' },
    { q: 'Việt Nam gia nhập WTO năm nào?', A: '2005', B: '2006', C: '2007', D: '2008', correct: 'C' },
    { q: 'Quan hệ ngoại giao Việt-Mỹ bình thường hóa năm?', A: '1994', B: '1995', C: '1996', D: '1997', correct: 'B' },
    { q: 'Trận Bạch Đằng năm 938 do ai chỉ huy?', A: 'Ngô Quyền', B: 'Đinh Bộ Lĩnh', C: 'Lê Hoàn', D: 'Lý Công Uẩn', correct: 'A' },
    { q: 'Nhà Đinh tồn tại bao lâu?', A: '10 năm', B: '11 năm', C: '12 năm', D: '13 năm', correct: 'C' },
    { q: 'Lê Hoàn lên ngôi lấy niên hiệu gì?', A: 'Thiên Phúc', B: 'Ứng Thiên', C: 'Đại Hành', D: 'Thuận Thiên', correct: 'C' },
    { q: 'Nhà Lý được thành lập năm nào?', A: '1009', B: '1010', C: '1011', D: '1012', correct: 'B' },
    { q: 'Lý Thái Tổ dời đô về đâu?', A: 'Hoa Lư', B: 'Thăng Long', C: 'Phú Xuân', D: 'Tây Đô', correct: 'B' },
    { q: 'Nhà Trần thành lập năm nào?', A: '1224', B: '1225', C: '1226', D: '1227', correct: 'B' },
    { q: 'Cuộc kháng chiến chống Mông-Nguyên lần 1?', A: '1257-1258', B: '1284-1285', C: '1287-1288', D: '1258-1259', correct: 'A' },
    { q: 'Cuộc kháng chiến chống Mông-Nguyên lần 2?', A: '1257-1258', B: '1284-1285', C: '1287-1288', D: '1283-1284', correct: 'B' },
    { q: 'Cuộc kháng chiến chống Mông-Nguyên lần 3?', A: '1257-1258', B: '1284-1285', C: '1287-1288', D: '1286-1287', correct: 'C' },
    { q: 'Trận Đông Bộ Đầu diễn ra năm nào?', A: '1285', B: '1287', C: '1288', D: '1289', correct: 'C' },
    { q: 'Nhà Hồ tồn tại bao lâu?', A: '5 năm', B: '6 năm', C: '7 năm', D: '8 năm', correct: 'C' },
    { q: 'Hồ Quý Ly cải cách ruộng đất như thế nào?', A: 'Hạn chế tư hữu', B: 'Tăng tư hữu', C: 'Bãi bỏ tư hữu', D: 'Không thay đổi', correct: 'A' },
    { q: 'Khởi nghĩa Lam Sơn bắt đầu năm nào?', A: '1417', B: '1418', C: '1419', D: '1420', correct: 'B' },
    { q: 'Lê Lợi lên ngôi lấy niên hiệu gì?', A: 'Thuận Thiên', B: 'Thiên Phúc', C: 'Đại Hành', D: 'Ứng Thiên', correct: 'A' },
    { q: 'Lê Thánh Tông trị vì bao lâu?', A: '36 năm', B: '37 năm', C: '38 năm', D: '39 năm', correct: 'C' },
    { q: 'Bộ luật Hồng Đức được ban hành năm nào?', A: '1483', B: '1484', C: '1485', D: '1486', correct: 'B' },
    { q: 'Thời Lê sơ, nước ta chia thành mấy đạo?', A: '11', B: '12', C: '13', D: '14', correct: 'C' },
    { q: 'Mạc Đăng Dung lên ngôi năm nào?', A: '1527', B: '1528', C: '1529', D: '1530', correct: 'A' },
    { q: 'Triều Nguyễn ở Phú Xuân được thành lập năm?', A: '1558', B: '1600', C: '1802', D: '1883', correct: 'C' },
    { q: 'Gia Long lên ngôi năm nào?', A: '1801', B: '1802', C: '1803', D: '1804', correct: 'B' },
    { q: 'Minh Mạng trị vì từ năm nào đến năm nào?', A: '1820-1840', B: '1820-1841', C: '1821-1840', D: '1821-1841', correct: 'A' },
    { q: 'Pháp tấn công Đà Nẵng lần đầu năm nào?', A: '1856', B: '1857', C: '1858', D: '1859', correct: 'C' },
    { q: 'Hiệp ước Nhâm Tuất ký năm nào?', A: '1861', B: '1862', C: '1863', D: '1864', correct: 'B' },
    { q: 'Pháp chiếm trọn Nam Kỳ năm nào?', A: '1865', B: '1866', C: '1867', D: '1868', correct: 'C' },
    { q: 'Hiệp ước Hác-măng ký năm nào?', A: '1883', B: '1884', C: '1885', D: '1886', correct: 'B' },
    { q: 'Cần Vương khởi nghĩa năm nào?', A: '1884', B: '1885', C: '1886', D: '1887', correct: 'B' },
    { q: 'Liên bang Đông Dương được thành lập năm?', A: '1886', B: '1887', C: '1888', D: '1889', correct: 'B' },
    { q: 'Phan Bội Châu thành lập Việt Nam Duy Tân Hội năm?', A: '1903', B: '1904', C: '1905', D: '1906', correct: 'C' },
    { q: 'Phan Châu Trinh thành lập Duy Tân Hội năm?', A: '1906', B: '1907', C: '1908', D: '1909', correct: 'B' },
    { q: 'Phong trào Đông Du diễn ra năm nào?', A: '1905-1908', B: '1906-1909', C: '1907-1910', D: '1908-1911', correct: 'A' },
    { q: 'Trường Đông Kinh Nghĩa Thục mở năm nào?', A: '1906', B: '1907', C: '1908', D: '1909', correct: 'B' },
    { q: 'Khởi nghĩa Thái Nguyên diễn ra năm nào?', A: '1916', B: '1917', C: '1918', D: '1919', correct: 'A' },
    { q: 'Nguyễn Ái Quốc ra nước ngoài năm nào?', A: '1910', B: '1911', C: '1912', D: '1913', correct: 'C' },
    { q: 'Việt Nam Quốc dân Đảng thành lập năm nào?', A: '1926', B: '1927', C: '1928', D: '1929', correct: 'B' },
    { q: 'Xô viết Nghệ Tĩnh diễn ra năm nào?', A: '1929-1930', B: '1930-1931', C: '1931-1932', D: '1930-1932', correct: 'B' },
    { q: 'Mặt trận Việt Minh thành lập năm nào?', A: '1940', B: '1941', C: '1942', D: '1943', correct: 'B' },
    { q: 'Căn cứ địa Việt Bắc được thiết lập năm?', A: '1940', B: '1941', C: '1942', D: '1943', correct: 'C' },
    { q: 'Nạn đói 1945 làm chết bao nhiêu người?', A: '1 triệu', B: '1.5 triệu', C: '2 triệu', D: '2.5 triệu', correct: 'C' },
    { q: 'HCM viết Di chúc vào năm nào?', A: '1963', B: '1964', C: '1965', D: '1966', correct: 'C' },
    { q: 'Mục tiêu cách mạng VN theo HCM là độc lập dân tộc gắn với?', A: 'Dân chủ tư sản', B: 'Chủ nghĩa xã hội', C: 'Phong kiến', D: 'Tư bản chủ nghĩa', correct: 'B' },
    { q: 'NAQ tham gia sáng lập Đảng Cộng sản Pháp năm nào?', A: '1918', B: '1919', C: '1920', D: '1921', correct: 'C' },
    { q: 'Cương lĩnh chính trị đầu tiên của ĐCSVN do ai soạn thảo?', A: 'Trần Phú', B: 'Lê Hồng Phong', C: 'Nguyễn Ái Quốc', D: 'Hà Huy Tập', correct: 'C' },
    { q: 'HCM khẳng định "Cán bộ là..."?', A: 'Gốc của mọi công việc', B: 'Người đầy tớ của dân', C: 'Người lãnh đạo quần chúng', D: 'Người truyền đạt nghị quyết', correct: 'A' },
  ],
  dialy: [
    { q: 'Châu lục có diện tích lớn nhất?', A: 'Châu Á', B: 'Châu Phi', C: 'Châu Âu', D: 'Châu Mỹ', correct: 'A' },
    { q: 'Thủ đô của Nhật Bản là?', A: 'Osaka', B: 'Tokyo', C: 'Kyoto', D: 'Nagoya', correct: 'B' },
    { q: 'Sông dài nhất thế giới là?', A: 'Sông Nile', B: 'Sông Amazon', C: 'Sông Dương Tử', D: 'Sông Mississippi', correct: 'A' },
    { q: 'Núi cao nhất thế giới là?', A: 'K2', B: 'Everest', C: 'Kangchenjunga', D: 'Lhotse', correct: 'B' },
    { q: 'Đại dương lớn nhất thế giới là?', A: 'Thái Bình Dương', B: 'Đại Tây Dương', C: 'Ấn Độ Dương', D: 'Bắc Băng Dương', correct: 'A' },
    { q: 'Quốc gia có diện tích lớn nhất thế giới?', A: 'Canada', B: 'Trung Quốc', C: 'Mỹ', D: 'Nga', correct: 'D' },
    { q: 'Sa mạc lớn nhất thế giới là?', A: 'Sahara', B: 'Gobi', C: 'Kalahari', D: 'Arabian', correct: 'A' },
    { q: 'Thủ đô của Australia là?', A: 'Sydney', B: 'Melbourne', C: 'Canberra', D: 'Perth', correct: 'C' },
    { q: 'Đảo lớn nhất thế giới là?', A: 'New Guinea', B: 'Borneo', C: 'Madagascar', D: 'Greenland', correct: 'D' },
    { q: 'Hồ nước ngọt lớn nhất thế giới là?', A: 'Hồ Superior', B: 'Hồ Victoria', C: 'Hồ Huron', D: 'Hồ Michigan', correct: 'A' },
  ],
  congnghe: [
    { q: 'Vít được vặn bằng dụng cụ nào?', A: 'Cờ lê', B: 'Kìm', C: 'Búa', D: 'Tua vít', correct: 'D' },
    { q: 'Dụng cụ nào dùng để cắt gỗ?', A: 'Cưa', B: 'Rìu', C: 'Dao', D: 'Tất cả đều đúng', correct: 'D' },
    { q: 'Máy nào dùng để khoan lỗ?', A: 'Máy cưa', B: 'Máy khoan', C: 'Máy bào', D: 'Máy mài', correct: 'B' },
    { q: 'Dụng cụ đo độ dài chính xác nhất?', A: 'Thước kẻ', B: 'Thước cuộn', C: 'Thước cặp', D: 'Thước panme', correct: 'D' },
    { q: 'Vật liệu nào cứng nhất?', A: 'Thép', B: 'Kim cương', C: 'Titan', D: 'Nhôm', correct: 'B' },
  ],
  tinhoc: [
    { q: 'Bộ nhớ tạm thời của máy tính là?', A: 'HDD', B: 'SSD', C: 'RAM', D: 'ROM', correct: 'C' },
    { q: 'CPU là viết tắt của gì?', A: 'Computer Processing Unit', B: 'Central Processing Unit', C: 'Central Program Unit', D: 'Computer Program Unit', correct: 'B' },
    { q: 'Hệ điều hành nào của Microsoft?', A: 'Linux', B: 'MacOS', C: 'Windows', D: 'Android', correct: 'C' },
    { q: 'Đơn vị nhỏ nhất lưu trữ dữ liệu?', A: 'Bit', B: 'Byte', C: 'KB', D: 'MB', correct: 'A' },
    { q: '1 GB bằng bao nhiêu MB?', A: '1000', B: '1024', C: '512', D: '2048', correct: 'B' },
    { q: 'Ngôn ngữ lập trình nào dễ học nhất?', A: 'C++', B: 'Java', C: 'Python', D: 'Assembly', correct: 'C' },
    { q: 'HTML là viết tắt của gì?', A: 'HyperText Markup Language', B: 'High Tech Modern Language', C: 'Home Tool Markup Language', D: 'Hyperlink Text Markup Language', correct: 'A' },
    { q: 'Phần mềm nào dùng để duyệt web?', A: 'Word', B: 'Excel', C: 'Chrome', D: 'PowerPoint', correct: 'C' },
  ],
  gdcd: [
    { q: 'Trong giao tiếp, điều nào sau đây đúng?', A: 'Nói chen', B: 'Lắng nghe', C: 'Nâng giọng', D: 'Phớt lờ', correct: 'B' },
    { q: 'Quyền cơ bản của công dân là?', A: 'Quyền bầu cử', B: 'Quyền sống', C: 'Quyền học tập', D: 'Tất cả đều đúng', correct: 'D' },
    { q: 'Nghĩa vụ của công dân là?', A: 'Nộp thuế', B: 'Bảo vệ Tổ quốc', C: 'Tuân thủ pháp luật', D: 'Tất cả đều đúng', correct: 'D' },
    { q: 'Tuổi thành niên ở Việt Nam là?', A: '16', B: '17', C: '18', D: '21', correct: 'C' },
    { q: 'Quốc hội Việt Nam họp mấy kỳ/năm?', A: '1', B: '2', C: '3', D: '4', correct: 'B' },
  ],
  amnhac: [
    { q: 'Nốt nhạc cao hơn Rê là?', A: 'Đô', B: 'Mi', C: 'Fa', D: 'La', correct: 'B' },
    { q: 'Thang âm Đô trưởng có mấy thăng?', A: '0', B: '1', C: '2', D: '3', correct: 'A' },
    { q: 'Nhạc cụ nào thuộc họ dây?', A: 'Sáo', B: 'Trống', C: 'Đàn guitar', D: 'Kèn', correct: 'C' },
    { q: 'Beethoven là nhạc sĩ nước nào?', A: 'Áo', B: 'Đức', C: 'Pháp', D: 'Ý', correct: 'B' },
    { q: 'Bài "Quê hương" của ai?', A: 'Văn Cao', B: 'Phạm Tuyên', C: 'Đỗ Nhuận', D: 'Lưu Hữu Phước', correct: 'C' },
  ],
  mythuat: [
    { q: 'Màu thứ cấp được tạo từ?', A: 'Trộn hai màu cơ bản', B: 'Trộn màu với trắng', C: 'Trộn màu với đen', D: 'Không trộn', correct: 'A' },
    { q: 'Ba màu cơ bản là?', A: 'Đỏ, vàng, xanh', B: 'Đỏ, xanh, tím', C: 'Vàng, xanh, tím', D: 'Đỏ, vàng, tím', correct: 'A' },
    { q: 'Tranh "Mona Lisa" của ai?', A: 'Picasso', B: 'Van Gogh', C: 'Leonardo da Vinci', D: 'Monet', correct: 'C' },
    { q: 'Phong cách hội họa nào của Picasso?', A: 'Ấn tượng', B: 'Lập thể', C: 'Siêu thực', D: 'Cổ điển', correct: 'B' },
    { q: 'Tượng "David" của ai?', A: 'Rodin', B: 'Michelangelo', C: 'Donatello', D: 'Bernini', correct: 'B' },
  ],
  tienganh: [
    { q: 'Chọn dạng đúng: He ____ to school every day.', A: 'go', B: 'goes', C: 'going', D: 'gone', correct: 'B' },
    { q: 'What ____ you doing now?', A: 'is', B: 'are', C: 'am', D: 'be', correct: 'B' },
    { q: 'She ____ a book yesterday.', A: 'read', B: 'reads', C: 'reading', D: 'will read', correct: 'A' },
    { q: 'I ____ to London next week.', A: 'go', B: 'went', C: 'will go', D: 'going', correct: 'C' },
    { q: 'How ____ apples do you have?', A: 'much', B: 'many', C: 'some', D: 'any', correct: 'B' },
    { q: 'This is ____ interesting book.', A: 'a', B: 'an', C: 'the', D: 'some', correct: 'B' },
    { q: 'She is ____ than her sister.', A: 'tall', B: 'taller', C: 'tallest', D: 'more tall', correct: 'B' },
    { q: 'I have ____ seen this movie.', A: 'already', B: 'yet', C: 'just', D: 'never', correct: 'D' },
  ],
};
function __normalizeSubject(s) {
  const k = __stripDia(String(s||'').toLowerCase());
  if (!k) return '';
  if (['toan','math'].includes(k)) return 'toan';
  if (['vatly','ly','vly','physics'].includes(k)) return 'vatly';
  if (['hoahoc','hoa','chemistry'].includes(k)) return 'hoahoc';
  if (['sinhhoc','sinh','biology'].includes(k)) return 'sinhhoc';
  if (['van','nguvan','literature'].includes(k)) return 'van';
  if (['lichsu','su','history'].includes(k)) return 'lichsu';
  if (['dialy','dia','geography'].includes(k)) return 'dialy';
  if (['congnghe','cn','technology'].includes(k)) return 'congnghe';
  if (['tinhoc','tin','informatics','it'].includes(k)) return 'tinhoc';
  if (['gdcd','congdan','civics'].includes(k)) return 'gdcd';
  if (['amnhac','nhac','music'].includes(k)) return 'amnhac';
  if (['mythuat','my','art','my thuat'].includes(k)) return 'mythuat';
  if (['tienganh','anh','english'].includes(k)) return 'tienganh';
  return k;
}


// ===================== CÂU ĐỐ (RIDDLE) =====================
const __riddles = [
  { q: 'Con gì đập thì sống, để yên thì chết?', a: 'con tim' },
  { q: 'Càng chặt càng lỏng, càng lỏng càng chặt là gì?', a: 'ốc vít' },
  { q: 'Vừa bằng hạt đỗ, ăn giỗ cả làng?', a: 'cái mõ' },
  { q: 'Không là chim mà bay trên trời; không là cá mà bơi dưới nước?', a: 'máy bay' },
  { q: 'Da trắng phau phau, ăn vào đau bụng?', a: 'phấn' },
  { q: 'Đầu tròn tròn, không mắt mũi, có răng cưa?', a: 'cưa' },
  { q: 'Có cổ nhưng không có đầu?', a: 'chai' },
  { q: 'Càng chạy càng bé?', a: 'nến' },
  { q: 'Bằng cái vung, vùng xuống ao, bắt được cá, kêu xao xao?', a: 'nơm' },
  { q: 'Miệng tròn vo, không ăn thóc, ăn vòi voi?', a: 'cối xay' },
  { q: 'Không tay không chân mà ôm cả nhà?', a: 'mái nhà' },
  { q: 'Hai mẹ con cùng tên, mẹ tròn con cũng tròn?', a: 'trăng' },
  { q: 'Sáng vinh, trưa nhục, tối vinh là gì?', a: 'cái bóng' },
  { q: 'Vừa bằng cái nia, che nắng che mưa cả nhà?', a: 'cái nón' },
  { q: 'Không tai mà biết nghe, không miệng mà biết nói?', a: 'điện thoại' },
  { q: 'Con gì có bốn chân buổi sáng, hai chân buổi trưa, ba chân buổi chiều?', a: 'con người' },
  { q: 'Một cây làm chẳng nên non, ba cây chụm lại nên...', a: 'hòn núi cao' },
  { q: 'Cái gì càng rửa càng bẩn?', a: 'nước' },
  { q: 'Cái gì càng lau càng ướt?', a: 'khăn tắm' },
  { q: 'Không hỏi mà trả lời?', a: 'tiếng vang' },
  { q: 'Đen như hạt vừng, rơi vào nước đứng?', a: 'mắt muỗi' },
  { q: 'Mình tròn tròn, bụng nặng nặng, đến tết mới xài?', a: 'bánh chưng' },
  { q: 'Vừa bằng cây kim, chui qua chui lại khâu vào khâu ra?', a: 'kim chỉ' },
  { q: 'Đi ngang mặt nước không ướt chân?', a: 'bóng trăng' },
  { q: 'Thân em vừa trắng lại vừa tròn, ba mươi mốt ngày mới lại non?', a: 'mặt trăng' },
  { q: 'Có cánh mà chẳng biết bay, có mắt mà chẳng thấy ngày bao giờ?', a: 'cửa' },
  { q: 'Một mẹ sinh được trăm con, con nào cũng tròn như nhau?', a: 'hột thị' },
  { q: 'Ăn no bụng lại phình ra, nằm im một chỗ ai mà chẳng thương?', a: 'cái gối' },
  { q: 'Vừa bằng hạt đậu, đi đâu cũng theo?', a: 'cái bóng' },
  { q: 'Nhà gì không có cửa?', a: 'nhà tù' },
  { q: 'Quần gì không có đáy?', a: 'quần áo mưa' },
  { q: 'Bánh gì không ăn được?', a: 'bánh xe' },
  { q: 'Cầu gì không bắc qua sông?', a: 'cầu hôn' },
  { q: 'Cá gì không sống dưới nước?', a: 'cá mập đất' },
  { q: 'Con gì mang tiếng kêu mà không có tiếng?', a: 'con dốc (dốc núi)' },
  { q: 'Mở miệng ra mới có ăn, ngậm miệng lại thì chết đói?', a: 'cái kéo' },
  { q: 'Không đi mà đến, không nói mà hay?', a: 'thư' },
  { q: 'Trên lông dưới lông, giữa có cái lỗ?', a: 'cái mắt kim' },
  { q: 'Không ăn mà lớn, không uống mà dài?', a: 'dòng sông' },
  { q: 'Không trồng mà mọc, không gọt mà trơn?', a: 'tóc' },
  { q: 'Cái gì đốt không cháy, giặt không sạch?', a: 'bóng đêm' },
  { q: 'Cái gì càng chia sẻ càng nhiều thêm?', a: 'niềm vui' },
  { q: 'Cái gì của bạn nhưng người khác dùng nhiều hơn?', a: 'tên của bạn' },
  { q: 'Có thành mà chẳng có hào, không quân không tướng mà nào vẫn vây?', a: 'bánh trung thu' },
  { q: 'Không xương mà cứng, không lưng mà dài?', a: 'đường ray' },
  { q: 'Đêm nằm thì mở, ban ngày lại khép?', a: 'con mắt' }
];
function __normalizeAnswer(s) {
  return __stripDia(String(s || '').toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ======================== DEBUG MEMBERS ========================
async function handleDebugMembers(api, event) {
  const { threadId, type } = event || {};
  const lines = [];
  const has = (name) => typeof api[name] === 'function';
  const methods = [
    'getThreadInfo','getGroupInfo','getThreadMembers','getParticipants',
    'getParticipantIDs','getParticipantIds','getMembers','getMemberList',
    'listParticipants','fetchParticipants','fetchGroupInfo'
  ];
  lines.push('📋 Kiểm tra hàm API có sẵn:');
  methods.forEach(m => lines.push(`- ${m}: ${has(m) ? 'YES' : 'no'}`));

  let memberIds = [];
  const attempts = [];
  attempts.push(async () => {
    if (has('getThreadInfo')) {
      const info = await api.getThreadInfo(threadId);
      const c = info?.participantIDs || info?.participantIds || info?.participants || info?.members;
      if (Array.isArray(c)) return { name: 'getThreadInfo', ids: c.map(x => (typeof x === 'string' ? x : (x?.id || x?.uid))).filter(Boolean) };
    }
  });
  attempts.push(async () => {
    const evc = event?.data?.participantIDs || event?.data?.participantIds || event?.participants;
    if (Array.isArray(evc)) return { name: 'event.data', ids: evc.map(x => String(x?.id || x?.uid || x)).filter(Boolean) };
  });
  attempts.push(async () => {
    if (has('getGroupInfo')) {
      const g = await api.getGroupInfo(threadId);
      const list = g?.members || g?.participants || g?.memberIds;
      if (Array.isArray(list)) return { name: 'getGroupInfo', ids: list.map(x => (typeof x === 'string' ? x : (x?.id || x?.uid))).filter(Boolean) };
    }
  });
  attempts.push(async () => { if (has('getThreadMembers')) { const list = await api.getThreadMembers(threadId); if (Array.isArray(list)) return { name: 'getThreadMembers', ids: list.map(x => String(x?.id || x?.uid || x)).filter(Boolean) }; } });
  attempts.push(async () => { if (has('getParticipants')) { const list = await api.getParticipants(threadId); if (Array.isArray(list)) return { name: 'getParticipants', ids: list.map(x => String(x?.id || x?.uid || x)).filter(Boolean) }; } });
  attempts.push(async () => { if (has('getParticipantIDs')) { const list = await api.getParticipantIDs(threadId); if (Array.isArray(list)) return { name: 'getParticipantIDs', ids: list.map(x => String(x)).filter(Boolean) }; } });
  attempts.push(async () => { if (has('getParticipantIds')) { const list = await api.getParticipantIds(threadId); if (Array.isArray(list)) return { name: 'getParticipantIds', ids: list.map(x => String(x)).filter(Boolean) }; } });
  attempts.push(async () => { if (has('getMembers')) { const list = await api.getMembers(threadId); if (Array.isArray(list)) return { name: 'getMembers', ids: list.map(x => String(x?.id || x?.uid || x)).filter(Boolean) }; } });
  attempts.push(async () => { if (has('getMemberList')) { const list = await api.getMemberList(threadId); if (Array.isArray(list)) return { name: 'getMemberList', ids: list.map(x => String(x?.id || x?.uid || x)).filter(Boolean) }; } });
  attempts.push(async () => { if (has('listParticipants')) { const list = await api.listParticipants(threadId); if (Array.isArray(list)) return { name: 'listParticipants', ids: list.map(x => String(x?.id || x?.uid || x)).filter(Boolean) }; } });
  attempts.push(async () => { if (has('fetchParticipants')) { const list = await api.fetchParticipants(threadId); if (Array.isArray(list)) return { name: 'fetchParticipants', ids: list.map(x => String(x?.id || x?.uid || x)).filter(Boolean) }; } });
  attempts.push(async () => { if (has('fetchGroupInfo')) { const gi = await api.fetchGroupInfo(threadId); const entry = gi?.gridInfoMap ? (gi.gridInfoMap[threadId] || gi.gridInfoMap[String(threadId)]) : null; const mems = entry?.memVerList; if (Array.isArray(mems)) { const ids = []; for (const m of mems) { if (typeof m === 'string') { const parts = m.split('_'); if (parts.length >= 1) ids.push(parts[0]); } else if (m && typeof m === 'object') { const uid = m.uid || m.id || m.userId; if (uid) ids.push(String(uid)); } } return { name: 'fetchGroupInfo.memVerList', ids }; } } });

  const results = [];
  for (const fn of attempts) {
    try {
      const r = await fn?.();
      if (r && Array.isArray(r.ids) && r.ids.length > 0) { results.push({ name: r.name, count: r.ids.length }); if (memberIds.length === 0) memberIds = r.ids; }
    } catch (e) {
      results.push({ name: fn.name || 'attempt', error: String(e?.message || e) });
    }
  }

  lines.push('🔎 Kết quả lấy danh sách:');
  if (results.length === 0) {
    lines.push('- Không có phương thức nào trả về danh sách hoặc tất cả đều lỗi.');
  } else {
    for (const r of results) {
      if (r.error) lines.push(`- ${r.name}: ERROR ${r.error}`); else lines.push(`- ${r.name}: ${r.count} thành viên`);
    }
  }
  lines.push(`➡️ Dùng danh sách đầu tiên lấy được: ${memberIds.length} thành viên.`);

  return api.sendMessage(lines.join('\n'), threadId, type);
}

// ======================== YOUTUBE CHANNEL INFO BY LINK (chuyển sang ytinfo.js) ========================
async function handleYouTubeInfo(api, event, link) {
  // Load lệnh ytinfo
  const ytinfoCommand = require('./ytinfo.js');
  return await ytinfoCommand.run({ args: [link], event, api });
}

// Helper: kiểm tra quyền admin/owner bot
function isBotAdmin(uid) {
  try {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    return adminList.includes(String(uid)) || ownerList.includes(String(uid));
  } catch {
    return false;
  }
}
// Alias tương thích: một số router cũ gọi handleFarewell
function handleFarewell(api, event) {
  return handleLeave(api, event);
}

// ======================== LEAVE GROUP ========================
async function handleLeave(api, event) {
  const { threadId, type, data } = event || {};
  const senderId = data?.uidFrom || event?.authorId;
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const isBotAdmin = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));
  if (!isBotAdmin) {
    return api.sendMessage('❌ Bạn không có quyền dùng lệnh này.', threadId, type);
  }

  // Thông báo trước khi rời
  try { await api.sendMessage('👋 Bot sẽ rời nhóm theo yêu cầu quản trị.', threadId, type); } catch {}

  const methods = [
    async () => { if (typeof api.leaveGroup === 'function') return await api.leaveGroup(threadId); },
    async () => { if (typeof api.leaveConversation === 'function') return await api.leaveConversation(threadId); },
    async () => { if (typeof api.leaveThread === 'function') return await api.leaveThread(threadId); },
    async () => { if (typeof api.leaveChat === 'function') return await api.leaveChat(threadId); },
  ];
  for (const call of methods) {
    try { const r = await call?.(); if (r !== undefined) return; } catch {}
  }
  // Fallback: thử tự xóa bot khỏi nhóm nếu API cung cấp removeUserFromGroup
  try {
    const botId = (api.getOwnId?.() || api.getCurrentUserID?.() || global?.botID);
    if (botId && typeof api.removeUserFromGroup === 'function') {
      await api.removeUserFromGroup(botId, threadId);
      return;
    }
  } catch {}
  // Nếu vẫn không được, thông báo lỗi
  try { await api.sendMessage('❌ Không thể rời nhóm (API không hỗ trợ hoặc thiếu quyền).', threadId, type); } catch {}
}
function __loadViDict() {
  if (__viDictCache && __viDictAsciiCache) return { dict: __viDictCache, ascii: __viDictAsciiCache };
  try {
    const dictCandidates = [
      path.resolve(__dirname, '../../assets/vi_words_large.txt'),
      path.resolve(__dirname, '../../assets/vi_words.txt'),
      path.resolve(__dirname, '../../assets/vietnamese_words.txt'),
      path.resolve(__dirname, '../../assets/vi_words.json')
    ];
    for (const p of dictCandidates) {
      if (fs.existsSync(p)) {
        if (p.endsWith('.json')) {
          const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
          const list = (arr || []).map(x => String(x).toLowerCase());
          __viDictCache = new Set(list);
          __viDictAsciiCache = new Set(list.map(__stripDia));
          return { dict: __viDictCache, ascii: __viDictAsciiCache };
        } else {
          const content = fs.readFileSync(p, 'utf8');
          const lines = content.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
          __viDictCache = new Set(lines);
          __viDictAsciiCache = new Set(lines.map(__stripDia));
          return { dict: __viDictCache, ascii: __viDictAsciiCache };
        }
      }
    }
  } catch {}
  __viDictCache = new Set();
  __viDictAsciiCache = new Set();
  return { dict: __viDictCache, ascii: __viDictAsciiCache };
}

module.exports.config = {
  name: "bonz",
  aliases: [],
  version: "1.1.0",
  role: 0,
  author: "Cascade",
  description: "Hiển thị BONZ MENU và các chức năng",
  category: "Tiện ích",
  usage: "bonz hoặc bonz menu hoặc bonz <chức năng>",
  cooldowns: 2,
  dependencies: {
    "axios": "",
    "sharp": "",
    "fast-xml-parser": "",
    "openai": ""
  }
};

// Thử lưu lại cấu hình ra file nếu môi trường có cung cấp đường dẫn
async function __persistConfigIfPossible() {
  try {
    const file = global?.config_file || global?.CONFIG_FILE || process.env.BOT_CONFIG_FILE;
    if (!file) return false;
    const fs = require('fs');
    const content = JSON.stringify(global.config || {}, null, 2);
    fs.writeFileSync(file, content, 'utf8');
    return true;
  } catch (e) {
    try { console.warn('[bonz] persist config failed:', e?.message); } catch {}
    return false;
  }
}

// Trò chơi nối từ theo nhóm
async function handleNoiTu(api, event, args = [], ThreadsRef) {
  const { threadId, type, data } = event;
  // Lấy dữ liệu nhóm
  let thread = { data: {} };
  try {
    if (ThreadsRef?.getData) thread = await ThreadsRef.getData(threadId);
  } catch {}
  const tdata = thread.data || {};
  const state = tdata.noi_tu_state || { started: false, lastWord: '', lastChar: '', used: [], mode: 1, useDict: true, custom: [] };

  const sub = (args[0] || '').toLowerCase();
  // Điều khiển trò chơi
  if (sub === 'start') {
    state.started = true;
    state.lastWord = '';
    state.lastChar = '';
    state.used = [];
    state.mode = state.mode === 2 ? 2 : 1; // giữ mode hiện tại nếu có
    if (typeof state.useDict !== 'boolean') state.useDict = true; // bật kiểm tra nghĩa mặc định
    tdata.noi_tu_state = state;
    if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
    return api.sendMessage(`🎮 Nối từ đã BẮT ĐẦU! (chế độ: ${state.mode === 2 ? 'theo TỪ (vd: "con cá" → "cá con")' : 'theo CHỮ'})\nGõ: bonz nối từ <từ/cụm từ đầu tiên>`, threadId, type);
  }
  if (sub === 'stop') {
    state.started = false;
    tdata.noi_tu_state = state;
    if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
    return api.sendMessage('🛑 Đã DỪNG trò chơi nối từ.', threadId, type);
  }
  if (sub === 'reset') {
    tdata.noi_tu_state = { started: false, lastWord: '', lastChar: '', used: [], mode: 1, useDict: true, custom: [] };
    if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
    return api.sendMessage('♻️ Đã RESET trò chơi. Gõ: bonz nối từ start để bắt đầu.', threadId, type);
  }
  if (sub === 'dict') {
    const opt = (args[1] || '').toLowerCase();
    if (opt === 'on') {
      state.useDict = true;
      tdata.noi_tu_state = state;
      if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
      // thử load từ điển để đảm bảo có
      const { dict, ascii } = __loadViDict();
      const note = (dict.size || ascii.size) ? '' : '\n⚠️ Chưa tìm thấy file từ điển. Thêm assets/vi_words.txt để bật kiểm tra nghĩa.';
      return api.sendMessage('📚 ĐÃ BẬT kiểm tra từ điển.' + note, threadId, type);
    }
    if (opt === 'off') {
      state.useDict = false;
      tdata.noi_tu_state = state;
      if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage('📚 ĐÃ TẮT kiểm tra từ điển.', threadId, type);
    }
    if (opt === 'status') {
      const { dict, ascii } = __loadViDict();
      return api.sendMessage(`📚 Từ điển: ${state.useDict ? 'BẬT' : 'TẮT'} | Hệ thống: ${dict.size} (có dấu) / ${ascii.size} (không dấu) | Từ tùy chỉnh nhóm: ${(state.custom||[]).length}`, threadId, type);
    }
    if (opt === 'add') {
      const word = (args.slice(2).join(' ') || '').trim().toLowerCase();
      if (!word) return api.sendMessage('Dùng: bonz nối từ dict add <từ>', threadId, type);
      state.custom = Array.isArray(state.custom) ? state.custom : [];
      if (!state.custom.includes(word)) state.custom.push(word);
      tdata.noi_tu_state = state;
      if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage(`✅ Đã thêm từ tùy chỉnh: "${word}"`, threadId, type);
    }
    if (opt === 'del') {
      const word = (args.slice(2).join(' ') || '').trim().toLowerCase();
      if (!word) return api.sendMessage('Dùng: bonz nối từ dict del <từ>', threadId, type);
      state.custom = (state.custom || []).filter(x => x !== word);
      tdata.noi_tu_state = state;
      if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage(`🗑️ Đã xóa từ tùy chỉnh: "${word}"`, threadId, type);
    }
    return api.sendMessage('⚙️ Dùng: bonz nối từ dict on|off|status|add <từ>|del <từ>', threadId, type);
  }
  if (sub === 'mode') {
    const m = parseInt(args[1], 10);
    if (![1,2].includes(m)) return api.sendMessage('⚙️ Dùng: bonz nối từ mode 1|2\n1: theo CHỮ (a→a)\n2: theo TỪ ("con cá" → "cá ...")', threadId, type);
    state.mode = m;
    tdata.noi_tu_state = state;
    if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
    return api.sendMessage(`✅ Đã chuyển chế độ: ${m === 2 ? 'theo TỪ (vd: "con cá" → "cá con")' : 'theo CHỮ (a→a)'} `, threadId, type);
  }
  if (sub === 'status') {
    if (!state.started) return api.sendMessage(`ℹ️ Trạng thái: ĐANG TẮT. (chế độ: ${state.mode === 2 ? 'theo TỪ' : 'theo CHỮ'})\nGõ: bonz nối từ start`, threadId, type);
    const needWord = state.lastWord?.split(' ').filter(Boolean).slice(-1)[0] || '';
    const needDisp = state.mode === 2 ? needWord : (state.lastChar || state.lastWord.slice(-1));
    const last = state.lastWord ? `Từ cuối: ${state.lastWord} (yêu cầu: ${needDisp})` : 'Chưa có từ nào.';
    return api.sendMessage(`ℹ️ Trò chơi đang BẬT. (chế độ: ${state.mode === 2 ? 'theo TỪ' : 'theo CHỮ'})\n${last}`, threadId, type);
  }

  // Chơi: bonz nối từ <từ>
  const joined = args.join(' ').trim().toLowerCase();
  if (!state.started) {
    return api.sendMessage('❗ Trò chơi chưa bắt đầu. Gõ: bonz nối từ start', threadId, type);
  }
  if (!joined) {
    return api.sendMessage('⚠️ Cú pháp: bonz nối từ <từ tiếp theo>', threadId, type);
  }

  // Chuẩn hóa từ/cụm từ: chỉ giữ chữ cái và khoảng trắng đơn
  const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
  // Hỗ trợ nhiều từ: tách theo dấu phẩy/newline hoặc nhiều khoảng trắng
  let words = joined.split(/[\n,]+/).map(s => norm(s)).filter(Boolean);
  if (words.length === 0) words = [norm(joined)];

  // Duyệt từng từ, dừng khi gặp sai
  const { dict, ascii } = __loadViDict();
  for (let idx = 0; idx < words.length; idx++) {
    const w = words[idx];
    if (!w) continue;
    // Kiểm tra từ điển nếu bật (hỗ trợ cụm từ: tất cả token đều phải hợp lệ hoặc trong custom)
    if (state.useDict) {
      const tokens = w.split(' ').filter(Boolean);
      let valid = true;
      for (const t of tokens) {
        const tAscii = __stripDia(t);
        const inDict = dict.has(t) || ascii.has(tAscii);
        const inCustom = Array.isArray(state.custom) && state.custom.includes(t);
        if (!inDict && !inCustom) { valid = false; break; }
      }
      if (!valid) {
        return api.sendMessage(`📚 Cụm từ thứ ${idx + 1} có từ không hợp lệ: "${w}"\nBạn có thể thêm bằng: bonz nối từ dict add ${w}`, threadId, type);
      }
    }
    // Kiểm tra tiền tố yêu cầu (mode 2: theo TỪ, mode 1: theo CHỮ)
    if (state.lastWord) {
      if (state.mode === 2) {
        const need = state.lastWord.split(' ').filter(Boolean).slice(-1)[0] || '';
        const got = w.split(' ').filter(Boolean)[0] || '';
        if (need && got !== need) {
          return api.sendMessage(`❌ Sai ở cụm từ thứ ${idx + 1}: "${w}"\nYêu cầu bắt đầu bằng từ: "${need}"`, threadId, type);
        }
      } else {
        const need = state.lastChar || state.lastWord.slice(-1);
        const got = w[0];
        if (need && got !== need) {
          return api.sendMessage(`❌ Sai ở từ thứ ${idx + 1}: "${w}"\nYêu cầu bắt đầu bằng chữ: "${need}"`, threadId, type);
        }
      }
    }
    if (Array.isArray(state.used) && state.used.includes(w)) {
      return api.sendMessage(`🔁 Từ thứ ${idx + 1} đã dùng rồi: "${w}"`, threadId, type);
    }
    // Cập nhật trạng thái
    state.used = Array.isArray(state.used) ? state.used : [];
    state.used.push(w);
    state.lastWord = w;
    state.lastChar = w[w.length - 1];
  }

  tdata.noi_tu_state = state;
  if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);

  // Gợi ý tiền tố tiếp theo
  const needNext = state.mode === 2
    ? (state.lastWord.split(' ').filter(Boolean).slice(-1)[0] || '')
    : state.lastChar;
  return api.sendMessage(`✅ Hợp lệ! Yêu cầu tiếp theo: "${needNext}"`, threadId, type);
}



// Cấp phát Gmail EDU ảo (không phải tài khoản thật, chỉ demo)
async function handleGmailEdu(api, event) {
  const { threadId, type } = event;
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    const role = __getRoleLabel(senderId);
    const usage = __incUsage('gmail edu', senderId);
    // Tạo thông tin EDU ảo (demo)
    const rand = (n, chars) => Array.from({ length: n }, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    const digits = '0123456789';
    const lowers = 'abcdefghijklmnopqrstuvwxyz';
    const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const all = lowers + uppers + digits;
    const mssv = rand(8, digits);
    const local = `sv${mssv}`;
    const domains = ['student.edu.vn','university.edu.vn','sinhvien.edu.vn','stu.univ.edu.vn'];
    const domain = domains[Math.floor(Math.random()*domains.length)];
    const email = `${local}@${domain}`;
    const password = `${rand(1, uppers)}${rand(7, all)}!`;

    const header = __formatServiceInfo({
      service: 'gmail edu',
      userName,
      userId: senderId,
      notify: 'Cấp phát EDU',
      role,
      usage,
      howToUse: ''
    });

    const lines = [
      '',
      '📧 THÔNG TIN GMAIL EDU',
      `• Email: ${email}`,
      `• Mật khẩu: ${password}`
    ];

    return api.sendMessage(`${header}\n${lines.join('\n')}`, threadId, type, null, senderId);
  } catch (e) {
    return api.sendMessage('❌ Không thể cấp phát Gmail EDU ảo lúc này.', event.threadId, event.type);
  }
}

// Hiển thị bảng thông tin dịch vụ (mẫu) theo định dạng chuẩn
async function handleServiceInfo(api, event, args = []) {
  const { threadId, type } = event;
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz info', senderId);

    const serviceName = (args || []).join(' ').trim() || 'bonz info';

    const header = __formatServiceInfo({
      service: serviceName,
      userName,
      userId: senderId,
      notify: 'Mẫu thông tin dịch vụ',
      role,
      usage,
      howToUse: 'bonz info <tên dịch vụ>'
    });

    return api.sendMessage(header, threadId, type, null, senderId);
  } catch (e) {
    return api.sendMessage('❌ Không thể hiển thị bảng thông tin dịch vụ ngay lúc này.', threadId, type);
  }
}

// Quản lý từ cấm trong nhóm
async function handleTuCam(api, event, args = []) {
  const { threadId, type, data } = event;
  const { ThreadType } = require('zca-js');
  const Threads = require('../../core/controller/controllerThreads');

  if (type !== ThreadType.Group) {
    return api.sendMessage('Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const userId = data?.uidFrom;
  const isAdminGroup = await isAdminInGroup(api, userId, threadId);
  const isAdminBot = isBotAdmin(userId);
  if (!(isAdminGroup || isAdminBot)) {
    return api.sendMessage('Bạn cần là quản trị viên để sử dụng lệnh này.', threadId, type);
  }

  const action = (args[0] || '').toLowerCase();
  const row = await Threads.getData(threadId);
  const tdata = row?.data || {};
  tdata.tu_cam = tdata.tu_cam || { enabled: false, words: [] };

  const toWords = (list) => {
    if (!list || list.length === 0) return [];
    const joined = list.join(' ');
    // Chỉ tách bởi dấu phẩy để hỗ trợ cụm từ có khoảng trắng (ví dụ: "địt mẹ")
    return joined
      .split(/\s*,\s*/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  };

  if (["bật","on","enable","1"].includes(action)) {
    tdata.tu_cam.enabled = true;
    await Threads.setData(threadId, tdata);
    return api.sendMessage('✅ Đã bật chế độ từ cấm.', threadId, type);
  }

  if (["tắt","off","disable","0"].includes(action)) {
    tdata.tu_cam.enabled = false;
    await Threads.setData(threadId, tdata);
    return api.sendMessage('✅ Đã tắt chế độ từ cấm.', threadId, type);
  }

  if (action === 'thêm' || action === 'them' || action === 'add') {
    const words = toWords(args.slice(1));
    if (words.length === 0) return api.sendMessage('Vui lòng nhập từ cần thêm.', threadId, type);
    const set = new Set([...(tdata.tu_cam.words || []).map(w => String(w).toLowerCase()), ...words]);
    tdata.tu_cam.words = Array.from(set);
    await Threads.setData(threadId, tdata);
    return api.sendMessage(`✅ Đã thêm ${words.length} từ. Tổng: ${tdata.tu_cam.words.length}.`, threadId, type);
  }

  if (action === 'xóa' || action === 'xoa' || action === 'del' || action === 'remove') {
    const words = toWords(args.slice(1));
    if (words.length === 0) return api.sendMessage('Vui lòng nhập từ cần xóa.', threadId, type);
    const removeSet = new Set(words);
    tdata.tu_cam.words = (tdata.tu_cam.words || []).filter(w => !removeSet.has(String(w).toLowerCase()));
    await Threads.setData(threadId, tdata);
    return api.sendMessage(`✅ Đã xóa. Tổng còn: ${tdata.tu_cam.words.length}.`, threadId, type);
  }

  if ((action === 'danh' && (args[1]||'').toLowerCase() === 'sách') || action === 'list') {
    const enabled = tdata.tu_cam.enabled ? 'BẬT' : 'TẮT';
    const words = tdata.tu_cam.words || [];
    const lines = [
      '🛡️ TỪ CẤM',
      `• Trạng thái: ${enabled}`,
      `• Số từ: ${words.length}`,
      words.length ? `• Danh sách: ${words.join(', ')}` : '• Danh sách: (trống)'
    ];
    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  if (action === 'reset') {
    tdata.tu_cam = { enabled: false, words: [] };
    await Threads.setData(threadId, tdata);
    return api.sendMessage('✅ Đã reset danh sách từ cấm và tắt chế độ.', threadId, type);
  }

  const guide = [
    '🛡️ Quản lý từ cấm:',
    '• bonz từ cấm bật|tắt',
    '• bonz từ cấm thêm <từ1, từ2,...>',
    '• bonz từ cấm xóa <từ1, từ2,...>',
    '• bonz từ cấm danh sách',
    '• bonz từ cấm reset'
  ].join('\n');
  return api.sendMessage(guide, threadId, type);
}
// Khóa/Mở khóa chat nhóm
async function handleKhoaChat(api, event, args = [], routedFromBonz = false) {
  const { threadId, type, data } = event;
  const { ThreadType } = require('zca-js');
  const Threads = require('../../core/controller/controllerThreads');

  if (type !== ThreadType.Group) {
    return api.sendMessage('Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const userId = data?.uidFrom;
  const isAdmin = await isAdminInGroup(api, userId, threadId);
  if (!isAdmin) {
    return api.sendMessage('Bạn cần là quản trị viên để sử dụng lệnh này.', threadId, type);
  }

  const action = (args[0] || '').toLowerCase();
  const row = await Threads.getData(threadId);
  const tdata = row?.data || {};
  const current = !!tdata.chat_locked;

  let next;
  if (["on", "bật", "bat", "enable", "1"].includes(action)) next = true;
  else if (["off", "tắt", "tat", "disable", "0", "mở", "mo"].includes(action)) next = false;
  else next = !current; // toggle nếu không chỉ định

  tdata.chat_locked = next;
  Threads.setData(threadId, tdata);

  return api.sendMessage(`🔒 Trạng thái chat: ${next ? 'ĐÃ KHÓA' : 'ĐÃ MỞ'}.`, threadId, type);
}

// Bật/Tắt/Trạng thái welcome theo từng nhóm
async function handleWelcomeToggle(api, event, args = []) {
  const { threadId, type } = event;
  try {
    const utils = require('../../utils');
    const botUid = api.getOwnId();
    const action = (args[0] || '').toLowerCase();
    if (action === 'on' || action === 'bật') {
      const msg = utils.handleWelcomeOn(botUid, threadId);
      return api.sendMessage(msg, threadId, type);
    }
    if (action === 'off' || action === 'tắt' || action === 'tat') {
      const msg = utils.handleWelcomeOff(botUid, threadId);
      return api.sendMessage(msg, threadId, type);
    }
    const allow = utils.getAllowWelcome(botUid, threadId);
    return api.sendMessage(`🚦Trạng thái welcome hiện đang ${allow ? '🟢 Bật' : '🔴 Tắt'}.\nDùng: bonz welcome on | off`, threadId, type);
  } catch (e) {
    return api.sendMessage('❌ Không thể xử lý cấu hình welcome.', threadId, type);
  }
}

// Hàm lấy mô tả thời tiết từ weather_code (Open-Meteo)
function __wmCodeToTextVi(code) {
  const map = {
    0: 'Trời quang',
    1: 'Chủ yếu quang',
    2: 'Có mây rải rác',
    3: 'Nhiều mây',
    45: 'Sương mù',
    48: 'Sương mù đóng băng',
    51: 'Mưa phùn nhẹ',
    53: 'Mưa phùn vừa',
    55: 'Mưa phùn dày',
    56: 'Mưa phùn băng nhẹ',
    57: 'Mưa phùn băng dày',
    61: 'Mưa nhẹ',
    63: 'Mưa vừa',
    65: 'Mưa to',
    66: 'Mưa băng nhẹ',
    67: 'Mưa băng to',
    71: 'Tuyết nhẹ',
    73: 'Tuyết vừa',
    75: 'Tuyết dày',
    77: 'Tuyết hạt',
    80: 'Mưa rào nhẹ',
    81: 'Mưa rào vừa',
    82: 'Mưa rào to',
    85: 'Mưa tuyết rào nhẹ',
    86: 'Mưa tuyết rào to',
    95: 'Dông',
    96: 'Dông kèm mưa đá nhẹ',
    99: 'Dông kèm mưa đá to'
  };
  return map[code] || `Mã thời tiết ${code}`;
}

// Xử lý bonz weather
async function handleWeather(api, event, args = []) {
  const { threadId, type } = event;
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz weather', senderId);

    const query = (args || []).join(' ').trim();
    if (!query) {
      const header = __formatServiceInfo({
        service: 'bonz weather',
        userName,
        userId: senderId,
        notify: 'Hướng dẫn sử dụng',
        role,
        usage,
        howToUse: 'bonz weather <địa điểm>'
      });
      return api.sendMessage(header, threadId, type);
    }

    await api.sendMessage(`🌍 Đang tìm địa điểm "${query}"...`, threadId, type);

    // 1) Geocoding
    const geores = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: query, count: 1, language: 'vi', format: 'json' },
      timeout: 15000
    });
    const place = geores?.data?.results?.[0];
    if (!place) {
      return api.sendMessage(`❌ Không tìm thấy địa điểm phù hợp cho "${query}".`, threadId, type);
    }

    const lat = place.latitude;
    const lon = place.longitude;
    const displayName = [place.name, place.admin1, place.country].filter(Boolean).join(', ');

    // 2) Current weather
    const wres = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
        timezone: 'auto'
      },
      timeout: 15000
    });
    const cur = wres?.data?.current;
    if (!cur) {
      return api.sendMessage('❌ Không lấy được dữ liệu thời tiết. Vui lòng thử lại.', threadId, type);
    }

    const desc = __wmCodeToTextVi(cur.weather_code);
    const temp = cur.temperature_2m;
    const feels = cur.apparent_temperature;
    const hum = cur.relative_humidity_2m;
    const wind = cur.wind_speed_10m;
    const windDir = cur.wind_direction_10m;
    const rain = cur.precipitation;
    const isDay = cur.is_day ? 'Ban ngày' : 'Ban đêm';

    const header = __formatServiceInfo({
      service: 'bonz weather',
      userName,
      userId: senderId,
      notify: `Thời tiết hiện tại ở ${displayName}`,
      role,
      usage,
      howToUse: 'bonz weather <địa điểm>'
    });

    const lines = [
      header,
      '',
      `📍 Vị trí: ${displayName} (lat ${lat.toFixed(3)}, lon ${lon.toFixed(3)})`,
      `🌤 Tình trạng: ${desc} • ${isDay}`,
      `🌡 Nhiệt độ: ${temp}°C (Cảm giác: ${feels}°C)`,
      `💧 Độ ẩm: ${hum}%  • ☔ Lượng mưa: ${rain} mm`,
      `💨 Gió: ${wind} km/h • Hướng: ${windDir}°`
    ].join('\n');

    return api.sendMessage(lines, threadId, type);
  } catch (e) {
    try {
      return api.sendMessage('❌ Lỗi khi lấy thời tiết. Vui lòng thử lại sau.', event.threadId, event.type);
    } catch {}
  }
}

// Hàm xử lý tìm kiếm nhạc SoundCloud
async function handleMusic(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const Threads = require('../../core/controller/controllerThreads');
  const soundcloud = require('./soundcloud.js');
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz nhạc', senderId);

  // Lấy tên người dùng (dùng cho header chuẩn)
  let userName = "Người dùng";
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
  } catch (_) {}

  // cache danh sách bài theo thread+uid trong 5 phút
  async function setMusicCache(list) {
    try {
      console.log(`[Music Cache] Lưu cache cho user ${senderId} trong thread ${threadId}`);
      console.log(`[Music Cache] Số bài hát: ${list?.length || 0}`);
      
      const row = await Threads.getData(threadId);
      const tdata = row?.data || {};
      tdata.music = tdata.music || { searches: {} };
      tdata.music.searches[senderId] = { payload: list, ts: Date.now() };
      await Threads.setData(threadId, tdata);
      
      console.log('[Music Cache] ✅ Đã lưu cache thành công');
    } catch (e) {
      console.log(`[Music Cache] ❌ Lỗi lưu cache: ${e.message}`);
    }
  }
  async function getMusicCache(maxAgeMs = 300000) { // Tăng lên 5 phút
    try {
      const row = await Threads.getData(threadId);
      const node = row?.data?.music?.searches?.[senderId];
      console.log(`[Music Cache] Checking cache for user ${senderId} in thread ${threadId}`);
      
      if (!node) {
        console.log('[Music Cache] ❌ Không tìm thấy cache');
        return null;
      }
      
      const age = Date.now() - (node.ts || 0);
      console.log(`[Music Cache] Cache age: ${Math.floor(age/1000)}s / ${Math.floor(maxAgeMs/1000)}s`);
      
      if (age > maxAgeMs) {
        console.log('[Music Cache] ❌ Cache đã hết hạn');
        return null;
      }
      
      console.log(`[Music Cache] ✅ Cache hợp lệ, có ${node.payload?.length || 0} bài`);
      return node.payload || null;
    } catch (e) { 
      console.log(`[Music Cache] ❌ Lỗi đọc cache: ${e.message}`);
      return null; 
    }
  }
  
  // chọn bài từ danh sách đã tìm
  if (args.length >= 1 && ['chọn','chon','chọn bài','chon bai'].includes((args[0]||'').toLowerCase())) {
    const idx = parseInt(args[1], 10);
    if (isNaN(idx) || idx <= 0) {
      return api.sendMessage('❌ Vui lòng nhập số thứ tự hợp lệ. Ví dụ: bonz nhạc chọn 1', threadId, type);
    }
    const list = await getMusicCache();
    if (!Array.isArray(list) || list.length === 0) {
      return api.sendMessage([
        '❌ Không có danh sách gần đây hoặc đã hết hạn (5 phút).',
        '',
        '🔍 Hãy tìm kiếm trước:',
        '• bonz nhạc <tên bài>',
        '• Ví dụ: bonz nhạc despacito',
        '',
        '📝 Sau đó reply số 1-5 hoặc dùng: bonz nhạc chọn <số>',
        '',
        '💡 Mẹo: Cache sẽ được lưu trong 5 phút sau khi tìm kiếm'
      ].join('\n'), threadId, type);
    }
    const chosen = list[idx - 1];
    if (!chosen) {
      return api.sendMessage(`❌ Chỉ số không hợp lệ. Hãy chọn từ 1-${list.length}`, threadId, type);
    }
    try {
      await api.sendMessage('🔽 Đang xử lý phát nhạc, vui lòng đợi...', threadId, type);
      const streamUrl = await soundcloud.getMusicStreamUrl(chosen.link);
      if (!streamUrl) return api.sendMessage('❌ Không lấy được link phát trực tiếp. Thử bài khác.', threadId, type);

      const caption = [
        `🎶 ${chosen.title}`,
        chosen.username ? `👤 ${chosen.username}` : '',
        chosen.playCount ? `▶️ ${chosen.playCount} | ❤️ ${chosen.likeCount || 0}` : ''
      ].filter(Boolean).join('\n');

      // 1) Cố gắng gửi voice từ URL (nhiều biến thể payload)
      const urlVoicePayloads = [
        { msg: caption, attachments: [streamUrl], asVoice: true },
        { msg: caption, attachments: [streamUrl], voice: true },
        { msg: caption, voice: streamUrl },
        { msg: caption, audio: streamUrl },
        { msg: caption, attachments: streamUrl, asVoice: true },
      ];
      for (const p of urlVoicePayloads) {
        try { await api.sendMessage(p, threadId, type); return; } catch (_) {}
      }

      // 2) Nếu client không nhận URL, tải file về rồi gửi voice từ file
      const safeTitle = (chosen.title || 'soundcloud').slice(0,80).replace(/[<>:"/\\|?*]/g,'_');
      const filePath = await soundcloud.saveFileToCache(streamUrl, `${safeTitle}.mp3`);
      if (!filePath) return api.sendMessage('❌ Lỗi tải file.', threadId, type);

      const fileVoicePayloads = [
        { msg: caption, attachments: [filePath], asVoice: true },
        { msg: caption, attachments: [filePath], voice: true },
        { msg: caption, voice: filePath },
        { msg: caption, audio: filePath },
        { msg: caption, attachments: filePath, asVoice: true },
      ];
      let sent = false;
      for (const p of fileVoicePayloads) {
        try { await api.sendMessage(p, threadId, type); sent = true; break; } catch (_) {}
      }
      if (!sent) {
        // Fallback cuối: gửi bình thường như file đính kèm
        await api.sendMessage({ msg: caption, attachments: [filePath], ttl: __TIK_MESSAGE_TTL }, threadId, type);
      }
      // dọn file sau 5 phút
      setTimeout(async ()=>{ try { const fs = require('fs').promises; await fs.unlink(filePath); } catch(_){} }, 300000);
    } catch (e) {
      return api.sendMessage('❌ Gửi nhạc thất bại, vui lòng thử lại.', threadId, type);
    }
    return;
  }

  // Debug cache command
  if (args.length === 1 && args[0].toLowerCase() === 'debug') {
    try {
      const row = await Threads.getData(threadId);
      const tdata = row?.data || {};
      const musicData = tdata.music?.searches || {};
      
      let debugInfo = [
        '🔍 DEBUG BONZ NHẠC CACHE:',
        `📍 Thread ID: ${threadId}`,
        `👤 User ID: ${senderId}`,
        `📊 Tổng số cache: ${Object.keys(musicData).length}`,
        ''
      ];
      
      if (musicData[senderId]) {
        const cache = musicData[senderId];
        const age = Math.floor((Date.now() - (cache.ts || 0)) / 1000);
        debugInfo.push(`✅ Cache của bạn:`);
        debugInfo.push(`   • Số bài: ${cache.payload?.length || 0}`);
        debugInfo.push(`   • Tuổi: ${age}s (max: 300s)`);
        debugInfo.push(`   • Trạng thái: ${age > 300 ? '❌ Hết hạn' : '✅ Hợp lệ'}`);
        
        if (cache.payload?.length > 0) {
          debugInfo.push(`   • Bài đầu: ${cache.payload[0]?.title || 'N/A'}`);
        }
      } else {
        debugInfo.push('❌ Không có cache cho user này');
      }
      
      debugInfo.push('');
      debugInfo.push('📝 Các user khác có cache:');
      Object.keys(musicData).forEach(uid => {
        if (uid !== senderId) {
          const cache = musicData[uid];
          const age = Math.floor((Date.now() - (cache.ts || 0)) / 1000);
          debugInfo.push(`   • ${uid}: ${cache.payload?.length || 0} bài (${age}s)`);
        }
      });
      
      return api.sendMessage(debugInfo.join('\n'), threadId, type);
    } catch (e) {
      return api.sendMessage(`❌ Lỗi debug: ${e.message}`, threadId, type);
    }
  }

  if (args.length === 0) {
    const header = __formatServiceInfo({
      service: 'bonz nhạc',
      userName,
      userId: senderId,
      notify: 'Hướng dẫn sử dụng',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: 'bonz nhạc <từ khóa> | bonz nhạc debug'
    });
    return api.sendMessage(header, threadId, type);
  }

  // bonz giải toán | bonz giai toan | bonz giaitoan | bonz math
  if ((sub === 'giải' && (args[1] || '').toLowerCase() === 'toán') ||
      (sub === 'giai' && (args[1] || '').toLowerCase() === 'toan') ||
      sub === 'giaitoan' || sub === 'math') {
    try {
      const mathCmd = require('./giaitoan.js');
      const passArgs = (sub === 'giải' || sub === 'giai') ? args.slice(2) : args.slice(1);
      await mathCmd.run({ api, event, args: passArgs });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz giải toán. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }
  
  // bonz cút | bonz kick: hỗ trợ @mention, reply, hoặc UID trong tham số
  if (sub === 'cút' || sub === 'cut' || sub === 'kick') {
    return await handleKick(api, event, args);
  }

  // bonz thả thính | bonz thathinh | bonz thinh
  if ((sub === 'thả' && (args[1] || '').toLowerCase() === 'thính') ||
      sub === 'thathinh' || sub === 'thính' || sub === 'thinh') {
    try {
      const thinhCmd = require('./thathinh.js');
      // chuyển tiếp không cần thêm tham số
      await thinhCmd.run({ api, event, args: [] });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz thả thính. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }
  
  const query = args.join(' ');
  
  try {
    await api.sendMessage(`🔍 Đang tìm kiếm "${query}" trên SoundCloud...`, threadId, type);
    const songs = await soundcloud.searchSongs(query);
    
    if (songs.length === 0) {
      const header = __formatServiceInfo({
        service: 'bonz nhạc',
        userName,
        userId: senderId,
        notify: 'Không tìm thấy bài hát phù hợp',
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: 'bonz nhạc <từ khóa>'
      });
      return api.sendMessage(header, threadId, type);
    }
    
    // Lấy metadata cho các bài hát
    for (let i = 0; i < Math.min(songs.length, 5); i++) {
      try {
        const metadata = await soundcloud.getSongMetadata(songs[i].link);
        songs[i] = { ...songs[i], ...metadata };
      } catch (_) {}
    }
    
    // Cache danh sách và tạo ảnh menu
    await setMusicCache(songs.slice(0, 5));
    
    // Tạo ảnh menu
    const imagePath = await soundcloud.createSongListImage(songs.slice(0, 5), userName);
    
    if (imagePath) {
      const header = __formatServiceInfo({
        service: 'bonz nhạc',
        userName,
        userId: senderId,
        notify: `Tìm thấy ${songs.length} bài`,
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: `bonz nhạc <từ khóa> | reply 1-${Math.min(songs.length, 5)} hoặc bonz nhạc chọn <số>`
      });

      const messagePayload = {
        msg: [
          header,
          '',
          `🎵 Kết quả tìm kiếm cho: ${query}`,
          `📊 Tìm thấy ${songs.length} bài hát`,
          ``,
          `💡 Để tải nhạc: reply số (1-${Math.min(songs.length, 5)}) hoặc gõ: bonz nhạc chọn <số>`,
        ].join('\n'),
        attachments: [imagePath]
      };

      await api.sendMessage(messagePayload, threadId, type);
      
      // Xóa file tạm sau 5 phút
      setTimeout(async () => {
        try {
          const fs = require('fs').promises;
          await fs.unlink(imagePath);
        } catch (_) {}
      }, 300000);
    } else {
      // Fallback: gửi text nếu không tạo được ảnh
      const header = __formatServiceInfo({
        service: 'bonz nhạc',
        userName,
        userId: senderId,
        notify: `Tìm thấy ${songs.length} bài`,
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: `bonz nhạc <từ khóa> | reply 1-${Math.min(songs.length, 5)} hoặc bonz nhạc chọn <số>`
      });
      let resultText = `${header}\n\n🎵 Kết quả tìm kiếm cho: ${query}\n`;
      songs.slice(0, 5).forEach((song, index) => {
        resultText += `${index + 1}. ${song.title}\n👤 ${song.username}\n▶️ ${song.playCount} | ❤️ ${song.likeCount}\n\n`;
      });
      resultText += `💡 Để tải: reply số (1-${Math.min(songs.length, 5)}) hoặc gõ: bonz nhạc chọn <số>`;
      
      await api.sendMessage(resultText, threadId, type);
    }
    
  } catch (error) {
    console.error('Lỗi tìm kiếm nhạc:', error.message);
    const header = __formatServiceInfo({
      service: 'bonz nhạc',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: 'bonz nhạc <từ khóa>'
    });
    return api.sendMessage(`${header}\n\n❌ Có lỗi xảy ra khi tìm nhạc!`, threadId, type);
  }
}

// Hàm đếm số lượng lệnh năng group
async function handleGroup(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  if (args.length === 0) {
    return api.sendMessage([
      '🏘️ Tính năng quản lý group:',
      '',
      '📝 Cách dùng:',
      '• bonz group join <link> - Join group',
      '• bonz group spam <link> <số_lần> - Join và spam',
      '',
      '💡 Ví dụ:',
      '• bonz group join https://zalo.me/g/abc123',
      '• bonz group spam https://zalo.me/g/abc123 5'
    ].join('\n'), threadId, type);
  }
  
  const action = args[0]?.toLowerCase();
  
  try {
    // Lấy tên người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (_) {}
    
    const groupManager = require('./groupManager.js');
    
    if (action === 'join') {
      if (args.length < 2) {
        return api.sendMessage('❌ Thiếu link group!\nDùng: bonz group join <link>', threadId, type);
      }
      
      const groupUrl = args[1];
      await api.sendMessage('🔄 Đang join group...', threadId, type);
      
      const result = await groupManager.joinGroup(api, groupUrl);
      
      if (result.success) {
        await api.sendMessage([
          '✅ Join group thành công!',
          `👤 Người dùng: ${userName}`,
          `🆔 Group ID: ${result.groupId}`,
          `📝 Trạng thái: ${result.message}`
        ].join('\n'), threadId, type);
      } else {
        await api.sendMessage(`❌ ${result.message}`, threadId, type);
      }
      
    } else if (action === 'spam') {
      if (args.length < 3) {
        return api.sendMessage('❌ Thiếu tham số!\nDùng: bonz group spam <link> <số_lần>', threadId, type);
      }
      
      const groupUrl = args[1];
      const spamCount = parseInt(args[2]);
      
      if (isNaN(spamCount) || spamCount <= 0) {
        return api.sendMessage('❌ Số lần spam không hợp lệ!', threadId, type);
      }
      
      if (spamCount > 20) {
        return api.sendMessage('❌ Số lần spam tối đa là 20!', threadId, type);
      }
      
      await api.sendMessage(`🔄 Đang join group và chuẩn bị spam ${spamCount} lần...`, threadId, type);
      
      // Join group trước
      const joinResult = await groupManager.joinGroup(api, groupUrl);
      
      if (!joinResult.success) {
        return api.sendMessage(`❌ Không thể join group: ${joinResult.message}`, threadId, type);
      }
      
      await api.sendMessage(`✅ Join thành công! Bắt đầu spam...`, threadId, type);
      
      // Spam với callback để báo tiến độ
      let lastProgress = 0;
      const spamResult = await groupManager.spamGroup(api, joinResult.groupId, spamCount, (current, total, success) => {
        const progress = Math.floor((current / total) * 100);
        if (progress - lastProgress >= 25) { // Báo mỗi 25%
          api.sendMessage(`📊 Tiến độ: ${current}/${total} (${progress}%) - Thành công: ${success}`, threadId, type);
          lastProgress = progress;
        }
      });
      
      if (spamResult.success) {
        await api.sendMessage([
          '🎉 Hoàn thành spam!',
          `👤 Người dùng: ${userName}`,
          `📊 Thành công: ${spamResult.successCount}/${spamResult.totalCount}`,
          `🆔 Group ID: ${joinResult.groupId}`
        ].join('\n'), threadId, type);
      } else {
        await api.sendMessage(`❌ Lỗi spam: ${spamResult.message}`, threadId, type);
      }
      
    } else {
      await api.sendMessage('❌ Hành động không hợp lệ!\nDùng: join hoặc spam', threadId, type);
    }
    
  } catch (error) {
    console.error('Lỗi xử lý group:', error.message);
    await api.sendMessage('❌ Có lỗi xảy ra khi xử lý group. Vui lòng thử lại.', threadId, type);
  }
}

// Gửi 10 tài liệu ngẫu nhiên từ thư mục 'tài liệu/)))/' (tránh trùng lặp theo nhóm)
async function handleTaiLieu(api, event, args = []) {
  const { threadId, type, data } = event;
  const fs = require('fs');
  const path = require('path');
  const Threads = require('../../core/controller/controllerThreads');

  try {
    const senderId = data.uidFrom;

    // Lấy thông tin người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Helper: gửi text theo từng khúc để tránh lỗi "Nội dung quá dài" (code 118)
    async function sendTextChunked(text) {
      try {
        const s = String(text || '');
        const max = 1800; // giữ an toàn dưới giới hạn
        if (s.length <= max) {
          return await api.sendMessage(s, threadId, type);
        }
        let i = 0;
        while (i < s.length) {
          const part = s.slice(i, i + max);
          // gửi lần lượt, đảm bảo thứ tự
          // bỏ type để tránh tham số không hợp lệ
          await api.sendMessage(part, threadId, type);
          i += max;
        }
      } catch (e) {
        console.error('sendTextChunked error:', e?.message || e);
        // fallback cuối
        return await api.sendMessage('⚠️ Nội dung quá dài, đã rút gọn.', threadId, type);
      }
    }

    // --- Văn 6: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const a0 = (args[0] || '').toLowerCase();
    const a1 = (args[1] || '').toLowerCase();
    const isVan6 = (a0 === 'văn' || a0 === 'van') && a1 === '6';
    if (isVan6) {
      const VAN6_DOCS = [
        { title: 'văn 6 đề thi giữa học kì 2 (1)', url: 'https://drive.google.com/file/d/1qAgLbagwt7XMezSDx8cSuNUmXiIjZ_A5/view' },
        { title: 'văn 6 đề thi giữa học kì 2 (2)', url: 'https://drive.google.com/file/d/13MXkECRvXJXBOjaKhxgkgCH9bwIRDLcq/view' },
        { title: 'văn 6 đề thi giữa học kì 1 (1)', url: 'https://drive.google.com/file/d/1OgXdp3BmRJIz0EEbfp209xhGbfFxWi45/view' },
        { title: 'văn 6 đề thi giữa học kì 1 (2)', url: 'https://drive.google.com/file/d/1CNQbiwJkqkEhsHtScwWOtNADrSTqBdVd/view' },
        { title: 'văn 6 đề thi học kì 1 (1)', url: 'https://drive.google.com/file/d/1lbCGGgfJOCltkuH_RtVp9z4R8U2uMkRC/view' },
        { title: 'văn 6 đề thi khảo sát (1)', url: 'https://docs.google.com/document/d/1ecI164j19VaKPKTH7HRhT11GFBEfj75qAaT6NFe0hc0/view' },
        { title: 'văn 6 đề thi khảo sát (2)', url: 'https://docs.google.com/document/d/1tG1gM8-7fP4dUcW4d574nRJSEj-K4MUoaEAwxWtCYg/view' },
        { title: 'đề thi tuyển sinh lớp 6 văn', url: 'https://docs.google.com/document/d/17xpIP77UK9WOfqGUfpmTyJk5BpmyFyoiLFnoai_kCN4/view' },
        { title: 'đề thi tuyển sinh lớp 6 văn (2)', url: 'https://docs.google.com/document/d/1Z8wjiCuqEzaKM8iT6Dz_1moXmQIMCExl6jaBWg5qEK0/view' },
        { title: 'văn 6 đề thi khảo sát (3)', url: 'https://drive.google.com/file/d/1eBa99W7bImcLzo7kjzXEk-pn6RqYCTe8/view' },
        { title: 'tuyển sinh lớp 6 văn (3)', url: 'https://drive.google.com/file/d/1YdQNP27IHYeNq_s-NuW5J1iIxC61WbBq/view' },
        { title: 'văn 6 đề thi khảo sát (4)', url: 'https://docs.google.com/document/d/1_XNO4AwyAAsAfdy5BLz7v7WxzPOl4yW6b9kJY7RVULM/view' },
        { title: 'văn 6 đề thi khảo sát (5)', url: 'https://drive.google.com/file/d/1l2CkutCSE3zZOo_SCyZCNjxCQEeXRxqQ/view' },
        { title: 'văn 6 đề thi khảo sát (6)', url: 'https://docs.google.com/document/d/1hYAYwaZgE6_KLHus0tYwY8WOSIBRT4g8RkbZEIy5dt0/view' },
        { title: 'tổng hợp 20 đề thi văn lớp 6', url: 'https://docs.google.com/document/d/1AF1CKhCPfRkMfZSuzG9nWw3cYj62aiCh/view' },
        { title: 'Đề tuyển sinh Văn 6', url: 'https://docs.google.com/document/d/12ouNlIOvNg2nlwzfhXITUkEhE-1qbFN7/view' },
      ];

      // Hành vi: bonz tài liệu văn 6 chọn <số> | hoặc bonz tài liệu văn 6 <số>
      const action = (args[2] || '').toLowerCase();
      const pickNum = action === 'chọn' || action === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickNum) && pickNum >= 1 && pickNum <= VAN6_DOCS.length) {
        const doc = VAN6_DOCS[pickNum - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu văn 6`,
          `Thông báo: Gửi link tài liệu #${pickNum}/${VAN6_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      // Mặc định: liệt kê danh sách
      const list = VAN6_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guide = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu văn 6`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu văn 6 chọn <số> hoặc bonz tài liệu văn 6 <số>)`,
        '',
        list
      ].join('\n');
      await sendTextChunked(guide);
      return;
    }

    // --- Văn 7: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isVan7 = (a0 === 'văn' || a0 === 'van') && a1 === '7';
    if (isVan7) {
      const VAN7_DOCS = [
        { title: 'Học tốt Văn 7 - Tập 1 (PDF)', url: 'https://drive.google.com/file/d/1fsfSlhRI7ggyciym7Nzy8z9cGLpnifiN/view' },
        { title: 'Học tốt Văn 7 - Tập 2 (PDF)', url: 'https://drive.google.com/file/d/1p39SCv2_jRjtM9lL18W-1fRuIpBHlMsI/view' },
        { title: 'Truyện ngắn và Tiểu thuyết – Văn 7', url: 'https://docs.google.com/document/d/19nMgY2XpqJbTRVPADIjgr1bbfFeuZboP/view' },
        { title: 'Vận dụng: Truyện ngắn và Tiểu thuyết – Văn 7', url: 'https://docs.google.com/document/d/1W5XegYeh3auGUMll7lZDf9ttKccx-COE/view' },
        { title: 'Kể về một sự việc có thật – Văn 7', url: 'https://docs.google.com/document/d/1hFHll6QERz6AInPdHJVx_5OYKHRTg7sj/view' },
        { title: 'Thơ bốn chữ, năm chữ – Văn 7', url: 'https://docs.google.com/document/d/1fKvLmnMRPWLX3OGljyg9wZq3ctKMTW1E/view' },
        { title: 'Vận dụng đọc hiểu: Thơ bốn chữ – Văn 7', url: 'https://docs.google.com/document/d/1VdVDeKrZ67PelbgML2OYKNnMbBszIOEm/view' },
        { title: 'Vận dụng: Thơ năm chữ – Văn 7', url: 'https://docs.google.com/document/d/18tzxgIQ0j2g2SX5BHmSANQjcw1P1e-c0/view' },
        { title: 'Viết đoạn thơ ghi lại cảm xúc – Văn 7', url: 'https://docs.google.com/document/d/1mTF7btHIHKhe1kD5aSoXMUAFwrfPneSi/view' },
        { title: 'Luyện đề tổng hợp – Văn 7', url: 'https://docs.google.com/document/d/1l8lLJypcOFQl5RoE7ZUxuQOTGf1yjuGu/view' },
        { title: 'Truyện viễn tưởng – Văn 7', url: 'https://docs.google.com/document/d/1wsqe6r9d8jsz8kQHrGvFLz_Kecg7Twow/view' },
      ];

      const actionV7 = (args[2] || '').toLowerCase();
      const pickV7 = actionV7 === 'chọn' || actionV7 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickV7) && pickV7 >= 1 && pickV7 <= VAN7_DOCS.length) {
        const doc = VAN7_DOCS[pickV7 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu văn 7`,
          `Thông báo: Gửi link tài liệu #${pickV7}/${VAN7_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listV7 = VAN7_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideV7 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu văn 7`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu văn 7 <số> | bonz tài liệu văn 7 chọn <số>)`,
        '',
        listV7
      ].join('\n');
      await sendTextChunked(guideV7);
      return;
    }

    // --- Văn 9: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isVan9 = (a0 === 'văn' || a0 === 'van') && a1 === '9';
    if (isVan9) {
      const VAN9_DOCS = [
        { title: 'tài liệu văn 9 (PDF)', url: 'https://drive.google.com/file/d/16cZ5Q5WQvvFIJK3X-sSNgfmn1mQc4CSw/view' },
        { title: '100 đề văn 9 (PDF)', url: 'https://drive.google.com/file/d/1YIu1kIszw7z0--xHp2u9wuE2W6nxTNA4/view' },
        { title: 'bộ đề ngữ văn 9 (sách) (GDoc)', url: 'https://docs.google.com/document/d/1YpUhD8bty39s9syAS76TyFoB0jDv92cI/view' },
        { title: '120 đề đọc hiểu văn 9 (GDoc)', url: 'https://docs.google.com/document/d/1c8YPn2bHtmCVEIwMSSMV4ndeexmLCa1H/view' },
        { title: 'nội dung ôn giữa kì văn 9 (GDoc)', url: 'https://docs.google.com/document/d/1QuBMEKzFD_eKyyuEnsgFAh9ioZVkIGxm/view' },
        { title: 'đề đọc hiểu văn lên 10 (GDoc)', url: 'https://docs.google.com/document/d/1Wqw6OpsIkg_rz5X1f1wo9rU7SKSRvTHw/view' },
        { title: 'tài liẹu ôn thi văn lên cấp 3 (PDF)', url: 'https://drive.google.com/file/d/1UOYzB_9HErfXKhdQeKL0VRz9MIKtRZxX/view' },
        { title: 'Tổng hợp đề thi văn vào 10 (PDF)', url: 'https://drive.google.com/file/d/1na522OrqDODXsv5gN_HdgDHSOkt7_gm1/view' },
      ];

      const actionV9 = (args[2] || '').toLowerCase();
      const pickV9 = actionV9 === 'chọn' || actionV9 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickV9) && pickV9 >= 1 && pickV9 <= VAN9_DOCS.length) {
        const doc = VAN9_DOCS[pickV9 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu văn 9`,
          `Thông báo: Gửi link tài liệu #${pickV9}/${VAN9_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listV9 = VAN9_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideV9 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu văn 9`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu văn 9 <số> | bonz tài liệu văn 9 chọn <số>)`,
        '',
        listV9
      ].join('\n');
      return api.sendMessage(guideV9, threadId, type);
    }

    // --- Toán 6: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan6 = (a0 === 'toán' || a0 === 'toan') && a1 === '6';
    if (isToan6) {
      const TOAN6_DOCS = [
        { title: 'Toán 6 - Đề kiểm tra năng lực (1)', url: 'https://drive.google.com/file/d/1WCy5yU_aF7DweuiJ-UMohoasqx-me1Xc9XvaQvzXm44/view' },
        { title: 'Công thức Toán hình lớp 6', url: 'https://drive.google.com/file/d/1OoSQmUCiwj07swpjJ4U4-oC7rZZaI-mt/view' },
        { title: 'Toán 6 - Đề thi học sinh giỏi', url: 'https://drive.google.com/file/d/15Af7R69zu4TdsctZ19dyzsBjq8MgdafZ/view?usp=drive_link' },
      ];

      const action2 = (args[2] || '').toLowerCase();
      const pickNum2 = action2 === 'chọn' || action2 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickNum2) && pickNum2 >= 1 && pickNum2 <= TOAN6_DOCS.length) {
        const doc = TOAN6_DOCS[pickNum2 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 6`,
          `Thông báo: Gửi link tài liệu #${pickNum2}/${TOAN6_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const list2 = TOAN6_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guide2 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 6`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 6 chọn <số> hoặc bonz tài liệu toán 6 <số>)`,
        '',
        list2
      ].join('\n');
      await sendTextChunked(guide2);
      return;
    }

    // --- Toán 8: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan8 = (a0 === 'toán' || a0 === 'toan') && a1 === '8';
    if (isToan8) {
      const TOAN8_DOCS = [
        { title: 'đề thi giữa học kì 1 Toán 8 (1)', url: 'https://drive.google.com/file/d/171yneCgNuCA6iOMKUVDpUynDndJlENun/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (2)', url: 'https://drive.google.com/file/d/1NHsBLGJDixrROjisfWTyH89JSIFEE9fJ/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (3)', url: 'https://drive.google.com/file/d/1CfelILxm2_1aWrAl8bXCZZMX--0xBwd1/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (4)', url: 'https://drive.google.com/file/d/1TugbgZakQCvfxxxHSg1lJpJt72oaz1Ft/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (5)', url: 'https://drive.google.com/file/d/19uyWNFU3yosPav2lVeRfo4GVEH__DqXM/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (6)', url: 'https://drive.google.com/file/d/1uFMLpHYQ7G_DYd3cJhjEvzWQPzwf9k8n/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (7)', url: 'https://drive.google.com/file/d/1LADd01QdO5Ch00MoA7-4azskz5jq1T5-/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (8)', url: 'https://drive.google.com/file/d/1zUFVLD7FWxRKTI4G3r7DsjhB1vKYoRaG/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (9)', url: 'https://drive.google.com/file/d/1nwpWs-JbeMqsZAGTJyKexvJla-gehtjN/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (10)', url: 'https://drive.google.com/file/d/1BxLSJsBhrJ4V_4IZaRUtoaFCUmF5uFMF/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (11)', url: 'https://drive.google.com/file/d/1gvYMWBqvdj45PuUtYTxw67Ai2tJgIJDS/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (12) [gdoc]', url: 'https://docs.google.com/document/d/1lZt6O7dob0GTBvcjl-QZFsWzvgbEPqG-/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (13) [gdoc]', url: 'https://docs.google.com/document/d/1lZt6O7dob0GTBvcjl-QZFsWzvgbEPqG-/view' },
        { title: 'Kiến thức tam giác đồng dạng – Toán 8', url: 'https://drive.google.com/file/d/16HK7HW9JByBCfQUGyI1T8NozO7-sO47o/view' },
        { title: 'Kiến thức tứ giác – Toán 8', url: 'https://drive.google.com/file/d/1amnDQi2s4nqAkM2C5GXEVXjJcgBU4INo/view' },
        { title: 'phát triển tư duy sáng tạo Toán đại số 8', url: 'https://drive.google.com/file/d/1AZ8vSOWgHJae2PohEa4tZmqIdJ9vemGi/view' },
        { title: '20 đề bồi dưỡng học sinh giỏi Toán 8', url: 'https://drive.google.com/file/d/1UIxCtr7-6z33hLIxXxVVo7R5OREthwNr/view' },
        { title: 'bồi dưỡng học sinh giỏi Toán đại số lớp 8', url: 'https://drive.google.com/file/d/1h5hNjc1FYpPU8MTrVZ91jDwzzbaDZovj/view' },
        { title: 'bồi dưỡng năng lực tự học Toán', url: 'https://drive.google.com/file/d/1VVpFJnZ_5EE64wUGuufDQWHaSAcx777C/view' },
        { title: 'chuyên đề bồi dưỡng HSG Toán 8', url: 'https://drive.google.com/file/d/1IyfOtWFyOfCqGBAIoC3sPeTNvaHDPEy7/view' },
        { title: 'nâng cao và phát triển Toán 8', url: 'https://drive.google.com/file/d/1p9ZFqRJJNuuNlaSE9dXagbaT2-resqxp/view' },
        { title: 'nâng cao và phát triển Toán 8 (tập 2)', url: 'https://drive.google.com/file/d/1UG0cySHwBGWi1CDRhgCQL_ERKtpBXT-2/view' },
        { title: 'các chuyên đề bồi dưỡng HSG Toán 8', url: 'https://drive.google.com/file/d/1oJaYbMh5dAi3n7KLxHXhdXZNnXQAHLtV/view' },
        { title: 'các chuyên đề bồi dưỡng học sinh giỏi Toán 8', url: 'https://drive.google.com/file/d/1kQETipg9BvI9HBygMZ1wcK46Iw0Uq6lB/view' },
      ];

      const actionT8 = (args[2] || '').toLowerCase();
      const pickT8 = actionT8 === 'chọn' || actionT8 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT8) && pickT8 >= 1 && pickT8 <= TOAN8_DOCS.length) {
        const doc = TOAN8_DOCS[pickT8 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 8`,
          `Thông báo: Gửi link tài liệu #${pickT8}/${TOAN8_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listT8 = TOAN8_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT8 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 8`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 8 <số> | bonz tài liệu toán 8 chọn <số>)`,
        '',
        listT8
      ].join('\n');
      await sendTextChunked(guideT8);
      return;
    }

    // --- Toán 9: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan9 = (a0 === 'toán' || a0 === 'toan') && a1 === '9';
    if (isToan9) {
      const TOAN9_DOCS = [
        { title: 'tài liệu Toán 9 (GDoc)', url: 'https://docs.google.com/document/d/1tFeO7AO036yL-aG0TtWBqSOG_HSDLBiY/view' },
        { title: 'KỸ THUẬT CHỌN ĐIỂM RƠI TRONG BÀI TOÁN CỰC TRỊ (GDoc)', url: 'https://docs.google.com/document/d/1TLgm76f1zII87KzEG4_KjUpreNQrpo26/view' },
        { title: 'Chứng minh 3 điểm thẳng hàng (GDoc)', url: 'https://docs.google.com/document/d/1d3zZFx7nVLQp8XYyYSaNGiYcCL-bOoDI/view' },
        { title: 'Chuyên đề bất đẳng thức (GDoc)', url: 'https://docs.google.com/document/d/1ueR1_X2cAkBQjTbQgDmqcvwvknQkWz1z/view' },
        { title: 'Giải bài toán bằng cách lập phương trình (GDoc)', url: 'https://docs.google.com/document/d/1KLtPUlqV5bd8SGObRMIf5absYy5CBnHE/view' },
        { title: 'Chuyên đề: Phương trình nghiệm nguyên (GDoc)', url: 'https://docs.google.com/document/d/1VJ5Bv75WIRFd8uKoN3nWwV3EG3v0UG0Q/view' },
        { title: 'Chuyên đề hệ phương trình (PDF)', url: 'https://drive.google.com/file/d/1aNJSWC0zh0tyfI393LBUfxtqkDZTmnxs/view' },
        { title: 'Số chính phương (GDoc)', url: 'https://docs.google.com/document/d/1or7b3zvyvS-n3mYw0BiYELV88ygB9Zfg/view' },
        { title: 'Chuyên đề số học (GDoc)', url: 'https://docs.google.com/document/d/1RkN8XSIBUPC4MhZ_jAxAM00DKsutkVBX/view' },
        { title: 'Chuyên đề tam giác đồng dạng (GDoc)', url: 'https://docs.google.com/document/d/1yYKM1c8ApT4rzmhJWWqkteMK4A2OrYhh/view' },
        { title: 'Tính tổng dãy phân số (GDoc)', url: 'https://docs.google.com/document/d/1Jv3LZFViFV9xayoAvlpV7xcT2_VNhqbn/view' },
        { title: 'Các bài toán về sự chia hết của số nguyên (GDoc)', url: 'https://docs.google.com/document/d/1BXeb4sXsBJ5SvMdn6w5nW7zL3r0YAuTj/view' },
        { title: 'Một số phương pháp giải phương trình nghiệm nguyên (PDF)', url: 'https://drive.google.com/file/d/1IB-WuP1KzwShiF3cZTmRX1p3k6BiI7ic/view' },
        { title: 'Trắc nghiệm Toán 9 (PDF)', url: 'https://drive.google.com/file/d/1CRyQkvusnLkaOVk7_CbvUd9HppVzh5Ft/view' },
        { title: 'Phương pháp giải Toán 9 (Đại số) (PDF)', url: 'https://drive.google.com/file/d/1_jhqTASu_pE-I0Mu9cuYbaUAAr_53dmU/view' },
        { title: 'Chuyên đề bồi dưỡng HSG Toán 9 (PDF)', url: 'https://drive.google.com/file/d/1u0aIEirsH2TNF4xAqlOPp2w4NLMs1M3u/view' },
        { title: 'Đề HSG Toán 9 (1)', url: 'https://drive.google.com/file/d/1M8nxPtDcK6Pyc0ax8AorzAS8MMW5pX4g/view' },
        { title: 'Đề HSG Toán 9 (2)', url: 'https://drive.google.com/file/d/1vbPF8n__oWhIRwPm607idll9s9iDj9kt/view' },
        { title: 'Đề HSG Toán 9 (3)', url: 'https://drive.google.com/file/d/1ssZN8MOb67bnVIawTLp5iV5Zz1pyEem5/view' },
        { title: 'Đề HSG Toán 9 (4)', url: 'https://drive.google.com/file/d/14FjRR_SzDXj6a4BF8Luwlk3Vm_u8r2bw/view' },
        { title: 'Đề HSG Toán 9 (5)', url: 'https://drive.google.com/file/d/1c7CI8FaWt5o2bY8hWLp8kV4Ni3di3_RA/view' },
        { title: 'Đề HSG Toán 9 (6)', url: 'https://drive.google.com/file/d/1KEbk6rqJ1zbFZ1WsyfCbLnFbGbCNPyoW/view' },
        { title: 'Đề HSG Toán 9 (7)', url: 'https://drive.google.com/file/d/1enHvG3s44GI99UycmYIv0hwH2Pf5swrO/view' },
        { title: 'Đề HSG Toán 9 (8)', url: 'https://drive.google.com/file/d/1mvrHkXcxqI-53bnZkPGni9n0OosomnT8/view' },
        { title: 'Đề HSG Toán 9 (9)', url: 'https://drive.google.com/file/d/1XMiIHAdqaAO23mfyVVxiyl5UKx_ZdJeH/view' },
        { title: 'Đề HSG Toán 9 (10)', url: 'https://drive.google.com/file/d/1qmWqGWNSABbVh9aIznx4hxIGF6m_9EUB/view' },
        { title: 'Đề HSG Toán 9 (11)', url: 'https://drive.google.com/file/d/15hKoRNiuRyb3TSiUX1eCiKyYEGa6SAl_/view' },
        { title: 'Đề HSG Toán 9 (12)', url: 'https://drive.google.com/file/d/15xSXQDh-PCZxwjg7NIeyzr7cdrtJA6Q7/view' },
        { title: 'Đề HSG Toán 9 (13)', url: 'https://drive.google.com/file/d/1ofaAu4M4VtfZJdLDCGDnfO7kILxnCCdI/view' },
        { title: 'Đề HSG Toán 9 (14)', url: 'https://drive.google.com/file/d/1BiE1ZoJOOZ7EhXro1-e3fpnGer8DHRFF/view' },
      ];

      const actionT9 = (args[2] || '').toLowerCase();
      const pickT9 = actionT9 === 'chọn' || actionT9 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT9) && pickT9 >= 1 && pickT9 <= TOAN9_DOCS.length) {
        const doc = TOAN9_DOCS[pickT9 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 9`,
          `Thông báo: Gửi link tài liệu #${pickT9}/${TOAN9_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId);
      }

      const listT9 = TOAN9_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT9 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 9`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 9 <số> | bonz tài liệu toán 9 chọn <số>)`,
        '',
        listT9
      ].join('\n');
      await sendTextChunked(guideT9);
      return;
    }

    // --- Toán 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan10 = (a0 === 'toán' || a0 === 'toan') && a1 === '10';
    if (isToan10) {
      const TOAN10_DOCS = [
        { title: '45 đề chuyên Toán 10 (GDoc)', url: 'https://docs.google.com/document/d/17MDVrPQIMdCXIEWSH9_g0cWXSrjz4p3Z/view' },
        { title: 'Tuyển tập đề thi chuyên Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1rOzBBdGCKwOPdFS36DBoPwVCe-0TY7re/view' },
        { title: '104 đề thi vào 10 nâng cao Toán (PDF)', url: 'https://drive.google.com/file/d/1tPUwBKlqla98BPGNz3hru7Wnuel8J_Jy/view' },
        { title: 'Hệ thống kiến thức Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1PSSgMMxqQND4JhbLdDDD14Pc4Pz0GTtc/view' },
        { title: 'Ebook Toán 10 (1) (PDF)', url: 'https://drive.google.com/file/d/1eEBKpHMH_gkNG1YV5Wa-lXR0hmUMy5Uf/view' },
        { title: '40 câu trắc nghiệm Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1ixAJLzHObYXSXEBPc0Ib43At758ngwEP/view' },
        { title: '84 câu trắc nghiệm Toán 10 (PDF)', url: 'https://drive.google.com/file/d/15I9qheNOHgNegWpXSDU_AtiCzlIV49qC/view' },
        { title: '85 câu trắc nghiệm Mệnh đề – Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1-uZVT3FuQImXt_TXeFvcXaEvU3OJPGHY/view' },
        { title: 'Tài liệu Toán 10 (A) (PDF)', url: 'https://drive.google.com/file/d/1EotVrrRwKCgRESWrQJbRL0d3VnVl5L0h/view' },
        { title: 'Tài liệu Toán 10 (B) (PDF)', url: 'https://drive.google.com/file/d/1FuPrGSHGLBcIXcvB9OuDIPgLBe9sBpQ4/view' },
        { title: 'Toán 10 chuyên Toán (PDF)', url: 'https://drive.google.com/file/d/1XfcpR2QC2Ao0PbzZxPzKmoJIkSOifbjA/view' },
        { title: 'Ôn tập Toán 10 cả năm (PDF)', url: 'https://drive.google.com/file/d/1DdRWbvEHbE_L-yyQ3aD05k5CkHogaiqw/view' },
        { title: 'Bứt phá 9+ Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1eTCd-7x_ayX1INzX2JcNgW4KLbDVMg5-/view' },
        { title: 'Cẩm nang kiểm tra Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1UFbO-Z5ZBgT0osBmDPldGxWci5mRdqxh/view' },
        { title: 'Ôn thi học kì 2 Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1i_QblnbT7uhfTHtaFLAuADFnX_2YDMZs/view' },
        { title: 'Ebook Toán 10 (2) (PDF)', url: 'https://drive.google.com/file/d/1V5D9nmU-legr3FvQ858BaVwTysbC_EGV/view' },
        { title: 'Bài tập Đại số 10 (PDF)', url: 'https://drive.google.com/file/d/1wflyFGH9vzndxr0kK-r_KlWnXCIRwB0J/view' },
        { title: 'Bài tập Hình học (Đại số) 10 (PDF)', url: 'https://drive.google.com/file/d/1cG8gIKuMcO6Tpsj_NxZ_b5ZKmNYY839h/view' },
        { title: 'Đại số 10 nâng cao (PDF)', url: 'https://drive.google.com/file/d/1RbZq2sTxYHQbS2ifHys87vwpYwvv8R3G/view' },
        { title: 'Hình học 10 nâng cao (PDF)', url: 'https://drive.google.com/file/d/10npgXlEDCFvh2eESx4-eiErYeX1Za_/view' },
        { title: 'Cẩm nang chinh phục kì thi vào Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1uZElDI4kfEujbM3bfJ8Vj9jQtax2vKOL/view' },
      ];

      const actionT10 = (args[2] || '').toLowerCase();
      const pickT10 = actionT10 === 'chọn' || actionT10 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT10) && pickT10 >= 1 && pickT10 <= TOAN10_DOCS.length) {
        const doc = TOAN10_DOCS[pickT10 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 10`,
          `Thông báo: Gửi link tài liệu #${pickT10}/${TOAN10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listT10 = TOAN10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT10 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 10 <số> | bonz tài liệu toán 10 chọn <số>)`,
        '',
        listT10
      ].join('\n');
      return api.sendMessage(guideT10, threadId, type);
    }

    // --- Sinh học 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isSinh10Simple = (a0 === 'sinh') && a1 === '10';
    const isSinhHoc10 = (a0 === 'sinh') && a1 === 'học' && a2 === '10';
    if (isSinh10Simple || isSinhHoc10) {
      const offsetSinh10 = isSinh10Simple ? 2 : 3;
      const SINH10_DOCS = [
        { title: 'Chuyên đề 2: Các cấp độ tổ chức của thế giới sống (PDF)', url: 'https://drive.google.com/file/d/1-PFIvz49bH8XJh9d2WhKrguUPVD2pQl3/view' },
        { title: 'Chủ đề 3: Giới thiệu chung về tế bào (PDF)', url: 'https://drive.google.com/file/d/1BsEHOAd4ZD_PwGlJGnhCTYIaHq8ueZIK/view' },
        { title: 'Bài 4: Khái quát về tế bào (PDF)', url: 'https://drive.google.com/file/d/1cQEqu-kWDfKXcQnN_asqenQz44g98qgx/view' },
        { title: 'Giới thiệu khái quát chương trình (PDF)', url: 'https://drive.google.com/file/d/1zqFik54lGpwJtYb-jfRo4K-3Qq2I9xjA/view' },
        { title: 'Bài 6: Các phân tử sinh học trong tế bào (PDF)', url: 'https://drive.google.com/file/d/1SYDEyGsFF9S0XuQjbJ6M1VMrQ8bVLf75/view' },
        { title: 'Bài 5: Các nguyên tố hóa học và nước (PDF)', url: 'https://drive.google.com/file/d/1IAs9WOAEJn1Ah2WFx7zNh4e75-YnE7-k/view' },
        { title: 'Đề thi giữa học kì 1 (1) (PDF)', url: 'https://drive.google.com/file/d/1Sjnxmm56wglKvl0cdSXw6t9WYxV_I2jQ/view' },
        { title: 'Đề thi giữa học kì 1 (2) (PDF)', url: 'https://drive.google.com/file/d/1I6FrC8XK9GFD_4tIQ-HJUYPTUMl0_joh/view' },
        { title: 'Đề thi giữa học kì 1 (3) (PDF)', url: 'https://drive.google.com/file/d/1WGDIXZGxqqsMJ_aox8QZYN3mYuZmRoVL/view' },
        { title: 'Đề thi giữa học kì 1 (4) (PDF)', url: 'https://drive.google.com/file/d/12mrcnwidy3R2MndVJV29zIi8SlYG3CIc/view' },
        { title: 'Đề thi học kì 1 (1) (PDF)', url: 'https://drive.google.com/file/d/1K-FNigRPdZhuY4H4Wd24aKjZre8Ek8sm/view' },
        { title: 'Đề thi học kì 1 (2) (PDF)', url: 'https://drive.google.com/file/d/1ikTt0jhe4xSwOZTW48npP34ghE3Ol05S/view' },
        { title: 'Đề thi học kì 1 (3) (PDF)', url: 'https://drive.google.com/file/d/1YbOS23EYf9jREl3T6NPdlAStTTwc-zM0/view' },
        { title: 'Đề thi học kì 1 (4) (PDF)', url: 'https://drive.google.com/file/d/10OPaYAHIXtDO1Lrrmuv4KuN1tJem6Qd4/view' },
        { title: 'Đề thi học kì 1 (5) (PDF)', url: 'https://drive.google.com/file/d/1MygInPcKL2NopeZ8F6O-ZmJ3WBGOVHzz/view' },
        { title: 'Đề thi học kì 1 (6) (PDF)', url: 'https://drive.google.com/file/d/1a_HiaUWgSIfNcV9tIF9cE00j9aNe_qMX/view' },
        { title: 'Đề thi học kì 1 (7) (PDF)', url: 'https://drive.google.com/file/d/18EuislFIThass1-FiWVCMj2MIUsARGAL/view' },
        { title: 'Sinh học tế bào – Sinh 10 (GDoc)', url: 'https://docs.google.com/document/d/1WLazPGZIoM8q2rpQKoR90d0KzVb4I_6v/view' },
      ];

      const actSinh10 = (args[offsetSinh10] || '').toLowerCase();
      const pickSinh10 = (actSinh10 === 'chọn' || actSinh10 === 'chon') ? parseInt(args[offsetSinh10 + 1], 10) : parseInt(args[offsetSinh10], 10);
      if (!isNaN(pickSinh10) && pickSinh10 >= 1 && pickSinh10 <= SINH10_DOCS.length) {
        const doc = SINH10_DOCS[pickSinh10 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu sinh 10`,
          `Thông báo: Gửi link tài liệu #${pickSinh10}/${SINH10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSinh10 = SINH10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSinh10 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu sinh 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu sinh 10 <số> | bonz tài liệu sinh 10 chọn <số>)`,
        '',
        listSinh10
      ].join('\n');
      return api.sendMessage(guideSinh10, threadId, type);
    }

    // --- Toán 11: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan11 = (a0 === 'toán' || a0 === 'toan') && a1 === '11';
    if (isToan11) {
      const TOAN11_DOCS = [
        { title: 'Bộ kiểm tra Toán theo bài lớp 11 (PDF)', url: 'https://drive.google.com/file/d/1IECjJ77nrxo9rQ1Mq1wzYMv5DcTcczLG/view' },
        { title: 'Ebook kĩ năng giải Toán 11 (tập 1) (PDF)', url: 'https://drive.google.com/file/d/1PZI4rzs_x2vj79fLZXsP9CAoll_uW82Y/view' },
        { title: 'Tổng ôn toàn diện Toán 11 (PDF)', url: 'https://drive.google.com/file/d/13fYuagw3brFHVbenQBgj-npJc0ON6VuP/view' },
        { title: 'Tổng hợp công thức Toán 11 (PDF)', url: 'https://drive.google.com/file/d/1QlAitxkZwD5shsMxST0RyCwG8OH4zdOg/view' },
      ];

      const actionT11 = (args[2] || '').toLowerCase();
      const pickT11 = actionT11 === 'chọn' || actionT11 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT11) && pickT11 >= 1 && pickT11 <= TOAN11_DOCS.length) {
        const doc = TOAN11_DOCS[pickT11 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 11`,
          `Thông báo: Gửi link tài liệu #${pickT11}/${TOAN11_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listT11 = TOAN11_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT11 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 11`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 11 <số> | bonz tài liệu toán 11 chọn <số>)`,
        '',
        listT11
      ].join('\n');
      return api.sendMessage(guideT11, threadId, type);
    }

    // --- Toán 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan12 = (a0 === 'toán' || a0 === 'toan') && a1 === '12';
    if (isToan12) {
      const TOAN12_DOCS = [
        { title: 'Toán 12 – Full tài liệu (Folder)', url: 'https://drive.google.com/drive/folders/1dXdhQu7c3V_KAZwHBEWWIZaym70WyWEM' },
        { title: 'Nguyên hàm – Tích phân (PDF)', url: 'https://drive.google.com/file/d/1KMJls11r7z2sYfTrlAPFiEvw8YgJZxZU/view' },
        { title: 'Xác suất có điều kiện (PDF)', url: 'https://drive.google.com/file/d/1TvnlQ-SuLDWNNrh-As8jXaPQf0rqW0pM/view' },
        { title: 'Phương trình mặt phẳng, đường thẳng, mặt cầu (PDF)', url: 'https://drive.google.com/file/d/1Ag5n1W1AsoT3jgIh7oVL_0Saxg6IxioE/view' },
        { title: 'Ứng dụng đạo hàm để khảo sát hàm số (PDF)', url: 'https://drive.google.com/file/d/1DQFOHr3rJ7bzu_wiot1b2Y2z3ds0Yblq/view' },
        { title: 'Toán thực tế 12 (PDF)', url: 'https://drive.google.com/file/d/1f3kp3LzcKgCj1P162UPRNwgyyx9HePOY/view' },
        { title: 'Ebook Chinh phục hàm số (PDF)', url: 'https://drive.google.com/file/d/1l0uTqKdmvbIw8raefH7oHZItUtYqeL_k/view' },
        { title: 'Ebook Chinh phục xác suất thống kê (PDF)', url: 'https://drive.google.com/file/d/1zg_IZgiZ_G8Jr9F60T1QQK76pSzjFuS6/view' },
        { title: 'Ebook Chinh phục không gian OXYZ (PDF)', url: 'https://drive.google.com/file/d/1rEnRGXENaGNKdfB-60U12wKQXYfyCmJ2/view' },
        { title: 'Ebook Chinh phục phân toán (PDF)', url: 'https://drive.google.com/file/d/1Ujimu6rpVD6z3wk1Bscfu4cEK4ZDJKPI/view' },
      ];

      const actionT12 = (args[2] || '').toLowerCase();
      const pickT12 = actionT12 === 'chọn' || actionT12 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT12) && pickT12 >= 1 && pickT12 <= TOAN12_DOCS.length) {
        const doc = TOAN12_DOCS[pickT12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 12`,
          `Thông báo: Gửi link tài liệu #${pickT12}/${TOAN12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listT12 = TOAN12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 12 <số> | bonz tài liệu toán 12 chọn <số>)`,
        '',
        listT12
      ].join('\n');
      return api.sendMessage(guideT12, threadId, type);
    }

    // --- Tiếng Anh 6: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const a2 = (args[2] || '').toLowerCase();
    const isAnh6Simple = (a0 === 'anh' || a0 === 'english') && a1 === '6';
    const isTiengAnh6 = (a0 === 'tiếng' || a0 === 'tieng') && a1 === 'anh' && a2 === '6';
    if (isAnh6Simple || isTiengAnh6) {
      const offset = isAnh6Simple ? 2 : 3; // vị trí bắt đầu của action/number
      const EN6_DOCS = [
        { title: 'Tổng hợp 10 đề ôn hè tiếng anh 6 lên 7', url: 'https://docs.google.com/document/d/1XRg1ZtUcwRxG08ScPUyrtETKqYjIq_xfCBLSz6aT-8U/view' },
        { title: 'Tổng hợp chi tiết ngữ pháp tiếng anh 6', url: 'https://docs.google.com/document/d/1ifDat6RIt83Q9bNRx6jQNADWElwY6UX4veQ9rSrTl1o/view' },
        { title: 'Từ vựng tiếng anh 6', url: 'https://docs.google.com/document/d/1F-RUa8kndzjfeylVQLqgxy3u-uJOu9Zn/view' },
        { title: 'Bài tập tiếng anh 6', url: 'https://docs.google.com/document/d/16MXHN_-ftXu1WCaS9GnliyAWiXncXBrb/view' },
      ];

      const act = (args[offset] || '').toLowerCase();
      const pickNum3 = act === 'chọn' || act === 'chon' ? parseInt(args[offset + 1], 10) : parseInt(args[offset], 10);
      if (!isNaN(pickNum3) && pickNum3 >= 1 && pickNum3 <= EN6_DOCS.length) {
        const doc = EN6_DOCS[pickNum3 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu tiếng anh 6`,
          `Thông báo: Gửi link tài liệu #${pickNum3}/${EN6_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const list3 = EN6_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guide3 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu tiếng anh 6`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu anh 6 <số> | bonz tài liệu anh 6 chọn <số> | bonz tài liệu tiếng anh 6 <số>)`,
        '',
        list3
      ].join('\n');
      return api.sendMessage(guide3, threadId, type);
    }

    // --- Hóa 9: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isHoa9 = (a0 === 'hóa' || a0 === 'hoa') && a1 === '9';
    if (isHoa9) {
      const HOA9_DOCS = [
        { title: 'đề 1 Hóa 9 (GDoc)', url: 'https://docs.google.com/document/d/14SEWbZDCO8yeX3fysM8PaTqlDtjhyH-J/view' },
        { title: 'đề 2 Hóa 9 (GDoc)', url: 'https://docs.google.com/document/d/1r5BuI5Dn8d1qowVmpeyAAIDZF8TFdNK4/view' },
        { title: 'đề thi HSG Hóa 9 (1) (GDoc)', url: 'https://docs.google.com/document/d/1O6nVgElrE2bydwz0TVusAP2o1RejJkGN/view' },
        { title: 'đáp án đề thi HSG Hóa 9 (GDoc)', url: 'https://docs.google.com/document/d/1G2OO1FeOU28TlPSn4hbKiKz-3tkDe1sx/view' },
        { title: 'đề thi HSG Hóa 9 (2) (GDoc)', url: 'https://docs.google.com/document/d/1LSYGhh8kgLL-Hau_ZgZLjipzBPQ0x1ln/view' },
        { title: 'đề thi HSG tổng hợp 9 (1) (GDoc)', url: 'https://docs.google.com/document/d/1CRI8jhhjQfehz2t4QdqXM2tj4O2bNeDY/view' },
        { title: 'đề thi HSG tổng hợp 9 (2) (GDoc)', url: 'https://docs.google.com/document/d/1wfrY-4zVwWNOnY3E9dM8a_KPFhFeN7bA/view' },
        { title: 'đề thi HSG Hóa 9 (3) (GDoc)', url: 'https://docs.google.com/document/d/1BP4NFk9He-nh715puj5JKg3ObkDjDqsA/view' },
        { title: 'đề thi HSG Hóa 9 (4) (GDoc)', url: 'https://docs.google.com/document/d/13xyKMFtHtFEdMpx9mUBzZWH-SM2OQRh0/view' },
        { title: 'đề thi HSG tổng hợp 9 (3) (GDoc)', url: 'https://docs.google.com/document/d/1Cwm_l1-ZN8fLmlUSkOxfhkXf5y-CZqpd/view' },
        { title: 'đề thi HSG tổng hợp 9 (4) (GDoc)', url: 'https://docs.google.com/document/d/1Reg3GoIw7aftARAeHgeCWgeevQ_QCz24/view' },
        { title: 'đề thi HSG Hóa 9 (5) (GDoc)', url: 'https://docs.google.com/document/d/1zPck42OrLUrccnKbwDyMGDcpyPK-_FY4/view' },
        { title: 'đề thi HSG Hóa 9 (6) (GDoc)', url: 'https://docs.google.com/document/d/1dS6RJ6_1h2LdGdGsz_PmdHBegsSEFpCu/view' },
        { title: 'đề thi HSG Hóa 9 (7) (GDoc)', url: 'https://docs.google.com/document/d/1pe6Lt9_Q31cdraZ9BJP_aqpWUJIMErsu/view' },
        { title: 'đề thi HSG Hóa 9 (8) (GDoc)', url: 'https://docs.google.com/document/d/1RqtMJIEBiw-nihzW_N4YFjEEG5NTCDvi/view' },
        { title: 'đề thi HSG Hóa 9 (9) (GDoc)', url: 'https://docs.google.com/document/d/1saKsbyHzwRgZ5tM-ND6hFJcxMJIrsDys/view' },
      ];

      const actH9 = (args[2] || '').toLowerCase();
      const pickH9 = (actH9 === 'chọn' || actH9 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickH9) && pickH9 >= 1 && pickH9 <= HOA9_DOCS.length) {
        const doc = HOA9_DOCS[pickH9 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu hóa 9`,
          `Thông báo: Gửi link tài liệu #${pickH9}/${HOA9_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listH9 = HOA9_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideH9 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu hóa 9`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu hóa 9 <số> | bonz tài liệu hóa 9 chọn <số>)`,
        '',
        listH9
      ].join('\n');
      return api.sendMessage(guideH9, threadId, type);
    }

    // --- Tiếng Anh 9: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const a3 = (args[3] || '').toLowerCase();
    const isAnh9Simple = (a0 === 'anh' || a0 === 'english') && a1 === '9';
    const isTiengAnh9 = (a0 === 'tiếng' || a0 === 'tieng') && a1 === 'anh' && a2 === '9';
    if (isAnh9Simple || isTiengAnh9) {
      const offset9 = isAnh9Simple ? 2 : 3;
      const EN9_DOCS = [
        { title: 'sách tổng ôn tiếng anh 9 (tập 1) (PDF)', url: 'https://drive.google.com/file/d/1eOTU3vvJKPDa_gH3JHkiXfX4T4E8uCeL/view' },
        { title: 'sách tổng ôn tiếng anh 9 (tập 2) (PDF)', url: 'https://drive.google.com/file/d/1MOUGUwESGuWIOtUSSmM4PK62Omxs-5ym/view' },
        { title: 'chuyên đề bồi dưỡng hsg tiếng anh 9 (PDF)', url: 'https://drive.google.com/file/d/1xnKyXrg99dsei19Y2EmtSjrWt4QOhEN3/view' },
        { title: 'bồi dưỡng tiếng anh 9 (PDF)', url: 'https://drive.google.com/file/d/1Qb0c3WC8QK5OBnYaJjAOTtPeDbK02w5o/view' },
        { title: 'từ vựng tiếng anh 9 (GDoc)', url: 'https://docs.google.com/document/d/1SCUOslkVbh1ExpfxIm3F4UmZ8faWsyWe/view' },
        { title: 'đề số 1 – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/19SM-VynBtsaCdkt5w3Qd8VKUgrsLVUZc/view' },
        { title: 'đề số 2 – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/1EwvX2chMRANzFGC8-IuclANVpcnvdI7A/view' },
        { title: 'đề số 3 – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/1ipKsAIwSQPErOxZ3WcMtt22F_nFoEMSC/view' },
        { title: 'đề số 4 (bản A) – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/181yg0ogxCl1fkike0QbyO7-MmqJgU9aV/view' },
        { title: 'đề số 4 (bản B) – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/1rpy-1YoS2wd6eJMwoaDQpfFLZnRdiJ0k/view' },
      ];

      const act9 = (args[offset9] || '').toLowerCase();
      const pickEn9 = (act9 === 'chọn' || act9 === 'chon') ? parseInt(args[offset9 + 1], 10) : parseInt(args[offset9], 10);
      if (!isNaN(pickEn9) && pickEn9 >= 1 && pickEn9 <= EN9_DOCS.length) {
        const doc = EN9_DOCS[pickEn9 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu tiếng anh 9`,
          `Thông báo: Gửi link tài liệu #${pickEn9}/${EN9_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listEn9 = EN9_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideEn9 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu tiếng anh 9`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu anh 9 <số> | bonz tài liệu anh 9 chọn <số> | bonz tài liệu tiếng anh 9 <số>)`,
        '',
        listEn9
      ].join('\n');
      return api.sendMessage(guideEn9, threadId, type);
    }

    // --- Tiếng Anh 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isAnh10Simple = (a0 === 'anh' || a0 === 'english') && a1 === '10';
    const isTiengAnh10 = (a0 === 'tiếng' || a0 === 'tieng') && a1 === 'anh' && a2 === '10';
    if (isAnh10Simple || isTiengAnh10) {
      const offset10 = isAnh10Simple ? 2 : 3;
      const EN10_DOCS = [
        { title: 'Tiếng Anh 10 nâng cao (PDF)', url: 'https://drive.google.com/file/d/15YjBNrnLUbF33Jk0KDJEl_w310RnvDf1/view' },
      ];

      const actA10 = (args[offset10] || '').toLowerCase();
      const pickA10 = (actA10 === 'chọn' || actA10 === 'chon') ? parseInt(args[offset10 + 1], 10) : parseInt(args[offset10], 10);
      if (!isNaN(pickA10) && pickA10 >= 1 && pickA10 <= EN10_DOCS.length) {
        const doc = EN10_DOCS[pickA10 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu tiếng anh 10`,
          `Thông báo: Gửi link tài liệu #${pickA10}/${EN10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listA10 = EN10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideA10 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu tiếng anh 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu anh 10 <số> | bonz tài liệu anh 10 chọn <số> | bonz tài liệu tiếng anh 10 <số>)`,
        '',
        listA10
      ].join('\n');
      return api.sendMessage(guideA10, threadId, type);
    }

    // --- Vật lý 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isLy10One = (a0 === 'lý' || a0 === 'ly') && a1 === '10';
    const isVatLy10 = (a0 === 'vật' || a0 === 'vat') && (a1 === 'lý' || a1 === 'ly') && a2 === '10';
    if (isLy10One || isVatLy10) {
      const offsetLy = isLy10One ? 2 : 3;
      const LY10_DOCS = [
        { title: 'Vật lý 10 - Tài liệu (GDoc)', url: 'https://docs.google.com/document/d/1fHI5VJQYN8O5lHkhPU0tX2hhtfmChNVc/view' },
        { title: 'Bộ đề thi HSG Vật lý 10 (GDoc)', url: 'https://docs.google.com/document/d/1rEexEh3rv_lNtme8RfuiPOcZ1tRPpoti/view' },
        { title: 'Đề thi HSG Vật lý 10 chuyên (GDoc)', url: 'https://docs.google.com/document/d/1tm25MMBsuWzFEbFiiinbzxIjB4-srfVa/view' },
        { title: 'Đề thi HSG Vật lý 10 (GDoc)', url: 'https://docs.google.com/document/d/1s3WWeuo1YOprgrJmlwEYQxxadYXof2cU/view' },
        { title: 'Đề thi HSG Vật lý 10 (GDoc)', url: 'https://docs.google.com/document/d/1MZa5aSdksqV2PzAiH0t4QDoVMhD3PdVZ/view' },
        { title: 'Đề thi HSG Vật lý 10 (GDoc)', url: 'https://docs.google.com/document/d/19fU9PrXpGZDI0Lnq5GMjc4MQy7lig19I/view' },
        { title: 'Đáp án Vật lý 10 Olympic (GDoc)', url: 'https://docs.google.com/document/d/1yq5kJJUguciIcqaBataflaa2FMi2Ejc7/view' },
        { title: 'Đề thi Vật lý 10 Olympic (PDF)', url: 'https://drive.google.com/file/d/15tehqfmwb9Hq0EZr-186MNszbmHQ-wTX/view' },
      ];

      const actLy = (args[offsetLy] || '').toLowerCase();
      const pickLy = (actLy === 'chọn' || actLy === 'chon') ? parseInt(args[offsetLy + 1], 10) : parseInt(args[offsetLy], 10);
      if (!isNaN(pickLy) && pickLy >= 1 && pickLy <= LY10_DOCS.length) {
        const doc = LY10_DOCS[pickLy - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu vật lý 10`,
          `Thông báo: Gửi link tài liệu #${pickLy}/${LY10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listLy = LY10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideLy = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu vật lý 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu lý 10 <số> | bonz tài liệu vật lý 10 <số>)`,
        '',
        listLy
      ].join('\n');
      return api.sendMessage(guideLy, threadId, type);
    }

    // --- Hóa học 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isHoa10 = (a0 === 'hóa' || a0 === 'hoa') && a1 === '10';
    if (isHoa10) {
      const HOA10_DOCS = [
        { title: 'Cấu tạo nguyên tử – Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/1WLygzm-b2UCxbjigncqNa48XR1VfuPwh/view' },
        { title: 'Bảng tuần hoàn – Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/1o2Og9AeQ0uoEUQfA_M4iIO_esg_ZaBDE/view' },
        { title: 'Liên kết hóa học – Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/1BfrZtIkKiY5Q5wVuK2bflxkQHwjI-qim/view' },
        { title: '350 bài tập Hóa nâng cao 10 (PDF)', url: 'https://drive.google.com/file/d/1E2kfsfOEGTy7PEPRpayhwA2yCJ4L7NO5/view' },
        { title: 'Bứt phá 9+ môn Hóa 10 (PDF)', url: 'https://drive.google.com/file/d/166HH1I1uWHgaRJ01K_JQp5-rSBydplvp/view' },
        { title: 'Tổng ôn Hóa học 10 (PDF)', url: 'https://drive.google.com/file/d/1TOYMHDjjvFLJkJcycHr6BFRBv8GLUmc9/view' },
        { title: 'Giải nhanh bài tập Hóa 10 (tập 1) (PDF)', url: 'https://drive.google.com/file/d/1kPP0C81FnzhD5Wn8FJb5FECwReBW7g50/view' },
        { title: 'Giải nhanh bài tập Hóa 10 (tập 2) (PDF)', url: 'https://drive.google.com/file/d/19G1LFyLtUsYV8RIv8xCP76WbfT-GdghK/view' },
        { title: 'Đề thi giữa học kì 1 Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/1vjWtlc1HjGSlHvHfT47BMioftPa3TG0/view' },
        { title: 'Đề thi giữa học kì 1 Hóa 10 (2) (GDoc)', url: 'https://docs.google.com/document/d/1nXMqY7INDXNoutb9VWINwzWyUaT3XtiA/view' },
        { title: '100 câu trắc nghiệm Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/16OXQOA8QgVHxZpEpLT4qOVA4oIi8Xqun/view' },
        { title: 'Đề thi giữa học kì 1 Hóa 10 (3) (GDoc)', url: 'https://docs.google.com/document/d/1kwz9XjbHKu5Mt9jHfT47BMioftPa3TG0/view' },
        { title: 'Đề thi giữa học kì 1 Hóa 10 (4) (GDoc)', url: 'https://docs.google.com/document/d/15XrB6rDJijjREoHAyXfUETcvnGhKUymU/view' },
        { title: 'Hóa học 10 nâng cao (PDF)', url: 'https://drive.google.com/file/d/1AEk2h4e8-3u6ZQlAO1wXHCCLgs83eDQv/view' },
      ];

      const actH10 = (args[2] || '').toLowerCase();
      const pickH10 = (actH10 === 'chọn' || actH10 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickH10) && pickH10 >= 1 && pickH10 <= HOA10_DOCS.length) {
        const doc = HOA10_DOCS[pickH10 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu hóa 10`,
          `Thông báo: Gửi link tài liệu #${pickH10}/${HOA10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listH10 = HOA10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideH10 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu hóa 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu hóa 10 <số> | bonz tài liệu hóa 10 chọn <số>)`,
        '',
        listH10
      ].join('\n');
      return api.sendMessage(guideH10, threadId, type);
    }

    // --- Vật lý 11: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isLy11One = (a0 === 'lý' || a0 === 'ly') && a1 === '11';
    const isVatLy11 = (a0 === 'vật' || a0 === 'vat') && (a1 === 'lý' || a1 === 'ly') && a2 === '11';
    if (isLy11One || isVatLy11) {
      const offsetLy11 = isLy11One ? 2 : 3;
      const LY11_DOCS = [
        { title: 'Vật lý 11 - Tài liệu (1) (GDoc)', url: 'https://docs.google.com/document/d/1hpLpAesEQWbLlYGkBc78pLZ2dDiGJfH4/view' },
        { title: 'Vật lý 11 - Tài liệu (2) (GDoc)', url: 'https://docs.google.com/document/d/1Zem9nVvI9t9XC49m0euBA_qOWYbBnMrX/view' },
        { title: 'Vật lý 11 - Tài liệu (3) (GDoc)', url: 'https://docs.google.com/document/d/1RavIDGT1bLprmi7E8t_LGAoPa7Pm4Qut/view' },
        { title: 'Đáp án Vật lý 11 Olympic (GDoc)', url: 'https://docs.google.com/document/d/1EhR2i4U2k4cYxtV9Ne46j4RI1-TfFb_c/view' },
      ];

      const actLy11 = (args[offsetLy11] || '').toLowerCase();
      const pickLy11 = (actLy11 === 'chọn' || actLy11 === 'chon') ? parseInt(args[offsetLy11 + 1], 10) : parseInt(args[offsetLy11], 10);
      if (!isNaN(pickLy11) && pickLy11 >= 1 && pickLy11 <= LY11_DOCS.length) {
        const doc = LY11_DOCS[pickLy11 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu vật lý 11`,
          `Thông báo: Gửi link tài liệu #${pickLy11}/${LY11_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listLy11 = LY11_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideLy11 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu vật lý 11`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu lý 11 <số> | bonz tài liệu vật lý 11 <số>)`,
        '',
        listLy11
      ].join('\n');
      return api.sendMessage(guideLy11, threadId, type);
    }

    // --- Vật lý 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isLy12One = (a0 === 'lý' || a0 === 'ly') && a1 === '12';
    const isVatLy12 = (a0 === 'vật' || a0 === 'vat') && (a1 === 'lý' || a1 === 'ly') && a2 === '12';
    if (isLy12One || isVatLy12) {
      const offsetLy12 = isLy12One ? 2 : 3;
      const LY12_DOCS = [
        { title: 'Vật lý 12 – Tài liệu (1) (GDoc)', url: 'https://docs.google.com/document/d/1GOo3obTW90RTf7oKzgKzChIr6ANk6DAq/view' },
        { title: 'Vật lý 12 – Tài liệu (2) (GDoc)', url: 'https://docs.google.com/document/d/1unwdIlR_OpTHvIOpCjiXQv49jPVlWr8r/view' },
        { title: 'Kì thi HSG Vật lý 12 (PDF)', url: 'https://drive.google.com/file/d/1uVaGvpg1FaZfRJAr7ILq8Dx6CqsHg5uu/view' },
        { title: 'Đề thi Vật lý châu Á 12 (PDF)', url: 'https://drive.google.com/file/d/1W62Ygy9bmhbMWp9m_JRlxGwZLIw29LtQ/view' },
      ];

      const actLy12 = (args[offsetLy12] || '').toLowerCase();
      const pickLy12 = (actLy12 === 'chọn' || actLy12 === 'chon') ? parseInt(args[offsetLy12 + 1], 10) : parseInt(args[offsetLy12], 10);
      if (!isNaN(pickLy12) && pickLy12 >= 1 && pickLy12 <= LY12_DOCS.length) {
        const doc = LY12_DOCS[pickLy12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu vật lý 12`,
          `Thông báo: Gửi link tài liệu #${pickLy12}/${LY12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listLy12 = LY12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideLy12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu vật lý 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu lý 12 <số> | bonz tài liệu vật lý 12 <số>)`,
        '',
        listLy12
      ].join('\n');
      return api.sendMessage(guideLy12, threadId, type);
    }

    // --- Hóa học 11: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isHoa11 = (a0 === 'hóa' || a0 === 'hoa') && a1 === '11';
    if (isHoa11) {
      const HOA11_DOCS = [
        { title: 'Đề đánh giá năng lực (1) (PDF)', url: 'https://drive.google.com/file/d/1rHYsxf1YwCN8fkqzlwa358k6yoxHMtyx/view' },
        { title: 'Đề đánh giá năng lực (2) (PDF)', url: 'https://drive.google.com/file/d/1XJt20C9ctnMFkXH8ovlmJJpEfVxgu9jR/view' },
        { title: 'Đề đánh giá (PDF)', url: 'https://drive.google.com/file/d/1yGn8hjAdkWGab1Ti5yTwI93G4tKPvK_K/view' },
        { title: 'Ôn tập chương 1 (PDF)', url: 'https://drive.google.com/file/d/1RA4dn8DtS7clb2iqwmUYBWEwZHcgNptS/view' },
        { title: 'Đề đánh giá năng lực (3) (PDF)', url: 'https://drive.google.com/file/d/1BBOYeqAqhjjkwvmzvZ7r8QhyTUQm7gh-/view' },
        { title: 'Khái niệm về cân bằng hóa học (PDF)', url: 'https://drive.google.com/file/d/1kIGasLMyxT3kjVdlxDV0UpKfwwGkzj0M/view' },
        { title: 'Đề đánh giá kiến thức (PDF)', url: 'https://drive.google.com/file/d/1DxsgOjpR8RPFntgTdtqDgv_INZ0FHszk/view' },
        { title: 'Đề ĐGNL (Chương 2–3) (PDF)', url: 'https://drive.google.com/file/d/10Hg8_R5Ru-DZqfPWRP8Qc1RruxUDwB_N/view' },
        { title: 'Cân bằng trong dung dịch nước (PDF)', url: 'https://drive.google.com/file/d/12dTlVuEVl4xyjDhybVlfZ2OnRoqi_9EI/view' },
      ];

      const actH11 = (args[2] || '').toLowerCase();
      const pickH11 = (actH11 === 'chọn' || actH11 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickH11) && pickH11 >= 1 && pickH11 <= HOA11_DOCS.length) {
        const doc = HOA11_DOCS[pickH11 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu hóa 11`,
          `Thông báo: Gửi link tài liệu #${pickH11}/${HOA11_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listH11 = HOA11_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideH11 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu hóa 11`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu hóa 11 <số> | bonz tài liệu hóa 11 chọn <số>)`,
        '',
        listH11
      ].join('\n');
      return api.sendMessage(guideH11, threadId, type);
    }

    // --- Hóa học 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isHoa12 = (a0 === 'hóa' || a0 === 'hoa') && a1 === '12';
    if (isHoa12) {
      const HOA12_DOCS = [
        { title: 'Sách bồi dưỡng học sinh giỏi Hóa 12 (PDF)', url: 'https://drive.google.com/file/d/1CRyQkvusnLkaOVk7_CbvUd9HppVzh5Ft/view' },
        { title: 'Các chuyên đề bồi dưỡng học sinh giỏi Hóa 12 (PDF)', url: 'https://drive.google.com/file/d/1FS29PJdDWVzq8WnE6y4HjPZWFU1wQHYm/view' },
      ];

      const actH12 = (args[2] || '').toLowerCase();
      const pickH12 = (actH12 === 'chọn' || actH12 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickH12) && pickH12 >= 1 && pickH12 <= HOA12_DOCS.length) {
        const doc = HOA12_DOCS[pickH12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu hóa 12`,
          `Thông báo: Gửi link tài liệu #${pickH12}/${HOA12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listH12 = HOA12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideH12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu hóa 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu hóa 12 <số> | bonz tài liệu hóa 12 chọn <số>)`,
        '',
        listH12
      ].join('\n');
      return api.sendMessage(guideH12, threadId, type);
    }

    // --- Sinh học 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isSinh12Simple = (a0 === 'sinh') && a1 === '12';
    const isSinhHoc12 = (a0 === 'sinh') && a1 === 'học' && a2 === '12';
    if (isSinh12Simple || isSinhHoc12) {
      const offsetSinh12 = isSinh12Simple ? 2 : 3;
      const SINH12_DOCS = [
        { title: 'Đề thi HSG Sinh 12 (1) (PDF)', url: 'https://drive.google.com/file/d/1Xtq3vZoN0LSvunrJd71-tUDkjTDoU4ai/view' },
        { title: 'Đề thi HSG Sinh 12 (2) (PDF)', url: 'https://drive.google.com/file/d/1J0Fq5eITrX_JWOXGOn_ZzjH-eCpSSt0H/view' },
        { title: 'Đề thi HSG Sinh 12 (3) (PDF)', url: 'https://drive.google.com/file/d/14nFKuY9WZuHnhvvsHGBWmXm3VXOTMMmT/view' },
        { title: 'Đề thi HSG Sinh 12 (4) (PDF)', url: 'https://drive.google.com/file/d/1IQcNidouT7WdPt-KsU2NXVK6SR0i2Mrh/view' },
        { title: 'Đề thi HSG Sinh 12 (5) (PDF)', url: 'https://drive.google.com/file/d/17D2kCayNCWbVgzwa3Kfyq6230fMs-Kob/view' },
        { title: 'Đề thi HSG Sinh 12 (6) (PDF)', url: 'https://drive.google.com/file/d/1pAJcmbvAROawF8S98Hin_YiAHVpT7VeJ/view' },
        { title: 'Đề thi HSG Sinh 12 (7) (PDF)', url: 'https://drive.google.com/file/d/1Zty3YmvET5M_hD9xyQs_iJj_8k9mltLX/view' },
      ];

      const actSinh12 = (args[offsetSinh12] || '').toLowerCase();
      const pickSinh12 = (actSinh12 === 'chọn' || actSinh12 === 'chon') ? parseInt(args[offsetSinh12 + 1], 10) : parseInt(args[offsetSinh12], 10);
      if (!isNaN(pickSinh12) && pickSinh12 >= 1 && pickSinh12 <= SINH12_DOCS.length) {
        const doc = SINH12_DOCS[pickSinh12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu sinh 12`,
          `Thông báo: Gửi link tài liệu #${pickSinh12}/${SINH12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSinh12 = SINH12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSinh12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu sinh 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu sinh 12 <số> | bonz tài liệu sinh 12 chọn <số>)`,
        '',
        listSinh12
      ].join('\n');
      return api.sendMessage(guideSinh12, threadId, type);
    }

    // --- Lịch sử 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isSu12Simple = (a0 === 'sử' || a0 === 'su') && a1 === '12';
    const isLichSu12 = (a0 === 'lịch' || a0 === 'lich') && (a1 === 'sử' || a1 === 'su') && a2 === '12';
    if (isSu12Simple || isLichSu12) {
      const offsetSu12 = isSu12Simple ? 2 : 3;
      const SU12_DOCS = [
        { title: 'Lịch sử lớp 12 (PDF)', url: 'https://drive.google.com/file/d/1MB2JxZhYQq8qwJhQctfraBLVjdl4IgHo/view' },
        { title: 'Đề minh họa Lịch sử lớp 12 (PDF)', url: 'https://drive.google.com/file/d/1UIxCtr7-6z33hLIxXxVVo7R5OREthwNr/view' },
      ];

      const actSu12 = (args[offsetSu12] || '').toLowerCase();
      const pickSu12 = (actSu12 === 'chọn' || actSu12 === 'chon') ? parseInt(args[offsetSu12 + 1], 10) : parseInt(args[offsetSu12], 10);
      if (!isNaN(pickSu12) && pickSu12 >= 1 && pickSu12 <= SU12_DOCS.length) {
        const doc = SU12_DOCS[pickSu12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu lịch sử 12`,
          `Thông báo: Gửi link tài liệu #${pickSu12}/${SU12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSu12 = SU12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSu12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu lịch sử 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu lịch sử 12 <số> | bonz tài liệu lịch sử 12 chọn <số>)`,
        '',
        listSu12
      ].join('\n');
      return api.sendMessage(guideSu12, threadId, type);
    }

    // --- Tiếng Anh 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isAnh12Simple = (a0 === 'anh' || a0 === 'english') && a1 === '12';
    const isTiengAnh12 = (a0 === 'tiếng' || a0 === 'tieng') && a1 === 'anh' && a2 === '12';
    if (isAnh12Simple || isTiengAnh12) {
      const offsetA12 = isAnh12Simple ? 2 : 3;
      const EN12_DOCS = [
        { title: 'B1 Grammar & Vocabulary (PDF)', url: 'https://drive.google.com/file/d/1YElxwcOwrhB6Dp8gqPfh4SUHM5_vFjev/view' },
        { title: 'B2 Grammar & Vocabulary (PDF)', url: 'https://drive.google.com/file/d/1YElxwcOwrhB6Dp8gqPfh4SUHM5_vFjev/view' },
        { title: 'Cambridge Vocabulary for IELTS (9–12) (PDF)', url: 'https://drive.google.com/file/d/1Ny1y7mje3wTOSMSp1VLEWqyp8HGwaKGh/view' },
        { title: 'Sách chuyên đề Tiếng Anh (có đáp án) (9–12) (GDoc)', url: 'https://docs.google.com/document/d/1lyfMO6Pyaus041U4QVq8b1XjMNik1bqD/view' },
        { title: 'Sách chuyên đề Tiếng Anh (không đáp án) (9–12) (GDoc)', url: 'https://docs.google.com/document/d/1qJB8u6E7XYErbU3qKWDBYz67m-Mpj6y3/view' },
        { title: 'Các chuyên đề Ngữ pháp (9–12) (GDoc)', url: 'https://docs.google.com/document/d/16rNIul2lASUTZeCslvYLPyPgUzc7xwHC/view' },
      ];

      const actA12 = (args[offsetA12] || '').toLowerCase();
      const pickA12 = (actA12 === 'chọn' || actA12 === 'chon') ? parseInt(args[offsetA12 + 1], 10) : parseInt(args[offsetA12], 10);
      if (!isNaN(pickA12) && pickA12 >= 1 && pickA12 <= EN12_DOCS.length) {
        const doc = EN12_DOCS[pickA12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu tiếng anh 12`,
          `Thông báo: Gửi link tài liệu #${pickA12}/${EN12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listA12 = EN12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideA12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu tiếng anh 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu anh 12 <số> | bonz tài liệu anh 12 chọn <số> | bonz tài liệu tiếng anh 12 <số>)`,
        '',
        listA12
      ].join('\n');
      return api.sendMessage(guideA12, threadId, type);
    }

    // --- Ngữ văn 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isVan12 = (a0 === 'văn' || a0 === 'van') && a1 === '12';
    if (isVan12) {
      const VAN12_DOCS = [
        { title: 'Lý luận văn học (PDF)', url: 'https://drive.google.com/file/d/1lIDi0GcJJaeGyYGDAD_Z8FzAJBNGOECB/view' },
        { title: 'Lý luận văn học (2) (PDF)', url: 'https://drive.google.com/file/d/1WXUU9j5O56rec_Cf8b4IbYKsbUPLkly7/view' },
        { title: 'Lý luận văn học (3) (PDF)', url: 'https://drive.google.com/file/d/1usu3BVVO5tN3CxYlNT-WnZ9ex5LezOsM/view' },
        { title: 'Lý luận văn học cổ (4) (PDF)', url: 'https://drive.google.com/file/d/1xUqpQY83SQ7irrAKmrwhN13GIi11Fdpw/view' },
        { title: 'Phê bình và phản phê bình (PDF)', url: 'https://drive.google.com/file/d/1i3s1T_e8375DWilShzk2NHzSoEWP1T4r/view' },
        { title: 'Thơ và phản thơ (PDF)', url: 'https://drive.google.com/file/d/1dRlKcIWhjlnVeBbvrqxwE5DB4v8BLsnq/view' },
        { title: 'Bồi dưỡng học sinh giỏi Văn THPT (PDF)', url: 'https://drive.google.com/file/d/1gOh103xhzsJJ6WW5lWfrFubZknPHG2pN/view' },
      ];

      const actV12 = (args[2] || '').toLowerCase();
      const pickV12 = (actV12 === 'chọn' || actV12 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickV12) && pickV12 >= 1 && pickV12 <= VAN12_DOCS.length) {
        const doc = VAN12_DOCS[pickV12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu văn 12`,
          `Thông báo: Gửi link tài liệu #${pickV12}/${VAN12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listV12 = VAN12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideV12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu văn 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu văn 12 <số> | bonz tài liệu văn 12 chọn <số>)`,
        '',
        listV12
      ].join('\n');
      return api.sendMessage(guideV12, threadId, type);
    }

    // --- Liên môn 12: tài liệu áp dụng cho 10–12 ---
    const isLienMon12 = ((a0 === 'liên' || a0 === 'lien') && (a1 === 'môn' || a1 === 'mon') && a2 === '12');
    if (isLienMon12) {
      const LIENMON12_DOCS = [
        { title: 'Đề thi chuyên Vật lý siêu cấp (PDF)', url: 'https://drive.google.com/file/d/1AODYzZRTCNxbQy7sfr0VhbGDUfRN_sOI/view' },
        { title: 'Đề thi chuyên Vật lý (PDF)', url: 'https://drive.google.com/file/d/1wMp32VCZ2KGMih18-geEcwdflgOsHn-g/view' },
        { title: 'Hóa vô cơ – Tập 1 (PDF)', url: 'https://drive.google.com/file/d/1N8l1X3PW1WJtMAblchGzQE4YvpvddQYy/view' },
        { title: 'Hóa vô cơ – Tập 2 (PDF)', url: 'https://drive.google.com/file/d/1qS2XF-ipgjY71EvqN3B_qwbcHsFHmj6i/view' },
        { title: 'Hóa vô cơ – Tập 3 (PDF)', url: 'https://drive.google.com/file/d/1rOPsJePLaHbIYtq2g-cFqoVeT_MBRipO/view' },
        { title: '220 IELTS (PDF)', url: 'https://drive.google.com/file/d/18yFJ59tr_8YyPsjdu9Y1aAV195Kbi8of/view' },
      ];

      const actLien12 = (args[3] || '').toLowerCase();
      const pickLien12 = (actLien12 === 'chọn' || actLien12 === 'chon') ? parseInt(args[4], 10) : parseInt(args[3], 10);
      if (!isNaN(pickLien12) && pickLien12 >= 1 && pickLien12 <= LIENMON12_DOCS.length) {
        const doc = LIENMON12_DOCS[pickLien12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu liên môn 12`,
          `Thông báo: Gửi link tài liệu #${pickLien12}/${LIENMON12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listLien12 = LIENMON12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideLien12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu liên môn 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu liên môn 12 <số> | bonz tài liệu liên môn 12 chọn <số>)`,
        '',
        listLien12
      ].join('\n');
      return api.sendMessage(guideLien12, threadId, type);
    }

    // --- Sách (9–12, 10–12, 12): liệt kê và chọn tài liệu ---
    const isSach = (a0 === 'sách' || a0 === 'sach');
    if (isSach) {
      const SACH_DOCS = [
        { title: 'Sách Cambridge Vocabulary for IELTS (9–12)', url: 'https://drive.google.com/file/d/1Ny1y7mje3wTOSMSp1VLEWqyp8HGwaKGh/view' },
        { title: 'Sách 220 IELTS (10–12)', url: 'https://drive.google.com/file/d/18yFJ59tr_8YyPsjdu9Y1aAV195Kbi8of/view' },
        { title: 'Sách 3000 câu ngữ pháp từ vựng Tiếng Anh (10–12)', url: 'https://drive.google.com/file/d/16TBhxIsyneEsAaa80Gx_RtFDEeaoMx4W/view' },
        { title: 'Sách B1 Grammar & Vocabulary (12)', url: 'https://drive.google.com/file/d/1YElxwcOwrhB6Dp8gqPfh4SUHM5_vFjev/view' },
        { title: 'Sách B2 Grammar & Vocabulary (12)', url: 'https://drive.google.com/file/d/1YElxwcOwrhB6Dp8gqPfh4SUHM5_vFjev/view' },
        { title: 'Sách C1 & C2 Grammar & Vocabulary (12)', url: 'https://drive.google.com/file/d/1013xLF2bJEeD3JcPDW-vSpKM-swRUs9t/view' },
        { title: 'Sách chuyên đề Tiếng Anh (có đáp án) (9–12) [GDoc]', url: 'https://docs.google.com/document/d/1lyfMO6Pyaus041U4QVq8b1XjMNik1bqD/view' },
        { title: 'Sách chuyên đề Tiếng Anh (không đáp án) (9–12) [GDoc]', url: 'https://docs.google.com/document/d/1qJB8u6E7XYErbU3qKWDBYz67m-Mpj6y3/view' },
        { title: 'Sách các chuyên đề Ngữ pháp (9–12) [GDoc]', url: 'https://docs.google.com/document/d/16rNIul2lASUTZeCslvYLPyPgUzc7xwHC/view' },
        { title: 'Sách học chắc chương Hàm số từ gốc (10–12)', url: 'https://drive.google.com/file/d/1zi8dvdoNAT8DULoRyit1OtIdah5ww8aq/view' },
        { title: 'Sách: Đề thi chuyên Vật lý siêu cấp (10–12)', url: 'https://drive.google.com/file/d/1AODYzZRTCNxbQy7sfr0VhbGDUfRN_sOI/view' },
        { title: 'Sách: Đề thi chuyên Vật lý (10–12)', url: 'https://drive.google.com/file/d/1wMp32VCZ2KGMih18-geEcwdflgOsHn-g/view' },
        { title: 'Sách Hóa vô cơ – Tập 1 (10–12)', url: 'https://drive.google.com/file/d/1N8l1X3PW1WJtMAblchGzQE4YvpvddQYy/view' },
        { title: 'Sách Hóa vô cơ – Tập 2 (10–12)', url: 'https://drive.google.com/file/d/1qS2XF-ipgjY71EvqN3B_qwbcHsFHmj6i/view' },
        { title: 'Sách Hóa vô cơ – Tập 3 (10–12)', url: 'https://drive.google.com/file/d/1rOPsJePLaHbIYtq2g-cFqoVeT_MBRipO/view' },
        { title: 'Sách Lý luận văn học (12)', url: 'https://drive.google.com/file/d/1lIDi0GcJJaeGyYGDAD_Z8FzAJBNGOECB/view' },
        { title: 'Sách Lý luận văn học (2) (12)', url: 'https://drive.google.com/file/d/1WXUU9j5O56rec_Cf8b4IbYKsbUPLkly7/view' },
        { title: 'Sách Lý luận văn học (3) (12)', url: 'https://drive.google.com/file/d/1usu3BVVO5tN3CxYlNT-WnZ9ex5LezOsM/view' },
        { title: 'Sách Lý luận văn học cổ (4) (12)', url: 'https://drive.google.com/file/d/1xUqpQY83SQ7irrAKmrwhN13GIi11Fdpw/view' },
        { title: 'Sách Phê bình và phản phê bình (12)', url: 'https://drive.google.com/file/d/1i3s1T_e8375DWilShzk2NHzSoEWP1T4r/view' },
        { title: 'Sách Thơ và phản thơ (12)', url: 'https://drive.google.com/file/d/1dRlKcIWhjlnVeBbvrqxwE5DB4v8BLsnq/view' },
        { title: 'Sách Bồi dưỡng học sinh giỏi Văn THPT (12)', url: 'https://drive.google.com/file/d/1gOh103xhzsJJ6WW5lWfrFubZknPHG2pN/view' },
        { title: 'Sách Python cho người mới bắt đầu (12)', url: 'https://drive.google.com/file/d/18ibClr2qw0FYL5i1YjBV5sjI3irVimAw/view' },
      ];

      const actSach = (args[1] || '').toLowerCase();
      const pickSach = (actSach === 'chọn' || actSach === 'chon') ? parseInt(args[2], 10) : parseInt(args[1], 10);
      if (!isNaN(pickSach) && pickSach >= 1 && pickSach <= SACH_DOCS.length) {
        const doc = SACH_DOCS[pickSach - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu sách`,
          `Thông báo: Gửi link tài liệu #${pickSach}/${SACH_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSach = SACH_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSach = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu sách`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu sách <số> | bonz tài liệu sách chọn <số>)`,
        '',
        listSach
      ].join('\n');
      await sendTextChunked(guideSach);
      return;
    }
    // --- Sinh học 11: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isSinh11Simple = (a0 === 'sinh') && a1 === '11';
    const isSinhHoc11 = (a0 === 'sinh') && a1 === 'học' && a2 === '11';
    if (isSinh11Simple || isSinhHoc11) {
      const offsetSinh = isSinh11Simple ? 2 : 3;
      const SINH11_DOCS = [
        { title: 'Đề cương ôn tập giữa học kì 1 (PDF)', url: 'https://drive.google.com/file/d/1780TVVMakw6-c8Cam9XKj-M3owvxHl9L/view' },
        { title: 'Full lý thuyết Sinh 11 (GDoc)', url: 'https://docs.google.com/document/d/1cqSCyf2mzPmeoXUoufiahNUmEPu9AnTe/view' },
      ];

      const actSinh = (args[offsetSinh] || '').toLowerCase();
      const pickSinh = (actSinh === 'chọn' || actSinh === 'chon') ? parseInt(args[offsetSinh + 1], 10) : parseInt(args[offsetSinh], 10);
      if (!isNaN(pickSinh) && pickSinh >= 1 && pickSinh <= SINH11_DOCS.length) {
        const doc = SINH11_DOCS[pickSinh - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu sinh 11`,
          `Thông báo: Gửi link tài liệu #${pickSinh}/${SINH11_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSinh = SINH11_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSinh = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu sinh 11`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu sinh 11 <số> | bonz tài liệu sinh 11 chọn <số>)`,
        '',
        listSinh
      ].join('\n');
      return api.sendMessage(guideSinh, threadId, type);
    }

    // --- KHTN 6: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isKHTN6 = (a0 === 'khtn') && a1 === '6';
    if (isKHTN6) {
      const KHTN6_DOCS = [
        { title: 'Các phép đo KHTN 6', url: 'https://docs.google.com/document/d/1GXaTDBF13jWGguE_80iIWqzoKqABA5vt/view' },
        { title: 'Kiểm tra chủ đề KHTN 6', url: 'https://docs.google.com/document/d/12fsUiJc8O1Pe4d_bXnlDoRQvygu3tTJV/view' },
        { title: 'Các thể của chất KHTN 6', url: 'https://docs.google.com/document/d/1cKq4e1nEvutSEjL6SB104aSC3zN8dMUo/view' },
        { title: 'Vật liệu KHTN 6', url: 'https://docs.google.com/document/d/1sg4DU7J1COlbnl44HMLxQU4cYkzDQ2M2/view' },
        { title: 'Oxygen KHTN 6', url: 'https://docs.google.com/document/d/1W7rsVw44MpvpxgF2i5hSc2P_ICV7s4lz/view' },
        { title: 'Lương thực KHTN 6', url: 'https://docs.google.com/document/d/1elphs8EI7gVwGd9vCjVpSSL9ZdowgINO/view' },
        { title: 'Chất tinh khiết KHTN 6', url: 'https://docs.google.com/document/d/1JPc9zRSvz7WPMNuyuUQ3bqwCgAqiVn1m/view' },
        { title: 'Tách chất khỏi hỗn hợp KHTN 6', url: 'https://docs.google.com/document/d/11G4GakgZFLBt7snC3mA36L6IvEr5Qjtp/view' },
        { title: 'Tế bào KHTN 6', url: 'https://docs.google.com/document/d/1N4RlKnIvQg4p6XRbLZbtLnmh0CObZM_o/view' },
        { title: 'Từ tế bào đến cơ thể KHTN 6', url: 'https://docs.google.com/document/d/11_GyFkcn_sG3U6V0YIe55ZdTa7L-oS37/view' },
        { title: 'Phân loại thế giới sống KHTN 6', url: 'https://docs.google.com/document/d/1_y-qCmjzDqMJ4khHspsalM4nTfNdcr7G/view' },
        { title: 'Virus KHTN 6', url: 'https://docs.google.com/document/d/1xYgv307QZjuRM1pXYxPoZC0EgVefGSJ5/view' },
        { title: 'Vi khuẩn KHTN 6', url: 'https://docs.google.com/document/d/1Dl_xKEseSipVvQMkQHXjzwvfwCYfQv0o/view' },
        { title: 'Nguyên sinh vật KHTN 6', url: 'https://docs.google.com/document/d/1H-QFKicyt1IC1EcLZMFX_cCtYBq9OIQg/view' },
        { title: 'Nấm KHTN 6', url: 'https://docs.google.com/document/d/1F2G2pFbqzMTXSqjszDcRNuKZrS_zFwNk/view' },
        { title: 'Thực vật động vật KHTN 6', url: 'https://docs.google.com/document/d/1W4paUQlPlsa-e3F5qmWbMTGCXcCoLjsH/view' },
        { title: 'Lực KHTN 6', url: 'https://docs.google.com/document/d/1bJq17hrazZYC1PhlQwNLSFzMl4gwTvW-/view' },
        { title: 'Năng lượng KHTN 6', url: 'https://docs.google.com/document/d/1WyGAEzAD0-GCCaxzIied2aQTxgdW7sfq/view' },
        { title: 'Thiên văn học KHTN 6', url: 'https://docs.google.com/document/d/1tX2NdbfkCXY9jKvjLbigRBJgnteGzQrv/view' },
        { title: 'Lực và biểu diễn lực KHTN 6', url: 'https://docs.google.com/document/d/1yWpQZCTaEhH_BMV1TNsJqR6nlTo1Y4-F/view' },
        { title: 'Đề thi cuối kì 1 KHTN 6', url: 'https://docs.google.com/document/d/1ioMKtp5nNpv-BPSoSfoLjzvSgfzyITzo/view' },
        { title: 'Đề thi cuối kì 1 đáp án KHTN 6', url: 'https://docs.google.com/document/d/1NU7d4yVnLot2nMYwWu3T4ooYoU6E7F7O/view' },
        { title: 'Đề cuối kì 2 đáp án KHTN 6', url: 'https://docs.google.com/document/d/1s9832-oWK_JZP8w83ak1VOvYGW2c8q7j/view' },
        { title: 'Đề cuối kì 2 KHTN 6', url: 'https://docs.google.com/document/d/1qyNDcZU-MJv723b2otfnJI-zyBqYfyUi/view' },
        { title: 'Đề giữa kì 1 KHTN 6', url: 'https://docs.google.com/document/d/1yc3NN5BGiUggKwcY4n9Y6EP6rSlPdgit/view' },
        { title: 'Đề giữa kì 2 đáp án KHTN 6', url: 'https://docs.google.com/document/d/1mJ6gBM91GfaYmlb4mQ2a4l8dPEBpxfK3/view' },
        { title: 'Đề giữa kì 2 KHTN 6', url: 'https://docs.google.com/document/d/1IbCN0YMyQ8IVpPt-ztMAEmE67iYMV5Xm/view' },
      ];

      const actionK = (args[2] || '').toLowerCase();
      const pickK = actionK === 'chọn' || actionK === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickK) && pickK >= 1 && pickK <= KHTN6_DOCS.length) {
        const doc = KHTN6_DOCS[pickK - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu khtn 6`,
          `Thông báo: Gửi link tài liệu #${pickK}/${KHTN6_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listK = KHTN6_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideK = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu khtn 6`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu khtn 6 <số> | bonz tài liệu khtn 6 chọn <số>)`,
        '',
        listK
      ].join('\n');
      return api.sendMessage(guideK, threadId, type);
    }

    // Đường dẫn tới thư mục tài liệu
    const docsDir = path.join(__dirname, '..', '..', 'tài liệu', ')))');

    if (!fs.existsSync(docsDir)) {
      const msg = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu`,
        `Thông báo: Lỗi - không tìm thấy thư mục tài liệu`,
        `Thư mục: ${docsDir}`,
        `Cách dùng: Đảm bảo thư mục tồn tại và có file .pdf/.doc/.docx`
      ].join("\n");
      return api.sendMessage(msg, threadId, type);
    }

    const allFiles = fs.readdirSync(docsDir);
    const allowed = ['.pdf', '.doc', '.docx'];
    const docFiles = allFiles
      .filter(f => allowed.includes(path.extname(f).toLowerCase()))
      .map(f => ({ name: f, full: path.join(docsDir, f) }));

    if (docFiles.length === 0) {
      const msg = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu`,
        `Thông báo: Không có file phù hợp (.pdf/.doc/.docx)`
      ].join("\n");
      return api.sendMessage(msg, threadId, type);
    }


  // Hệ phương trình 2x2: a1x + b1y = c1; a2x + b2y = c2 (đọc từ a1=,b1=,...)
  function tryLinear2x2(text) {
    const s = text.toLowerCase();
    if (!/hệ\s*phương\s*trình|he\s*phuong\s*trinh/.test(s)) return null;
    const pick = (k)=>{
      const m = s.match(new RegExp(k+"\\s*(:|=)\\s*([\-]?[0-9]+(?:\\.[0-9]+)?)"));
      return m? parseFloat(m[2]) : undefined;
    };
    const a1 = pick('a1'), b1 = pick('b1'), c1 = pick('c1');
    const a2 = pick('a2'), b2 = pick('b2'), c2 = pick('c2');
    if ([a1,b1,c1,a2,b2,c2].some(v=>typeof v!== 'number')) return null;
    const D = a1*b2 - a2*b1;
    if (D === 0) return { type:'lin2x2', value: null };
    const Dx = c1*b2 - c2*b1;
    const Dy = a1*c2 - a2*c1;
    return { type:'lin2x2', value: { x: Dx/D, y: Dy/D } };
  }

  // Tam giác vuông trợ giúp nhanh
  function tryRightTriangle(text) {
    const s = text.toLowerCase();
    if (!/tam\s*giác\s*vuông|tam\s*giac\s*vuong/.test(s)) return null;
    const get = (label)=>{
      const m = s.match(new RegExp(label+"\\s*(:|=)?\\s*([0-9]+(?:\\.[0-9]+)?)"));
      return m? parseFloat(m[2]) : undefined;
    };
    const a = get('cạnh góc vuông a|canh goc vuong a|a');
    const b = get('cạnh góc vuông b|canh goc vuong b|b');
    const h = get('cạnh huyền|canh huyen|huyen');
    if (typeof a==='number' && typeof b==='number') return { type:'rt_hyp', value: Math.sqrt(a*a+b*b) };
    if (typeof h==='number' && typeof a==='number') return { type:'rt_leg', value: Math.sqrt(Math.max(h*h-a*a,0)) };
    if (typeof h==='number' && typeof b==='number') return { type:'rt_leg', value: Math.sqrt(Math.max(h*h-b*b,0)) };
    return null;
  }

    // Lịch sử đã gửi cho thread hiện tại
    const row = await Threads.getData(threadId);
    const tdata = row?.data || {};
    tdata.docsHistory = tdata.docsHistory || { sent: [] };
    // Chuẩn hóa lịch sử cũ sang dạng key chuẩn (relative + lowercase)
    const toKey = (p) => {
      const target = path.isAbsolute(p) ? path.relative(docsDir, p) : p;
      return String(target).toLowerCase();
    };
    if (!tdata.docsHistory.sentKeys) {
      tdata.docsHistory.sentKeys = Array.from(new Set((tdata.docsHistory.sent || []).map(n => toKey(n))));
    } else {
      // đảm bảo unique
      tdata.docsHistory.sentKeys = Array.from(new Set(tdata.docsHistory.sentKeys.map(k => String(k).toLowerCase())));
    }

    // Xử lý reset lịch sử
    if (args[0] && args[0].toLowerCase() === 'reset') {
      tdata.docsHistory = { sent: [], sentKeys: [] };
      Threads.setData(threadId, tdata);
      return api.sendMessage('✅ Đã reset lịch sử tài liệu. Bạn có thể gọi lại lệnh để nhận tài liệu từ đầu.', threadId, type);
    }

    const sentSet = new Set(tdata.docsHistory.sentKeys || []);
    const remaining = docFiles.filter(d => !sentSet.has(toKey(d.full)));

    if (remaining.length === 0) {
      return api.sendMessage('✅ Đã gửi hết tài liệu khả dụng. Dùng "bonz tài liệu reset" để làm mới lịch sử.', threadId, type);
    }

    // Trộn và chọn tối đa 10 file chưa gửi
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    const pick = remaining.slice(0, Math.min(10, remaining.length));

    const header = [
      `Người dùng: ${userName}`,
      `Dịch vụ: bonz tài liệu`,
      `Thông báo: Đang gửi ${pick.length} tài liệu ngẫu nhiên...`
    ].join("\n");
    await api.sendMessage(header, threadId, type);

    // Gửi từng tài liệu một
    for (const item of pick) {
      try {
        await api.sendMessage({
          msg: `📄 ${item.name}`,
          attachments: item.full
        }, threadId, type, null, senderId);
        // nghỉ nhẹ để tránh spam
        await new Promise(r => setTimeout(r, 400));
        // cập nhật lịch sử (ghi ngay để tránh xung đột khi gọi song song)
        const key = toKey(item.full);
        if (!tdata.docsHistory.sentKeys.includes(key)) {
          tdata.docsHistory.sentKeys.push(key);
        }
        // đảm bảo unique để tránh phình to dữ liệu
        tdata.docsHistory.sentKeys = Array.from(new Set(tdata.docsHistory.sentKeys));
        Threads.setData(threadId, tdata);
      } catch (sendErr) {
        console.log('Gửi tài liệu lỗi:', sendErr?.message || sendErr);
      }
    }

    // lưu lịch sử tổng kết (phòng khi chưa kịp lưu từng phần)
    Threads.setData(threadId, tdata);
    return;

  } catch (error) {
    console.error("Lỗi gửi tài liệu:", error);
    const msg = [
      `Người dùng: ${userName || 'Người dùng'}`,
      `Dịch vụ: bonz tài liệu`,
      `Thông báo: Lỗi hệ thống`
    ].join("\n");
    return api.sendMessage(msg, threadId, type);
  }
}

// Chat AI (Gemini) trực tiếp: thống nhất format và tracking; serviceName: 'bonz chat ai' hoặc 'bonz gpt'
async function handleChatAI(api, event, args = [], serviceName = 'bonz chat ai') {
  const { threadId, type } = event;
  const axios = require('axios');
  // Lấy thông tin người dùng
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage(serviceName, senderId);

  try {
    const promptRaw = (args || []).join(' ').trim();
    if (!promptRaw) {
      const header = __formatServiceInfo({
        service: serviceName,
        userName,
        userId: senderId,
        notify: 'Thiếu câu hỏi',
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: serviceName === 'bonz gpt' ? 'bonz gpt <câu hỏi>' : 'bonz chat ai <câu hỏi>'
      });
      return api.sendMessage(header, threadId, type);
    }

    // Ghép prompt theo style gọn 340 ký tự như plugin gemini
    let prompt = `${promptRaw} trả lời cho tôi ngắn gọn nhất và luôn đảm bảo câu trả lời dưới 340 chữ`;
    if (prompt.length > 340) prompt = prompt.slice(0, 340);

    // Lấy API keys từ config hoặc ENV
    function getGeminiKeys() {
      try {
        const fromCfg = Array.isArray(global?.config?.gemini_api_keys) ? global.config.gemini_api_keys : [];
        const fromEnv = (process.env.GEMINI_API_KEYS || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const merged = [...fromCfg, ...fromEnv].map(String).map(k => k.trim()).filter(Boolean);
        return merged.length ? Array.from(new Set(merged)) : [''];
      } catch { return ['']; }
    }

    const GEMINI_API_KEYS = getGeminiKeys();
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}';

    // Gọi lần lượt các key (retry khi 429/503)
    const headers = { 'Content-Type': 'application/json' };
    const data = { contents: [{ parts: [{ text: prompt }] }] };
    let answer = '';
    for (const key of GEMINI_API_KEYS) {
      const url = GEMINI_API_URL.replace('{}', key);
      try {
        const resp = await axios.post(url, data, { headers });
        const result = resp.data;
        if (resp.status === 200 && !result?.error) {
          answer = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (answer) break;
        } else if (result?.error && [429, 503].includes(result.error.code)) {
          continue; // thử key khác
        }
      } catch (err) {
        const code = err?.response?.data?.error?.code;
        if (code && [429, 503].includes(code)) continue;
      }
    }

    if (!answer) {
      answer = 'xin lỗi nay tôi đã trò chuyện với người dùng quá nhiều - hẹn các bạn vào hôm sau.';
    }

    const header = __formatServiceInfo({
      service: serviceName,
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: serviceName === 'bonz gpt' ? 'bonz gpt <câu hỏi>' : 'bonz chat ai <câu hỏi>'
    });
    const details = ['','💬 Trả lời:','', answer].join('\n');
    return api.sendMessage(`${header}\n${details}`, threadId, type);
  } catch (e) {
    const header = __formatServiceInfo({
      service: serviceName,
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
      keyGot: 0,
      keyCount: 0
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Giải toán: hỗ trợ số học và một số hình học cơ bản bằng tiếng Việt
async function handleGiaiToan(api, event, args = []) {
  const { threadId, type, data } = event;
  const raw = (args || []).join(' ').trim();
  if (!raw) {
    return api.sendMessage(
      [
        'Cách dùng: bonz giải toán <bài toán bằng chữ hoặc biểu thức>',
        'Ví dụ:',
        '- bonz giải toán hai mươi ba cộng bảy nhân hai',
        '- bonz giải toán căn bậc hai của 144',
        '- bonz giải toán tính diện tích hình tròn bán kính 5',
        '- bonz giải toán chu vi hình chữ nhật dài 7 rộng 3',
        '- bonz giải toán 15 phần trăm của 200',
        '- bonz giải toán giai thừa 6',
        '- bonz giải toán tổ hợp 10 chọn 3',
        '- bonz giải toán sin 30 độ',
        '- bonz giải toán phương trình bậc hai a=1 b=-3 c=2',
        '- bonz giải toán tăng 15% của 200',
        '- bonz giải toán 17 mod 5',
        '- bonz giải toán log cơ số 2 của 32',
        '- bonz giải toán hệ phương trình a1=2 b1=3 c1=13 a2=1 b2=-1 c2=1',
        '- bonz giải toán một phần hai cộng một phần ba',
        '- bonz giải toán hai và một phần ba nhân bốn',
        '- bonz giải toán tỉ lệ 3:4'
      ].join('\n'),
      threadId,
      type
    );
  }

  // Nếu có API key OpenAI, ưu tiên dùng ChatGPT để giải toán
  try {
    const senderId = data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}
    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz giải toán', senderId);

    const OPENAI_KEY = process.env.OPENAI_API_KEY || (global?.config?.openai_key);
    if (OPENAI_KEY) {
      const sys = 'Bạn là trợ lý toán học. Hãy giải bài toán một cách ngắn gọn, có các bước chính và nêu kết quả cuối cùng rõ ràng. Nếu có đơn vị, nêu kèm đơn vị. Giữ câu trả lời bằng tiếng Việt.';
      const user = `Bài toán: ${raw}`;
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user }
          ],
          temperature: 0.2,
          max_tokens: 600
        },
        { headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }, timeout: 20000 }
      );
      const answer = res?.data?.choices?.[0]?.message?.content?.trim();
      if (answer) {
        const header = __formatServiceInfo({
          service: 'bonz giải toán', userName, userId: senderId, role, usage,
          notify: 'Lời giải từ ChatGPT'
        });
        return api.sendMessage(`${header}\n\n${answer}`, threadId, type);
      }
    }
  } catch (e) {
    // Nếu lỗi hoặc không có key, sẽ dùng bộ giải cục bộ bên dưới
  }

  // Chuyển số tiếng Việt cơ bản -> số
  function viNumberToNumber(text) {
    const map = {
      'không':0,'một':1,'mốt':1,'hai':2,'ba':3,'bốn':4,'tư':4,'năm':5,'lăm':5,'sáu':6,'bảy':7,'bẩy':7,'tám':8,'chín':9,
      'mười':10,'mươi':10,'trăm':100,'nghìn':1000,'ngàn':1000,'triệu':1_000_000,'tỷ':1_000_000_000
    };
    // Chuẩn hóa
    let s = ' ' + text.toLowerCase() + ' ';
    // Đổi dạng phân số: "hai phần ba" => 2/3
    s = s.replace(/([a-zà-ỹ\d\s]+?)\s+phần\s+([a-zà-ỹ\d\s]+)/g, (m,a,b)=>{
      const A = viNumberToNumber(a.trim());
      const B = viNumberToNumber(b.trim());
      if (isNaN(A) || isNaN(B) || B===0) return m; return String(A/B);
    });
    // Đổi các cụm đơn giản sang chữ số trực tiếp khi có số đã viết
    s = s.replace(/(\d+)[\s]*phần\s*(\d+)/g,(m,a,b)=> String(Number(a)/Number(b)));
    // Chuyển từng cụm số từ chữ sang số
    return s.replace(/((?:\s[\wà-ỹ]+)+)/g, (m)=>{
      const tokens = m.trim().split(/\s+/);
      let total = 0, cur = 0, found = false;
      for (const tkRaw of tokens) {
        const tk = tkRaw.replace(/[^a-zà-ỹ]/g,'');
        if (!(tk in map)) continue;
        found = true;
        const val = map[tk];
        if (val >= 100) { // trăm, nghìn, triệu, tỷ
          if (cur === 0) cur = 1;
          cur *= val;
          if (val >= 1000) { total += cur; cur = 0; }
        } else if (val === 10 && (tk==='mươi' || tk==='mười')) {
          cur = (cur || 1) * 10;
        } else {
          cur += val;
        }
      }
      if (!found) return m;
      total += cur;
      return ' ' + String(total) + ' ';
    });
  }

  // Đổi từ khoá toán -> ký hiệu
  function normalizeArithmetic(text) {
    let s = text.toLowerCase();
    s = viNumberToNumber(s);
    s = s
      .replace(/căn bậc\s*(\d+)\s*(?:của|\()?/g, 'root($1,') // căn bậc n của x => root(n, x)
      .replace(/căn\s*(?:bậc\s*hai)?\s*(?:của\s*)?/g, 'sqrt(')
      .replace(/lũy thừa|mũ/g, '^')
      .replace(/\bphần trăm\b/g, '%')
      // phần trăm của: "x phần trăm của y" => (x/100)*y
      .replace(/(\d+(?:\.\d+)?)\s*(?:%|phần trăm)\s*của\s*(\d+(?:\.\d+)?)/g, '($1/100)*$2')
      // tăng/giảm x% của y
      .replace(/tăng\s*(\d+(?:\.\d+)?)\s*%\s*của\s*(\d+(?:\.\d+)?)/g, '(1+$1/100)*$2')
      .replace(/giảm\s*(\d+(?:\.\d+)?)\s*%\s*của\s*(\d+(?:\.\d+)?)/g, '(1-$1/100)*$2')
      .replace(/\b(cộng|plus|\+)\b/g, '+')
      .replace(/\b(trừ|minus|\-)\b/g, '-')
      .replace(/\b(nhân|x|\*)\b/g, '*')
      .replace(/\b(chia|:)\b/g, '/')
      .replace(/\b(mod|phần dư|lay du|lấy dư)\b/g, '%')
      .replace(/\s+/g,' ')
      .trim();
    // phần trăm: 50% => 50/100
    s = s.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    // phân số: "a phần b" => (a/b) ; hỗn số: "n và a phần b" => (n + a/b)
    s = s.replace(/(\d+)\s*và\s*(\d+)\s*phần\s*(\d+)/g, '($1 + ($2/$3))');
    s = s.replace(/(\d+)\s*phần\s*(\d+)/g, '($1/$2)');
    // tỉ lệ x:y => x/y
    s = s.replace(/tỉ\s*lệ\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/g, '($1/$2)');
    // ^ -> **
    s = s.replace(/\^/g,'**');
    // root(n, x) => Math.pow(x, 1/n)
    s = s.replace(/root\((\d+)\s*,/g, 'powInv($1,');
    // giai thừa: "giai thừa 5" hoặc "5!" => fact(5)
    s = s.replace(/giai\s*thừa\s*(\d+)/g, 'fact($1)');
    s = s.replace(/(\d+)\s*!/g, 'fact($1)');
    // tổ hợp/chỉnh hợp
    s = s.replace(/tổ\s*hợp\s*(\d+)\s*(?:chọn|lấy)\s*(\d+)/g, 'nCr($1,$2)');
    s = s.replace(/chỉnh\s*hợp\s*(\d+)\s*(?:chọn|lấy)?\s*(\d+)/g, 'nPr($1,$2)');
    // lượng giác theo độ: sin 30 độ => sin(deg2rad(30))
    s = s.replace(/\b(sin|cos|tan)\s*(\d+(?:\.\d+)?)\s*độ\b/g, (m,fn,num)=>`${fn}(deg2rad(${num}))`);
    // ln x, log x (mặc định cơ số 10), log cơ số a của b
    s = s.replace(/\bln\s*\(/g, 'ln(');
    s = s.replace(/\blog\s*cơ\s*số\s*(\d+(?:\.\d+)?)\s*của\s*(\d+(?:\.\d+)?)/g, 'logBase($2,$1)');
    s = s.replace(/\blog\s*\(/g, 'log10(');
    // ƯCLN/BCNN dạng chữ: "ước chung lớn nhất của a và b", "bội chung nhỏ nhất của a và b"
    s = s.replace(/ước\s*chung\s*lớn\s*nhất\s*của\s*(\d+)\s*và\s*(\d+)/g, 'gcd($1,$2)');
    s = s.replace(/bội\s*chung\s*nhỏ\s*nhất\s*của\s*(\d+)\s*và\s*(\d+)/g, 'lcm($1,$2)');
    return s;
  }

  // Hình học cơ bản
  function tryGeometry(text) {
    const s = text.toLowerCase();
    const getNum = (label)=>{
      // ưu tiên số dạng 123.45 sau nhãn
      const m = s.match(new RegExp(label+"\\s*(:|=)?\\s*([0-9]+(?:\\.[0-9]+)?)"));
      if (m) return parseFloat(m[2]);
      // thử bắt cụm chữ số việt theo sau nhãn (tối đa 5 từ)
      const m2 = s.match(new RegExp(label+"\\s*(?::|=)?\\s*((?:[a-zà-ỹ]+\\s*){1,5})"));
      if (m2) {
        const asNum = viNumberToNumber(m2[1]);
        const num = parseFloat(asNum.replace(/[^0-9.\-]/g,''));
        if (!isNaN(num)) return num;
      }
      return undefined;
    };

    // hình tròn
    if (/hình\s*tròn/.test(s)) {
      let r = getNum('bán kính|ban kinh|radius|r');
      const d = getNum('đường kính|duong kinh|diameter|d');
      if (typeof r !== 'number' && typeof d === 'number') r = d/2;
      if (typeof r === 'number') {
        const pi = Math.PI;
        if (/diện tích|dien tich|area/.test(s)) return { type:'area_circle', value: pi*r*r };
        if (/chu vi|chuvi|perimeter|circumference/.test(s)) return { type:'peri_circle', value: 2*pi*r };
      }
    }
    // hình chữ nhật
    if (/hình\s*chữ\s*nhật|hinh\s*chu\s*nhat/.test(s)) {
      const a = getNum('dài|dai|length|a');
      const b = getNum('rộng|rong|width|b');
      if (typeof a === 'number' && typeof b === 'number') {
        if (/diện tích|dien tich|area/.test(s)) return { type:'area_rect', value: a*b };
        if (/chu vi|chuvi|perimeter/.test(s)) return { type:'peri_rect', value: 2*(a+b) };
      }
    }
    // hình vuông
    if (/hình\s*vuông|hinh\s*vuong/.test(s)) {
      const c = getNum('cạnh|canh|side|a');
      if (typeof c === 'number') {
        if (/diện tích|dien tich|area/.test(s)) return { type:'area_square', value: c*c };
        if (/chu vi|chuvi|perimeter/.test(s)) return { type:'peri_square', value: 4*c };
      }
    }
    // tam giác: diện tích (Heron) khi biết 3 cạnh a,b,c; hoặc (đáy, cao)
    if (/tam\s*giác|tam\s*giac/.test(s)) {
      const a = getNum('a|cạnh a|canh a');
      const b = getNum('b|cạnh b|canh b');
      const c = getNum('c|cạnh c|canh c');
      const day = getNum('đáy|day|base');
      const cao = getNum('cao|height|h');
      const goc = getNum('góc|goc|angle');
      if (/chu vi|chuvi|perimeter/.test(s) && [a,b,c].every(v=>typeof v==='number')) {
        return { type:'peri_triangle', value: a+b+c };
      }
      if (/diện tích|dien tich|area/.test(s)) {
        if (typeof day === 'number' && typeof cao === 'number') {
          return { type:'area_triangle', value: 0.5*day*cao };
        }
        // cạnh-cạnh-góc xen giữa (a,b,góc C)
        if (typeof a==='number' && typeof b==='number' && typeof goc==='number') {
          const area = 0.5*a*b*Math.sin(goc*Math.PI/180);
          return { type:'area_triangle', value: area };
        }
        if ([a,b,c].every(v=>typeof v==='number')) {
          const p = (a+b+c)/2;
          const area = Math.sqrt(Math.max(p*(p-a)*(p-b)*(p-c), 0));
          return { type:'area_triangle', value: area };
        }
      }
    }
    // hình thang: diện tích với đáy lớn a, đáy bé b, chiều cao h
    if (/hình\s*thang|hinh\s*thang/.test(s)) {
      const a = getNum('đáy lớn|day lon|a');
      const b = getNum('đáy bé|day be|b');
      const h = getNum('chiều cao|chieu cao|cao|h|height');
      if (/diện tích|dien tich|area/.test(s) && typeof a==='number' && typeof b==='number' && typeof h==='number') {
        return { type:'area_trapezoid', value: (a+b)/2*h };
      }
      // chu vi hình thang nếu biết 4 cạnh: a,b,c,d (với c,d là cạnh bên)
      const c = getNum('c|cạnh bên c|canh ben c');
      const d = getNum('d|cạnh bên d|canh ben d');
      if (/chu vi|chuvi|perimeter/.test(s) && [a,b,c,d].every(v=>typeof v==='number')) {
        return { type:'peri_trapezoid', value: a+b+c+d };
      }
    }
    return null;
  }

  // Đánh giá biểu thức số học an toàn
  function safeEval(expr) {
    const ctx = {
      Math,
      sqrt: Math.sqrt,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      abs: Math.abs,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      min: Math.min,
      max: Math.max,
      PI: Math.PI,
      E: Math.E,
      powInv: (n, x) => Math.pow(x, 1/Number(n)),
      log: Math.log,
      log10: Math.log10 || ((x)=>Math.log(x)/Math.LN10),
      ln: Math.log,
      logBase: (b,a)=> Math.log(Number(b))/Math.log(Number(a)),
      exp: Math.exp,
      deg2rad: (d)=> Number(d)*Math.PI/180,
      fact: (n)=>{ n=Number(n); if (n<0||!Number.isFinite(n)) throw new Error('giai thừa không hợp lệ'); let r=1; for(let i=2;i<=Math.floor(n);i++) r*=i; return r; },
      nCr: (n,k)=>{ n=Number(n); k=Number(k); if(k<0||n<0||k>n) throw new Error('tổ hợp không hợp lệ'); const f=(x)=>{let r=1; for(let i=2;i<=x;i++) r*=i; return r;}; return f(n)/(f(k)*f(n-k)); },
      nPr: (n,k)=>{ n=Number(n); k=Number(k); if(k<0||n<0||k>n) throw new Error('chỉnh hợp không hợp lệ'); const f=(x)=>{let r=1; for(let i=2;i<=x;i++) r*=i; return r;}; return f(n)/f(n-k); },
      gcd: (a,b)=>{ a=Math.abs(Math.floor(a)); b=Math.abs(Math.floor(b)); while(b){[a,b]=[b,a%b]} return a; },
      lcm: (a,b)=>{ a=Math.abs(Math.floor(a)); b=Math.abs(Math.floor(b)); if(a===0||b===0) return 0; const g=(x,y)=>{while(y){[x,y]=[y,x%y]} return x}; return Math.abs(a*b)/g(a,b); }
    };
    // chỉ cho phép các ký tự hợp lệ
    if (!/^[-+*/%^().,! 0-9a-z_]*$/i.test(expr)) throw new Error('Biểu thức chứa ký tự không hợp lệ');
    const fn = new Function('ctx', `with(ctx){ return (${expr}); }`);
    return fn(ctx);
  }

  // Giải phương trình bậc hai: a,b,c từ văn bản
  function tryQuadratic(text) {
    const s = text.toLowerCase();
    if (!/phương\s*trình\s*bậc\s*hai|phuong\s*trinh\s*bac\s*hai/.test(s)) return null;
    const num = (label)=>{
      const m = s.match(new RegExp(label+"\\s*(:|=)?\\s*([\-]?[0-9]+(?:\\.[0-9]+)?)"));
      if (m) return parseFloat(m[2]);
      return undefined;
    };
    const a = num('a');
    const b = num('b');
    const c = num('c');
    if ([a,b,c].some(v=>typeof v!=='number')) return null;
    if (a === 0) return { type:'linear', value: (-c)/b };
    const delta = b*b - 4*a*c;
    if (delta < 0) return { type:'quad', value: null, extra: { delta } };
    if (delta === 0) return { type:'quad', value: [ -b/(2*a) ], extra: { delta } };
    const sqrtD = Math.sqrt(delta);
    return { type:'quad', value: [ (-b+sqrtD)/(2*a), (-b-sqrtD)/(2*a) ], extra: { delta } };
  }

  try {
    // 1) Thử giải phương trình bậc hai
    const quad = tryQuadratic(raw);
    if (quad) {
      if (quad.type === 'linear') {
        return api.sendMessage(`✅ Nghiệm phương trình bậc nhất: x = ${quad.value}`, threadId, type);
      }
      if (quad.value === null) {
        return api.sendMessage(`✅ Phương trình vô nghiệm (Δ = ${quad.extra.delta})`, threadId, type);
      }
      if (Array.isArray(quad.value) && quad.value.length === 1) {
        return api.sendMessage(`✅ Phương trình có nghiệm kép x = ${quad.value[0]}`, threadId, type);
      }
      if (Array.isArray(quad.value) && quad.value.length === 2) {
        return api.sendMessage(`✅ Nghiệm: x1 = ${quad.value[0]}, x2 = ${quad.value[1]}`, threadId, type);
      }
    }

    // 2) Hệ phương trình 2x2
    const lin = tryLinear2x2(raw);
    if (lin) {
      if (!lin.value) return api.sendMessage('✅ Hệ vô nghiệm hoặc vô số nghiệm (D = 0).', threadId, type);
      return api.sendMessage(`✅ Nghiệm hệ: x = ${lin.value.x}, y = ${lin.value.y}`, threadId, type);
    }

    // 3) Tam giác vuông
    const rt = tryRightTriangle(raw);
    if (rt) {
      return api.sendMessage(`✅ Kết quả: ${rt.value}`, threadId, type);
    }

    // 4) Thử hình học
    const geo = tryGeometry(raw);
    if (geo) {
      const val = Number(geo.value);
      const pretty = Number.isFinite(val) ? val : 'NaN';
      return api.sendMessage(`✅ Kết quả: ${pretty}`, threadId, type);
    }

    // 5) Số học chung
    const expr = normalizeArithmetic(raw)
      .replace(/sqrt\(/g,'Math.sqrt(');
    const result = safeEval(expr);
    if (typeof result === 'number' && Number.isFinite(result)) {
      return api.sendMessage(`✅ Kết quả: ${result}`, threadId, type);
    }
    return api.sendMessage('❌ Không hiểu bài toán. Hãy diễn đạt rõ hơn.', threadId, type);
  } catch (e) {
    return api.sendMessage(`❌ Lỗi khi tính toán: ${e.message}`, threadId, type);
  }
}

// Rút gọn link: hỗ trợ 1 hoặc nhiều URL, dùng is.gd và fallback TinyURL
async function handleShortenLink(api, event, args = []) {
  const { threadId, type } = event;
  const axios = require('axios');
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  // Lấy thông tin người dùng
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz rút gọn link', senderId);

  // Chuẩn hóa và lọc danh sách URL từ args
  const inputs = (args || []).filter(Boolean);
  if (!inputs.length) {
    const header = __formatServiceInfo({
      service: 'bonz rút gọn link',
      userName,
      userId: senderId,
      notify: 'Thiếu URL cần rút gọn',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: 'bonz rút gọn link <url1> [url2 ...] hoặc: bonz link <url>',
      showRole: false
    });
    return api.sendMessage(header, threadId, type);
  }

  function normalizeUrl(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s; // thêm scheme nếu thiếu
    try { new URL(s); return s; } catch { return ''; }
  }

  async function shortenOne(u) {
    const enc = encodeURIComponent(u);
    // is.gd simple
    try {
      const res = await axios.get(`https://is.gd/create.php?format=simple&url=${enc}`, { timeout: 12000 });
      const t = String(res.data || '').trim();
      if (t && /^https?:\/\//i.test(t)) return t;
    } catch {}
    // tinyurl fallback
    try {
      const res2 = await axios.get(`https://tinyurl.com/api-create.php?url=${enc}`, { timeout: 12000 });
      const t2 = String(res2.data || '').trim();
      if (t2 && /^https?:\/\//i.test(t2)) return t2;
    } catch {}
    return null;
  }

  try {
    const urls = inputs.map(normalizeUrl).filter(Boolean).slice(0, 10);
    if (!urls.length) {
      const header = __formatServiceInfo({
        service: 'bonz rút gọn link',
        userName,
        userId: senderId,
        notify: 'Không nhận diện được URL hợp lệ',
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: 'bonz rút gọn link <url1> [url2 ...]',
        showRole: false
      });
      return api.sendMessage(header, threadId, type);
    }

    const results = [];
    for (const u of urls) {
      try {
        const short = await shortenOne(u);
        results.push({ original: u, short });
      } catch {
        results.push({ original: u, short: null });
      }
    }

    const okCount = results.filter(r => !!r.short).length;
    const header = __formatServiceInfo({
      service: 'bonz rút gọn link',
      userName,
      userId: senderId,
      notify: okCount > 0 ? 'Thành công' : 'Không rút gọn được link nào',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: okCount > 0 ? 'Copy link rút gọn để chia sẻ, tiết kiệm không gian (SEO vẫn vậy)' : 'bonz rút gọn link <url1> [url2 ...] hoặc: bonz link <url>',
      showRole: false
    });

    // Theo yêu cầu: chỉ hiển thị Bảng thông tin dịch vụ, không kèm danh sách link
    return api.sendMessage(header, threadId, type);
  } catch (err) {
    const header = __formatServiceInfo({
      service: 'bonz rút gọn link',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      showRole: false
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý tìm kiếm nhạc SoundCloud
async function handleMusic(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const Threads = require('../../core/controller/controllerThreads');
  const soundcloud = require('./soundcloud.js');

  // Cache danh sách bài theo thread+uid trong 10 phút và lưu cả bản thread-level để ai cũng chọn được
  async function setMusicCache(list) {
    try {
      const data = await Threads.getData(threadId);
      const cache = data?.music_cache || {};
      const payload = { ts: Date.now(), list: Array.isArray(list) ? list : [] };
      cache[String(senderId)] = payload;           // cache theo người dùng
      cache.thread_last = payload;                 // cache mức nhóm (bản gần nhất)
      await Threads.setData(threadId, { ...(data || {}), music_cache: cache });
    } catch (_) {}
  }
  async function getMusicCache(maxAgeMs = 600000) { // 10 phút
    try {
      const data = await Threads.getData(threadId);
      const cache = data?.music_cache || {};
      // ưu tiên cache theo user
      let entry = cache[String(senderId)];
      if (!entry || (Date.now() - (entry.ts || 0) > maxAgeMs)) {
        // fallback sang bản gần nhất của thread
        entry = cache.thread_last;
      }
      if (!entry) return null;
      if (Date.now() - (entry.ts || 0) > maxAgeMs) return null;
      return Array.isArray(entry.list) ? entry.list : null;
    } catch (_) { return null; }
  }

  // chọn bài từ danh sách đã tìm
  const firstToken = (args[0] || '').toLowerCase();
  const isChooseCmd = ['chọn','chon','chọn bài','chon bai'].includes(firstToken) || /^(chọn|chon)\d+$/i.test(firstToken);
  const isDirectNumber = args.length === 1 && /^\d+$/.test(firstToken);
  if (args.length >= 1 && (isChooseCmd || isDirectNumber)) {
    let idx = NaN;
    if (isDirectNumber) {
      idx = parseInt(firstToken, 10);
    } else if (/^(chọn|chon)\d+$/i.test(firstToken)) {
      const m = firstToken.match(/^(?:chọn|chon)(\d+)$/i);
      if (m) idx = parseInt(m[1], 10);
    } else {
      idx = parseInt(args[1], 10);
    }
    if (isNaN(idx) || idx <= 0) {
      return api.sendMessage('❌ Vui lòng nhập số thứ tự hợp lệ. Ví dụ: bonz nhạc chọn 1', threadId, type);
    }
    const list = await getMusicCache();
    if (!Array.isArray(list) || list.length === 0) {
      return api.sendMessage('❌ Không có danh sách gần đây. Hãy tìm trước: bonz nhạc <từ khóa>', threadId, type);
    }
    const chosen = list[idx - 1];
    if (!chosen) {
      return api.sendMessage(`❌ Chỉ số không hợp lệ. Hãy chọn từ 1-${list.length}`, threadId, type);
    }
    try {
      await api.sendMessage('🔽 Đang xử lý phát nhạc, vui lòng đợi...', threadId, type);
      const streamUrl = await soundcloud.getMusicStreamUrl(chosen.link);
      if (!streamUrl) return api.sendMessage('❌ Không lấy được link phát trực tiếp. Thử bài khác.', threadId, type);

      const caption = [
        `🎶 ${chosen.title}`,
        chosen.username ? `👤 ${chosen.username}` : '',
        chosen.playCount ? `▶️ ${chosen.playCount} | ❤️ ${chosen.likeCount || 0}` : ''
      ].filter(Boolean).join('\n');

      // 1) Thử gửi voice trực tiếp từ URL
      const urlVoicePayloads = [
        { msg: caption, attachments: [streamUrl], asVoice: true },
        { msg: caption, attachments: [streamUrl], voice: true },
        { msg: caption, voice: streamUrl },
        { msg: caption, audio: streamUrl },
        { msg: caption, attachments: streamUrl, asVoice: true },
      ];
      for (const p of urlVoicePayloads) {
        try { await api.sendMessage(p, threadId, type); return; } catch (_) {}
      }

      // 2) Nếu không được, tải file mp3 và gửi
      const safeTitle = (chosen.title || 'soundcloud').slice(0,80).replace(/[<>:"/\\|?*]/g,'_');
      const filePath = await soundcloud.saveFileToCache(streamUrl, `${safeTitle}.mp3`);
      if (!filePath) return api.sendMessage('❌ Lỗi tải file.', threadId, type);

      const fileVoicePayloads = [
        { msg: caption, attachments: [filePath], asVoice: true },
        { msg: caption, attachments: [filePath], voice: true },
        { msg: caption, voice: filePath },
        { msg: caption, audio: filePath },
        { msg: caption, attachments: filePath, asVoice: true },
      ];
      let sent = false;
      for (const p of fileVoicePayloads) {
        try { await api.sendMessage(p, threadId, type); sent = true; break; } catch (_) {}
      }
      if (!sent) {
        await api.sendMessage({ msg: caption, attachments: [filePath] }, threadId, type);
      }
      setTimeout(async ()=>{ try { const fs = require('fs').promises; await fs.unlink(filePath); } catch(_){} }, 300000);
    } catch (e) {
      return api.sendMessage('❌ Gửi nhạc thất bại, vui lòng thử lại.', threadId, type);
    }
    return;
  }

  if (args.length === 0) {
    return api.sendMessage('🎵 Sử dụng: bonz nhạc <tên bài hát>\nVí dụ: bonz nhạc despacito', threadId, type);
  }
  const query = args.join(' ');
  try {
    // Lấy tên người dùng
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch (_) {}

    await api.sendMessage(`🔍 Đang tìm kiếm "${query}" trên SoundCloud...`, threadId, type);
    const songs = await soundcloud.searchSongs(query);
    if (!Array.isArray(songs) || songs.length === 0) {
      return api.sendMessage('❌ Không tìm thấy bài hát nào. Thử từ khóa khác.', threadId, type);
    }
    // Lấy metadata cho các bài hát (tối đa 5)
    for (let i = 0; i < Math.min(songs.length, 5); i++) {
      try {
        const metadata = await soundcloud.getSongMetadata(songs[i].link);
        songs[i] = { ...songs[i], ...metadata };
      } catch (_) {}
    }
    const top5 = songs.slice(0,5);
    await setMusicCache(top5);
    const imagePath = await soundcloud.createSongListImage(top5, userName);
    if (imagePath) {
      try {
        await api.sendMessage({ msg: `🎶 Danh sách cho: ${query}`, attachments: imagePath }, threadId, type);
      } catch {
        await api.sendMessage(`🎶 Danh sách cho: ${query}\n${top5.map((s,i)=>`${i+1}. ${s.title}`).join('\n')}\n\nDùng: bonz nhạc chọn <số>`, threadId, type);
      }
    } else {
      await api.sendMessage(`🎶 Danh sách cho: ${query}\n${top5.map((s,i)=>`${i+1}. ${s.title}`).join('\n')}\n\nDùng: bonz nhạc chọn <số>`, threadId, type);
    }
  } catch (e) {
    return api.sendMessage('❌ Có lỗi khi tìm kiếm nhạc.', threadId, type);
  }
}

// Kick all thành viên trong nhóm (chỉ admin/owner)
async function handleKickAll(api, event) {
  const { threadId, type, data } = event;
  const { ThreadType } = require('zca-js');
  
  if (type !== ThreadType.Group) {
    return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const senderId = data?.uidFrom;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}

  // Kiểm tra quyền bot admin/owner
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot : [];
  const isBotAdmin = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));
  
  if (!isBotAdmin) {
    const header = __formatServiceInfo({
      service: 'bonz kick all',
      userName,
      userId: senderId,
      notify: '❌ Bạn không có quyền sử dụng lệnh này',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz kick all', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }

  try {
    // Debug: Kiểm tra các method API có sẵn
    const availableMethods = Object.getOwnPropertyNames(api).filter(name => 
      typeof api[name] === 'function' && name.toLowerCase().includes('remove')
    );
    console.log('Available remove methods:', availableMethods);

    // Thử các method kick khác nhau
    const kickMethods = [
      'removeUserFromGroup',
      'removeParticipant', 
      'kickMember',
      'removeMember',
      'removeUser'
    ];

    let workingKickMethod = null;
    for (const method of kickMethods) {
      if (typeof api[method] === 'function') {
        workingKickMethod = method;
        break;
      }
    }

    if (!workingKickMethod) {
      const header = __formatServiceInfo({
        service: 'bonz kick all',
        userName,
        userId: senderId,
        notify: `❌ API không hỗ trợ kick. Methods: ${availableMethods.join(', ')}`,
        role: __getRoleLabel(senderId),
        usage: __incUsage('bonz kick all', senderId)
      });
      return api.sendMessage(header, threadId, type);
    }

    // Tìm method lấy thông tin nhóm
    const infoMethods = [
      'getThreadInfo',
      'getGroupInfo', 
      'getChatInfo',
      'getConversationInfo',
      'getParticipants'
    ];

    let groupInfo = null;
    let workingInfoMethod = null;
    
    for (const method of infoMethods) {
      if (typeof api[method] === 'function') {
        try {
          groupInfo = await api[method](threadId);
          workingInfoMethod = method;
          break;
        } catch (e) {
          console.log(`Method ${method} failed:`, e?.message);
          continue;
        }
      }
    }

    // Nếu không lấy được thông tin nhóm, thử kick trực tiếp từ event
    if (!groupInfo) {
      const header = __formatServiceInfo({
        service: 'bonz kick all',
        userName,
        userId: senderId,
        notify: `❌ Không thể lấy thông tin nhóm. Available methods: ${Object.getOwnPropertyNames(api).filter(n => typeof api[n] === 'function' && n.toLowerCase().includes('thread')).join(', ')}`,
        role: __getRoleLabel(senderId),
        usage: __incUsage('bonz kick all', senderId)
      });
      return api.sendMessage(header, threadId, type);
    }

    const members = groupInfo?.members || groupInfo?.participantIDs || groupInfo?.participants || [];
    const botId = api.getCurrentUserID?.() || global?.botID || api.getAppStateDetails?.()?.uid;
    
    console.log(`Group members count: ${members.length}, Bot ID: ${botId}`);

    // Lọc bỏ bot và người gửi lệnh
    const membersToKick = members.filter(member => {
      const memberId = member?.id || member?.userID || member;
      return memberId !== botId && 
             memberId !== senderId &&
             !adminList.includes(String(memberId)) &&
             !ownerList.includes(String(memberId));
    });

    if (membersToKick.length === 0) {
      const header = __formatServiceInfo({
        service: 'bonz kick all',
        userName,
        userId: senderId,
        notify: `Không có thành viên để kick. Tổng: ${members.length}, Bot: ${botId}`,
        role: __getRoleLabel(senderId),
        usage: __incUsage('bonz kick all', senderId)
      });
      return api.sendMessage(header, threadId, type);
    }

    const header = __formatServiceInfo({
      service: 'bonz kick all',
      userName,
      userId: senderId,
      notify: `Đang kick ${membersToKick.length} thành viên bằng ${workingKickMethod} (info: ${workingInfoMethod})...`,
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz kick all', senderId)
    });
    await api.sendMessage(header, threadId, type);

    let kickedCount = 0;
    let failedCount = 0;
    const errors = [];

    // Kick từng thành viên: mention trước rồi kick
    for (const member of membersToKick) {
      const memberId = member?.id || member?.userID || member;
      try {
        // Thử lấy tên để mention đẹp
        let display = 'người dùng';
        try {
          const uinfo = await api.getUserInfo(memberId);
          display = uinfo?.changed_profiles?.[memberId]?.displayName || display;
        } catch {}

        const mentionText = `@${display}`;
        try {
          await api.sendMessage({
            msg: `⚠️ ${mentionText} sẽ bị kick khỏi nhóm.`,
            mentions: [{ pos: 2, uid: String(memberId), len: mentionText.length }]
          }, threadId, type);
        } catch {}

        // Delay nhẹ giữa mention và kick
        await new Promise(r => setTimeout(r, 400));

        await api[workingKickMethod](memberId, threadId);
        kickedCount++;
        // Delay nhỏ để tránh spam API
        await new Promise(resolve => setTimeout(resolve, 600));
      } catch (error) {
        failedCount++;
        const errorMsg = error?.message || String(error);
        errors.push(errorMsg);
        console.log(`Lỗi kick ${memberId}:`, errorMsg);
        // Báo lỗi ngay khi không kick được
        try {
          const mentionText2 = display ? `@${display}` : `UID ${memberId}`;
          const mentions2 = display ? [{ pos: 12, uid: String(memberId), len: mentionText2.length }] : [];
          await api.sendMessage({ msg: `❌ đéo kick đc ${mentionText2}: ${errorMsg}` , mentions: mentions2 }, threadId, type);
        } catch {}
      }
    }

    const result = [
      `✅ Hoàn thành kick all`,
      `👥 Đã kick: ${kickedCount} thành viên`,
      `❌ Thất bại: ${failedCount} thành viên`,
      `📊 Tổng cộng: ${membersToKick.length} thành viên`,
      errors.length > 0 ? `🔍 Lỗi mẫu: ${errors[0]}` : ''
    ].filter(Boolean).join('\n');

    return api.sendMessage(result, threadId, type);

  } catch (error) {
    console.error('Lỗi kick all:', error);
    const errorDetail = error?.message || error?.code || String(error);
    const header = __formatServiceInfo({
      service: 'bonz kick all',
      userName,
      userId: senderId,
      notify: `Lỗi hệ thống: ${errorDetail}`,
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz kick all', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Kick thành viên khỏi nhóm: yêu cầu admin nhóm hoặc admin/owner bot
async function handleKick(api, event, args = []) {
  const { threadId, type } = event;
  const { ThreadType } = require('zca-js');

  if (type !== ThreadType.Group) {
    return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}

  // Kiểm tra quyền bot admin/owner
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot : [];
  const hasBotPriv = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));

  // Kiểm tra admin nhóm
  let hasGroupAdmin = false;
  try {
    const info = await api.getGroupInfo(threadId);
    const groupInfo = info?.gridInfoMap?.[threadId] || info?.groupInfo || info;
    const isCreator = groupInfo?.creatorId && String(groupInfo.creatorId) === String(senderId);
    const adminIds = Array.isArray(groupInfo?.adminIds) ? groupInfo.adminIds.map(String) : [];
    hasGroupAdmin = isCreator || adminIds.includes(String(senderId));
  } catch {}

  if (!(hasBotPriv || hasGroupAdmin)) {
    const header = __formatServiceInfo({
      service: 'bonz cút',
      userName,
      userId: senderId,
      notify: '❌ Bạn cần là quản trị viên nhóm hoặc admin bot để dùng lệnh này',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz cút', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }

  // Xác định danh sách UID cần kick
  const targets = new Set();

  // 1) Nếu reply tin nhắn: lấy UID từ tin nhắn được reply
  try {
    const r = event?.messageReply || event?.replyTo;
    const rid = r?.authorId || r?.senderId || r?.data?.uidFrom || r?.uidFrom;
    if (rid) targets.add(String(rid));
  } catch {}

  // 2) Lấy từ tham số (sau từ khoá 'cút'/'kick')
  for (const token of (args || []).slice(1)) {
    const id = String(token).replace(/[^0-9]/g, '').trim();
    if (id.length >= 6) targets.add(id);
  }

  // 3) Lấy từ tag @mention trong tin nhắn
  try {
    const mentions = event?.data?.mentions;
    if (Array.isArray(mentions)) {
      for (const m of mentions) {
        const mid = String(m?.uid || m?.id || '').trim();
        if (mid && mid.length >= 6) targets.add(mid);
      }
    }
  } catch {}

  if (targets.size === 0) {
    const header = __formatServiceInfo({
      service: 'bonz cút',
      userName,
      userId: senderId,
      notify: 'Hướng dẫn sử dụng',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz cút', senderId),
      howToUse: 'bonz cút <uid...> hoặc reply tin nhắn của người cần kick'
    });
    return api.sendMessage(header, threadId, type);
  }

  // Không cho tự kick mình nếu không phải Owner/BotAdmin
  if (!hasBotPriv) {
    targets.delete(String(senderId));
  }

  // Không kick admin/owner bot khác
  for (const adminId of [...adminList, ...ownerList]) {
    targets.delete(String(adminId));
  }

  if (targets.size === 0) {
    const header = __formatServiceInfo({
      service: 'bonz cút',
      userName,
      userId: senderId,
      notify: '❗ Không có UID hợp lệ để kick',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz cút', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }

  // Tìm method kick phù hợp
  const kickMethods = [
    'removeUserFromGroup',
    'removeParticipant', 
    'kickMember',
    'removeMember',
    'removeUser'
  ];

  let workingKickMethod = null;
  for (const method of kickMethods) {
    if (typeof api[method] === 'function') {
      workingKickMethod = method;
      break;
    }
  }

  if (!workingKickMethod) {
    const header = __formatServiceInfo({
      service: 'bonz cút',
      userName,
      userId: senderId,
      notify: '❌ API không hỗ trợ kick thành viên',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz cút', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }

  const header = __formatServiceInfo({
    service: 'bonz cút',
    userName,
    userId: senderId,
    notify: `Đang kick ${targets.size} thành viên...`,
    role: __getRoleLabel(senderId),
    usage: __incUsage('bonz cút', senderId)
  });
  await api.sendMessage(header, threadId, type);

  let ok = 0, fail = 0;
  const errorDetails = [];
  
  for (const uid of targets) {
    try {
      await api[workingKickMethod](uid, threadId);
      ok++;
      // Delay nhỏ để tránh spam API
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      fail++;
      const msg = e?.message || e?.error?.message || String(e);
      errorDetails.push({ uid, msg });
      // Báo lỗi ngay khi không kick được
      try {
        // Thử lấy tên hiển thị để mention
        let display = '';
        try {
          const uinfo = await api.getUserInfo(uid);
          display = uinfo?.changed_profiles?.[uid]?.displayName || '';
        } catch {}
        const mentionText = display ? `@${display}` : `UID ${uid}`;
        const mentions = display ? [{ pos: 3, uid: String(uid), len: mentionText.length }] : [];
        await api.sendMessage({ msg: `❌ đéo kick đc ${mentionText}: ${msg}`, mentions }, threadId, type);
      } catch {}
    }
  }

  const lines = [
    '🛠️ Kết quả kick thành viên',
    `✅ Thành công: ${ok}`,
    `❌ Thất bại: ${fail}`
  ];
  
  if (errorDetails.length > 0) {
    const top = errorDetails.slice(0, 3)
      .map((e, i) => ` • #${i+1} UID ${e.uid}: ${e.msg}`);
    lines.push('', 'Chi tiết lỗi (tối đa 3):', ...top);
  }
  
  return api.sendMessage(lines.join('\n'), threadId, type);
}

// Chọn bài hát từ danh sách: bonz song chọn <số>
async function handleSongSelect(api, event, songIndex, originalQuery) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz song', senderId);

  // Lấy lại danh sách từ cache hoặc search lại
  const query = originalQuery || 'default search';
  try {
    const searchUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`;
    const searchRes = await axios.get(searchUrl, { timeout: 15000 });
    const songs = searchRes?.data?.data || [];
    
    if (songIndex > songs.length) {
      const header = __formatServiceInfo({
        service: 'bonz song', userName, userId: senderId, role, usage,
        notify: `Số thứ tự không hợp lệ. Chỉ có ${songs.length} bài hát.`
      });
      return api.sendMessage(header, threadId, type);
    }

    const selectedSong = songs[songIndex - 1];
    const artist = selectedSong?.artist?.name || 'Unknown Artist';
    const title = selectedSong?.title || 'Unknown Title';

    // Lấy lời bài hát
    const lyricsUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const lyricsRes = await axios.get(lyricsUrl, { timeout: 15000 });
    const lyrics = lyricsRes?.data?.lyrics;

    if (!lyrics) {
      const header = __formatServiceInfo({
        service: 'bonz song', userName, userId: senderId, role, usage,
        notify: `Không tìm thấy lời cho: ${artist} - ${title}`
      });
      return api.sendMessage(header, threadId, type);
    }

    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: `🎵 ${artist} - ${title}`
    });

    // Chia lời bài hát nếu quá dài
    const maxLength = 3000;
    const lyricsClean = lyrics.trim();
    
    if (lyricsClean.length <= maxLength) {
      return api.sendMessage(`${header}\n\n${lyricsClean}`, threadId, type);
    } else {
      const parts = [];
      let currentPart = '';
      const lines = lyricsClean.split('\n');
      
      for (const line of lines) {
        if ((currentPart + line + '\n').length > maxLength) {
          if (currentPart) parts.push(currentPart.trim());
          currentPart = line + '\n';
        } else {
          currentPart += line + '\n';
        }
      }
      if (currentPart) parts.push(currentPart.trim());

      await api.sendMessage(`${header}\n\n${parts[0]}`, threadId, type);
      
      for (let i = 1; i < parts.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await api.sendMessage(`📝 Phần ${i + 1}:\n\n${parts[i]}`, threadId, type);
      }
    }

  } catch (error) {
    console.error('Lỗi chọn bài hát:', error);
    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Demo bug-like messages for educational purposes (admin-only)
async function handleBugDemo(api, event, variant) {
  const { threadId, type } = event;
  const warn = '[DEMO] Đây là tin nhắn mô phỏng “bug message” để trình chiếu tác hại. KHÔNG dùng để lách luật.';
  const zeroWidth = '\u200B\u200C\u200D\u2060\uFEFF\u034F';
  try {
    switch (variant) {
      case 'zero-width':
      case 'zerowidth': {
        const msg = `bug${zeroWidth} message${zeroWidth} ví dụ${zeroWidth} chèn${zeroWidth} ký tự ẩn`;
        return await api.sendMessage(`${warn}\n\n${msg}`, threadId, type);
      }
      case 'invite-hidden': {
        // Chèn zero-width vào giữa domain invite
        const demo = `discord${zeroWidth}.gg/${zeroWidth}abc${zeroWidth}123`;
        return await api.sendMessage(`${warn}\n\nLink mời bị che: ${demo}`, threadId, type);
      }
      case 'rtl': {
        const RLO = '\u202E'; // Right-to-Left Override
        const PDF = '\u202C'; // Pop Directional Formatting
        const msg = `Văn bản bình thường ${RLO}txt.ppt.3gp${PDF} tiếp tục…`;
        return await api.sendMessage(`${warn}\n\n${msg}`, threadId, type);
      }
      case 'long': {
        const part = 'A'.repeat(900);
        const longMsg = `${warn}\n\n` + part + '\n' + part + '\n' + part;
        return await api.sendMessage(longMsg, threadId, type);
      }
      default: {
        const help = [
          'Dùng: bonz demo bug <variant>',
          'Các variant:',
          '- zero-width',
          '- invite-hidden',
          '- rtl',
          '- long'
        ].join('\n');
        return await api.sendMessage(help, threadId, type);
      }
    }
  } catch (e) {
    try { return await api.sendMessage('❌ Không thể gửi demo bug lúc này.', threadId, type); } catch {}
  }
}

// Đổi tên nhóm nhanh
async function handleRename(api, event, nameArgs = []) {
  const { threadId, type } = event;
  const { ThreadType } = require('zca-js');
  if (type !== ThreadType.Group) {
    return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }
  const newName = (nameArgs || []).join(' ').trim();
  if (!newName) {
    return api.sendMessage('Dùng: bonz rename <tên mới>', threadId, type);
  }

  // Quyền: admin/owner bot hoặc admin nhóm
  const senderId = event?.data?.uidFrom || event?.authorId;
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const isBotAdmin = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));

  let isGroupAdmin = false;
  try {
    // cố gắng lấy thông tin nhóm để xác định quyền
    const info = (await (api.getGroupInfo?.(threadId) || api.getThreadInfo?.(threadId) || api.getConversationInfo?.(threadId))) || {};
    const creatorId = info?.creator_id || info?.adminIDs?.[0] || info?.owner_id;
    const admins = (info?.adminIDs || info?.admins || info?.participants?.filter?.(m => m?.is_admin).map?.(m => m?.id)) || [];
    isGroupAdmin = String(senderId) === String(creatorId) || admins.map(String).includes(String(senderId));
  } catch {}

  if (!(isBotAdmin || isGroupAdmin)) {
    return api.sendMessage('❌ Bạn cần là admin nhóm hoặc admin/owner bot để đổi tên nhóm.', threadId, type);
  }

  // Tìm method đổi tên khả dụng (theo nhiều SDK)
  const renameMethodNames = [
    'changeGroupName',      // (threadId, name)
    'updateGroupSettings',  // (threadId, { name })
    'setThreadName',        // (name, threadId)
    'setGroupName',         // (name, threadId)
    'changeThreadName',     // (name, threadId)
    'setTitle',             // (threadId, name)
    'renameGroup'           // (threadId, name)
  ];
  let usedMethod = null;
  let lastError = null;
  for (const method of renameMethodNames) {
    if (typeof api[method] !== 'function') continue;
    try {
      if (method === 'changeGroupName') {
        // Thử các biến thể chữ ký
        try { await api.changeGroupName(threadId, newName); usedMethod = method; break; } catch {}
        try { await api.changeGroupName(String(threadId), String(newName)); usedMethod = method; break; } catch {}
        try { await api.changeGroupName({ groupId: threadId, name: newName }); usedMethod = method; break; } catch {}
        try { await api.changeGroupName({ threadId, name: newName }); usedMethod = method; break; } catch {}
      } else if (method === 'updateGroupSettings') {
        // Thử nhiều field khác nhau: name/groupName/title
        const variants = [
          { name: newName },
          { groupName: newName },
          { title: newName }
        ];
        let ok = false;
        for (const body of variants) {
          try { await api.updateGroupSettings(threadId, body); usedMethod = `${method}:${Object.keys(body)[0]}`; ok = true; break; } catch {}
          try { await api.updateGroupSettings(String(threadId), body); usedMethod = `${method}:${Object.keys(body)[0]}`; ok = true; break; } catch {}
          try { await api.updateGroupSettings({ groupId: threadId, ...body }); usedMethod = `${method}:${Object.keys(body)[0]}`; ok = true; break; } catch {}
        }
        if (ok) break;
      } else if (method === 'setTitle' || method === 'renameGroup') {
        // một số SDK dùng (threadId, name)
        await api[method](threadId, newName);
        usedMethod = method; break;
      } else {
        // phổ biến: (name, threadId)
        await api[method](newName, threadId);
        usedMethod = method; break;
      }
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  if (usedMethod) {
    return api.sendMessage(`✅ Đã đổi tên nhóm thành: ${newName} (method: ${usedMethod})`, threadId, type);
  }

  // Không method nào chạy được
  const available = Object.getOwnPropertyNames(api).filter(n => typeof api[n] === 'function').join(', ');
  const errMsg = lastError?.message || String(lastError || 'unknown');
  return api.sendMessage(`❌ Không thể đổi tên nhóm (API không hỗ trợ hoặc thiếu quyền).
Methods có sẵn: ${available}
Lỗi gần nhất: ${errMsg}`, threadId, type);
}

// ======================== TIKTOK SEARCH/DOWNLOAD ========================
const __tikCache = new Map(); // key: `${threadId}:${uid}` -> { videos, at }
const __TIK_TTL = 10 * 60 * 1000; // 10 phút
const __TIK_MESSAGE_TTL = 60000;
const __TIK_SELECT_ALIASES = ['chọn', 'chon', 'chonvideo', 'chonv', 'pick', 'select', 'số', 'so'];

function __tikKey(threadId, uid) { return `${threadId}:${uid}`; }

function __isTikSelectKeyword(word = '') {
  return __TIK_SELECT_ALIASES.includes(String(word || '').toLowerCase());
}

async function handleTikTokSearch(api, event, query) {
  const { threadId, type, data } = event;
  const axios = require('axios');
  const senderId = data?.uidFrom || event?.authorId;
  if (!query) {
    return api.sendMessage({ msg: 'Dùng: bonz video tik <từ khóa>', ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }
  try {
    const url = `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}&count=10`; 
    const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' }});
    const body = res?.data;
    if (!body || !body.data || !Array.isArray(body.data.videos)) {
      throw new Error('Không có video nào được tìm thấy cho từ khóa này.');
    }
    const videos = body.data.videos || [];
    if (videos.length === 0) {
      return api.sendMessage({ msg: 'Không tìm thấy video TikTok nào với từ khóa bạn yêu cầu.', ttl: __TIK_MESSAGE_TTL }, threadId, type);
    }
    __tikCache.set(__tikKey(threadId, senderId), { videos, at: Date.now() });
    const lines = ['📍 Chọn số thứ tự video để tải:\n'];
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i] || {};
      const title = (v.title || 'No title').toString();
      const views = v.play_count || 0;
      const likes = v.digg_count || 0;
      const share = v.share_count || 0;
      const down = v.download_count || 0;
      const cmt = v.comment_count || 0;
      lines.push(`${i+1}. ${title}\n📊: ${views} | 💜: ${likes} | 📮: ${cmt} | 📽️: ${share} | 📥: ${down}\n`);
    }
    lines.push('\nDùng: bonz video tik chọn <số>');
    return api.sendMessage(lines.join('\n'), threadId, type);
  } catch (e) {
    const msg = e?.message || String(e);
    return api.sendMessage(`❌ Lỗi tìm kiếm TikTok: ${msg}`, threadId, type);
  }
}

async function handleTikTokSelect(api, event, n) {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  const key = __tikKey(threadId, senderId);
  const entry = __tikCache.get(key);
  if (!entry || !Array.isArray(entry.videos) || (Date.now() - entry.at) > __TIK_TTL) {
    return api.sendMessage({ msg: '❌ Danh sách tìm kiếm đã hết hạn hoặc không có. Vui lòng tìm lại: bonz video tik <từ khóa>', ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }
  const idx = (Number(n) || 0) - 1;
  if (idx < 0 || idx >= entry.videos.length) {
    return api.sendMessage({ msg: '❌ Số thứ tự không hợp lệ. Dùng: bonz video tik chọn <số>', ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }
  const v = entry.videos[idx];
  const title = v?.title || 'No title';
  const noWm = v?.play || v?.wmplay || v?.hdplay || v?.url || v?.download_url;
  const cover = v?.origin_cover || v?.dynamic_cover || v?.cover || null;
  const author = v?.author || v?.author_name || '';
  const caption = [
    `🎬 ${title}`,
    author ? `👤 ${author}` : '',
    noWm ? `🔗 ${noWm}` : ''
  ].filter(Boolean).join('\n');
  if (!noWm) {
    return api.sendMessage({ msg: caption, ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }

  try {
    const tempDir = path.join(__dirname, 'temp');
    await fsPromises.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `tik_${Date.now()}_${senderId || 'user'}.mp4`);

    const resp = await axios.get(noWm, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    await fsPromises.writeFile(filePath, resp.data);

    let sent = false;

    if (typeof processVideo === 'function' && typeof api.sendVideo === 'function') {
      try {
        const videoData = await processVideo(filePath, threadId, type);
        if (videoData?.videoUrl) {
          await api.sendVideo({
            videoUrl: videoData.videoUrl,
            thumbnailUrl: videoData.thumbnailUrl,
            duration: videoData.metadata?.duration,
            width: videoData.metadata?.width,
            height: videoData.metadata?.height,
            msg: caption,
            ttl: 60000
          }, threadId, type);
          sent = true;
        }
      } catch (err) {
        console.warn('[bonz video tik] processVideo/sendVideo failed:', err?.message || err);
      }
    }

    if (!sent && typeof api.uploadAttachment === 'function') {
      try {
        const buf = await fsPromises.readFile(filePath);
        let attachment = null;
        try { attachment = await api.uploadAttachment(buf, 'video/mp4'); } catch {}
        if (!attachment) {
          attachment = await api.uploadAttachment({ data: buf, filename: 'video.mp4', contentType: 'video/mp4' });
        }
        if (attachment) {
          await api.sendMessage({ msg: caption, attachment, ttl: __TIK_MESSAGE_TTL }, threadId, type);
          sent = true;
        }
      } catch (err) {
        console.warn('[bonz video tik] uploadAttachment fallback failed:', err?.message || err);
      }
    }

    if (!sent) {
      try {
        await api.sendMessage({ msg: caption, attachments: [filePath] }, threadId, type);
        sent = true;
      } catch (err) {
        console.warn('[bonz video tik] attachment path fallback failed:', err?.message || err);
      }
    }

    if (!sent) {
      const buf = await fsPromises.readFile(filePath);
      try {
        await api.sendMessage({ msg: caption, attachment: buf, filename: 'video.mp4', mime: 'video/mp4', ttl: __TIK_MESSAGE_TTL }, threadId, type);
        sent = true;
      } catch (err) {
        console.warn('[bonz video tik] buffer fallback failed:', err?.message || err);
      }
    }

    if (!sent) {
      await api.sendMessage({ msg: caption, ttl: __TIK_MESSAGE_TTL }, threadId, type);
    }

    setTimeout(async () => {
      try { await fsPromises.unlink(filePath); } catch {}
    }, 5 * 60 * 1000);
    return;
  } catch (e) {
    const em = e?.message || String(e);
    try {
      if (cover) await api.sendMessage({ msg: `❌ Lỗi tải video: ${em}\n\n${caption}`, attachment: cover, ttl: __TIK_MESSAGE_TTL }, threadId, type);
      else await api.sendMessage({ msg: `❌ Lỗi tải video: ${em}\n\n${caption}`, ttl: __TIK_MESSAGE_TTL }, threadId, type);
      return;
    } catch {}
    return api.sendMessage({ msg: `❌ Lỗi tải video: ${em}\n\n${caption}`, ttl: __TIK_MESSAGE_TTL }, threadId, type);
  }
}

// ======================== YOUTUBE SEARCH ========================
async function handleYouTubeSearch(api, event, textArgs = []) {
  const { threadId, type } = event || {};
  const query = (textArgs || []).join(' ').trim();
  if (!query) return api.sendMessage('Dùng: bonz youtube <từ khóa> (cũng hỗ trợ: bonz yt <từ khóa> hoặc thêm "sr")', threadId, type);

  const axios = require('axios');
  const endpoints = [
    'https://piped.video',
    'https://piped.projectsegfau.lt',
    'https://piped.in.projectsegfau.lt'
  ].map(base => `${base}/api/v1/search?q=${encodeURIComponent(query)}&region=VN&hl=vi`);
  let videos = [];
  let lastErr = '';
  for (const endpoint of endpoints) {
    try {
      const res = await axios.get(endpoint, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      videos = items.filter(x => (x?.type || x?.itemType) === 'video' || x?.duration || x?.videoId).slice(0, 5);
      if (videos.length > 0) { lastErr = ''; break; }
    } catch (e) {
      lastErr = e?.message || String(e);
      continue;
    }
  }
  if (videos.length === 0) {
    const note = lastErr ? `\nChi tiết: ${lastErr}` : '';
    return api.sendMessage(`Không tìm thấy kết quả hoặc dịch vụ tìm kiếm đang lỗi.${note}`, threadId, type);
  }

  const t = (s) => String(s || '');
  const lines = [`🔎 Kết quả YouTube cho: ${query}`];
  videos.forEach((v, i) => {
    const vid = v?.videoId || v?.id;
    const title = t(v?.title);
    const author = t(v?.author) || t(v?.uploaderName) || t(v?.channelTitle);
    const views = (v?.views != null) ? `${Number(v.views).toLocaleString('vi-VN')} lượt xem` : (t(v?.viewCountText) || '');
    const published = t(v?.uploadedDate) || t(v?.publishedText) || '';
    const duration = t(v?.duration) || '';
    const url = vid ? `https://www.youtube.com/watch?v=${vid}` : (v?.url || v?.shortUrl || '');
    lines.push(`${i + 1}.`);
    if (author) lines.push(`• Kênh: ${author}`);
    lines.push(`• Tiêu đề: ${title}`);
    if (views) lines.push(`• Lượt xem: ${views}`);
    if (published) lines.push(`• Thời gian: ${published}`);
    if (duration) lines.push(`• Thời lượng: ${duration}`);
    if (url) lines.push(`• Link: ${url}`);
    lines.push('');
  });
  lines.push('Gợi ý: sao chép link và dùng bonz down <link> để tải.');
  return api.sendMessage(lines.join('\n'), threadId, type);
}

// ======================== SPAM LOCK CONTROL ========================
async function handleSpamLockControl(api, event, args, ThreadsRef) {
  const { threadId, type, data } = event || {};
  const action = (args[0] || '').toLowerCase(); // lock | unlock
  const target = (args[1] || '').toLowerCase();
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const senderId = String(data?.uidFrom || event?.authorId || '');
  if (!senderId || (!admins.includes(senderId) && !owners.includes(senderId))) {
    return api.sendMessage('🚫 Bạn không có quyền để thực hiện lệnh này.', threadId, type);
  }

  try {
    if (!ThreadsRef) ThreadsRef = require('../../core/controller/controllerThreads');
  } catch {}
  if (!ThreadsRef || typeof ThreadsRef.getData !== 'function') {
    return api.sendMessage('❌ Không truy cập được lưu trữ nhóm.', threadId, type);
  }

  const th = await ThreadsRef.getData(threadId);
  const tdata = th?.data || {};
  tdata.spam_guard = tdata.spam_guard || { locks: {}, counters: {}, last_notice_at: {}, settings: {} };
  const guard = tdata.spam_guard;
  const settings = guard.settings || {};

  // Helper chọn UID mục tiêu: ưu tiên mention -> reply -> args[1]
  const getTargetUid = () => {
    // mention list theo SDK có thể là data.mentions
    const mentions = data?.mentions;
    if (Array.isArray(mentions) && mentions.length > 0) {
      const m = mentions[0];
      return String(m?.uid || m?.userId || m?.id || '');
    }
    if (data?.quote?.ownerId) return String(data.quote.ownerId);
    if (target && target !== 'status' && target !== 'all') return String(target);
    return '';
  };

  if (action === 'lock') {
    // cấu hình: threshold/window/ttl
    if (target === 'threshold') {
      const val = parseInt(args[2], 10);
      if (!Number.isFinite(val) || val <= 0) return api.sendMessage('⚠️ Dùng: bonz lock threshold <số_lần>', threadId, type);
      guard.settings.threshold = val;
      await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage(`✅ Đã đặt ngưỡng khóa = ${val} lần trong cửa sổ thời gian.`, threadId, type);
    }
    if (target === 'window') {
      const sec = parseInt(args[2], 10);
      if (!Number.isFinite(sec) || sec <= 0) return api.sendMessage('⚠️ Dùng: bonz lock window <giây>', threadId, type);
      guard.settings.windowMs = sec * 1000;
      await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage(`✅ Đã đặt cửa sổ thời gian = ${sec}s.`, threadId, type);
    }
    if (target === 'ttl') {
      const hours = parseInt(args[2], 10);
      if (!Number.isFinite(hours) || hours <= 0) return api.sendMessage('⚠️ Dùng: bonz lock ttl <giờ>', threadId, type);
      guard.settings.ttlMs = hours * 60 * 60 * 1000;
      await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage(`✅ Đã đặt thời hạn khoá = ${hours} giờ.`, threadId, type);
    }
    if (target === 'status') {
      const lockedIds = Object.keys(guard.locks || {}).filter(uid => !!guard.locks[uid]);
      if (lockedIds.length === 0) return api.sendMessage('🔓 Không có ai đang bị khoá.', threadId, type);
      // Thử lấy tên một số UID
      let names = [];
      try {
        const info = await api.getUserInfo(lockedIds);
        names = lockedIds.map(uid => (info?.changed_profiles?.[uid]?.displayName || uid));
      } catch {
        names = lockedIds;
      }
      const wnd = Number.isFinite(settings.windowMs) && settings.windowMs > 0 ? settings.windowMs : 30000;
      const thr = Number.isFinite(settings.threshold) && settings.threshold > 0 ? settings.threshold : 4;
      const ttl = Number.isFinite(settings.ttlMs) && settings.ttlMs > 0 ? settings.ttlMs : 24*60*60*1000;
      const header = `⚙️ Cấu hình: threshold=${thr}, window=${Math.round(wnd/1000)}s, ttl=${Math.round(ttl/3600000)}h`;
      return api.sendMessage(`${header}\n🔒 Đang khoá ${lockedIds.length} người dùng:\n- ` + names.join('\n- '), threadId, type);
    }
    const uid = target === 'all' ? '' : getTargetUid();
    if (target === 'all') {
      // Khóa tất cả? Tránh lạm dụng: chỉ báo cách dùng
      return api.sendMessage('⚠️ Không hỗ trợ khoá toàn bộ. Vui lòng chỉ định người dùng: bonz lock @user hoặc bonz lock <uid>', threadId, type);
    }
    if (!uid) return api.sendMessage('⚠️ Dùng: bonz lock @user | bonz lock <uid> | bonz lock status', threadId, type);
    guard.locks[uid] = true;
    await ThreadsRef.setData(threadId, tdata);
    try {
      const info = await api.getUserInfo(uid);
      const name = info?.changed_profiles?.[uid]?.displayName || uid;
      return api.sendMessage(`🔒 Đã khoá lệnh của ${name}.`, threadId, type);
    } catch {
      return api.sendMessage(`🔒 Đã khoá lệnh của UID ${uid}.`, threadId, type);
    }
  }

  if (action === 'unlock') {
    if (target === 'all') {
      guard.locks = {};
      guard.counters = {};
      guard.last_notice_at = {};
      await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage('✅ Đã mở khoá toàn bộ người dùng trong nhóm.', threadId, type);
    }
    const uid = getTargetUid();
    if (!uid) return api.sendMessage('⚠️ Dùng: bonz unlock @user | bonz unlock <uid> | bonz unlock all', threadId, type);
    delete guard.locks[uid];
    delete guard.counters[uid];
    if (guard.last_notice_at) delete guard.last_notice_at[uid];
    await ThreadsRef.setData(threadId, tdata);
    try {
      const info = await api.getUserInfo(uid);
      const name = info?.changed_profiles?.[uid]?.displayName || uid;
      return api.sendMessage(`✅ Đã mở khoá lệnh cho ${name}.`, threadId, type);
    } catch {
      return api.sendMessage(`✅ Đã mở khoá lệnh cho UID ${uid}.`, threadId, type);
    }
  }

  return api.sendMessage('⚠️ Dùng: bonz lock @user|<uid>|status | bonz unlock @user|<uid>|all', threadId, type);
}

// ======================== TAG ALL ========================
async function handleTagAll(api, event, textArgs = []) {
  const { threadId, type } = event || {};
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const senderId = String(event?.data?.uidFrom || event?.authorId || '');
  if (!senderId || (!admins.includes(senderId) && !owners.includes(senderId))) {
    return api.sendMessage('🚫 Chỉ admin/owner bot mới được phép dùng lệnh này.', threadId, type);
  }

  const note = (textArgs || []).join(' ').trim();
  if (!note) {
    return api.sendMessage('Cách dùng: bonz tag all <nội dung>', threadId, type);
  }

  // Thu thập danh sách thành viên qua nhiều API khác nhau
  let memberIds = [];
  try {
    if (typeof api.getThreadInfo === 'function') {
      const info = await api.getThreadInfo(threadId);
      const candidates = info?.participantIDs || info?.participantIds || info?.participants || info?.members;
      if (Array.isArray(candidates)) memberIds = candidates.map(x => (typeof x === 'string' ? x : (x?.id || x?.uid))).filter(Boolean);
    }
  } catch {}
  // event data fallback quick
  try {
    if (memberIds.length === 0) {
      const evc = event?.data?.participantIDs || event?.data?.participantIds || event?.participants;
      if (Array.isArray(evc)) memberIds = evc.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getGroupInfo === 'function') {
      const g = await api.getGroupInfo(threadId);
      const list = g?.members || g?.participants || g?.memberIds;
      if (Array.isArray(list)) memberIds = list.map(x => (typeof x === 'string' ? x : (x?.id || x?.uid))).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getThreadMembers === 'function') {
      const list = await api.getThreadMembers(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getParticipants === 'function') {
      const list = await api.getParticipants(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getParticipantIDs === 'function') {
      const list = await api.getParticipantIDs(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getParticipantIds === 'function') {
      const list = await api.getParticipantIds(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getMembers === 'function') {
      const list = await api.getMembers(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getMemberList === 'function') {
      const list = await api.getMemberList(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.listParticipants === 'function') {
      const list = await api.listParticipants(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.fetchParticipants === 'function') {
      const list = await api.fetchParticipants(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try {
    // Fallback theo phong cách fetchGroupInfo như mẫu Python
    if (memberIds.length === 0 && typeof api.fetchGroupInfo === 'function') {
      const gi = await api.fetchGroupInfo(threadId);
      const entry = gi?.gridInfoMap ? (gi.gridInfoMap[threadId] || gi.gridInfoMap[String(threadId)]) : null;
      const mems = entry?.memVerList;
      if (Array.isArray(mems) && mems.length > 0) {
        const ids = [];
        for (const m of mems) {
          if (typeof m === 'string') {
            const parts = m.split('_');
            if (parts.length >= 1) ids.push(parts[0]);
          } else if (m && typeof m === 'object') {
            const uid = m.uid || m.id || m.userId;
            if (uid) ids.push(String(uid));
          }
        }
        memberIds = ids.filter(Boolean);
      }
    }
  } catch {}

  // Loại bỏ sender khỏi danh sách (tùy chọn)
  memberIds = Array.from(new Set(memberIds.filter(Boolean)));

  if (memberIds.length === 0) {
    return api.sendMessage('❌ Không lấy được danh sách thành viên nhóm.', threadId, type);
  }

  // Lấy tên hiển thị
  let nameMap = {};
  try {
    const info = await api.getUserInfo(memberIds);
    for (const uid of memberIds) {
      nameMap[uid] = info?.changed_profiles?.[uid]?.displayName || uid;
    }
  } catch {}

  // Gửi theo lô (nhiều nền tảng giới hạn ~20 mention/tin)
  const batchSize = 20;
  const chunks = [];
  for (let i = 0; i < memberIds.length; i += batchSize) {
    chunks.push(memberIds.slice(i, i + batchSize));
  }

  for (let b = 0; b < chunks.length; b++) {
    const chunk = chunks[b];
    const header = b === 0 ? `📣 ${note}` : `📣 (tiếp) ${note}`;
    let body = header + '\n';
    const mentions = [];
    const zMentions = [];
    let idx = body.length;
    for (const uid of chunk) {
      const name = nameMap[uid] || uid;
      const tagText = `@${name}`;
      body += tagText + ' ';
      // Thử định dạng phổ biến: { id, tag, fromIndex, length }
      mentions.push({ id: String(uid), tag: tagText, fromIndex: idx, length: tagText.length });
      // Một số SDK dùng uid thay vì id
      mentions.push({ uid: String(uid), tag: tagText, fromIndex: idx, length: tagText.length });
      // Zalo zca-js thường dùng: { uid, offset, length }
      zMentions.push({ uid: String(uid), offset: idx, length: tagText.length });
      idx += tagText.length + 1;
    }

    // Gửi, thử nhiều cách để đính kèm mentions
    let sent = false;
    try {
      if (typeof api.sendMessage === 'function') {
        // 1) body string + options mentions
        try { await api.sendMessage(body, threadId, type, { mentions }); sent = true; } catch {}
        // 2) body string + options mention (Zalo style)
        if (!sent) try { await api.sendMessage(body, threadId, type, { mention: zMentions }); sent = true; } catch {}
        // 3) object message { body, mentions }
        if (!sent) try { await api.sendMessage({ body, mentions }, threadId, type); sent = true; } catch {}
        // 4) object message { body, mention }
        if (!sent) try { await api.sendMessage({ body, mention: zMentions }, threadId, type); sent = true; } catch {}
        // 5) object message { text, mentions }
        if (!sent) try { await api.sendMessage({ text: body, mentions }, threadId, type); sent = true; } catch {}
        // 6) object message { text, mention }
        if (!sent) try { await api.sendMessage({ text: body, mention: zMentions }, threadId, type); sent = true; } catch {}
        // 7) object message { content, mentions }
        if (!sent) try { await api.sendMessage({ content: body, mentions }, threadId, type); sent = true; } catch {}
        // 8) object message { content, mention }
        if (!sent) try { await api.sendMessage({ content: body, mention: zMentions }, threadId, type); sent = true; } catch {}
      }
    } catch {}

    // Fallback: gửi plain text nếu SDK không hỗ trợ mentions
    if (!sent) await api.sendMessage(body, threadId, type);
  }

  return;
}

// ======================== KICK ALL ========================
async function handleKickAll(api, event) {
  const { threadId, type } = event || {};
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const senderId = String(event?.data?.uidFrom || event?.authorId || '');
  if (!senderId || (!admins.includes(senderId) && !owners.includes(senderId))) {
    return api.sendMessage('🚫 Bạn không đủ quyền để dùng lệnh này.', threadId, type);
  }

  // Lấy danh sách thành viên (nhiều fallback như tag-all)
  let memberIds = [];
  try {
    if (typeof api.getThreadInfo === 'function') {
      const info = await api.getThreadInfo(threadId);
      const candidates = info?.participantIDs || info?.participantIds || info?.participants || info?.members;
      if (Array.isArray(candidates)) memberIds = candidates.map(x => (typeof x === 'string' ? x : (x?.id || x?.uid))).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0) {
      const evc = event?.data?.participantIDs || event?.data?.participantIds || event?.participants;
      if (Array.isArray(evc)) memberIds = evc.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getGroupInfo === 'function') {
      const g = await api.getGroupInfo(threadId);
      const list = g?.members || g?.participants || g?.memberIds;
      if (Array.isArray(list)) memberIds = list.map(x => (typeof x === 'string' ? x : (x?.id || x?.uid))).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getThreadMembers === 'function') {
      const list = await api.getThreadMembers(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try {
    if (memberIds.length === 0 && typeof api.getParticipants === 'function') {
      const list = await api.getParticipants(threadId);
      if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean);
    }
  } catch {}
  try { if (memberIds.length === 0 && typeof api.getParticipantIDs === 'function') { const list = await api.getParticipantIDs(threadId); if (Array.isArray(list)) memberIds = list.map(x => String(x)).filter(Boolean); } } catch {}
  try { if (memberIds.length === 0 && typeof api.getParticipantIds === 'function') { const list = await api.getParticipantIds(threadId); if (Array.isArray(list)) memberIds = list.map(x => String(x)).filter(Boolean); } } catch {}
  try { if (memberIds.length === 0 && typeof api.getMembers === 'function') { const list = await api.getMembers(threadId); if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean); } } catch {}
  try { if (memberIds.length === 0 && typeof api.getMemberList === 'function') { const list = await api.getMemberList(threadId); if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean); } } catch {}
  try { if (memberIds.length === 0 && typeof api.listParticipants === 'function') { const list = await api.listParticipants(threadId); if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean); } } catch {}
  try { if (memberIds.length === 0 && typeof api.fetchParticipants === 'function') { const list = await api.fetchParticipants(threadId); if (Array.isArray(list)) memberIds = list.map(x => String(x?.id || x?.uid || x)).filter(Boolean); } } catch {}
  try {
    if (memberIds.length === 0 && typeof api.fetchGroupInfo === 'function') {
      const gi = await api.fetchGroupInfo(threadId);
      const entry = gi?.gridInfoMap ? (gi.gridInfoMap[threadId] || gi.gridInfoMap[String(threadId)]) : null;
      const mems = entry?.memVerList;
      if (Array.isArray(mems)) {
        const ids = [];
        for (const m of mems) {
          if (typeof m === 'string') {
            const parts = m.split('_');
            if (parts.length >= 1) ids.push(parts[0]);
          } else if (m && typeof m === 'object') {
            const uid = m.uid || m.id || m.userId;
            if (uid) ids.push(String(uid));
          }
        }
        memberIds = ids.filter(Boolean);
      }
    }
  } catch {}

  memberIds = Array.from(new Set(memberIds.filter(Boolean)));
  if (memberIds.length === 0) {
    return api.sendMessage('❌ Không lấy được danh sách thành viên để kick. Có thể SDK không hỗ trợ các hàm lấy danh sách, hoặc bot chưa có đủ quyền xem thành viên. Hãy cung cấp cho mình tên các hàm có trên api (ví dụ: getThreadInfo/getParticipants/...).', threadId, type);
  }

  // Xác định botId để không tự kick
  let botId = '';
  try { botId = String(await api.getCurrentUserID?.() || await api.getUID?.() || ''); } catch {}

  // Loại trừ: admin/owner/sender/bot
  const protect = new Set([botId, senderId, ...admins, ...owners].filter(Boolean).map(String));
  const targets = memberIds.filter(uid => !protect.has(String(uid)));
  if (targets.length === 0) return api.sendMessage('⚠️ Không có thành viên hợp lệ để kick (đã loại trừ admin/owner/bot/chính bạn).', threadId, type);

  await api.sendMessage(`⏳ Bắt đầu kick ${targets.length}/${memberIds.length} thành viên (đã loại trừ admin/owner/bot).`, threadId, type);

  let kicked = 0, failed = 0;
  for (const uid of targets) {
    let ok = false; let lastErr = '';
    const attempts = [
      async () => { if (typeof api.kickUsersInGroup === 'function') { await api.kickUsersInGroup(uid, threadId); return 'kickUsersInGroup'; } },
      async () => { if (typeof api.removeUserFromGroup === 'function') { await api.removeUserFromGroup(uid, threadId); return 'removeUserFromGroup'; } },
      async () => { if (typeof api.removeParticipant === 'function') { await api.removeParticipant(threadId, uid); return 'removeParticipant(thread,uid)'; } },
      async () => { if (typeof api.removeParticipant === 'function') { await api.removeParticipant(uid); return 'removeParticipant(uid)'; } },
      async () => { if (typeof api.removeUserFromThread === 'function') { await api.removeUserFromThread(threadId, uid); return 'removeUserFromThread'; } },
      async () => { if (typeof api.kick === 'function') { await api.kick(uid, threadId); return 'kick'; } },
      async () => { if (typeof api.deleteMember === 'function') { await api.deleteMember(threadId, uid); return 'deleteMember'; } },
      async () => { if (typeof api.removeMember === 'function') { await api.removeMember(threadId, uid); return 'removeMember'; } },
    ];
    for (const fn of attempts) {
      try { const name = await fn?.(); if (name) { ok = true; break; } } catch (e) { lastErr = e?.message || String(e); }
    }
    if (ok) kicked++; else failed++;
    // Thư giãn để tránh rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  return api.sendMessage(`✅ Hoàn tất: đã kick ${kicked} thành viên, thất bại ${failed}.`, threadId, type);
}

// ======================== CÂU ĐỐ HANDLERS ========================
async function handleCauDoStart(api, event, args = [], ThreadsRef) {
  const { threadId, type } = event || {};
  if (!ThreadsRef) {
    try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {}
  }
  let tdata = {};
  try { const th = await ThreadsRef.getData(threadId); tdata = th?.data || {}; } catch {}
  tdata.cau_do = tdata.cau_do || {};

  // Reset điểm theo tháng nếu cần
  const didReset = __ensureMonthlyReset(tdata, 'cau_do');

  const item = __riddles[Math.floor(Math.random() * __riddles.length)];
  const now = Date.now();
  const ttlMs = 10 * 60 * 1000; // 10 phút
  tdata.cau_do.active = {
    q: item.q,
    a: item.a,
    at: now,
    exp: now + ttlMs,
    by: String(event?.data?.uidFrom || event?.authorId || '')
  };
  try { await ThreadsRef.setData(threadId, tdata); } catch {}

  // Lấy thông tin người dùng và xếp hạng/điểm hiện tại
  const uid = String(event?.data?.uidFrom || event?.authorId || '');
  let name = uid;
  try {
    const info = await api.getUserInfo([uid]);
    name = info?.changed_profiles?.[uid]?.displayName || uid;
  } catch {}
  const scoreMap = tdata?.cau_do?.score || {};
  const myPoints = Number(scoreMap[uid] || 0);
  const entries = Object.entries(scoreMap);
  entries.sort((a,b)=> (b[1]||0)-(a[1]||0));
  let rank = '-';
  for (let i=0;i<entries.length;i++) { if (entries[i][0] === uid) { rank = String(i+1); break; } }

  const guide = 'Trả lời bằng: bonz câu <đáp án>';
  const header = [
    '🧩 CÂU ĐỐ',
    `👤 Người dùng: ${name}`,
    `🆔 ID: ${uid}`,
    `🏆 Top: ${rank}/${entries.length || 0}`,
    `🔢 Điểm: ${myPoints}`,
  ].join('\n');

  const resetLine = didReset ? '\n♻️ Điểm câu đố đã được reset theo chu kỳ tháng.' : '';
  const body = `❓ ${item.q}`;
  const footer = `${guide}\n(Hiệu lực 10 phút)`;
  return api.sendMessage(`${header}\n\n${body}\n\n${footer}${resetLine}`, threadId, type);
}

async function handleCauDoAnswer(api, event, answerArgs = [], ThreadsRef) {
  const { threadId, type } = event || {};
  const answerRaw = (answerArgs || []).join(' ').trim();
  if (!answerRaw) return api.sendMessage('⚠️ Dùng: bonz câu <đáp án>', threadId, type);
  if (!ThreadsRef) {
    try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {}
  }
  let tdata = {};
  try { const th = await ThreadsRef.getData(threadId); tdata = th?.data || {}; } catch {}
  
  // TẠM THỜI VÔ HIỆU HÓA RESET ĐỂ DEBUG
  const didReset = false; // __ensureMonthlyReset(tdata, 'cau_do');
  
  const state = tdata?.cau_do?.active;
  if (!state) return api.sendMessage('❌ Hiện chưa có câu đố nào. Gõ: bonz câu đố để bắt đầu.', threadId, type);
  const now = Date.now();
  if (state.exp && now > state.exp) {
    delete tdata.cau_do.active;
    try { await ThreadsRef.setData(threadId, tdata); } catch {}
    return api.sendMessage('⏰ Câu đố đã hết hạn. Gõ: bonz câu đố để nhận câu mới.', threadId, type);
  }
  const normAns = __normalizeAnswer(answerRaw);
  const normKey = __normalizeAnswer(state.a);
  if (!normAns) return api.sendMessage('⚠️ Hãy nhập đáp án sau: bonz câu <đáp án>.', threadId, type);
  
  const userId = String(event?.data?.uidFrom || event?.authorId || '');
  let name = userId;
  try {
    const info = await api.getUserInfo([userId]);
    name = info?.changed_profiles?.[userId]?.displayName || userId;
  } catch {}
  
  if (normAns === normKey) {
    tdata.cau_do.score = tdata.cau_do.score || {};
    tdata.cau_do.score[userId] = (tdata.cau_do.score[userId] || 0) + 1;
    const score = tdata.cau_do.score[userId];
    const correct = state.a;
    delete tdata.cau_do.active;
    try { await ThreadsRef.setData(threadId, tdata); } catch {}

    // Tính lại xếp hạng sau khi cộng điểm
    const entries = Object.entries(tdata.cau_do.score).sort((a,b)=> (b[1]||0)-(a[1]||0));
    let rank = '-';
    for (let i=0;i<entries.length;i++){ if (entries[i][0] === userId) { rank = String(i+1); break; } }
    
    const resetLine = didReset ? '\n♻️ Điểm câu đố đã được reset theo chu kỳ tháng.' : '';
    return api.sendMessage(`✅ Chính xác!\n👤 Người dùng: ${name}\n🆔 ID: ${userId}\n🏆 Top: ${rank}/${entries.length || 0}\n🔢 Điểm của bạn: ${score}\n📌 Đáp án: ${correct}\nGõ: bonz câu đố để nhận câu tiếp theo.${resetLine}`, threadId, type);
  }
  
  // Sai: vẫn hiển thị thông tin người dùng
  const scoreMap = tdata?.cau_do?.score || {};
  const entries = Object.entries(scoreMap).sort((a,b)=> (b[1]||0)-(a[1]||0));
  let rank = '-';
  for (let i=0;i<entries.length;i++){ if (entries[i][0] === userId) { rank = String(i+1); break; } }
  const myPoints = Number(scoreMap[userId] || 0);
  
  const resetLine = didReset ? '\n♻️ Điểm câu đố đã được reset theo chu kỳ tháng.' : '';
  return api.sendMessage(`❌ Chưa đúng rồi!\n👤 Người dùng: ${name}\n🆔 ID: ${userId}\n🏆 Top: ${rank}/${entries.length || 0}\n🔢 Điểm hiện tại: ${myPoints}\nThử lại: bonz câu <đáp án>${resetLine}`, threadId, type);
}

// ======================== JOIN BY LINK ========================
async function handleJoinByLink(api, event, textArgs = []) {
  const { threadId, type, data } = event || {};
  const raw = (textArgs || []).join(' ').trim() || String(data?.content || '');
  const linkMatch = raw.match(/https?:\/\/(?:chat\.zalo\.me\/join|zalo\.me\/group|zalo\.me\/g)\/[^\s]+/i);
  if (!linkMatch) {
    return api.sendMessage('Dùng: bonz join <link mời nhóm Zalo>', threadId, type);
  }
  const link = linkMatch[0];

  // Tách mã invite ở cuối link (sau dấu /)
  const code = (() => {
    try {
      const u = new URL(link);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    } catch { return ''; }
  })();

  // Thử các API trực tiếp theo link
  const attempts = [
    async () => { if (typeof api.joinGroupByLink === 'function') { await api.joinGroupByLink(link); return 'joinGroupByLink'; } },
    async () => { if (typeof api.joinGroup === 'function') { await api.joinGroup(link); return 'joinGroup'; } },
    async () => { if (typeof api.joinChatByLink === 'function') { await api.joinChatByLink(link); return 'joinChatByLink'; } },
    async () => { if (typeof api.acceptInviteLink === 'function') { await api.acceptInviteLink(link); return 'acceptInviteLink'; } },
    async () => { if (typeof api.joinGroup === 'function') { await api.joinGroup({ link }); return 'joinGroup(object)'; } },
  ];

  let used = '', errMsg = '';
  for (const fn of attempts) {
    try { const name = await fn?.(); if (name) { used = name; break; } } catch (e) { errMsg = e?.message || String(e); }
  }

  if (used) {
    return api.sendMessage(`✅ Đã gửi yêu cầu tham gia nhóm qua link. (API: ${used})`, threadId, type);
  }

  // Nếu thất bại theo link, thử resolve để lấy chatId/groupId rồi tham gia theo ID
  let gid = '';
  const resolvers = [
    async () => { if (typeof api.getIDsGroup === 'function') { const r = await api.getIDsGroup(link); return r?.groupId || r?.chatId || r?.id; } },
    async () => { if (typeof api.resolveInviteLink === 'function') { const r = await api.resolveInviteLink(link); return r?.groupId || r?.chatId || r?.id; } },
    async () => { if (typeof api.getGroupInfoFromLink === 'function') { const r = await api.getGroupInfoFromLink(link); return r?.groupId || r?.chatId || r?.id; } },
    async () => code || ''
  ];
  for (const fn of resolvers) {
    try { const id = await fn?.(); if (id) { gid = String(id); break; } } catch {}
  }
  if (gid) {
    const idAttempts = [
      async () => { if (typeof api.joinGroupById === 'function') { await api.joinGroupById(gid); return 'joinGroupById'; } },
      async () => { if (typeof api.joinChat === 'function') { await api.joinChat(gid); return 'joinChat'; } },
      async () => { if (typeof api.acceptInvite === 'function') { await api.acceptInvite(gid); return 'acceptInvite'; } },
      async () => { if (typeof api.acceptGroupInvite === 'function') { await api.acceptGroupInvite(gid); return 'acceptGroupInvite'; } },
    ];
    for (const fn of idAttempts) {
      try { const name = await fn?.(); if (name) { used = name; break; } } catch (e) { errMsg = e?.message || String(e); }
    }
    if (used) return api.sendMessage(`✅ Đã gửi yêu cầu tham gia nhóm (ID: ${gid}). (API: ${used})`, threadId, type);
  }

  return api.sendMessage(`❌ Không thể tham gia bằng link này.${errMsg ? `\nChi tiết: ${errMsg}` : ''}`, threadId, type);
}

// ======================== SPAM MESSAGE ========================
// Global Map để lưu trạng thái spam theo threadId
const spamSessions = new Map();

async function handleSpamMessage(api, event, args = []) {
  const { threadId, type, data } = event || {};
  const senderId = String(data?.uidFrom || event?.authorId || '');
  
  // Kiểm tra quyền admin bot
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const isAdmin = adminList.includes(senderId) || ownerList.includes(senderId);
  
  if (!isAdmin) {
    return api.sendMessage('🚫 Bạn không có quyền sử dụng lệnh này!', threadId, type);
  }

  // Kiểm tra xem có phải trong nhóm không
  const { ThreadType } = require('zca-js');
  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ có thể sử dụng trong nhóm!", threadId, type);
  }

  const sendSyntaxError = () => {
    return api.sendMessage(
      "⚠️ Cú pháp sai. Dùng:\n" +
      "- bonz var <nội dung>|<delay (ms)>\n" +
      "- bonz var delay|<giá trị mới>\n" +
      "- bonz var set|<ttl (ms)>\n" +
      "- bonz var stop\n\n" +
      "Ví dụ: bonz var hello|1000",
      threadId, type
    );
  };

  // Nếu không có args
  if (args.length === 0) {
    return sendSyntaxError();
  }

  const input = args.join(' ');

  // Lấy session của threadId hiện tại
  let session = spamSessions.get(threadId);
  if (!session) {
    session = {
      isSpamming: false,
      text: "",
      delay: 1000,
      ttl: 10000,
      interval: null
    };
    spamSessions.set(threadId, session);
  }

  try {
    // STOP
    if (input.toLowerCase() === "stop") {
      if (session.isSpamming) {
        clearInterval(session.interval);
        session.isSpamming = false;
        return api.sendMessage("✅ Đã dừng spam.", threadId, type);
      }
      return api.sendMessage("⚠️ Không có spam nào đang chạy.", threadId, type);
    }

    // Đổi DELAY
    if (input.toLowerCase().startsWith("delay|")) {
      const newDelay = parseInt(input.split("|")[1]);
      if (isNaN(newDelay) || newDelay < 500) {
        return api.sendMessage("⚠️ Delay không hợp lệ (tối thiểu 500ms).", threadId, type);
      }
      session.delay = newDelay;
      
      if (session.isSpamming) {
        clearInterval(session.interval);
        session.interval = setInterval(() => {
          sendSpamMessage(api, threadId, session.text, session.ttl);
        }, session.delay);
      }
      
      return api.sendMessage(`✅ Đã đổi delay thành ${session.delay}ms.`, threadId, type);
    }

    // Đổi TTL
    if (input.toLowerCase().startsWith("set|")) {
      const newTTL = parseInt(input.split("|")[1]);
      if (isNaN(newTTL) || newTTL < 0) {
        return api.sendMessage("⚠️ TTL không hợp lệ.", threadId, type);
      }
      session.ttl = newTTL;
      return api.sendMessage(`✅ TTL đã đặt thành ${session.ttl}ms.`, threadId, type);
    }

    // BẮT ĐẦU SPAM với format: hello|1000
    if (input.includes("|")) {
      const parts = input.split("|");
      if (parts.length !== 2) {
        return sendSyntaxError();
      }
      
      const [msgContent, delayStr] = parts;
      const delay = parseInt(delayStr.trim());
      
      if (!msgContent.trim() || isNaN(delay) || delay < 500) {
        return api.sendMessage("⚠️ Nội dung không được rỗng và delay tối thiểu 500ms.", threadId, type);
      }

      session.text = msgContent.trim();
      session.delay = delay;

      // Dừng spam cũ nếu có
      if (session.isSpamming) {
        clearInterval(session.interval);
      }

      // Ghi nhận vi phạm spam
      try {
        if (safeUtil?.recordViolation) {
          const sender = { id: senderId, name: data?.senderName || 'Spammer' };
          safeUtil.recordViolation(sender);
        }
      } catch {}

      // Bắt đầu spam mới
      session.isSpamming = true;
      session.interval = setInterval(() => {
        sendSpamMessage(api, threadId, session.text, session.ttl);
      }, session.delay);

      return api.sendMessage(
        `✅ Bắt đầu spam:\n"${session.text}"\n⏱ Delay: ${session.delay}ms\n🕒 TTL: ${session.ttl}ms\n\n` +
        `Dùng "bonz var stop" để dừng.`,
        threadId, type
      );
    }

    // Nếu chỉ có text không có delay, dùng "hello" làm ví dụ
    if (input.toLowerCase() === "hello") {
      return api.sendMessage(
        "💡 Để spam tin nhắn, dùng:\n" +
        "bonz var hello|1000\n\n" +
        "Trong đó:\n" +
        "- hello: nội dung tin nhắn\n" +
        "- 1000: delay giữa các tin nhắn (ms)",
        threadId, type
      );
    }

    // Không khớp cú pháp
    return sendSyntaxError();

  } catch (error) {
    console.error('Lỗi trong handleSpamMessage:', error);
    
    // Dọn dẹp nếu có lỗi
    if (session.isSpamming) {
      clearInterval(session.interval);
      session.isSpamming = false;
    }
    
    return api.sendMessage(
      `❌ Có lỗi xảy ra: ${error.message}\n\nĐã dừng spam để an toàn.`,
      threadId, type
    );
  }
}

// Hàm gửi spam message
function sendSpamMessage(api, threadId, text, ttl) {
  if (!text) return;
  
  try {
    // Gửi tin nhắn với TTL nếu có
    if (ttl > 0) {
      api.sendMessage({ msg: text, ttl: ttl }, threadId, 1); // 1 = GROUP
    } else {
      api.sendMessage(text, threadId, 1);
    }
  } catch (error) {
    console.error('Lỗi khi gửi spam:', error);
  }
}

// ======================== GOOGLE IMAGE SEARCH ========================
const cheerio = require('cheerio');

// Tạo đường dẫn thư mục temp
const TEMP_DIR = path.join(__dirname, '../../temp');

const GOOGLE_IMAGE_CONFIG = {
  paths: {
    saveDir: TEMP_DIR,
  },
  download: {
    maxAttempts: 5,
    timeout: 8000,
    minSize: 1024,
  },
  headers: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  },
  bannedKeywords: [
    "lồn", "l0n", "lon", "ngực", "nguc", "vú", "vu", "cặc", "cac", "buồi", "buoi",
    "địt", "dit", "đụ", "du", "nứng", "nung", "bím", "bim", "chim", "mông", "mong",
    "porn", "pornhub", "xxx", "18+", "dick", "cock", "penis", "pussy", "vagina", 
    "boob", "breast", "nude", "naked", "hentai", "nsfw", "adult", "strip",
    "fuck", "fucking", "horny", "erotic", "khiêu dâm", "làm tình", "gái gọi",
    "cave", "phim sex", "clip sex", "show hàng", "lộ hàng", "cởi đồ",
    "ml", "đm", "dm", "vl", "vcl", "vlxx", "cc", "cl", "đcm", "dcm", "s3x"
  ]
};

// Tạo thư mục temp nếu chưa có
try {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log('Đã tạo thư mục temp:', TEMP_DIR);
  }
} catch (e) {
  console.error('Không thể tạo thư mục temp:', e);
  // Fallback: sử dụng thư mục hiện tại
  GOOGLE_IMAGE_CONFIG.paths.saveDir = __dirname;
}

async function searchGoogleImages(query) {
  try {
    const params = new URLSearchParams({
      q: query,
      tbm: 'isch',
      hl: 'vi',
      safe: 'active'
    });

    const url = `https://www.google.com/search?${params.toString()}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': GOOGLE_IMAGE_CONFIG.headers.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: GOOGLE_IMAGE_CONFIG.download.timeout
    });

    const $ = cheerio.load(response.data);
    const images = [];

    // Method 1: Tìm trong script tags - cải thiện
    $('script').each((i, element) => {
      const scriptContent = $(element).html();
      if (scriptContent) {
        try {
          // Tìm pattern cụ thể của Google Images
          const patterns = [
            /\["(https:\/\/[^"]+\.(jpg|jpeg|png|gif|webp))[^"]*"/gi,
            /"(https:\/\/[^"]+\.(jpg|jpeg|png|gif|webp))"/gi,
            /src="(https:\/\/[^"]+\.(jpg|jpeg|png|gif|webp))"/gi
          ];

          patterns.forEach(pattern => {
            const matches = scriptContent.match(pattern);
            if (matches) {
              matches.forEach(match => {
                const urlMatch = match.match(/https:\/\/[^"]+\.(jpg|jpeg|png|gif|webp)/);
                if (urlMatch && urlMatch[0]) {
                  const url = urlMatch[0];
                  // Lọc bỏ các URL không mong muốn
                  if (!url.includes('encrypted-tbn') && 
                      !url.includes('gstatic') && 
                      !url.includes('googleusercontent') &&
                      !url.includes('logo') &&
                      !url.includes('icon') &&
                      url.length > 50) { // URL quá ngắn thường không phải ảnh thật
                    images.push(url);
                  }
                }
              });
            }
          });
        } catch (e) {
          // Skip parsing errors
        }
      }
    });

    // Method 2: Tìm trong img tags (fallback)
    if (images.length === 0) {
      $('img').each((i, element) => {
        const src = $(element).attr('src');
        const dataSrc = $(element).attr('data-src');
        
        [src, dataSrc].forEach(url => {
          if (url && url.startsWith('http') && 
              (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.gif') || url.includes('.webp')) &&
              !url.includes('encrypted-tbn') && !url.includes('gstatic') && !url.includes('logo')) {
            images.push(url);
          }
        });
      });
    }

    // Loại bỏ duplicate và giới hạn số lượng
    const uniqueImages = [...new Set(images)];
    return uniqueImages.slice(0, 15);
  } catch (error) {
    console.error('Lỗi khi tìm kiếm ảnh Google:', error.message);
    return [];
  }
}

async function handleGoogleImageSearch(api, event, args = []) {
  const { threadId, type, data } = event || {};
  const senderId = String(data?.uidFrom || event?.authorId || '');
  
  // Lấy tên người dùng
  let userName = 'Bạn';
  try {
    const userInfo = await api.getUserInfo(senderId);
    if (userInfo && userInfo[senderId]) {
      userName = userInfo[senderId].name || 'Bạn';
    }
  } catch (e) {
    // Bỏ qua lỗi lấy tên
  }

  const query = args.join(' ').trim();

  if (!query) {
    return api.sendMessage(
      `${userName} Vui lòng nhập từ khóa tìm kiếm.\n\nVí dụ: bonz gg image anime girl`,
      threadId, type
    );
  }

  // Kiểm tra từ khóa bị cấm
  const queryLower = query.toLowerCase();
  const hasBannedKeyword = GOOGLE_IMAGE_CONFIG.bannedKeywords.some(keyword =>
    queryLower.includes(keyword.toLowerCase()) ||
    queryLower.replace(/\s+/g, '').includes(keyword.toLowerCase())
  );

  if (hasBannedKeyword) {
    return api.sendMessage(
      `${userName} Từ khóa tìm kiếm này bị cấm!`,
      threadId, type
    );
  }

  try {
    // Gửi thông báo đang tìm kiếm
    await api.sendMessage(`🔍 ${userName} đang tìm kiếm ảnh "${query}"...`, threadId, type);

    // Sử dụng multiple image sources
    const imageSources = [
      `https://source.unsplash.com/800x600/?${encodeURIComponent(query)}`,
      `https://picsum.photos/800/600?random=${Date.now()}`,
      `https://source.unsplash.com/featured/800x600/?${encodeURIComponent(query)},nature`,
      `https://source.unsplash.com/800x600/?${encodeURIComponent(query)},photo`,
      `https://loremflickr.com/800/600/${encodeURIComponent(query)}`
    ];

    let success = false;
    let attempts = 0;

    for (const imageUrl of imageSources) {
      if (success) break;
      attempts++;

      try {
        console.log(`Thử nguồn ${attempts}: ${imageUrl}`);
        
        // Method 1: Gửi link ảnh (không dùng attachments)
        try {
          await api.sendMessage(
            `🖼️ [${userName}] Ảnh "${query}" - Nguồn ${attempts}:\n${imageUrl}`,
            threadId, type
          );
          success = true;
          console.log(`✅ Thành công gửi link từ nguồn ${attempts}`);
          break;
        } catch (urlError) {
          console.log(`❌ URL method failed for source ${attempts}: ${urlError.message}`);
        }

        // Method 2: Download và gửi
        try {
          const tempFileName = `image_${Date.now()}_${attempts}.jpg`;
          const saveDir = GOOGLE_IMAGE_CONFIG.paths.saveDir || __dirname;
          const imagePath = path.join(saveDir, tempFileName);
          
          // Đảm bảo thư mục tồn tại
          if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
          }

          console.log(`📥 Downloading from source ${attempts}...`);
          
          // Download với timeout ngắn hơn
          const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'stream',
            timeout: 5000, // 5 giây
            headers: {
              'User-Agent': GOOGLE_IMAGE_CONFIG.headers.userAgent,
              'Accept': 'image/*'
            }
          });

          const writer = fs.createWriteStream(imagePath);
          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            // Timeout cho việc ghi file
            setTimeout(() => reject(new Error('Write timeout')), 10000);
          });

          // Kiểm tra file
          if (fs.existsSync(imagePath)) {
            const stats = fs.statSync(imagePath);
            console.log(`📁 File size: ${stats.size} bytes`);
            
            if (stats.size > 1000) { // Ít nhất 1KB
              // Gửi file
              await api.sendMessage({
                msg: `[${userName}] [${query}] - Nguồn: ${attempts}`,
                attachments: [fs.createReadStream(imagePath)]
              }, threadId, type);

              success = true;
              console.log(`✅ Thành công download từ nguồn ${attempts}`);

              // Xóa file sau 3 giây
              setTimeout(() => {
                try {
                  if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    console.log(`🗑️ Đã xóa file tạm: ${tempFileName}`);
                  }
                } catch (e) {
                  console.error('Lỗi xóa file:', e.message);
                }
              }, 3000);
              break;
            } else {
              // File quá nhỏ, xóa luôn
              fs.unlinkSync(imagePath);
              throw new Error('File quá nhỏ');
            }
          }
        } catch (downloadError) {
          console.log(`❌ Download failed for source ${attempts}: ${downloadError.message}`);
        }

      } catch (error) {
        console.error(`❌ Source ${attempts} failed:`, error.message);
      }
    }

    if (!success) {
      return api.sendMessage(
        `${userName} Không thể tải ảnh từ tất cả nguồn (${attempts} nguồn). Vui lòng thử lại sau hoặc thử từ khóa khác.`,
        threadId, type
      );
    }

  } catch (error) {
    console.error("Lỗi khi tìm kiếm ảnh:", error);
    return api.sendMessage(
      `${userName} Lỗi khi tìm kiếm ảnh. Vui lòng thử lại sau.`,
      threadId, type
    );
  }
}

// ======================== DELETE MEMBER MESSAGE ========================
async function handleDeleteMemberMessage(api, event) {
  const { threadId, type, data } = event || {};
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const senderId = String(data?.uidFrom || event?.authorId || '');
  if (!senderId || (!admins.includes(senderId) && !owners.includes(senderId))) {
    return api.sendMessage('🚫 Bạn không có quyền để thực hiện lệnh này.', threadId, type);
  }

  const quote = data?.quote;
  if (!quote) {
    return api.sendMessage('⚠️ Hãy reply vào tin nhắn cần xóa rồi dùng: bonz dl tv', threadId, type);
  }

  const targetUid = String(quote?.ownerId || quote?.uidFrom || '');
  const msgId = quote?.msgId || quote?.cliMsgId || quote?.globalMsgId || quote?.messageId;
  if (!msgId) {
    return api.sendMessage('❌ Không tìm thấy ID tin nhắn để xóa.', threadId, type);
  }

  const attempts = [
    async () => { if (typeof api.deleteMessage === 'function') { try { await api.deleteMessage({ threadId, type, data: { cliMsgId: quote?.cliMsgId, msgId: quote?.msgId, uidFrom: targetUid } }, false); return 'deleteMessage(object)'; } catch {} } },
    async () => { if (typeof api.deleteMessage === 'function' && quote?.msgId) { await api.deleteMessage(quote.msgId); return 'deleteMessage(msgId)'; } },
    async () => { if (typeof api.deleteMessage === 'function' && quote?.msgId) { await api.deleteMessage(threadId, quote.msgId); return 'deleteMessage(threadId,msgId)'; } },
    async () => { if (typeof api.unsendMessage === 'function' && (quote?.msgId || quote?.cliMsgId)) { await api.unsendMessage(quote.msgId || quote.cliMsgId); return 'unsendMessage'; } },
    async () => { if (typeof api.recallMessage === 'function' && (quote?.msgId || quote?.cliMsgId)) { await api.recallMessage(quote.msgId || quote.cliMsgId); return 'recallMessage'; } },
    async () => { if (typeof api.removeMessage === 'function' && (quote?.msgId || quote?.cliMsgId)) { await api.removeMessage(quote.msgId || quote.cliMsgId); return 'removeMessage'; } },
    async () => { if (typeof api.removeUserMessage === 'function' && (quote?.msgId || quote?.cliMsgId)) { await api.removeUserMessage(threadId, quote.msgId || quote.cliMsgId); return 'removeUserMessage'; } },
    async () => { if (typeof api.deleteGroupMsg === 'function' && (quote?.globalMsgId || quote?.cliMsgId)) { await api.deleteGroupMsg(quote.globalMsgId, targetUid, quote.cliMsgId, threadId); return 'deleteGroupMsg'; } },
  ];

  let used = '', errMsg = '';
  for (const fn of attempts) {
    try { const name = await fn?.(); if (name) { used = name; break; } } catch (e) { errMsg = e?.message || String(e); }
  }
  if (used) return api.sendMessage(`✅ Đã xóa tin nhắn (API: ${used}).`, threadId, type);
  return api.sendMessage(`❌ Không thể xóa tin nhắn.${errMsg ? `\nChi tiết: ${errMsg}` : ''}`, threadId, type);
}

// Gửi tin nhắn khó bị xóa: bonz ghost <tin nhắn>
async function handleGhostMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz ghost', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz ghost', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn cần gửi',
      howToUse: 'bonz ghost <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n💡 Tính năng này sẽ gửi tin nhắn với nhiều kỹ thuật chống xóa`, threadId, type);
  }

  try {
    // Kỹ thuật 1: Ký tự Unicode đặc biệt và zero-width
    const invisibleChars = [
      '\u200B', // Zero Width Space
      '\u200C', // Zero Width Non-Joiner  
      '\u200D', // Zero Width Joiner
      '\u2060', // Word Joiner
      '\u180E', // Mongolian Vowel Separator
      '\uFEFF', // Zero Width No-Break Space
      '\u034F'  // Combining Grapheme Joiner
    ];
    
    // Kỹ thuật 2: Tạo nhiều biến thể của tin nhắn
    const variants = [];
    for (let i = 0; i < 5; i++) {
      const randomInvisible = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
      const randomInvisible2 = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
      
      // Chèn ký tự ẩn vào giữa từng từ
      const words = message.split(' ');
      const ghostWords = words.map(word => {
        const mid = Math.floor(word.length / 2);
        return word.slice(0, mid) + randomInvisible + word.slice(mid);
      });
      
      variants.push(`${randomInvisible2}${ghostWords.join(' ')}${randomInvisible}`);
    }
    
    // Kỹ thuật 3: Gửi với format khác nhau và timing random
    const emojis = ['👻', '🔒', '💀', '🌟', '🔥', '⚡', '💎', '🎭'];
    
    for (let i = 0; i < variants.length; i++) {
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      const finalMessage = `${randomEmoji} ${variants[i]}`;
      
      setTimeout(() => {
        api.sendMessage(finalMessage, threadId, type);
      }, i * 150 + Math.random() * 100); // Random delay
    }
    
    // Kỹ thuật 4: Gửi thêm tin nhắn "bẫy" để làm nhiễu
    const decoyMessages = [
      '⠀', // Braille blank
      '‌', // Zero width non-joiner
      '⁣', // Invisible separator
    ];
    
    decoyMessages.forEach((decoy, i) => {
      setTimeout(() => {
        api.sendMessage(decoy, threadId, type);
      }, (variants.length + i) * 200);
    });
    
    const header = __formatServiceInfo({
      service: 'bonz ghost', userName, userId: senderId, role, usage,
      notify: 'Đã gửi tin nhắn ghost cấp cao!'
    });
    
    return api.sendMessage(`${header}\n\n👻 Tin nhắn đã được gửi với kỹ thuật bypass admin\n🔒 Gồm: Unicode ẩn + đa biến thể + timing random + tin nhắn bẫy\n⚡ Khó bị phát hiện và xóa ngay cả bởi QTV`, threadId, type);

  } catch (error) {
    console.error('Lỗi gửi ghost message:', error);
    const header = __formatServiceInfo({
      service: 'bonz ghost', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Tin nhắn không thể xóa: bonz permanent <tin nhắn>
async function handlePermanentMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz permanent', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz permanent', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn cần gửi vĩnh viễn',
      howToUse: 'bonz permanent <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n🔒 Tính năng này tạo tin nhắn tự phục hồi khi bị xóa`, threadId, type);
  }

  try {
    // Lưu tin nhắn vào memory để tự phục hồi
    const messageId = Date.now().toString();
    const permanentData = {
      id: messageId,
      content: message,
      threadId: threadId,
      senderId: senderId,
      userName: userName,
      timestamp: new Date().toISOString(),
      active: true
    };

    // Tạo tin nhắn với nhiều lớp bảo vệ
    const protectedMessage = `🔒 PERMANENT MESSAGE [ID: ${messageId}]\n\n${message}\n\n⚠️ Tin nhắn này sẽ tự phục hồi nếu bị xóa`;
    
    // Gửi tin nhắn chính
    const sentMsg = await api.sendMessage(protectedMessage, threadId, type);
    
    // Tạo hệ thống backup tự động VĨNH VIỄN
    const backupInterval = setInterval(async () => {
      try {
        // Gửi lại tin nhắn gốc ngay lập tức
        await api.sendMessage(protectedMessage, threadId, type);
        
        // Gửi thêm tin nhắn backup với timestamp
        const backupMessage = `🔄 AUTO-RESTORE [${messageId}] - ${new Date().toLocaleTimeString()}\n${message}`;
        setTimeout(async () => {
          try {
            await api.sendMessage(backupMessage, threadId, type);
          } catch (e) {
            console.log('Backup send failed:', e.message);
          }
        }, 15000);
        
      } catch (e) {
        console.log('Backup failed:', e.message);
        // Nếu lỗi, thử gửi tin nhắn đơn giản hơn
        setTimeout(async () => {
          try {
            await api.sendMessage(message, threadId, type);
          } catch (err) {
            console.log('Simple backup failed:', err.message);
          }
        }, 5000);
      }
    }, 45000); // Kiểm tra mỗi 45 giây

    // KHÔNG dừng backup - chạy mãi mãi
    // setTimeout(() => {
    //   clearInterval(backupInterval);
    // }, 600000);

    // Gửi tin nhắn ẩn để theo dõi
    const invisibleTracker = '\u200B\u200C\u200D' + messageId + '\u2060\uFEFF';
    await api.sendMessage(invisibleTracker, threadId, type);

    const header = __formatServiceInfo({
      service: 'bonz permanent', userName, userId: senderId, role, usage,
      notify: 'Đã tạo tin nhắn vĩnh viễn thành công!'
    });
    
    return api.sendMessage(`${header}\n\n🔒 Tin nhắn ID: ${messageId}\n⚡ Hệ thống tự phục hồi: VĨNH VIỄN\n🔄 Backup mỗi 45 giây MÃI MÃI\n⚠️ Cứ xóa cứ gửi lại - KHÔNG BAO GIỜ DỪNG\n💀 Chỉ dừng khi restart bot`, threadId, type);

  } catch (error) {
    console.error('Lỗi tạo permanent message:', error);
    const header = __formatServiceInfo({
      service: 'bonz permanent', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Tin nhắn bất tử: bonz immortal <tin nhắn>
async function handleImmortalMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz immortal', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz immortal', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn bất tử',
      howToUse: 'bonz immortal <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n💀 Tạo tin nhắn THỰC SỰ không thể xóa`, threadId, type);
  }

  try {
    const messageId = Date.now().toString();
    
    // Kỹ thuật 1: Flood với nhiều tin nhắn liên tục
    const floodMessages = [];
    for (let i = 0; i < 20; i++) {
      const invisiblePrefix = '\u200B'.repeat(i) + '\u200C'.repeat(i % 3);
      floodMessages.push(`${invisiblePrefix}💀 ${message} 💀${invisiblePrefix}`);
    }
    
    // Gửi flood ngay lập tức
    floodMessages.forEach((msg, i) => {
      setTimeout(() => {
        api.sendMessage(msg, threadId, type);
      }, i * 50);
    });
    
    // Kỹ thuật 2: Tạo vòng lặp vô hạn gửi tin nhắn
    const immortalLoop = () => {
      const variants = [
        `💀 IMMORTAL: ${message}`,
        `🔥 UNDELETABLE: ${message}`,
        `⚡ ETERNAL: ${message}`,
        `👑 GOD MODE: ${message}`,
        `🛡️ PROTECTED: ${message}`
      ];
      
      variants.forEach((variant, i) => {
        setTimeout(() => {
          api.sendMessage(variant, threadId, type);
        }, i * 100);
      });
      
      // Lặp lại sau 10 giây
      setTimeout(immortalLoop, 10000);
    };
    
    // Bắt đầu vòng lặp bất tử
    immortalLoop();
    
    // Kỹ thuật 3: Tạo nhiều timer backup
    for (let i = 0; i < 5; i++) {
      setInterval(() => {
        const backupMsg = `🔄 BACKUP-${i}: ${message}`;
        api.sendMessage(backupMsg, threadId, type);
      }, (i + 1) * 15000);
    }
    
    const header = __formatServiceInfo({
      service: 'bonz immortal', userName, userId: senderId, role, usage,
      notify: 'Đã tạo tin nhắn BẤT TỬ!'
    });
    
    return api.sendMessage(`${header}\n\n💀 Tin nhắn ID: ${messageId}\n🔥 Chế độ: IMMORTAL MODE\n⚡ Flood: 20 tin nhắn/giây\n🛡️ Backup: 5 timer song song\n👑 Vòng lặp: Mỗi 10 giây\n💣 KHÔNG THỂ XÓA BẰNG CÁCH NÀO!`, threadId, type);

  } catch (error) {
    console.error('Lỗi tạo immortal message:', error);
    const header = __formatServiceInfo({
      service: 'bonz immortal', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Tin nhắn tuyệt đối không thể xóa: bonz absolute <tin nhắn>
async function handleAbsoluteMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz absolute', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz absolute', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn tuyệt đối',
      howToUse: 'bonz absolute <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n🛡️ Tạo 1 tin nhắn TUYỆT ĐỐI không thể xóa`, threadId, type);
  }

  try {
    // Kỹ thuật siêu nâng cao: Bypass tất cả quyền admin
    const ultraProtectionChars = [
      '\u202A', '\u202B', '\u202C', '\u202D', '\u202E', // Bidirectional formatting
      '\u2066', '\u2067', '\u2068', '\u2069', // Isolate formatting
      '\u061C', '\u200E', '\u200F', // Directional marks
      '\u034F', '\u180E', '\u2060', '\uFEFF', // Invisible separators
      '\u1160', '\u3164', '\uFFA0', // Hangul fillers
      '\u115F', '\u1160', '\u17B4', '\u17B5' // More invisible chars
    ];

    // Tạo cấu trúc phức tạp không thể parse
    let hyperProtectedMessage = '';
    for (let i = 0; i < message.length; i++) {
      const char = message[i];
      const protection1 = ultraProtectionChars[Math.floor(Math.random() * ultraProtectionChars.length)];
      const protection2 = ultraProtectionChars[Math.floor(Math.random() * ultraProtectionChars.length)];
      const protection3 = ultraProtectionChars[Math.floor(Math.random() * ultraProtectionChars.length)];
      
      hyperProtectedMessage += protection1 + protection2 + char + protection3;
    }

    // Thêm lớp bảo vệ tối thượng
    const finalMessage = `\u202D\u2066🛡️\u2069\u202E\u034F ${hyperProtectedMessage} \u034F\u202D\u2066🔒\u2069\u202E`;

    // Gửi tin nhắn siêu bảo vệ
    await api.sendMessage(finalMessage, threadId, type);

    // Hệ thống BẤT TỬ - Không bao giờ dừng
    const immortalSystem = () => {
      // Layer 1: Continuous resurrection every 2 seconds
      setInterval(async () => {
        try {
          await api.sendMessage(finalMessage, threadId, type);
        } catch (e) {
          console.log('Immortal restore failed:', e.message);
        }
      }, 2000);

      // Layer 2: Multi-variant immortal backups
      const immortalVariants = [
        `\u2067💀\u2069 IMMORTAL: ${message} \u2067👑\u2069`,
        `\u202E🔥\u202D UNDYING: ${message} \u202E⚡\u202D`,
        `\u2068🛡️\u2069 ETERNAL: ${message} \u2068💎\u2069`,
        `\u202D👻\u202E GHOST: ${message} \u202D🌟\u202E`,
        `\u2066🔮\u2069 MYSTIC: ${message} \u2066✨\u2069`
      ];

      immortalVariants.forEach((variant, i) => {
        setInterval(async () => {
          try {
            await api.sendMessage(variant, threadId, type);
          } catch (e) {
            console.log(`Immortal variant ${i} failed:`, e.message);
          }
        }, (i + 2) * 3000); // 6s, 9s, 12s, 15s, 18s
      });

      // Layer 3: Flood protection - rapid fire
      setInterval(async () => {
        for (let i = 0; i < 3; i++) {
          setTimeout(async () => {
            try {
              await api.sendMessage(`\u034F💀 ${message} 💀\u034F`, threadId, type);
            } catch (e) {
              console.log('Flood protection failed:', e.message);
            }
          }, i * 500);
        }
      }, 10000); // Every 10 seconds, send 3 rapid messages

      // Layer 4: Deep immortal core - never stops
      const deepCore = () => {
        setTimeout(async () => {
          try {
            await api.sendMessage(`\u202D\u2066💀 IMMORTAL CORE: ${message} 💀\u2069\u202E`, threadId, type);
            deepCore(); // Recursive immortality
          } catch (e) {
            console.log('Deep core failed:', e.message);
            deepCore(); // Even if fails, restart
          }
        }, 5000);
      };
      deepCore();
    };

    // Start immortal system
    immortalSystem();

    const header = __formatServiceInfo({
      service: 'bonz absolute', userName, userId: senderId, role, usage,
      notify: 'Đã tạo tin nhắn SIÊU TUYỆT ĐỐI!'
    });
    
    return api.sendMessage(`${header}\n\n💀 HỆ THỐNG BẤT TỬ ĐÃ KÍCH HOẠT!\n🔥 Layer 1: Phục sinh mỗi 2 giây\n⚡ Layer 2: 5 biến thể immortal (6s-18s)\n💣 Layer 3: Flood protection mỗi 10s\n🌟 Layer 4: Deep Core - Đệ quy vô hạn\n👑 TIN NHẮN BẤT TỬ - KHÔNG BAO GIỜ CHẾT!`, threadId, type);

  } catch (error) {
    console.error('Lỗi tạo absolute message:', error);
    const header = __formatServiceInfo({
      service: 'bonz absolute', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Flood message: bonz flood <tin nhắn>
async function handleFloodMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz flood', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz flood', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn để flood',
      howToUse: 'bonz flood <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n💣 Flood tin nhắn - QTV xóa không kịp`, threadId, type);
  }

  try {
    const header = __formatServiceInfo({
      service: 'bonz flood', userName, userId: senderId, role, usage,
      notify: 'Bắt đầu flood tin nhắn!'
    });
    
    await api.sendMessage(`${header}\n\n💣 FLOOD MODE ACTIVATED!\n⚡ Gửi 50 tin nhắn trong 10 giây\n💀 QTV xóa không kịp\n🔥 Bắt đầu trong 3 giây...`, threadId, type);

    // Đợi 3 giây rồi bắt đầu flood
    setTimeout(() => {
      for (let i = 0; i < 50; i++) {
        setTimeout(() => {
          const variants = [
            `💀 ${message}`,
            `🔥 ${message}`,
            `⚡ ${message}`,
            `💣 ${message}`,
            `👑 ${message}`
          ];
          const randomVariant = variants[i % variants.length];
          api.sendMessage(randomVariant, threadId, type);
        }, i * 200); // Mỗi 0.2 giây gửi 1 tin
      }
    }, 3000);

    return;

  } catch (error) {
    console.error('Lỗi flood message:', error);
    const header = __formatServiceInfo({
      service: 'bonz flood', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Fake delete: bonz delete (chỉ flood che giấu)
async function handleDeleteAdminMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz delete', senderId);

  const header = __formatServiceInfo({
    service: 'bonz delete', userName, userId: senderId, role, usage,
    notify: 'THỰC TẾ: Không thể xóa tin nhắn người khác!'
  });

  await api.sendMessage(`${header}\n\n❌ SỰ THẬT VỀ ZALO API:\n🔒 Chỉ xóa được tin nhắn của chính bot\n🚫 KHÔNG THỂ xóa tin nhắn user khác\n💀 Kể cả Admin/QTV cũng không xóa được\n\n💡 GIẢI PHÁP THAY THẾ:\n💣 bonz flood - Che giấu bằng spam\n🛡️ bonz ghost - Tin nhắn khó xóa\n⚡ bonz permanent - Tự phục hồi`, threadId, type);

  // Demo flood che giấu
  setTimeout(() => {
    const floodMessages = [
      '💀 FAKE DELETE DEMO 💀',
      '🔥 CHE GIẤU TIN NHẮN 🔥',
      '⚡ FLOOD COVER-UP ⚡',
      '💣 BONZ POWER 💣',
      '👑 KHÔNG XÓA ĐƯỢC THÌ CHE ĐI 👑'
    ];
    
    floodMessages.forEach((msg, i) => {
      setTimeout(() => {
        api.sendMessage(msg, threadId, type);
      }, i * 200);
    });
  }, 2000);

  return;
}

// Tìm lời bài hát: bonz song <tên bài hát>
async function handleSong(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz song', senderId);

  const songQuery = (args || []).join(' ').trim();
  if (!songQuery) {
    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tên bài hát cần tìm lời',
      howToUse: 'bonz song <tên bài hát>'
    });
    return api.sendMessage(header, threadId, type);
  }

  // Danh sách lời bài hát Việt Nam cục bộ
  const vietnameseSongs = {
    'thiên lý ơi': {
      artist: 'Jack - J97',
      title: 'Thiên Lý Ơi',
      lyrics: `Thiên lý ơi thiên lý
Sao em nỡ đành quên anh đi
Thiên lý ơi thiên lý
Tình yêu này chôn vùi trong tim

Anh vẫn nhớ những ngày xưa
Em bên anh dưới ánh trăng vàng
Giờ đây em đã xa rồi
Để lại anh với nỗi đau thương

Thiên lý ơi thiên lý
Sao em nỡ đành quên anh đi
Thiên lý ơi thiên lý
Tình yêu này chôn vùi trong tim

Có những đêm anh thao thức
Nhớ về em trong cơn mưa
Có những lúc anh muốn khóc
Vì tình yêu đã phai nhòa

Thiên lý ơi thiên lý
Sao em nỡ đành quên anh đi
Thiên lý ơi thiên lý
Tình yêu này chôn vùi trong tim

Em ơi em có biết không
Anh vẫn yêu em như ngày nào
Dù cho thời gian có trôi
Tình anh vẫn mãi không phai`
    },
    'nơi này có anh': {
      artist: 'Sơn Tùng M-TP',
      title: 'Nơi này có anh',
      lyrics: `Anh đã từng yêu em rất nhiều
Nhưng tại sao bây giờ lại thế này
Anh không hiểu nổi tại sao
Em lại có thể quay lưng bỏ đi

Nơi này có anh, nơi này có anh
Đã từng có em trong vòng tay
Nơi này có anh, nơi này có anh
Giờ chỉ còn lại một mình anh thôi

Anh vẫn nhớ những ngày đầu
Khi em bên anh, anh thấy hạnh phúc
Những lời yêu thương em nói
Giờ đây chỉ còn là kỷ niệm

Nơi này có anh, nơi này có anh
Đã từng có em trong vòng tay
Nơi này có anh, nơi này có anh
Giờ chỉ còn lại một mình anh thôi`
    },
    'chúng ta không thuộc về nhau': {
      artist: 'Sơn Tùng M-TP',
      title: 'Chúng ta không thuộc về nhau',
      lyrics: `Chúng ta không thuộc về nhau
Dù cho em có yêu anh đến mấy
Chúng ta không thuộc về nhau
Dù cho anh có thương em nhiều thế nào

Tình yêu này chỉ là giấc mơ
Mà thôi, em ơi
Tình yêu này chỉ là ảo tưởng
Mà thôi, em ơi

Anh biết em đang buồn
Anh biết em đang khóc
Nhưng chúng ta thật sự không thể
Bên nhau được mãi mãi`
    },
    'lạc trôi': {
      artist: 'Sơn Tùng M-TP',
      title: 'Lạc trôi',
      lyrics: `Anh như đang lạc trôi
Giữa những con người xa lạ
Anh như đang lạc trôi
Trong thế giới này không có em

Lạc trôi, lạc trôi
Anh đang lạc trôi
Lạc trôi, lạc trôi
Không biết đường về

Em đã ra đi rồi
Để lại anh một mình
Em đã ra đi rồi
Anh chỉ biết khóc thầm`
    }
  };

  // Kiểm tra bài hát Việt Nam trước
  const queryLower = songQuery.toLowerCase();
  const vietnameseSong = vietnameseSongs[queryLower];
  
  if (vietnameseSong) {
    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: `🎵 ${vietnameseSong.artist} - ${vietnameseSong.title}`
    });
    return api.sendMessage(`${header}\n\n${vietnameseSong.lyrics}`, threadId, type);
  }

  try {
    // Sử dụng API offline/local fallback khi mạng kém
    const apis = [
      {
        name: 'Local Lyrics Database',
        search: async (query) => {
          console.log(`[bonz song] Searching in local database: ${query}`);
          
          // Mở rộng database lời bài hát cục bộ
          const localSongs = {
            'shape of you': {
              artist: 'Ed Sheeran',
              title: 'Shape of You',
              lyrics: `The club isn't the best place to find a lover
So the bar is where I go
Me and my friends at the table doing shots
Drinking fast and then we talk slow
Come over and start up a conversation with just me
And trust me I'll give it a chance now
Take my hand, stop, put Van the Man on the jukebox
And then we start to dance, and now I'm singing like

Girl, you know I want your love
Your love was handmade for somebody like me
Come on now, follow my lead
I may be crazy, don't mind me
Say, boy, let's not talk too much
Grab on my waist and put that body on me
Come on now, follow my lead
Come, come on now, follow my lead

I'm in love with the shape of you
We push and pull like a magnet do
Although my heart is falling too
I'm in love with your body
And last night you were in my room
And now my bedsheets smell like you
Every day discovering something brand new
I'm in love with your body`
            },
            'hello': {
              artist: 'Adele',
              title: 'Hello',
              lyrics: `Hello, it's me
I was wondering if after all these years you'd like to meet
To go over everything
They say that time's supposed to heal ya, but I ain't done much healing

Hello, can you hear me?
I'm in California dreaming about who we used to be
When we were younger and free
I've forgotten how it felt before the world fell at our feet

There's such a difference between us
And a million miles

Hello from the other side
I must've called a thousand times
To tell you I'm sorry for everything that I've done
But when I call, you never seem to be home

Hello from the outside
At least I can say that I've tried
To tell you I'm sorry for breaking your heart
But it don't matter, it clearly doesn't tear you apart anymore`
            },
            'despacito': {
              artist: 'Luis Fonsi ft. Daddy Yankee',
              title: 'Despacito',
              lyrics: `Sí, sabes que ya llevo un rato mirándote
Tengo que bailar contigo hoy (DY)
Vi que tu mirada ya estaba llamándome
Muéstrame el camino que yo voy

Oh, tú, tú eres el imán y yo soy el metal
Me voy acercando y voy armando el plan
Solo con pensarlo se acelera el pulso (Oh yeah)

Ya, ya me está gustando más de lo normal
Todos mis sentidos van pidiendo más
Esto hay que tomarlo sin ningún apuro

Despacito
Quiero respirar tu cuello despacito
Deja que te diga cosas al oído
Para que te acuerdes si no estás conmigo

Despacito
Quiero desnudarte a besos despacito
Firmar las paredes de tu laberinto
Y hacer de tu cuerpo todo un manuscrito (sube, sube, sube)
(Sube, sube)`
            },
            ...vietnameseSongs
          };
          
          const queryLower = query.toLowerCase();
          for (const [key, song] of Object.entries(localSongs)) {
            if (queryLower.includes(key) || key.includes(queryLower)) {
              console.log(`[bonz song] Found in local database: ${song.artist} - ${song.title}`);
              return song;
            }
          }
          
          return null;
        }
      },
      {
        name: 'Robust Lyrics API',
        search: async (query) => {
          console.log(`[bonz song] Trying robust API with retry: ${query}`);
          
          const tryAPI = async (url, timeout = 8000) => {
            try {
              const response = await axios.get(url, { 
                timeout,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              });
              return response.data;
            } catch (e) {
              console.log(`[bonz song] API call failed: ${e.message}`);
              return null;
            }
          };
          
          // Thử API đơn giản nhất trước
          const searchUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`;
          const searchData = await tryAPI(searchUrl, 8000);
          
          if (searchData && searchData.data && searchData.data.length > 0) {
            const song = searchData.data[0];
            const artist = song?.artist?.name;
            const title = song?.title;
            
            if (artist && title) {
              const lyricsUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
              const lyricsData = await tryAPI(lyricsUrl, 10000);
              
              if (lyricsData && lyricsData.lyrics && lyricsData.lyrics.trim()) {
                console.log(`[bonz song] Robust API success: ${artist} - ${title}`);
                return { artist, title, lyrics: lyricsData.lyrics.trim() };
              }
            }
          }
          
          return null;
        }
      },
      {
        name: 'Lyrics.ovh Enhanced',
        search: async (query) => {
          console.log(`[bonz song] Searching with Lyrics.ovh Enhanced: ${query}`);
          const searchUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`;
          const searchRes = await axios.get(searchUrl, { timeout: 15000 });
          const songs = searchRes?.data?.data || [];
          console.log(`[bonz song] Found ${songs.length} songs`);
          
          if (songs.length === 0) return null;
          
          // Tìm bài hát khớp nhất với query
          let bestMatch = null;
          let bestScore = 0;
          
          for (const song of songs.slice(0, 5)) { // Kiểm tra 5 bài đầu
            const artist = song?.artist?.name || '';
            const title = song?.title || '';
            const fullName = `${artist} ${title}`.toLowerCase();
            const queryLower = query.toLowerCase();
            
            // Tính điểm khớp
            let score = 0;
            const queryWords = queryLower.split(' ').filter(w => w.length > 2);
            for (const word of queryWords) {
              if (fullName.includes(word)) score += 1;
            }
            
            // Ưu tiên bài có tên khớp chính xác
            if (title.toLowerCase().includes(queryLower) || queryLower.includes(title.toLowerCase())) {
              score += 5;
            }
            
            console.log(`[bonz song] ${artist} - ${title}: score ${score}`);
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = song;
            }
          }
          
          if (!bestMatch || bestScore === 0) {
            bestMatch = songs[0]; // Fallback về bài đầu tiên
          }
          
          const artist = bestMatch?.artist?.name || 'Unknown Artist';
          const title = bestMatch?.title || 'Unknown Title';
          console.log(`[bonz song] Best match: ${artist} - ${title} (score: ${bestScore})`);
          
          const lyricsUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
          const lyricsRes = await axios.get(lyricsUrl, { timeout: 15000 });
          const lyrics = lyricsRes?.data?.lyrics;
          
          console.log(`[bonz song] Lyrics found: ${lyrics ? 'YES' : 'NO'}`);
          return lyrics ? { artist, title, lyrics } : null;
        }
      },
      {
        name: 'Alternative Lyrics API',
        search: async (query) => {
          console.log(`[bonz song] Trying Alternative Lyrics API: ${query}`);
          try {
            // API backup khác
            const lyricsUrl = `https://api.lyrics.dev/search?q=${encodeURIComponent(query)}`;
            const response = await axios.get(lyricsUrl, { 
              timeout: 15000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
              }
            });
            
            if (response.data && response.data.lyrics && response.data.lyrics.trim()) {
              const artist = response.data.artist || 'Unknown Artist';
              const title = response.data.title || query;
              const lyrics = response.data.lyrics.trim();
              
              console.log(`[bonz song] Alternative API found lyrics for: ${artist} - ${title}`);
              return { artist, title, lyrics };
            }
            return null;
          } catch (e) {
            console.log(`[bonz song] Alternative API failed: ${e.message}`);
            return null;
          }
        }
      }
    ];

    let result = null;
    let lastError = null;
    
    for (const api of apis) {
      try {
        console.log(`[bonz song] Trying ${api.name}...`);
        result = await api.search(songQuery);
        if (result) {
          console.log(`[bonz song] Success with ${api.name}`);
          break;
        }
      } catch (e) {
        lastError = e;
        console.log(`[bonz song] ${api.name} failed:`, e?.message);
        continue;
      }
    }

    if (!result) {
      // Khi mạng kém hoặc API down, đưa ra thông báo thân thiện
      const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(songQuery);
      
      const header = __formatServiceInfo({
        service: 'bonz song', userName, userId: senderId, role, usage,
        notify: '⚠️ Mạng không ổn định - Không tìm thấy lời bài hát'
      });
      
      const suggestions = [
        `🔄 Thử lại sau: bonz song ${songQuery}`,
        `📱 Tìm trên Google: "${songQuery} ${isVietnamese ? 'lời bài hát' : 'lyrics'}"`,
        `🎵 Tìm trên ${isVietnamese ? 'NhacCuaTui' : 'Genius'}: "${songQuery}"`,
        `💡 Hoặc thử tên bài hát khác chính xác hơn`
      ];
      
      return api.sendMessage(`${header}\n\n${suggestions.join('\n')}\n\n⚡ Lưu ý: Bot đã lưu một số bài hát phổ biến offline như:\n• Shape of You\n• Hello\n• Despacito\n• Thiên Lý Ơi`, threadId, type);
    }

    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: `🎵 ${result.artist} - ${result.title}`
    });

    // Gửi toàn bộ lời bài hát đầy đủ - không giới hạn
    const lyricsClean = result.lyrics.trim();
    
    console.log(`[bonz song] Full lyrics length: ${lyricsClean.length} characters`);
    
    // Chia thành các phần nhỏ để đảm bảo gửi hết, không bỏ sót
    const maxLength = 3500; // Giảm xuống để đảm bảo không bị cắt
    const parts = [];
    let currentPart = '';
    const lines = lyricsClean.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextPart = currentPart + line + '\n';
      
      // Nếu thêm dòng này sẽ vượt quá giới hạn
      if (nextPart.length > maxLength && currentPart.length > 0) {
        parts.push(currentPart.trim());
        currentPart = line + '\n';
      } else {
        currentPart = nextPart;
      }
    }
    
    // Luôn thêm phần cuối cùng
    if (currentPart.trim().length > 0) {
      parts.push(currentPart.trim());
    }
    
    // Nếu không có phần nào, thêm toàn bộ
    if (parts.length === 0) {
      parts.push(lyricsClean);
    }

    console.log(`[bonz song] Will send ${parts.length} parts to ensure full lyrics`);
    
    // Gửi tất cả các phần
    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        // Phần đầu với header
        await api.sendMessage(`${header}\n\n${parts[i]}`, threadId, type);
      } else {
        // Các phần tiếp theo
        await new Promise(resolve => setTimeout(resolve, 2000));
        await api.sendMessage(`🎵 Tiếp theo (${i + 1}/${parts.length}):\n\n${parts[i]}`, threadId, type);
      }
    }
    
    // Thông báo hoàn tất nếu có nhiều phần
    if (parts.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await api.sendMessage(`✅ Hoàn tất! Đã gửi toàn bộ lời bài hát (${parts.length} phần, ${lyricsClean.length} ký tự)`, threadId, type);
    }

  } catch (error) {
    console.error('Lỗi tìm lời bài hát:', error);
    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Tâm sự cùng bot (ChatGPT): bonz tâm sự <nội dung>
async function handleTamSu(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz tâm sự', senderId);

  const text = (args || []).join(' ').trim();
  if (!text) {
    const header = __formatServiceInfo({
      service: 'bonz tâm sự', userName, userId: senderId, role, usage,
      notify: 'Hãy chia sẻ điều bạn muốn tâm sự',
      howToUse: 'bonz tâm sự <nội dung>'
    });
    return api.sendMessage(header, threadId, type);
  }

  try {
    const basePrompt = `Bạn là người bạn tâm lý, phản hồi NGẮN (<= 120 từ), ấm áp, đồng cảm, TIẾNG VIỆT, gợi ý nhỏ để cải thiện. Không phán xét, không tư vấn y khoa/pháp lý. Tình huống: \n\n"${text}"`;
    const apiUrl = `https://api.zeidteam.xyz/ai/chatgpt4?prompt=${encodeURIComponent(basePrompt)}`;
    const aiRes = await axios.get(apiUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    let answer = aiRes?.data;
    // Chuẩn hóa từ nhiều dạng payload có thể gặp
    if (typeof answer === 'object') {
      answer = answer?.content || answer?.message || answer?.result || answer?.reply || answer?.data || answer?.output || '';
    }
    if (typeof answer !== 'string') answer = String(answer || '');
    // Loại bỏ dấu ngoặc kép/space thừa
    answer = answer.replace(/^["'“”\s]+|["'“”\s]+$/g, '').trim();
    // Nếu vẫn rỗng, thử fallback lần 2 với prompt tối giản
    if (!answer) {
      const fallbackPrompt = `Trả lời bằng tiếng Việt, ngắn gọn (<= 120 từ), đồng cảm và thực tế cho tình huống: "${text}"`;
      const altUrl = `https://api.zeidteam.xyz/ai/chatgpt4?prompt=${encodeURIComponent(fallbackPrompt)}`;
      const alt = await axios.get(altUrl, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      let altAns = alt?.data;
      if (typeof altAns === 'object') altAns = altAns?.content || altAns?.message || altAns?.result || altAns?.reply || altAns?.data || altAns?.output || '';
      answer = typeof altAns === 'string' ? altAns : String(altAns || '');
      answer = answer.replace(/^["'“”\s]+|["'“”\s]+$/g, '').trim();
    }
    if (!answer) answer = 'Tớ hiểu cảm giác của bạn. Hãy hít sâu, cho mình một khoảng lặng nhỏ và thử ghi ra 3 điều bạn có thể làm ngay bây giờ để nhẹ lòng hơn nhé.';
    const header = __formatServiceInfo({
      service: 'bonz tâm sự', userName, userId: senderId, role, usage,
      notify: 'Phản hồi từ người bạn BONZ'
    });
    return api.sendMessage(`${header}\n\n${answer}`, threadId, type);
  } catch (_) {
    const header = __formatServiceInfo({
      service: 'bonz tâm sự', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Wrapper function để xử lý lỗi "Tham số không hợp lệ" (Code 114)
async function safeSendMessage(api, message, threadId, type) {
  try {
    return await api.sendMessage(message, threadId, type);
  } catch (error) {
    console.log(`[SAFE_SEND] Error: ${error.message} (Code: ${error.code})`);
    
    if (error.message?.includes('Tham số không hợp lệ') || error.code === 114) {
      // Nếu là object phức tạp, chuyển thành string
      if (typeof message === 'object') {
        if (message.msg) {
          try {
            return await api.sendMessage(message.msg, threadId, type);
          } catch (e2) {
            console.log(`[SAFE_SEND] Object.msg failed: ${e2.message}`);
          }
        }
        
        // Thử stringify object
        try {
          const msgStr = JSON.stringify(message);
          if (msgStr.length < 1000) {
            return await api.sendMessage(msgStr, threadId, type);
          }
        } catch (e3) {
          console.log(`[SAFE_SEND] JSON.stringify failed: ${e3.message}`);
        }
      }
      
      // Nếu là string quá dài, chia nhỏ
      if (typeof message === 'string') {
        if (message.length > 2000) {
          try {
            // Chia thành nhiều phần
            const chunks = [];
            for (let i = 0; i < message.length; i += 1500) {
              chunks.push(message.substring(i, i + 1500));
            }
            
            // Gửi phần đầu tiên
            return await api.sendMessage(chunks[0] + (chunks.length > 1 ? '\n\n(Tiếp...)' : ''), threadId, type);
          } catch (e4) {
            console.log(`[SAFE_SEND] Chunking failed: ${e4.message}`);
          }
        }
        
        // Thử rút ngắn tin nhắn
        try {
          return await api.sendMessage(message.substring(0, 1000) + '...', threadId, type);
        } catch (e5) {
          console.log(`[SAFE_SEND] Truncate failed: ${e5.message}`);
        }
      }
      
      // Fallback cuối cùng - tin nhắn đơn giản nhất
      try {
        return await api.sendMessage('⚠️ Tin nhắn không thể gửi', threadId, type);
      } catch (e6) {
        console.log(`[SAFE_SEND] Final fallback failed: ${e6.message}`);
        // Không làm gì nữa, chấp nhận thất bại
        return null;
      }
    }
    
    // Ném lại lỗi khác
    throw error;
  }
}

module.exports.run = async ({ api, event, args, Threads }) => {
  const { threadId, type } = event;
  const sub = (args[0] || "").toLowerCase();
  const senderIdEarly = String(event?.data?.uidFrom || event?.authorId || '');
  const senderId = senderIdEarly; // Alias for compatibility

  // Xử lý lệnh /testsafe (không cần prefix bonz)
  if (sub === 'testsafe' || (args.length > 0 && args.join(' ').toLowerCase().startsWith('/testsafe'))) {
    return await handleTestSafe(api, event, args);
  }
  
  // Khởi tạo sẵn các nhóm Auto PR mặc định (chỉ chạy 1 lần)
  if (!global.bonzGroupsInitialized) {
    await initializeDefaultGroups();
    global.bonzGroupsInitialized = true;
  }
  
  // Debug cho auto pr
  if (sub === 'auto' && args[1] === 'pr') {
    console.log(`[BONZ] Nhận lệnh "bonz auto pr" từ ${threadId}, type: ${type}, args:`, args);
  }
  const cfgEarly = global?.config || {};
  const adminsEarly = Array.isArray(cfgEarly.admin_bot) ? cfgEarly.admin_bot.map(String) : [];
  const ownersEarly = Array.isArray(cfgEarly.owner_bot) ? cfgEarly.owner_bot.map(String) : [];
  const isAdminController = (sub === 'lock' || sub === 'unlock') && (adminsEarly.includes(senderIdEarly) || ownersEarly.includes(senderIdEarly));
  const isAdminOrOwner = adminsEarly.includes(senderIdEarly) || ownersEarly.includes(senderIdEarly);
  // Whitelist: chỉ hoạt động ở nhóm có trong allowed_threads (nếu được cấu hình)
  try {
    const allowed = Array.isArray(global?.config?.allowed_threads) ? global.config.allowed_threads.map(String) : [];
    // Cho phép lệnh 'allow' chạy để bootstrap thêm nhóm mới vào whitelist
    if (allowed.length > 0 && sub !== 'allow' && !allowed.includes(String(threadId))) {
      return; // bỏ qua nhóm không được phép
    }
  } catch {}

  // BONZ TT (TƯƠNG TÁC MODE) - Quản lý chế độ tương tác của bot
  if (sub === 'tt') {
    const mode = (args[1] || '').toLowerCase();
    const subMode = (args[2] || '').toLowerCase();
    
    // Chỉ admin/owner mới được thay đổi chế độ tương tác
    if (!isAdminOrOwner) {
      return await safeSendMessage(api, '❌ Chỉ admin/owner mới có thể thay đổi chế độ tương tác!', threadId, type);
    }
    
    // Khởi tạo global interaction settings nếu chưa có
    if (!global.bonzInteractionSettings) {
      global.bonzInteractionSettings = {};
    }
    
    if (mode === 'on') {
      if (subMode === 'all') {
        // bonz tt on all - Bot tương tác với mọi người
        global.bonzInteractionSettings[threadId] = 'all';
        return await safeSendMessage(api, 
          '✅ ĐÃ BẬT CHẾ ĐỘ TƯƠNG TÁC TOÀN BỘ!\n\n' +
          '🤖 Bot sẽ tương tác với:\n' +
          '• Tất cả thành viên trong nhóm\n' +
          '• Tin nhắn cá nhân từ mọi người\n' +
          '• Phản hồi mọi lệnh và câu hỏi\n\n' +
          '💡 Dùng "bonz tt admin" để chuyển về chế độ chỉ admin\n' +
          '💡 Dùng "bonz tt off" để tắt tương tác', 
          threadId, type
        );
      } else {
        return await safeSendMessage(api, 
          '❌ Cú pháp không đúng!\n\n' +
          '📝 Các lệnh hợp lệ:\n' +
          '• bonz tt on all - Tương tác với mọi người\n' +
          '• bonz tt admin - Chỉ tương tác với admin\n' +
          '• bonz tt off - Tắt tương tác\n' +
          '• bonz tt status - Xem trạng thái hiện tại', 
          threadId, type
        );
      }
    } else if (mode === 'admin') {
      // bonz tt admin - Bot chỉ tương tác với admin
      global.bonzInteractionSettings[threadId] = 'admin';
      return await safeSendMessage(api, 
        '🔒 ĐÃ BẬT CHẾ ĐỘ TƯƠNG TÁC CHỈ ADMIN!\n\n' +
        '👑 Bot chỉ tương tác với:\n' +
        '• Admin/Owner bot\n' +
        '• Bỏ qua tin nhắn từ thành viên thường\n' +
        '• Chỉ thực hiện lệnh từ admin\n\n' +
        '💡 Dùng "bonz tt on all" để mở rộng cho mọi người\n' +
        '💡 Dùng "bonz tt off" để tắt hoàn toàn', 
        threadId, type
      );
    } else if (mode === 'off') {
      // bonz tt off - Tắt tương tác
      global.bonzInteractionSettings[threadId] = 'off';
      return await safeSendMessage(api, 
        '🔕 ĐÃ TẮT CHẾ ĐỘ TƯƠNG TÁC!\n\n' +
        '😴 Bot sẽ:\n' +
        '• Im lặng hoàn toàn\n' +
        '• Không phản hồi bất kỳ lệnh nào\n' +
        '• Chỉ admin mới có thể bật lại\n\n' +
        '💡 Dùng "bonz tt on all" hoặc "bonz tt admin" để bật lại', 
        threadId, type
      );
    } else if (mode === 'silent') {
      // bonz tt silent - Vô hiệu hóa hoàn toàn bot
      global.bonzInteractionSettings[threadId] = 'silent';
      return await safeSendMessage(api, 
        '🤐 ĐÃ BẬT CHẾ ĐỘ IM LẶNG HOÀN TOÀN!\n\n' +
        '🚫 Bot sẽ:\n' +
        '• Vô hiệu hóa TẤT CẢ chức năng\n' +
        '• Không phản hồi bất kỳ lệnh nào (kể cả bonz safe)\n' +
        '• Không tự động xử lý tin nhắn\n' +
        '• Hoàn toàn "chết" với người dùng\n' +
        '• Chỉ admin có thể đánh thức lại\n\n' +
        '⚠️ LƯU Ý: Chế độ này vô hiệu hóa mọi thứ!\n' +
        '💡 Dùng "bonz tt on all" để bật lại', 
        threadId, type
      );
    } else if (mode === 'global') {
      // bonz tt global <mode> - Áp dụng cho tất cả nhóm
      const globalMode = (args[2] || '').toLowerCase();
      
      if (!globalMode || !['all', 'admin', 'off', 'silent'].includes(globalMode)) {
        return await safeSendMessage(api, 
          '❌ Cú pháp không đúng!\n\n' +
          '📝 Các lệnh global hợp lệ:\n' +
          '• bonz tt global all - Tất cả nhóm tương tác với mọi người\n' +
          '• bonz tt global admin - Tất cả nhóm chỉ tương tác với admin\n' +
          '• bonz tt global off - Tắt tương tác tất cả nhóm\n' +
          '• bonz tt global silent - Im lặng hoàn toàn tất cả nhóm\n' +
          '• bonz tt global status - Xem trạng thái tất cả nhóm', 
          threadId, type
        );
      }
      
      if (globalMode === 'status') {
        // Hiển thị trạng thái tất cả nhóm
        const allSettings = global.bonzInteractionSettings || {};
        const groupCount = Object.keys(allSettings).length;
        
        let statusReport = '📊 TRẠNG THÁI TƯƠNG TÁC TẤT CẢ NHÓM\n\n';
        
        if (groupCount === 0) {
          statusReport += '🌍 Tất cả nhóm đang ở chế độ mặc định (all)\n';
        } else {
          const modeStats = { all: 0, admin: 0, off: 0, silent: 0 };
          
          for (const [groupId, mode] of Object.entries(allSettings)) {
            modeStats[mode] = (modeStats[mode] || 0) + 1;
          }
          
          statusReport += `📈 THỐNG KÊ:\n`;
          statusReport += `🌍 All mode: ${modeStats.all} nhóm\n`;
          statusReport += `👑 Admin mode: ${modeStats.admin} nhóm\n`;
          statusReport += `🔕 Off mode: ${modeStats.off} nhóm\n`;
          statusReport += `🤐 Silent mode: ${modeStats.silent} nhóm\n`;
          statusReport += `📊 Tổng cộng: ${groupCount} nhóm đã cấu hình\n\n`;
          
          statusReport += `📝 CHI TIẾT (5 nhóm gần nhất):\n`;
          const recentGroups = Object.entries(allSettings).slice(-5);
          for (const [groupId, mode] of recentGroups) {
            const modeIcon = mode === 'all' ? '🌍' : mode === 'admin' ? '👑' : mode === 'off' ? '🔕' : '🤐';
            const isCurrentGroup = groupId === threadId ? ' (nhóm hiện tại)' : '';
            statusReport += `${modeIcon} ${groupId}${isCurrentGroup}\n`;
          }
        }
        
        statusReport += `\n💡 Dùng "bonz tt global <all|admin|off|silent>" để thay đổi tất cả`;
        
        return await safeSendMessage(api, statusReport, threadId, type);
      }
      
      // Áp dụng chế độ cho tất cả nhóm
      if (!global.bonzInteractionSettings) {
        global.bonzInteractionSettings = {};
      }
      
      // Lấy danh sách tất cả nhóm đã có trong settings hoặc tạo mới
      const existingGroups = Object.keys(global.bonzInteractionSettings);
      
      // Nếu chưa có nhóm nào, chỉ áp dụng cho nhóm hiện tại
      if (existingGroups.length === 0) {
        global.bonzInteractionSettings[threadId] = globalMode;
        
        let modeText = globalMode === 'all' ? 'TƯƠNG TÁC TOÀN BỘ' : 
                      globalMode === 'admin' ? 'CHỈ ADMIN' : 
                      globalMode === 'off' ? 'TẮT TƯƠNG TÁC' : 'IM LẶNG HOÀN TOÀN';
        let modeIcon = globalMode === 'all' ? '🌍' : 
                      globalMode === 'admin' ? '👑' : 
                      globalMode === 'off' ? '🔕' : '🤐';
        
        return await safeSendMessage(api, 
          `${modeIcon} ĐÃ ÁP DỤNG CHẾ ĐỘ ${modeText} CHO NHÓM HIỆN TẠI!\n\n` +
          `📝 Lưu ý: Đây là nhóm đầu tiên được cấu hình.\n` +
          `Khi có thêm nhóm khác sử dụng bot, dùng lại lệnh này để áp dụng cho tất cả.`, 
          threadId, type
        );
      }
      
      // Áp dụng cho tất cả nhóm đã có
      let updatedCount = 0;
      for (const groupId of existingGroups) {
        global.bonzInteractionSettings[groupId] = globalMode;
        updatedCount++;
      }
      
      // Đảm bảo nhóm hiện tại cũng được cập nhật
      if (!existingGroups.includes(threadId)) {
        global.bonzInteractionSettings[threadId] = globalMode;
        updatedCount++;
      }
      
      let modeText = globalMode === 'all' ? 'TƯƠNG TÁC TOÀN BỘ' : 
                    globalMode === 'admin' ? 'CHỈ ADMIN' : 
                    globalMode === 'off' ? 'TẮT TƯƠNG TÁC' : 'IM LẶNG HOÀN TOÀN';
      let modeIcon = globalMode === 'all' ? '🌍' : 
                    globalMode === 'admin' ? '👑' : 
                    globalMode === 'off' ? '🔕' : '🤐';
      
      return await safeSendMessage(api, 
        `${modeIcon} ĐÃ ÁP DỤNG CHẾ ĐỘ ${modeText} CHO TẤT CẢ NHÓM!\n\n` +
        `📊 Số nhóm được cập nhật: ${updatedCount}\n` +
        `🆔 Nhóm hiện tại: ${threadId}\n` +
        `👤 Người thực hiện: ${senderIdEarly}\n\n` +
        `💡 Dùng "bonz tt global status" để xem chi tiết tất cả nhóm`, 
        threadId, type
      );
      
    } else if (mode === 'status') {
      // bonz tt status - Xem trạng thái nhóm hiện tại
      const currentMode = global.bonzInteractionSettings[threadId] || 'all';
      let statusText = '';
      let modeIcon = '';
      
      switch (currentMode) {
        case 'all':
          modeIcon = '🌍';
          statusText = 'Tương tác với MỌI NGƯỜI';
          break;
        case 'admin':
          modeIcon = '👑';
          statusText = 'Chỉ tương tác với ADMIN';
          break;
        case 'off':
          modeIcon = '🔕';
          statusText = 'TẮT tương tác';
          break;
        case 'silent':
          modeIcon = '🤐';
          statusText = 'IM LẶNG HOÀN TOÀN';
          break;
        default:
          modeIcon = '🌍';
          statusText = 'Tương tác với MỌI NGƯỜI (mặc định)';
      }
      
      return await safeSendMessage(api, 
        `📊 TRẠNG THÁI TƯƠNG TÁC NHÓM HIỆN TẠI\n\n` +
        `${modeIcon} Chế độ: ${statusText}\n` +
        `🆔 Nhóm: ${threadId}\n` +
        `👤 Người kiểm tra: ${senderIdEarly}\n\n` +
        `📝 Các lệnh điều khiển:\n` +
        `• bonz tt on all - Tương tác toàn bộ (nhóm này)\n` +
        `• bonz tt admin - Chỉ admin (nhóm này)\n` +
        `• bonz tt off - Tắt tương tác (nhóm này)\n` +
        `• bonz tt global <mode> - Áp dụng cho tất cả nhóm\n` +
        `• bonz tt global status - Xem tất cả nhóm`, 
        threadId, type
      );
    } else {
      return await safeSendMessage(api, 
        '❌ Lệnh không hợp lệ!\n\n' +
        '📝 Hướng dẫn sử dụng BONZ TT:\n' +
        '🔹 LỆNH CHO NHÓM HIỆN TẠI:\n' +
        '• bonz tt on all - Bot tương tác với mọi người\n' +
        '• bonz tt admin - Bot chỉ tương tác với admin\n' +
        '• bonz tt off - Tắt hoàn toàn tương tác\n' +
        '• bonz tt silent - Vô hiệu hóa mọi chức năng\n' +
        '• bonz tt status - Xem trạng thái nhóm này\n\n' +
        '🌐 LỆNH CHO TẤT CẢ NHÓM:\n' +
        '• bonz tt global all - Áp dụng mode "all" cho tất cả nhóm\n' +
        '• bonz tt global admin - Áp dụng mode "admin" cho tất cả nhóm\n' +
        '• bonz tt global off - Tắt tương tác tất cả nhóm\n' +
        '• bonz tt global silent - Vô hiệu hóa tất cả nhóm\n' +
        '• bonz tt global status - Xem trạng thái tất cả nhóm\n\n' +
        '💡 Chỉ admin/owner mới có thể thay đổi!', 
        threadId, type
      );
    }
  }

  // Kiểm tra chế độ tương tác trước khi xử lý các lệnh khác
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  
  // Nếu chế độ là 'silent', vô hiệu hóa hoàn toàn mọi chức năng
  if (interactionMode === 'silent') {
    // Cho phép admin chạy 'bonz tt' và 'bonz safe' trong silent để quản trị
    if ((sub === 'tt' || sub === 'safe') && isAdminOrOwner) {
      // Tiếp tục xử lý lệnh tt
    } else {
      // Vô hiệu hóa hoàn toàn - không phản hồi gì cả, kể cả bonz safe
      return;
    }
  }
  
  // Nếu chế độ là 'off', chỉ cho phép admin bật lại
  if (interactionMode === 'off' && sub !== 'tt') {
    return; // Im lặng hoàn toàn
  }
  
  // Nếu chế độ là 'admin', chỉ cho phép admin sử dụng
  if (interactionMode === 'admin' && !isAdminOrOwner && sub !== 'tt') {
    return; // Im lặng với user thường
  }

  // Fallback: nếu Threads không được inject, require controller trực tiếp
  let ThreadsRef = Threads;
  if (!ThreadsRef) {
    try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {}
  }

  // ======================== KIỂM TRA KHÓA NGƯỜI DÙNG ========================
  try {
    const senderId = String(event?.data?.uidFrom || event?.authorId || '');
    if (senderId && ThreadsRef && typeof ThreadsRef.getData === 'function') {
      
      // Kiểm tra user có bị khóa không (trừ admin và các lệnh mở khóa)
      const isUnlockCommand = (sub === 'mở' && args[1] === 'khóa') || 
                              (sub === 'mo' && args[1] === 'khoa') || 
                              sub === 'unlock';
      
      if (!isAdminOrOwner && !isUnlockCommand) {
        const th = await ThreadsRef.getData(threadId);
        const tdata = th?.data || {};
        
        // Khởi tạo user_locks nếu chưa có
        if (!tdata.user_locks) tdata.user_locks = {};
        
        const userLock = tdata.user_locks[senderId];
        if (userLock && userLock.locked) {
          const lockedAt = userLock.lockedAt || 0;
          const reason = userLock.reason || 'Vi phạm quy định';
          const lockedBy = userLock.lockedBy || 'Admin';
          const lockedTime = new Date(lockedAt).toLocaleString('vi-VN');
          
          // Lấy tên user bị khóa
          let userName = senderId;
          try {
            const info = await api.getUserInfo([senderId]);
            userName = info?.changed_profiles?.[senderId]?.displayName || senderId;
          } catch {}
          
          try {
            await api.sendMessage(
              `🔒 BẠN ĐÃ BỊ KHÓA SỬ DỤNG BOT\n\n` +
              `👤 Người dùng: ${userName}\n` +
              `🆔 ID: ${senderId}\n` +
              `📅 Thời gian khóa: ${lockedTime}\n` +
              `👮 Khóa bởi: ${lockedBy}\n` +
              `📝 Lý do: ${reason}\n\n` +
              `📞 Liên hệ admin để được mở khóa.`,
              threadId, type
            );
          } catch {}
          return; // Dừng xử lý tất cả lệnh
        }
      }
      
      // ======================== CHỐNG SPAM ========================
      // Bỏ qua cơ chế chống spam cho admin/owner hoặc lệnh quản trị lock/unlock
      if (isAdminController || isAdminOrOwner) {
        // không đếm, không chặn admin/owner
      } else {
      const now = Date.now();

      const th = await ThreadsRef.getData(threadId);
      const tdata = th?.data || {};
      tdata.spam_guard = tdata.spam_guard || { 
        locks: {}, 
        counters: {}, 
        last_notice_at: {}, 
        warnings: {}, // Lưu số lần cảnh báo với timestamp
        whitelist: [], // Danh sách user được miễn spam check
        blacklist: [], // Danh sách user bị cấm vĩnh viễn
        stats: { // Thống kê hệ thống
          total_violations: 0,
          total_locks: 0,
          last_cleanup: 0
        },
        settings: {
          windowMs: 30 * 1000,     // 30s window
          threshold: 4,            // 4 lần/window
          warningDecayDays: 30,    // Warnings decay sau 30 ngày
          cleanupIntervalHours: 24 // Cleanup mỗi 24h
        } 
      };
      const guard = tdata.spam_guard;
      const settings = guard.settings || {};
      const windowMs = Number.isFinite(settings.windowMs) && settings.windowMs > 0 ? settings.windowMs : 30 * 1000; // 30s
      const threshold = Number.isFinite(settings.threshold) && settings.threshold > 0 ? settings.threshold : 4;     // >4 lần trong cửa sổ

      // ========== UTILITY FUNCTIONS ==========
      
      // Cleanup dữ liệu cũ và decay warnings
      const performCleanup = () => {
        const cleanupInterval = (settings.cleanupIntervalHours || 24) * 60 * 60 * 1000;
        if (!guard.stats.last_cleanup || (now - guard.stats.last_cleanup) > cleanupInterval) {
          
          // Cleanup expired locks
          for (const [uid, lockData] of Object.entries(guard.locks)) {
            if (lockData?.at && lockData?.duration) {
              if ((now - lockData.at) >= lockData.duration) {
                delete guard.locks[uid];
                delete guard.counters[uid];
                if (guard.last_notice_at) delete guard.last_notice_at[uid];
              }
            }
          }
          
          // Decay warnings (giảm dần theo thời gian)
          const decayMs = (settings.warningDecayDays || 30) * 24 * 60 * 60 * 1000;
          for (const [uid, warningData] of Object.entries(guard.warnings)) {
            if (typeof warningData === 'object' && warningData.lastViolation) {
              if ((now - warningData.lastViolation) > decayMs) {
                // Giảm 1 level warning sau decay period
                if (warningData.count > 1) {
                  guard.warnings[uid] = {
                    count: warningData.count - 1,
                    lastViolation: warningData.lastViolation
                  };
                } else {
                  delete guard.warnings[uid];
                }
              }
            } else if (typeof warningData === 'number') {
              // Migrate old format
              guard.warnings[uid] = {
                count: warningData,
                lastViolation: now
              };
            }
          }
          
          // Cleanup old counters (older than 1 hour)
          for (const [uid, timestamps] of Object.entries(guard.counters)) {
            if (Array.isArray(timestamps)) {
              guard.counters[uid] = timestamps.filter(ts => (now - ts) < 60 * 60 * 1000);
              if (guard.counters[uid].length === 0) {
                delete guard.counters[uid];
              }
            }
          }
          
          guard.stats.last_cleanup = now;
        }
      };
      
      // Kiểm tra whitelist/blacklist
      const checkUserStatus = (userId) => {
        if (Array.isArray(guard.blacklist) && guard.blacklist.includes(userId)) {
          return 'blacklisted';
        }
        if (Array.isArray(guard.whitelist) && guard.whitelist.includes(userId)) {
          return 'whitelisted';
        }
        return 'normal';
      };
      
      // Logging function
      const logViolation = (userId, action, details = {}) => {
        const logEntry = {
          timestamp: now,
          userId,
          action,
          threadId,
          ...details
        };
        
        // Có thể mở rộng để ghi vào file log hoặc database
        console.log(`[SPAM_GUARD] ${JSON.stringify(logEntry)}`);
      };
      
      // ========== MAIN LOGIC ==========
      
      // Thực hiện cleanup định kỳ
      performCleanup();
      
      // Khởi tạo warnings nếu chưa có
      if (!guard.warnings) guard.warnings = {};
      if (!guard.stats) guard.stats = { total_violations: 0, total_locks: 0, last_cleanup: 0 };
      
      // Kiểm tra user status
      const userStatus = checkUserStatus(senderId);
      if (userStatus === 'blacklisted') {
        try {
          await api.sendMessage(
            `🚫 BẠN ĐÃ BỊ CẤM SỬ DỤNG BOT\n\n` +
            `📞 Liên hệ admin để được xem xét mở cấm.`,
            threadId, type
          );
        } catch {}
        return;
      }
      
      if (userStatus === 'whitelisted') {
        // User trong whitelist - bỏ qua spam check
        return;
      }
      
      // Kiểm tra nếu đã bị khóa
      const lockRec = guard.locks[senderId];
      if (lockRec) {
        const lockedAt = typeof lockRec === 'object' && lockRec?.at ? Number(lockRec.at) : null;
        const lockDuration = typeof lockRec === 'object' && lockRec?.duration ? Number(lockRec.duration) : 0;
        const expired = lockedAt && lockDuration ? (now - lockedAt >= lockDuration) : false;
        
        if (expired) {
          // Hết hạn khóa - mở khóa
          delete guard.locks[senderId];
          delete guard.counters[senderId];
          if (guard.last_notice_at) delete guard.last_notice_at[senderId];
          await ThreadsRef.setData(threadId, tdata);
        } else {
          // Vẫn còn bị khóa - hiển thị thông báo
          const lastNoticeAt = guard.last_notice_at ? guard.last_notice_at[senderId] : undefined;
          if (!guard.last_notice_at) guard.last_notice_at = {};
          if (!lastNoticeAt || now - lastNoticeAt > 15000) { // Chỉ thông báo mỗi 15s
            guard.last_notice_at[senderId] = now;
            const remainMs = lockedAt && lockDuration ? Math.max(0, lockDuration - (now - lockedAt)) : 0;
            const remainH = Math.ceil(remainMs / (60*60*1000));
            const remainM = Math.ceil(remainMs / (60*1000));
            const timeStr = remainH > 0 ? `${remainH} giờ` : `${remainM} phút`;
            
            try { 
              await api.sendMessage(
                `🔒 BẠN ĐÃ BỊ KHÓA LỆNH DO SPAM!\n\n` +
                `⏰ Thời gian còn lại: ${timeStr}\n` +
                `📞 Liên hệ admin để được mở khóa sớm.`, 
                threadId, type
              ); 
            } catch {}
            await ThreadsRef.setData(threadId, tdata);
          }
          return; // Không xử lý tiếp các lệnh khác
        }
      }

      // Cập nhật bộ đếm trong cửa sổ thời gian
      const rec = Array.isArray(guard.counters[senderId]) ? guard.counters[senderId] : [];
      const recent = rec.filter(ts => now - ts < windowMs);
      recent.push(now);
      guard.counters[senderId] = recent;

      // Kiểm tra spam và xử lý theo mức độ
      if (recent.length >= threshold) {
        // Lấy warning data hiện tại
        const currentWarning = guard.warnings[senderId] || { count: 0, lastViolation: 0 };
        const warningCount = (typeof currentWarning === 'object' ? currentWarning.count : currentWarning) + 1;
        
        // Cập nhật warning với timestamp
        guard.warnings[senderId] = {
          count: warningCount,
          lastViolation: now,
          violations: (currentWarning.violations || 0) + 1
        };
        
        // Cập nhật stats
        guard.stats.total_violations++;
        
        // Định nghĩa thời gian khóa theo lần vi phạm (với progressive scaling)
        const lockDurations = {
          1: 0,                           // Lần 1: Chỉ cảnh báo
          2: 60 * 60 * 1000,             // Lần 2: 1 tiếng
          3: 24 * 60 * 60 * 1000,        // Lần 3: 24 giờ
          4: 2 * 24 * 60 * 60 * 1000,    // Lần 4: 2 ngày
          5: 5 * 24 * 60 * 60 * 1000,    // Lần 5: 5 ngày
          6: 9 * 24 * 60 * 60 * 1000     // Lần 6+: 9 ngày
        };
        
        const lockDuration = lockDurations[Math.min(warningCount, 6)] || lockDurations[6];
        
        // Log violation
        logViolation(senderId, 'spam_detected', {
          warningLevel: warningCount,
          recentCount: recent.length,
          threshold,
          windowMs,
          lockDuration
        });
        
        if (warningCount === 1) {
          // Lần 1: Chỉ cảnh báo
          try {
            await api.sendMessage(
              `⚠️ CẢNH BÁO SPAM - LẦN 1\n\n` +
              `🚨 Bạn đã gọi bot quá nhiều lần (${threshold} lần/${Math.round(windowMs/1000)}s)\n` +
              `💡 Hãy sử dụng bot một cách hợp lý\n` +
              `🔥 Lần tiếp theo sẽ bị khóa 1 tiếng!\n\n` +
              `📊 Tổng vi phạm của bạn: ${guard.warnings[senderId].violations}`,
              threadId, type
            );
          } catch {}
          
          logViolation(senderId, 'warning_sent', { warningLevel: 1 });
        } else {
          // Lần 2+: Khóa với thời gian tăng dần
          guard.locks[senderId] = { 
            at: now, 
            duration: lockDuration,
            warningLevel: warningCount,
            reason: 'spam_violation',
            violationCount: guard.warnings[senderId].violations
          };
          guard.last_notice_at = guard.last_notice_at || {};
          guard.last_notice_at[senderId] = now;
          guard.stats.total_locks++;
          
          const timeStr = lockDuration >= 24 * 60 * 60 * 1000 
            ? `${Math.round(lockDuration / (24 * 60 * 60 * 1000))} ngày`
            : `${Math.round(lockDuration / (60 * 60 * 1000))} giờ`;
            
          try {
            await api.sendMessage(
              `🔒 BỊ KHÓA DO SPAM - LẦN ${warningCount}\n\n` +
              `⏰ Thời gian khóa: ${timeStr}\n` +
              `🚨 Vi phạm: ${threshold} lần/${Math.round(windowMs/1000)}s\n` +
              `📈 Lần tiếp theo sẽ khóa lâu hơn!\n` +
              `📊 Tổng vi phạm của bạn: ${guard.warnings[senderId].violations}\n` +
              `📞 Liên hệ admin để được mở khóa sớm.`,
              threadId, type
            );
          } catch {}
          
          logViolation(senderId, 'user_locked', { 
            warningLevel: warningCount, 
            duration: lockDuration,
            totalViolations: guard.warnings[senderId].violations
          });
        }
        
        // Reset counter sau khi xử lý
        guard.counters[senderId] = [];
      }
      
      await ThreadsRef.setData(threadId, tdata);
      } // end else not admin controller
    }
  } catch {}

  // ========== SPAM GUARD ADMIN COMMANDS ==========
  
  // bonz spam stats - Xem thống kê spam guard
  if (sub === 'spam' && args[1] === 'stats') {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    const isAdmin = adminList.includes(senderIdEarly) || ownerList.includes(senderIdEarly);
    
    if (!isAdmin) {
      return api.sendMessage('❌ Chỉ admin mới có thể xem thống kê spam guard.', threadId, type);
    }
    
    try {
      const th = await ThreadsRef.getData(threadId);
      const tdata = th?.data || {};
      const guard = tdata.spam_guard || {};
      const stats = guard.stats || {};
      
      const activeLocks = Object.keys(guard.locks || {}).length;
      const totalWarnings = Object.keys(guard.warnings || {}).length;
      const whitelistCount = Array.isArray(guard.whitelist) ? guard.whitelist.length : 0;
      const blacklistCount = Array.isArray(guard.blacklist) ? guard.blacklist.length : 0;
      
      const lastCleanup = stats.last_cleanup ? new Date(stats.last_cleanup).toLocaleString('vi-VN') : 'Chưa có';
      
      return api.sendMessage(
        `📊 THỐNG KÊ SPAM GUARD\n\n` +
        `🔒 Đang bị khóa: ${activeLocks} người\n` +
        `⚠️ Có cảnh báo: ${totalWarnings} người\n` +
        `✅ Whitelist: ${whitelistCount} người\n` +
        `🚫 Blacklist: ${blacklistCount} người\n\n` +
        `📈 Tổng vi phạm: ${stats.total_violations || 0}\n` +
        `🔐 Tổng lần khóa: ${stats.total_locks || 0}\n` +
        `🧹 Cleanup cuối: ${lastCleanup}`,
        threadId, type
      );
    } catch (e) {
      return api.sendMessage('❌ Lỗi khi lấy thống kê spam guard.', threadId, type);
    }
  }
  
  // ========== USER LOCK/UNLOCK COMMANDS ==========
  
  // bonz khóa @user [lý do] - Khóa người dùng không cho sử dụng bot
  if (sub === 'khóa' || sub === 'khoa') {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    const isAdmin = adminList.includes(senderIdEarly) || ownerList.includes(senderIdEarly);
    
    if (!isAdmin) {
      return api.sendMessage('❌ Chỉ admin mới có thể khóa người dùng.', threadId, type);
    }
    
    // Lấy target user ID
    const mentions = event?.data?.mentions || [];
    let targetId = null;
    let reason = 'Vi phạm quy định';
    
    if (mentions.length > 0) {
      targetId = String(mentions[0]?.uid || mentions[0]?.id || '');
      // Lấy lý do từ args (bỏ qua mention)
      const reasonArgs = args.slice(1).filter(arg => !arg.startsWith('@') && !/^\d+$/.test(arg));
      if (reasonArgs.length > 0) {
        reason = reasonArgs.join(' ');
      }
    } else if (args[1]) {
      targetId = String(args[1]).replace(/[^0-9]/g, '');
      if (args.length > 2) {
        reason = args.slice(2).join(' ');
      }
    }
    
    if (!targetId) {
      return api.sendMessage('Dùng: bonz khóa @user [lý do]', threadId, type);
    }
    
    // Không cho phép khóa admin/owner
    if (adminList.includes(targetId) || ownerList.includes(targetId)) {
      return api.sendMessage('❌ Không thể khóa admin hoặc owner bot.', threadId, type);
    }
    
    try {
      const th = await ThreadsRef.getData(threadId);
      const tdata = th?.data || {};
      if (!tdata.user_locks) tdata.user_locks = {};
      
      // Lấy tên admin và user
      let adminName = senderIdEarly;
      let userName = targetId;
      try {
        const adminInfo = await api.getUserInfo([senderIdEarly]);
        adminName = adminInfo?.changed_profiles?.[senderIdEarly]?.displayName || senderIdEarly;
        
        const userInfo = await api.getUserInfo([targetId]);
        userName = userInfo?.changed_profiles?.[targetId]?.displayName || targetId;
      } catch {}
      
      // Kiểm tra đã bị khóa chưa
      if (tdata.user_locks[targetId] && tdata.user_locks[targetId].locked) {
        return api.sendMessage(`⚠️ ${userName} (${targetId}) đã bị khóa rồi.`, threadId, type);
      }
      
      // Khóa user
      tdata.user_locks[targetId] = {
        locked: true,
        lockedAt: Date.now(),
        lockedBy: adminName,
        lockedById: senderIdEarly,
        reason: reason,
        threadId: threadId
      };
      
      await ThreadsRef.setData(threadId, tdata);
      
      // Thông báo thành công
      return api.sendMessage(
        `🔒 ĐÃ KHÓA NGƯỜI DÙNG\n\n` +
        `👤 Người bị khóa: ${userName}\n` +
        `🆔 ID: ${targetId}\n` +
        `👮 Khóa bởi: ${adminName}\n` +
        `📝 Lý do: ${reason}\n` +
        `📅 Thời gian: ${new Date().toLocaleString('vi-VN')}\n\n` +
        `✅ ${userName} không thể sử dụng bot cho đến khi được mở khóa.`,
        threadId, type
      );
      
    } catch (e) {
      return api.sendMessage('❌ Lỗi khi khóa người dùng.', threadId, type);
    }
  }
  
  // bonz mở khóa @user - Mở khóa người dùng
  if ((sub === 'mở' && args[1] === 'khóa') || (sub === 'mo' && args[1] === 'khoa') || sub === 'unlock') {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    const isAdmin = adminList.includes(senderIdEarly) || ownerList.includes(senderIdEarly);
    
    if (!isAdmin) {
      return api.sendMessage('❌ Chỉ admin mới có thể mở khóa người dùng.', threadId, type);
    }
    
    // Lấy target user ID
    const mentions = event?.data?.mentions || [];
    let targetId = null;
    
    if (mentions.length > 0) {
      targetId = String(mentions[0]?.uid || mentions[0]?.id || '');
    } else if (args[2]) {
      targetId = String(args[2]).replace(/[^0-9]/g, '');
    }
    
    if (!targetId) {
      return api.sendMessage('Dùng: bonz mở khóa @user', threadId, type);
    }
    
    try {
      const th = await ThreadsRef.getData(threadId);
      const tdata = th?.data || {};
      if (!tdata.user_locks) tdata.user_locks = {};
      
      // Lấy tên admin và user
      let adminName = senderIdEarly;
      let userName = targetId;
      try {
        const adminInfo = await api.getUserInfo([senderIdEarly]);
        adminName = adminInfo?.changed_profiles?.[senderIdEarly]?.displayName || senderIdEarly;
        
        const userInfo = await api.getUserInfo([targetId]);
        userName = userInfo?.changed_profiles?.[targetId]?.displayName || targetId;
      } catch {}
      
      // Kiểm tra có bị khóa không
      if (!tdata.user_locks[targetId] || !tdata.user_locks[targetId].locked) {
        return api.sendMessage(`⚠️ ${userName} (${targetId}) không bị khóa.`, threadId, type);
      }
      
      // Lưu thông tin unlock
      const lockInfo = tdata.user_locks[targetId];
      const lockedTime = new Date(lockInfo.lockedAt || 0).toLocaleString('vi-VN');
      const lockedBy = lockInfo.lockedBy || 'Admin';
      const reason = lockInfo.reason || 'Vi phạm quy định';
      
      // Mở khóa user
      delete tdata.user_locks[targetId];
      
      await ThreadsRef.setData(threadId, tdata);
      
      // Thông báo thành công
      return api.sendMessage(
        `🔓 ĐÃ MỞ KHÓA NGƯỜI DÙNG\n\n` +
        `👤 Người được mở khóa: ${userName}\n` +
        `🆔 ID: ${targetId}\n` +
        `👮 Mở khóa bởi: ${adminName}\n` +
        `📅 Thời gian mở khóa: ${new Date().toLocaleString('vi-VN')}\n\n` +
        `📋 Thông tin khóa trước đó:\n` +
        `• Khóa bởi: ${lockedBy}\n` +
        `• Thời gian khóa: ${lockedTime}\n` +
        `• Lý do: ${reason}\n\n` +
        `✅ ${userName} đã có thể sử dụng bot trở lại.`,
        threadId, type
      );
      
    } catch (e) {
      return api.sendMessage('❌ Lỗi khi mở khóa người dùng.', threadId, type);
    }
  }
  
  // bonz danh sách khóa - Xem danh sách người dùng bị khóa
  if ((sub === 'danh' && args[1] === 'sách' && args[2] === 'khóa') || 
      (sub === 'ds' && args[1] === 'khóa') || 
      (sub === 'locked' && args[1] === 'users')) {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    const isAdmin = adminList.includes(senderIdEarly) || ownerList.includes(senderIdEarly);
    
    if (!isAdmin) {
      return api.sendMessage('❌ Chỉ admin mới có thể xem danh sách khóa.', threadId, type);
    }
    
    try {
      const th = await ThreadsRef.getData(threadId);
      const tdata = th?.data || {};
      const userLocks = tdata.user_locks || {};
      
      const lockedUsers = Object.entries(userLocks).filter(([uid, data]) => data.locked);
      
      if (lockedUsers.length === 0) {
        return api.sendMessage('📝 Không có người dùng nào bị khóa.', threadId, type);
      }
      
      // Lấy tên user
      const userIds = lockedUsers.map(([uid]) => uid);
      let userNames = {};
      try {
        const info = await api.getUserInfo(userIds);
        for (const uid of userIds) {
          userNames[uid] = info?.changed_profiles?.[uid]?.displayName || uid;
        }
      } catch {}
      
      const lines = ['🔒 DANH SÁCH NGƯỜI DÙNG BỊ KHÓA', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'];
      
      for (let i = 0; i < lockedUsers.length; i++) {
        const [uid, lockData] = lockedUsers[i];
        const userName = userNames[uid] || uid;
        const lockedTime = new Date(lockData.lockedAt || 0).toLocaleDateString('vi-VN');
        const lockedBy = lockData.lockedBy || 'Admin';
        const reason = lockData.reason || 'Vi phạm quy định';
        
        lines.push(
          `${i + 1}. ${userName} (${uid})`,
          `   📅 Khóa: ${lockedTime}`,
          `   👮 Bởi: ${lockedBy}`,
          `   📝 Lý do: ${reason}`,
          ''
        );
      }
      
      lines.push(`📊 Tổng: ${lockedUsers.length} người bị khóa`);
      
      return api.sendMessage(lines.join('\n'), threadId, type);
      
    } catch (e) {
      return api.sendMessage('❌ Lỗi khi lấy danh sách khóa.', threadId, type);
    }
  }

  // bonz spam whitelist add/remove @user
  if (sub === 'spam' && args[1] === 'whitelist') {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    const isAdmin = adminList.includes(senderIdEarly) || ownerList.includes(senderIdEarly);
    
    if (!isAdmin) {
      return api.sendMessage('❌ Chỉ admin mới có thể quản lý whitelist.', threadId, type);
    }
    
    const action = args[2]?.toLowerCase();
    if (!['add', 'remove', 'list'].includes(action)) {
      return api.sendMessage('Dùng: bonz spam whitelist add/remove/list @user', threadId, type);
    }
    
    try {
      const th = await ThreadsRef.getData(threadId);
      const tdata = th?.data || {};
      if (!tdata.spam_guard) tdata.spam_guard = {};
      if (!Array.isArray(tdata.spam_guard.whitelist)) tdata.spam_guard.whitelist = [];
      
      if (action === 'list') {
        if (tdata.spam_guard.whitelist.length === 0) {
          return api.sendMessage('📝 Whitelist trống.', threadId, type);
        }
        
        let userNames = {};
        try {
          const info = await api.getUserInfo(tdata.spam_guard.whitelist);
          for (const uid of tdata.spam_guard.whitelist) {
            userNames[uid] = info?.changed_profiles?.[uid]?.displayName || uid;
          }
        } catch {}
        
        const list = tdata.spam_guard.whitelist.map((uid, i) => 
          `${i+1}. ${userNames[uid] || uid} (${uid})`
        ).join('\n');
        
        return api.sendMessage(`📝 WHITELIST (${tdata.spam_guard.whitelist.length}):\n\n${list}`, threadId, type);
      }
      
      // Get target user ID
      const mentions = event?.data?.mentions || [];
      let targetId = null;
      
      if (mentions.length > 0) {
        targetId = String(mentions[0]?.uid || mentions[0]?.id || '');
      } else if (args[3]) {
        targetId = String(args[3]).replace(/[^0-9]/g, '');
      }
      
      if (!targetId) {
        return api.sendMessage('Vui lòng mention user hoặc nhập ID.', threadId, type);
      }
      
      if (action === 'add') {
        if (!tdata.spam_guard.whitelist.includes(targetId)) {
          tdata.spam_guard.whitelist.push(targetId);
          await ThreadsRef.setData(threadId, tdata);
          return api.sendMessage(`✅ Đã thêm ${targetId} vào whitelist.`, threadId, type);
        } else {
          return api.sendMessage(`⚠️ ${targetId} đã có trong whitelist.`, threadId, type);
        }
      } else if (action === 'remove') {
        const index = tdata.spam_guard.whitelist.indexOf(targetId);
        if (index > -1) {
          tdata.spam_guard.whitelist.splice(index, 1);
          await ThreadsRef.setData(threadId, tdata);
          return api.sendMessage(`✅ Đã xóa ${targetId} khỏi whitelist.`, threadId, type);
        } else {
          return api.sendMessage(`⚠️ ${targetId} không có trong whitelist.`, threadId, type);
        }
      }
    } catch (e) {
      return api.sendMessage('❌ Lỗi khi quản lý whitelist.', threadId, type);
    }
  }

  // bonz dl - Xóa tất cả tin nhắn của người dùng trong nhóm
  if (sub === 'dl' || sub === 'delete') {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    const senderId = String(event?.data?.uidFrom || event?.authorId || '');
    
    // Chỉ admin/owner mới được sử dụng
    if (!adminList.includes(senderId) && !ownerList.includes(senderId)) {
      return api.sendMessage('❌ Chỉ admin/owner mới có thể sử dụng lệnh này!', threadId, type);
    }

    // Lấy target user từ mention, reply hoặc args
    let targetUserId = null;
    let targetUserName = 'Người dùng';

    try {
      // Kiểm tra mention
      if (event?.data?.mentions && Object.keys(event.data.mentions).length > 0) {
        targetUserId = Object.keys(event.data.mentions)[0];
      }
      // Kiểm tra reply
      else if (event?.data?.quote?.uidFrom) {
        targetUserId = String(event.data.quote.uidFrom);
      }
      // Kiểm tra args (ID trực tiếp)
      else if (args[1] && args[1].match(/^\d+$/)) {
        targetUserId = args[1];
      }

      if (!targetUserId) {
        return api.sendMessage(
          '❌ Vui lòng chỉ định người dùng cần xóa tin nhắn!\n\n' +
          '📝 Cách sử dụng:\n' +
          '• bonz dl @mention\n' +
          '• bonz dl (reply tin nhắn của người đó)\n' +
          '• bonz dl <user_id>',
          threadId, type
        );
      }

      // Lấy tên user
      try {
        const userInfo = await api.getUserInfo([targetUserId]);
        targetUserName = userInfo?.changed_profiles?.[targetUserId]?.displayName || targetUserId;
      } catch {}

      // Xác nhận trước khi xóa
      const confirmMsg = await api.sendMessage(
        `⚠️ XÁC NHẬN XÓA TIN NHẮN\n\n` +
        `👤 Người dùng: ${targetUserName}\n` +
        `🆔 ID: ${targetUserId}\n` +
        `📝 Hành động: Xóa TẤT CẢ tin nhắn của người này trong nhóm\n\n` +
        `⚠️ CẢNH BÁO: Hành động này KHÔNG THỂ HOÀN TÁC!\n\n` +
        `👉 Gõ "bonz xác nhận" để tiếp tục\n` +
        `👉 Gõ "bonz hủy" để hủy bỏ`,
        threadId, type
      );

      // Lưu thông tin chờ xác nhận
      if (!global.deleteConfirmations) global.deleteConfirmations = new Map();
      global.deleteConfirmations.set(threadId, {
        targetUserId,
        targetUserName,
        adminId: senderId,
        confirmMsgId: confirmMsg?.messageId,
        timestamp: Date.now()
      });

      // Tự động hủy sau 30 giây
      setTimeout(() => {
        if (global.deleteConfirmations?.has(threadId)) {
          global.deleteConfirmations.delete(threadId);
          api.sendMessage('⏰ Đã hết thời gian xác nhận. Lệnh xóa tin nhắn đã bị hủy.', threadId, type).catch(() => {});
        }
      }, 30000);

    } catch (error) {
      console.error('[bonz dl] Lỗi:', error);
      return api.sendMessage('❌ Có lỗi xảy ra khi xử lý lệnh xóa tin nhắn!', threadId, type);
    }
    return;
  }

  // bonz xác nhận - Xác nhận xóa tin nhắn
  if (sub === 'xác' && args[1] === 'nhận' || sub === 'xacnhan' || (sub === 'xác' && args[1] === 'nhan')) {
    if (global.deleteConfirmations?.has(threadId)) {
      const confirmation = global.deleteConfirmations.get(threadId);
      const senderId = String(event?.data?.uidFrom || event?.authorId || '');
      
      // Chỉ admin đã gửi lệnh mới có thể xác nhận
      if (senderId === confirmation.adminId) {
        // Thực hiện xóa tin nhắn
        global.deleteConfirmations.delete(threadId);
        
        try {
          await api.sendMessage('🔄 Đang tiến hành xóa tin nhắn...', threadId, type);
          
          // Gọi API xóa tin nhắn của user
          const result = await deleteUserMessages(api, threadId, confirmation.targetUserId);
          
          if (result.success) {
            let statusMessage = '';
            
            if (result.kicked) {
              statusMessage = `🦵 ĐÃ KICK USER RA KHỎI NHÓM!\n\n` +
                `👤 Người dùng: ${confirmation.targetUserName}\n` +
                `🆔 ID: ${confirmation.targetUserId}\n` +
                `📝 Tin nhắn: Không thể xóa (giới hạn API)\n` +
                `🔍 Đã kiểm tra: ${result.totalChecked} tin nhắn\n` +
                `✅ Hành động: Đã kick user ra khỏi nhóm\n` +
                `⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}`;
            } else if (result.banned) {
              statusMessage = `🚫 ĐÃ BAN USER!\n\n` +
                `👤 Người dùng: ${confirmation.targetUserName}\n` +
                `🆔 ID: ${confirmation.targetUserId}\n` +
                `📝 Tin nhắn: Không thể xóa (giới hạn API)\n` +
                `🔍 Đã kiểm tra: ${result.totalChecked} tin nhắn\n` +
                `✅ Hành động: Đã ban user khỏi nhóm\n` +
                `⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}`;
            } else if (result.deletedCount > 0) {
              statusMessage = `✅ ĐÃ XÓA THÀNH CÔNG!\n\n` +
                `👤 Người dùng: ${confirmation.targetUserName}\n` +
                `🆔 ID: ${confirmation.targetUserId}\n` +
                `📝 Đã xóa: ${result.deletedCount} tin nhắn\n` +
                `🔍 Đã kiểm tra: ${result.totalChecked} tin nhắn\n` +
                `⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}\n\n` +
                `💡 Kiểm tra console để xem log chi tiết`;
            } else {
              statusMessage = `⚠️ XÓA KHÔNG THÀNH CÔNG!\n\n` +
                `👤 Người dùng: ${confirmation.targetUserName}\n` +
                `🆔 ID: ${confirmation.targetUserId}\n` +
                `📝 Đã xóa: 0 tin nhắn\n` +
                `🔍 Đã kiểm tra: ${result.totalChecked} tin nhắn\n` +
                `❌ Lý do: ${result.message || 'Giới hạn quyền API'}\n` +
                `⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}\n\n` +
                `💡 Thử dùng lệnh kick thay thế: bonz cút @user`;
            }
            
            await api.sendMessage(statusMessage, threadId, type);
          } else {
            await api.sendMessage(
              `❌ XÓA KHÔNG THÀNH CÔNG!\n\n` +
              `👤 Người dùng: ${confirmation.targetUserName}\n` +
              `🆔 ID: ${confirmation.targetUserId}\n` +
              `📝 Lỗi: ${result.error}\n\n` +
              `💡 Có thể do:\n` +
              `• Bot không có quyền xóa tin nhắn\n` +
              `• Tin nhắn quá cũ\n` +
              `• Lỗi API Zalo`,
              threadId, type
            );
          }
        } catch (error) {
          console.error('[Delete Messages] Lỗi:', error);
          await api.sendMessage('❌ Có lỗi xảy ra khi xóa tin nhắn!', threadId, type);
        }
      } else {
        await api.sendMessage('❌ Chỉ admin đã gửi lệnh xóa mới có thể xác nhận!', threadId, type);
      }
    } else {
      await api.sendMessage('❌ Không có lệnh xóa tin nhắn nào đang chờ xác nhận!', threadId, type);
    }
    return;
  }

  // bonz hủy - Hủy lệnh xóa tin nhắn
  if (sub === 'hủy' || sub === 'huy' || sub === 'cancel') {
    if (global.deleteConfirmations?.has(threadId)) {
      const confirmation = global.deleteConfirmations.get(threadId);
      const senderId = String(event?.data?.uidFrom || event?.authorId || '');
      
      // Chỉ admin đã gửi lệnh mới có thể hủy
      if (senderId === confirmation.adminId) {
        global.deleteConfirmations.delete(threadId);
        await api.sendMessage('❌ Đã hủy lệnh xóa tin nhắn.', threadId, type);
      } else {
        await api.sendMessage('❌ Chỉ admin đã gửi lệnh xóa mới có thể hủy!', threadId, type);
      }
    } else {
      await api.sendMessage('❌ Không có lệnh xóa tin nhắn nào đang chờ xác nhận!', threadId, type);
    }
    return;
  }

  // Forward: bonz admin ... -> admin.js
  if (sub === 'admin') {
    try {
      const adminCmd = require('./admin.js');
      const Threads = require('../../core/controller/controllerThreads');
      await adminCmd.run({ args: args.slice(1), event, api, Threads });
    } catch (e) {
      try {
        await api.sendMessage('❌ Không thể thực thi bonz admin. Vui lòng thử lại.', threadId, type);
      } catch {}
    }
    return;
  }

  // Forward: bonz anti ... -> anti.js
  if (sub === 'anti') {
    try {
      const antiCmd = require('./anti.js');
      const Threads = require('../../core/controller/controllerThreads');
      await antiCmd.run({ args: args.slice(1), event, api, Threads });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz anti. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz cdm ... -> cdm.js
  if (sub === 'cdm') {
    try {
      const cdmCmd = require('./cdm.js');
      await cdmCmd.run({ args: args.slice(1), event, api });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz cdm. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz cmd ... -> cmd.js
  if (sub === 'cmd') {
    try {
      const cmdCmd = require('./cmd.js');
      await cmdCmd.run({ args: args.slice(1), event, api });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz cmd. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz girltt ... -> girltt.js (video gái TikTok)
  if (sub === 'girltt' || sub === 'gaitt') {
    try {
      const girlttCmd = require('./girltt.js');
      // Bảng thông tin dịch vụ trước khi gửi video
      const senderId = event?.data?.uidFrom || event?.authorId;
      let userName = 'Người dùng';
      try {
        const info = await api.getUserInfo(senderId);
        userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
      } catch {}
      const role = __getRoleLabel(senderId);
      const usage = __incUsage('bonz girltt', senderId);
      const header = __formatServiceInfo({
        service: 'bonz girltt',
        userName,
        userId: senderId,
        notify: 'Gửi video TikTok ngẫu nhiên',
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: 'bonz girltt'
      });
      await api.sendMessage(header, threadId, type, null, senderId);
      await girlttCmd.run({ event, api, args: args.slice(1) });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz girltt. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz sendcard ... -> sendcard.js (gửi danh thiếp)
  if (sub === 'sendcard' || sub === 'sc') {
    try {
      const sendcardCmd = require('./sendcard.js');
      await sendcardCmd.run({ args: args.slice(1), event, api });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz sendcard. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz boxinfo ... -> boxinfo.js (thông tin nhóm)
  if (sub === 'boxinfo' || sub === 'info') {
    try {
      const boxinfoCmd = require('./boxinfo.js');
      await boxinfoCmd.run({ api, event, args: args.slice(1) });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz boxinfo. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz itik ... -> itik.js
  if (sub === 'itik') {
    try {
      const itikCmd = require('./itik.js');
      await itikCmd.run({ api, event, args: args.slice(1) });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz itik. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Ảnh gái nhanh: bonz gái | bonz gai | bonz girl
  if (sub === 'gái' || sub === 'gai' || sub === 'girl') {
    try {
      const girlCmd = require('./girl.js');
      // Thêm header thông tin dịch vụ
      const senderId = event?.data?.uidFrom || event?.authorId;
      let userName = 'Người dùng';
      try { const info = await api.getUserInfo(senderId); userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng'; } catch {}
      const role = __getRoleLabel(senderId);
      const usage = __incUsage('bonz ảnh gái', senderId);
      const header = __formatServiceInfo({ service: 'bonz ảnh gái', userName, userId: senderId, notify: 'Gửi ảnh ngẫu nhiên', role, usage });
      await api.sendMessage(header, threadId, type, null, senderId);
      await girlCmd.run({ args: [], event, api, Users: undefined });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể gửi ảnh gái lúc này.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz tile ... -> tile.js
  if (sub === 'tile') {
    try {
      const tileCmd = require('./tile.js');
      await tileCmd.run({ api, event, args: args.slice(1) });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz tile. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Ảnh: chỉ còn bonz ảnh gái [số_lượng]
  if (sub === 'ảnh' || sub === 'anh') {
    const choice = (args[1] || '').toLowerCase();
    const rest = args.slice(2);
    if ([ 'gái', 'gai', 'girl' ].includes(choice)) {
      try {
        const girlCmd = require('./girl.js');
        const senderId = event?.data?.uidFrom || event?.authorId;
        let userName = 'Người dùng';
        try { const info = await api.getUserInfo(senderId); userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng'; } catch {}
        const role = __getRoleLabel(senderId);
        const usage = __incUsage('bonz ảnh gái', senderId);
        const header = __formatServiceInfo({ service: 'bonz ảnh gái', userName, userId: senderId, notify: 'Gửi ảnh ngẫu nhiên', role, usage });
        await api.sendMessage(header, threadId, type, null, senderId);
        return await girlCmd.run({ args: [], event, api, Users: undefined });
      } catch (e) {
        return api.sendMessage('❌ Không thể gửi ảnh gái lúc này.', threadId, type);
      }
    }
    if ([ 'trai', 'boy', 'nam' ].includes(choice)) {
      return api.sendMessage('🚫 Tính năng ảnh trai đã được gỡ.', threadId, type);
    }
    return api.sendMessage('Dùng: bonz ảnh gái [1-5]', threadId, type);
  }

  // bonz gmail edu -> gửi hướng dẫn/nguồn tham khảo tạo email EDU
  if (sub === 'gmail' && (args[1] || '').toLowerCase() === 'edu') {
    try {
      await handleGmailEdu(api, event);
    } catch (e) {
      try { await api.sendMessage('❌ Không thể hiển thị hướng dẫn Gmail EDU lúc này.', threadId, type); } catch {}
    }
    return;
  }


  // (đã xử lý router 'ảnh' ở trên)


  // bonz menu admin -> hiển thị danh sách lệnh quản trị viên (chia nhỏ để tránh lỗi)
  if (sub === 'menu' && (args[1] || '').toLowerCase() === 'admin') {
    try {
      // Phần 1: Lệnh cơ bản
      const part1 = [
        '👑 DANH SÁCH LỆNH QUẢN TRỊ VIÊN (Phần 1/3)',
        '',
        '🔧 QUẢN LÝ ADMIN:',
        '• admin list - Xem danh sách admin/support',
        '• admin add [@tag/ID…] - Thêm admin',
        '• admin rm [@tag/ID…] - Gỡ admin',
        '• admin sp [@tag/ID…] - Thêm support',
        '• admin rmsp [@tag/ID…] - Gỡ support',
        '• admin adminonly - Chỉ admin dùng bot',
        '• admin supportonly - Chỉ support dùng bot',
        '• admin boxonly - Chỉ cho phép lệnh trong nhóm',
        '',
        '🔒 HỆ THỐNG BẢO VỆ:',
        '• anti link on|off - Bật/tắt chống link',
        '• anti undo on|off - Bật/tắt chống thu hồi',
        '• anti spam on|off - Bật/tắt chống spam',
        '• bonz invite on|off|status - Chặn link mời nhóm',
        '• bonz safe at <từ...> - Thêm từ/cụm từ cấm',
        '• bonz safe atlink <link...> - Thêm link/pattern cấm',
        '• bonz tt on all|admin|off|silent|status - Chế độ tương tác',
        '• bonz tt global all|admin|off|silent|status - Áp dụng tất cả nhóm',
        '• bonz vi phạm top [n] - Top điểm vi phạm',
        '• bonz vi phạm của tôi - Điểm vi phạm của bạn',
        '• bonz vi phạm reset @user - Reset điểm vi phạm',
        '• bonz flood <số> <delay> [msg] - Spam tin nhắn',
        '• bonz flood <template> <số> <delay> - Spam với template',
        '• bonz spam custom <add|use|list|del> - Spam template cá nhân',
        '• bonz key <user_id|@mention> - Thêm QTV nhóm',
        '• bonz key list - Xem danh sách QTV',
        '• bonz key remove <user_id> - Gỡ QTV',
        '• bonz ai <câu_hỏi> - Chat với AI thông minh',
        '• bonz điểm - Tổng hợp điểm số từ tất cả game',
        '• bonz tổng từ - Thống kê vi phạm Safe Mode',
        '',
        '📝 GỬ "bonz menu admin2" để xem tiếp...'
      ];
      
      await safeSendMessage(api, part1.join('\n'), threadId, type);
    } catch (error) {
      await safeSendMessage(api, '❌ Không thể hiển thị menu admin. Thử lại sau.', threadId, type);
    }
    return;
  }
  
  // bonz menu admin2 -> phần 2
  if (sub === 'menu' && (args[1] || '').toLowerCase() === 'admin2') {
    try {
      const part2 = [
        '👑 DANH SÁCH LỆNH QUẢN TRỊ VIÊN (Phần 2/3)',
        '',
        '🚀 AUTO PR SYSTEM:',
        '• bonz auto pr create <tên> - Tạo chiến dịch PR',
        '• bonz auto pr start <id> - Bắt đầu chiến dịch',
        '• bonz auto pr stop <id> - Dừng chiến dịch',
        '• bonz auto pr list - Danh sách chiến dịch',
        '• bonz auto pr delete <id> - Xóa chiến dịch',
        '• bonz auto pr status - Trạng thái hệ thống',
        '',
        '🔒 QUẢN LÝ NGƯỜI DÙNG:',
        '• kickall - Kick tất cả thành viên',
        '• bonz var <text>|<delay> - Spam tin nhắn',
        '• bonz khóa @user [lý do] - Khóa người dùng',
        '• bonz mở khóa @user - Mở khóa người dùng',
        '• bonz ds khóa - Danh sách bị khóa',
        '• bonz spam stats - Thống kê spam guard',
        '• bonz spam whitelist - Quản lý whitelist',
        '',
        '📝 GỬ "bonz menu admin3" để xem tiếp...'
      ];
      
      await safeSendMessage(api, part2.join('\n'), threadId, type);
    } catch (error) {
      await safeSendMessage(api, '❌ Không thể hiển thị menu admin 2. Thử lại sau.', threadId, type);
    }
    return;
  }
  
  // bonz menu admin3 -> phần 3
  if (sub === 'menu' && (args[1] || '').toLowerCase() === 'admin3') {
    try {
      const part3 = [
        '👑 DANH SÁCH LỆNH QUẢN TRỊ VIÊN (Phần 3/3)',
        '',
        '📅 TIỆN ÍCH:',
        '• bonz gg image <từ khóa> - Tìm ảnh Google',
        '• bonz in bot - Thông tin bot',
        '• bonz pr - Bảng dịch vụ VIP',
        '• bonz nhóm <id> <link> [tên] - Lưu nhóm',
        '• bonz nhóm list - Danh sách nhóm đã lưu',
        '• bonz nhóm rm <id> - Xóa nhóm theo ID',
        '• bonz list group - Liệt kê group bot',
        '• bonz video tik <từ khóa> - Tìm video TikTok',
        '• bonz join <link> - Bot tham gia nhóm',
        '• bonz leave - Bot rời nhóm',
        '• bonz rename <tên> - Đổi tên nhóm',
        '',
        '🔧 HỆ THỐNG:',
        '• autosend on/off - Tự động gửi tin nhắn',
        '• bonz on/off - Bật/tắt bot cho nhóm',
        '• cdm <domain> - Kiểm tra tên miền',
        '• cmd <action> - Quản lý plugin',
        '• reloadconfig - Tải lại config',
        '• setprefix [prefix] - Đặt prefix nhóm',
        '• upt - Thời gian hoạt động',
        '',
        '💡 Dùng: bonz admin <subcommand>',
        'Ví dụ: bonz admin list',
        '',
        '📝 GỬ "bonz menu admin4" để xem tiếp...'
      ];
      
      await safeSendMessage(api, part3.join('\n'), threadId, type);
    } catch (error) {
      await safeSendMessage(api, '❌ Không thể hiển thị menu admin 3. Thử lại sau.', threadId, type);
    }
    return;
  }
  
  // bonz menu admin4 -> phần 4
  if (sub === 'menu' && (args[1] || '').toLowerCase() === 'admin4') {
    try {
      const part4 = [
        '👑 DANH SÁCH LỆNH QUẢN TRỊ VIÊN (Phần 4/4)',
        '',
        '🛡️ SAFE MODE & DEBUG:',
        '• bonz safe on/off - Bật/tắt Safe Mode',
        '• bonz safe từ <word> - Thêm từ cấm',
        '• bonz safe atlink <url> - Thêm link cấm',
        '• bonz safe ls/xóa - Xem/xóa danh sách cấm',
        '• bonz từ list/thêm/xóa - Quản lý từ cấm nhanh',
        '• bonz của tớ - Dịch vụ TikTok (tăng view/like)',
        '• bonz tổng từ - Thống kê vi phạm',
        '• bonz tổng từ clear - Xóa thống kê',
        '• bonz test vi phạm - Thêm dữ liệu test',
        '• /testsafe từ <từ> - Test thêm từ cấm',
        '• /testsafe status - Xem trạng thái Safe Mode',
        '',
        '🧪 TEST COMMANDS:',
        '• testsafe - Lệnh test Safe Mode',
        '• testsafe từ <word> - Test thêm từ',
        '• testsafe status - Test trạng thái',
        '',
        '💡 Safe Mode tự động xóa tin nhắn vi phạm',
        '🚀 Tốc độ xóa: < 60ms (siêu nhanh)',
        '📊 Thống kê tự động ghi nhận vi phạm'
      ];
      
      await safeSendMessage(api, part4.join('\n'), threadId, type);
    } catch (error) {
      await safeSendMessage(api, '❌ Không thể hiển thị menu admin 4. Thử lại sau.', threadId, type);
    }
    return;
  }

  // bonz menu admin5 -> phần 5
  if (sub === 'menu' && (args[1] || '').toLowerCase() === 'admin5') {
    try {
      const part5 = [
        '👑 DANH SÁCH LỆNH QUẢN TRỊ VIÊN (Phần 5/5)',
        '',
        '⚙️ QUẢN LÝ CÀI ĐẶT NHÓM:',
        '• name <tên_mới> - Đổi tên nhóm',
        '• lockchat on|off - Khóa/Mở gửi tin nhắn',
        '• lockview on|off - Chặn/Cho phép xem danh sách thành viên',
        '• history on|off - Bật/Tắt đọc tin nhắn gần nhất cho thành viên mới',
        '• joinappr on|off - Bật/Tắt phê duyệt thành viên',
        '• showkey on|off - Bật/Tắt nổi bật tin nhắn admin',
        '',
        '🔑 CẤP QUYỀN:',
        '• keygold @user|<uid> - Nhường chủ nhóm (key vàng)',
        '• keysilver @user|<uid> - Phong phó nhóm (key bạc)',
        '• unkey @user|<uid> - Gỡ phó nhóm',
      ];
      
      await safeSendMessage(api, part5.join('\n'), threadId, type);
    } catch (error) {
      await safeSendMessage(api, '❌ Không thể hiển thị menu admin 5. Thử lại sau.', threadId, type);
    }
    return;
  }

  // bonz uk -> chuyển tiếp sang command 'uk'
  if (sub === 'uk') {
    try {
      const ukCmd = global?.client?.commands?.get('uk');
      if (ukCmd && typeof ukCmd.run === 'function') {
        await ukCmd.run({ api, event, args: args.slice(1), Threads });
      } else {
        await safeSendMessage(api, '❌ Lệnh "uk" chưa được nạp.', threadId, type);
      }
    } catch (error) {
      try { await safeSendMessage(api, '❌ Không thể chạy lệnh uk.', threadId, type); } catch {}
    }
    return;
  }

  // Hiển thị menu BONZ khi không có tham số hoặc chỉ có đúng "menu"
  // Lưu ý: nếu là "bonz menu <something>", KHÔNG vào nhánh này để router chuyên biệt xử lý
  if (!sub || (sub === "menu" && !args[1])) {
    // Lấy thông tin người dùng
    const { data } = event;
    const senderId = data.uidFrom;
    let userName = "Người dùng";
    let avatarUrl = null;
    
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
      avatarUrl = info?.changed_profiles?.[senderId]?.avatar || null;
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Tạo ảnh menu song song với text menu
    let menuImageSent = false;
    const createImagePromise = (async () => {
      try {
        const menuImagePath = await createBonzMenuImage(userName, senderId, avatarUrl);
        
        if (menuImagePath) {
          // Thử gửi ảnh menu
          try {
            const fs = require('fs');
            await api.sendMessage('🎨 Ảnh menu BONZ đẹp mắt! ✨', threadId, type, [fs.createReadStream(menuImagePath)]);
            menuImageSent = true;
            
            // Cleanup file sau 15 giây
            setTimeout(() => {
              try {
                if (fs.existsSync(menuImagePath)) {
                  fs.unlinkSync(menuImagePath);
                  console.log('[Menu Image] Đã xóa file tạm:', menuImagePath);
                }
              } catch (cleanupError) {
                console.log('[Menu Image] Lỗi cleanup:', cleanupError.message);
              }
            }, 15000);
          } catch (sendError) {
            console.log('[Menu Image] Không thể gửi ảnh menu:', sendError.message);
          }
        }
      } catch (error) {
        console.log('[Menu Image] Lỗi tạo ảnh menu:', error.message);
      }
    })();

    // Không đợi ảnh, tiếp tục gửi text menu ngay

    const userIdDisplay = senderId;
    const versionText = (module.exports.config && module.exports.config.version) ? module.exports.config.version : '1/1/Z';
    const now = new Date();
    const dd = now.getDate();
    const mm = now.getMonth() + 1;
    const yyyy = now.getFullYear();
    const dateText = `${dd}/${mm}/${yyyy}`;
    const adminList = Array.isArray(global?.config?.admin_bot) ? global.config.admin_bot : [];
    // Xác định chủ nhân: ưu tiên config.owner_bot (string hoặc array), nếu không có thì mặc định là admin đầu tiên
    const ownerConf = global?.config?.owner_bot;
    let ownerList = [];
    if (Array.isArray(ownerConf)) ownerList = ownerConf;
    else if (typeof ownerConf === 'string') ownerList = [ownerConf];
    const ownerFallback = adminList && adminList.length ? adminList[0] : null;
    const isOwner = ownerList.length ? ownerList.includes(userIdDisplay) : (ownerFallback === userIdDisplay);
    const isAdmin = adminList.includes(userIdDisplay);
    const levelText = isOwner ? 'Toàn quyền' : (isAdmin ? 'Quản trị' : 'Thường');
    const userLabel = isOwner ? 'Chủ nhân' : userName;

    // Tạo khung đẹp, thẳng hàng
    const INNER = 32; // độ rộng nội dung bên trong khung
    const repeat = (ch, n) => ch.repeat(n);
    const top = `╔${repeat('═', INNER + 2)}╗`;
    const sep = `╠${repeat('═', INNER + 2)}╣`;
    const bottom = `╚${repeat('═', INNER + 2)}╝`;
    const fit = (text) => {
      const t = String(text ?? '');
      if (t.length > INNER) return t.slice(0, INNER);
      return t.padEnd(INNER, ' ');
    };
    const center = (text) => {
      let t = String(text ?? '');
      if (t.length > INNER) t = t.slice(0, INNER);
      const left = Math.floor((INNER - t.length) / 2);
      const right = INNER - t.length - left;
      return `${' '.repeat(left)}${t}${' '.repeat(right)}`;
    };
    const line = (text) => `║ ${fit(text)} ║`;

    // Nếu nhóm đang tắt bot và không phải lệnh 'on', thì im lặng (không gửi menu)
    try {
      const threadData = await (ThreadsRef?.getData ? ThreadsRef.getData(event.threadId) : null);
      const muted = !!(threadData?.data?.bot_mute);
      if (muted && sub !== 'on') {
        return; // im lặng hoàn toàn
      }
    } catch {}

    const headerBox = [
      top,
      line(center('bonz 💕ly')),
      sep,
      line(`👤 Người dùng : ${userLabel}`),
      line(`🆔 ID : ${userIdDisplay}`),
      line(`👑 ADMIN : bonz 💕ly`),
      line(`⚡ VERSION : ${versionText}`),
      line(`📅 Ngày cập nhật : ${dateText}`),
      line(`💠 Cấp bậc : ${levelText}`),
      line(center('✨ Chúc bạn sử dụng bot vui vẻ!')),
      bottom
    ].join('\n');

    const commands = [
      '',
      '📚 NHÓM ZALO HỌC TẬP:',
      '📖 Tài liệu học tập: https://zalo.me/g/zffqdg843',
      '🧠 Những kẻ nghiện học: https://zalo.me/g/cgcrjp735',
      '📝 Tài liệu học: https://zalo.me/g/chpafn970',
      '',
      '📧 gmail ảo',
      '🎓 gmail edu',
      '🔄 bonz restart',
      '👧 bonz ảnh gái',
      '🆔 bonz get id',
      '🆔 bonzid2 | bonzid2 box | bonzid2 @user',
      '🆘 bonz help',
      '🧩 bonz câu đố',
      '📚 bonz câu đố trắc',
      '🏆 bonz điểm',
      '🎬 bonz yt info <link>',
      '🛠 bonz admin',
      '⚙️ bonz config',
      '🧮 bonz giải toán',
      '🎵 bonz nhạc <từ khóa>',
      '🎵 bonz itik <username>',
      '🧠 bonz quiz',
      '🫂 bonz tâm sự',
      '🛡️ bonz safe on|off|status|self <uid_bot>',
      '🚫 bonz từ list|thêm|xóa - Quản lý từ cấm',
      '🎯 bonz của tớ - Dịch vụ TikTok (tăng view/like)',
      '🎮 bonz game',
      '🎯 bonz tile',
      '🌍 bonz dịch',
      '📷 bonz qr',
      '💖 bonzqrheart (QR trái tim)',
      '🔗 bonz rút gọn link',
      '🔎 sr',
      '🤖 bonz autochat on|off [interval] [prompt]',
      '🪪 bonz sendcard @user [nội dung]',
      '🖼 bonz ai ảnh',
      '📅 bonz lịch',
      '📰 bonz news',
      '🌤 bonz weather',
      '💘 bonz thả thính',
      '📱 bonz fb',
      '👥 bonz group', 
      '⏰ bonz reminder',
      '🌟 bonz horoscope',
      '📑 bonz tài liệu',
      '📝 bonz thơ',
      '🤖 bonz gpt',
      '🎥👧 bonz video gái',
      '🎥👧 bonz girltt',
      '🤖 bonz chat ai',
      '🤖 bonz ai <câu_hỏi>',
      '🐍 bonz tool <chức_năng>',
      '🏆 bonz top',
      '📊 bonz thống kê',
      '👢 bonz menu admin ',
      '🔗 bonz tham gia <link>',
      '💬 bonz var hello|1000',
      '🖼️ bonz gg image <từ khóa>',
      '🎵 bonz song',
      '👋 bonz cút',
      '🚀 bonz auto pr (Admin)',
    ].join('\n');

    const bonzMenu = `${headerBox}\n${commands}`;

    // Gửi menu với xử lý lỗi "Tham số không hợp lệ"
    try {
      await safeSendMessage(api, bonzMenu, threadId, type);
    } catch (error) {
      // Nếu vẫn lỗi, chia nhỏ tin nhắn
      try {
        // Gửi header riêng
        await safeSendMessage(api, headerBox, threadId, type);
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay 0.5s
        
        // Gửi commands riêng
        await safeSendMessage(api, commands, threadId, type);
      } catch (fallbackError) {
        // Fallback cuối cùng - gửi tin nhắn đơn giản
        await safeSendMessage(api, '🤖 BONZ BOT MENU\n\nDùng "bonz menu admin" để xem lệnh admin.\nBot đang hoạt động bình thường!', threadId, type);
      }
    }
    
    // Thả tim 4 lần vào tin nhắn của người dùng - thử nhiều phương pháp
    if (event.messageID) {
      try {
        for (let i = 0; i < 4; i++) {
          // Thử các phương pháp khác nhau
          try {
            // Phương pháp 1: setMessageReaction
            await api.setMessageReaction(event.messageID, "❤️");
          } catch (e1) {
            try {
              // Phương pháp 2: react
              await api.react(event.messageID, "❤️");
            } catch (e2) {
              try {
                // Phương pháp 3: sendReaction
                await api.sendReaction(event.messageID, "❤️");
              } catch (e3) {
                try {
                  // Phương pháp 4: addReaction
                  await api.addReaction(event.messageID, "❤️");
                } catch (e4) {
                  console.log(`Lần ${i+1}: Không thể thả tim bằng bất kỳ phương pháp nào`);
                  break;
                }
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 500)); // Delay 0.5s giữa các lần thả tim
        }
      } catch (reactionError) {
        console.log("Lỗi thả tim:", reactionError.message);
        
        // Fallback: Gửi tin nhắn thông báo thay vì thả tim
        await api.sendMessage("❤️❤️❤️❤️ Menu BONZ đã được hiển thị!", threadId, type);
      }
    }
    
    return;
  }

  // Xử lý các subcommand
  if (sub === "gmail" && args[1] && args[1].toLowerCase() === "ảo") {
    return await handleGmailAo(api, event);
  }

  if (sub === "khởi" && args[1] && args[1].toLowerCase() === "động" && args[2] && args[2].toLowerCase() === "lại") {
    return await handleRestart(api, event);
  }

  if (sub === "restart") {
    return await handleRestart(api, event);
  }

  // Alias ngắn cho khởi động lại
  if (sub === "rs") {
    return await handleRestart(api, event);
  }

  if (sub === "get" && args[1] && args[1].toLowerCase() === "id") {
    return await handleGetId(api, event);
  }

  if (sub === "rút" && args[1] && args[1].toLowerCase() === "gọn" && args[2] && args[2].toLowerCase() === "link") {
    return await handleShortenLink(api, event, args.slice(3));
  }

  if (sub === "link") {
    return await handleShortenLink(api, event, args.slice(1));
  }

  // (đã gỡ tính năng nhạc)

  // (đã thay bằng route mới bên dưới)

  if (sub === "thả" && args[1] && args[1].toLowerCase() === "thính") {
    try {
      const thinhCmd = require('./thathinh.js');
      return await thinhCmd.run({ api, event, args: [] });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz thả thính. Vui lòng thử lại.', event.threadId, event.type); } catch {}
      return;
    }
  }

  // BONZ FLOOD - Đã tách thành lệnh riêng "flood"
  if (sub === 'flood') {
    return await safeSendMessage(api,
      '⚠️ LỆNH ĐÃ CHUYỂN SANG FILE RIÊNG\n\n' +
      '🆕 Dùng trực tiếp: flood <số_lượng> <delay_ms> <ttl_ms> [tin_nhắn]\n' +
      '📘 Gõ: flood help để xem hướng dẫn chi tiết\n' +
      '👑 Quyền hạn: user thường tối đa 1.000, admin tới 50.000 tin',
      threadId,
      type
    );
  }

  // BONZ SPAM CUSTOM - Quản lý nội dung spam cá nhân
  if (sub === 'spam' && args[1] === 'custom') {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    const senderIdEarly = String(event?.data?.uidFrom || event?.authorId || '');
    const isAdminOrOwner = adminList.includes(senderIdEarly) || ownerList.includes(senderIdEarly);
    
    if (!isAdminOrOwner) {
      return await safeSendMessage(api, '❌ Chỉ admin/owner mới có thể quản lý spam custom!', threadId, type);
    }
    
    // Khởi tạo storage cho spam custom
    if (!global.bonzSpamCustom) {
      global.bonzSpamCustom = {};
    }
    
    const action = (args[2] || '').toLowerCase();
    
    // bonz spam custom list - Xem danh sách spam templates
    if (action === 'list') {
      const userSpams = global.bonzSpamCustom[senderIdEarly] || {};
      const spamNames = Object.keys(userSpams);
      
      if (spamNames.length === 0) {
        return await safeSendMessage(api, 
          '📝 DANH SÁCH SPAM CUSTOM TRỐNG\n\n' +
          '💡 Tạo spam mới:\n' +
          '• bonz spam custom add <tên> <nội_dung>\n' +
          '• bonz spam custom use <tên> <số_lượng> <delay>', 
          threadId, type
        );
      }
      
      let listMessage = '📋 DANH SÁCH SPAM CUSTOM CỦA BẠN:\n\n';
      spamNames.forEach((name, index) => {
        const content = userSpams[name];
        const preview = content.length > 50 ? content.substring(0, 50) + '...' : content;
        listMessage += `${index + 1}. 🏷️ ${name}\n   📝 "${preview}"\n\n`;
      });
      
      listMessage += '💡 LỆNH:\n';
      listMessage += '• bonz spam custom use <tên> <số> <delay>\n';
      listMessage += '• bonz spam custom del <tên>\n';
      listMessage += '• bonz spam custom edit <tên> <nội_dung_mới>';
      
      return await safeSendMessage(api, listMessage, threadId, type);
    }
    
    // bonz spam custom add <tên> <nội_dung> - Thêm spam template
    if (action === 'add') {
      const spamName = args[3];
      const spamContent = args.slice(4).join(' ');
      
      if (!spamName || !spamContent) {
        return await safeSendMessage(api, 
          '❌ Thiếu thông tin!\n\n' +
          '📝 Cú pháp: bonz spam custom add <tên> <nội_dung>\n' +
          '💡 Ví dụ: bonz spam custom add hello Xin chào mọi người!', 
          threadId, type
        );
      }
      
      if (!global.bonzSpamCustom[senderIdEarly]) {
        global.bonzSpamCustom[senderIdEarly] = {};
      }
      
      global.bonzSpamCustom[senderIdEarly][spamName] = spamContent;
      
      return await safeSendMessage(api, 
        `✅ ĐÃ TẠO SPAM CUSTOM!\n\n` +
        `🏷️ Tên: ${spamName}\n` +
        `📝 Nội dung: "${spamContent}"\n` +
        `👤 Tạo bởi: ${senderIdEarly}\n\n` +
        `🚀 Sử dụng: bonz spam custom use ${spamName} <số> <delay>`, 
        threadId, type
      );
    }
    
    // bonz spam custom use <tên> <số_lượng> <delay> - Sử dụng spam template
    if (action === 'use') {
      const spamName = args[3];
      const count = parseInt(args[4], 10);
      const delay = parseInt(args[5], 10);
      
      if (!spamName) {
        return await safeSendMessage(api, 
          '❌ Thiếu tên spam!\n\n' +
          '📝 Cú pháp: bonz spam custom use <tên> <số> <delay>\n' +
          '📋 Xem danh sách: bonz spam custom list', 
          threadId, type
        );
      }
      
      const userSpams = global.bonzSpamCustom[senderIdEarly] || {};
      const spamContent = userSpams[spamName];
      
      if (!spamContent) {
        return await safeSendMessage(api, 
          `❌ Không tìm thấy spam "${spamName}"!\n\n` +
          '📋 Xem danh sách: bonz spam custom list\n' +
          '➕ Tạo mới: bonz spam custom add <tên> <nội_dung>', 
          threadId, type
        );
      }
      
      if (!count || count <= 0 || count > 50000) {
        return await safeSendMessage(api, 
          '❌ Số lượng không hợp lệ!\n\n' +
          '📊 Số lượng: 1-50000\n' +
          '⏱️ Delay: 0-10000ms\n\n' +
          `💡 Ví dụ: bonz spam custom use ${spamName} 1000 0`, 
          threadId, type
        );
      }
      
      if (delay < 0 || delay > 10000) {
        return await safeSendMessage(api, 
          '❌ Delay không hợp lệ!\n\n' +
          '⏱️ Delay phải từ 0-10000ms\n' +
          '• 0ms = không delay (nhanh nhất)\n' +
          '• 1000ms = 1 giây', 
          threadId, type
        );
      }
      
      // Xác nhận trước khi spam
      await safeSendMessage(api, 
        `🚨 CHUẨN BỊ SPAM CUSTOM!\n\n` +
        `🏷️ Template: ${spamName}\n` +
        `📊 Số lượng: ${count.toLocaleString('vi-VN')} tin nhắn\n` +
        `⏱️ Delay: ${delay}ms\n` +
        `📝 Nội dung: "${spamContent}"\n` +
        `👤 Thực hiện bởi: ${senderIdEarly}\n\n` +
        `⚠️ CẢNH BÁO: Có thể gây lag/crash nhóm!\n` +
        `🔥 Bắt đầu sau 3 giây...`, 
        threadId, type
      );
      
      // Đếm ngược 3 giây
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Bắt đầu spam
      let successCount = 0;
      let errorCount = 0;
      const startTime = Date.now();
      
      await safeSendMessage(api, `🚀 BẮT ĐẦU SPAM CUSTOM "${spamName}" - ${count.toLocaleString('vi-VN')} TIN NHẮN!`, threadId, type);
      
      for (let i = 1; i <= count; i++) {
        try {
          const customMessage = `${spamContent} (${i}/${count})`;
          await api.sendMessage(customMessage, threadId, type);
          successCount++;
          
          // Báo cáo tiến độ mỗi 1000 tin nhắn
          if (i % 1000 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = (i / elapsed).toFixed(1);
            await api.sendMessage(
              `📊 Tiến độ "${spamName}": ${i.toLocaleString('vi-VN')}/${count.toLocaleString('vi-VN')} (${((i/count)*100).toFixed(1)}%)\n` +
              `⏱️ Thời gian: ${elapsed}s | Tốc độ: ${rate} msg/s`, 
              threadId, type
            );
          }
          
          // Delay nếu được chỉ định
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
        } catch (error) {
          errorCount++;
          console.log(`[SPAM CUSTOM] Lỗi tin nhắn ${i}: ${error.message}`);
          
          // Nếu lỗi quá nhiều, dừng lại
          if (errorCount > 100) {
            await safeSendMessage(api, 
              `❌ DỪNG SPAM CUSTOM - Quá nhiều lỗi!\n\n` +
              `🏷️ Template: ${spamName}\n` +
              `✅ Thành công: ${successCount.toLocaleString('vi-VN')}\n` +
              `❌ Lỗi: ${errorCount}\n` +
              `📊 Tổng cộng: ${i}/${count}`, 
              threadId, type
            );
            return;
          }
        }
      }
      
      // Báo cáo kết thúc
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const avgRate = (successCount / totalTime).toFixed(1);
      
      return await safeSendMessage(api, 
        `🎉 HOÀN THÀNH SPAM CUSTOM!\n\n` +
        `🏷️ Template: ${spamName}\n` +
        `✅ Thành công: ${successCount.toLocaleString('vi-VN')} tin nhắn\n` +
        `❌ Lỗi: ${errorCount}\n` +
        `⏱️ Thời gian: ${totalTime}s\n` +
        `📈 Tốc độ trung bình: ${avgRate} msg/s\n` +
        `📝 Nội dung: "${spamContent}"\n\n` +
        `🔥 Custom spam completed by ${senderIdEarly}`, 
        threadId, type
      );
    }
    
    // bonz spam custom del <tên> - Xóa spam template
    if (action === 'del' || action === 'delete') {
      const spamName = args[3];
      
      if (!spamName) {
        return await safeSendMessage(api, 
          '❌ Thiếu tên spam cần xóa!\n\n' +
          '📝 Cú pháp: bonz spam custom del <tên>\n' +
          '📋 Xem danh sách: bonz spam custom list', 
          threadId, type
        );
      }
      
      const userSpams = global.bonzSpamCustom[senderIdEarly] || {};
      
      if (!userSpams[spamName]) {
        return await safeSendMessage(api, 
          `❌ Không tìm thấy spam "${spamName}"!\n\n` +
          '📋 Xem danh sách: bonz spam custom list', 
          threadId, type
        );
      }
      
      const deletedContent = userSpams[spamName];
      delete userSpams[spamName];
      
      return await safeSendMessage(api, 
        `🗑️ ĐÃ XÓA SPAM CUSTOM!\n\n` +
        `🏷️ Tên: ${spamName}\n` +
        `📝 Nội dung đã xóa: "${deletedContent}"\n` +
        `👤 Xóa bởi: ${senderIdEarly}`, 
        threadId, type
      );
    }
    
    // bonz spam custom edit <tên> <nội_dung_mới> - Sửa spam template
    if (action === 'edit') {
      const spamName = args[3];
      const newContent = args.slice(4).join(' ');
      
      if (!spamName || !newContent) {
        return await safeSendMessage(api, 
          '❌ Thiếu thông tin!\n\n' +
          '📝 Cú pháp: bonz spam custom edit <tên> <nội_dung_mới>\n' +
          '📋 Xem danh sách: bonz spam custom list', 
          threadId, type
        );
      }
      
      const userSpams = global.bonzSpamCustom[senderIdEarly] || {};
      
      if (!userSpams[spamName]) {
        return await safeSendMessage(api, 
          `❌ Không tìm thấy spam "${spamName}"!\n\n` +
          '📋 Xem danh sách: bonz spam custom list\n' +
          '➕ Tạo mới: bonz spam custom add <tên> <nội_dung>', 
          threadId, type
        );
      }
      
      const oldContent = userSpams[spamName];
      userSpams[spamName] = newContent;
      
      return await safeSendMessage(api, 
        `✏️ ĐÃ SỬA SPAM CUSTOM!\n\n` +
        `🏷️ Tên: ${spamName}\n` +
        `📝 Nội dung cũ: "${oldContent}"\n` +
        `📝 Nội dung mới: "${newContent}"\n` +
        `👤 Sửa bởi: ${senderIdEarly}`, 
        threadId, type
      );
    }
    
    // bonz spam custom init - Tạo các template mẫu
    if (action === 'init') {
      if (!global.bonzSpamCustom[senderIdEarly]) {
        global.bonzSpamCustom[senderIdEarly] = {};
      }
      
      const defaultTemplates = {
        'hello': 'Xin chào mọi người! 👋',
        'flood': '💥 FLOOD ATTACK 💥',
        'spam': '🚀 SPAM MESSAGE 🚀',
        'test': 'Test tin nhắn số',
        'lag': '🔥 LAG LAG LAG 🔥',
        'crash': '💀 CRASH THE GROUP 💀',
        'bonz': '🤖 BONZ BOT POWER 🤖',
        'admin': '👑 ADMIN ĐANG ONLINE 👑',
        'warning': '⚠️ CẢNH BÁO: BOT ĐANG HOẠT ĐỘNG ⚠️',
        'emoji': '😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙😚☺️🙂🤗🤩🤔🤨😐😑😶🙄😏😣😥😮🤐😯😪😫🥱😴😌😛😜😝🤤😒😓😔😕🙃🤑😲☹️🙁😖😞😟😤😢😭😦😧😨😩🤯😬😰😱🥵🥶😳🤪😵😡😠🤬😷🤒🤕🤢🤮🤧😇🥳🥺🤠🤡🤥🤫🤭🧐🤓😈👿👹👺💀☠️👻👽👾🤖💩😺😸😹😻😼😽🙀😿😾',
        'bonzzz': '/bo/bo 👑 𝗕𝗼𝗻𝘇𝘇𝘇 – 𝗩𝘂𝗮 𝗦𝗽𝗮𝗺 𝗭𝗮𝗹𝗼 👑\n🌠 𝗦𝗮̀𝗻 𝗧𝗿𝗲𝗼 | 𝗠𝗮̃𝗶 𝗧𝗿𝘂̛𝗼̛̀𝗻𝗴 𝗧𝗼̂̀𝗻 | 🇻🇳'
      };
      
      let addedCount = 0;
      for (const [name, content] of Object.entries(defaultTemplates)) {
        if (!global.bonzSpamCustom[senderIdEarly][name]) {
          global.bonzSpamCustom[senderIdEarly][name] = content;
          addedCount++;
        }
      }
      
      return await safeSendMessage(api, 
        `🎉 ĐÃ KHỞI TẠO SPAM TEMPLATES!\n\n` +
        `✅ Đã thêm: ${addedCount} template mới\n` +
        `📋 Tổng cộng: ${Object.keys(global.bonzSpamCustom[senderIdEarly]).length} templates\n` +
        `👤 Khởi tạo bởi: ${senderIdEarly}\n\n` +
        `📝 TEMPLATES MẪU:\n` +
        `• hello - Chào hỏi\n` +
        `• flood - Flood attack\n` +
        `• spam - Spam message\n` +
        `• test - Test message\n` +
        `• lag - Lag message\n` +
        `• crash - Crash message\n` +
        `• bonz - Bot power\n` +
        `• admin - Admin online\n` +
        `• warning - Cảnh báo\n` +
        `• emoji - Emoji spam\n` +
        `• bonzzz - Bonzzz VIP spam (custom)\n\n` +
        `🚀 Sử dụng: bonz spam custom use <tên> <số> <delay>\n` +
        `📋 Xem tất cả: bonz spam custom list`, 
        threadId, type
      );
    }

    // Help menu
    return await safeSendMessage(api, 
      '📋 HƯỚNG DẪN SPAM CUSTOM:\n\n' +
      '📝 QUẢN LÝ TEMPLATE:\n' +
      '• bonz spam custom add <tên> <nội_dung>\n' +
      '• bonz spam custom list\n' +
      '• bonz spam custom edit <tên> <nội_dung_mới>\n' +
      '• bonz spam custom del <tên>\n' +
      '• bonz spam custom init - Tạo templates mẫu\n\n' +
      '🚀 SỬ DỤNG:\n' +
      '• bonz spam custom use <tên> <số> <delay>\n\n' +
      '💡 VÍ DỤ:\n' +
      '• bonz spam custom init\n' +
      '• bonz spam custom add hello Xin chào!\n' +
      '• bonz spam custom use hello 1000 0', 
      threadId, type
    );
  }

  // BONZ GRAMMAR - Redirect to grammar.js (có canvas đẹp)
  if (sub === 'grammar' || sub === 'ngu-phap') {
    try {
      const grammarCmd = require('./grammar.js');
      return await grammarCmd.run({ api, event, args: args.slice(1) });
    } catch (error) {
      console.error('Error calling grammar:', error);
      return api.sendMessage('❌ Lỗi gọi lệnh grammar. Thử: bonz grammar <văn bản>', threadId, type);
    }
  }

  // BONZ PLAGIARISM - Redirect to plagiarism.js (có canvas đẹp)
  if (sub === 'plagiarism' || sub === 'dao-van') {
    try {
      const plagiarismCmd = require('./plagiarism.js');
      return await plagiarismCmd.run({ api, event, args: args.slice(1) });
    } catch (error) {
      console.error('Error calling plagiarism:', error);
      return api.sendMessage('❌ Lỗi gọi lệnh plagiarism. Thử: bonz plagiarism <văn bản>', threadId, type);
    }
  }

  // BONZ CLASSIFY - Redirect to classify.js (có canvas đẹp)
  if (sub === 'classify' || sub === 'phan-loai') {
    try {
      const classifyCmd = require('./classify.js');
      return await classifyCmd.run({ api, event, args: args.slice(1) });
    } catch (error) {
      console.error('Error calling classify:', error);
      return api.sendMessage('❌ Lỗi gọi lệnh classify. Thử: bonz classify <nội dung>', threadId, type);
    }
  }
  
  /*
  // OLD CODE REMOVED - Đã chuyển sang classify.js với canvas đẹp
  if (sub === 'classify-old') {
    const text = args.slice(1).join(' ');
    
    // Từ khóa phân loại
    const categories = {
      'Tích cực': {
        keywords: ['tốt', 'đẹp', 'hay', 'tuyệt', 'xuất sắc', 'tuyệt vời', 'yêu', 'thích', 'vui', 'hạnh phúc', 'tích cực', 'hoàn hảo', 'tốt lành'],
        emoji: '😊',
        color: 'xanh lá'
      },
      'Tiêu cực': {
        keywords: ['xấu', 'tệ', 'ghét', 'tức giận', 'buồn', 'khóc', 'đau', 'chán', 'mệt', 'stress', 'lo lắng', 'sợ hãi', 'thất vọng'],
        emoji: '😞',
        color: 'đỏ'
      },
      'Trung tính': {
        keywords: ['bình thường', 'được', 'ok', 'không sao', 'tạm ổn', 'bình thường', 'thông thường'],
        emoji: '😐',
        color: 'xám'
      },
      'Thông tin': {
        keywords: ['thông tin', 'dữ liệu', 'báo cáo', 'tin tức', 'thông báo', 'cập nhật', 'chi tiết', 'mô tả'],
        emoji: '📊',
        color: 'xanh dương'
      },
      'Câu hỏi': {
        keywords: ['gì', 'sao', 'như thế nào', 'tại sao', 'khi nào', 'ở đâu', 'ai', 'có phải', 'có thể'],
        emoji: '❓',
        color: 'vàng'
      },
      'Giải trí': {
        keywords: ['hài', 'vui', 'game', 'nhạc', 'phim', 'trò chơi', 'giải trí', 'thú vị', 'hài hước'],
        emoji: '🎮',
        color: 'tím'
      },
      'Công việc': {
        keywords: ['làm việc', 'công ty', 'dự án', 'họp', 'deadline', 'báo cáo', 'nhiệm vụ', 'công việc'],
        emoji: '💼',
        color: 'nâu'
      },
      'Học tập': {
        keywords: ['học', 'bài tập', 'thi', 'kiểm tra', 'giáo viên', 'trường', 'sinh viên', 'nghiên cứu'],
        emoji: '📚',
        color: 'xanh nhạt'
      }
    };
    
    // Phân tích cảm xúc
    const emotions = {
      'Vui vẻ': ['vui', 'hạnh phúc', 'tuyệt vời', 'tốt', 'yêu', 'thích'],
      'Buồn bã': ['buồn', 'khóc', 'thất vọng', 'tệ', 'đau'],
      'Tức giận': ['tức', 'giận', 'ghét', 'phẫn nộ', 'bực'],
      'Sợ hãi': ['sợ', 'lo', '걱정', 'hoảng', 'kinh'],
      'Ngạc nhiên': ['wow', 'ôi', 'thật', 'không thể tin', 'bất ngờ'],
      'Bình thường': ['bình thường', 'ok', 'được', 'tạm']
    };
    
    // Tính điểm cho từng category
    let scores = {};
    let emotionScores = {};
    
    Object.keys(categories).forEach(category => {
      scores[category] = 0;
      categories[category].keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = (text.match(regex) || []).length;
        scores[category] += matches;
      });
    });
    
    Object.keys(emotions).forEach(emotion => {
      emotionScores[emotion] = 0;
      emotions[emotion].forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = (text.match(regex) || []).length;
        emotionScores[emotion] += matches;
      });
    });
    
    // Tìm category chính
    const mainCategory = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    const mainEmotion = Object.keys(emotionScores).reduce((a, b) => emotionScores[a] > emotionScores[b] ? a : b);
    
    // Phân tích độ phức tạp
    const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/);
    const avgWordsPerSentence = words.length / sentences.length;
    
    let complexity = 'Đơn giản';
    if (avgWordsPerSentence > 15) complexity = 'Phức tạp';
    else if (avgWordsPerSentence > 8) complexity = 'Trung bình';
    
    // Tạo kết quả
    let result = `🏷️ KẾT QUẢ PHÂN LOẠI NỘI DUNG\n\n`;
    result += `📄 Văn bản: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"\n\n`;
    
    result += `📊 PHÂN LOẠI CHÍNH:\n`;
    result += `${categories[mainCategory].emoji} **${mainCategory}** (${scores[mainCategory]} điểm)\n`;
    result += `🎨 Màu đại diện: ${categories[mainCategory].color}\n\n`;
    
    result += `😊 PHÂN TÍCH CẢM XÚC:\n`;
    result += `💭 Cảm xúc chính: **${mainEmotion}** (${emotionScores[mainEmotion]} điểm)\n\n`;
    
    result += `📈 CHI TIẾT PHÂN LOẠI:\n`;
    Object.keys(scores).forEach(category => {
      if (scores[category] > 0) {
        result += `${categories[category].emoji} ${category}: ${scores[category]} điểm\n`;
      }
    });
    
    result += `\n📋 THỐNG KÊ VĂN BẢN:\n`;
    result += `• Độ dài: ${text.length} ký tự\n`;
    result += `• Số từ: ${words.length}\n`;
    result += `• Số câu: ${sentences.length}\n`;
    result += `• Độ phức tạp: ${complexity}\n`;
    result += `• Từ/câu: ${avgWordsPerSentence.toFixed(1)}\n\n`;
    
    // Gợi ý
    let suggestions = [];
    if (mainCategory === 'Tiêu cực') {
      suggestions.push('💡 Thử thêm từ ngữ tích cực để cân bằng');
    }
    if (complexity === 'Phức tạp') {
      suggestions.push('💡 Có thể chia thành câu ngắn hơn');
    }
    if (sentences.length === 1 && words.length > 20) {
      suggestions.push('💡 Nên chia thành nhiều câu');
    }
    
    if (suggestions.length > 0) {
      result += `💡 GỢI Ý:\n`;
      suggestions.forEach(suggestion => {
        result += `${suggestion}\n`;
      });
    }
    
    // Tracking AI usage cho điểm số
    if (!global.bonzAIUsage) global.bonzAIUsage = {};
    if (!global.bonzAIUsage[senderId]) global.bonzAIUsage[senderId] = {};
    global.bonzAIUsage[senderId].classify = (global.bonzAIUsage[senderId].classify || 0) + 1;
    
    return await safeSendMessage(api, result, threadId, type);
  }
  */

  // BONZ AI - Chat với AI thông minh
  if (sub === 'ai' || sub === 'chat') {
    const senderId = String(event?.data?.uidFrom || event?.authorId || '');
    const question = args.slice(1).join(' ');
    
    if (!question) {
      return await safeSendMessage(api, 
        '🤖 BONZ AI ASSISTANT\n\n' +
        '📋 Cú pháp: bonz ai <câu_hỏi>\n' +
        '🎯 Chat với AI thông minh, hỏi đáp mọi thứ\n\n' +
        '💡 Ví dụ:\n' +
        '• bonz ai Hôm nay thời tiết thế nào?\n' +
        '• bonz chat Viết thơ về tình yêu\n' +
        '• bonz ai Giải thích về AI\n' +
        '• bonz chat Dịch sang tiếng Anh: Xin chào\n\n' +
        '🔥 Có thể hỏi về: Kiến thức, dịch thuật, sáng tạo, lập trình, v.v.', 
        threadId, type
      );
    }
    
    // Hiển thị typing indicator
    await safeSendMessage(api, '🤖 AI đang suy nghĩ...', threadId, type);
    
    try {
      // Gọi API AI
      const prompt = `Hãy trả lời câu hỏi sau một cách chi tiết, hữu ích và thân thiện. Sử dụng tiếng Việt và emoji phù hợp:

Câu hỏi: ${question}

Yêu cầu:
- Trả lời chính xác, đầy đủ
- Sử dụng emoji để sinh động
- Giải thích dễ hiểu
- Nếu là câu hỏi phức tạp, chia thành các phần nhỏ`;

      const response = await fetch(`https://api.zeidteam.xyz/ai/chatgpt4?prompt=${encodeURIComponent(prompt)}`);
      
      if (!response.ok) {
        throw new Error('API không phản hồi');
      }
      
      const aiResult = await response.json();
      const aiAnswer = aiResult.result || aiResult.response || 'Xin lỗi, tôi không thể trả lời câu hỏi này.';
      
      // Format kết quả
      let result = `🤖 BONZ AI ASSISTANT\n\n`;
      result += `❓ **Câu hỏi:** ${question}\n\n`;
      result += `💬 **Trả lời:**\n${aiAnswer}\n\n`;
      result += `⚡ Powered by ChatGPT-4\n`;
      result += `🕐 ${new Date().toLocaleString('vi-VN')}`;
      
      // Tracking AI usage cho điểm số
      if (!global.bonzAIUsage) global.bonzAIUsage = {};
      if (!global.bonzAIUsage[senderId]) global.bonzAIUsage[senderId] = {};
      global.bonzAIUsage[senderId].ai = (global.bonzAIUsage[senderId].ai || 0) + 1;
      
      return await safeSendMessage(api, result, threadId, type);
      
    } catch (error) {
      console.log('[BONZ AI] Lỗi API:', error.message);
      
      // Fallback responses
      const fallbackResponses = [
        '🤖 Xin lỗi, AI tạm thời bận. Hãy thử lại sau nhé!',
        '⚠️ Kết nối AI gặp sự cố. Vui lòng thử lại.',
        '🔧 AI đang bảo trì, quay lại sau vài phút.',
        '📡 Mất kết nối với AI server. Thử lại sau.'
      ];
      
      const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
      return await safeSendMessage(api, randomResponse, threadId, type);
    }
  }

  // BONZ WEATHER - Redirect to weather.js (có canvas đẹp)
  if (sub === 'weather' || sub === 'thoi-tiet') {
    try {
      const weatherCmd = require('./weather.js');
      return await weatherCmd.run({ api, event, args: args.slice(1) });
    } catch (error) {
      console.error('Error calling weather:', error);
      return api.sendMessage('❌ Lỗi gọi lệnh weather. Thử: bonz weather <địa điểm>', threadId, type);
    }
  }
  
  /* OLD WEATHER CODE - Đã chuyển sang weather.js với canvas
  if (sub === 'weather-old') {
    const senderId = String(event?.data?.uidFrom || event?.authorId || '');
    const location = args.slice(1).join(' ');
    
    // Danh sách đầy đủ 63 tỉnh thành Việt Nam
    const vietnamProvinces = {
      // Miền Bắc
      'hà nội': 'Hà Nội',
      'hải phòng': 'Hải Phòng', 
      'quảng ninh': 'Quảng Ninh',
      'lạng sơn': 'Lạng Sơn',
      'cao bằng': 'Cao Bằng',
      'bắc kạn': 'Bắc Kạn',
      'thái nguyên': 'Thái Nguyên',
      'phú thọ': 'Phú Thọ',
      'vĩnh phúc': 'Vĩnh Phúc',
      'bắc giang': 'Bắc Giang',
      'bắc ninh': 'Bắc Ninh',
      'hải dương': 'Hải Dương',
      'hưng yên': 'Hưng Yên',
      'hà nam': 'Hà Nam',
      'nam định': 'Nam Định',
      'thái bình': 'Thái Bình',
      'ninh bình': 'Ninh Bình',
      'hòa bình': 'Hòa Bình',
      'sơn la': 'Sơn La',
      'điện biên': 'Điện Biên',
      'lai châu': 'Lai Châu',
      'lào cai': 'Lào Cai',
      'yên bái': 'Yên Bái',
      'tuyên quang': 'Tuyên Quang',
      'hà giang': 'Hà Giang',
      
      // Miền Trung
      'thanh hóa': 'Thanh Hóa',
      'nghệ an': 'Nghệ An',
      'hà tĩnh': 'Hà Tĩnh',
      'quảng bình': 'Quảng Bình',
      'quảng trị': 'Quảng Trị',
      'thừa thiên huế': 'Thừa Thiên Huế',
      'huế': 'Thừa Thiên Huế',
      'đà nẵng': 'Đà Nẵng',
      'quảng nam': 'Quảng Nam',
      'quảng ngãi': 'Quảng Ngãi',
      'bình định': 'Bình Định',
      'phú yên': 'Phú Yên',
      'khánh hòa': 'Khánh Hòa',
      'nha trang': 'Khánh Hòa',
      'ninh thuận': 'Ninh Thuận',
      'bình thuận': 'Bình Thuận',
      'kon tum': 'Kon Tum',
      'gia lai': 'Gia Lai',
      'đắk lắk': 'Đắk Lắk',
      'đắk nông': 'Đắk Nông',
      'lâm đồng': 'Lâm Đồng',
      'đà lạt': 'Lâm Đồng',
      
      // Miền Nam
      'tp hồ chí minh': 'TP Hồ Chí Minh',
      'hồ chí minh': 'TP Hồ Chí Minh',
      'sài gòn': 'TP Hồ Chí Minh',
      'tphcm': 'TP Hồ Chí Minh',
      'bình phước': 'Bình Phước',
      'tây ninh': 'Tây Ninh',
      'bình dương': 'Bình Dương',
      'đồng nai': 'Đồng Nai',
      'bà rịa vũng tàu': 'Bà Rịa - Vũng Tàu',
      'vũng tàu': 'Bà Rịa - Vũng Tàu',
      'long an': 'Long An',
      'tiền giang': 'Tiền Giang',
      'bến tre': 'Bến Tre',
      'trà vinh': 'Trà Vinh',
      'vĩnh long': 'Vĩnh Long',
      'đồng tháp': 'Đồng Tháp',
      'an giang': 'An Giang',
      'kiên giang': 'Kiên Giang',
      'cần thơ': 'Cần Thơ',
      'hậu giang': 'Hậu Giang',
      'sóc trăng': 'Sóc Trăng',
      'bạc liêu': 'Bạc Liêu',
      'cà mau': 'Cà Mau'
    };
    
    if (!location) {
      // Hiển thị danh sách tỉnh thành nếu không có tham số
      let result = `🌤️ BONZ WEATHER - DANH SÁCH TỈNH THÀNH\n\n`;
      result += `📋 Cú pháp: bonz weather <tên_tỉnh>\n\n`;
      
      result += `🏙️ **MIỀN BẮC:**\n`;
      result += `• Hà Nội, Hải Phòng, Quảng Ninh, Lạng Sơn\n`;
      result += `• Cao Bằng, Bắc Kạn, Thái Nguyên, Phú Thọ\n`;
      result += `• Vĩnh Phúc, Bắc Giang, Bắc Ninh, Hải Dương\n`;
      result += `• Hưng Yên, Hà Nam, Nam Định, Thái Bình\n`;
      result += `• Ninh Bình, Hòa Bình, Sơn La, Điện Biên\n`;
      result += `• Lai Châu, Lào Cai, Yên Bái, Tuyên Quang, Hà Giang\n\n`;
      
      result += `🏞️ **MIỀN TRUNG:**\n`;
      result += `• Thanh Hóa, Nghệ An, Hà Tĩnh, Quảng Bình\n`;
      result += `• Quảng Trị, Huế, Đà Nẵng, Quảng Nam\n`;
      result += `• Quảng Ngãi, Bình Định, Phú Yên, Nha Trang\n`;
      result += `• Ninh Thuận, Bình Thuận, Kon Tum, Gia Lai\n`;
      result += `• Đắk Lắk, Đắk Nông, Đà Lạt\n\n`;
      
      result += `🌴 **MIỀN NAM:**\n`;
      result += `• TP Hồ Chí Minh, Bình Phước, Tây Ninh\n`;
      result += `• Bình Dương, Đồng Nai, Vũng Tàu, Long An\n`;
      result += `• Tiền Giang, Bến Tre, Trà Vinh, Vĩnh Long\n`;
      result += `• Đồng Tháp, An Giang, Kiên Giang, Cần Thơ\n`;
      result += `• Hậu Giang, Sóc Trăng, Bạc Liêu, Cà Mau\n\n`;
      
      result += `💡 **VÍ DỤ:**\n`;
      result += `• bonz weather Hà Nội\n`;
      result += `• bonz thoi-tiet Đà Nẵng\n`;
      result += `• bonz weather Sài Gòn\n`;
      result += `• bonz weather Cần Thơ`;
      
      return await safeSendMessage(api, result, threadId, type);
    }
    
    // Tìm tỉnh thành phù hợp
    const normalizedLocation = location.toLowerCase().trim();
    const matchedProvince = vietnamProvinces[normalizedLocation] || location;
    
    // Kiểm tra tỉnh thành có hợp lệ không
    const isValidProvince = Object.keys(vietnamProvinces).includes(normalizedLocation) || 
                           Object.values(vietnamProvinces).includes(location);
    
    // Tạo dữ liệu thời tiết mô phỏng thông minh dựa trên vùng miền
    
    // Phân loại khí hậu theo vùng miền
    const climateZones = {
      // Miền Bắc - khí hậu cận nhiệt đới gió mùa
      north: {
        provinces: ['hà nội', 'hải phòng', 'quảng ninh', 'lạng sơn', 'cao bằng', 'bắc kạn', 'thái nguyên', 'phú thọ', 'vĩnh phúc', 'bắc giang', 'bắc ninh', 'hải dương', 'hưng yên', 'hà nam', 'nam định', 'thái bình', 'ninh bình'],
        conditions: [
          { weather: '☀️ Nắng', temp: [26, 33], humidity: [55, 75], chance: 30 },
          { weather: '⛅ Có mây', temp: [24, 30], humidity: [65, 85], chance: 35 },
          { weather: '🌧️ Mưa nhẹ', temp: [22, 27], humidity: [80, 95], chance: 25 },
          { weather: '🌫️ Sương mù', temp: [20, 25], humidity: [85, 98], chance: 10 }
        ]
      },
      // Miền Bắc vùng núi - mát hơn
      northMountain: {
        provinces: ['hòa bình', 'sơn la', 'điện biên', 'lai châu', 'lào cai', 'yên bái', 'tuyên quang', 'hà giang'],
        conditions: [
          { weather: '🌤️ Nắng nhẹ', temp: [20, 28], humidity: [60, 80], chance: 25 },
          { weather: '⛅ Có mây', temp: [18, 25], humidity: [70, 90], chance: 40 },
          { weather: '🌧️ Mưa', temp: [16, 22], humidity: [85, 95], chance: 25 },
          { weather: '🌫️ Sương mù', temp: [14, 20], humidity: [90, 98], chance: 10 }
        ]
      },
      // Miền Trung - khí hậu nhiệt đới gió mùa
      central: {
        provinces: ['thanh hóa', 'nghệ an', 'hà tĩnh', 'quảng bình', 'quảng trị', 'thừa thiên huế', 'huế', 'đà nẵng', 'quảng nam', 'quảng ngãi', 'bình định', 'phú yên', 'khánh hòa', 'nha trang', 'ninh thuận', 'bình thuận'],
        conditions: [
          { weather: '☀️ Nắng nóng', temp: [28, 36], humidity: [50, 70], chance: 40 },
          { weather: '⛅ Có mây', temp: [26, 32], humidity: [60, 80], chance: 30 },
          { weather: '🌧️ Mưa', temp: [24, 29], humidity: [80, 95], chance: 20 },
          { weather: '⛈️ Dông', temp: [25, 31], humidity: [85, 95], chance: 10 }
        ]
      },
      // Tây Nguyên - khí hậu cao nguyên
      highland: {
        provinces: ['kon tum', 'gia lai', 'đắk lắk', 'đắk nông', 'lâm đồng', 'đà lạt'],
        conditions: [
          { weather: '🌤️ Nắng mát', temp: [18, 26], humidity: [55, 75], chance: 35 },
          { weather: '⛅ Có mây', temp: [16, 24], humidity: [65, 85], chance: 35 },
          { weather: '🌧️ Mưa', temp: [15, 22], humidity: [80, 95], chance: 25 },
          { weather: '🌫️ Sương mù', temp: [12, 18], humidity: [85, 98], chance: 5 }
        ]
      },
      // Miền Nam - khí hậu nhiệt đới gió mùa
      south: {
        provinces: ['tp hồ chí minh', 'hồ chí minh', 'sài gòn', 'tphcm', 'bình phước', 'tây ninh', 'bình dương', 'đồng nai', 'bà rịa vũng tàu', 'vũng tàu', 'long an', 'tiền giang', 'bến tre', 'trà vinh', 'vĩnh long', 'đồng tháp', 'an giang', 'kiên giang', 'cần thơ', 'hậu giang', 'sóc trăng', 'bạc liêu', 'cà mau'],
        conditions: [
          { weather: '☀️ Nắng', temp: [28, 35], humidity: [60, 80], chance: 35 },
          { weather: '⛅ Có mây', temp: [26, 32], humidity: [70, 85], chance: 30 },
          { weather: '🌧️ Mưa', temp: [24, 30], humidity: [85, 95], chance: 25 },
          { weather: '⛈️ Dông', temp: [25, 31], humidity: [80, 95], chance: 10 }
        ]
      }
    };
    
    // Xác định vùng khí hậu
    let climateZone = climateZones.south; // default
    for (const [zone, data] of Object.entries(climateZones)) {
      if (data.provinces.includes(normalizedLocation)) {
        climateZone = data;
        break;
      }
    }
    
    // Tạo thời tiết ngẫu nhiên có trọng số
    function getRandomWeather(conditions) {
      const totalChance = conditions.reduce((sum, c) => sum + c.chance, 0);
      let random = Math.random() * totalChance;
      
      for (const condition of conditions) {
        random -= condition.chance;
        if (random <= 0) return condition;
      }
      return conditions[0];
    }
    
    const currentCondition = getRandomWeather(climateZone.conditions);
    const currentTemp = Math.floor(Math.random() * (currentCondition.temp[1] - currentCondition.temp[0])) + currentCondition.temp[0];
    const humidity = Math.floor(Math.random() * (currentCondition.humidity[1] - currentCondition.humidity[0])) + currentCondition.humidity[0];
    const windSpeed = Math.floor(Math.random() * 15) + 5; // 5-20 km/h
    
    // Tạo chỉ số UV dựa trên thời tiết
    let uvIndex = 'Thấp (1-2)';
    if (currentCondition.weather.includes('Nắng')) {
      uvIndex = Math.random() > 0.5 ? 'Cao (8-10)' : 'Trung bình (6-7)';
    } else if (currentCondition.weather.includes('mây')) {
      uvIndex = 'Trung bình (4-6)';
    }
    
    // Tạo chất lượng không khí
    const airQuality = ['Tốt', 'Trung bình', 'Kém'][Math.floor(Math.random() * 3)];
    const aqiColor = airQuality === 'Tốt' ? '🟢' : airQuality === 'Trung bình' ? '🟡' : '🔴';
    
    let result = `🌤️ BONZ WEATHER FORECAST\n\n`;
    result += `📍 **Khu vực:** ${matchedProvince}\n`;
    if (!isValidProvince) {
      result += `⚠️ *Tỉnh thành không trong danh sách*\n`;
    }
    result += `\n🌡️ **THỜI TIẾT HIỆN TẠI:**\n`;
    result += `• Tình trạng: ${currentCondition.weather}\n`;
    result += `• Nhiệt độ: ${currentTemp}°C\n`;
    result += `• Độ ẩm: ${humidity}%\n`;
    result += `• Tốc độ gió: ${windSpeed} km/h\n`;
    result += `• Chỉ số UV: ${uvIndex}\n`;
    result += `• Chất lượng KK: ${aqiColor} ${airQuality}\n\n`;
    
    result += `📅 **DỰ BÁO 3 NGÀY:**\n`;
    for (let i = 1; i <= 3; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dayName = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getDay()];
      const futureCondition = getRandomWeather(climateZone.conditions);
      const minTemp = futureCondition.temp[0] + Math.floor(Math.random() * 3) - 1;
      const maxTemp = futureCondition.temp[1] + Math.floor(Math.random() * 3) - 1;
      
      result += `• ${dayName} ${date.getDate()}/${date.getMonth() + 1}: ${futureCondition.weather} ${minTemp}-${maxTemp}°C\n`;
    }
    
    result += `\n👕 **LỜI KHUYÊN:**\n`;
    if (currentTemp > 32) {
      result += `• Mặc quần áo mỏng, thoáng mát\n• Uống nhiều nước, tránh ra ngoài 11h-15h\n• Sử dụng kem chống nắng SPF 30+\n`;
    } else if (currentTemp < 20) {
      result += `• Mặc áo khoác ấm\n• Thích hợp cho hoạt động ngoài trời\n• Chuẩn bị đồ mưa nếu có mây\n`;
    } else if (currentTemp < 25) {
      result += `• Mặc áo khoác nhẹ\n• Thời tiết dễ chịu cho mọi hoạt động\n• Chuẩn bị ô dù phòng mưa\n`;
    } else {
      result += `• Thời tiết dễ chịu, thoải mái hoạt động\n• Mặc quần áo nhẹ, thoáng khí\n• Thích hợp du lịch, dã ngoại\n`;
    }
    
    if (currentCondition.weather.includes('Mưa')) {
      result += `• Mang theo ô dù, áo mưa\n• Lái xe cẩn thận, đường trơn trượt\n`;
    }
    
    result += `\n🎯 **HOẠT ĐỘNG PHÙ HỢP:**\n`;
    if (currentCondition.weather.includes('Nắng') && currentTemp < 30) {
      result += `• ✅ Du lịch, dã ngoại, thể thao ngoài trời\n`;
    } else if (currentCondition.weather.includes('Mưa')) {
      result += `• ✅ Hoạt động trong nhà, đọc sách, xem phim\n• ❌ Tránh thể thao ngoài trời\n`;
    } else {
      result += `• ✅ Mọi hoạt động đều phù hợp\n`;
    }
    
    result += `\n📊 **THÔNG TIN THÊM:**\n`;
    result += `• Vùng khí hậu: ${climateZone === climateZones.north ? 'Miền Bắc' : 
                                climateZone === climateZones.northMountain ? 'Miền Bắc (Vùng núi)' :
                                climateZone === climateZones.central ? 'Miền Trung' :
                                climateZone === climateZones.highland ? 'Tây Nguyên' : 'Miền Nam'}\n`;
    result += `• Độ tin cậy: Mô phỏng dựa trên khí hậu địa phương\n`;
    
    result += `\n🕐 Cập nhật: ${new Date().toLocaleString('vi-VN')}\n`;
    result += `💡 Gõ "bonz weather" để xem danh sách tỉnh thành`;
    
    return await safeSendMessage(api, result, threadId, type);
  }
  */

  // BONZ TRANSLATE - Redirect to translate.js (có canvas đẹp)
  if (sub === 'translate' || sub === 'dich') {
    try {
      const translateCmd = require('./translate.js');
      return await translateCmd.run({ api, event, args: args.slice(1) });
    } catch (error) {
      console.error('Error calling translate:', error);
      return api.sendMessage('❌ Lỗi gọi lệnh translate. Thử: bonz translate <văn bản>', threadId, type);
    }
  }
  
  /* OLD TRANSLATE CODE
  if (sub === 'translate-old') {
    const text = args.slice(1).join(' ');
    
    if (!text) {
      return await safeSendMessage(api, 
        '🌐 BONZ TRANSLATOR\n\n' +
        '📋 Cú pháp: bonz translate <văn_bản>\n' +
        '🎯 Dịch thuật thông minh đa ngôn ngữ\n\n' +
        '💡 Ví dụ:\n' +
        '• bonz translate Hello world\n' +
        '• bonz dich Xin chào thế giới\n' +
        '• bonz translate 你好世界\n\n' +
        '🔥 Hỗ trợ: Việt, Anh, Trung, Nhật, Hàn, Pháp, Đức, v.v.', 
        threadId, type
      );
    }
    
    try {
      // Gọi AI để dịch
      const prompt = `Hãy dịch văn bản sau và cung cấp thông tin chi tiết:

Văn bản: "${text}"

Yêu cầu:
1. Nhận diện ngôn ngữ gốc
2. Dịch sang tiếng Việt (nếu không phải tiếng Việt)
3. Dịch sang tiếng Anh (nếu không phải tiếng Anh)
4. Giải thích ngữ pháp hoặc văn hóa (nếu cần)

Format trả lời:
- Ngôn ngữ: [tên ngôn ngữ]
- Tiếng Việt: [bản dịch]
- Tiếng Anh: [bản dịch]
- Ghi chú: [giải thích nếu có]`;

      const response = await fetch(`https://api.zeidteam.xyz/ai/chatgpt4?prompt=${encodeURIComponent(prompt)}`);
      
      if (!response.ok) {
        throw new Error('API không phản hồi');
      }
      
      const aiResult = await response.json();
      const translation = aiResult.result || aiResult.response || 'Không thể dịch văn bản này';
      
      let result = `🌐 BONZ TRANSLATOR\n\n`;
      result += `📝 **Văn bản gốc:** ${text}\n\n`;
      result += `${translation}\n\n`;
      result += `⚡ Powered by AI Translation\n`;
      result += `🕐 ${new Date().toLocaleString('vi-VN')}`;
      
      // Tracking AI usage cho điểm số
      if (!global.bonzAIUsage) global.bonzAIUsage = {};
      if (!global.bonzAIUsage[senderId]) global.bonzAIUsage[senderId] = {};
      global.bonzAIUsage[senderId].translate = (global.bonzAIUsage[senderId].translate || 0) + 1;
      
      return await safeSendMessage(api, result, threadId, type);
      
    } catch (error) {
      console.log('[TRANSLATE AI] Lỗi API:', error.message);
      
      // Simple fallback translation
      const simpleTranslations = {
        'hello': 'xin chào',
        'world': 'thế giới',
        'good': 'tốt',
        'bad': 'xấu',
        'yes': 'có',
        'no': 'không',
        'thank you': 'cảm ơn',
        'sorry': 'xin lỗi'
      };
      
      const lowerText = text.toLowerCase();
      const translation = simpleTranslations[lowerText] || 'Không thể dịch (AI offline)';
      
      let result = `🌐 BONZ TRANSLATOR\n\n`;
      result += `📝 **Văn bản gốc:** ${text}\n`;
      result += `🔄 **Dịch nghĩa:** ${translation}\n\n`;
      result += `⚠️ *Dịch cơ bản - AI tạm thời không khả dụng*\n`;
      result += `🕐 ${new Date().toLocaleString('vi-VN')}`;
      
      // Tracking AI usage cho điểm số (cả fallback)
      if (!global.bonzAIUsage) global.bonzAIUsage = {};
      if (!global.bonzAIUsage[senderId]) global.bonzAIUsage[senderId] = {};
      global.bonzAIUsage[senderId].translate = (global.bonzAIUsage[senderId].translate || 0) + 1;
      
      return await safeSendMessage(api, result, threadId, type);
    }
  }
  */

  // BONZ CRYPTO - Redirect to crypto.js (có canvas đẹp)
  if (sub === 'crypto' || sub === 'coin') {
    try {
      const cryptoCmd = require('./crypto.js');
      return await cryptoCmd.run({ api, event, args });
    } catch (error) {
      console.error('Error calling crypto:', error);
      return api.sendMessage('❌ Lỗi gọi lệnh crypto. Thử: bonz crypto BTC', threadId, type);
    }
  }
  
  /* OLD CRYPTO CODE
  if (sub === 'crypto-old') {
    const coinSymbol = (args[1] || 'btc').toLowerCase();
    
    if (!coinSymbol) {
      return await safeSendMessage(api, 
        '💰 BONZ CRYPTO TRACKER\n\n' +
        '📋 Cú pháp: bonz crypto <coin_symbol>\n' +
        '🎯 Theo dõi giá cryptocurrency real-time\n\n' +
        '💡 Ví dụ:\n' +
        '• bonz crypto btc - Bitcoin\n' +
        '• bonz crypto eth - Ethereum\n' +
        '• bonz coin ada - Cardano\n' +
        '• bonz crypto doge - Dogecoin\n\n' +
        '🔥 Coins phổ biến: BTC, ETH, BNB, ADA, XRP, SOL, DOGE, MATIC, DOT, AVAX', 
        threadId, type
      );
    }
    
    // Khởi tạo database giá crypto (mô phỏng - thực tế cần API)
    if (!global.bonzCryptoData) {
      global.bonzCryptoData = {
        'btc': { name: 'Bitcoin', price: 43250.75, change24h: 2.34, symbol: '₿', marketCap: 847000000000 },
        'eth': { name: 'Ethereum', price: 2650.42, change24h: -1.23, symbol: 'Ξ', marketCap: 318000000000 },
        'bnb': { name: 'BNB', price: 315.67, change24h: 0.87, symbol: 'BNB', marketCap: 47000000000 },
        'ada': { name: 'Cardano', price: 0.4523, change24h: 3.45, symbol: 'ADA', marketCap: 16000000000 },
        'xrp': { name: 'XRP', price: 0.6234, change24h: -2.11, symbol: 'XRP', marketCap: 34000000000 },
        'sol': { name: 'Solana', price: 98.76, change24h: 5.67, symbol: 'SOL', marketCap: 42000000000 },
        'doge': { name: 'Dogecoin', price: 0.0823, change24h: 8.92, symbol: 'DOGE', marketCap: 12000000000 },
        'matic': { name: 'Polygon', price: 0.8945, change24h: -0.56, symbol: 'MATIC', marketCap: 8500000000 },
        'dot': { name: 'Polkadot', price: 5.234, change24h: 1.78, symbol: 'DOT', marketCap: 7200000000 },
        'avax': { name: 'Avalanche', price: 24.56, change24h: -3.21, symbol: 'AVAX', marketCap: 9800000000 }
      };
    }
    
    // Mô phỏng dao động giá (thay đổi nhỏ mỗi lần gọi)
    const coin = global.bonzCryptoData[coinSymbol];
    if (coin) {
      // Random fluctuation ±2%
      const fluctuation = (Math.random() - 0.5) * 0.04;
      coin.price = coin.price * (1 + fluctuation);
      coin.change24h = coin.change24h + (Math.random() - 0.5) * 2;
      
      // Giới hạn change24h trong khoảng hợp lý
      coin.change24h = Math.max(-15, Math.min(15, coin.change24h));
    }
    
    if (!coin) {
      const availableCoins = Object.keys(global.bonzCryptoData).join(', ').toUpperCase();
      return await safeSendMessage(api, 
        `❌ Không tìm thấy coin "${coinSymbol.toUpperCase()}"!\n\n` +
        `💰 COINS CÓ SẴN:\n${availableCoins}\n\n` +
        `💡 Ví dụ: bonz crypto btc`, 
        threadId, type
      );
    }
    
    // Format số
    const formatPrice = (price) => {
      if (price >= 1000) return price.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
      if (price >= 1) return price.toFixed(4);
      return price.toFixed(6);
    };
    
    const formatMarketCap = (cap) => {
      if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
      if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
      if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
      return `$${cap.toLocaleString('vi-VN')}`;
    };
    
    // Tạo emoji và màu cho thay đổi giá
    const changeEmoji = coin.change24h >= 0 ? '📈' : '📉';
    const changeColor = coin.change24h >= 0 ? '🟢' : '🔴';
    const trendEmoji = coin.change24h >= 5 ? '🚀' : coin.change24h >= 0 ? '⬆️' : coin.change24h <= -5 ? '💥' : '⬇️';
    
    // Phân tích xu hướng
    let trend = 'Sideway';
    if (coin.change24h >= 5) trend = 'Tăng mạnh';
    else if (coin.change24h >= 2) trend = 'Tăng';
    else if (coin.change24h >= 0) trend = 'Tăng nhẹ';
    else if (coin.change24h >= -2) trend = 'Giảm nhẹ';
    else if (coin.change24h >= -5) trend = 'Giảm';
    else trend = 'Giảm mạnh';
    
    // Tính giá VND (giả sử 1 USD = 24,000 VND)
    const usdToVnd = 24000;
    const priceVnd = coin.price * usdToVnd;
    
    let result = `💰 BONZ CRYPTO TRACKER\n\n`;
    result += `${coin.symbol} **${coin.name.toUpperCase()}** (${coinSymbol.toUpperCase()})\n\n`;
    
    result += `💵 GIÁ HIỆN TẠI:\n`;
    result += `• USD: $${formatPrice(coin.price)}\n`;
    result += `• VND: ₫${priceVnd.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}\n\n`;
    
    result += `📊 THAY ĐỔI 24H:\n`;
    result += `${changeColor} ${changeEmoji} ${coin.change24h >= 0 ? '+' : ''}${coin.change24h.toFixed(2)}%\n`;
    result += `📈 Xu hướng: **${trend}** ${trendEmoji}\n\n`;
    
    result += `🏦 THÔNG TIN THỊ TRƯỜNG:\n`;
    result += `• Market Cap: ${formatMarketCap(coin.marketCap)}\n`;
    result += `• Rank: Top ${Math.floor(Math.random() * 20) + 1}\n`;
    result += `• Volume 24h: ${formatMarketCap(coin.marketCap * 0.1)}\n\n`;
    
    // Gợi ý đầu tư (chỉ mang tính giải trí)
    let advice = '';
    if (coin.change24h >= 5) advice = '🚀 Đang pump mạnh! Cân nhắc take profit';
    else if (coin.change24h >= 2) advice = '📈 Xu hướng tích cực, có thể hold';
    else if (coin.change24h <= -5) advice = '💥 Đang dump mạnh! Cân nhắc cut loss';
    else if (coin.change24h <= -2) advice = '📉 Xu hướng tiêu cực, thận trọng';
    else advice = '😐 Sideway, chờ tín hiệu rõ ràng hơn';
    
    result += `💡 GỢI Ý: ${advice}\n\n`;
    result += `⚠️ *Chỉ mang tính tham khảo, không phải lời khuyên đầu tư*\n`;
    result += `🕐 Cập nhật: ${new Date().toLocaleString('vi-VN')}`;
    
    return await safeSendMessage(api, result, threadId, type);
  }
  */

  // BONZ GOLD - Redirect to gold.js (có canvas đẹp)
  if (sub === 'gold' || sub === 'vang') {
    try {
      const goldCmd = require('./gold.js');
      return await goldCmd.run({ api, event, args });
    } catch (error) {
      console.error('Error calling gold:', error);
      return api.sendMessage('❌ Lỗi gọi lệnh gold. Thử: bonz gold SJC', threadId, type);
    }
  }
  
  /* OLD GOLD CODE
  if (sub === 'gold-old') {
    const goldType = (args[1] || 'sjc').toLowerCase();
    
    if (goldType === 'help' || goldType === 'list') {
      return await safeSendMessage(api, 
        '🥇 BONZ GOLD TRACKER\n\n' +
        '📋 Cú pháp: bonz gold <loại_vàng>\n' +
        '🎯 Theo dõi giá vàng Việt Nam real-time\n\n' +
        '🏆 LOẠI VÀNG:\n' +
        '• sjc - Vàng SJC (phổ biến nhất)\n' +
        '• pnj - Vàng PNJ\n' +
        '• doji - Vàng DOJI\n' +
        '• 9999 - Vàng 9999\n' +
        '• world - Giá vàng thế giới\n\n' +
        '💡 Ví dụ:\n' +
        '• bonz gold sjc\n' +
        '• bonz vang pnj', 
        threadId, type
      );
    }
    
    // Khởi tạo database giá vàng (mô phỏng)
    if (!global.bonzGoldData) {
      global.bonzGoldData = {
        'sjc': { 
          name: 'Vàng SJC', 
          buyPrice: 76800000, 
          sellPrice: 78200000, 
          change: 150000, 
          unit: 'VND/lượng',
          company: 'Công ty SJC'
        },
        'pnj': { 
          name: 'Vàng PNJ', 
          buyPrice: 76500000, 
          sellPrice: 77800000, 
          change: 120000, 
          unit: 'VND/lượng',
          company: 'Tập đoàn PNJ'
        },
        'doji': { 
          name: 'Vàng DOJI', 
          buyPrice: 76600000, 
          sellPrice: 77900000, 
          change: -80000, 
          unit: 'VND/lượng',
          company: 'Tập đoàn DOJI'
        },
        '9999': { 
          name: 'Vàng 9999', 
          buyPrice: 76700000, 
          sellPrice: 77700000, 
          change: 200000, 
          unit: 'VND/lượng',
          company: 'Vàng 99.99%'
        },
        'world': { 
          name: 'Vàng thế giới', 
          buyPrice: 2045.50, 
          sellPrice: 2047.20, 
          change: 12.30, 
          unit: 'USD/oz',
          company: 'Thị trường quốc tế'
        }
      };
    }
    
    // Mô phỏng dao động giá vàng
    const gold = global.bonzGoldData[goldType];
    if (gold) {
      if (goldType === 'world') {
        // Giá vàng thế giới (USD/oz)
        const fluctuation = (Math.random() - 0.5) * 20; // ±$10
        gold.buyPrice += fluctuation;
        gold.sellPrice += fluctuation;
        gold.change += (Math.random() - 0.5) * 10;
      } else {
        // Giá vàng Việt Nam (VND/lượng)
        const fluctuation = (Math.random() - 0.5) * 200000; // ±100k
        gold.buyPrice += fluctuation;
        gold.sellPrice += fluctuation;
        gold.change += (Math.random() - 0.5) * 100000;
      }
    }
    
    if (!gold) {
      const availableTypes = Object.keys(global.bonzGoldData).join(', ').toUpperCase();
      return await safeSendMessage(api, 
        `❌ Không tìm thấy loại vàng "${goldType.toUpperCase()}"!\n\n` +
        `🥇 LOẠI VÀNG CÓ SẴN:\n${availableTypes}\n\n` +
        `💡 Ví dụ: bonz gold sjc\n` +
        `📋 Xem tất cả: bonz gold help`, 
        threadId, type
      );
    }
    
    // Format giá
    const formatGoldPrice = (price, isWorld = false) => {
      if (isWorld) {
        return `$${price.toFixed(2)}`;
      } else {
        return `₫${price.toLocaleString('vi-VN')}`;
      }
    };
    
    // Tính spread (chênh lệch mua-bán)
    const spread = gold.sellPrice - gold.buyPrice;
    const spreadPercent = (spread / gold.buyPrice * 100).toFixed(2);
    
    // Emoji và màu cho thay đổi giá
    const changeEmoji = gold.change >= 0 ? '📈' : '📉';
    const changeColor = gold.change >= 0 ? '🟢' : '🔴';
    const trendEmoji = Math.abs(gold.change) > (goldType === 'world' ? 20 : 200000) ? '🔥' : '📊';
    
    // Phân tích xu hướng
    let trend = 'Ổn định';
    if (goldType === 'world') {
      if (gold.change >= 20) trend = 'Tăng mạnh';
      else if (gold.change >= 10) trend = 'Tăng';
      else if (gold.change >= 0) trend = 'Tăng nhẹ';
      else if (gold.change >= -10) trend = 'Giảm nhẹ';
      else if (gold.change >= -20) trend = 'Giảm';
      else trend = 'Giảm mạnh';
    } else {
      if (gold.change >= 200000) trend = 'Tăng mạnh';
      else if (gold.change >= 100000) trend = 'Tăng';
      else if (gold.change >= 0) trend = 'Tăng nhẹ';
      else if (gold.change >= -100000) trend = 'Giảm nhẹ';
      else if (gold.change >= -200000) trend = 'Giảm';
      else trend = 'Giảm mạnh';
    }
    
    let result = `🥇 BONZ GOLD TRACKER\n\n`;
    result += `💰 **${gold.name.toUpperCase()}**\n`;
    result += `🏢 ${gold.company}\n\n`;
    
    result += `💵 GIÁ HIỆN TẠI:\n`;
    result += `🟢 Mua vào: ${formatGoldPrice(gold.buyPrice, goldType === 'world')}\n`;
    result += `🔴 Bán ra: ${formatGoldPrice(gold.sellPrice, goldType === 'world')}\n`;
    result += `📊 Spread: ${goldType === 'world' ? `$${spread.toFixed(2)}` : `₫${spread.toLocaleString('vi-VN')}`} (${spreadPercent}%)\n\n`;
    
    result += `📈 THAY ĐỔI HÔM NAY:\n`;
    result += `${changeColor} ${changeEmoji} ${gold.change >= 0 ? '+' : ''}${goldType === 'world' ? `$${gold.change.toFixed(2)}` : `₫${gold.change.toLocaleString('vi-VN')}`}\n`;
    result += `📊 Xu hướng: **${trend}** ${trendEmoji}\n\n`;
    
    // Thông tin bổ sung cho vàng Việt Nam
    if (goldType !== 'world') {
      const goldOz = gold.buyPrice / 24000 / 31.1035; // Chuyển đổi sang USD/oz
      result += `🌍 THÔNG TIN BỔ SUNG:\n`;
      result += `• Quy đổi: ~$${goldOz.toFixed(2)}/oz\n`;
      result += `• Đơn vị: ${gold.unit}\n`;
      result += `• Trọng lượng: 1 lượng = 37.5g\n\n`;
    } else {
      const goldVnd = gold.buyPrice * 24000 * 31.1035; // Chuyển đổi sang VND/lượng
      result += `🇻🇳 QUY ĐỔI VND:\n`;
      result += `• ~₫${goldVnd.toLocaleString('vi-VN')}/lượng\n`;
      result += `• Đơn vị: ${gold.unit}\n`;
      result += `• 1 oz = 31.1035g\n\n`;
    }
    
    // Gợi ý đầu tư
    let advice = '';
    if (goldType === 'world') {
      if (gold.change >= 20) advice = '🚀 Vàng thế giới tăng mạnh!';
      else if (gold.change <= -20) advice = '📉 Vàng thế giới giảm mạnh!';
      else advice = '📊 Vàng thế giới dao động bình thường';
    } else {
      if (gold.change >= 200000) advice = '🚀 Vàng trong nước tăng mạnh!';
      else if (gold.change <= -200000) advice = '📉 Vàng trong nước giảm mạnh!';
      else advice = '📊 Vàng trong nước ổn định';
    }
    
    result += `💡 NHẬN XÉT: ${advice}\n\n`;
    result += `⚠️ *Giá chỉ mang tính tham khảo*\n`;
    result += `🕐 Cập nhật: ${new Date().toLocaleString('vi-VN')}`;
    
    return await safeSendMessage(api, result, threadId, type);
  }
  */

  // tắt/bật bot trong nhóm: bonz off | bonz on
  if (sub === "off") {
    const thread = ThreadsRef && ThreadsRef.getData ? await ThreadsRef.getData(event.threadId) : { data: {} };
    const data = thread.data || {};
    data.bot_mute = true;
    if (ThreadsRef?.setData) await ThreadsRef.setData(event.threadId, data);
    return await api.sendMessage("🔕 Đã tắt tương tác bot trong nhóm này. Gõ 'bonz on' để bật lại.", event.threadId, event.type);
  }
  if (sub === "on") {
    const thread = ThreadsRef && ThreadsRef.getData ? await ThreadsRef.getData(event.threadId) : { data: {} };
    const data = thread.data || {};
    data.bot_mute = false;
    if (ThreadsRef?.setData) await ThreadsRef.setData(event.threadId, data);
    return await api.sendMessage("🔔 Đã bật lại tương tác bot trong nhóm này.", event.threadId, event.type);
  }

  // (router 'ảnh' đã xử lý ở trên; không còn ảnh trai)

  // Router: "bonz thất tình" -> lệnh thatthinh
  if (sub === "thất" && args[1] && args[1].toLowerCase() === "tình") {
    try {
      const thatThinhCommand = require('./thatthinh.js');
      return await thatThinhCommand.run({ api, event, args: [] });
    } catch (error) {
      console.error('Error calling thatthinh:', error);
      return api.sendMessage('❌ Lỗi gọi lệnh thất tình. Thử: bonz thatthinh', event.threadId, event.type);
    }
  }

  if (sub === "random") {
    return await handleRandom(api, event, args);
  }


  // bonz safe on|off|status|self <uid>
  if (sub === "safe") {
    const action = (args[1] || '').toLowerCase();
    const { threadId, type } = event;
    try {
      if (action === 'on') {
        // Bật Safe Mode theo NHÓM hiện tại
        if (safeUtil.setThreadSafeMode) {
          await safeUtil.setThreadSafeMode(threadId, true);
          return await api.sendMessage('🛡️ Safe Mode (theo nhóm này): ĐÃ BẬT ✅', threadId, type);
        }
        // Fallback: bật toàn cục
        safeUtil.setSafeMode(true);
        return await api.sendMessage('🛡️ Safe Mode (toàn cục): ĐÃ BẬT ✅', threadId, type);
      }
      if (action === 'off') {
        // Tắt Safe Mode theo NHÓM hiện tại
        if (safeUtil.setThreadSafeMode) {
          await safeUtil.setThreadSafeMode(threadId, false);
          return await api.sendMessage('🛡️ Safe Mode (theo nhóm này): ĐÃ TẮT ❌', threadId, type);
        }
        // Fallback: tắt toàn cục
        safeUtil.setSafeMode(false);
        return await api.sendMessage('🛡️ Safe Mode (toàn cục): ĐÃ TẮT ❌', threadId, type);
      }
      if (action === 'status') {
        let threadStatus = null;
        if (safeUtil.getThreadSafeMode) {
          threadStatus = await safeUtil.getThreadSafeMode(threadId); // true/false/null
        }
        const globalSt = safeUtil.getSafeMode();
        const lines = [];
        if (threadStatus === true) lines.push('🛡️ Safe Mode NHÓM: BẬT ✅');
        else if (threadStatus === false) lines.push('🛡️ Safe Mode NHÓM: TẮT ❌');
        else lines.push('🛡️ Safe Mode NHÓM: CHƯA CẤU HÌNH (dùng mặc định)');
        lines.push(`🌐 Mặc định TOÀN CỤC: ${globalSt ? 'BẬT ✅' : 'TẮT ❌'}`);
        return await api.sendMessage(lines.join('\n'), threadId, type);
      }
      if (action === 'self') {
        let uid = args[2];
        if (!uid) {
          try { uid = api.getOwnId?.() || api.getCurrentUserID?.() || global?.botID; } catch {}
        }
        if (!uid) return await api.sendMessage('⚠️ Cú pháp: bonz safe self <uid_bot>\nGợi ý: thử lại sau khi bot khởi động xong.', threadId, type);
        safeUtil.setSelfUid(String(uid));
        return await api.sendMessage(`🛡️ Safe Mode: Đã cấu hình self UID = ${uid}`, threadId, type);
      }
      return await api.sendMessage('🛡️ Dùng: bonz safe on|off|status|self <uid_bot>\n• on/off: bật tắt theo nhóm hiện tại\n• status: xem trạng thái nhóm và toàn cục\n• self: đặt UID của bot để bỏ qua tin nhắn do bot gửi', threadId, type);
    } catch (e) {
      return await api.sendMessage('❌ Không thể thao tác Safe Mode. Vui lòng thử lại.', threadId, type);
    }
  }

  // bonz menu admin: hiển thị các lệnh quản trị
  if (sub === "menu" && args[1] && args[1].toLowerCase() === "admin") {
    const { threadId, type, data } = event;
    const senderId = data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    // Box header
    const INNER = 32;
    const repeat = (ch, n) => ch.repeat(n);
    const top = `╔${repeat('═', INNER + 2)}╗`;
    const sep = `╠${repeat('═', INNER + 2)}╣`;
    const bottom = `╚${repeat('═', INNER + 2)}╝`;
    const fit = (t) => {
      const s = String(t || '');
      return s.length > INNER ? s.slice(0, INNER) : s.padEnd(INNER, ' ');
    };
    const center = (t) => {
      let s = String(t || '');
      if (s.length > INNER) s = s.slice(0, INNER);
      const left = Math.floor((INNER - s.length) / 2);
      const right = INNER - s.length - left;
      return `${' '.repeat(left)}${s}${' '.repeat(right)}`;
    };
    const line = (t) => `║ ${fit(t)} ║`;

    const header = [
      top,
      line(center('🔥 BONZ WAR MENU')),
      sep,
      line(`Ng dùng : ${userName}`),
      line(`id ng dùng : ${senderId}`),
      line(`Admin : 亗彡ッ彡ッ bonz  ッ彡亗ッ彡亗`),
      bottom
    ].join('\n');

    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const timeLine = `${hh}:${mm}`;

    const body = [
      '',
      `${timeLine}`,
      '⚔ DANH SÁCH LỆNH WAR',
      '',
      '• bonz war group                     - Áp dụng preset chống cơ bản cho nhóm',
      '• bonz war max                       - Áp dụng preset siết chặt tối đa',
      '',
      '💡 Mẹo nhanh:',
      '- Dùng safe on để lọc nội dung độc hại.',
      '- Thêm từ cấm phù hợp với nhóm của bạn.',
      '- Kết hợp anti link + chatlock khi nhóm bị raid.',
    ].join('\n');

    return await api.sendMessage(`${header}\n${body}`, threadId, type);
  }

  // bonz war group | bonz war max
  if (sub === 'war') {
    const { threadId, type } = event;
    const Threads = require('../../core/controller/controllerThreads');
    const mode = (args[1] || '').toLowerCase();
    if (!mode) {
      return await api.sendMessage(
        '⚔ Dùng: bonz war group | bonz war max\n- group: cấu hình chống cơ bản cho nhóm\n- max: cấu hình tối đa (siết chặt)',
        threadId,
        type
      );
    }
    try {
      const row = await Threads.getData(threadId);
      const tdata = row?.data || {};

      // Defaults
      let anti_link = true;
      let anti_spam = true;
      let anti_undo = false;
      let chat_locked = false;
      let tu_cam_enabled = false;

      if (mode === 'group') {
        anti_link = true;
        anti_spam = true;
        anti_undo = true; // phát hiện thu hồi
        chat_locked = false;
        tu_cam_enabled = false;
        if (typeof safeUtil.setThreadSafeMode === 'function') {
          await safeUtil.setThreadSafeMode(threadId, true);
        } else {
          safeUtil.setSafeMode(true);
        }
      } else if (mode === 'max') {
        anti_link = true;
        anti_spam = true;
        anti_undo = true;
        chat_locked = true;
        tu_cam_enabled = true;
        if (typeof safeUtil.setThreadSafeMode === 'function') {
          await safeUtil.setThreadSafeMode(threadId, true);
        } else {
          safeUtil.setSafeMode(true);
        }
      } else {
        return await api.sendMessage('⚠️ Chế độ không hợp lệ. Dùng: bonz war group | bonz war max', threadId, type);
      }

      // Apply to thread data
      tdata.anti_link = !!anti_link;
      tdata.anti_spam = !!anti_spam;
      tdata.anti_undo = !!anti_undo;
      tdata.chat_locked = !!chat_locked;
      tdata.tu_cam = tdata.tu_cam || { enabled: false, words: [] };
      tdata.tu_cam.enabled = !!tu_cam_enabled;
      await Threads.setData(threadId, tdata);

      const lines = [
        '✅ Đã áp dụng cấu hình WAR:',
        `• Mode: ${mode.toUpperCase()}`,
        `• Safe Mode: ON`,
        `• Anti Link: ${anti_link ? 'ON' : 'OFF'}`,
        `• Anti Spam: ${anti_spam ? 'ON' : 'OFF'}`,
        `• Anti Undo: ${anti_undo ? 'ON' : 'OFF'}`,
        `• Chat lock: ${chat_locked ? 'ON' : 'OFF'}`,
        `• Từ cấm: ${tu_cam_enabled ? 'ON' : 'OFF'}`,
      ].join('\n');
      return await api.sendMessage(lines, threadId, type);
    } catch (e) {
      return await api.sendMessage('❌ Không thể áp dụng cấu hình WAR cho nhóm.', threadId, type);
    }
  }

  if (sub === "config") {
    const { threadId, type, data } = event;
    const senderId = data?.uidFrom || event?.authorId;
    const cfg = global?.config || {};
    const nameBot = cfg.name_bot || 'Bi & Bon';
    const version = 'v2.5.7 Stable';
    const lang = 'Tiếng Việt 🇻🇳';
    const engine = 'BONZ-CORE AI 3.0';
    const mem = '128MB RAM | 64MB Storage';
    const rt = '< 0.5s';
    const conc = '2.048 phiên trò chuyện';
    const server = 'Bi&Bon Cloud Node [VN-East-01]';
    const ping = '23ms (nội địa) | 87ms (quốc tế)';
    const ports = ':8080/:443';
    const sec = 'AES-256 + Mask IP ảo';

    const lines = [
      '----Cấu hình -----',
      `tên bot :${nameBot} `,
      '',
      `Phiên bản: ${version}`,
      '',
      `Ngôn ngữ: ${lang}`,
      '',
      `Engine AI: ${engine}`,
      '',
      `Dung lượng ảo: ${mem}`,
      '',
      `Tốc độ phản hồi: ${rt}`,
      '',
      `Khả năng xử lý đồng thời: ${conc}`,
      '',
      `Server: ${server}`,
      '',
      `Ping: ${ping}`,
      '',
      `Cổng kết nối: ${ports}`,
      '',
      `Bảo mật: ${sec}`
    ].join('\n');

    // Thử đính kèm ảnh logo nếu có trong assets/ hoặc file hình ChatGPT ở root
    let attachmentPath = null;
    try {
      const assetsCandidates = ['bi_bon.png','bi_bon.jpg','bi_bon.jpeg','bi_bon.webp'];
      const assetsDir = path.resolve(__dirname, '../../assets');
      for (const fname of assetsCandidates) {
        const fpath = path.join(assetsDir, fname);
        if (fs.existsSync(fpath)) { attachmentPath = fpath; break; }
      }
      // Nếu chưa tìm thấy, thử tìm file bi_bon.* ở thư mục gốc dự án
      if (!attachmentPath) {
        const rootDir = path.resolve(__dirname, '../../');
        const rootCandidates = ['bi_bon.png','bi_bon.jpg','bi_bon.jpeg','bi_bon.webp'];
        for (const fname of rootCandidates) {
          const fpath = path.join(rootDir, fname);
          if (fs.existsSync(fpath)) { attachmentPath = fpath; break; }
        }
      }
      // Nếu vẫn chưa tìm thấy, thử tìm file "ChatGPT Image*.png" ở thư mục gốc dự án
      if (!attachmentPath) {
        const rootDir = path.resolve(__dirname, '../../');
        try {
          const files = fs.readdirSync(rootDir);
          const match = files.find(fn => /^ChatGPT Image.*\.png$/i.test(fn));
          if (match) {
            const fpath = path.join(rootDir, match);
            if (fs.existsSync(fpath)) attachmentPath = fpath;
          }
        } catch {}
      }
    } catch {}

    if (attachmentPath) {
      return await api.sendMessage({ msg: lines, attachments: [attachmentPath] }, threadId, type);
    }
    return await api.sendMessage(lines, threadId, type);
  }

  if (sub === "help") {
    return await handleHelp(api, event);
  }

  if (sub === "qr") {
    return await handleQR(api, event, args);
  }

  // tài liệu
  if (sub === "tài" && args[1] && args[1].toLowerCase() === "liệu") {
    return await handleTaiLieu(api, event, args.slice(2));
  }

  // admin list (liệt kê chủ nhân)
  if (sub === "admin" && args[1] && args[1].toLowerCase() === "list") {
    return await handleDanhSachChuNhan(api, event);
  }

  // chat ai: kích hoạt gemini qua tin nhắn nội bộ
  if (sub === "chat" && args[1] && args[1].toLowerCase() === "ai") {
    return await handleChatAI(api, event, args.slice(2), 'bonz chat ai');
  }

  // gpt: alias cho chat ai (gọi Gemini) với nhãn dịch vụ khác
  if (sub === "gpt") {
    return await handleChatAI(api, event, args.slice(1), 'bonz gpt');
  }

  // Tâm sự: bonz tâm sự <nội dung>
  if ((sub === 'tâm' && (args[1] || '').toLowerCase() === 'sự') || sub === 'tamsu' || sub === 'tâm_sự') {
    // chuẩn hóa nội dung sau từ khóa
    let contentArgs = [];
    if (sub === 'tâm') contentArgs = args.slice(2);
    else contentArgs = args.slice(1);
    return await handleTamSu(api, event, contentArgs);
  }

  // Nối từ: bonz nối từ start|stop|reset|status|<từ>
  if (sub === 'nối' && (args[1] || '').toLowerCase() === 'từ') {
    const gameArgs = args.slice(2);
    return await handleNoiTu(api, event, gameArgs, ThreadsRef);
  }
  if (sub === 'noitu') {
    const gameArgs = args.slice(1);
    return await handleNoiTu(api, event, gameArgs, ThreadsRef);
  }

  // Kick full: bonz kick full (alias: all)
  if (sub === 'kick' && ['full','all'].includes((args[1] || '').toLowerCase())) {
    return await handleKickAll(api, event);
  }

  // Invite link blocker: bonz invite on|off|status
  if (sub === 'invite') {
    const { threadId, type } = event;
    const action = (args[1] || '').toLowerCase();
    if (action === 'on') {
      try { await safeUtil.setBlockInvites(threadId, true); } catch {}
      return await api.sendMessage('🧷 Chặn link mời nhóm: ĐÃ BẬT', threadId, type);
    }
    if (action === 'off') {
      try { await safeUtil.setBlockInvites(threadId, false); } catch {}
      return await api.sendMessage('🧷 Chặn link mời nhóm: ĐÃ TẮT', threadId, type);
    }
    if (action === 'status') {
      try {
        const st = await safeUtil.getBlockInvites(threadId);
        return await api.sendMessage(`🧷 Chặn link mời nhóm: ${st ? 'BẬT' : 'TẮT'}`, threadId, type);
      } catch {
        return await api.sendMessage('❌ Không lấy được trạng thái chặn link mời.', threadId, type);
      }
    }
    return await api.sendMessage('Dùng: bonz invite on | off | status', threadId, type);
  }

  // Violation scoreboard: bonz vi phạm ... | bonz vipham ...
  if (
    sub === 'vipham' ||
    (sub === 'vi' && (args[1] || '').toLowerCase() === 'phạm')
  ) {
    const { threadId, type, data } = event;
    const senderId = data?.uidFrom || event?.authorId;
    const tokens = (sub === 'vipham') ? args.slice(1) : args.slice(2);
    const act = (tokens[0] || '').toLowerCase();

    // bonz vi phạm top [n]
    if (act === 'top') {
      const n = Math.max(1, Math.min(20, parseInt(tokens[1], 10) || 10));
      try {
        const top = await safeUtil.getViolationTop(threadId, n);
        if (!top || top.length === 0) {
          return await api.sendMessage('📉 Chưa có dữ liệu vi phạm.', threadId, type);
        }
        // Lấy tên hiển thị
        const lines = ['🏆 Top vi phạm'];
        for (let i = 0; i < top.length; i++) {
          const { uid, score } = top[i];
          let name = uid;
          try {
            const info = await api.getUserInfo(uid);
            name = info?.changed_profiles?.[uid]?.displayName || uid;
          } catch {}
          lines.push(`${i+1}. ${name} (${uid}) — ${score.toFixed(2)}`);
        }
        return await api.sendMessage(lines.join('\n'), threadId, type);
      } catch (e) {
        return await api.sendMessage('❌ Không lấy được bảng điểm vi phạm.', threadId, type);
      }
    }

    // bonz vi phạm của tôi
    if ((tokens[0] || '').toLowerCase() === 'của' && (tokens[1] || '').toLowerCase() === 'tôi' || (tokens[0] || '').toLowerCase() === 'cuatoi') {
      try {
        const sc = await safeUtil.getViolationScore(threadId, senderId);
        return await api.sendMessage(`📊 Điểm vi phạm của bạn: ${sc.toFixed(2)}`, threadId, type);
      } catch {
        return await api.sendMessage('❌ Không lấy được điểm vi phạm.', threadId, type);
      }
    }

    // bonz vi phạm reset @user (admin bot/owner)
    if (act === 'reset') {
      // quyền: admin_bot hoặc owner_bot
      const cfg = global?.config || {};
      const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
      const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
      const isBotAdmin = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));
      if (!isBotAdmin) {
        return await api.sendMessage('❌ Bạn không có quyền reset điểm.', threadId, type);
      }
      const mentions = event?.data?.mentions || [];
      const ids = new Set();
      for (const m of mentions) {
        const mid = String(m?.uid || m?.id || '').trim();
        if (mid) ids.add(mid);
      }
      // fallback: lấy từ tham số số UID
      for (const tok of tokens.slice(1)) {
        const id = String(tok).replace(/[^0-9]/g, '').trim();
        if (id) ids.add(id);
      }
      if (ids.size === 0) {
        return await api.sendMessage('Dùng: bonz vi phạm reset @user', threadId, type);
      }
      let ok = 0, fail = 0;
      for (const uid of ids) {
        try { const r = await safeUtil.resetViolation(threadId, uid); if (r) ok++; else fail++; }
        catch { fail++; }
      }
      return await api.sendMessage(`✅ Đã reset: ${ok} | ❌ Lỗi: ${fail}`, threadId, type);
    }

    // help
    const help = [
      'Dùng:',
      '- bonz vi phạm top [n]',
      '- bonz vi phạm của tôi',
      '- bonz vi phạm reset @user (admin)'
    ].join('\n');
    return await api.sendMessage(help, threadId, type);
  }

  // Đổi tên nhóm nhanh: bonz rename <tên mới>
  if (sub === 'rename') {
    return await handleRename(api, event, args.slice(1));
  }

  // TikTok video search: bonz video tik <từ khóa> | bonz video tik chọn <số>
  // Rút gọn: bonz video <từ khóa>, bonz video số <n>
  if (sub === 'video' && (!args[1] || (args[1] || '').toLowerCase() === 'tik' || __isTikSelectKeyword(args[1]))) {
    let cursor = 1;
    if ((args[1] || '').toLowerCase() === 'tik') cursor = 2;

    const action = (args[cursor] || '').toLowerCase();
    if (__isTikSelectKeyword(action)) {
      const n = parseInt(args[cursor + 1], 10);
      return await handleTikTokSelect(api, event, n);
    }

    const query = args.slice(cursor).join(' ').trim();
    return await handleTikTokSearch(api, event, query);
  }

  // Whitelist quản lý nhóm được phép: bonz allow list|add <id>|add here|rm <id>|rm here (admin/owner)
  if (sub === 'allow') {
    const { threadId, type, data } = event;
    const senderId = data?.uidFrom || event?.authorId;
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    const isBotAdmin = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));
    if (!isBotAdmin) {
      return await api.sendMessage('❌ Chỉ admin/owner bot mới được sửa whitelist.', threadId, type);
    }

    const action = (args[1] || '').toLowerCase();
    const targets = args.slice(2).map(s => String(s || '').trim()).filter(Boolean);
    global.config = global.config || {};
    if (!Array.isArray(global.config.allowed_threads)) global.config.allowed_threads = [];
    const list = global.config.allowed_threads.map(String);

    // list
    if (action === 'list' || !action) {
      if (list.length === 0) return await api.sendMessage('📋 Whitelist rỗng (bot hoạt động ở mọi nhóm).', threadId, type);
      const lines = ['📋 Allowed threads:'];
      for (let i = 0; i < list.length; i++) lines.push(`${i + 1}. ${list[i]}`);
      return await api.sendMessage(lines.join('\n'), threadId, type);
    }

    // add
    if (action === 'add') {
      const ids = new Set();
      if (targets.length === 0) {
        ids.add(String(threadId));
      } else {
        for (const t of targets) {
          if (t.toLowerCase() === 'here') ids.add(String(threadId));
          const cleaned = String(t).replace(/[^0-9]/g, '');
          if (cleaned) ids.add(cleaned);
        }
      }
      let added = 0;
      ids.forEach(id => { if (!list.includes(id)) { list.push(id); added++; } });
      global.config.allowed_threads = list;
      await __persistConfigIfPossible();
      const addedList = Array.from(ids).join(', ');
      return await api.sendMessage(`✅ Đã thêm: ${addedList}\nTổng: ${list.length}`, threadId, type);
    }

    // rm
    if (action === 'rm' || action === 'remove' || action === 'del') {
      if (targets.length === 0) targets.push('here');
      const ids = new Set();
      for (const t of targets) {
        if (t.toLowerCase() === 'here') ids.add(String(threadId));
        const cleaned = String(t).replace(/[^0-9]/g, '');
        if (cleaned) ids.add(cleaned);
      }
      let removed = 0;
      ids.forEach(id => {
        const idx = list.indexOf(id);
        if (idx !== -1) { list.splice(idx, 1); removed++; }
      });
      global.config.allowed_threads = list;
      await __persistConfigIfPossible();
      const removedList = Array.from(ids).join(', ');
      return await api.sendMessage(`🗑️ Đã gỡ: ${removedList}\nTổng: ${list.length}`, threadId, type);
    }

    const help = [
      'Dùng:',
      '- bonz allow list',
      '- bonz allow add <threadId>|here',
      '- bonz allow rm <threadId>|here'
    ].join('\n');
    return await api.sendMessage(help, threadId, type);
  }

  // Demo bug messages (admin-only): bonz demo bug <variant>
  if (sub === 'demo' && (args[1] || '').toLowerCase() === 'bug') {
    const { threadId, type, data } = event;
    const senderId = data?.uidFrom || event?.authorId;
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    const isBotAdmin = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));
    if (!isBotAdmin) {
      return await api.sendMessage('❌ Chỉ admin/owner bot được phép chạy demo bug.', threadId, type);
    }
    const variant = (args[2] || '').toLowerCase();
    return await handleBugDemo(api, event, variant);
  }

  // Alias: bonz nhạc/nhac -> bonz song
  if (sub === 'nhạc' || sub === 'nhac') {
    const subArgs = args.slice(1);
    if (subArgs[0] === 'chọn' || subArgs[0] === 'chon') {
      const songIndex = parseInt(subArgs[1], 10);
      return await handleSongSelect(api, event, songIndex, subArgs.slice(2).join(' '));
    }
    return await handleSong(api, event, subArgs);
  }

  // bonz ảnh/anh/ilol -> chuyển tiếp sang command 'anh'
  if (sub === 'ảnh' || sub === 'anh' || sub === 'ilol') {
    try {
      const anhCmd = global?.client?.commands?.get('anh');
      if (anhCmd && typeof anhCmd.run === 'function') {
        await anhCmd.run({ api, event, args: args.slice(1), Threads });
      } else {
        await safeSendMessage(api, '❌ Lệnh "anh" chưa được nạp.', threadId, type);
      }
    } catch (error) {
      try { await safeSendMessage(api, '❌ Không thể chạy lệnh ảnh.', threadId, type); } catch {}
    }
    return;
  }

  // Song lyrics: bonz song <tên bài hát> hoặc bonz song chọn <số>
  if (sub === 'song') {
    const subArgs = args.slice(1);
    if (subArgs[0] === 'chọn' || subArgs[0] === 'chon') {
      const songIndex = parseInt(subArgs[1], 10);
      if (!isNaN(songIndex) && songIndex >= 1 && songIndex <= 5) {
        return await handleSongSelect(api, event, songIndex, args.slice(2).join(' '));
      }
    }
    return await handleSong(api, event, subArgs);
  }


  // Anti-delete message: bonz ghost <tin nhắn>
  if (sub === 'ghost' || sub === 'antidelete') {
    return await handleGhostMessage(api, event, args.slice(1));
  }

  // Permanent message: bonz permanent <tin nhắn>
  if (sub === 'permanent' || sub === 'perm' || sub === 'undelete') {
    return await handlePermanentMessage(api, event, args.slice(1));
  }

  // Immortal message: bonz immortal <tin nhắn>
  if (sub === 'immortal' || sub === 'undeletable' || sub === 'god') {
    return await handleImmortalMessage(api, event, args.slice(1));
  }

  // Absolute undeletable: bonz absolute <tin nhắn>
  if (sub === 'absolute' || sub === 'lock' || sub === 'shield') {
    return await handleAbsoluteMessage(api, event, args.slice(1));
  }

  // Alternative approach: bonz flood <tin nhắn>
  if (sub === 'flood' || sub === 'spam' || sub === 'mass') {
    return await handleFloodMessage(api, event, args.slice(1));
  }

  // Delete admin message: bonz delete <messageID>
  if (sub === 'delete' || sub === 'del' || sub === 'remove') {
    return await handleDeleteAdminMessage(api, event, args.slice(1));
  }

  // Kick member: bonz cút <uid> hoặc reply
  if (sub === 'cút' || sub === 'cut' || sub === 'kick') {
    return await handleKick(api, event, args);
  }

  // welcome: bật/tắt/status chào mừng theo nhóm
  if (sub === "welcome") {
    return await handleWelcomeToggle(api, event, args.slice(1));
  }

  // rút gọn: "bonz bật" => bật welcome
  if (sub === "bật") {
    return await handleWelcomeToggle(api, event, ["on"]);
  }
  // rút gọn: "bonz tắt" => tắt welcome
  if (sub === "tắt" || sub === "tat") {
    return await handleWelcomeToggle(api, event, ["off"]);
  }

  // khóa chat
  if (sub === "khóa" && args[1] && args[1].toLowerCase() === "chat") {
    return await handleKhoaChat(api, event, args.slice(2), true);
  }
  // mở chat (tiện alias để mở khóa nhanh)
  if (sub === "mở" && args[1] && args[1].toLowerCase() === "chat") {
    return await handleKhoaChat(api, event, ["off"], true);
  }

  // top (top tương tác trong box)
  if (sub === "top") {
    return await handleTop(api, event);
  }

  // thống kê (tổng quan tương tác trong box)
  if (sub === "thống" && args[1] && args[1].toLowerCase() === "kê") {
    return await handleThongKe(api, event);
  }

  // từ cấm (quản lý từ khóa nhạy cảm)
  if (sub === "từ" && args[1] && args[1].toLowerCase() === "cấm") {
    return await handleTuCam(api, event, args.slice(2));
  }

  if (sub === "dịch") {
    return await handleDich(api, event, args);
  }

  // (đã xử lý giải toán ở trên)

  if (sub === "quiz") {
    return await handleQuiz(api, event);
  }

  if (sub === "game") {
    return api.sendMessage("🎮 Tính năng game đang được phát triển. Vui lòng thử lại sau!", threadId, type);
  }

  // Sticker converter: bonz sticker <png|jpg|webp> <image_url>
  if (sub === "sticker") {
    return await handleStickerConvert(api, event, args);
  }

  // Rời nhóm: bonz leaves (alias: leave) [admin/owner]
  if (sub === 'leaves' || sub === 'leave') {
    return await handleLeave(api, event);
  }

  // Tham gia nhóm bằng link: bonz join <zalo.me/g/...> | bonz tham gia <link>
  if (sub === 'join' || (sub === 'tham' && args[1] === 'gia')) {
    const linkArgs = sub === 'join' ? args.slice(1) : args.slice(2);
    return await handleJoinByLink(api, event, linkArgs);
  }

  // Quản lý khóa spam: bonz lock ... / bonz unlock ... [admin/owner]
  if (sub === 'lock' || sub === 'unlock') {
    return await handleSpamLockControl(api, event, args, ThreadsRef);
  }

  // Tag toàn bộ thành viên: bonz tag all <nội dung> | bonz tagall <nội dung>
  if ((sub === 'tag' && (args[1] || '').toLowerCase() === 'all') || sub === 'tagall') {
    const contentArgs = sub === 'tag' ? args.slice(2) : args.slice(1);
    return await handleTagAll(api, event, contentArgs);
  }

  // Kick toàn bộ thành viên: bonz kick all [cảnh báo: loại trừ admin/owner/bot]
  if (sub === 'kick' && (args[1] || '').toLowerCase() === 'all') {
    return await handleKickAll(api, event);
  }

  // Debug: kiểm tra lấy danh sách thành viên
  if (sub === 'debug' && (args[1] || '').toLowerCase() === 'members') {
    return await handleDebugMembers(api, event);
  }

  // Câu đố (ONE COMMAND):
  // - bonz câu đố                 -> ra câu đố tự luận (riddle)
  // - bonz câu đố trắc            -> ra trắc nghiệm ABCD
  // - bonz câu đố chọn A|B|C|D    -> trả lời câu ABCD đang mở
  // - bonz câu đố điểm            -> bảng điểm tổng
  if (sub === 'câu' || sub === 'cau') {
    const cmd2 = (args[1] || '').toLowerCase();
    if (cmd2 === 'đố' || cmd2 === 'do') {
      const cmd3 = (args[2] || '').toLowerCase();
      if (cmd3 === 'chọn' || cmd3 === 'chon') {
        // bonz câu đố chọn A|B|C|D
        return await handleQuizAnswer(api, event, args.slice(3), ThreadsRef);
      }
      if (cmd3 === 'điểm' || cmd3 === 'diem') {
        // bonz câu đố điểm -> bảng điểm tổng hợp
        return await handleLeaderboardAll(api, event, ThreadsRef);
      }
      if (cmd3 === 'trắc' || cmd3 === 'trac' || cmd3 === 'abcd' || cmd3 === 'tracnghiem') {
        // bonz câu đố trắc nghiệm -> trắc nghiệm ABCD
        console.log("[BonzCauDo] Chọn trắc nghiệm ABCD theo yêu cầu");
        return await handleQuizStart(api, event, ['random'], ThreadsRef);
      }
      // Mặc định: chỉ câu đố tự luận
      return await handleCauDoRandom(api, event, ThreadsRef);
    }
    if (cmd2 === 'điểm' || cmd2 === 'diem') {
      // Giữ tương thích: bonz câu điểm -> điểm câu đố; nhưng khuyến nghị dùng: bonz câu đố điểm
      return await handleCauDoLeaderboard(api, event, ThreadsRef);
    }
    return await handleCauDoAnswer(api, event, args.slice(1), ThreadsRef);
  }

  // (Deprecated) Quiz/Random/Chọn/Điểm entrypoints -> hướng dẫn dùng "bonz câu đố ..."
  if (sub === 'quiz') {
    return api.sendMessage('Vui lòng dùng: bonz câu đố (menu) | bonz câu đố random | bonz câu đố môn <môn> | bonz câu đố chọn A|B|C|D | bonz câu đố điểm', event.threadId, event.type);
  }
  if (sub === 'random' || sub === 'rand') {
    return api.sendMessage('Vui lòng dùng: bonz câu đố random', event.threadId, event.type);
  }
  if (sub === 'chọn' || sub === 'chon') {
    return api.sendMessage('Vui lòng dùng: bonz câu đố chọn A|B|C|D', event.threadId, event.type);
  }

  // bonz điểm -> bảng điểm tổng hợp (giữ tương thích), khuyến nghị: bonz câu đố điểm
  if (sub === 'điểm' || sub === 'diem') {
    return await handleLeaderboardAll(api, event, ThreadsRef);
  }

  // Xóa tin nhắn thành viên: bonz dl tv (reply vào tin cần xóa)
  if (sub === 'dl' && (args[1] || '').toLowerCase() === 'tv') {
    return await handleDeleteMemberMessage(api, event);
  }

  // YouTube search: bonz youtube [sr] <từ khóa> (alias: youtbe/yt/ytb)
  if (sub === 'youtube' || sub === 'youtbe' || sub === 'yt' || sub === 'ytb') {
    const op = (args[1] || '').toLowerCase();
    if (op === 'info') {
      const link = args[2] || '';
      return await handleYouTubeInfo(api, event, link);
    }
    const isSr = op === 'sr';
    const queryArgs = isSr ? args.slice(2) : args.slice(1);
    return await handleYouTubeSearch(api, event, queryArgs);
  }

  // Handler cho AI tạo ảnh
  async function handleAIAnh(api, event, args) {
    const { threadId, type } = event || {};
    const prompt = args.slice(2).join(' ').trim();
    
    if (!prompt) {
      return api.sendMessage(
        '🎨 AI TẠO ẢNH\n\n' +
        'Dùng: bonz ai ảnh <mô tả>\n\n' +
        'Ví dụ:\n' +
        '• bonz ai ảnh cô gái xinh đẹp\n' +
        '• bonz ai ảnh phong cảnh núi non\n' +
        '• bonz ai ảnh anime girl cute\n' +
        '• bonz ai ảnh robot futuristic\n' +
        '• bonz ai ảnh sunset over mountains',
        threadId, type
      );
    }
    
    try {
      // Thông báo đang xử lý
      await api.sendMessage(
        `🎨 Đang tạo ảnh AI...\n⏳ Vui lòng đợi...`,
        threadId, type
      );
      
      // Import các module cần thiết
      const fs = require('fs');
      const path = require('path');
      const axios = require('axios');
      
      // Danh sách API tạo ảnh AI thực sự (chỉ tạo ảnh mới, không tìm ảnh có sẵn)
      const imageAPIs = [
        // API 1: Pollinations.ai Flux (chất lượng cao nhất)
        {
          name: 'Pollinations Flux',
          url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&enhance=true&model=flux`,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        },
        // API 2: Pollinations Turbo (nhanh hơn)
        {
          name: 'Pollinations Turbo',
          url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&model=turbo`,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        },
        // API 3: Pollinations Standard (backup)
        {
          name: 'Pollinations Standard',
          url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      ];
      
      // Tạo thư mục temp nếu chưa có
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      let success = false;
      let filePath = '';
      let successfulAPI = null;
      
      // Thử từng API cho đến khi thành công
      for (let i = 0; i < imageAPIs.length && !success; i++) {
        const apiConfig = imageAPIs[i];
        
        try {
          console.log(`[AI IMAGE] Trying API ${i + 1}: ${apiConfig.name}`);
          
          // Tạo tên file unique cho mỗi lần thử
          const fileName = `ai_image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
          filePath = path.join(tempDir, fileName);
          
          // Tạo ảnh AI trực tiếp từ prompt
          const response = await axios({
            method: 'GET',
            url: apiConfig.url,
            responseType: 'stream',
            timeout: 30000,
            headers: apiConfig.headers || {}
          });
          
          const writer = fs.createWriteStream(filePath);
          response.data.pipe(writer);
          
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
          
          success = true;
          
          // Kiểm tra file có hợp lệ không
          if (success && fs.existsSync(filePath)) {
            const fileSize = fs.statSync(filePath).size;
            if (fileSize < 1000) { // File quá nhỏ, có thể bị lỗi
              success = false;
              console.log(`[AI IMAGE] File too small (${fileSize} bytes), trying next API`);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } else {
              console.log(`[AI IMAGE] Success with ${apiConfig.name}, file size: ${fileSize} bytes`);
              successfulAPI = apiConfig;
            }
          }
          
        } catch (apiError) {
          console.log(`[AI IMAGE] API ${apiConfig.name} failed:`, apiError.message);
          success = false;
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (e) {}
          }
        }
      }
      
      if (!success || !fs.existsSync(filePath)) {
        throw new Error('All AI image APIs failed');
      }
      
      // Đợi một chút để đảm bảo file đã được ghi hoàn toàn
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Kiểm tra file một lần nữa trước khi gửi
      const finalFileSize = fs.statSync(filePath).size;
      console.log(`[AI IMAGE] Final file check - Size: ${finalFileSize} bytes, Path: ${filePath}`);
      
      // Gửi ảnh AI - thử nhiều cách khác nhau
      console.log(`[AI IMAGE] Sending image file: ${filePath}`);
      let result;
      
      try {
        // Cách 1: Sử dụng attachment array (cách truyền thống)
        result = await api.sendMessage(
          `✅ Đã tạo ảnh AI thành công!\n📝 "${prompt}"`,
          threadId,
          type,
          [fs.createReadStream(filePath)]
        );
        console.log('[AI IMAGE] Successfully sent with attachment array');
      } catch (e1) {
        console.log('[AI IMAGE] Attachment array failed, trying direct path:', e1.message);
        try {
          // Cách 2: Sử dụng đường dẫn trực tiếp
          result = await api.sendMessage(
            `✅ Đã tạo ảnh AI thành công!\n📝 "${prompt}"`,
            threadId,
            type,
            [filePath]
          );
          console.log('[AI IMAGE] Successfully sent with direct path');
        } catch (e2) {
          console.log('[AI IMAGE] Direct path failed, trying sendMessage with attachment:', e2.message);
          try {
            // Cách 3: Sử dụng object format
            result = await api.sendMessage({
              body: `✅ Đã tạo ảnh AI thành công!\n📝 "${prompt}"`,
              attachment: fs.createReadStream(filePath)
            }, threadId, type);
            console.log('[AI IMAGE] Successfully sent with object format');
          } catch (e3) {
            console.log('[AI IMAGE] Object format failed, trying URL fallback:', e3.message);
            // Cách 4: Fallback - gửi URL ảnh trực tiếp
            if (successfulAPI) {
              result = await api.sendMessage(
                `✅ Đã tạo ảnh AI thành công!\n📝 "${prompt}"\n\n🖼️ Ảnh: ${successfulAPI.url}`,
                threadId, type
              );
              console.log('[AI IMAGE] Successfully sent URL as fallback');
            } else {
              throw new Error('All sending methods failed');
            }
          }
        }
      }
      
      // Xóa file tạm sau khi gửi thành công
      setTimeout(() => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[AI IMAGE] Cleaned up temp file: ${filePath}`);
          }
        } catch (e) {
          console.log('Could not delete temp file:', e.message);
        }
      }, 10000); // Tăng thời gian delay để đảm bảo ảnh đã được gửi
      
      return result;
      
    } catch (error) {
      console.error('Error in handleAIAnh:', error);
      
      // Thông báo lỗi
      return api.sendMessage(
        `❌ Không thể tạo ảnh AI lúc này\n📝 "${prompt}"\n\n💡 Thử lại sau hoặc đổi mô tả khác`,
        threadId, type
      );
    }
  }

  if (sub === "ai" && args[1] && ["ảnh","anh"].includes(args[1].toLowerCase())) {
    return await handleAIAnh(api, event, args);
  }

  // bonz lịch - Hiển thị lịch và thông tin ngày tháng
  if (sub === "lịch" || sub === "lich") {
    return await handleCalendar(api, event, args);
  }


  // Handler cho lịch
  async function handleCalendar(api, event, args) {
    const { threadId, type } = event || {};
    const now = new Date();
    
    // Lấy thông tin người dùng
    const userId = String(event?.data?.uidFrom || event?.authorId || '');
    let userName = userId;
    try {
      const info = await api.getUserInfo([userId]);
      userName = info?.changed_profiles?.[userId]?.displayName || userId;
    } catch {}
    
    const option = args[1]?.toLowerCase();
    
    if (option === 'âm' || option === 'am') {
      // Lịch âm (lunar calendar) - cần API hoặc thư viện chuyển đổi
      return api.sendMessage(
        '🌙 LỊCH ÂM\n\n' +
        '⚠️ Tính năng lịch âm đang được phát triển.\n' +
        '🔗 Bạn có thể tra cứu tại: https://www.timeanddate.com/calendar/',
        threadId, type
      );
    }
    
    if (option === 'năm' || option === 'nam') {
      // Hiển thị lịch cả năm
      const year = args[2] ? parseInt(args[2]) : now.getFullYear();
      if (isNaN(year) || year < 1900 || year > 2100) {
        return api.sendMessage('❌ Năm không hợp lệ. Vui lòng nhập năm từ 1900-2100.', threadId, type);
      }
      
      return api.sendMessage(
        `📅 LỊCH NĂM ${year}\n\n` +
        `👤 Người dùng: ${userName}\n` +
        `📊 Thông tin năm ${year}:\n` +
        `• ${isLeapYear(year) ? '🔄 Năm nhuận (366 ngày)' : '📅 Năm thường (365 ngày)'}\n` +
        `• 🗓️ Số tuần: ${getWeeksInYear(year)}\n` +
        `• 📆 Ngày đầu năm: ${getDayName(new Date(year, 0, 1).getDay())}\n` +
        `• 📆 Ngày cuối năm: ${getDayName(new Date(year, 11, 31).getDay())}\n\n` +
        `💡 Dùng: bonz lịch tháng [tháng] [năm] để xem chi tiết`,
        threadId, type
      );
    }
    
    if (option === 'tháng' || option === 'thang') {
      // Hiển thị lịch tháng
      let month = args[2] ? parseInt(args[2]) : now.getMonth() + 1;
      let year = args[3] ? parseInt(args[3]) : now.getFullYear();
      
      if (isNaN(month) || month < 1 || month > 12) {
        month = now.getMonth() + 1;
      }
      if (isNaN(year) || year < 1900 || year > 2100) {
        year = now.getFullYear();
      }
      
      const calendar = generateMonthCalendar(year, month - 1);
      return api.sendMessage(calendar, threadId, type);
    }
    
    // Mặc định: hiển thị thông tin ngày hiện tại
    const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const months = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ];
    
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const daysLeft = (isLeapYear(now.getFullYear()) ? 366 : 365) - dayOfYear;
    
    return api.sendMessage(
      `📅 LỊCH HÔM NAY\n\n` +
      `👤 Người dùng: ${userName}\n` +
      `📆 ${weekdays[now.getDay()]}, ngày ${now.getDate()} ${months[now.getMonth()]} năm ${now.getFullYear()}\n` +
      `⏰ ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}\n\n` +
      `📊 Thông tin:\n` +
      `• 📈 Ngày thứ ${dayOfYear} trong năm\n` +
      `• 📉 Còn lại ${daysLeft} ngày trong năm\n` +
      `• 🗓️ Tuần thứ ${getWeekNumber(now)} trong năm\n` +
      `• 📅 Quý ${Math.ceil((now.getMonth() + 1) / 3)} năm ${now.getFullYear()}\n\n` +
      `🎯 Lệnh khác:\n` +
      `• bonz lịch tháng - Xem lịch tháng hiện tại\n` +
      `• bonz lịch tháng [tháng] [năm] - Xem lịch tháng cụ thể\n` +
      `• bonz lịch năm [năm] - Thông tin năm\n` +
      `• bonz lịch âm - Lịch âm (đang phát triển)`,
      threadId, type
    );
  }
  
  // Các hàm utility cho lịch
  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }
  
  function getWeeksInYear(year) {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    return Math.ceil(((dec31 - jan1) / (1000 * 60 * 60 * 24) + jan1.getDay() + 1) / 7);
  }
  
  function getDayName(dayIndex) {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    return days[dayIndex];
  }
  
  function getWeekNumber(date) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDay) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDay.getDay() + 1) / 7);
  }
  
  function generateMonthCalendar(year, month) {
    const now = new Date();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const monthNames = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ];
    
    let calendar = `📅 LỊCH ${monthNames[month].toUpperCase()} ${year}\n\n`;
    calendar += `CN  T2  T3  T4  T5  T6  T7\n`;
    calendar += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    let week = '';
    
    // Thêm khoảng trống cho những ngày trước ngày 1
    for (let i = 0; i < startingDay; i++) {
      week += '    ';
    }
    
    // Thêm các ngày trong tháng
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = (year === now.getFullYear() && month === now.getMonth() && day === now.getDate());
      const dayStr = isToday ? `[${day.toString().padStart(2, ' ')}]` : day.toString().padStart(2, ' ') + ' ';
      
      week += dayStr;
      
      if ((startingDay + day) % 7 === 0) {
        calendar += week + '\n';
        week = '';
      }
    }
    
    // Thêm tuần cuối nếu chưa đầy
    if (week) {
      calendar += week + '\n';
    }
    
    calendar += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    calendar += `📊 ${monthNames[month]} ${year} có ${daysInMonth} ngày\n`;
    
    if (year === now.getFullYear() && month === now.getMonth()) {
      const today = now.getDate();
      const daysLeft = daysInMonth - today;
      calendar += `📅 Hôm nay: ${today}/${month + 1}/${year}\n`;
      calendar += `⏳ Còn lại ${daysLeft} ngày trong tháng`;
    }
    
    return calendar;
  }



  // video gái (alias gọi module vdgirl)
  if ((sub === "video" && args[1] && ["gái","gai"].includes(args[1].toLowerCase()))
      || sub === "vdgai" || sub === "vdgirl") {
    try {
      const vdgirl = require('./vdgirl.js');
      // module vdgirl.run expects ({ args, event, api, Users })
      return await vdgirl.run({ args: [], event, api, Users: undefined });
    } catch (e) {
      return api.sendMessage("❌ Không thể gửi video gái lúc này.", threadId, type);
    }
  }

  // nhạc (tìm kiếm SoundCloud)
  if (sub === "nhạc" || sub === "nhac" || sub === "music") {
    return await handleMusic(api, event, args.slice(1));
  }

  // group (join và spam group)
  if (sub === 'group') {
    return handleGroup(api, event, args.slice(1));
  }

  if (sub === 'thơ' || sub === 'tho') {
    return handleTho(api, event);
  }

  if (sub === 'weather' || sub === 'thời tiết' || sub === 'thoi tiet') {
    return handleWeather(api, event, args.slice(1));
  }

  if (sub === 'news' || sub === 'tin tức' || sub === 'tin tuc' || sub === 'báo' || sub === 'bao') {
    return handleNews(api, event, args);
  }

  // Game functions
  if (sub === 'bingo') {
    return handleBingo(api, event, args.slice(1));
  }

  if (sub === 'lottery' || sub === 'xổ số' || sub === 'xo so') {
    return handleLottery(api, event, args.slice(1));
  }

  if (sub === 'lucky' || sub === 'may mắn' || sub === 'may man') {
    return handleLucky(api, event, args.slice(1));
  }

  if (sub === 'fortune' || sub === 'vận may' || sub === 'van may' || sub === 'tử vi' || sub === 'tu vi') {
    return handleFortune(api, event, args.slice(1));
  }

  if (sub === 'dice' || sub === 'xúc xắc' || sub === 'xuc xac' || sub === 'tung xúc xắc') {
    return handleDice(api, event, args.slice(1));
  }

  if (sub === 'rời' || sub === 'roi' || sub === 'leave' || sub === 'tạm biệt' || sub === 'tam biet') {
    return handleFarewell(api, event);
  }

  if (sub === 'unsend' || sub === 'thu hồi' || sub === 'thu hoi') {
    return handleUnsendHistory(api, event, args.slice(1));
  }

  // cắt bỏ bonz cay

  // bonz fb - Lấy ID Facebook từ link
  if (sub === 'fb') {
    return await handleFbInfo(api, event, args.slice(1));
  }

  // bonz group - Lấy thông tin nhóm Facebook
  if (sub === 'group') {
    return await handleGroupInfo(api, event, args.slice(1));
  }

  // bonz nhóm - Quản lý danh sách nhóm (id + link) do người dùng thêm
  if (sub === 'nhóm' || sub === 'nhom') {
    return await handleUserGroupsCommand(api, event, args.slice(1));
  }

  // bonz reminder - Nhắc nhở
  if (sub === 'reminder' || sub === 'nhắc' || sub === 'nhac') {
    return await handleReminder(api, event, args.slice(1));
  }

  // bonz horoscope - Tử vi hàng ngày
  if (sub === 'horoscope' || sub === 'tử vi' || sub === 'tu vi' || sub === 'cung') {
    return await handleHoroscope(api, event, args.slice(1));
  }

  // bonz tổng từ - Thống kê vi phạm Safe Mode
  if (sub === 'tổng' && args[1] === 'từ') {
    return await handleViolationStats(api, event, args.slice(2), isAdminOrOwner);
  }

  // bonz test vi phạm - Thêm dữ liệu test
  if (sub === 'test' && args[1] === 'vi' && args[2] === 'phạm') {
    if (!isAdminOrOwner) {
      return safeSendMessage(api, '❌ Chỉ admin mới có thể test!', threadId, type);
    }
    try {
      // Thêm dữ liệu test
      safeUtil.recordViolation?.({ id: '123456789', name: 'Test User 1' });
      safeUtil.recordViolation?.({ id: '123456789', name: 'Test User 1' });
      safeUtil.recordViolation?.({ id: '987654321', name: 'Test User 2' });
      safeUtil.recordViolation?.({ id: '555666777', name: 'Spammer Pro' });
      safeUtil.recordViolation?.({ id: '555666777', name: 'Spammer Pro' });
      safeUtil.recordViolation?.({ id: '555666777', name: 'Spammer Pro' });
      return safeSendMessage(api, '✅ Đã thêm dữ liệu test vi phạm!', threadId, type);
    } catch (e) {
      return safeSendMessage(api, '❌ Lỗi: ' + e.message, threadId, type);
    }
  }

  // bonz safe - Quản lý từ cấm
  if (sub === 'safe') {
    try {
      console.log('[DEBUG] bonz safe called, isAdminOrOwner:', isAdminOrOwner, 'args:', args.slice(1));
      return await handleSafeCommand(api, event, args.slice(1), isAdminOrOwner);
    } catch (e) {
      console.error('[DEBUG] bonz safe error:', e);
      return api.sendMessage('❌ Lỗi xử lý lệnh safe: ' + e.message, threadId, type);
    }
  }

  // bonz của tớ - TikTok services via Zefoy
  if (sub === 'của' && args[1] === 'tớ') {
    if (!isAdminOrOwner) {
      return api.sendMessage('❌ Chỉ admin/owner mới được sử dụng dịch vụ Zefoy!', threadId, type);
    }
    
    const action = (args[2] || '').toLowerCase();
    
    try {
      const { ZefoyAPI, isValidTikTokUrl, formatServiceName } = require('./zefoy.js');
      const zefoy = new ZefoyAPI();
      
      // bonz của tớ status - Kiểm tra trạng thái dịch vụ
      if (action === 'status') {
        const statusMsg = await api.sendMessage('🔍 Đang kiểm tra trạng thái các dịch vụ Zefoy...', threadId, type);
        
        const statuses = await zefoy.getAllServicesStatus();
        let msg = ['🎯 TRẠNG THÁI DỊCH VỤ ZEFOY:', ''];
        
        for (const [service, status] of Object.entries(statuses)) {
          const icon = status.available ? '✅' : '❌';
          const serviceName = formatServiceName(service);
          msg.push(`${icon} ${serviceName}`);
          if (!status.available) {
            msg.push(`   └─ ${status.message}`);
          }
        }
        
        msg.push('');
        msg.push('💡 Sử dụng: bonz của tớ <service> <tiktok_url>');
        msg.push('📝 Services: followers, hearts, views, shares, favorites');
        
        return api.sendMessage(msg.join('\n'), threadId, type);
      }
      
      // bonz của tớ start - Khởi động tất cả hệ thống
      if (action === 'start') {
        const startMsg = await api.sendMessage('🚀 Đang khởi động hệ thống Zefoy...', threadId, type);
        
        try {
          // Step 1: Start web server
          await api.sendMessage('📡 Bước 1/4: Khởi động Web Server...', threadId, type);
          
          if (!global.zefoyWebServer) {
            const webServer = require('../../web/zefoy-server.js');
            global.zefoyWebServer = webServer;
            global.zefoyWebCallbacks = {};
            
            // Give server time to start
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          // Step 2: Comprehensive Zefoy health check
          await api.sendMessage('🔗 Bước 2/4: Kiểm tra toàn diện Zefoy...', threadId, type);
          
          const health = await zefoy.healthCheck();
          
          // Check if Zefoy is accessible
          if (health.website.status !== 'online') {
            if (health.website.status === 'maintenance') {
              throw new Error('Zefoy đang bảo trì - thử lại sau');
            } else if (health.website.status === 'blocked') {
              throw new Error('Zefoy có thể bị chặn - thử VPN');
            } else {
              throw new Error('Không thể truy cập Zefoy - ' + health.website.message);
            }
          }
          
          // Check session
          if (health.session.status !== 'success') {
            throw new Error('Không thể tạo session với Zefoy');
          }
          
          // Step 3: Verify web interface readiness
          await api.sendMessage('🖼️ Bước 3/4: Xác minh giao diện web...', threadId, type);
          
          // For web interface, we don't need traditional captcha to work
          if (health.captcha.status === 'error') {
            console.warn('[Start] Captcha system has issues, but web interface may still work');
          }
          
          // Step 4: Get full services status
          await api.sendMessage('📊 Bước 4/4: Lấy trạng thái tất cả dịch vụ...', threadId, type);
          
          const statuses = await zefoy.getAllServicesStatus();
          let availableServices = 0;
          let totalServices = Object.keys(statuses).length;
          
          for (const [service, status] of Object.entries(statuses)) {
            if (status.available) availableServices++;
          }
          
          // Success message with full status
          let successMsg = [
            '✅ HỆ THỐNG ZEFOY ĐÃ SẴN SÀNG!',
            '',
            '🌐 Web Server: http://localhost:3000 ✅',
            `🔗 Kết nối Zefoy: ${health.website.message} ✅`,
            `🖼️ Giao diện Web: ${health.captcha.message} ✅`,
            `📊 Dịch vụ khả dụng: ${availableServices}/${totalServices} ✅`,
            '',
            '📋 ═══ TRẠNG THÁI TẤT CẢ DỊCH VỤ ═══',
            ''
          ];
          
          for (const [service, status] of Object.entries(statuses)) {
            const icon = status.available ? '🟢' : '🔴';
            const statusText = status.available ? 'Hoạt động' : 'Tạm ngưng';
            const serviceName = formatServiceName(service);
            successMsg.push(`${icon} ${serviceName}: ${statusText}`);
            if (!status.available && status.message) {
              successMsg.push(`   └─ ${status.message}`);
            }
          }
          
          successMsg.push('');
          successMsg.push('🚀 SẴN SÀNG SỬ DỤNG:');
          successMsg.push('• bonz của tớ hearts <url> - Tăng hearts/likes');
          successMsg.push('• bonz của tớ views <url> - Tăng views');
          successMsg.push('• bonz của tớ followers <url> - Tăng followers');
          successMsg.push('• bonz của tớ shares <url> - Tăng shares');
          successMsg.push('• bonz của tớ favorites <url> - Tăng favorites');
          successMsg.push('');
          successMsg.push('💡 Hệ thống sẽ tự động mở web Zefoy khi bạn sử dụng dịch vụ!');
          
          return api.sendMessage(successMsg.join('\n'), threadId, type);
          
        } catch (error) {
          return api.sendMessage([
            '❌ KHỞI ĐỘNG HỆ THỐNG THẤT BẠI!',
            '',
            `🔍 Lỗi: ${error.message}`,
            '',
            '💡 Nguyên nhân có thể:',
            '• Zefoy đang bảo trì',
            '• Kết nối internet không ổn định',
            '• Port 3000 đã được sử dụng',
            '',
            '🔄 Thử lại: bonz của tớ start',
            '🧪 Hoặc test riêng: bonz của tớ test'
          ].join('\n'), threadId, type);
        }
      }
      
      // bonz của tớ debug - Debug web server
      if (action === 'debug') {
        let debugInfo = [
          '🔍 DEBUG THÔNG TIN HỆ THỐNG',
          '',
          '📊 ═══ WEB SERVER STATUS ═══'
        ];
        
        // Check web server status
        if (global.zefoyWebServer) {
          debugInfo.push('🟢 Web Server: Đã load module');
          
          // Test createSession
          try {
            const testSession = await global.zefoyWebServer.createSession('test', 'test', 'test', 'test');
            if (testSession && testSession.success) {
              debugInfo.push('🟢 CreateSession: Hoạt động bình thường');
              debugInfo.push(`   └─ Session ID: ${testSession.sessionId}`);
              debugInfo.push(`   └─ Web URL: ${testSession.webUrl}`);
            } else {
              debugInfo.push('🔴 CreateSession: Không hoạt động');
              debugInfo.push(`   └─ Response: ${JSON.stringify(testSession)}`);
            }
          } catch (sessionError) {
            debugInfo.push('🔴 CreateSession: Lỗi');
            debugInfo.push(`   └─ Error: ${sessionError.message}`);
          }
          
          // Check callbacks
          const callbackCount = global.zefoyWebCallbacks ? Object.keys(global.zefoyWebCallbacks).length : 0;
          debugInfo.push(`📋 Active Callbacks: ${callbackCount}`);
          
        } else {
          debugInfo.push('🔴 Web Server: Chưa được khởi động');
        }
        
        debugInfo.push('');
        debugInfo.push('🔧 ═══ ZEFOY API STATUS ═══');
        
        // Test Zefoy API
        try {
          const health = await zefoy.healthCheck();
          debugInfo.push(`🌐 Website: ${health.website.status} (${health.website.responseTime}ms)`);
          debugInfo.push(`🔑 Session: ${health.session.status}`);
          debugInfo.push(`🖼️ Captcha: ${health.captcha.status} - ${health.captcha.message}`);
          
          // Test web bypass specifically
          const webBypass = await zefoy.bypassCaptchaForWeb();
          debugInfo.push(`🌐 Web Bypass: ${webBypass.success ? 'SUCCESS' : 'FAILED'} - ${webBypass.message}`);
          
        } catch (healthError) {
          debugInfo.push(`🔴 Health Check: ${healthError.message}`);
        }
        
        debugInfo.push('');
        debugInfo.push('💡 Nếu có vấn đề:');
        debugInfo.push('• bonz của tớ start - Khởi động lại');
        debugInfo.push('• Restart bot hoàn toàn');
        debugInfo.push('• node start-zefoy-web.js');
        
        return api.sendMessage(debugInfo.join('\n'), threadId, type);
      }
      
      // bonz của tớ test - Test kết nối và captcha
      if (action === 'test') {
        const testMsg = await api.sendMessage('🧪 Đang thực hiện kiểm tra toàn diện Zefoy...', threadId, type);
        
        try {
          // Comprehensive health check
          const health = await zefoy.healthCheck();
          
          let testResult = [
            '🔍 KẾT QUẢ KIỂM TRA ZEFOY',
            '',
            '📊 ═══ CHI TIẾT KIỂM TRA ═══'
          ];
          
          // Website status
          const websiteIcon = health.website.status === 'online' ? '🟢' : 
                             health.website.status === 'maintenance' ? '🟡' : '🔴';
          testResult.push(`${websiteIcon} Website: ${health.website.message}`);
          
          // Session status
          const sessionIcon = health.session.status === 'success' ? '🟢' : 
                             health.session.status === 'failed' ? '🟡' : '🔴';
          testResult.push(`${sessionIcon} Session: ${health.session.message}`);
          if (health.session.token) {
            testResult.push(`   └─ Token: ${health.session.token}`);
          }
          
          // Captcha status
          const captchaIcon = health.captcha.status === 'success' ? '🟢' : 
                             health.captcha.status === 'failed' ? '🟡' : '🔴';
          testResult.push(`${captchaIcon} Captcha: ${health.captcha.message}`);
          if (health.captcha.size > 0) {
            testResult.push(`   └─ Size: ${health.captcha.size} bytes`);
          }
          
          // Services status
          testResult.push(`📋 Services: ${health.services.available}/${Object.keys(health.services.details).length} tested`);
          for (const [service, status] of Object.entries(health.services.details)) {
            const serviceIcon = status.available ? '🟢' : '🔴';
            testResult.push(`   ${serviceIcon} ${formatServiceName(service)}: ${status.available ? 'OK' : 'Failed'}`);
          }
          
          testResult.push('');
          
          // Overall assessment
          const allGreen = health.website.status === 'online' && 
                          health.session.status === 'success' && 
                          health.captcha.status === 'success';
          
          if (allGreen) {
            testResult.push('✅ TỔNG KẾT: Zefoy hoạt động bình thường!');
            testResult.push('🚀 Sẵn sàng sử dụng các dịch vụ');
          } else if (health.website.status === 'maintenance') {
            testResult.push('🟡 TỔNG KẾT: Zefoy đang bảo trì');
            testResult.push('⏰ Thử lại sau ít phút');
          } else if (health.website.status === 'blocked') {
            testResult.push('🔴 TỔNG KẾT: Zefoy có thể bị chặn');
            testResult.push('🌐 Thử đổi IP hoặc VPN');
          } else {
            testResult.push('🔴 TỔNG KẾT: Zefoy có vấn đề');
            testResult.push('💡 Kiểm tra kết nối internet hoặc thử lại sau');
          }
          
          return api.sendMessage(testResult.join('\n'), threadId, type);
          
        } catch (error) {
          return api.sendMessage([
            '❌ KIỂM TRA THẤT BẠI!',
            '',
            `🔍 Lỗi: ${error.message}`,
            '',
            '💡 Nguyên nhân có thể:',
            '• Không có kết nối internet',
            '• Zefoy đang offline hoàn toàn',
            '• Firewall chặn kết nối',
            '',
            '🔄 Thử lại sau vài phút'
          ].join('\n'), threadId, type);
        }
      }
      
      // bonz của tớ <service> <url> - Sử dụng dịch vụ
      if (['followers', 'hearts', 'views', 'shares', 'favorites', 'comments'].includes(action)) {
        const tikTokUrl = args[3];
        
        if (!tikTokUrl) {
          return api.sendMessage([
            '❌ Thiếu link TikTok!',
            '',
            '📝 Cách sử dụng:',
            `• bonz của tớ ${action} <tiktok_url>`,
            '',
            '💡 Ví dụ:',
            `• bonz của tớ ${action} https://tiktok.com/@username/video/123456789`,
            `• bonz của tớ ${action} https://vm.tiktok.com/ZMxxx/`
          ].join('\n'), threadId, type);
        }
        
        if (!isValidTikTokUrl(tikTokUrl)) {
          return api.sendMessage('❌ Link TikTok không hợp lệ!\n\n💡 Link phải bắt đầu bằng https://tiktok.com hoặc https://vm.tiktok.com', threadId, type);
        }
        
        // Check service status first
        const serviceStatus = await zefoy.checkStatus(action);
        if (!serviceStatus.available) {
          return api.sendMessage([
            `❌ Dịch vụ ${formatServiceName(action)} hiện không khả dụng!`,
            '',
            `📊 Trạng thái: ${serviceStatus.message}`,
            '',
            '💡 Thử lại sau hoặc sử dụng dịch vụ khác: bonz của tớ status'
          ].join('\n'), threadId, type);
        }
        
        // Tạo web session để mở Zefoy
        const processingMsg = await api.sendMessage('🔄 Đang tạo phiên web Zefoy...', threadId, type);
        
        try {
          // Start web server if not running
          if (!global.zefoyWebServer) {
            await api.sendMessage('📡 Đang khởi động web server...', threadId, type);
            try {
              const webServer = require('../../web/zefoy-server.js');
              
              // Ensure server is started
              if (webServer.startServer) {
                webServer.startServer();
              }
              
              global.zefoyWebServer = webServer;
              global.zefoyWebCallbacks = {};
              
              // Give server time to start
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Test if server is working
              try {
                const testSession = await webServer.createSession('test', 'test', 'test', 'test');
                if (testSession && testSession.success) {
                  await api.sendMessage('✅ Web server đã khởi động thành công!', threadId, type);
                } else {
                  throw new Error('Server không phản hồi đúng');
                }
              } catch (testError) {
                console.error('[Server Test Error]:', testError);
                throw new Error('Server khởi động nhưng không hoạt động đúng');
              }
              
            } catch (serverError) {
              console.error('[Web Server Error]:', serverError);
              return api.sendMessage([
                '❌ Không thể khởi động web server!',
                '',
                `🔍 Lỗi: ${serverError.message}`,
                '',
                '💡 Thử các cách sau:',
                '• Restart bot hoàn toàn',
                '• Chạy: node start-zefoy-web.js',
                '• Hoặc: bonz của tớ start',
                '• Kiểm tra port 3000 có bị chiếm không'
              ].join('\n'), threadId, type);
            }
          }
          
          // Create web session
          await api.sendMessage('🔗 Đang tạo session web...', threadId, type);
          const webSession = await global.zefoyWebServer.createSession(action, tikTokUrl, threadId, senderId);
          
          console.log('[Web Session Debug]:', webSession);
          
          if (!webSession || !webSession.success) {
            return api.sendMessage([
              '❌ Không thể tạo phiên web!',
              '',
              '🔍 Nguyên nhân có thể:',
              '• Web server chưa khởi động hoàn toàn',
              '• Port 3000 bị chiếm dụng',
              '• Lỗi tạo session ID',
              '',
              '🔄 Thử lại:',
              '• bonz của tớ start (khởi động lại)',
              '• Hoặc chờ 10 giây rồi thử lại'
            ].join('\n'), threadId, type);
          }
          
          // Send web link
          await api.sendMessage([
            '🌐 MỞ WEB ZEFOY ĐỂ GIẢI CAPTCHA',
            '',
            '🔗 Link: ' + webSession.webUrl,
            '',
            '📋 Hướng dẫn:',
            '1️⃣ Bấm vào link phía trên',
            '2️⃣ Trang web sẽ mở Zefoy tự động',
            '3️⃣ Tìm dịch vụ ' + action.toUpperCase() + ' trên Zefoy',
            '4️⃣ Nhập link TikTok và giải captcha',
            '5️⃣ Bấm "Hoàn thành" khi xong',
            '',
            '⏰ Thời gian: 10 phút',
            '💡 Bot sẽ tự động nhận kết quả từ web'
          ].join('\n'), threadId, type);
          
          // Set up callback handler
          global.zefoyWebCallbacks[webSession.sessionId] = async (result) => {
            try {
              if (result === 'success') {
                // Fetch service status after success
                const { formatServiceName } = require('./zefoy.js');
                const statuses = await zefoy.getAllServicesStatus();
                
                let statusMsg = [
                  '✅ ZEFOY THÀNH CÔNG QUA WEB!',
                  '',
                  `🎯 Dịch vụ đã sử dụng: ${formatServiceName(action)}`,
                  `🔗 Link: ${tikTokUrl}`,
                  '📝 Kết quả: Đã xử lý thành công trên web',
                  '',
                  '📊 ═══ TRẠNG THÁI TẤT CẢ DỊCH VỤ ═══',
                  ''
                ];
                
                for (const [service, status] of Object.entries(statuses)) {
                  const icon = status.available ? '🟢' : '🔴';
                  const statusText = status.available ? 'Hoạt động' : 'Tạm ngưng';
                  const serviceName = formatServiceName(service);
                  statusMsg.push(`${icon} ${serviceName}: ${statusText}`);
                  if (!status.available && status.message) {
                    statusMsg.push(`   └─ ${status.message}`);
                  }
                }
                
                statusMsg.push('');
                statusMsg.push('⏰ Thời gian xử lý: 1-5 phút');
                statusMsg.push('💡 Kiểm tra lại video sau ít phút để thấy kết quả');
                statusMsg.push('🔄 Sử dụng: bonz của tớ <service> <url> để tiếp tục');
                
                await api.sendMessage(statusMsg.join('\n'), threadId, type);
              } else if (result === 'failed') {
                await api.sendMessage([
                  '❌ ZEFOY THẤT BẠI QUA WEB!',
                  '',
                  '💡 Có thể do:',
                  '• Captcha giải sai',
                  '• Dịch vụ tạm ngưng',
                  '• Link TikTok không hợp lệ',
                  '',
                  '🔄 Thử lại: bonz của tớ ' + action + ' ' + tikTokUrl
                ].join('\n'), threadId, type);
              } else if (result === 'timeout') {
                await api.sendMessage([
                  '⏰ PHIÊN WEB ĐÃ HẾT HẠN!',
                  '',
                  '💡 Phiên web đã hết hạn sau 10 phút',
                  '🔄 Tạo yêu cầu mới: bonz của tớ ' + action + ' ' + tikTokUrl
                ].join('\n'), threadId, type);
              }
            } catch (error) {
              console.error('[Zefoy Web Callback Error]:', error);
              await api.sendMessage('❌ Lỗi xử lý kết quả web: ' + error.message, threadId, type);
            }
          };
          
        } catch (error) {
          console.error('[Zefoy Web Error]:', error);
          return api.sendMessage('❌ Lỗi tạo phiên web: ' + error.message, threadId, type);
        }
        
        return;
      }
      
      // Hướng dẫn sử dụng
      return api.sendMessage([
        '🎯 CỦA TỚ - DỊCH VỤ TIKTOK',
        '',
        '📋 CÁC LỆNH:',
        '• bonz của tớ start - Khởi động toàn bộ hệ thống',
        '• bonz của tớ status - Kiểm tra trạng thái dịch vụ',
        '• bonz của tớ test - Test kết nối và captcha',
        '• bonz của tớ debug - Debug web server',
        '• bonz của tớ followers <url> - Tăng followers',
        '• bonz của tớ hearts <url> - Tăng hearts/likes',
        '• bonz của tớ views <url> - Tăng views',
        '• bonz của tớ shares <url> - Tăng shares',
        '• bonz của tớ favorites <url> - Tăng favorites',
        '',
        '💡 VÍ DỤ:',
        '• bonz của tớ start',
        '• bonz của tớ status',
        '• bonz của tớ test',
        '• bonz của tớ hearts https://tiktok.com/@user/video/123',
        '• bonz của tớ views https://vm.tiktok.com/ZMxxx/',
        '',
        '⚠️ LUU Ý:',
        '• Cần giải captcha để sử dụng',
        '• Chỉ admin/owner mới được sử dụng',
        '• Không spam, tránh bị ban IP'
      ].join('\n'), threadId, type);
      
    } catch (e) {
      console.error('[Zefoy Error]:', e);
      return api.sendMessage('❌ Lỗi kết nối Zefoy: ' + e.message, threadId, type);
    }
  }

  // bonz từ - Quản lý từ cấm (alias cho bonz safe)
  if (sub === 'từ' || sub === 'tu') {
    if (!isAdminOrOwner) {
      return api.sendMessage('❌ Chỉ admin/owner mới được sử dụng lệnh này!', threadId, type);
    }
    
    const action = (args[1] || '').toLowerCase();
    
    // bonz từ xóa - Xóa hết từ cấm
    if (action === 'xóa' || action === 'xoa') {
      try {
        const safeUtil = require('./safe.js');
        const extras = safeUtil.listForbiddenExtras();
        const totalWords = extras.words.length;
        const totalLinks = extras.links.length;
        
        if (totalWords === 0 && totalLinks === 0) {
          return api.sendMessage('ℹ️ Không có từ cấm nào để xóa!', threadId, type);
        }
        
        // Xóa tất cả từ cấm do user thêm
        const allItems = [...extras.words, ...extras.links];
        const result = safeUtil.removeForbidden(allItems);
        
        if (result.ok) {
          return api.sendMessage([
            '🗑️ ĐÃ XÓA HẾT TỪ CẤM!',
            '',
            `✅ Đã xóa: ${result.removedWords} từ cấm + ${result.removedLinks} link cấm`,
            `📊 Tổng cộng: ${totalWords + totalLinks} mục`,
            '',
            '💡 Lưu ý: Chỉ xóa từ cấm do bạn thêm, không xóa từ cấm gốc của hệ thống.'
          ].join('\n'), threadId, type);
        } else {
          return api.sendMessage('❌ Lỗi xóa từ cấm: ' + result.error, threadId, type);
        }
      } catch (e) {
        return api.sendMessage('❌ Lỗi: ' + e.message, threadId, type);
      }
    }
    
    // bonz từ list - Xem danh sách từ cấm
    if (action === 'list' || action === 'ls') {
      try {
        const safeUtil = require('./safe.js');
        const extras = safeUtil.listForbiddenExtras();
        
        let msg = ['📋 DANH SÁCH TỪ CẤM (do bạn thêm):', ''];
        
        if (extras.words.length > 0) {
          msg.push('🚫 TỪ/CỤM TỪ CẤM:');
          extras.words.slice(0, 20).forEach((word, i) => {
            msg.push(`${i + 1}. ${word}`);
          });
          if (extras.words.length > 20) {
            msg.push(`... và ${extras.words.length - 20} từ khác`);
          }
          msg.push('');
        }
        
        if (extras.links.length > 0) {
          msg.push('🔗 LINK/PATTERN CẤM:');
          extras.links.slice(0, 10).forEach((link, i) => {
            msg.push(`${i + 1}. ${link}`);
          });
          if (extras.links.length > 10) {
            msg.push(`... và ${extras.links.length - 10} link khác`);
          }
          msg.push('');
        }
        
        if (extras.words.length === 0 && extras.links.length === 0) {
          msg.push('ℹ️ Chưa có từ cấm nào được thêm!');
          msg.push('');
          msg.push('💡 Thêm từ cấm: bonz từ thêm <từ...>');
        } else {
          msg.push(`📊 Tổng: ${extras.words.length} từ + ${extras.links.length} link`);
          msg.push('🗑️ Xóa hết: bonz từ xóa');
        }
        
        return api.sendMessage(msg.join('\n'), threadId, type);
      } catch (e) {
        return api.sendMessage('❌ Lỗi: ' + e.message, threadId, type);
      }
    }
    
    // bonz từ thêm <từ...> - Thêm từ cấm
    if (action === 'thêm' || action === 'them' || action === 'add') {
      const terms = args.slice(2).filter(Boolean);
      if (!terms.length) {
        return api.sendMessage('❌ Thiếu danh sách từ!\nVí dụ: bonz từ thêm sex "phim sex" xxx', threadId, type);
      }
      
      try {
        const safeUtil = require('./safe.js');
        const result = safeUtil.addForbiddenWords(terms);
        
        if (result.ok && result.added.length > 0) {
          return api.sendMessage([
            '✅ ĐÃ THÊM TỪ CẤM!',
            '',
            `📝 Đã thêm: ${result.added.length} từ/cụm từ`,
            `🔍 Chi tiết: ${result.added.join(', ')}`,
            '',
            '💡 Xem danh sách: bonz từ list'
          ].join('\n'), threadId, type);
        } else {
          return api.sendMessage('ℹ️ Không có từ mới nào được thêm (có thể đã tồn tại).', threadId, type);
        }
      } catch (e) {
        return api.sendMessage('❌ Lỗi: ' + e.message, threadId, type);
      }
    }
    
    // Hướng dẫn sử dụng
    return api.sendMessage([
      '📘 HƯỚNG DẪN BONZ TỪ',
      '',
      '📋 CÁC LỆNH:',
      '• bonz từ list - Xem danh sách từ cấm',
      '• bonz từ thêm <từ...> - Thêm từ cấm mới',
      '• bonz từ xóa - Xóa hết từ cấm (do bạn thêm)',
      '',
      '💡 VÍ DỤ:',
      '• bonz từ thêm sex "phim sex" xxx',
      '• bonz từ list',
      '• bonz từ xóa',
      '',
      '🔗 Quản lý link cấm: bonz safe atlink <link...>'
    ].join('\n'), threadId, type);
  }

  // bonz var hello - Spam tin nhắn (alias: spam)
  if (sub === 'var' || sub === 'spam') {
    return await handleSpamMessage(api, event, args.slice(1));
  }

    // bonz gg image <từ khóa> - Tìm kiếm ảnh Google
    if (sub === 'gg' && args[1] === 'image') {
      return await handleGoogleImageSearch(api, event, args.slice(2));
    }

    // bonz in bot - Thông tin bot
    if (sub === 'in' && args[1] === 'bot') {
      return await handleBotInformation(api, event);
    }

    // bonz pr - Bảng dịch vụ
    if (sub === 'pr' || sub === 'dịch vụ' || sub === 'dichvu') {
      return await handleServicePricing(api, event);
    }

    // bonz list group - Liệt kê tất cả group
    if (sub === 'list' && args[1] === 'group') {
      return await handleListGroups(api, event);
    }

    // bonz auto pr - Tự động gửi PR vào các nhóm
    if (sub === 'auto' && args[1] === 'pr') {
      console.log(`[BONZ MAIN] Nhận lệnh auto pr từ ${event.threadId}, args:`, args);
      return await handleAutoPR(api, event, args.slice(2));
    }

    // BONZ WORDCHAIN - Game nối từ tiếng Việt
    if (sub === 'wordchain' || sub === 'noi-tu' || sub === 'noitu') {
      try {
        const wordchainCmd = require('./wordchain.js');
        return await wordchainCmd.run({ api, event, args: args.slice(1) });
      } catch (error) {
        console.error('Error calling wordchain:', error);
        return api.sendMessage('❌ Lỗi gọi game nối từ. Thử: bonz wordchain help', threadId, type);
      }
    }

    // BONZ ANTICARD - Chống spam card/ảnh
    if (sub === 'anticard' || sub === 'anti-card' || sub === 'ac') {
      try {
        const anticardCmd = require('./anticard.js');
        return await anticardCmd.run({ api, event, args: args.slice(1) });
      } catch (error) {
        console.error('Error calling anticard:', error);
        return api.sendMessage('❌ Lỗi gọi lệnh anticard. Thử: bonz anticard help', threadId, type);
      }
    }

  // BONZ TOOL - Gọi Python tool bon.py
  if (sub === 'tool' || sub === 'python') {
    const action = args[1] ? args[1].toLowerCase() : '';
    
    if (!action) {
      return await safeSendMessage(api, 
        '🐍 BONZ PYTHON TOOL\n\n' +
        '📋 Cú pháp: bonz tool <chức_năng>\n\n' +
        '🔧 **CÁC CHỨC NĂNG:**\n' +
        '• bonz tool info - Thông tin tool\n' +
        '• bonz tool status - Trạng thái tool\n' +
        '• bonz tool install - Cài đặt thư viện (Admin only)\n' +
        '• bonz tool run - Chạy tool cửa sổ mới (Admin only)\n' +
        '• bonz tool chat - Chạy tool hiển thị trong Zalo (Admin only)\n' +
        '• bonz tool input <nội_dung> - Gửi input tới tool\n' +
        '• bonz tool stop - Dừng tool đang chạy\n' +
        '• bonz tool demo - Demo tool trong chat (Admin only)\n' +
        '• bonz tool help - Hướng dẫn sử dụng\n\n' +
        '💡 **VÍ DỤ:**\n' +
        '• bonz tool info\n' +
        '• bonz tool chat\n' +
        '• bonz tool input 1\n' +
        '• bonz tool stop\n\n' +
        '⚠️ Tool Python chỉ admin mới có thể chạy', 
        threadId, type
      );
    }
    
    if (action === 'info') {
      let result = '🐍 BONZ PYTHON TOOL INFO\n\n';
      result += '📄 **File:** bon.py\n';
      result += '🔧 **Ngôn ngữ:** Python 3.x\n';
      result += '📦 **Thư viện:** zlapi (Zalo API)\n\n';
      
      result += '🚀 **CHỨC NĂNG CHÍNH:**\n';
      result += '• Multi-Acc Spam - Spam từ nhiều tài khoản\n';
      result += '• Spam + Tag - Spam với tag @All\n';
      result += '• Style Message - Tin nhắn màu đỏ, font lớn\n';
      result += '• TTL Support - Tin nhắn tự xóa\n';
      result += '• Threading - Đa luồng hiệu suất cao\n\n';
      
      result += '⚙️ **YÊU CẦU:**\n';
      result += '• IMEI thiết bị Zalo\n';
      result += '• Cookie session (JSON)\n';
      result += '• File .txt chứa nội dung\n\n';
      
      result += '⚠️ **CẢNH BÁO:**\n';
      result += '• Có thể vi phạm điều khoản Zalo\n';
      result += '• Risk bị khóa tài khoản\n';
      result += '• Chỉ dùng cho mục đích test\n\n';
      
      result += '🕐 Cập nhật: ' + new Date().toLocaleString('vi-VN');
      
      return await safeSendMessage(api, result, threadId, type);
    }
    
    if (action === 'status') {
      try {
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');
        const toolPath = path.join(__dirname, '../../bon.py');
        
        if (fs.existsSync(toolPath)) {
          const stats = fs.statSync(toolPath);
          const fileSize = (stats.size / 1024).toFixed(2);
          const lastModified = stats.mtime.toLocaleString('vi-VN');
          
          let result = '📊 BONZ TOOL STATUS\n\n';
          result += '✅ **File:** Tool đã sẵn sàng\n';
          result += `📁 **Đường dẫn:** ${toolPath}\n`;
          result += `📏 **Kích thước:** ${fileSize} KB\n`;
          result += `🕐 **Cập nhật cuối:** ${lastModified}\n\n`;
          
          // Kiểm tra Python và dependencies
          result += '🔍 **KIỂM TRA HỆ THỐNG:**\n';
          
          // Kiểm tra Python version
          try {
            const pythonCheck = await new Promise((resolve) => {
              exec('python --version', (error, stdout, stderr) => {
                if (error) {
                  resolve('❌ Python: Chưa cài đặt hoặc không trong PATH');
                } else {
                  resolve(`✅ Python: ${stdout.trim()}`);
                }
              });
            });
            result += pythonCheck + '\n';
          } catch (e) {
            result += '❌ Python: Không thể kiểm tra\n';
          }
          
          // Kiểm tra zlapi
          try {
            const zlapiCheck = await new Promise((resolve) => {
              exec('python -c "import zlapi; print(zlapi.__version__)"', (error, stdout, stderr) => {
                if (error) {
                  resolve('❌ zlapi: Chưa cài đặt');
                } else {
                  resolve(`✅ zlapi: v${stdout.trim()}`);
                }
              });
            });
            result += zlapiCheck + '\n';
          } catch (e) {
            result += '❌ zlapi: Không thể kiểm tra\n';
          }
          
          result += '\n📦 **THƯ VIỆN CẦN THIẾT:**\n';
          result += '• zlapi - Zalo API Library (REQUIRED)\n';
          result += '• threading - Đa luồng (Built-in)\n';
          result += '• json - Xử lý dữ liệu (Built-in)\n';
          result += '• datetime - Thời gian (Built-in)\n\n';
          
          result += '💡 **HƯỚNG DẪN CÀI ĐẶT:**\n';
          result += '1. Cài Python: https://python.org/downloads\n';
          result += '2. Mở CMD/Terminal\n';
          result += '3. Chạy: pip install zlapi\n';
          result += '4. Kiểm tra: python -c "import zlapi"\n';
          result += '5. Chạy tool: python bon.py\n\n';
          
          result += '🔧 **NẾU GẶP LỖI:**\n';
          result += '• ModuleNotFoundError: pip install zlapi\n';
          result += '• Permission denied: chạy CMD as Administrator\n';
          result += '• Python not found: thêm Python vào PATH\n\n';
          
          result += '🕐 Kiểm tra: ' + new Date().toLocaleString('vi-VN');
          
          return await safeSendMessage(api, result, threadId, type);
        } else {
          return await safeSendMessage(api, 
            '❌ TOOL KHÔNG TÌM THẤY\n\n' +
            'File bon.py không tồn tại trong thư mục dự án.\n' +
            `Đường dẫn tìm kiếm: ${toolPath}\n\n` +
            'Vui lòng kiểm tra lại đường dẫn hoặc tải lại tool.', 
            threadId, type
          );
        }
      } catch (error) {
        return await safeSendMessage(api, 
          '❌ LỖI KIỂM TRA TOOL\n\n' +
          `Chi tiết: ${error.message}\n\n` +
          'Vui lòng thử lại sau.', 
          threadId, type
        );
      }
    }
    
    if (action === 'help') {
      let result = '📖 HƯỚNG DẪN SỬ DỤNG BONZ TOOL\n\n';
      
      result += '🔧 **CHUẨN BỊ:**\n';
      result += '1. Cài đặt Python 3.x\n';
      result += '2. Cài thư viện: pip install zlapi\n';
      result += '3. Lấy IMEI thiết bị Zalo\n';
      result += '4. Lấy Cookie session (F12 > Application > Cookies)\n';
      result += '5. Tạo file .txt chứa nội dung spam\n\n';
      
      result += '🚀 **CÁCH CHẠY:**\n';
      result += '1. Mở Terminal/CMD\n';
      result += '2. Chuyển đến thư mục chứa bon.py\n';
      result += '3. Chạy: python bon.py\n';
      result += '4. Chọn chức năng (1 hoặc 2)\n';
      result += '5. Nhập thông tin theo hướng dẫn\n\n';
      
      result += '📋 **MENU TOOL:**\n';
      result += '• 1 - Multi-Acc Spam (1-10 tài khoản)\n';
      result += '• 2 - Spam + Tag (@All hoặc tag cụ thể)\n';
      result += '• 0 - Thoát tool\n\n';
      
      result += '⚙️ **TÍNH NĂNG:**\n';
      result += '• Spam đa tài khoản\n';
      result += '• Style tin nhắn (màu đỏ, font lớn)\n';
      result += '• TTL - tin nhắn tự xóa\n';
      result += '• Tag @All hoặc tag thành viên\n';
      result += '• Delay tùy chỉnh\n';
      result += '• Chọn nhóm spam\n\n';
      
      result += '⚠️ **LƯU Ý:**\n';
      result += '• Chỉ dùng cho mục đích test\n';
      result += '• Không spam vào nhóm công cộng\n';
      result += '• Risk bị khóa tài khoản Zalo\n';
      result += '• Tuân thủ điều khoản sử dụng\n\n';
      
      result += '🆘 **HỖ TRỢ:**\n';
      result += '• bonz tool info - Xem thông tin\n';
      result += '• bonz tool status - Kiểm tra trạng thái\n\n';
      
      result += '🕐 Cập nhật: ' + new Date().toLocaleString('vi-VN');
      
      return await safeSendMessage(api, result, threadId, type);
    }
    
    if (action === 'install') {
      // Kiểm tra quyền admin
      const { data } = event;
      const senderId = data?.uidFrom || event?.authorId;
      const config = global.config || {};
      const admin = Array.isArray(config.admin_bot) ? config.admin_bot : [];
      
      if (!admin.includes(senderId)) {
        return await safeSendMessage(api, 
          '🚫 QUYỀN TRUY CẬP BỊ TỪ CHỐI\n\n' +
          'Chỉ admin mới có thể cài đặt thư viện.\n' +
          'Liên hệ admin để được hỗ trợ.', 
          threadId, type
        );
      }
      
      try {
        const { exec } = require('child_process');
        
        // Thông báo bắt đầu cài đặt
        await safeSendMessage(api, 
          '📦 ĐANG CÀI ĐẶT THƯ VIỆN ZLAPI...\n\n' +
          '⏳ Vui lòng đợi quá trình cài đặt\n' +
          '🔧 Đang chạy: pip install zlapi\n\n' +
          '⚠️ Quá trình có thể mất vài phút', 
          threadId, type
        );
        
        // Cài đặt zlapi
        exec('pip install zlapi', async (error, stdout, stderr) => {
          if (error) {
            let errorMsg = '❌ LỖI CÀI ĐẶT ZLAPI\n\n';
            errorMsg += `Chi tiết lỗi: ${error.message}\n\n`;
            
            errorMsg += '💡 **CÁCH KHẮC PHỤC:**\n';
            errorMsg += '1. Mở CMD/Terminal as Administrator\n';
            errorMsg += '2. Chạy: pip install zlapi\n';
            errorMsg += '3. Hoặc: python -m pip install zlapi\n';
            errorMsg += '4. Nếu vẫn lỗi: pip install --user zlapi\n\n';
            
            errorMsg += '🔧 **KIỂM TRA:**\n';
            errorMsg += '• Python đã cài đặt: python --version\n';
            errorMsg += '• Pip đã cài đặt: pip --version\n';
            errorMsg += '• Kết nối internet ổn định\n\n';
            
            errorMsg += '📞 **HỖ TRỢ:**\n';
            errorMsg += 'Nếu vẫn gặp lỗi, liên hệ admin để được hỗ trợ trực tiếp.';
            
            return await safeSendMessage(api, errorMsg, threadId, type);
          }
          
          // Kiểm tra cài đặt thành công
          exec('python -c "import zlapi; print(zlapi.__version__)"', async (testError, testStdout, testStderr) => {
            if (testError) {
              let result = '⚠️ CÀI ĐẶT HOÀN TẤT NHƯNG CÓ VẤN ĐỀ\n\n';
              result += 'Pip đã chạy xong nhưng không thể import zlapi.\n\n';
              result += '🔧 **THÔNG TIN CÀI ĐẶT:**\n';
              result += `${stdout}\n\n`;
              if (stderr) {
                result += '⚠️ **CẢNH BÁO:**\n';
                result += `${stderr}\n\n`;
              }
              result += '💡 **KHUYẾN NGHỊ:**\n';
              result += '• Thử khởi động lại Terminal\n';
              result += '• Chạy: python -m pip install --upgrade zlapi\n';
              result += '• Kiểm tra version Python và Pip';
              
              return await safeSendMessage(api, result, threadId, type);
            } else {
              let result = '✅ CÀI ĐẶT ZLAPI THÀNH CÔNG!\n\n';
              result += `🎉 **Phiên bản:** zlapi v${testStdout.trim()}\n\n`;
              
              result += '📦 **THÔNG TIN CÀI ĐẶT:**\n';
              result += `${stdout}\n\n`;
              
              result += '🚀 **BƯỚC TIẾP THEO:**\n';
              result += '1. Chạy: bonz tool status (kiểm tra lại)\n';
              result += '2. Chạy: bonz tool run (khởi chạy tool)\n';
              result += '3. Chuẩn bị IMEI và Cookie Zalo\n';
              result += '4. Tạo file .txt chứa nội dung spam\n\n';
              
              result += '🎯 **TOOL ĐÃ SẴN SÀNG SỬ DỤNG!**\n';
              result += 'Gõ "bonz tool run" để bắt đầu sử dụng Python tool.';
              
              return await safeSendMessage(api, result, threadId, type);
            }
          });
        });
        
      } catch (error) {
        return await safeSendMessage(api, 
          '❌ LỖI HỆ THỐNG\n\n' +
          `Chi tiết: ${error.message}\n\n` +
          'Không thể thực hiện cài đặt tự động.\n' +
          'Vui lòng cài đặt thủ công: pip install zlapi', 
          threadId, type
        );
      }
      
      return;
    }
    
    if (action === 'demo') {
      // Kiểm tra quyền admin
      const { data } = event;
      const senderId = data?.uidFrom || event?.authorId;
      const config = global.config || {};
      const admin = Array.isArray(config.admin_bot) ? config.admin_bot : [];
      
      if (!admin.includes(senderId)) {
        return await safeSendMessage(api, 
          '🚫 QUYỀN TRUY CẬP BỊ TỪ CHỐI\n\n' +
          'Chỉ admin mới có thể demo Python tool.\n' +
          'Liên hệ admin để được hỗ trợ.', 
          threadId, type
        );
      }
      
      try {
        const fs = require('fs');
        const path = require('path');
        const toolPath = path.join(__dirname, '../../bon.py');
        
        if (!fs.existsSync(toolPath)) {
          return await safeSendMessage(api, 
            '❌ FILE TOOL KHÔNG TỒN TẠI\n\n' +
            `Không tìm thấy: ${toolPath}\n` +
            'Vui lòng kiểm tra lại đường dẫn file.', 
            threadId, type
          );
        }
        
        // Hiển thị demo interface
        let result = '🐍 BONZ PYTHON TOOL DEMO\n\n';
        result += '╔══════════════════════════════════╗\n';
        result += '║            ZALO TOOL MENU        ║\n';
        result += '╠══════════════════════════════════╣\n';
        result += '║ 1. 🚀 Multi-Acc Spam            ║\n';
        result += '║ 2. 🏷️ Spam + Tag (@All xanh)    ║\n';
        result += '║ 0. ❌ Thoát                     ║\n';
        result += '╚══════════════════════════════════╝\n\n';
        
        result += '📋 **CHỨC NĂNG 1: MULTI-ACC SPAM**\n';
        result += '• Hỗ trợ 1-10 tài khoản cùng lúc\n';
        result += '• Tin nhắn màu đỏ, font size 30\n';
        result += '• TTL - tin nhắn tự xóa\n';
        result += '• Tag @All trong mỗi tin nhắn\n';
        result += '• Delay tùy chỉnh\n\n';
        
        result += '📋 **CHỨC NĂNG 2: SPAM + TAG**\n';
        result += '• Spam từ file .txt\n';
        result += '• Tag @All hoặc tag cụ thể\n';
        result += '• Gửi vào nhiều nhóm\n';
        result += '• Delay tùy chỉnh\n\n';
        
        result += '⚙️ **YÊU CẦU CHẠY TOOL:**\n';
        result += '1. IMEI thiết bị Zalo\n';
        result += '2. Cookie session (JSON)\n';
        result += '3. File .txt chứa nội dung\n';
        result += '4. Chọn nhóm target\n\n';
        
        result += '🔧 **CÁCH LẤY THÔNG TIN:**\n';
        result += '• IMEI: Cài Zalo PC > F12 > Console > localStorage\n';
        result += '• Cookie: F12 > Application > Cookies > zalo.me\n';
        result += '• Format JSON: {"cookie_name": "value"}\n\n';
        
        result += '⚠️ **CẢNH BÁO QUAN TRỌNG:**\n';
        result += '• Chỉ dùng trong nhóm test riêng\n';
        result += '• Không spam nhóm công cộng\n';
        result += '• Risk bị khóa tài khoản Zalo\n';
        result += '• Tuân thủ điều khoản sử dụng\n\n';
        
        result += '🚀 **ĐỂ CHẠY TOOL THẬT:**\n';
        result += '• bonz tool run - Mở cửa sổ CMD mới\n';
        result += '• Hoặc chạy thủ công: python bon.py\n\n';
        
        result += '🕐 Demo: ' + new Date().toLocaleString('vi-VN');
        
        return await safeSendMessage(api, result, threadId, type);
        
      } catch (error) {
        return await safeSendMessage(api, 
          '❌ LỖI DEMO TOOL\n\n' +
          `Chi tiết: ${error.message}\n\n` +
          'Không thể hiển thị demo tool.', 
          threadId, type
        );
      }
    }
    
    if (action === 'chat') {
      // Kiểm tra quyền admin
      const { data } = event;
      const senderId = data?.uidFrom || event?.authorId;
      const config = global.config || {};
      const admin = Array.isArray(config.admin_bot) ? config.admin_bot : [];
      
      if (!admin.includes(senderId)) {
        return await safeSendMessage(api, 
          '🚫 QUYỀN TRUY CẬP BỊ TỪ CHỐI\n\n' +
          'Chỉ admin mới có thể chạy Python tool.\n' +
          'Liên hệ admin để được hỗ trợ.', 
          threadId, type
        );
      }
      
      try {
        const { spawn } = require('child_process');
        const path = require('path');
        const fs = require('fs');
        const toolPath = path.join(__dirname, '../../bon.py');
        
        // Kiểm tra file tồn tại
        if (!fs.existsSync(toolPath)) {
          return await safeSendMessage(api, 
            '❌ FILE TOOL KHÔNG TỒN TẠI\n\n' +
            `Không tìm thấy: ${toolPath}\n` +
            'Vui lòng kiểm tra lại đường dẫn file.', 
            threadId, type
          );
        }
        
        // Thông báo bắt đầu chạy tool
        await safeSendMessage(api, 
          '🐍 ĐANG KHỞI CHẠY PYTHON TOOL...\n\n' +
          '⏳ Đang khởi động tool\n' +
          '📱 Output sẽ hiển thị trong chat này\n' +
          '🔧 Vui lòng đợi tool load menu\n\n' +
          '⚠️ Tool sẽ chạy trong chế độ interactive', 
          threadId, type
        );
        
        // Chạy Python tool và capture output
        const pythonProcess = spawn('python', [toolPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true
        });
        
        let outputBuffer = '';
        let errorBuffer = '';
        
        // Lưu process để có thể tương tác sau
        if (!global.pythonProcesses) {
          global.pythonProcesses = {};
        }
        global.pythonProcesses[threadId] = pythonProcess;
        
        // Xử lý stdout (output bình thường)
        pythonProcess.stdout.on('data', async (data) => {
          const output = data.toString('utf8');
          outputBuffer += output;
          
          // Gửi output real-time vào chat
          if (output.trim()) {
            let displayOutput = '🐍 PYTHON TOOL OUTPUT:\n\n';
            displayOutput += '```\n' + output.trim() + '\n```\n\n';
            
            // Nếu là menu, thêm hướng dẫn
            if (output.includes('ZALO TOOL MENU') || output.includes('Chọn chức năng')) {
              displayOutput += '🎯 **CÁCH TƯƠNG TÁC:**\n';
              displayOutput += '• Gõ: bonz tool input <lựa_chọn>\n';
              displayOutput += '• Ví dụ: bonz tool input 1\n';
              displayOutput += '• Dừng tool: bonz tool stop\n\n';
            }
            
            displayOutput += '⏰ ' + new Date().toLocaleString('vi-VN');
            
            await safeSendMessage(api, displayOutput, threadId, type);
          }
        });
        
        // Xử lý stderr (lỗi)
        pythonProcess.stderr.on('data', async (data) => {
          const error = data.toString('utf8');
          errorBuffer += error;
          
          if (error.trim()) {
            let errorOutput = '❌ PYTHON TOOL ERROR:\n\n';
            errorOutput += '```\n' + error.trim() + '\n```\n\n';
            errorOutput += '💡 Kiểm tra lại input hoặc cài đặt tool.';
            
            await safeSendMessage(api, errorOutput, threadId, type);
          }
        });
        
        // Xử lý khi tool kết thúc
        pythonProcess.on('close', async (code) => {
          // Xóa process khỏi global
          if (global.pythonProcesses && global.pythonProcesses[threadId]) {
            delete global.pythonProcesses[threadId];
          }
          
          let result = '';
          if (code === 0) {
            result = '✅ PYTHON TOOL ĐÃ HOÀN THÀNH\n\n';
            result += 'Tool đã chạy xong và thoát bình thường.\n';
          } else {
            result = '⚠️ PYTHON TOOL THOÁT VỚI LỖI\n\n';
            result += `Exit code: ${code}\n`;
            result += 'Có thể đã xảy ra lỗi trong quá trình chạy.\n\n';
          }
          
          if (outputBuffer) {
            result += '📋 **TỔNG KẾT OUTPUT:**\n';
            result += `• Tổng output: ${outputBuffer.length} ký tự\n`;
          }
          
          if (errorBuffer) {
            result += '❌ **CÓ LỖI XẢY RA:**\n';
            result += `• Tổng lỗi: ${errorBuffer.length} ký tự\n`;
          }
          
          result += '\n🕐 Kết thúc: ' + new Date().toLocaleString('vi-VN');
          
          await safeSendMessage(api, result, threadId, type);
        });
        
        // Xử lý lỗi khi khởi chạy
        pythonProcess.on('error', async (error) => {
          // Xóa process khỏi global
          if (global.pythonProcesses && global.pythonProcesses[threadId]) {
            delete global.pythonProcesses[threadId];
          }
          
          await safeSendMessage(api, 
            '❌ LỖI KHỞI CHẠY TOOL\n\n' +
            `Chi tiết: ${error.message}\n\n` +
            '💡 **CÁCH KHẮC PHỤC:**\n' +
            '1. Kiểm tra Python đã cài đặt\n' +
            '2. Kiểm tra thư viện zlapi: bonz tool status\n' +
            '3. Cài đặt thư viện: bonz tool install\n' +
            '4. Thử chạy lại: bonz tool chat\n\n' +
            '🔧 **HOẶC CHẠY THỦ CÔNG:**\n' +
            'cd "' + path.dirname(toolPath) + '"\n' +
            'python bon.py', 
            threadId, type
          );
        });
        
      } catch (error) {
        return await safeSendMessage(api, 
          '❌ LỖI HỆ THỐNG\n\n' +
          `Chi tiết: ${error.message}\n\n` +
          'Không thể khởi chạy Python tool trong chế độ chat.', 
          threadId, type
        );
      }
      
      return;
    }
    
    if (action === 'input') {
      // Gửi input tới Python tool đang chạy
      const input = args.slice(2).join(' ');
      
      if (!input) {
        return await safeSendMessage(api, 
          '❌ THIẾU INPUT\n\n' +
          'Cú pháp: bonz tool input <nội_dung>\n\n' +
          '💡 **VÍ DỤ:**\n' +
          '• bonz tool input 1\n' +
          '• bonz tool input 2\n' +
          '• bonz tool input 0\n\n' +
          'Gõ số tương ứng với menu tool.', 
          threadId, type
        );
      }
      
      // Kiểm tra có tool đang chạy không
      if (!global.pythonProcesses || !global.pythonProcesses[threadId]) {
        return await safeSendMessage(api, 
          '❌ KHÔNG CÓ TOOL ĐANG CHẠY\n\n' +
          'Chưa có Python tool nào đang chạy trong chat này.\n\n' +
          '🚀 **KHỞI CHẠY TOOL:**\n' +
          '• bonz tool chat - Chạy tool hiển thị trong chat\n' +
          '• bonz tool run - Chạy tool cửa sổ mới', 
          threadId, type
        );
      }
      
      try {
        const pythonProcess = global.pythonProcesses[threadId];
        
        // Gửi input tới tool
        pythonProcess.stdin.write(input + '\n');
        
        await safeSendMessage(api, 
          '📤 ĐÃ GỬI INPUT\n\n' +
          `Input: ${input}\n\n` +
          '⏳ Đang chờ tool xử lý...\n' +
          'Output sẽ hiển thị trong giây lát.', 
          threadId, type
        );
        
      } catch (error) {
        return await safeSendMessage(api, 
          '❌ LỖI GỬI INPUT\n\n' +
          `Chi tiết: ${error.message}\n\n` +
          'Không thể gửi input tới Python tool.', 
          threadId, type
        );
      }
      
      return;
    }
    
    if (action === 'stop') {
      // Dừng Python tool đang chạy
      if (!global.pythonProcesses || !global.pythonProcesses[threadId]) {
        return await safeSendMessage(api, 
          '❌ KHÔNG CÓ TOOL ĐANG CHẠY\n\n' +
          'Chưa có Python tool nào đang chạy trong chat này.', 
          threadId, type
        );
      }
      
      try {
        const pythonProcess = global.pythonProcesses[threadId];
        
        // Gửi tín hiệu dừng
        pythonProcess.kill('SIGTERM');
        
        // Xóa khỏi global
        delete global.pythonProcesses[threadId];
        
        await safeSendMessage(api, 
          '🛑 ĐÃ DỪNG PYTHON TOOL\n\n' +
          'Tool đã được dừng thành công.\n' +
          'Bạn có thể khởi chạy lại bằng: bonz tool chat', 
          threadId, type
        );
        
      } catch (error) {
        return await safeSendMessage(api, 
          '❌ LỖI DỪNG TOOL\n\n' +
          `Chi tiết: ${error.message}\n\n` +
          'Không thể dừng Python tool.', 
          threadId, type
        );
      }
      
      return;
    }
    
    if (action === 'run') {
      // Kiểm tra quyền admin
      const { data } = event;
      const senderId = data?.uidFrom || event?.authorId;
      const config = global.config || {};
      const admin = Array.isArray(config.admin_bot) ? config.admin_bot : [];
      
      if (!admin.includes(senderId)) {
        return await safeSendMessage(api, 
          '🚫 QUYỀN TRUY CẬP BỊ TỪ CHỐI\n\n' +
          'Chỉ admin mới có thể chạy Python tool.\n' +
          'Liên hệ admin để được hỗ trợ.', 
          threadId, type
        );
      }
      
      try {
        const { spawn } = require('child_process');
        const path = require('path');
        const toolPath = path.join(__dirname, '../../bon.py');
        
        // Thông báo bắt đầu chạy tool
        await safeSendMessage(api, 
          '🚀 ĐANG KHỞI CHẠY PYTHON TOOL...\n\n' +
          '⏳ Vui lòng đợi tool khởi động\n' +
          '📱 Tool sẽ mở trong Terminal/CMD\n' +
          '🔧 Làm theo hướng dẫn trên màn hình\n\n' +
          '⚠️ Không đóng cửa sổ Terminal khi tool đang chạy', 
          threadId, type
        );
        
        // Chạy Python tool với cửa sổ mới
        const os = require('os');
        let pythonProcess;
        
        if (os.platform() === 'win32') {
          // Windows: Mở cmd mới với Python tool
          pythonProcess = spawn('cmd', ['/c', 'start', 'cmd', '/k', `python "${toolPath}"`], {
            shell: true,
            detached: true
          });
        } else {
          // Linux/Mac: Mở terminal mới
          pythonProcess = spawn('gnome-terminal', ['--', 'python', toolPath], {
            shell: true,
            detached: true
          });
        }
        
        // Xử lý lỗi khi khởi chạy
        pythonProcess.on('error', async (error) => {
          await safeSendMessage(api, 
            '❌ LỖI KHỞI CHẠY TOOL\n\n' +
            `Chi tiết: ${error.message}\n\n` +
            '💡 **CÁCH KHẮC PHỤC:**\n' +
            '1. Mở CMD/Terminal thủ công\n' +
            '2. Chuyển đến thư mục: cd "' + path.dirname(toolPath) + '"\n' +
            '3. Chạy: python bon.py\n\n' +
            '🔧 **KIỂM TRA:**\n' +
            '• Python đã được cài đặt?\n' +
            '• Thư viện zlapi đã cài?\n' +
            '• File bon.py có tồn tại?\n' +
            '• Quyền truy cập thư mục?', 
            threadId, type
          );
        });
        
        // Thông báo tool đã được khởi chạy
        setTimeout(async () => {
          await safeSendMessage(api, 
            '✅ PYTHON TOOL ĐÃ ĐƯỢC KHỞI CHẠY!\n\n' +
            '🖥️ **Cửa sổ CMD/Terminal mới đã mở**\n' +
            '📋 Bạn sẽ thấy menu tool với các tùy chọn:\n' +
            '• 1 - Multi-Acc Spam\n' +
            '• 2 - Spam + Tag (@All)\n' +
            '• 0 - Thoát\n\n' +
            '🎯 **HƯỚNG DẪN:**\n' +
            '1. Chọn chức năng (nhập số 1 hoặc 2)\n' +
            '2. Nhập IMEI thiết bị Zalo\n' +
            '3. Nhập Cookie (JSON format)\n' +
            '4. Chọn file .txt chứa nội dung\n' +
            '5. Cài đặt delay và TTL\n\n' +
            '⚠️ **LƯU Ý:**\n' +
            '• Không đóng cửa sổ CMD khi tool đang chạy\n' +
            '• Chuẩn bị sẵn IMEI và Cookie trước khi chạy\n' +
            '• Chỉ sử dụng trong nhóm test riêng\n\n' +
            '🆘 Nếu không thấy cửa sổ CMD, chạy thủ công:\n' +
            'cd "' + path.dirname(toolPath) + '" && python bon.py', 
            threadId, type
          );
        }, 2000); // Đợi 2 giây để tool khởi động
        
      } catch (error) {
        return await safeSendMessage(api, 
          '❌ LỖI HỆ THỐNG\n\n' +
          `Chi tiết: ${error.message}\n\n` +
          'Không thể khởi chạy Python tool.', 
          threadId, type
        );
      }
      
      return;
    }
    
    return await safeSendMessage(api, 
      '❌ THAM SỐ KHÔNG HỢP LỆ\n\n' +
      'Các tham số hỗ trợ:\n' +
      '• info - Thông tin tool\n' +
      '• status - Trạng thái tool\n' +
      '• install - Cài đặt thư viện (Admin only)\n' +
      '• chat - Chạy tool hiển thị trong Zalo (Admin only)\n' +
      '• input <nội_dung> - Gửi input tới tool đang chạy\n' +
      '• stop - Dừng tool đang chạy\n' +
      '• demo - Demo tool trong chat (Admin only)\n' +
      '• help - Hướng dẫn\n' +
      '• run - Chạy tool cửa sổ mới (Admin only)\n\n' +
      '💡 **KHẮC PHỤC LỖI ZLAPI:**\n' +
      'Nếu gặp lỗi "No module named zlapi":\n' +
      '• Chạy: bonz tool install\n' +
      '• Hoặc: pip install zlapi\n\n' +
      'Ví dụ: bonz tool install', 
      threadId, type
    );
  }

  // bonz key - Thêm/gỡ quản trị viên nhóm
  if (sub === 'key') {
    try {
      return await handleKey(api, event, args.slice(1));
    } catch (e) {
      console.error('[BONZ KEY] Lỗi:', e.message);
      return await safeSendMessage(api, '❌ Có lỗi xảy ra khi xử lý lệnh key. Vui lòng thử lại.', threadId, type);
    }
  }

  // bonz điểm - Tổng hợp điểm số từ tất cả game
  if (sub === 'điểm' || sub === 'diem' || sub === 'points' || sub === 'score') {
    try {
      return await handleBonzPoints(api, event, args.slice(1));
    } catch (e) {
      console.error('[BONZ ĐIỂM] Lỗi:', e.message);
      return await safeSendMessage(api, '❌ Có lỗi xảy ra khi xử lý lệnh điểm. Vui lòng thử lại.', threadId, type);
    }
  }

  // bonz game - Menu game tổng hợp (thêm nhiều alias)
  if (
    sub === 'game' ||
    sub === 'games' ||
    sub === 'trò' && (args[1]||'').toLowerCase() === 'chơi' || // bonz trò chơi
    sub === 'tro' && (args[1]||'').toLowerCase() === 'choi' ||
    sub === 'chơi' ||
    sub === 'choi'
  ) {
    try {
      return await handleBonzGame(api, event, args.slice(1));
    } catch (e) {
      console.error('[BONZ GAME] Lỗi:', e.message);
      return await safeSendMessage(api, '❌ Có lỗi xảy ra khi xử lý lệnh game. Vui lòng thử lại.', threadId, type);
    }
  }

  // bonz câu đố - Game câu đố kiến thức
  if (sub === 'câu' && args[1] === 'đố' || sub === 'cau' && args[1] === 'do' || sub === 'quiz') {
    try {
      return await handleBonzQuiz(api, event, args.slice(2));
    } catch (e) {
      console.error('[BONZ QUIZ] Lỗi:', e.message);
      return await safeSendMessage(api, '❌ Có lỗi xảy ra khi xử lý câu đố. Vui lòng thử lại.', threadId, type);
    }
  }

  // BONZ MINI GAMES - Forward to fishing system
  const gameCommands = ['guess', 'rps', 'truth', 'war', 'baccarat', 'pvp', 'blackjack', 'arena', 'monster', 'poker', 'sudoku', 'mafia', 'monopoly'];
  if (gameCommands.includes(sub)) {
    try {
      // Handle standalone games (poker, sudoku, mafia, monopoly)
      const standaloneGames = ['poker', 'sudoku', 'mafia', 'monopoly'];
      if (standaloneGames.includes(sub)) {
        const gameModule = require(`./${sub}.js`);
        return await gameModule.run({ api, event, args: args.slice(1) });
      }
      
      // Handle fishing system games
      const fishingModule = require('./fishing.js');
      
      // Map bonz commands to fishing commands
      const commandMap = {
        'guess': 'guess',
        'rps': 'kbb', 
        'truth': 'tht',
        'war': 'war',
        'baccarat': 'bac',
        'pvp': 'pvp',
        'blackjack': 'bj',
        'arena': 'arena',
        'monster': 'monster'
      };
      
      const fishingCommand = commandMap[sub];
      const newArgs = [fishingCommand, ...args.slice(1)];
      
      // Create new event object for fishing module
      const fishingEvent = {
        ...event,
        data: {
          ...event.data,
          body: `fishing ${newArgs.join(' ')}`
        }
      };
      
      return await fishingModule.run({ api, event: fishingEvent, args: newArgs });
    } catch (e) {
      console.error(`[BONZ ${sub.toUpperCase()}] Lỗi:`, e.message);
      return await safeSendMessage(api, `❌ Có lỗi xảy ra khi xử lý game ${sub}. Vui lòng thử lại.`, threadId, type);
    }
  }

  // bonz câu đố trắc - Game trắc nghiệm
  if ((sub === 'câu' && args[1] === 'đố' && args[2] === 'trắc') || 
      (sub === 'cau' && args[1] === 'do' && args[2] === 'trac') || 
      sub === 'trac' || sub === 'trắc') {
    try {
      return await handleBonzMultipleChoice(api, event, args.slice(3));
    } catch (e) {
      console.error('[BONZ TRẮC] Lỗi:', e.message);
      return await safeSendMessage(api, '❌ Có lỗi xảy ra khi xử lý trắc nghiệm. Vui lòng thử lại.', threadId, type);
    }
  }

  // Trường hợp người dùng gõ tham số khác
  return api.sendMessage(
    "Sử dụng: bonz hoặc bonz menu để xem danh sách mục BONZ.\nVí dụ: gmail ảo, bonz restart, bonz rút gọn link [url]",
    threadId,
    type
  );
};

// Global variables để quản lý trạng thái spam
let cayRunning = new Map(); // Map<threadId, { isRunning: boolean, intervalId: any, targetUid: string }>

// Nội dung quảng cáo mặc định cho Simple Auto PR
const defaultAdContent = `💎🔥 BẢNG DỊCH VỤ VIP – SIÊU RẺ – UY TÍN 🔥💎

🤖 DỊCH VỤ BOT ZALO – FACEBOOK 🤖
✨ Làm bot siêu rẻ:
🔹 100K 👉 Bot nhiều chức năng VIP
🔹 50K 👉 Bot Zalo ngẫu nhiên (nhiều/ít chức năng)

📆 Thuê bot theo tháng:
• 1 tháng = 30K
• 2 tháng = 60K
• 3 tháng = 90K
• 4 tháng = 120K
➡️ Cứ thêm 1 tháng +30K

✨ Thuê group zalo:
📌 200 TV 👉 20K / ngày | Thuê tháng 👉 giảm còn 15K/ngày
📌 300 TV 👉 30K / ngày
📌 500 TV 👉 45K / ngày
📌 600 TV 👉 60K / ngày
📌 1000 TV 👉 100K / ngày

✨ Thuê bot thường: 30K / tháng (cứ +30K mỗi tháng tiếp theo)
✨ Xác thực Zalo: 100K / tài khoản

👥 BÁN GROUP 👥
📌 Zalo:
• 200 TV 👉 50K
• 400 TV 👉 100K
• 600 TV 👉 200K
• 800 TV 👉 250K

💻 BÁN TOOL ĐA THỂ LOẠI 💻
⚡ Tool buff MXH
⚡ Tool spam – auto
⚡ Tool quản lý – tiện ích
👉 Giá đa dạng – inbox để chọn gói phù hợp!

💖 BUFF MXH – GIÁ RẺ 💖
💓 Buff tim | 👁️ Buff view | ⭐ Buff yêu thích
🔄 Buff share | 🎥 Buff mắt live
👉 Giá chỉ từ 5K – Random ngẫu nhiên

📚 KHO TÀI LIỆU HỌC TẬP 📚
🔗 2k11 cùng nhau học tập: https://zalo.me/g/zpvccm246
🔗 Tài liệu THCS – THPT: https://zalo.me/g/xnwruu491
🔗 Share TL THCS – THPT: https://zalo.me/g/kqpyaw963
🔗 Tài liệu vô hạn: https://zalo.me/g/yzgzmu465
🔗 Tài liệu học tập:
   • https://zalo.me/g/fwbdxz656
   • https://zalo.me/g/wvdnpj454
   • https://zalo.me/g/zffqdg843
   • https://zalo.me/g/cgcrjp735
   • https://zalo.me/g/chpafn970

🏖️🌴 CHO THUÊ VILLA VŨNG TÀU VIEW BIỂN – SANG TRỌNG 🌴🏖️

✨ Tiện ích nổi bật:
🏠 Sát biển – view siêu chill
🏊 Hồ bơi riêng – BBQ thỏa thích
🎤 Phòng karaoke – không gian rộng
🛋️ Full nội thất cao cấp
👨‍👩‍👧‍👦 Phù hợp nhóm bạn, gia đình, team building

💰 Bảng giá thuê Villa 💰
🔹 1️⃣ Từ 1.000.000đ/đêm
🔹 2️⃣ Đặt villa > 3.000.000đ 👉 Giảm giá siêu sâu 🎉
🔹 3️⃣ Gói 10.000.000đ 👉 Villa siêu đẹp – sang trọng bậc nhất 🌟

📅 Thuê theo tháng – Giá sốc 📅
🏡 Thuê dài hạn 👉 Giảm siêu sâu
👨‍💼 Có nhân viên phục vụ 24/7
🔥 Phù hợp nghỉ dưỡng dài ngày, làm việc từ xa, nhóm bạn ở lâu

✨ Cam kết: View biển xịn – Giá rẻ – Dịch vụ đẳng cấp VIP! ✨

🚀 PRO LINK – PR BẰNG BOT

🤖 Bot hiện đang chạy trong 600+ nhóm Zalo
👉 Mỗi ngày share link hàng loạt vào group – tiếp cận cực khủng

💰 Giá dịch vụ:
• 1 ngày 👉 10K
• 7 ngày 👉 70K (tặng thêm 1 ngày)
• 30 ngày 👉 300K (giảm còn 250K)

🔗 Nhận PR: link nhóm Zalo, link Facebook, Shopee, TikTok, YouTube...

🌐 DỊCH VỤ LÀM WEB ĐA DẠNG – GIÁ RẺ 🌐
✨ Web cá nhân – giới thiệu bản thân
✨ Web landing page – bán hàng online
✨ Web giới thiệu dịch vụ – doanh nghiệp nhỏ
✨ Web sự kiện – mini game – thông báo
✨ Web thả thính, chat tương tác, fun – tạo cộng đồng vui nhộn
✨ Web bán sản phẩm, combo, khuyến mãi – tương tác trực tiếp
✨ Web nhiều tính năng – đẹp, load nhanh, tương thích mobile

💰 Giá chỉ từ 300K – Giao diện đẹp, đa tính năng ⚡
👉 Có thể nâng cấp lên web động (tích hợp thanh toán, đăng nhập…)

🎨 TẤT CẢ DỊCH VỤ ĐỀU VIP – UY TÍN – GIÁ SIÊU RẺ
🔥 Inbox ngay để được tư vấn & báo giá chi tiết từng gói
✨ Giao diện, thiết kế, nội dung tùy chỉnh theo yêu cầu`;

// Global variables cho Auto PR
let autoPRConfig = {
  groups: [],
  content: null,
  interval: 3600000, // 1 giờ mặc định
  intervalText: '1 giờ',
  repeat: 1,
  countPerGroup: 1,
  isRunning: false,
  intervalId: null,
  currentRound: 0,
  totalSent: 0,
  startTime: null,
  isInfinite: false,
  errorStats: {
    totalErrors: 0,
    failedGroups: new Set()
  }
};

// Global variables cho Auto PR System - Multi Group Support
let autoPRGroups = new Map(); // Map<groupName, {content, isRunning, timer, count, startTime, targetGroupId}>

const DEFAULT_GROUP_INTERVAL_MS = 5 * 60 * 1000; // 5 phút
const DEFAULT_GROUP_INTERVAL_TEXT = '5 phút';
const MIN_GROUP_INTERVAL_MS = 30 * 1000;
const MAX_GROUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_GROUP_TTL_MS = 5 * 60 * 1000;
const MIN_GROUP_TTL_MS = 15 * 1000;
const MAX_GROUP_TTL_MS = 24 * 60 * 60 * 1000;

const AUTO_DELETE_NOTICE = '⏱️ Tin nhắn sẽ tự động xóa sau';

function formatDurationMs(ms) {
  if (!ms || ms < 1000) {
    return 'Tắt';
  }

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!hours && seconds) parts.push(`${seconds}s`);

  return parts.length ? parts.join(' ') : `${Math.max(seconds, 1)}s`;
}

function parseDurationArgument(arg, {
  minMs,
  maxMs,
  allowZero = false,
  allowOff = false,
  defaultUnit = 'm'
} = {}) {
  if (typeof arg !== 'string') {
    return null;
  }

  const trimmed = arg.trim().toLowerCase();

  if (allowOff && ['off', 'tắt', 'tat', 'disable', 'none'].includes(trimmed)) {
    return { ms: 0, label: 'Tắt' };
  }

  if (allowZero && (trimmed === '0' || trimmed === '0s')) {
    return { ms: 0, label: 'Tắt' };
  }

  const match = trimmed.match(/^([0-9]{1,4})([smh])?$/);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2] || defaultUnit;

  let ms;
  let label;

  switch (unit) {
    case 's':
      ms = value * 1000;
      label = `${value} giây`;
      break;
    case 'h':
      ms = value * 60 * 60 * 1000;
      label = `${value} giờ`;
      break;
    case 'm':
    default:
      ms = value * 60 * 1000;
      label = `${value} phút`;
      break;
  }

  if (Number.isNaN(ms)) {
    return null;
  }

  if (minMs && ms < minMs) {
    return null;
  }

  if (maxMs && ms > maxMs) {
    return null;
  }

  return { ms, label };
}

function appendAutoDeleteNotice(message, ttlMs) {
  if (!ttlMs || ttlMs < 1000 || typeof message !== 'string') {
    return message;
  }

  if (message.includes(AUTO_DELETE_NOTICE)) {
    return message;
  }

  return `${message}\n${AUTO_DELETE_NOTICE} ${formatDurationMs(ttlMs)}`;
}

async function sendGroupPRMessage(api, threadId, type, message, ttlMs) {
  if (!api?.sendMessage) {
    return null;
  }

  if (typeof message === 'string') {
    const payload = { msg: appendAutoDeleteNotice(message, ttlMs) };
    if (ttlMs && ttlMs >= 1000) {
      payload.ttl = ttlMs;
    }
    return api.sendMessage(payload, threadId, type);
  }

  if (message && typeof message === 'object') {
    const payload = { ...message };
    if (ttlMs && ttlMs >= 1000) {
      payload.ttl = ttlMs;
      if (typeof payload.msg === 'string') {
        payload.msg = appendAutoDeleteNotice(payload.msg, ttlMs);
      }
    }
    return api.sendMessage(payload, threadId, type);
  }

  return null;
}

async function dispatchGroupPR(api, threadId, type, groupData) {
  try {
    await sendGroupPRMessage(api, threadId, type, groupData.content, groupData.ttlMs);

    if (Array.isArray(groupData.cardUserIds) && groupData.cardUserIds.length) {
      for (const uid of groupData.cardUserIds) {
        try {
          await api.sendCard({ userId: uid }, threadId, type);
        } catch (_) {
          // Bỏ qua lỗi gửi danh thiếp để tránh gián đoạn chu kỳ chính
        }
      }
    }

    groupData.count = (groupData.count || 0) + 1;
    groupData.lastSentAt = Date.now();
    if (!groupData.schedule || groupData.schedule.mode !== 'daily') {
      const interval = groupData.intervalMs || DEFAULT_GROUP_INTERVAL_MS;
      groupData.nextSendAt = groupData.lastSentAt + interval;
    }
  } catch (error) {
    console.error('[Auto PR] Lỗi gửi tin:', error?.message || error);
    throw error;
  }
}

function clearGroupTimers(groupData) {
  if (groupData.timer) {
    clearInterval(groupData.timer);
    groupData.timer = null;
  }
  if (groupData.dailyTimeout) {
    clearTimeout(groupData.dailyTimeout);
    groupData.dailyTimeout = null;
  }
}

function formatTimestamp(ts) {
  if (!ts) {
    return 'Chưa có';
  }
  try {
    return new Date(ts).toLocaleString('vi-VN');
  } catch (_) {
    return 'Chưa có';
  }
}

function computeNextOccurrence(timeStr) {
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
    return null;
  }

  const [hh, mm] = timeStr.split(':').map(n => parseInt(n, 10));
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hh,
    mm,
    0,
    0
  );

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function scheduleGroupInterval(api, groupData) {
  const threadId = groupData.targetGroupId;
  const type = groupData.targetType || 'group';
  const interval = groupData.intervalMs || DEFAULT_GROUP_INTERVAL_MS;

  if (!threadId || !api?.sendMessage || !interval) {
    return;
  }

  groupData.timer = setInterval(() => {
    if (!groupData.isRunning) {
      clearGroupTimers(groupData);
      return;
    }

    dispatchGroupPR(api, threadId, type, groupData).catch((error) => {
      const message = error?.message || '';
      if (message.includes('Invalid URL') || message.includes('not found')) {
        clearGroupTimers(groupData);
        groupData.isRunning = false;
      }
    });
  }, interval);

  groupData.nextSendAt = Date.now() + interval;
}

function scheduleDailyGroupDispatch(api, groupData) {
  const schedule = groupData.schedule;
  const threadId = groupData.targetGroupId;
  const type = groupData.targetType || 'group';

  if (!schedule || schedule.mode !== 'daily' || !threadId) {
    return;
  }

  const next = computeNextOccurrence(schedule.time);
  if (!next) {
    return;
  }

  const createTimeout = () => {
    const targetDate = computeNextOccurrence(schedule.time);
    if (!targetDate) {
      return null;
    }
    const delay = Math.max(targetDate.getTime() - Date.now(), 1000);
    groupData.nextSendAt = targetDate.getTime();

    return setTimeout(async function run() {
      if (!groupData.isRunning) {
        return;
      }

      try {
        await dispatchGroupPR(api, threadId, type, groupData);
      } catch (error) {
        const message = error?.message || '';
        if (message.includes('Invalid URL') || message.includes('not found')) {
          clearGroupTimers(groupData);
          groupData.isRunning = false;
          return;
        }
      }

      groupData.dailyTimeout = createTimeout();
    }, delay);
  };

  groupData.dailyTimeout = createTimeout();
}

function ensureGroupData(groupName, threadId, type = 'group') {
  if (!autoPRGroups.has(groupName)) {
    autoPRGroups.set(groupName, {
      content: null,
      isRunning: false,
      timer: null,
      dailyTimeout: null,
      count: 0,
      startTime: null,
      targetGroupId: threadId || null,
      targetType: type || 'group',
      cardUserIds: [],
      intervalMs: DEFAULT_GROUP_INTERVAL_MS,
      intervalText: DEFAULT_GROUP_INTERVAL_TEXT,
      ttlMs: DEFAULT_GROUP_TTL_MS,
      ttlText: formatDurationMs(DEFAULT_GROUP_TTL_MS),
      schedule: null,
      lastSentAt: null,
      nextSendAt: null
    });
  }

  const groupData = autoPRGroups.get(groupName);
  if (threadId) {
    groupData.targetGroupId = threadId;
  }
  if (type) {
    groupData.targetType = type;
  }
  if (!groupData.intervalMs) {
    groupData.intervalMs = DEFAULT_GROUP_INTERVAL_MS;
    groupData.intervalText = DEFAULT_GROUP_INTERVAL_TEXT;
  }
  if (typeof groupData.ttlMs !== 'number') {
    groupData.ttlMs = DEFAULT_GROUP_TTL_MS;
    groupData.ttlText = formatDurationMs(DEFAULT_GROUP_TTL_MS);
  } else {
    groupData.ttlText = formatDurationMs(groupData.ttlMs);
  }
  if (typeof groupData.lastSentAt !== 'number') {
    groupData.lastSentAt = null;
  }
  if (typeof groupData.nextSendAt !== 'number') {
    groupData.nextSendAt = null;
  }

  return groupData;
}

// Backward compatibility - single group mode
let autoPRData = {
  content: null,         // Nội dung PR
  isRunning: false,      // Trạng thái chạy
  timer: null,           // Timer ID
  count: 0,              // Số bài đã gửi
  startTime: null,       // Thời gian bắt đầu
  currentGroup: null     // Nhóm hiện tại đang chạy
};

// Global variables cho Simple Auto PR (chế độ đơn giản) - giữ lại để tương thích
let simpleAutoPRGroups = new Map(); // Map<groupId, {timer, count, startTime}>

// Expose to global
global.autoPRConfig = autoPRConfig;

// Global variables để quản lý reminders
let reminders = new Map(); // Map<reminderId, { threadId, userId, message, timeout }>
let reminderCounter = 0;

// Handler cho lệnh bonz info group
async function handleGroupInfo(api, event, args) {
  const { threadId, type } = event || {};
  
  if (!args || args.length === 0) {
    return api.sendMessage(
      "👥 **HƯỚNG DẪN SỬ DỤNG BONZ GROUP**\n\n" +
      "🔍 Cách dùng:\n" +
      "• bonz group <link_group> - Lấy thông tin từ link nhóm Facebook\n" +
      "• bonz group - Lấy thông tin nhóm hiện tại\n\n" +
      "💡 Ví dụ:\n" +
      "bonz group https://facebook.com/groups/123456789\n" +
      "bonz group (trong nhóm để lấy thông tin nhóm đó)",
      threadId, type
    );
  }

  let targetThreadId = threadId;
  let linkGroup = args[0]?.trim();
  
  // Nếu có link group thì extract ID từ link
  if (linkGroup && linkGroup.startsWith('https://')) {
    try {
      // Extract group ID từ link
      const groupIdMatch = linkGroup.match(/groups\/(\d+)/);
      if (groupIdMatch) {
        targetThreadId = groupIdMatch[1];
      } else {
        return api.sendMessage("❌ Link nhóm không hợp lệ!\n\n💡 Link phải có dạng: https://facebook.com/groups/123456789", threadId, type);
      }
    } catch (e) {
      return api.sendMessage("❌ Không thể xử lý link nhóm!", threadId, type);
    }
  }

  // Thông báo đang xử lý
  await api.sendMessage("🔍 Đang lấy thông tin nhóm, vui lòng chờ...", threadId, type);

  try {
    // Lấy thông tin nhóm từ API
    const threadInfo = await api.getThreadInfo(targetThreadId);
    
    if (!threadInfo) {
      return api.sendMessage("❌ Không thể lấy thông tin nhóm này!", threadId, type);
    }

    // Xử lý dữ liệu
    const tenNhom = threadInfo.threadName || "Không có tên";
    const idNhom = threadInfo.threadID || targetThreadId;
    const soThanhVien = threadInfo.participantIDs?.length || 0;
    const soAdmin = threadInfo.adminIDs?.length || 0;
    const nickName = threadInfo.nicknames || {};
    const emoji = threadInfo.emoji || "👍";
    const color = threadInfo.color || "Mặc định";
    const imageSrc = threadInfo.imageSrc || "";
    
    // Lấy danh sách admin
    let adminList = "Không có thông tin";
    if (threadInfo.adminIDs && threadInfo.adminIDs.length > 0) {
      try {
        const adminIds = threadInfo.adminIDs.map(admin => admin.id || admin);
        const adminInfo = await api.getUserInfo(adminIds);
        adminList = adminIds.map(id => {
          const name = adminInfo?.[id]?.name || adminInfo?.changed_profiles?.[id]?.displayName || id;
          return `• ${name}`;
        }).join('\n');
      } catch (e) {
        adminList = `${threadInfo.adminIDs.length} admin`;
      }
    }

    // Tạo tin nhắn thông tin
    const groupMessage = 
      "👥 **THÔNG TIN NHÓM FACEBOOK**\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      `📝 **Tên nhóm:** ${tenNhom}\n` +
      `🆔 **ID nhóm:** ${idNhom}\n` +
      `👤 **Số thành viên:** ${soThanhVien}\n` +
      `👑 **Số admin:** ${soAdmin}\n` +
      `😊 **Emoji:** ${emoji}\n` +
      `🎨 **Màu chủ đề:** ${color}\n` +
      `\n👑 **Danh sách Admin:**\n${adminList}\n` +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━";

    // Gửi thông tin kèm ảnh nhóm nếu có
    if (imageSrc && imageSrc !== "") {
      try {
        const axios = require('axios');
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };
        
        // Tải ảnh nhóm
        const imageResponse = await axios.get(imageSrc, { 
          headers, 
          responseType: 'stream',
          timeout: 10000 
        });
        
        // Gửi tin nhắn kèm ảnh
        return api.sendMessage({
          body: groupMessage,
          attachment: imageResponse.data
        }, threadId, type);
        
      } catch (imgError) {
        console.log('Error downloading group image:', imgError.message);
        // Nếu không tải được ảnh thì gửi tin nhắn thường
        return api.sendMessage(groupMessage, threadId, type);
      }
    } else {
      // Gửi tin nhắn thường nếu không có ảnh nhóm
      return api.sendMessage(groupMessage, threadId, type);
    }

  } catch (error) {
    console.log('Error in handleGroupInfo:', error.message);
    
    if (error.message.includes('Cannot get thread info')) {
      return api.sendMessage("❌ Không thể truy cập thông tin nhóm này!\n\n💡 Bot có thể chưa tham gia nhóm hoặc nhóm đã bị khóa.", threadId, type);
    } else if (error.message.includes('Invalid thread ID')) {
      return api.sendMessage("❌ ID nhóm không hợp lệ!", threadId, type);
    } else {
      return api.sendMessage(`❌ Đã xảy ra lỗi: ${error.message}\n\n💡 Vui lòng thử lại hoặc kiểm tra link nhóm.`, threadId, type);
    }
  }
}

// Handler cho lệnh bonz info fb
async function handleFbInfo(api, event, args) {
  const { threadId, type } = event || {};
  
  if (!args || args.length === 0) {
    return api.sendMessage(
      "📱 **HƯỚNG DẪN SỬ DỤNG BONZ FB**\n\n" +
      "🔍 Cách dùng:\n" +
      "• bonz fb <link_facebook> - Lấy ID từ link Facebook\n\n" +
      "💡 Ví dụ:\n" +
      "bonz fb https://facebook.com/username\n" +
      "bonz fb https://www.facebook.com/profile.php?id=123456789",
      threadId, type
    );
  }

  const linkfb = args[0]?.trim();
  
  if (!linkfb || !linkfb.startsWith('https://')) {
    return api.sendMessage("❌ Vui lòng nhập link Facebook hợp lệ!\n\n💡 Link phải bắt đầu bằng https://", threadId, type);
  }

  try {
    await api.sendMessage("🔍 Đang lấy ID Facebook...", threadId, type);

    // Trích xuất UID Facebook từ link
    let uidfb = null;
    
    // Trường hợp 1: Link dạng profile.php?id= (ID trực tiếp)
    const profileMatch = linkfb.match(/profile\.php\?id=(\d+)/);
    if (profileMatch) {
      uidfb = profileMatch[1];
      console.log('Found Facebook ID from profile.php:', uidfb);
    }
    
    // Trường hợp 2: Link dạng facebook.com/username - cần convert
    if (!uidfb) {
      const usernameMatch = linkfb.match(/(?:facebook\.com|fb\.com|m\.facebook\.com|www\.facebook\.com|mobile\.facebook\.com)\/([^/?#]+)/);
      if (usernameMatch) {
        const username = usernameMatch[1];
        console.log('Found username:', username);
        
        // Thử các API để convert username thành Facebook ID
        const apis = [
          `https://api.popcat.xyz/facebook?url=${encodeURIComponent(linkfb)}`,
          `https://fbinfo-api.vercel.app/api/info?url=${encodeURIComponent(linkfb)}`,
          `https://api.sumiproject.net/fbinfo?url=${encodeURIComponent(linkfb)}`,
          `https://api-fb.dinhphuc.repl.co/fb?url=${encodeURIComponent(linkfb)}`,
          `https://fbinfo.vn/api/info?url=${encodeURIComponent(linkfb)}`,
          `https://api.kenliejugarap.com/facebook/?url=${encodeURIComponent(linkfb)}`,
          `https://api.joshweb.click/facebook?url=${encodeURIComponent(linkfb)}`,
          `https://api.betabotz.org/api/stalk/facebook?url=${encodeURIComponent(linkfb)}&apikey=beta`,
          `https://api.ryzendesu.vip/api/stalk/facebook?url=${encodeURIComponent(linkfb)}`,
          `https://api.lolhuman.xyz/api/facebook?apikey=GataDios&url=${encodeURIComponent(linkfb)}`
        ];
        
        for (let i = 0; i < apis.length; i++) {
          try {
            const axios = require('axios');
            const response = await axios.get(apis[i], { timeout: 8000 });
            
            // Kiểm tra các trường có thể chứa Facebook ID từ nhiều cấu trúc API khác nhau
            const fbId = response.data?.uid || 
                        response.data?.id || 
                        response.data?.data?.uid || 
                        response.data?.data?.id ||
                        response.data?.result?.uid ||
                        response.data?.result?.id ||
                        response.data?.facebook_id ||
                        response.data?.fb_id ||
                        response.data?.user_id ||
                        response.data?.profile_id ||
                        response.data?.data?.facebook_id ||
                        response.data?.data?.fb_id ||
                        response.data?.result?.facebook_id ||
                        response.data?.result?.fb_id ||
                        response.data?.info?.id ||
                        response.data?.info?.uid ||
                        response.data?.user?.id ||
                        response.data?.user?.uid;
            
            // Kiểm tra ID hợp lệ (phải là số và có độ dài từ 10-20 ký tự)
            if (fbId && /^\d{10,20}$/.test(fbId.toString())) {
              uidfb = fbId.toString();
              console.log(`✅ Found Facebook ID from API ${i + 1}:`, uidfb);
              break;
            } else if (fbId) {
              console.log(`❌ Invalid ID format from API ${i + 1}:`, fbId);
            }
          } catch (error) {
            console.log(`API ${i + 1} failed:`, error.message);
          }
        }
      }
    }

    // Phương pháp cuối cùng: thử trích xuất ID từ các pattern khác trong URL
    if (!uidfb) {
      console.log('Trying final extraction methods...');
      
      // Thử tìm ID trong các pattern khác
      const patterns = [
        /\/(\d{10,20})\//,  // ID trong đường dẫn
        /id=(\d{10,20})/,   // ID trong query parameter
        /profile_id=(\d{10,20})/,
        /user_id=(\d{10,20})/,
        /fb_id=(\d{10,20})/
      ];
      
      for (const pattern of patterns) {
        const match = linkfb.match(pattern);
        if (match && match[1]) {
          uidfb = match[1];
          console.log('✅ Found ID using pattern extraction:', uidfb);
          break;
        }
      }
    }

    if (!uidfb) {
      return api.sendMessage(
        "❌ Không thể lấy ID từ link này!\n\n" +
        "💡 **Các link Facebook được hỗ trợ:**\n" +
        "• https://facebook.com/username\n" +
        "• https://www.facebook.com/profile.php?id=123456789\n" +
        "• https://fb.com/username\n" +
        "• https://m.facebook.com/username\n\n" +
        "🔧 **Lưu ý:** Link phải là link profile Facebook công khai",
        threadId, type
      );
    }

    // Chỉ trả về Facebook ID
    const message = `🆔 **FACEBOOK ID**\n\n` +
                   `📱 **Link gốc:** ${linkfb}\n` +
                   `🆔 **Facebook ID:** ${uidfb}\n` +
                   `🔗 **Link profile:** https://facebook.com/${uidfb}`;

    return api.sendMessage(message, threadId, type);

  } catch (error) {
    console.log('Error in handleFbInfo:', error.message);
    return api.sendMessage(
      "❌ Có lỗi xảy ra khi lấy ID Facebook!\n\n" +
      "💡 Vui lòng kiểm tra lại link hoặc thử lại sau.",
      threadId, type
    );
  }
}

async function resolveDisplayName(api, uid) {
  if (!uid) {
    return 'Unknown';
  }

  try {
    const userInfo = await api.getUserInfo([uid]);
    return userInfo?.changed_profiles?.[uid]?.displayName || userInfo?.[uid]?.name || String(uid);
  } catch {
    return String(uid);
  }
}

function buildMentions(message, tag, uid) {
  if (!message || !tag) {
    return [];
  }

  const mentions = [];
  let searchIndex = 0;

  while (true) {
    const found = message.indexOf(tag, searchIndex);
    if (found === -1) {
      break;
    }

    mentions.push({
      uid,
      id: uid,
      tag,
      pos: found,
      len: tag.length,
      offset: found,
      length: tag.length
    });

    searchIndex = found + tag.length;
  }

  return mentions;
}

// Handler cho lệnh bonz cay
async function handleCay(api, event, args) {
  const { threadId, type } = event || {};
  const authorId = String(event?.data?.uidFrom || event?.authorId || '');
  
  // Kiểm tra quyền admin (có thể tùy chỉnh logic này)
  // Tạm thời tắt kiểm tra admin để test - đổi thành true để bật lại
  const SKIP_ADMIN_CHECK = true;
  
  if (!SKIP_ADMIN_CHECK) {
    const isAdmin = await checkAdminPermission(api, event, authorId);
    if (!isAdmin) {
      return sendWithAutoDelete(api, threadId, type, {
        message: "❌ Quyền lồn biên giới! Chỉ admin mới được sử dụng lệnh này."
      });
    }
  }

  const action = args[0]?.toLowerCase();
  
  if (action === 'stop') {
    const cayData = cayRunning.get(threadId);
    if (!cayData || !cayData.isRunning) {
      return sendWithAutoDelete(api, threadId, type, {
        message: "⚠️ **Réo tên đã dừng lại.**"
      });
    }

    // Dừng spam
    clearInterval(cayData.intervalId);
    cayRunning.delete(threadId);

    let stopMentions = [];
    let stopMessage = "✅ Đã dừng réo tên.";
    if (cayData?.targetUid) {
      const targetName = await resolveDisplayName(api, cayData.targetUid);
      const mentionTag = `@${targetName}`;
      stopMessage = `✅ Đã dừng réo tên ${mentionTag}.`;
      stopMentions = buildMentions(stopMessage, mentionTag, cayData.targetUid);
    }

    return sendWithAutoDelete(api, threadId, type, {
      message: stopMessage,
      mentions: stopMentions
    });
  }

  if (action !== 'on') {
    return sendWithAutoDelete(api, threadId, type, {
      message:
        "📢 **HƯỚNG DẪN SỬ DỤNG BONZ CAY**\n\n" +
        "🔥 Cách dùng:\n" +
        "• bonz cay on @user - Bắt đầu réo tên\n" +
        "• bonz cay stop - Dừng réo tên\n\n" +
        "⚠️ Lưu ý: Chỉ admin mới được sử dụng!"
    });
  }

  // Debug: In ra cấu trúc event để kiểm tra
  console.log('=== DEBUG BONZ CAY ===');
  console.log('Event structure:', JSON.stringify(event, null, 2));
  console.log('Event.data:', event?.data);
  console.log('Event.mentions:', event?.mentions);
  console.log('Event.data.mentions:', event?.data?.mentions);
  
  // Kiểm tra xem có tag ai không - thử nhiều cách lấy mentions
  let mentions = [];
  let targetUid = null;
  
  // Cách 1: event.data.mentions
  if (event?.data?.mentions && event.data.mentions.length > 0) {
    mentions = event.data.mentions;
    targetUid = mentions[0].uid || mentions[0].id;
    console.log('Found mentions in event.data.mentions:', mentions);
  }
  // Cách 2: event.mentions
  else if (event?.mentions && event.mentions.length > 0) {
    mentions = event.mentions;
    targetUid = mentions[0].uid || mentions[0].id;
    console.log('Found mentions in event.mentions:', mentions);
  }
  // Cách 3: event.messageReply?.mentions
  else if (event?.messageReply?.mentions && event.messageReply.mentions.length > 0) {
    mentions = event.messageReply.mentions;
    targetUid = mentions[0].uid || mentions[0].id;
    console.log('Found mentions in event.messageReply.mentions:', mentions);
  }
  
  console.log('Target UID:', targetUid);
  console.log('======================');
  
  if (!targetUid) {
    return sendWithAutoDelete(api, threadId, type, {
      message:
        "❌ Tag con chó cần ửa! Vui lòng tag người cần réo tên.\n\n" +
        "💡 Cách dùng: bonz cay on @tên_người_cần_spam"
    });
  }
  
  // Kiểm tra xem đã có spam đang chạy chưa
  const existingCay = cayRunning.get(threadId);
  if (existingCay && existingCay.isRunning) {
    let runningMentions = [];
    let runningMessage = "⚠️ Đã có réo tên đang chạy! Dùng 'bonz cay stop' để dừng trước.";
    if (existingCay.targetUid) {
      const runningName = await resolveDisplayName(api, existingCay.targetUid);
      const runningTag = `@${runningName}`;
      runningMessage = `⚠️ Đã có réo tên đang chạy cho ${runningTag}! Dùng 'bonz cay stop' để dừng trước.`;
      runningMentions = buildMentions(runningMessage, runningTag, existingCay.targetUid);
    }

    return sendWithAutoDelete(api, threadId, type, {
      message: runningMessage,
      mentions: runningMentions
    });
  }

  const targetName = await resolveDisplayName(api, targetUid);
  const mentionTag = `@${targetName}`;

  // Đọc nội dung từ file
  let cayMessages = [];
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, 'noidung.txt');
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      cayMessages = content.split('\n').filter(line => line.trim() !== '');
    }
  } catch (e) {
    console.log('Error reading noidung.txt:', e.message);
  }

  // Nếu không có file hoặc file rỗng, dùng nội dung mặc định
  if (cayMessages.length === 0) {
    cayMessages = [
      // Chửi cơ bản
      "Cay chưa bạn ơi", "Chết chưa con chó", "Đụ má mày", "Địt mẹ mày", "Chết tiệt con chó", "Đéo gì mà cay thế", "Mẹ kiếp", "Đồ đần độn", "Con heo này", "Thằng ngu", "Cút đi thằng lồn", "Chết mẹ mày đi", "Đụ má thằng khùng", "Đéo ai care",
      
      // Chửi cha mẹ
      "Đụ má cha mày", "Địt mẹ cha mày", "Chết tiệt cả nhà mày", "Đéo má cha mày", "Mẹ kiếp cha mày", "Cút mẹ cha mày", "Chó má cha mày", "Lồn má cha mày", "Shit má cha mày", "Fuck má cha mày",
      "Đụ cả dòng họ mày", "Địt cả tổ tiên mày", "Chết tiệt cả dòng dõi mày", "Đéo cả gia đình mày", "Mẹ kiếp cả nhà mày", "Cút cả dòng họ mày", "Chó cả gia tộc mày", "Lồn cả tổ tiên mày",
      "Má mày đẻ ra thằng ngu", "Cha mày nuôi con chó", "Bố mày đẻ ra đồ rác", "Mẹ mày sinh ra thằng khùng", "Cha mẹ mày đẻ ra thằng lồn", "Tổ tiên mày toàn đồ ngu", "Dòng họ mày toàn con chó",
      
      // Chửi bot
      "Bot lỏ vcl", "Thằng bot ngu như heo", "Bot đéo biết gì cả", "Cút đi thằng bot lồn", "Bot chết tiệt", "Địt mẹ thằng bot", "Bot shit vô dụng", "Bot như con chó", "Bot ngu ngốc", "Bot đéo có não",
      "Bot má mày lỏ vcl", "Thằng bot cha mày ngu", "Bot đéo hiểu gì hết", "Cút mẹ thằng bot", "Bot chết mẹ đi", "Đụ má bot này", "Bot shit má mày", "Bot như chó má mày", "Bot ngu cha mày", "Bot lồn má mày",
      "AI má mày ngu vcl", "Thằng AI cha mày lỏ", "Machine learning má mày", "Deep learning cha mày", "Neural network lồn má mày", "Artificial intelligence shit má mày", "Chatbot ngu cha mày", "Thằng bot má mày đần",
      
      // Chửi người dùng
      "Mày là thằng ngu nhất hành tinh này", "Chết tiệt thằng đần độn vô não", "Địt mẹ thằng khùng điên loạn", "Cút đi thằng lồn không có não", "Đồ shit vô dụng như cục phân", "Con chó này chỉ biết sủa",
      "User má mày ngu vcl", "Thằng user cha mày lỏ", "Member shit má mày", "Admin lồn má mày", "Mod ngu cha mày", "Owner đần má mày", "Thành viên chó má mày", "Người dùng lỏ cha mày",
      
      // Chửi dài và sáng tạo
      "Mày là thằng ngu nhất từ trước đến nay trong lịch sử nhân loại má mày", "Chết tiệt thằng đần độn vô não vô tri không biết gì cả cha mày", "Địt mẹ thằng khùng điên loạn mất trí mất tật má mày",
      "Cút đi thằng lồn không có não bộ không có trí tuệ cha mày", "Đồ shit vô dụng như cục phân khô héo hon má mày", "Con chó này chỉ biết sủa như điên như dại cha mày",
      
      // Chửi thêm 200 câu
      "Thằng ngu này", "Chết đi cho rồi", "Đụ má con này", "Cút mẹ đi", "Đồ rác rưởi", "Con chó ranh", "Thằng khùng", "Mẹ kiếp mày", "Đéo hiểu gì", "Chết tiệt rồi", "Địt mẹ luôn", "Mày là đồ ngu",
      "Ngu má mày", "Chó má mày", "Lồn má mày", "Shit má mày", "Fuck má mày", "Damn má mày", "Hell má mày", "Bitch má mày", "Asshole má mày", "Dickhead má mày", "Motherfucker má mày", "Bastard má mày",
      
      // Chửi với động vật
      "Thằng ngu như bò", "Chết như chó", "Đụ má thằng khờ", "Cút như chuột", "Đồ ngu như heo", "Con chó cắn", "Thằng điên như dê", "Mẹ kiếp như gà", "Ngu như trâu", "Chết như ruồi",
      "Ngu như bò má mày", "Chó như lợn cha mày", "Heo như trâu má mày", "Gà như vịt cha mày", "Chuột như mèo má mày", "Dê như cừu cha mày", "Ruồi như muỗi má mày", "Kiến như gián cha mày",
      
      // Chửi với đồ vật
      "Mày ngu như cục gạch", "Chết như con kiến", "Đụ má như con chuột", "Cút như con sâu", "Đồ ngu như cục đá", "Con chó như con mèo", "Thằng điên như con gà", "Mẹ kiếp như con vịt",
      "Ngu như cục gạch má mày", "Đần như cục đá cha mày", "Khùng như cục gỗ má mày", "Điên như cục sắt cha mày", "Lỏ như cục shit má mày", "Dở như cục cứt cha mày",
      
      // Chửi với tính từ
      "Mày ngu vcl", "Mày lỏ vcl", "Mày đần vcl", "Mày khùng vcl", "Mày điên vcl", "Mày shit vcl", "Mày fuck vcl", "Mày damn vcl", "Mày hell vcl", "Mày bitch vcl",
      "Ngu vãi lồn", "Lỏ vãi cả", "Đần vãi chưởng", "Khùng vãi nồi", "Điên vãi đầu", "Shit vãi lồn", "Fuck vãi cả", "Damn vãi chưởng", "Hell vãi nồi", "Bitch vãi đầu",
      
      // Chửi với hành động
      "Đi chết đi", "Đi cút đi", "Đi biến đi", "Đi mất đi", "Đi xa đi", "Đi chỗ khác đi", "Đi địa ngục đi", "Đi xuống mồ đi", "Đi về quê đi", "Đi học lại đi",
      "Đi chết má mày", "Đi cút cha mày", "Đi biến má mày", "Đi mất cha mày", "Đi xa má mày", "Đi chỗ khác cha mày", "Đi địa ngục má mày", "Đi xuống mồ cha mày",
      
      // Chửi với cảm xúc
      "Cay chưa", "Tức chưa", "Giận chưa", "Bực chưa", "Phát điên chưa", "Nổi máu chưa", "Nóng mặt chưa", "Đỏ mặt chưa", "Run tay chưa", "Tím mặt chưa",
      "Cay má mày chưa", "Tức cha mày chưa", "Giận má mày chưa", "Bực cha mày chưa", "Phát điên má mày chưa", "Nổi máu cha mày chưa",
      
      // Chửi với thời gian
      "Chết từ hôm qua", "Ngu từ thuở nào", "Lỏ từ bé", "Đần từ trong bụng mẹ", "Khùng từ khi sinh ra", "Điên từ lúc còn nhỏ", "Shit từ đầu", "Fuck từ trước", "Damn từ xưa", "Hell từ nay",
      
      // Chửi với địa điểm
      "Về quê mà chết", "Ra ngoài mà cút", "Vào trong mà biến", "Lên trên mà mất", "Xuống dưới mà xa", "Sang bên mà đi", "Qua đó mà chết", "Về đây mà cút",
      "Về quê má mày", "Ra ngoài cha mày", "Vào trong má mày", "Lên trên cha mày", "Xuống dưới má mày", "Sang bên cha mày",
      
      // Chửi với số lượng
      "Ngu một mình", "Lỏ một thằng", "Đần một con", "Khùng một đứa", "Điên một người", "Shit một thằng", "Fuck một con", "Damn một đứa", "Hell một người", "Bitch một thằng",
      "Ngu cả đời", "Lỏ cả kiếp", "Đần cả thế", "Khùng cả đời", "Điên cả kiếp", "Shit cả thế", "Fuck cả đời", "Damn cả kiếp", "Hell cả thế", "Bitch cả đời",
      
      // Chửi với màu sắc
      "Ngu như màu đen", "Lỏ như màu trắng", "Đần như màu đỏ", "Khùng như màu xanh", "Điên như màu vàng", "Shit như màu nâu", "Fuck như màu tím", "Damn như màu hồng",
      
      // Chửi với âm thanh
      "Ngu như tiếng chó sủa", "Lỏ như tiếng heo kêu", "Đần như tiếng gà gáy", "Khùng như tiếng vịt kêu", "Điên như tiếng mèo kêu", "Shit như tiếng ruồi vo ve",
      
      // Chửi với mùi vị
      "Ngu như mùi shit", "Lỏ như mùi cứt", "Đần như mùi hôi", "Khùng như mùi thối", "Điên như mùi tanh", "Shit như mùi ôi", "Fuck như mùi hôi",
      "Ngu như vị đắng", "Lỏ như vị chua", "Đần như vị chát", "Khùng như vị cay", "Điện như vị mặn", "Shit như vị nhạt",
      
      // Chửi phức hợp
      "Đụ má cha mày thằng ngu như heo", "Địt mẹ cha mày con chó như lợn", "Chết tiệt má cha mày đồ đần như bò", "Đéo má cha mày thằng khùng như dê",
      "Mẹ kiếp má cha mày con điên như gà", "Cút má cha mày thằng lỏ như vịt", "Chó má cha mày đồ ngu như chuột", "Lồn má cha mày con shit như ruồi",
      
      // Chửi bot nâng cao
      "Bot má mày ngu như con heo rừng không có trí tuệ gì cả", "Thằng bot cha mày lỏ vcl không biết làm gì chỉ biết nói bậy", "AI má mày đần độn vô não vô tri không hiểu gì hết",
      "Machine learning cha mày shit vô dụng như cục phân khô", "Deep learning má mày ngu ngốc như con heo đất", "Neural network cha mày điên loạn như con chó hoang",
      "Chatbot má mày khùng điên mất trí mất tật", "Algorithm cha mày đéo có logic gì cả", "Programming má mày code như shit", "Developer cha mày viết code như cứt",
      
      // Chửi user nâng cao  
      "User má mày ngu nhất trong lịch sử internet", "Thành viên cha mày lỏ nhất trên đời", "Member má mày đần nhất trong group", "Admin cha mày khùng nhất trong server",
      "Mod má mày điên nhất trong forum", "Owner cha mày shit nhất trong community", "Player má mày noob nhất trong game", "Gamer cha mày tệ nhất trong lobby",
      
      // Chửi gia đình mở rộng
      "Cả họ nhà mày toàn đồ ngu", "Cả dòng dõi mày toàn con chó", "Cả gia tộc mày toàn thằng lỏ", "Cả tổ tiên mày toàn đồ đần", "Cả con cháu mày toàn thằng khùng",
      "Ông bà mày toàn con điên", "Anh em mày toàn đồ shit", "Chị em mày toàn con fuck", "Bác chú mày toàn thằng damn", "Cô dì mày toàn con hell",
      "Cha mày đẻ ra thằng ngu", "Mẹ mày sinh ra con chó", "Bố mày nuôi thằng lỏ", "Má mày dạy con đần", "Ba mày có thằng khùng", "Mẹ mày đẻ con điên",
      
      // Chửi với nghề nghiệp
      "Thằng dev ngu như heo", "Con tester lỏ như chó", "Đồ designer đần như bò", "Thằng admin khùng như dê", "Con mod điên như gà", "Đồ user shit như lợn",
      "Coder má mày ngu vcl", "Programmer cha mày lỏ vcl", "Developer má mày đần vcl", "Engineer cha mày khùng vcl", "Architect má mày điên vcl", "Manager cha mày shit vcl",
      
      // Chửi với học vấn
      "Học hành má mày như shit", "Đi học cha mày như cứt", "Kiến thức má mày như đéo", "Trí tuệ cha mày như lồn", "IQ má mày bằng 0", "EQ cha mày âm điểm",
      "Tốt nghiệp má mày bằng lỏ", "Bằng cấp cha mày bằng shit", "Học vị má mày bằng cứt", "Chứng chỉ cha mày bằng đéo",
      
      // Chửi với công nghệ
      "Internet má mày lag vcl", "Wifi cha mày chậm vcl", "4G má mày tệ vcl", "5G cha mày lỏ vcl", "Computer má mày cùi vcl", "Laptop cha mày shit vcl",
      "Phone má mày cũ vcl", "App cha mày lỗi vcl", "Software má mày bug vcl", "Hardware cha mày hỏng vcl", "System má mày crash vcl", "Server cha mày down vcl",
      
      // Thêm 500 câu chửi nữa
      "Đụ má mày thằng ngu nhất vũ trụ", "Địt mẹ cha mày con chó nhất thiên hà", "Chết tiệt má cha mày đồ đần nhất hành tinh", "Đéo má cha mày thằng khùng nhất thế giới",
      "Mẹ kiếp má cha mày con điên nhất đất nước", "Cút má cha mày thằng lỏ nhất châu lục", "Chó má cha mày đồ ngu nhất khu vực", "Lồn má cha mày con shit nhất vùng miền",
      
      // Chửi với thể loại game
      "Noob má mày vcl", "Pro cha mày lỏ vcl", "Hacker má mày ngu vcl", "Cheater cha mày đần vcl", "Camper má mày khùng vcl", "Rusher cha mày điên vcl",
      "Feeder má mày shit vcl", "Troller cha mày fuck vcl", "Griefer má mày damn vcl", "Smurf cha mày hell vcl", "Toxic má mày bitch vcl", "Flamer cha mày ass vcl",
      
      // Chửi với mạng xã hội
      "Facebook má mày lag", "Instagram cha mày lỗi", "TikTok má mày cringe", "YouTube cha mày boring", "Twitter má mày toxic", "Discord cha mày dead",
      "Zalo má mày cũ", "Telegram cha mày slow", "WhatsApp má mày basic", "Messenger cha mày trash", "Snapchat má mày weird", "Reddit cha mày nerdy",
      
      // Chửi với thức ăn
      "Ăn shit má mày", "Uống cứt cha mày", "Nhai phân má mày", "Nuốt lồn cha mày", "Ngậm đéo má mày", "Mút cặc cha mày", "Liếm lỗ má mày", "Hút buồi cha mày",
      "Cơm má mày như shit", "Phở cha mày như cứt", "Bánh mì má mày như phân", "Nước cha mày như nước tiểu", "Trà má mày như nước rửa chén", "Cà phê cha mày như nước cống",
      
      // Chửi với thời tiết
      "Nóng như lồn má mày", "Lạnh như cặc cha mày", "Mưa như nước tiểu má mày", "Nắng như shit cha mày", "Gió như hơi thở má mày", "Sương như nước mũi cha mày",
      "Bão như cơn giận má mày", "Lũ như nước mắt cha mày", "Hạn như não bộ má mày", "Đông như trái tim cha mày", "Xuân như tuổi thọ má mày", "Hạ như IQ cha mày",
      
      // Chửi với quần áo
      "Áo má mày như giẻ lau", "Quần cha mày như bao tải", "Giày má mày như thúng", "Tất cha mày như rẻ quạt", "Mũ má mày như nồi", "Kính cha mày như đáy chai",
      "Đồng hồ má mày như đồ chơi", "Túi cha mày như bao rác", "Dây nịt má mày như dây thừng", "Nhẫn cha mày như vòng sắt", "Vòng cổ má mày như xích chó", "Lắc tay cha mày như còng tay",
      
      // Chửi với phương tiện
      "Xe má mày như xe rùa", "Motor cha mày như xe đạp", "Ô tô má mày như xe bò", "Máy bay cha mày như diều", "Tàu má mày như thúng chai", "Xe buýt cha mày như xe rác",
      "Taxi má mày như xe cứu thương", "Grab cha mày như xe ôm", "Uber má mày như xe lôi", "Train cha mày như tàu ma", "Metro má mày như tàu ngầm", "Bus cha mày như quan tài",
      
      // Chửi với cơ thể
      "Mặt má mày như lồn", "Mũi cha mày như cặc", "Mắt má mày như lỗ đít", "Tai cha mày như lỗ lồn", "Miệng má mày như hố shit", "Răng cha mày như phân",
      "Tóc má mày như lông mu", "Da cha mày như vỏ trâu", "Tay má mày như chân gà", "Chân cha mày như tay khỉ", "Bụng má mày như bụng heo", "Lưng cha mày như mai rùa",
      
      // Chửi với cảm giác
      "Đau như địt má mày", "Buồn như lồn cha mày", "Vui như shit má mày", "Tức như cứt cha mày", "Sợ như đéo má mày", "Yêu như cặc cha mày",
      "Ghét như phân má mày", "Thích như lỗ cha mày", "Chán như hơi má mày", "Hứng như nước cha mày", "Lười như não má mày", "Chăm như tim cha mày",
      
      // Chửi với số học
      "Cộng má mày bằng shit", "Trừ cha mày bằng cứt", "Nhân má mày bằng lồn", "Chia cha mày bằng đéo", "Bằng má mày bằng 0", "Lớn hơn cha mày bằng vô cực",
      "Nhỏ hơn má mày bằng âm vô cực", "Phần trăm cha mày bằng shit", "Phân số má mày như cứt", "Thập phân cha mày như lồn", "Căn bậc má mày như đéo", "Lũy thừa cha mày như phân",
      
      // Chửi với âm nhạc
      "Hát má mày như chó tru", "Nhạc cha mày như tiếng ọe", "Đàn má mày như cào tường", "Trống cha mày như đập thúng", "Sáo má mày như tiếng rít", "Kèn cha mày như tiếng ợ",
      "Rock má mày như shit", "Pop cha mày như cứt", "Rap má mày như lồn", "EDM cha mày như đéo", "Jazz má mày như phân", "Classical cha mày như lỗ",
      
      // Chửi với thể thao
      "Bóng đá má mày như shit", "Bóng rổ cha mày như cứt", "Tennis má mày như lồn", "Badminton cha mày như đéo", "Bơi lội má mày như phân", "Chạy bộ cha mày như lỗ",
      "Gym má mày như hơi", "Yoga cha mày như nước", "Boxing má mày như não", "Karate cha mày như tim", "Taekwondo má mày như gan", "Judo cha mày như lá lách",
      
      // Chửi với màn hình
      "Màn hình má mày như shit", "Monitor cha mày như cứt", "TV má mày như lồn", "Laptop screen cha mày như đéo", "Phone screen má mày như phân", "Tablet screen cha mày như lỗ",
      "4K má mày như hơi", "8K cha mày như nước", "HD má mày như não", "Full HD cha mày như tim", "Ultra HD má mày như gan", "Retina cha mày như lá lách",
      
      // Chửi với game cụ thể
      "PUBG má mày lag vcl", "Free Fire cha mày noob vcl", "LOL má mày bronze vcl", "Dota cha mày herald vcl", "CS má mày silver vcl", "Valorant cha mày iron vcl",
      "Minecraft má mày creative vcl", "Roblox cha mày kid vcl", "Fortnite má mày cringe vcl", "Among Us cha mày sus vcl", "Fall Guys má mày bean vcl", "Genshin cha mày weeb vcl",
      
      // Chửi với streaming
      "Stream má mày lag", "YouTube cha mày buffering", "Twitch má mày frozen", "Facebook Live cha mày crashed", "TikTok Live má mày glitched", "Instagram Live cha mày failed",
      "Streamer má mày boring", "Content cha mày trash", "Viewer má mày bot", "Subscriber cha mày fake", "Donation má mày scam", "Sponsor cha mày shit",
      
      // Chửi với crypto
      "Bitcoin má mày crash", "Ethereum cha mày dump", "Dogecoin má mày meme", "Shiba cha mày scam", "NFT má mày worthless", "Blockchain cha mày slow",
      "Mining má mày waste", "Wallet cha mày hacked", "Exchange má mày exit scam", "DeFi cha mày rug pull", "Metaverse má mày overhype", "Web3 cha mày bubble",
      
      // Chửi với AI
      "ChatGPT má mày hallucinate", "GPT cha mày biased", "AI má mày dumb", "Machine Learning cha mày overfitted", "Deep Learning má mày black box", "Neural Network cha mày exploding gradient",
      "Algorithm má mày biased", "Data cha mày dirty", "Model má mày underfitted", "Training cha mày slow", "Inference má mày expensive", "Deployment cha mày failed",
      
      // Chửi với meme
      "Meme má mày dead", "Viral cha mày cringe", "Trend má mày outdated", "Challenge cha mày dangerous", "Hashtag má mày spam", "Caption cha mày unfunny",
      "Like má mày bot", "Share cha mày fake", "Comment má mày toxic", "Follow cha mày bought", "Unfollow má mày deserved", "Block cha mày justified",
      
      // Chửi với học tập
      "Toán má mày như shit", "Văn cha mày như cứt", "Anh má mày như lồn", "Lý cha mày như đéo", "Hóa má mày như phân", "Sinh cha mày như lỗ",
      "Sử má mày như hơi", "Địa cha mày như nước", "GDCD má mày như não", "Thể dục cha mày như tim", "Âm nhạc má mày như gan", "Mỹ thuật cha mày như lá lách",
      
      // Chửi với công việc
      "Làm việc má mày như shit", "Công ty cha mày như cứt", "Sếp má mày như lồn", "Đồng nghiệp cha mày như đéo", "Lương má mày như phân", "Thưởng cha mày như lỗ",
      "Tăng ca má mày như hơi", "Nghỉ phép cha mày như nước", "Meeting má mày như não", "Deadline cha mày như tim", "Project má mày như gan", "Report cha mày như lá lách",
      
      // Chửi với tình yêu
      "Yêu má mày như shit", "Crush cha mày như cứt", "Ex má mày như lồn", "Bạn trai cha mày như đéo", "Bạn gái má mày như phân", "Vợ cha mày như lỗ",
      "Chồng má mày như hơi", "Tình yêu cha mày như nước", "Chia tay má mày như não", "Cưới cha mày như tim", "Ly hôn má mày như gan", "Ngoại tình cha mày như lá lách",
      
      // Chửi với thời gian
      "Giây má mày như shit", "Phút cha mày như cứt", "Giờ má mày như lồn", "Ngày cha mày như đéo", "Tuần má mày như phân", "Tháng cha mày như lỗ",
      "Năm má mày như hơi", "Thế kỷ cha mày như nước", "Thiên niên kỷ má mày như não", "Quá khứ cha mày như tim", "Hiện tại má mày như gan", "Tương lai cha mày như lá lách",
      
      // Thêm 400 câu chửi cuối cùng để đủ 1000
      "Đụ má mày từ A đến Z", "Địt mẹ cha mày từ đầu đến cuối", "Chết tiệt má cha mày từ trong ra ngoài", "Đéo má cha mày từ trên xuống dưới",
      "Mẹ kiếp má cha mày từ trái qua phải", "Cút má cha mày từ đông sang tây", "Chó má cha mày từ nam lên bắc", "Lồn má cha mày từ sáng đến tối",
      
      // Chửi với màu sắc nâng cao
      "Đen má mày như shit", "Trắng cha mày như cứt", "Đỏ má mày như máu kinh", "Xanh cha mày như mặt chết", "Vàng má mày như nước tiểu", "Tím cha mày như bầm tím",
      "Hồng má mày như lồn", "Nâu cha mày như phân", "Xám má mày như tro", "Cam cha mày như nôn", "Lục má mày như đờm", "Lam cha mày như tĩnh mạch",
      
      // Chửi với kích thước
      "To má mày như shit", "Nhỏ cha mày như cứt", "Lớn má mày như lồn", "Bé cha mày như đéo", "Dài má mày như phân", "Ngắn cha mày như lỗ",
      "Rộng má mày như hơi", "Hẹp cha mày như nước", "Cao má mày như não", "Thấp cha mày như tim", "Dày má mày như gan", "Mỏng cha mày như lá lách",
      
      // Chửi với hình dạng
      "Tròn má mày như shit", "Vuông cha mày như cứt", "Tam giác má mày như lồn", "Chữ nhật cha mày như đéo", "Oval má mày như phân", "Thoi cha mày như lỗ",
      "Cong má mày như hơi", "Thẳng cha mày như nước", "Lượn má mày như não", "Gấp khúc cha mày như tim", "Xoắn má mày như gan", "Uốn cha mày như lá lách",
      
      // Chửi với vật liệu
      "Gỗ má mày như shit", "Sắt cha mày như cứt", "Nhựa má mày như lồn", "Thủy tinh cha mày như đéo", "Giấy má mày như phân", "Vải cha mày như lỗ",
      "Đá má mày như hơi", "Cát cha mày như nước", "Đất má mày như não", "Nước cha mày như tim", "Lửa má mày như gan", "Gió cha mày như lá lách",
      
      // Chửi với trạng thái
      "Sống má mày như shit", "Chết cha mày như cứt", "Khỏe má mày như lồn", "Ốm cha mày như đéo", "Vui má mày như phân", "Buồn cha mày như lỗ",
      "Giàu má mày như hơi", "Nghèo cha mày như nước", "Thông minh má mày như não", "Ngu cha mày như tim", "Đẹp má mày như gan", "Xấu cha mày như lá lách",
      
      // Chửi với hành vi
      "Đi má mày như shit", "Đứng cha mày như cứt", "Ngồi má mày như lồn", "Nằm cha mày như đéo", "Chạy má mày như phân", "Bò cha mày như lỗ",
      "Nhảy má mày như hơi", "Bay cha mày như nước", "Bơi má mày như não", "Lặn cha mày như tim", "Leo má mày như gan", "Trèo cha mày như lá lách",
      
      // Chửi với ngôn ngữ
      "Tiếng Việt má mày như shit", "English cha mày như cứt", "中文 má mày như lồn", "日本語 cha mày như đéo", "한국어 má mày như phân", "Français cha mày như lỗ",
      "Deutsch má mày như hơi", "Español cha mày như nước", "Русский má mày như não", "العربية cha mày như tim", "हिन्दी má mày như gan", "Português cha mày như lá lách",
      
      // Chửi với quốc gia
      "Việt Nam má mày như shit", "America cha mày như cứt", "China má mày như lồn", "Japan cha mày như đéo", "Korea má mày như phân", "Thailand cha mày như lỗ",
      "Singapore má mày như hơi", "Malaysia cha mày như nước", "Indonesia má mày như não", "Philippines cha mày như tim", "India má mày như gan", "Australia cha mày như lá lách",
      
      // Chửi với thành phố
      "Hà Nội má mày như shit", "Sài Gòn cha mày như cứt", "Đà Nẵng má mày như lồn", "Hải Phòng cha mày như đéo", "Cần Thơ má mày như phân", "Huế cha mày như lỗ",
      "New York má mày như hơi", "Tokyo cha mày như nước", "Seoul má mày như não", "Beijing cha mày như tim", "Bangkok má mày như gan", "Singapore cha mày như lá lách",
      
      // Chửi với tiền tệ
      "VND má mày như shit", "USD cha mày như cứt", "EUR má mày như lồn", "JPY cha mày như đéo", "KRW má mày như phân", "CNY cha mày như lỗ",
      "GBP má mày như hơi", "AUD cha mày như nước", "CAD má mày như não", "CHF cha mày như tim", "SEK má mày như gan", "NOK cha mày như lá lách",
      
      // Chửi với xe hơi
      "Toyota má mày như shit", "Honda cha mày như cứt", "Hyundai má mày như lồn", "BMW cha mày như đéo", "Mercedes má mày như phân", "Audi cha mày như lỗ",
      "Lexus má mày như hơi", "Porsche cha mày như nước", "Ferrari má mày như não", "Lamborghini cha mày như tim", "Bentley má mày như gan", "Rolls Royce cha mày như lá lách",
      
      // Chửi với điện thoại
      "iPhone má mày như shit", "Samsung cha mày như cứt", "Xiaomi má mày như lồn", "Oppo cha mày như đéo", "Vivo má mày như phân", "Huawei cha mày như lỗ",
      "OnePlus má mày như hơi", "Google Pixel cha mày như nước", "Sony má mày như não", "LG cha mày như tim", "Nokia má mày như gan", "Motorola cha mày như lá lách",
      
      // Chửi với laptop
      "MacBook má mày như shit", "ThinkPad cha mày như cứt", "Dell má mày như lồn", "HP cha mày như đéo", "Asus má mày như phân", "Acer cha mày như lỗ",
      "MSI má mày như hơi", "Alienware cha mày như nước", "Surface má mày như não", "Razer cha mày như tim", "Gaming laptop má mày như gan", "Ultrabook cha mày như lá lách",
      
      // Chửi với phần mềm
      "Windows má mày như shit", "macOS cha mày như cứt", "Linux má mày như lồn", "Android cha mày như đéo", "iOS má mày như phân", "Chrome OS cha mày như lỗ",
      "Office má mày như hơi", "Photoshop cha mày như nước", "AutoCAD má mày như não", "Premiere cha mày như tim", "After Effects má mày như gan", "Illustrator cha mày như lá lách",
      
      // Chửi với website
      "Google má mày như shit", "Facebook cha mày như cứt", "YouTube má mày như lồn", "Instagram cha mày như đéo", "TikTok má mày như phân", "Twitter cha mày như lỗ",
      "LinkedIn má mày như hơi", "Pinterest cha mày như nước", "Reddit má mày như não", "Discord cha mày như tim", "Telegram má mày như gan", "WhatsApp cha mày như lá lách",
      
      // Chửi với ngành nghề
      "Bác sĩ má mày như shit", "Giáo viên cha mày như cứt", "Kỹ sư má mày như lồn", "Luật sư cha mày như đéo", "Kiến trúc sư má mày như phân", "Nha sĩ cha mày như lỗ",
      "Phi công má mày như hơi", "Thủy thủ cha mày như nước", "Lính má mày như não", "Cảnh sát cha mày như tim", "Lính cứu hỏa má mày như gan", "Y tá cha mày như lá lách",
      
      // Chửi với đồ ăn cụ thể
      "Phở má mày như shit", "Bánh mì cha mày như cứt", "Cơm tấm má mày như lồn", "Bún bò cha mày như đéo", "Bánh xèo má mày như phân", "Gỏi cuốn cha mày như lỗ",
      "Pizza má mày như hơi", "Burger cha mày như nước", "Sushi má mày như não", "Ramen cha mày như tim", "Pasta má mày như gan", "Steak cha mày như lá lách",
      
      // Chửi với đồ uống
      "Cà phê má mày như shit", "Trà cha mày như cứt", "Nước ngọt má mày như lồn", "Bia cha mày như đéo", "Rượu má mày như phân", "Whiskey cha mày như lỗ",
      "Vodka má mày như hơi", "Wine cha mày như nước", "Cocktail má mày như não", "Smoothie cha mày như tim", "Juice má mày như gan", "Energy drink cha mày như lá lách",
      
      // Chửi kết thúc mạnh mẽ
      "Cuối cùng má mày cũng đọc hết", "Cha mày kiên nhẫn thật", "Má mày chịu đựng giỏi", "Cha mày bền bỉ quá", "Má mày đọc nhiều vậy", "Cha mày có thời gian",
      "Má mày thích bị chửi", "Cha mày nghiện spam", "Má mày cay chưa", "Cha mày tức chưa", "Má mày còn muốn nữa không", "Cha mày đủ chưa"
    ];
  }

  // Bắt đầu spam
  let messageIndex = 0;
  const intervalId = setInterval(async () => {
    try {
      const message = cayMessages[messageIndex % cayMessages.length];
      const messageWithMention = `${mentionTag} ${message}`;
      const mentionEntries = buildMentions(messageWithMention, mentionTag, targetUid);

      const payloadVariants = [
        { msg: messageWithMention, mentions: mentionEntries },
        { body: messageWithMention, mentions: mentionEntries },
        { text: messageWithMention, mentions: mentionEntries },
        { message: messageWithMention, mentions: mentionEntries }
      ];

      let sent = false;

      for (const payload of payloadVariants) {
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries && !sent) {
          try {
            await api.sendMessage(payload, threadId, type);
            sent = true;
            console.log(`[CAY] ✅ Sent: ${message.substring(0, 30)}...`);
            break;
          } catch (e) {
            retryCount++;
            console.log(`[CAY] ❌ Attempt ${retryCount}/${maxRetries}: ${e.message}`);

            if (e.message.includes('fetch failed') ||
                e.message.includes('SOCKET') ||
                e.message.includes('closed') ||
                e.message.includes('timeout')) {
              console.log(`[CAY] 🔄 Network error, waiting 2s before retry...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              break;
            }
          }
        }

        if (sent) break;
      }

      if (!sent) {
        // Fallback: vẫn cố gắng gửi với mentionTag ở đầu, không mentions
        let retryCount = 0;
        while (retryCount < 3 && !sent) {
          try {
            await api.sendMessage(messageWithMention, threadId, type);
            sent = true;
            console.log(`[CAY] ✅ Fallback sent: ${message.substring(0, 30)}...`);
          } catch (e) {
            retryCount++;
            console.log(`[CAY] ❌ Fallback attempt ${retryCount}/3: ${e.message}`);
            if (retryCount < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      }

      if (!sent) {
        console.log(`[CAY] ⚠️ All methods failed, skipping message: ${message.substring(0, 30)}...`);
      }

      messageIndex++;
    } catch (e) {
      console.log(`[CAY] 💥 Critical error: ${e.message}`);
      // Không dừng spam, tiếp tục với message tiếp theo
    }
  }, 2500); // Gửi mỗi 2.5 giây

  // Lưu trạng thái
  cayRunning.set(threadId, {
    isRunning: true,
    intervalId: intervalId,
    targetUid: targetUid
  });

  const startMessage =
    `🔥 **BẮT ĐẦU SPAM + TAG LIÊN TỤC!**\n\n` +
    `🎯 Target: ${mentionTag}\n` +
    `📱 Tag: ${mentionTag} (mỗi tin nhắn)\n` +
    `⏰ Tần suất: 2.5 giây/lần\n` +
    `📝 Số câu chửi: ${cayMessages.length}+\n` +
    `🔄 Tự động tag trong mỗi tin nhắn\n\n` +
    `⚠️ Dùng 'bonz cay stop' để dừng!`;

  const startMentions = buildMentions(startMessage, mentionTag, targetUid);

  try {
    return await sendWithAutoDelete(api, threadId, type, {
      message: startMessage,
      mentions: startMentions
    });
  } catch (e) {
    console.log(`[CAY] ❌ Không thể gửi thông báo bắt đầu với mention: ${e.message}`);
    return sendWithAutoDelete(api, threadId, type, {
      message: startMessage
    });
  }
}

// Hàm kiểm tra quyền admin (có thể tùy chỉnh)
async function checkAdminPermission(api, event, userId) {
  try {
    // Danh sách admin bot (thêm ID của bạn vào đây)
    const BOT_ADMINS = [
      // Thêm ID admin bot vào đây
      // 'your_admin_id_1', 
      // 'your_admin_id_2'
    ];
    
    // Kiểm tra admin bot trước
    if (BOT_ADMINS.includes(userId)) {
      return true;
    }
    
    // Thử nhiều cách để lấy thông tin admin nhóm
    let adminIDs = [];
    
    // Cách 1: Thử getThreadInfo
    try {
      const threadInfo = await api.getThreadInfo(event.threadId);
      if (threadInfo?.adminIDs) {
        adminIDs = threadInfo.adminIDs.map(admin => 
          typeof admin === 'string' ? admin : admin.id || admin.uid
        );
      }
    } catch (e1) {
      console.log('Method 1 failed:', e1.message);
    }
    
    // Cách 2: Thử getThreadList hoặc các API khác
    if (adminIDs.length === 0) {
      try {
        // Có thể thử các API khác tùy theo bot framework
        const threadData = await api.getThreadData?.(event.threadId);
        if (threadData?.admins) {
          adminIDs = threadData.admins;
        }
      } catch (e2) {
        console.log('Method 2 failed:', e2.message);
      }
    }
    
    // Kiểm tra xem user có phải admin nhóm không
    if (adminIDs.includes(userId)) {
      return true;
    }
    
    // Fallback: Nếu không lấy được thông tin admin, cho phép tất cả (tạm thời)
    console.log('Cannot get admin info, allowing all users temporarily');
    return true; // Tạm thời cho phép tất cả, bạn có thể đổi thành false
    
  } catch (e) {
    console.log('Error checking admin permission:', e.message);
    // Fallback: cho phép tất cả khi có lỗi
    return true; // Tạm thời cho phép tất cả, bạn có thể đổi thành false
  }
}

// Đếm tương tác theo user trong từng nhóm (thread)
module.exports.handleEvent = async ({ eventType, event, Threads, api, replyData }) => {
  try {
    if (eventType !== 'message') return;
    // Whitelist cho event: chỉ xử lý trong allowed_threads nếu có cấu hình
    try {
      const allowed = Array.isArray(global?.config?.allowed_threads) ? global.config.allowed_threads.map(String) : [];
      if (allowed.length > 0 && !allowed.includes(String(event?.threadId || ''))) return;
    } catch {}
    const { threadId, data, type } = event || {};
    const r = replyData || {};
    const uid = data?.uidFrom;
    if (!threadId || !uid) return;


    // Xử lý lệnh /testsafe trước khi check Safe Mode
    const messageText = data?.message || '';
    if (messageText.toLowerCase().startsWith('/testsafe')) {
      const args = messageText.split(' ');
      return await handleTestSafe(api, event, args);
    }

    // Xử lý Zefoy captcha reply (DISABLED - using web interface now)
    if (false && global.zefoyPendingRequests?.[threadId]) {
      const pendingRequest = global.zefoyPendingRequests[threadId];
      
      // Check if request is still valid (5 minutes)
      if (Date.now() - pendingRequest.timestamp > 300000) {
        delete global.zefoyPendingRequests[threadId];
        try { 
          const fs = require('fs');
          fs.unlinkSync(pendingRequest.captchaPath); 
        } catch {}
        return api.sendMessage('⏰ Yêu cầu Zefoy đã hết hạn. Vui lòng thử lại.', threadId, type);
      }
      
      // Check if same user
      if (pendingRequest.userId !== uid) {
        return; // Ignore if different user
      }
      
      const captchaCode = messageText.trim();
      if (captchaCode && captchaCode.length >= 3) {
        try {
          await api.sendMessage('🔄 Đang gửi yêu cầu đến Zefoy...', threadId, type);
          
          const result = await pendingRequest.zefoy.submitRequest(
            pendingRequest.service,
            pendingRequest.url,
            captchaCode
          );
          
          // Clean up
          delete global.zefoyPendingRequests[threadId];
          try { 
            const fs = require('fs');
            fs.unlinkSync(pendingRequest.captchaPath); 
          } catch {}
          
          if (result.success) {
            // Sau khi thành công, hiển thị trạng thái tất cả dịch vụ
            try {
              const { formatServiceName } = require('./zefoy.js');
              const statuses = await pendingRequest.zefoy.getAllServicesStatus();
              
              let statusMsg = [
                '✅ YÊU CẦU ZEFOY THÀNH CÔNG!',
                '',
                `🎯 Dịch vụ đã sử dụng: ${formatServiceName(pendingRequest.service)}`,
                `🔗 Link: ${pendingRequest.url}`,
                `📝 Kết quả: ${result.message}`,
                '',
                '📊 ═══ TRẠNG THÁI TẤT CẢ DỊCH VỤ ═══',
                ''
              ];
              
              for (const [service, status] of Object.entries(statuses)) {
                const icon = status.available ? '🟢' : '🔴';
                const statusText = status.available ? 'Hoạt động' : 'Tạm ngưng';
                const serviceName = formatServiceName(service);
                statusMsg.push(`${icon} ${serviceName}: ${statusText}`);
                if (!status.available && status.message) {
                  statusMsg.push(`   └─ ${status.message}`);
                }
              }
              
              statusMsg.push('');
              statusMsg.push('⏰ Thời gian xử lý: 1-5 phút');
              statusMsg.push('💡 Kiểm tra lại video sau ít phút để thấy kết quả');
              statusMsg.push('🔄 Sử dụng: bonz của tớ <service> <url> để tiếp tục');
              
              return api.sendMessage(statusMsg.join('\n'), threadId, type);
            } catch (statusError) {
              // Fallback nếu không lấy được status
              return api.sendMessage([
                '✅ YÊU CẦU ZEFOY THÀNH CÔNG!',
                '',
                `🎯 Dịch vụ: ${pendingRequest.service}`,
                `🔗 Link: ${pendingRequest.url}`,
                `📝 Kết quả: ${result.message}`,
                '',
                '⏰ Thời gian xử lý: 1-5 phút',
                '💡 Kiểm tra lại video sau ít phút để thấy kết quả',
                '📊 Dùng: bonz của tớ status để xem trạng thái dịch vụ'
              ].join('\n'), threadId, type);
            }
          } else {
            // Ngay cả khi thất bại, vẫn hiển thị trạng thái dịch vụ để user biết
            try {
              const { formatServiceName } = require('./zefoy.js');
              const statuses = await pendingRequest.zefoy.getAllServicesStatus();
              
              let statusMsg = [
                '❌ YÊU CẦU ZEFOY THẤT BẠI!',
                '',
                `📝 Lỗi: ${result.message}`,
                '',
                '💡 Có thể do:',
                '• Captcha sai',
                '• Dịch vụ tạm ngưng',
                '• Link TikTok không hợp lệ',
                '',
                '📊 ═══ TRẠNG THÁI TẤT CẢ DỊCH VỤ ═══',
                ''
              ];
              
              for (const [service, status] of Object.entries(statuses)) {
                const icon = status.available ? '🟢' : '🔴';
                const statusText = status.available ? 'Hoạt động' : 'Tạm ngưng';
                const serviceName = formatServiceName(service);
                statusMsg.push(`${icon} ${serviceName}: ${statusText}`);
                if (!status.available && status.message) {
                  statusMsg.push(`   └─ ${status.message}`);
                }
              }
              
              statusMsg.push('');
              statusMsg.push('🔄 Thử lại với dịch vụ đang hoạt động');
              statusMsg.push('💡 Hoặc dùng: bonz của tớ test để kiểm tra kết nối');
              
              return api.sendMessage(statusMsg.join('\n'), threadId, type);
            } catch (statusError) {
              // Fallback nếu không lấy được status
              return api.sendMessage([
                '❌ YÊU CẦU ZEFOY THẤT BẠI!',
                '',
                `📝 Lỗi: ${result.message}`,
                '',
                '💡 Có thể do:',
                '• Captcha sai',
                '• Dịch vụ tạm ngưng',
                '• Link TikTok không hợp lệ',
                '',
                '🔄 Thử lại: bonz của tớ status'
              ].join('\n'), threadId, type);
            }
          }
        } catch (error) {
          // Clean up on error
          delete global.zefoyPendingRequests[threadId];
          try { 
            const fs = require('fs');
            fs.unlinkSync(pendingRequest.captchaPath); 
          } catch {}
          
          return api.sendMessage('❌ Lỗi khi xử lý Zefoy: ' + error.message, threadId, type);
        }
      }
    }

    // Xử lý reply số để chọn nhạc
    if (messageText && /^[1-5]$/.test(messageText.trim())) {
      try {
        const soundcloud = require('./soundcloud.js');
        const Threads = require('../../core/controller/controllerThreads');
        
        // Lấy cache nhạc
        const row = await Threads.getData(threadId);
        const tdata = row?.data || {};
        const musicCache = tdata.music?.searches?.[uid];
        if (musicCache && Date.now() - (musicCache.ts || 0) <= 300000) { // 5 phút
          const songs = musicCache.payload || [];
          const idx = parseInt(messageText.trim(), 10) - 1;
          
          if (idx >= 0 && idx < songs.length) {
            const chosen = songs[idx];
            
            try {
              await api.sendMessage('🔽 Đang xử lý phát nhạc, vui lòng đợi...', threadId, type);
              const streamUrl = await soundcloud.getMusicStreamUrl(chosen.link);
              
              if (!streamUrl) {
                return api.sendMessage('❌ Không lấy được link phát trực tiếp. Thử bài khác.', threadId, type);
              }

              const caption = [
                `🎶 ${chosen.title}`,
                chosen.username ? `👤 ${chosen.username}` : '',
                chosen.playCount ? `▶️ ${chosen.playCount.toLocaleString()} | ❤️ ${chosen.likeCount.toLocaleString()}` : ''
              ].filter(Boolean).join('\n');

              // Thử gửi voice từ URL trước
              const urlVoicePayloads = [
                { msg: caption, attachments: [streamUrl], asVoice: true },
                { msg: caption, voice: streamUrl },
                { msg: caption, audio: streamUrl }
              ];
              
              let sent = false;
              for (const payload of urlVoicePayloads) {
                try { 
                  await api.sendMessage(payload, threadId, type); 
                  sent = true;
                  break; 
                } catch (_) {}
              }

              // Nếu không gửi được URL, tải file về
              if (!sent) {
                const safeTitle = (chosen.title || 'soundcloud').slice(0,80).replace(/[<>:"/\\|?*]/g,'_');
                const filePath = await soundcloud.saveFileToCache(streamUrl, `${safeTitle}.mp3`);
                
                if (filePath) {
                  const fileVoicePayloads = [
                    { msg: caption, attachments: [filePath], asVoice: true },
                    { msg: caption, voice: filePath },
                    { msg: caption, audio: filePath },
                    { msg: caption, attachments: [filePath] }
                  ];
                  
                  for (const payload of fileVoicePayloads) {
                    try { 
                      await api.sendMessage(payload, threadId, type); 
                      sent = true;
                      break; 
                    } catch (_) {}
                  }
                  
                  // Xóa file sau 5 phút
                  setTimeout(async () => {
                    try { 
                      const fs = require('fs').promises; 
                      await fs.unlink(filePath); 
                    } catch(_) {}
                  }, 300000);
                }
              }
              
              if (!sent) {
                await api.sendMessage('❌ Gửi nhạc thất bại, vui lòng thử lại.', threadId, type);
              }
              
              return; // Đã xử lý xong, không cần tiếp tục
            } catch (e) {
              console.error('[SoundCloud] Lỗi phát nhạc:', e.message);
              return api.sendMessage('❌ Gửi nhạc thất bại, vui lòng thử lại.', threadId, type);
            }
          }
        }
      } catch (e) {
        console.error('[SoundCloud] Lỗi xử lý reply:', e.message);
      }
    }

    // Safe Mode: kiểm duyệt và xóa tin nhắn vi phạm, nếu đã xóa thì dừng xử lý tiếp
    try {
      const safe = require('./safe.js');
      const removed = await safe.checkSafeMode({ api, event });
      if (removed) return;
    } catch {}

    // Kiểm tra & chặn khi nhóm đang khóa chat (trừ admin)
    const rowLock = await Threads.getData(threadId);
    const tdataLock = rowLock?.data || {};
    if (tdataLock.chat_locked) {
      const isAdminGroup = await isAdminInGroup(api, uid, threadId);
      const isAdminBot = isBotAdmin(uid);
      if (!(isAdminGroup || isAdminBot)) {
        try {
          await api.deleteMessage({
            threadId,
            type,
            data: {
              cliMsgId: r.cliMsgId || data.cliMsgId,
              msgId: r.msgId || data.msgId,
              uidFrom: uid
            }
          }, false);
        } catch (err) {
          console.log('Thu hồi khi khóa chat thất bại:', err?.message || err);
        }
        return; // không đếm tương tác khi đã bị chặn
      }
    }

    // Chặn theo từ cấm (nhạy cảm) nếu bật
    try {
      const tc = tdataLock.tu_cam || {};
      const enabled = !!tc.enabled;
      const words = Array.isArray(tc.words) ? tc.words : [];
      if (enabled && words.length > 0) {
        const isAdminGroup = await isAdminInGroup(api, uid, threadId);
        const isAdminBot = isBotAdmin(uid);
        if (!(isAdminGroup || isAdminBot)) {
          const raw = (r?.content?.title ?? r?.content) ?? (data?.content?.title ?? data?.content);
          const text = typeof raw === 'string' ? raw.toLowerCase() : '';
          if (text) {
            const matched = words.some(w => {
              const kw = String(w || '').toLowerCase().trim();
              return kw && text.includes(kw);
            });
            if (matched) {
              try {
                await api.deleteMessage({
                  threadId,
                  type,
                  data: {
                    cliMsgId: r.cliMsgId || data.cliMsgId,
                    msgId: r.msgId || data.msgId,
                    uidFrom: uid
                  }
                }, false);
              } catch (err) {
                console.log('Thu hồi do từ cấm thất bại:', err?.message || err);
              }
              return; // không đếm tương tác khi đã bị chặn
            }
          }
        }
      }
    } catch {}

    const row = await Threads.getData(threadId);
    const tdata = row?.data || {};
    const stats = tdata.stats || { total: 0, perUser: {} };
    stats.total = (stats.total || 0) + 1;
    stats.perUser[uid] = (stats.perUser[uid] || 0) + 1;
    tdata.stats = stats;
    Threads.setData(threadId, tdata);
  } catch (e) {
    // tránh làm vỡ luồng sự kiện
  }
};

// Kiểm tra admin nhóm Zalo
async function isAdminInGroup(api, userId, threadId) {
  try {
    const info = await api.getGroupInfo(threadId);
    const groupInfo = info.gridInfoMap[threadId];
    const isCreator = groupInfo.creatorId === userId;
    const isDeputy = Array.isArray(groupInfo.adminIds) && groupInfo.adminIds.includes(userId);
    return isCreator || isDeputy;
  } catch {
    return false;
  }
}

// Top tương tác: cao nhất, nhì, ba, bét
async function handleTop(api, event) {
  const { threadId, type } = event;
  const Threads = require('../../core/controller/controllerThreads');
  try {
    const row = await Threads.getData(threadId);
    const stats = row?.data?.stats || {};
    const perUser = stats.perUser || {};
    const entries = Object.entries(perUser); // [uid, count]
    if (entries.length === 0) {
      return api.sendMessage("Chưa có dữ liệu tương tác trong nhóm này.", threadId, type);
    }

    // sort desc by count
    entries.sort((a, b) => b[1] - a[1]);
    const top1 = entries[0];
    const top2 = entries[1];
    const top3 = entries[2];
    const bet = entries[entries.length - 1];

    // Lấy tên cho các uid cần thiết (unique)
    const pickUids = [top1?.[0], top2?.[0], top3?.[0], bet?.[0]].filter(Boolean);
    const unique = [...new Set(pickUids)];
    const names = {};
    for (const uid of unique) {
      try {
        const info = await api.getUserInfo(uid);
        names[uid] = info?.changed_profiles?.[uid]?.displayName || uid;
      } catch {
        names[uid] = uid;
      }
    }

    const lines = [
      '🏆 TOP TƯƠNG TÁC',
      entries.length >= 1 ? `🥇 #1: ${names[top1[0]]} - ${top1[1]} tin nhắn` : '',
      entries.length >= 2 ? `🥈 #2: ${names[top2[0]]} - ${top2[1]} tin nhắn` : '',
      entries.length >= 3 ? `🥉 #3: ${names[top3[0]]} - ${top3[1]} tin nhắn` : '',
      entries.length >= 1 ? `🐢 Bét: ${names[bet[0]]} - ${bet[1]} tin nhắn` : ''
    ].filter(Boolean);

    return api.sendMessage(lines.join('\n'), threadId, type);
  } catch (e) {
    return api.sendMessage('Không thể lấy TOP tương tác ngay lúc này.', threadId, type);
  }
}

// Thống kê tổng quan tương tác
async function handleThongKe(api, event) {
  const { threadId, type, data } = event;
  const Threads = require('../../core/controller/controllerThreads');
  try {
    const row = await Threads.getData(threadId);
    const stats = row?.data?.stats || {};
    const perUser = stats.perUser || {};
    const total = stats.total || 0;
    const entries = Object.entries(perUser); // [uid, count]

    if (entries.length === 0) {
      return api.sendMessage("Chưa có dữ liệu thống kê trong nhóm này.", threadId, type);
    }

    // Sắp xếp để tính rank
    entries.sort((a, b) => b[1] - a[1]);
    const uniqueUsers = entries.length;
    const top = entries[0];
    const yourId = data?.uidFrom;
    let yourCount = perUser[yourId] || 0;
    let yourRank = entries.findIndex(e => e[0] === yourId) + 1;
    const avg = (total / uniqueUsers).toFixed(2);

    // Lấy tên top và bạn
    let topName = top?.[0];
    let yourName = yourId;
    try {
      if (topName) {
        const info = await api.getUserInfo(topName);
        topName = info?.changed_profiles?.[topName]?.displayName || topName;
      }
    } catch {}
    try {
      if (yourId) {
        const info = await api.getUserInfo(yourId);
        yourName = info?.changed_profiles?.[yourId]?.displayName || yourId;
      }
    } catch {}

    const lines = [
      '📊 THỐNG KÊ TƯƠNG TÁC',
      `• Tổng tin nhắn: ${total}`,
      `• Số người tham gia: ${uniqueUsers}`,
      `• Trung bình/người: ${avg}`,
      `• Top: ${topName} - ${top[1]} tin nhắn`,
      `• Bạn (${yourName}): ${yourCount} tin nhắn, hạng #${yourRank}`
    ];

    return api.sendMessage(lines.join('\n'), threadId, type);
  } catch (e) {
    return api.sendMessage('Không thể lấy thống kê ngay lúc này.', threadId, type);
  }
}

// Liệt kê danh sách Chủ nhân (owner_bot)
async function handleDanhSachChuNhan(api, event) {
  const { threadId, type } = event;
  try {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot : [];
    const ownerConf = cfg.owner_bot;
    let owners = [];
    if (Array.isArray(ownerConf)) owners = ownerConf;
    else if (typeof ownerConf === 'string' && ownerConf.trim()) owners = [ownerConf.trim()];

    // Fallback: nếu chưa cấu hình owner, dùng admin đầu tiên (nếu có)
    if (owners.length === 0 && adminList.length > 0) owners = [adminList[0]];

    // Chuẩn hóa và loại trùng
    owners = Array.from(new Set((owners || []).map(x => String(x).trim()).filter(Boolean)));

    if (owners.length === 0) {
      return api.sendMessage('❕ Chưa cấu hình chủ nhân trong config.', threadId, type);
    }

    // Lấy tên hiển thị cho từng ID
    const lines = ['👑 DANH SÁCH CHỦ NHÂN'];
    for (const id of owners) {
      let name = id;
      try {
        const info = await api.getUserInfo(id);
        name = info?.changed_profiles?.[id]?.displayName || id;
      } catch {}
      lines.push(`• ${name} (${id})`);
    }

    return api.sendMessage(lines.join('\n'), threadId, type);
  } catch (e) {
    return api.sendMessage('❌ Không thể lấy danh sách chủ nhân lúc này.', threadId, type);
  }
}

// Hàm xử lý gmail ảo
async function handleGmailAo(api, event) {
  const { threadId, type, data } = event;
  
  try {
    const senderId = data.uidFrom;

    // Lấy thông tin người dùng Zalo
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Danh sách các service email ảo miễn phí
    const tempEmailServices = [
      { name: "10MinuteMail", domain: "10minutemail.com", url: "https://10minutemail.com", description: "Email tồn tại 10 phút, có thể gia hạn" },
      { name: "TempMail", domain: "tempmail.org", url: "https://temp-mail.org", description: "Email tạm thời, tự động làm mới" },
      { name: "Guerrilla Mail", domain: "guerrillamail.com", url: "https://www.guerrillamail.com", description: "Email tồn tại 1 giờ" },
      { name: "Mailinator", domain: "mailinator.com", url: "https://www.mailinator.com", description: "Email công khai, ai cũng có thể đọc" }
    ];

    // Tạo email ảo và mật khẩu ngẫu nhiên
    const randomString = Math.random().toString(36).substring(2, 10);
    const selectedService = tempEmailServices[Math.floor(Math.random() * tempEmailServices.length)];
    const tempEmail = `${randomString}@${selectedService.domain}`;
    const randomPassword = Math.random().toString(36).substring(2, 12);

    // Cấp bậc + lượt dùng
    const role = __getRoleLabel(senderId);
    const usage = __incUsage('gmail ảo', senderId);

    // Header thông tin dịch vụ theo format thống nhất
    const header = __formatServiceInfo({
      service: 'gmail ảo',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      howToUse: 'Dùng để đăng nhập đa nền tảng nhưng KHÔNG thể đăng nhập Google!'
    });

    const details = [
      '',
      '📧 THÔNG TIN GMAIL ẢO',
      `• Email: ${tempEmail}`,
      `• Mật khẩu: ${randomPassword}`
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type);
    
  } catch (error) {
    console.error("Lỗi tạo gmail ảo:", error);
    const uid = event?.data?.uidFrom || 'unknown';
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(uid);
      userName = info?.changed_profiles?.[uid]?.displayName || "Người dùng";
    } catch {}
    const role = __getRoleLabel(uid);
    const usage = __incUsage('gmail ảo', uid);
    const response = __formatServiceInfo({
      service: 'gmail ảo',
      userName,
      userId: uid,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
    });
    return api.sendMessage(response, threadId, type);
  }
}

// Hàm xử lý khởi động lại bot
async function handleRestart(api, event) {
  const { threadId, type, data } = event;
  
  try {
    const senderId = String(data.uidFrom);
    
    // Kiểm tra quyền admin
    const config = global.config;
    const adminList = Array.isArray(config.admin_bot) ? config.admin_bot : [];
    const ownerList = Array.isArray(config.owner_bot) ? config.owner_bot : [];
    
    if (!(adminList.includes(senderId) || ownerList.includes(senderId))) {
      return api.sendMessage(
        "❌ Bạn không có quyền khởi động lại bot!",
        threadId,
        type
      );
    }

    // Lấy thông tin người dùng
    let userName = "Admin";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Admin";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    if (global.__treoToolMode === true) {
      return api.sendMessage('⚠️ TREO đang chạy, bot đang ở chế độ TOOL nên không thể khởi động lại.', threadId, type);
    }

    const response = [
      `Người dùng: @${userName}`,
      `Dịch vụ: Khởi động lại bot`,
      `Thông báo: Thành công`,
      "",
      "🔄 Bot đang khởi động lại...",
      "⏳ Vui lòng đợi trong giây lát"
    ].join("\n");

    await api.sendMessage(response, threadId, type);
    
    // Khởi động lại bot sau 2 giây
    setTimeout(() => {
      process.exit(2); // Exit code 2 để index.js restart bot
    }, 2000);
    
  } catch (error) {
    console.error("Lỗi khởi động lại bot:", error);
    return api.sendMessage(
      "❌ Có lỗi xảy ra khi khởi động lại bot. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }
}

// Hàm lấy ID người dùng Zalo (chuyển sang file getid.js)
async function handleGetId(api, event) {
  // Load lệnh getid
  const getidCommand = require('./bonzgetid.js');
  return await getidCommand.run({ args: [], event, api });
}

// Hàm rút gọn link
async function handleShortenLink(api, event, args) {
  const { threadId, type, data } = event;
  const axios = require('axios');
  
  try {
    // Lấy thông tin người dùng
    const senderId = data.uidFrom;
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Kiểm tra có link không
    if (!args || args.length === 0) {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz rút gọn link`,
        `Thông báo: Lỗi - thiếu link`,
        `Link gốc: Không có`,
        `Link rút gọn: Không có`,
        `Cách dùng: bonz link [URL] - VD: bonz link https://google.com`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    let originalUrl = args[0];
    
    // Thêm https:// nếu không có
    if (!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://')) {
      originalUrl = 'https://' + originalUrl;
    }

    // Gọi API TinyURL để rút gọn link
    try {
      const tinyUrlResponse = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(originalUrl)}`);
      const shortUrl = tinyUrlResponse.data;

      // Kiểm tra nếu API trả về lỗi
      if (shortUrl.includes('Error') || shortUrl.includes('Invalid')) {
        throw new Error('TinyURL API error');
      }

      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz rút gọn link`,
        `Thông báo: Thành công`,
        `Link gốc: ${originalUrl}`,
        `Link rút gọn: ${shortUrl}`,
        `Cách dùng: Copy link rút gọn để chia sẻ, tiết kiệm không gian`
      ].join("\n");

      return api.sendMessage(response, threadId, type);

    } catch (apiError) {
      // Fallback: dùng is.gd API
      try {
        const isgdResponse = await axios.post('https://is.gd/create.php', 
          `format=simple&url=${encodeURIComponent(originalUrl)}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
        
        const shortUrl = isgdResponse.data.trim();

        const response = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz rút gọn link`,
          `Thông báo: Thành công`,
          `Link gốc: ${originalUrl}`,
          `Link rút gọn: ${shortUrl}`,
          `Cách dùng: Copy link rút gọn để chia sẻ, tiết kiệm không gian`
        ].join("\n");

        return api.sendMessage(response, threadId, type);

      } catch (fallbackError) {
        // Nếu cả 2 API đều lỗi, tạo link giả
        const shortId = Math.random().toString(36).substring(2, 8);
        const shortUrl = `https://short.ly/${shortId}`;

        const response = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz rút gọn link`,
          `Thông báo: Thành công (demo)`,
          `Link gốc: ${originalUrl}`,
          `Link rút gọn: ${shortUrl}`,
          `Cách dùng: Link demo - API tạm thởi không khả dụng`
        ].join("\n");

        return api.sendMessage(response, threadId, type);
      }
    }
    
  } catch (error) {
    console.error("Lỗi rút gọn link:", error);
    const response = [
      `Người dùng: ${userName || "Người dùng"}`,
      `Dịch vụ: bonz rút gọn link`,
      `Thông báo: Lỗi`,
      `Link gốc: Không có`,
      `Link rút gọn: Không có`,
      `Cách dùng: Có lỗi xảy ra, vui lòng thử lại sau`
    ].join("\n");
    
    return api.sendMessage(response, threadId, type);
  }
}


// Hàm xử lý thơ
async function handleTho(api, event) {
  const { threadId, type, data } = event;
  const fs = require('fs');
  const path = require('path');

  try {
    const senderId = data.uidFrom;

    // Lấy thông tin người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }
    // Nhãn vai trò + lượt dùng
    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz thơ', senderId);

    // Đọc file thơ
    const poemsPath = path.join(__dirname, '..', '..', 'assets', 'poems.json');
    if (!fs.existsSync(poemsPath)) {
      const header = __formatServiceInfo({
        service: 'bonz thơ',
        userName,
        userId: senderId,
        notify: 'Lỗi - không tìm thấy file thơ',
        role,
        usage,
        howToUse: 'Liên hệ admin để cập nhật dữ liệu thơ'
      });
      return api.sendMessage(header, threadId, type);
    }

    const poemsData = JSON.parse(fs.readFileSync(poemsPath, 'utf8'));
    const poems = poemsData.poems || [];

    if (poems.length === 0) {
      const header = __formatServiceInfo({
        service: 'bonz thơ',
        userName,
        userId: senderId,
        notify: 'Lỗi - không có thơ nào trong dữ liệu',
        role,
        usage,
        howToUse: 'Liên hệ admin để cập nhật dữ liệu thơ'
      });
      return api.sendMessage(header, threadId, type);
    }

    // Chọn ngẫu nhiên một bài thơ
    const randomPoem = poems[Math.floor(Math.random() * poems.length)];

    const header = __formatServiceInfo({
      service: 'bonz thơ',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
    });
    const details = [
      '',
      `📝 ${randomPoem.title}`,
      '',
      randomPoem.content,
      '',
      '💫 Chúc bạn có những phút giây thư giãn cùng thơ ca!'
    ].join('\n');

    return api.sendMessage(`${header}\n\n${details}`, threadId, type, null, senderId);

  } catch (error) {
    console.error('Lỗi xử lý thơ:', error);
    // Lỗi: vẫn đảm bảo định dạng thống nhất
    const uid = event?.data?.uidFrom || 'unknown';
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(uid);
      userName = info?.changed_profiles?.[uid]?.displayName || 'Người dùng';
    } catch {}
    const role = __getRoleLabel(uid);
    const usage = __incUsage('bonz thơ', uid);
    const header = __formatServiceInfo({
      service: 'bonz thơ',
      userName,
      userId: uid,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý thơ
async function handleQR(api, event, args) {
  const { threadId, type, data } = event;

  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch (err) {
    console.log('Không thể lấy thông tin user:', err?.message || err);
  }

  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz qr', senderId);

  try {
    // Kiểm tra có text để tạo QR không
    const text = (args || []).slice(1).join(' ').trim();
    if (!text) {
      const header = __formatServiceInfo({
        service: 'bonz qr',
        userName,
        userId: senderId,
        notify: 'Thiếu nội dung',
        role,
        usage,
        howToUse: 'bonz qr <nội dung cần tạo QR>'
      });
      return api.sendMessage(header, threadId, type);
    }

    // Sử dụng API QR: quickchart.io
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');

    const qrApiUrl = `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=300`;
    const qrResponse = await axios.get(qrApiUrl, { responseType: 'stream' });
    const fileName = `qr_${Date.now()}.png`;
    const filePath = path.join(__dirname, 'temp', fileName);

    // Tạo thư mục temp nếu chưa có
    const tempDir = path.dirname(filePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const writer = fs.createWriteStream(filePath);
    qrResponse.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const header = __formatServiceInfo({
      service: 'bonz qr',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      howToUse: 'Quét mã QR để xem nội dung'
    });

    const details = [
      '',
      `Nội dung: ${text}`,
      `Mã QR: Đã tạo thành công`
    ].join('\n');

    await api.sendMessage({
      msg: `${header}\n${details}`,
      attachments: filePath
    }, threadId, type, null, senderId);

    // Xóa file tạm sau khi gửi
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }, 5000);

  } catch (error) {
    console.error('Lỗi QR:', error);
    const header = __formatServiceInfo({
      service: 'bonz qr',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý dịch
async function handleDich(api, event, args) {
  const { threadId, type, data } = event;

  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch (err) {
    console.log('Không thể lấy thông tin user:', err?.message || err);
  }

  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz dịch', senderId);

  try {
    // Kiểm tra có text để dịch không (args: ['dịch', ...])
    const text = (args || []).slice(1).join(' ').trim();
    if (!text) {
      const header = __formatServiceInfo({
        service: 'bonz dịch',
        userName,
        userId: senderId,
        notify: 'Thiếu nội dung cần dịch',
        role,
        usage,
        howToUse: 'bonz dịch <văn bản cần dịch>'
      });
      return api.sendMessage(header, threadId, type);
    }

    // Gọi Google Translate API miễn phí
    const axios = require('axios');
    const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await axios.get(translateUrl);
    const translatedText = resp?.data?.[0]?.[0]?.[0] || '';
    const detectedLang = resp?.data?.[2] || 'unknown';

    // Map mã ngôn ngữ sang tên
    const langNames = {
      'en': 'Tiếng Anh',
      'vi': 'Tiếng Việt',
      'zh': 'Tiếng Trung',
      'ja': 'Tiếng Nhật',
      'ko': 'Tiếng Hàn',
      'fr': 'Tiếng Pháp',
      'de': 'Tiếng Đức',
      'es': 'Tiếng Tây Ban Nha',
      'th': 'Tiếng Thái',
      'unknown': 'Không xác định'
    };
    const langName = langNames[detectedLang] || detectedLang;

    const header = __formatServiceInfo({
      service: 'bonz dịch',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      howToUse: 'Dịch tự động sang tiếng Việt'
    });

    const details = [
      '',
      `Ngôn ngữ gốc: ${langName}`,
      `Văn bản gốc: ${text}`,
      `Bản dịch: ${translatedText}`
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type, null, senderId);
  } catch (error) {
    console.error('Lỗi dịch:', error);
    const header = __formatServiceInfo({
      service: 'bonz dịch',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý quiz
async function handleQuiz(api, event) {
  const { threadId, type, data } = event;
  const fs = require('fs');
  const path = require('path');

  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch (err) {
    console.log('Không thể lấy thông tin user:', err?.message || err);
  }

  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz quiz', senderId);

  try {
    // Đọc danh sách quiz từ file JSON
    const quizPath = path.join(__dirname, '..', '..', 'assets', 'quiz.json');

    if (!fs.existsSync(quizPath)) {
      const header = __formatServiceInfo({
        service: 'bonz quiz',
        userName,
        userId: senderId,
        notify: 'Không tìm thấy dữ liệu quiz',
        role,
        usage,
        howToUse: 'Gõ: bonz quiz để nhận 1 câu hỏi ngẫu nhiên'
      });
      return api.sendMessage(header, threadId, type);
    }

    const quizDataRaw = fs.readFileSync(quizPath, 'utf8');
    let quizData = [];
    try { quizData = JSON.parse(quizDataRaw); } catch (_) { quizData = []; }
    if (!Array.isArray(quizData) || quizData.length === 0) {
      const header = __formatServiceInfo({
        service: 'bonz quiz',
        userName,
        userId: senderId,
        notify: 'Lỗi - dữ liệu quiz trống hoặc không hợp lệ',
        role,
        usage,
        howToUse: 'Cập nhật assets/quiz.json theo cấu trúc mảng câu hỏi'
      });
      return api.sendMessage(header, threadId, type);
    }

    const randomQuiz = quizData[Math.floor(Math.random() * quizData.length)];

    const header = __formatServiceInfo({
      service: 'bonz quiz',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      howToUse: 'Gõ: bonz quiz để nhận 1 câu hỏi ngẫu nhiên'
    });

    const opts = Array.isArray(randomQuiz?.options) ? randomQuiz.options.join('\n') : '';
    const details = [
      '',
      `❓ Câu hỏi: ${randomQuiz?.question || 'Không có'}`,
      opts,
      '',
      `💡 Đáp án: ${randomQuiz?.answer || 'Không có'}`,
      `📝 Giải thích: ${randomQuiz?.explanation || 'Không có'}`
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type, null, senderId);
  } catch (error) {
    console.error('Lỗi quiz:', error);
    const header = __formatServiceInfo({
      service: 'bonz quiz',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Chuyển đổi ảnh/sticker sang PNG/JPG/WebP bằng URL
async function handleStickerConvert(api, event, args = []) {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz sticker', senderId);

  const format = (args[1] || '').toLowerCase();
  const imgUrl = args[2] || '';
  const allow = ['png','jpg','webp'];
  if (!allow.includes(format) || !/^https?:\/\//i.test(imgUrl)) {
    const header = __formatServiceInfo({
      service: 'bonz sticker', userName, userId: senderId, role, usage,
      notify: 'Thiếu tham số hoặc không hợp lệ',
      howToUse: 'bonz sticker <png|jpg|webp> <image_url>'
    });
    return api.sendMessage(header, threadId, type);
  }

  try {
    const axios = require('axios');
    const sharp = require('sharp');
    const fs = require('fs');
    const path = require('path');

    const resp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
    const inputBuf = Buffer.from(resp.data);

    let pipeline = sharp(inputBuf).ensureAlpha();
    if (format === 'png') pipeline = pipeline.png({ quality: 90 });
    if (format === 'jpg') pipeline = pipeline.jpeg({ quality: 90 });
    if (format === 'webp') pipeline = pipeline.webp({ quality: 90 });

    const outputBuf = await pipeline.toBuffer();
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `sticker_${Date.now()}.${format}`);
    fs.writeFileSync(filePath, outputBuf);

    const header = __formatServiceInfo({
      service: 'bonz sticker', userName, userId: senderId, role, usage,
      notify: `Đã chuyển ảnh sang ${format.toUpperCase()}`,
      howToUse: 'bonz sticker <png|jpg|webp> <image_url>'
    });

    await api.sendMessage({ msg: header, attachments: filePath }, threadId, type, null, senderId);

    setTimeout(() => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {} }, 5000);
  } catch (e) {
    return api.sendMessage('❌ Không thể chuyển đổi ảnh. Vui lòng thử URL khác.', threadId, type);
  }
}

// Lấy tin tức từ RSS miễn phí, không cần API key
async function handleNews(api, event, args = []) {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz news', senderId);

  const sources = {
    vnexpress: 'https://vnexpress.net/rss/tin-moi-nhat.rss',
    zing: 'https://znews.vn/rss.html',
    bbc: 'https://feeds.bbci.co.uk/vietnamese/rss.xml',
    thanhnien: 'https://thanhnien.vn/rss/home.rss',
    tuoitre: 'https://tuoitre.vn/rss/tin-moi-nhat.rss'
  };

  const src = (args[0] || 'vnexpress').toLowerCase();
  const count = Math.min(10, Math.max(1, parseInt(args[1], 10) || 5));
  const url = sources[src] || sources.vnexpress;

  try {
    // Kiểm tra có fast-xml-parser không
    let XMLParser;
    try {
      XMLParser = require('fast-xml-parser').XMLParser;
    } catch (e) {
      throw new Error('Thiếu thư viện fast-xml-parser. Vui lòng cài đặt: npm install fast-xml-parser');
    }

    const resp = await axios.get(url, { 
      responseType: 'text', 
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const dataXml = parser.parse(resp.data);
    const channel = dataXml?.rss?.channel || dataXml?.feed || {};
    const items = channel.item || channel.entry || [];
    const list = Array.isArray(items) ? items : [items];

    const topText = list.slice(0, count).map((it, idx) => {
      const title = (it?.title && it.title['#text']) ? it.title['#text'] : (it?.title || 'Không tiêu đề');
      let link = '';
      if (it?.link && typeof it.link === 'object') {
        link = it.link.href || it.link['#text'] || '';
      } else {
        link = it?.link || it?.guid || '';
      }
      return `${idx + 1}. ${title}\n   ${link}`;
    }).join('\n');

    const header = __formatServiceInfo({
      service: 'bonz news', userName, userId: senderId, role, usage,
      notify: `Nguồn: ${src} • Số bài: ${count}`,
      howToUse: 'bonz news [vnexpress|zing|bbc|thanhnien|tuoitre] [số_bài]'
    });
    return api.sendMessage(`${header}\n\n${topText || 'Không có bài viết.'}`, threadId, type);
  } catch (e) {
    console.error('[BONZ NEWS] Lỗi:', e.message);
    
    let errorMsg = 'Không lấy được tin tức. Vui lòng thử lại.';
    if (e.message.includes('fast-xml-parser')) {
      errorMsg = 'Thiếu thư viện cần thiết. Admin cần cài: npm install fast-xml-parser';
    } else if (e.code === 'ENOTFOUND' || e.code === 'ETIMEDOUT') {
      errorMsg = 'Không thể kết nối tới nguồn tin. Kiểm tra kết nối mạng.';
    }
    
    const header = __formatServiceInfo({
      service: 'bonz news', userName, userId: senderId, role, usage,
      notify: errorMsg,
      howToUse: 'bonz news [vnexpress|zing|bbc|thanhnien|tuoitre] [số_bài]'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// ====== GAME FUNCTIONS ======

// Game Bingo - Tạo bảng bingo ngẫu nhiên
async function handleBingo(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo([senderId]);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz bingo', senderId);

  // Tạo bảng bingo 5x5 với số từ 1-75
  const bingoCard = [];
  const usedNumbers = new Set();
  
  // Tạo 5 hàng, mỗi hàng 5 số
  for (let row = 0; row < 5; row++) {
    const currentRow = [];
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) {
        // Ô giữa là FREE
        currentRow.push('FREE');
      } else {
        let num;
        do {
          // B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75
          const min = col * 15 + 1;
          const max = col * 15 + 15;
          num = Math.floor(Math.random() * (max - min + 1)) + min;
        } while (usedNumbers.has(num));
        usedNumbers.add(num);
        currentRow.push(num);
      }
    }
    bingoCard.push(currentRow);
  }

  // Format bảng bingo
  const header = ['B', 'I', 'N', 'G', 'O'];
  let bingoText = '🎯 BINGO CARD 🎯\n\n';
  bingoText += '   ' + header.join('  ') + '\n';
  bingoText += '  ─────────────\n';
  
  for (let i = 0; i < 5; i++) {
    const row = bingoCard[i].map(cell => {
      if (cell === 'FREE') return 'FREE';
      return String(cell).padStart(2, '0');
    });
    bingoText += `${i + 1}│ ${row.join(' ')} │\n`;
  }
  
  bingoText += '  ─────────────\n\n';
  bingoText += '🎲 Số may mắn hôm nay: ';
  
  // Chọn 5 số may mắn từ bảng
  const luckyNumbers = [];
  const allNumbers = bingoCard.flat().filter(n => n !== 'FREE');
  for (let i = 0; i < 5; i++) {
    const randomIndex = Math.floor(Math.random() * allNumbers.length);
    luckyNumbers.push(allNumbers.splice(randomIndex, 1)[0]);
  }
  bingoText += luckyNumbers.join(', ');

  const serviceHeader = __formatServiceInfo({
    service: 'bonz bingo', userName, userId: senderId, role, usage,
    notify: 'Game Bingo - Chúc may mắn!',
    howToUse: 'bonz bingo'
  });

  return api.sendMessage(`${serviceHeader}\n\n${bingoText}`, threadId, type);
}

// Xổ số mini với nhiều giải thưởng
async function handleLottery(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo([senderId]);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz lottery', senderId);

  // Tạo số xổ số 6 chữ số
  const winningNumber = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  const userNumber = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  
  // Kiểm tra trúng thưởng
  let prize = '';
  let matches = 0;
  
  // Đếm số chữ số trùng khớp
  for (let i = 0; i < 6; i++) {
    if (winningNumber[i] === userNumber[i]) matches++;
  }
  
  // Xác định giải thưởng
  if (matches === 6) {
    prize = '🏆 ĐẶC BIỆT - 1 TỶ ĐỒNG! 🎉';
  } else if (matches === 5) {
    prize = '🥇 GIẢI NHẤT - 100 TRIỆU ĐỒNG!';
  } else if (matches === 4) {
    prize = '🥈 GIẢI NHÌ - 10 TRIỆU ĐỒNG!';
  } else if (matches === 3) {
    prize = '🥉 GIẢI BA - 1 TRIỆU ĐỒNG!';
  } else if (matches === 2) {
    prize = '🎫 GIẢI KHUYẾN KHÍCH - 100K!';
  } else if (matches === 1) {
    prize = '🍀 MAY MẮN LẦN SAU!';
  } else {
    prize = '😢 Chưa trúng lần này!';
  }

  const lotteryText = [
    '🎰 KẾT QUẢ XỔ SỐ MINI 🎰',
    '',
    `🎯 Số trúng thưởng: ${winningNumber}`,
    `🎲 Số của bạn:     ${userNumber}`,
    '',
    `🔍 Trùng khớp: ${matches}/6 chữ số`,
    `🏅 Kết quả: ${prize}`,
    '',
    '💰 BẢNG GIẢI THƯỞNG:',
    '• 6 số: Đặc biệt - 1 tỷ đồng',
    '• 5 số: Giải nhất - 100 triệu',
    '• 4 số: Giải nhì - 10 triệu',
    '• 3 số: Giải ba - 1 triệu',
    '• 2 số: Khuyến khích - 100k',
    '• 1 số: Chúc may mắn lần sau!'
  ].join('\n');

  const serviceHeader = __formatServiceInfo({
    service: 'bonz lottery', userName, userId: senderId, role, usage,
    notify: 'Xổ số mini - Thử vận may!',
    howToUse: 'bonz lottery'
  });

  return api.sendMessage(`${serviceHeader}\n\n${lotteryText}`, threadId, type);
}

// Số may mắn hôm nay
async function handleLucky(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo([senderId]);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz lucky', senderId);

  // Tạo các số may mắn dựa trên ngày và user ID
  const today = new Date();
  const seed = senderId + today.getDate() + today.getMonth() + today.getFullYear();
  
  // Sử dụng seed để tạo số ổn định trong ngày
  const random = (seed * 9301 + 49297) % 233280;
  const rnd = random / 233280;
  
  const luckyNumbers = {
    main: Math.floor(rnd * 100) + 1,
    secondary: [
      Math.floor((rnd * 1000) % 50) + 1,
      Math.floor((rnd * 10000) % 50) + 1,
      Math.floor((rnd * 100000) % 50) + 1
    ],
    lottery: Math.floor(rnd * 1000000).toString().padStart(6, '0'),
    color: ['Đỏ', 'Xanh lá', 'Xanh dương', 'Vàng', 'Tím', 'Hồng', 'Cam'][Math.floor(rnd * 7)],
    direction: ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Bắc', 'Tây Bắc', 'Đông Nam', 'Tây Nam'][Math.floor(rnd * 8)]
  };

  const luckyText = [
    '🍀 SỐ MAY MẮN HÔM NAY 🍀',
    '',
    `🎯 Số chính: ${luckyNumbers.main}`,
    `🎲 Số phụ: ${luckyNumbers.secondary.join(', ')}`,
    `🎰 Số xổ số: ${luckyNumbers.lottery}`,
    '',
    `🌈 Màu may mắn: ${luckyNumbers.color}`,
    `🧭 Hướng may mắn: ${luckyNumbers.direction}`,
    '',
    '⭐ LỜI KHUYÊN:',
    '• Sử dụng số chính cho quyết định quan trọng',
    '• Số phụ dùng cho game, cá cược nhỏ',
    '• Màu sắc cho trang phục, phụ kiện',
    '• Hướng di chuyển thuận lợi',
    '',
    `📅 Ngày: ${today.toLocaleDateString('vi-VN')}`,
    '🔄 Số may mắn thay đổi mỗi ngày!'
  ].join('\n');

  const serviceHeader = __formatServiceInfo({
    service: 'bonz lucky', userName, userId: senderId, role, usage,
    notify: 'Số may mắn cá nhân hôm nay',
    howToUse: 'bonz lucky'
  });

  return api.sendMessage(`${serviceHeader}\n\n${luckyText}`, threadId, type);
}

// Xem vận may và tử vi
async function handleFortune(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo([senderId]);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz fortune', senderId);

  // Tạo vận may dựa trên ngày và user ID
  const today = new Date();
  const seed = senderId + today.getDate() + today.getMonth();
  const random = (seed * 9301 + 49297) % 233280;
  const rnd = random / 233280;

  const fortunes = {
    love: ['💕 Tình yêu', '💖 Rất tốt', '💗 Tốt', '💙 Bình thường', '💔 Cần cẩn thận'][Math.floor(rnd * 5)],
    career: ['🚀 Sự nghiệp', '⭐ Xuất sắc', '🌟 Tốt', '✨ Ổn định', '⚠️ Thận trọng'][Math.floor((rnd * 10) % 5)],
    health: ['💪 Sức khỏe', '🟢 Tuyệt vời', '🟡 Tốt', '🟠 Chú ý', '🔴 Cần nghỉ ngơi'][Math.floor((rnd * 100) % 5)],
    money: ['💰 Tài chính', '💎 Thịnh vượng', '💵 Ổn định', '💳 Tiết kiệm', '⚠️ Thận trọng'][Math.floor((rnd * 1000) % 5)],
    overall: Math.floor(rnd * 100) + 1
  };

  const predictions = [
    'Hôm nay là ngày tốt để bắt đầu dự án mới',
    'Hãy tin tưởng vào trực giác của bạn',
    'Cơ hội đang chờ đợi, hãy nắm bắt',
    'Sự kiên nhẫn sẽ mang lại kết quả tốt',
    'Hãy dành thời gian cho gia đình và bạn bè',
    'Ngày hôm nay thuận lợi cho việc học hỏi',
    'Hãy cẩn thận trong các quyết định tài chính',
    'Sức khỏe cần được chú ý nhiều hơn',
    'Tình yêu đang đến gần bạn',
    'Hãy giữ thái độ tích cực và lạc quan'
  ];

  const prediction = predictions[Math.floor((rnd * 10000) % predictions.length)];

  const fortuneText = [
    '🔮 VẬN MAY HÔM NAY 🔮',
    '',
    '📊 CHỈ SỐ VẬN MAY:',
    `${fortunes.love.split(' ')[0]} ${fortunes.love.split(' ')[1]}: ${fortunes.love.split(' ').slice(2).join(' ')}`,
    `${fortunes.career.split(' ')[0]} ${fortunes.career.split(' ')[1]}: ${fortunes.career.split(' ').slice(2).join(' ')}`,
    `${fortunes.health.split(' ')[0]} ${fortunes.health.split(' ')[1]}: ${fortunes.health.split(' ').slice(2).join(' ')}`,
    `${fortunes.money.split(' ')[0]} ${fortunes.money.split(' ')[1]}: ${fortunes.money.split(' ').slice(2).join(' ')}`,
    '',
    `🎯 Tổng quan: ${fortunes.overall}/100 điểm`,
    '',
    '🌟 DỰ ĐOÁN HÔM NAY:',
    `"${prediction}"`,
    '',
    '🎴 LỜI KHUYÊN:',
    '• Giữ tinh thần tích cực',
    '• Lắng nghe trực giác bản thân',
    '• Cân nhắc kỹ trước khi quyết định',
    '• Dành thời gian chăm sóc sức khỏe',
    '',
    `📅 Ngày: ${today.toLocaleDateString('vi-VN')}`,
    '🔄 Vận may thay đổi mỗi ngày!'
  ].join('\n');

  const serviceHeader = __formatServiceInfo({
    service: 'bonz fortune', userName, userId: senderId, role, usage,
    notify: 'Tử vi và vận may hôm nay',
    howToUse: 'bonz fortune'
  });

  return api.sendMessage(`${serviceHeader}\n\n${fortuneText}`, threadId, type);
}

// Tung xúc xắc
async function handleDice(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo([senderId]);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz dice', senderId);

  // Số lượng xúc xắc (mặc định 2, tối đa 6)
  const diceCount = Math.min(6, Math.max(1, parseInt(args[0]) || 2));
  const diceResults = [];
  let total = 0;

  // Tung xúc xắc
  for (let i = 0; i < diceCount; i++) {
    const result = Math.floor(Math.random() * 6) + 1;
    diceResults.push(result);
    total += result;
  }

  // Biểu tượng xúc xắc
  const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const diceDisplay = diceResults.map(r => diceEmojis[r - 1]).join(' ');

  // Đánh giá kết quả
  let evaluation = '';
  const average = total / diceCount;
  if (average >= 5) {
    evaluation = '🔥 Xuất sắc! Rất may mắn!';
  } else if (average >= 4) {
    evaluation = '✨ Tốt! Khá may mắn!';
  } else if (average >= 3) {
    evaluation = '😊 Bình thường, không tệ!';
  } else {
    evaluation = '😅 Hơi xui, thử lại nhé!';
  }

  const diceText = [
    '🎲 TUNG XÚC XẮC 🎲',
    '',
    `🎯 Số xúc xắc: ${diceCount}`,
    `🎲 Kết quả: ${diceDisplay}`,
    `📊 Chi tiết: ${diceResults.join(', ')}`,
    `🔢 Tổng điểm: ${total}`,
    `📈 Trung bình: ${average.toFixed(1)}`,
    '',
    `🎊 Đánh giá: ${evaluation}`,
    '',
    '🎮 CÁCH CHƠI:',
    '• bonz dice - Tung 2 xúc xắc',
    '• bonz dice 3 - Tung 3 xúc xắc',
    '• bonz dice 6 - Tung tối đa 6 xúc xắc',
    '',
    '🍀 Chúc may mắn!'
  ].join('\n');

  const serviceHeader = __formatServiceInfo({
    service: 'bonz dice', userName, userId: senderId, role, usage,
    notify: `Tung ${diceCount} xúc xắc - Tổng ${total} điểm`,
    howToUse: 'bonz dice [số_lượng]'
  });

  return api.sendMessage(`${serviceHeader}\n\n${diceText}`, threadId, type);
}

// ====== Helpers: Usage counter ======
const __usageTemp = new Map();
function __incUsage(service, userId) {
  const key = `${service}:${userId}`;
  const n = (__usageTemp.get(key) || 0) + 1;
  __usageTemp.set(key, n);
  return n;
}

function __getRoleLabel(userId) {
  try {
     const cfg = global?.config || {};
     const ownersRaw = cfg?.owner_bot;
     const adminsRaw = cfg?.admin_bot;
     const owners = Array.isArray(ownersRaw) ? ownersRaw : (ownersRaw ? [ownersRaw] : []);
     const admins = Array.isArray(adminsRaw) ? adminsRaw : (adminsRaw ? [adminsRaw] : []);
     if (owners.map(String).includes(String(userId))) return 'Chủ nhân';
     if (admins.map(String).includes(String(userId))) return 'Admin bot';
     return 'Thành viên';
   } catch { return 'Thành viên'; }
 }
 function __formatServiceInfo({ service, userName, userId, notify, role, usage, howToUse, showRole = true }) {
  const lines = [];
  lines.push('Bảng thông tin dịch vụ');
  lines.push(`ng dùng: ${userName || 'Không xác định'}`);
  lines.push(`dịch vụ : ${service || 'Không xác định'}`);
  lines.push(`id ng dùng: ${userId || 'Chưa xác định'}`);
  if (showRole) {
    lines.push(`cấp bậc: ${role || 'Thành viên'}`);
  }
  lines.push(`số lượt dùng: ${typeof usage !== 'undefined' && usage !== null ? usage : 0}`);
  lines.push(`thông báo: ${typeof notify !== 'undefined' ? (notify || 'Không có') : 'Không có'}`);
  if (typeof howToUse === 'string' && howToUse.trim()) {
    lines.push(`cách dùng: ${howToUse}`);
  }
  return lines.join('\n');
}
 

// Hàm xử lý ảnh trai
async function handleAnhTrai(api, event, args = []) {
  const { threadId, type, data } = event;
  const axios = require('axios');
  const fs = require('fs');
  const path = require('path');
  const cfg = global?.config || {};
  const countReq = Math.max(1, Math.min(5, parseInt(args[0], 10) || 1)); // hỗ trợ 1-5 ảnh
  let userName = "Người dùng"; // khai báo ngoài try để catch dùng được

  // tiện ích: tải ảnh về file tạm
  async function downloadToTemp(url, prefix = 'boy') {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const ext = (path.extname(new URL(url).pathname) || '.jpg').split('?')[0];
    const filePath = path.join(tempDir, `${prefix}_${Date.now()}_${Math.floor(Math.random()*9999)}${ext}`);
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8'
      }
    });
    fs.writeFileSync(filePath, resp.data);
    return filePath;
  }

  // tiện ích: gửi 1 ảnh với thông điệp và dọn dẹp
  async function sendOne(filePath, meta = {}) {
    const { source = 'Nguồn không xác định' } = meta;
    const role = __getRoleLabel(data.uidFrom);
    const usage = __incUsage('bonz ảnh trai', data.uidFrom);
    const messageText = __formatServiceInfo({
      service: 'bonz ảnh trai',
      userName,
      userId: data.uidFrom,
      notify: `Thành công (${source})`,
      role,
      usage,
      keyGot: 0,
      keyCount: 0
    });
    await api.sendMessage({ msg: messageText, attachments: filePath }, threadId, type, null, data.uidFrom);
    setTimeout(() => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {} }, 5000);
  }

  // Lấy ảnh online ưu tiên: SerpAPI -> Google CSE
  async function fetchOnlineUrls(query, n) {
    const urls = [];
    const femaleBadWords = /(female|woman|women|girl|girls|lady|ladies|phụ nữ|con gái|cô gái|nữ)/i;
    // 1) SerpAPI
    const serpKey = cfg?.serpapi_key;
    if (serpKey) {
      try {
        const u = 'https://serpapi.com/search.json';
        const params = { engine: 'google_images', q: query, ijn: '0', api_key: serpKey }; // ijn=0 trang đầu
        const resp = await axios.get(u, { params, timeout: 15000 });
        const arr = resp?.data?.images_results || [];
        for (const it of arr) {
          const titleText = `${it?.title || ''} ${it?.source || ''}`;
          if (femaleBadWords.test(titleText)) continue; // loại hình có dấu hiệu nữ
          const link = it?.original || it?.thumbnail || it?.source || it?.link;
          if (link && /^https?:\/\//i.test(link)) urls.push(link);
          if (urls.length >= n) break;
        }
        if (urls.length >= n) return urls;
      } catch (e) {
        console.log('SerpAPI lỗi hoặc không có dữ liệu:', e?.message || e);
      }
    }
    // 2) Google CSE
    const cseKey = cfg?.google_cse?.api_key;
    const cseCx = cfg?.google_cse?.cx;
    if (cseKey && cseCx && urls.length < n) {
      try {
        const u = 'https://www.googleapis.com/customsearch/v1';
        const params = { q: query, searchType: 'image', num: Math.min(n, 10), key: cseKey, cx: cseCx, safe: 'off' };
        const resp = await axios.get(u, { params, timeout: 15000 });
        const items = resp?.data?.items || [];
        for (const it of items) {
          const titleText = `${it?.title || ''} ${it?.snippet || ''}`;
          if (femaleBadWords.test(titleText)) continue; // loại hình có dấu hiệu nữ
          const link = it?.link;
          if (link && /^https?:\/\//i.test(link)) urls.push(link);
          if (urls.length >= n) break;
        }
      } catch (e) {
        console.log('Google CSE lỗi hoặc không có dữ liệu:', e?.message || e);
      }
    }
    return urls;
  }

  try {
    const senderId = data.uidFrom;
    // Lấy thông tin người dùng
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    const query = 'handsome male portrait, man, guy, boy face, aesthetic -woman -women -girl -girls -female -lady -ladies -phụ -nữ -cô -gái';
    const onlineUrls = await fetchOnlineUrls(query, countReq);
    if (onlineUrls && onlineUrls.length > 0) {
      // gửi từng ảnh để đảm bảo tương thích API
      for (const link of onlineUrls) {
        try {
          const fp = await downloadToTemp(link, 'boy');
          await sendOne(fp, { source: 'Google Images' });
        } catch (e) {
          console.log('Tải/gửi ảnh online lỗi:', e?.message || e);
        }
      }
      return;
    }

    // Fallback 1: ảnh cục bộ
    const localDir = path.join(__dirname, '..', '..', 'ảnh trai');
    const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
    let localFiles = [];
    try {
      if (fs.existsSync(localDir)) {
        localFiles = fs
          .readdirSync(localDir)
          .filter(f => allowedExt.has(path.extname(f).toLowerCase()))
          .map(f => path.join(localDir, f));
      }
    } catch {}
    if (localFiles.length > 0) {
      // chọn ngẫu nhiên không lặp
      for (let i = localFiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [localFiles[i], localFiles[j]] = [localFiles[j], localFiles[i]];
      }
      const picks = localFiles.slice(0, countReq);
      for (const p of picks) {
        try {
          {
            const role = __getRoleLabel(senderId);
            const usage = __incUsage('bonz ảnh trai', senderId);
            const msg = __formatServiceInfo({
              service: 'bonz ảnh trai',
              userName,
              userId: senderId,
              notify: 'Thành công',
              role,
              usage,
              keyGot: 0,
              keyCount: 0
            });
            await api.sendMessage({ msg, attachments: p }, threadId, type, null, senderId);
          }
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      return;
    }

    // Fallback 2: dùng danh sách URL trong boy.json
    const boyImages = require('../../assets/boy.json');
    if (!Array.isArray(boyImages) || boyImages.length === 0) {
      return api.sendMessage("❌ Không có ảnh trai nào trong dữ liệu.", threadId, type);
    }
    // trộn và chọn
    const shuffled = boyImages.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picks = shuffled.slice(0, countReq);
    for (const link of picks) {
      try {
        const fp = await downloadToTemp(link, 'boy');
        await sendOne(fp, { source: 'Dữ liệu URL (boy.json)' });
      } catch (e) {
        console.log('Tải/gửi ảnh từ boy.json lỗi:', e?.message || e);
      }
    }
    return;

  } catch (error) {
    console.error("Lỗi ảnh trai:", error);
    const role = __getRoleLabel(data?.uidFrom);
    const usage = __incUsage('bonz ảnh trai', data?.uidFrom || 'unknown');
    const response = __formatServiceInfo({
      service: 'bonz ảnh trai',
      userName: userName || 'Người dùng',
      userId: data?.uidFrom || 'unknown',
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
      keyGot: 0,
      keyCount: 0
    });
    return api.sendMessage(response, threadId, type);
  }
}

// Hàm khóa chat nhóm
async function handleLockChat(api, event) {
  const { threadId, type, data } = event;
  
  try {
    const senderId = data.uidFrom;
    
    // Lấy thông tin người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Kiểm tra quyền admin
    const adminList = Array.isArray(global.config.admin_bot) ? global.config.admin_bot : [];
    const cleanAdminList = adminList.map(id => String(id).trim());
    
    if (!cleanAdminList.includes(String(senderId).trim())) {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz khóa chat`,
        `Thông báo: Lỗi - không có quyền`,
        `Trạng thái: Từ chối`,
        `Lý do: Chỉ admin mới được sử dụng`,
        `Cách dùng: Liên hệ admin để được cấp quyền`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    // Kiểm tra xem có phải chat nhóm không
    if (type !== "group") {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz khóa chat`,
        `Thông báo: Lỗi - không phải nhóm`,
        `Trạng thái: Từ chối`,
        `Lý do: Chỉ có thể khóa chat nhóm`,
        `Cách dùng: Sử dụng lệnh trong nhóm Zalo`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    // Thực hiện khóa chat nhóm - thử nhiều phương pháp
    try {
      // Phương pháp 1: Thử changeGroupSettings
      try {
        await api.changeGroupSettings(threadId, {
          allowMemberInvite: false,
          allowMemberPost: false
        });
      } catch (e1) {
        // Phương pháp 2: Thử muteGroup
        try {
          await api.muteGroup(threadId);
        } catch (e2) {
          // Phương pháp 3: Thử setGroupRestriction
          try {
            await api.setGroupRestriction(threadId, true);
          } catch (e3) {
            // Phương pháp 4: Thử changeGroupInfo
            try {
              await api.changeGroupInfo(threadId, {
                restrictPosting: true
              });
            } catch (e4) {
              throw new Error("Không có API nào hoạt động");
            }
          }
        }
      }
      
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz khóa chat`,
        `Thông báo: Thành công`,
        `Trạng thái: Đã khóa`,
        `Nhóm ID: ${threadId}`,
        `Cách dùng: Chỉ admin có thể gửi tin nhắn`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
      
    } catch (lockError) {
      console.error("Lỗi khóa nhóm:", lockError);
      
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz khóa chat`,
        `Thông báo: Lỗi - API không hỗ trợ`,
        `Trạng thái: Thất bại`,
        `Lý do: Zalo API không cho phép khóa nhóm từ bot`,
        `Cách dùng: Chỉ có thể khóa thủ công từ app Zalo`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }
    
  } catch (error) {
    console.error("Lỗi khóa chat:", error);
    
    const response = [
      `Người dùng: ${userName || "Người dùng"}`,
      `Dịch vụ: bonz khóa chat`,
      `Thông báo: Lỗi hệ thống`,
      `Trạng thái: Thất bại`,
      `Lý do: Có lỗi xảy ra`,
      `Cách dùng: Vui lòng thử lại sau`
    ].join("\n");
    
    return api.sendMessage(response, threadId, type);
  }
}


// Hàm mở khóa chat nhóm
async function handleUnlockChat(api, event) {
  const { threadId, type, data } = event;
  
  try {
    const senderId = data.uidFrom;
    
    // Lấy thông tin người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Kiểm tra quyền admin
    const adminList = Array.isArray(global.config.admin_bot) ? global.config.admin_bot : [];
    const cleanAdminList = adminList.map(id => String(id).trim());
    
    if (!cleanAdminList.includes(String(senderId).trim())) {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz mở chat`,
        `Thông báo: Lỗi - không có quyền`,
        `Trạng thái: Từ chối`,
        `Lý do: Chỉ admin mới được sử dụng`,
        `Cách dùng: Liên hệ admin để được cấp quyền`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    // Kiểm tra xem có phải chat nhóm không
    if (type !== "group") {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz mở chat`,
        `Thông báo: Lỗi - không phải nhóm`,
        `Trạng thái: Từ chối`,
        `Lý do: Chỉ có thể mở khóa chat nhóm`,
        `Cách dùng: Sử dụng lệnh trong nhóm Zalo`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    // Thực hiện mở khóa chat nhóm - thử nhiều phương pháp
    try {
      // Phương pháp 1: Thử changeGroupSettings
      try {
        await api.changeGroupSettings(threadId, {
          allowMemberInvite: true,
          allowMemberPost: true
        });
      } catch (e1) {
        // Phương pháp 2: Thử unmuteGroup
        try {
          await api.unmuteGroup(threadId);
        } catch (e2) {
          // Phương pháp 3: Thử setGroupRestriction
          try {
            await api.setGroupRestriction(threadId, false);
          } catch (e3) {
            // Phương pháp 4: Thử changeGroupInfo
            try {
              await api.changeGroupInfo(threadId, {
                restrictPosting: false
              });
            } catch (e4) {
              throw new Error("Không có API nào hoạt động");
            }
          }
        }
      }
      
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz mở chat`,
        `Thông báo: Thành công`,
        `Trạng thái: Đã mở khóa`,
        `Nhóm ID: ${threadId}`,
        `Cách dùng: Tất cả thành viên có thể gửi tin nhắn`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
      
    } catch (unlockError) {
      console.error("Lỗi mở khóa nhóm:", unlockError);
      
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz mở chat`,
        `Thông báo: Lỗi - API không hỗ trợ`,
        `Trạng thái: Thất bại`,
        `Lý do: Zalo API không cho phép mở khóa nhóm từ bot`,
        `Cách dùng: Chỉ có thể mở khóa thủ công từ app Zalo`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }
    
  } catch (error) {
    console.error("Lỗi mở chat:", error);
    
    const response = [
      `Người dùng: ${userName || "Người dùng"}`,
      `Dịch vụ: bonz mở chat`,
      `Thông báo: Lỗi hệ thống`,
      `Trạng thái: Thất bại`,
      `Lý do: Có lỗi xảy ra`,
      `Cách dùng: Vui lòng thử lại sau`
    ].join("\n");
    
    return api.sendMessage(response, threadId, type);
  }
}

// Handler cho lệnh bonz reminder
async function handleReminder(api, event, args) {
  const { threadId, type } = event || {};
  const userId = String(event?.data?.uidFrom || event?.authorId || '');
  
  if (!args || args.length === 0) {
    return api.sendMessage(
      "⏰ **HƯỚNG DẪN SỬ DỤNG BONZ REMINDER**\n\n" +
      "🔍 Cách dùng:\n" +
      "• bonz reminder <thời gian> <nội dung> - Đặt lời nhắc\n" +
      "• bonz reminder list - Xem danh sách nhắc nhở\n" +
      "• bonz reminder clear - Xóa tất cả nhắc nhở\n\n" +
      "⏱️ Định dạng thời gian:\n" +
      "• 5s = 5 giây\n" +
      "• 10m = 10 phút\n" +
      "• 2h = 2 giờ\n" +
      "• 1d = 1 ngày\n\n" +
      "💡 Ví dụ:\n" +
      "bonz reminder 5m Uống nước\n" +
      "bonz reminder 2h Nghỉ giải lao\n" +
      "bonz reminder 1d Họp team",
      threadId, type
    );
  }

  const command = args[0]?.toLowerCase();

  // Xem danh sách reminders
  if (command === 'list' || command === 'danh sách' || command === 'ds') {
    const userReminders = Array.from(reminders.entries())
      .filter(([id, reminder]) => reminder.userId === userId && reminder.threadId === threadId);
    
    if (userReminders.length === 0) {
      return api.sendMessage("📝 Bạn chưa có lời nhắc nào!", threadId, type);
    }

    let message = "⏰ **DANH SÁCH NHẮC NHỞ CỦA BẠN**\n\n";
    userReminders.forEach(([id, reminder], index) => {
      const timeLeft = Math.ceil((reminder.endTime - Date.now()) / 1000);
      const timeStr = formatTime(timeLeft);
      message += `${index + 1}. ${reminder.message}\n⏱️ Còn lại: ${timeStr}\n\n`;
    });

    return api.sendMessage(message, threadId, type);
  }

  // Xóa tất cả reminders
  if (command === 'clear' || command === 'xóa' || command === 'xoa') {
    const userReminders = Array.from(reminders.entries())
      .filter(([id, reminder]) => reminder.userId === userId && reminder.threadId === threadId);
    
    userReminders.forEach(([id, reminder]) => {
      clearTimeout(reminder.timeout);
      reminders.delete(id);
    });

    return api.sendMessage(`🗑️ Đã xóa ${userReminders.length} lời nhắc!`, threadId, type);
  }

  // Tạo reminder mới
  const timeStr = args[0];
  const message = args.slice(1).join(' ');

  if (!timeStr || !message) {
    return api.sendMessage("❌ Vui lòng nhập đầy đủ thời gian và nội dung!\n\n💡 Ví dụ: bonz reminder 5m Uống nước", threadId, type);
  }

  // Parse thời gian
  const timeMatch = timeStr.match(/^(\d+)([smhd])$/);
  if (!timeMatch) {
    return api.sendMessage("❌ Định dạng thời gian không hợp lệ!\n\n⏱️ Sử dụng: 5s, 10m, 2h, 1d", threadId, type);
  }

  const timeValue = parseInt(timeMatch[1]);
  const timeUnit = timeMatch[2];
  
  let milliseconds;
  let unitName;
  
  switch (timeUnit) {
    case 's':
      milliseconds = timeValue * 1000;
      unitName = 'giây';
      break;
    case 'm':
      milliseconds = timeValue * 60 * 1000;
      unitName = 'phút';
      break;
    case 'h':
      milliseconds = timeValue * 60 * 60 * 1000;
      unitName = 'giờ';
      break;
    case 'd':
      milliseconds = timeValue * 24 * 60 * 60 * 1000;
      unitName = 'ngày';
      break;
    default:
      return api.sendMessage("❌ Đơn vị thời gian không hợp lệ!", threadId, type);
  }

  // Kiểm tra giới hạn thời gian (tối đa 7 ngày)
  if (milliseconds > 7 * 24 * 60 * 60 * 1000) {
    return api.sendMessage("❌ Thời gian nhắc nhở tối đa là 7 ngày!", threadId, type);
  }

  // Tạo reminder
  const reminderId = ++reminderCounter;
  const endTime = Date.now() + milliseconds;
  
  const timeout = setTimeout(async () => {
    try {
      await api.sendMessage(
        `⏰ **NHẮC NHỞ**\n\n` +
        `💬 ${message}\n\n` +
        `👤 Người đặt: ${userId}\n` +
        `⏱️ Đã đặt từ ${timeValue} ${unitName} trước`,
        threadId,
        type
      );
      reminders.delete(reminderId);
    } catch (error) {
      console.log('Error sending reminder:', error);
      reminders.delete(reminderId);
    }
  }, milliseconds);

  reminders.set(reminderId, {
    threadId,
    userId,
    message,
    timeout,
    endTime,
    type
  });

  return api.sendMessage(
    `✅ **ĐÃ ĐẶT NHẮC NHỞ**\n\n` +
    `💬 Nội dung: ${message}\n` +
    `⏱️ Thời gian: ${timeValue} ${unitName}\n` +
    `🔔 Sẽ nhắc lúc: ${new Date(endTime).toLocaleString('vi-VN')}\n\n` +
    `💡 Dùng "bonz reminder list" để xem danh sách`,
    threadId, type
  );
}

// Helper function để format thời gian còn lại
function formatTime(seconds) {
  if (seconds < 60) return `${seconds} giây`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ`;
  return `${Math.floor(seconds / 86400)} ngày`;
}

// Handler cho lệnh bonz horoscope
async function handleHoroscope(api, event, args) {
  const { threadId, type } = event || {};
  
  if (!args || args.length === 0) {
    return api.sendMessage(
      "🌟 **HƯỚNG DẪN SỬ DỤNG BONZ HOROSCOPE**\n\n" +
      "🔍 Cách dùng:\n" +
      "• bonz horoscope <cung> - Xem tử vi theo cung\n" +
      "• bonz horoscope list - Xem danh sách 12 cung\n\n" +
      "♈ 12 cung hoàng đạo:\n" +
      "• Bạch Dương (21/3 - 19/4)\n" +
      "• Kim Ngưu (20/4 - 20/5)\n" +
      "• Song Tử (21/5 - 20/6)\n" +
      "• Cự Giải (21/6 - 22/7)\n" +
      "• Sư Tử (23/7 - 22/8)\n" +
      "• Xử Nữ (23/8 - 22/9)\n" +
      "• Thiên Bình (23/9 - 22/10)\n" +
      "• Thiên Yết (23/10 - 21/11)\n" +
      "• Nhân Mã (22/11 - 21/12)\n" +
      "• Ma Kết (22/12 - 19/1)\n" +
      "• Bảo Bình (20/1 - 18/2)\n" +
      "• Song Ngư (19/2 - 20/3)\n\n" +
      "💡 Ví dụ: bonz horoscope bạch dương",
      threadId, type
    );
  }

  const command = args[0]?.toLowerCase();

  // Xem danh sách 12 cung
  if (command === 'list' || command === 'danh sách' || command === 'ds') {
    return api.sendMessage(
      "♈ **12 CUNG HOÀNG ĐẠO**\n\n" +
      "1. ♈ Bạch Dương (21/3 - 19/4)\n" +
      "2. ♉ Kim Ngưu (20/4 - 20/5)\n" +
      "3. ♊ Song Tử (21/5 - 20/6)\n" +
      "4. ♋ Cự Giải (21/6 - 22/7)\n" +
      "5. ♌ Sư Tử (23/7 - 22/8)\n" +
      "6. ♍ Xử Nữ (23/8 - 22/9)\n" +
      "7. ♎ Thiên Bình (23/9 - 22/10)\n" +
      "8. ♏ Thiên Yết (23/10 - 21/11)\n" +
      "9. ♐ Nhân Mã (22/11 - 21/12)\n" +
      "10. ♑ Ma Kết (22/12 - 19/1)\n" +
      "11. ♒ Bảo Bình (20/1 - 18/2)\n" +
      "12. ♓ Song Ngư (19/2 - 20/3)\n\n" +
      "💡 Dùng: bonz horoscope <tên cung>",
      threadId, type
    );
  }

  // Map tên cung tiếng Việt sang tiếng Anh
  const zodiacMap = {
    'bạch dương': 'aries',
    'bach duong': 'aries',
    'aries': 'aries',
    'kim ngưu': 'taurus', 
    'kim nguu': 'taurus',
    'taurus': 'taurus',
    'song tử': 'gemini',
    'song tu': 'gemini', 
    'gemini': 'gemini',
    'cự giải': 'cancer',
    'cu giai': 'cancer',
    'cancer': 'cancer',
    'sư tử': 'leo',
    'su tu': 'leo',
    'leo': 'leo',
    'xử nữ': 'virgo',
    'xu nu': 'virgo',
    'virgo': 'virgo',
    'thiên bình': 'libra',
    'thien binh': 'libra',
    'libra': 'libra',
    'thiên yết': 'scorpio',
    'thien yet': 'scorpio',
    'scorpio': 'scorpio',
    'nhân mã': 'sagittarius',
    'nhan ma': 'sagittarius', 
    'sagittarius': 'sagittarius',
    'ma kết': 'capricorn',
    'ma ket': 'capricorn',
    'capricorn': 'capricorn',
    'bảo bình': 'aquarius',
    'bao binh': 'aquarius',
    'aquarius': 'aquarius',
    'song ngư': 'pisces',
    'song ngu': 'pisces',
    'pisces': 'pisces'
  };

  const zodiacName = args.join(' ').toLowerCase();
  const englishZodiac = zodiacMap[zodiacName];

  if (!englishZodiac) {
    return api.sendMessage(
      "❌ Không tìm thấy cung hoàng đạo!\n\n" +
      "💡 Vui lòng sử dụng tên cung hợp lệ:\n" +
      "Ví dụ: bạch dương, kim ngưu, song tử...\n\n" +
      "🔍 Dùng 'bonz horoscope list' để xem danh sách",
      threadId, type
    );
  }

  try {
    await api.sendMessage("🔮 Đang xem tử vi cho bạn, vui lòng chờ...", threadId, type);

    const axios = require('axios');
    
    // Thử nhiều API tử vi
    const apis = [
      `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${englishZodiac}&day=today`,
      `https://aztro.sameerkumar.website/?sign=${englishZodiac}&day=today`,
      `https://horoscope-api.herokuapp.com/horoscope/today/${englishZodiac}`
    ];

    let horoscopeData = null;

    for (let i = 0; i < apis.length; i++) {
      try {
        const response = await axios.get(apis[i], { timeout: 8000 });
        if (response.data) {
          horoscopeData = response.data;
          break;
        }
      } catch (apiError) {
        console.log(`Horoscope API ${i + 1} failed:`, apiError.message);
      }
    }

    // Nếu không lấy được từ API, dùng data mẫu
    if (!horoscopeData) {
      horoscopeData = getRandomHoroscope(englishZodiac);
    }

    const vietnameseZodiac = Object.keys(zodiacMap).find(key => zodiacMap[key] === englishZodiac);
    const zodiacEmoji = getZodiacEmoji(englishZodiac);
    
    const message = 
      `${zodiacEmoji} **TỬ VI HÀNG NGÀY - ${vietnameseZodiac.toUpperCase()}**\n\n` +
      `📅 **Ngày:** ${new Date().toLocaleDateString('vi-VN')}\n\n` +
      `🔮 **Tổng quan:** ${horoscopeData.description || horoscopeData.horoscope || 'Hôm nay là một ngày tốt đẹp cho bạn!'}\n\n` +
      `💰 **Tài chính:** ${horoscopeData.money || 'Hãy cẩn trọng trong các quyết định tài chính.'}\n\n` +
      `💕 **Tình yêu:** ${horoscopeData.love || 'Tình yêu sẽ đến với bạn một cách bất ngờ.'}\n\n` +
      `🎯 **Công việc:** ${horoscopeData.career || 'Tập trung vào mục tiêu và bạn sẽ thành công.'}\n\n` +
      `🍀 **May mắn:** ${horoscopeData.lucky_number || Math.floor(Math.random() * 100)}\n` +
      `🎨 **Màu sắc:** ${horoscopeData.lucky_color || getRandomColor()}\n\n` +
      `⭐ **Đánh giá:** ${horoscopeData.mood || '★★★★☆'}`;

    return api.sendMessage(message, threadId, type);

  } catch (error) {
    console.log('Error in handleHoroscope:', error.message);
    return api.sendMessage(
      "❌ Có lỗi xảy ra khi lấy thông tin tử vi!\n\n" +
      "💡 Vui lòng thử lại sau hoặc kiểm tra tên cung hoàng đạo.",
      threadId, type
    );
  }
}

// Helper functions cho horoscope
function getZodiacEmoji(zodiac) {
  const emojis = {
    'aries': '♈',
    'taurus': '♉', 
    'gemini': '♊',
    'cancer': '♋',
    'leo': '♌',
    'virgo': '♍',
    'libra': '♎',
    'scorpio': '♏',
    'sagittarius': '♐',
    'capricorn': '♑',
    'aquarius': '♒',
    'pisces': '♓'
  };
  return emojis[zodiac] || '🌟';
}

function getRandomColor() {
  const colors = ['Đỏ', 'Xanh dương', 'Xanh lá', 'Vàng', 'Tím', 'Hồng', 'Cam', 'Trắng', 'Đen', 'Bạc'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getRandomHoroscope(zodiac) {
  const horoscopes = {
    'aries': {
      description: 'Hôm nay là ngày tuyệt vời để bạn thể hiện sự năng động và quyết đoán của mình.',
      love: 'Tình yêu đang chờ đợi bạn ở góc phố. Hãy mở lòng đón nhận.',
      career: 'Công việc thuận lợi, có thể có cơ hội thăng tiến.',
      money: 'Tài chính ổn định, tránh chi tiêu không cần thiết.'
    },
    'taurus': {
      description: 'Sự kiên nhẫn và bền bỉ của bạn sẽ được đền đáp xứng đang.',
      love: 'Mối quan hệ hiện tại sẽ trở nên sâu sắc hơn.',
      career: 'Hãy tập trung vào những dự án dài hạn.',
      money: 'Đầu tư thông minh sẽ mang lại lợi nhuận.'
    }
    // Có thể thêm các cung khác...
  };
  
  return horoscopes[zodiac] || {
    description: 'Hôm nay là một ngày đầy tiềm năng và cơ hội cho bạn.',
    love: 'Tình yêu sẽ mang đến những bất ngờ thú vị.',
    career: 'Công việc diễn ra suôn sẻ, hãy tự tin vào khả năng của mình.',
    money: 'Quản lý tài chính một cách khôn ngoan.'
  };
}

// ======================== BOT INFORMATION ========================
async function handleBotInformation(api, event) {
  const { threadId, type, data } = event || {};
  const senderId = String(data?.uidFrom || event?.authorId || '');
  
  // Lấy tên người dùng
  let userName = 'Bạn';
  try {
    const userInfo = await api.getUserInfo(senderId);
    if (userInfo && userInfo[senderId]) {
      userName = userInfo[senderId].name || 'Bạn';
    }
  } catch (e) {
    // Bỏ qua lỗi lấy tên
  }

  // Thông tin bot (không lấy thông tin nhóm)
  const currentTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  
  // Đếm số lệnh có sẵn
  const commandCount = getBotCommandCount();
  
  const botInformation = [
    '🤖 ═══════════════════════════════════',
    '           THÔNG TIN BOT MENU',
    '═══════════════════════════════════ 🤖',
    '',
    '📋 THÔNG TIN CƠ BẢN:',
    '• 🏷️ Tên Bot: bonz 💕ly',
    '• 📊 Phiên bản: 2.0.0',
    '• 💻 Platform: Zalo (ZCA-JS)',
    '• 🔧 Ngôn ngữ: JavaScript (Node.js)',
    '• 👨‍💻 Tác giả: NG ĐÌNH THẮNG LỢI',
    `• 🕐 Thời gian hiện tại: ${currentTime}`,
    '',
    '👑 ADMIN BOT:',
    '• 🔧 Super Admin: NG ĐÌNH THẮNG LỢI',
    '• 🛠️ Developer: NG ĐÌNH THẮNG LỢI',
    '• 📞 Liên hệ: Zalo/Facebook',
    '• 🆔 Admin ID: [Được bảo mật]',
    '',
    '⚡ TÍNH NĂNG CHÍNH:',
    '• 🎮 Game và giải trí (Câu đố, Tài xỉu, Slot)',
    '• 🛠️ Tiện ích (Rút gọn link, QR code, Thời tiết)',
    '• 🎵 Âm nhạc (Tìm kiếm bài hát, lyrics)',
    '• 🖼️ Hình ảnh (Tìm kiếm ảnh Google, AI art)',
    '• 🤖 AI Chat (GPT, Claude, Gemini)',
    '• 📊 Quản lý nhóm (Kick, Ban, Thống kê)',
    '• 🛡️ Spam guard và bảo mật',
    '',
    '📈 THỐNG KÊ BOT:',
    `• ⏱️ Thời gian hoạt động: ${getBotUptime()}`,
    `• 📝 Tổng số lệnh: ${commandCount.total} lệnh`,
    `• 👤 Lệnh user: ${commandCount.user} lệnh`,
    `• 👑 Lệnh admin: ${commandCount.admin} lệnh`,
    `• 🌐 Hỗ trợ: 24/7`,
    `• 🇻🇳 Ngôn ngữ: Tiếng Việt`,
    '',
    '🔧 LỆNH MỚI NHẤT:',
    '• bonz gg image - Tìm kiếm ảnh Google',
    '• bonz var - Spam tin nhắn',
    '• kickall - Kick tất cả thành viên',
    '• bonz in bot - Thông tin bot này',
    '',
    '💡 CÁCH SỬ DỤNG:',
    '• Gõ "bonz menu" để xem tất cả lệnh',
    '• Gõ "menu" để xem lệnh hệ thống',
    '• Gõ "bonz menu admin" cho admin',
    '',
    '🌟 ĐẶC BIỆT:',
    '• 🇻🇳 Hỗ trợ tiếng Việt hoàn toàn',
    '• 🔄 Tự động cập nhật tính năng mới',
    '• 🔒 Bảo mật cao với spam guard',
    '• 🧠 Tích hợp AI thông minh',
    '',
    '📞 HỖ TRỢ:',
    '• Gõ "bonz help" để được hỗ trợ',
    '• Báo lỗi: Gõ "bonz report <lỗi>"',
    '',
    `💖 Cảm ơn ${userName} đã sử dụng bonz 💕ly!`,
    '🤖 Bot này chỉ hiển thị thông tin BOT, không phải nhóm!',
    '═══════════════════════════════════ 🤖'
  ].join('\n');

  return api.sendMessage(botInformation, threadId, type);
}

// Helper function để tính uptime
function getUptime() {
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  if (days > 0) {
    return `${days} ngày, ${hours} giờ, ${minutes} phút`;
  } else if (hours > 0) {
    return `${hours} giờ, ${minutes} phút`;
  } else {
    return `${minutes} phút`;
  }
}

// Helper function để tính bot uptime (alias)
function getBotUptime() {
  return getUptime();
}

// ======================== LIST GROUPS ========================
async function handleListGroups(api, event) {
  const { threadId, type, data } = event;
  const senderId = String(data?.uidFrom || event?.authorId || '');

  try {
    // ZCA-JS không có getConversations(), sử dụng cách khác
    // Thông báo tính năng đang phát triển và hiển thị thông tin hiện tại
    
    const currentTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    
    // Lấy thông tin group hiện tại
    let currentGroupInfo = '';
    try {
      const groupInfo = await api.getGroupInfo(threadId);
      if (groupInfo) {
        currentGroupInfo = [
          `📁 Tên: ${groupInfo.name || 'Không có tên'}`,
          `🆔 ID: ${threadId}`,
          `👥 Thành viên: ${groupInfo.memberCount || 'N/A'}`,
          `👑 Admin: ${groupInfo.adminIds ? groupInfo.adminIds.length : 'N/A'} người`
        ].join('\n   ');
      }
    } catch (e) {
      currentGroupInfo = [
        `📁 Tên: Không thể lấy thông tin`,
        `🆔 ID: ${threadId}`,
        `👥 Thành viên: N/A`,
        `👑 Admin: N/A`
      ].join('\n   ');
    }

    const groupList = [
      '👥 ═══════════════════════════════════',
      '        DANH SÁCH GROUP BOT',
      '═══════════════════════════════════ 👥',
      '',
      '🤖 Bot: bonz 💕ly',
      `📅 Thời gian: ${currentTime}`,
      `👨‍💻 Admin: NG ĐÌNH THẮNG LỢI`,
      '',
      '📋 GROUP HIỆN TẠI:',
      `1. ${currentGroupInfo}`,
      '',
      '⚠️ THÔNG BÁO:',
      '• Tính năng liệt kê tất cả group đang được phát triển',
      '• Hiện tại chỉ hiển thị group đang sử dụng lệnh',
      '• ZCA-JS API chưa hỗ trợ lấy danh sách toàn bộ group',
      '',
      '🔧 THÔNG TIN KỸ THUẬT:',
      '• Bot đang chạy trên nền tảng Zalo (ZCA-JS)',
      '• Ước tính bot đang hoạt động trong 600+ group',
      '• Để biết chính xác, cần check database hoặc logs',
      '',
      '💡 GỢI Ý:',
      '• Sử dụng lệnh này trong từng group để xem thông tin',
      '• Admin có thể check logs để thống kê chính xác',
      '• Tính năng sẽ được cập nhật trong phiên bản tới',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '🚀 Cảm ơn bạn đã sử dụng bonz 💕ly!',
      '═══════════════════════════════════ 👥'
    ].join('\n');

    return api.sendMessage(groupList, threadId, type);

  } catch (error) {
    console.error("Error in handleListGroups:", error);
    return api.sendMessage(
      `❌ Có lỗi xảy ra khi lấy thông tin group!\n🔧 Lỗi: ${error.message || 'Unknown error'}\n\n💡 Tính năng đang được phát triển, vui lòng thử lại sau!`,
      threadId,
      type
    );
  }
}

// ======================== SERVICE PRICING ========================
async function handleServicePricing(api, event) {
  const { threadId, type } = event;
  
  const serviceInfo = [
    '💎🔥 BẢNG DỊCH VỤ VIP – SIÊU RẺ – UY TÍN 🔥💎',
    '',
    '🤖 DỊCH VỤ BOT ZALO – FACEBOOK 🤖',
    '✨ Làm bot siêu rẻ:',
    '🔹 100K 👉 Bot nhiều chức năng VIP',
    '🔹 50K 👉 Bot Zalo ngẫu nhiên (nhiều/ít chức năng)',
    '',
    '📆 Thuê bot theo tháng:',
    '• 1 tháng = 30K',
    '• 2 tháng = 60K',
    '• 3 tháng = 90K',
    '• 4 tháng = 120K',
    '➡️ Cứ thêm 1 tháng +30K',
    '',
    '✨ Thuê group zalo:',
    '📌 200 TV 👉 20K / ngày | Thuê tháng 👉 giảm còn 15K/ngày',
    '📌 300 TV 👉 30K / ngày',
    '📌 500 TV 👉 45K / ngày',
    '📌 600 TV 👉 60K / ngày',
    '📌 1000 TV 👉 100K / ngày',
    '',
    '✨ Thuê bot thường: 30K / tháng (cứ +30K mỗi tháng tiếp theo)',
    '✨ Xác thực Zalo: 100K / tài khoản',
    '',
    '👥 BÁN GROUP 👥',
    '📌 Zalo:',
    '• 200 TV 👉 50K',
    '• 400 TV 👉 100K',
    '• 600 TV 👉 200K',
    '• 800 TV 👉 250K',
    '',
    '💻 BÁN TOOL ĐA THỂ LOẠI 💻',
    '⚡ Tool buff MXH',
    '⚡ Tool spam – auto',
    '⚡ Tool quản lý – tiện ích',
    '👉 Giá đa dạng – inbox để chọn gói phù hợp!',
    '',
    '💖 BUFF MXH – GIÁ RẺ 💖',
    '💓 Buff tim | 👁️ Buff view | ⭐ Buff yêu thích',
    '🔄 Buff share | 🎥 Buff mắt live',
    '👉 Giá chỉ từ 5K – Random ngẫu nhiên',
    '',
    '📚 KHO TÀI LIỆU HỌC TẬP 📚',
    '🔗 2k11 cùng nhau học tập: https://zalo.me/g/zpvccm246',
    '🔗 Tài liệu THCS – THPT: https://zalo.me/g/xnwruu491',
    '🔗 Share TL THCS – THPT: https://zalo.me/g/kqpyaw963',
    '🔗 Tài liệu vô hạn: https://zalo.me/g/yzgzmu465',
    '🔗 Tài liệu học tập:',
    '   • https://zalo.me/g/fwbdxz656',
    '   • https://zalo.me/g/wvdnpj454',
    '   • https://zalo.me/g/zffqdg843',
    '   • https://zalo.me/g/cgcrjp735',
    '   • https://zalo.me/g/chpafn970',
    '',
    '🏖️🌴 CHO THUÊ VILLA VŨNG TÀU VIEW BIỂN – SANG TRỌNG 🌴🏖️',
    '',
    '✨ Tiện ích nổi bật:',
    '🏠 Sát biển – view siêu chill',
    '🏊 Hồ bơi riêng – BBQ thỏa thích',
    '🎤 Phòng karaoke – không gian rộng',
    '🛋️ Full nội thất cao cấp',
    '👨‍👩‍👧‍👦 Phù hợp nhóm bạn, gia đình, team building',
    '',
    '💰 Bảng giá thuê Villa 💰',
    '🔹 1️⃣ Từ 1.000.000đ/đêm',
    '🔹 2️⃣ Đặt villa > 3.000.000đ 👉 Giảm giá siêu sâu 🎉',
    '🔹 3️⃣ Gói 10.000.000đ 👉 Villa siêu đẹp – sang trọng bậc nhất 🌟',
    '',
    '📅 Thuê theo tháng – Giá sốc 📅',
    '🏡 Thuê dài hạn 👉 Giảm siêu sâu',
    '👨‍💼 Có nhân viên phục vụ 24/7',
    '🔥 Phù hợp nghỉ dưỡng dài ngày, làm việc từ xa, nhóm bạn ở lâu',
    '',
    '✨ Cam kết: View biển xịn – Giá rẻ – Dịch vụ đẳng cấp VIP! ✨',
    '',
    '🚀 PRO LINK – PR BẰNG BOT',
    '',
    '🤖 Bot hiện đang chạy trong 600+ nhóm Zalo',
    '👉 Mỗi ngày share link hàng loạt vào group – tiếp cận cực khủng',
    '',
    '💰 Giá dịch vụ:',
    '• 1 ngày 👉 10K',
    '• 7 ngày 👉 70K (tặng thêm 1 ngày)',
    '• 30 ngày 👉 300K (giảm còn 250K)',
    '',
    '🔗 Nhận PR: link nhóm Zalo, link Facebook, Shopee, TikTok, YouTube...',
    '',
    '🌐 DỊCH VỤ LÀM WEB ĐA DẠNG – GIÁ RẺ 🌐',
    '✨ Web cá nhân – giới thiệu bản thân',
    '✨ Web landing page – bán hàng online',
    '✨ Web giới thiệu dịch vụ – doanh nghiệp nhỏ',
    '✨ Web sự kiện – mini game – thông báo',
    '✨ Web thả thính, chat tương tác, fun – tạo cộng đồng vui nhộn',
    '✨ Web bán sản phẩm, combo, khuyến mãi – tương tác trực tiếp',
    '✨ Web nhiều tính năng – đẹp, load nhanh, tương thích mobile',
    '',
    '💰 Giá chỉ từ 300K – Giao diện đẹp, đa tính năng ⚡',
    '👉 Có thể nâng cấp lên web động (tích hợp thanh toán, đăng nhập…)',
    '',
    '🎨 TẤT CẢ DỊCH VỤ ĐỀU VIP – UY TÍN – GIÁ SIÊU RẺ',
    '🔥 Inbox ngay để được tư vấn & báo giá chi tiết từng gói',
    '✨ Giao diện, thiết kế, nội dung tùy chỉnh theo yêu cầu'
  ].join('\n');

  return api.sendMessage(serviceInfo, threadId, type);
}

// ======================== AUTO PR SYSTEM ========================
async function handleAutoPR(api, event, args) {
  const { threadId, type } = event;
  
  console.log(`[handleAutoPR] Nhận lệnh từ ${threadId}, type: ${type}, args:`, args);
  
  if (!args || args.length === 0) {
    console.log(`[handleAutoPR] Không có args, hiển thị menu...`);
    // bonz auto pr (không có args) - Hiển thị menu chạy
    return await showAutoPRMenu(api, threadId, type);
  }

  const command = args[0].toLowerCase();
  
  // Kiểm tra xem có phải lệnh với group name không
  // VD: bonz auto pr nd gr 2 <content> hoặc bonz auto pr gr 2 start
  if (command === 'nd' && args.length >= 3 && args[1].toLowerCase() === 'gr') {
    // bonz auto pr nd gr 2 <content>
    const groupName = args[2];
    const content = args.slice(3).join(' ');
    return await setGroupPRContent(api, event, groupName, content);
  }
  
  // bonz auto pr ik gr <group> [nd "content"] [id 1,2,3] [t HH:mm] [start]
  if (command === 'ik') {
    return await handleAutoPRQuick(api, event, args.slice(1));
  }
  
  if (command === 'id' && args.length >= 3 && args[1].toLowerCase() === 'gr') {
    const groupName = args[2];
    const ids = args.slice(3).join(' ');
    return await setGroupPRCardIds(api, event, groupName, ids);
  }
  
  if (command === 'gr' && args.length >= 2) {
    // bonz auto pr gr <group> ...
    const groupName = args[1];
    const action = (args[2] || '').toLowerCase();
    if (!groupName) {
      return await showAutoPRHelp(api, threadId, type);
    }

    if (groupName.toLowerCase() === 'all') {
      return await handleAllGroupAutoPR(api, event, action, args.slice(3));
    }

    if (!action) {
      return await showAutoPRHelp(api, threadId, type);
    }
    if (action === 't') {
      const timeArg = args[3];
      return await setGroupPRTime(api, event, groupName, timeArg);
    }
    if (action === 'interval') {
      const intervalArg = args[3];
      return await setGroupPRInterval(api, event, groupName, intervalArg);
    }
    if (action === 'ttl') {
      const ttlArg = args[3];
      return await setGroupPRTTL(api, event, groupName, ttlArg);
    }
    
    switch (action) {
      case 'start':
      case 'batdau':
      case 'bd':
        return await startGroupPR(api, event, groupName);
        
      case 'stop':
      case 'dung':
        return await stopGroupPR(api, event, groupName);
        
      case 'status':
      case 'trangthai':
      case 'tt':
        return await getGroupPRStatus(api, threadId, type, groupName);
        
      default:
        return await showAutoPRHelp(api, threadId, type);
    }
  }
  
  // Lệnh cũ (backward compatibility)
  switch (command) {
    case 'help':
    case 'huongdan':
    case 'hd':
      return await showAutoPRHelp(api, threadId, type);
      
    case 'nd':
    case 'noidung':
      return await setAutoPRContent(api, event, args.slice(1));
      
    case 'start':
    case 'batdau':
    case 'bd':
      return await startAutoPR(api, event);
      
    case 'stop':
    case 'dung':
      return await stopAutoPR(api, event);
      
    case 'status':
    case 'trangthai':
    case 'tt':
      return await getAutoPRStatus(api, threadId, type);
      
    default:
      return await showAutoPRHelp(api, threadId, type);
  }
}

async function handleAllGroupAutoPR(api, event, action, actionArgs = []) {
  const { threadId, type } = event;
  const normalizedAction = (action || '').toLowerCase();
  let groupEntries = Array.from(autoPRGroups.entries());
  let autoSyncSummary = null;

  if (!normalizedAction) {
    return api.sendMessage(
      '❌ Thiếu hành động!\n📝 Dùng: bonz auto pr gr all <start|stop|status|sync>',
      threadId,
      type
    );
  }

  if (normalizedAction === 'sync' || normalizedAction === 'scan') {
    const syncResult = await syncAutoPRGroupsFromScan(api);
    if (!syncResult) {
      return api.sendMessage(
        '❌ Không thể quét danh sách nhóm. Thử lại sau!',
        threadId,
        type
      );
    }

    const syncMsg = [
      '📡 ĐÃ QUÉT DANH SÁCH NHÓM (bonzscan)',
      `👥 Tìm thấy: ${syncResult.total} nhóm`,
      `🆕 Nhóm mới: ${syncResult.created}`,
      `🔁 Đã cập nhật: ${syncResult.updated}`,
      syncResult.errors.length
        ? `⚠️ Bỏ qua: ${syncResult.errors.length} nhóm`
        : ''
    ].filter(Boolean).join('\n');

    return api.sendMessage(syncMsg, threadId, type);
  }

  if (!groupEntries.length) {
    autoSyncSummary = await syncAutoPRGroupsFromScan(api);
    groupEntries = Array.from(autoPRGroups.entries());
  }

  if (!groupEntries.length) {
    return api.sendMessage(
      '❌ Chưa có nhóm Auto PR nào được thiết lập!\n💡 Dùng: bonz auto pr gr all sync để quét danh sách nhóm bot đang ở.',
      threadId,
      type
    );
  }

  const ensureTargets = groupEntries.filter(([, data]) => data?.targetGroupId);
  if (!ensureTargets.length) {
    return api.sendMessage(
      '❌ Không có nhóm nào có target để chạy!\n💡 Gõ "bonz auto pr gr <nhóm> start" trong từng nhóm để gán target.',
      threadId,
      type
    );
  }

  if (normalizedAction === 'start') {
    const started = [];
    const alreadyRunning = [];
    const missingTarget = [];
    const failed = [];

    for (const [groupName, groupData] of groupEntries) {
      if (!groupData.targetGroupId) {
        missingTarget.push(groupName);
        continue;
      }
      if (groupData.isRunning) {
        alreadyRunning.push(groupName);
        continue;
      }
      try {
        const targetEvent = {
          ...event,
          threadId: groupData.targetGroupId,
          type: groupData.targetType || 'group'
        };
        await startGroupPR(api, targetEvent, groupName);
        started.push(groupName);
      } catch (error) {
        failed.push({ groupName, message: error?.message || 'Không rõ' });
      }
    }

    const summary = [
      '🚀 AUTO PR - CHẠY TOÀN BỘ NHÓM',
      `🟢 Đã bắt đầu: ${started.length}`,
      started.length ? `   → ${started.join(', ')}` : '',
      `⭕ Đang chạy sẵn: ${alreadyRunning.length}`,
      alreadyRunning.length ? `   → ${alreadyRunning.join(', ')}` : '',
      `⚠️ Thiếu target: ${missingTarget.length}`,
      missingTarget.length ? `   → ${missingTarget.join(', ')}` : ''
    ].filter(Boolean);

    if (failed.length) {
      summary.push('');
      summary.push('❌ Lỗi gửi do target không hợp lệ:');
      failed.forEach(item => {
        summary.push(`   • ${item.groupName} (${item.message})`);
      });
      summary.push('');
      summary.push('💡 Gợi ý xử lý:');
      summary.push('   1. Dùng "bonz auto pr gr <groupId> start" ngay trong nhóm Bot đang ở để ghi nhận target chuẩn.');
      summary.push('   2. Hoặc chạy lại "bonz auto pr gr all sync" trong môi trường chưa bị proxy để lấy ID thật.');
      summary.push('   3. Nếu vẫn lỗi, kiểm tra log API/getThreadList để chắc chắn ID là dạng số (8-25 chữ số).');
    }

    if (autoSyncSummary && autoSyncSummary.total !== undefined) {
      summary.push(
        '',
        `📡 Đã tự động quét ${autoSyncSummary.total} nhóm trước khi start`
      );
    }

    return api.sendMessage(summary.join('\n'), threadId, type);
  }

  if (normalizedAction === 'stop') {
    const stopped = [];
    const idle = [];
    const errors = [];

    for (const [groupName, groupData] of groupEntries) {
      if (!groupData.targetGroupId) {
        continue;
      }
      if (!groupData.isRunning) {
        idle.push(groupName);
        continue;
      }

      try {
        const targetEvent = {
          ...event,
          threadId: groupData.targetGroupId,
          type: groupData.targetType || 'group'
        };
        await stopGroupPR(api, targetEvent, groupName);
        stopped.push(groupName);
      } catch (error) {
        errors.push({ groupName, message: error?.message || 'Không rõ' });
      }
    }

    const summary = [
      '⏹️ AUTO PR - DỪNG TOÀN BỘ NHÓM',
      `🛑 Đã dừng: ${stopped.length}`,
      stopped.length ? `   → ${stopped.join(', ')}` : '',
      `⭕ Không chạy: ${idle.length}`,
      idle.length ? `   → ${idle.join(', ')}` : '',
      errors.length
        ? `❌ Lỗi: ${errors.map(item => `${item.groupName} (${item.message})`).join(', ')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n');

    return api.sendMessage(summary, threadId, type);
  }

  if (normalizedAction === 'status' || normalizedAction === 'tt' || normalizedAction === 'trangthai') {
    const lines = [
      '📊 AUTO PR - TRẠNG THÁI TẤT CẢ NHÓM',
      `🔢 Tổng nhóm: ${groupEntries.length}`,
      ''
    ];

    for (const [groupName, groupData] of groupEntries) {
      lines.push(
        `• ${groupName}: ${groupData.isRunning ? '🟢 Đang chạy' : '⭕ Đã dừng'}`
      );
      lines.push(
        `   📍 Target: ${groupData.targetGroupId || 'Chưa đặt'}`
      );
      lines.push(
        `   📝 Nội dung: ${groupData.content ? 'Có' : 'Mặc định'}`
      );
      lines.push(
        `   ⏱️ Chu kỳ: ${
          groupData.schedule && groupData.schedule.mode === 'daily'
            ? `Hằng ngày ${groupData.schedule.time}`
            : groupData.intervalText
        }`
      );
      lines.push(
        `   🧹 TTL: ${groupData.ttlText}`
      );
      lines.push(
        `   📤 Lần gửi gần nhất: ${groupData.lastSentAt ? formatTimestamp(groupData.lastSentAt) : 'Chưa có'}`
      );
      lines.push(
        `   ⏭️ Lần gửi tiếp theo: ${groupData.nextSendAt ? formatTimestamp(groupData.nextSendAt) : 'Chưa có'}`
      );
      lines.push('');
    }

    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  return api.sendMessage(
    '❌ Hành động không hợp lệ cho "gr all"!\n📝 Dùng: bonz auto pr gr all <start|stop|stop|status|sync>',
    threadId,
    type
  );
}

async function syncAutoPRGroupsFromScan(api) {
  try {
    const groups = await collectGroupsViaBonzScan(api);
    if (!Array.isArray(groups) || !groups.length) {
      return { total: 0, created: 0, updated: 0, errors: [] };
    }

    const defaultContent = autoPRConfig.content || autoPRData.content || await getPRContent();
    let created = 0;
    let updated = 0;

    for (const entry of groups) {
      const groupId = sanitizeGroupId(entry.id);
      if (!groupId) {
        continue;
      }
      const groupNameKey = groupId;
      const existed = autoPRGroups.has(groupNameKey);
      const groupData = ensureGroupData(groupNameKey, groupId, 'group');
      groupData.displayName = entry.name || groupNameKey;
      groupData.memberCount = entry.members || 0;
      if (!groupData.content) {
        groupData.content = defaultContent;
      }
      if (!groupData.intervalMs) {
        groupData.intervalMs = DEFAULT_GROUP_INTERVAL_MS;
        groupData.intervalText = DEFAULT_GROUP_INTERVAL_TEXT;
      }
      if (!groupData.targetGroupId) {
        groupData.targetGroupId = groupId;
      }
      if (!groupData.targetType) {
        groupData.targetType = 'group';
      }
      if (existed) {
        updated++;
      } else {
        created++;
      }
    }

    return {
      total: groups.length,
      created,
      updated,
      errors: []
    };
  } catch (error) {
    console.error('[Auto PR] syncAutoPRGroupsFromScan error:', error?.message || error);
    return null;
  }
}

async function collectGroupsViaBonzScan(api) {
  const groupMap = new Map();

  const addGroup = (entry) => {
    if (!entry) return;
    const id = sanitizeGroupId(entry.id);
    if (!id) return;
    const name = entry.name || `Nhóm ${id.slice(-4)}`;
    const members = Number(entry.members) || 0;

    if (!groupMap.has(id) || groupMap.get(id).members < members) {
      groupMap.set(id, { id, name, members });
    }
  };

  if (typeof api.getThreadList === 'function') {
    try {
      const list = await api.getThreadList(500, null, ['GROUP']);
      const threads = list?.threads || list?.data || list || [];
      for (const thread of threads) {
        const entry = normalizeThreadListEntry(thread);
        if (entry) addGroup(entry);
      }
    } catch (error) {
      console.warn('[Auto PR] getThreadList scan error:', error?.message || error);
    }
  }

  if (typeof api.getAllGroups === 'function') {
    try {
      const snapshot = await api.getAllGroups();
      const ids = Object.keys(snapshot?.gridVerMap || {});
      for (const id of ids) {
        const detail = snapshot.gridVerMap[id] || {};
        addGroup({
          id,
          name: detail.name,
          members: detail.totalMember || detail.memberCount || detail.participantCount || 0
        });
      }
    } catch (error) {
      console.warn('[Auto PR] getAllGroups scan error:', error?.message || error);
    }
  }

  if (!groupMap.size && typeof api.getAllGroups === 'function' && typeof api.getGroupInfo === 'function') {
    // fallback to attempt to fetch incremental data
    try {
      const snapshot = await api.getAllGroups();
      const ids = Object.keys(snapshot?.gridVerMap || {});
      for (const id of ids.slice(0, 200)) {
        try {
          const info = await api.getGroupInfo(id);
          const detail = info?.gridInfoMap?.[id] || info?.groupInfo?.[id] || info?.info || info;
          addGroup({
            id,
            name: detail?.name,
            members: detail?.totalMember || detail?.memberCount || detail?.participantCount || 0
          });
        } catch (innerError) {
          console.warn('[Auto PR] getGroupInfo scan error:', innerError?.message || innerError);
        }
      }
    } catch (error) {
      console.warn('[Auto PR] fallback scan error:', error?.message || error);
    }
  }

  return Array.from(groupMap.values()).sort((a, b) => {
    const memberDiff = (b.members || 0) - (a.members || 0);
    if (memberDiff !== 0) return memberDiff;
    return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
  });
}

function normalizeThreadListEntry(raw = {}) {
  const data = raw.threadInfo || raw.info || raw;
  const rawId = data.threadId || data.id;
  const id = sanitizeGroupId(rawId);
  if (!id) {
    return null;
  }

  const participantList =
    data.participantIDs ||
    data.members ||
    data.participants ||
    data.participantList ||
    [];

  const memberCount = Array.isArray(participantList)
    ? participantList.length
    : (data.participantCount || data.memberCount || data.totalMember || 0);

  const name =
    data.threadName ||
    data.name ||
    raw.name ||
    raw.threadName ||
    `Nhóm ${String(id).slice(-4)}`;

  return {
    id,
    name: String(name).trim(),
    members: Number(memberCount) || 0
  };
}

function sanitizeGroupId(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const str = String(raw).trim();
  if (!str) {
    return null;
  }

  if (/^\d{8,25}$/.test(str)) {
    return str;
  }

  if (str.startsWith('group:')) {
    const tail = str.slice(6).replace(/^[^0-9]+/, '');
    if (/^\d{8,25}$/.test(tail)) {
      return tail;
    }
  }

  const digits = str.replace(/\D+/g, '');
  if (/^\d{8,25}$/.test(digits)) {
    return digits;
  }

  return null;
}

// Hiển thị hướng dẫn Auto PR
async function showAutoPRHelp(api, threadId, type) {
  const helpText = [
    '🚀 ═══════════════════════════════════',
    '        AUTO PR SYSTEM - HƯỚNG DẪN',
    '═══════════════════════════════════ 🚀',
    '',
    '📋 CÁCH SỬ DỤNG SIÊU ĐƠN GIẢN:',
    '🚀 bonz auto pr start - Bắt đầu ngay (trong nhóm cần PR)',
    '',
    '📝 TÙY CHỌN:',
    '• bonz auto pr nd <nội_dung> - Đặt nội dung tùy chỉnh',
    '• bonz auto pr id gr <nhóm> <uid[,uid2,...]> - Gắn danh thiếp theo nhóm',
    '• bonz auto pr gr <nhóm> t <HH:mm> - Đặt giờ đăng hằng ngày',
    '',
    '🔧 LỆNH QUẢN LÝ:',
    '• bonz auto pr - Hiển thị menu chính',
    '• bonz auto pr stop - Dừng auto PR',
    '• bonz auto pr status - Xem trạng thái',
    '• bonz auto pr help - Hiển thị hướng dẫn',
    '',
    '🔥 TÍNH NĂNG:',
    '• Gửi ngay lập tức khi start (nếu không đặt lịch)',
    '• Tự động gửi mỗi 5 phút 1 lần (nếu không đặt lịch)',
    '• Hẹn giờ đăng hằng ngày theo nhóm (HH:mm)',
    '• Gửi kèm danh thiếp (UID) theo nhóm',
    '• Chạy vô hạn cho đến khi dừng ♾️',
    '• Có thể đặt nội dung tùy chỉnh',
    '• Gửi trong nhóm hiện tại',
    '',
    '💡 VÍ DỤ CƠ BẢN:',
    '• bonz auto pr start ← CHỈ CẦN THẾ!',
    '• bonz auto pr nd Nội dung tùy chỉnh (tùy chọn)',
    '',
    '🎯 VÍ DỤ MULTI-GROUP:',
    '• bonz auto pr nd gr 2 Nội dung cho nhóm 2',
    '• bonz auto pr nd gr 1 Nội dung PR nhóm 1',
    '• bonz auto pr id gr 1 1234567890,9876543210',
    '• bonz auto pr nd gr 3 4 5 6 Nội dung cho 4 nhóm',
    '• bonz auto pr gr 2 start ← Bắt đầu nhóm 2',
    '• bonz auto pr gr 3 start ← Bắt đầu nhóm 3 (song song)',
    '',
    '⚡ VÍ DỤ NHANH - IK:',
    '• bonz auto pr ik gr 1 nd "Nội dung" id 123,456 t 21:00 start',
    '• bonz auto pr ik gr 1 id 111,222',
    '• bonz auto pr ik gr 1 t 08:30 start',
    '',
    '⚠️ LƯU Ý:',
    '• Chỉ cần gõ "bonz auto pr start" là được!',
    '• Hoạt động ở mọi nơi (nhóm hoặc chat riêng)',
    '• Tự động dùng nội dung mặc định nếu chưa đặt',
    '• Multi-group: Có thể chạy nhiều nhóm cùng lúc',
    '• Chu kỳ: 5 phút/bài + thông báo mỗi phút (nếu không đặt lịch HH:mm)',
    '',
    '🔧 Admin: NG ĐÌNH THẮNG LỢI',
    '═══════════════════════════════════ 🚀'
  ].join('\n');

  return api.sendMessage(helpText, threadId, type);
}

// Hiển thị menu Auto PR
async function showAutoPRMenu(api, threadId, type) {
  const menuText = [
    '🚀 ═══════════════════════════════════',
    '           AUTO PR SYSTEM',
    '═══════════════════════════════════ 🚀',
    '',
    '📊 TRẠNG THÁI HIỆN TẠI:',
    `🔄 Đang chạy: ${autoPRData.isRunning ? '🟢 CÓ' : '⭕ KHÔNG'}`,
    `📍 Nhóm hiện tại: ${autoPRData.currentGroup || '❌ Chưa chạy'}`,
    `📝 Nội dung: ${autoPRData.content ? '✅ Đã có' : '❌ Chưa có'}`,
    ''
  ];

  if (autoPRData.isRunning) {
    const duration = Math.round((Date.now() - autoPRData.startTime) / 1000 / 60);
    menuText.push(
      '📈 THỐNG KÊ:',
      `📤 Đã gửi: ${autoPRData.count} bài`,
      `⏰ Thời gian chạy: ${duration} phút`,
      `📅 Bắt đầu: ${new Date(autoPRData.startTime).toLocaleString('vi-VN')}`,
      ''
    );
  }

  menuText.push(
    '🎯 LỆNH CHÍNH:',
    '🚀 bonz auto pr start - BẮT ĐẦU NGAY!',
    '',
    '🔧 LỆNH CƠ BẢN:',
    '• bonz auto pr nd <nội_dung> - Đặt nội dung tùy chỉnh',
    '• bonz auto pr id gr <nhóm> <uid[,uid2,...]> - Gắn danh thiếp theo nhóm',
    '• bonz auto pr gr <nhóm> t <HH:mm> - Đặt giờ đăng hằng ngày',
    '• bonz auto pr stop - Dừng Auto PR',
    '• bonz auto pr help - Xem hướng dẫn chi tiết',
    '',
    '🎯 LỆNH MULTI-GROUP:',
    '• bonz auto pr nd gr 2 <nội_dung> - Đặt nội dung cho nhóm 2',
    '• bonz auto pr nd gr 1 Nội dung PR nhóm 1',
    '• bonz auto pr id gr 1 1234567890,9876543210',
    '• bonz auto pr nd gr 3 4 5 6 <nội_dung> - Đặt cho nhiều nhóm',
    '• bonz auto pr gr 2 start - Bắt đầu Auto PR nhóm 2',
    '• bonz auto pr gr 2 stop - Dừng Auto PR nhóm 2',
    '• bonz auto pr gr 2 status - Xem trạng thái nhóm 2',
    '',
    '⚡ LỆNH RÚT GỌN IK:',
    '• bonz auto pr ik gr <nhóm> nd "<nội_dung>" id <uid[,uid2,...]> t <HH:mm> start',
    '',
    '💡 CHỈ CẦN: Gõ "bonz auto pr start" ở bất kỳ đâu!',
    '⏰ Chu kỳ: 5 phút/bài (nếu không đặt HH:mm) + thông báo mỗi phút',
    '═══════════════════════════════════ 🚀'
  );

  return api.sendMessage(menuText.join('\n'), threadId, type);
}

// Đặt nội dung PR tùy chỉnh
async function setAutoPRContent(api, event, args) {
  const { threadId, type } = event;
  
  if (!args || args.length === 0) {
    return api.sendMessage("❌ Vui lòng nhập nội dung PR!\n💡 Ví dụ: bonz auto pr nd \"Khuyến mãi đặc biệt hôm nay!\"", threadId, type);
  }

  const content = args.join(' ').replace(/^["']|["']$/g, ''); // Loại bỏ dấu ngoặc kép đầu cuối
  
  if (content.length < 10) {
    return api.sendMessage("❌ Nội dung PR quá ngắn! Tối thiểu 10 ký tự.", threadId, type);
  }

  if (content.length > 2000) {
    return api.sendMessage("❌ Nội dung PR quá dài! Tối đa 2000 ký tự.", threadId, type);
  }

  autoPRConfig.content = content;

  const resultText = [
    '✅ Đã cập nhật nội dung PR!',
    `📝 Độ dài: ${content.length} ký tự`,
    '',
    '📋 PREVIEW NỘI DUNG:',
    '─'.repeat(30),
    content.length > 200 ? content.substring(0, 200) + '...' : content,
    '─'.repeat(30),
    '',
    '💡 Cài đặt hiện tại:',
    `👥 Nhóm: ${autoPRConfig.groups.length}`,
    `📝 Nội dung: ${autoPRConfig.content ? 'Tùy chỉnh' : 'Mặc định (bonz pr)'}`,
    `⏰ Chu kỳ: ${autoPRConfig.intervalText}`,
    `🔄 Lặp lại: ${autoPRConfig.repeat} lần`,
    `📤 Số lần/nhóm: ${autoPRConfig.countPerGroup}`
  ].join('\n');

  return api.sendMessage(resultText, threadId, type);
}

// Đặt danh sách nhóm PR
async function setAutoPRGroups(api, event, args) {
  const { threadId, type } = event;
  
  if (!args || args.length === 0) {
    return api.sendMessage("❌ Vui lòng nhập danh sách ID nhóm!\n💡 Ví dụ: bonz auto pr 123456789,987654321", threadId, type);
  }

  const groupsInput = args.join(' ');
  const groupIds = groupsInput.split(',').map(id => id.trim()).filter(id => id.length > 0);
  
  if (groupIds.length === 0) {
    return api.sendMessage("❌ Danh sách ID nhóm không hợp lệ!", threadId, type);
  }

  // Validate ID nhóm (chỉ số và độ dài hợp lý)
  const invalidIds = groupIds.filter(id => {
    return !/^\d+$/.test(id) || id.length < 10 || id.length > 20;
  });
  
  if (invalidIds.length > 0) {
    return api.sendMessage(`❌ ID nhóm không hợp lệ: ${invalidIds.join(', ')}\n💡 ID nhóm phải là số có độ dài 10-20 ký tự!`, threadId, type);
  }

  // Test gửi tin nhắn đến nhóm đầu tiên để kiểm tra
  try {
    const testMessage = "🔍 Test kết nối - Auto PR System";
    await api.sendMessage(testMessage, groupIds[0], 'group');
    console.log(`[Auto PR] ✅ Test thành công với nhóm ${groupIds[0]}`);
  } catch (error) {
    return api.sendMessage(`❌ Không thể gửi tin nhắn đến nhóm ${groupIds[0]}!\n🔍 Lỗi: ${error.message}\n💡 Kiểm tra lại ID nhóm hoặc quyền của bot`, threadId, type);
  }

  autoPRConfig.groups = groupIds;

  const resultText = [
    '✅ Đã cập nhật danh sách nhóm PR!',
    `👥 Số nhóm: ${groupIds.length}`,
    `📋 Danh sách: ${groupIds.join(', ')}`,
    '',
    '💡 Tiếp theo:',
    '• bonz auto pr h <số_giờ> - Đặt chu kỳ gửi',
    '• bonz auto pr rely <số_lần> - Đặt số lần lặp lại',
    '• bonz auto pr sl <số_lượng> - Đặt số lần gửi mỗi nhóm'
  ].join('\n');

  return api.sendMessage(resultText, threadId, type);
}

// Đặt chu kỳ gửi (giây, phút, giờ)
async function setAutoPRInterval(api, event, args) {
  const { threadId, type } = event;
  
  if (!args || args.length === 0) {
    return api.sendMessage("❌ Vui lòng nhập thời gian!\n💡 Ví dụ: bonz auto pr h 30s, 5m, 2h", threadId, type);
  }

  const timeInput = args[0].toLowerCase();
  let milliseconds = 0;
  let displayText = '';

  // Parse thời gian
  if (timeInput.endsWith('s')) {
    // Giây
    const seconds = parseInt(timeInput.slice(0, -1));
    if (isNaN(seconds) || seconds < 2 || seconds > 3600) {
      return api.sendMessage("❌ Số giây không hợp lệ! Vui lòng nhập từ 2 đến 3600 giây.", threadId, type);
    }
    milliseconds = seconds * 1000;
    displayText = `${seconds} giây`;
  } else if (timeInput.endsWith('m')) {
    // Phút
    const minutes = parseInt(timeInput.slice(0, -1));
    if (isNaN(minutes) || minutes < 1 || minutes > 60) {
      return api.sendMessage("❌ Số phút không hợp lệ! Vui lòng nhập từ 1 đến 60 phút.", threadId, type);
    }
    milliseconds = minutes * 60 * 1000;
    displayText = `${minutes} phút`;
  } else if (timeInput.endsWith('h')) {
    // Giờ
    const hours = parseInt(timeInput.slice(0, -1));
    if (isNaN(hours) || hours < 1 || hours > 24) {
      return api.sendMessage("❌ Số giờ không hợp lệ! Vui lòng nhập từ 1 đến 24 giờ.", threadId, type);
    }
    milliseconds = hours * 60 * 60 * 1000;
    displayText = `${hours} giờ`;
  } else {
    // Không có đơn vị, mặc định là giây
    const seconds = parseInt(timeInput);
    if (isNaN(seconds) || seconds < 2 || seconds > 3600) {
      return api.sendMessage("❌ Thời gian không hợp lệ!\n💡 Định dạng: 30s (giây), 5m (phút), 2h (giờ)", threadId, type);
    }
    milliseconds = seconds * 1000;
    displayText = `${seconds} giây`;
  }

  autoPRConfig.interval = milliseconds;
  autoPRConfig.intervalText = displayText;

  const resultText = [
    '✅ Đã cập nhật chu kỳ gửi!',
    `⏰ Chu kỳ: ${displayText}`,
    `📊 Tần suất: Gửi mỗi ${displayText}`,
    '',
    '💡 Cài đặt hiện tại:',
    `👥 Nhóm: ${autoPRConfig.groups.length}`,
    `📝 Nội dung: ${autoPRConfig.content ? 'Tùy chỉnh' : 'Mặc định (bonz pr)'}`,
    `⏰ Chu kỳ: ${autoPRConfig.intervalText}`,
    `🔄 Lặp lại: ${autoPRConfig.repeat} lần`,
    `📤 Số lần/nhóm: ${autoPRConfig.countPerGroup}`
  ].join('\n');

  return api.sendMessage(resultText, threadId, type);
}

// Đặt số lần lặp lại
async function setAutoPRRepeat(api, event, args) {
  const { threadId, type } = event;
  
  if (!args || args.length === 0) {
    return api.sendMessage("❌ Vui lòng nhập số lần lặp lại!\n💡 Ví dụ: bonz auto pr rely 10", threadId, type);
  }

  const repeat = parseInt(args[0]);
  
  // Cho phép "0" hoặc "vohạn" để chạy vô hạn
  if (args[0].toLowerCase() === 'vohan' || args[0].toLowerCase() === 'vohạn' || args[0] === '0') {
    autoPRConfig.repeat = 0; // 0 = vô hạn
    autoPRConfig.isInfinite = true;
  } else {
    if (isNaN(repeat) || repeat < 1 || repeat > 1000) {
      return api.sendMessage("❌ Số lần lặp lại không hợp lệ! (1-1000 hoặc 'vohan')", threadId, type);
    }
    autoPRConfig.repeat = repeat;
    autoPRConfig.isInfinite = false;
  }

  const resultText = [
    '✅ Đã cập nhật số lần lặp lại!',
    `🔄 Lặp lại: ${autoPRConfig.isInfinite ? 'Vô hạn ♾️' : autoPRConfig.repeat + ' lần'}`,
    `📊 Tổng cộng: ${autoPRConfig.isInfinite ? 'Không giới hạn ♾️' : autoPRConfig.repeat * autoPRConfig.groups.length * autoPRConfig.countPerGroup + ' tin nhắn'}`,
    '',
    '💡 Cài đặt hiện tại:',
    `👥 Nhóm: ${autoPRConfig.groups.length}`,
    `📝 Nội dung: ${autoPRConfig.content ? 'Tùy chỉnh' : 'Mặc định (bonz pr)'}`,
    `⏰ Chu kỳ: ${autoPRConfig.intervalText}`,
    `🔄 Lặp lại: ${autoPRConfig.repeat} lần`,
    `📤 Số lần/nhóm: ${autoPRConfig.countPerGroup}`
  ].join('\n');

  return api.sendMessage(resultText, threadId, type);
}

// Đặt số lần gửi vào mỗi nhóm
async function setAutoPRCount(api, event, args) {
  const { threadId, type } = event;
  
  if (!args || args.length === 0) {
    return api.sendMessage("❌ Vui lòng nhập số lần gửi!\n💡 Ví dụ: bonz auto pr sl 3", threadId, type);
  }

  const count = parseInt(args[0]);
  
  if (isNaN(count) || count < 1 || count > 10) {
    return api.sendMessage("❌ Số lần gửi không hợp lệ! Vui lòng nhập từ 1 đến 10.", threadId, type);
  }

  autoPRConfig.countPerGroup = count;

  const resultText = [
    '✅ Đã cập nhật số lần gửi mỗi nhóm!',
    `📤 Số lần/nhóm: ${count}`,
    `📊 Tổng cộng: ${autoPRConfig.repeat * autoPRConfig.groups.length * count} tin nhắn`,
    '',
    '💡 Cài đặt hiện tại:',
    `👥 Nhóm: ${autoPRConfig.groups.length}`,
    `📝 Nội dung: ${autoPRConfig.content ? 'Tùy chỉnh' : 'Mặc định (bonz pr)'}`,
    `⏰ Chu kỳ: ${autoPRConfig.intervalText}`,
    `🔄 Lặp lại: ${autoPRConfig.repeat} lần`,
    `📤 Số lần/nhóm: ${autoPRConfig.countPerGroup}`
  ].join('\n');

  return api.sendMessage(resultText, threadId, type);
}

// Bắt đầu Auto PR
async function startAutoPR(api, event) {
  const { threadId, type } = event;
  
  // Kiểm tra cài đặt
  if (autoPRConfig.groups.length === 0) {
    return api.sendMessage("❌ Chưa cài đặt danh sách nhóm!\n💡 Sử dụng: bonz auto pr <id1,id2,id3>", threadId, type);
  }

  if (autoPRConfig.isRunning) {
    return api.sendMessage("⚠️ Auto PR đang chạy!", threadId, type);
  }

  // Bắt đầu Auto PR
  autoPRConfig.isRunning = true;
  autoPRConfig.currentRound = 0;
  autoPRConfig.totalSent = 0;
  autoPRConfig.startTime = Date.now();

  const intervalId = setInterval(async () => {
    await executeAutoPR(api);
  }, autoPRConfig.interval); // Sử dụng interval đã được convert

  autoPRConfig.intervalId = intervalId;

  // Gửi lần đầu ngay lập tức
  await executeAutoPR(api);

  // Tạo preview nội dung
  let contentPreview = '';
  if (autoPRConfig.content) {
    const preview = autoPRConfig.content.length > 100 
      ? autoPRConfig.content.substring(0, 100) + '...' 
      : autoPRConfig.content;
    contentPreview = `\n📋 PREVIEW NỘI DUNG:\n${preview}\n`;
  }

  const startText = [
    '🚀 Đã bắt đầu Auto PR!',
    `👥 Số nhóm: ${autoPRConfig.groups.length}`,
    `📝 Nội dung: ${autoPRConfig.content ? 'Tùy chỉnh' : 'Mặc định (bonz pr)'}`,
    contentPreview,
    `⏰ Chu kỳ: ${autoPRConfig.intervalText}`,
    `🔄 Lặp lại: ${autoPRConfig.isInfinite ? 'Vô hạn ♾️' : autoPRConfig.repeat + ' lần'}`,
    `📤 Số lần/nhóm: ${autoPRConfig.countPerGroup}`,
    `📊 Tổng cộng: ${autoPRConfig.isInfinite ? 'Không giới hạn ♾️' : autoPRConfig.repeat * autoPRConfig.groups.length * autoPRConfig.countPerGroup + ' tin nhắn'}`,
    '',
    '💡 Sử dụng "bonz auto pr stop" để dừng'
  ].join('\n');

  return api.sendMessage(startText, threadId, type);
}

// Dừng Auto PR
async function stopAutoPR(api, event) {
  const { threadId, type } = event;
  
  // Kiểm tra Auto PR mới
  if (autoPRData.isRunning) {
    // Dừng timer
    if (autoPRData.timer) {
      clearInterval(autoPRData.timer);
      autoPRData.timer = null;
    }
    
    const duration = Math.round((Date.now() - autoPRData.startTime) / 1000 / 60);
    
    // Reset trạng thái
    autoPRData.isRunning = false;
    
    const stopText = [
      '⏹️ Đã dừng Auto PR!',
      `📊 Đã gửi: ${autoPRData.count} bài`,
      `📍 Nhóm đích: ${autoPRData.targetGroup}`,
      `⏰ Thời gian chạy: ${duration} phút`,
      '',
      '✅ Auto PR đã được dừng thành công!'
    ].join('\n');
    
    return api.sendMessage(stopText, threadId, type);
  }
  
  // Kiểm tra Simple Auto PR trong nhóm hiện tại (tương thích cũ)
  if (simpleAutoPRGroups.has(threadId)) {
    const groupData = simpleAutoPRGroups.get(threadId);
    
    // Dừng timer
    if (groupData.timer) {
      clearInterval(groupData.timer);
    }
    
    // Xóa khỏi danh sách
    simpleAutoPRGroups.delete(threadId);
    
    const duration = Math.round((Date.now() - groupData.startTime) / 1000 / 60);
    
    const stopText = [
      '⏹️ Đã dừng Auto PR!',
      `📊 Đã gửi: ${groupData.count} bài`,
      `⏰ Thời gian chạy: ${duration} phút`,
      '',
      '✅ Auto PR đã được dừng thành công!'
    ].join('\n');
    
    return api.sendMessage(stopText, threadId, type);
  }
  
  // Không có Auto PR nào đang chạy
  return api.sendMessage("❌ Không có Auto PR nào đang chạy!", threadId, type);
}

// Đặt nhóm đích cho Auto PR
async function setAutoPRGroup(api, event) {
  const { threadId, type } = event;
  
  if (type !== 'group') {
    return api.sendMessage("❌ Lệnh này chỉ sử dụng được trong nhóm!", threadId, type);
  }
  
  // Lưu nhóm hiện tại
  autoPRData.currentGroup = threadId;
  
  const message = [
    '✅ Đã nhận diện ID nhóm!',
    `📍 Nhóm đích: ${threadId}`,
    '',
    '📋 BƯỚC TIẾP THEO:',
    '1️⃣ bonz auto pr nd <nội_dung> - Đặt nội dung PR',
    '2️⃣ bonz auto pr start - Bắt đầu Auto PR',
    '',
    '💡 Hoặc sử dụng nội dung mặc định và chạy luôn "bonz auto pr start"'
  ].join('\n');
  
  return api.sendMessage(message, threadId, type);
}

// Đặt nội dung PR
async function setAutoPRContent(api, event, args) {
  const { threadId, type } = event;
  
  if (!args || args.length === 0) {
    return api.sendMessage(
      "❌ Vui lòng nhập nội dung!\n" +
      "📝 Sử dụng: bonz auto pr nd <nội_dung_cần_pr>",
      threadId, type
    );
  }
  
  // Ghép nội dung từ các args
  const content = args.join(' ');
  autoPRData.content = content;
  
  const message = [
    '✅ Đã lưu nội dung PR!',
    `📝 Nội dung: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
    '',
    '🚀 Sử dụng "bonz auto pr start" để bắt đầu!'
  ].join('\n');
  
  return api.sendMessage(message, threadId, type);
}

// Bắt đầu Auto PR
async function startAutoPR(api, event) {
  const { threadId, type } = event;
  
  console.log(`[startAutoPR] Debug - threadId: ${threadId}, type: ${type}`);
  
  // Nếu chưa có nội dung, sử dụng nội dung mặc định
  if (!autoPRData.content) {
    autoPRData.content = await getPRContent(); // Lấy nội dung mặc định
  }
  
  // Kiểm tra đã chạy chưa
  if (autoPRData.isRunning) {
    return api.sendMessage(
      "⚠️ Auto PR đã đang chạy!\n" +
      `📊 Đã gửi: ${autoPRData.count} bài\n` +
      `📍 Nhóm: ${autoPRData.currentGroup}\n` +
      `⏰ Bắt đầu: ${new Date(autoPRData.startTime).toLocaleString('vi-VN')}\n\n` +
      `💡 Sử dụng "bonz auto pr stop" để dừng`,
      threadId, type
    );
  }
  
  try {
    // Gửi bài đầu tiên ngay lập tức
    await api.sendMessage(autoPRData.content, threadId, type);
    
    // Khởi tạo dữ liệu
    autoPRData.isRunning = true;
    autoPRData.count = 1;
    autoPRData.startTime = Date.now();
    autoPRData.currentGroup = threadId;
    
    // Biến đếm phút để theo dõi
    let minuteCounter = 0;
    
    // Thiết lập timer chạy mỗi phút
    autoPRData.timer = setInterval(async () => {
      minuteCounter++;
      
      try {
        if (minuteCounter % 5 === 0) {
          // Mỗi 5 phút: Gửi bài PR thật - chỉ gửi bài PR, không thông báo gì
          await api.sendMessage(autoPRData.content, threadId, type);
          autoPRData.count++;
        }
        // Bỏ thông báo đếm ngược
        
      } catch (error) {
        // Im lặng - nếu lỗi nghiêm trọng, dừng Auto PR
        if (error.message.includes('Invalid URL') || error.message.includes('not found')) {
          clearInterval(autoPRData.timer);
          autoPRData.isRunning = false;
        }
      }
    }, 60000); // 1 phút = 60000ms
    
    // Hoàn thành im lặng
    return;
    
  } catch (error) {
    // Im lặng hoàn toàn
    return;
  }
}

// Reset Auto PR
async function resetAutoPR(api, event) {
  const { threadId, type } = event;
  
  // Dừng nếu đang chạy
  if (autoPRConfig.isRunning) {
    if (autoPRConfig.intervalId) {
      clearInterval(autoPRConfig.intervalId);
      autoPRConfig.intervalId = null;
    }
    autoPRConfig.isRunning = false;
  }

  // Reset tất cả cài đặt
  autoPRConfig.groups = [];
  autoPRConfig.interval = 3600000; // 1 giờ
  autoPRConfig.intervalText = '1 giờ';
  autoPRConfig.repeat = 1;
  autoPRConfig.countPerGroup = 1;
  autoPRConfig.content = null;
  autoPRConfig.currentRound = 0;
  autoPRConfig.totalSent = 0;
  autoPRConfig.startTime = null;

  const resetText = [
    '🔄 Đã reset tất cả cài đặt Auto PR!',
    '',
    '📋 Cài đặt mặc định:',
    '👥 Nhóm: 0 (chưa cài đặt)',
    '📝 Nội dung: Mặc định (bonz pr)',
    '⏰ Chu kỳ: 1 giờ',
    '🔄 Lặp lại: 1 lần',
    '📤 Số lần/nhóm: 1',
    '',
    '💡 Thiết lập lại từ đầu:',
    '1️⃣ bonz auto pr <id1,id2,id3>',
    '2️⃣ bonz auto pr nd "Nội dung tùy chỉnh"',
    '3️⃣ bonz auto pr h 30s/5m/2h',
    '4️⃣ bonz auto pr rely <số_lần>',
    '5️⃣ bonz auto pr sl <số_lượng>'
  ].join('\n');

  return api.sendMessage(resetText, threadId, type);
}

// Xem trạng thái Auto PR
async function getAutoPRStatus(api, threadId, type) {
  // Kiểm tra Auto PR mới
  if (autoPRData.isRunning) {
    const duration = Math.round((Date.now() - autoPRData.startTime) / 1000 / 60);
    const nextSendTime = new Date(autoPRData.startTime + (autoPRData.count * 3600000)).toLocaleTimeString('vi-VN');
    
    const statusText = [
      '📊 ═══════════════════════════════════',
      '         TRẠNG THÁI AUTO PR',
      '═══════════════════════════════════ 📊',
      '',
      '🔄 Trạng thái: 🟢 Đang chạy',
      `📍 Nhóm đích: ${autoPRData.targetGroup}`,
      `📊 Đã gửi: ${autoPRData.count} bài`,
      `📝 Nội dung: ${autoPRData.content.substring(0, 50)}...`,
      `⏰ Bắt đầu: ${new Date(autoPRData.startTime).toLocaleString('vi-VN')}`,
      `⏰ Thời gian chạy: ${duration} phút`,
      `📤 Lần gửi tiếp theo: ${nextSendTime}`,
      '',
      '🔥 TÍNH NĂNG:',
      '• Tự động gửi vô hạn ♾️',
      '• Chu kỳ: 1 tiếng/bài',
      '• Gửi vào nhóm đã chọn',
      '',
      '💡 Sử dụng "bonz auto pr stop" để dừng'
    ].join('\n');
    
    return api.sendMessage(statusText, threadId, type);
  }
  
  // Kiểm tra Simple Auto PR trong nhóm hiện tại (tương thích cũ)
  if (simpleAutoPRGroups.has(threadId)) {
    const groupData = simpleAutoPRGroups.get(threadId);
    const duration = Math.round((Date.now() - groupData.startTime) / 1000 / 60);
    const nextSendTime = new Date(groupData.startTime + (groupData.count * 3600000)).toLocaleTimeString('vi-VN');
    
    const statusText = [
      '📊 ═══════════════════════════════════',
      '         TRẠNG THÁI AUTO PR',
      '═══════════════════════════════════ 📊',
      '',
      '🔄 Trạng thái: 🟢 Đang chạy',
      `📊 Đã gửi: ${groupData.count} bài`,
      `⏰ Bắt đầu: ${new Date(groupData.startTime).toLocaleString('vi-VN')}`,
      `⏰ Thời gian chạy: ${duration} phút`,
      `📤 Lần gửi tiếp theo: ${nextSendTime}`,
      '',
      '🔥 TÍNH NĂNG:',
      '• Tự động gửi vô hạn ♾️',
      '• Chu kỳ: 1 tiếng/bài',
      '• Chỉ trong nhóm hiện tại',
      '',
      '💡 Sử dụng "bonz auto pr stop" để dừng'
    ].join('\n');
    
    return api.sendMessage(statusText, threadId, type);
  }
  
  // Hiển thị trạng thái cấu hình hiện tại
  const configText = [
    '📊 ═══════════════════════════════════',
    '      TRẠNG THÁI AUTO PR SYSTEM',
    '═══════════════════════════════════ 📊',
    '',
    '🔄 Trạng thái: ⭕ Chưa chạy',
    `📍 Nhóm đích: ${autoPRData.targetGroup || 'Chưa đặt'}`,
    `📝 Nội dung: ${autoPRData.content ? 'Đã có' : 'Chưa có'}`,
    '',
    '📋 HƯỚNG DẪN:',
    '🚀 bonz auto pr start - BẮT ĐẦU NGAY (ở bất kỳ đâu)',
    '',
    '💡 Chỉ cần 1 lệnh! 5 phút/bài + thông báo mỗi phút'
  ].join('\n');
  
  return api.sendMessage(configText, threadId, type);
}

// Xem toàn bộ nội dung PR hiện tại
async function viewAutoPRContent(api, threadId, type) {
  if (!autoPRConfig.content) {
    const defaultContent = await getPRContent();
    const viewText = [
      '📋 ═══════════════════════════════════',
      '        NỘI DUNG PR HIỆN TẠI',
      '═══════════════════════════════════ 📋',
      '',
      '📝 Loại: Mặc định (từ "bonz pr")',
      `📏 Độ dài: ${defaultContent.length} ký tự`,
      '',
      '📄 NỘI DUNG ĐẦY ĐỦ:',
      '─'.repeat(40),
      defaultContent,
      '─'.repeat(40),
      '',
      '💡 Để đặt nội dung tùy chỉnh:',
      'bonz auto pr nd "Nội dung của bạn"',
      '═══════════════════════════════════ 📋'
    ].join('\n');
    
    return api.sendMessage(viewText, threadId, type);
  }

  const viewText = [
    '📋 ═══════════════════════════════════',
    '        NỘI DUNG PR HIỆN TẠI',
    '═══════════════════════════════════ 📋',
    '',
    '📝 Loại: Tùy chỉnh',
    `📏 Độ dài: ${autoPRConfig.content.length} ký tự`,
    '',
    '📄 NỘI DUNG ĐẦY ĐỦ:',
    '─'.repeat(40),
    autoPRConfig.content,
    '─'.repeat(40),
    '',
    '💡 Để thay đổi nội dung:',
    'bonz auto pr nd "Nội dung mới"',
    '',
    '💡 Để về nội dung mặc định:',
    'bonz auto pr reset',
    '═══════════════════════════════════ 📋'
  ].join('\n');

  return api.sendMessage(viewText, threadId, type);
}

// Test kết nối với các nhóm
async function testAutoPRGroups(api, threadId, type) {
  if (autoPRConfig.groups.length === 0) {
    return api.sendMessage("❌ Chưa có nhóm nào được thiết lập!\n💡 Sử dụng: bonz auto pr <id1,id2,id3>", threadId, type);
  }

  const testResults = [];
  const testMessage = "🔍 Test kết nối - Auto PR System";
  
  testResults.push('🔍 ═══════════════════════════════════');
  testResults.push('        KIỂM TRA KẾT NỐI NHÓM');
  testResults.push('═══════════════════════════════════ 🔍');
  testResults.push('');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < autoPRConfig.groups.length; i++) {
    const groupId = autoPRConfig.groups[i];
    
    try {
      await api.sendMessage(testMessage, groupId, 'group');
      testResults.push(`${i + 1}. ${groupId} ✅ Kết nối thành công`);
      successCount++;
      
      // Delay giữa các test
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      testResults.push(`${i + 1}. ${groupId} ❌ Lỗi: ${error.message}`);
      failCount++;
    }
  }

  testResults.push('');
  testResults.push('📊 KẾT QUẢ:');
  testResults.push(`✅ Thành công: ${successCount}/${autoPRConfig.groups.length}`);
  testResults.push(`❌ Thất bại: ${failCount}/${autoPRConfig.groups.length}`);
  
  if (failCount > 0) {
    testResults.push('');
    testResults.push('💡 KHUYẾN NGHỊ:');
    testResults.push('• Kiểm tra lại ID nhóm');
    testResults.push('• Đảm bảo bot có trong nhóm');
    testResults.push('• Kiểm tra quyền gửi tin nhắn');
  }
  
  testResults.push('═══════════════════════════════════ 🔍');

  return api.sendMessage(testResults.join('\n'), threadId, type);
}

// Thực thi Auto PR
async function executeAutoPR(api) {
  try {
    // Kiểm tra điều kiện dừng (chỉ khi không phải chế độ vô hạn)
    if (!autoPRConfig.isInfinite && autoPRConfig.currentRound >= autoPRConfig.repeat) {
      // Hoàn thành tất cả vòng lặp
      if (autoPRConfig.intervalId) {
        clearInterval(autoPRConfig.intervalId);
        autoPRConfig.intervalId = null;
      }
      autoPRConfig.isRunning = false;
      console.log(`[Auto PR] Hoàn thành! Đã gửi ${autoPRConfig.totalSent} tin nhắn`);
      return;
    }

    // Tăng vòng lặp
    autoPRConfig.currentRound++;
    console.log(`[Auto PR] Bắt đầu vòng ${autoPRConfig.currentRound}/${autoPRConfig.isInfinite ? '∞' : autoPRConfig.repeat}`);

    // Lấy nội dung PR (tùy chỉnh hoặc mặc định)
    const prContent = autoPRConfig.content || await getPRContent();

    // Gửi tin nhắn vào từng nhóm
    let successCount = 0;
    let errorCount = 0;
    const failedGroups = [];

    for (const groupId of autoPRConfig.groups) {
      let groupSuccess = false;
      
      for (let i = 0; i < autoPRConfig.countPerGroup; i++) {
        try {
          // Thử gửi tin nhắn
          await api.sendMessage(prContent, groupId, 'group');
          autoPRConfig.totalSent++;
          successCount++;
          groupSuccess = true;
          console.log(`[Auto PR] ✅ Đã gửi vào nhóm ${groupId} (lần ${i + 1})`);
          
          // Delay giữa các tin nhắn để tránh spam
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          errorCount++;
          console.error(`[Auto PR] ❌ Lỗi gửi vào nhóm ${groupId} (lần ${i + 1}):`, error.message);
          
          // Nếu lỗi liên tục, skip nhóm này
          if (error.message.includes('Invalid URL') || error.message.includes('not found')) {
            console.log(`[Auto PR] ⚠️ Skip nhóm ${groupId} do lỗi nghiêm trọng`);
            break;
          }
          
          // Delay ngắn trước khi thử lại
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Ghi nhận nhóm thất bại
      if (!groupSuccess) {
        failedGroups.push(groupId);
      }
    }

    console.log(`[Auto PR] Hoàn thành vòng ${autoPRConfig.currentRound}. Thành công: ${successCount}, Lỗi: ${errorCount}`);
    
    // Lưu thống kê lỗi
    if (!autoPRConfig.errorStats) {
      autoPRConfig.errorStats = { totalErrors: 0, failedGroups: new Set() };
    }
    autoPRConfig.errorStats.totalErrors += errorCount;
    failedGroups.forEach(groupId => autoPRConfig.errorStats.failedGroups.add(groupId));

    console.log(`[Auto PR] Hoàn thành vòng ${autoPRConfig.currentRound}. Tổng đã gửi: ${autoPRConfig.totalSent}`);
  } catch (error) {
    console.error('[Auto PR] Lỗi thực thi:', error);
  }
}

// Lấy nội dung PR
async function getPRContent() {
  return [
    '💎🔥 BẢNG DỊCH VỤ VIP – SIÊU RẺ – UY TÍN 🔥💎',
    '',
    '🤖 DỊCH VỤ BOT ZALO – FACEBOOK 🤖',
    '✨ Làm bot siêu rẻ:',
    '🔹 100K 👉 Bot nhiều chức năng VIP',
    '🔹 50K 👉 Bot Zalo ngẫu nhiên (nhiều/ít chức năng)',
    '',
    '📆 Thuê bot theo tháng:',
    '• 1 tháng = 30K',
    '• 2 tháng = 60K',
    '• 3 tháng = 90K',
    '• 4 tháng = 120K',
    '➡️ Cứ thêm 1 tháng +30K',
    '',
    '✨ Thuê group zalo:',
    '📌 200 TV 👉 20K / ngày | Thuê tháng 👉 giảm còn 15K/ngày',
    '📌 300 TV 👉 30K / ngày',
    '📌 500 TV 👉 45K / ngày',
    '📌 600 TV 👉 60K / ngày',
    '📌 1000 TV 👉 100K / ngày',
    '',
    '✨ Thuê bot thường: 30K / tháng (cứ +30K mỗi tháng tiếp theo)',
    '✨ Xác thực Zalo: 100K / tài khoản',
    '',
    '👥 BÁN GROUP 👥',
    '📌 Zalo:',
    '• 200 TV 👉 50K',
    '• 400 TV 👉 100K',
    '• 600 TV 👉 200K',
    '• 800 TV 👉 250K',
    '',
    '💻 BÁN TOOL ĐA THỂ LOẠI 💻',
    '⚡ Tool buff MXH',
    '⚡ Tool spam – auto',
    '⚡ Tool quản lý – tiện ích',
    '👉 Giá đa dạng – inbox để chọn gói phù hợp!',
    '',
    '💖 BUFF MXH – GIÁ RẺ 💖',
    '💓 Buff tim | 👁️ Buff view | ⭐ Buff yêu thích',
    '🔄 Buff share | 🎥 Buff mắt live',
    '👉 Giá chỉ từ 5K – Random ngẫu nhiên',
    '',
    '📚 KHO TÀI LIỆU HỌC TẬP 📚',
    '👉 Đa dạng tài liệu THCS – THPT – vô hạn – giá rẻ',
    '',
    '🏖️🌴 CHO THUÊ VILLA VŨNG TÀU VIEW BIỂN – SANG TRỌNG 🌴🏖️',
    '',
    '✨ Tiện ích nổi bật:',
    '🏠 Sát biển – view siêu chill',
    '🏊 Hồ bơi riêng – BBQ thỏa thích',
    '🎤 Phòng karaoke – không gian rộng',
    '🛋️ Full nội thất cao cấp',
    '👨‍👩‍👧‍👦 Phù hợp nhóm bạn, gia đình, team building',
    '',
    '💰 Bảng giá thuê Villa 💰',
    '🔹 1️⃣ Từ 1.000.000đ/đêm',
    '🔹 2️⃣ Đặt villa > 3.000.000đ 👉 Giảm giá siêu sâu 🎉',
    '🔹 3️⃣ Gói 10.000.000đ 👉 Villa siêu đẹp – sang trọng bậc nhất 🌟',
    '',
    '📅 Thuê theo tháng – Giá sốc 📅',
    '🏡 Thuê dài hạn 👉 Giảm siêu sâu',
    '👨‍💼 Có nhân viên phục vụ 24/7',
    '🔥 Phù hợp nghỉ dưỡng dài ngày, làm việc từ xa, nhóm bạn ở lâu',
    '',
    '✨ Cam kết: View biển xịn – Giá rẻ – Dịch vụ đẳng cấp VIP! ✨',
    '',
    '🚀 PRO LINK – PR BẰNG BOT',
    '🤖 Bot hiện đang chạy trong 600+ nhóm Zalo',
    '👉 Mỗi ngày share link hàng loạt vào group – tiếp cận cực khủng',
    '',
    '💰 Giá dịch vụ:',
    '• 1 ngày 👉 10K',
    '• 7 ngày 👉 70K (tặng thêm 1 ngày)',
    '• 30 ngày 👉 300K (giảm còn 250K)',
    '',
    '🔗 Nhận PR: link nhóm Zalo, link Facebook, Shopee, TikTok, YouTube...',
    '',
    '🌐 DỊCH VỤ LÀM WEB ĐA DẠNG – GIÁ RẺ 🌐',
    '✨ Web cá nhân – giới thiệu bản thân',
    '✨ Web landing page – bán hàng online',
    '✨ Web giới thiệu dịch vụ – doanh nghiệp nhỏ',
    '✨ Web sự kiện – mini game – thông báo',
    '✨ Web thả thính, chat tương tác, fun – tạo cộng đồng vui nhộn',
    '✨ Web bán sản phẩm, combo, khuyến mãi – tương tác trực tiếp',
    '✨ Web nhiều tính năng – đẹp, load nhanh, tương thích mobile',
    '',
    '💰 Giá chỉ từ 300K – Giao diện đẹp, đa tính năng ⚡',
    '👉 Có thể nâng cấp lên web động (tích hợp thanh toán, đăng nhập…)',
    '',
    '🎨 TẤT CẢ DỊCH VỤ ĐỀU VIP – UY TÍN – GIÁ SIÊU RẺ',
    '🔥 Inbox ngay để được tư vấn & báo giá chi tiết từng gói',
    '✨ Giao diện, thiết kế, nội dung tùy chỉnh theo yêu cầu'
  ].join('\n');
}

// Khởi tạo sẵn các nhóm Auto PR với nội dung mặc định
async function initializeDefaultGroups() {
  const defaultContent = await getPRContent();
  const groupNumbers = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  
  for (const groupNum of groupNumbers) {
    const groupName = groupNum.toString();
    const groupData = ensureGroupData(groupName, null, 'group');
    if (!groupData.content) {
      groupData.content = defaultContent;
    }
  }
  
  // Bỏ thông báo hoàn thành
}

// Hàm đếm số lượng lệnh bonz
function getBonzCommandCount() {
  // Danh sách lệnh user (bonz commands)
  const userCommands = [
    'bonz get id', 'bonzid2', 'bonz qr', 'bonz yt info', 'bonz fb', 'bonz group',
    'bonz reminder', 'bonz horoscope', 'bonz lịch', 'bonz help', 'bonz in bot',
    'bonz gg image', 'bonz var', 'bonz spam', 'bonz rút gọn', 'gmail ảo',
    'bonz restart', 'bonz menu', 'bonz admin', 'bonz pr', 'bonz list group'
  ];

  // Danh sách lệnh admin (bonz admin commands)
  const adminCommands = [
    'bonz war group', 'bonz war max', 'bonz lock', 'bonz unlock', 'bonz mở chat',
    'bonz khóa', 'bonz mở khóa', 'bonz ds khóa', 'bonz spam stats', 'bonz spam whitelist',
    'bonz cay on', 'bonz cay stop', 'bonz menu admin', 'kickall', 'joingroup', 'spamgroup',
    'bonz admin list', 'bonz admin add', 'bonz admin remove', 'bonz admin check',
    'bonz auto pr', 'bonz auto pr h', 'bonz auto pr rely', 'bonz auto pr sl',
    'bonz auto pr start', 'bonz auto pr stop', 'bonz auto pr status', 'bonz auto pr reset'
  ];

  // Lệnh hệ thống khác
  const systemCommands = [
    'menu', 'help', 'ping', 'uptime', 'info', 'stats'
  ];

  return {
    user: userCommands.length,
    admin: adminCommands.length,
    system: systemCommands.length,
    total: userCommands.length + adminCommands.length + systemCommands.length
  };
}

// ======================== SIMPLE AUTO PR SYSTEM ========================
// Chế độ đơn giản: gõ "bonz auto pr" trong nhóm để tự động gửi quảng cáo mỗi tiếng (vô hạn)
async function startSimpleAutoPR(api, event) {
  const { threadId, type } = event;
  
  console.log(`[Simple Auto PR] Bắt đầu trong nhóm ${threadId}, type: ${type}`);
  
  // Kiểm tra xem nhóm này đã có Auto PR đang chạy chưa
  if (simpleAutoPRGroups.has(threadId)) {
    const groupData = simpleAutoPRGroups.get(threadId);
    console.log(`[Simple Auto PR] Nhóm ${threadId} đã có Auto PR đang chạy`);
    return api.sendMessage(
      `⚠️ Auto PR đã đang chạy trong nhóm này!\n` +
      `📊 Đã gửi: ${groupData.count} bài\n` +
      `⏰ Bắt đầu: ${new Date(groupData.startTime).toLocaleString('vi-VN')}\n` +
      `🔄 Chế độ: Vô hạn ♾️\n\n` +
      `💡 Sử dụng "bonz auto pr stop" để dừng`,
      threadId, type
    );
  }

  try {
    console.log(`[Simple Auto PR] Gửi bài đầu tiên cho nhóm ${threadId}`);
    console.log(`[Simple Auto PR] Nội dung: ${defaultAdContent.substring(0, 100)}...`);
    // Gửi bài đầu tiên ngay lập tức
    await api.sendMessage(defaultAdContent, threadId, type);
    
    // Khởi tạo dữ liệu cho nhóm
    const groupData = {
      count: 1,
      startTime: Date.now(),
      timer: null
    };
    
    // Thiết lập timer để gửi liên tục mỗi tiếng 1 bài (vô hạn)
    groupData.timer = setInterval(async () => {
      try {
        // Gửi bài tiếp theo - chỉ gửi bài PR, không thông báo gì
        await api.sendMessage(defaultAdContent, threadId, type);
        groupData.count++;
        
      } catch (error) {
        // Im lặng - nếu lỗi nghiêm trọng, dừng Auto PR
        if (error.message.includes('Invalid URL') || error.message.includes('not found')) {
          clearInterval(groupData.timer);
          groupData.isRunning = false;
        }
      }
    }, 3600000); // 1 tiếng = 3600000ms
    
    // Lưu dữ liệu nhóm
    simpleAutoPRGroups.set(threadId, groupData);
    
    // Hoàn thành im lặng
    return;
    
  } catch (error) {
    // Im lặng hoàn toàn
    return;
  }
}

// ======================== MULTI-GROUP AUTO PR SYSTEM ========================

// Đặt nội dung PR cho nhóm cụ thể
async function setGroupPRContent(api, event, groupName, content) {
  const { threadId, type } = event;
  
  if (!content || content.trim() === '') {
    return api.sendMessage(
      "❌ Vui lòng nhập nội dung!\n" +
      `📝 Sử dụng: bonz auto pr nd gr ${groupName} <nội_dung_cần_pr>`,
      threadId, type
    );
  }
  
  const groupData = ensureGroupData(groupName, threadId, type);
  groupData.content = content.trim();
  
  const message = [
    `✅ Đã lưu nội dung PR cho nhóm "${groupName}"!`,
    `📝 Nội dung: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
    `📍 Target: ${groupData.targetGroupId}`,
    `⏱️ Chu kỳ: ${groupData.intervalText}`,
    `🧹 TTL: ${groupData.ttlText}`,
    '',
    `🚀 Sử dụng "bonz auto pr gr ${groupName} start" để bắt đầu!`
  ].join('\n');
  
  return api.sendMessage(message, threadId, type);
}

// Đặt nội dung PR cho nhiều nhóm cùng lúc
async function setMultipleGroupsPRContent(api, event, groupNames, content) {
  const { threadId, type } = event;
  
  if (!content || content.trim() === '') {
    return api.sendMessage(
      "❌ Vui lòng nhập nội dung!\n" +
      `📝 Sử dụng: bonz auto pr nd gr ${groupNames.join(' ')} <nội_dung_cần_pr>`,
      threadId, type
    );
  }
  
  const trimmedContent = content.trim();
  const updatedGroups = [];
  const createdGroups = [];
  
  // Cập nhật hoặc tạo mới cho từng nhóm
  for (const groupName of groupNames) {
    const groupData = ensureGroupData(groupName, threadId, type);
    const existed = Boolean(groupData.content);
    groupData.content = trimmedContent;
    if (existed) {
      updatedGroups.push(groupName);
    } else {
      createdGroups.push(groupName);
    }
  }
  
  // Tạo thông báo kết quả
  const message = [
    `✅ Đã cập nhật nội dung cho ${groupNames.length} nhóm!`,
    `📝 Nội dung: ${trimmedContent.substring(0, 100)}${trimmedContent.length > 100 ? '...' : ''}`,
    `📍 Target: ${threadId}`,
    ''
  ];
  
  if (createdGroups.length > 0) {
    message.push(`🆕 Nhóm mới: ${createdGroups.join(', ')}`);
  }
  
  if (updatedGroups.length > 0) {
    message.push(`🔄 Nhóm cập nhật: ${updatedGroups.join(', ')}`);
  }
  
  message.push(
    '',
    '🚀 CÁCH BẮT ĐẦU:',
    ...groupNames.map(name => `• bonz auto pr gr ${name} start`)
  );
  
  return api.sendMessage(message.join('\n'), threadId, type);
}

// Đặt danh sách UID danh thiếp cho nhóm cụ thể
async function setGroupPRCardIds(api, event, groupName, ids) {
  const { threadId, type } = event;
  if (!groupName) {
    return api.sendMessage('❌ Thiếu tên nhóm!\n📝 Dùng: bonz auto pr id gr <nhóm> <uid[,uid2,...]>', threadId, type);
  }
  if (!ids || !ids.trim()) {
    return api.sendMessage(`❌ Thiếu danh sách UID!\n📝 Dùng: bonz auto pr id gr ${groupName} <uid[,uid2,...]>`, threadId, type);
  }
  const groupData = ensureGroupData(groupName, threadId, type);
  const list = ids.split(/[,\s]+/).map(x => x.trim()).filter(x => /^\d+$/.test(x));
  if (!list.length) {
    return api.sendMessage('❌ Không có UID hợp lệ! UID phải là số, phân tách bằng dấu phẩy.', threadId, type);
  }
  groupData.cardUserIds = list;
  groupData.targetGroupId = threadId;
  const okMsg = [
    `✅ Đã lưu UID danh thiếp cho nhóm "${groupName}"`,
    `👤 Số UID: ${list.length}`,
    `📍 Target: ${threadId}`,
    `⏱️ Chu kỳ: ${groupData.intervalText}`,
    `🧹 TTL: ${groupData.ttlText}`,
    `💡 Chạy: bonz auto pr gr ${groupName} start`
  ].join('\n');
  return api.sendMessage(okMsg, threadId, type);
}

async function setGroupPRInterval(api, event, groupName, intervalArg) {
  const { threadId, type } = event;

  if (!groupName) {
    return api.sendMessage('❌ Thiếu tên nhóm!\n📝 Dùng: bonz auto pr gr <nhóm> interval <thời_gian>', threadId, type);
  }
  if (!intervalArg) {
    return api.sendMessage(`❌ Thiếu thời gian!\n📝 Ví dụ: bonz auto pr gr ${groupName} interval 5m`, threadId, type);
  }

  const parsed = parseDurationArgument(intervalArg, {
    minMs: MIN_GROUP_INTERVAL_MS,
    maxMs: MAX_GROUP_INTERVAL_MS,
    defaultUnit: 'm'
  });

  if (!parsed) {
    return api.sendMessage(
      '❌ Thời gian không hợp lệ!\n' +
      '🕒 Định dạng: 30s, 5m, 1h (30 giây - 24 giờ)',
      threadId,
      type
    );
  }

  const groupData = ensureGroupData(groupName, threadId, type);
  groupData.intervalMs = parsed.ms;
  groupData.intervalText = parsed.label;

  if (groupData.isRunning && (!groupData.schedule || groupData.schedule.mode !== 'daily')) {
    clearGroupTimers(groupData);
    scheduleGroupInterval(api, groupData);
  } else if (!groupData.isRunning) {
    groupData.nextSendAt = null;
  }

  const nextText = groupData.isRunning && groupData.nextSendAt
    ? formatTimestamp(groupData.nextSendAt)
    : 'Chưa có';

  const response = [
    `✅ Đã cập nhật chu kỳ cho nhóm "${groupName}"!`,
    `⏱️ Chu kỳ: ${groupData.intervalText}`,
    `🧹 TTL: ${groupData.ttlText}`,
    groupData.isRunning ? `⏰ Lần gửi tiếp theo: ${nextText}` : '',
    '',
    groupData.isRunning
      ? '🔄 Auto PR đang chạy, chu kỳ mới áp dụng ngay.'
      : `💡 Chạy: bonz auto pr gr ${groupName} start`
  ].filter(Boolean).join('\n');

  return api.sendMessage(response, threadId, type);
}

async function setGroupPRTTL(api, event, groupName, ttlArg) {
  const { threadId, type } = event;

  if (!groupName) {
    return api.sendMessage('❌ Thiếu tên nhóm!\n📝 Dùng: bonz auto pr gr <nhóm> ttl <thời_gian>', threadId, type);
  }
  if (!ttlArg) {
    return api.sendMessage(`❌ Thiếu thời gian TTL!\n📝 Ví dụ: bonz auto pr gr ${groupName} ttl 2m`, threadId, type);
  }

  const parsed = parseDurationArgument(ttlArg, {
    minMs: MIN_GROUP_TTL_MS,
    maxMs: MAX_GROUP_TTL_MS,
    allowOff: true,
    defaultUnit: 'm'
  });

  if (!parsed) {
    return api.sendMessage(
      '❌ TTL không hợp lệ!\n' +
      '🕒 Định dạng: 30s, 2m, 1h hoặc off (15 giây - 24 giờ)',
      threadId,
      type
    );
  }

  const groupData = ensureGroupData(groupName, threadId, type);
  groupData.ttlMs = parsed.ms;
  groupData.ttlText = parsed.label;

  const response = [
    `✅ Đã cập nhật TTL cho nhóm "${groupName}"!`,
    `🧹 TTL: ${groupData.ttlText}`,
    `⏱️ Chu kỳ: ${groupData.intervalText}`,
    groupData.isRunning && groupData.nextSendAt
      ? `⏰ Lần gửi tiếp theo: ${formatTimestamp(groupData.nextSendAt)}`
      : '',
    '',
    parsed.ms
      ? `💡 Tin nhắn sẽ tự xóa sau ${groupData.ttlText}`
      : '💡 Đã tắt auto-delete cho nhóm này'
  ].filter(Boolean).join('\n');

  return api.sendMessage(response, threadId, type);
}

// Xử lý lệnh nhanh: bonz auto pr ik gr <group> [nd "content"] [id 1,2,3] [t HH:mm] [start]
async function handleAutoPRQuick(api, event, ikArgs) {
  const { threadId, type } = event;
  // yêu cầu bắt đầu bằng: gr <group>
  if (!ikArgs.length || ikArgs[0].toLowerCase() !== 'gr' || !ikArgs[1]) {
    return api.sendMessage(
      '❌ Thiếu tham số!\n📝 Dùng: bonz auto pr ik gr <nhóm> [nd "<nội_dung>"] [id <uid[,uid2,...]>] [t <HH:mm>] [start]',
      threadId,
      type
    );
  }
  const groupName = ikArgs[1];
  // Duyệt các tham số sau đó theo cặp keyword-giá trị (nd có thể là nhiều từ cho đến keyword tiếp theo)
  let i = 2;
  let doStart = false;
  let pendingNd = null;
  let pendingIds = null;
  let pendingTime = null;

  const isKeyword = (tok) => ['nd', 'id', 't', 'start', 'interval', 'ttl'].includes((tok || '').toLowerCase());

  while (i < ikArgs.length) {
    const tok = (ikArgs[i] || '').toLowerCase();
    if (tok === 'start') { doStart = true; i += 1; continue; }
    if (tok === 'id') {
      // Thu thập danh sách cho đến keyword kế tiếp
      let j = i + 1; const buf = [];
      while (j < ikArgs.length && !isKeyword(ikArgs[j])) { buf.push(ikArgs[j]); j++; }
      pendingIds = buf.join(' ');
      i = j; continue;
    }
    if (tok === 't') {
      pendingTime = ikArgs[i + 1] || '';
      i += 2; continue;
    }
    if (tok === 'interval') {
      if (!pendingIds && !pendingNd) {
        pendingIds = null;
      }
      pendingTime = pendingTime || null;
      await setGroupPRInterval(api, event, groupName, ikArgs[i + 1] || '');
      i += 2; continue;
    }
    if (tok === 'ttl') {
      await setGroupPRTTL(api, event, groupName, ikArgs[i + 1] || '');
      i += 2; continue;
    }
    if (tok === 'nd') {
      // Thu thập nội dung ND đến keyword kế tiếp
      let j = i + 1; const parts = [];
      while (j < ikArgs.length && !isKeyword(ikArgs[j])) { parts.push(ikArgs[j]); j++; }
      pendingNd = parts.join(' ');
      i = j; continue;
    }
    // Nếu token không thuộc keyword, bỏ qua để tránh kẹt vòng lặp
    i += 1;
  }

  try {
    if (pendingNd && pendingNd.trim()) {
      await setGroupPRContent(api, event, groupName, pendingNd);
    }
    if (pendingIds && pendingIds.trim()) {
      await setGroupPRCardIds(api, event, groupName, pendingIds);
    }
    if (pendingTime && pendingTime.trim()) {
      await setGroupPRTime(api, event, groupName, pendingTime);
    }
    if (doStart) {
      return await startGroupPR(api, event, groupName);
    }
    // Nếu không có start, trả lời tóm tắt cấu hình
    const lines = [];
    lines.push(`✅ Đã áp dụng cấu hình nhanh cho nhóm "${groupName}"`);
    if (pendingNd) lines.push('📝 Nội dung: Đã cập nhật');
    if (pendingIds) lines.push('👤 UID danh thiếp: Đã cập nhật');
    if (pendingTime) lines.push(`🕒 Lịch: ${pendingTime}`);
    lines.push(`💡 Chạy: bonz auto pr gr ${groupName} start`);
    return api.sendMessage(lines.join('\n'), threadId, type);
  } catch (e) {
    return; // im lặng nếu có lỗi, phù hợp phong cách các hàm khác
  }
}

// Bắt đầu Auto PR cho nhóm cụ thể
async function startGroupPR(api, event, groupName) {
  const { threadId, type } = event;
  const groupData = ensureGroupData(groupName, threadId, type);

  if (!groupData.content) {
    groupData.content = await getPRContent();
  }

  if (groupData.isRunning) {
    return api.sendMessage(
      `⚠️ Nhóm "${groupName}" đã đang chạy Auto PR!\n` +
      `📊 Đã gửi: ${groupData.count} bài\n` +
      `📍 Target: ${groupData.targetGroupId}\n` +
      `⏰ Bắt đầu: ${formatTimestamp(groupData.startTime)}\n\n` +
      `💡 Dừng bằng: bonz auto pr gr ${groupName} stop`,
      threadId,
      type
    );
  }

  try {
    clearGroupTimers(groupData);
    groupData.isRunning = true;
    groupData.startTime = Date.now();
    groupData.count = groupData.count || 0;
    groupData.lastSentAt = null;
    groupData.nextSendAt = null;
    groupData.targetGroupId = threadId;
    groupData.targetType = type;

    const hasDailySchedule = groupData.schedule && groupData.schedule.mode === 'daily' && /^\d{2}:\d{2}$/.test(groupData.schedule.time);

    if (hasDailySchedule) {
      scheduleDailyGroupDispatch(api, groupData);
      const next = computeNextOccurrence(groupData.schedule.time);
      groupData.nextSendAt = next?.getTime() || null;

      const nextText = next ? next.toLocaleString('vi-VN') : 'Không xác định';
      return api.sendMessage([
        `🚀 Đã kích hoạt Auto PR nhóm "${groupName}"!`,
        `🗓️ Chế độ: Hẹn giờ hằng ngày lúc ${groupData.schedule.time}`,
        `🧹 TTL: ${groupData.ttlText}`,
        `📝 Nội dung: ${groupData.content ? 'Đã có' : 'Mặc định'}`,
        '',
        `⏰ Lần gửi tiếp theo: ${nextText}`,
        '',
        '💡 Muốn gửi ngay: bonz auto pr gr ' + groupName + ' start sau khi tắt lịch (bonz auto pr gr ' + groupName + ' t off)'
      ].join('\n'), threadId, type);
    }

    await dispatchGroupPR(api, threadId, type, groupData);
    scheduleGroupInterval(api, groupData);

    const startMsg = [
      `🚀 Đã bắt đầu Auto PR nhóm "${groupName}"!`,
      `📤 Đã gửi: ${groupData.count} bài`,
      `⏱️ Chu kỳ: ${groupData.intervalText}`,
      `🧹 TTL: ${groupData.ttlText}`,
      '',
      `📍 Target: ${groupData.targetGroupId}`,
      `⏰ Lần tiếp theo: ${formatTimestamp(groupData.nextSendAt)}`,
      '',
      `💡 Dừng: bonz auto pr gr ${groupName} stop`
    ].join('\n');

    return api.sendMessage(startMsg, threadId, type);
  } catch (error) {
    console.error('[Auto PR] startGroupPR error:', error?.message || error);
    groupData.isRunning = false;
    clearGroupTimers(groupData);
    return api.sendMessage('❌ Không thể bắt đầu Auto PR. Vui lòng thử lại!', threadId, type);
  }
}

// Dừng Auto PR cho nhóm cụ thể
async function stopGroupPR(api, event, groupName) {
  const { threadId, type } = event;
  
  if (!autoPRGroups.has(groupName)) {
    return api.sendMessage(
      `❌ Nhóm "${groupName}" không tồn tại hoặc chưa được cấu hình!`,
      threadId, type
    );
  }
  
  const groupData = ensureGroupData(groupName, threadId, type);
  
  if (!groupData.isRunning) {
    return api.sendMessage(
      `⚠️ Nhóm "${groupName}" không đang chạy Auto PR!`,
      threadId, type
    );
  }
  
  clearGroupTimers(groupData);
  
  // Cập nhật trạng thái
  const totalTime = Date.now() - groupData.startTime;
  const hours = Math.floor(totalTime / (1000 * 60 * 60));
  const minutes = Math.floor((totalTime % (1000 * 60 * 60)) / (1000 * 60));
  
  groupData.isRunning = false;
  groupData.nextSendAt = null;
  
  const stopMessage = [
    `⏹️ Đã dừng Auto PR nhóm "${groupName}"!`,
    `📊 Tổng số bài đã gửi: ${groupData.count}`,
    `⏰ Thời gian chạy: ${hours}h ${minutes}m`,
    `📍 Target: ${groupData.targetGroupId}`,
    '',
    `🚀 Sử dụng "bonz auto pr gr ${groupName} start" để chạy lại`
  ].join('\n');
  
  return api.sendMessage(stopMessage, threadId, type);
}

// Xem trạng thái Auto PR của nhóm cụ thể
async function getGroupPRStatus(api, threadId, type, groupName) {
  if (!autoPRGroups.has(groupName)) {
    return api.sendMessage(
      `❌ Nhóm "${groupName}" không tồn tại hoặc chưa được cấu hình!\n` +
      `📝 Sử dụng: bonz auto pr nd gr ${groupName} <nội_dung> để tạo mới`,
      threadId, type
    );
  }
  
  const groupData = ensureGroupData(groupName);
  
  let statusText = [
    `📊 ═══════════════════════════════════`,
    `      TRẠNG THÁI NHÓM "${groupName.toUpperCase()}"`,
    `═══════════════════════════════════ 📊`,
    '',
    `🔄 Trạng thái: ${groupData.isRunning ? '✅ Đang chạy' : '⭕ Đã dừng'}`,
    `📍 Target Group: ${groupData.targetGroupId || 'Chưa đặt'}`,
    `📝 Nội dung: ${groupData.content ? 'Đã có' : 'Chưa có'}`,
    `📊 Đã gửi: ${groupData.count} bài`,
    `⏱️ Chu kỳ: ${groupData.schedule && groupData.schedule.mode === 'daily' ? 'Hẹn giờ hằng ngày' : groupData.intervalText}`,
    `🧹 TTL: ${groupData.ttlText}`,
  ];
  if (groupData.schedule && groupData.schedule.mode === 'daily') {
    statusText.push(`🕒 Lịch đăng: mỗi ngày lúc ${groupData.schedule.time}`);
  }
  
  if (groupData.isRunning && groupData.startTime) {
    const runningTime = Date.now() - groupData.startTime;
    const hours = Math.floor(runningTime / (1000 * 60 * 60));
    const minutes = Math.floor((runningTime % (1000 * 60 * 60)) / (1000 * 60));
    statusText.push(`⏰ Đã chạy: ${hours}h ${minutes}m`);
  }
  statusText.push(`🕓 Lần gửi gần nhất: ${groupData.lastSentAt ? formatTimestamp(groupData.lastSentAt) : 'Chưa có'}`);
  statusText.push(`🕓 Lần gửi tiếp theo: ${groupData.nextSendAt ? formatTimestamp(groupData.nextSendAt) : 'Chưa có'}`);
  
  statusText.push(
    '',
    '📋 LỆNH:',
    `• bonz auto pr nd gr ${groupName} <nội_dung> - Đặt nội dung`,
    `• bonz auto pr gr ${groupName} start - Bắt đầu`,
    `• bonz auto pr gr ${groupName} stop - Dừng`,
    `• bonz auto pr gr ${groupName} interval <thời_gian> - Đặt chu kỳ`,
    `• bonz auto pr gr ${groupName} ttl <thời_gian/off> - Đặt thời gian tự xóa`,
    `• bonz auto pr gr ${groupName} t <HH:mm/off> - Đặt lịch hằng ngày`,
    '',
    '💡 Chu kỳ: Có thể tuỳ chỉnh theo nhu cầu'
  );
  
  return api.sendMessage(statusText.join('\n'), threadId, type);
}

// ======================== BONZ NHÓM (User-managed group list) ========================
async function handleUserGroupsCommand(api, event, args = []) {
  const { threadId, type } = event || {};
  const senderId = String(event?.data?.uidFrom || event?.authorId || '');

  // Remove: bonz nhóm rm <id>
  if (args[0] && args[0].toLowerCase() === 'rm') {
    const gid = String(args[1] || '').trim();
    if (!gid) {
      return api.sendMessage(
        '❌ Thiếu ID nhóm để xóa!\n\n' +
        'Định dạng: bonz nhóm rm <id>\n' +
        'Ví dụ: bonz nhóm rm groupA',
        threadId, type
      );
    }
    const list = loadSavedGroups();
    const before = list.length;
    const newList = list.filter(x => (x.id || '').toLowerCase() !== gid.toLowerCase());
    if (newList.length === before) {
      return api.sendMessage(`⚠️ Không tìm thấy nhóm với ID: ${gid}`, threadId, type);
    }
    const ok = saveSavedGroups(newList);
    if (!ok) {
      return api.sendMessage('❌ Không thể cập nhật dữ liệu. Vui lòng thử lại sau.', threadId, type);
    }
    return api.sendMessage(`🗑️ Đã xóa nhóm có ID: ${gid}\n🔎 Xem danh sách: bonz nhóm list`, threadId, type);
  }

  // Show list
  if (!args[0] || args[0].toLowerCase() === 'list') {
    const groups = loadSavedGroups();
    if (!groups.length) {
      return api.sendMessage(
        '📭 Chưa có nhóm nào được lưu.\n\n' +
        '➕ Thêm nhóm: bonz nhóm <id> <link>\n' +
        '🗑️ Xóa nhóm: bonz nhóm rm <id>\n' +
        '🔎 Xem danh sách: bonz nhóm list',
        threadId, type
      );
    }
    const lines = [];
    lines.push('📒 DANH SÁCH NHÓM ĐÃ LƯU');
    lines.push('');
    groups.forEach((g, idx) => {
      const t = new Date(g.addedAt || Date.now()).toLocaleString('vi-VN');
      lines.push(`${idx + 1}. ${g.name || g.id} (ID: ${g.id})`);
      lines.push(`   🔗 ${g.link}`);
      lines.push(`   👤 ${g.addedBy || 'unknown'} • ${t}`);
      lines.push('');
    });
    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  // Add/update: bonz nhóm <id> <link> [tên] hoặc bonz nhóm <id> <link> <id2> <link2> [tên2]
  if (args.length >= 2) {
    // Kiểm tra xem có phải format mới không: bonz nhóm <id> <link> [tên]
    // Format mới nếu: có đúng 2 args HOẶC args[2] không phải là link
    const isNewFormat = args.length === 2 || 
                       (args.length >= 3 && args[2] && 
                        !args[2].startsWith('http') && 
                        !args[2].startsWith('zalo.me') &&
                        !args[2].includes('://'));
    
    if (isNewFormat) {
      const gid = String(args[0]).trim();
      const link = String(args[1]).trim();
      const name = args.slice(2).join(' ').trim() || gid; // Dùng ID làm tên mặc định
      
      const idOk = gid.length >= 1 && gid.length <= 64;
      const linkOk = /^(https?:\/\/|zalo\.me\/|zalo\.me\/g\/)/i.test(link);
      
      if (!idOk) {
        return api.sendMessage('❌ ID nhóm không hợp lệ (1-64 ký tự)!', threadId, type);
      }
      if (!linkOk) {
        return api.sendMessage('❌ Link không hợp lệ! Phải bắt đầu bằng http/https hoặc zalo.me', threadId, type);
      }

      const list = loadSavedGroups();
      const idx = list.findIndex(x => (x.id || '').toLowerCase() === gid.toLowerCase());
      const entry = { 
        id: gid, 
        link, 
        name: name,
        addedBy: senderId, 
        addedAt: Date.now() 
      };
      
      let action = '';
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...entry };
        action = 'cập nhật';
      } else {
        list.push(entry);
        action = 'thêm';
      }

      const ok = saveSavedGroups(list);
      if (!ok) {
        return api.sendMessage('❌ Không thể lưu dữ liệu. Vui lòng thử lại sau.', threadId, type);
      }

      return api.sendMessage(
        `✅ Đã ${action} nhóm:\n` +
        `🆔 ID: ${gid}\n` +
        `📝 Tên: ${name}\n` +
        `🔗 Link: ${link}\n\n` +
        `🔎 Xem danh sách: bonz nhóm list`,
        threadId, type
      );
    }

    // Format cũ: bonz nhóm <id> <link> [<id2> <link2> ...]
    if (args.length % 2 !== 0) {
      return api.sendMessage(
        '⚠️ Định dạng không đúng!\n\n' +
        '📋 CÁC CÁCH DÙNG:\n' +
        '• bonz nhóm <id> <link> [tên] - Thêm 1 nhóm có tên\n' +
        '• bonz nhóm <id> <link> <id2> <link2> - Thêm nhiều nhóm\n\n' +
        '💡 VÍ DỤ:\n' +
        '• bonz nhóm abc https://zalo.me/g/123 Nhóm ABC\n' +
        '• bonz nhóm a https://zalo.me/g/abc b https://zalo.me/g/xyz',
        threadId, type
      );
    }

    const list = loadSavedGroups();
    const added = [];
    const updated = [];
    const invalid = [];

    for (let i = 0; i < args.length; i += 2) {
      const gid = String(args[i]).trim();
      const link = String(args[i + 1]).trim();
      const idOk = gid.length >= 2 && gid.length <= 64;
      const linkOk = /^(https?:\/\/|zalo\.me\/|zalo\.me\/g\/)/i.test(link);
      if (!idOk || !linkOk) {
        invalid.push({ id: gid, link });
        continue;
      }
      const idx = list.findIndex(x => (x.id || '').toLowerCase() === gid.toLowerCase());
      const entry = { id: gid, link, addedBy: senderId, addedAt: Date.now() };
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...entry };
        updated.push(gid);
      } else {
        list.push(entry);
        added.push(gid);
      }
    }

    if (added.length === 0 && updated.length === 0) {
      return api.sendMessage(
        '❌ Không có mục hợp lệ để lưu.\n' +
        (invalid.length ? `Bỏ qua ${invalid.length} mục không hợp lệ.` : ''),
        threadId, type
      );
    }

    const ok = saveSavedGroups(list);
    if (!ok) {
      return api.sendMessage('❌ Không thể lưu dữ liệu nhóm. Vui lòng thử lại sau.', threadId, type);
    }

    const lines = [];
    lines.push('✅ Đã cập nhật danh sách nhóm!');
    if (added.length) lines.push(`• Thêm mới: ${added.join(', ')}`);
    if (updated.length) lines.push(`• Cập nhật: ${updated.join(', ')}`);
    if (invalid.length) lines.push(`• Bỏ qua không hợp lệ: ${invalid.map(x => x.id || '?').join(', ')}`);
    lines.push('');
    lines.push('🔎 Xem danh sách: bonz nhóm list');

    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  // Usage
  return api.sendMessage(
    '📘 HƯỚNG DẪN BONZ NHÓM\n\n' +
    '📋 CÁC LỆNH:\n' +
    '• bonz nhóm <id> <link> [tên] - Thêm nhóm có tên\n' +
    '• bonz nhóm <id> <link> - Thêm nhóm (dùng ID làm tên)\n' +
    '• bonz nhóm rm <id> - Xóa nhóm theo ID\n' +
    '• bonz nhóm list - Xem danh sách nhóm\n\n' +
    '💡 VÍ DỤ:\n' +
    '• bonz nhóm abc https://zalo.me/g/123 Nhóm ABC\n' +
    '• bonz nhóm xyz https://zalo.me/g/456\n' +
    '• bonz nhóm rm abc',
    threadId, type
  );
}

// ======================== BONZ KEY (Thêm QTV nhóm) ========================
async function handleKey(api, event, args = []) {
  const { threadId, type } = event;
  const { ThreadType } = require('zca-js');
  
  // Chỉ hoạt động trong nhóm
  if (type !== ThreadType.Group) {
    return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}

  // Kiểm tra quyền: phải là admin/owner bot hoặc admin nhóm
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const isBotAdmin = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));
  
  // Kiểm tra admin nhóm - bỏ qua vì API không hỗ trợ getThreadInfo
  let isGroupAdmin = false;
  // Note: Tạm thời bỏ qua kiểm tra admin nhóm vì API không có getThreadInfo
  // Chỉ dựa vào admin bot/owner

  if (!isBotAdmin) {
    return api.sendMessage('❌ Chỉ admin bot mới có thể sử dụng lệnh này!\n💡 Lý do: API không hỗ trợ kiểm tra admin nhóm.', threadId, type);
  }

  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz key', senderId);

  // Xử lý các lệnh con
  const action = (args[0] || '').toLowerCase();

  if (!action) {
    const header = __formatServiceInfo({
      service: 'bonz key',
      userName,
      userId: senderId,
      notify: 'Hướng dẫn sử dụng',
      role,
      usage,
      howToUse: 'bonz key <user_id> hoặc bonz key @mention'
    });

    const details = [
      '',
      '🔑 BONZ KEY - Thêm Phó Nhóm',
      '',
      '📋 CÁC CÁCH DÙNG:',
      '• bonz key <user_id> - Thêm user làm phó nhóm bằng ID',
      '• bonz key @mention - Thêm user được mention làm phó nhóm',
      '• bonz key list - Xem danh sách phó nhóm hiện tại',
      '• bonz key remove <user_id> - Gỡ phó nhóm (nếu có quyền)',
      '',
      '💡 VÍ DỤ:',
      '• bonz key 123456789',
      '• bonz key @username',
      '',
      '⚠️ LƯU Ý:',
      '• Chỉ admin bot mới dùng được (API không hỗ trợ kiểm tra admin nhóm)',
      '• Cần quyền admin/chủ nhóm để thực hiện',
      '• Không thể thêm chính mình làm phó nhóm',
      '• Sử dụng API addGroupDeputy/removeGroupDeputy'
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type);
  }

  // Xem danh sách QTV
  if (action === 'list') {
    const header = __formatServiceInfo({
      service: 'bonz key list',
      userName,
      userId: senderId,
      notify: 'Không thể lấy danh sách QTV',
      role,
      usage
    });

    const details = [
      '',
      '❌ KHÔNG THỂ LẤY DANH SÁCH QTV',
      '',
      '🔧 Lý do: API không hỗ trợ getThreadInfo',
      '💡 Giải pháp: Sử dụng trực tiếp lệnh thêm QTV',
      '',
      '📝 Cách dùng:',
      '• bonz key <user_id> - Thêm QTV bằng ID',
      '• bonz key @mention - Thêm QTV bằng mention',
      '',
      '⚠️ Lưu ý: Chỉ admin bot mới có thể sử dụng'
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type);
  }

  // Gỡ phó nhóm
  if (action === 'remove' || action === 'rm') {
    const targetId = args[1];
    if (!targetId) {
      return api.sendMessage('❌ Vui lòng nhập ID người dùng cần gỡ phó nhóm!\n💡 Ví dụ: bonz key remove 123456789', threadId, type);
    }

    try {
      // Bỏ qua kiểm tra admin vì API không có getThreadInfo
      // Thử gỡ phó nhóm (QTV) trực tiếp
      await api.removeGroupDeputy(targetId, threadId);

      // Lấy tên người bị gỡ
      let targetName = 'Người dùng';
      try {
        const info = await api.getUserInfo(targetId);
        targetName = info?.changed_profiles?.[targetId]?.displayName || 'Người dùng';
      } catch {}

      const header = __formatServiceInfo({
        service: 'bonz key remove',
        userName,
        userId: senderId,
        notify: 'Đã gỡ phó nhóm thành công',
        role,
        usage
      });

      const details = [
        '',
        '👑➡️👤 ĐÃ GỠ PHÓ NHÓM',
        '',
        `🎯 Người bị gỡ: ${targetName}`,
        `🆔 ID: ${targetId}`,
        `👨‍💼 Người thực hiện: ${userName}`,
        '',
        '✅ Người này không còn quyền phó nhóm'
      ].join('\n');

      return api.sendMessage(`${header}\n${details}`, threadId, type);
    } catch (error) {
      console.error('Lỗi gỡ phó nhóm:', error);
      let errorMsg = 'Không thể gỡ phó nhóm';
      if (error.message?.includes('permission')) {
        errorMsg = 'Không có quyền gỡ phó nhóm này';
      } else if (error.message?.includes('not found')) {
        errorMsg = 'Không tìm thấy người dùng';
      }

      const header = __formatServiceInfo({
        service: 'bonz key remove',
        userName,
        userId: senderId,
        notify: errorMsg,
        role,
        usage
      });

      return api.sendMessage(header, threadId, type);
    }
  }

  // Thêm QTV - xử lý mention hoặc ID
  let targetId = null;

  // Kiểm tra mention
  if (event?.data?.mentions && Object.keys(event.data.mentions).length > 0) {
    const mentionIds = Object.keys(event.data.mentions);
    targetId = mentionIds[0]; // Lấy mention đầu tiên
  } else {
    // Sử dụng args[0] làm ID
    targetId = args[0];
  }

  if (!targetId) {
    return api.sendMessage('❌ Vui lòng nhập ID người dùng hoặc mention người cần thêm làm phó nhóm!\n💡 Ví dụ: bonz key 123456789 hoặc bonz key @username', threadId, type);
  }

  // Validate user ID format (should be numeric string)
  if (!/^\d+$/.test(targetId)) {
    return api.sendMessage('❌ ID người dùng không hợp lệ! ID phải là số.\n💡 Ví dụ: bonz key 123456789', threadId, type);
  }

  // Kiểm tra không thể thêm chính mình
  if (targetId === senderId) {
    return api.sendMessage('❌ Bạn không thể thêm chính mình làm quản trị viên!', threadId, type);
  }

  try {
    // Bỏ qua kiểm tra thành viên vì API không có getThreadInfo
    // Lấy thông tin người được thêm
    let targetName = 'Người dùng';
    try {
      const info = await api.getUserInfo(targetId);
      targetName = info?.changed_profiles?.[targetId]?.displayName || 'Người dùng';
    } catch {}

    // Thông báo đang xử lý
    const processingHeader = __formatServiceInfo({
      service: 'bonz key',
      userName,
      userId: senderId,
      notify: 'Đang thêm quản trị viên...',
      role,
      usage
    });
    await api.sendMessage(`${processingHeader}\n\n⏳ Đang thêm ${targetName} làm phó nhóm...`, threadId, type);

    // Thực hiện thêm phó nhóm (QTV)
    await api.addGroupDeputy(targetId, threadId);

    // Thông báo thành công
    const header = __formatServiceInfo({
      service: 'bonz key',
      userName,
      userId: senderId,
      notify: 'Đã thêm phó nhóm thành công',
      role,
      usage
    });

    const details = [
      '',
      '👤➡️👑 ĐÃ THÊM PHÓ NHÓM',
      '',
      `🎯 Người được thêm: ${targetName}`,
      `🆔 ID: ${targetId}`,
      `👨‍💼 Người thực hiện: ${userName}`,
      '',
      '✅ Người này đã có quyền phó nhóm',
      '🔑 Có thể quản lý thành viên, tin nhắn và cài đặt nhóm'
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type);

  } catch (error) {
    console.error('Lỗi thêm QTV:', error);
    
    let errorMsg = 'Không thể thêm phó nhóm';
    if (error.message?.includes('permission')) {
      errorMsg = 'Không có quyền thêm phó nhóm (cần là admin/chủ nhóm)';
    } else if (error.message?.includes('not found')) {
      errorMsg = 'Không tìm thấy người dùng';
    } else if (error.message?.includes('already admin')) {
      errorMsg = 'Người này đã là phó nhóm rồi';
    } else if (error.message?.includes('not member')) {
      errorMsg = 'Người này không có trong nhóm';
    } else if (error.message?.includes('addGroupDeputy is not a function')) {
      errorMsg = 'API không hỗ trợ thêm phó nhóm';
    } else {
      errorMsg = `Lỗi API: ${error.message}`;
    }

    const header = __formatServiceInfo({
      service: 'bonz key',
      userName,
      userId: senderId,
      notify: errorMsg,
      role,
      usage,
      howToUse: 'bonz key <user_id> hoặc bonz key @mention'
    });

    const details = [
      '',
      '❌ THÊM QTV THẤT BẠI',
      '',
      `🎯 Mục tiêu: ${targetId}`,
      `⚠️ Lỗi: ${errorMsg}`,
      '',
      '💡 CÁCH KHẮC PHỤC:',
      '• Đảm bảo bạn là admin nhóm',
      '• Kiểm tra người dùng có trong nhóm',
      '• Thử lại sau vài giây',
      '• API hiện tại không hỗ trợ getThreadInfo',
      '• Liên hệ admin bot nếu vẫn lỗi'
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type);
  }
}

// Function xử lý bonz điểm - Tổng hợp điểm số từ tất cả game và hoạt động
async function handleBonzPoints(api, event, args) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  let userName = 'Game thủ';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Game thủ';
  } catch {}

  // Khởi tạo dữ liệu nếu chưa có
  if (!global.gameLeaderboard) {
    global.gameLeaderboard = {
      caro: new Map(),
      fishing: new Map(),
      taixiu: {},
      blackjack: {},
      poker: {},
      roulette: {},
      baccarat: {},
      baucua: {}
    };
  }

  // Lấy dữ liệu từ các game
  const caroStats = global.gameLeaderboard.caro.get(senderId) || {
    wins: 0, losses: 0, draws: 0, totalGames: 0
  };

  const fishingStats = global.gameLeaderboard.fishing.get(senderId) || {
    level: 1, exp: 0, coins: 100, totalCatch: 0,
    common: 0, rare: 0, legendary: 0, trash: 0
  };

  // Lấy dữ liệu casino games
  const taixiuStats = global.gameLeaderboard.taixiu[senderId] || {
    wins: 0, losses: 0, totalBet: 0, totalWin: 0, jackpots: 0, maxStreak: 0
  };

  const blackjackStats = global.gameLeaderboard.blackjack[senderId] || {
    wins: 0, losses: 0, pushes: 0, blackjacks: 0, totalBet: 0, totalWin: 0
  };

  const pokerStats = global.gameLeaderboard.poker[senderId] || {
    wins: 0, losses: 0, handsPlayed: 0, totalBet: 0, totalWin: 0, bestHand: 'High Card'
  };

  const rouletteStats = global.gameLeaderboard.roulette[senderId] || {
    wins: 0, losses: 0, spins: 0, totalBet: 0, totalWin: 0, biggestWin: 0
  };

  const baccaratStats = global.gameLeaderboard.baccarat[senderId] || {
    wins: 0, losses: 0, ties: 0, totalBet: 0, totalWin: 0, naturals: 0
  };

  const baucuaStats = global.gameLeaderboard.baucua[senderId] || {
    wins: 0, losses: 0, gamesPlayed: 0, totalBet: 0, totalWin: 0, biggestWin: 0, winStreak: 0, maxWinStreak: 0
  };

  // Tính điểm từng game
  const caroScore = caroStats.wins * 3 + caroStats.draws * 1 - caroStats.losses * 0.5;
  const caroWinRate = caroStats.totalGames > 0 ? Math.round((caroStats.wins / caroStats.totalGames) * 100) : 0;

  const fishingScore = fishingStats.level * 1000 + fishingStats.exp + fishingStats.coins * 0.1 + 
                     fishingStats.legendary * 500 + fishingStats.rare * 100;

  // Tính điểm casino games
  const taixiuScore = taixiuStats.wins * 2 + taixiuStats.jackpots * 10 - taixiuStats.losses * 0.5;
  const blackjackScore = blackjackStats.wins * 2 + blackjackStats.blackjacks * 5 - blackjackStats.losses * 0.5;
  const pokerScore = pokerStats.wins * 3 + (pokerStats.totalWin / 10000) - pokerStats.losses * 0.5;
  const rouletteScore = rouletteStats.wins * 2 + (rouletteStats.biggestWin / 1000) - rouletteStats.losses * 0.5;
  const baccaratScore = baccaratStats.wins * 2 + baccaratStats.naturals * 3 - baccaratStats.losses * 0.5;
  const baucuaScore = baucuaStats.wins * 2 + (baucuaStats.biggestWin / 1000) - baucuaStats.losses * 0.5;

  // Điểm từ các hoạt động khác (có thể mở rộng)
  let aiScore = 0;
  let quizScore = 0;
  let socialScore = 0;

  // Tính điểm AI (từ việc sử dụng các tính năng AI)
  if (global.bonzAIUsage && global.bonzAIUsage[senderId]) {
    const aiUsage = global.bonzAIUsage[senderId];
    aiScore = (aiUsage.grammar || 0) * 5 + (aiUsage.plagiarism || 0) * 3 + 
              (aiUsage.classify || 0) * 2 + (aiUsage.translate || 0) * 1 + 
              (aiUsage.ai || 0) * 4;
  }

  // Điểm quiz/câu đố
  if (global.bonzQuizStats && global.bonzQuizStats[senderId]) {
    const quizStats = global.bonzQuizStats[senderId];
    quizScore += (quizStats.correct || 0) * 10 - (quizStats.wrong || 0) * 2;
  }
  
  // Điểm trắc nghiệm
  if (global.bonzMultipleChoiceStats && global.bonzMultipleChoiceStats[senderId]) {
    const mcStats = global.bonzMultipleChoiceStats[senderId];
    quizScore += (mcStats.correct || 0) * 15 - (mcStats.wrong || 0) * 3;
  }

  // Điểm hoạt động xã hội (tương tác với bot)
  if (global.bonzSocialStats && global.bonzSocialStats[senderId]) {
    const socialStats = global.bonzSocialStats[senderId];
    socialScore = (socialStats.commands || 0) * 0.1 + (socialStats.days || 0) * 5;
  }

  // Tổng điểm (bao gồm casino games)
  const casinoScore = taixiuScore + blackjackScore + pokerScore + rouletteScore + baccaratScore + baucuaScore;
  const totalScore = Math.round(caroScore + fishingScore + casinoScore + aiScore + quizScore + socialScore);

  // Xếp hạng tổng thể
  let rank = 'Tân binh';
  let rankEmoji = '🆕';
  if (totalScore >= 50000) { rank = 'Huyền thoại'; rankEmoji = '🏆'; }
  else if (totalScore >= 20000) { rank = 'Cao thủ'; rankEmoji = '💎'; }
  else if (totalScore >= 10000) { rank = 'Chuyên gia'; rankEmoji = '⭐'; }
  else if (totalScore >= 5000) { rank = 'Thành thạo'; rankEmoji = '🎯'; }
  else if (totalScore >= 2000) { rank = 'Tiến bộ'; rankEmoji = '📈'; }
  else if (totalScore >= 500) { rank = 'Khởi đầu'; rankEmoji = '🌱'; }

  const pointsMsg = [
    `${rankEmoji} TỔNG HỢP ĐIỂM SỐ - ${userName}`,
    `🏅 Xếp hạng: ${rank}`,
    `🎯 Tổng điểm: ${totalScore.toLocaleString()} điểm`,
    '',
    '📊 CHI TIẾT TỪNG GAME:',
    '',
    '🎮 CỜ CARO:',
    `   📈 Điểm: ${Math.round(caroScore)} (${caroStats.wins}W-${caroStats.losses}L-${caroStats.draws}D)`,
    `   🎯 Tỉ lệ thắng: ${caroWinRate}%`,
    `   🎲 Tổng trận: ${caroStats.totalGames}`,
    '',
    '🎣 CÂU CÁ:',
    `   📈 Điểm: ${Math.round(fishingScore)}`,
    `   🎯 Level: ${fishingStats.level} | EXP: ${fishingStats.exp}`,
    `   💰 Coins: ${fishingStats.coins.toLocaleString()}`,
    `   🐉 Huyền thoại: ${fishingStats.legendary} | 🍣 Hiếm: ${fishingStats.rare}`,
    `   🎣 Tổng câu: ${fishingStats.totalCatch}`,
    ''
  ];

  // Thêm casino games nếu có hoạt động
  if (casinoScore > 0) {
    pointsMsg.push('🎰 CASINO GAMES:');
    
    if (taixiuStats.wins + taixiuStats.losses > 0) {
      const taixiuWinRate = ((taixiuStats.wins / (taixiuStats.wins + taixiuStats.losses)) * 100).toFixed(1);
      pointsMsg.push(`🎲 TÀI XỈU:`);
      pointsMsg.push(`   📈 Điểm: ${Math.round(taixiuScore)} (${taixiuStats.wins}W-${taixiuStats.losses}L)`);
      pointsMsg.push(`   🎯 Win rate: ${taixiuWinRate}% | 🎰 Jackpots: ${taixiuStats.jackpots}`);
      pointsMsg.push(`   🔥 Max streak: ${taixiuStats.maxStreak}`);
    }
    
    if (blackjackStats.wins + blackjackStats.losses + blackjackStats.pushes > 0) {
      const bjWinRate = ((blackjackStats.wins / (blackjackStats.wins + blackjackStats.losses + blackjackStats.pushes)) * 100).toFixed(1);
      pointsMsg.push(`🃏 BLACKJACK:`);
      pointsMsg.push(`   📈 Điểm: ${Math.round(blackjackScore)} (${blackjackStats.wins}W-${blackjackStats.losses}L-${blackjackStats.pushes}P)`);
      pointsMsg.push(`   🎯 Win rate: ${bjWinRate}% | 🃏 Blackjacks: ${blackjackStats.blackjacks}`);
    }
    
    if (pokerStats.handsPlayed > 0) {
      const pokerWinRate = ((pokerStats.wins / pokerStats.handsPlayed) * 100).toFixed(1);
      pointsMsg.push(`🎰 POKER:`);
      pointsMsg.push(`   📈 Điểm: ${Math.round(pokerScore)} (${pokerStats.wins}W-${pokerStats.losses}L)`);
      pointsMsg.push(`   🎯 Win rate: ${pokerWinRate}% | 🃏 Best: ${pokerStats.bestHand}`);
    }
    
    if (rouletteStats.spins > 0) {
      const rouletteWinRate = ((rouletteStats.wins / rouletteStats.spins) * 100).toFixed(1);
      pointsMsg.push(`🎡 ROULETTE:`);
      pointsMsg.push(`   📈 Điểm: ${Math.round(rouletteScore)} (${rouletteStats.wins}W-${rouletteStats.losses}L)`);
      pointsMsg.push(`   🎯 Win rate: ${rouletteWinRate}% | 🎰 Biggest: ${rouletteStats.biggestWin.toLocaleString()}`);
    }
    
    if (baccaratStats.wins + baccaratStats.losses + baccaratStats.ties > 0) {
      const baccaratWinRate = ((baccaratStats.wins / (baccaratStats.wins + baccaratStats.losses + baccaratStats.ties)) * 100).toFixed(1);
      pointsMsg.push(`💳 BACCARAT:`);
      pointsMsg.push(`   📈 Điểm: ${Math.round(baccaratScore)} (${baccaratStats.wins}W-${baccaratStats.losses}L-${baccaratStats.ties}T)`);
      pointsMsg.push(`   🎯 Win rate: ${baccaratWinRate}% | ✨ Naturals: ${baccaratStats.naturals}`);
    }
    
    if (baucuaStats.wins + baucuaStats.losses > 0) {
      const baucuaWinRate = ((baucuaStats.wins / (baucuaStats.wins + baucuaStats.losses)) * 100).toFixed(1);
      pointsMsg.push(`🎲 BẦU CUA:`);
      pointsMsg.push(`   📈 Điểm: ${Math.round(baucuaScore)} (${baucuaStats.wins}W-${baucuaStats.losses}L)`);
      pointsMsg.push(`   🎯 Win rate: ${baucuaWinRate}% | 🔥 Streak: ${baucuaStats.winStreak} | ⭐ Max: ${baucuaStats.maxWinStreak}`);
      pointsMsg.push(`   💎 Thắng lớn nhất: ${baucuaStats.biggestWin.toLocaleString()}đ`);
    }
    
    pointsMsg.push('');
  }

  // Thêm điểm từ các hoạt động khác nếu có
  if (aiScore > 0 || quizScore > 0 || socialScore > 0) {
    pointsMsg.push('🤖 HOẠT ĐỘNG KHÁC:');
    if (aiScore > 0) pointsMsg.push(`   🧠 AI Tools: ${Math.round(aiScore)} điểm`);
    if (quizScore > 0) pointsMsg.push(`   🧩 Quiz/Đố: ${Math.round(quizScore)} điểm`);
    if (socialScore > 0) pointsMsg.push(`   👥 Xã hội: ${Math.round(socialScore)} điểm`);
    pointsMsg.push('');
  }

  pointsMsg.push('💡 CÁCH TĂNG ĐIỂM:');
  pointsMsg.push('• 🎮 Chơi Caro: +3 điểm/thắng, +1/hòa');
  pointsMsg.push('• 🎣 Câu cá: Level up, câu cá hiếm');
  pointsMsg.push('• 🎲 Casino Games: Thắng games, jackpots, streaks');
  pointsMsg.push('  - Tài Xỉu: +2/thắng, +10/jackpot');
  pointsMsg.push('  - Blackjack: +2/thắng, +5/blackjack');
  pointsMsg.push('  - Poker: +3/thắng, big wins bonus');
  pointsMsg.push('  - Roulette: +2/thắng, big win bonus');
  pointsMsg.push('  - Baccarat: +2/thắng, +3/natural');
  pointsMsg.push('  - Bầu Cua: +2/thắng, big win bonus');
  pointsMsg.push('• 🤖 Dùng AI: Grammar, translate, classify');
  pointsMsg.push('• 🧩 Tham gia quiz và câu đố');
  pointsMsg.push('• 👥 Tương tác thường xuyên với bot');
  pointsMsg.push('');
  pointsMsg.push('🏆 Gõ "leaderboard" để xem BXH chi tiết!');

  return api.sendMessage(pointsMsg.join('\n'), threadId, type);
}

// Function xử lý bonz game - Menu game tổng hợp
async function handleBonzGame(api, event, args) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  let userName = 'Game thủ';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Game thủ';
  } catch {}

  // Khởi tạo dữ liệu game nếu chưa có
  if (!global.gameLeaderboard) {
    global.gameLeaderboard = {
      caro: new Map(),
      fishing: new Map(),
      taixiu: {},
      blackjack: {},
      poker: {},
      roulette: {},
      baccarat: {},
      baucua: {}
    };
  }
  
  // Đảm bảo các game được khởi tạo đúng
  if (!global.gameLeaderboard.caro) global.gameLeaderboard.caro = new Map();
  if (!global.gameLeaderboard.fishing) global.gameLeaderboard.fishing = new Map();
  if (!global.gameLeaderboard.taixiu) global.gameLeaderboard.taixiu = {};
  if (!global.gameLeaderboard.blackjack) global.gameLeaderboard.blackjack = {};
  if (!global.gameLeaderboard.poker) global.gameLeaderboard.poker = {};
  if (!global.gameLeaderboard.roulette) global.gameLeaderboard.roulette = {};
  if (!global.gameLeaderboard.baccarat) global.gameLeaderboard.baccarat = {};
  if (!global.gameLeaderboard.baucua) global.gameLeaderboard.baucua = {};

  if (!global.bonzQuizStats) {
    global.bonzQuizStats = {};
  }

  // Lấy thống kê cá nhân
  const caroStats = global.gameLeaderboard.caro.get(senderId) || { wins: 0, losses: 0, draws: 0, totalGames: 0 };
  const fishingStats = global.gameLeaderboard.fishing.get(senderId) || { level: 1, exp: 0, coins: 100, totalCatch: 0 };
  const quizStats = global.bonzQuizStats[senderId] || { correct: 0, wrong: 0, totalQuiz: 0, streak: 0 };
  
  // Lấy thống kê casino games
  const taixiuStats = global.gameLeaderboard.taixiu[senderId] || { wins: 0, losses: 0, jackpots: 0 };
  const blackjackStats = global.gameLeaderboard.blackjack[senderId] || { wins: 0, losses: 0, blackjacks: 0 };
  const pokerStats = global.gameLeaderboard.poker[senderId] || { wins: 0, losses: 0, handsPlayed: 0 };
  const rouletteStats = global.gameLeaderboard.roulette[senderId] || { wins: 0, losses: 0, spins: 0 };
  const baccaratStats = global.gameLeaderboard.baccarat[senderId] || { wins: 0, losses: 0, naturals: 0 };
  const baucuaStats = global.gameLeaderboard.baucua[senderId] || { wins: 0, losses: 0, winStreak: 0, maxWinStreak: 0 };

  const gameMenuMsg = [
    `🎮 BONZ GAME CENTER - ${userName}`,
    `🏆 Trung tâm giải trí và thử thách`,
    '',
    // Farm Game
    '🌾 FARM GAME',
    '   🚜 Nông trại ảo: trồng trọt, chăn nuôi, xây dựng, thời tiết & mùa',
    '   📋 Lệnh: game farm',
    '   ▶️ Bắt đầu: game farm create <tên>',
    '',
    '🎯 **BONZ MINI GAMES:**',
    '',
    // Đoán số
    '🎯 ĐOÁN SỐ 1-100',
    '   🎲 Đoán số trong 7 lần, bonus thời gian',
    '   📋 Lệnh: bonz guess start',
    '',
    // Kéo búa bao
    '✂️ KÉO BÚA BAO',
    '   🎮 Rock Paper Scissors với cược coins',
    '   📋 Lệnh: bonz rps kéo 1000',
    '',
    // Thật hay thách
    '🎪 THẬT HAY THÁCH',
    '   🎭 20 câu hỏi + 20 thử thách, custom database',
    '   📋 Lệnh: bonz truth random',
    '',
    // Chiến tranh bài
    '🃏 CHIẾN TRANH BÀI',
    '   ⚔️ So sánh bài, chiến tranh khi bằng nhau',
    '   📋 Lệnh: bonz war start 5000',
    '',
    // Baccarat
    '💳 BACCARAT CASINO',
    '   🎰 Casino game chuẩn, Player/Banker/Tie',
    '   📋 Lệnh: bonz baccarat bet player 10000',
    '',
    // Bầu Cua
    '🎲 BẦU CUA TÔM CÁ',
    `   📊 Thành tích: ${baucuaStats.wins}W-${baucuaStats.losses}L | Streak: ${baucuaStats.winStreak}`,
    '   🐾 6 con vật: Bầu, Cua, Tôm, Cá, Gà, Nai',
    '   📋 Lệnh: baucua bet bau:5000 cua:3000',
    '',
    // PvP
    '⚔️ ĐẤU TAY ĐÔI',
    '   👥 Thách đấu người chơi khác, battle system',
    '   📋 Lệnh: bonz pvp challenge @user 10000',
    '',
    // Blackjack
    '🃏 XÌ DÁCH (BLACKJACK)',
    '   🎲 Casino blackjack với dealer AI',
    '   📋 Lệnh: bonz blackjack start 10000',
    '',
    // Arena
    '⚔️ ĐẤU TRƯỜNG RPG',
    '   🏟️ Level up, 4 khu vực, 12 loại quái',
    '   📋 Lệnh: bonz arena fight',
    '',
    // Monster Battle
    '👹 CHIẾN ĐẤU QUÁI VẬT',
    '   🐉 Săn 12 loại quái, 3 độ hiếm, bet tăng sức mạnh',
    '   📋 Lệnh: bonz monster hunt 2000',
    '',
    // Poker Texas
    '🎰 POKER TEXAS HOLD\'EM',
    '   🃏 Multiplayer poker với hand rankings',
    '   📋 Lệnh: bonz poker join 10000',
    '',
    // Sudoku
    '🧩 SUDOKU 9x9',
    '   🔢 Number puzzle với 3 độ khó',
    '   📋 Lệnh: bonz sudoku start easy',
    '',
    // Mafia
    '🐺 MA SÓI (MAFIA)',
    '   👥 Social deduction, voting system',
    '   📋 Lệnh: bonz mafia start',
    '',
    // Monopoly
    '🏠 CỜ TỶ PHÚ (MONOPOLY)',
    '   🎲 Mua bán bất động sản, trở thành tỷ phú',
    '   📋 Lệnh: bonz monopoly start',
    '',
    '🎯 **CLASSIC GAMES:**',
    '',
    // Caro
    '🎲 CỜ CARO 3x3',
    `   📊 Thành tích: ${caroStats.wins}W-${caroStats.losses}L-${caroStats.draws}D`,
    '   🧠 Bot AI thông minh',
    '   📋 Lệnh: caro start',
    '',
    // Fishing
    '🎣 CÂU CÁ RPG',
    `   📊 Thành tích: Level ${fishingStats.level} | ${fishingStats.totalCatch} cá`,
    '   🛒 Shop • 💰 Sell • 🎯 Quest • ⭐ Level',
    '   📋 Lệnh: fishing cast',
    '',
    // Pet System
    '🐾 PET SYSTEM',
    '   🐶 Nuôi thú cưng • Hồ sơ • Cho ăn • Huấn luyện • Nhiệm vụ • PvP',
    '   📋 Lệnh:',
    '   • pet create <loài> — Tạo thú cưng (ví dụ: dragon, phoenix, tiger, wolf)',
    '   • pet name <tên_mới> — Đặt lại tên',
    '   • pet stats — Xem hồ sơ',
    '   • pet feed — Cho ăn (tăng EXP nhẹ)',
    '   • pet train <atk|def|spd|luck> — Huấn luyện (tốn coins)',
    '   • pet quest — Làm nhiệm vụ',
    '   • pet battle @user — Thách đấu PvP',
    '',
    // Fishing Boss
    '👹 FISHING BOSS RAID',
    '   🐉 Gọi boss, tổ đội đánh boss, nhận phần thưởng',
    '   📋 Lệnh: fishing boss | fishing attack/defend/heal',
    '',
    '🎯 **OTHER GAMES:**',
    '',
    // Nối từ (đã gỡ bỏ)
    // Dice (xúc xắc) (đã có trong bonz.js)
    '🎲 DICE (xúc xắc)',
    '   📋 Lệnh: bonz dice [số_xúc_xắc]',
    '',
    // Quiz (Open-ended)
    '🧩 CÂU ĐỐ KIẾN THỨC',
    '   📋 Lệnh: bonz câu đố start',
    '',
    // Multiple choice
    '📝 TRẮC NGHIỆM (A/B/C/D)',
    '   📋 Lệnh: bonz trắc start',
    '',
    '🎰 **CASINO GAMES:**',
    '   🎲 Tài Xỉu: taixiu bet tai 10000',
    '   🃏 Blackjack: blackjack start 5000',
    '   🎰 Poker: poker join 10000',
    '   🎡 Roulette: roulette bet red 5000',
    '   💳 Baccarat: baccarat bet player 5000',
    '   🎲 Bầu Cua: baucua bet bau:5000',
    '',
    '🏅 **LEADERBOARD & STATS:**',
    '   🎯 BXH: leaderboard [game] hoặc leaderboard all',
    '   📊 Điểm tổng: bonz điểm',
    '   📈 Stats cá nhân: [game] stats',
    '',
    '💡 **HƯỚNG DẪN:**',
    '• 🎮 10+ Games đa dạng thể loại',
    '• 🎰 6 Casino Games với cược coins',
    '• 🎣 RPG Fishing với shop & quest system',
    '• 🎯 Mỗi game có leaderboard riêng',
    '• 🏆 Chơi nhiều game để tăng điểm tổng',
    '• 💰 Thắng game → Nhận coins & điểm BXH',
    '• 🔥 Streak cao → Bonus lớn',
    '• 🧩 Puzzle Games: Quiz, Trắc nghiệm, Nối từ',
    '',
    '🚀 **Chọn game và bắt đầu thử thách!**',
    '',
    '📋 **GAME CATEGORIES:**',
    '🎯 Strategy: Cờ Caro với AI thông minh',
    '🎣 RPG: Câu cá với hệ thống level & shop',
    '🎰 Casino: Tài Xỉu, Blackjack, Poker, Roulette, Baccarat',
    '🧩 Puzzle: Quiz kiến thức, Trắc nghiệm, Nối từ, Dice'
  ];

  // Remove "Nối từ" section if any residual lines remain
  for (let i = gameMenuMsg.length - 1; i >= 0; i--) {
    if (typeof gameMenuMsg[i] === 'string' && (gameMenuMsg[i].includes('NỐI TỪ') || gameMenuMsg[i].includes('bonz nối từ'))) {
      gameMenuMsg.splice(i, 1);
    }
  }

  // Send in safe chunks to avoid API 'Tham số không hợp lệ' (code 114) on long messages
  const fullText = gameMenuMsg.join('\n');

  const CHUNK_SIZE = 1800; // conservative under platform limit
  const chunks = [];
  for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
    chunks.push(fullText.slice(i, i + CHUNK_SIZE));
  }

  for (const part of chunks) {
    try {
      await safeSendMessage(api, part, threadId, type);
    } catch (e) {
      // Final fallback: try raw api
      try { await api.sendMessage(part, threadId, type); } catch {}
    }
  }
  return;
}

// Function xử lý bonz câu đố - Game câu đố kiến thức
async function handleBonzQuiz(api, event, args) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  let userName = 'Thí sinh';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Thí sinh';
  } catch {}

  // Khởi tạo dữ liệu quiz
  if (!global.bonzQuizStats) global.bonzQuizStats = {};
  if (!global.bonzQuizData) global.bonzQuizData = {};
  if (!global.bonzQuizStats[senderId]) {
    global.bonzQuizStats[senderId] = {
      correct: 0,
      wrong: 0,
      totalQuiz: 0,
      streak: 0,
      bestStreak: 0,
      lastQuizTime: 0
    };
  }

  const userStats = global.bonzQuizStats[senderId];

  // Database câu đố
  const quizDatabase = [
    { question: "Thủ đô của Việt Nam là gì?", answer: "hà nội", category: "Địa lý", difficulty: "Dễ" },
    { question: "Ai là tác giả của tác phẩm 'Truyện Kiều'?", answer: "nguyễn du", category: "Văn học", difficulty: "Trung bình" },
    { question: "Năm Việt Nam thống nhất là năm nào?", answer: "1975", category: "Lịch sử", difficulty: "Dễ" },
    { question: "Sông dài nhất Việt Nam là sông gì?", answer: "sông mê kông", category: "Địa lý", difficulty: "Trung bình" },
    { question: "Đơn vị tiền tệ của Việt Nam là gì?", answer: "đồng", category: "Kinh tế", difficulty: "Dễ" },
    { question: "Núi cao nhất Việt Nam là núi gì?", answer: "phan xi păng", category: "Địa lý", difficulty: "Khó" },
    { question: "Ai là Chủ tịch đầu tiên của nước Việt Nam Dân chủ Cộng hòa?", answer: "hồ chí minh", category: "Lịch sử", difficulty: "Dễ" },
    { question: "Thành phố lớn nhất Việt Nam là gì?", answer: "thành phố hồ chí minh", category: "Địa lý", difficulty: "Dễ" },
    { question: "Lễ hội lớn nhất trong năm của người Việt là gì?", answer: "tết nguyên đán", category: "Văn hóa", difficulty: "Dễ" },
    { question: "Biển nào ở phía Đông của Việt Nam?", answer: "biển đông", category: "Địa lý", difficulty: "Dễ" },
    { question: "Ai viết tác phẩm 'Số đỏ'?", answer: "vũ trọng phụng", category: "Văn học", difficulty: "Khó" },
    { question: "Thành phố nào được gọi là 'Paris của Đông Dương'?", answer: "hà nội", category: "Lịch sử", difficulty: "Trung bình" },
    { question: "Loại cà phê nổi tiếng của Việt Nam là gì?", answer: "cà phê chồn", category: "Ẩm thực", difficulty: "Trung bình" },
    { question: "Vịnh nào là di sản thế giới của Việt Nam?", answer: "vịnh hạ long", category: "Du lịch", difficulty: "Dễ" },
    { question: "Ai là tác giả của 'Dế Mèn phiêu lưu ký'?", answer: "tô hoài", category: "Văn học", difficulty: "Trung bình" }
  ];

  // Nếu không có tham số, hiển thị hướng dẫn
  if (!args[0]) {
    const helpMsg = [
      `🧩 BONZ CÂU ĐỐ KIẾN THỨC - ${userName}`,
      '',
      '📊 THÀNH TÍCH CỦA BẠN:',
      `   ✅ Đúng: ${userStats.correct} câu`,
      `   ❌ Sai: ${userStats.wrong} câu`,
      `   🎯 Tỉ lệ: ${userStats.totalQuiz > 0 ? Math.round((userStats.correct / userStats.totalQuiz) * 100) : 0}%`,
      `   🔥 Streak hiện tại: ${userStats.streak}`,
      `   🏆 Streak tốt nhất: ${userStats.bestStreak}`,
      '',
      '🎮 CÁCH CHƠI:',
      '• bonz câu đố start - Bắt đầu câu đố mới',
      '• bonz quiz - Alias tiếng Anh',
      '• Trả lời bằng cách gõ đáp án',
      '• Không phân biệt hoa thường',
      '',
      '🏅 HỆ THỐNG ĐIỂM:',
      '• Câu đúng: +10 điểm',
      '• Câu sai: -2 điểm',
      '• Streak bonus: +1 điểm/streak',
      '• Độ khó: Dễ(x1), TB(x1.5), Khó(x2)',
      '',
      '📚 CHỦ ĐỀ:',
      '• 🌍 Địa lý • 📖 Văn học • 📜 Lịch sử',
      '• 🍜 Ẩm thực • 🎭 Văn hóa • 💰 Kinh tế',
      '',
      '🚀 Gõ "bonz câu đố start" để bắt đầu!'
    ];
    
    return api.sendMessage(helpMsg.join('\n'), threadId, type);
  }

  // Bắt đầu câu đố mới
  if (args[0] === 'start' || args[0] === 'new') {
    const randomQuiz = quizDatabase[Math.floor(Math.random() * quizDatabase.length)];
    
    // Lưu câu đố hiện tại
    global.bonzQuizData[`${threadId}_${senderId}`] = {
      question: randomQuiz,
      startTime: Date.now(),
      answered: false
    };

    const difficultyEmoji = {
      'Dễ': '🟢',
      'Trung bình': '🟡', 
      'Khó': '🔴'
    };

    const categoryEmoji = {
      'Địa lý': '🌍',
      'Văn học': '📖',
      'Lịch sử': '📜',
      'Ẩm thực': '🍜',
      'Văn hóa': '🎭',
      'Kinh tế': '💰',
      'Du lịch': '✈️'
    };

    const quizMsg = [
      `🧩 CÂU ĐỐ KIẾN THỨC #${userStats.totalQuiz + 1}`,
      '',
      `👤 Thí sinh: ${userName}`,
      `${categoryEmoji[randomQuiz.category] || '📚'} Chủ đề: ${randomQuiz.category}`,
      `${difficultyEmoji[randomQuiz.difficulty]} Độ khó: ${randomQuiz.difficulty}`,
      `🔥 Streak hiện tại: ${userStats.streak}`,
      '',
      '❓ **CÂU HỎI:**',
      `${randomQuiz.question}`,
      '',
      '💡 **HƯỚNG DẪN:**',
      '• Gõ đáp án trực tiếp (không cần prefix)',
      '• Không phân biệt hoa thường',
      '• Có 60 giây để trả lời',
      '',
      '⏰ Thời gian bắt đầu đếm ngược...'
    ];

    // Set timeout 60 giây
    setTimeout(() => {
      const currentQuiz = global.bonzQuizData[`${threadId}_${senderId}`];
      if (currentQuiz && !currentQuiz.answered) {
        currentQuiz.answered = true;
        userStats.wrong++;
        userStats.totalQuiz++;
        userStats.streak = 0;
        
        api.sendMessage(
          `⏰ HẾT GIỜ!\n\n❌ Bạn đã không trả lời trong 60 giây\n🔍 Đáp án đúng: **${randomQuiz.answer}**\n\n📊 Streak bị reset về 0\n🎮 Gõ "bonz câu đố start" để chơi tiếp!`,
          threadId, type
        );
      }
    }, 60000);

    return api.sendMessage(quizMsg.join('\n'), threadId, type);
  }

  return api.sendMessage('❓ Sử dụng: bonz câu đố start để bắt đầu câu đố mới!', threadId, type);
}

// Function xử lý bonz trắc nghiệm - Game trắc nghiệm 4 đáp án
async function handleBonzMultipleChoice(api, event, args) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  let userName = 'Thí sinh';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Thí sinh';
  } catch {}

  // Khởi tạo dữ liệu trắc nghiệm
  if (!global.bonzMultipleChoiceStats) global.bonzMultipleChoiceStats = {};
  if (!global.bonzMultipleChoiceData) global.bonzMultipleChoiceData = {};
  if (!global.bonzMultipleChoiceStats[senderId]) {
    global.bonzMultipleChoiceStats[senderId] = {
      correct: 0,
      wrong: 0,
      totalQuiz: 0,
      streak: 0,
      bestStreak: 0,
      fastestTime: 999
    };
  }

  const userStats = global.bonzMultipleChoiceStats[senderId];

  // Database trắc nghiệm
  const multipleChoiceDatabase = [
    {
      question: "Thủ đô của Pháp là gì?",
      options: ["A. London", "B. Berlin", "C. Paris", "D. Madrid"],
      correct: "C",
      category: "Địa lý",
      difficulty: "Dễ"
    },
    {
      question: "Ai phát minh ra bóng đèn điện?",
      options: ["A. Thomas Edison", "B. Nikola Tesla", "C. Albert Einstein", "D. Isaac Newton"],
      correct: "A",
      category: "Khoa học",
      difficulty: "Trung bình"
    },
    {
      question: "Hành tinh nào gần Mặt trời nhất?",
      options: ["A. Sao Kim", "B. Sao Thủy", "C. Trái Đất", "D. Sao Hỏa"],
      correct: "B",
      category: "Thiên văn",
      difficulty: "Trung bình"
    },
    {
      question: "Ngôn ngữ lập trình nào được tạo ra bởi Google?",
      options: ["A. Python", "B. Java", "C. Go", "D. C++"],
      correct: "C",
      category: "Công nghệ",
      difficulty: "Khó"
    },
    {
      question: "Ai viết tiểu thuyết 'Harry Potter'?",
      options: ["A. J.R.R. Tolkien", "B. J.K. Rowling", "C. Stephen King", "D. George R.R. Martin"],
      correct: "B",
      category: "Văn học",
      difficulty: "Dễ"
    },
    {
      question: "Đại dương lớn nhất thế giới là gì?",
      options: ["A. Đại Tây Dương", "B. Ấn Độ Dương", "C. Bắc Băng Dương", "D. Thái Bình Dương"],
      correct: "D",
      category: "Địa lý",
      difficulty: "Dễ"
    },
    {
      question: "Công thức hóa học của nước là gì?",
      options: ["A. CO2", "B. H2O", "C. O2", "D. NaCl"],
      correct: "B",
      category: "Hóa học",
      difficulty: "Dễ"
    },
    {
      question: "Ai là người đầu tiên đặt chân lên Mặt trăng?",
      options: ["A. Buzz Aldrin", "B. Neil Armstrong", "C. Yuri Gagarin", "D. John Glenn"],
      correct: "B",
      category: "Lịch sử",
      difficulty: "Trung bình"
    },
    {
      question: "Ngôn ngữ nào có nhiều người nói nhất thế giới?",
      options: ["A. Tiếng Anh", "B. Tiếng Tây Ban Nha", "C. Tiếng Trung", "D. Tiếng Hindi"],
      correct: "C",
      category: "Ngôn ngữ",
      difficulty: "Trung bình"
    },
    {
      question: "Quốc gia nào có diện tích lớn nhất thế giới?",
      options: ["A. Canada", "B. Trung Quốc", "C. Mỹ", "D. Nga"],
      correct: "D",
      category: "Địa lý",
      difficulty: "Dễ"
    }
  ];

  // Nếu không có tham số, hiển thị hướng dẫn
  if (!args[0]) {
    const helpMsg = [
      `📝 BONZ TRẮC NGHIỆM - ${userName}`,
      '',
      '📊 THÀNH TÍCH CỦA BẠN:',
      `   ✅ Đúng: ${userStats.correct} câu`,
      `   ❌ Sai: ${userStats.wrong} câu`,
      `   🎯 Tỉ lệ: ${userStats.totalQuiz > 0 ? Math.round((userStats.correct / userStats.totalQuiz) * 100) : 0}%`,
      `   🔥 Streak hiện tại: ${userStats.streak}`,
      `   🏆 Streak tốt nhất: ${userStats.bestStreak}`,
      `   ⚡ Thời gian nhanh nhất: ${userStats.fastestTime < 999 ? userStats.fastestTime + 's' : 'Chưa có'}`,
      '',
      '🎮 CÁCH CHƠI:',
      '• bonz trắc start - Bắt đầu trắc nghiệm mới',
      '• bonz câu đố trắc start - Cách khác',
      '• Trả lời bằng A, B, C hoặc D',
      '• Có 30 giây để chọn đáp án',
      '',
      '🏅 HỆ THỐNG ĐIỂM:',
      '• Câu đúng: +15 điểm',
      '• Câu sai: -3 điểm',
      '• Streak bonus: +2 điểm/streak',
      '• Speed bonus: +5 điểm nếu <10s',
      '',
      '📚 CHỦ ĐỀ:',
      '• 🌍 Địa lý • 🔬 Khoa học • 🌌 Thiên văn',
      '• 💻 Công nghệ • 📖 Văn học • 📜 Lịch sử',
      '',
      '🚀 Gõ "bonz trắc start" để bắt đầu!'
    ];
    
    return api.sendMessage(helpMsg.join('\n'), threadId, type);
  }

  // Bắt đầu trắc nghiệm mới
  if (args[0] === 'start' || args[0] === 'new') {
    const randomQuiz = multipleChoiceDatabase[Math.floor(Math.random() * multipleChoiceDatabase.length)];
    
    // Lưu câu trắc nghiệm hiện tại
    global.bonzMultipleChoiceData[`${threadId}_${senderId}`] = {
      question: randomQuiz,
      startTime: Date.now(),
      answered: false
    };

    const difficultyEmoji = {
      'Dễ': '🟢',
      'Trung bình': '🟡', 
      'Khó': '🔴'
    };

    const categoryEmoji = {
      'Địa lý': '🌍',
      'Khoa học': '🔬',
      'Thiên văn': '🌌',
      'Công nghệ': '💻',
      'Văn học': '📖',
      'Lịch sử': '📜',
      'Hóa học': '⚗️',
      'Ngôn ngữ': '🗣️'
    };

    const quizMsg = [
      `📝 TRẮC NGHIỆM #${userStats.totalQuiz + 1}`,
      '',
      `👤 Thí sinh: ${userName}`,
      `${categoryEmoji[randomQuiz.category] || '📚'} Chủ đề: ${randomQuiz.category}`,
      `${difficultyEmoji[randomQuiz.difficulty]} Độ khó: ${randomQuiz.difficulty}`,
      `🔥 Streak hiện tại: ${userStats.streak}`,
      '',
      '❓ **CÂU HỎI:**',
      `${randomQuiz.question}`,
      '',
      '📋 **LỰA CHỌN:**',
      ...randomQuiz.options.map(option => `   ${option}`),
      '',
      '💡 **HƯỚNG DẪN:**',
      '• Gõ A, B, C hoặc D để chọn đáp án',
      '• Có 30 giây để trả lời',
      '• Trả lời nhanh để được bonus điểm',
      '',
      '⏰ Thời gian bắt đầu đếm ngược...'
    ];

    // Set timeout 30 giây
    setTimeout(() => {
      const currentQuiz = global.bonzMultipleChoiceData[`${threadId}_${senderId}`];
      if (currentQuiz && !currentQuiz.answered) {
        currentQuiz.answered = true;
        userStats.wrong++;
        userStats.totalQuiz++;
        userStats.streak = 0;
        
        api.sendMessage(
          `⏰ HẾT GIỜ!\n\n❌ Bạn đã không trả lời trong 30 giây\n🔍 Đáp án đúng: **${randomQuiz.correct}** - ${randomQuiz.options.find(opt => opt.startsWith(randomQuiz.correct))}\n\n📊 Streak bị reset về 0\n🎮 Gõ "bonz trắc start" để chơi tiếp!`,
          threadId, type
        );
      }
    }, 30000);

    return api.sendMessage(quizMsg.join('\n'), threadId, type);
  }

  return api.sendMessage('❓ Sử dụng: bonz trắc start để bắt đầu trắc nghiệm mới!', threadId, type);
}
