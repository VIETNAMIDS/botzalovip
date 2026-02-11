const fs = require("fs").promises;
const { createCanvas, registerFont, loadImage } = require("canvas");

/* // TÙY CHỌN: Nếu máy chủ của bạn có font, hãy dùng.
// Nếu không, nó sẽ tự dùng font 'Arial' mặc định.
try {
    // registerFont('path/to/font/YourBoldFont.ttf', { family: 'YourFont', weight: 'bold' });
    // registerFont('path/to/font/YourRegularFont.ttf', { family: 'YourFont', weight: 'normal' });
} catch (e) {
    console.log("Không thể tải font tùy chỉnh, sử dụng font mặc định.");
}
*/

// CHÚ Ý: Đổi 'Arial' thành 'YourFont' nếu bạn đăng ký font ở trên
const FONT_BOLD = 'bold 70px Arial';
const FONT_REGULAR = 'normal 40px Arial';
const FONT_LIGHT = '300 30px Arial';

module.exports.config = {
    name: "name",
    version: "3.0.0", // Nâng cấp phiên bản
    role: 1,
    author: "Cascade + AI (Refined by Gemini)", // Giữ author gốc và thêm người sửa
    description: "Đổi tên nhóm với thiết kế premium tinh tế",
    category: "Nhóm",
    usage: "name <tên_mới> | name help",
    cooldowns: 2,
    dependencies: {
        "canvas": ""
    }
};

// --- CÁC HÀM VẼ TIỆN ÍCH ---

// Hàm vẽ glassmorphism effect
function drawGlassCard(ctx, x, y, width, height, radius) {
    ctx.save();

    // Background blur effect
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; // Giảm độ mờ
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 25; // Tăng blur
    ctx.shadowOffsetY = 10;
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();

    // Border gradient
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // Tăng độ mờ viền
    ctx.lineWidth = 1.5;
    ctx.roundRect(x, y, width, height, radius);
    ctx.stroke();

    ctx.restore();
}

// [MỚI] Hàm vẽ vầng sáng mềm mại
function drawAura(ctx, x, y, radius, color) {
    ctx.save();
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `${color}0.3)`); // Thêm alpha
    gradient.addColorStop(0.5, `${color}0.1)`);
    gradient.addColorStop(1, `${color}0.0)`);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// [MỚI] Hàm vẽ nền chung
function createPremiumBackground(ctx, width, height) {
    // Nền gradient xanh-tím than
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0f2027');
    gradient.addColorStop(0.5, '#203a43');
    gradient.addColorStop(1, '#2c5364');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Thêm các vầng sáng
    drawAura(ctx, width * 0.1, height * 0.2, 400, 'rgba(0, 150, 255,');
    drawAura(ctx, width * 0.8, height * 0.7, 500, 'rgba(150, 50, 255,');
    drawAura(ctx, width * 0.5, height * 1.1, 350, 'rgba(0, 242, 254,');
}

// [MỚI] Hàm tự động xuống dòng và co chữ
function wrapAndScaleText(ctx, text, maxWidth, initialFontSize, y) {
    let fontSize = initialFontSize;
    ctx.font = `bold ${fontSize}px Arial`;
    let textWidth = ctx.measureText(text).width;
    
    // Giảm cỡ chữ nếu quá dài
    while (textWidth > maxWidth && fontSize > 20) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px Arial`;
        textWidth = ctx.measureText(text).width;
    }
    
    // Vẽ text
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 20;
    ctx.fillText(text, 700, y);
    ctx.shadowBlur = 0;
}

// --- CÁC HÀM TẠO ẢNH CHÍNH ---

// [ĐÃ SỬA] Tạo ảnh khi đổi tên thành công
async function createNameChangeImage(newName, avatarUrl) {
    const canvas = createCanvas(1400, 900);
    const ctx = canvas.getContext('2d');
    const centerX = 700;

    // 1. Vẽ nền
    createPremiumBackground(ctx, 1400, 900);

    // 2. Thẻ Glass chính - căn giữa (tăng height cho avatar)
    const mainCardWidth = 1100;
    const mainCardX = (1400 - mainCardWidth) / 2;
    drawGlassCard(ctx, mainCardX, 80, mainCardWidth, 680, 40);

    // 3. Avatar người dùng - hình tròn đẹp
    const avatarSize = 120;
    const avatarX = centerX;
    const avatarY = 200;
    
    ctx.save();
    try {
        if (avatarUrl) {
            const avatar = await loadImage(avatarUrl);
            
            // Vẽ glow effect trước
            ctx.shadowColor = '#00f2fe';
            ctx.shadowBlur = 25;
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarSize / 2 + 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 242, 254, 0.2)';
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Clip hình tròn và vẽ avatar
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatar, avatarX - avatarSize/2, avatarY - avatarSize/2, avatarSize, avatarSize);
            ctx.restore();
            
            // Vẽ viền gradient
            ctx.save();
            const borderGradient = ctx.createLinearGradient(avatarX - avatarSize/2, 0, avatarX + avatarSize/2, 0);
            borderGradient.addColorStop(0, '#00f2fe');
            borderGradient.addColorStop(0.5, '#4facfe');
            borderGradient.addColorStop(1, '#f093fb');
            
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarSize / 2 + 4, 0, Math.PI * 2);
            ctx.strokeStyle = borderGradient;
            ctx.lineWidth = 5;
            ctx.stroke();
        }
    } catch (e) {
        // Nếu không load được avatar, vẽ icon mặc định
        ctx.fillStyle = 'rgba(0, 242, 254, 0.2)';
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#00f2fe';
        ctx.font = 'bold 60px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👤', avatarX, avatarY);
    }
    ctx.restore();
    
    // 4. Icon Checkmark nhỏ ở góc avatar
    ctx.save();
    const checkX = avatarX + avatarSize / 2 - 20;
    const checkY = avatarY + avatarSize / 2 - 20;
    const checkSize = 35;
    
    // Vẽ background cho check
    ctx.fillStyle = '#10b981';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(checkX, checkY, checkSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Vẽ dấu check
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(checkX - 8, checkY);
    ctx.lineTo(checkX - 2, checkY + 6);
    ctx.lineTo(checkX + 8, checkY - 6);
    ctx.stroke();
    
    ctx.restore();

    // 5. Tiêu đề - căn giữa (dưới avatar)
    ctx.font = 'bold 38px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ĐÃ CẬP NHẬT TÊN NHÓM', centerX, 340);

    // 6. Tên mới (Tự động co giãn) - căn giữa
    ctx.fillStyle = '#ffffff';
    wrapAndScaleText(ctx, newName, 950, 70, 440);

    // 7. Phụ đề - căn giữa
    ctx.font = '27px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillText('Tên nhóm mới của bạn đã được lưu thành công.', centerX, 540);

    // 8. Footer - căn giữa
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText('💫 BONZ MÃI VIP 💫', centerX, 820);

    return canvas.toBuffer('image/png');
}

// [ĐÃ SỬA] Tạo ảnh help
async function createNameHelpImage() {
    const canvas = createCanvas(1400, 950);
    const ctx = canvas.getContext('2d');
    const centerX = 700;

    // 1. Vẽ nền
    createPremiumBackground(ctx, 1400, 950);

    // 2. Thẻ Glass chính - căn giữa hoàn hảo
    const mainCardWidth = 1100;
    const mainCardX = (1400 - mainCardWidth) / 2;
    drawGlassCard(ctx, mainCardX, 80, mainCardWidth, 780, 40);

    // 3. Header - căn giữa
    ctx.font = 'bold 60px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 20;
    ctx.fillText('✏️ Hướng Dẫn Sử Dụng', centerX, 170);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = 'bold 35px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('Lệnh Name', centerX, 220);

    let currentY = 300;
    const cardWidth = 900;
    const cardX = (1400 - cardWidth) / 2;
    const accentColor = '#00f2fe';

    // 4. Thẻ Cú Pháp - căn giữa
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
    ctx.lineWidth = 2;
    ctx.roundRect(cardX, currentY, cardWidth, 120, 20);
    ctx.fill();
    ctx.stroke();
    
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('📝 CÚ PHÁP', centerX, currentY + 42);
    
    ctx.font = 'bold 38px Arial';
    ctx.fillStyle = accentColor;
    ctx.fillText('name <tên_mới>', centerX, currentY + 88);
    ctx.restore();

    // 5. Thẻ Ví dụ
    currentY += 155;
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('💡 VÍ DỤ', centerX, currentY);

    currentY += 50;
    const examples = [
        'name Nhóm của chúng ta',
        'name Team Siêu Việt',
        'name Gia đình yêu thương'
    ];

    examples.forEach((example) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.roundRect(cardX, currentY, cardWidth, 58, 15);
        ctx.fill();
        ctx.stroke();

        ctx.font = '28px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(example, centerX, currentY + 35);
        currentY += 68;
    });

    // 6. Thẻ Thông tin - căn giữa
    currentY += 15;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 242, 254, 0.12)';
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
    ctx.lineWidth = 2;
    ctx.roundRect(cardX, currentY, cardWidth, 75, 20);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 27px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('ℹ️ Tên mới phải có ít nhất 2 ký tự', centerX, currentY + 43);
    ctx.restore();

    // 7. Footer - căn giữa
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText('💫 BONZ MÃI VIP 💫', centerX, 890);

    return canvas.toBuffer('image/png');
}


// --- HÀM RUN CHÍNH (ĐÃ SỬA LỖI FS) ---

module.exports.run = async ({ api, event, args }) => {
    const { threadId, type } = event;
    const newName = (args || []).join(" ").trim();

    // Check for help command
    if (!newName || newName.toLowerCase() === 'help' || newName.toLowerCase() === 'h') {
        try {
            const imageBuffer = await createNameHelpImage();
            const imageFileName = `name_help_premium_${Date.now()}.png`;
            await fs.writeFile(imageFileName, imageBuffer);
            
            await api.sendMessage({
                msg: "✨ Hướng dẫn sử dụng Name - Premium Edition",
                attachments: [imageFileName]
            }, threadId, type);
            
            setTimeout(async () => {
                try { await fs.unlink(imageFileName); } catch (_) {}
            }, 30000);
            return;
        } catch (error) {
            console.error('Lỗi khi tạo ảnh help:', error);
            return api.sendMessage(
                "⚠️ Vui lòng nhập tên mới.\nCú pháp: name <tên_mới>",
                threadId,
                type
            );
        }
    }

    if (newName.length < 2) {
        return api.sendMessage("⚠️ Tên mới quá ngắn (phải >= 2 ký tự)", threadId, type);
    }

    try {
        await api.changeGroupName(newName, String(threadId));
        
        // Lấy avatar người dùng
        let avatarUrl = null;
        try {
            const senderID = event?.data?.uidFrom || event.authorId;
            if (senderID) {
                const userInfo = await api.getUserInfo(senderID);
                avatarUrl = userInfo?.changed_profiles?.[senderID]?.avatar || userInfo?.avatar || null;
                console.log('Avatar URL:', avatarUrl); // Debug
            }
        } catch (e) {
            console.log('Không lấy được avatar:', e.message);
        }
        
        try {
            const imageBuffer = await createNameChangeImage(newName, avatarUrl);
            const imageFileName = `name_change_premium_${Date.now()}.png`;
            await fs.writeFile(imageFileName, imageBuffer);
            
            await api.sendMessage({
                msg: `✨ Đã đổi tên nhóm thành công!`,
                attachments: [imageFileName]
            }, threadId, type);
            
            setTimeout(async () => {
                try { await fs.unlink(imageFileName); } catch (_) {}
            }, 30000);
        } catch (imgError) {
            console.error('Lỗi khi tạo ảnh đổi tên:', imgError);
            return api.sendMessage(`✅ Đã đổi tên nhóm thành: ${newName}`, threadId, type);
        }
    } catch (err) {
        console.error("Lỗi khi đổi tên nhóm:", err);
        if (err.message && err.message.includes("You are not an administrator")) {
             return api.sendMessage(`❌ Bạn không phải là quản trị viên để đổi tên nhóm.`, threadId, type);
        } else if (err.message && err.message.includes("Cannot set name of group")) {
             return api.sendMessage(`❌ Bot không phải là quản trị viên hoặc thiếu quyền.`, threadId, type);
        }
        return api.sendMessage(`❌ Không thể đổi tên nhóm: ${err?.message || 'Lỗi không xác định'}`, threadId, type);
    }
};