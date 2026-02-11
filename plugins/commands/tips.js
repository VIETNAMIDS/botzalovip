const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

module.exports.config = {
    name: "tips",
    version: "2.0.0",
    role: 0,
    author: "NLam182",
    description: "Nhận mẹo hữu ích ngẫu nhiên với hình ảnh đẹp",
    category: "Giải trí",
    usage: "tips",
    cooldowns: 2,
    dependencies: { canvas: "" },
    aliases: ["meohayho", "mẹo"]
};

// Usage counter
const usageMap = new Map();

// Tạo ảnh tips với canvas - SIÊU ĐẸP
async function createTipsImage(userName, tipText, usageCount) {
  try {
    // Canvas lớn với tỷ lệ đẹp
    const canvas = createCanvas(1600, 900);
    const ctx = canvas.getContext('2d');

    // Background gradient cực kỳ đẹp với 3-4 màu
    const gradients = [
      ['#667eea', '#764ba2', '#f093fb', '#4facfe'],
      ['#fa709a', '#fee140', '#30cfd0', '#43e97b'],
      ['#a8edea', '#fed6e3', '#fbc2eb', '#a6c1ee'],
      ['#ff9a9e', '#fecfef', '#ffecd2', '#fcb69f'],
      ['#13547a', '#80d0c7', '#a8edea', '#fed6e3'],
      ['#ffecd2', '#fcb69f', '#ff9a9e', '#fa709a'],
      ['#4facfe', '#00f2fe', '#43e97b', '#a8ff78'],
      ['#fa8bff', '#2bd2ff', '#2bff88', '#ffd700'],
      ['#ee9ca7', '#ffdde1', '#a8edea', '#fed6e3'],
      ['#f093fb', '#f5576c', '#4facfe', '#00f2fe']
    ];
    const selectedGradient = gradients[Math.floor(Math.random() * gradients.length)];
    
    // Radial gradient từ center
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvas.width);
    selectedGradient.forEach((color, i) => {
      gradient.addColorStop(i / (selectedGradient.length - 1), color);
    });
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Thêm pattern trang trí - stars & circles
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ffd700';
      ctx.beginPath();
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 80 + 10;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Thêm sparkles
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 3 + 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1.0;

    // Khung to duy nhất - glass morphism effect
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 15;
    
    // Frame chính với glass effect
    const frameGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    frameGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
    frameGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    frameGradient.addColorStop(1, 'rgba(255, 255, 255, 0.25)');
    ctx.fillStyle = frameGradient;
    ctx.roundRect(60, 60, canvas.width - 120, canvas.height - 120, 50);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    
    // Border - rainbow gradient
    const rainbowGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    rainbowGradient.addColorStop(0, '#ff0080');
    rainbowGradient.addColorStop(0.2, '#ffd700');
    rainbowGradient.addColorStop(0.4, '#00ff00');
    rainbowGradient.addColorStop(0.6, '#00ffff');
    rainbowGradient.addColorStop(0.8, '#ff00ff');
    rainbowGradient.addColorStop(1, '#ff0080');
    ctx.strokeStyle = rainbowGradient;
    ctx.lineWidth = 10;
    ctx.roundRect(60, 60, canvas.width - 120, canvas.height - 120, 50);
    ctx.stroke();

    // Header - Title
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    
    const titleGradient = ctx.createLinearGradient(0, 120, 0, 180);
    titleGradient.addColorStop(0, '#FFD700');
    titleGradient.addColorStop(1, '#FFF');
    ctx.fillStyle = titleGradient;
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('💡 MẸO HỮU ÍCH 💡', canvas.width / 2, 180);
    
    ctx.shadowColor = 'transparent';

    // Command name (góc trên phải - không có khung)
    ctx.fillStyle = 'rgba(255, 215, 0, 1)';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText('bonz tips', canvas.width - 100, 130);
    ctx.shadowColor = 'transparent';

    // User info - không có khung riêng
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 38px Arial';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText(`👤 ${userName}`, 120, 270);
    
    ctx.textAlign = 'right';
    ctx.fillText(`🔥 Lượt ${usageCount}`, canvas.width - 120, 270);
    
    ctx.shadowColor = 'transparent';

    // Separator line
    const separatorGradient = ctx.createLinearGradient(120, 320, canvas.width - 120, 320);
    separatorGradient.addColorStop(0, 'rgba(255, 215, 0, 0)');
    separatorGradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.6)');
    separatorGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.strokeStyle = separatorGradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(120, 320);
    ctx.lineTo(canvas.width - 120, 320);
    ctx.stroke();

    // Icon bulb lớn với multiple shadows
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 30;
    ctx.font = 'bold 100px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('💡', 140, 420);
    
    ctx.shadowColor = '#FF6B6B';
    ctx.shadowBlur = 20;
    ctx.fillText('💡', 140, 420);
    ctx.shadowColor = 'transparent';

    // Vẽ nội dung tip với style đẹp
    const tipTextGradient = ctx.createLinearGradient(0, 400, 0, 700);
    tipTextGradient.addColorStop(0, '#1a1a1a');
    tipTextGradient.addColorStop(1, '#2c3e50');
    ctx.fillStyle = tipTextGradient;
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'left';
    
    const maxWidth = canvas.width - 340;
    const lineHeight = 55;
    const startX = 260;
    let startY = 470;
    
    // Word wrap
    const words = String(tipText).split(' ');
    let currentLine = '';
    const lines = [];
    
    for (const word of words) {
      const testLine = currentLine + word + ' ';
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    
    // Vẽ text với shadow nhẹ
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    
    const maxLines = 6;
    const displayLines = lines.slice(0, maxLines);
    
    for (let i = 0; i < displayLines.length; i++) {
      let line = displayLines[i];
      if (i === maxLines - 1 && lines.length > maxLines) {
        line = line.substring(0, line.length - 3) + '...';
      }
      ctx.fillText(line, startX, startY + (i * lineHeight));
    }
    
    ctx.shadowColor = 'transparent';

    // Footer đơn giản
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText('✨ Doreemon Bot - Mẹo hay mỗi ngày, thành công mỗi giờ ✨', canvas.width / 2, canvas.height - 60);
    ctx.shadowColor = 'transparent';

    // Lưu file
    const cacheDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const fileName = `tips_${Date.now()}.png`;
    const filePath = path.join(cacheDir, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);

    console.log('[TIPS] Đã tạo ảnh:', filePath);
    return filePath;
    
  } catch (error) {
    console.error('[TIPS] Lỗi tạo ảnh:', error);
    return null;
  }
}

module.exports.run = async ({ args, event, api }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;

  try {
    // Lấy thông tin user
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch (err) {
      console.log('[TIPS] Không lấy được tên user:', err?.message);
    }

    // Đếm lượt dùng
    const userKey = `${senderId}`;
    const currentUsage = (usageMap.get(userKey) || 0) + 1;
    usageMap.set(userKey, currentUsage);

    // Đọc tips từ file
    const tipsPath = path.join(__dirname, '../../assets/tips.json');
    
    if (!fs.existsSync(tipsPath)) {
      return api.sendMessage(
        '❌ Không tìm thấy file tips.json trong thư mục assets!\n💡 Tạo file assets/tips.json với format: ["tip 1", "tip 2", ...]',
        threadId,
        type
      );
    }

    const tipsData = JSON.parse(fs.readFileSync(tipsPath, 'utf8'));
    
    if (!Array.isArray(tipsData) || tipsData.length === 0) {
      return api.sendMessage(
        '❌ File tips.json trống hoặc không đúng định dạng!\n💡 Format đúng: ["tip 1", "tip 2", ...]',
        threadId,
        type
      );
    }

    // Chọn tip ngẫu nhiên
    const randomTip = tipsData[Math.floor(Math.random() * tipsData.length)];

    // Tạo ảnh
    const imagePath = await createTipsImage(userName, randomTip, currentUsage);

    if (imagePath && fs.existsSync(imagePath)) {
      // Gửi ảnh
      await api.sendMessage({
        msg: `💡 ${userName}, đây là mẹo dành cho bạn!`,
        attachments: [imagePath]
      }, threadId, type);

      // Xóa file sau 10 giây
      setTimeout(() => {
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('[TIPS] Đã xóa file:', imagePath);
          }
        } catch (e) {
          console.log('[TIPS] Lỗi xóa file:', e.message);
        }
      }, 10000);
    } else {
      // Fallback: gửi text nếu không tạo được ảnh
      await api.sendMessage(
        `💡 ${userName}, đây là mẹo dành cho bạn!\n\n${randomTip}\n\n📊 Lượt dùng: ${currentUsage}`,
        threadId,
        type
      );
    }

  } catch (error) {
    console.error('[TIPS] Lỗi:', error);
    return api.sendMessage(
      '❌ Đã xảy ra lỗi khi lấy tips. Vui lòng thử lại sau!',
      threadId,
      type
    );
  }
};
