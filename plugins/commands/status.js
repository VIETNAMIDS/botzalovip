const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

async function createStatusImage(text, userInfo) {
  const width = 900;

  // Canvas tạm để đo text và wrap dòng
  const tempCanvas = createCanvas(width, 1);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = 'bold 44px Arial';

  const paragraphs = String(text || '').split('\n');
  const lines = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';
    const maxWidth = width - 120;

    for (let i = 0; i < words.length; i++) {
      let word = words[i];

      while (word.length > 0) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const lineWidth = tempCtx.measureText(testLine).width;

        if (lineWidth < maxWidth) {
          currentLine = testLine;
          word = '';
        } else if (!currentLine) {
          let partialWord = word;
          while (partialWord.length > 0 && tempCtx.measureText(partialWord).width >= maxWidth) {
            partialWord = partialWord.slice(0, -1);
          }
          if (partialWord.length > 0) {
            lines.push(partialWord);
            word = word.slice(partialWord.length);
          } else {
            lines.push(word.charAt(0));
            word = word.slice(1);
          }
          currentLine = '';
        } else {
          lines.push(currentLine);
          currentLine = '';
        }
      }
    }

    if (currentLine) lines.push(currentLine);
  }

  const headerHeight = 140;
  const lineHeight = 58;
  const totalTextHeight = lines.length * lineHeight;
  const minContentHeight = 450;
  const contentPadding = 70;
  const contentHeight = Math.max(minContentHeight, totalTextHeight + contentPadding * 2);
  const footerHeight = 130;
  const height = headerHeight + contentHeight + footerHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background cover (nếu có)
  const coverUrl = userInfo?.cover || null;
  if (coverUrl) {
    try {
      const cover = await loadImage(coverUrl);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, headerHeight, width, height - headerHeight - footerHeight);
      ctx.clip();

      const scale = Math.max(width / cover.width, (height - headerHeight - footerHeight) / cover.height);
      const coverWidth = cover.width * scale;
      const coverHeight = cover.height * scale;
      const x = (width - coverWidth) / 2;
      const y = headerHeight + ((height - headerHeight - footerHeight) - coverHeight) / 2;

      ctx.drawImage(cover, x, y, coverWidth, coverHeight);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, headerHeight, width, height - headerHeight - footerHeight);
      ctx.restore();
    } catch (e) {
      console.error('[STATUSPOST] Lỗi load cover:', e.message || e);
      const contentGradient = ctx.createLinearGradient(0, headerHeight, width, height - footerHeight);
      contentGradient.addColorStop(0, '#1877F2');
      contentGradient.addColorStop(1, '#0C63D4');
      ctx.fillStyle = contentGradient;
      ctx.fillRect(0, headerHeight, width, height - headerHeight - footerHeight);
    }
  } else {
    const contentGradient = ctx.createLinearGradient(0, headerHeight, width, height - footerHeight);
    contentGradient.addColorStop(0, '#1877F2');
    contentGradient.addColorStop(1, '#0C63D4');
    ctx.fillStyle = contentGradient;
    ctx.fillRect(0, headerHeight, width, height - headerHeight - footerHeight);
  }

  // Header trắng
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, headerHeight);

  const avatarSize = 90;
  const avatarX = 35;

  // Avatar (nếu có)
  const avatarUrl = userInfo?.avatar || null;
  if (avatarUrl) {
    try {
      const avatar = await loadImage(avatarUrl);
      const avatarY = (headerHeight - avatarSize) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // Border avatar
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#E4E6EB';
      ctx.lineWidth = 2;
      ctx.stroke();
    } catch (e) {
      console.error('[STATUSPOST] Lỗi load avatar:', e.message || e);
    }
  }

  // Text header: tên + thời gian
  const displayName = userInfo?.name || userInfo?.displayName || 'Người dùng';
  const textX = avatarX + avatarSize + 20;
  const nameY = headerHeight / 2 - 8;
  const timeY = headerHeight / 2 + 24;

  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#050505';
  ctx.textAlign = 'left';
  ctx.fillText(displayName, textX, nameY);

  const now = new Date();
  const timeStr = now.toLocaleString('vi-VN', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit', 
    minute: '2-digit'
  });
  ctx.font = '22px Arial';
  ctx.fillStyle = '#65676B';
  ctx.fillText(timeStr + ' · 🌍', textX, timeY);

  // Nội dung status
  ctx.font = 'bold 44px Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const contentStartY = headerHeight;
  const contentEndY = height - footerHeight;
  const contentCenterY = (contentStartY + contentEndY) / 2;
  const textStartY = contentCenterY - totalTextHeight / 2;

  lines.forEach((line, index) => {
    if (!line) return;
    const lineY = textStartY + index * lineHeight;
    ctx.fillText(line, width / 2, lineY);
  });

  // === FOOTER FACEBOOK ===
  const footerStartY = height - footerHeight;
  
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, footerStartY, width, footerHeight);

  // Đường kẻ ngăn cách
  ctx.strokeStyle = '#CED0D4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, footerStartY);
  ctx.lineTo(width, footerStartY);
  ctx.stroke();

  // === TƯƠNG TÁC (Like, Comment, Share) ===
  const interactionY = footerStartY + 24;
  
  const likeCount = Math.floor(Math.random() * 100) + 20;
  const commentCount = Math.floor(Math.random() * 30) + 5;
  const shareCount = Math.floor(Math.random() * 15) + 2;
  
  // Vẽ reaction icons giống Facebook thật
  const iconSize = 22;
  let iconX = 40;
  
  // Helper để vẽ icon Like (thumbs up xanh)
  function drawThumbsUp(x, y, size) {
    ctx.save();
    
    // Background circle xanh Facebook
    ctx.fillStyle = '#1877F2';
    ctx.beginPath();
    ctx.arc(x, y, size/2, 0, Math.PI * 2);
    ctx.fill();
    
    // Vẽ thumbs up icon trắng (đơn giản hóa)
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Ngón cái
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 2);
    ctx.lineTo(x - 3, y - 5);
    ctx.lineTo(x - 1, y - 6);
    ctx.lineTo(x + 1, y - 6);
    ctx.lineTo(x + 2, y - 5);
    ctx.lineTo(x + 2, y - 2);
    ctx.fill();
    
    // Bàn tay
    ctx.fillRect(x - 5, y - 2, 3, 6);
    ctx.fillRect(x - 3, y - 2, 6, 6);
    
    ctx.restore();
  }
  
  // Helper để vẽ icon Love (heart đỏ)
  function drawHeart(x, y, size) {
    ctx.save();
    
    // Background circle đỏ
    ctx.fillStyle = '#F33E58';
    ctx.beginPath();
    ctx.arc(x, y, size/2, 0, Math.PI * 2);
    ctx.fill();
    
    // Vẽ heart trắng
    ctx.fillStyle = '#FFFFFF';
    const s = size * 0.25;
    
    ctx.beginPath();
    ctx.moveTo(x, y + s * 1.5);
    
    // Nửa trái
    ctx.bezierCurveTo(x - s * 2, y - s * 0.5, x - s * 2, y - s * 1.8, x, y - s * 1.2);
    
    // Nửa phải
    ctx.bezierCurveTo(x + s * 2, y - s * 1.8, x + s * 2, y - s * 0.5, x, y + s * 1.5);
    
    ctx.fill();
    
    ctx.restore();
  }
  
  // Helper để vẽ icon Haha (mặt cười vàng)
  function drawHaha(x, y, size) {
    ctx.save();
    
    // Background circle vàng
    ctx.fillStyle = '#F7B125';
    ctx.beginPath();
    ctx.arc(x, y, size/2, 0, Math.PI * 2);
    ctx.fill();
    
    // Mắt (2 chấm đen)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 3, y - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Miệng cười (arc)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y + 1, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
    
    ctx.restore();
  }
  
  // Vẽ 3 reaction icons
  drawThumbsUp(iconX + iconSize/2, interactionY, iconSize);
  iconX += iconSize - 3;
  
  drawHeart(iconX + iconSize/2, interactionY, iconSize);
  iconX += iconSize - 3;
  
  drawHaha(iconX + iconSize/2, interactionY, iconSize);
  iconX += iconSize + 8;
  
  // Số lượt
  ctx.font = '20px Arial';
  ctx.fillStyle = '#65676B';
  ctx.textAlign = 'left';
  ctx.fillText(`${likeCount}`, iconX, interactionY + 5);
  
  ctx.textAlign = 'right';
  ctx.fillText(`${commentCount} bình luận · ${shareCount} lượt chia sẻ`, width - 40, interactionY + 5);

  // Đường kẻ ngăn cách
  ctx.strokeStyle = '#CED0D4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, interactionY + 20);
  ctx.lineTo(width - 40, interactionY + 20);
  ctx.stroke();

  // === FOOTER BUTTONS (Giống Facebook thật) ===
  const buttonY = interactionY + 52;
  const buttonSpacing = (width - 80) / 3;

  // Helper để vẽ icon Thích (thumbs up outline)
  function drawLikeButton(x, y) {
    ctx.strokeStyle = '#65676B';
    ctx.fillStyle = 'transparent';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Ngón cái
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x - 5, y - 4);
    ctx.quadraticCurveTo(x - 5, y - 6, x - 3, y - 6);
    ctx.lineTo(x, y - 6);
    ctx.quadraticCurveTo(x + 2, y - 6, x + 2, y - 4);
    ctx.lineTo(x + 2, y);
    ctx.stroke();
    
    // Bàn tay
    ctx.strokeRect(x - 8, y, 4, 5);
    ctx.strokeRect(x - 5, y, 8, 5);
  }
  
  // Helper để vẽ icon Bình luận (chat bubble outline)
  function drawCommentButton(x, y) {
    ctx.strokeStyle = '#65676B';
    ctx.fillStyle = 'transparent';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Bubble chính
    ctx.beginPath();
    ctx.arc(x, y, 5, Math.PI * 0.7, Math.PI * 2.3);
    ctx.stroke();
    
    // Đuôi bubble
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 4);
    ctx.lineTo(x - 4, y + 7);
    ctx.lineTo(x, y + 5);
    ctx.stroke();
  }
  
  // Helper để vẽ icon Chia sẻ (share arrow outline)
  function drawShareButton(x, y) {
    ctx.strokeStyle = '#65676B';
    ctx.fillStyle = 'transparent';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Mũi tên
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 2);
    ctx.lineTo(x, y - 6);
    ctx.lineTo(x, y - 3);
    ctx.stroke();
    
    // Đường cong
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.quadraticCurveTo(x - 4, y - 3, x - 4, y + 1);
    ctx.lineTo(x - 6, y + 1);
    ctx.stroke();
  }

  // Nút Thích
  const likeButtonX = 40 + buttonSpacing / 2;
  drawLikeButton(likeButtonX - 28, buttonY);
  ctx.font = '20px Arial';
  ctx.fillStyle = '#65676B';
  ctx.textAlign = 'center';
  ctx.fillText('Thích', likeButtonX + 8, buttonY + 2);

  // Nút Bình luận
  const commentButtonX = 40 + buttonSpacing * 1.5;
  drawCommentButton(commentButtonX - 38, buttonY);
  ctx.fillText('Bình luận', commentButtonX + 8, buttonY + 2);

  // Nút Chia sẻ
  const shareButtonX = 40 + buttonSpacing * 2.5;
  drawShareButton(shareButtonX - 30, buttonY);
  ctx.fillText('Chia sẻ', shareButtonX + 8, buttonY + 2);

  // Đường kẻ giữa các nút
  ctx.strokeStyle = '#CED0D4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40 + buttonSpacing, buttonY - 22);
  ctx.lineTo(40 + buttonSpacing, buttonY + 12);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(40 + buttonSpacing * 2, buttonY - 22);
  ctx.lineTo(40 + buttonSpacing * 2, buttonY + 12);
  ctx.stroke();

  // Lưu file
  const cacheDir = path.join(__dirname, '../../cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const filePath = path.join(cacheDir, `status_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

module.exports.config = {
  name: 'statuspost',
  aliases: ['stt', 'status'],
  version: '2.2.0',
  role: 0,
  author: 'Cascade',
  description: 'Tạo ảnh trạng thái giống Facebook',
  category: 'Tiện ích',
  usage: 'statuspost <nội dung>',
  cooldowns: 3,
  dependencies: { canvas: '' }
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  const content = args.join(' ').trim();
  if (!content) {
    return api.sendMessage('⚠️ Vui lòng nhập nội dung trạng thái.\nVí dụ: statuspost Hôm nay trời đẹp quá!', threadId, type);
  }

  const senderId = data?.uidFrom;
  if (!senderId) {
    return api.sendMessage('❌ Không xác định được người gửi.', threadId, type);
  }

  let userInfo = { name: 'Người dùng' };
  try {
    const info = await api.getUserInfo(senderId);
    const profile = info?.changed_profiles?.[senderId] || {};
    userInfo = {
      name: profile.displayName || 'Người dùng',
      displayName: profile.displayName || 'Người dùng',
      avatar: profile.avatar || profile.avatarUrl || null,
      cover: profile.coverPhoto || profile.cover || null
    };
  } catch (e) {
    console.log('[STATUSPOST] Không thể lấy thông tin user:', e.message || e);
  }

  let imagePath = null;
  try {
    imagePath = await createStatusImage(content, userInfo);

    if (imagePath && fs.existsSync(imagePath)) {
      await api.sendMessage({
        msg: '',
        attachments: [imagePath]
      }, threadId, type);

      setTimeout(() => {
        try {
          if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        } catch (err) {
          console.log('[STATUSPOST] Lỗi xóa file tạm:', err.message || err);
        }
      }, 10000);
    } else {
      return api.sendMessage('❌ Không tạo được ảnh trạng thái, vui lòng thử lại sau.', threadId, type);
    }
  } catch (err) {
    console.error('[STATUSPOST] Lỗi tạo ảnh trạng thái:', err);
    return api.sendMessage('❌ Đã xảy ra lỗi khi tạo ảnh trạng thái.', threadId, type);
  }
};