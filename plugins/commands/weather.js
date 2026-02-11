const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');

// Helper function for lunar calendar
function getLunarDate(solarDate) {
  try {
    const y = solarDate.getFullYear();
    const m = solarDate.getMonth() + 1;
    const d = solarDate.getDate();
    
    let lunarYear = y;
    let lunarMonth = m;
    let lunarDay = d;
    
    if (m <= 2) {
      lunarYear--;
      lunarMonth += 12;
    }
    
    const offset = Math.floor((lunarMonth - 3) / 11);
    lunarMonth = ((lunarMonth - 3) % 12) + 1;
    lunarDay = d + offset;
    
    if (lunarDay > 29) {
      lunarDay -= 29;
      lunarMonth++;
      if (lunarMonth > 12) {
        lunarMonth = 1;
        lunarYear++;
      }
    }
    
    return `${lunarDay}/${lunarMonth}/${lunarYear}`;
  } catch (e) {
    return 'N/A';
  }
}

// Lucky hours
function getLuckyHours(day) {
  const luckyData = {
    0: { 
      lucky: ['Dần (3-5h)', 'Mẹo (9-11h)', 'Thân (15-17h)', 'Hợi (21-23h)'], 
      unlucky: ['Tý (23-1h)', 'Mão (5-7h)', 'Mùi (13-15h)', 'Tuất (19-21h)'] 
    },
    1: { 
      lucky: ['Sửu (1-3h)', 'Tỵ (9-11h)', 'Mùi (13-15h)', 'Dậu (17-19h)'], 
      unlucky: ['Thìn (7-9h)', 'Ngọ (11-13h)', 'Tuất (19-21h)', 'Hợi (21-23h)'] 
    },
    2: { 
      lucky: ['Dần (3-5h)', 'Thìn (7-9h)', 'Ngọ (11-13h)', 'Thân (15-17h)'], 
      unlucky: ['Tý (23-1h)', 'Mão (5-7h)', 'Dậu (17-19h)', 'Hợi (21-23h)'] 
    },
    3: { 
      lucky: ['Mão (5-7h)', 'Tỵ (9-11h)', 'Mùi (13-15h)', 'Dậu (17-19h)'], 
      unlucky: ['Sửu (1-3h)', 'Thìn (7-9h)', 'Thân (15-17h)', 'Tuất (19-21h)'] 
    },
    4: { 
      lucky: ['Tý (23-1h)', 'Dần (3-5h)', 'Tỵ (9-11h)', 'Thân (15-17h)'], 
      unlucky: ['Sửu (1-3h)', 'Mão (5-7h)', 'Ngọ (11-13h)', 'Dậu (17-19h)'] 
    },
    5: { 
      lucky: ['Sửu (1-3h)', 'Mão (5-7h)', 'Ngọ (11-13h)', 'Dậu (17-19h)'], 
      unlucky: ['Tý (23-1h)', 'Tỵ (9-11h)', 'Mùi (13-15h)', 'Tuất (19-21h)'] 
    },
    6: { 
      lucky: ['Dần (3-5h)', 'Thìn (7-9h)', 'Mùi (13-15h)', 'Tuất (19-21h)'], 
      unlucky: ['Tý (23-1h)', 'Sửu (1-3h)', 'Ngọ (11-13h)', 'Dậu (17-19h)'] 
    },
  };
  return luckyData[day] || { lucky: [], unlucky: [] };
}

const usageMap = new Map();

const weatherIcons = {
  'clear': '☀️',
  'clouds': '☁️',
  'rain': '🌧️',
  'drizzle': '🌦️',
  'thunderstorm': '⛈️',
  'snow': '❄️',
  'mist': '🌫️',
  'smoke': '🌫️',
  'haze': '🌫️',
  'dust': '🌫️',
  'fog': '🌫️',
  'sand': '🌫️',
  'ash': '🌫️',
  'squall': '💨',
  'tornado': '🌪️'
};

const vietnamCities = {
  'hanoi': 'Hà Nội',
  'hochiminh': 'TP. Hồ Chí Minh',
  'saigon': 'TP. Hồ Chí Minh',
  'danang': 'Đà Nẵng',
  'haiphong': 'Hải Phòng',
  'cantho': 'Cần Thơ',
  'nhatrang': 'Nha Trang',
  'dalat': 'Đà Lạt',
  'vungtau': 'Vũng Tàu',
  'hue': 'Huế',
  'quangninh': 'Quảng Ninh',
  'halong': 'Hạ Long',
  'phuquoc': 'Phú Quốc',
  'nghean': 'Nghệ An',
  'thanhhoa': 'Thanh Hóa',
  'binhduong': 'Bình Dương',
  'dongnai': 'Đồng Nai',
  'vinhlong': 'Vĩnh Long',
  'angiang': 'An Giang',
  'bacninh': 'Bắc Ninh'
};

function getWeatherIcon(condition) {
  const normalized = condition.toLowerCase();
  for (const [key, icon] of Object.entries(weatherIcons)) {
    if (normalized.includes(key)) return icon;
  }
  return '🌤️';
}

function getAQILevel(aqi) {
  if (aqi <= 50) return { level: 'Tốt', color: '#00e400', emoji: '😊' };
  if (aqi <= 100) return { level: 'Trung bình', color: '#ffff00', emoji: '😐' };
  if (aqi <= 150) return { level: 'Kém', color: '#ff7e00', emoji: '😷' };
  if (aqi <= 200) return { level: 'Xấu', color: '#ff0000', emoji: '😨' };
  if (aqi <= 300) return { level: 'Rất xấu', color: '#8f3f97', emoji: '☠️' };
  return { level: 'Nguy hại', color: '#7e0023', emoji: '💀' };
}

function getUVLevel(uv) {
  if (uv <= 2) return { level: 'Thấp', color: '#4CAF50', emoji: '😎' };
  if (uv <= 5) return { level: 'Trung bình', color: '#FFEB3B', emoji: '🧴' };
  if (uv <= 7) return { level: 'Cao', color: '#FF9800', emoji: '⚠️' };
  if (uv <= 10) return { level: 'Rất cao', color: '#F44336', emoji: '🚨' };
  return { level: 'Cực cao', color: '#9C27B0', emoji: '☢️' };
}

// Draw rounded rectangle
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Draw glowing stars
function drawStars(ctx, width, height, count = 200) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 2.5;
    const opacity = 0.3 + Math.random() * 0.7;
    
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 3;
    ctx.fillRect(x, y, size, size);
    
    // Add some colored stars
    if (Math.random() > 0.9) {
      const colors = ['#6BB6FF', '#9EFF00', '#FFB86C', '#FF6B6B'];
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.shadowBlur = 5;
      ctx.fillRect(x, y, size * 1.2, size * 1.2);
    }
  }
  ctx.shadowBlur = 0;
}

// Draw animated gradient background
function drawGradientBg(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0a0e27');
  gradient.addColorStop(0.3, '#1a1f3a');
  gradient.addColorStop(0.6, '#0f1729');
  gradient.addColorStop(1, '#050810');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

async function createWeatherImage(userName, location, weatherData, forecastData, usageCount) {
  try {
    const canvas = createCanvas(900, 2100);
    const ctx = canvas.getContext('2d');
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();

    // Beautiful gradient background
    drawGradientBg(ctx, canvas.width, canvas.height);
    
    // Add glowing stars
    drawStars(ctx, canvas.width, canvas.height);

    // Decorative header with gradient
    const headerGradient = ctx.createLinearGradient(0, 0, canvas.width, 100);
    headerGradient.addColorStop(0, 'rgba(158, 255, 0, 0.1)');
    headerGradient.addColorStop(0.5, 'rgba(107, 182, 255, 0.15)');
    headerGradient.addColorStop(1, 'rgba(255, 107, 107, 0.1)');
    ctx.fillStyle = headerGradient;
    ctx.fillRect(0, 0, canvas.width, 100);

    // Day and date with shadow
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(158, 255, 0, 0.4)';
    ctx.shadowBlur = 10;
    const dayStr = now.toLocaleDateString('vi-VN', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    ctx.fillText(dayStr, canvas.width / 2, 50);
    ctx.shadowBlur = 0;

    // Large glowing time
    ctx.font = 'bold 100px Arial';
    ctx.fillStyle = '#9EFF00';
    ctx.shadowColor = 'rgba(158, 255, 0, 0.6)';
    ctx.shadowBlur = 25;
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    ctx.fillText(timeStr, canvas.width / 2, 170);
    ctx.shadowBlur = 0;

    // Lunar calendar with beautiful badge
    const lunarStr = getLunarDate(now);
    roundRect(ctx, canvas.width/2 - 180, 195, 360, 50, 25);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText(`🌙 Âm lịch: ${lunarStr}`, canvas.width / 2, 228);
    ctx.shadowBlur = 0;
    
    ctx.font = '18px Arial';
    ctx.fillStyle = '#D0D0D0';
    ctx.fillText('Ngày Nhâm Tý • Tháng Kỷ Sửu • Năm Ất Tỵ 🐍', canvas.width / 2, 270);

    // Important dates - Premium cards style
    const importantDates = [
      { days: '12 ngày', lunar: '22-12', name: 'Ngày thành lập QDND VN', color: '#10b981', icon: '🎖️' },
      { days: '14 ngày', lunar: '24-12', name: 'Lễ Giáng Sinh (Noel)', color: '#ef4444', icon: '🎄' },
      { days: '22 ngày', lunar: '01-01', name: 'Tết Dương Lịch', color: '#3b82f6', icon: '🎊' },
      { days: '30 ngày', lunar: '09-01', name: 'Ngày Học sinh - Sinh viên', color: '#f59e0b', icon: '🎓' }
    ];
    
    let dateY = 330;
    importantDates.forEach(date => {
      // Card container
      roundRect(ctx, 50, dateY - 30, canvas.width - 100, 55, 15);
      const cardGradient = ctx.createLinearGradient(50, dateY - 30, 50, dateY + 25);
      cardGradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
      cardGradient.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
      ctx.fillStyle = cardGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Icon
      ctx.font = '32px Arial';
      ctx.fillText(date.icon, 90, dateY + 5);
      
      // Days badge
      roundRect(ctx, 140, dateY - 20, 100, 40, 20);
      ctx.fillStyle = date.color;
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 17px Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 4;
      ctx.fillText(date.days, 190, dateY + 5);
      ctx.shadowBlur = 0;
      
      // Date badge
      roundRect(ctx, 250, dateY - 20, 90, 40, 20);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(date.lunar, 295, dateY + 5);
      
      // Event name
      ctx.fillStyle = '#E0E0E0';
      ctx.font = '17px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(date.name, 360, dateY + 5);
      
      dateY += 70;
    });

    // Lucky hours - Premium design
    let luckyY = 630;
    const luckyHours = getLuckyHours(now.getDay());
    
    const luckyHeight = Math.max(150, Math.ceil(luckyHours.lucky.length / 2) * 35 + 80);
    
    // Lucky hours card
    roundRect(ctx, 50, luckyY, canvas.width - 100, luckyHeight, 20);
    const luckyGradient = ctx.createLinearGradient(50, luckyY, 50, luckyY + luckyHeight);
    luckyGradient.addColorStop(0, 'rgba(0, 217, 255, 0.15)');
    luckyGradient.addColorStop(1, 'rgba(0, 217, 255, 0.05)');
    ctx.fillStyle = luckyGradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    // Lucky hours title with glow
    ctx.fillStyle = '#00D9FF';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 217, 255, 0.6)';
    ctx.shadowBlur = 15;
    ctx.fillText('✨ GIỜ HOÀNG ĐẠO ✨', canvas.width / 2, luckyY + 45);
    ctx.shadowBlur = 0;
    
    // Lucky hours items
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    
    const midPoint = Math.ceil(luckyHours.lucky.length / 2);
    luckyHours.lucky.slice(0, midPoint).forEach((hour, idx) => {
      ctx.fillText(`🍀 ${hour}`, 90, luckyY + 85 + idx * 35);
    });
    
    ctx.textAlign = 'right';
    luckyHours.lucky.slice(midPoint).forEach((hour, idx) => {
      ctx.fillText(`${hour} 🍀`, canvas.width - 90, luckyY + 85 + idx * 35);
    });

    // Unlucky hours
    luckyY += luckyHeight + 25;
    const unluckyHeight = Math.max(150, Math.ceil(luckyHours.unlucky.length / 2) * 35 + 80);
    
    roundRect(ctx, 50, luckyY, canvas.width - 100, unluckyHeight, 20);
    const unluckyGradient = ctx.createLinearGradient(50, luckyY, 50, luckyY + unluckyHeight);
    unluckyGradient.addColorStop(0, 'rgba(255, 107, 107, 0.15)');
    unluckyGradient.addColorStop(1, 'rgba(255, 107, 107, 0.05)');
    ctx.fillStyle = unluckyGradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    ctx.fillStyle = '#FF6B6B';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255, 107, 107, 0.6)';
    ctx.shadowBlur = 15;
    ctx.fillText('⚠️ GIỜ HẮC ĐẠO ⚠️', canvas.width / 2, luckyY + 45);
    ctx.shadowBlur = 0;
    
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    
    const midUnlucky = Math.ceil(luckyHours.unlucky.length / 2);
    luckyHours.unlucky.slice(0, midUnlucky).forEach((hour, idx) => {
      ctx.fillText(`⛔ ${hour}`, 90, luckyY + 85 + idx * 35);
    });
    
    ctx.textAlign = 'right';
    luckyHours.unlucky.slice(midUnlucky).forEach((hour, idx) => {
      ctx.fillText(`${hour} ⛔`, canvas.width - 90, luckyY + 85 + idx * 35);
    });

    // Weather section - Ultra premium design
    luckyY += unluckyHeight + 30;
    
    roundRect(ctx, 50, luckyY, canvas.width - 100, 480, 25);
    const weatherGradient = ctx.createLinearGradient(50, luckyY, 50, luckyY + 480);
    weatherGradient.addColorStop(0, 'rgba(20, 30, 55, 0.98)');
    weatherGradient.addColorStop(0.5, 'rgba(30, 45, 75, 0.98)');
    weatherGradient.addColorStop(1, 'rgba(20, 30, 55, 0.98)');
    ctx.fillStyle = weatherGradient;
    ctx.fill();
    
    // Animated border
    const borderGrad = ctx.createLinearGradient(50, luckyY, canvas.width - 50, luckyY);
    borderGrad.addColorStop(0, 'rgba(158, 255, 0, 0.6)');
    borderGrad.addColorStop(0.33, 'rgba(107, 182, 255, 0.6)');
    borderGrad.addColorStop(0.66, 'rgba(255, 184, 108, 0.6)');
    borderGrad.addColorStop(1, 'rgba(255, 107, 107, 0.6)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Location header with elegant badge
    roundRect(ctx, 150, luckyY + 15, canvas.width - 300, 55, 27);
    const locGradient = ctx.createLinearGradient(150, luckyY + 15, 150, luckyY + 70);
    locGradient.addColorStop(0, 'rgba(255, 215, 0, 0.25)');
    locGradient.addColorStop(1, 'rgba(255, 215, 0, 0.1)');
    ctx.fillStyle = locGradient;
    ctx.fill();
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    ctx.shadowBlur = 15;
    ctx.fillText(`📍 ${location.toUpperCase()}`, canvas.width / 2, luckyY + 53);
    ctx.shadowBlur = 0;
    
    // Main temperature with glowing circle
    const tempCenterX = canvas.width / 2;
    const tempCenterY = luckyY + 160;
    
    // Outer glow circle
    const glowGrad = ctx.createRadialGradient(tempCenterX, tempCenterY, 0, tempCenterX, tempCenterY, 100);
    glowGrad.addColorStop(0, 'rgba(158, 255, 0, 0.3)');
    glowGrad.addColorStop(0.7, 'rgba(158, 255, 0, 0.1)');
    glowGrad.addColorStop(1, 'rgba(158, 255, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(tempCenterX, tempCenterY, 100, 0, Math.PI * 2);
    ctx.fill();
    
    // Temperature text
    ctx.fillStyle = '#9EFF00';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(158, 255, 0, 0.8)';
    ctx.shadowBlur = 25;
    ctx.fillText(`${weatherData.temp}°`, tempCenterX, tempCenterY + 20);
    ctx.shadowBlur = 0;
    
    // Weather icon and description
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#FFFFFF';
    const weatherIcon = getWeatherIcon(weatherData.condition);
    ctx.fillText(`${weatherIcon} ${weatherData.description}`, canvas.width / 2, luckyY + 235);
    
    // Min/Max temperature bar - elegant design
    const barY = luckyY + 270;
    const barWidth = 500;
    const barX = (canvas.width - barWidth) / 2;
    
    // Bar background
    roundRect(ctx, barX, barY, barWidth, 50, 25);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fill();
    
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#6BB6FF';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(107, 182, 255, 0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText(`❄️ ${weatherData.tempMin}°`, barX + 40, barY + 33);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(canvas.width / 2 - 25, barY + 22, 50, 3);
    
    ctx.fillStyle = '#FF6B6B';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(255, 107, 107, 0.6)';
    ctx.fillText(`${weatherData.tempMax}° 🔥`, barX + barWidth - 40, barY + 33);
    ctx.shadowBlur = 0;
    
    // Feels like
    ctx.font = '20px Arial';
    ctx.fillStyle = '#FFB86C';
    ctx.textAlign = 'center';
    ctx.fillText(`Cảm giác như: ${weatherData.feelsLike}°C`, canvas.width / 2, luckyY + 355);
    
    // Weather details - Premium cards grid
    const detailsY = luckyY + 385;
    const cardW = 250;
    const cardH = 80;
    const spacing = 25;
    const totalW = cardW * 3 + spacing * 2;
    const startX = (canvas.width - totalW) / 2;
    
    // Card 1 - Humidity
    let cardX = startX;
    roundRect(ctx, cardX, detailsY, cardW, cardH, 15);
    const humidGrad = ctx.createLinearGradient(cardX, detailsY, cardX, detailsY + cardH);
    humidGrad.addColorStop(0, 'rgba(107, 182, 255, 0.2)');
    humidGrad.addColorStop(1, 'rgba(107, 182, 255, 0.05)');
    ctx.fillStyle = humidGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(107, 182, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.font = '36px Arial';
    ctx.fillStyle = '#6BB6FF';
    ctx.textAlign = 'center';
    ctx.fillText('💧', cardX + cardW / 2, detailsY + 40);
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Độ ẩm', cardX + cardW / 2, detailsY + 60);
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#6BB6FF';
    ctx.fillText(`${weatherData.humidity}%`, cardX + cardW / 2, detailsY + 77);
    
    // Card 2 - Wind
    cardX += cardW + spacing;
    roundRect(ctx, cardX, detailsY, cardW, cardH, 15);
    const windGrad = ctx.createLinearGradient(cardX, detailsY, cardX, detailsY + cardH);
    windGrad.addColorStop(0, 'rgba(255, 184, 108, 0.2)');
    windGrad.addColorStop(1, 'rgba(255, 184, 108, 0.05)');
    ctx.fillStyle = windGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 184, 108, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.font = '36px Arial';
    ctx.fillStyle = '#FFB86C';
    ctx.textAlign = 'center';
    ctx.fillText('🌬️', cardX + cardW / 2, detailsY + 40);
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Gió', cardX + cardW / 2, detailsY + 60);
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#FFB86C';
    ctx.fillText(`${weatherData.windSpeed} km/h`, cardX + cardW / 2, detailsY + 77);
    
    // Card 3 - UV
    cardX += cardW + spacing;
    roundRect(ctx, cardX, detailsY, cardW, cardH, 15);
    const uvGrad = ctx.createLinearGradient(cardX, detailsY, cardX, detailsY + cardH);
    uvGrad.addColorStop(0, 'rgba(158, 255, 0, 0.2)');
    uvGrad.addColorStop(1, 'rgba(158, 255, 0, 0.05)');
    ctx.fillStyle = uvGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(158, 255, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    const uvData = weatherData.uvIndex ? getUVLevel(weatherData.uvIndex) : null;
    ctx.font = '36px Arial';
    ctx.fillStyle = '#9EFF00';
    ctx.textAlign = 'center';
    ctx.fillText('☀️', cardX + cardW / 2, detailsY + 40);
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('UV Index', cardX + cardW / 2, detailsY + 60);
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#9EFF00';
    ctx.fillText(uvData ? `${weatherData.uvIndex} - ${uvData.level}` : 'N/A', cardX + cardW / 2, detailsY + 77);

    // Direction guidance - Premium card
    luckyY += 510;
    roundRect(ctx, 50, luckyY, canvas.width - 100, 160, 20);
    const dirGrad = ctx.createLinearGradient(50, luckyY, 50, luckyY + 160);
    dirGrad.addColorStop(0, 'rgba(255, 215, 0, 0.15)');
    dirGrad.addColorStop(1, 'rgba(255, 215, 0, 0.05)');
    ctx.fillStyle = dirGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText('🧭 HƯỚNG XUẤT HÀNH 🧭', canvas.width / 2, luckyY + 45);
    ctx.shadowBlur = 0;
    
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#00D9FF';
    ctx.fillText("🍀 Tây Nam - Đón 'Hỷ Thần' (May mắn)", canvas.width / 2, luckyY + 85);
    
    ctx.fillStyle = '#9EFF00';
    ctx.fillText("💰 Chính Đông - Đón 'Tài Thần' (Tài lộc)", canvas.width / 2, luckyY + 115);
    
    ctx.font = '16px Arial';
    ctx.fillStyle = '#FF6B6B';
    ctx.fillText("⚠️ Tránh: Tây Bắc - Gặp 'Hắc Thần' (Xui xẻo)", canvas.width / 2, luckyY + 145);

    // Forecast section - 5 days
    luckyY += 190;
    if (forecastData && forecastData.length > 0) {
      roundRect(ctx, 50, luckyY, canvas.width - 100, 180, 20);
      const foreGrad = ctx.createLinearGradient(50, luckyY, 50, luckyY + 180);
      foreGrad.addColorStop(0, 'rgba(100, 150, 255, 0.15)');
      foreGrad.addColorStop(1, 'rgba(100, 150, 255, 0.05)');
      ctx.fillStyle = foreGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 150, 255, 0.4)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      
      ctx.fillStyle = '#6BB6FF';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(107, 182, 255, 0.6)';
      ctx.shadowBlur = 12;
      ctx.fillText('📅 DỰ BÁO 5 NGÀY', canvas.width / 2, luckyY + 40);
      ctx.shadowBlur = 0;
      
      const forecastStartX = 100;
      const forecastSpacing = (canvas.width - 200) / forecastData.length;
      
      forecastData.forEach((day, idx) => {
        const x = forecastStartX + idx * forecastSpacing;
        
        ctx.font = '32px Arial';
        ctx.fillText(day.icon, x, luckyY + 90);
        
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#9EFF00';
        ctx.fillText(`${day.temp}°`, x, luckyY + 125);
        
        ctx.font = '14px Arial';
        ctx.fillStyle = '#FFFFFF';
        const dateShort = day.date.split(',')[0];
        ctx.fillText(dateShort, x, luckyY + 150);
      });
    }

    // Footer with usage
    luckyY += 200;
    ctx.font = '16px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(`👤 ${userName} • 🔢 Lượt dùng: ${usageCount} • ⚡ Powered by WeatherAPI`, canvas.width / 2, luckyY);

    const cacheDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const fileName = `weather_${Date.now()}.png`;
    const filePath = path.join(cacheDir, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);

    console.log('[WEATHER] ✅ Đã tạo ảnh nâng cấp:', filePath);
    return filePath;
    
  } catch (error) {
    console.error('[WEATHER] ❌ Lỗi tạo ảnh:', error);
    return null;
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function getWindDirection(degrees) {
  const directions = ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

function getMoonPhase() {
  const date = new Date();
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  const day = date.getDate();
  
  let c = 0, e = 0, jd = 0, b = 0;
  
  if (month < 3) {
    year--;
    month += 12;
  }
  
  ++month;
  c = 365.25 * year;
  e = 30.6 * month;
  jd = c + e + day - 694039.09;
  jd /= 29.5305882;
  b = parseInt(jd);
  jd -= b;
  b = Math.round(jd * 8);
  
  const phases = ['🌑 Trăng mới', '🌒 Trăng lưỡi liềm', '🌓 Trăng non', '🌔 Trăng giống', 
                  '🌕 Trăng tròn', '🌖 Trăng khuyết', '🌗 Trăng hạ huyền', '🌘 Trăng già'];
  
  return phases[b % 8];
}

function calculateDayLength(sunrise, sunset) {
  const diff = sunset - sunrise;
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  return `${hours}h ${minutes}p`;
}

async function buildImageAttachment(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;

  try {
    const buffer = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);
    const meta = await sharp(buffer).metadata();

    const fileName = path.basename(filePath);
    return {
      filename: fileName,
      data: buffer,
      metadata: {
        width: meta.width || 900,
        height: meta.height || 2100,
        totalSize: stats.size || buffer.length,
        fileName
      }
    };
  } catch (error) {
    console.error('[WEATHER] ❌ Không thể xây dựng metadata ảnh:', error);
    return null;
  }
}

module.exports.config = {
  name: "weather",
  aliases: ["thoitiet", "weather", "tt"],
  version: "4.0.0",
  role: 0,
  author: "Cascade - Ultra Premium Edition",
  description: "Xem thời tiết chi tiết với thiết kế cao cấp",
  category: "Tiện ích",
  usage: "weather <địa điểm>",
  cooldowns: 3,
  dependencies: { canvas: "", axios: "", sharp: "" }
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  
  try {
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("⚠️ Không thể lấy thông tin user:", err.message);
    }

    const userKey = `${senderId}`;
    const currentUsage = (usageMap.get(userKey) || 0) + 1;
    usageMap.set(userKey, currentUsage);

    let location = args.join(' ').toLowerCase() || 'hanoi';
    
    const normalizedLocation = location.replace(/\s+/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (vietnamCities[normalizedLocation]) {
      location = vietnamCities[normalizedLocation];
    }

    const apiKey = 'a6ac27619422e3d7be162b605b8c6512';
    
    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
      return api.sendMessage('⚠️ Chưa cấu hình API key OpenWeatherMap!', threadId, type);
    }

    await api.sendMessage('⏳ Đang tải dữ liệu thời tiết cao cấp...', threadId, type);

    let weatherData = null;
    let forecastData = [];
    
    try {
      const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric&lang=vi`;
      
      let currentResponse;
      try {
        currentResponse = await axios.get(currentUrl, { timeout: 10000 });
      } catch (apiErr) {
        if (apiErr.response?.status === 404) {
          return api.sendMessage(`❌ Không tìm thấy "${location}"!\n\n💡 Gợi ý: Hà Nội, TP. Hồ Chí Minh, Đà Nẵng, Hải Phòng, Cần Thơ`, threadId, type);
        } else if (apiErr.response?.status === 401) {
          return api.sendMessage('❌ API key không hợp lệ!', threadId, type);
        }
        throw apiErr;
      }
      
      const current = currentResponse.data;
      const lat = current.coord.lat;
      const lon = current.coord.lon;
      
      let uvIndex = null;
      let aqi = null;
      
      try {
        const uvUrl = `https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${apiKey}`;
        const uvResponse = await axios.get(uvUrl, { timeout: 5000 });
        uvIndex = Math.round(uvResponse.data.value);
      } catch (err) {
        console.log('[WEATHER] UV data not available');
      }
      
      try {
        const aqiUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
        const aqiResponse = await axios.get(aqiUrl, { timeout: 5000 });
        aqi = aqiResponse.data.list[0].main.aqi * 50;
      } catch (err) {
        console.log('[WEATHER] AQI data not available');
      }
      
      weatherData = {
        temp: Math.round(current.main.temp),
        feelsLike: Math.round(current.main.feels_like),
        tempMin: Math.round(current.main.temp_min),
        tempMax: Math.round(current.main.temp_max),
        humidity: current.main.humidity,
        pressure: current.main.pressure,
        windSpeed: Math.round(current.wind.speed * 3.6),
        windDirection: getWindDirection(current.wind.deg || 0),
        visibility: (current.visibility / 1000).toFixed(1),
        cloudiness: current.clouds.all,
        description: current.weather[0].description.charAt(0).toUpperCase() + current.weather[0].description.slice(1),
        condition: current.weather[0].main,
        sunrise: formatTime(current.sys.sunrise),
        sunset: formatTime(current.sys.sunset),
        dayLength: calculateDayLength(current.sys.sunrise, current.sys.sunset),
        moonPhase: getMoonPhase(),
        uvIndex: uvIndex,
        aqi: aqi
      };
      
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric&lang=vi`;
      const forecastResponse = await axios.get(forecastUrl, { timeout: 10000 });
      
      const dailyForecasts = {};
      forecastResponse.data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dateKey = date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
        
        if (!dailyForecasts[dateKey] && Object.keys(dailyForecasts).length < 5) {
          dailyForecasts[dateKey] = {
            date: dateKey,
            temp: Math.round(item.main.temp),
            description: item.weather[0].description,
            icon: getWeatherIcon(item.weather[0].main),
            condition: item.weather[0].main
          };
        }
      });
      
      forecastData = Object.values(dailyForecasts);
      
      console.log('[WEATHER] ✅ Lấy dữ liệu thành công:', location);
      
    } catch (err) {
      console.error('[WEATHER] ❌ Lỗi gọi API:', err.message);
      return api.sendMessage(`❌ Lỗi: ${err.message}`, threadId, type);
    }

    const imagePath = await createWeatherImage(userName, location, weatherData, forecastData, currentUsage);

    if (imagePath && fs.existsSync(imagePath)) {
      const attachment = await buildImageAttachment(imagePath);

      if (attachment) {
        await api.sendMessage({
          msg: `✨ ${userName}, thời tiết cao cấp tại ${location}!\n\n` +
               `${getWeatherIcon(weatherData.condition)} ${weatherData.temp}°C - ${weatherData.description}\n` +
               `📊 UV: ${weatherData.uvIndex || 'N/A'} | AQI: ${weatherData.aqi || 'N/A'}\n` +
               `🌅 ${weatherData.sunrise} → 🌇 ${weatherData.sunset}`,
          attachments: [attachment]
        }, threadId, type);
      }

      setTimeout(() => {
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('[WEATHER] 🗑️ Đã xóa file cache:', imagePath);
          }
        } catch (e) {
          console.log('[WEATHER] ⚠️ Lỗi xóa file:', e.message);
        }
      }, 15000);
    }
    
  } catch (error) {
    console.error("[WEATHER] ❌ Lỗi tổng quát:", error);
    return api.sendMessage('❌ Đã xảy ra lỗi! Vui lòng thử lại sau.', threadId, type);
  }
};