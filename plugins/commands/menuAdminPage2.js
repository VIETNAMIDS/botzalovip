const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { Reactions } = require('zca-js');

const AUTO_DELETE_TIME = 120000; // 120 seconds

module.exports.config = {
  name: 'menu admin page2',
  version: '1.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Trang 2 bảng điều khiển admin BONZ',
  category: 'System',
  usage: 'menu admin page2',
  cooldowns: 5
};

module.exports.run = async ({ api, event }) => {
  const { threadId, type } = event;

  const commands = [
    { icon: '🔐', command: 'autoLeaveLockChat', desc: 'Quét và rời nhóm khoá chat kèm thông báo', colors: ['#f97316', '#ec4899'], category: 'Automation' },
    { icon: '⛔', command: '/dontleave', desc: 'Đánh dấu nhóm không rời trong lần quét kế tiếp', colors: ['#ef4444', '#b91c1c'], category: 'Automation' },
    { icon: '🧭', command: 'bonzscan full', desc: 'Quét toàn bộ nhóm, thống kê admin/lock chat', colors: ['#0ea5e9', '#38bdf8'], category: 'Audit' },
    { icon: '📊', command: 'scan report', desc: 'Nhận báo cáo kết quả quét gần nhất', colors: ['#a855f7', '#7c3aed'], category: 'Audit' },
    { icon: '🕒', command: 'bonz schedule add', desc: 'Thêm lịch autosend / auto quảng bá nâng cao', colors: ['#f59e0b', '#facc15'], category: 'Automation' },
    { icon: '🎛️', command: 'autoresponse set', desc: 'Quản lý cấu hình auto reply bonzAutoReply', colors: ['#34d399', '#059669'], category: 'Automation' },
    { icon: '📣', command: 'bonz broadcast', desc: 'Gửi thông báo đa nhóm với định dạng nâng cao', colors: ['#8b5cf6', '#6366f1'], category: 'Communication' },
    { icon: '🛡️', command: 'anti config', desc: 'Tuỳ chỉnh toàn bộ hệ thống anti spam', colors: ['#fb7185', '#f43f5e'], category: 'Security' },
    { icon: '🧾', command: 'log recent', desc: 'Xem log hành động mới nhất của bot', colors: ['#c084fc', '#60a5fa'], category: 'Audit' },
    { icon: '📦', command: 'backup config', desc: 'Xuất toàn bộ cấu hình & dữ liệu quan trọng', colors: ['#0ea5e9', '#14b8a6'], category: 'Maintenance' },
    { icon: '♻️', command: 'reload config', desc: 'Tải lại config.yml và data không cần restart', colors: ['#86efac', '#22c55e'], category: 'Maintenance' },
    { icon: '⚙️', command: 'bonz settings', desc: 'Mở bảng điều khiển web BONZ VIP', colors: ['#f472b6', '#ec4899'], category: 'System' },
    { icon: '📥', command: 'download logs', desc: 'Tải log bot theo ngày / tháng', colors: ['#38bdf8', '#2563eb'], category: 'Maintenance' },
    { icon: '🔄', command: 'restart bot', desc: 'Khởi động lại bot từ xa', colors: ['#fb923c', '#f97316'], category: 'System' },
    { icon: '🔕', command: 'admin silent', desc: 'Chỉ cho admin dùng lệnh, khoá user', colors: ['#f87171', '#b91c1c'], category: 'Security' },
    { icon: '🪪', command: 'admin list', desc: 'Thống kê quyền admin/phó nhóm hiện tại', colors: ['#93c5fd', '#60a5fa'], category: 'Info' },
    { icon: '📢', command: 'notify admins', desc: 'Ping toàn bộ admin bot với styled message', colors: ['#f472b6', '#d946ef'], category: 'Communication' },
    { icon: '🧑\u200d💻', command: 'dev mode on', desc: 'Bật log dev chi tiết để debug', colors: ['#fde68a', '#fbbf24'], category: 'Dev' },
    { icon: '🛠️', command: 'module toggle <name>', desc: 'Bật/tắt nhanh event hoặc command', colors: ['#14b8a6', '#0d9488'], category: 'Maintenance' },
    { icon: '🛰️', command: 'auto-approve dm', desc: 'Tự động duyệt lời mời kết bạn / tin nhắn', colors: ['#22d3ee', '#0284c7'], category: 'Automation' }
  ];

  const width = 1800;
  const columns = 3;
  const cardHeight = 190;
  const marginX = 60;
  const gapX = 30;
  const gapY = 40;
  const startY = 360;
  const rows = Math.ceil(commands.length / columns);
  const footerHeight = 320;

  const cardWidth = (width - marginX * 2 - gapX * (columns - 1));
  const singleCardWidth = Math.floor(cardWidth / columns);
  const height = startY + rows * cardHeight + (rows - 1) * gapY + footerHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#020617');
  bgGradient.addColorStop(0.35, '#0f172a');
  bgGradient.addColorStop(0.7, '#111827');
  bgGradient.addColorStop(1, '#050b16');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Ambient glows
  const orbs = [
    { x: width * 0.18, y: height * 0.22, r: 220, color: '#8b5cf6' },
    { x: width * 0.82, y: height * 0.25, r: 260, color: '#ec4899' },
    { x: width * 0.5, y: height * 0.75, r: 210, color: '#22d3ee' }
  ];
  orbs.forEach(orb => {
    const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
    grad.addColorStop(0, orb.color + '33');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(orb.x - orb.r, orb.y - orb.r, orb.r * 2, orb.r * 2);
  });

  // Header
  const headerX = 60;
  const headerY = 50;
  const headerW = width - 120;
  const headerH = 260;
  roundRect(ctx, headerX, headerY, headerW, headerH, 30);
  const headerGrad = ctx.createLinearGradient(headerX, headerY, headerX, headerY + headerH);
  headerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  headerGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
  ctx.fillStyle = headerGrad;
  ctx.fill();

  const borderGrad = ctx.createLinearGradient(headerX, headerY, headerX + headerW, headerY);
  borderGrad.addColorStop(0, '#8b5cf6');
  borderGrad.addColorStop(0.25, '#ec4899');
  borderGrad.addColorStop(0.5, '#22d3ee');
  borderGrad.addColorStop(0.75, '#f59e0b');
  borderGrad.addColorStop(1, '#8b5cf6');
  roundRect(ctx, headerX, headerY, headerW, headerH, 30);
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  ctx.shadowColor = 'rgba(236, 72, 153, 0.45)';
  ctx.shadowBlur = 35;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  roundRect(ctx, headerX, headerY, headerW, headerH, 30);
  ctx.stroke();
  ctx.restore();

  const titleGrad = ctx.createLinearGradient(headerX + 260, headerY + 60, headerX + 980, headerY + 60);
  titleGrad.addColorStop(0, '#f8fafc');
  titleGrad.addColorStop(0.5, '#a855f7');
  titleGrad.addColorStop(1, '#38bdf8');
  ctx.fillStyle = titleGrad;
  ctx.textAlign = 'center';
  ctx.font = 'bold 68px Arial';
  ctx.shadowColor = 'rgba(37, 99, 235, 0.6)';
  ctx.shadowBlur = 22;
  ctx.fillText('ADMIN CONTROL PANEL — PAGE 2', width / 2, headerY + 120);
  ctx.shadowBlur = 0;

  const subtitleGrad = ctx.createLinearGradient(headerX + 200, headerY + 170, headerX + 1000, headerY + 170);
  subtitleGrad.addColorStop(0, '#38bdf8');
  subtitleGrad.addColorStop(1, '#f472b6');
  ctx.fillStyle = subtitleGrad;
  ctx.font = 'bold 32px Arial';
  ctx.fillText('Automation • Security • Maintenance Toolkit', width / 2, headerY + 190);

  const badgeY = headerY + 210;
  drawModernBadge(ctx, width / 2 - 280, badgeY, `${commands.length} Advanced Commands`, '#a855f7');
  drawModernBadge(ctx, width / 2, badgeY, 'Prefix: ' + (global.config?.prefix || '/'), '#22d3ee');
  drawModernBadge(ctx, width / 2 + 280, badgeY, 'SYNC READY', '#f59e0b');

  // Command cards
  commands.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cardX = marginX + col * (singleCardWidth + gapX);
    const cardY = startY + row * (cardHeight + gapY);

    ctx.save();
    roundRect(ctx, cardX, cardY, singleCardWidth, cardHeight, 20);
    const cardBg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardHeight);
    cardBg.addColorStop(0, 'rgba(30, 41, 59, 0.65)');
    cardBg.addColorStop(1, 'rgba(15, 23, 42, 0.88)');
    ctx.fillStyle = cardBg;
    ctx.fill();

    const cardBorder = ctx.createLinearGradient(cardX, cardY, cardX + singleCardWidth, cardY + cardHeight);
    cardBorder.addColorStop(0, item.colors[0]);
    cardBorder.addColorStop(1, item.colors[1]);
    roundRect(ctx, cardX, cardY, singleCardWidth, cardHeight, 20);
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const accentGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardHeight);
    accentGrad.addColorStop(0, item.colors[0]);
    accentGrad.addColorStop(1, item.colors[1]);
    roundRect(ctx, cardX, cardY, 6, cardHeight, [20, 0, 0, 20]);
    ctx.fillStyle = accentGrad;
    ctx.fill();
    ctx.restore();

    const iconX = cardX + 60;
    const iconY = cardY + cardHeight / 2;
    const iconR = 38;

    ctx.save();
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR + 3, 0, Math.PI * 2);
    ctx.fillStyle = item.colors[0] + '40';
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
    const iconCircleBg = ctx.createRadialGradient(iconX, iconY, 0, iconX, iconY, iconR);
    iconCircleBg.addColorStop(0, 'rgba(255,255,255,0.12)');
    iconCircleBg.addColorStop(1, 'rgba(15,23,42,0.6)');
    ctx.fillStyle = iconCircleBg;
    ctx.fill();
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = item.colors[0];
    ctx.shadowBlur = 12;
    ctx.fillText(item.icon, iconX, iconY);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px Arial';
    const cmdText = item.command.length > 24 ? item.command.slice(0, 22) + '…' : item.command;
    ctx.fillText(cmdText, cardX + 110, cardY + 28);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '20px Arial';
    wrapText(ctx, item.desc, singleCardWidth - 125).slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, cardX + 110, cardY + 68 + i * 28);
    });

    drawSmallBadge(ctx, cardX + 110, cardY + cardHeight - 45, item.category, item.colors[0]);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`#${index + 1}`, cardX + singleCardWidth - 15, cardY + cardHeight - 22);
  });

  // Footer
  const footerY = height - footerHeight + 50;
  const footerH = footerHeight - 100;
  roundRect(ctx, 80, footerY, width - 160, footerH, 25);
  const footerGrad = ctx.createLinearGradient(80, footerY, 80, footerY + footerH);
  footerGrad.addColorStop(0, 'rgba(139, 92, 246, 0.18)');
  footerGrad.addColorStop(0.5, 'rgba(236, 72, 153, 0.12)');
  footerGrad.addColorStop(1, 'rgba(6, 182, 212, 0.15)');
  ctx.fillStyle = footerGrad;
  ctx.fill();

  roundRect(ctx, 80, footerY, width - 160, footerH, 25);
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px Arial';
  ctx.shadowColor = 'rgba(139, 92, 246, 0.4)';
  ctx.shadowBlur = 18;
  ctx.fillText('BONZ VIP — ADMIN POWER PACK', width / 2, footerY + 55);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#94a3b8';
  ctx.font = '20px Arial';
  ctx.fillText('Trang 2 • Automation / Security / Maintenance • Liên hệ: 0785 000 270', width / 2, footerY + footerH - 35);

  // Save and send
  const tempDir = path.join(__dirname, '../../cache');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const imagePath = path.join(tempDir, `menu_admin_page2_${Date.now()}.png`);
  fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));

  let sent;
  try {
    sent = await api.sendMessage(
      {
        msg: '✨ Admin Control Panel • PAGE 2 • Auto-delete trong 120s',
        attachments: [imagePath],
        ttl: AUTO_DELETE_TIME
      },
      threadId,
      type
    );
  } catch (error) {
    console.error('[menu admin page2] Send error:', error.message || error);
  } finally {
    setTimeout(() => {
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (cleanupErr) {
        console.error('[menu admin page2] Cleanup error:', cleanupErr.message || cleanupErr);
      }
    }, AUTO_DELETE_TIME + 2000);
  }

  await reactWithMenu(api, event, threadId, type, sent);
};

const MENU_ADMIN_REACTIONS = [
  Reactions.HEART,
  Reactions.LIKE,
  Reactions.WOW,
  Reactions.SUN,
  Reactions.HANDCLAP,
  Reactions.COOL,
  Reactions.OK,
  Reactions.ROSE,
  Reactions.KISS,
  Reactions.BOMB,
  Reactions.THINK
];

async function reactWithMenu(api, event, threadId, type) {
  if (typeof api.addReaction !== 'function') return;
  const msgId = event?.data?.msgId;
  if (!msgId) return;

  const target = {
    data: { msgId, cliMsgId: event?.data?.cliMsgId },
    threadId,
    type
  };

  try {
    await api.addReaction(Reactions.NONE, target);
  } catch {}

  for (const reaction of MENU_ADMIN_REACTIONS) {
    try {
      await api.addReaction(reaction, target);
    } catch {}
  }
}

function roundRect(ctx, x, y, w, h, r) {
  if (Array.isArray(r)) {
    const [tl, tr, br, bl] = r;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
  } else {
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
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawModernBadge(ctx, x, y, text, color) {
  ctx.save();
  ctx.font = 'bold 20px Arial';
  const textWidth = ctx.measureText(text).width;
  const badgeW = textWidth + 34;
  const badgeH = 38;

  roundRect(ctx, x, y, badgeW, badgeH, 19);
  ctx.fillStyle = color + '30';
  ctx.fill();

  roundRect(ctx, x, y, badgeW, badgeH, 19);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + badgeW / 2, y + badgeH / 2);
  ctx.restore();
}

function drawSmallBadge(ctx, x, y, text, color) {
  ctx.save();
  ctx.font = 'bold 14px Arial';
  const textWidth = ctx.measureText(text).width;
  const badgeW = textWidth + 16;
  const badgeH = 24;

  roundRect(ctx, x, y, badgeW, badgeH, 12);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + badgeW / 2, y + badgeH / 2);
  ctx.restore();
}
