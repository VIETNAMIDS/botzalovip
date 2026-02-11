const { ThreadType } = require('zca-js');

module.exports.config = {
  name: 'adminvip',
  aliases: ['avip', 'vipdm'],
  version: '1.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Tag ai đó để bot gửi tin nhắn cá nhân cho người đó (chỉ admin bot)',
  category: 'Quản lý',
  usage: 'adminvip @user <nội dung>',
  cooldowns: 3
};

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot)
    ? cfg.owner_bot.map(String)
    : (typeof cfg.owner_bot === 'string' && cfg.owner_bot.trim() ? [cfg.owner_bot.trim()] : []);
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist]);
  return all.has(String(uid));
}

function escapeRegExp(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type, data } = event || {};

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  if (Number(type) !== ThreadType.Group) {
    return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const senderId = String(data?.uidFrom || event?.authorId || '');
  if (!senderId || !isBotAdmin(senderId)) {
    return api.sendMessage('❌ Bạn không có quyền dùng lệnh này.', threadId, type);
  }

  const mentions = data?.mentions;
  if (!Array.isArray(mentions) || mentions.length === 0) {
    return api.sendMessage('❌ Bạn cần tag 1 người.\nDùng: adminvip @user <nội dung>', threadId, type);
  }

  let rawText = (args || []).join(' ').trim();
  if (!rawText) {
    return api.sendMessage('❌ Thiếu nội dung cần gửi.\nDùng: adminvip @user <nội dung>', threadId, type);
  }

  const nameCache = {};
  for (const m of mentions) {
    const uid = m?.uid;
    if (!uid) continue;
    try {
      const info = await api.getUserInfo(uid);
      nameCache[uid] = info?.changed_profiles?.[uid]?.displayName || '';
    } catch {
      nameCache[uid] = '';
    }
  }

  const removeOnce = (str, pattern) => {
    const re = new RegExp(`(^|\\s)${pattern}(?=\\s|$)`, 'i');
    return str.replace(re, (m, p1) => (p1 ? p1 : '')).replace(/\s{2,}/g, ' ').trim();
  };

  let cleanedText = rawText;
  for (const uid in nameCache) {
    const displayName = nameCache[uid];
    if (!displayName) continue;
    const escaped = escapeRegExp(`@${displayName}`);
    cleanedText = removeOnce(cleanedText, escaped);
  }
  cleanedText = cleanedText.replace(/@[\S]+/g, '').replace(/\s{2,}/g, ' ').trim();

  if (!cleanedText) {
    return api.sendMessage('❌ Không nhận diện được nội dung sau khi bỏ tag.\nDùng: adminvip @user <nội dung>', threadId, type);
  }

  let ok = 0;
  for (const m of mentions) {
    const targetId = String(m?.uid || '').trim();
    if (!targetId) continue;
    try {
      await api.sendMessage(cleanedText, targetId, ThreadType.User);
      ok += 1;
    } catch {}
  }

  if (ok === 0) {
    return api.sendMessage('❌ Không gửi được tin nhắn cá nhân. Có thể user chặn tin nhắn hoặc API lỗi.', threadId, type);
  }

  return;
};
