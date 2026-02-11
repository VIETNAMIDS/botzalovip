const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const moment = require("moment-timezone");
const os = require('os');
const crypto = require('crypto');
const { Reactions } = require('zca-js');
const menuAdminModule = require('./menuAdmin');

const AUTO_DELETE_TIME = 60000;
const MENU_SELECTION_TTL = 2 * 60 * 1000;

function __ensureMenuSelectionStores() {
    if (!(global.__bonzMenuSelectionsByMessage instanceof Map)) {
        global.__bonzMenuSelectionsByMessage = new Map();
    }
    if (!(global.__bonzMenuSelectionsByUser instanceof Map)) {
        global.__bonzMenuSelectionsByUser = new Map();
    }
}

function __menuSelectionKey(threadId, senderId) {
    return `${threadId}:${senderId}`;
}

function __removeMenuSelection(record) {
    if (!record) return;
    __ensureMenuSelectionStores();

    const { threadId, senderId, selectionKeys } = record;
    if (Array.isArray(selectionKeys)) {
        selectionKeys.forEach(key => {
            global.__bonzMenuSelectionsByMessage.delete(String(key));
        });
    }
    if (threadId && senderId) {
        const cacheKey = __menuSelectionKey(threadId, senderId);
        const current = global.__bonzMenuSelectionsByUser.get(cacheKey);
        if (current && current === record) {
            global.__bonzMenuSelectionsByUser.delete(cacheKey);
        }
    }
}

function __storeMenuSelection(keys, record) {
    if (!record?.threadId || !record?.senderId) return null;
    __ensureMenuSelectionStores();

    const cacheKey = __menuSelectionKey(record.threadId, record.senderId);
    const previous = global.__bonzMenuSelectionsByUser.get(cacheKey);
    if (previous) {
        __removeMenuSelection(previous);
    }

    const selectionKeys = Array.isArray(keys) ? keys.filter(Boolean).map(String) : [];
    record.selectionKeys = selectionKeys;
    record.at = Date.now();

    global.__bonzMenuSelectionsByUser.set(cacheKey, record);
    selectionKeys.forEach(key => {
        global.__bonzMenuSelectionsByMessage.set(key, record);
    });

    return record;
}

function __describeRole(role) {
    const n = Number(role);
    if (!Number.isFinite(n)) return null;
    switch (n) {
        case 0:
            return 'Tất cả mọi người';
        case 1:
            return 'Quản trị viên nhóm';
        case 2:
            return 'Admin bot';
        default:
            return `Yêu cầu quyền cấp ${n}`;
    }
}

function __resolveMenuCommandInfo(rawText) {
    if (!rawText) return null;
    const registry = global?.client?.commands;
    if (!registry || typeof registry.forEach !== 'function') return null;

    const firstToken = String(rawText).trim().split(/\s+/)[0]?.toLowerCase();
    if (!firstToken) return null;

    let resolved = null;
    registry.forEach((cmd) => {
        if (resolved || !cmd || typeof cmd !== 'object') return;
        const config = cmd.config || {};
        const name = String(config.name || '').toLowerCase();
        const aliases = Array.isArray(config.aliases) ? config.aliases.filter(Boolean) : [];
        const aliasLookup = aliases.map(alias => String(alias || '').toLowerCase());
        if (name === firstToken || aliasLookup.includes(firstToken)) {
            resolved = {
                name: config.name || firstToken,
                description: config.description || '',
                usage: config.usage || '',
                cooldowns: config.cooldowns,
                role: config.role,
                author: config.author || '',
                roleDescription: __describeRole(config.role),
                aliases
            };
        }
    });

    return resolved;
}

function __getMenuSelectionBySender(senderId, threadId) {
    if (!senderId) return null;
    __ensureMenuSelectionStores();

    const cacheKey = __menuSelectionKey(threadId, senderId);
    const record = global.__bonzMenuSelectionsByUser.get(cacheKey);
    if (!record) return null;

    if (!record.at || (Date.now() - record.at) > MENU_SELECTION_TTL) {
        __removeMenuSelection(record);
        return null;
    }

    if (threadId && record.threadId && record.threadId !== threadId) {
        return null;
    }

    return record;
}

function __getMenuSelectionByMessageKey(key) {
    if (!key) return null;
    __ensureMenuSelectionStores();
    return global.__bonzMenuSelectionsByMessage.get(String(key)) || null;
}

if (!global.__bonzMenuSelectionCleaner) {
    global.__bonzMenuSelectionCleaner = setInterval(() => {
        try {
            __ensureMenuSelectionStores();
            const now = Date.now();
            for (const record of global.__bonzMenuSelectionsByUser.values()) {
                if (!record?.at || (now - record.at) > MENU_SELECTION_TTL) {
                    __removeMenuSelection(record);
                }
            }
        } catch (err) {
            console.warn('[menu] Lỗi dọn lựa chọn menu:', err?.message || err);
        }
    }, 15000);

    if (typeof global.__bonzMenuSelectionCleaner.unref === 'function') {
        global.__bonzMenuSelectionCleaner.unref();
    }
}

module.exports.config = {
    name: "menucanvas",
    aliases: ['menu', 'help', 'bonzmenu'],
    version: "4.0.0",
    role: 0,
    author: "Cascade Enhanced v4.0",
    description: "Menu lệnh với phân loại và ảnh bìa người dùng",
    category: "Tiện ích",
    usage: "menu [tổng|games|war|admin|<số>]",
    cooldowns: 3,
    dependencies: { "canvas": "", "moment-timezone": "" }
};

const MENU_REACTIONS = [
    Reactions.HEART, Reactions.LIKE, Reactions.WOW, Reactions.SUN,
    Reactions.HANDCLAP, Reactions.COOL, Reactions.OK, Reactions.ROSE
];

// Phân loại lệnh theo category
const COMMAND_CATEGORIES = {
    games: [
        'pokemon', 'ff', 'gay', 'ngu', 'gay @user', 'ngu @user', 
        'iq @user', 'hon', 'caudo', 'lienquan', 'bonz games', 
        'top', 'ghepdoi', 'tile',
        'caro', 'caro help',
        'chess', 'chess help',
        'xepgo', 'xepgo help',
        'doantu',
        'thathaythach'
    ],
    war: [
        'anti', 'mute', 'boxinfo', 'infogroupall', 
        'bonzid2 box', 'statuspost [nội dung]'
    ],
    admin: [
        'anti', 'madmin', 'doiten', 'antileave', 'antiicon', 'lockchat', 'cutp', 'rejoinlink',
        'stickerauto', 'stickergui',
        'voice'
    ],
    utility: [
        '3q', 'anh', 'baccarat', 'baucua', 
        'blackjack', 'bonz câu đố', 'bonzfarm', 'bonz get id', 'qrlogin',
        'bonzscan help', 'boxinfo', 'calender', 
        'capcut video', 'caro help', 'caudo', 'cccd', 'cdm',
        'coinflip', 'dam', 'diceroll', 'fishing help', 'games', 'gay',
        'finelenh',
        'getsticker', 'stickerdetail',
        'ghepdoi', 'girl', 'girltt', 'gmailao', 'gpt',
        'hon', 'horoscope', 'horoscopehelp', 'bonzid2',
        'tips', 'inforgroup', 'itik', 'infotiktok', 'define', 'lienquan', 
        'mafia', 'memberinfo', 'menu', 'bonz news', 'ngu', 'monopoly', 'pet', 'pokemon',
        'poker', 'qrheart', 'roulette', 'sendcard', 'sc', 'sr', 'statuspost', 'sudoku', 'taixiu',
        'thathinh', 'tile', 'tips', 'translate', 'userinfo', 'vdgirl', 'weather', 'yt', 'bonz yt info', 'zing'
    ]
};

// Menu tổng hợp tất cả lệnh
const allCommands = [
    ...COMMAND_CATEGORIES.utility,
    ...COMMAND_CATEGORIES.games,
    ...COMMAND_CATEGORIES.war,
    ...COMMAND_CATEGORIES.admin
];

async function reactMenu(api, event, threadId, type) {
    if (typeof api.addReaction !== 'function' || !event?.data?.msgId) return;
    const target = { data: { msgId: event.data.msgId, cliMsgId: event.data.cliMsgId }, threadId, type };
    try { await api.addReaction(Reactions.NONE, target); } catch {}
    for (const r of MENU_REACTIONS) {
        try { await api.addReaction(r, target); } catch {}
    }
}

async function downloadImage(url) {
    if (!url) return null;
    try {
        const axios = require('axios');
        const res = await axios.get(url, { 
            responseType: 'arraybuffer', 
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        return res.data?.length > 500 ? Buffer.from(res.data) : null;
    } catch (e) {
        console.log('[MENU] Lỗi tải ảnh:', e.message);
        return null;
    }
}

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

function formatDurationHHMM(seconds = 0) {
    const total = Math.max(0, Number(seconds) || 0);
    const duration = moment.duration(total, 'seconds');
    const hours = Math.floor(duration.asHours());
    const minutes = duration.minutes();
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

function wrapLines(ctx, text, maxWidth) {
    if (!text) return [];
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = ctx.measureText(word).width > maxWidth ? word.slice(0, Math.max(1, Math.floor(maxWidth / ctx.measureText('M').width))) : word;
            if (ctx.measureText(word).width > maxWidth) {
                let segment = '';
                for (const char of word) {
                    const testSegment = segment + char;
                    if (ctx.measureText(testSegment).width > maxWidth) {
                        if (segment) lines.push(segment);
                        segment = char;
                    } else {
                        segment = testSegment;
                    }
                }
                currentLine = segment;
            }
        }
    });

    if (currentLine) lines.push(currentLine);
    return lines;
}

async function createMenuImage({
    userName = 'User',
    userAvatar = null,
    userId = null,
    commands = [],
    pageIndex = 0,
    totalPages = 1,
    pageSize = 10,
    startIndex = 0,
    categoryName = 'ALL'
}) {
    const WIDTH = 1400;
    const HEIGHT = 1100;
    const SIDEBAR = 400;
    const BORDER_RADIUS = 30;
    const PRIMARY = '#ff9ff3'; // cute pink
    const SECONDARY = '#54a0ff'; // cute blue
    const ACCENT = '#ffeaa7'; // cute yellow
    const DARK_BG = '#ffeaa7'; // pastel yellow background

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // --- CUTE PASTEL BACKGROUND ---
    const backgroundGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    backgroundGradient.addColorStop(0, '#ffeaa7'); // soft yellow
    backgroundGradient.addColorStop(0.3, '#fab1a0'); // soft peach
    backgroundGradient.addColorStop(0.7, '#fd79a8'); // soft pink
    backgroundGradient.addColorStop(1, '#ffeaa7'); // soft yellow
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // cute cloud pattern overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let x = 0; x < WIDTH; x += 120) {
        for (let y = 0; y < HEIGHT; y += 120) {
            // draw cute cloud
            ctx.beginPath();
            ctx.arc(x, y, 25, 0, Math.PI * 2);
            ctx.arc(x + 20, y, 30, 0, Math.PI * 2);
            ctx.arc(x + 40, y, 25, 0, Math.PI * 2);
            ctx.arc(x + 20, y - 15, 20, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // cute heart pattern with more variety
    ctx.fillStyle = 'rgba(255, 182, 193, 0.25)';
    for (let x = 60; x < WIDTH; x += 160) {
        for (let y = 60; y < HEIGHT; y += 160) {
            // draw small hearts
            ctx.beginPath();
            ctx.arc(x - 8, y, 6, 0, Math.PI * 2);
            ctx.arc(x + 8, y, 6, 0, Math.PI * 2);
            const bottomY = y + 12;
            ctx.beginPath();
            ctx.moveTo(x - 12, y + 2);
            ctx.lineTo(x, bottomY);
            ctx.lineTo(x + 12, y + 2);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Add cute star pattern
    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
    for (let x = 120; x < WIDTH; x += 200) {
        for (let y = 120; y < HEIGHT; y += 200) {
            // draw small stars
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
                const outerX = x + Math.cos(angle) * 8;
                const outerY = y + Math.sin(angle) * 8;
                const innerAngle = angle + Math.PI / 5;
                const innerX = x + Math.cos(innerAngle) * 4;
                const innerY = y + Math.sin(innerAngle) * 4;

                if (i === 0) ctx.moveTo(outerX, outerY);
                else ctx.lineTo(outerX, outerY);
                ctx.lineTo(innerX, innerY);
            }
            ctx.closePath();
            ctx.fill();
        }
    }

    // --- CUTE SIDEBAR ---
    const sidebarGradient = ctx.createLinearGradient(0, 0, SIDEBAR, HEIGHT);
    sidebarGradient.addColorStop(0, '#a8e6cf'); // soft mint
    sidebarGradient.addColorStop(0.5, '#ffd3a5'); // soft peach
    sidebarGradient.addColorStop(1, '#ffaaa5'); // soft pink
    ctx.fillStyle = sidebarGradient;
    ctx.fillRect(0, 0, SIDEBAR, HEIGHT);

    // cute ribbon border with rainbow effect
    const rainbowColors = ['#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43', '#ee5a24'];
    rainbowColors.forEach((color, index) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(SIDEBAR - 6 - index * 2, 30 + index * 5, 2, HEIGHT - 60 - index * 10);
    });

    // Avatar with modern glow effect
    const avatarY = 200;
    const avatarRadius = 95;
    const avatarX = SIDEBAR / 2;

    // more cute sparkles around avatar
    const sparkles = [
        { x: avatarX - 120, y: avatarY - 50, size: 8, color: '#ffd700' },
        { x: avatarX + 110, y: avatarY - 40, size: 6, color: '#ff69b4' },
        { x: avatarX - 100, y: avatarY + 80, size: 7, color: '#00ffff' },
        { x: avatarX + 90, y: avatarY + 70, size: 5, color: '#ff1493' },
        { x: avatarX - 50, y: avatarY - 90, size: 6, color: '#ffff00' },
        { x: avatarX + 60, y: avatarY - 85, size: 8, color: '#ff4500' },
        { x: avatarX - 80, y: avatarY - 30, size: 5, color: '#ff1493' },
        { x: avatarX + 75, y: avatarY + 50, size: 6, color: '#ffd700' },
        { x: avatarX - 60, y: avatarY + 100, size: 4, color: '#00ffff' },
        { x: avatarX + 40, y: avatarY - 70, size: 7, color: '#ff69b4' }
    ];

    sparkles.forEach(sparkle => {
        ctx.fillStyle = sparkle.color;
        ctx.beginPath();
        ctx.arc(sparkle.x, sparkle.y, sparkle.size, 0, Math.PI * 2);
        ctx.fill();
        // sparkle rays
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const rayX = sparkle.x + Math.cos(angle) * (sparkle.size + 5);
            const rayY = sparkle.y + Math.sin(angle) * (sparkle.size + 5);
            ctx.beginPath();
            ctx.moveTo(sparkle.x, sparkle.y);
            ctx.lineTo(rayX, rayY);
            ctx.strokeStyle = sparkle.color;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });

    // cute flower crown above avatar
    ctx.fillStyle = '#ff69b4'; // hot pink
    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const flowerX = avatarX + Math.cos(angle) * (avatarRadius + 20);
        const flowerY = avatarY - avatarRadius - 10 + Math.sin(angle) * 15;
        // flower petals
        for (let p = 0; p < 5; p++) {
            const petalAngle = (p * Math.PI) / 2.5;
            const petalX = flowerX + Math.cos(petalAngle) * 8;
            const petalY = flowerY + Math.sin(petalAngle) * 8;
            ctx.beginPath();
            ctx.arc(petalX, petalY, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        // flower center
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(flowerX, flowerY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff69b4';
    }

    // soft glow effect
    const glow = ctx.createRadialGradient(avatarX, avatarY, avatarRadius, avatarX, avatarY, avatarRadius + 30);
    glow.addColorStop(0, 'rgba(255, 159, 243, 0.3)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 30, 0, Math.PI * 2);
    ctx.fill();

    let avatarBuffer = userAvatar ? await downloadImage(userAvatar) : null;
    if (avatarBuffer) {
        try {
            const image = await loadImage(avatarBuffer);
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(image, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
            ctx.restore();
        } catch {
            avatarBuffer = null;
        }
    }

    if (!avatarBuffer) {
        const fallbackGradient = ctx.createRadialGradient(avatarX - avatarRadius, avatarY - avatarRadius, 0, avatarX, avatarY, avatarRadius * 2);
        fallbackGradient.addColorStop(0, '#ffb8b1'); // soft pink
        fallbackGradient.addColorStop(0.7, '#ffd3a5'); // soft peach
        fallbackGradient.addColorStop(1, '#a8e6cf'); // soft mint
        ctx.fillStyle = fallbackGradient;
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 52px "Comic Sans MS", "Arial"';
        ctx.textAlign = 'center';
        ctx.fillText(userName.charAt(0).toUpperCase(), avatarX, avatarY + 20);
    }

    // cute border with hearts
    ctx.strokeStyle = '#ffb8b1';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 8, 0, Math.PI * 2);
    ctx.stroke();

    // small hearts around border
    ctx.fillStyle = '#ff69b4';
    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const heartX = avatarX + Math.cos(angle) * (avatarRadius + 25);
        const heartY = avatarY + Math.sin(angle) * (avatarRadius + 25);
        ctx.beginPath();
        ctx.arc(heartX - 3, heartY, 3, 0, Math.PI * 2);
        ctx.arc(heartX + 3, heartY, 3, 0, Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(heartX - 5, heartY + 1);
        ctx.lineTo(heartX, heartY + 8);
        ctx.lineTo(heartX + 5, heartY + 1);
        ctx.closePath();
        ctx.fill();
    }

    // Cute User info section with decorations
    ctx.fillStyle = '#ff69b4';
    ctx.textAlign = 'center';
    ctx.font = '700 22px "Comic Sans MS", "Arial"';
    ctx.fillText('🌸 CUTE DEVELOPER 🌸', avatarX, avatarY + 140);

    // Add cute floating decorations
    ctx.fillStyle = 'rgba(255, 182, 193, 0.7)';
    // Small floating hearts
    for (let i = 0; i < 6; i++) {
        const decoX = avatarX + Math.sin(i * Math.PI / 3) * 80;
        const decoY = avatarY + 160 + Math.cos(i * Math.PI / 3) * 30;
        ctx.beginPath();
        ctx.arc(decoX - 2, decoY, 3, 0, Math.PI * 2);
        ctx.arc(decoX + 2, decoY, 3, 0, Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(decoX - 4, decoY + 1);
        ctx.lineTo(decoX, decoY + 6);
        ctx.lineTo(decoX + 4, decoY + 1);
        ctx.closePath();
        ctx.fill();
    }

    ctx.fillStyle = '#ff1493';
    ctx.font = '900 34px "Comic Sans MS", "Arial"';
    const botName = (global?.config?.name_bot || 'Bonz Bot').toUpperCase();
    const nameLines = wrapLines(ctx, botName, SIDEBAR - 40);
    let nameY = avatarY + 185;
    nameLines.forEach(line => {
        ctx.fillText(line, avatarX, nameY);
        nameY += 40;
    });

    const signature = `💕 ${userName} 💕 ${moment().tz('Asia/Ho_Chi_Minh').format('MMM YYYY')} ✨`;
    ctx.fillStyle = '#ff69b4';
    ctx.font = '900 26px "Comic Sans MS", "Arial"';
    ctx.fillText(signature, avatarX, nameY + 15);

    // Add cute shadow effect for signature
    ctx.shadowColor = 'rgba(255, 105, 180, 0.6)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffb8b1';
    ctx.font = '900 26px "Comic Sans MS", "Arial"';
    ctx.fillText(signature, avatarX, nameY + 15);
    ctx.shadowBlur = 0;

    // Cute Brand footer
    ctx.fillStyle = '#ff69b4';
    ctx.font = '700 18px "Comic Sans MS", "Arial"';
    ctx.fillText('🌸 BonzBot 🌸', avatarX, HEIGHT - 160);

    ctx.fillStyle = '#ff1493';
    ctx.font = '700 16px "Comic Sans MS", "Arial"';
    ctx.fillText(`✨ #${String(userId || 'USER').slice(-6).toUpperCase()} ✨`, avatarX, HEIGHT - 130);

    // --- MAIN CONTENT ---
    const contentX = SIDEBAR + 80;
    const contentWidth = WIDTH - contentX - 80;

    const headerY = 180;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff69b4';
    ctx.font = '900 52px "Comic Sans MS", "Arial"';
    ctx.fillText(`🌸 MENU ${categoryName.toUpperCase()} 🌸`, contentX, headerY);

    // cute rainbow underline
    const titleGradient = ctx.createLinearGradient(contentX, headerY + 15, contentX + 400, headerY + 15);
    titleGradient.addColorStop(0, '#ff9ff3'); // pink
    titleGradient.addColorStop(0.2, '#54a0ff'); // blue
    titleGradient.addColorStop(0.4, '#5f27cd'); // purple
    titleGradient.addColorStop(0.6, '#00d2d3'); // cyan
    titleGradient.addColorStop(0.8, '#ff9f43'); // orange
    titleGradient.addColorStop(1, '#ee5a24'); // red
    ctx.fillStyle = titleGradient;
    ctx.fillRect(contentX, headerY + 15, 420, 6);

    // subtle glow effect
    ctx.shadowColor = 'rgba(99, 102, 241, 0.3)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
    ctx.fillRect(contentX - 10, headerY - 10, contentWidth + 20, 80);
    ctx.shadowBlur = 0;

    const secondaryLine = `🎀 TRANG ${pageIndex + 1}/${totalPages} 🎀 ${moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY • HH:mm')} 💕`;
    ctx.fillStyle = '#ff9ff3';
    ctx.font = '600 20px "Comic Sans MS", "Arial"';
    ctx.fillText(secondaryLine, contentX, headerY + 50);

    // decorate top-right with custom image if available
    try {
        const decorLocalPath = path.join(process.cwd(), 'assets', 'menu_decor.png');
        let decorImg = null;
        if (fs.existsSync(decorLocalPath)) {
            try {
                const buff = fs.readFileSync(decorLocalPath);
                decorImg = await loadImage(buff);
            } catch (e) { decorImg = null; }
        } else if (global?.config?.menu_decor_url) {
            try {
                const buff = await downloadImage(global.config.menu_decor_url);
                if (buff) decorImg = await loadImage(buff);
            } catch (e) { decorImg = null; }
        }
        if (decorImg) {
            const dw = 220;
            const dh = 220;
            const dx = contentX + contentWidth - dw;
            const dy = headerY - 40;
            ctx.save();
            ctx.globalAlpha = 0.95;
            // draw subtle rounded decor
            ctx.beginPath();
            roundRect(ctx, dx - 12, dy - 12, dw + 24, dh + 24, 24);
            ctx.fillStyle = 'rgba(255, 240, 250, 0.6)';
            ctx.fill();
            ctx.clip();
            ctx.drawImage(decorImg, dx, dy, dw, dh);
            ctx.restore();
        }
    } catch (e) {
        // ignore decor errors
    }

    const featureCards = commands.map((cmd, index) => ({
        index: startIndex + index + 1,
        title: cmd.toUpperCase(),
        status: 'ACTIVE',
        category: categoryName
    }));

    // Vertical layout - single column for better readability
    const columns = 1;
    const cardWidth = contentWidth - 60; // Better fit within frame
    const cardHeight = 100; // Taller cards for vertical layout
    const cardSpacing = 18; // Optimized space between cards
    let cardY = headerY + 120;

    featureCards.forEach(({ index, title, status }, idx) => {
        const x = contentX + 30; // Better centering and frame fit
        const y = cardY + idx * (cardHeight + cardSpacing);

        // cute vertical card with pastel theme and decorations
        const cardColors = [
            ['#ffd3a5', '#ffb8b1'], // peach to pink
            ['#a8e6cf', '#ffd3a5'], // mint to peach
            ['#ffaaa5', '#a8e6cf'], // pink to mint
            ['#ffb8b1', '#ffaaa5'], // pink variations
            ['#ffd3a5', '#ffaaa5'], // peach to pink
            ['#a8e6cf', '#ffb8b1']  // mint to pink
        ];
        const colorIndex = idx % cardColors.length;
        const cardGradient = ctx.createLinearGradient(x, y, x, y + cardHeight);
        cardGradient.addColorStop(0, cardColors[colorIndex][0]);
        cardGradient.addColorStop(1, cardColors[colorIndex][1]);
        roundRect(ctx, x, y, cardWidth, cardHeight, BORDER_RADIUS);
        ctx.fillStyle = cardGradient;
        ctx.fill();

        // cute ribbon border with sparkle effect
        ctx.strokeStyle = '#ffb8b1';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Add small sparkles on card corners
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(x + 10, y + 10, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + cardWidth - 10, y + 10, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 10, y + cardHeight - 10, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + cardWidth - 10, y + cardHeight - 10, 3, 0, Math.PI * 2);
        ctx.fill();

        // cute vertical accent with hearts
        ctx.fillStyle = '#ff69b4';
        for (let h = 0; h < 5; h++) {
            const heartY = y + 25 + h * 18;
            ctx.beginPath();
            ctx.arc(x + 18, heartY, 3, 0, Math.PI * 2);
            ctx.arc(x + 26, heartY, 3, 0, Math.PI * 2);
            ctx.beginPath();
            ctx.moveTo(x + 14, heartY + 1);
            ctx.lineTo(x + 22, heartY + 8);
            ctx.lineTo(x + 30, heartY + 1);
            ctx.closePath();
            ctx.fill();
        }

        // command number in a cute star
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        const starCenterX = x + 65;
        const starCenterY = y + cardHeight / 2;
        const outerRadius = 20;
        const innerRadius = 10;
        for (let i = 0; i < 10; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            const pointX = starCenterX + Math.cos(angle) * radius;
            const pointY = starCenterY + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(pointX, pointY);
            else ctx.lineTo(pointX, pointY);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ff4500';
        ctx.font = '700 14px "Comic Sans MS", "Arial"';
        ctx.textAlign = 'center';
        ctx.fillText(String(index).padStart(2, '0'), starCenterX, starCenterY + 5);

        // command title with cute typography - centered vertically
        ctx.textAlign = 'left';
        ctx.fillStyle = '#8b4513';
        ctx.font = '900 26px "Comic Sans MS", "Arial"';
        const trimmedTitle = title.length > 35 ? `${title.slice(0, 35)}…` : title;

        // cute text shadow
        ctx.shadowColor = 'rgba(255, 182, 193, 0.8)';
        ctx.shadowBlur = 6;
        ctx.fillText(trimmedTitle, x + 120, y + cardHeight / 2 + 8);
        ctx.shadowBlur = 0;

        // cute status indicator with emoji
        ctx.fillStyle = '#ff1493';
        ctx.font = '600 16px "Arial"';
        ctx.textAlign = 'right';
        ctx.fillText('✨ ACTIVE ✨', x + cardWidth - 40, y + cardHeight / 2 + 5);

        // cute inner decoration
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        for (let d = 0; d < 3; d++) {
            ctx.beginPath();
            ctx.arc(x + cardWidth - 50 - d * 15, y + 20 + d * 8, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // cute footer with pastel background and lots of decorations
    const footerGradient = ctx.createLinearGradient(contentX, HEIGHT - 80, contentX + contentWidth, HEIGHT - 80);
    footerGradient.addColorStop(0, 'rgba(255, 182, 193, 0.8)');
    footerGradient.addColorStop(0.3, 'rgba(255, 159, 243, 0.7)');
    footerGradient.addColorStop(0.7, 'rgba(173, 216, 230, 0.8)');
    footerGradient.addColorStop(1, 'rgba(255, 182, 193, 0.8)');
    ctx.fillStyle = footerGradient;
    roundRect(ctx, contentX, HEIGHT - 90, contentWidth, 50, 20);
    ctx.fill();

    ctx.strokeStyle = '#ffb8b1';
    ctx.lineWidth = 4;
    ctx.stroke();

    // lots of cute decorations in footer
    ctx.fillStyle = '#ff69b4';
    for (let i = 0; i < 8; i++) {
        const decoX = contentX + 30 + i * 120;
        const decoY = HEIGHT - 65;
        // variety of decorations
        if (i % 4 === 0) {
            // hearts
            ctx.beginPath();
            ctx.arc(decoX - 3, decoY, 4, 0, Math.PI * 2);
            ctx.arc(decoX + 3, decoY, 4, 0, Math.PI * 2);
            ctx.beginPath();
            ctx.moveTo(decoX - 6, decoY + 1);
            ctx.lineTo(decoX, decoY + 10);
            ctx.lineTo(decoX + 6, decoY + 1);
            ctx.closePath();
            ctx.fill();
        } else if (i % 4 === 1) {
            // stars
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            for (let s = 0; s < 5; s++) {
                const angle = (s * Math.PI * 2) / 5 - Math.PI / 2;
                const starX = decoX + Math.cos(angle) * 5;
                const starY = decoY + Math.sin(angle) * 5;
                if (s === 0) ctx.moveTo(starX, starY);
                else ctx.lineTo(starX, starY);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ff69b4';
        } else if (i % 4 === 2) {
            // flowers
            ctx.fillStyle = '#ffb8b1';
            for (let p = 0; p < 5; p++) {
                const petalAngle = (p * Math.PI) / 2.5;
                const petalX = decoX + Math.cos(petalAngle) * 4;
                const petalY = decoY + Math.sin(petalAngle) * 4;
                ctx.beginPath();
                ctx.arc(petalX, petalY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(decoX, decoY, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff69b4';
        } else {
            // sparkles
            ctx.fillStyle = '#00ffff';
            ctx.beginPath();
            ctx.arc(decoX, decoY, 3, 0, Math.PI * 2);
            ctx.fill();
            for (let r = 0; r < 6; r++) {
                const rayAngle = (r * Math.PI) / 3;
                const rayX = decoX + Math.cos(rayAngle) * 6;
                const rayY = decoY + Math.sin(rayAngle) * 6;
                ctx.beginPath();
                ctx.moveTo(decoX, decoY);
                ctx.lineTo(rayX, rayY);
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.strokeStyle = '#ffb8b1';
            ctx.fillStyle = '#ff69b4';
        }
    }


    return canvas.toBuffer('image/png');
}

async function createSummaryMenuImage({
    userName = 'User',
    userAvatar = null,
    userId = null
}) {
    const WIDTH = 1400;
    const HEIGHT = 1100;
    const SIDEBAR = 400;
    const BORDER_RADIUS = 25;
    const PRIMARY = '#6366f1';
    const SECONDARY = '#8b5cf6';

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Modern dark background
    const backgroundGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    backgroundGradient.addColorStop(0, '#0f0f23');
    backgroundGradient.addColorStop(0.3, '#16162e');
    backgroundGradient.addColorStop(0.7, '#1a1a35');
    backgroundGradient.addColorStop(1, '#0f0f23');
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Geometric pattern
    ctx.fillStyle = 'rgba(99, 102, 241, 0.03)';
    for (let x = 0; x < WIDTH; x += 60) {
        for (let y = 0; y < HEIGHT; y += 60) {
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Sidebar with modern gradient
    const sidebarGradient = ctx.createLinearGradient(0, 0, SIDEBAR, HEIGHT);
    sidebarGradient.addColorStop(0, '#1e1e2e');
    sidebarGradient.addColorStop(0.5, '#2a2a4e');
    sidebarGradient.addColorStop(1, '#16162e');
    ctx.fillStyle = sidebarGradient;
    ctx.fillRect(0, 0, SIDEBAR, HEIGHT);

    // Glowing border
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(SIDEBAR - 3, 40, 3, HEIGHT - 80);

    const avatarY = 200;
    const avatarRadius = 95;
    const avatarX = SIDEBAR / 2;

    // Multiple glow layers
    const glows = [
        { radius: 140, alpha: 0.1 },
        { radius: 120, alpha: 0.15 },
        { radius: 100, alpha: 0.2 }
    ];

    glows.forEach(({ radius, alpha }) => {
        const glow = ctx.createRadialGradient(avatarX, avatarY, avatarRadius, avatarX, avatarY, radius);
        glow.addColorStop(0, `rgba(99, 102, 241, ${alpha})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, radius, 0, Math.PI * 2);
        ctx.fill();
    });

    let avatarBuffer = userAvatar ? await downloadImage(userAvatar) : null;
    if (avatarBuffer) {
        try {
            const image = await loadImage(avatarBuffer);
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(image, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
            ctx.restore();
        } catch {
            avatarBuffer = null;
        }
    }

    if (!avatarBuffer) {
        const fallbackGradient = ctx.createRadialGradient(avatarX - avatarRadius, avatarY - avatarRadius, 0, avatarX, avatarY, avatarRadius * 2);
        fallbackGradient.addColorStop(0, PRIMARY);
        fallbackGradient.addColorStop(0.7, SECONDARY);
        fallbackGradient.addColorStop(1, '#4c1d95');
        ctx.fillStyle = fallbackGradient;
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 52px "Montserrat", "Arial"';
        ctx.textAlign = 'center';
        ctx.fillText(userName.charAt(0).toUpperCase(), avatarX, avatarY + 20);
    }

    // Modern border and highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius - 2, -Math.PI/4, Math.PI/4);
    ctx.stroke();

    // User info section
    ctx.fillStyle = '#6366f1';
    ctx.textAlign = 'center';
    ctx.font = '700 18px "Montserrat", "Arial"';
    ctx.fillText('👨‍💻 DEVELOPER', avatarX, avatarY + 140);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px "Montserrat", "Arial"';
    const botName = (global?.config?.name_bot || 'Bonz Bot').toUpperCase();
    const nameLines = wrapLines(ctx, botName, SIDEBAR - 40);
    let nameY = avatarY + 185;
    nameLines.forEach(line => {
        ctx.fillText(line, avatarX, nameY);
        nameY += 42;
    });

    const signature = `${userName.toUpperCase()} • ${moment().tz('Asia/Ho_Chi_Minh').format('MMM YYYY').toUpperCase()}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '600 14px "Montserrat", "Arial"';
    ctx.fillText(signature, avatarX, nameY + 10);

    // Cute Brand footer
    ctx.fillStyle = '#ff69b4';
    ctx.font = '700 16px "Comic Sans MS", "Arial"';
    ctx.fillText('🌈 BONZ BOT 🌈', avatarX, HEIGHT - 180);
    ctx.fillStyle = '#ffb8b1';
    ctx.font = '800 18px "Comic Sans MS", "Arial"';
    ctx.fillText('CUTE EDITION 💕', avatarX, HEIGHT - 155);

    ctx.fillStyle = '#ff1493';
    ctx.font = '700 16px "Comic Sans MS", "Arial"';
    ctx.fillText(`✨ #${String(userId || 'USER').slice(-6).toUpperCase()} ✨`, avatarX, HEIGHT - 125);

    const contentX = SIDEBAR + 80;
    const contentWidth = WIDTH - contentX - 80;
    const headerY = 180;

    ctx.textAlign = 'left';
    ctx.fillStyle = PRIMARY;
    ctx.font = '900 56px "Montserrat", "Arial"';
    ctx.fillText('MENU TỔNG QUAN', contentX, headerY);

    // Modern gradient underline
    const titleGradient = ctx.createLinearGradient(contentX, headerY + 15, contentX + 350, headerY + 15);
    titleGradient.addColorStop(0, PRIMARY);
    titleGradient.addColorStop(1, SECONDARY);
    ctx.fillStyle = titleGradient;
    ctx.fillRect(contentX, headerY + 15, 370, 4);

    // Subtle glow effect
    ctx.shadowColor = 'rgba(99, 102, 241, 0.3)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
    ctx.fillRect(contentX - 10, headerY - 10, contentWidth + 20, 80);
    ctx.shadowBlur = 0;

    const instructions = [
        '🎮 games: liệt kê toàn bộ trò chơi có thể chơi.',
        '⚔️ menuwar: xem danh sách war có thể dùng.',
        '👑 madmin: xem lệnh admin bot (cần quyền).',
        '📄 menu + số (vd: menu 2): menu thường cho mọi người.'
    ];

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '600 22px "Montserrat", "Arial"';
    const instructionsStartY = headerY + 80;
    instructions.forEach((line, idx) => {
        ctx.fillText(line, contentX, instructionsStartY + idx * 36);
    });

    const sections = [
        {
            title: '🎮 GAMES',
            trigger: 'games',
            description: 'Các trò chơi có thể chơi:',
            commands: COMMAND_CATEGORIES.games,
            color: '#10b981'
        },
        {
            title: '⚔️ WAR',
            trigger: 'menuwar',
            description: 'Danh sách war có thể dùng:',
            commands: COMMAND_CATEGORIES.war,
            color: '#f59e0b'
        },
        {
            title: '👑 ADMIN',
            trigger: 'madmin',
            description: 'Các lệnh admin bot (cần quyền):',
            commands: COMMAND_CATEGORIES.admin,
            color: '#ef4444'
        },
        {
            title: '📄 MENU + SỐ',
            trigger: 'menu + số',
            description: 'Menu thường cho mọi thành viên. Ví dụ: menu 2, menu 3.',
            commands: [],
            color: PRIMARY
        }
    ];

    const cardPadding = 35;
    const cardWidth = contentWidth;
    let cardY = instructionsStartY + instructions.length * 36 + 60;

    sections.forEach(section => {
        ctx.font = '600 20px "Montserrat", "Arial"';
        const commandsText = section.commands.join(', ');
        const commandLines = commandsText ? wrapLines(ctx, commandsText, cardWidth - cardPadding * 2) : [];
        const baseHeight = section.commands.length ? 170 : 150;
        const cardHeight = baseHeight + commandLines.length * 30;

        // Modern dark card
        const cardGradient = ctx.createLinearGradient(contentX, cardY, contentX, cardY + cardHeight);
        cardGradient.addColorStop(0, 'rgba(30, 30, 46, 0.95)');
        cardGradient.addColorStop(0.5, 'rgba(42, 42, 78, 0.9)');
        cardGradient.addColorStop(1, 'rgba(26, 26, 53, 0.95)');

        roundRect(ctx, contentX, cardY, cardWidth, cardHeight, BORDER_RADIUS);
        ctx.fillStyle = cardGradient;
        ctx.fill();

        // Glowing border with section color
        ctx.strokeStyle = section.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Accent line
        ctx.strokeStyle = section.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(contentX + 30, cardY + 25);
        ctx.lineTo(contentX + 30, cardY + cardHeight - 25);
        ctx.stroke();

        let textY = cardY + cardPadding;

        ctx.fillStyle = section.color;
        ctx.font = '900 38px "Montserrat", "Arial"';
        ctx.fillText(section.title, contentX + cardPadding + 10, textY + 35);
        textY += 70;

        ctx.fillStyle = '#10b981';
        ctx.font = '700 22px "Montserrat", "Arial"';
        ctx.fillText(`Gõ: ${section.trigger}`, contentX + cardPadding, textY);
        textY += 38;

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '600 22px "Montserrat", "Arial"';
        ctx.fillText(section.description, contentX + cardPadding, textY);
        textY += 38;

        if (commandLines.length) {
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.font = '600 20px "Montserrat", "Arial"';
            commandLines.forEach(line => {
                ctx.fillText(`• ${line}`, contentX + cardPadding, textY);
                textY += 30;
            });
        }

        cardY += cardHeight + 35;
    });

    const totalCommands = allCommands.length;

    // Modern footer with gradient background
    const footerGradient = ctx.createLinearGradient(contentX, HEIGHT - 90, contentX + contentWidth, HEIGHT - 90);
    footerGradient.addColorStop(0, 'rgba(30, 30, 46, 0.8)');
    footerGradient.addColorStop(1, 'rgba(42, 42, 78, 0.6)');
    ctx.fillStyle = footerGradient;
    roundRect(ctx, contentX, HEIGHT - 100, contentWidth, 60, 15);
    ctx.fill();

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 20px "Montserrat", "Arial"';
    ctx.textAlign = 'center';
    ctx.fillText(`📊 Tổng số lệnh: ${totalCommands}`, contentX + contentWidth / 2, HEIGHT - 65);

    return canvas.toBuffer('image/png');
}

module.exports.run = async ({ api, event, args }) => {
    const { threadId, type, data } = event;
    const senderId = data?.uidFrom || event?.authorId;

    // Lấy argument đầu tiên
    const firstArg = (args?.[0] || '').toLowerCase().trim();

    if (!firstArg) {
        return api.sendMessage(
            '📖 MENU HƯỚNG DẪN\n\n' +
            '• menu tổng → Xem menu tổng quan (ảnh)\n' +
            '• games → Chỉ xem các lệnh game\n' +
            '• menuwar → Xem danh sách lệnh war\n' +
            '• madmin → Mở menu admin (cần quyền)\n' +
            '• menu + số (vd: menu 2) → Xem trang cụ thể của menu chính\n',
            threadId,
            type
        );
    }

    // Xử lý menu admin
    if (firstArg === 'madmin') {
        const uid = String(senderId);
        const config = global.config || {};
        const admins = [].concat(config.admin_bot || []).map(String);
        const owners = [].concat(config.owner_bot || []).map(String);
        if (!owners.includes(uid) && !admins.includes(uid)) {

            return api.sendMessage('❌ Bạn không có quyền mở menu admin.', threadId, type);
        }
        return menuAdminModule.run({ api, event });
    }

    try {
        let userName = 'User';
        let userAvatar = null;

        try {
            const info = await api.getUserInfo(senderId);
            const u = info?.changed_profiles?.[senderId] || info?.[senderId];
            if (u) {
                userName = u.displayName || u.name || 'User';
                userAvatar = u.avatar;
            }
        } catch (e) {
            console.log('[MENU] Lỗi lấy info user:', e?.message || e);
        }

        // Xác định category và commands
        let categoryName = 'ALL';
        let commandList = allCommands;
        let requestedPage = null;
        let showSummary = false;

        if (firstArg === 'tổng' || firstArg === 'tong') {
            showSummary = true;
            categoryName = 'SUMMARY';
        } else if (firstArg === 'all') {
            categoryName = 'ALL';
            commandList = allCommands;
        } else if (firstArg === 'games' || firstArg === 'game') {
            categoryName = 'GAMES';
            commandList = COMMAND_CATEGORIES.games;
        } else if (firstArg === 'menuwar') {
            categoryName = 'WAR';
            commandList = COMMAND_CATEGORIES.war;
        } else if (firstArg && !isNaN(parseInt(firstArg))) {

            // Nếu là số thì xem như page number
            requestedPage = parseInt(firstArg);

            categoryName = 'ALL';
            commandList = allCommands;
        }

        if (showSummary) {
            const buffer = await createSummaryMenuImage({
                userName,
                userAvatar,
                userId: senderId
            });

            const tempDir = path.join(__dirname, '../../temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const timestamp = Date.now();
            const filePath = path.join(tempDir, `menu_summary_${timestamp}.png`);
            fs.writeFileSync(filePath, buffer);

            await api.sendMessage({
                msg: `📋 Menu tổng quan (${allCommands.length} lệnh)\n⏱️ Tự xóa sau ${AUTO_DELETE_TIME/1000}s`,
                attachments: [filePath],
                ttl: AUTO_DELETE_TIME
            }, threadId, type);

            await reactMenu(api, event, threadId, type);

            setTimeout(() => {
                try { fs.existsSync(filePath) && fs.unlinkSync(filePath); } catch {}
            }, AUTO_DELETE_TIME);

            return;
        }

        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil(commandList.length / pageSize));

        if (requestedPage !== null) {
            if (requestedPage < 1 || requestedPage > totalPages) {
                return api.sendMessage(
                    `❌ Không tìm thấy trang ${requestedPage}. Chọn từ 1 đến ${totalPages}.`,
                    threadId,
                    type
                );
            }
        }

        const buffers = [];
        const pagesToRender = requestedPage ? [requestedPage - 1] : Array.from({ length: totalPages }, (_, i) => i);

        for (const pageIndex of pagesToRender) {
            const startIndex = pageIndex * pageSize;
            const commands = commandList.slice(startIndex, startIndex + pageSize);
            if (!commands.length) continue;

        const buffer = await createMenuImage({
                userName,
                userAvatar,
                userId: senderId,
                commands,
                pageIndex,
                totalPages,
            pageSize,
                startIndex,
                categoryName
            });
            buffers.push({ buffer, pageIndex });
        }

        if (buffers.length === 0) {
            return api.sendMessage('❌ Không có dữ liệu để hiển thị menu.', threadId, type);
        }

        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const timestamp = Date.now();

        const attachments = buffers.map(({ buffer, pageIndex }) => {
            const filePath = path.join(tempDir, `menu_${timestamp}_${pageIndex + 1}.png`);
            fs.writeFileSync(filePath, buffer);
            return filePath;
        });

        let baseMsg;
        const selectionHint = '\n➡️ Gõ số bất kỳ trong danh sách hoặc reply vào ảnh menu bằng số để xem chi tiết lệnh bạn muốn.\n➡️ Hoặc reply "menu <số>" để xem trang cụ thể.\n⏱️ Lựa chọn có hiệu lực trong 2 phút.';

        if (requestedPage) {
            baseMsg = `📋 Menu ${categoryName} - Trang ${requestedPage}/${totalPages}\n⏱️ Tự xóa sau ${AUTO_DELETE_TIME/1000}s${selectionHint}`;
        } else {
            baseMsg = `📋 Menu ${categoryName} (${totalPages} trang)\n⏱️ Tự xóa sau ${AUTO_DELETE_TIME/1000}s\n➡️ Dùng "menu <số>" để xem từng trang cụ thể.${selectionHint}`;
        }

        const sendResult = await api.sendMessage({
            msg: baseMsg,
            attachments,
            ttl: AUTO_DELETE_TIME
        }, threadId, type);

        await reactMenu(api, event, threadId, type);

        if (sendResult) {
            const keys = [];
            const collectKeys = (payload) => {
                if (!payload || typeof payload !== 'object') return;
                ['globalMsgId', 'msgId', 'cliMsgId', 'messageId'].forEach((prop) => {
                    if (payload[prop]) keys.push(String(payload[prop]));
                });
            };

            collectKeys(sendResult.message);
            if (Array.isArray(sendResult.messages)) {
                sendResult.messages.forEach(collectKeys);
            }
            if (Array.isArray(sendResult.attachment)) {
                sendResult.attachment.forEach(collectKeys);
            }

            if (keys.length) {
                __storeMenuSelection(keys, {
                    threadId,
                    senderId,
                    categoryName,
                    commandList,
                    pageSize,
                    totalPages,
                    requestedPage,
                    messageText: baseMsg,
                    type
                });
            }
        }

        setTimeout(() => {
            attachments.forEach(filePath => {
                try { fs.existsSync(filePath) && fs.unlinkSync(filePath); } catch {}
            });
        }, AUTO_DELETE_TIME);

    } catch (err) {
        console.error('[MENU]', err);
        let fb = '🤖 BONZ BOT MENU\n\n';
        allCommands.forEach(c => fb += `• ${c}\n`);
        return api.sendMessage(fb, threadId, type);
    }
};

async function __sendMenuCommandDetail(api, event, selection, index) {
    const { threadId, type, data, messageID } = event;
    if (!selection || !Array.isArray(selection.commandList)) return false;

    if (!Number.isFinite(index) || index < 1 || index > selection.commandList.length) {
        await api.sendMessage(`❌ Không tìm thấy mục số ${index}. Hãy chọn từ 1-${selection.commandList.length}.`, threadId, type);
        return true;
    }

    const rawCommand = selection.commandList[index - 1];
    const commandText = typeof rawCommand === 'string' ? rawCommand : (rawCommand?.name || String(rawCommand || ''));
    const normalized = commandText.trim();
    const commandInfo = __resolveMenuCommandInfo(normalized);

    const lines = [
        `📄 Chi tiết lệnh #${index}`,
        `• Hiển thị: ${normalized}`
    ];

    if (commandInfo) {
        if (commandInfo.name && commandInfo.name !== normalized) {
            lines.push(`• Lệnh chính: ${commandInfo.name}`);
        }
        if (Array.isArray(commandInfo.aliases) && commandInfo.aliases.length) {
            lines.push(`• Alias: ${commandInfo.aliases.join(', ')}`);
        }
        if (commandInfo.description) {
            lines.push('• Mô tả: ' + commandInfo.description);
        }
        if (commandInfo.usage) {
            lines.push('• Cách dùng: ' + commandInfo.usage);
        }
        if (commandInfo.roleDescription) {
            lines.push('• Quyền dùng: ' + commandInfo.roleDescription);
        }
        if (commandInfo.cooldowns !== undefined) {
            const cd = Number(commandInfo.cooldowns);
            if (Number.isFinite(cd)) {
                lines.push(`• Cooldown: ${cd}s`);
            }
        }
        if (commandInfo.author) {
            lines.push('• Tác giả: ' + commandInfo.author);
        }
    } else {
        lines.push('• Không tìm thấy metadata cho lệnh này trong hệ thống.');
    }

    lines.push('');
    lines.push('👉 Thử ngay: ' + (commandInfo?.usage || normalized));

    if (messageID && typeof api.setMessageReaction === 'function') {
        try {
            await api.setMessageReaction('💗', messageID, threadId, true);
        } catch (reactionErr) {
            console.warn('[menu] Không thể thả tim:', reactionErr?.message || reactionErr);
        }
    }

    await api.sendMessage({
        msg: lines.join('\n'),
        ttl: MENU_SELECTION_TTL
    }, threadId, type);

    return true;
}

module.exports.handleEvent = async ({ eventType, event, api }) => {
    if (eventType !== 'message') return false;
    const { threadId, data } = event || {};
    const senderId = data?.uidFrom || event?.authorId;
    if (!threadId || !senderId) return false;

    const content = String(data?.message ?? data?.content ?? '').trim();
    if (!/^\d+$/.test(content)) {
        const quote = data?.quote;
        if (!quote) return false;
        const numeric = String(data?.message ?? data?.content ?? '').replace(/[^0-9]/g, '').trim();
        if (!numeric) return false;
        if (!/^\d+$/.test(numeric)) return false;
        const selectionFromQuote =
            __getMenuSelectionByMessageKey(quote.globalMsgId) ||
            __getMenuSelectionByMessageKey(quote.messageId) ||
            __getMenuSelectionByMessageKey(quote.msgId) ||
            __getMenuSelectionByMessageKey(quote.cliMsgId);
        if (!selectionFromQuote || String(selectionFromQuote.senderId) !== String(senderId)) return false;
        const index = parseInt(numeric, 10);
        return __sendMenuCommandDetail(api, event, selectionFromQuote, index);
    }

    const index = parseInt(content, 10);
    const selection = __getMenuSelectionBySender(senderId, threadId);
    if (!selection) {
        const quote = data?.quote;
        if (!quote) return false;
        const selectionFromQuote =
            __getMenuSelectionByMessageKey(quote.globalMsgId) ||
            __getMenuSelectionByMessageKey(quote.messageId) ||
            __getMenuSelectionByMessageKey(quote.msgId) ||
            __getMenuSelectionByMessageKey(quote.cliMsgId);
        if (!selectionFromQuote || String(selectionFromQuote.senderId) !== String(senderId)) return false;
        return __sendMenuCommandDetail(api, event, selectionFromQuote, index);
    }

    return __sendMenuCommandDetail(api, event, selection, index);
};