const { ThreadType } = require('zca-js');

module.exports.config = {
  name: 'mokhalenh',
  aliases: ['unlockcmd', 'unlockcommand', 'molock'],
  version: '1.0.0',
  role: 1,
  author: 'Cascade',
  description: 'Mo khoa 1 (hoac nhieu) lenh da bi khoa',
  category: 'Quản lý',
  usage: 'mokhalenh <tenlenh...>',
  cooldowns: 2
};

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
  if (!threadInfo || typeof threadInfo !== 'object') return { uid: null, lockedCommands: [] };
  const root = threadInfo.super_admin && typeof threadInfo.super_admin === 'object' ? threadInfo.super_admin : {};
  const uid = root.uid != null ? String(root.uid) : null;
  const lockedCommands = uniqLower(root.lockedCommands);
  return { uid: uid && uid.trim() ? uid.trim() : null, lockedCommands };
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

  const canManage = conf.uid
    ? (conf.uid === senderId)
    : (isBotAdmin(senderId) || await isGroupAdmin(api, threadId, senderId));
  if (!canManage) {
    return api.sendMessage('ERROR: Ban khong co quyen mo khoa lenh trong nhom nay.', threadId, type);
  }

  const cmdNames = uniqLower(args);
  if (!cmdNames.length) {
    return api.sendMessage('ERROR: Thieu ten lenh. Vi du: mokhalenh kickall', threadId, type);
  }

  const removeSet = new Set(cmdNames);
  const remain = (conf.lockedCommands || []).filter((x) => !removeSet.has(normalizeCmdToken(x)));
  threadInfo.super_admin = {
    uid: conf.uid,
    lockedCommands: uniqLower(remain)
  };
  await Threads.setData(threadId, threadInfo);

  return api.sendMessage(`OK: Da mo khoa ${cmdNames.length} lenh.`, threadId, type);
};
