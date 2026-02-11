const { updateConfigArray, reloadConfig } = require("../../utils/index");
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { removeVerifiedEmailRecord } = require('../../utils/verifiedEmails');

const AUTO_DELETE_TIME = 60000; // 60 giây tự xóa tin nhắn

module.exports.config = {
  name: 'admin',
  version: '5.2.0',
  role: 2,
  author: 'Bonz',
  description: 'Quản lý admin và support - Modern UI Design - Auto delete',
  category: 'Hệ thống',
  usage: 'admin <add|rm|sp|rmsp|list|help|purge> [@tag/ID]',
  cooldowns: 2
};

module.exports.run = async ({ args, event, api, Threads, Users }) => {
  const { threadId, type, data } = event;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return;
  }

  let action = args[0]?.toLowerCase();

  // Helper function để reload config và global.users
  const reloadGlobalUsers = async () => {
    try {
      await reloadConfig();
      // Đợi một chút để config được load
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('[ADMIN] ❌ Lỗi reload config:', error);
    }
  };

  const appendTimerNotice = (message) => `${message}\n⏱gui bonz ${AUTO_DELETE_TIME / 1000}s`;

  const scheduleFileCleanup = (files = []) => {
    if (!Array.isArray(files) || files.length === 0) return;
    setTimeout(() => {
      files.forEach(file => {
        if (typeof file !== 'string') return;
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            console.log(`[ADMIN] ✅ Đã xóa file: ${path.basename(file)}`);
          }
        } catch (error) {
          console.error(`[ADMIN] ❌ Lỗi xóa file ${file}:`, error.message || error);
        }
      });
    }, AUTO_DELETE_TIME);
  };

  const sendTimedMessage = async (message, attachments = []) => {
    const payload = {
      msg: appendTimerNotice(message.trim()),
      ttl: AUTO_DELETE_TIME
    };

    if (attachments.length > 0) {
      payload.attachments = attachments;
    }

    try {
      await api.sendMessage(payload, threadId, type);
      console.log(`[ADMIN] 📤 Đã gửi tin nhắn với TTL ${AUTO_DELETE_TIME / 1000}s`);
    } catch (error) {
      console.error('[ADMIN] ❌ Lỗi gửi tin nhắn auto delete:', error.message || error);
    } finally {
      if (attachments.length > 0) {
        scheduleFileCleanup(attachments);
      }
    }
  };

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

  // Helper: Create notification image
  async function createNotificationImage(title, message, type = 'success') {
    const width = 1000;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#06121b');
    bgGradient.addColorStop(0.55, '#101826');
    bgGradient.addColorStop(1, '#2a1142');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    try {
      const blob1 = ctx.createRadialGradient(width * 0.18, height * 0.25, 30, width * 0.18, height * 0.25, Math.min(width, height) * 0.75);
      blob1.addColorStop(0, 'rgba(98, 255, 228, 0.18)');
      blob1.addColorStop(1, 'rgba(98, 255, 228, 0)');
      ctx.fillStyle = blob1;
      ctx.fillRect(0, 0, width, height);

      const blob2 = ctx.createRadialGradient(width * 0.85, height * 0.55, 30, width * 0.85, height * 0.55, Math.min(width, height) * 0.85);
      blob2.addColorStop(0, 'rgba(170, 90, 255, 0.22)');
      blob2.addColorStop(1, 'rgba(170, 90, 255, 0)');
      ctx.fillStyle = blob2;
      ctx.fillRect(0, 0, width, height);
    } catch {}

    // Pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 40) {
      for (let j = 0; j < height; j += 40) {
        ctx.fillRect(i, j, 20, 20);
      }
    }

    // Icon and color based on type
    let icon, color1, color2;
    if (type === 'success') {
      icon = '✅';
      color1 = '#10b981';
      color2 = '#059669';
    } else if (type === 'error') {
      icon = '❌';
      color1 = '#ef4444';
      color2 = '#dc2626';
    } else {
      icon = 'ℹ️';
      color1 = '#06b6d4';
      color2 = '#0891b2';
    }

    // Main card
    const cardGradient = ctx.createLinearGradient(0, 80, width, 80);
    cardGradient.addColorStop(0, 'rgba(255,255,255,0.09)');
    cardGradient.addColorStop(1, 'rgba(255,255,255,0.06)');

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30;
    roundRect(ctx, 50, 80, width - 100, height - 160, 22);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    ctx.restore();

    const borderGradient = ctx.createLinearGradient(50, 80, width - 50, 80);
    borderGradient.addColorStop(0, color1);
    borderGradient.addColorStop(1, color2);

    roundRect(ctx, 50, 80, width - 100, height - 160, 22);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.shadowColor = color1;
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Icon
    ctx.font = 'bold 78px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(icon, width / 2, 100);

    // Title
    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, color1);
    titleGradient.addColorStop(1, color2);
    
    ctx.fillStyle = titleGradient;
    ctx.font = 'bold 46px Arial';
    ctx.shadowColor = color1;
    ctx.shadowBlur = 18;
    ctx.fillText(title, width / 2, 190);
    ctx.shadowBlur = 0;

    // Message
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold 28px Arial';
    const lines = message.split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, 240 + i * 40);
    });

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('BONZ BOT ADMIN SYSTEM', width / 2, height - 30);

    const tempDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const imagePath = path.join(tempDir, `admin_notif_${Date.now()}.png`);
    fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));
    
    return imagePath;
  }

  async function createAdminPanelImage(options = {}) {
    const WIDTH = 1400;
    const items = Array.isArray(options.items) ? options.items : [];
    const rows = Math.max(1, Math.min(10, items.length));
    const HEIGHT = 260 + rows * 120 + Math.max(0, rows - 1) * 18 + 80;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#06121b');
    bg.addColorStop(0.45, '#101826');
    bg.addColorStop(1, '#2a1142');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    try {
      const blob1 = ctx.createRadialGradient(WIDTH * 0.20, HEIGHT * 0.22, 40, WIDTH * 0.20, HEIGHT * 0.22, Math.min(WIDTH, HEIGHT) * 0.75);
      blob1.addColorStop(0, 'rgba(98, 255, 228, 0.18)');
      blob1.addColorStop(1, 'rgba(98, 255, 228, 0)');
      ctx.fillStyle = blob1;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const blob2 = ctx.createRadialGradient(WIDTH * 0.86, HEIGHT * 0.55, 40, WIDTH * 0.86, HEIGHT * 0.55, Math.min(WIDTH, HEIGHT) * 0.85);
      blob2.addColorStop(0, 'rgba(170, 90, 255, 0.22)');
      blob2.addColorStop(1, 'rgba(170, 90, 255, 0)');
      ctx.fillStyle = blob2;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } catch {}

    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (let i = 0; i < WIDTH; i += 60) {
      for (let j = 0; j < HEIGHT; j += 60) {
        ctx.fillRect(i, j, 30, 30);
      }
    }

    const outerMargin = 36;
    const sidebarW = 300;
    const panelX = outerMargin + sidebarW + 26;
    const panelW = WIDTH - panelX - outerMargin;
    const panelY = outerMargin;
    const panelH = HEIGHT - outerMargin * 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30;
    roundRect(ctx, outerMargin, outerMargin, sidebarW, panelH, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();
    ctx.restore();

    const avatarSize = 176;
    const avatarX = outerMargin + Math.floor((sidebarW - avatarSize) / 2);
    const avatarY = outerMargin + 40;

    let avatarImg = null;
    const avatarUrl = options.avatarUrl;
    if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.startsWith('http')) {
      try {
        const res = await axios.get(avatarUrl, { responseType: 'arraybuffer', timeout: 9000 });
        avatarImg = await loadImage(Buffer.from(res.data));
      } catch {}
    }
    ctx.save();
    roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 30);
    ctx.clip();
    if (avatarImg) ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const name = String(options.displayName || 'ADMIN');
    const nameY = avatarY + avatarSize + 18;
    let n = name;
    while (ctx.measureText(n).width > sidebarW - 44 && n.length > 0) n = n.slice(0, -1);
    ctx.fillText(n, outerMargin + sidebarW / 2, nameY);

    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    ctx.font = '700 18px Arial';
    ctx.fillText('ADMIN PANEL', outerMargin + sidebarW / 2, nameY + 44);

    const hint = String(options.hint || 'Gõ: admin <số>');
    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    ctx.font = '16px Arial';
    ctx.fillText(hint, outerMargin + sidebarW / 2, nameY + 76);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30;
    roundRect(ctx, panelX, panelY, panelW, panelH, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    const headerGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
    headerGrad.addColorStop(0, 'rgba(139, 92, 246, 0.22)');
    headerGrad.addColorStop(0.5, 'rgba(236, 72, 153, 0.18)');
    headerGrad.addColorStop(1, 'rgba(250, 204, 21, 0.14)');
    roundRect(ctx, panelX + 18, panelY + 16, panelW - 36, 86, 18);
    ctx.fillStyle = headerGrad;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 34px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('QUẢN TRỊ BOT', panelX + 44, panelY + 59);
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '18px Arial';
    ctx.fillText('Chọn nhanh bằng số', panelX + 44, panelY + 88);
    ctx.restore();

    const listX = panelX + 18;
    const listY = panelY + 118;
    const cardW = panelW - 36;
    const cardH = 120;
    const gap = 18;

    for (let i = 0; i < Math.min(items.length, 10); i += 1) {
      const item = items[i] || {};
      const x = listX;
      const y = listY + i * (cardH + gap);
      const c1 = String(item.color1 || '#8b5cf6');
      const c2 = String(item.color2 || '#ec4899');

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.40)';
      ctx.shadowBlur = 22;
      roundRect(ctx, x, y, cardW, cardH, 18);
      const cardBg = ctx.createLinearGradient(x, y, x + cardW, y + cardH);
      cardBg.addColorStop(0, 'rgba(40, 255, 200, 0.10)');
      cardBg.addColorStop(1, 'rgba(255, 92, 197, 0.08)');
      ctx.fillStyle = cardBg;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.stroke();

      const neon = ctx.createLinearGradient(x, y, x + cardW, y);
      neon.addColorStop(0, c1);
      neon.addColorStop(1, c2);
      ctx.strokeStyle = neon;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      const icon = String(item.icon || '⚙️');
      ctx.save();
      ctx.shadowColor = c1;
      ctx.shadowBlur = 18;
      ctx.font = '42px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(icon, x + 24, y + 60);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.font = '800 26px Arial';
      const title = String(item.title || '');
      ctx.fillText(title, x + 86, y + 44);

      ctx.fillStyle = 'rgba(255,255,255,0.70)';
      ctx.font = '18px Arial';
      const desc = String(item.desc || '');
      ctx.fillText(desc, x + 86, y + 78);

      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.font = '800 30px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(String(item.no || (i + 1)), x + cardW - 22, y + 60);
      ctx.restore();
    }

    const tempDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const imagePath = path.join(tempDir, `admin_panel_${Date.now()}.png`);
    fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));
    return imagePath;
  }

  const adminPanelItems = [
    { no: 1, icon: '➕', title: 'Thêm Admin', desc: 'admin add @tag/ID', action: 'add', color1: '#10b981', color2: '#22c55e' },
    { no: 2, icon: '➖', title: 'Gỡ Admin', desc: 'admin rm @tag/ID', action: 'rm', color1: '#ef4444', color2: '#f97316' },
    { no: 3, icon: '💎', title: 'Thêm Support', desc: 'admin sp @tag/ID', action: 'sp', color1: '#06b6d4', color2: '#22d3ee' },
    { no: 4, icon: '🗑️', title: 'Gỡ Support', desc: 'admin rmsp @tag/ID', action: 'rmsp', color1: '#f59e0b', color2: '#f97316' },
    { no: 5, icon: '📋', title: 'Danh sách', desc: 'admin list', action: 'list', color1: '#8b5cf6', color2: '#ec4899' },
    { no: 6, icon: '⚙️', title: 'Chế độ', desc: 'admin adminonly', action: 'adminonly', color1: '#a855f7', color2: '#6366f1' },
    { no: 7, icon: '🛡️', title: 'Chỉ Support', desc: 'admin supportonly', action: 'supportonly', color1: '#06b6d4', color2: '#3b82f6' },
    { no: 8, icon: '🏠', title: 'Chỉ Nhóm', desc: 'admin boxonly', action: 'boxonly', color1: '#f97316', color2: '#ef4444' },
    { no: 9, icon: '🧹', title: 'Purge User', desc: 'admin purge <ID>', action: 'purge', color1: '#f59e0b', color2: '#f43f5e' },
  ];

  if (!action) {
    let displayName = null;
    let avatarUrl = null;
    try {
      const uid = data?.uidFrom;
      if (uid) {
        const info = await api.getUserInfo(uid);
        const profile = info?.changed_profiles?.[uid] || info?.[uid] || info?.profiles?.[uid] || info;
        displayName = profile?.displayName || profile?.zaloName || profile?.name || profile?.username || null;
        avatarUrl = profile?.avatar || profile?.avatarUrl || profile?.thumbSrc || profile?.thumb || profile?.photoUrl || null;
      }
    } catch {}

    const imagePath = await createAdminPanelImage({
      items: adminPanelItems,
      displayName,
      avatarUrl,
      hint: `Prefix: ${global.config?.prefix || '/'} • Gõ: admin <số>`,
    });
    await sendTimedMessage('👑 Admin Panel', [imagePath]);
    return;
  }

  const numeric = Number.parseInt(action, 10);
  if (Number.isFinite(numeric) && String(numeric) === String(action)) {
    const mapped = adminPanelItems.find((it) => Number(it.no) === numeric);
    if (!mapped?.action) {
      const imagePath = await createNotificationImage('LỖI', 'Số không hợp lệ\nGõ: admin', 'error');
      await sendTimedMessage('⚠️ Không hợp lệ', [imagePath]);
      return;
    }
    action = String(mapped.action);
  }

  let targetIds = [];

  if (data.mentions && Object.keys(data.mentions).length > 0) {
    targetIds = Object.values(data.mentions).map(m => m.uid);
  }

  if (targetIds.length === 0 && args.length > 1) {
    targetIds = args.slice(1)
      .join(" ")
      .split(/[\s,]+/)
      .filter(id => id && !isNaN(id));
  }

  const processAdd = async (listName, label) => {
    if (targetIds.length === 0) {
      const imagePath = await createNotificationImage(
        'LỖI',
        `Vui lòng tag hoặc nhập ID\nđể thêm ${label}`,
        'error'
      );
      await sendTimedMessage('⚠️ Thiếu thông tin', [imagePath]);
      return;
    }

    const currentList = Array.isArray(global.users?.[listName]) ? global.users[listName] : [];
    const newIds = targetIds.filter(id => !currentList.includes(id));
    
    if (newIds.length === 0) {
      const imagePath = await createNotificationImage(
        'THÔNG BÁO',
        'Không có người dùng mới\ncần thêm',
        'info'
      );
      await sendTimedMessage('ℹ️ Không có thay đổi', [imagePath]);
      return;
    }

    const updated = [...currentList, ...newIds];
    await updateConfigArray(`${listName}_bot`, updated);
    
    // Cập nhật global.users trực tiếp
    if (!global.users) global.users = {};
    global.users[listName] = updated;
    
    // Reload config
    await reloadGlobalUsers();

    const infos = await Promise.all(newIds.map(id => api.getUserInfo(id).catch(() => null)));
    const names = infos.map((info, i) => info?.changed_profiles?.[newIds[i]]?.displayName || "Unknown");

    const imagePath = await createNotificationImage(
      `THÊM ${label.toUpperCase()}`,
      `Đã thêm ${newIds.length} ${label}\n${names.slice(0, 3).join(', ')}${newIds.length > 3 ? '...' : ''}`,
      'success'
    );
    
    await sendTimedMessage('✅ Thêm thành công', [imagePath]);
  };

  const processRemove = async (listName, label) => {
    if (targetIds.length === 0) {
      const imagePath = await createNotificationImage(
        'LỖI',
        `Vui lòng tag hoặc nhập ID\nđể gỡ ${label}`,
        'error'
      );
      await sendTimedMessage('⚠️ Thiếu thông tin', [imagePath]);
      return;
    }

    const currentList = Array.isArray(global.users?.[listName]) ? global.users[listName] : [];
    const existing = targetIds.filter(id => currentList.includes(id));
    
    if (existing.length === 0) {
      const imagePath = await createNotificationImage(
        'THÔNG BÁO',
        'Không có người dùng nào\ntrong danh sách',
        'info'
      );
      await sendTimedMessage('ℹ️ Không tìm thấy', [imagePath]);
      return;
    }

    const updated = currentList.filter(id => !existing.includes(id));
    await updateConfigArray(`${listName}_bot`, updated);
    
    // Cập nhật global.users trực tiếp
    if (!global.users) global.users = {};
    global.users[listName] = updated;
    
    // Reload config
    await reloadGlobalUsers();

    const infos = await Promise.all(existing.map(id => api.getUserInfo(id).catch(() => null)));
    const names = infos.map((info, i) => info?.changed_profiles?.[existing[i]]?.displayName || "Unknown");

    const imagePath = await createNotificationImage(
      `GỠ ${label.toUpperCase()}`,
      `Đã gỡ ${existing.length} ${label}\n${names.slice(0, 3).join(', ')}${existing.length > 3 ? '...' : ''}`,
      'success'
    );
    
    await sendTimedMessage('✅ Gỡ thành công', [imagePath]);
  };

  switch (action) {
    case "add":
      return processAdd("admin", "admin");
    case "rm":
      return processRemove("admin", "admin");
    case "sp":
      return processAdd("support", "support");
    case "rmsp":
      return processRemove("support", "support");
    case "purge": {
      if (targetIds.length !== 1) {
        return sendTimedMessage('⚠️ Cú pháp: admin purge <ID>. Vui lòng tag hoặc nhập đúng một ID.');
      }

      if (!Users) {
        return sendTimedMessage('❌ Hệ thống người dùng chưa sẵn sàng, không thể xóa dữ liệu.');
      }

      const targetId = targetIds[0];
      if (String(targetId) === String(event.data?.uidFrom)) {
        return sendTimedMessage('⚠️ Không thể tự xóa dữ liệu của chính bạn.');
      }

      let userRemoved = false;
      try {
        userRemoved = typeof Users.delData === 'function' ? Users.delData(targetId) === true : false;
      } catch (error) {
        console.error('[ADMIN] ❌ Lỗi khi xóa dữ liệu người dùng trong SQL:', error.message || error);
      }

      let emailRemoved = false;
      try {
        emailRemoved = await removeVerifiedEmailRecord({ userId: targetId });
      } catch (error) {
        console.error('[ADMIN] ❌ Lỗi khi xóa email xác thực:', error.message || error);
      }

      let currencyRemoved = false;
      try {
        const currencyFile = path.join(__dirname, '../../data/currencies.json');
        if (fs.existsSync(currencyFile)) {
          const raw = await fs.promises.readFile(currencyFile, 'utf8');
          const json = raw ? JSON.parse(raw) : {};
          if (json && Object.prototype.hasOwnProperty.call(json, targetId)) {
            delete json[targetId];
            currencyRemoved = true;
            await fs.promises.writeFile(currencyFile, JSON.stringify(json, null, 2), 'utf8');
          }
        }
      } catch (error) {
        console.error('[ADMIN] ❌ Lỗi khi xóa dữ liệu tiền tệ:', error.message || error);
      }

      const removedFlags = [
        userRemoved ? '• Dữ liệu Users (SQLite)' : null,
        emailRemoved ? '• Email đã xác thực' : null,
        currencyRemoved ? '• Số dư tiền tệ' : null
      ].filter(Boolean);

      if (removedFlags.length === 0) {
        return sendTimedMessage('ℹ️ Không tìm thấy dữ liệu để xóa.');
      }

      const info = removedFlags.join('\n');
      await sendTimedMessage(`🧹 Đã xóa dữ liệu người dùng ${targetId}:\n${info}`);
      return;
    }

    case "list": {
      const adminList = global.users?.admin || [];
      const supportList = global.users?.support || [];

      const extractProfile = (info, uid) => {
        if (!info || !uid) return null;
        return info?.changed_profiles?.[uid] || info?.[uid] || info?.profiles?.[uid] || info;
      };

      const extractDisplayName = (info, uid) => {
        const profile = extractProfile(info, uid);
        return (
          profile?.displayName ||
          profile?.zaloName ||
          profile?.name ||
          profile?.username ||
          info?.displayName ||
          info?.name ||
          "Unknown"
        );
      };

      const extractAvatarUrl = (info, uid) => {
        const profile = extractProfile(info, uid);
        return (
          profile?.avatar ||
          profile?.avatarUrl ||
          profile?.thumbSrc ||
          profile?.thumb ||
          profile?.photoUrl ||
          null
        );
      };

      async function loadAvatar(url) {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
        try {
          const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 7000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          return await loadImage(Buffer.from(response.data));
        } catch (e) {
          return null;
        }
      }

      // Lấy thông tin admin đầu tiên (owner)
      let ownerData = null;
      if (adminList.length > 0) {
        const ownerId = adminList[0];
        try {
          const info = await api.getUserInfo(ownerId);
          const name = extractDisplayName(info, ownerId);
          const avatarUrl = extractAvatarUrl(info, ownerId);
          let avatar = null;
          if (avatarUrl) avatar = await loadAvatar(avatarUrl);
          ownerData = { name, uid: ownerId, avatar };
        } catch (e) {
          ownerData = { name: "Unknown", uid: ownerId, avatar: null };
        }
      }

      // Lấy danh sách tất cả admin
      const adminData = [];
      for (let i = 0; i < adminList.length; i++) {
        const uid = adminList[i];
        try {
          const info = await api.getUserInfo(uid);
          const name = extractDisplayName(info, uid);
          const avatarUrl = extractAvatarUrl(info, uid);
          let avatar = null;
          if (avatarUrl) avatar = await loadAvatar(avatarUrl);
          adminData.push({ name, uid, avatar });
        } catch (e) {
          adminData.push({ name: "Unknown", uid, avatar: null });
        }
      }

      // Canvas dimensions - tính chiều cao dựa trên số lượng admin
      const width = 1400;
      const itemHeight = 120;
      const itemSpacing = 15;
      const leftPanelHeight = 650;
      const totalItemsHeight = adminData.length * (itemHeight + itemSpacing);
      const minHeight = 700;
      const height = Math.max(minHeight, leftPanelHeight, totalItemsHeight + 100);
      
      // Tạo canvas với nền trong suốt
      const canvas = createCanvas(width, height, 'png');
      const ctx = canvas.getContext('2d');
      
      // Xóa toàn bộ canvas để đảm bảo trong suốt
      ctx.clearRect(0, 0, width, height);
      
      // Nền đen mờ
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, width, height);

      // Left panel - Owner card (trong suốt như kính)
      const leftPanelWidth = 480;
      const panelGradient = ctx.createLinearGradient(0, 0, 0, leftPanelHeight);
      panelGradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      panelGradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
      
      roundRect(ctx, 50, 50, leftPanelWidth, leftPanelHeight, 30);
      ctx.fillStyle = panelGradient;
      ctx.fill();
      
      // Border sáng mờ như kính
      roundRect(ctx, 50, 50, leftPanelWidth, leftPanelHeight, 30);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (ownerData && ownerData.avatar) {
        // Large avatar
        const avatarSize = 300;
        const avatarX = 50 + (leftPanelWidth - avatarSize) / 2;
        const avatarY = 100;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(ownerData.avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        
        // Avatar border
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 8;
        ctx.stroke();
      }

      // Owner name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(ownerData?.name || 'Unknown', 50 + leftPanelWidth / 2, 450);

      // Owner role
      ctx.fillStyle = '#d1d5db';
      ctx.font = '32px Arial';
      ctx.fillText('Owner', 50 + leftPanelWidth / 2, 495);

      // Admin Manager button (trong suốt như kính)
      const buttonY = leftPanelHeight - 90;
      const buttonGradient = ctx.createLinearGradient(0, buttonY, 0, buttonY + 60);
      buttonGradient.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      buttonGradient.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
      
      roundRect(ctx, 150, buttonY, leftPanelWidth - 200, 60, 15);
      ctx.fillStyle = buttonGradient;
      ctx.fill();
      
      roundRect(ctx, 150, buttonY, leftPanelWidth - 200, 60, 15);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px Arial';
      ctx.fillText('Admin Manager', 50 + leftPanelWidth / 2, buttonY + 38);

      // Right panel - Admin list
      const rightPanelX = 50 + leftPanelWidth + 30;
      const rightPanelWidth = width - rightPanelX - 50;
      
      // Admin list items
      let itemY = 50;
      
      adminData.forEach((admin, index) => {
        const itemHeight = 120;
        const itemGradient = ctx.createLinearGradient(rightPanelX, itemY, rightPanelX + rightPanelWidth, itemY);
        itemGradient.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
        itemGradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
        
        roundRect(ctx, rightPanelX, itemY, rightPanelWidth, itemHeight, 20);
        ctx.fillStyle = itemGradient;
        ctx.fill();
        
        // Border sáng mờ như kính
        roundRect(ctx, rightPanelX, itemY, rightPanelWidth, itemHeight, 20);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Avatar
        const avatarSize = 80;
        const avatarX = rightPanelX + 20;
        const avatarY = itemY + (itemHeight - avatarSize) / 2;
        
        if (admin.avatar) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(admin.avatar, avatarX, avatarY, avatarSize, avatarSize);
          ctx.restore();
          
          ctx.beginPath();
          ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 4;
          ctx.stroke();
        } else {
          const placeholderGradient = ctx.createRadialGradient(
            avatarX + avatarSize / 2, avatarY + avatarSize / 2, 0,
            avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2
          );
          placeholderGradient.addColorStop(0, '#3498db');
          placeholderGradient.addColorStop(1, '#2980b9');
          
          ctx.fillStyle = placeholderGradient;
          ctx.beginPath();
          ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Name
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.font = 'bold 32px Arial';
        ctx.fillText(admin.name, avatarX + avatarSize + 25, itemY + 45);

        // Role
        ctx.fillStyle = '#d1d5db';
        ctx.font = '26px Arial';
        ctx.fillText(index === 0 ? 'High Admin' : 'Bot Admin', avatarX + avatarSize + 25, itemY + 80);

        // Number badge
        ctx.fillStyle = '#9ca3af';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(index + 1, rightPanelX + rightPanelWidth - 30, itemY + itemHeight / 2 + 10);

        itemY += itemHeight + 15;
      });

      const tempDir = path.join(__dirname, '../../cache');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const imagePath = path.join(tempDir, `adminlist_modern_${Date.now()}.png`);
      // Lưu PNG với alpha channel (compression level 6)
      const buffer = canvas.toBuffer('image/png', { compressionLevel: 6, filters: canvas.PNG_FILTER_NONE });
      fs.writeFileSync(imagePath, buffer);

      await sendTimedMessage('📋 Danh sách quản trị bot', [imagePath]);

      return;
    }

    case "help":
    case "menu": {
      let displayName = null;
      let avatarUrl = null;
      try {
        const uid = data?.uidFrom;
        if (uid) {
          const info = await api.getUserInfo(uid);
          const profile = info?.changed_profiles?.[uid] || info?.[uid] || info?.profiles?.[uid] || info;
          displayName = profile?.displayName || profile?.zaloName || profile?.name || profile?.username || null;
          avatarUrl = profile?.avatar || profile?.avatarUrl || profile?.thumbSrc || profile?.thumb || profile?.photoUrl || null;
        }
      } catch {}

      const imagePath = await createAdminPanelImage({
        items: adminPanelItems,
        displayName,
        avatarUrl,
        hint: `Prefix: ${global.config?.prefix || '/'} • Gõ: admin <số>`,
      });
      await sendTimedMessage('📋 Admin Help', [imagePath]);
      return;
    }

    case "adminonly":
    case "supportonly":
    case "boxonly": {
      const keyMap = {
        adminonly: "admin_only",
        supportonly: "support_only",
        boxonly: "box_only"
      };

      const key = keyMap[action.toLowerCase()];
      const threadData = await Threads.getData(threadId);
      const currentValue = threadData.data[key] || false;
      const newValue = !currentValue;
      
      threadData.data[key] = newValue;
      Threads.setData(threadId, threadData.data);

      const modeNames = {
        admin_only: 'CHỈ ADMIN',
        support_only: 'CHỈ SUPPORT',
        box_only: 'CHỈ NHÓM'
      };

      const imagePath = await createNotificationImage(
        newValue ? 'ĐÃ BẬT' : 'ĐÃ TẮT',
        `Chế độ ${modeNames[key]}\n${newValue ? 'đang hoạt động' : 'đã tắt'}`,
        newValue ? 'success' : 'info'
      );
      
      await sendTimedMessage(`${newValue ? '✅ Đã bật' : '❌ Đã tắt'} chế độ ${modeNames[key]}`, [imagePath]);
      return;
    }

    default: {
      const imagePath = await createNotificationImage(
        'HƯỚNG DẪN',
        'Gõ: admin help\nđể xem chi tiết',
        'info'
      );
      
      await sendTimedMessage('📋 Xem hướng dẫn chi tiết', [imagePath]);
      return;
    }
  }
};