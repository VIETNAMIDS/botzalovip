const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const { createCanvas } = require('canvas');
const { Reactions } = require('zca-js');
const loaderCommand = require("../../core/loader/loaderCommand");

const AUTO_DELETE_TIME = 60000;

const CMD_REACTION_POOL = [
    Reactions.HEART, Reactions.LIKE, Reactions.WOW, Reactions.SUN,
    Reactions.HANDCLAP, Reactions.COOL, Reactions.OK, Reactions.ROSE,
    Reactions.KISS, Reactions.BOMB, Reactions.THINK, Reactions.SAD,
    Reactions.CRY, Reactions.CONFUSED, Reactions.ANGRY, Reactions.LAUGH
];
const CMD_REACTION_BATCH = 10;
const CMD_REACTION_MIN = 1;
const CMD_REACTION_MAX = 100;
let lastCmdReactionKey = null;

const appendAutoDeleteNotice = (message, ttl = AUTO_DELETE_TIME) =>
    `${message}\n⏱️ Tin nhắn sẽ tự động xóa sau ${Math.floor(ttl / 1000)}s`;

const sendImageWithTTL = async (api, threadId, type, message, imagePath, ttl = AUTO_DELETE_TIME) => {
    await api.sendMessage({
        msg: appendAutoDeleteNotice(message, ttl),
        attachments: [imagePath],
        ttl
    }, threadId, type);
    setTimeout(() => fs.unlink(imagePath).catch(() => {}), ttl);
};

const sendTextWithTTL = async (api, threadId, type, message, ttl = AUTO_DELETE_TIME) => {
    await api.sendMessage({
        msg: appendAutoDeleteNotice(message, ttl),
        ttl
    }, threadId, type);
};

async function reactCmd(api, event, threadId, type) {
    if (typeof api.addReaction !== 'function' || !event?.data?.msgId) return;

    const target = {
        data: { msgId: event.data.msgId, cliMsgId: event.data.cliMsgId },
        threadId,
        type
    };

    try {
        await api.addReaction(Reactions.NONE, target);
    } catch {}

    const desiredCount = Math.floor(Math.random() * (CMD_REACTION_MAX - CMD_REACTION_MIN + 1)) + CMD_REACTION_MIN;

    let picks = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = [];
        const used = new Set();

        while (candidate.length < desiredCount) {
            const pool = [...CMD_REACTION_POOL];
            for (let i = pool.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }

            for (const reaction of pool) {
                if (reaction === Reactions.NONE) continue;
                if (used.has(reaction) && used.size < CMD_REACTION_POOL.length) continue;
                candidate.push(reaction);
                used.add(reaction);
                if (candidate.length === desiredCount) break;
            }

            if (candidate.length === desiredCount) break;
            if (CMD_REACTION_POOL.length === 0) break;
            used.clear();
        }

        if (!candidate.length) break;

        const signature = `${desiredCount}:${candidate.join('|')}`;
        if (signature !== lastCmdReactionKey || attempt === 4) {
            picks = candidate;
            lastCmdReactionKey = signature;
            break;
        }
    }

    for (const reaction of picks) {
        if (reaction === Reactions.NONE) continue;
        try {
            await api.addReaction(reaction, target);
        } catch {}
    }
}

module.exports.config = {
    name: "command",
    aliases: ["cmd"],
    version: "2.1.0",
    role: 2,
    author: "NLam182 & Bonz",
    description: "Quản lý và kiểm soát các plugin lệnh của bot - Auto delete",
    category: "Hệ thống",
    usage: ".cmd <load|unload|loadall|unloadall|list|info> [tên lệnh]",
    cooldowns: 2
};

// Helper: Create beautiful image
async function createBeautifulImage(title, content, type = "success") {
    const width = 1200;
    const lineHeight = 40;
    const padding = 60;
    const headerHeight = 180;
    const footerHeight = 80;
    
    // Calculate content height
    const lines = content.split('\n');
    const contentHeight = Math.max(400, lines.length * lineHeight + 100);
    const height = headerHeight + contentHeight + footerHeight;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

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

    // Color schemes based on type
    const colors = {
        success: { primary: '#10b981', secondary: '#059669', icon: '✅' },
        error: { primary: '#ef4444', secondary: '#dc2626', icon: '❌' },
        info: { primary: '#3b82f6', secondary: '#2563eb', icon: '📚' },
        warning: { primary: '#f59e0b', secondary: '#d97706', icon: '⚠️' }
    };
    const theme = colors[type] || colors.info;

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

    // Border gradient
    const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
    borderGradient.addColorStop(0, '#8b5cf6');
    borderGradient.addColorStop(0.5, '#ec4899');
    borderGradient.addColorStop(1, '#facc15');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.2)');
    headerGradient.addColorStop(1, 'rgba(250, 204, 21, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, headerHeight - 40, 25);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, headerHeight - 40, 25);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
    ctx.shadowBlur = 30;
    roundRect(ctx, 40, 30, width - 80, headerHeight - 40, 25);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Title with icon
    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, theme.primary);
    titleGradient.addColorStop(1, theme.secondary);
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 64px Arial';
    ctx.shadowColor = `${theme.primary}80`;
    ctx.shadowBlur = 25;
    ctx.fillText(`${theme.icon} ${title}`, width / 2, 110);
    ctx.shadowBlur = 0;

    // Content card
    const cardY = headerHeight;
    const cardHeight = contentHeight;
    
    const cardGradient = ctx.createLinearGradient(60, cardY, width - 60, cardY);
    cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.9)');
    cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
    
    roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.shadowColor = theme.primary;
    ctx.shadowBlur = 20;
    roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Content text
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'left';
    
    let textY = cardY + 60;
    lines.forEach(line => {
        // Highlight special parts
        if (line.includes(':')) {
            const parts = line.split(':');
            const label = parts[0] + ':';
            const value = parts.slice(1).join(':');
            
            // Label
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(label, 100, textY);
            
            // Value
            const labelWidth = ctx.measureText(label).width;
            const valueGradient = ctx.createLinearGradient(0, 0, width, 0);
            valueGradient.addColorStop(0, theme.primary);
            valueGradient.addColorStop(1, theme.secondary);
            ctx.fillStyle = valueGradient;
            ctx.fillText(value, 100 + labelWidth + 10, textY);
        } else if (line.startsWith('-')) {
            // Bullet points
            ctx.fillStyle = '#fbbf24';
            ctx.fillText('•', 120, textY);
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(line.substring(1).trim(), 160, textY);
        } else {
            // Normal text
            ctx.fillStyle = '#e2e8f0';
            
            // Word wrap
            const maxWidth = width - 200;
            const words = line.split(' ');
            let currentLine = '';
            
            for (let word of words) {
                const testLine = currentLine + word + ' ';
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > maxWidth && currentLine !== '') {
                    ctx.fillText(currentLine.trim(), 100, textY);
                    currentLine = word + ' ';
                    textY += lineHeight;
                } else {
                    currentLine = testLine;
                }
            }
            ctx.fillText(currentLine.trim(), 100, textY);
        }
        textY += lineHeight;
    });

    // Footer
    const footerY = height - footerHeight;
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
    ctx.fillText('🤖 BOT COMMAND MANAGER - BONZ', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

async function loadModule(api, event, moduleName) {
    if (global.__treoToolMode === true) {
        return;
    }
    const { threadId, type } = event;
    const commandPath = path.join(__dirname, `${moduleName}.js`);
    
    if (!fsSync.existsSync(commandPath)) {
        const buffer = await createBeautifulImage(
            'LỖI LOAD',
            `Không tìm thấy plugin '${moduleName}'`,
            'error'
        );
        const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
        await fs.writeFile(tempPath, buffer);
        await sendImageWithTTL(api, threadId, type, `❌ Lỗi: Không tìm thấy plugin '${moduleName}'`, tempPath);
        return;
    }

    delete require.cache[require.resolve(commandPath)];
    const load = await loaderCommand(moduleName);

    if (load.status === false) {
        const buffer = await createBeautifulImage(
            'LỖI LOAD',
            `Lệnh: ${moduleName}\nLỗi: ${load.error}`,
            'error'
        );
        const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
        await fs.writeFile(tempPath, buffer);
        await sendImageWithTTL(api, threadId, type, `❌ Lỗi khi load '${moduleName}'`, tempPath);
        return;
    }

    if (load.restart) {
        return;
    }

    const buffer = await createBeautifulImage(
        'LOAD THÀNH CÔNG',
        `Lệnh: ${moduleName}\nTrạng thái: Đã tải thành công`,
        'success'
    );
    const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
    await fs.writeFile(tempPath, buffer);
    await sendImageWithTTL(api, threadId, type, `✅ Đã load '${moduleName}' thành công`, tempPath);
}

async function unloadModule(api, event, moduleName) {
    if (global.__treoToolMode === true) {
        return;
    }
    const { threadId, type } = event;
    
    if (!global.client.commands.has(moduleName)) {
        const buffer = await createBeautifulImage(
            'LỖI UNLOAD',
            `Lệnh '${moduleName}' chưa được tải`,
            'error'
        );
        const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
        await fs.writeFile(tempPath, buffer);
        await sendImageWithTTL(api, threadId, type, `❌ Lệnh '${moduleName}' chưa được tải`, tempPath);
        return;
    }
    
    global.client.commands.delete(moduleName);
    const commandPath = path.join(__dirname, `${moduleName}.js`);
    delete require.cache[require.resolve(commandPath)];
    
    const buffer = await createBeautifulImage(
        'UNLOAD THÀNH CÔNG',
        `Lệnh: ${moduleName}\nTrạng thái: Đã gỡ thành công`,
        'success'
    );
    const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
    await fs.writeFile(tempPath, buffer);
    await sendImageWithTTL(api, threadId, type, `✅ Đã unload '${moduleName}' thành công`, tempPath);
}

module.exports.run = async function({ api, event, args }) {
    if (global.__treoToolMode === true) {
        return api.sendMessage({
            msg: '⚠️ TREO đang chạy thành công • Bot đang ở chế độ TOOL nên chỉ lệnh treo được phép.',
            ttl: AUTO_DELETE_TIME
        }, event.threadId, event.type);
    }

    const { threadId, type } = event;

    await reactCmd(api, event, threadId, type);

    if (!global.users.admin.includes(event.data.uidFrom)) {
        const buffer = await createBeautifulImage(
            'KHÔNG CÓ QUYỀN',
            'Bạn không có quyền sử dụng lệnh này',
            'error'
        );
        const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
        await fs.writeFile(tempPath, buffer);
        await sendImageWithTTL(api, threadId, type, '🚫 Không có quyền truy cập', tempPath);
        return;
    }

    const action = args[0]?.toLowerCase();
    const moduleName = args[1];

    try {
        switch (action) {
            case "load":
                if (!moduleName) {
                    const buffer = await createBeautifulImage(
                        'THIẾU THAM SỐ',
                        'Vui lòng nhập tên lệnh cần tải\nSử dụng: cmd load <tên_lệnh>',
                        'warning'
                    );
                    const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
                    await fs.writeFile(tempPath, buffer);
                    await sendImageWithTTL(api, threadId, type, '⚠️ Thiếu tham số', tempPath);
                    return;
                }
                await loadModule(api, event, moduleName);
                break;

            case "unload":
                if (!moduleName) {
                    const buffer = await createBeautifulImage(
                        'THIẾU THAM SỐ',
                        'Vui lòng nhập tên lệnh cần gỡ\nSử dụng: cmd unload <tên_lệnh>',
                        'warning'
                    );
                    const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
                    await fs.writeFile(tempPath, buffer);
                    await sendImageWithTTL(api, threadId, type, '⚠️ Thiếu tham số', tempPath);
                    return;
                }
                await unloadModule(api, event, moduleName);
                break;

            case "loadall":
                await sendTextWithTTL(api, threadId, type, "🔄 Bắt đầu tải lại tất cả lệnh...");
                Object.keys(require.cache).forEach(key => {
                    if (key.startsWith(__dirname)) delete require.cache[key];
                });
                global.client.commands.clear();
                const loaderCmd = require("../../core/loader/loaderCommand");
                await loaderCmd();
                
                const buffer = await createBeautifulImage(
                    'LOAD ALL THÀNH CÔNG',
                    `Tổng số lệnh: ${global.client.commands.size}\nTrạng thái: Đã tải lại tất cả lệnh`,
                    'success'
                );
                const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
                await fs.writeFile(tempPath, buffer);
                await sendImageWithTTL(api, threadId, type, `✅ Đã load ${global.client.commands.size} lệnh`, tempPath);
                break;

            case "unloadall":
                const files = fsSync.readdirSync(__dirname).filter(f => f.endsWith(".js") && f !== "command.js");
                let count = 0;
                for (const file of files) {
                    const name = file.replace(".js", "");
                    if (global.client.commands.has(name)) {
                        global.client.commands.delete(name);
                        delete require.cache[require.resolve(path.join(__dirname, file))];
                        count++;
                    }
                }
                
                const unloadBuffer = await createBeautifulImage(
                    'UNLOAD ALL THÀNH CÔNG',
                    `Đã gỡ: ${count} lệnh\nTrạng thái: Hoàn tất`,
                    'success'
                );
                const unloadPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
                await fs.writeFile(unloadPath, unloadBuffer);
                await sendImageWithTTL(api, threadId, type, `✅ Đã gỡ ${count} lệnh`, unloadPath);
                break;

            case "list":
                const list = Array.from(global.client.commands.keys());
                const listContent = `Tổng số: ${list.length} lệnh\n\n${list.join('\n- ')}`;
                
                const listBuffer = await createBeautifulImage(
                    'DANH SÁCH LỆNH',
                    listContent,
                    'info'
                );
                const listPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
                await fs.writeFile(listPath, listBuffer);
                await sendImageWithTTL(api, threadId, type, `📚 Danh sách ${list.length} lệnh`, listPath);
                break;

            case "info":
                if (!moduleName) {
                    const buffer = await createBeautifulImage(
                        'THIẾU THAM SỐ',
                        'Vui lòng nhập tên lệnh cần xem\nSử dụng: cmd info <tên_lệnh>',
                        'warning'
                    );
                    const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
                    await fs.writeFile(tempPath, buffer);
                    await api.sendMessage({ 
                        msg: '⚠️ Thiếu tham số',
                        attachments: [tempPath] 
                    }, threadId, type);
                    setTimeout(() => fs.unlink(tempPath).catch(() => {}), 5000);
                    return;
                }
                
                const cmd = global.client.commands.get(moduleName);
                if (!cmd) {
                    const buffer = await createBeautifulImage(
                        'KHÔNG TÌM THẤY',
                        `Lệnh '${moduleName}' không tồn tại hoặc chưa được tải`,
                        'error'
                    );
                    const tempPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
                    await fs.writeFile(tempPath, buffer);
                    await sendImageWithTTL(api, threadId, type, `❌ Không tìm thấy '${moduleName}'`, tempPath);
                    return;
                }
                
                const config = cmd.config;
                const roleText = config.role === 0 ? "Người dùng" : config.role === 1 ? "Support" : "Admin";
                const depsText = config.dependencies ? Object.keys(config.dependencies).join(", ") : "Không có";

                const infoContent = `Tên lệnh: ${config.name}\n` +
                                  `Mô tả: ${config.description}\n` +
                                  `Tác giả: ${config.author}\n` +
                                  `Phiên bản: ${config.version}\n` +
                                  `Quyền hạn: ${roleText}\n` +
                                  `Cách dùng: ${config.usage}\n` +
                                  `Dependencies: ${depsText}`;
                
                const infoBuffer = await createBeautifulImage(
                    'THÔNG TIN LỆNH',
                    infoContent,
                    'info'
                );
                const infoPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
                await fs.writeFile(infoPath, infoBuffer);
                await sendImageWithTTL(api, threadId, type, `ℹ️ Thông tin lệnh '${moduleName}'`, infoPath);
                break;

            default:
                const helpContent = `Các lệnh có sẵn:\n\n` +
                                  `- cmd load <tên_lệnh>\n` +
                                  `- cmd unload <tên_lệnh>\n` +
                                  `- cmd loadall\n` +
                                  `- cmd unloadall\n` +
                                  `- cmd list\n` +
                                  `- cmd info <tên_lệnh>`;
                
                const helpBuffer = await createBeautifulImage(
                    'HƯỚNG DẪN SỬ DỤNG',
                    helpContent,
                    'info'
                );
                const helpPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
                await fs.writeFile(helpPath, helpBuffer);
                await sendImageWithTTL(api, threadId, type, '📖 Hướng dẫn sử dụng CMD', helpPath);
                break;
        }
    } catch (error) {
        console.error("Lỗi trong command:", error);
        const errorBuffer = await createBeautifulImage(
            'LỖI HỆ THỐNG',
            `Đã xảy ra lỗi:\n${error.message}`,
            'error'
        );
        const errorPath = path.join(__dirname, '../../cache', `cmd_${Date.now()}.png`);
        await fs.writeFile(errorPath, errorBuffer);
        await sendImageWithTTL(api, threadId, type, '❌ Đã xảy ra lỗi khi xử lý lệnh', errorPath);
    }
};