const { ThreadType } = require("zca-js");
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { createCanvas, loadImage } = require('canvas');

module.exports.config = {
    name: "boxinfo",
    version: "2.1.0",
    role: 0,
    author: "NLam182 & Bonz",
    description: "Hiển thị thông tin chi tiết của nhóm chat với Canvas - Auto delete",
    category: "Tiện ích",
    usage: "<prefix>boxinfo",
    cooldowns: 2
};

// Thời gian tự động xóa (milliseconds)
const AUTO_DELETE_TIME = 60000; // 60 giây

module.exports.run = async function({ api, event }) {
    const { threadId, type } = event;

    if (type !== ThreadType.Group) {
        return api.sendMessage("Lệnh này chỉ có thể được sử dụng trong nhóm chat.", threadId, type);
    }

    const tempPath = path.join(__dirname, '../../cache');
    try {
        await fs.mkdir(tempPath, { recursive: true });
    } catch (e) {
        console.error("Không thể tạo thư mục cache:", e);
    }

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

    // Helper: Draw circular image
    function drawCircularImage(ctx, image, x, y, radius) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(image, x, y, radius * 2, radius * 2);
        ctx.restore();
        
        // Border gradient
        const borderGradient = ctx.createLinearGradient(x, y, x + radius * 2, y + radius * 2);
        borderGradient.addColorStop(0, '#8b5cf6');
        borderGradient.addColorStop(0.5, '#ec4899');
        borderGradient.addColorStop(1, '#facc15');
        
        ctx.strokeStyle = borderGradient;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    try {
        const groupInfo = await api.getGroupInfo(threadId);
        const details = groupInfo.gridInfoMap[threadId];

        if (!details) {
            return api.sendMessage("Không thể lấy được thông tin của nhóm này.", threadId, type);
        }

        // Debug: Log để xem structure của details
        console.log("Group details keys:", Object.keys(details));
        console.log("Avatar fields:", {
            fullAvt: details.fullAvt,
            avatar: details.avatar,
            avt: details.avt,
            groupAvatar: details.groupAvatar,
            avatarUrl: details.avatarUrl
        });

        const creatorId = details.creatorId;
        const deputyIds = (details.adminIds || []).filter(id => id !== creatorId);

        const creatorInfo = await api.getUserInfo(creatorId);
        const creatorName = creatorInfo.changed_profiles[creatorId]?.displayName || "Không rõ";

        let deputyNames = "Không có";
        if (deputyIds.length > 0) {
            const deputyInfoPromises = deputyIds.map(id => api.getUserInfo(id));
            const deputyInfos = await Promise.all(deputyInfoPromises);
            deputyNames = deputyInfos.map((info, index) => {
                const profile = info.changed_profiles[deputyIds[index]];
                return profile?.displayName || "Không rõ";
            }).join(", ");
        }

        // Create canvas
        const width = 1200;
        const baseHeight = 800;
        const deputyLineHeight = 35;
        const deputyLines = Math.ceil(deputyNames.length / 40);
        const height = baseHeight + (deputyLines > 1 ? (deputyLines - 1) * deputyLineHeight : 0);
        
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

        // Header
        const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
        headerGradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
        headerGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.2)');
        headerGradient.addColorStop(1, 'rgba(250, 204, 21, 0.2)');
        
        roundRect(ctx, 40, 30, width - 80, 140, 25);
        ctx.fillStyle = headerGradient;
        ctx.fill();
        
        const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
        borderGradient.addColorStop(0, '#8b5cf6');
        borderGradient.addColorStop(0.5, '#ec4899');
        borderGradient.addColorStop(1, '#facc15');
        
        roundRect(ctx, 40, 30, width - 80, 140, 25);
        ctx.strokeStyle = borderGradient;
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
        ctx.shadowBlur = 30;
        roundRect(ctx, 40, 30, width - 80, 140, 25);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Title
        const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
        titleGradient.addColorStop(0, '#8b5cf6');
        titleGradient.addColorStop(0.5, '#ec4899');
        titleGradient.addColorStop(1, '#facc15');
        
        ctx.fillStyle = titleGradient;
        ctx.textAlign = 'center';
        ctx.font = 'bold 60px Arial';
        ctx.shadowColor = 'rgba(139, 92, 246, 0.8)';
        ctx.shadowBlur = 25;
        ctx.fillText('📊 THÔNG TIN NHÓM', width / 2, 110);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 26px Arial';
        ctx.fillText(`${details.totalMember} thành viên`, width / 2, 150);

        // Avatar section - Try multiple possible fields
        let avatarImage = null;
        const possibleAvatarFields = [
            details.fullAvt,
            details.avatar,
            details.avt,
            details.groupAvatar,
            details.avatarUrl,
            details.thumb,
            details.thumbSrc
        ];
        
        let avtUrl = null;
        for (const field of possibleAvatarFields) {
            if (field && typeof field === 'string' && field.startsWith('http')) {
                avtUrl = field;
                console.log("Found avatar URL:", avtUrl);
                break;
            }
        }

        if (avtUrl) {
            try {
                console.log("Attempting to load avatar from:", avtUrl);
                const response = await axios.get(avtUrl, { 
                    responseType: 'arraybuffer', 
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                avatarImage = await loadImage(Buffer.from(response.data));
                console.log("Avatar loaded successfully");
            } catch (e) {
                console.error("Không thể tải avatar:", e.message);
                console.error("URL tried:", avtUrl);
            }
        } else {
            console.log("No valid avatar URL found in details");
        }

        const avatarY = 220;
        const avatarSize = 200;
        const avatarX = (width - avatarSize) / 2;

        if (avatarImage) {
            drawCircularImage(ctx, avatarImage, avatarX, avatarY, avatarSize / 2);
        } else {
            // Default gradient circle
            const defaultGradient = ctx.createRadialGradient(
                avatarX + avatarSize / 2, avatarY + avatarSize / 2, 0,
                avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2
            );
            defaultGradient.addColorStop(0, '#8b5cf6');
            defaultGradient.addColorStop(1, '#ec4899');
            
            ctx.fillStyle = defaultGradient;
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Border
            ctx.strokeStyle = borderGradient;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.stroke();
            
            // Icon
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 80px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👥', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 25);
        }

        // Info card
        const cardY = avatarY + avatarSize + 40;
        const cardHeight = 320;
        
        const cardGradient = ctx.createLinearGradient(60, cardY, width - 60, cardY);
        cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
        cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
        
        roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
        ctx.fillStyle = cardGradient;
        ctx.fill();
        
        roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
        ctx.strokeStyle = borderGradient;
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.shadowColor = '#8b5cf6';
        ctx.shadowBlur = 20;
        roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Info items
        let infoY = cardY + 50;
        const leftX = 100;
        const valueX = 320;

        // Helper: Draw info row
        function drawInfoRow(label, value, y, icon) {
            // Icon
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(icon, leftX, y);
            
            // Label
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(label, leftX + 50, y);
            
            // Value
            const valueGradient = ctx.createLinearGradient(0, 0, width, 0);
            valueGradient.addColorStop(0, '#10b981');
            valueGradient.addColorStop(1, '#059669');
            
            ctx.fillStyle = valueGradient;
            ctx.font = 'bold 28px Arial';
            
            // Wrap text if too long
            const maxWidth = width - valueX - 100;
            const words = value.split(' ');
            let line = '';
            let lineY = y;
            
            for (let word of words) {
                const testLine = line + word + ' ';
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > maxWidth && line !== '') {
                    ctx.fillText(line.trim(), valueX, lineY);
                    line = word + ' ';
                    lineY += 35;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line.trim(), valueX, lineY);
            
            return lineY - y + 35;
        }

        // Group name
        const nameHeight = drawInfoRow('Tên nhóm:', details.name, infoY, '📝');
        infoY += nameHeight + 20;

        // Group ID
        drawInfoRow('ID Nhóm:', details.groupId, infoY, '🆔');
        infoY += 60;

        // Creator
        drawInfoRow('Trưởng nhóm:', creatorName, infoY, '👑');
        infoY += 60;

        // Deputies
        const deputyHeight = drawInfoRow('Phó nhóm:', deputyNames, infoY, '💎');

        // Footer
        const footerY = height - 80;
        const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
        footerGradient.addColorStop(0, 'rgba(139, 92, 246, 0.15)');
        footerGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.15)');
        footerGradient.addColorStop(1, 'rgba(250, 204, 21, 0.15)');
        
        roundRect(ctx, 40, footerY, width - 80, 60, 20);
        ctx.fillStyle = footerGradient;
        ctx.fill();
        
        roundRect(ctx, 40, footerY, width - 80, 60, 20);
        ctx.strokeStyle = borderGradient;
        ctx.lineWidth = 3;
        ctx.stroke();
        
        const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
        footerTextGradient.addColorStop(0, '#8b5cf6');
        footerTextGradient.addColorStop(0.5, '#ec4899');
        footerTextGradient.addColorStop(1, '#facc15');
        
        ctx.fillStyle = footerTextGradient;
        ctx.textAlign = 'center';
        ctx.font = 'bold 28px Arial';
        ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
        ctx.shadowBlur = 15;
        ctx.fillText('💎 BONZ MÃI ĐẸP TRAI - 0785000270', width / 2, footerY + 40);
        ctx.shadowBlur = 0;

        // Save and send with TTL (auto delete message)
        const imagePath = path.join(tempPath, `boxinfo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`);
        const buffer = canvas.toBuffer('image/png');
        await fs.writeFile(imagePath, buffer);

        console.log(`[BOXINFO] 💾 Đã tạo file: ${path.basename(imagePath)}`);

        // Gửi tin nhắn với TTL để tự động xóa
        await api.sendMessage({ 
            msg: `📊 Thông tin nhóm: ${details.name}\n⏱️ Tin nhắn sẽ tự động xóa sau ${AUTO_DELETE_TIME/1000}s`, 
            attachments: [imagePath],
            ttl: AUTO_DELETE_TIME // Tự động xóa tin nhắn
        }, threadId, type);

        console.log(`[BOXINFO] 📤 Đã gửi ảnh với TTL ${AUTO_DELETE_TIME/1000}s`);

        // Cleanup file sau khi gửi
        setTimeout(async () => {
            try {
                await fs.unlink(imagePath);
                console.log(`[BOXINFO] ✅ Đã xóa file: ${path.basename(imagePath)}`);
            } catch (e) {
                console.error(`[BOXINFO] ❌ Lỗi xóa file:`, e.message);
            }
        }, AUTO_DELETE_TIME);

    } catch (error) {
        console.error("Lỗi khi lấy thông tin nhóm:", error);
        await api.sendMessage("Đã xảy ra lỗi khi cố gắng lấy thông tin nhóm.", threadId, type);
    }
};