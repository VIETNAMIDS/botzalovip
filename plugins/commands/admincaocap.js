const { ThreadType } = require('zca-js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TEMP_DIR = path.join(__dirname, 'cache', 'admincaocap');

module.exports.config = {
  name: 'admincaocap',
  aliases: ['adc', 'sadmin', 'superadmin'],
  version: '1.0.2',
  role: 1,
  author: 'Cascade',
  description: 'Set 1 admin cao cap duy nhat trong nhom va khoa lenh chi admin cao cap duoc dung',
  category: 'Quản lý',
  usage: 'admincaocap help | admincaocap set @user | admincaocap info | khoalenh <cmd...> | mokhalenh <cmd...> | admincaocap locklist',
  cooldowns: 2
};

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function scheduleCleanup(files = [], delayMs = 90000) {
  if (!Array.isArray(files) || files.length === 0) return;
  setTimeout(() => {
    for (const f of files) {
      try {
        if (f && fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
  }, Math.max(5000, Number(delayMs) || 90000)).unref?.();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawBadge(ctx, x, y, text, { bg = 'rgba(255,255,255,0.10)', stroke = 'rgba(255,255,255,0.18)' } = {}) {
  const padX = 14;
  const padY = 8;
  ctx.save();
  ctx.font = 'bold 17px "Segoe UI", "Roboto", "Arial", sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const h = 36;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + padX, y + h / 2);
  ctx.restore();
  return { w, h };
}

async function createAdminCaoCapHelpImage(options = {}) {
  const WIDTH = 1200;
  const items = [
    { no: 1, icon: '👑', title: 'Set Admin Cao Cap', desc: 'admincaocap set @user', color1: '#10b981', color2: '#22c55e' },
    { no: 2, icon: '📌', title: 'Xem Thong Tin', desc: 'admincaocap info', color1: '#06b6d4', color2: '#22d3ee' },
    { no: 3, icon: '🔒', title: 'Khoa Lenh', desc: 'khoalenh <tenlenh...>', color1: '#8b5cf6', color2: '#ec4899' },
    { no: 4, icon: '🔓', title: 'Mo Khoa', desc: 'mokhalenh <tenlenh...>', color1: '#f59e0b', color2: '#f97316' },
    { no: 5, icon: '📋', title: 'Danh Sach Lenh Khoa', desc: 'admincaocap locklist', color1: '#a855f7', color2: '#6366f1' }
  ];

  const rows = items.length;
  const cardH = 100;
  const gap = 14;
  const headerH = 180;
  const footerH = 50;
  const sidebarW = 280;
  const padding = 30;
  
  const listH = rows * cardH + (rows - 1) * gap;
  const HEIGHT = padding * 2 + Math.max(headerH + listH + 20, sidebarW + 100) + footerH;
  
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#0a1628');
  bg.addColorStop(0.5, '#1a1f3a');
  bg.addColorStop(1, '#2d1b4e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Gradient blobs
  try {
    const blob1 = ctx.createRadialGradient(WIDTH * 0.15, HEIGHT * 0.25, 50, WIDTH * 0.15, HEIGHT * 0.25, Math.min(WIDTH, HEIGHT) * 0.6);
    blob1.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
    blob1.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = blob1;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const blob2 = ctx.createRadialGradient(WIDTH * 0.85, HEIGHT * 0.6, 50, WIDTH * 0.85, HEIGHT * 0.6, Math.min(WIDTH, HEIGHT) * 0.7);
    blob2.addColorStop(0, 'rgba(139, 92, 246, 0.18)');
    blob2.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.fillStyle = blob2;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } catch {}

  // Grid pattern
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < WIDTH; i += 50) {
    for (let j = 0; j < HEIGHT; j += 50) {
      ctx.fillRect(i, j, 25, 25);
    }
  }

  // Sidebar panel
  const sidebarX = padding;
  const sidebarY = padding;
  const sidebarH = HEIGHT - padding * 2 - footerH;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 25;
  roundRect(ctx, sidebarX, sidebarY, sidebarW, sidebarH, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.stroke();
  ctx.restore();

  // Avatar
  const avatarSize = 140;
  const avatarX = sidebarX + (sidebarW - avatarSize) / 2;
  const avatarY = sidebarY + 40;

  let avatarImg = null;
  const avatarUrl = typeof options.avatarUrl === 'string' ? options.avatarUrl : null;
  if (avatarUrl && avatarUrl.startsWith('http')) {
    try {
      const res = await axios.get(avatarUrl, { responseType: 'arraybuffer', timeout: 9000 });
      avatarImg = await loadImage(Buffer.from(res.data));
    } catch {}
  }

  ctx.save();
  roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 24);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();

  // Name and info
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 24px "Segoe UI", "Roboto", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const displayName = String(options.displayName || 'ADMIN CAO CAP');
  const nameY = avatarY + avatarSize + 16;
  let n = displayName;
  while (ctx.measureText(n).width > sidebarW - 40 && n.length > 0) n = n.slice(0, -1);
  ctx.fillText(n, sidebarX + sidebarW / 2, nameY);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 16px "Segoe UI", "Roboto", "Arial", sans-serif';
  ctx.fillText('HELP PANEL', sidebarX + sidebarW / 2, nameY + 36);

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '14px "Segoe UI", "Roboto", "Arial", sans-serif';
  ctx.fillText('Chi 1 nguoi duy nhat / nhom', sidebarX + sidebarW / 2, nameY + 62);
  ctx.fillText('Set 1 lan, khong doi', sidebarX + sidebarW / 2, nameY + 82);
  ctx.restore();

  // Badges
  let badgeX = sidebarX + 20;
  let badgeY = nameY + 110;
  drawBadge(ctx, badgeX, badgeY, 'LENH BI KHOA', {
    bg: 'rgba(99,102,241,0.10)',
    stroke: 'rgba(99,102,241,0.28)'
  });
  badgeY += 46;
  drawBadge(ctx, badgeX, badgeY, 'CHI ADMIN CAO CAP', {
    bg: 'rgba(16,185,129,0.10)',
    stroke: 'rgba(16,185,129,0.28)'
  });
  ctx.restore();

  // Main panel
  const panelX = sidebarX + sidebarW + 20;
  const panelW = WIDTH - panelX - padding;
  const panelY = padding;
  const panelH = HEIGHT - padding * 2 - footerH;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 25;
  roundRect(ctx, panelX, panelY, panelW, panelH, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.stroke();
  ctx.restore();

  // Header
  ctx.save();
  const headerGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
  headerGrad.addColorStop(0, 'rgba(139, 92, 246, 0.20)');
  headerGrad.addColorStop(0.5, 'rgba(236, 72, 153, 0.16)');
  headerGrad.addColorStop(1, 'rgba(250, 204, 21, 0.12)');
  roundRect(ctx, panelX + 16, panelY + 16, panelW - 32, headerH - 32, 14);
  ctx.fillStyle = headerGrad;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 28px "Segoe UI", "Roboto", "Arial", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('HUONG DAN ADMIN CAO CAP', panelX + 36, panelY + 50);
  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  ctx.font = '16px "Segoe UI", "Roboto", "Arial", sans-serif';
  ctx.fillText('Chon nhanh bang cac lenh ben duoi', panelX + 36, panelY + 78);
  ctx.restore();

  // Command cards
  const listX = panelX + 16;
  const listY = panelY + headerH;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const x = listX;
    const y = listY + i * (cardH + gap);
    const cardW = panelW - 32;
    const c1 = item.color1;
    const c2 = item.color2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18;
    roundRect(ctx, x, y, cardW, cardH, 14);
    const cardBg = ctx.createLinearGradient(x, y, x + cardW, y);
    cardBg.addColorStop(0, 'rgba(255,255,255,0.06)');
    cardBg.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();

    // Colored border
    const neon = ctx.createLinearGradient(x, y, x + cardW, y);
    neon.addColorStop(0, c1);
    neon.addColorStop(1, c2);
    ctx.strokeStyle = neon;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Icon
    ctx.save();
    ctx.shadowColor = c1;
    ctx.shadowBlur = 14;
    ctx.font = '36px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(item.icon, x + 20, y + cardH / 2);
    ctx.shadowBlur = 0;

    // Title
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = 'bold 22px "Segoe UI", "Roboto", "Arial", sans-serif';
    ctx.fillText(item.title, x + 70, y + cardH / 2 - 12);

    // Description
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '15px "Segoe UI", "Roboto", "Arial", sans-serif';
    ctx.fillText(item.desc, x + 70, y + cardH / 2 + 14);

    // Number
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = 'bold 26px "Segoe UI", "Roboto", "Arial", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(item.no), x + cardW - 18, y + cardH / 2);
    ctx.restore();
  }

  // Footer
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = 'bold 15px "Segoe UI", "Roboto", "Arial", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('BONZ BOT - SUPER ADMIN SYSTEM', WIDTH - padding, HEIGHT - 20);
  ctx.restore();

  const imagePath = path.join(TEMP_DIR, `admincaocap_help_${Date.now()}.png`);
  fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));
  return imagePath;
}

function normalizeCmdToken(s) {
  return String(s || '').trim().toLowerCase().replace(/^[/!#.]+/g, '');
}

function uniqLower(list) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const t = normalizeCmdToken(item);
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function isBotAdmin(uid) {
  const u = String(uid || '').trim();
  if (!u) return false;
  const admins = Array.isArray(global?.users?.admin) ? global.users.admin.map(String) : [];
  return admins.includes(u);
}

async function isGroupAdmin(api, threadId, uid) {
  try {
    const info = await api.getGroupInfo(threadId);
    const groupInfo = info?.gridInfoMap?.[threadId];
    if (!groupInfo) return false;
    const creatorId = String(groupInfo.creatorId || '');
    const adminIds = Array.isArray(groupInfo.adminIds) ? groupInfo.adminIds.map(String) : [];
    const u = String(uid || '');
    return (creatorId && creatorId === u) || adminIds.includes(u);
  } catch {
    return false;
  }
}

function ensureSuperAdminData(threadInfo) {
  if (!threadInfo || typeof threadInfo !== 'object') return { uid: null, name: '', lockedCommands: [] };
  const root = threadInfo.super_admin && typeof threadInfo.super_admin === 'object' ? threadInfo.super_admin : {};
  const uid = root.uid != null ? String(root.uid) : null;
  const name = typeof root.name === 'string' ? root.name : '';
  const lockedCommands = uniqLower(root.lockedCommands);
  return { uid: uid && uid.trim() ? uid.trim() : null, name, lockedCommands };
}

function buildMentionText(name) {
  const clean = String(name || '').trim();
  if (!clean) return '@user';
  return clean.startsWith('@') ? clean : `@${clean}`;
}

async function resolveUserName(api, uid, fallbackName = '') {
  const fb = String(fallbackName || '').trim();
  try {
    const info = await api.getUserInfo(uid);
    const n = info?.changed_profiles?.[uid]?.displayName;
    if (typeof n === 'string' && n.trim()) return n.trim();
  } catch {}
  return fb;
}

module.exports.run = async ({ api, event, args = [], Threads }) => {
  const { threadId, type, data } = event || {};

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  if (Number(type) !== ThreadType.Group) {
    return api.sendMessage('ERROR: Lenh chi dung trong nhom.', threadId, type);
  }

  const senderId = String(data?.uidFrom || event?.authorId || '').trim();
  if (!senderId) return;

  const thread = await Threads.getData(threadId);
  const threadInfo = thread?.data || {};
  const conf = ensureSuperAdminData(threadInfo);

  const sub = normalizeCmdToken(args[0]);

  if (sub === 'help' || sub === 'huongdan' || sub === 'hdsd') {
    let imagePath = null;
    try {
      const targetUid = (conf && conf.uid) ? conf.uid : senderId;
      let displayName = null;
      let avatarUrl = null;
      try {
        const info = await api.getUserInfo(targetUid);
        const profile = info?.changed_profiles?.[targetUid] || info?.[targetUid] || info?.profiles?.[targetUid] || info;
        displayName = profile?.displayName || profile?.zaloName || profile?.name || profile?.username || null;
        avatarUrl = profile?.avatar || profile?.avatarUrl || profile?.thumbSrc || profile?.thumb || profile?.photoUrl || null;
      } catch {}
      imagePath = await createAdminCaoCapHelpImage({
        displayName,
        avatarUrl
      });
    } catch {}

    if (imagePath && fs.existsSync(imagePath)) {
      try {
        await api.sendMessage({
          msg: 'ADMINCAOCAP HELP',
          attachments: [imagePath]
        }, threadId, type);
      } catch {
        // fallback below
      } finally {
        scheduleCleanup([imagePath], 120000);
      }
      return;
    }

    const lines = [];
    lines.push('ADMINCAOCAP HELP');
    lines.push('- Set admin cao cap (chi 1 nguoi): admincaocap set @user');
    lines.push('- Xem thong tin: admincaocap info');
    lines.push('- Khoa lenh (chi admin cao cap duoc dung): khoalenh <tenlenh...>');
    lines.push('- Mo khoa lenh: mokhalenh <tenlenh...>');
    lines.push('- Xem danh sach lenh bi khoa: admincaocap locklist');
    lines.push('- Luu y: admin cao cap chi set 1 lan, khong doi nguoi khac.');
    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  const canManage = conf.uid
    ? (conf.uid === senderId)
    : (isBotAdmin(senderId) || await isGroupAdmin(api, threadId, senderId));
  if (!canManage) {
    return api.sendMessage('ERROR: Ban khong co quyen quan ly admin cao cap trong nhom nay.', threadId, type);
  }

  if (sub === 'info' || sub === 'status') {
    const locked = conf.lockedCommands;
    const nameText = buildMentionText(conf.name || '');
    const head = `ADMIN CAO CAP\n- admin: ${conf.uid ? nameText : 'EMPTY'}\n- locked_commands: ${locked.length}`;
    const body = locked.length ? `\n${locked.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '';
    if (conf.uid) {
      const msgText = head + body;
      const pos = msgText.indexOf(nameText);
      return api.sendMessage({
        msg: msgText,
        mentions: [{ uid: conf.uid, pos: pos >= 0 ? pos : 0, len: nameText.length }]
      }, threadId, type);
    }
    return api.sendMessage(head + body, threadId, type);
  }

  if (sub === 'clear' || sub === 'reset' || sub === 'del' || sub === 'delete') {
    return api.sendMessage('ERROR: Khong the xoa admin cao cap. Ban chi co the doi bang: admincaocap set @user', threadId, type);
  }

  if (sub === 'set' || sub === 'add') {
    const mentions = Array.isArray(data?.mentions) ? data.mentions : [];
    const targetUid = mentions?.[0]?.uid ? String(mentions[0].uid).trim() : '';
    if (!targetUid) {
      return api.sendMessage('ERROR: Hay tag 1 nguoi. Dung: admincaocap set @user', threadId, type);
    }

    if (conf.uid && conf.uid !== targetUid) {
      const currentNameText = buildMentionText(conf.name || '');
      const msgText = `ERROR: Admin cao cap da duoc set (chi 1 lan). Hien tai: ${conf.uid ? currentNameText : 'UNKNOWN'}`;
      const pos = conf.uid ? msgText.indexOf(currentNameText) : -1;
      return api.sendMessage(conf.uid ? {
        msg: msgText,
        mentions: [{ uid: conf.uid, pos: pos >= 0 ? pos : 0, len: currentNameText.length }]
      } : msgText, threadId, type);
    }

    const mentionName = typeof mentions?.[0]?.tag === 'string'
      ? mentions[0].tag
      : (typeof mentions?.[0]?.title === 'string' ? mentions[0].title : '');
    const resolvedName = await resolveUserName(api, targetUid, mentionName);

    threadInfo.super_admin = {
      uid: targetUid,
      name: resolvedName,
      lockedCommands: conf.lockedCommands
    };
    await Threads.setData(threadId, threadInfo);
    const tagText = buildMentionText(resolvedName);
    const msgText = `OK: Da set admin cao cap: ${tagText}`;
    const pos = msgText.indexOf(tagText);
    return api.sendMessage({
      msg: msgText,
      mentions: [{ uid: targetUid, pos: pos >= 0 ? pos : 0, len: tagText.length }]
    }, threadId, type);
  }

  if (sub === 'lock' || sub === 'only') {
    const next = uniqLower(args.slice(1));
    if (!next.length) {
      return api.sendMessage('ERROR: Hay nhap danh sach lenh can khoa. Vi du: admincaocap lock kickall ban mute', threadId, type);
    }
    const merged = uniqLower([...(conf.lockedCommands || []), ...next]);
    threadInfo.super_admin = {
      uid: conf.uid,
      name: conf.name,
      lockedCommands: merged
    };
    await Threads.setData(threadId, threadInfo);
    return api.sendMessage(`OK: Da khoa ${next.length} lenh (chi admin cao cap duoc dung). Tong locked: ${merged.length}`, threadId, type);
  }

  if (sub === 'unlock' || sub === 'open' || sub === 'remove') {
    const toRemove = new Set(uniqLower(args.slice(1)));
    if (!toRemove.size) {
      return api.sendMessage('ERROR: Hay nhap lenh can mo khoa. Vi du: admincaocap unlock kickall', threadId, type);
    }
    const remain = (conf.lockedCommands || []).filter((x) => !toRemove.has(normalizeCmdToken(x)));
    threadInfo.super_admin = {
      uid: conf.uid,
      name: conf.name,
      lockedCommands: uniqLower(remain)
    };
    await Threads.setData(threadId, threadInfo);
    return api.sendMessage(`OK: Da mo khoa. Tong locked: ${threadInfo.super_admin.lockedCommands.length}`, threadId, type);
  }

  if (sub === 'locklist' || sub === 'list') {
    const locked = conf.lockedCommands;
    const body = locked.length
      ? `LOCKED COMMANDS (${locked.length})\n` + locked.map((x, i) => `${i + 1}. ${x}`).join('\n')
      : 'LOCKED COMMANDS: EMPTY';
    return api.sendMessage(body, threadId, type);
  }

  return api.sendMessage(
    'ADMINCAOCAP\n- admincaocap help\n- admincaocap set @user\n- admincaocap info\n- khoalenh <tenlenh...>\n- mokhalenh <tenlenh...>\n- admincaocap locklist',
    threadId,
    type
  );
};