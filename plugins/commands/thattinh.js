const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Usage counter
const usageMap = new Map();

// Tạo ảnh thả thính với canvas
async function createThaTinhImage(userName, thinhText, usageCount) {
  try {
    // Canvas với tỷ lệ đẹp
    const canvas = createCanvas(1600, 900);
    const ctx = canvas.getContext('2d');

    // Background gradient romantic - màu hồng đỏ
    const gradients = [
      ['#ff6b9d', '#c44569', '#ffa8b8'],
      ['#ee9ca7', '#ffdde1', '#ff6b9d'],
      ['#ff758c', '#ff7eb3', '#ffa8b8'],
      ['#fa709a', '#fee140', '#ffc3a0'],
      ['#f093fb', '#f5576c', '#ff758c'],
      ['#ff9a9e', '#fecfef', '#ffc3a0'],
      ['#ffc3a0', '#ffafbd', '#ff758c'],
      ['#ff6b6b', '#ee5a6f', '#c44569']
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

    // Thêm hearts trang trí
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ff1744';
      ctx.font = `${Math.random() * 60 + 20}px Arial`;
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      ctx.fillText('❤️', x, y);
    }
    
    // Thêm sparkles
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 4 + 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1.0;

    // Khung to duy nhất
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 15;
    
    // Frame chính với glass effect
    const frameGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    frameGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    frameGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    frameGradient.addColorStop(1, 'rgba(255, 255, 255, 0.3)');
    ctx.fillStyle = frameGradient;
    ctx.roundRect(60, 60, canvas.width - 120, canvas.height - 120, 50);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    
    // Border - romantic gradient
    const borderGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    borderGradient.addColorStop(0, '#ff1744');
    borderGradient.addColorStop(0.25, '#ff6090');
    borderGradient.addColorStop(0.5, '#ffc3a0');
    borderGradient.addColorStop(0.75, '#ff6090');
    borderGradient.addColorStop(1, '#ff1744');
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 10;
    ctx.roundRect(60, 60, canvas.width - 120, canvas.height - 120, 50);
    ctx.stroke();

    // Header - Title
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    
    const titleGradient = ctx.createLinearGradient(0, 120, 0, 180);
    titleGradient.addColorStop(0, '#ff1744');
    titleGradient.addColorStop(1, '#FFF');
    ctx.fillStyle = titleGradient;
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('💘 THẢ THÍNH 💘', canvas.width / 2, 180);
    
    ctx.shadowColor = 'transparent';

    // Command name (góc trên phải)
    ctx.fillStyle = 'rgba(255, 23, 68, 1)';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText('bonz thính', canvas.width - 100, 130);
    ctx.shadowColor = 'transparent';

    // User info
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 38px Arial';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText(`👤 ${userName}`, 120, 270);
    
    ctx.textAlign = 'right';
    ctx.fillText(`💕 Lượt ${usageCount}`, canvas.width - 120, 270);
    
    ctx.shadowColor = 'transparent';

    // Separator line
    const separatorGradient = ctx.createLinearGradient(120, 320, canvas.width - 120, 320);
    separatorGradient.addColorStop(0, 'rgba(255, 23, 68, 0)');
    separatorGradient.addColorStop(0.5, 'rgba(255, 23, 68, 0.7)');
    separatorGradient.addColorStop(1, 'rgba(255, 23, 68, 0)');
    ctx.strokeStyle = separatorGradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(120, 320);
    ctx.lineTo(canvas.width - 120, 320);
    ctx.stroke();

    // Icon heart lớn với multiple shadows
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = 30;
    ctx.font = 'bold 100px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('💖', 140, 420);
    
    ctx.shadowColor = '#ff6090';
    ctx.shadowBlur = 20;
    ctx.fillText('💖', 140, 420);
    ctx.shadowColor = 'transparent';

    // Vẽ nội dung thính
    const textGradient = ctx.createLinearGradient(0, 400, 0, 700);
    textGradient.addColorStop(0, '#2c003e');
    textGradient.addColorStop(1, '#4a0e4e');
    ctx.fillStyle = textGradient;
    ctx.font = 'bold 38px Arial';
    ctx.textAlign = 'left';
    
    const maxWidth = canvas.width - 340;
    const lineHeight = 52;
    const startX = 260;
    let startY = 470;
    
    // Word wrap
    const words = String(thinhText).split(' ');
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
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
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

    // Footer
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText('💕 Bonz Vip - Thả thính mỗi ngày, yêu thương tràn đầy 💕', canvas.width / 2, canvas.height - 40);
    ctx.shadowColor = 'transparent';

    // Lưu file
    const cacheDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const fileName = `thathinh_${Date.now()}.png`;
    const filePath = path.join(cacheDir, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);

    console.log('[THẢ THÍNH] Đã tạo ảnh:', filePath);
    return filePath;
    
  } catch (error) {
    console.error('[THẢ THÍNH] Lỗi tạo ảnh:', error);
    return null;
  }
}

module.exports.config = {
  name: "thathinh",
  aliases: ["thinh"],
  version: "2.0.0",
  role: 0,
  author: "Cascade",
  description: "Thả thính với câu nói ngọt ngào và hình ảnh đẹp",
  category: "Giải trí",
  usage: "thathinh",
  cooldowns: 3,
  dependencies: { canvas: "" }
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;  
  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
  }
  
  try {
    const senderId = data.uidFrom;
    
    // Lấy thông tin người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Danh sách câu thính vô hạn
    const thinhLines = [
      "Anh có thể làm GPS của em được không? Vì anh luôn dẫn đường cho trái tim em đi đúng hướng 💕",
      "Em có phải là WiFi không? Vì anh muốn kết nối với em suốt đời 📶",
      "Anh có thể mượn một nụ hôn không? Anh hứa sẽ trả lại em 😘",
      "Em có tin vào tình yêu sét đánh không? Hay em muốn anh quay lại lần nữa? ⚡",
      "Anh nghĩ em bị cận thị, vì em không thể nhìn thấy tương lai của chúng ta 👓",
      "Em có phải là Google không? Vì em có tất cả những gì anh đang tìm kiếm 🔍",
      "Anh có thể chụp ảnh em không? Để anh có thể chứng minh với bạn bè rằng thiên thần có thật 📸",
      "Em có phải là ma thuật không? Vì mỗi khi nhìn em, mọi người khác đều biến mất 🪄",
      "Anh có thể theo em về nhà không? Vì bố mẹ anh bảo anh phải theo đuổi ước mơ 🏠",
      "Em có phải là thời tiết không? Vì em làm anh nóng lên từng ngày 🌡️",
      "Anh có thể mượn bản đồ không? Vì anh bị lạc trong đôi mắt em rồi 🗺️",
      "Em có phải là ngân hàng không? Vì em có tất cả sự quan tâm của anh 🏦",
      "Anh nghĩ em là một tên trộm, vì em đã đánh cắp trái tim anh 💔",
      "Em có phải là cà phê không? Vì em làm anh tỉnh táo suốt đêm ☕",
      "Anh có thể là người giao hàng không? Vì anh muốn giao trái tim mình cho em 📦",
      "Em có phải là bài hát không? Vì anh không thể ngừng nghĩ về em 🎵",
      "Anh có thể làm nhiếp ảnh gia không? Vì anh muốn chụp mọi khoảnh khắc với em 📷",
      "Em có phải là mặt trời không? Vì em làm sáng cả thế giới của anh ☀️",
      "Anh có thể mượn cây bút không? Để viết tên em vào trái tim anh ✏️",
      "Em có phải là sách không? Vì anh muốn đọc em suốt đời 📚",
      "Anh có thể làm bác sĩ không? Vì trái tim anh đập nhanh mỗi khi gặp em 💓",
      "Em có phải là kem không? Vì em ngọt ngào và làm anh tan chảy 🍦",
      "Anh có thể làm thầy giáo không? Vì anh muốn dạy em cách yêu 👨‍🏫",
      "Em có phải là điện thoại không? Vì anh muốn cầm em suốt ngày 📱",
      "Anh có thể làm phi công không? Vì anh muốn bay cùng em đến tận cùng thế giới ✈️",
      "Em có phải là chocolate không? Vì em ngọt ngào và gây nghiện 🍫",
      "Anh có thể làm nhạc sĩ không? Vì anh muốn sáng tác bài hát về em 🎼",
      "Em có phải là mưa không? Vì em làm anh muốn ở nhà cả ngày 🌧️",
      "Anh có thể làm đầu bếp không? Vì anh muốn nấu ăn cho em cả đời 👨‍🍳",
      "Em có phải là ngôi sao không? Vì em sáng nhất trong đêm tối của anh ⭐",
      "Anh có thể làm kỹ sư không? Vì anh muốn xây dựng tương lai với em 👷",
      "Em có phải là hoa không? Vì em thơm và đẹp nhất trong vườn của anh 🌸",
      "Anh có thể làm tài xế không? Vì anh muốn chở em đi khắp nơi 🚗",
      "Em có phải là kim cương không? Vì em quý giá và lấp lánh nhất 💎",
      "Anh có thể làm thơ không? Vì anh muốn viết về em cả đời 📝",
      "Em có phải là mật ong không? Vì em ngọt ngào và quý hiếm 🍯",
      "Anh có thể làm thám tử không? Vì anh muốn khám phá trái tim em 🔍",
      "Em có phải là ánh sáng không? Vì em xua tan bóng tối trong lòng anh 💡",
      "Anh có thể làm họa sĩ không? Vì anh muốn vẽ em trong từng giấc mơ 🎨",
      "Em có phải là thuốc không? Vì em chữa lành mọi nỗi đau của anh 💊"
    ];

    // Đếm lượt dùng
    const userKey = `${senderId}`;
    const currentUsage = (usageMap.get(userKey) || 0) + 1;
    usageMap.set(userKey, currentUsage);

    // Chọn câu thính ngẫu nhiên
    const randomThinh = thinhLines[Math.floor(Math.random() * thinhLines.length)];

    // Tạo ảnh
    const imagePath = await createThaTinhImage(userName, randomThinh, currentUsage);

    if (imagePath && fs.existsSync(imagePath)) {
      // Gửi ảnh
      await api.sendMessage({
        msg: `💘 ${userName}, câu thính dành cho bạn!`,
        attachments: [imagePath]
      }, threadId, type);

      // Xóa file sau 10 giây
      setTimeout(() => {
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('[THẢ THÍNH] Đã xóa file:', imagePath);
          }
        } catch (e) {
          console.log('[THẢ THÍNH] Lỗi xóa file:', e.message);
        }
      }, 10000);
    } else {
      // Fallback: gửi text nếu không tạo được ảnh
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz thả thính`,
        `Thông báo: Thành công`,
        `Câu thính: ${randomThinh}`,
        `💕 Lượt dùng: ${currentUsage}`,
        `Cách dùng: Sử dụng để tán gái/trai, thả thính crush`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type, null, senderId);
    }
    
  } catch (error) {
    console.error("Lỗi thả thính:", error);
    
    const response = [
      `Người dùng: ${userName || "Người dùng"}`,
      `Dịch vụ: bonz thả thính`,
      `Thông báo: Lỗi hệ thống`,
      `Câu thính: Không có`,
      `Cách dùng: Có lỗi xảy ra, vui lòng thử lại sau`
    ].join("\n");
    
    return api.sendMessage(response, threadId, type, null, data.uidFrom);
  }
};
