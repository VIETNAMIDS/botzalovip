const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createCanvas, loadImage, registerFont } = require('canvas');

module.exports.config = {
  name: 'bank',
  aliases: ['qr', 'banking'],
  version: '5.0.0',
  role: 0,
  author: 'Cascade - Premium Canvas Generator',
  description: 'Hệ thống QR Banking với Canvas đẹp cho mọi lệnh',
  category: 'Tiện ích',
  usage: 'bank [số tiền] | bank setup | bank theme | bank banks | bank info',
  cooldowns: 3
};

const ADMIN_IDS = () => {
  const cfg = global.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot : [];
  return admins.map(String);
};

const DATA_DIR = path.join('modules', 'data', 'bank');
const BANK_CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CANVAS_OUTPUT_DIR = path.join(DATA_DIR, 'canvas_output');
const AVATAR_CACHE_DIR = path.join(DATA_DIR, 'avatars');

// Danh sách ngân hàng với logo URL
const BANK_LIST = {
  'MB': { 
    bin: '970422', 
    name: 'MB Bank', 
    fullName: 'Ngân hàng Quân đội',
    color: '#0052A5',
    logo: 'https://api.vietqr.io/img/MB.png'
  },
  'VCB': { 
    bin: '970436', 
    name: 'Vietcombank', 
    fullName: 'Ngân hàng Ngoại thương',
    color: '#007A33',
    logo: 'https://api.vietqr.io/img/VCB.png'
  },
  'TCB': { 
    bin: '970407', 
    name: 'Techcombank', 
    fullName: 'Ngân hàng Kỹ thương',
    color: '#E31E24',
    logo: 'https://api.vietqr.io/img/TCB.png'
  },
  'BIDV': { 
    bin: '970418', 
    name: 'BIDV', 
    fullName: 'Ngân hàng Đầu tư & Phát triển',
    color: '#004B95',
    logo: 'https://api.vietqr.io/img/BIDV.png'
  },
  'VTB': { 
    bin: '970415', 
    name: 'VietinBank', 
    fullName: 'Ngân hàng Công thương',
    color: '#ED1C24',
    logo: 'https://api.vietqr.io/img/ICB.png'
  },
  'ACB': { 
    bin: '970416', 
    name: 'ACB', 
    fullName: 'Ngân hàng Á Châu',
    color: '#005BAA',
    logo: 'https://api.vietqr.io/img/ACB.png'
  },
  'AGR': { 
    bin: '970405', 
    name: 'Agribank', 
    fullName: 'Ngân hàng Nông nghiệp',
    color: '#007D3A',
    logo: 'https://api.vietqr.io/img/AGR.png'
  },
  'TPB': { 
    bin: '970423', 
    name: 'TPBank', 
    fullName: 'Ngân hàng Tiên Phong',
    color: '#8B1FA9',
    logo: 'https://api.vietqr.io/img/TPB.png'
  },
  'VPB': { 
    bin: '970432', 
    name: 'VPBank', 
    fullName: 'Ngân hàng Việt Nam Thịnh Vượng',
    color: '#00873E',
    logo: 'https://api.vietqr.io/img/VPB.png'
  },
  'MSB': { 
    bin: '970426', 
    name: 'MSB', 
    fullName: 'Ngân hàng Hàng Hải',
    color: '#003DA5',
    logo: 'https://api.vietqr.io/img/MSB.png'
  },
  'VIB': { 
    bin: '970441', 
    name: 'VIB', 
    fullName: 'Ngân hàng Quốc tế',
    color: '#7F1B91',
    logo: 'https://api.vietqr.io/img/VIB.png'
  },
  'SHB': { 
    bin: '970443', 
    name: 'SHB', 
    fullName: 'Ngân hàng Sài Gòn - Hà Nội',
    color: '#003DA5',
    logo: 'https://api.vietqr.io/img/SHB.png'
  },
  'OCB': { 
    bin: '970448', 
    name: 'OCB', 
    fullName: 'Ngân hàng Phương Đông',
    color: '#7D1F82',
    logo: 'https://api.vietqr.io/img/OCB.png'
  },
  'SCB': { 
    bin: '970429', 
    name: 'SCB', 
    fullName: 'Ngân hàng Sài Gòn',
    color: '#0066B2',
    logo: 'https://api.vietqr.io/img/SCB.png'
  },
};

const DEFAULT_CONFIG = {
  account_no: '',
  account_name: '',
  bank_bin: '970422',
  bank_short: 'MB',
  template: 'compact2',
  theme: 1,
  default_amount: 0
};

const THEMES = {
  1: {
    name: 'Modern Blue',
    bg: '#0F172A',
    primary: '#3B82F6',
    secondary: '#60A5FA',
    text: '#FFFFFF',
    textSecondary: '#94A3B8',
    accent: '#8B5CF6',
    gradient: ['#1E40AF', '#3B82F6', '#60A5FA']
  },
  2: {
    name: 'Elegant Purple',
    bg: '#1E1B4B',
    primary: '#8B5CF6',
    secondary: '#A78BFA',
    text: '#FFFFFF',
    textSecondary: '#C4B5FD',
    accent: '#EC4899',
    gradient: ['#5B21B6', '#8B5CF6', '#A78BFA']
  },
  3: {
    name: 'Fresh Green',
    bg: '#064E3B',
    primary: '#10B981',
    secondary: '#34D399',
    text: '#FFFFFF',
    textSecondary: '#A7F3D0',
    accent: '#F59E0B',
    gradient: ['#047857', '#10B981', '#34D399']
  },
  4: {
    name: 'Sunset Orange',
    bg: '#7C2D12',
    primary: '#F97316',
    secondary: '#FB923C',
    text: '#FFFFFF',
    textSecondary: '#FDBA74',
    accent: '#EC4899',
    gradient: ['#C2410C', '#F97316', '#FB923C']
  }
};

// ============ HELPER FUNCTIONS ============

function ensureDir(dir = DATA_DIR) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadConfig() {
  ensureDir();
  try {
    if (fs.existsSync(BANK_CONFIG_FILE)) {
      const raw = fs.readFileSync(BANK_CONFIG_FILE, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw || '{}') };
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  ensureDir();
  try {
    fs.writeFileSync(BANK_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving config:', e);
    return false;
  }
}

function isAdmin(uid) {
  return ADMIN_IDS().includes(String(uid));
}

function getSenderName(event) {
  return event?.data?.dName || event?.senderName || 'Khách hàng';
}

function normalizeVietnamese(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase();
}

function formatCurrency(amount) {
  if (!amount || amount === 0) return 'Không giới hạn';
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
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

async function downloadImage(url, savePath) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  fs.writeFileSync(savePath, Buffer.from(response.data));
}

async function getUserAvatar(api, userId) {
  try {
    ensureDir(AVATAR_CACHE_DIR);
    const avatarPath = path.join(AVATAR_CACHE_DIR, `${userId}.png`);
    
    // Check cache
    if (fs.existsSync(avatarPath)) {
      const stats = fs.statSync(avatarPath);
      if (Date.now() - stats.mtimeMs < 24 * 60 * 60 * 1000) {
        const buffer = fs.readFileSync(avatarPath);
        if (buffer && buffer.length > 100) return avatarPath;
      }
    }

    // Try multiple avatar sources
    const urls = [
      `https://graph.zalo.me/v2.0/${userId}/picture?height=500&width=500`,
      `https://i.imgur.com/${userId}.png`, // Fallback
    ];

    for (const url of urls) {
      try {
        await downloadImage(url, avatarPath);
        const buffer = fs.readFileSync(avatarPath);
        if (buffer && buffer.length > 100) {
          const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
          const isJPG = buffer[0] === 0xFF && buffer[1] === 0xD8;
          if (isPNG || isJPG) return avatarPath;
        }
      } catch (e) {
        continue;
      }
    }
    
    return null;
  } catch (e) {
    console.error('Avatar error:', e.message);
    return null;
  }
}

async function generateQRCode(accountNo, accountName, bankBin, amount, message, template = 'compact2') {
  const cleanName = normalizeVietnamese(accountName);
  const cleanMessage = normalizeVietnamese(message);
  
  const url = `https://img.vietqr.io/image/${bankBin}-${accountNo}-${template}.png`;
  const response = await axios.get(url, {
    params: {
      amount: amount || 0,
      addInfo: cleanMessage,
      accountName: cleanName
    },
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  return Buffer.from(response.data);
}

// ============ CANVAS CREATORS ============

async function createQRCanvas(config, qrBuffer, avatarPath, userName, amount) {
  const width = 1080;
  const height = 1400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const theme = THEMES[config.theme] || THEMES[1];
  const bankInfo = BANK_LIST[config.bank_short] || BANK_LIST['MB'];

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, theme.gradient[0]);
  gradient.addColorStop(0.5, theme.gradient[1]);
  gradient.addColorStop(1, theme.gradient[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative elements
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(950, 120, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(100, 1300, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Header with glassmorphism
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 15;
  roundRect(ctx, 30, 30, width - 60, 200, 25);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Bank logo
  try {
    const logoBuffer = await axios.get(bankInfo.logo, { responseType: 'arraybuffer' });
    const logo = await loadImage(Buffer.from(logoBuffer.data));
    ctx.drawImage(logo, 60, 70, 100, 100);
  } catch (e) {
    // Fallback to color circle
    ctx.fillStyle = bankInfo.color;
    ctx.beginPath();
    ctx.arc(110, 130, 50, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bank info
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 46px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(bankInfo.name, 190, 110);
  
  ctx.font = '26px Arial';
  ctx.fillStyle = theme.textSecondary;
  ctx.fillText(bankInfo.fullName, 190, 150);
  
  ctx.font = 'italic 22px Arial';
  ctx.fillText('Chuyển khoản an toàn & nhanh chóng', 190, 190);

  // Main card with glassmorphism
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, 30, 260, width - 60, 950, 30);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // QR Code with enhanced shadow
  const qrImage = await loadImage(qrBuffer);
  const qrSize = 400;
  const qrX = (width - qrSize) / 2;
  const qrY = 320;
  
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, qrX - 15, qrY - 15, qrSize + 30, qrSize + 30, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  // User Avatar (enhanced)
  if (avatarPath && fs.existsSync(avatarPath)) {
    try {
      const buffer = fs.readFileSync(avatarPath);
      if (buffer && buffer.length > 100) {
        const avatar = await loadImage(avatarPath);
        const avatarSize = 110;
        const avatarX = (width - avatarSize) / 2;
        const avatarY = qrY + qrSize - 55;
        
        // Avatar shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 5;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        
        ctx.shadowColor = 'transparent';
        
        // Avatar border with gradient
        const borderGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
        borderGradient.addColorStop(0, theme.primary);
        borderGradient.addColorStop(1, theme.accent);
        ctx.strokeStyle = borderGradient;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
        ctx.stroke();
      }
    } catch (e) {
      console.log('Avatar skip:', e.message);
    }
  }

  // Info section with enhanced typography
  const infoY = 800;
  
  // Account number
  ctx.fillStyle = theme.bg;
  ctx.font = '30px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('SỐ TÀI KHOẢN', width/2, infoY);
  
  ctx.font = 'bold 52px Arial';
  ctx.fillStyle = theme.primary;
  ctx.fillText(config.account_no, width/2, infoY + 55);

  // Account name
  ctx.fillStyle = theme.bg;
  ctx.font = '28px Arial';
  ctx.fillText('CHỦ TÀI KHOẢN', width/2, infoY + 120);
  
  ctx.font = 'bold 38px Arial';
  ctx.fillText(config.account_name, width/2, infoY + 165);

  // Elegant divider
  const dividerY = infoY + 200;
  const dividerGradient = ctx.createLinearGradient(100, dividerY, width - 100, dividerY);
  dividerGradient.addColorStop(0, 'rgba(148, 163, 184, 0)');
  dividerGradient.addColorStop(0.5, 'rgba(148, 163, 184, 0.8)');
  dividerGradient.addColorStop(1, 'rgba(148, 163, 184, 0)');
  ctx.strokeStyle = dividerGradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(100, dividerY);
  ctx.lineTo(width - 100, dividerY);
  ctx.stroke();

  // Amount with highlight
  ctx.fillStyle = theme.bg;
  ctx.font = '28px Arial';
  ctx.fillText('SỐ TIỀN', width/2, infoY + 250);
  
  ctx.font = 'bold 50px Arial';
  const amountGradient = ctx.createLinearGradient(0, infoY + 290, width, infoY + 290);
  amountGradient.addColorStop(0, theme.accent);
  amountGradient.addColorStop(1, theme.primary);
  ctx.fillStyle = amountGradient;
  ctx.fillText(formatCurrency(amount), width/2, infoY + 305);

  // Transfer content
  ctx.fillStyle = theme.bg;
  ctx.font = '28px Arial';
  ctx.fillText('NỘI DUNG CHUYỂN KHOẢN', width/2, infoY + 360);
  
  ctx.font = 'bold 34px Arial';
  ctx.fillText(userName, width/2, infoY + 400);

  // Footer with icons
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '26px Arial';
  ctx.fillText('⚠️ Vui lòng ghi đúng nội dung để xác nhận', width/2, 1270);
  
  ctx.font = 'italic 22px Arial';
  ctx.fillText('🔒 Quét mã QR hoặc chuyển khoản thủ công', width/2, 1320);

  // Watermark
  ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
  ctx.font = 'italic 18px Arial';
  ctx.fillText(`Generated by Cascade Banking System v5.0`, width/2, 1365);

  return canvas.toBuffer('image/png');
}

async function createSetupCanvas(config, bankInfo) {
  const width = 1080;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const theme = THEMES[config.theme] || THEMES[1];

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, theme.gradient[0]);
  gradient.addColorStop(1, theme.gradient[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative circles
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(900, 100, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(180, 700, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Main card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 30;
  roundRect(ctx, 50, 50, width - 100, height - 100, 30);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Success icon
  ctx.fillStyle = theme.primary;
  ctx.beginPath();
  ctx.arc(width/2, 180, 70, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(width/2 - 30, 180);
  ctx.lineTo(width/2 - 10, 200);
  ctx.lineTo(width/2 + 30, 160);
  ctx.stroke();

  // Title
  ctx.fillStyle = theme.bg;
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('THIẾT LẬP THÀNH CÔNG', width/2, 310);

  // Bank logo
  try {
    const logoBuffer = await axios.get(bankInfo.logo, { responseType: 'arraybuffer' });
    const logo = await loadImage(Buffer.from(logoBuffer.data));
    ctx.drawImage(logo, width/2 - 60, 350, 120, 120);
  } catch (e) {
    ctx.fillStyle = bankInfo.color;
    ctx.beginPath();
    ctx.arc(width/2, 410, 60, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bank info
  ctx.fillStyle = theme.primary;
  ctx.font = 'bold 42px Arial';
  ctx.fillText(bankInfo.name, width/2, 520);

  ctx.fillStyle = theme.bg;
  ctx.font = '32px Arial';
  ctx.fillText(`STK: ${config.account_no}`, width/2, 580);
  
  ctx.font = 'bold 36px Arial';
  ctx.fillText(config.account_name, width/2, 635);

  // Footer
  ctx.fillStyle = theme.textSecondary;
  ctx.font = 'italic 24px Arial';
  ctx.fillText('💡 Dùng lệnh "bank" để tạo QR chuyển khoản', width/2, 700);

  return canvas.toBuffer('image/png');
}

async function createThemeCanvas(themeNum) {
  const width = 1080;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const theme = THEMES[themeNum];

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, theme.gradient[0]);
  gradient.addColorStop(0.5, theme.gradient[1]);
  gradient.addColorStop(1, theme.gradient[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative circles
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = theme.accent;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, 100 + Math.random() * 100, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Main card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 30;
  roundRect(ctx, 50, 50, width - 100, height - 100, 30);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Title
  ctx.fillStyle = theme.bg;
  ctx.font = 'bold 60px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🎨 THEME ĐÃ ĐỔI', width/2, 150);

  // Theme preview boxes
  const boxSize = 200;
  const boxY = 250;
  
  for (let i = 0; i < 4; i++) {
    const t = THEMES[i + 1];
    const boxX = 140 + i * 230;
    
    // Box with theme gradient
    const boxGradient = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxSize);
    boxGradient.addColorStop(0, t.gradient[0]);
    boxGradient.addColorStop(1, t.gradient[2]);
    ctx.fillStyle = boxGradient;
    
    if (i + 1 === themeNum) {
      ctx.shadowColor = theme.primary;
      ctx.shadowBlur = 20;
    }
    
    roundRect(ctx, boxX, boxY, boxSize, boxSize, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    
    // Number
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 48px Arial';
    ctx.fillText(i + 1, boxX + boxSize/2, boxY + boxSize/2 + 15);
    
    // Checkmark for selected
    if (i + 1 === themeNum) {
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(boxX + boxSize - 30, boxY + 30, 25, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(boxX + boxSize - 40, boxY + 30);
      ctx.lineTo(boxX + boxSize - 32, boxY + 38);
      ctx.lineTo(boxX + boxSize - 20, boxY + 22);
      ctx.stroke();
    }
  }

  // Theme names
  const names = ['Modern Blue', 'Elegant Purple', 'Fresh Green', 'Sunset Orange'];
  ctx.fillStyle = theme.bg;
  ctx.font = '24px Arial';
  for (let i = 0; i < 4; i++) {
    const boxX = 140 + i * 230;
    ctx.fillText(names[i], boxX + boxSize/2, boxY + boxSize + 45);
  }

  // Selected theme info
  ctx.fillStyle = theme.primary;
  ctx.font = 'bold 40px Arial';
  ctx.fillText(`Theme ${themeNum}: ${theme.name}`, width/2, 600);

  // Color palette preview
  const paletteY = 650;
  const colors = [theme.primary, theme.secondary, theme.accent];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(width/2 - 120 + i * 120, paletteY, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  // Footer
  ctx.fillStyle = theme.textSecondary;
  ctx.font = 'italic 24px Arial';
  ctx.fillText('✨ Theme mới sẽ áp dụng cho mọi QR Code', width/2, 750);

  return canvas.toBuffer('image/png');
}

async function createBanksCanvas(currentBank) {
  const width = 1080;
  const height = 1600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const theme = THEMES[1];

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1E3A8A');
  gradient.addColorStop(1, '#7C3AED');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative pattern
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, 50, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Header card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 25;
  roundRect(ctx, 40, 40, width - 80, 150, 25);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Title
  ctx.fillStyle = '#1E3A8A';
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🏦 NGÂN HÀNG HỖ TRỢ', width/2, 125);

  // Bank grid
  const banks = Object.entries(BANK_LIST);
  const cols = 2;
  const rows = Math.ceil(banks.length / cols);
  const cardWidth = 480;
  const cardHeight = 180;
  const startX = 60;
  const startY = 230;
  const gapX = 540;
  const gapY = 200;

  for (let i = 0; i < banks.length; i++) {
    const [code, info] = banks[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * gapX;
    const y = startY + row * gapY;

    // Card background
    const isSelected = code === currentBank;
    ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.9)';
    
    if (isSelected) {
      ctx.shadowColor = info.color;
      ctx.shadowBlur = 20;
    }
    
    roundRect(ctx, x, y, cardWidth, cardHeight, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Bank logo
    try {
      const logoBuffer = await axios.get(info.logo, { responseType: 'arraybuffer', timeout: 5000 });
      const logo = await loadImage(Buffer.from(logoBuffer.data));
      ctx.drawImage(logo, x + 20, y + 30, 100, 100);
    } catch (e) {
      // Fallback circle
      ctx.fillStyle = info.color;
      ctx.beginPath();
      ctx.arc(x + 70, y + 80, 50, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(code, x + 70, y + 90);
    }

    // Bank info
    ctx.textAlign = 'left';
    ctx.fillStyle = info.color;
    ctx.font = 'bold 36px Arial';
    ctx.fillText(code, x + 140, y + 60);

    ctx.fillStyle = '#1E293B';
    ctx.font = '24px Arial';
    ctx.fillText(info.name, x + 140, y + 95);

    ctx.fillStyle = '#64748B';
    ctx.font = '20px Arial';
    ctx.fillText(info.fullName, x + 140, y + 125);

    // Selected indicator
    if (isSelected) {
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.arc(x + cardWidth - 30, y + 30, 20, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + cardWidth - 38, y + 30);
      ctx.lineTo(x + cardWidth - 32, y + 36);
      ctx.lineTo(x + cardWidth - 22, y + 24);
      ctx.stroke();
    }

    // BIN info
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'italic 18px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`BIN: ${info.bin}`, x + cardWidth - 20, y + cardHeight - 20);
  }

  // Footer
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('💡 Dùng "bank setup" để đổi ngân hàng', width/2, height - 50);

  return canvas.toBuffer('image/png');
}

async function createInfoCanvas(config) {
  const width = 1080;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const theme = THEMES[config.theme] || THEMES[1];
  const bankInfo = BANK_LIST[config.bank_short] || BANK_LIST['MB'];

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, theme.gradient[0]);
  gradient.addColorStop(1, theme.gradient[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative elements
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(900, 150, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(180, 850, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Main card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 30;
  roundRect(ctx, 50, 50, width - 100, height - 100, 30);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Title
  ctx.fillStyle = theme.bg;
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('ℹ️ CẤU HÌNH HỆ THỐNG', width/2, 140);

  // Bank logo
  try {
    const logoBuffer = await axios.get(bankInfo.logo, { responseType: 'arraybuffer' });
    const logo = await loadImage(Buffer.from(logoBuffer.data));
    ctx.drawImage(logo, width/2 - 75, 180, 150, 150);
  } catch (e) {
    ctx.fillStyle = bankInfo.color;
    ctx.beginPath();
    ctx.arc(width/2, 255, 75, 0, Math.PI * 2);
    ctx.fill();
  }

  // Info sections
  const sections = [
    { icon: '🏦', label: 'Ngân hàng', value: bankInfo.name },
    { icon: '📱', label: 'Số tài khoản', value: config.account_no || 'Chưa thiết lập' },
    { icon: '👤', label: 'Chủ tài khoản', value: config.account_name || 'Chưa thiết lập' },
    { icon: '🎨', label: 'Theme', value: `${config.theme} - ${theme.name}` },
    { icon: '💰', label: 'Số tiền mặc định', value: formatCurrency(config.default_amount) }
  ];

  let yPos = 380;
  for (const section of sections) {
    // Icon background
    ctx.fillStyle = theme.primary + '20';
    ctx.beginPath();
    ctx.arc(120, yPos, 35, 0, Math.PI * 2);
    ctx.fill();

    // Icon
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(section.icon, 120, yPos + 15);

    // Label
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '26px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(section.label, 180, yPos - 10);

    // Value
    ctx.fillStyle = theme.bg;
    ctx.font = 'bold 32px Arial';
    ctx.fillText(section.value, 180, yPos + 30);

    yPos += 100;
  }

  // Footer with commands
  ctx.fillStyle = theme.primary;
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('📝 Lệnh hữu ích:', width/2, 840);

  ctx.fillStyle = theme.bg;
  ctx.font = '22px Arial';
  ctx.fillText('bank setup • bank theme • bank banks', width/2, 880);

  return canvas.toBuffer('image/png');
}

// ============ MAIN COMMAND HANDLER ============

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event.authorId;
  const senderName = getSenderName(event);
  const sub = (args[0] || '').toLowerCase();

  // ========== ADMIN: bank setup ==========
  if (sub === 'setup') {
    if (!isAdmin(senderId)) {
      return api.sendMessage(`${senderName} 🚫 Chỉ Admin mới có thể thiết lập!`, threadId, type);
    }

    if (args.length < 4) {
      // Show setup guide with canvas
      const config = loadConfig();
      const theme = THEMES[config.theme] || THEMES[1];
      
      const width = 1080;
      const height = 900;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Background
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, theme.gradient[0]);
      gradient.addColorStop(1, theme.gradient[2]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Card
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      roundRect(ctx, 40, 40, width - 80, height - 80, 25);
      ctx.fill();

      // Title
      ctx.fillStyle = theme.bg;
      ctx.font = 'bold 56px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('📝 HƯỚNG DẪN THIẾT LẬP', width/2, 130);

      // Command format
      ctx.fillStyle = theme.primary;
      ctx.font = 'bold 36px Arial';
      ctx.fillText('bank setup <STK> <Mã NH> <Tên TK>', width/2, 220);

      // Example
      ctx.fillStyle = theme.bg;
      ctx.font = '28px Arial';
      ctx.fillText('Ví dụ:', width/2, 290);
      
      ctx.fillStyle = theme.accent;
      ctx.font = 'bold 32px Arial';
      ctx.fillText('bank setup 0376841471 MB PHAN THE AN', width/2, 340);

      // Bank list preview
      ctx.fillStyle = theme.bg;
      ctx.font = 'bold 32px Arial';
      ctx.fillText('🏦 Một số ngân hàng phổ biến:', width/2, 420);

      const topBanks = Object.entries(BANK_LIST).slice(0, 8);
      ctx.font = '26px Arial';
      ctx.textAlign = 'left';
      
      let yPos = 480;
      for (let i = 0; i < topBanks.length; i += 2) {
        const left = topBanks[i];
        const right = topBanks[i + 1];
        
        ctx.fillStyle = theme.primary;
        ctx.fillText(`• ${left[0]}`, 120, yPos);
        ctx.fillStyle = theme.bg;
        ctx.fillText(left[1].name, 220, yPos);
        
        if (right) {
          ctx.fillStyle = theme.primary;
          ctx.fillText(`• ${right[0]}`, 580, yPos);
          ctx.fillStyle = theme.bg;
          ctx.fillText(right[1].name, 680, yPos);
        }
        
        yPos += 50;
      }

      // Footer
      ctx.fillStyle = theme.textSecondary;
      ctx.font = 'italic 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('💡 Gõ "bank banks" để xem đầy đủ danh sách', width/2, 800);

      const buffer = canvas.toBuffer('image/png');
      ensureDir(CANVAS_OUTPUT_DIR);
      const filePath = path.join(CANVAS_OUTPUT_DIR, `setup_guide_${Date.now()}.png`);
      fs.writeFileSync(filePath, buffer);

      await api.sendMessage({
        msg: '📝 Hướng dẫn thiết lập ngân hàng:',
        attachments: [filePath]
      }, threadId, type);

      setTimeout(() => {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
      }, 30000);
      return;
    }

    const accountNo = args[1];
    const bankCode = args[2].toUpperCase();
    const accountName = args.slice(3).join(' ').toUpperCase();

    const bankInfo = BANK_LIST[bankCode];
    if (!bankInfo) {
      return api.sendMessage(
        `${senderName} ❌ Mã ngân hàng "${bankCode}" không hợp lệ!\n` +
        `Gõ "bank banks" để xem danh sách.`,
        threadId, type
      );
    }

    const config = loadConfig();
    config.account_no = accountNo;
    config.account_name = accountName;
    config.bank_bin = bankInfo.bin;
    config.bank_short = bankCode;

    if (saveConfig(config)) {
      await api.sendMessage(`${senderName} ⏳ Đang tạo xác nhận...`, threadId, type);

      try {
        const canvasBuffer = await createSetupCanvas(config, bankInfo);
        ensureDir(CANVAS_OUTPUT_DIR);
        const filePath = path.join(CANVAS_OUTPUT_DIR, `setup_${Date.now()}.png`);
        fs.writeFileSync(filePath, canvasBuffer);

        await api.sendMessage({
          msg: '✅ Thiết lập thành công! Hệ thống đã sẵn sàng.',
          attachments: [filePath]
        }, threadId, type);

        setTimeout(() => {
          try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
        }, 30000);
      } catch (e) {
        console.error('Canvas error:', e);
        api.sendMessage(
          `✅ Thiết lập thành công!\n\n` +
          `🏦 ${bankInfo.name}\n` +
          `📱 STK: ${accountNo}\n` +
          `👤 ${accountName}`,
          threadId, type
        );
      }
    }
    return;
  }

  // ========== ADMIN: bank theme ==========
  if (sub === 'theme') {
    if (!isAdmin(senderId)) {
      return api.sendMessage(`${senderName} 🚫 Chỉ Admin mới có thể đổi theme!`, threadId, type);
    }

    const themeNum = parseInt(args[1]);
    if (!themeNum || themeNum < 1 || themeNum > 4) {
      return api.sendMessage(
        `🎨 CHỌN THEME:\n\n` +
        `1️⃣ Modern Blue - Xanh hiện đại\n` +
        `2️⃣ Elegant Purple - Tím thanh lịch\n` +
        `3️⃣ Fresh Green - Xanh lá tươi mát\n` +
        `4️⃣ Sunset Orange - Cam hoàng hôn\n\n` +
        `💡 Dùng: bank theme <1-4>`,
        threadId, type
      );
    }

    const config = loadConfig();
    config.theme = themeNum;
    
    if (saveConfig(config)) {
      await api.sendMessage(`${senderName} ⏳ Đang tạo preview theme...`, threadId, type);

      try {
        const canvasBuffer = await createThemeCanvas(themeNum);
        ensureDir(CANVAS_OUTPUT_DIR);
        const filePath = path.join(CANVAS_OUTPUT_DIR, `theme_${Date.now()}.png`);
        fs.writeFileSync(filePath, canvasBuffer);

        await api.sendMessage({
          msg: `✨ Theme đã được thay đổi thành công!`,
          attachments: [filePath]
        }, threadId, type);

        setTimeout(() => {
          try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
        }, 30000);
      } catch (e) {
        console.error('Canvas error:', e);
        api.sendMessage(`✅ Đã đổi theme thành: Theme ${themeNum}`, threadId, type);
      }
    }
    return;
  }

  // ========== bank banks ==========
  if (sub === 'banks') {
    await api.sendMessage(`${senderName} ⏳ Đang tải danh sách ngân hàng...`, threadId, type);

    try {
      const config = loadConfig();
      const canvasBuffer = await createBanksCanvas(config.bank_short);
      ensureDir(CANVAS_OUTPUT_DIR);
      const filePath = path.join(CANVAS_OUTPUT_DIR, `banks_${Date.now()}.png`);
      fs.writeFileSync(filePath, canvasBuffer);

      await api.sendMessage({
        msg: '🏦 Danh sách ngân hàng được hỗ trợ:',
        attachments: [filePath]
      }, threadId, type);

      setTimeout(() => {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
      }, 30000);
    } catch (e) {
      console.error('Canvas error:', e);
      const bankListStr = Object.entries(BANK_LIST)
        .map(([code, info]) => `• ${code.padEnd(6)} - ${info.name}`)
        .join('\n');
      api.sendMessage(`🏦 NGÂN HÀNG HỖ TRỢ:\n\n${bankListStr}`, threadId, type);
    }
    return;
  }

  // ========== bank info ==========
  if (sub === 'info') {
    await api.sendMessage(`${senderName} ⏳ Đang tải thông tin...`, threadId, type);

    try {
      const config = loadConfig();
      const canvasBuffer = await createInfoCanvas(config);
      ensureDir(CANVAS_OUTPUT_DIR);
      const filePath = path.join(CANVAS_OUTPUT_DIR, `info_${Date.now()}.png`);
      fs.writeFileSync(filePath, canvasBuffer);

      await api.sendMessage({
        msg: 'ℹ️ Thông tin cấu hình hệ thống:',
        attachments: [filePath]
      }, threadId, type);

      setTimeout(() => {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
      }, 30000);
    } catch (e) {
      console.error('Canvas error:', e);
      const config = loadConfig();
      const bankInfo = BANK_LIST[config.bank_short] || { name: 'Unknown' };
      api.sendMessage(
        `ℹ️ CẤU HÌNH HIỆN TẠI:\n\n` +
        `🏦 ${bankInfo.name}\n` +
        `📱 STK: ${config.account_no || 'Chưa thiết lập'}\n` +
        `👤 ${config.account_name || 'Chưa thiết lập'}\n` +
        `🎨 Theme: ${config.theme}\n` +
        `💰 Mặc định: ${formatCurrency(config.default_amount)}`,
        threadId, type
      );
    }
    return;
  }

  // ========== USER: bank [số tiền] ==========
  try {
    const config = loadConfig();
    
    if (!config.account_no) {
      if (isAdmin(senderId)) {
        return api.sendMessage(
          `⚠️ Chưa thiết lập!\nDùng: bank setup <STK> <Mã> <Tên>`,
          threadId, type
        );
      } else {
        return api.sendMessage(
          `${senderName} ⚠️ Hệ thống chưa được cấu hình.\nLiên hệ Admin để thiết lập.`,
          threadId, type
        );
      }
    }

    let amount = config.default_amount;
    if (sub && !isNaN(sub)) {
      amount = parseInt(sub);
    }

    await api.sendMessage(`${senderName} ⏳ Đang tạo QR Canvas Premium...`, threadId, type);

    const qrBuffer = await generateQRCode(
      config.account_no,
      config.account_name,
      config.bank_bin,
      amount,
      senderName,
      config.template
    );

    const avatarPath = await getUserAvatar(api, senderId);
    const canvasBuffer = await createQRCanvas(config, qrBuffer, avatarPath, senderName, amount);

    ensureDir(CANVAS_OUTPUT_DIR);
    const outputPath = path.join(CANVAS_OUTPUT_DIR, `qr_${senderId}_${Date.now()}.png`);
    fs.writeFileSync(outputPath, canvasBuffer);

    await api.sendMessage({
      msg: `✨ QR CODE CHUYỂN KHOẢN\n\n👤 ${senderName}\n💰 ${formatCurrency(amount)}\n\n🔒 Quét mã QR để chuyển khoản an toàn!`,
      attachments: [outputPath]
    }, threadId, type);

    setTimeout(() => {
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) {}
    }, 30000);

  } catch (e) {
    console.error('Error:', e);
    return api.sendMessage(
      `${senderName} ❌ Lỗi khi tạo QR!\n\n${e.message}`,
      threadId, type
    );
  }
};