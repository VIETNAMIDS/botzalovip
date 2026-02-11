const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const TEMP_DIR = path.join(__dirname, '../../temp');
const TTL = 60000;

const MENU_SECTIONS = [
  {
    title: '📇 spamcard',
    subtitle: 'Danh thiếp spam noidung.txt',
    command: 'spamcard [delay_ms] [số_lần] @user',
    bullets: [
      'Delay tối thiểu 100ms | tối đa 50 lần',
      'Nội dung lấy từ file noidung.txt',
      'Tin nhắn auto gỡ sau 30s'
    ],
    icon: '📇',
    color: ['#8b5cf6', '#3b82f6']
  },
  {
    title: '🔔 cay on',
    subtitle: 'Réo tên tự động mỗi 2.5s',
    command: 'cay on @user [ttl_s]',
    bullets: [
      'Tag liên tục target đã chọn',
      'cay stop để dừng ngay',
      'Có thể set TTL tự xoá theo giây'
    ],
    icon: '🔔',
    color: ['#ec4899', '#f43f5e']
  },
  {
    title: '🪢 treo',
    subtitle: 'Treo ngôn + chuyển bot sang TOOL',
    command: 'treo start [delay] [ttl]',
    bullets: [
      'Đọc tuần tự các đoạn trong ngôn.txt',
      'treo stop để tắt, treo status để xem tình trạng',
      'Tự OFF bot (chỉ nhận lệnh treo) khi đang treo'
    ],
    icon: '🪢',
    color: ['#f59e0b', '#ef4444']
  },
  {
    title: '🌀 spamname',
    subtitle: 'Spam đổi tên nhóm theo noidung.txt',
    command: 'spamname [delay_ms] [số_lần]',
    bullets: [
      'Tự lấy danh sách tên từ plugins/commands/noidung.txt',
      'Tự động bỏ qua thông báo rename do bot gây ra',
      'Delay tối thiểu 500ms, tối đa 100 lần'
    ],
    icon: '🌀',
    color: ['#14b8a6', '#0ea5e9']
  },
  {
    title: '📊 spampoll',
    subtitle: 'Spam tạo poll từ noidung.txt',
    command: 'spampoll [delay_ms] [số_lần] [Câu hỏi, Lựa chọn 1, ...]',
    bullets: [
      'Nếu không nhập câu hỏi sẽ tự lấy từng dòng trong noidung.txt',
      'Giới hạn 20 lựa chọn/poll • Delay tối thiểu 300ms',
      'Yêu cầu quyền admin bot + nhóm và API hỗ trợ createPoll'
    ],
    icon: '📊',
    color: ['#22d3ee', '#3b82f6']
  },
  {
    title: '⚔️ spamwar all',
    subtitle: 'Random spam name/card/cay/poll',
    command: 'spamwar all [số_lần] [delay_ms] @target',
    bullets: [
      'Auto random giữa spamname • spamcard • cay • spampoll',
      'Ưu tiên tag để chạy đủ hành động (thiếu tag sẽ chỉ spamname + spampoll)',
      'Giới hạn 60 lần, delay tối thiểu 300ms'
    ],
    icon: '⚔️',
    color: ['#facc15', '#fb7185']
  }
];

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

// Vẽ background với noise texture
function drawNoiseBackground(ctx, width, height) {
  // Base dark gradient
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(0.5, '#1e1b4b');
  bgGradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Add glowing orbs
  const orbs = [
    { x: width * 0.2, y: height * 0.15, r: 300, color: 'rgba(139, 92, 246, 0.15)' },
    { x: width * 0.8, y: height * 0.4, r: 250, color: 'rgba(236, 72, 153, 0.12)' },
    { x: width * 0.5, y: height * 0.7, r: 280, color: 'rgba(59, 130, 246, 0.1)' }
  ];

  orbs.forEach(orb => {
    const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
    gradient.addColorStop(0, orb.color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });

  // Grid pattern overlay
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.05)';
  ctx.lineWidth = 1;
  const gridSize = 50;
  for (let i = 0; i < width; i += gridSize) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }
  for (let i = 0; i < height; i += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
    ctx.stroke();
  }
}

// Vẽ card với glassmorphism effect
function drawGlassCard(ctx, x, y, w, h, colors, index) {
  const radius = 32;
  
  // Shadow layer
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 15;

  // Main card background
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  // Gradient fill
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, colors[0] + '40');
  gradient.addColorStop(1, colors[1] + '25');
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Glass border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner glow
  ctx.strokeStyle = `${colors[0]}50`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Top highlight
  ctx.beginPath();
  ctx.moveTo(x + radius, y + 2);
  ctx.lineTo(x + w - radius, y + 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Decorative corner accent
  const accentSize = 60;
  const accentGradient = ctx.createLinearGradient(x + w - accentSize, y, x + w, y + accentSize);
  accentGradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  accentGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = accentGradient;
  
  ctx.beginPath();
  ctx.moveTo(x + w - accentSize, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + accentSize);
  ctx.closePath();
  ctx.fill();
}

// Vẽ icon emoji với glow effect
function drawGlowingIcon(ctx, icon, x, y, size, glowColor) {
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 25;
  ctx.font = `${size}px Arial`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(icon, x, y);
  ctx.shadowBlur = 0;
}

function drawWarMenu() {
  const width = 1400;
  const headerHeight = 340;
  const cardHeight = 420;
  const cardSpacing = 50;
  const startY = 400;
  const cardsBlockHeight = MENU_SECTIONS.length * cardHeight + Math.max(0, MENU_SECTIONS.length - 1) * cardSpacing;
  const footerPadding = 350;
  const minHeight = 2000;
  const height = Math.max(minHeight, startY + cardsBlockHeight + footerPadding);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  drawNoiseBackground(ctx, width, height);

  // Header container
  const headerGradient = ctx.createLinearGradient(0, 0, width, headerHeight);
  headerGradient.addColorStop(0, 'rgba(139, 92, 246, 0.15)');
  headerGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.12)');
  headerGradient.addColorStop(1, 'rgba(59, 130, 246, 0.15)');
  ctx.fillStyle = headerGradient;
  ctx.fillRect(0, 0, width, headerHeight);

  // Title with multi-color gradient
  const titleGradient = ctx.createLinearGradient(width / 2 - 350, 0, width / 2 + 350, 0);
  titleGradient.addColorStop(0, '#fbbf24');
  titleGradient.addColorStop(0.3, '#f472b6');
  titleGradient.addColorStop(0.6, '#a78bfa');
  titleGradient.addColorStop(1, '#38bdf8');

  // Title shadow
  ctx.shadowColor = 'rgba(139, 92, 246, 0.8)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 8;
  
  ctx.fillStyle = titleGradient;
  ctx.font = 'bold 110px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('⚔️ WAR TOOL', width / 2, 140);
  
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Subtitle with glow
  ctx.shadowColor = 'rgba(244, 114, 182, 0.6)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 70px Arial';
  ctx.fillText('BONZ EDITION', width / 2, 220);
  ctx.shadowBlur = 0;

  // Description
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = '600 40px Arial';
  ctx.fillText('Spamcard • Cay on • Treo', width / 2, 285);

  // Decorative line
  const lineY = 320;
  const lineGradient = ctx.createLinearGradient(width * 0.2, lineY, width * 0.8, lineY);
  lineGradient.addColorStop(0, 'rgba(139, 92, 246, 0)');
  lineGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.8)');
  lineGradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.strokeStyle = lineGradient;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width * 0.2, lineY);
  ctx.lineTo(width * 0.8, lineY);
  ctx.stroke();

  // Cards
  let startYPos = startY;
  const cardWidth = width - 200;

  MENU_SECTIONS.forEach((section, index) => {
    const cardX = 100;
    const cardY = startYPos + index * (cardHeight + cardSpacing);

    drawGlassCard(ctx, cardX, cardY, cardWidth, cardHeight, section.color, index);

    // Icon with glow
    drawGlowingIcon(ctx, section.icon, cardX + 50, cardY + 90, 80, section.color[0]);

    // Title
    const titleGrad = ctx.createLinearGradient(cardX + 160, cardY + 40, cardX + 160, cardY + 100);
    titleGrad.addColorStop(0, '#ffffff');
    titleGrad.addColorStop(1, section.color[0]);
    ctx.fillStyle = titleGrad;
    ctx.font = 'bold 68px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(section.title, cardX + 160, cardY + 90);

    // Subtitle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '600 34px Arial';
    ctx.fillText(section.subtitle, cardX + 50, cardY + 150);

    // Command box with glow
    ctx.shadowColor = section.color[0] + '60';
    ctx.shadowBlur = 15;
    
    const cmdBoxX = cardX + 40;
    const cmdBoxY = cardY + 170;
    const cmdBoxW = cardWidth - 80;
    const cmdBoxH = 60;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.roundRect(cmdBoxX, cmdBoxY, cmdBoxW, cmdBoxH, 12);
    ctx.fill();
    
    ctx.strokeStyle = section.color[0] + '80';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Command text
    ctx.fillStyle = '#fef08a';
    ctx.font = '600 32px Consolas, monospace';
    ctx.fillText(section.command, cmdBoxX + 20, cmdBoxY + 40);

    // Bullets
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '30px Arial';
    section.bullets.forEach((bullet, i) => {
      // Bullet point with accent color
      ctx.fillStyle = section.color[0];
      ctx.fillText('●', cmdBoxX + 10, cmdBoxY + 110 + i * 50);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(bullet, cmdBoxX + 40, cmdBoxY + 110 + i * 50);
    });
  });

  // Footer section
  const footerY = height - 180;
  
  // Footer background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
  ctx.fillRect(0, footerY - 30, width, 210);

  // Tip box
  ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
  ctx.shadowBlur = 20;
  
  ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
  ctx.beginPath();
  ctx.roundRect(120, footerY, width - 240, 70, 16);
  ctx.fill();
  
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Tip text
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fef08a';
  ctx.font = '600 36px Arial';
  ctx.fillText('💡 Tip: Chạy xong nhớ treo stop / cay stop để giải phóng bot', width / 2, footerY + 45);

  // Warning text
  ctx.font = '28px Arial';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
  ctx.fillText('⚠️ Spam có trách nhiệm • Ưu tiên delay hợp lý để tránh khoá bot', width / 2, height - 80);

  // Version badge
  ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
  ctx.beginPath();
  ctx.roundRect(width / 2 - 80, height - 50, 160, 35, 18);
  ctx.fill();
  
  ctx.fillStyle = '#a78bfa';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('v2.0 Premium', width / 2, height - 25);

  return canvas.toBuffer('image/png');
}

module.exports.config = {
  name: 'menuwar',
  aliases: ['war', 'warhelp'],
  version: '2.1.0',
  role: 0,
  author: 'Cascade',
  description: 'Menu war Premium Canva với glassmorphism',
  category: 'Tiện ích',
  usage: 'war',
  cooldowns: 5,
  dependencies: { canvas: '' }
};

module.exports.run = async function ({ api, event }) {
  const { threadId, type } = event || {};
  if (!threadId) return;

  try {
    ensureTempDir();
    const img = drawWarMenu();
    const filePath = path.join(TEMP_DIR, `menuwar_${Date.now()}.png`);
    fs.writeFileSync(filePath, img);

    await api.sendMessage({
      msg: '⚔️ WAR TOOL BONZ PREMIUM • Powered by Canvas',
      attachments: [filePath],
      ttl: TTL
    }, threadId, type);

    setTimeout(() => {
      try { fs.existsSync(filePath) && fs.unlinkSync(filePath); } catch {}
    }, TTL);
  } catch (error) {
    console.log('[menuwar] lỗi tạo ảnh:', error.message);
    await api.sendMessage('⚔️ MENU WAR\n• spamcard\n• cay on\n• treo', threadId, type);
  }
};