const { ThreadType } = require("zca-js");
const axios = require("axios");

// ===== CẤU HÌNH BOT ID =====
const BOT_ID = "712905978506993838";

const des = {
    'version': "3.0.0",
    'credits': "Cascade AI - Canva Premium Edition",
    'description': "Quản lý nhóm thông minh với giao diện Canva chuyên nghiệp",
    'power': "Quản trị viên Bot"
};

module.exports.config = {
    name: "bonzout",
    aliases: ["bout", "bonz-out"],
    version: "3.0.0",
    role: 2,
    author: "Cascade AI",
    description: "Quản lý và thoát khỏi các nhóm với giao diện Canva cao cấp",
    category: "Admin",
    usage: "bonzout [scan|admin|list|gr|help]",
    cooldowns: 10
};

// ===== EMOJI & THEME =====
const EMOJI = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
    search: "🔍",
    stats: "📊",
    lock: "🔒",
    unlock: "🔓",
    group: "👥",
    admin: "🛡️",
    crown: "👑",
    fire: "🔥",
    rocket: "🚀",
    chart: "📈",
    list: "📋",
    time: "⏰",
    globe: "🌐",
    shield: "🛡️",
    sparkles: "✨",
    target: "🎯",
    brain: "🧠",
    diamond: "💎",
    star: "⭐",
    bolt: "⚡",
    party: "🎉",
    wave: "👋",
    robot: "🤖",
    heart: "❤️"
};

// ===== CANVA PREMIUM IMAGES =====
const IMAGES = {
    scan: "https://i.imgur.com/canva-scan-dashboard.png",
    admin: "https://i.imgur.com/canva-admin-shield.png",
    leave: "https://i.imgur.com/canva-leave-wave.png",
    success: "https://i.imgur.com/canva-success-trophy.png",
    error: "https://i.imgur.com/canva-error-screen.png",
    list: "https://i.imgur.com/canva-list-cards.png",
    help: "https://i.imgur.com/canva-help-guide.png",
    stats: "https://i.imgur.com/canva-stats-analytics.png"
};

// Safe message sending
async function safeSendMessage(api, message, threadId, type, imageUrl = null) {
    try {
        if (imageUrl) {
            try {
                const response = await axios.get(imageUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                const buffer = Buffer.from(response.data, 'binary');
                
                return await api.sendMessage({
                    body: message,
                    attachment: buffer
                }, threadId, type);
            } catch (imgError) {
                console.error('[BONZOUT] Image fetch error:', imgError.message);
                return await api.sendMessage(message, threadId, type);
            }
        }
        
        return await api.sendMessage(message, threadId, type);
    } catch (error) {
        console.error('[BONZOUT] Error sending message:', error);
        try {
            return await api.sendMessage(
                `${EMOJI.error} Lỗi gửi tin nhắn: ${error.message}`, 
                threadId, 
                type
            );
        } catch (fallbackError) {
            console.error('[BONZOUT] Fallback message also failed:', fallbackError);
        }
    }
}

// Create progress bar
function createProgressBar(current, total, length = 20) {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * length);
    const empty = length - filled;
    
    const bar = "█".repeat(filled) + "░".repeat(empty);
    return `[${bar}] ${percentage}%`;
}

// Get bot ID
async function getBotId(api) {
    try {
        if (BOT_ID && BOT_ID.trim()) return String(BOT_ID.trim());
        const configBotId = global?.config?.bot_id;
        if (configBotId) return String(configBotId);
        if (typeof api?.getCurrentUserId === 'function') {
            try { 
                const id = await api.getCurrentUserId(); 
                if (id) return String(id); 
            } catch {}
        }
        return null;
    } catch {
        return null;
    }
}

// Get protected admin IDs
function getProtectedAdminIds() {
    try {
        const config = global?.config || {};
        const admins = Array.isArray(config.admin_bot) ? config.admin_bot.map(String) : [];
        const owners = Array.isArray(config.owner_bot) ? config.owner_bot.map(String) : [];
        const whitelist = Array.isArray(config.protected_admins) ? config.protected_admins.map(String) : [];
        return Array.from(new Set([...admins, ...owners, ...whitelist]));
    } catch {
        return [];
    }
}

// Check if user is admin
function isUserAdmin(userId) {
    try {
        const config = global?.config || {};
        const admins = Array.isArray(config.admin_bot) ? config.admin_bot.map(String) : [];
        const owners = Array.isArray(config.owner_bot) ? config.owner_bot.map(String) : [];
        return admins.includes(String(userId)) || owners.includes(String(userId));
    } catch (error) {
        console.error('[BONZOUT] Error checking admin status:', error);
        return false;
    }
}

// Get all groups
async function getAllBotGroups(api) {
    try {
        const allGroups = await api.getAllGroups();
        const groupIds = Object.keys(allGroups.gridVerMap || {});
        
        const groups = [];
        for (const groupId of groupIds) {
            try {
                const groupInfo = await api.getGroupInfo(groupId);
                const details = groupInfo?.gridInfoMap?.[groupId];
                
                if (details) {
                    groups.push({
                        id: groupId,
                        name: details.name || 'Không có tên',
                        totalMembers: details.totalMember || 0,
                        creatorId: details.creatorId,
                        adminIds: details.adminIds || [],
                        details: details
                    });
                }
            } catch (error) {
                console.error(`[BONZOUT] Error getting info for group ${groupId}:`, error);
                groups.push({
                    id: groupId,
                    name: 'Không thể lấy tên',
                    totalMembers: 0,
                    creatorId: null,
                    adminIds: [],
                    details: null,
                    error: error.message
                });
            }
        }
        
        return groups;
    } catch (error) {
        console.error('[BONZOUT] Error getting all groups:', error);
        throw new Error(`Không thể lấy danh sách nhóm: ${error.message}`);
    }
}

// Check if group is locked
async function isGroupChatLocked(api, groupId) {
    try {
        const groupInfo = await api.getGroupInfo(groupId);
        const details = groupInfo?.gridInfoMap?.[groupId];
        
        if (!details) {
            console.log(`[BONZOUT] Cannot get group info for ${groupId}`);
            return false;
        }
        
        if (details.isLocked || details.chatLocked || details.disabled) {
            return true;
        }
        
        if (details.canSendMessage === false || details.sendMessagePermission === false) {
            return true;
        }
        
        if (details.status === 'locked' || details.state === 'disabled') {
            return true;
        }
        
        return false;
    } catch (error) {
        const errorMsg = error.message?.toLowerCase() || '';
        if (errorMsg.includes('permission denied') || 
            errorMsg.includes('access denied') || 
            errorMsg.includes('forbidden')) {
            return true;
        }
        return false;
    }
}

// Leave group
async function leaveGroup(api, groupId, groupName) {
    const methods = [
        async () => { 
            if (typeof api.leaveGroup === 'function') 
                return await api.leaveGroup(groupId); 
        },
        async () => { 
            if (typeof api.leaveConversation === 'function') 
                return await api.leaveConversation(groupId); 
        }
    ];

    try {
        const goodbyeMsg = `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n` +
                          `${EMOJI.wave} Tạm biệt mọi người!\n\n` +
                          `${EMOJI.robot} Bot đang rời nhóm theo\n` +
                          `lệnh từ quản trị viên.\n\n` +
                          `${EMOJI.heart} Cảm ơn đã sử dụng!\n\n` +
                          `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}`;
        
        await api.sendMessage(goodbyeMsg, groupId, ThreadType.Group);
        await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
        console.log(`[BONZOUT] Could not send goodbye message to ${groupName}`);
    }

    for (const method of methods) {
        try {
            await method();
            return { success: true };
        } catch (error) {
            console.log(`[BONZOUT] Leave method failed for ${groupName}`);
        }
    }

    return { success: false, error: 'Tất cả phương thức rời nhóm đều thất bại' };
}

// Scan all groups
async function scanAllGroups(api) {
    try {
        const allGroups = await getAllBotGroups(api);
        const lockedGroups = [];
        const normalGroups = [];
        const errorGroups = [];

        for (const group of allGroups) {
            if (group.error) {
                errorGroups.push(group);
                continue;
            }

            try {
                const isLocked = await isGroupChatLocked(api, group.id);
                if (isLocked) {
                    lockedGroups.push(group);
                } else {
                    normalGroups.push(group);
                }
            } catch (error) {
                errorGroups.push({ ...group, error: error.message });
            }

            await new Promise(resolve => setTimeout(resolve, 200));
        }

        return {
            total: allGroups.length,
            locked: lockedGroups,
            normal: normalGroups,
            error: errorGroups
        };
    } catch (error) {
        throw new Error(`Lỗi quét nhóm: ${error.message}`);
    }
}

// Main command handler
module.exports.run = async ({ api, event, args }) => {
    const { threadId, type } = event;
    const senderId = String(event?.data?.uidFrom || event?.authorId || event?.senderID || '');
    
    if (!isUserAdmin(senderId)) {
        const errorMsg = `${EMOJI.shield} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `${EMOJI.error} QUYỀN TRUY CẬP BỊ TỪ CHỐI!\n\n` +
                        `${EMOJI.lock} Chỉ admin/owner bot mới có\n` +
                        `thể sử dụng lệnh này.\n\n` +
                        `${EMOJI.info} Liên hệ admin để được hỗ trợ.\n\n` +
                        `${EMOJI.shield} ━━━━━━━━━━━━━━━━━━━━━━`;
        return await safeSendMessage(api, errorMsg, threadId, type, IMAGES.error);
    }

    const command = args[0]?.toLowerCase();
    const subCommand = args[1]?.toLowerCase();

    try {
        switch (command) {
            case 'scan':
                await handleScanCommand(api, threadId, type);
                break;
            case 'admin':
                if (subCommand === 'page') {
                    const pageNum = parseInt(args[2]) || 1;
                    await handleAdminPageCommand(api, threadId, type, pageNum);
                } else {
                    await handleScanAdminCommand(api, threadId, type);
                }
                break;
            case 'list':
                await handleListCommand(api, threadId, type);
                break;
            case 'gr':
                if (subCommand === 'all') {
                    if (args[2]?.toLowerCase() === 'nonadmin') {
                        await handleLeaveAllGroupsNonAdmin(api, threadId, type);
                    } else {
                        await handleLeaveAllGroups(api, threadId, type);
                    }
                } else if (subCommand === 'nonadmin') {
                    await handleLeaveLockedGroupsNonAdmin(api, threadId, type);
                } else {
                    await handleLeaveLockedGroups(api, threadId, type);
                }
                break;
            default:
                await showHelp(api, threadId, type);
                break;
        }
    } catch (error) {
        console.error('[BONZOUT] Command error:', error);
        const errorMsg = `${EMOJI.error} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `${EMOJI.warning} LỖI THỰC HIỆN LỆNH!\n\n` +
                        `${EMOJI.info} Chi tiết:\n${error.message}\n\n` +
                        `${EMOJI.time} ${new Date().toLocaleString('vi-VN')}\n\n` +
                        `${EMOJI.error} ━━━━━━━━━━━━━━━━━━━━━━`;
        await safeSendMessage(api, errorMsg, threadId, type, IMAGES.error);
    }
};

// Handle scan command
async function handleScanCommand(api, threadId, type) {
    const loadingMsg = `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                       `${EMOJI.search} ĐANG QUÉT HỆ THỐNG...\n\n` +
                       `${EMOJI.brain} Phân tích dữ liệu nhóm\n` +
                       `${EMOJI.chart} Đánh giá trạng thái\n` +
                       `${EMOJI.target} Phân loại thông minh\n\n` +
                       `${EMOJI.time} Vui lòng chờ...\n\n` +
                       `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━`;
    
    await safeSendMessage(api, loadingMsg, threadId, type);

    const scanResult = await scanAllGroups(api);
    
    let message = `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    message += `${EMOJI.chart} DASHBOARD - KẾT QUẢ QUÉT NHÓM\n\n`;
    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    
    message += `${EMOJI.stats} THỐNG KÊ TỔNG QUAN:\n\n`;
    message += `${EMOJI.globe} Tổng số nhóm: ${scanResult.total}\n`;
    message += `${createProgressBar(scanResult.total, scanResult.total)}\n\n`;
    
    message += `${EMOJI.lock} Nhóm bị khóa: ${scanResult.locked.length}\n`;
    message += `${createProgressBar(scanResult.locked.length, scanResult.total)}\n\n`;
    
    message += `${EMOJI.unlock} Nhóm hoạt động: ${scanResult.normal.length}\n`;
    message += `${createProgressBar(scanResult.normal.length, scanResult.total)}\n\n`;
    
    if (scanResult.error.length > 0) {
        message += `${EMOJI.warning} Nhóm lỗi: ${scanResult.error.length}\n`;
        message += `${createProgressBar(scanResult.error.length, scanResult.total)}\n\n`;
    }
    
    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;

    if (scanResult.locked.length > 0) {
        message += `${EMOJI.fire} TOP NHÓM BỊ KHÓA:\n\n`;
        scanResult.locked.slice(0, 8).forEach((group, index) => {
            const rank = ["🥇", "🥈", "🥉"][index] || `${index + 1}️⃣`;
            message += `${rank} ${group.name}\n`;
            message += `   ${EMOJI.group} ${group.totalMembers} thành viên\n`;
            message += `   ${EMOJI.info} ID: ${group.id.slice(0, 15)}...\n\n`;
        });
        
        if (scanResult.locked.length > 8) {
            message += `${EMOJI.list} ... và ${scanResult.locked.length - 8} nhóm khác\n\n`;
        }
        
        message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
        message += `${EMOJI.rocket} HÀNH ĐỘNG ĐỀ XUẤT:\n`;
        message += `${EMOJI.bolt} bonzout gr - Rời nhóm khóa\n`;
        message += `${EMOJI.target} bonzout gr nonadmin - Rời (non-admin)\n\n`;
    }

    message += `${EMOJI.info} LỆNH KHÁC:\n`;
    message += `${EMOJI.shield} bonzout admin - Xem quyền admin\n`;
    message += `${EMOJI.list} bonzout list - Xem tất cả nhóm\n`;
    message += `${EMOJI.brain} bonzout help - Trợ giúp chi tiết\n\n`;
    
    message += `${EMOJI.time} ${new Date().toLocaleString('vi-VN')}\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}`;

    await safeSendMessage(api, message, threadId, type, IMAGES.scan);
}

// Handle admin command
async function handleScanAdminCommand(api, threadId, type) {
    await handleAdminPageCommand(api, threadId, type, 1);
}

async function handleAdminPageCommand(api, threadId, type, pageNum = 1) {
    const loadingMsg = `${EMOJI.crown} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                       `${EMOJI.search} Đang kiểm tra quyền admin...\n\n` +
                       `${EMOJI.shield} Phân tích vai trò bot\n` +
                       `${EMOJI.admin} Xác định quyền hạn\n\n` +
                       `${EMOJI.crown} ━━━━━━━━━━━━━━━━━━━━━━`;
    
    await safeSendMessage(api, loadingMsg, threadId, type);

    const allGroups = await getAllBotGroups(api);
    const botId = await getBotId(api);

    if (!botId) {
        let message = `${EMOJI.list} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.list}\n\n`;
        message += `${EMOJI.globe} TẤT CẢ NHÓM (${allGroups.length})\n\n`;
        message += `${EMOJI.warning} Không xác định được Bot ID\n\n`;
        
        allGroups.slice(0, 10).forEach((g, idx) => {
            message += `${(idx + 1).toString().padStart(2, '0')}. ${g.name}\n`;
            message += `   ${EMOJI.group} ${g.totalMembers} thành viên\n\n`;
        });
        
        message += `${EMOJI.list} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.list}`;
        return await safeSendMessage(api, message, threadId, type, IMAGES.admin);
    }

    const matches = [];
    for (const g of allGroups) {
        const adminIds = (g.adminIds || []).map(String);
        const creatorId = g.creatorId ? String(g.creatorId) : null;
        const isCreator = creatorId && creatorId === String(botId);
        const isAdmin = adminIds.includes(String(botId));
        if (isCreator || isAdmin) {
            matches.push({
                id: g.id,
                name: g.name,
                totalMembers: g.totalMembers,
                role: isCreator ? 'creator' : 'admin',
                roleIcon: isCreator ? EMOJI.crown : EMOJI.shield
            });
        }
    }

    if (matches.length === 0) {
        const msg = `${EMOJI.info} Bot không là admin ở nhóm nào.`;
        return await safeSendMessage(api, msg, threadId, type);
    }

    const itemsPerPage = 10;
    const totalPages = Math.ceil(matches.length / itemsPerPage);
    const currentPage = Math.max(1, Math.min(pageNum, totalPages));
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, matches.length);
    const pageItems = matches.slice(startIndex, endIndex);

    let message = `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    message += `${EMOJI.crown} NHÓM BOT LÀ QUẢN TRỊ\n\n`;
    message += `${EMOJI.sparkles} Trang ${currentPage}/${totalPages} | Tổng: ${matches.length} nhóm\n\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;

    pageItems.forEach((m, idx) => {
        const globalIndex = startIndex + idx + 1;
        const rank = globalIndex <= 3 ? ["🥇", "🥈", "🥉"][globalIndex - 1] : `${globalIndex}️⃣`;
        message += `${rank} ${m.roleIcon} ${m.name}\n`;
        message += `   ${EMOJI.group} ${m.totalMembers} thành viên\n`;
        message += `   ${EMOJI.star} Vai trò: ${m.role === 'creator' ? 'Người tạo' : 'Quản trị viên'}\n\n`;
    });

    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    
    if (totalPages > 1) {
        message += `${EMOJI.info} ĐIỀU HƯỚNG:\n`;
        if (currentPage > 1) {
            message += `${EMOJI.bolt} bonzout admin page ${currentPage - 1} - Trang trước\n`;
        }
        if (currentPage < totalPages) {
            message += `${EMOJI.bolt} bonzout admin page ${currentPage + 1} - Trang sau\n`;
        }
        message += `\n`;
    }
    
    message += `${EMOJI.time} ${new Date().toLocaleString('vi-VN')}\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}`;

    await safeSendMessage(api, message, threadId, type, IMAGES.admin);
}

// Handle list command
async function handleListCommand(api, threadId, type) {
    const loadingMsg = `${EMOJI.list} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                       `${EMOJI.search} Đang tải danh sách...\n\n` +
                       `${EMOJI.brain} Thu thập thông tin\n` +
                       `${EMOJI.chart} Sắp xếp dữ liệu\n\n` +
                       `${EMOJI.list} ━━━━━━━━━━━━━━━━━━━━━━`;
    
    await safeSendMessage(api, loadingMsg, threadId, type);

    const allGroups = await getAllBotGroups(api);
    
    if (allGroups.length === 0) {
        const msg = `${EMOJI.info} Bot không tham gia nhóm nào.`;
        return await safeSendMessage(api, msg, threadId, type);
    }

    let message = `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    message += `${EMOJI.list} DANH SÁCH TẤT CẢ NHÓM\n\n`;
    message += `${EMOJI.globe} Tổng: ${allGroups.length} nhóm\n\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    
    allGroups.slice(0, 15).forEach((group, index) => {
        const rank = index < 3 ? ["🥇", "🥈", "🥉"][index] : `${(index + 1).toString().padStart(2, '0')}.`;
        const status = group.error ? EMOJI.error : EMOJI.success;
        message += `${rank} ${status} ${group.name}\n`;
        message += `   ${EMOJI.group} ${group.totalMembers} thành viên\n`;
        if (group.error) {
            message += `   ${EMOJI.warning} Lỗi: ${group.error.slice(0, 30)}...\n`;
        }
        message += `\n`;
    });

    if (allGroups.length > 15) {
        message += `${EMOJI.sparkles} ... và ${allGroups.length - 15} nhóm khác\n\n`;
    }

    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    message += `${EMOJI.fire} LỆNH NHANH:\n`;
    message += `${EMOJI.search} bonzout scan - Phân tích chi tiết\n`;
    message += `${EMOJI.shield} bonzout admin - Xem quyền admin\n\n`;
    message += `${EMOJI.time} ${new Date().toLocaleString('vi-VN')}\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}`;

    await safeSendMessage(api, message, threadId, type, IMAGES.list);
}

// Handle leave locked groups
async function handleLeaveLockedGroups(api, threadId, type) {
    const loadingMsg = `${EMOJI.rocket} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                       `${EMOJI.fire} BẮT ĐẦU RỜI NHÓM!\n\n` +
                       `${EMOJI.target} Đang xử lý nhóm bị khóa\n` +
                       `${EMOJI.brain} Chuẩn bị thoát an toàn\n\n` +
                       `${EMOJI.warning} Vui lòng chờ...\n\n` +
                       `${EMOJI.rocket} ━━━━━━━━━━━━━━━━━━━━━━`;
    
    await safeSendMessage(api, loadingMsg, threadId, type);

    const scanResult = await scanAllGroups(api);
    
    if (scanResult.locked.length === 0) {
        const msg = `${EMOJI.party} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `${EMOJI.success} HOÀN HẢO!\n\n` +
                    `${EMOJI.unlock} Không có nhóm bị khóa nào\n` +
                    `${EMOJI.star} Tất cả nhóm đều hoạt động tốt!\n\n` +
                    `${EMOJI.party} ━━━━━━━━━━━━━━━━━━━━━━`;
        return await safeSendMessage(api, msg, threadId, type, IMAGES.success);
    }

    let successCount = 0;
    let failCount = 0;
    const failedGroups = [];

    for (const group of scanResult.locked) {
        const result = await leaveGroup(api, group.id, group.name);
        if (result.success) {
            successCount++;
        } else {
            failCount++;
            failedGroups.push({ name: group.name, error: result.error });
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    let message = `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    message += `${EMOJI.party} KẾT QUẢ RỜI NHÓM BỊ KHÓA\n\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    
    message += `${EMOJI.stats} THỐNG KÊ:\n\n`;
    message += `${EMOJI.success} Thành công: ${successCount}\n`;
    message += `${createProgressBar(successCount, scanResult.locked.length)}\n\n`;
    
    if (failCount > 0) {
        message += `${EMOJI.error} Thất bại: ${failCount}\n`;
        message += `${createProgressBar(failCount, scanResult.locked.length)}\n\n`;
    }
    
    const percentage = Math.round((successCount / scanResult.locked.length) * 100);
    message += `${EMOJI.chart} Tỷ lệ thành công: ${percentage}%\n\n`;
    
    if (failedGroups.length > 0 && failedGroups.length <= 5) {
        message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
        message += `${EMOJI.warning} NHÓM THẤT BẠI:\n\n`;
        failedGroups.forEach((g, i) => {
            message += `${i + 1}. ${g.name}\n`;
            message += `   ${EMOJI.info} ${g.error.slice(0, 40)}\n\n`;
        });
    }
    
    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    message += `${EMOJI.time} Hoàn tất: ${new Date().toLocaleString('vi-VN')}\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}`;

    await safeSendMessage(api, message, threadId, type, IMAGES.success);
}

// Handle leave all groups
async function handleLeaveAllGroups(api, threadId, type) {
    const warningMsg = `${EMOJI.warning} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                       `${EMOJI.fire} CẢNH BÁO QUAN TRỌNG!\n\n` +
                       `${EMOJI.rocket} Sắp rời TẤT CẢ nhóm\n` +
                       `${EMOJI.shield} (Trừ nhóm hiện tại)\n\n` +
                       `${EMOJI.brain} Bắt đầu xử lý...\n\n` +
                       `${EMOJI.warning} ━━━━━━━━━━━━━━━━━━━━━━`;
    
    await safeSendMessage(api, warningMsg, threadId, type);

    const allGroups = await getAllBotGroups(api);
    const groupsToLeave = allGroups.filter(group => group.id !== threadId);
    
    if (groupsToLeave.length === 0) {
        const msg = `${EMOJI.info} Chỉ có nhóm hiện tại.`;
        return await safeSendMessage(api, msg, threadId, type);
    }

    let successCount = 0;
    let failCount = 0;

    for (const group of groupsToLeave) {
        const result = await leaveGroup(api, group.id, group.name);
        if (result.success) successCount++;
        else failCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    let message = `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    message += `${EMOJI.rocket} RỜI TẤT CẢ NHÓM - HOÀN TẤT\n\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    
    message += `${EMOJI.stats} KẾT QUẢ:\n\n`;
    message += `${EMOJI.success} Thành công: ${successCount}\n`;
    message += `${createProgressBar(successCount, groupsToLeave.length)}\n\n`;
    
    if (failCount > 0) {
        message += `${EMOJI.error} Thất bại: ${failCount}\n`;
        message += `${createProgressBar(failCount, groupsToLeave.length)}\n\n`;
    }
    
    message += `${EMOJI.shield} Giữ nhóm hiện tại: ${EMOJI.success}\n\n`;
    
    const percentage = Math.round((successCount / groupsToLeave.length) * 100);
    message += `${EMOJI.chart} Tỷ lệ: ${percentage}%\n\n`;
    
    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    message += `${EMOJI.party} Đã dọn dẹp hệ thống thành công!\n\n`;
    message += `${EMOJI.time} ${new Date().toLocaleString('vi-VN')}\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}`;

    await safeSendMessage(api, message, threadId, type, IMAGES.success);
}

// Handle leave locked groups non-admin
async function handleLeaveLockedGroupsNonAdmin(api, threadId, type) {
    const loadingMsg = `${EMOJI.rocket} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                       `${EMOJI.brain} CHỌN LỌC THÔNG MINH\n\n` +
                       `${EMOJI.target} Rời nhóm khóa (non-admin)\n` +
                       `${EMOJI.shield} Bảo vệ admin groups\n\n` +
                       `${EMOJI.rocket} ━━━━━━━━━━━━━━━━━━━━━━`;
    
    await safeSendMessage(api, loadingMsg, threadId, type);

    const [scanResult, botId, protectedIds] = await Promise.all([
        scanAllGroups(api),
        getBotId(api),
        Promise.resolve(getProtectedAdminIds())
    ]);

    if (!botId) {
        const msg = `${EMOJI.warning} Không xác định được bot ID.`;
        return await safeSendMessage(api, msg, threadId, type);
    }

    const targets = scanResult.locked.filter(g => {
        const adminIds = (g.adminIds || []).map(String);
        const creatorId = g.creatorId ? String(g.creatorId) : null;
        const botIsAdmin = adminIds.includes(String(botId));
        const hasProtectedAdmin = protectedIds.some(pid => adminIds.includes(String(pid)));
        const botIsCreator = creatorId && creatorId === String(botId);
        return !g.error && !botIsAdmin && !botIsCreator && !hasProtectedAdmin;
    });

    if (targets.length === 0) {
        const msg = `${EMOJI.info} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `${EMOJI.success} HOÀN HẢO!\n\n` +
                    `${EMOJI.shield} Không có nhóm non-admin nào\n` +
                    `cần rời khỏi.\n\n` +
                    `${EMOJI.star} Tất cả nhóm đều quan trọng!\n\n` +
                    `${EMOJI.info} ━━━━━━━━━━━━━━━━━━━━━━`;
        return await safeSendMessage(api, msg, threadId, type, IMAGES.success);
    }

    let successCount = 0;
    let failCount = 0;

    for (const group of targets) {
        const result = await leaveGroup(api, group.id, group.name);
        if (result.success) successCount++;
        else failCount++;
        await new Promise(r => setTimeout(r, 1000));
    }

    let message = `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    message += `${EMOJI.fire} RỜI NHÓM (NON-ADMIN)\n\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    
    message += `${EMOJI.stats} KẾT QUẢ:\n\n`;
    message += `${EMOJI.target} Đã quét: ${scanResult.locked.length} nhóm khóa\n`;
    message += `${EMOJI.brain} Đã lọc: ${targets.length} nhóm phù hợp\n\n`;
    
    message += `${EMOJI.success} Thành công: ${successCount}\n`;
    message += `${createProgressBar(successCount, targets.length)}\n\n`;
    
    if (failCount > 0) {
        message += `${EMOJI.error} Thất bại: ${failCount}\n`;
        message += `${createProgressBar(failCount, targets.length)}\n\n`;
    }
    
    const saved = scanResult.locked.length - targets.length;
    if (saved > 0) {
        message += `${EMOJI.shield} Đã bảo vệ: ${saved} nhóm admin\n\n`;
    }
    
    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    message += `${EMOJI.time} ${new Date().toLocaleString('vi-VN')}\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}`;

    await safeSendMessage(api, message, threadId, type, IMAGES.success);
}

// Handle leave all groups non-admin
async function handleLeaveAllGroupsNonAdmin(api, threadId, type) {
    const warningMsg = `${EMOJI.warning} ━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                       `${EMOJI.brain} CHẾ ĐỘ THÔNG MINH\n\n` +
                       `${EMOJI.rocket} Rời tất cả (non-admin)\n` +
                       `${EMOJI.shield} Bảo vệ admin groups\n\n` +
                       `${EMOJI.target} Đang xử lý...\n\n` +
                       `${EMOJI.warning} ━━━━━━━━━━━━━━━━━━━━━━`;
    
    await safeSendMessage(api, warningMsg, threadId, type);

    const [allGroups, botId, protectedIds] = await Promise.all([
        getAllBotGroups(api),
        getBotId(api),
        Promise.resolve(getProtectedAdminIds())
    ]);

    if (!botId) {
        const msg = `${EMOJI.warning} Không xác định được bot ID.`;
        return await safeSendMessage(api, msg, threadId, type);
    }

    const groupsToLeave = allGroups.filter(g => {
        if (g.id === threadId) return false;
        const adminIds = (g.adminIds || []).map(String);
        const creatorId = g.creatorId ? String(g.creatorId) : null;
        const botIsAdmin = adminIds.includes(String(botId));
        const hasProtectedAdmin = protectedIds.some(pid => adminIds.includes(String(pid)));
        const botIsCreator = creatorId && creatorId === String(botId);
        return !g.error && !botIsAdmin && !botIsCreator && !hasProtectedAdmin;
    });

    if (groupsToLeave.length === 0) {
        const msg = `${EMOJI.info} Không có nhóm non-admin để rời.`;
        return await safeSendMessage(api, msg, threadId, type);
    }

    let successCount = 0;
    let failCount = 0;

    for (const group of groupsToLeave) {
        const result = await leaveGroup(api, group.id, group.name);
        if (result.success) successCount++;
        else failCount++;
        await new Promise(r => setTimeout(r, 1000));
    }

    let message = `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    message += `${EMOJI.rocket} RỜI TẤT CẢ (NON-ADMIN)\n\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    
    message += `${EMOJI.stats} KẾT QUẢ CHI TIẾT:\n\n`;
    message += `${EMOJI.globe} Tổng nhóm: ${allGroups.length}\n`;
    message += `${EMOJI.target} Đã lọc: ${groupsToLeave.length} nhóm\n\n`;
    
    message += `${EMOJI.success} Thành công: ${successCount}\n`;
    message += `${createProgressBar(successCount, groupsToLeave.length)}\n\n`;
    
    if (failCount > 0) {
        message += `${EMOJI.error} Thất bại: ${failCount}\n`;
        message += `${createProgressBar(failCount, groupsToLeave.length)}\n\n`;
    }
    
    const saved = allGroups.length - groupsToLeave.length - 1;
    if (saved > 0) {
        message += `${EMOJI.shield} Đã bảo vệ: ${saved} nhóm admin\n`;
    }
    message += `${EMOJI.crown} Giữ nhóm hiện tại: ${EMOJI.success}\n\n`;
    
    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    message += `${EMOJI.party} Dọn dẹp hoàn tất!\n\n`;
    message += `${EMOJI.time} ${new Date().toLocaleString('vi-VN')}\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}`;

    await safeSendMessage(api, message, threadId, type, IMAGES.success);
}

// Show help
async function showHelp(api, threadId, type) {
    let message = `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    message += `${EMOJI.fire} BONZOUT - HƯỚNG DẪN CHI TIẾT\n\n`;
    message += `${EMOJI.sparkles} Quản lý nhóm thông minh v3.0.0\n\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}\n\n`;
    
    message += `${EMOJI.chart} LỆNH PHÂN TÍCH:\n\n`;
    
    message += `${EMOJI.search} bonzout scan\n`;
    message += `   ${EMOJI.brain} Quét và phân loại tất cả nhóm\n`;
    message += `   ${EMOJI.target} Tìm nhóm bị khóa\n`;
    message += `   ${EMOJI.stats} Thống kê chi tiết\n\n`;
    
    message += `${EMOJI.shield} bonzout admin [page N]\n`;
    message += `   ${EMOJI.crown} Xem nhóm bot là admin\n`;
    message += `   ${EMOJI.star} Phân loại vai trò\n`;
    message += `   ${EMOJI.list} Hỗ trợ phân trang\n\n`;
    
    message += `${EMOJI.list} bonzout list\n`;
    message += `   ${EMOJI.globe} Danh sách tất cả nhóm\n`;
    message += `   ${EMOJI.info} Thông tin tổng quan\n\n`;
    
    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    message += `${EMOJI.rocket} LỆNH RỜI NHÓM:\n\n`;
    
    message += `${EMOJI.bolt} bonzout gr\n`;
    message += `   ${EMOJI.lock} Rời nhóm bị khóa\n`;
    message += `   ${EMOJI.target} An toàn và nhanh chóng\n\n`;
    
    message += `${EMOJI.fire} bonzout gr all\n`;
    message += `   ${EMOJI.warning} Rời TẤT CẢ nhóm\n`;
    message += `   ${EMOJI.shield} Trừ nhóm hiện tại\n\n`;
    
    message += `${EMOJI.brain} bonzout gr nonadmin\n`;
    message += `   ${EMOJI.lock} Rời nhóm khóa (non-admin)\n`;
    message += `   ${EMOJI.crown} Giữ nhóm là admin\n\n`;
    
    message += `${EMOJI.target} bonzout gr all nonadmin\n`;
    message += `   ${EMOJI.globe} Rời tất cả (non-admin)\n`;
    message += `   ${EMOJI.shield} Bảo vệ admin groups\n\n`;
    
    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    message += `${EMOJI.star} TÍNH NĂNG NỔI BẬT:\n\n`;
    message += `${EMOJI.party} Giao diện Canva cao cấp\n`;
    message += `${EMOJI.brain} Phân tích thông minh\n`;
    message += `${EMOJI.shield} Bảo vệ nhóm quan trọng\n`;
    message += `${EMOJI.rocket} Tốc độ xử lý nhanh\n`;
    message += `${EMOJI.chart} Thống kê trực quan\n`;
    message += `${EMOJI.bolt} Progress bar động\n\n`;
    
    message += `${EMOJI.sparkles} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.sparkles}\n\n`;
    message += `${EMOJI.info} THÔNG TIN:\n\n`;
    message += `${EMOJI.diamond} Version: 3.0.0 Premium\n`;
    message += `${EMOJI.crown} Role: Admin/Owner Only\n`;
    message += `${EMOJI.time} Cooldown: 10 giây\n`;
    message += `${EMOJI.fire} Creator: Cascade AI\n\n`;
    
    message += `${EMOJI.warning} LƯU Ý:\n`;
    message += `• Bot gửi lời tạm biệt trước khi rời\n`;
    message += `• Nhóm hiện tại luôn được bảo vệ\n`;
    message += `• Có delay tránh spam API\n`;
    message += `• Lọc admin thông minh tự động\n`;
    message += `• Hỗ trợ hình ảnh Canva đẹp mắt\n\n`;
    
    message += `${EMOJI.party} Tạo bởi Cascade AI với ${EMOJI.heart}\n`;
    message += `${EMOJI.diamond} ━━━━━━━━━━━━━━━━━━━━━━━━━━ ${EMOJI.diamond}`;

    await safeSendMessage(api, message, threadId, type, IMAGES.help);
}

module.exports.info = des;