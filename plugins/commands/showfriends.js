const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');

module.exports.config = {
  name: 'showfriends',
  aliases: ['friends', 'friendlist', 'listfriends'],
  version: '3.0.0',
  role: 2,
  author: 'Cascade Ultra',
  description: 'Hiển thị danh sách bạn bè với thiết kế hiện đại',
  category: 'Quản trị',
  usage: 'showfriends [page]|[export]',
  cooldowns: 5
};

const PAGE_SIZE = 15;
const TTL = 60000;
const CACHE_DIR = path.join(__dirname, '../../cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function fetchFriends(api) {
  const methods = [
    async () => typeof api.getFriendsList === 'function' ? api.getFriendsList() : null,
    async () => typeof api.getAllFriends === 'function' ? api.getAllFriends() : null,
    async () => typeof api.fetchAllFriends === 'function' ? api.fetchAllFriends() : null
  ];

  for (const method of methods) {
    try {
      const res = await method();
      if (Array.isArray(res) && res.length > 0) return res;
    } catch (err) {
      console.log('[showfriends] fetch method fail:', err.message);
    }
  }
  return [];
}

function normalizeFriend(item) {
  if (!item) return null;
  if (typeof item === 'string') return { id: item, name: '', avatar: null };
  const id = item.id || item.uid || item.userID || item.userId || item.odId || item.odid;
  const name = item.name || item.fullName || item.displayName || item.nickname || '';
  const avatar = item.avatar || item.avatarUrl || item.profilePicture || item.thumbSrc || null;
  if (!id) return null;
  return { id: String(id), name: String(name || '').trim(), avatar };
}

async function enrichFriendsWithInfo(api, friends) {
  const enriched = [];
  for (const friend of friends) {
    try {
      const info = await api.getUserInfo(friend.id);
      const userData = info?.changed_profiles?.[friend.id] || info?.[friend.id] || info;
      
      enriched.push({
        id: friend.id,
        name: userData?.displayName || userData?.name || friend.name || 'Không tên',
        avatar: userData?.avatar || userData?.avatarUrl || friend.avatar
      });
    } catch {
      enriched.push(friend);
    }
  }
  return enriched;
}

function paginate(list, page) {
  if (page < 1) page = 1;
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  return { page: safePage, totalPages, slice: list.slice(start, end), total };
}

async function exportToFile(friends) {
  const lines = friends.map((f, idx) => `${idx + 1}. ${f.name || 'Không tên'} - ${f.id}`);
  const content = [
    `Danh sách ${friends.length} bạn bè của bot`,
    '========================================',
    ...lines
  ].join('\n');

  ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `friends_${Date.now()}.txt`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
  if (!text) return 'Không tên';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated ? `${truncated}…` : text.slice(0, 1);
}

async function downloadAvatar(url) {
  if (!url) return null;
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (response.data && response.data.length > 500) {
      return await loadImage(Buffer.from(response.data));
    }
  } catch (e) {
    console.log('[showfriends] Failed to load avatar:', e.message);
  }
  return null;
}

function drawModernAvatar(ctx, image, x, y, size) {
  const glowGrad = ctx.createRadialGradient(x + size/2, y + size/2, size/2 - 5, x + size/2, y + size/2, size/2 + 12);
  glowGrad.addColorStop(0, 'rgba(139, 92, 246, 0.6)');
  glowGrad.addColorStop(0.5, 'rgba(236, 72, 153, 0.4)');
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2 + 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
  ctx.clip();
  
  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, '#667eea');
    grad.addColorStop(0.5, '#764ba2');
    grad.addColorStop(1, '#f093fb');
    ctx.fillStyle = grad;
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * 0.5}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👤', x + size/2, y + size/2);
  }
  
  ctx.restore();
  
  const borderGrad = ctx.createLinearGradient(x, y, x + size, y + size);
  borderGrad.addColorStop(0, '#8b5cf6');
  borderGrad.addColorStop(0.5, '#ec4899');
  borderGrad.addColorStop(1, '#3b82f6');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGlassCard(ctx, x, y, w, h, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fill();
  ctx.restore();

  roundRect(ctx, x, y, w, h, r);
  const glassGrad = ctx.createLinearGradient(x, y, x, y + h);
  glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
  glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
  ctx.fillStyle = glassGrad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  const highlight = ctx.createLinearGradient(x, y, x, y + h * 0.3);
  highlight.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  highlight.addColorStop(1, 'transparent');
  ctx.fillStyle = highlight;
  ctx.fillRect(x, y, w, h * 0.3);
  ctx.restore();
}

async function createFriendsCanvas(friends, meta = {}) {
  ensureCacheDir();

  const width = 1800;
  const rowHeight = 105;
  const headerHeight = 320;
  const footerHeight = 160;
  const bodyHeight = Math.max(friends.length, 1) * rowHeight;
  const height = headerHeight + bodyHeight + footerHeight + 150;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0a0e27');
  bg.addColorStop(0.3, '#1a1438');
  bg.addColorStop(0.7, '#0f1729');
  bg.addColorStop(1, '#050a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const orbs = [
    { x: width * 0.15, y: height * 0.2, r: 350, colors: ['rgba(139, 92, 246, 0.3)', 'rgba(99, 102, 241, 0.15)'] },
    { x: width * 0.85, y: height * 0.4, r: 400, colors: ['rgba(236, 72, 153, 0.25)', 'rgba(219, 39, 119, 0.12)'] },
    { x: width * 0.5, y: height * 0.7, r: 320, colors: ['rgba(59, 130, 246, 0.2)', 'rgba(37, 99, 235, 0.1)'] }
  ];
  
  orbs.forEach(orb => {
    const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
    grad.addColorStop(0, orb.colors[0]);
    grad.addColorStop(0.5, orb.colors[1]);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  });

  ctx.strokeStyle = 'rgba(139, 92, 246, 0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }
  for (let j = 0; j < height; j += 50) {
    ctx.beginPath();
    ctx.moveTo(0, j);
    ctx.lineTo(width, j);
    ctx.stroke();
  }

  const headerX = 80;
  const headerW = width - headerX * 2;
  const headerY = 50;

  drawGlassCard(ctx, headerX, headerY, headerW, 240, 30);

  const titleStartX = headerX + 60;

  const titleGrad = ctx.createLinearGradient(titleStartX, 0, titleStartX + 400, 0);
  titleGrad.addColorStop(0, '#fde68a');
  titleGrad.addColorStop(0.3, '#f472b6');
  titleGrad.addColorStop(0.7, '#60a5fa');
  titleGrad.addColorStop(1, '#c084fc');
  
  ctx.fillStyle = titleGrad;
  ctx.font = 'bold 72px Arial';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
  ctx.shadowBlur = 20;
  ctx.fillText('BẠN CỦA TAO', titleStartX, headerY + 95);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '600 32px Arial';
  ctx.fillText('Dashboard & Analytics', titleStartX, headerY + 140);

  const badgeY = headerY + 170;
  const badges = [
    { icon: '👥', label: 'Total', value: meta.total || 0, color: '#3b82f6' },
    { icon: '📄', label: 'Page', value: `${meta.safePage || 1}/${meta.totalPages || 1}`, color: '#ec4899' },
    { icon: '🎯', label: 'Showing', value: friends.length, color: '#8b5cf6' }
  ];

  badges.forEach((badge, i) => {
    const bw = 190;
    const bh = 72;
    const bx = headerX + 50 + i * 210;

    roundRect(ctx, bx, badgeY, bw, bh, 18);
    const badgeGrad = ctx.createLinearGradient(bx, badgeY, bx, badgeY + bh);
    badgeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    badgeGrad.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
    ctx.fillStyle = badgeGrad;
    ctx.fill();

    ctx.strokeStyle = badge.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = badge.color;
    ctx.font = '600 32px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(badge.icon, bx + 18, badgeY + 45);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '600 18px Arial';
    ctx.fillText(badge.label, bx + 60, badgeY + 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Arial';
    ctx.fillText(String(badge.value), bx + 60, badgeY + 55);
  });

  const tableX = 80;
  const tableY = headerHeight;
  const tableW = width - tableX * 2;

  const avatarPromises = friends.map(f => downloadAvatar(f.avatar));
  const avatars = await Promise.all(avatarPromises);

  friends.forEach((friend, idx) => {
    const cardY = tableY + idx * rowHeight;
    const cardPadding = 15;
    
    drawGlassCard(ctx, tableX + cardPadding, cardY + cardPadding, tableW - cardPadding * 2, rowHeight - cardPadding * 2, 20);

    const indexBadgeX = tableX + 40;
    const indexBadgeY = cardY + rowHeight/2;
    
    roundRect(ctx, indexBadgeX - 20, indexBadgeY - 25, 60, 50, 12);
    const indexGrad = ctx.createLinearGradient(indexBadgeX - 20, indexBadgeY - 25, indexBadgeX + 40, indexBadgeY + 25);
    indexGrad.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
    indexGrad.addColorStop(1, 'rgba(236, 72, 153, 0.3)');
    ctx.fillStyle = indexGrad;
    ctx.fill();
    
    const globalIndex = ((meta.safePage || 1) - 1) * PAGE_SIZE + idx + 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(globalIndex), indexBadgeX + 10, indexBadgeY + 8);

    const avatarSize = 72;
    const avatarX = tableX + 130;
    const avatarY = cardY + (rowHeight - avatarSize) / 2;
    drawModernAvatar(ctx, avatars[idx], avatarX, avatarY, avatarSize);

    const nameX = avatarX + avatarSize + 40;
    const nameY = cardY + rowHeight/2;
    
    ctx.textAlign = 'left';
    const nameGrad = ctx.createLinearGradient(nameX, 0, nameX + 400, 0);
    nameGrad.addColorStop(0, '#fbbf24');
    nameGrad.addColorStop(0.5, '#f472b6');
    nameGrad.addColorStop(1, '#60a5fa');
    
    ctx.fillStyle = nameGrad;
    ctx.font = 'bold 34px Arial';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 8;
    
    const maxNameWidth = tableW - 400;
    const displayName = truncateText(ctx, friend.name || 'Không tên', maxNameWidth);
    ctx.fillText(displayName, nameX, nameY + 8);
    ctx.shadowBlur = 0;

    if (idx % 3 === 0) {
      const dotX = tableW + tableX - 70;
      const dotY = cardY + rowHeight/2;
      
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.lineWidth = 8;
      ctx.stroke();
    }
  });

  const footerY = tableY + bodyHeight + 40;
  drawGlassCard(ctx, tableX, footerY, tableW, 120, 25);

  const footerTextGrad = ctx.createLinearGradient(tableX + 50, 0, tableX + 500, 0);
  footerTextGrad.addColorStop(0, '#8b5cf6');
  footerTextGrad.addColorStop(0.5, '#ec4899');
  footerTextGrad.addColorStop(1, '#3b82f6');
  
  ctx.fillStyle = footerTextGrad;
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('💡 Quick Tips', tableX + 50, footerY + 45);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '600 24px Arial';
  ctx.fillText(`Use "showfriends ${(meta.safePage || 1) + 1}" for next page • "showfriends export" to download all`, tableX + 50, footerY + 85);

  const brandY = footerY + 138;
  const brandGrad = ctx.createLinearGradient(width/2 - 150, 0, width/2 + 150, 0);
  brandGrad.addColorStop(0, '#8b5cf6');
  brandGrad.addColorStop(0.5, '#ec4899');
  brandGrad.addColorStop(1, '#f59e0b');
  
  ctx.fillStyle = brandGrad;
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(236, 72, 153, 0.6)';
  ctx.shadowBlur = 20;
  ctx.fillText('✨ BONZ BOT ULTRA ✨', width/2, brandY);
  ctx.shadowBlur = 0;

  const outPath = path.join(CACHE_DIR, `friends_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event || {};
  if (!threadId) return;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  const friendsRaw = await fetchFriends(api);
  const friendsNormalized = friendsRaw.map(normalizeFriend).filter(Boolean);

  if (friendsNormalized.length === 0) {
    return api.sendMessage({
      msg: '❌ Không thể lấy danh sách bạn bè. Có thể API không hỗ trợ hoặc bot hiện chưa có bạn.',
      ttl: TTL
    }, threadId, type);
  }

  const option = (args?.[0] || '').toLowerCase();
  if (option === 'export' || option === 'txt') {
    try {
      const filePath = await exportToFile(friendsNormalized);
      await api.sendMessage({
        msg: `📄 Export danh sách ${friendsNormalized.length} bạn bè thành file txt.`,
        attachments: [filePath],
        ttl: TTL
      }, threadId, type);
      setTimeout(() => {
        try { fs.existsSync(filePath) && fs.unlinkSync(filePath); } catch {}
      }, TTL + 5000);
    } catch (err) {
      await api.sendMessage({
        msg: `❌ Xuất file thất bại: ${err.message}`,
        ttl: TTL
      }, threadId, type);
    }
    return;
  }

  const page = Number(option) || 1;
  const { page: safePage, totalPages, slice, total } = paginate(friendsNormalized, page);

  try {
    const enrichedFriends = await enrichFriendsWithInfo(api, slice);

    const meta = {
      safePage,
      totalPages,
      total,
      prefix: global.config?.prefix || '/'
    };

    const imgPath = await createFriendsCanvas(enrichedFriends, meta);

    await api.sendMessage({
      msg: `✨ Friendlist Dashboard Ultra • Page ${safePage}/${totalPages}\n💡 Tip: showfriends <page> | showfriends export`,
      attachments: [imgPath],
      ttl: TTL
    }, threadId, type);

    setTimeout(() => {
      try { fs.existsSync(imgPath) && fs.unlinkSync(imgPath); } catch {}
    }, TTL + 5000);
  } catch (err) {
    const lines = slice.map((f, idx) => {
      const globalIndex = (safePage - 1) * PAGE_SIZE + idx + 1;
      const alias = f.name ? ` - ${f.name}` : '';
      return `${globalIndex}. ${alias || 'Không tên'}`;
    });

    const fallback = [
      `📇 DANH SÁCH BẠN BÈ (${total} người)`,
      `Trang ${safePage}/${totalPages} (mỗi trang ${PAGE_SIZE})`,
      '────────────────────────────',
      ...lines,
      '',
      '📌 Tip:',
      `• Dùng "showfriends ${safePage + 1}" để xem trang tiếp (nếu có).`,
      '• Dùng "showfriends export" để xuất toàn bộ thành file txt.',
      '',
      `⚠️ Không render được ảnh: ${err.message}`
    ].join('\n');

    return api.sendMessage({ msg: fallback, ttl: TTL }, threadId, type);
  }
};