const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const moment = require("moment-timezone");
const crypto = require('crypto');
const { Reactions } = require('zca-js');

const AUTO_DELETE_TIME = 60000;

module.exports.config = {
    name: "games",
    aliases: ['game', 'bonzgames'],
    version: "1.0.0",
    role: 0,
    author: "Cascade Enhanced",
    description: "Menu game center với giao diện đẹp",
    category: "Game",
    usage: "games [category|page]",
    cooldowns: 3,
    dependencies: { "canvas": "", "moment-timezone": "" }
};

const MENU_REACTIONS = [
    Reactions.HEART, Reactions.LIKE, Reactions.WOW, Reactions.SUN,
    Reactions.HANDCLAP, Reactions.COOL, Reactions.OK, Reactions.ROSE
];

async function reactMenu(api, event, threadId, type) {
    if (typeof api.addReaction !== 'function' || !event?.data?.msgId) return;
    const target = { data: { msgId: event.data.msgId, cliMsgId: event.data.cliMsgId }, threadId, type };
    try { await api.addReaction(Reactions.NONE, target); } catch {}
    for (const r of MENU_REACTIONS) {
        try { await api.addReaction(r, target); } catch {}
    }
}

const GAME_CATEGORIES = {
    farm: {
        icon: '🌾',
        name: 'FARM GAME',
        desc: 'Nông trại ảo: trồng trọt, chăn nuôi, xây dựng',
        games: [
            { cmd: 'game farm', desc: '🚜 Hệ thống nông trại hoàn chỉnh với thời tiết & mùa' },
            { cmd: 'game farm create <tên>', desc: '🌱 Tạo nông trại mới' }
        ]
    },
    mini: {
        icon: '🎯',
        name: 'MINI GAMES',
        desc: 'Trò chơi giải trí nhẹ nhàng',
        games: [
            { cmd: 'bonz guess start', desc: '🎲 Đoán số 1-100 trong 7 lần thử, bonus thời gian' },
            { cmd: 'bonz rps kéo 1000', desc: '✂️ Kéo búa bao với cược coins' },
            { cmd: 'thathaythach', desc: '🎪 Thật hay thách (canvas cute) - reply 1/2' },
            { cmd: 'bonz war start 5000', desc: '🃏 Chiến tranh bài - so sánh bài' },
            { cmd: 'bonz dice [số]', desc: '🎲 Xúc xắc may mắn' }
        ]
    },
    casino: {
        icon: '🎰',
        name: 'CASINO GAMES',
        desc: 'Sòng bạc với cược coins thật',
        games: [
            { cmd: 'taixiu bet tai 10000', desc: '🎲 Tài xỉu cổ điển' },
            { cmd: 'bonz blackjack start 10000', desc: '🃏 Xì dách 21 điểm với dealer AI' },
            { cmd: 'bonz baccarat bet player 10000', desc: '💳 Baccarat casino - Player/Banker/Tie' },
            { cmd: 'baucua bet bau:5000 cua:3000', desc: '🎲 Bầu cua tôm cá - 6 con vật' },
            { cmd: 'bonz poker join 10000', desc: '🎰 Poker Texas Hold\'em multiplayer' },
            { cmd: 'roulette bet red 5000', desc: '🎡 Roulette vòng quay' }
        ]
    },
    rpg: {
        icon: '⚔️',
        name: 'RPG & BATTLE',
        desc: 'Nhập vai và chiến đấu',
        games: [
            { cmd: 'bonz arena fight', desc: '🏟️ Đấu trường RPG - Level up, 4 khu vực, 12 loại quái' },
            { cmd: 'bonz monster hunt 2000', desc: '👹 Săn quái vật - 12 loại, 3 độ hiếm, bet tăng sức mạnh' },
            { cmd: 'bonz pvp challenge @user 10000', desc: '⚔️ Đấu tay đôi PvP với battle system' }
        ]
    },
    fishing: {
        icon: '🎣',
        name: 'FISHING GAME',
        desc: 'Câu cá RPG với 100+ items và nhiều khu vực',
        games: [
            { cmd: 'fishing cast', desc: '🎣 Thả cần câu - 4 loại cá (30s cooldown)' },
            { cmd: 'fishing stats', desc: '📊 Xem thống kê và level' },
            { cmd: 'fishing inventory', desc: '🎒 Xem túi đồ và cá đã câu' },
            { cmd: 'fishing shop <trang>', desc: '🏪 Shop 100+ items (cần câu, mồi, khu vực)' },
            { cmd: 'fishing buy <số>', desc: '💰 Mua đồ từ shop' },
            { cmd: 'fishing sell <tên_cá>', desc: '💵 Bán cá (all/1 con/theo tên)' },
            { cmd: 'fishing cần <số>', desc: '🎣 Chọn cần câu' },
            { cmd: 'fishing bait <số>', desc: '🪱 Chọn mồi câu' },
            { cmd: 'fishing goto <số>', desc: '🗺️ Di chuyển khu vực câu' },
            { cmd: 'fishing areas <trang>', desc: '🌊 Xem danh sách khu vực' },
            { cmd: 'fishing help <1-3>', desc: '📖 Hướng dẫn 3 trang' },
            { cmd: 'fishing boss', desc: '👹 Boss raid tổ đội' }
        ]
    },
    pet: {
        icon: '🐾',
        name: 'PET SYSTEM',
        desc: 'Nuôi thú cưng và huấn luyện',
        games: [
            { cmd: 'pet create <loài>', desc: '🐶 Tạo thú cưng (dragon/phoenix/tiger/wolf)' },
            { cmd: 'pet stats', desc: '📊 Xem hồ sơ pet' },
            { cmd: 'pet feed', desc: '🍖 Cho ăn (tăng EXP)' },
            { cmd: 'pet train <atk|def|spd|luck>', desc: '💪 Huấn luyện (tốn coins)' },
            { cmd: 'pet quest', desc: '🎯 Làm nhiệm vụ' },
            { cmd: 'pet battle @user', desc: '⚔️ Thách đấu PvP' }
        ]
    },
    puzzle: {
        icon: '🧩',
        name: 'PUZZLE GAMES',
        desc: 'Trò chơi trí tuệ',
        games: [
            { cmd: 'caro start', desc: '🎲 Cờ caro 3x3 với AI thông minh' },
            { cmd: 'doantu', desc: '🧩 Đoán từ (canvas) - reply đáp án' },
            { cmd: 'bonz sudoku start easy', desc: '🔢 Sudoku 9x9 - 3 độ khó (easy/medium/hard)' },
            { cmd: 'bonz câu đố start', desc: '🧩 Câu đố kiến thức' },
            { cmd: 'bonz trắc start', desc: '📝 Trắc nghiệm A/B/C/D' }
        ]
    },
    social: {
        icon: '👥',
        name: 'SOCIAL GAMES',
        desc: 'Chơi nhiều người',
        games: [
            { cmd: 'bonz mafia start', desc: '🐺 Ma sói - Social deduction với voting system' },
            { cmd: 'bonz monopoly start', desc: '🏠 Cờ tỷ phú - Mua bán bất động sản' }
        ]
    }
};

async function downloadImage(url) {
    if (!url) return null;
    try {
        const axios = require('axios');
        const res = await axios.get(url, { 
            responseType: 'arraybuffer', 
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return res.data?.length > 500 ? Buffer.from(res.data) : null;
    } catch (e) {
        console.log('[GAMES] Lỗi tải ảnh:', e.message);
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

async function createGamesMenuImage({
    userName = 'User',
    userAvatar = null,
    userId = null,
    categoryKey = null
}) {
    const WIDTH = 1380;
    const HEIGHT = 1400;
    const SIDEBAR = 380;
    const BORDER_RADIUS = 20;
    const PRIMARY = '#ff3158';
    const ACCENT = '#00d4ff';

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bgGradient.addColorStop(0, '#0a0a12');
    bgGradient.addColorStop(0.5, '#0f0f1a');
    bgGradient.addColorStop(1, '#08080e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Pattern dots
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (let x = 0; x < WIDTH; x += 40) {
        for (let y = 0; y < HEIGHT; y += 40) {
            ctx.fillRect(x, y, 16, 16);
        }
    }

    // Sidebar
    const sidebarGrad = ctx.createLinearGradient(0, 0, SIDEBAR, HEIGHT);
    sidebarGrad.addColorStop(0, '#11111d');
    sidebarGrad.addColorStop(0.5, '#151522');
    sidebarGrad.addColorStop(1, '#0d0d16');
    ctx.fillStyle = sidebarGrad;
    ctx.fillRect(0, 0, SIDEBAR, HEIGHT);

    ctx.fillStyle = 'rgba(0,212,255,0.15)';
    ctx.fillRect(SIDEBAR - 5, 60, 2, HEIGHT - 120);

    // Avatar
    const avatarY = 180;
    const avatarRadius = 85;
    const avatarX = SIDEBAR / 2;

    const outerGlow = ctx.createRadialGradient(avatarX, avatarY, 40, avatarX, avatarY, 125);
    outerGlow.addColorStop(0, 'rgba(0, 212, 255, 0.4)');
    outerGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, 125, 0, Math.PI * 2);
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
        const fallbackGrad = ctx.createLinearGradient(avatarX - avatarRadius, avatarY - avatarRadius, avatarX + avatarRadius, avatarY + avatarRadius);
        fallbackGrad.addColorStop(0, ACCENT);
        fallbackGrad.addColorStop(1, '#00ffcc');
        ctx.fillStyle = fallbackGrad;
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '900 46px "Montserrat", "Arial"';
        ctx.textAlign = 'center';
        ctx.fillText(userName.charAt(0).toUpperCase(), avatarX, avatarY + 16);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 3.5, 0, Math.PI * 2);
    ctx.stroke();

    // Player label
    ctx.fillStyle = ACCENT;
    ctx.textAlign = 'center';
    ctx.font = '700 15px "Montserrat", "Arial"';
    ctx.fillText('GAMER', avatarX, avatarY + 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 30px "Montserrat", "Arial"';
    ctx.fillText(userName.toUpperCase(), avatarX, avatarY + 160);

    const timestamp = moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY • HH:mm').toUpperCase();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '600 13px "Montserrat", "Arial"';
    ctx.fillText(timestamp, avatarX, avatarY + 185);

    // Game stats
    const totalGames = Object.values(GAME_CATEGORIES).reduce((sum, cat) => sum + cat.games.length, 0);
    const stats = [
        { label: 'TOTAL GAMES', value: `${totalGames}+` },
        { label: 'CATEGORIES', value: Object.keys(GAME_CATEGORIES).length.toString() },
        { label: 'ACTIVE NOW', value: 'YES' }
    ];

    let statsY = avatarY + 240;
    stats.forEach(({ label, value }) => {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '600 13px "Montserrat", "Arial"';
        ctx.fillText(label, avatarX, statsY);
        ctx.fillStyle = ACCENT;
        ctx.font = '900 22px "Montserrat", "Arial"';
        ctx.fillText(value, avatarX, statsY + 26);
        statsY += 55;
    });

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '600 13px "Montserrat", "Arial"';
    ctx.fillText('BONZ GAME CENTER', avatarX, HEIGHT - 160);
    ctx.fillStyle = PRIMARY;
    ctx.font = '800 19px "Montserrat", "Arial"';
    ctx.fillText(`#${String(userId || 'USER').slice(-6).toUpperCase()}`, avatarX, HEIGHT - 130);

    // Main content
    const contentX = SIDEBAR + 80;
    const contentWidth = WIDTH - contentX - 80;
    const headerY = 150;

    ctx.textAlign = 'left';
    
    // Gradient header
    const headerGrad = ctx.createLinearGradient(contentX, headerY - 40, contentX + 500, headerY - 40);
    headerGrad.addColorStop(0, PRIMARY);
    headerGrad.addColorStop(0.5, ACCENT);
    headerGrad.addColorStop(1, '#00ffcc');
    ctx.fillStyle = headerGrad;
    ctx.font = '900 52px "Montserrat", "Arial"';
    ctx.fillText('🎮 GAME CENTER', contentX, headerY);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(contentX, headerY + 12, contentWidth - 40, 2);
    const accentGrad = ctx.createLinearGradient(contentX, 0, contentX + 280, 0);
    accentGrad.addColorStop(0, PRIMARY);
    accentGrad.addColorStop(1, ACCENT);
    ctx.fillStyle = accentGrad;
    ctx.fillRect(contentX, headerY + 12, 280, 3);

    const subtitle = categoryKey 
        ? `${GAME_CATEGORIES[categoryKey].icon} ${GAME_CATEGORIES[categoryKey].name.toUpperCase()}`
        : `${Object.keys(GAME_CATEGORIES).length} CATEGORIES • ${totalGames}+ GAMES`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '700 18px "Montserrat", "Arial"';
    ctx.fillText(subtitle, contentX, headerY + 42);

    let cardY = headerY + 90;

    if (categoryKey) {
        // Show specific category games
        const category = GAME_CATEGORIES[categoryKey];
        const games = category.games;
        const cardWidth = contentWidth - 60;
        const cardHeight = 75;

        games.forEach((game, idx) => {
            const y = cardY + idx * (cardHeight + 18);

            const cardGrad = ctx.createLinearGradient(contentX, y, contentX, y + cardHeight);
            cardGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
            cardGrad.addColorStop(1, 'rgba(8,8,14,0.8)');
            roundRect(ctx, contentX, y, cardWidth, cardHeight, BORDER_RADIUS);
            ctx.fillStyle = cardGrad;
            ctx.fill();

            ctx.strokeStyle = 'rgba(0,212,255,0.2)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Accent line
            ctx.strokeStyle = idx % 2 === 0 ? 'rgba(255,49,88,0.6)' : 'rgba(0,212,255,0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(contentX + 20, y + 15);
            ctx.lineTo(contentX + 20, y + cardHeight - 15);
            ctx.stroke();

            // Number badge
            ctx.fillStyle = idx % 2 === 0 ? PRIMARY : ACCENT;
            ctx.font = '700 16px "Montserrat", "Arial"';
            ctx.fillText(`[${String(idx + 1).padStart(2, '0')}]`, contentX + 35, y + 28);

            // Command
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 20px "Montserrat", "Arial"';
            const cmdText = game.cmd.length > 32 ? `${game.cmd.slice(0, 32)}…` : game.cmd;
            ctx.fillText(cmdText, contentX + 85, y + 30);

            // Description
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '600 14px "Montserrat", "Arial"';
            const descText = game.desc.length > 60 ? `${game.desc.slice(0, 60)}…` : game.desc;
            ctx.fillText(descText, contentX + 85, y + 54);
        });
    } else {
        // Show all categories
        const categories = Object.entries(GAME_CATEGORIES);
        const columns = 2;
        const cardWidth = (contentWidth - 100) / columns;
        const cardHeight = 140;

        categories.forEach(([key, cat], idx) => {
            const col = idx % columns;
            const row = Math.floor(idx / columns);
            const x = contentX + col * (cardWidth + 50);
            const y = cardY + row * (cardHeight + 25);

            const cardGrad = ctx.createLinearGradient(x, y, x, y + cardHeight);
            cardGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
            cardGrad.addColorStop(1, 'rgba(10,10,16,0.85)');
            roundRect(ctx, x, y, cardWidth, cardHeight, BORDER_RADIUS);
            ctx.fillStyle = cardGrad;
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Icon
            ctx.font = '60px "Segoe UI Emoji", "Arial"';
            ctx.fillText(cat.icon, x + 25, y + 70);

            // Category name
            ctx.fillStyle = idx % 2 === 0 ? PRIMARY : ACCENT;
            ctx.font = '900 22px "Montserrat", "Arial"';
            ctx.fillText(cat.name, x + 110, y + 45);

            // Game count
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '600 15px "Montserrat", "Arial"';
            ctx.fillText(`${cat.games.length} games`, x + 110, y + 70);

            // Description
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '600 13px "Montserrat", "Arial"';
            const desc = cat.desc.length > 30 ? `${cat.desc.slice(0, 30)}…` : cat.desc;
            ctx.fillText(desc, x + 25, y + 110);

            // View button indicator
            ctx.fillStyle = idx % 2 === 0 ? 'rgba(255,49,88,0.3)' : 'rgba(0,212,255,0.3)';
            roundRect(ctx, x + cardWidth - 100, y + cardHeight - 35, 80, 25, 12);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 13px "Montserrat", "Arial"';
            ctx.textAlign = 'center';
            ctx.fillText('VIEW', x + cardWidth - 60, y + cardHeight - 18);
            ctx.textAlign = 'left';
        });
    }

    // Secure ID
    const secureId = crypto.createHash('md5').update(String(userId || '0')).digest('hex').slice(0, 8).toUpperCase();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '600 15px "Montserrat", "Arial"';
    ctx.textAlign = 'right';
    ctx.fillText(`SECURE ID: ${secureId}`, contentX + contentWidth - 20, HEIGHT - 35);

    return canvas.toBuffer('image/png');
}

module.exports.run = async ({ api, event, args }) => {
    const { threadId, type, data } = event;
    const senderId = data?.uidFrom || event?.authorId;

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
            console.log('[GAMES] Lỗi lấy info:', e?.message || e);
        }

        let categoryKey = null;
        if (args && args.length > 0) {
            const arg = String(args[0]).toLowerCase().trim();
            if (GAME_CATEGORIES[arg]) {
                categoryKey = arg;
            }
        }

        const buffer = await createGamesMenuImage({
            userName,
            userAvatar,
            userId: senderId,
            categoryKey
        });

        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const filePath = path.join(tempDir, `games_${Date.now()}.png`);
        fs.writeFileSync(filePath, buffer);

        const totalGames = Object.values(GAME_CATEGORIES).reduce((sum, cat) => sum + cat.games.length, 0);
        
        let msgText = '🎮 BONZ GAME CENTER\n\n';
        if (categoryKey) {
            const cat = GAME_CATEGORIES[categoryKey];
            msgText += `${cat.icon} ${cat.name}\n`;
            msgText += `📋 ${cat.games.length} games có sẵn\n\n`;
            msgText += `💡 Xem tất cả: games\n`;
        } else {
            msgText += `📂 ${Object.keys(GAME_CATEGORIES).length} danh mục game:\n`;
            Object.keys(GAME_CATEGORIES).forEach(key => {
                msgText += `• games ${key} - ${GAME_CATEGORIES[key].name}\n`;
            });
            msgText += `\n🎯 Tổng cộng: ${totalGames}+ games`;
            msgText += '\n💡 Chọn danh mục để xem chi tiết!';
        }
        msgText += `\n⏱️ Tự xóa sau ${AUTO_DELETE_TIME/1000}s`;

        await api.sendMessage({
            msg: msgText,
            attachments: [filePath],
            ttl: AUTO_DELETE_TIME
        }, threadId, type);

        await reactMenu(api, event, threadId, type);

        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch {}
        }, AUTO_DELETE_TIME);

    } catch (err) {
        console.error('[GAMES]', err);
        let fallback = '🎮 BONZ GAME CENTER\n\n';
        Object.entries(GAME_CATEGORIES).forEach(([key, cat]) => {
            fallback += `${cat.icon} ${cat.name}\n`;
            cat.games.forEach(g => fallback += `  • ${g.cmd}\n`);
            fallback += '\n';
        });
        return api.sendMessage(fallback, threadId, type);
    }
};