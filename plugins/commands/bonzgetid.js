const fs = require("fs").promises;
const path = require("path");
const { createCanvas } = require('canvas');

module.exports.config = {
    name: "getid",
    version: "1.0.0",
    role: 0,
    author: "NLam182",
    description: "Lấy ID người dùng Zalo",
    category: "Tiện ích",
    usage: "bonz get id",
    cooldowns: 2,
    dependencies: {},
    aliases: []
};

// Helper: Rounded rectangle
function roundRect(ctx, x, y, w, h, r) {
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

// Tạo ảnh ID người dùng
async function createBonzGetIdImage(name, userId) {
    const width = 1000;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Pattern overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 60) {
        for (let j = 0; j < height; j += 60) {
            ctx.fillRect(i, j, 30, 30);
        }
    }

    const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
    borderGradient.addColorStop(0, '#f59e0b');
    borderGradient.addColorStop(0.5, '#f97316');
    borderGradient.addColorStop(1, '#ef4444');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(245, 158, 11, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(249, 115, 22, 0.2)');
    headerGradient.addColorStop(1, 'rgba(239, 68, 68, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, 100, 20);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 100, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title
    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#f59e0b');
    titleGradient.addColorStop(0.5, '#f97316');
    titleGradient.addColorStop(1, '#ef4444');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px Arial';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fillText('🆔 BONZ GET ID', width / 2, 95);
    ctx.shadowBlur = 0;

    // Info card
    const cardY = 180;
    const cardGradient = ctx.createLinearGradient(60, cardY, width - 60, cardY);
    cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
    cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
    
    roundRect(ctx, 60, cardY, width - 120, 250, 20);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 60, cardY, width - 120, 250, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Name
    let infoY = cardY + 70;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('👤 Tên:', 100, infoY);
    
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 28px Arial';
    const displayName = name.length > 35 ? name.substring(0, 35) + '...' : name;
    ctx.fillText(displayName, 100, infoY + 40);

    // ID
    infoY += 120;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('🆔 User ID:', 100, infoY);
    
    const idGradient = ctx.createLinearGradient(0, infoY, width, infoY);
    idGradient.addColorStop(0, '#10b981');
    idGradient.addColorStop(1, '#06b6d4');
    ctx.fillStyle = idGradient;
    ctx.font = 'bold 32px Arial';
    ctx.fillText(userId, 100, infoY + 40);

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(249, 115, 22, 0.15)');
    footerGradient.addColorStop(1, 'rgba(239, 68, 68, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#f59e0b');
    footerTextGradient.addColorStop(0.5, '#f97316');
    footerTextGradient.addColorStop(1, '#ef4444');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Arial';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('💎 BONZ VIP - MUA BOT LH 0785000270', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

module.exports.run = async ({ args, event, api }) => {
    const { threadId, type, data } = event;
    const tempPath = path.join(__dirname, '../../cache');
    
    // Kiểm tra chế độ silent mode
    const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
    if (interactionMode === 'silent') {
        return;
    }

    try {
        await fs.mkdir(tempPath, { recursive: true });
    } catch (e) {
        console.error("Không thể tạo thư mục cache:", e);
    }
    
    try {
        // Lấy UID từ data.uidFrom
        const senderId = data.uidFrom;
        
        // Lấy thông tin người dùng Zalo
        let userName = "Người dùng";
        try {
            const info = await api.getUserInfo(senderId);
            userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
        } catch (err) {
            console.log("Không thể lấy thông tin user:", err.message);
        }

        // Tạo ảnh
        const imageBuffer = await createBonzGetIdImage(userName, senderId);
        const imagePath = path.join(tempPath, `bonz_get_id_${Date.now()}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        
        await api.sendMessage({
            msg: `👤 Tên: ${userName}\n🆔 ID: ${senderId}\n\n📋 Copy ID để sử dụng`,
            attachments: [imagePath]
        }, threadId, type);
        
        setTimeout(async () => {
            try {
                await fs.unlink(imagePath);
            } catch (_) {}
        }, 10000);
        
    } catch (error) {
        console.error("Lỗi lấy UID:", error);
        return api.sendMessage(
            "❌ Có lỗi xảy ra khi lấy UID Zalo. Vui lòng thử lại sau.",
            threadId,
            type
        );
    }
};
