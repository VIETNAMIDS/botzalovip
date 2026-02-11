const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

module.exports.config = {
  name: 'horoscope',
  aliases: ['tuvi', 'zodiac', 'cunghd'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Xem tử vi cung hoàng đạo với giao diện Canvas đẹp mắt. Gõ "horoscope help" để xem hướng dẫn!',
  category: 'Giải trí',
  usage: 'horoscope [tên cung hoàng đạo | help]',
  cooldowns: 3,
  dependencies: {
    'canvas': ''
  }
};

// Dữ liệu 12 cung hoàng đạo
const zodiacData = {
  'bạch dương': {
    name: 'Bạch Dương',
    english: 'Aries',
    symbol: '♈',
    element: 'Hỏa',
    dates: '21/3 - 19/4',
    color: '#FF6B6B',
    traits: ['Năng động', 'Dũng cảm', 'Lãnh đạo', 'Nóng tính'],
    lucky: { number: 7, color: 'Đỏ', day: 'Thứ Ba' }
  },
  'kim ngưu': {
    name: 'Kim Ngưu',
    english: 'Taurus',
    symbol: '♉',
    element: 'Thổ',
    dates: '20/4 - 20/5',
    color: '#4ECDC4',
    traits: ['Kiên định', 'Thực tế', 'Trung thành', 'Cố chấp'],
    lucky: { number: 6, color: 'Xanh lá', day: 'Thứ Sáu' }
  },
  'song tử': {
    name: 'Song Tử',
    english: 'Gemini',
    symbol: '♊',
    element: 'Khí',
    dates: '21/5 - 20/6',
    color: '#FFE66D',
    traits: ['Thông minh', 'Linh hoạt', 'Giao tiếp tốt', 'Hay thay đổi'],
    lucky: { number: 5, color: 'Vàng', day: 'Thứ Tư' }
  },
  'cự giải': {
    name: 'Cự Giải',
    english: 'Cancer',
    symbol: '♋',
    element: 'Thủy',
    dates: '21/6 - 22/7',
    color: '#A8E6CF',
    traits: ['Nhạy cảm', 'Quan tâm', 'Trực giác tốt', 'Dễ tổn thương'],
    lucky: { number: 2, color: 'Bạc', day: 'Thứ Hai' }
  },
  'sư tử': {
    name: 'Sư Tử',
    english: 'Leo',
    symbol: '♌',
    element: 'Hỏa',
    dates: '23/7 - 22/8',
    color: '#FFB74D',
    traits: ['Tự tin', 'Hào phóng', 'Sáng tạo', 'Kiêu ngạo'],
    lucky: { number: 1, color: 'Vàng kim', day: 'Chủ Nhật' }
  },
  'xử nữ': {
    name: 'Xử Nữ',
    english: 'Virgo',
    symbol: '♍',
    element: 'Thổ',
    dates: '23/8 - 22/9',
    color: '#81C784',
    traits: ['Tỉ mỉ', 'Hoàn hảo', 'Thực tế', 'Khó tính'],
    lucky: { number: 6, color: 'Xanh navy', day: 'Thứ Tư' }
  },
  'thiên bình': {
    name: 'Thiên Bình',
    english: 'Libra',
    symbol: '♎',
    element: 'Khí',
    dates: '23/9 - 22/10',
    color: '#F8BBD9',
    traits: ['Cân bằng', 'Công bằng', 'Hòa hợp', 'Do dự'],
    lucky: { number: 7, color: 'Hồng', day: 'Thứ Sáu' }
  },
  'bọ cạp': {
    name: 'Bọ Cạp',
    english: 'Scorpio',
    symbol: '♏',
    element: 'Thủy',
    dates: '23/10 - 21/11',
    color: '#8E24AA',
    traits: ['Bí ẩn', 'Quyết đoán', 'Trung thành', 'Báo thù'],
    lucky: { number: 8, color: 'Đỏ đậm', day: 'Thứ Ba' }
  },
  'nhân mã': {
    name: 'Nhân Mã',
    english: 'Sagittarius',
    symbol: '♐',
    element: 'Hỏa',
    dates: '22/11 - 21/12',
    color: '#FF7043',
    traits: ['Tự do', 'Phiêu lưu', 'Lạc quan', 'Bốc đồng'],
    lucky: { number: 9, color: 'Tím', day: 'Thứ Năm' }
  },
  'ma kết': {
    name: 'Ma Kết',
    english: 'Capricorn',
    symbol: '♑',
    element: 'Thổ',
    dates: '22/12 - 19/1',
    color: '#5D4037',
    traits: ['Tham vọng', 'Kỷ luật', 'Thực tế', 'Nghiêm túc'],
    lucky: { number: 10, color: 'Nâu', day: 'Thứ Bảy' }
  },
  'bảo bình': {
    name: 'Bảo Bình',
    english: 'Aquarius',
    symbol: '♒',
    element: 'Khí',
    dates: '20/1 - 18/2',
    color: '#29B6F6',
    traits: ['Độc lập', 'Sáng tạo', 'Nhân đạo', 'Cố chấp'],
    lucky: { number: 11, color: 'Xanh dương', day: 'Thứ Bảy' }
  },
  'song ngư': {
    name: 'Song Ngư',
    english: 'Pisces',
    symbol: '♓',
    element: 'Thủy',
    dates: '19/2 - 20/3',
    color: '#AB47BC',
    traits: ['Nhạy cảm', 'Sáng tạo', 'Trực giác', 'Mơ mộng'],
    lucky: { number: 12, color: 'Xanh biển', day: 'Thứ Năm' }
  }
};

// Tử vi ngẫu nhiên cho từng khía cạnh
const horoscopeTexts = {
  love: [
    'Tình yêu đang chờ đợi bạn ở góc phố tiếp theo! 💕',
    'Hôm nay là ngày tuyệt vời để thể hiện tình cảm với người ấy 💖',
    'Có thể bạn sẽ gặp được người đặc biệt trong tuần này 🌹',
    'Tình yêu cũ có thể quay trở lại, hãy cân nhắc kỹ 💭',
    'Đừng vội vàng trong tình cảm, hãy để mọi thứ diễn ra tự nhiên 🌸',
    'Một cuộc hẹn hò bất ngờ có thể thay đổi cuộc đời bạn 💫'
  ],
  career: [
    'Cơ hội thăng tiến đang đến gần, hãy chuẩn bị sẵn sàng! 📈',
    'Đồng nghiệp sẽ hỗ trợ bạn rất nhiều trong dự án sắp tới 🤝',
    'Hãy tin tưởng vào khả năng của mình, thành công đang chờ đợi 🎯',
    'Một quyết định quan trọng trong công việc sẽ mang lại kết quả tốt 💼',
    'Đừng ngại thể hiện ý tưởng sáng tạo của mình 💡',
    'Thời điểm này thích hợp để học hỏi kỹ năng mới 📚'
  ],
  money: [
    'Tài chính ổn định, có thể có khoản thu nhập bất ngờ 💰',
    'Hãy tiết kiệm và đầu tư thông minh trong thời gian này 📊',
    'Tránh chi tiêu không cần thiết, hãy tập trung vào mục tiêu dài hạn 🎯',
    'Một cơ hội kinh doanh thú vị có thể xuất hiện 🚀',
    'Đầu tư vào bản thân sẽ mang lại lợi nhuận cao 📈',
    'Hãy cẩn thận với các khoản vay mượn trong tuần này ⚠️'
  ],
  health: [
    'Sức khỏe tốt, hãy duy trì lối sống lành mạnh 🏃‍♂️',
    'Cần chú ý đến giấc ngủ và nghỉ ngơi hợp lý 😴',
    'Tập thể dục đều đặn sẽ mang lại năng lượng tích cực 💪',
    'Hãy uống nhiều nước và ăn nhiều rau xanh 🥗',
    'Stress có thể ảnh hưởng đến sức khỏe, hãy thư giãn 🧘‍♀️',
    'Một kỳ nghỉ ngắn sẽ giúp bạn phục hồi năng lượng 🌴'
  ]
};

// Helper function: Tạo ảnh horoscope
async function createHoroscopeImage(zodiac, predictions) {
  // Calculate required height dynamically
  let estimatedHeight = 800; // Base height
  
  // Add height for each prediction section
  Object.values(predictions).forEach(prediction => {
    const words = prediction.split(' ').length;
    const lines = Math.ceil(words / 12); // Estimate lines needed
    estimatedHeight += Math.max(120, 60 + lines * 32) + 20;
  });
  
  estimatedHeight += 200; // Extra padding
  
  const canvas = createCanvas(800, estimatedHeight);
  const ctx = canvas.getContext('2d');
  
  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, estimatedHeight);
  gradient.addColorStop(0, zodiac.color);
  gradient.addColorStop(0.3, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, estimatedHeight);
  
  // Decorative stars
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 800;
    const y = Math.random() * 300;
    const size = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Header section
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(0, 0, 800, 200);
  
  // Zodiac symbol (large)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 120px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(zodiac.symbol, 400, 130);
  
  // Zodiac name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.fillText(zodiac.name, 400, 180);
  
  // English name
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = '24px Arial';
  ctx.fillText(zodiac.english, 400, 210);
  
  // Date range
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '20px Arial';
  ctx.fillText(zodiac.dates, 400, 240);
  
  // Element and traits section
  let yPos = 320;
  
  // Element
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('🔥 Nguyên tố:', 50, yPos);
  ctx.fillStyle = zodiac.color;
  ctx.fillText(zodiac.element, 220, yPos);
  
  yPos += 60;
  
  // Traits
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 28px Arial';
  ctx.fillText('✨ Đặc điểm:', 50, yPos);
  
  yPos += 50;
  zodiac.traits.forEach((trait, index) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '24px Arial';
    ctx.fillText(`• ${trait}`, 70, yPos);
    yPos += 40;
  });
  
  yPos += 30;
  
  // Lucky section
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 28px Arial';
  ctx.fillText('🍀 May mắn:', 50, yPos);
  
  yPos += 50;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = '24px Arial';
  ctx.fillText(`• Số: ${zodiac.lucky.number}`, 70, yPos);
  yPos += 40;
  ctx.fillText(`• Màu: ${zodiac.lucky.color}`, 70, yPos);
  yPos += 40;
  ctx.fillText(`• Ngày: ${zodiac.lucky.day}`, 70, yPos);
  
  yPos += 60;
  
  // Predictions section
  const sections = [
    { title: '💕 Tình yêu', prediction: predictions.love, icon: '💖' },
    { title: '💼 Sự nghiệp', prediction: predictions.career, icon: '🎯' },
    { title: '💰 Tài chính', prediction: predictions.money, icon: '💎' },
    { title: '🏥 Sức khỏe', prediction: predictions.health, icon: '💪' }
  ];
  
  sections.forEach(section => {
    // Calculate text height first
    const words = section.prediction.split(' ');
    let line = '';
    let lineCount = 1;
    
    ctx.font = '22px Arial';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > 680 && n > 0) {
        lineCount++;
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    
    const sectionHeight = Math.max(120, 60 + lineCount * 30);
    
    // Section background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(30, yPos - 30, 740, sectionHeight);
    
    // Section title
    ctx.fillStyle = zodiac.color;
    ctx.font = 'bold 26px Arial';
    ctx.fillText(section.title, 50, yPos);
    
    // Prediction text with proper word wrap
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '22px Arial';
    
    line = '';
    let lineY = yPos + 40;
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > 680 && n > 0) {
        ctx.fillText(line, 50, lineY);
        line = words[n] + ' ';
        lineY += 32;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, 50, lineY);
    
    yPos += sectionHeight + 20;
  });
  
  // Footer
  yPos += 40;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('✨ Chúc bạn một ngày tuyệt vời! ✨', 400, yPos);
  
  // Add date
  yPos += 30;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '16px Arial';
  ctx.fillText(`📅 ${new Date().toLocaleDateString('vi-VN')}`, 400, yPos);
  
  // Add some bottom padding
  yPos += 60;
  
  console.log(`[HOROSCOPE] Canvas height: ${estimatedHeight}, Content height: ${yPos}`);
  
  return canvas.toBuffer('image/png');
}

// Helper function: Lấy tử vi ngẫu nhiên
function getRandomPredictions() {
  return {
    love: horoscopeTexts.love[Math.floor(Math.random() * horoscopeTexts.love.length)],
    career: horoscopeTexts.career[Math.floor(Math.random() * horoscopeTexts.career.length)],
    money: horoscopeTexts.money[Math.floor(Math.random() * horoscopeTexts.money.length)],
    health: horoscopeTexts.health[Math.floor(Math.random() * horoscopeTexts.health.length)]
  };
}

// Helper function: Tìm cung hoàng đạo
function findZodiac(input) {
  const normalizedInput = input.toLowerCase().trim();
  
  // Tìm exact match
  if (zodiacData[normalizedInput]) {
    return zodiacData[normalizedInput];
  }
  
  // Tìm partial match
  for (const [key, zodiac] of Object.entries(zodiacData)) {
    if (key.includes(normalizedInput) || 
        zodiac.name.toLowerCase().includes(normalizedInput) ||
        zodiac.english.toLowerCase().includes(normalizedInput)) {
      return zodiac;
    }
  }
  
  return null;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  
  try {
    // Check for help command
    if (args.length > 0 && ['help', 'huongdan', 'hd', '?'].includes(args[0].toLowerCase())) {
      const quickHelp = `🌟 HƯỚNG DẪN NHANH HOROSCOPE 🌟

📖 Xem tử vi cung hoàng đạo với Canvas đẹp mắt

🎯 CÁCH DÙNG:
   • horoscope → Tử vi ngẫu nhiên
   • horoscope [tên cung] → Tử vi theo cung
   
🌈 VÍ DỤ:
   • horoscope bạch dương
   • tuvi leo  
   • zodiac thiên bình

📋 12 CUNG: ♈♉♊♋♌♍♎♏♐♑♒♓
Bạch Dương • Kim Ngưu • Song Tử • Cự Giải
Sư Tử • Xử Nữ • Thiên Bình • Bọ Cạp  
Nhân Mã • Ma Kết • Bảo Bình • Song Ngư

💡 Gõ "horoscopehelp" để xem hướng dẫn chi tiết!

✨ Hãy thử ngay: horoscope [tên cung của bạn]`;

      return api.sendMessage(quickHelp, threadId, type);
    }
    
    let zodiac = null;
    
    if (args.length > 0) {
      // Tìm cung hoàng đạo theo input
      const input = args.join(' ');
      zodiac = findZodiac(input);
      
      if (!zodiac) {
        const zodiacList = Object.values(zodiacData)
          .map(z => `${z.symbol} ${z.name}`)
          .join('\n');
          
        return api.sendMessage(
          `❌ Không tìm thấy cung hoàng đạo "${input}"!\n\n🌟 Danh sách 12 cung hoàng đạo:\n${zodiacList}\n\n💡 Ví dụ: horoscope bạch dương`,
          threadId,
          type
        );
      }
    } else {
      // Random một cung hoàng đạo
      const zodiacKeys = Object.keys(zodiacData);
      const randomKey = zodiacKeys[Math.floor(Math.random() * zodiacKeys.length)];
      zodiac = zodiacData[randomKey];
    }
    
    // Tạo tử vi ngẫu nhiên
    const predictions = getRandomPredictions();
    
    // Tạo ảnh
    const imageBuffer = await createHoroscopeImage(zodiac, predictions);
    
    // Lưu ảnh tạm
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const imagePath = path.join(tempDir, `horoscope_${Date.now()}.png`);
    fs.writeFileSync(imagePath, imageBuffer);
    
    // Gửi message
    const message = `🌟 TỬ VI CUNG HOÀNG ĐẠO 🌟\n\n${zodiac.symbol} ${zodiac.name} (${zodiac.dates})\n\n✨ Hãy xem tử vi chi tiết trong hình ảnh bên dưới!`;
    
    await api.sendMessage({
      msg: message,
      attachments: [imagePath]
    }, threadId, type);
    
    // Xóa ảnh tạm sau 30 giây
    setTimeout(() => {
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (e) {
        console.log('[HOROSCOPE] Không thể xóa file tạm:', e.message);
      }
    }, 30000);
    
  } catch (error) {
    console.error('[HOROSCOPE] Lỗi:', error);
    return api.sendMessage(
      `❌ Có lỗi xảy ra khi tạo tử vi: ${error.message}`,
      threadId,
      type
    );
  }
};
