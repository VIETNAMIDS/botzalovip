const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { Reactions } = require('zca-js');

const AUTO_DELETE_TIME = 120000;

const COMMAND_ICONS = ['✨', '🛡️', '⚙️', '🚀', '💡', '📌', '🔧', '📢'];
const COMMAND_COLORS = ['#FF6B9D', '#60A5FA', '#34D399', '#FB7185', '#F97316', '#A78BFA', '#FDE68A', '#4ADE80'];

const ADMIN_COMMAND_NAMES = [
  'adc',
  'adduser',
  'admin help',
  'adv',
  'den',
  'adminvip',
  'cahan',
  'remoteuser',
  'doiten',
  'voice',
  'stickerauto',
  'stickergui',
  'tb',
  'autoundo help',
  'finelenh',
  'anti link',
  'anti spam',
  'anti help',
  'antiphoto',
  'antisticker',
  'antiset',
  'antileave',
  'rejoinlink',
  'antiicon',
  'anti onlytext',
  'anti undo',
  'anti card',
  'antimention',
  'anticaps',
  'antizalgo',
  'antiphish',
  'antiemoji',
  'antivoice',
  'antiforward',
  'antibot',
  'antiadd',
  'antiadd global on/off',
  'autochat',
  'autodownload',
  'autojoin',
  'autosend',
  'blockmember',
  'blockuser',
  'antiword',
  'report',
  'gr',
  'bonzadd',
  'bonz join',
  'bot',
  'capnhat',
  'cay',
  'chatgr',
  'child help',
  'cmd',
  'creategroup',
  'cutlink',
  'cutp',
  'duyeudm approve',
  'findcut',
  'findmember',
  'flood',
  'groupblocked',
  'groupreview',
  'groupset',
  'history',
  'joinappr',
  'sendfriend',
  'checkkey',
  'keygold',
  'keysilver',
  'kickall',
  'listmembers',
  'lockchat',
  'lockleave',
  'lockview',
  'madmin',
  'mute',
  'mute unmute all',
  'name',
  'reloadconfig',
  'removefriend',
  'rs',
  'sentfriend',
  'setprefix',
  'showall',
  'showfriend',
  'showkey',
  'spamcard',
  'spamgr',
  'spamname',
  'spampoll',
  'spamvip',
  'spamwarall',
  'spamicon',
  'speed',
  'treo',
  'tutienhelp',
  'unkey',
  'upt',
  'viewcode',
  'welcome',
  'cutgr'
];

function categorizeAdminCommand(name = '') {
  const normalized = name.toLowerCase();
  if (/anti|lock|block|kick|mute|spam|guard|anticard|antiword/.test(normalized)) return 'Security';
  if (/auto|treo|adv|flood|spam|speed/.test(normalized)) return 'Automation';
  if (/key|unkey|adduser|bonzadd|creategroup/.test(normalized)) return 'Permissions';
  if (/child|bot|cmd|viewcode|adc/.test(normalized)) return 'Dev';
  if (/name|setprefix|history|groupset|listmember|sendfriend|removefriend/.test(normalized)) return 'Settings';
  return 'Admin';
}

const CUSTOM_COMMAND_DESCRIPTIONS = {
  cutlink: 'cutlink on bật link nhóm, cutlink off tắt link và báo link hiện tại',
  cutp: 'cutp @user: kick + blacklist (join lại sẽ bị kick); cutp unban @user: gỡ; cutp list: xem danh sách',
  antiset: 'antiset on/off: chống đổi tên/ảnh/mô tả nhóm trái phép (kick + rollback)',
  antileave: 'antileave on/off [4]: chống spam join/leave, đủ ngưỡng sẽ kick khi join',
  antiicon: 'antiicon on/off: chống spam thả icon (reaction), vượt ngưỡng sẽ kick + blacklist',
  lockchat: 'lockchat on/off: khoá/mở chat; lockchat time set 23:00 06:00: tự khoá/mở theo giờ',
  voice: 'voice (tts): đọc chữ thành voice (có -lang, -slow hoặc reply tin nhắn)',
  stickerauto: 'stickerauto on/off/status: bào sticker tự động (lưu file bonz)',
  stickergui: 'stickergui [count] [delayMs] (bonz|today|YYYY-MM-DD) (seq|random): gửi sticker thật',
  tb: 'tb on <1h|4h|forever|until8am|<giây>> | tb off | tb all on <..> | tb all off'
};

const allCommands = ADMIN_COMMAND_NAMES.map((command, index) => ({
  icon: COMMAND_ICONS[index % COMMAND_ICONS.length],
  command,
  desc: CUSTOM_COMMAND_DESCRIPTIONS[command] || `Sử dụng lệnh "${command}" trong menu quản trị`,
  color: COMMAND_COLORS[index % COMMAND_COLORS.length],
  category: categorizeAdminCommand(command)
}));

module.exports.config = {
  name: 'madmin',
  version: '3.2.0',
  role: 2,
  author: 'Cascade (Fixed)',
  description: 'Display beautiful vertical admin menu with working pagination',
  category: 'System',
  usage: 'madmin [page]',
  cooldowns: 5
};

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type } = event;

  // Get page from message text as backup
  const messageText = event?.data?.msg || '';
  const textMatch = messageText.match(/madmin\s+(\d+)/i);
  
  let requestedPage = 1;
  
  // Try to parse from args first
  if (args && args.length > 0) {
    for (const arg of args) {
      const str = String(arg || '').toLowerCase().trim();
      const num = parseInt(str);
      if (!isNaN(num) && num > 0) {
        requestedPage = num;
        break;
      }
      
      if (str.includes('page') || str.startsWith('p')) {
        const match = str.match(/(\d+)/);
        if (match) {
          requestedPage = parseInt(match[1]);
          break;
        }
      }
    }
  }
  
  // Fallback: parse from message text
  if (requestedPage === 1 && textMatch) {
    requestedPage = parseInt(textMatch[1]);
  }

  // Pagination - 15 items per page
  const ITEMS_PER_PAGE = 15;
  const totalPages = Math.ceil(allCommands.length / ITEMS_PER_PAGE);
  
  if (requestedPage > totalPages) {
    requestedPage = totalPages;
  }
  if (requestedPage < 1) {
    requestedPage = 1;
  }

  const startIndex = (requestedPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const pageCommands = allCommands.slice(startIndex, endIndex);

  const title = `ADMIN MENU ${requestedPage}/${totalPages}`;
  const subtitle = requestedPage < totalPages 
    ? `Gõ "madmin ${requestedPage + 1}" cho trang kế →`
    : '🎉 Đây là trang cuối cùng!';

  const image = await createVerticalCuteMenu(pageCommands, title, subtitle, requestedPage, totalPages);
  await sendMenuImage(api, threadId, type, event, image, `✨ Trang ${requestedPage}/${totalPages}`);
};

async function createVerticalCuteMenu(commands, title, subtitle, currentPage, totalPages) {
  const width = 900;
  const cardHeight = 105;
  const cardMargin = 16;
  const headerHeight = 280;
  const footerHeight = 180;
  const sideMargin = 40;
  
  const totalHeight = headerHeight + (commands.length * (cardHeight + cardMargin)) + footerHeight;
  
  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, totalHeight);
  bgGrad.addColorStop(0, '#FFF5F7');
  bgGrad.addColorStop(0.33, '#FFF0F5');
  bgGrad.addColorStop(0.66, '#F0F9FF');
  bgGrad.addColorStop(1, '#FFFBEB');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, totalHeight);

  // Decorative circles
  const circles = [
    { x: 100, y: 150, r: 80, color: '#FFE4E1', alpha: 0.3 },
    { x: width - 120, y: 200, r: 100, color: '#E0F2FE', alpha: 0.3 },
    { x: 150, y: totalHeight - 250, r: 90, color: '#FEF3C7', alpha: 0.3 },
    { x: width - 80, y: totalHeight - 180, r: 70, color: '#DBEAFE', alpha: 0.3 }
  ];

  circles.forEach(circle => {
    ctx.globalAlpha = circle.alpha;
    ctx.fillStyle = circle.color;
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Dots pattern
  ctx.fillStyle = '#FFB6C1';
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < width; i += 60) {
    for (let j = 0; j < totalHeight; j += 60) {
      ctx.beginPath();
      ctx.arc(i, j, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Header
  const headerY = 30;
  roundRect(ctx, sideMargin, headerY, width - sideMargin * 2, headerHeight - 60, 25);
  
  const headerGrad = ctx.createLinearGradient(0, headerY, 0, headerY + headerHeight);
  headerGrad.addColorStop(0, 'rgba(255, 182, 193, 0.2)');
  headerGrad.addColorStop(1, 'rgba(173, 216, 230, 0.2)');
  ctx.fillStyle = headerGrad;
  ctx.fill();

  ctx.strokeStyle = '#FFB6C1';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Title
  ctx.fillStyle = '#FF6B9D';
  ctx.font = 'bold 52px Arial';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(255, 107, 157, 0.3)';
  ctx.shadowBlur = 15;
  ctx.fillText(title, width / 2, headerY + 75);
  ctx.shadowBlur = 0;

  // Subtitle
  ctx.fillStyle = '#60B8FA';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(subtitle, width / 2, headerY + 120);

  // Stats badges
  const badgeY = headerY + 175;
  drawCuteBadge(ctx, width / 2 - 200, badgeY, `${commands.length} lệnh`, '#FFB6C1');
  drawCuteBadge(ctx, width / 2, badgeY, `Prefix: ${global.config?.prefix || '/'}`, '#AED9E0');
  drawCuteBadge(ctx, width / 2 + 200, badgeY, `💖 Online`, '#B4F8C8');

  // Command cards
  let currentY = headerHeight + 20;

  commands.forEach((cmd, index) => {
    const cardX = sideMargin;
    const cardY = currentY;
    const cardW = width - sideMargin * 2;

    // Card shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 5;
    
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    // Card border
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 20);
    ctx.strokeStyle = cmd.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Left accent
    roundRect(ctx, cardX, cardY, 8, cardHeight, [20, 0, 0, 20]);
    ctx.fillStyle = cmd.color;
    ctx.fill();

    // Icon circle
    const iconX = cardX + 58;
    const iconY = cardY + cardHeight / 2;
    const iconR = 32;

    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR + 2, 0, Math.PI * 2);
    ctx.fillStyle = cmd.color + '20';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = cmd.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Icon
    ctx.fillStyle = cmd.color;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cmd.icon, iconX, iconY);

    // Command name
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#2D3748';
    ctx.font = 'bold 22px Arial';
    const cmdText = cmd.command.length > 30 ? cmd.command.slice(0, 28) + '...' : cmd.command;
    ctx.fillText(cmdText, cardX + 105, cardY + 20);

    // Description
    ctx.fillStyle = '#718096';
    ctx.font = '17px Arial';
    const descText = cmd.desc.length > 52 ? cmd.desc.slice(0, 50) + '...' : cmd.desc;
    ctx.fillText(descText, cardX + 105, cardY + 50);

    // Category badge
    ctx.font = 'bold 13px Arial';
    const catW = ctx.measureText(cmd.category).width + 18;
    roundRect(ctx, cardX + 105, cardY + cardHeight - 28, catW, 20, 10);
    ctx.fillStyle = cmd.color + '30';
    ctx.fill();
    
    ctx.fillStyle = cmd.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cmd.category, cardX + 105 + catW / 2, cardY + cardHeight - 18);

    // Index
    ctx.fillStyle = '#CBD5E0';
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${index + 1}`, cardX + cardW - 18, cardY + cardHeight / 2);

    currentY += cardHeight + cardMargin;
  });

  // Footer
  const footerY = totalHeight - footerHeight + 20;
  const footerH = footerHeight - 40;

  roundRect(ctx, sideMargin, footerY, width - sideMargin * 2, footerH, 20);
  
  const footerGrad = ctx.createLinearGradient(0, footerY, 0, footerY + footerH);
  footerGrad.addColorStop(0, 'rgba(255, 182, 193, 0.15)');
  footerGrad.addColorStop(1, 'rgba(173, 216, 230, 0.15)');
  ctx.fillStyle = footerGrad;
  ctx.fill();

  ctx.strokeStyle = '#FFB6C1';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Footer text
  ctx.fillStyle = '#FF6B9D';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('💖 BONZ VIP Admin Tools 💖', width / 2, footerY + 40);

  ctx.fillStyle = '#60B8FA';
  ctx.font = '17px Arial';
  ctx.fillText('Support: 0785 000 270 • © 2024 BONZ Team', width / 2, footerY + 75);

  // Page indicator
  ctx.fillStyle = '#A0AEC0';
  ctx.font = 'bold 15px Arial';
  ctx.fillText(`Trang ${currentPage} / ${totalPages}`, width / 2, footerY + 105);

  // Hearts
  ctx.fillStyle = '#FF6B9D';
  ctx.font = '22px Arial';
  ctx.globalAlpha = 0.6;
  ctx.fillText('♥', 80, footerY + 40);
  ctx.fillText('♥', width - 80, footerY + 40);
  ctx.globalAlpha = 1;

  return canvas.toBuffer('image/png');
}

async function sendMenuImage(api, threadId, type, event, imageBuffer, message) {
  const tempDir = path.join(__dirname, '../../cache');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const imagePath = path.join(tempDir, `menu_admin_${Date.now()}.png`);
  fs.writeFileSync(imagePath, imageBuffer);

  let sent;
  try {
    sent = await api.sendMessage(
      {
        msg: `${message} • Tự xóa sau 120s`,
        attachments: [imagePath],
        ttl: AUTO_DELETE_TIME
      },
      threadId,
      type
    );
  } catch (error) {
    console.error('[menu admin] Send error:', error.message || error);
  } finally {
    setTimeout(() => {
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (cleanupErr) {
        console.error('[menu admin] Cleanup error:', cleanupErr.message || cleanupErr);
      }
    }, AUTO_DELETE_TIME + 2000);
  }

  await reactWithMenu(api, event, threadId, type, sent);
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

function drawCuteBadge(ctx, x, y, text, color) {
  ctx.save();
  ctx.font = 'bold 17px Arial';
  const textWidth = ctx.measureText(text).width;
  const badgeW = textWidth + 30;
  const badgeH = 34;
  
  roundRect(ctx, x - badgeW / 2, y - badgeH / 2, badgeW, badgeH, 17);
  ctx.fillStyle = color + '30';
  ctx.fill();
  
  roundRect(ctx, x - badgeW / 2, y - badgeH / 2, badgeW, badgeH, 17);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

const MENU_ADMIN_REACTION_POOL = [
  Reactions.HEART,
  Reactions.LIKE,
  Reactions.WOW,
  Reactions.SUN,
  Reactions.HANDCLAP,
  Reactions.COOL,
  Reactions.OK,
  Reactions.ROSE,
  Reactions.KISS
];

async function reactWithMenu(api, event, threadId, type, sent) {
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

  const count = Math.floor(Math.random() * 4) + 3;
  const shuffled = [...MENU_ADMIN_REACTION_POOL].sort(() => Math.random() - 0.5);
  const picks = shuffled.slice(0, count);

  for (const reaction of picks) {
    try {
      await api.addReaction(reaction, target);
    } catch (error) {
      console.warn('[menu admin][Reaction]', reaction, error.message);
    }
  }
}