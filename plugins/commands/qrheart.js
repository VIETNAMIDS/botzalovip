const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const QRCode = require('qrcode');
const { Reactions } = require('zca-js');

module.exports.config = {
  name: 'bonzqrheart',
  aliases: ['traitim', 'qrheart', 'qr', 'love', 'maqr', 'qrcode'],
  version: '5.0.0',
  role: 0,
  author: 'ShinTHL09 | Random Edition by Claude',
  description: '🎲 Tạo mã QR đa màu sắc & đa phong cách',
  category: 'Tiện ích',
  usage: 'qrheart <text> - <caption?> - <theme?> - <style?>',
  cooldowns: 3,
  dependencies: { axios: '' }
};

// ═══════════════════════════════════════════
// 🎨 COLOR THEMES - TỰ ĐỘNG RANDOM
// ═══════════════════════════════════════════
const THEMES = {
  // 🌈 Gradient
  rainbow: { name: '🌈 Rainbow', dark: 'ff0000', light: 'ffffff', desc: 'Cầu vồng' },
  sunset: { name: '🌅 Sunset', dark: 'ff6b35', light: 'fff5e6', desc: 'Hoàng hôn' },
  ocean: { name: '🌊 Ocean', dark: '006994', light: 'e6f3ff', desc: 'Đại dương' },
  forest: { name: '🌲 Forest', dark: '228b22', light: 'f0fff0', desc: 'Rừng xanh' },
  galaxy: { name: '🌌 Galaxy', dark: '4b0082', light: 'f5f0ff', desc: 'Thiên hà' },
  fire: { name: '🔥 Fire', dark: 'ff4500', light: 'fff8f0', desc: 'Lửa cháy' },
  
  // 💕 Love
  love: { name: '💕 Love', dark: 'ff1493', light: 'fff0f5', desc: 'Tình yêu' },
  rose: { name: '🌹 Rose', dark: 'dc143c', light: 'fff5f5', desc: 'Hoa hồng' },
  valentine: { name: '💝 Valentine', dark: 'e91e63', light: 'fce4ec', desc: 'Tình nhân' },
  
  // 💜 Neon
  neon: { name: '💜 Neon', dark: '9d00ff', light: '0d0d0d', desc: 'Neon' },
  cyberpunk: { name: '🤖 Cyberpunk', dark: 'ff00ff', light: '0a0a0a', desc: 'Cyber' },
  retrowave: { name: '🎸 Retrowave', dark: 'ff6ec7', light: '1a0a2e', desc: 'Retro 80s' },
  
  // 🍬 Pastel
  pastel: { name: '🍬 Pastel', dark: 'b19cd9', light: 'fff5f5', desc: 'Pastel' },
  candy: { name: '🍭 Candy', dark: 'ff69b4', light: 'fffaf0', desc: 'Kẹo ngọt' },
  sakura: { name: '🌸 Sakura', dark: 'ffb7c5', light: 'fff5f8', desc: 'Anh đào' },
  
  // 🏆 Classic
  classic: { name: '⬛ Classic', dark: '000000', light: 'ffffff', desc: 'Cổ điển' },
  gold: { name: '🏆 Gold', dark: 'ffd700', light: '1a1a0a', desc: 'Vàng kim' },
  silver: { name: '🥈 Silver', dark: '708090', light: 'f8f8ff', desc: 'Bạc' },
  
  // 🌙 Dark
  midnight: { name: '🌙 Midnight', dark: '191970', light: 'f0f0ff', desc: 'Đêm' },
  dark: { name: '🖤 Dark', dark: '2d2d2d', light: 'e0e0e0', desc: 'Tối' },
  
  // 🍀 Nature
  spring: { name: '🌷 Spring', dark: '32cd32', light: 'f0fff0', desc: 'Xuân' },
  autumn: { name: '🍂 Autumn', dark: 'd2691e', light: 'fff8dc', desc: 'Thu' },
  winter: { name: '❄️ Winter', dark: '4682b4', light: 'f0ffff', desc: 'Đông' },
  
  // 🎉 Special
  christmas: { name: '🎄 Christmas', dark: 'c41e3a', light: 'f5fffa', desc: 'Giáng sinh' },
  halloween: { name: '🎃 Halloween', dark: 'ff6600', light: '1a1a1a', desc: 'Ma mị' },
  newyear: { name: '🎆 New Year', dark: 'ffd700', light: '000033', desc: 'Năm mới' },
  
  // 🆕 Thêm nhiều màu mới
  aqua: { name: '💎 Aqua', dark: '00ced1', light: 'f0ffff', desc: 'Xanh ngọc' },
  coral: { name: '🪸 Coral', dark: 'ff7f50', light: 'fff5ee', desc: 'San hô' },
  lavender: { name: '💜 Lavender', dark: '9370db', light: 'f8f4ff', desc: 'Oải hương' },
  mint: { name: '🌿 Mint', dark: '3eb489', light: 'f5fffa', desc: 'Bạc hà' },
  peach: { name: '🍑 Peach', dark: 'ffab91', light: 'fff5f0', desc: 'Đào' },
  sky: { name: '🩵 Sky', dark: '87ceeb', light: 'f0f8ff', desc: 'Bầu trời' },
  grape: { name: '🍇 Grape', dark: '6b5b95', light: 'f5f3f7', desc: 'Nho' },
  lemon: { name: '🍋 Lemon', dark: 'ffd700', light: 'fffacd', desc: 'Chanh' },
  berry: { name: '🫐 Berry', dark: '8e4585', light: 'fdf4ff', desc: 'Quả mọng' },
  coffee: { name: '☕ Coffee', dark: '6f4e37', light: 'faf0e6', desc: 'Cà phê' },
  teal: { name: '🦚 Teal', dark: '008080', light: 'e6ffff', desc: 'Xanh cổ vịt' },
  crimson: { name: '❤️‍🔥 Crimson', dark: 'dc143c', light: 'fff0f5', desc: 'Đỏ thẫm' },
  electric: { name: '⚡ Electric', dark: '7df9ff', light: '0a0a1a', desc: 'Điện' },
  sunset2: { name: '🌄 Dawn', dark: 'ff758c', light: 'fff1f3', desc: 'Bình minh' }
};

// ═══════════════════════════════════════════
// 🔧 CONFIG
// ═══════════════════════════════════════════
const CONFIG = {
  HEART_API: 'https://api.zeidteam.xyz/image-generator/qrcode-heart',
  COLOR_API: 'https://quickchart.io/qr',
  BACKUP_API: 'https://api.qrserver.com/v1/create-qr-code',
  TEMP_DIR: path.join(__dirname, 'temp'),
  MAX_TEXT: 500,
  TIMEOUT: 20000,
  CANVAS_SIZE: 600,
  CAPTION_FONT: '24px "Segoe UI", sans-serif',
  AUTO_DELETE_MS: 60000
};

const REACTION_POOL = [
  Reactions.HEART,
  Reactions.LIKE,
  Reactions.WOW,
  Reactions.SUN,
  Reactions.HANDCLAP,
  Reactions.COOL,
  Reactions.OK,
  Reactions.DISLIKE,
  Reactions.BOMB,
  Reactions.SAD,
  Reactions.CONFUSED,
  Reactions.CRY,
  Reactions.ANGRY,
  Reactions.KISS,
  Reactions.NO,
  Reactions.ROSE
];

const REACTION_BATCH_SIZE = 10;

// ═══════════════════════════════════════════
// 🧩 QR STYLES
// ═══════════════════════════════════════════
const STYLES = {
  classic: {
    name: '⬛ Classic Square',
    key: 'classic',
    type: 'square',
    desc: 'Ô vuông truyền thống'
  },
  rounded: {
    name: '🔵 Rounded Corners',
    key: 'rounded',
    type: 'rounded',
    radius: 0.35,
    desc: 'Bo góc mềm mại'
  },
  dots: {
    name: '⚪ Dot Matrix',
    key: 'dots',
    type: 'dot',
    desc: 'Chấm tròn hiện đại'
  },
  heartframe: {
    name: '💖 Heart Frame',
    key: 'heartframe',
    type: 'rounded',
    radius: 0.45,
    overlay: 'heart',
    gradient: ['#ff9a9e', '#fad0c4'],
    captionColor: '#c2185b',
    desc: 'Khung trái tim lãng mạn'
  },
  neon: {
    name: '⚡ Neon Glow',
    key: 'neon',
    type: 'rounded',
    radius: 0.4,
    gradient: ['#020024', '#090979', '#00d4ff'],
    glow: true,
    captionColor: '#f5f5f5',
    desc: 'Hiệu ứng neon nổi bật'
  }
};

const E = { // Emojis
  heart: '💕', ok: '✅', err: '❌', warn: '⚠️', info: 'ℹ️',
  user: '👤', id: '🆔', rank: '⭐', use: '📊', time: '⏰',
  spark: '✨', love: '💗', dice: '🎲', palette: '🎨'
};

// ═══════════════════════════════════════════
// 🎲 RANDOM FUNCTIONS
// ═══════════════════════════════════════════
const Random = {
  // Random 1 theme từ danh sách
  theme() {
    const keys = Object.keys(THEMES);
    const key = keys[Math.floor(Math.random() * keys.length)];
    return { key, ...THEMES[key] };
  },
  
  // Random màu hex hoàn toàn ngẫu nhiên
  hex: () => Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
  
  // Random theme với màu hoàn toàn random
  fullRandom() {
    const dark = this.hex();
    const light = this.hex();
    return { 
      key: 'random', 
      name: `🎲 Random`, 
      dark, 
      light,
      desc: `#${dark} / #${light}`
    };
  },
  
  // Random kiểu: 50% theme có sẵn, 50% màu random
  smart() {
    return Math.random() > 0.5 ? this.theme() : this.fullRandom();
  },
  
  // Random pastel (màu nhẹ nhàng)
  pastel() {
    const r = Math.floor(Math.random() * 128 + 127);
    const g = Math.floor(Math.random() * 128 + 127);
    const b = Math.floor(Math.random() * 128 + 127);
    const dark = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    return { key: 'pastel', name: '🍬 Pastel Random', dark, light: 'ffffff', desc: `#${dark}` };
  },
  
  // Random neon (màu sáng chói)
  neon() {
    const colors = ['ff00ff', '00ffff', 'ff0080', '80ff00', 'ffff00', '00ff80', 'ff8000'];
    const dark = colors[Math.floor(Math.random() * colors.length)];
    return { key: 'neon', name: '💜 Neon Random', dark, light: '0a0a0a', desc: `#${dark}` };
  },

  style() {
    const keys = Object.keys(STYLES);
    const key = keys[Math.floor(Math.random() * keys.length)];
    return STYLES[key];
  }
};

// ═══════════════════════════════════════════
// 🛠️ UTILS
// ═══════════════════════════════════════════
const Utils = {
  time: () => new Date().toLocaleString('vi-VN', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: '2-digit'
  }),
  clean: (t, m) => t ? t.trim().slice(0, m).replace(/[<>]/g, '') : '',
  ensureDir: d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true }),
  rm: f => { try { fs.existsSync(f) && fs.unlinkSync(f); } catch {} },
  
  findTheme(input) {
    if (!input) return null;
    const k = input.toLowerCase().trim();
    
    // Các lệnh random đặc biệt
    if (['random', 'rd', 'ngaunhien', 'nn'].includes(k)) return Random.smart();
    if (['fullrandom', 'fr', 'full'].includes(k)) return Random.fullRandom();
    if (['rpastel', 'rp'].includes(k)) return Random.pastel();
    if (['rneon', 'rn'].includes(k)) return Random.neon();
    
    // Tìm theme có sẵn
    if (THEMES[k]) return { key: k, ...THEMES[k] };
    for (const [key, v] of Object.entries(THEMES)) {
      if (key.includes(k) || v.name.toLowerCase().includes(k)) {
        return { key, ...v };
      }
    }
    return null;
  },

  findStyle(input) {
    if (!input) return null;
    const k = input.toLowerCase().trim();
    if (['randomstyle', 'rs', 'style-random'].includes(k)) return Random.style();
    if (STYLES[k]) return STYLES[k];
    for (const [key, v] of Object.entries(STYLES)) {
      if (key.includes(k) || v.name.toLowerCase().includes(k)) {
        return v;
      }
    }
    return null;
  }
};

// ═══════════════════════════════════════════
// 👤 USER
// ═══════════════════════════════════════════
const User = {
  async name(api, uid) {
    try {
      const i = await api.getUserInfo(uid);
      return i?.changed_profiles?.[uid]?.displayName || 'Bạn';
    } catch { return 'Bạn'; }
  },
  role(uid) {
    const c = global?.config || {};
    const a = [].concat(c.admin_bot || []).map(String);
    const o = [].concat(c.owner_bot || []).map(String);
    if (o.includes(String(uid))) return { l: '👑 Owner', c: '🟡' };
    if (a.includes(String(uid))) return { l: '🛡️ Admin', c: '🔵' };
    return { l: '👤 Member', c: '🟢' };
  },
  add(uid) {
    global.__qr = global.__qr || {};
    return ++global.__qr[uid] || (global.__qr[uid] = 1);
  }
};

// ═══════════════════════════════════════════
// 📝 MESSAGES
// ═══════════════════════════════════════════
const Msg = {
  box: (title, lines) => [
    `┌───────────────────────┐`,
    `│ ${title.padEnd(21)} │`,
    `├───────────────────────┤`,
    ...lines.map(l => `│ ${l.padEnd(21)} │`),
    `└───────────────────────┘`
  ].join('\n'),

  success: (name) => `@${name || 'bạn'}`,

  help: () => [
    `${E.dice}══『 𝐐𝐑 𝐑𝐀𝐍𝐃𝐎𝐌 』══${E.dice}`,
    `${E.spark} Tự động random màu sắc!`,
    ``,
    `┌───────────────────────┐`,
    `│ ${E.love} 𝗖𝗔́𝗖𝗛 𝗗𝗨̀𝗡𝗚            │`,
    `├───────────────────────┤`,
    `│ • qrheart <text>      │`,
    `│ • qrheart <text> - <cap>`,
    `│                       │`,
    `│ ${E.palette} 𝗧𝗨̀𝗬 𝗖𝗛𝗢̣𝗡 𝗧𝗛𝗘𝗠𝗘      │`,
    `├───────────────────────┤`,
    `│ • qrheart text - - love`,
    `│ • qrheart text - - neon`,
    `│ • qrheart text - - random`,
    `│                       │`,
    `│ ${E.dice} 𝗟𝗘̣̂𝗡𝗛 𝗥𝗔𝗡𝗗𝗢𝗠        │`,
    `├───────────────────────┤`,
    `│ random/rd = Mix       │`,
    `│ fullrandom/fr = Full  │`,
    `│ rpastel/rp = Pastel   │`,
    `│ rneon/rn = Neon       │`,
    `│ rs = Random style     │`,
    `├───────────────────────┤`,
    `│ ${E.spark} 𝗦𝗧𝗬𝗟𝗘             │`,
    `│ • - - - classic       │`,
    `│ • - - - rounded       │`,
    `│ • - - - dots          │`,
    `│ • - - - heartframe    │`,
    `│ • - - - neon          │`,
    `└───────────────────────┘`,
    ``,
    `${E.info} Không chọn = Auto random!`,
    `${E.time} ${Utils.time()}`
  ].join('\n'),

  error: (err) => [
    `${E.err} Lỗi: ${err}`,
    `${E.warn} Thử lại sau nhé!`,
    `${E.time} ${Utils.time()}`
  ].join('\n')
};

// ═══════════════════════════════════════════
// ♻️ AUTO DELETE HELPER
// ═══════════════════════════════════════════
async function sendAutoDelete(api, threadId, type, {
  message,
  attachments,
  mentions,
  ttl = CONFIG.AUTO_DELETE_MS
} = {}) {
  try {
    const payload = {};
    if (typeof message === 'string') payload.msg = message;
    if (attachments !== undefined) payload.attachments = attachments;
    if (Array.isArray(mentions) && mentions.length) payload.mentions = mentions;
    if (ttl && Number.isFinite(ttl)) payload.ttl = ttl;

    const sent = await api.sendMessage(payload, threadId, type);

    if (ttl && Number.isFinite(ttl) && sent?.data?.msgId && typeof api.deleteMessage === 'function') {
      setTimeout(async () => {
        try {
          await api.deleteMessage({ threadId, type, data: { msgId: sent.data.msgId } }, false);
        } catch (error) {
          console.warn('[QR][AutoDelete]', error.message);
        }
      }, ttl + 5000);
    }

    return sent;
  } catch (error) {
    console.error('[QR][AutoDelete]', error.message);
    return null;
  }
}

async function reactWithVariety(api, event, threadId, type) {
  if (typeof api.addReaction !== 'function' || !event?.data?.msgId) return;
  if (!Array.isArray(REACTION_POOL) || !REACTION_POOL.length) return;

  const target = {
    data: { msgId: event.data.msgId, cliMsgId: event.data.cliMsgId },
    threadId,
    type
  };

  try {
    await api.addReaction(Reactions.NONE, target);
  } catch (error) {
    console.warn('[QR][Reaction]', 'NONE', error.message);
  }

  const pool = [...REACTION_POOL];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const picks = pool.slice(0, Math.min(REACTION_BATCH_SIZE, pool.length));

  for (const reaction of picks) {
    if (reaction === Reactions.NONE) continue;
    try {
      await api.addReaction(reaction, target);
    } catch (error) {
      console.warn('[QR][Reaction]', reaction, error.message);
    }
  }
}

// ═══════════════════════════════════════════
// 🎯 QR SERVICE
// ═══════════════════════════════════════════
const QR = {
  async heart(text, cap) {
    const url = `${CONFIG.HEART_API}?text=${encodeURIComponent(text)}&caption=${encodeURIComponent(cap || '')}`;
    return (await axios.get(url, { responseType: 'arraybuffer', timeout: CONFIG.TIMEOUT })).data;
  },
  
  async color(text, theme) {
    const url = `${CONFIG.COLOR_API}?text=${encodeURIComponent(text)}&size=400&dark=${theme.dark}&light=${theme.light}&format=png`;
    return (await axios.get(url, { responseType: 'arraybuffer', timeout: CONFIG.TIMEOUT })).data;
  },
  
  async backup(text, theme) {
    const url = `${CONFIG.BACKUP_API}?data=${encodeURIComponent(text)}&size=400x400&color=${theme.dark}&bgcolor=${theme.light}`;
    return (await axios.get(url, { responseType: 'arraybuffer', timeout: CONFIG.TIMEOUT })).data;
  },
  
  async make(text, cap, theme, style) {
    // Nếu không có theme/style -> random
    if (!theme) theme = Random.smart();
    if (!style) style = Random.style();

    try {
      return {
        data: await Styled.generate({ text, caption: cap, theme, style }),
        theme,
        style
      };
    } catch (err) {
      console.warn('[QR][Styled] thất bại, fallback API:', err.message);
    }

    // Thử lần lượt các API cũ nếu render nội bộ lỗi
    try { return { data: await this.color(text, theme), theme, style: null }; } catch {}
    try { return { data: await this.backup(text, theme), theme, style: null }; } catch {}
    try { return { data: await this.heart(text, cap), theme: { name: '💕 Heart', key: 'heart' }, style: null }; } catch {}

    throw new Error('Tất cả phương thức tạo QR đều lỗi');
  }
};

// ═══════════════════════════════════════════
// 🖌️ STYLED RENDERER
// ═══════════════════════════════════════════
const Styled = {
  generate({ text, caption, theme, style }) {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'H', maskPattern: style.maskPattern || undefined });
    const moduleCount = qr.modules.size;
    const margin = 20;
    const moduleSize = Math.floor((CONFIG.CANVAS_SIZE - margin * 2) / moduleCount);
    const size = moduleSize * moduleCount + margin * 2;
    const captionHeight = caption ? 70 : 0;
    const canvas = createCanvas(size, size + captionHeight);
    const ctx = canvas.getContext('2d');

    this.drawBackground(ctx, size, size + captionHeight, theme, style);
    this.drawModules(ctx, qr.modules, moduleSize, margin, theme, style);
    if (caption) this.drawCaption(ctx, caption, size, size + captionHeight, style);
    this.decorate(ctx, size, style, theme);

    return canvas.toBuffer('image/png');
  },

  drawBackground(ctx, width, height, theme, style) {
    if (style.gradient && style.gradient.length) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      style.gradient.forEach((color, idx) => {
        gradient.addColorStop(idx / (style.gradient.length - 1 || 1), color);
      });
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = `#${theme.light}`;
    }
    ctx.fillRect(0, 0, width, height);
  },

  drawModules(ctx, modules, moduleSize, margin, theme, style) {
    const color = `#${theme.dark}`;
    const shadowColor = style.glow ? color : 'transparent';
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = style.glow ? moduleSize * 0.6 : 0;

    for (let row = 0; row < modules.size; row += 1) {
      for (let col = 0; col < modules.size; col += 1) {
        if (!modules.get(col, row)) continue;
        const x = margin + col * moduleSize;
        const y = margin + row * moduleSize;
        switch (style.type) {
          case 'rounded':
            this.drawRounded(ctx, x, y, moduleSize, color, style.radius || 0.25);
            break;
          case 'dot':
            this.drawDot(ctx, x, y, moduleSize, color);
            break;
          default:
            this.drawSquare(ctx, x, y, moduleSize, color);
            break;
        }
      }
    }

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  },

  drawSquare(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
  },

  drawRounded(ctx, x, y, size, color, radiusRatio) {
    const radius = size * Math.max(Math.min(radiusRatio, 0.5), 0.05);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + size, y, x + size, y + size, radius);
    ctx.arcTo(x + size, y + size, x, y + size, radius);
    ctx.arcTo(x, y + size, x, y, radius);
    ctx.arcTo(x, y, x + size, y, radius);
    ctx.closePath();
    ctx.fill();
  },

  drawDot(ctx, x, y, size, color) {
    const radius = size * 0.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  },

  drawCaption(ctx, caption, width, height, style) {
    ctx.font = CONFIG.CAPTION_FONT;
    ctx.fillStyle = style.captionColor || '#333333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(caption, width / 2, height - 20);
  },

  decorate(ctx, size, style, theme) {
    if (style.overlay === 'heart') {
      const heartColor = style.captionColor || `#${theme.dark}`;
      const hearts = [
        { x: size * 0.2, y: size * 0.12, scale: 0.08 },
        { x: size * 0.8, y: size * 0.18, scale: 0.06 },
        { x: size * 0.12, y: size * 0.78, scale: 0.07 },
        { x: size * 0.85, y: size * 0.75, scale: 0.09 }
      ];
      hearts.forEach(({ x, y, scale }) => this.drawHeart(ctx, x, y, size * scale, heartColor));
    }
  },

  drawHeart(ctx, cx, cy, size, color) {
    const topCurveHeight = size * 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + topCurveHeight);
    ctx.bezierCurveTo(cx, cy, cx - size / 2, cy, cx - size / 2, cy + topCurveHeight);
    ctx.bezierCurveTo(cx - size / 2, cy + (size + topCurveHeight) / 2, cx, cy + (size + topCurveHeight) / 1.4, cx, cy + size);
    ctx.bezierCurveTo(cx, cy + (size + topCurveHeight) / 1.4, cx + size / 2, cy + (size + topCurveHeight) / 2, cx + size / 2, cy + topCurveHeight);
    ctx.bezierCurveTo(cx + size / 2, cy, cx, cy, cx, cy + topCurveHeight);
    ctx.closePath();
    ctx.fill();
  }
};

// ═══════════════════════════════════════════
// 🚀 MAIN
// ═══════════════════════════════════════════
module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  if (global.bonzInteractionSettings?.[threadId] === 'silent') return;

  const uid = event?.data?.uidFrom || event?.authorId;
  const name = await User.name(api, uid);
  User.add(uid);

  // Parse: text - caption - theme
  const parts = args.join(' ').split('-').map(s => s.trim());
  const text = Utils.clean(parts[0], CONFIG.MAX_TEXT);
  const caption = Utils.clean(parts[1], 100);
  const themeInput = parts[2];

  // No input -> help
  if (!text) return api.sendMessage(Msg.help(), threadId, type);

  try {
    // Tìm theme hoặc auto random
    let theme = themeInput ? Utils.findTheme(themeInput) : Random.smart();
    
    // Tạo QR
    Utils.ensureDir(CONFIG.TEMP_DIR);
    const result = await QR.make(text, caption, theme);
    
    // Save & send
    const file = path.join(CONFIG.TEMP_DIR, `qr_${uid}_${Date.now()}.png`);
    fs.writeFileSync(file, result.data);
    
    const successMsg = Msg.success(name);
    const tag = `@${name || 'bạn'}`;
    const mentionPos = successMsg.indexOf('@');
    await sendAutoDelete(api, threadId, type, {
      message: successMsg,
      attachments: file,
      mentions: [{ uid, pos: mentionPos >= 0 ? mentionPos : 0, len: tag.length }],
      ttl: CONFIG.AUTO_DELETE_MS
    });

    await reactWithVariety(api, event, threadId, type);
    
    Utils.rm(file);

  } catch (e) {
    console.error('[QR]', e.message);
    api.sendMessage(Msg.error(e.message), threadId, type);
  }
};

// ═══════════════════════════════════════════
// 📋 BONUS: Xem tất cả themes
// ═══════════════════════════════════════════
module.exports.list = async ({ api, event }) => {
  const { threadId, type } = event;
  const list = Object.entries(THEMES)
    .map(([k, v]) => `${v.name}`)
    .join(' • ');
  
  api.sendMessage([
    `${E.palette}══『 THEMES 』══${E.palette}`,
    ``,
    list,
    ``,
    `${E.info} Tổng: ${Object.keys(THEMES).length} themes`,
    `${E.dice} Hoặc để trống = Auto Random!`
  ].join('\n'), threadId, type);
};