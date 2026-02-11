const { ThreadType } = require('zca-js');
const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: 'cahan',
  aliases: ['cáhan', 'cahanon', 'cahanoff', 'dmrelay', 'ca'],
  version: '1.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Chọn 1 người nhận để forward toàn bộ tin nhắn cá nhân gửi vào bot',
  category: 'Quản lý',
  usage: 'cahan @user | cahan off | cahan status',
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

function ensureStore() {
  if (!global.__bonzDmRelay) {
    global.__bonzDmRelay = { enabled: false, targetId: null, setBy: null, setAt: null };
  }
  return global.__bonzDmRelay;
}

const dmRelayPath = path.join(__dirname, '..', '..', 'data', 'dm_relay.json');

function ensureDataDir() {
  const dir = path.dirname(dmRelayPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadPersistedStore() {
  try {
    ensureDataDir();
    if (!fs.existsSync(dmRelayPath)) return;
    const raw = fs.readFileSync(dmRelayPath, 'utf8');
    const parsed = JSON.parse(raw);
    const store = ensureStore();
    if (typeof parsed?.enabled === 'boolean') store.enabled = parsed.enabled;
    if (typeof parsed?.targetId === 'string' || parsed?.targetId == null) store.targetId = parsed.targetId;
    if (typeof parsed?.setBy === 'string' || parsed?.setBy == null) store.setBy = parsed.setBy;
    if (typeof parsed?.setAt === 'number' || parsed?.setAt == null) store.setAt = parsed.setAt;
  } catch {}
}

function persistStore(store) {
  try {
    ensureDataDir();
    const data = {
      enabled: Boolean(store?.enabled),
      targetId: store?.targetId ? String(store.targetId) : null,
      setBy: store?.setBy ? String(store.setBy) : null,
      setAt: typeof store?.setAt === 'number' ? store.setAt : null
    };
    fs.writeFileSync(dmRelayPath, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type, data } = event || {};
  const senderId = String(data?.uidFrom || event?.authorId || '');

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  if (!senderId || !isBotAdmin(senderId)) {
    return api.sendMessage('❌ Bạn không có quyền dùng lệnh này.', threadId, type);
  }

  loadPersistedStore();
  const store = ensureStore();
  const normalizedArgs = Array.isArray(args) ? [...args] : [];
  const first = String(normalizedArgs?.[0] || '').toLowerCase();
  // hỗ trợ cú pháp "ca han ..." (commandName = ca, args[0] = han)
  if (first === 'han') normalizedArgs.shift();
  const sub = String(normalizedArgs?.[0] || '').toLowerCase();

  if (sub === 'off' || sub === 'tắt' || sub === 'tat') {
    store.enabled = false;
    store.targetId = null;
    store.setBy = senderId;
    store.setAt = Date.now();
    persistStore(store);
    return api.sendMessage('✅ Đã tắt chế độ chuyển tiếp tin nhắn cá nhân.', threadId, type);
  }

  if (sub === 'status' || sub === 'st') {
    if (!store.enabled || !store.targetId) {
      return api.sendMessage('📩 DM relay: OFF', threadId, type);
    }

    let name = '';
    try {
      const info = await api.getUserInfo(store.targetId);
      name = info?.changed_profiles?.[store.targetId]?.displayName || '';
    } catch {}

    const who = name ? `${name} (${store.targetId})` : store.targetId;
    return api.sendMessage(`📩 DM relay: ON\n👤 Người nhận: ${who}`, threadId, type);
  }

  const mentions = data?.mentions;
  if (!Array.isArray(mentions) || mentions.length === 0 || !mentions[0]?.uid) {
    return api.sendMessage('❌ Dùng: cahan @user\nHoặc: cahan off | cahan status', threadId, type);
  }

  const targetId = String(mentions[0].uid);
  store.enabled = true;
  store.targetId = targetId;
  store.setBy = senderId;
  store.setAt = Date.now();
  persistStore(store);

  return api.sendMessage('✅ Đã bật chuyển tiếp DM về người được tag.', threadId, type);
};
