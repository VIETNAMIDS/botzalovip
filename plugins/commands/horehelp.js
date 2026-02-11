const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const moment = require("moment-timezone");

module.exports.config = {
  name: "horoscopehelp",
  aliases: ["tuvihelp", "zodiachelp", "cunghd-help"],
  version: "2.0.0",
  role: 0,
  author: "Cascade Enhanced",
  description: "Hướng dẫn sử dụng lệnh horoscope với Canvas đẹp mắt",
  category: "Hướng dẫn",
  usage: "horoscopehelp",
  cooldowns: 3,
  dependencies: {
    "canvas": "",
    "moment-timezone": ""
  }
};

// Danh sách 12 cung hoàng đạo
const zodiacSigns = [
  { symbol: '♈', name: 'BẠCH DƯƠNG', english: 'Aries', date: '21/3 - 19/4' },
  { symbol: '♉', name: 'KIM NGƯU', english: 'Taurus', date: '20/4 - 20/5' },
  { symbol: '♊', name: 'SONG TỬ', english: 'Gemini', date: '21/5 - 20/6' },
  { symbol: '♋', name: 'CỰ GIẢI', english: 'Cancer', date: '21/6 - 22/7' },
  { symbol: '♌', name: 'SƯ TỬ', english: 'Leo', date: '23/7 - 22/8' },
  { symbol: '♍', name: 'XỬ NỮ', english: 'Virgo', date: '23/8 - 22/9' },
  { symbol: '♎', name: 'THIÊN BÌNH', english: 'Libra', date: '23/9 - 22/10' },
  { symbol: '♏', name: 'BỌ CẠP', english: 'Scorpio', date: '23/10 - 21/11' },
  { symbol: '♐', name: 'NHÂN MÃ', english: 'Sagittarius', date: '22/11 - 21/12' },
  { symbol: '♑', name: 'MA KẾT', english: 'Capricorn', date: '22/12 - 19/1' },
  { symbol: '♒', name: 'BẢO BÌNH', english: 'Aquarius', date: '20/1 - 18/2' },
  { symbol: '♓', name: 'SONG NGƯ', english: 'Pisces', date: '19/2 - 20/3' }
];

// Helper function: Tạo ảnh hướng dẫn horoscope
async function createHoroscopeHelpImage() {
  const canvas = createCanvas(1400, 2000);
  const ctx = canvas.getContext('2d');
  
  // Beautiful cosmic background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 2000);
  gradient.addColorStop(0, '#0f0c29');
  gradient.addColorStop(0.3, '#24243e');
  gradient.addColorStop(0.6, '#302b63');
  gradient.addColorStop(0.8, '#8360c3');
  gradient.addColorStop(1, '#2ebf91');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1400, 2000);
  
  // Magical stars and sparkles
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 1400;
    const y = Math.random() * 1000;
    const size = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Add some larger glowing stars
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 1400;
    const y = Math.random() * 2000;
    const size = Math.random() * 8 + 3;
    
    // Create glow effect
    const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2);
    glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(x, y, size * 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Elegant header background with gradient
  const headerGradient = ctx.createLinearGradient(0, 0, 0, 220);
  headerGradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
  headerGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
  
  ctx.fillStyle = headerGradient;
  ctx.fillRect(0, 0, 1400, 220);
  
  // Beautiful title with shadow and glow
  ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 64px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🌟 HƯỚNG DẪN HOROSCOPE 🌟', 700, 80);
  
  ctx.shadowBlur = 0;
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.font = 'bold 32px Arial';
  ctx.fillText('Xem tử vi cung hoàng đạo với Canvas đẹp mắt', 700, 130);
  
  ctx.font = '28px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillText('✨ Thông tin chi tiết về tính cách và dự đoán ✨', 700, 170);
  
  let yPos = 220;
  
  // Usage section with beautiful styling
  const usageGradient = ctx.createLinearGradient(50, yPos, 1350, yPos + 120);
  usageGradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  usageGradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  
  ctx.fillStyle = usageGradient;
  ctx.fillRect(50, yPos, 1300, 120);
  
  // Border
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, yPos, 1300, 120);
  
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 42px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('🎯 CÁCH SỬ DỤNG:', 80, yPos + 45);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Arial';
  ctx.fillText('• horoscope - Xem tử vi ngẫu nhiên', 100, yPos + 85);
  ctx.font = 'bold 28px Arial';
  ctx.fillText('• horoscope [tên cung] - Xem tử vi theo cung', 100, yPos + 115);
  
  yPos += 150;
  
  // Zodiac signs section
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(50, yPos, 1300, 80);
  
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 42px Arial';
  ctx.fillText('🌈 12 CUNG HOÀNG ĐẠO:', 80, yPos + 50);
  
  yPos += 100;
  
  // Draw zodiac signs in beautiful grid
  const cols = 2;
  const rows = Math.ceil(zodiacSigns.length / cols);
  
  for (let i = 0; i < zodiacSigns.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    const x = 80 + col * 620;
    const y = yPos + row * 110;
    
    const sign = zodiacSigns[i];
    
    // Beautiful sign background with gradient
    const signGradient = ctx.createLinearGradient(x - 15, y - 20, x + 585, y + 85);
    signGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    signGradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
    
    ctx.fillStyle = signGradient;
    ctx.fillRect(x - 15, y - 20, 600, 90);
    
    // Sign border with glow
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 15, y - 20, 600, 90);
    
    // Sign symbol with glow effect
    ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(sign.symbol, x, y + 30);
    
    ctx.shadowBlur = 0;
    
    // Sign name
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px Arial';
    ctx.fillText(sign.name, x + 60, y + 30);
    
    // English name and date
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`${sign.english} | ${sign.date}`, x, y + 60);
  }
  
  yPos += rows * 110 + 40;
  
  // Features section with beautiful styling (compact)
  const featuresGradient = ctx.createLinearGradient(50, yPos, 1350, yPos + 220);
  featuresGradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  featuresGradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  
  ctx.fillStyle = featuresGradient;
  ctx.fillRect(50, yPos, 1300, 220);
  
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, yPos, 1300, 220);
  
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 42px Arial';
  ctx.fillText('📊 THÔNG TIN TRONG TỬ VI:', 80, yPos + 50);
  
  const features = [
    '🔥 Thông tin cung: Symbol, tên, thời gian sinh',
    '✨ Đặc điểm tính cách: 4 đặc điểm chính của cung',
    '🍀 Thông tin may mắn: Số, màu, ngày may mắn',
    '🔮 Dự đoán: Tình yêu | Sự nghiệp | Tài chính | Sức khỏe'
  ];
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Arial';
  features.forEach((feature, index) => {
    ctx.fillText(`• ${feature}`, 100, yPos + 95 + index * 35);
  });
  
  yPos += 250;
  
  // Special features with beautiful styling (compact)
  const specialGradient = ctx.createLinearGradient(50, yPos, 1350, yPos + 160);
  specialGradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  specialGradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  
  ctx.fillStyle = specialGradient;
  ctx.fillRect(50, yPos, 1300, 160);
  
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, yPos, 1300, 160);
  
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 42px Arial';
  ctx.fillText('🎨 TÍNH NĂNG ĐẶC BIỆT:', 80, yPos + 50);
  
  const specialFeatures = [
    '✅ Giao diện đẹp mắt với màu sắc riêng',
    '✅ Hiệu ứng sao lấp lánh và layout chuyên nghiệp',
    '✅ Xem duoc chi tiet thong tin '
  ];
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  specialFeatures.forEach((feature, index) => {
    ctx.fillText(feature, 100, yPos + 90 + index * 30);
  });
  
  yPos += 180;
  
  // Beautiful footer with cosmic theme
  const footerGradient = ctx.createLinearGradient(0, yPos, 0, yPos + 120);
  footerGradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
  footerGradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
  
  ctx.fillStyle = footerGradient;
  ctx.fillRect(0, yPos, 1400, 120);
  
  // Add some sparkles to footer
  ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 1400;
    const y = yPos + Math.random() * 120;
    const size = Math.random() * 2 + 1;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('✨ Chúc bạn có những trải nghiệm thú vị với tử vi! ✨', 700, yPos + 70);
  
  ctx.shadowBlur = 0;
  
  return canvas.toBuffer('image/png');
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  
  try {
    // Create horoscope help image
    const imageBuffer = await createHoroscopeHelpImage();
    
    // Save temp image
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const imagePath = path.join(tempDir, `horoscope_help_${Date.now()}.png`);
    fs.writeFileSync(imagePath, imageBuffer);
    
    // Send image
    await api.sendMessage({
      msg: "🌟",
      attachments: [imagePath]
    }, threadId, type);
    
    // Delete temp image after 30 seconds
    setTimeout(() => {
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (e) {
        console.log('[HOROSCOPE HELP] Không thể xóa file tạm:', e.message);
      }
    }, 30000);
    
  } catch (error) {
    console.error('[HOROSCOPE HELP] Lỗi:', error);
    
    // Fallback text
    const fallbackMessage = `🌟 HƯỚNG DẪN HOROSCOPE 🌟

🎯 Cách dùng:
• horoscope - Tử vi ngẫu nhiên
• horoscope [tên cung] - Tử vi theo cung

🌈 12 cung: Bạch Dương, Kim Ngưu, Song Tử, Cự Giải, Sư Tử, Xử Nữ, Thiên Bình, Bọ Cạp, Nhân Mã, Ma Kết, Bảo Bình, Song Ngư

✨ Tính năng:mau sac dep , màu sắc riêng, de hieu va de sai`;
    
    return api.sendMessage(fallbackMessage, threadId, type);
  }
};
