const fs = require("fs").promises;
const path = require("path");
const { createCanvas, loadImage } = require('canvas');

const AUTO_DELETE_TTL_SECONDS = 30;
const AUTO_DELETE_TTL_MS = AUTO_DELETE_TTL_SECONDS * 1000;

const appendDeleteNotice = (message, ttlMs = AUTO_DELETE_TTL_MS) =>
    `${message}\n⏱️ Tin nhắn sẽ tự động xóa sau ${Math.floor(ttlMs / 1000)}s`;

function buildAutoDeletePayload(rawPayload = {}, ttlMs = AUTO_DELETE_TTL_MS) {
    if (typeof rawPayload === 'string') {
        return {
            ttl: ttlMs,
            msg: appendDeleteNotice(rawPayload, ttlMs)
        };
    }

    const { msg, message, body, attachments, mentions, ...rest } = rawPayload;
    const textContent = message || msg || body || '';

    const payload = {
        ttl: ttlMs,
        ...rest
    };

    if (textContent) {
        payload.msg = appendDeleteNotice(textContent, ttlMs);
    }

    if (attachments) {
        payload.attachments = attachments;
    }

    if (mentions) {
        payload.mentions = mentions;
    }

    return payload;
}

async function sendWithAutoDelete(api, threadId, type, payload, ttlMs = AUTO_DELETE_TTL_MS) {
    const finalPayload = buildAutoDeletePayload(payload, ttlMs);
    return api.sendMessage(finalPayload, threadId, type);
}

module.exports.config = {
    name: "bonzid2",
    version: "1.2.0",
    role: 0,
    author: "NLam182",
    description: "Lấy userId của người dùng, hoặc ID của nhóm chat.",
    category: "Tiện ích",
    usage: "bonzid2 | bonzid2 [số điện thoại] | bonzid2 box | bonzid2 @user (có thể tag nhiều)",
    cooldowns: 2,
    dependencies: {},
    aliases: ["id"]
};

const { ThreadType } = require("zca-js");

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
async function createUserIdImage(name, userId) {
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
    borderGradient.addColorStop(0, '#3b82f6');
    borderGradient.addColorStop(0.5, '#8b5cf6');
    borderGradient.addColorStop(1, '#ec4899');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.2)');
    headerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, 100, 20);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 100, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title
    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#3b82f6');
    titleGradient.addColorStop(0.5, '#8b5cf6');
    titleGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fillText('🆔 THÔNG TIN ID', width / 2, 95);
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
    
    ctx.fillStyle = '#3b82f6';
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
    footerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)');
    footerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#3b82f6');
    footerTextGradient.addColorStop(0.5, '#8b5cf6');
    footerTextGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('💎 BONZ VIP - MUA BOT LH 0785000270', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

// Tạo ảnh ID nhóm
async function createGroupIdImage(groupName, groupId) {
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
    borderGradient.addColorStop(0, '#10b981');
    borderGradient.addColorStop(0.5, '#059669');
    borderGradient.addColorStop(1, '#047857');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(5, 150, 105, 0.2)');
    headerGradient.addColorStop(1, 'rgba(4, 120, 87, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, 100, 20);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 100, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title
    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#10b981');
    titleGradient.addColorStop(0.5, '#059669');
    titleGradient.addColorStop(1, '#047857');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px Arial';
    ctx.shadowColor = 'rgba(16, 185, 129, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fillText('🧩 THÔNG TIN NHÓM', width / 2, 95);
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

    // Group name
    let infoY = cardY + 70;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('📝 Tên nhóm:', 100, infoY);
    
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 28px Arial';
    const displayName = groupName.length > 30 ? groupName.substring(0, 30) + '...' : groupName;
    ctx.fillText(displayName, 100, infoY + 40);

    // Group ID
    infoY += 120;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('🆔 ID Nhóm:', 100, infoY);
    
    const idGradient = ctx.createLinearGradient(0, infoY, width, infoY);
    idGradient.addColorStop(0, '#3b82f6');
    idGradient.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = idGradient;
    ctx.font = 'bold 32px Arial';
    ctx.fillText(groupId, 100, infoY + 40);

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(5, 150, 105, 0.15)');
    footerGradient.addColorStop(1, 'rgba(4, 120, 87, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#10b981');
    footerTextGradient.addColorStop(0.5, '#059669');
    footerTextGradient.addColorStop(1, '#047857');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Arial';
    ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('💎 BONZ VIP - MUA BOT LH 0785000270', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

// Tạo ảnh danh sách ID nhiều người
async function createMultipleIdImage(users) {
    const width = 1000;
    const baseHeight = 300;
    const userHeight = 100;
    const height = baseHeight + (users.length * userHeight);
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
    borderGradient.addColorStop(0.5, '#ef4444');
    borderGradient.addColorStop(1, '#ec4899');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(245, 158, 11, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.2)');
    headerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.2)');
    
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
    titleGradient.addColorStop(0.5, '#ef4444');
    titleGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px Arial';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fillText(`📌 DANH SÁCH ID (${users.length})`, width / 2, 95);
    ctx.shadowBlur = 0;

    // User list
    let currentY = 180;
    
    users.forEach((user, index) => {
        const cardGradient = ctx.createLinearGradient(60, currentY, width - 60, currentY);
        cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
        cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
        
        roundRect(ctx, 60, currentY, width - 120, 85, 15);
        ctx.fillStyle = cardGradient;
        ctx.fill();
        
        roundRect(ctx, 60, currentY, width - 120, 85, 15);
        ctx.strokeStyle = borderGradient;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Number badge
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`${index + 1}.`, 90, currentY + 35);

        // Name
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 22px Arial';
        const displayName = user.name.length > 28 ? user.name.substring(0, 28) + '...' : user.name;
        ctx.fillText(`👤 ${displayName}`, 140, currentY + 35);

        // ID
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`🆔 ${user.id}`, 140, currentY + 65);

        currentY += userHeight;
    });

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.15)');
    footerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#f59e0b');
    footerTextGradient.addColorStop(0.5, '#ef4444');
    footerTextGradient.addColorStop(1, '#ec4899');
    
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
    
    // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
    const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
    if (interactionMode === 'silent') {
        return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
    }

    try {
        await fs.mkdir(tempPath, { recursive: true });
    } catch (e) {
        console.error("Không thể tạo thư mục cache:", e);
    }

    try {
        if (args[0]?.toLowerCase() === "box") {
            if (type === ThreadType.Group) {
                try {
                    const groupInfo = await api.getGroupInfo(threadId);
                    const details = groupInfo.gridInfoMap?.[threadId];
                    const groupName = details?.name || "Không rõ tên nhóm";
                    
                    // Tạo ảnh
                    const imageBuffer = await createGroupIdImage(groupName, threadId);
                    const imagePath = path.join(tempPath, `group_id_${Date.now()}.png`);
                    await fs.writeFile(imagePath, imageBuffer);
                    
                    await sendWithAutoDelete(api, threadId, type, {
                        msg: `🧩 Tên nhóm: ${groupName}\n🆔 ID: ${threadId}\n\n📋 Copy ID để sử dụng`,
                        attachments: [imagePath]
                    });
                    
                    setTimeout(async () => {
                        try {
                            await fs.unlink(imagePath);
                        } catch (_) {}
                    }, 10000);
                } catch (err) {
                    console.error("Lỗi khi lấy thông tin nhóm:", err);
                    return sendWithAutoDelete(api, threadId, type, "❌ Không thể lấy thông tin nhóm hiện tại.");
                }
            } else {
                return sendWithAutoDelete(api, threadId, type, "❌ Lệnh này chỉ sử dụng trong nhóm.");
            }
            return;
        }

        const mentions = data.mentions;
        if (mentions && mentions.length > 0) {
            const users = await Promise.all(mentions.map(async m => {
                const uid = m.uid;
                try {
                    const info = await api.getUserInfo(uid);
                    const name = info?.changed_profiles?.[uid]?.displayName || "Không rõ tên";
                    return { name, id: uid };
                } catch {
                    return { name: "(Không lấy được tên)", id: uid };
                }
            }));
            
            // Tạo ảnh
            const imageBuffer = await createMultipleIdImage(users);
            const imagePath = path.join(tempPath, `multi_id_${Date.now()}.png`);
            await fs.writeFile(imagePath, imageBuffer);
            
            const idList = users.map((u, i) => `${i + 1}. ${u.name}: ${u.id}`).join('\n');
            await sendWithAutoDelete(api, threadId, type, {
                msg: `📌 Danh sách ID:\n${idList}\n\n📋 Copy ID để sử dụng`,
                attachments: [imagePath]
            });
            
            setTimeout(async () => {
                try {
                    await fs.unlink(imagePath);
                } catch (_) {}
            }, 10000);
            return;
        }

        if (args.length === 0) {
            try {
                const senderId = data.uidFrom;
                const info = await api.getUserInfo(senderId);
                const name = info?.changed_profiles?.[senderId]?.displayName || "Không rõ tên";
                
                // Tạo ảnh
                const imageBuffer = await createUserIdImage(name, senderId);
                const imagePath = path.join(tempPath, `user_id_${Date.now()}.png`);
                await fs.writeFile(imagePath, imageBuffer);
                
                await sendWithAutoDelete(api, threadId, type, {
                    msg: `🙋 Tên: ${name}\n🆔 ID: ${senderId}\n\n📋 Copy ID để sử dụng`,
                    attachments: [imagePath]
                });
                
                setTimeout(async () => {
                    try {
                        await fs.unlink(imagePath);
                    } catch (_) {}
                }, 10000);
            } catch (error) {
                console.error("Lỗi khi lấy ID người gửi:", error);
                return sendWithAutoDelete(api, threadId, type, "❌ Đã xảy ra lỗi khi lấy ID của bạn.");
            }
            return;
        }

        const phoneNumber = args[0];
        try {
            const userInfo = await api.findUser(phoneNumber);
            if (userInfo?.uid) {
                const targetId = userInfo.uid;
                const targetInfo = await api.getUserInfo(targetId);
                const targetName = targetInfo?.changed_profiles?.[targetId]?.displayName || "Không rõ tên";
                
                // Tạo ảnh
                const imageBuffer = await createUserIdImage(targetName, targetId);
                const imagePath = path.join(tempPath, `phone_id_${Date.now()}.png`);
                await fs.writeFile(imagePath, imageBuffer);
                
                await sendWithAutoDelete(api, threadId, type, {
                    msg: `📞 SĐT: ${phoneNumber}\n👤 Tên: ${targetName}\n🆔 ID: ${targetId}\n\n📋 Copy ID để sử dụng`,
                    attachments: [imagePath]
                });
                
                await api.sendCard({
                    userId: targetId,
                    phoneNumber
                }, threadId, type);
                
                setTimeout(async () => {
                    try {
                        await fs.unlink(imagePath);
                    } catch (_) {}
                }, 10000);
            } else {
                await sendWithAutoDelete(api, threadId, type, `❌ Không tìm thấy người dùng với số điện thoại "${phoneNumber}".`);
            }
        } catch (err) {
            console.error(`Lỗi khi tìm SĐT ${phoneNumber}:`, err);
            return sendWithAutoDelete(api, threadId, type, "❌ Có lỗi xảy ra khi tìm kiếm số điện thoại.");
        }
    } catch (error) {
        console.error("Lỗi khi xử lý lệnh bonzid2:", error);
        return sendWithAutoDelete(api, threadId, type, "❌ Đã xảy ra lỗi khi xử lý lệnh.");
    }
};
