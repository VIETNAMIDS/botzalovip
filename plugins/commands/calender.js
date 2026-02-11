const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

module.exports.config = {
  name: 'calendar',
  aliases: ['lich', 'cal', 'lichthang'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Xem lịch tháng với giao diện Canvas đẹp mắt, sự kiện lễ tết. Gõ "calendar help" để xem hướng dẫn!',
  category: 'Tiện ích',
  usage: 'calendar [tháng] [năm] | help',
  cooldowns: 3,
  dependencies: {
    'canvas': ''
  }
};

// Dữ liệu lễ tết Việt Nam và quốc tế
const holidays = {
  // Lễ tết cố định (theo dương lịch)
  fixed: {
    '1-1': { name: 'Tết Dương lịch', type: 'major', color: '#FF6B6B' },
    '2-14': { name: 'Valentine', type: 'special', color: '#FF69B4' },
    '3-8': { name: 'Quốc tế Phụ nữ', type: 'major', color: '#FF1493' },
    '4-30': { name: 'Giải phóng miền Nam', type: 'major', color: '#FF0000' },
    '5-1': { name: 'Quốc tế Lao động', type: 'major', color: '#FF0000' },
    '6-1': { name: 'Quốc tế Thiếu nhi', type: 'special', color: '#FFD700' },
    '9-2': { name: 'Quốc khánh Việt Nam', type: 'major', color: '#FF0000' },
    '10-20': { name: 'Ngày Phụ nữ Việt Nam', type: 'major', color: '#FF1493' },
    '11-20': { name: 'Ngày Nhà giáo Việt Nam', type: 'major', color: '#4169E1' },
    '12-25': { name: 'Giáng sinh', type: 'major', color: '#228B22' }
  },
  
  // Lễ tết âm lịch (ước tính - có thể cần API chính xác hơn)
  lunar: {
    '1-1': { name: 'Tết Nguyên đán', type: 'major', color: '#FF0000' },
    '1-15': { name: 'Tết Nguyên tiêu', type: 'special', color: '#FFD700' },
    '3-10': { name: 'Giỗ Tổ Hùng Vương', type: 'major', color: '#FF0000' },
    '4-15': { name: 'Phật đản', type: 'major', color: '#FFA500' },
    '5-5': { name: 'Tết Đoan Ngọ', type: 'special', color: '#32CD32' },
    '7-15': { name: 'Vu Lan', type: 'major', color: '#9370DB' },
    '8-15': { name: 'Tết Trung thu', type: 'major', color: '#FFD700' },
    '12-23': { name: 'Ông Táo chầu trời', type: 'special', color: '#FF6347' }
  }
};

// Tên tháng tiếng Việt
const monthNames = [
  'Tháng Một', 'Tháng Hai', 'Tháng Ba', 'Tháng Tư',
  'Tháng Năm', 'Tháng Sáu', 'Tháng Bảy', 'Tháng Tám',
  'Tháng Chín', 'Tháng Mười', 'Tháng Mười Một', 'Tháng Mười Hai'
];

// Tên thứ tiếng Việt
const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Helper function: Lấy số ngày trong tháng
function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

// Helper function: Lấy thứ của ngày đầu tháng (0 = Chủ nhật)
function getFirstDayOfMonth(month, year) {
  return new Date(year, month - 1, 1).getDay();
}

// Helper function: Kiểm tra có phải ngày hôm nay không
function isToday(day, month, year) {
  const today = new Date();
  return day === today.getDate() && 
         month === today.getMonth() + 1 && 
         year === today.getFullYear();
}

// Helper function: Lấy sự kiện trong ngày
function getHolidayForDate(day, month) {
  const dateKey = `${month}-${day}`;
  return holidays.fixed[dateKey] || null;
}

// Helper function: Lấy thông tin tuần trong tháng
function getWeekInfo(day, month, year) {
  const date = new Date(year, month - 1, day);
  const firstDay = new Date(year, month - 1, 1);
  const weekNumber = Math.ceil((day + firstDay.getDay()) / 7);
  return weekNumber;
}

// Helper function: Tạo ảnh lịch
async function createCalendarImage(month, year) {
  const canvas = createCanvas(1000, 1200);
  const ctx = canvas.getContext('2d');
  
  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 1200);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(0.5, '#764ba2');
  gradient.addColorStop(1, '#2c3e50');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1000, 1200);
  
  // Decorative elements
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 1000;
    const y = Math.random() * 300;
    const size = Math.random() * 4 + 2;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Header background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(0, 0, 1000, 150);
  
  // Month and year title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${monthNames[month - 1]} ${year}`, 500, 70);
  
  // Current date info
  const today = new Date();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '24px Arial';
  ctx.fillText(`Hôm nay: ${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`, 500, 110);
  
  // Day headers
  const headerY = 200;
  const cellWidth = 130;
  const cellHeight = 100;
  const startX = 35;
  
  // Day header background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(startX, headerY - 30, cellWidth * 7, 60);
  
  dayNames.forEach((day, index) => {
    const x = startX + index * cellWidth + cellWidth / 2;
    
    // Highlight weekend
    if (index === 0 || index === 6) {
      ctx.fillStyle = '#FF6B6B';
    } else {
      ctx.fillStyle = '#ffffff';
    }
    
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(day, x, headerY);
  });
  
  // Calendar grid
  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = getFirstDayOfMonth(month, year);
  
  let currentDay = 1;
  let yPos = headerY + 50;
  
  // Draw calendar weeks
  for (let week = 0; week < 6; week++) {
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const x = startX + dayOfWeek * cellWidth;
      const y = yPos + week * cellHeight;
      
      // Cell background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(x, y, cellWidth - 2, cellHeight - 2);
      
      // Draw border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellWidth - 2, cellHeight - 2);
      
      // Calculate day number
      const dayNumber = week * 7 + dayOfWeek - firstDay + 1;
      
      if (dayNumber > 0 && dayNumber <= daysInMonth) {
        // Check if today
        const isCurrentDay = isToday(dayNumber, month, year);
        
        // Check for holiday
        const holiday = getHolidayForDate(dayNumber, month);
        
        // Day background color
        if (isCurrentDay) {
          ctx.fillStyle = '#FFD700';
          ctx.fillRect(x + 2, y + 2, cellWidth - 6, cellHeight - 6);
        } else if (holiday) {
          ctx.fillStyle = holiday.color + '40'; // Semi-transparent
          ctx.fillRect(x + 2, y + 2, cellWidth - 6, cellHeight - 6);
        }
        
        // Day number
        ctx.fillStyle = isCurrentDay ? '#000000' : '#ffffff';
        ctx.font = isCurrentDay ? 'bold 32px Arial' : 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(dayNumber.toString(), x + cellWidth / 2, y + 35);
        
        // Weekend highlight
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          ctx.fillStyle = isCurrentDay ? '#8B0000' : '#FF6B6B';
          ctx.font = '20px Arial';
          ctx.fillText('●', x + cellWidth / 2, y + 55);
        }
        
        // Holiday indicator
        if (holiday) {
          ctx.fillStyle = holiday.color;
          ctx.font = '16px Arial';
          ctx.textAlign = 'center';
          
          // Wrap holiday name if too long
          const holidayName = holiday.name;
          if (holidayName.length > 10) {
            const words = holidayName.split(' ');
            if (words.length > 1) {
              ctx.fillText(words[0], x + cellWidth / 2, y + 70);
              ctx.fillText(words.slice(1).join(' '), x + cellWidth / 2, y + 85);
            } else {
              ctx.fillText(holidayName.substring(0, 8) + '...', x + cellWidth / 2, y + 75);
            }
          } else {
            ctx.fillText(holidayName, x + cellWidth / 2, y + 75);
          }
        }
        
        currentDay++;
      }
    }
  }
  
  // Legend section
  let legendY = yPos + 6 * cellHeight + 50;
  
  // Legend background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(50, legendY - 20, 900, 120);
  
  // Legend title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('📋 Chú thích:', 70, legendY + 10);
  
  // Legend items
  const legendItems = [
    { color: '#FFD700', text: '● Hôm nay', x: 70, y: legendY + 40 },
    { color: '#FF6B6B', text: '● Cuối tuần', x: 250, y: legendY + 40 },
    { color: '#FF0000', text: '● Lễ lớn', x: 430, y: legendY + 40 },
    { color: '#FFD700', text: '● Lễ đặc biệt', x: 600, y: legendY + 40 },
    { color: '#32CD32', text: '● Sự kiện', x: 780, y: legendY + 40 }
  ];
  
  legendItems.forEach(item => {
    ctx.fillStyle = item.color;
    ctx.font = '18px Arial';
    ctx.fillText(item.text, item.x, item.y);
  });
  
  // Statistics
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '20px Arial';
  ctx.textAlign = 'left';
  
  const stats = [
    `📅 Tổng số ngày: ${daysInMonth}`,
    `📊 Số tuần: ${Math.ceil((daysInMonth + firstDay) / 7)}`,
    `🎉 Ngày lễ: ${Object.keys(holidays.fixed).filter(key => {
      const [m] = key.split('-');
      return parseInt(m) === month;
    }).length}`,
    `⏰ Cập nhật: ${new Date().toLocaleString('vi-VN')}`
  ];
  
  stats.forEach((stat, index) => {
    ctx.fillText(stat, 70 + (index % 2) * 400, legendY + 70 + Math.floor(index / 2) * 25);
  });
  
  // Footer
  legendY += 140;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('✨ Chúc bạn có một tháng tuyệt vời! ✨', 500, legendY);
  
  return canvas.toBuffer('image/png');
}

// Helper function: Parse tháng năm từ input
function parseMonthYear(args) {
  const now = new Date();
  let month = now.getMonth() + 1;
  let year = now.getFullYear();
  
  if (args.length >= 1) {
    const monthInput = parseInt(args[0]);
    if (monthInput >= 1 && monthInput <= 12) {
      month = monthInput;
    }
  }
  
  if (args.length >= 2) {
    const yearInput = parseInt(args[1]);
    if (yearInput >= 1900 && yearInput <= 2100) {
      year = yearInput;
    }
  }
  
  return { month, year };
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  
  try {
    // Check for help command
    if (args.length > 0 && ['help', 'huongdan', 'hd', '?'].includes(args[0].toLowerCase())) {
      const helpMessage = `📅 HƯỚNG DẪN LỆNH CALENDAR 📅

📖 Xem lịch tháng với Canvas đẹp mắt, đầy đủ sự kiện lễ tết

🎯 CÁCH DÙNG:
   • calendar → Lịch tháng hiện tại
   • calendar [tháng] → Lịch tháng chỉ định năm nay
   • calendar [tháng] [năm] → Lịch tháng năm chỉ định
   
🌈 VÍ DỤ:
   • calendar → Tháng hiện tại
   • calendar 12 → Tháng 12 năm nay
   • calendar 1 2024 → Tháng 1/2024
   • lich 6 2025 → Tháng 6/2025

🎨 TÍNH NĂNG:
   ✅ Giao diện Canvas chuyên nghiệp
   ✅ Highlight ngày hôm nay
   ✅ Hiển thị lễ tết Việt Nam
   ✅ Đánh dấu cuối tuần
   ✅ Thống kê tháng
   ✅ Chú thích đầy đủ

🎉 SỰ KIỆN BAO GỒM:
   • Tết Dương lịch, Quốc khánh
   • Giải phóng miền Nam, Quốc tế Lao động  
   • Ngày Phụ nữ, Nhà giáo Việt Nam
   • Valentine, Giáng sinh
   • Và nhiều sự kiện khác...

💡 Hãy thử: calendar 12 2024`;

      return api.sendMessage(helpMessage, threadId, type);
    }
    
    // Parse month and year
    const { month, year } = parseMonthYear(args);
    
    // Validate input
    if (month < 1 || month > 12) {
      return api.sendMessage(
        '❌ Tháng không hợp lệ! Vui lòng nhập từ 1-12.\n💡 Ví dụ: calendar 12 2024',
        threadId,
        type
      );
    }
    
    if (year < 1900 || year > 2100) {
      return api.sendMessage(
        '❌ Năm không hợp lệ! Vui lòng nhập từ 1900-2100.\n💡 Ví dụ: calendar 1 2025',
        threadId,
        type
      );
    }
    
    // Create calendar image
    const imageBuffer = await createCalendarImage(month, year);
    
    // Save temp image
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const imagePath = path.join(tempDir, `calendar_${month}_${year}_${Date.now()}.png`);
    fs.writeFileSync(imagePath, imageBuffer);
    
    // Send message
    const message = `📅 LỊCH ${monthNames[month - 1].toUpperCase()} ${year} 📅\n\n🗓️ Tháng ${month}/${year} có ${getDaysInMonth(month, year)} ngày\n📊 Bắt đầu từ thứ ${dayNames[getFirstDayOfMonth(month, year)]}\n\n✨ Xem chi tiết trong hình ảnh bên dưới!`;
    
    await api.sendMessage({
      msg: message,
      attachments: [imagePath]
    }, threadId, type);
    
    // Delete temp image after 30 seconds
    setTimeout(() => {
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (e) {
        console.log('[CALENDAR] Không thể xóa file tạm:', e.message);
      }
    }, 30000);
    
  } catch (error) {
    console.error('[CALENDAR] Lỗi:', error);
    return api.sendMessage(
      `❌ Có lỗi xảy ra khi tạo lịch: ${error.message}`,
      threadId,
      type
    );
  }
};
