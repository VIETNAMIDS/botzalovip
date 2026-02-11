const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createCanvas } = require('canvas');

const usageMap = new Map();

async function createTranslateImage(userName, originalText, translatedText, fromLang, toLang, usageCount) {
  try {
    const canvas = createCanvas(1600, 1000);
    const ctx = canvas.getContext('2d');

    // Background gradient - màu xanh lá
    const gradients = [
      ['#11998e', '#38ef7d', '#00d2ff'],
      ['#56ab2f', '#a8e063', '#7bed9f'],
      ['#02aab0', '#00cdac', '#20bf55'],
      ['#1f4037', '#99f2c8', '#06beb6']
    ];
    const selectedGradient = gradients[Math.floor(Math.random() * gradients.length)];
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvas.width);
    selectedGradient.forEach((color, i) => {
      gradient.addColorStop(i / (selectedGradient.length - 1), color);
    });
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Language symbols decoration
    ctx.globalAlpha = 0.1;
    const symbols = ['🌐', 'A', 'あ', '中', 'ㄱ', 'Ω', '文'];
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.random() * 60 + 30}px Arial`;
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      ctx.fillText(symbols[Math.floor(Math.random() * symbols.length)], x, y);
    }
    ctx.globalAlpha = 1.0;

    // Khung to
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 15;
    
    const frameGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    frameGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    frameGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    frameGradient.addColorStop(1, 'rgba(255, 255, 255, 0.3)');
    ctx.fillStyle = frameGradient;
    ctx.roundRect(60, 60, canvas.width - 120, canvas.height - 120, 50);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    
    const borderGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    borderGradient.addColorStop(0, '#11998e');
    borderGradient.addColorStop(0.5, '#38ef7d');
    borderGradient.addColorStop(1, '#11998e');
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 10;
    ctx.roundRect(60, 60, canvas.width - 120, canvas.height - 120, 50);
    ctx.stroke();

    // Title
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    
    const titleGradient = ctx.createLinearGradient(0, 120, 0, 180);
    titleGradient.addColorStop(0, '#38ef7d');
    titleGradient.addColorStop(1, '#FFF');
    ctx.fillStyle = titleGradient;
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🌐 DỊCH THUẬT 🌐', canvas.width / 2, 180);
    ctx.shadowColor = 'transparent';

    // Command name
    ctx.fillStyle = 'rgba(17, 153, 142, 1)';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText('bonz translate', canvas.width - 100, 130);
    ctx.shadowColor = 'transparent';

    // User info
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 38px Arial';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText(`👤 ${userName}`, 120, 270);
    
    ctx.textAlign = 'right';
    ctx.fillText(`🌍 Lượt ${usageCount}`, canvas.width - 120, 270);
    ctx.shadowColor = 'transparent';

    // Separator
    const separatorGradient = ctx.createLinearGradient(120, 320, canvas.width - 120, 320);
    separatorGradient.addColorStop(0, 'rgba(17, 153, 142, 0)');
    separatorGradient.addColorStop(0.5, 'rgba(17, 153, 142, 0.6)');
    separatorGradient.addColorStop(1, 'rgba(17, 153, 142, 0)');
    ctx.strokeStyle = separatorGradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(120, 320);
    ctx.lineTo(canvas.width - 120, 320);
    ctx.stroke();

    // Language direction
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(`${fromLang} ➡️ ${toLang}`, canvas.width / 2, 390);
    ctx.shadowColor = 'transparent';

    // Original text box
    const boxGradient1 = ctx.createLinearGradient(0, 430, 0, 600);
    boxGradient1.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    boxGradient1.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
    ctx.fillStyle = boxGradient1;
    ctx.roundRect(120, 430, canvas.width - 240, 150, 20);
    ctx.fill();
    
    ctx.strokeStyle = '#11998e';
    ctx.lineWidth = 3;
    ctx.roundRect(120, 430, canvas.width - 240, 150, 20);
    ctx.stroke();
    
    ctx.fillStyle = '#0d7377';
    ctx.font = 'bold 38px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(originalText.substring(0, 80) + (originalText.length > 80 ? '...' : ''), 150, 520);

    // Arrow
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38ef7d';
    ctx.fillText('⬇️', canvas.width / 2, 650);

    // Translated text box
    const boxGradient2 = ctx.createLinearGradient(0, 690, 0, 860);
    boxGradient2.addColorStop(0, 'rgba(56, 239, 125, 0.3)');
    boxGradient2.addColorStop(1, 'rgba(17, 153, 142, 0.3)');
    ctx.fillStyle = boxGradient2;
    ctx.roundRect(120, 690, canvas.width - 240, 150, 20);
    ctx.fill();
    
    ctx.strokeStyle = '#38ef7d';
    ctx.lineWidth = 4;
    ctx.roundRect(120, 690, canvas.width - 240, 150, 20);
    ctx.stroke();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px Arial';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.textAlign = 'left';
    ctx.fillText(translatedText.substring(0, 70) + (translatedText.length > 70 ? '...' : ''), 150, 780);
    ctx.shadowColor = 'transparent';

    // Footer
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText('🌐 Bonz Vip - Phá vỡ rào cản ngôn ngữ 🌐', canvas.width / 2, canvas.height - 40);
    ctx.shadowColor = 'transparent';

    const cacheDir = path.join(__dirname, '../../cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const fileName = `translate_${Date.now()}.png`;
    const filePath = path.join(cacheDir, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);

    console.log('[TRANSLATE] Đã tạo ảnh:', filePath);
    return filePath;
    
  } catch (error) {
    console.error('[TRANSLATE] Lỗi tạo ảnh:', error);
    return null;
  }
}

module.exports.config = {
  name: "translate",
  aliases: ["dich", "trans"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Dịch văn bản với hình ảnh đẹp",
  category: "Tiện ích",
  usage: "translate <văn bản>",
  cooldowns: 3,
  dependencies: { canvas: "", axios: "" }
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  
  try {
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {}

    const userKey = `${senderId}`;
    const currentUsage = (usageMap.get(userKey) || 0) + 1;
    usageMap.set(userKey, currentUsage);

    const text = args.join(' ');
    if (!text) {
      return api.sendMessage('❌ Vui lòng nhập văn bản cần dịch!\n💡 Ví dụ: bonz translate Hello', threadId, type);
    }

    // API Google Translate THẬT - MIỄN PHÍ 100%
    let translatedText = text;
    let fromLang = 'AUTO';
    let toLang = 'VI';
    
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
      const response = await axios.get(url, { timeout: 8000 });
      
      translatedText = response.data[0].map(item => item[0]).join('');
      fromLang = (response.data[2] || 'auto').toUpperCase();
      toLang = 'VI';
    } catch (err) {
      console.log('Lỗi gọi API translate:', err.message);
      translatedText = `Không thể dịch. Lỗi: ${err.message}`;
    }

    const imagePath = await createTranslateImage(userName, text, translatedText, fromLang, toLang, currentUsage);

    if (imagePath && fs.existsSync(imagePath)) {
      await api.sendMessage({
        msg: `🌐 ${userName}, kết quả dịch thuật!`,
        attachments: [imagePath]
      }, threadId, type);

      setTimeout(() => {
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('[TRANSLATE] Đã xóa file:', imagePath);
          }
        } catch (e) {}
      }, 10000);
    } else {
      return api.sendMessage(`🌐 Bản dịch:\n\n${translatedText}`, threadId, type);
    }
    
  } catch (error) {
    console.error("Lỗi translate:", error);
    return api.sendMessage('❌ Lỗi khi dịch văn bản!', threadId, type);
  }
};
