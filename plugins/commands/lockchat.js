const fs = require("fs").promises;
const path = require("path");
const { createCanvas } = require("canvas");

module.exports.config = {
  name: "lockchat",
  version: "2.0.0",
  role: 1,
  author: "Cascade + Image by AI",
  description: "Bật/tắt khoá gửi tin nhắn trong nhóm với ảnh đẹp",
  category: "Nhóm",
  usage: "lockchat [on/off|1/0] | lockchat time set <offHH:MM> <onHH:MM> | lockchat time off | lockchat time status",
  cooldowns: 2,
  dependencies: {
    "canvas": ""
  }
};

const TIME_DATA_PATH = path.join(__dirname, "../../data/lockchat_time.json");

async function ensureTimeDataDir() {
  try {
    await fs.mkdir(path.dirname(TIME_DATA_PATH), { recursive: true });
  } catch (_) {}
}

async function loadTimeState() {
  await ensureTimeDataDir();
  try {
    const raw = await fs.readFile(TIME_DATA_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveTimeState(state) {
  await ensureTimeDataDir();
  try {
    await fs.writeFile(TIME_DATA_PATH, JSON.stringify(state || {}, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

function parseHHMM(input) {
  const s = String(input || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm, minutes: hh * 60 + mm };
}

// Tạo ảnh khi khoá/mở chat
async function createLockChatImage(isLocked) {
  const canvas = createCanvas(1200, 800);
  const ctx = canvas.getContext('2d');

  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, 800);
  if (isLocked) {
    // Red gradient for locked
    gradient.addColorStop(0, '#eb3349');
    gradient.addColorStop(0.5, '#f45c43');
    gradient.addColorStop(1, '#fa709a');
  } else {
    // Green gradient for unlocked
    gradient.addColorStop(0, '#11998e');
    gradient.addColorStop(0.5, '#38ef7d');
    gradient.addColorStop(1, '#30cfd0');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 800);

  // White card with shadow effect
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.roundRect(80, 80, 1040, 640, 40);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Giant lock icon
  const lockX = 600;
  const lockY = 280;
  const lockSize = 150;

  if (isLocked) {
    // Closed lock
    ctx.fillStyle = '#ef4444';
    
    // Lock body
    ctx.beginPath();
    ctx.roundRect(lockX - lockSize/2, lockY, lockSize, lockSize * 0.8, 20);
    ctx.fill();
    
    // Lock shackle (closed)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 25;
    ctx.beginPath();
    ctx.arc(lockX, lockY, lockSize * 0.4, Math.PI, 0, false);
    ctx.stroke();
    
    // Keyhole
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lockX, lockY + 50, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(lockX - 8, lockY + 50, 16, 35);
  } else {
    // Open lock
    ctx.fillStyle = '#10b981';
    
    // Lock body
    ctx.beginPath();
    ctx.roundRect(lockX - lockSize/2, lockY, lockSize, lockSize * 0.8, 20);
    ctx.fill();
    
    // Lock shackle (open - shifted to right)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 25;
    ctx.beginPath();
    ctx.arc(lockX + 40, lockY - 20, lockSize * 0.4, Math.PI, Math.PI * 0.3, false);
    ctx.stroke();
    
    // Keyhole
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lockX, lockY + 50, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(lockX - 8, lockY + 50, 16, 35);
  }

  // Status text
  ctx.textAlign = 'center';
  ctx.font = 'bold 80px Arial';
  ctx.fillStyle = isLocked ? '#ef4444' : '#10b981';
  ctx.fillText(isLocked ? '🔒 ĐANG KHOÁ' : '🔓 ĐÃ MỞ', 600, 520);

  // Description
  ctx.font = '36px Arial';
  ctx.fillStyle = '#666666';
  const description = isLocked 
    ? 'Thành viên không thể gửi tin nhắn'
    : 'Thành viên có thể gửi tin nhắn tự do';
  ctx.fillText(description, 600, 580);

  // Additional info with icons
  ctx.font = '28px Arial';
  ctx.fillStyle = '#999999';
  if (isLocked) {
    ctx.fillText('⚠️ Chỉ Admin có thể gửi tin nhắn', 600, 630);
  } else {
    ctx.fillText('✨ Tất cả thành viên đều có thể chat', 600, 630);
  }

  // Footer
  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#999999';
  ctx.fillText('💫 Bonz Mãi VIP', 600, 720);

  return canvas.toBuffer('image/png');
}

// Tạo ảnh help/hướng dẫn
async function createLockChatHelpImage() {
  const canvas = createCanvas(1200, 900);
  const ctx = canvas.getContext('2d');

  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, 900);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(0.5, '#764ba2');
  gradient.addColorStop(1, '#f093fb');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 900);

  // White card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.roundRect(50, 50, 1100, 800, 30);
  ctx.fill();

  // Header
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🔒 HƯỚNG DẪN LOCKCHAT', 600, 130);

  let currentY = 220;
  ctx.textAlign = 'left';

  // Commands section
  const commands = [
    { cmd: 'lockchat on', desc: 'Khoá gửi tin nhắn cho thành viên', icon: '🔒', color: '#ef4444' },
    { cmd: 'lockchat off', desc: 'Mở khoá để thành viên có thể chat', icon: '🔓', color: '#10b981' },
    { cmd: 'lockchat 1', desc: 'Khoá gửi tin nhắn (tương đương on)', icon: '🔒', color: '#ef4444' },
    { cmd: 'lockchat 0', desc: 'Mở khoá (tương đương off)', icon: '🔓', color: '#10b981' }
  ];

  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#000000';
  ctx.fillText('📋 CÚ PHÁP:', 100, currentY);
  currentY += 60;

  commands.forEach(cmd => {
    // Command box
    ctx.fillStyle = 'rgba(102, 126, 234, 0.05)';
    ctx.roundRect(100, currentY - 35, 1000, 70, 15);
    ctx.fill();

    // Icon
    ctx.font = '32px Arial';
    ctx.fillText(cmd.icon, 120, currentY);

    // Command
    ctx.font = 'bold 26px Arial';
    ctx.fillStyle = cmd.color;
    ctx.fillText(cmd.cmd, 180, currentY);

    // Description
    ctx.font = '24px Arial';
    ctx.fillStyle = '#666666';
    ctx.fillText(cmd.desc, 380, currentY);

    currentY += 90;
  });

  // Info boxes
  currentY += 40;
  const infoBoxWidth = 500;
  const infoBoxHeight = 140;
  const infoBoxSpacing = 50;
  const infoBoxStartX = (1200 - (infoBoxWidth * 2 + infoBoxSpacing)) / 2;

  // Locked info box
  ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
  ctx.roundRect(infoBoxStartX, currentY, infoBoxWidth, infoBoxHeight, 20);
  ctx.fill();

  ctx.font = '40px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🔒', infoBoxStartX + infoBoxWidth / 2, currentY + 50);

  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#ef4444';
  ctx.fillText('TRẠNG THÁI KHOÁ', infoBoxStartX + infoBoxWidth / 2, currentY + 85);

  ctx.font = '20px Arial';
  ctx.fillStyle = '#666666';
  ctx.fillText('Chỉ Admin gửi được tin', infoBoxStartX + infoBoxWidth / 2, currentY + 115);

  // Unlocked info box
  ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
  ctx.roundRect(infoBoxStartX + infoBoxWidth + infoBoxSpacing, currentY, infoBoxWidth, infoBoxHeight, 20);
  ctx.fill();

  ctx.font = '40px Arial';
  ctx.fillText('🔓', infoBoxStartX + infoBoxWidth + infoBoxSpacing + infoBoxWidth / 2, currentY + 50);

  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#10b981';
  ctx.fillText('TRẠNG THÁI MỞ', infoBoxStartX + infoBoxWidth + infoBoxSpacing + infoBoxWidth / 2, currentY + 85);

  ctx.font = '20px Arial';
  ctx.fillStyle = '#666666';
  ctx.fillText('Tất cả đều chat được', infoBoxStartX + infoBoxWidth + infoBoxSpacing + infoBoxWidth / 2, currentY + 115);

  // Footer
  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = '#999999';
  ctx.fillText('💫 Bonz Mãi VIP', 600, 820);

  return canvas.toBuffer('image/png');
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const sub = (args?.[0] || '').toString().toLowerCase();

  // lockchat time ...
  if (sub === "time" || sub === "timer" || sub === "gio" || sub === "giờ") {
    const action = (args?.[1] || "").toString().toLowerCase();
    const state = await loadTimeState();
    if (!state.threads || typeof state.threads !== "object") state.threads = {};
    const rec = state.threads[String(threadId)] && typeof state.threads[String(threadId)] === "object"
      ? state.threads[String(threadId)]
      : { enabled: false, off: null, on: null, updatedAt: 0, updatedBy: null };

    if (!action || action === "status" || action === "st") {
      const status = rec.enabled ? "đang BẬT" : "đang TẮT";
      const offStr = rec?.off?.hh != null ? `${String(rec.off.hh).padStart(2, '0')}:${String(rec.off.mm).padStart(2, '0')}` : "chưa set";
      const onStr = rec?.on?.hh != null ? `${String(rec.on.hh).padStart(2, '0')}:${String(rec.on.mm).padStart(2, '0')}` : "chưa set";
      return api.sendMessage(
        `⏰ LockChat Time hiện ${status}.\n` +
        `• Giờ khoá (off): ${offStr}\n` +
        `• Giờ mở (on): ${onStr}\n` +
        `📌 Dùng: lockchat time set <offHH:MM> <onHH:MM> | lockchat time off`,
        threadId,
        type
      );
    }

    if (action === "off" || action === "disable" || action === "tắt" || action === "tat" || action === "0") {
      rec.enabled = false;
      rec.updatedAt = Date.now();
      rec.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
      state.threads[String(threadId)] = rec;
      await saveTimeState(state);
      return api.sendMessage("✅ Đã TẮT chế độ lockchat theo giờ cho nhóm này.", threadId, type);
    }

    if (action === "set" || action === "on" || action === "enable" || action === "bật" || action === "bat" || action === "1") {
      const offRaw = args?.[2];
      const onRaw = args?.[3];
      const off = parseHHMM(offRaw);
      const on = parseHHMM(onRaw);
      if (!off || !on) {
        return api.sendMessage(
          "⚠️ Sai cú pháp. Ví dụ: lockchat time set 23:00 06:00",
          threadId,
          type
        );
      }

      rec.enabled = true;
      rec.off = { hh: off.hh, mm: off.mm, minutes: off.minutes };
      rec.on = { hh: on.hh, mm: on.mm, minutes: on.minutes };
      rec.updatedAt = Date.now();
      rec.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
      state.threads[String(threadId)] = rec;
      await saveTimeState(state);

      return api.sendMessage(
        `✅ Đã BẬT lockchat theo giờ.\n• OFF: ${String(off.hh).padStart(2, '0')}:${String(off.mm).padStart(2, '0')}\n• ON: ${String(on.hh).padStart(2, '0')}:${String(on.mm).padStart(2, '0')}\nℹ️ Bot sẽ tự khoá/mở chat theo lịch này.`,
        threadId,
        type
      );
    }

    return api.sendMessage(
      "⚠️ Dùng: lockchat time set <offHH:MM> <onHH:MM> | lockchat time off | lockchat time status",
      threadId,
      type
    );
  }

  const input = sub;

  // Nếu không có args hoặc là help
  if (!input || input === 'help' || input === 'h') {
    try {
      const imageBuffer = await createLockChatHelpImage();
      const imageFileName = `lockchat_help_${Date.now()}.png`;
      await fs.writeFile(imageFileName, imageBuffer);
      
      await api.sendMessage({
        msg: "📖 Hướng dẫn sử dụng Lockchat",
        attachments: [imageFileName]
      }, threadId, type);
      
      setTimeout(async () => {
        try { await fs.unlink(imageFileName); } catch (_) {}
      }, 30000);
      return;
    } catch (error) {
      console.error('Error creating help image:', error);
      return api.sendMessage(
        "⚠️ Vui lòng chọn on/off hoặc 1/0\nCú pháp: lockchat [on/off|1/0]",
        threadId,
        type
      );
    }
  }

  if (!["on", "off", "1", "0"].includes(input)) {
    return api.sendMessage(
      "⚠️ Vui lòng chọn on/off hoặc 1/0\nCú pháp: lockchat [on/off|1/0]",
      threadId,
      type
    );
  }

  const enable = input === "on" || input === "1"; // true = khoá gửi tin nhắn

  try {
    await api.updateGroupSettings({ lockSendMsg: enable }, String(threadId));
    
    // Tạo và gửi ảnh
    try {
      const imageBuffer = await createLockChatImage(enable);
      const imageFileName = `lockchat_${enable ? 'locked' : 'unlocked'}_${Date.now()}.png`;
      await fs.writeFile(imageFileName, imageBuffer);
      
      const statusTxt = enable 
        ? "✅ Đã khoá chat thành công!" 
        : "✅ Đã mở khoá chat thành công!";
      
      await api.sendMessage({
        msg: statusTxt,
        attachments: [imageFileName]
      }, threadId, type);
      
      // Xoá file sau 30 giây
      setTimeout(async () => {
        try { await fs.unlink(imageFileName); } catch (_) {}
      }, 30000);
    } catch (imgError) {
      console.error('Error creating lock image:', imgError);
      // Fallback to text if image creation fails
      const statusTxt = enable 
        ? "✅ Đã KHÓA gửi tin nhắn cho thành viên" 
        : "✅ Đã MỞ gửi tin nhắn cho thành viên";
      return api.sendMessage(statusTxt, threadId, type);
    }
  } catch (err) {
    return api.sendMessage(`❌ Không thể cập nhật cài đặt: ${err?.message || err}`, threadId, type);
  }
};