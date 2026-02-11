const { ThreadType } = require("zca-js");
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { createCanvas, loadImage } = require('canvas');

const AUTO_DELETE_TIME = 60000;

const appendDeleteNotice = (message, ttl = AUTO_DELETE_TIME) =>
    `${message}
⏱️ Tin nhắn sẽ tự động xóa sau ${Math.floor(ttl / 1000)}s`;

async function sendWithAutoDelete(api, threadId, type, { message, attachments, mentions }, ttl = AUTO_DELETE_TIME) {
    const payload = { ttl };

    if (message) {
        payload.msg = appendDeleteNotice(message, ttl);
    }

    if (attachments?.length) {
        payload.attachments = attachments;
    }

    if (mentions?.length) {
        payload.mentions = mentions;
    }

    return api.sendMessage(payload, threadId, type);
}

async function ensureFileReady(filePath, retries = 5, delay = 120) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const stats = await fs.stat(filePath);
            if (stats.isFile() && stats.size > 0) {
                return true;
            }
        } catch (_) {
            // ignore and retry
        }

        if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return false;
}

module.exports.config = {
    name: "infogroupall",
    version: "5.0.0",
    role: 0,
    author: "Bonz",
    description: "Hiển thị thông tin nhóm với phong cách hoàn toàn mới",
    category: "Tiện ích",
    usage: "<prefix>infogroupall",
    cooldowns: 3
};

module.exports.run = async function({ api, event }) {
    const { threadId, type } = event;

    if (type !== ThreadType.Group) {
        return sendWithAutoDelete(api, threadId, type, {
            message: "❌ Lệnh này chỉ dùng trong nhóm!"
        });
    }

    const tempPath = path.join(__dirname, '../../cache');
    try {
        await fs.mkdir(tempPath, { recursive: true });
    } catch (e) {
        console.error("Không thể tạo thư mục cache:", e);
    }

    // Helper: Wave path for decorative elements
    function drawWave(ctx, x, y, width, amplitude, frequency, reverse = false) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let i = 0; i <= width; i += 5) {
            const angle = (i / width) * Math.PI * frequency;
            const offsetY = Math.sin(angle) * amplitude * (reverse ? -1 : 1);
            ctx.lineTo(x + i, y + offsetY);
        }
        ctx.stroke();
    }

    // Helper: Hexagon avatar frame
    function drawHexagonAvatar(ctx, image, x, y, size) {
        const centerX = x + size / 2;
        const centerY = y + size / 2;
        const radius = size / 2 - 15;
        
        // Draw hexagon path
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const px = centerX + radius * Math.cos(angle);
            const py = centerY + radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.clip();
        
        if (image) {
            const imgSize = radius * 2;
            ctx.drawImage(image, centerX - radius, centerY - radius, imgSize, imgSize);
        } else {
            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            gradient.addColorStop(0, '#6366f1');
            gradient.addColorStop(1, '#8b5cf6');
            ctx.fillStyle = gradient;
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 80px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('👥', centerX, centerY);
        }
        ctx.restore();
        
        // Hexagon border with neon effect
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const px = centerX + (radius + 5) * Math.cos(angle);
            const py = centerY + (radius + 5) * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        
        // Multiple glow layers
        for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.3 - i * 0.08})`;
            ctx.lineWidth = 12 - i * 2;
            ctx.shadowColor = '#8b5cf6';
            ctx.shadowBlur = 25 + i * 10;
            ctx.stroke();
        }
        ctx.restore();
    }

    // Helper: Info card with side accent
    function drawInfoCard(ctx, x, y, w, h, accentColor = '#8b5cf6') {
        // Main card
        ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
        ctx.fillRect(x, y, w, h);
        
        // Left accent bar
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, accentColor);
        gradient.addColorStop(1, adjustColor(accentColor, 40));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, 10, h);
        
        // Top border glow
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 3;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Helper: Stat badge
    function drawStatBadge(ctx, x, y, icon, value, label, color) {
        const badgeW = 260;
        const badgeH = 140;
        
        // Badge background with gradient
        const bgGradient = ctx.createLinearGradient(x, y, x, y + badgeH);
        bgGradient.addColorStop(0, 'rgba(51, 65, 85, 0.9)');
        bgGradient.addColorStop(1, 'rgba(30, 41, 59, 0.9)');
        
        ctx.fillStyle = bgGradient;
        ctx.beginPath();
        ctx.roundRect(x, y, badgeW, badgeH, 20);
        ctx.fill();
        
        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Icon
        ctx.fillStyle = color;
        ctx.font = 'bold 50px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(icon, x + badgeW / 2, y + 60);
        
        // Value
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Arial';
        ctx.fillText(value, x + badgeW / 2, y + 98);
        
        // Label
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(label, x + badgeW / 2, y + 120);
    }

    // Helper: Permission row with icon
    function drawPermissionRow(ctx, x, y, icon, text, status, width) {
        // Icon circle
        ctx.fillStyle = 'rgba(139, 92, 246, 0.2)';
        ctx.beginPath();
        ctx.arc(x + 25, y, 22, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#8b5cf6';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(icon, x + 25, y + 8);
        
        // Text
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 26px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 65, y + 8);
        
        // Status badge
        const isAdmin = status === 'CHỈ QTV';
        const statusColor = isAdmin ? '#3b82f6' : '#10b981';
        
        ctx.fillStyle = `${statusColor}33`;
        ctx.fillRect(width - 160, y - 18, 130, 36);
        
        ctx.fillStyle = statusColor;
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(status, width - 95, y + 7);
    }

    // Helper: Toggle switch
    function drawToggle(ctx, x, y, isOn, label) {
        // Label
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 26px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(label, x, y);
        
        // Switch track
        const trackW = 85;
        const trackH = 42;
        const trackX = x + 520;
        const trackY = y - 24;
        
        ctx.fillStyle = isOn ? '#10b981' : '#64748b';
        ctx.beginPath();
        ctx.roundRect(trackX, trackY, trackW, trackH, 21);
        ctx.fill();
        
        // Switch knob
        const knobX = isOn ? trackX + trackW - 36 : trackX + 6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(knobX + 15, trackY + 21, 16, 0, Math.PI * 2);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Helper: Adjust color
    function adjustColor(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + amount));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }

    try {
        const groupInfo = await api.getGroupInfo(threadId);
        const details = groupInfo.gridInfoMap[threadId];

        if (!details) {
            return sendWithAutoDelete(api, threadId, type, {
                message: "❌ Không thể lấy thông tin nhóm!"
            });
        }

        // Debug log
        console.log("=== GROUP DETAILS ===");
        console.log("Settings:", details.setting);
        console.log("=====================");

        const creatorId = details.creatorId;
        const adminIds = details.adminIds || [];
        const deputyIds = adminIds.filter(id => id !== creatorId);

        let creatorName = "Không rõ";
        try {
            const creatorInfo = await api.getUserInfo(creatorId);
            creatorName = creatorInfo?.changed_profiles?.[creatorId]?.displayName || 
                         creatorInfo?.[creatorId]?.displayName ||
                         creatorInfo?.displayName ||
                         creatorInfo?.name ||
                         "Không rõ";
        } catch (e) {
            console.error("Lỗi lấy thông tin creator:", e);
        }

        let deputyNames = [];
        if (deputyIds.length > 0) {
            try {
                const deputyInfoPromises = deputyIds.map(id => api.getUserInfo(id));
                const deputyInfos = await Promise.all(deputyInfoPromises);
                deputyNames = deputyInfos.map((info, index) => {
                    const deputyId = deputyIds[index];
                    return info?.changed_profiles?.[deputyId]?.displayName || 
                           info?.[deputyId]?.displayName ||
                           info?.displayName ||
                           info?.name ||
                           `User ${deputyId}`;
                });
            } catch (e) {
                console.error("Lỗi lấy thông tin phó nhóm:", e);
            }
        }

        const width = 950;
        
        // Tính chiều cao động dựa trên số lượng phó nhóm
        const baseHeight = 1650;
        const deputyLineHeight = 45;
        const extraDeputyHeight = Math.max(0, (deputyNames.length - 2) * deputyLineHeight);
        const height = baseHeight + extraDeputyHeight + 200; // Thêm padding
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Dark gradient background
        const bgGradient = ctx.createLinearGradient(0, 0, width, height);
        bgGradient.addColorStop(0, '#0f172a');
        bgGradient.addColorStop(0.5, '#1e293b');
        bgGradient.addColorStop(1, '#0f172a');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, width, height);

        // Decorative circles
        ctx.fillStyle = 'rgba(139, 92, 246, 0.05)';
        ctx.beginPath();
        ctx.arc(120, 120, 180, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(236, 72, 153, 0.05)';
        ctx.beginPath();
        ctx.arc(width - 120, height - 120, 240, 0, Math.PI * 2);
        ctx.fill();

        // Grid pattern
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < width; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }
        for (let j = 0; j < height; j += 40) {
            ctx.beginPath();
            ctx.moveTo(0, j);
            ctx.lineTo(width, j);
            ctx.stroke();
        }

        let currentY = 80;

        // === HEADER WITH WAVE ===
        ctx.fillStyle = '#8b5cf6';
        ctx.font = 'bold 56px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#8b5cf6';
        ctx.shadowBlur = 35;
        ctx.fillText('GROUP INFORMATION', width / 2, currentY);
        ctx.shadowBlur = 0;
        
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
        ctx.lineWidth = 4;
        drawWave(ctx, 200, currentY + 25, 550, 10, 2);
        
        currentY += 110;

        // === AVATAR SECTION ===
        let avatarImage = null;
        const possibleAvatarFields = [
            details.fullAvt, details.avatar, details.avt, 
            details.groupAvatar, details.avatarUrl, details.thumb
        ];
        
        let avtUrl = null;
        for (const field of possibleAvatarFields) {
            if (field && typeof field === 'string' && field.startsWith('http')) {
                avtUrl = field;
                break;
            }
        }

        if (avtUrl) {
            try {
                const response = await axios.get(avtUrl, { 
                    responseType: 'arraybuffer', 
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                avatarImage = await loadImage(Buffer.from(response.data));
            } catch (e) {
                console.error("Không thể tải avatar:", e);
            }
        }

        const avatarSize = 220;
        const avatarX = (width - avatarSize) / 2;
        drawHexagonAvatar(ctx, avatarImage, avatarX, currentY, avatarSize);
        
        currentY += avatarSize + 60;

        // Group name with glow
        const groupName = details.name || 'Không rõ';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#8b5cf6';
        ctx.shadowBlur = 25;
        
        // Wrap text if too long
        const maxNameWidth = width - 100;
        const nameMetrics = ctx.measureText(groupName);
        if (nameMetrics.width > maxNameWidth) {
            let truncated = groupName;
            while (ctx.measureText(truncated + '...').width > maxNameWidth && truncated.length > 5) {
                truncated = truncated.slice(0, -1);
            }
            ctx.fillText(truncated + '...', width / 2, currentY);
        } else {
            ctx.fillText(groupName, width / 2, currentY);
        }
        ctx.shadowBlur = 0;
        
        currentY += 75;

        // === STAT BADGES ===
        const badgeY = currentY;
        const badgeSpacing = (width - 810) / 2;
        
        drawStatBadge(ctx, badgeSpacing, badgeY, '👥', `${details.totalMember}`, 'Thành viên', '#3b82f6');
        drawStatBadge(ctx, badgeSpacing + 285, badgeY, '👑', `${1 + deputyNames.length}`, 'Quản trị', '#8b5cf6');
        drawStatBadge(ctx, badgeSpacing + 570, badgeY, '💬', 'ON', 'Hoạt động', '#10b981');
        
        currentY += 175;

        // === ADMIN INFO CARD ===
        const adminHeight = 160 + (deputyNames.length * deputyLineHeight);
        drawInfoCard(ctx, 60, currentY, width - 120, adminHeight, '#ec4899');
        
        ctx.fillStyle = '#ec4899';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('👑 QUẢN TRỊ VIÊN', 85, currentY + 52);
        
        let adminY = currentY + 110;
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 30px Arial';
        ctx.fillText('Trưởng nhóm:', 85, adminY);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        
        // Wrap creator name if needed
        const maxCreatorWidth = width - 350;
        const creatorMetrics = ctx.measureText(creatorName);
        if (creatorMetrics.width > maxCreatorWidth) {
            let truncated = creatorName;
            while (ctx.measureText(truncated + '...').width > maxCreatorWidth && truncated.length > 3) {
                truncated = truncated.slice(0, -1);
            }
            ctx.fillText(truncated + '...', 290, adminY);
        } else {
            ctx.fillText(creatorName, 290, adminY);
        }
        
        if (deputyNames.length > 0) {
            adminY += 58;
            ctx.fillStyle = '#a78bfa';
            ctx.font = 'bold 30px Arial';
            ctx.fillText('Phó nhóm:', 85, adminY);
            
            deputyNames.forEach(name => {
                adminY += deputyLineHeight;
                ctx.fillStyle = '#10b981';
                ctx.font = 'bold 27px Arial';
                
                const maxDeputyWidth = width - 250;
                const deputyText = `• ${name}`;
                const deputyMetrics = ctx.measureText(deputyText);
                
                if (deputyMetrics.width > maxDeputyWidth) {
                    let truncated = deputyText;
                    while (ctx.measureText(truncated + '...').width > maxDeputyWidth && truncated.length > 5) {
                        truncated = truncated.slice(0, -1);
                    }
                    ctx.fillText(truncated + '...', 125, adminY);
                } else {
                    ctx.fillText(deputyText, 125, adminY);
                }
            });
        }
        
        currentY += adminHeight + 40;

        // === GROUP SETTINGS ===
        const settings = details.setting || {};
        const signAdminMsg = settings.signAdminMsg === 1;
        const enableMsgHistory = settings.enableMsgHistory === 1;
        const joinAppr = settings.joinAppr === 1;
        
        drawInfoCard(ctx, 60, currentY, width - 120, 230, '#8b5cf6');
        
        ctx.fillStyle = '#8b5cf6';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('⚙️ CÀI ĐẶT NHÓM', 85, currentY + 52);
        
        let settingY = currentY + 115;
        drawToggle(ctx, 85, settingY, signAdminMsg, '👁️ Làm nổi tin nhắn QTV');
        settingY += 58;
        drawToggle(ctx, 85, settingY, enableMsgHistory, '👀 TV mới xem tin cũ');
        settingY += 58;
        drawToggle(ctx, 85, settingY, joinAppr, '✉️ Duyệt thành viên mới');
        
        currentY += 265;

        // === PERMISSIONS ===
        drawInfoCard(ctx, 60, currentY, width - 120, 360, '#10b981');
        
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('🔐 QUYỀN HẠN THÀNH VIÊN', 85, currentY + 52);
        
        const permissions = [
            { 
                icon: '📋', 
                text: 'Xem danh sách TV', 
                status: settings.lockViewMember === 1 ? 'CHỈ QTV' : 'Tất cả'
            },
            { 
                icon: '✏️', 
                text: 'Sửa thông tin nhóm', 
                status: settings.setTopicOnly === 1 ? 'CHỈ QTV' : 'Tất cả'
            },
            { 
                icon: '📝', 
                text: 'Tạo ghi chú & nhắc hẹn', 
                status: settings.lockCreatePost === 1 ? 'CHỈ QTV' : 'Tất cả'
            },
            { 
                icon: '📊', 
                text: 'Tạo bình chọn', 
                status: settings.lockCreatePoll === 1 ? 'CHỈ QTV' : 'Tất cả'
            },
            { 
                icon: '➕', 
                text: 'Thêm thành viên', 
                status: settings.addMemberOnly === 1 ? 'CHỈ QTV' : 'Tất cả'
            },
            { 
                icon: '💬', 
                text: 'Gửi tin nhắn', 
                status: settings.lockSendMsg === 1 ? 'CHỈ QTV' : 'Tất cả'
            }
        ];
        
        let permY = currentY + 115;
        permissions.forEach(perm => {
            drawPermissionRow(ctx, 85, permY, perm.icon, perm.text, perm.status, width - 60);
            permY += 48;
        });
        
        currentY += 395;

        // === FOOTER ===
        const footerGradient = ctx.createLinearGradient(0, currentY, width, currentY);
        footerGradient.addColorStop(0, '#8b5cf6');
        footerGradient.addColorStop(0.5, '#ec4899');
        footerGradient.addColorStop(1, '#f59e0b');
        
        ctx.fillStyle = footerGradient;
        ctx.font = 'bold 34px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ec4899';
        ctx.shadowBlur = 30;
        ctx.fillText('BONZ MÃI ĐẸP TRAI', width / 2, currentY + 10);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 26px Arial';
        ctx.fillText('📞 0785000270', width / 2, currentY + 55);

        // Save and send
        const imagePath = path.join(tempPath, `infogroupall_${Date.now()}.png`);
        const buffer = canvas.toBuffer('image/png');
        await fs.writeFile(imagePath, buffer);

        if (await ensureFileReady(imagePath)) {
            await sendWithAutoDelete(
                api,
                threadId,
                type,
                {
                    message:
                        `🎯 𝗚𝗥𝗢𝗨𝗣 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡\n\n📝 ${details.name}\n👑 ${creatorName}\n👥 ${details.totalMember} thành viên\n💎 ${deputyNames.length} phó nhóm\n\n⚙️ Cài đặt:\n${signAdminMsg ? '✅' : '❌'} Làm nổi tin QTV\n${enableMsgHistory ? '✅' : '❌'} Xem tin cũ\n${joinAppr ? '✅' : '❌'} Duyệt TV mới`,
                    attachments: [imagePath]
                }
            );

            setTimeout(async () => {
                try {
                    await fs.unlink(imagePath);
                } catch (_) {}
            }, AUTO_DELETE_TIME);
        } else {
            await sendWithAutoDelete(api, threadId, type, {
                message:
                    `🎯 𝗚𝗥𝗢𝗨𝗣 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡\n\n📝 ${details.name}\n👑 ${creatorName}\n👥 ${details.totalMember} thành viên\n💎 ${deputyNames.length} phó nhóm\n\n⚙️ Cài đặt:\n${signAdminMsg ? '✅' : '❌'} Làm nổi tin QTV\n${enableMsgHistory ? '✅' : '❌'} Xem tin cũ\n${joinAppr ? '✅' : '❌'} Duyệt TV mới\n⚠️ Không gửi được ảnh, hiển thị dạng văn bản.`
            });
        }

    } catch (error) {
        console.error("Lỗi khi lấy thông tin nhóm:", error);
        await sendWithAutoDelete(api, threadId, type, {
            message: "❌ Đã xảy ra lỗi khi lấy thông tin nhóm!"
        });
    }
};