const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

const AUTO_DELETE_TIME = 60000;
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');

try {
  const fontPath = path.join(process.cwd(), 'assets', 'fonts', 'UTMAvoBold.ttf');
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: 'UTMAvoBold' });
  }
} catch (err) {
  console.log('[CCCD] Không tìm thấy font tùy chỉnh, dùng font mặc định');
}

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const randomBirthDate = () => {
  const year = 1995 + Math.floor(Math.random() * 10);
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
};

const randomHometown = () => randomItem([
  'Phường Minh Khai, Q. Bắc Từ Liêm, Hà Nội',
  'Xã Phước Tỉnh, H. Long Điền, Bà Rịa - Vũng Tàu',
  'Thị trấn Sa Pa, H. Sa Pa, Lào Cai',
  'Phường 7, TP. Đà Lạt, Lâm Đồng',
  'Xã Phú Hồ, H. Phú Vang, Thừa Thiên Huế'
]);

const randomResidence = () => randomItem([
  'Chung cư Hoa Hồng, Q. 7, TP. Hồ Chí Minh',
  'Ngõ 96 Định Công, Q. Hoàng Mai, Hà Nội',
  'Khu đô thị Vạn Phúc, TP. Thủ Đức, TP. Hồ Chí Minh',
  'Khu phố 4, P. Linh Trung, TP. Thủ Đức',
  'KDC Mỹ Hạnh, H. Đức Hòa, Long An'
]);

const randomEthnicity = () => randomItem(['Kinh', 'Tày', 'Thái', 'Chăm', 'Nùng', 'Hoa']);
const randomNationality = () => 'Việt Nam';

const randomIssuePlace = () => randomItem([
  'Cục Cảnh sát QLHC về TTXH',
  'Phòng PC06 - Công an TP. Hà Nội',
  'Phòng PC06 - Công an TP. Hồ Chí Minh',
  'Công an tỉnh Quảng Ninh',
  'Công an tỉnh Đồng Nai'
]);

const randomIssueDate = () => {
  const start = new Date(2016, 0, 1).getTime();
  const end = Date.now();
  const date = new Date(start + Math.random() * (end - start));
  return date.toLocaleDateString('vi-VN');
};

function sanitizeGender(input) {
  if (!input) return 'Không xác định';
  const clean = input.trim().toLowerCase();
  if (clean.startsWith('nữ') || clean.includes('nu')) return 'Nữ';
  if (clean.startsWith('nam')) return 'Nam';
  return input.trim();
}

function sanitizeDate(raw) {
  if (!raw) return null;
  const clean = raw.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
  if (/^\d{4}$/.test(clean)) return `01/01/${clean}`;
  const digits = clean.replace(/[^0-9]/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  return clean;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = `${current}${word} `;
    if (ctx.measureText(test).width > maxWidth && current !== '') {
      lines.push(current.trim());
      current = `${word} `;
    } else {
      current = test;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

async function createCCCDImage(data) {
  const width = 1800;
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#e4ecff');
  bgGradient.addColorStop(1, '#fef6ff');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 70; i++) {
    const size = 30 + Math.random() * 120;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const cardX = 80;
  const cardY = 60;
  const cardWidth = width - 160;
  const cardHeight = height - 120;

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, 45);
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,105,180,0.6)';
  drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, 45);
  ctx.stroke();

  ctx.fillStyle = '#f44336';
  drawRoundRect(ctx, cardX + 30, cardY + 30, cardWidth - 60, 100, 25);
  ctx.fill();

  ctx.font = 'bold 46px "UTMAvoBold", Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', width / 2, cardY + 88);
  ctx.font = 'bold 28px "UTMAvoBold", Arial';
  ctx.fillText('Độc lập - Tự do - Hạnh phúc', width / 2, cardY + 125);

  const innerX = cardX + 50;
  const innerY = cardY + 160;
  const innerWidth = cardWidth - 100;
  const innerHeight = cardHeight - 220;

  ctx.fillStyle = '#ffffff';
  drawRoundRect(ctx, innerX, innerY, innerWidth, innerHeight, 20);
  ctx.fill();

  const avatarSize = 280;
  const avatarX = innerX + 60;
  const avatarY = innerY + 40;

  ctx.fillStyle = '#fce4ec';
  drawRoundRect(ctx, avatarX - 20, avatarY - 20, avatarSize + 40, avatarSize + 40, 30);
  ctx.fill();

  ctx.strokeStyle = '#ff80ab';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  try {
    if (data.avatar) {
      const avatar = await loadImage(data.avatar);
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } else {
      throw new Error('no avatar');
    }
  } catch (err) {
    ctx.fillStyle = '#ffafcc';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 140px "UTMAvoBold", Arial';
    ctx.textAlign = 'center';
    ctx.fillText((data.name || 'A')[0].toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 50);
  }
  ctx.restore();

  const infoX = avatarX + avatarSize + 100;
  let cursorY = innerY + 60;
  const lineGap = 60;

  const rows = [
    { label: 'Họ và tên', value: data.name },
    { label: 'Ngày sinh', value: data.birthDate },
    { label: 'Giới tính', value: data.gender },
    { label: 'Dân tộc', value: data.ethnicity },
    { label: 'Quốc tịch', value: data.nationality }
  ];

  rows.forEach((row) => {
    drawInfoRow(ctx, infoX, cursorY, row.label, row.value);
    cursorY += lineGap;
  });

  drawMultilineSection(ctx, infoX, cursorY, 'Quê quán', data.hometown);
  cursorY += 90;
  drawMultilineSection(ctx, infoX, cursorY, 'Thường trú', data.residence);
  cursorY += 90;

  ctx.fillStyle = '#f44336';
  ctx.font = 'bold 40px "UTMAvoBold", Arial';
  ctx.fillText('Số CCCD', infoX, cursorY);
  ctx.fillStyle = '#1f1e2a';
  ctx.font = 'bold 52px "UTMAvoBold", Arial';
  ctx.fillText(data.cccdNumber, infoX + 220, cursorY);
  cursorY += 80;

  drawInfoRow(ctx, infoX, cursorY, 'Ngày cấp', data.issueDate);
  cursorY += lineGap;
  drawInfoRow(ctx, infoX, cursorY, 'Nơi cấp', data.issuePlace);

  ctx.font = '22px "UTMAvoBold", Arial';
  ctx.fillStyle = '#8a8a9c';
  ctx.textAlign = 'center';
  ctx.fillText('Thiết kế bởi Bonz Bot • Chỉ dùng để giải trí', width / 2, height - 35);

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  const filePath = path.join(CACHE_DIR, `cccd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  return filePath;
}

function drawRoundRect(ctx, x, y, w, h, r) {
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

function drawInfoRow(ctx, x, y, label, value) {
  ctx.textAlign = 'left';
  ctx.font = '24px "UTMAvoBold", Arial';
  ctx.fillStyle = '#6c6b7a';
  ctx.fillText(`${label}:`, x, y);
  ctx.font = '30px "UTMAvoBold", Arial';
  ctx.fillStyle = '#1f1e2a';
  ctx.fillText(value, x + 220, y);
}

function drawMultilineSection(ctx, x, y, label, value) {
  ctx.font = '24px "UTMAvoBold", Arial';
  ctx.fillStyle = '#6c6b7a';
  ctx.fillText(`${label}:`, x, y);
  ctx.font = '28px "UTMAvoBold", Arial';
  ctx.fillStyle = '#1f1e2a';
  const lines = wrapText(ctx, value, 700);
  lines.forEach((line, idx) => ctx.fillText(line, x + 220, y + idx * 32));
}

function generateRandomCCCD() {
  let str = '';
  for (let i = 0; i < 12; i++) str += Math.floor(Math.random() * 10);
  return str;
}

function formatCCCD(num) {
  return num.replace(/(\d{3})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4');
}

module.exports.config = {
  name: 'cccd',
  version: '3.1.0',
  role: 0,
  author: 'Cascade',
  description: 'Tạo 1 ảnh CCCD Canva duy nhất, đủ thông tin nhưng chỉ để giải trí',
  category: 'Giải trí',
  usage: 'cccd | cccd Tên | Ngày sinh | Giới tính | Quê quán | Thường trú | Dân tộc | Quốc tịch | Ngày cấp | Nơi cấp',
  cooldowns: 5,
  dependencies: { canvas: '' }
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const mode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (mode === 'silent') return;

  const senderId = data?.uidFrom;
  if (!senderId) {
    return api.sendMessage('❌ Không xác định được người gửi.', threadId, type);
  }

  let targetId = senderId;
  let targetName = 'Bạn';

  if (data?.mentions?.length) {
    targetId = data.mentions[0].uid;
    targetName = data.mentions[0].displayName || 'Người được tag';
  } else if (data?.quote) {
    targetId = data.quote.uidFrom;
    targetName = 'Người được reply';
  }

  let userProfile = { name: targetName, avatar: null, gender: null };
  try {
    const info = await api.getUserInfo(targetId);
    const profile = info?.changed_profiles?.[targetId] || {};
    userProfile = {
      name: profile.displayName || targetName,
      avatar: profile.avatar || profile.avatarUrl || null,
      gender: profile.gender === 1 ? 'Nam' : profile.gender === 2 ? 'Nữ' : null
    };
  } catch (err) {
    console.error('[CCCD] Không lấy được thông tin người dùng:', err.message || err);
  }

  const raw = args.join(' ').trim();
  const parts = raw ? raw.split('|').map((p) => p.trim()).filter(Boolean) : [];

  const infoData = {
    name: parts[0] || userProfile.name || targetName,
    birthDate: sanitizeDate(parts[1]) || randomBirthDate(),
    gender: sanitizeGender(parts[2] || userProfile.gender || 'Không xác định'),
    hometown: parts[3] || randomHometown(),
    residence: parts[4] || randomResidence(),
    ethnicity: parts[5] || randomEthnicity(),
    nationality: parts[6] || randomNationality(),
    issueDate: sanitizeDate(parts[7]) || randomIssueDate(),
    issuePlace: parts[8] || randomIssuePlace(),
    avatar: userProfile.avatar,
    cccdNumber: formatCCCD(generateRandomCCCD())
  };

  try {
    const imagePath = await createCCCDImage(infoData);

    // Gửi ảnh với msg ngắn gọn như code testngu
    await api.sendMessage({
      msg: '🪪',
      attachments: [imagePath],
      ttl: AUTO_DELETE_TIME
    }, threadId, type);

    setTimeout(() => {
      try {
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      } catch (cleanupErr) {
        console.error('[CCCD] Không xóa được file tạm:', cleanupErr.message || cleanupErr);
      }
    }, AUTO_DELETE_TIME);
  } catch (error) {
    console.error('[CCCD] Lỗi tạo ảnh:', error);
    return api.sendMessage('❌ Không thể tạo ảnh CCCD cute lúc này, thử lại sau nhé.', threadId, type);
  }
};