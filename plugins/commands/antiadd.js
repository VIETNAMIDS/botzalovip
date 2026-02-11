const { ThreadType } = require('zca-js');
const { isAntiAddEnabled, setAntiAddState, getAntiAddStatus } = require('../utils/antiAddSettings');

module.exports.config = {
  name: 'antiadd',
  aliases: ['anti-add', 'anti add'],
  version: '2.0.0',
  role: 1,
  author: 'Cascade',
  description: 'Bật/tắt chế độ anti-add để tự động rời nhóm khi bị add trái phép',
  usage: 'antiadd [on|off|status|global on|global off]',
  cooldowns: 2,
};

function isBotAdmin(uid) {
  try {
    const s = String(uid);
    const config = global?.config || {};
    const owners = Array.isArray(config.owner_bot) ? config.owner_bot.map(String) : [];
    const admins = Array.isArray(config.admin_bot) ? config.admin_bot.map(String) : [];
    return owners.includes(s) || admins.includes(s);
  } catch {
    return false;
  }
}

async function isGroupAdmin(api, threadId, userId) {
  try {
    const info = await api.getGroupInfo(threadId);
    const group = info?.gridInfoMap?.[threadId] || {};
    const adminIds = Array.isArray(group.adminIds) ? group.adminIds.map(String) : [];
    return adminIds.includes(String(userId)) || group.creatorId === String(userId);
  } catch (error) {
    console.warn('[antiadd] Không thể kiểm tra quyền admin nhóm:', error?.message || error);
    return false;
  }
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, data } = event;
  const senderId = String(data?.uidFrom || event.senderID || event.authorId);
  const tokens = Array.isArray(args) ? args.map((tok) => String(tok)) : [];
  const first = (tokens[0] || '').toLowerCase();
  const second = (tokens[1] || '').toLowerCase();

  if (first === 'global') {
    if (!isBotAdmin(senderId)) {
      return api.sendMessage('❌ Chỉ admin/owner bot mới chỉnh global anti-add.', threadId, type);
    }
    if (!['on', 'off', 'enable', 'disable'].includes(second)) {
      return api.sendMessage('❗ Dùng: antiadd global <on|off>', threadId, type);
    }
    setAntiAddState(null, second === 'on' || second === 'enable');
    return api.sendMessage(second === 'on' || second === 'enable'
      ? '🛡️ Anti-Add global đã 🟢 bật. Bot sẽ rời mọi nhóm mới bị add trừ khi nhóm đó bật thủ công.'
      : '🛑 Anti-Add global đã 🔴 tắt. Chỉ áp dụng khi bật thủ công trong nhóm.', threadId, type);
  }

  const inGroup = type === ThreadType.Group;
  const targetThread = inGroup ? threadId : tokens[0];
  const actionToken = inGroup ? first : second;

  if (!targetThread) {
    return api.sendMessage('❗ Dùng: antiadd <on|off|status> (trong nhóm) hoặc antiadd <threadId> <on|off> (ngoài nhóm).', threadId, type);
  }

  if (!inGroup && !isBotAdmin(senderId)) {
    return api.sendMessage('❌ Bạn cần là admin/owner bot để cấu hình anti-add ngoài nhóm.', threadId, type);
  }

  if (inGroup) {
    const hasPermission = isBotAdmin(senderId) || await isGroupAdmin(api, threadId, senderId);
    if (!hasPermission) {
      return api.sendMessage('❌ Bạn cần là quản trị nhóm hoặc admin bot để dùng lệnh này.', threadId, type);
    }
  }

  if (!actionToken || actionToken === 'status') {
    const { globalEnabled, threadEnabled } = getAntiAddStatus(targetThread);
    const statusText = threadEnabled ?? globalEnabled;
    return api.sendMessage(`🛡️ Anti-Add ${statusText ? 'đang 🟢 bật' : 'đang 🔴 tắt'}
Global: ${globalEnabled ? '🟢 bật' : '🔴 tắt'}`, threadId, type);
  }

  if (!['on', 'off', 'enable', 'disable'].includes(actionToken)) {
    return api.sendMessage('❗ Dùng: antiadd on | antiadd off | antiadd status', threadId, type);
  }

  const enable = actionToken === 'on' || actionToken === 'enable';
  setAntiAddState(targetThread, enable);
  return api.sendMessage(enable
    ? '✅ Anti-Add đã bật cho nhóm này. Bot sẽ tự out nếu bị add trái phép.'
    : '⛔ Anti-Add đã tắt cho nhóm này. Bot sẽ vẫn ở lại khi bị add.', threadId, type);
};


