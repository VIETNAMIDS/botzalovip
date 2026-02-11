const { GroupEventType } = require('zca-js');
const { isAntiAddEnabled } = require('../utils/antiAddSettings');

module.exports.config = {
  event_type: [],
  name: 'antiAddGuard',
  version: '1.0.0',
  author: 'Cascade',
  description: 'Tự động rời nhóm khi bị add trái phép nếu Anti-Add đang bật'
};

function getBotId(api) {
  try {
    if (typeof api.getOwnId === 'function') {
      const id = api.getOwnId();
      if (id) return String(id);
    }
  } catch {}
  return String(global?.botID || global?.config?.bot_id || '');
}

async function getThreadName(api, threadId) {
  try {
    const info = await api.getGroupInfo(threadId);
    return info?.gridInfoMap?.[threadId]?.name || 'nhóm này';
  } catch {
    return 'nhóm này';
  }
}

async function getUserName(api, userId) {
  if (!userId) return 'Không rõ';
  try {
    const info = await api.getUserInfo(String(userId));
    const profile = info?.changed_profiles?.[userId] || info?.unchanged_profiles?.[userId];
    return profile?.displayName || profile?.name || 'Không rõ';
  } catch {
    return 'Không rõ';
  }
}

module.exports.run = async function ({ api, event }) {
  if (event.type !== GroupEventType.JOIN) return;
  const { threadId, data } = event;
  if (!threadId || !data?.updateMembers?.length) return;

  if (!isAntiAddEnabled(threadId)) return;

  const botId = getBotId(api);
  if (!botId) return;

  const botJustAdded = data.updateMembers.some((member) => String(member.id) === String(botId));
  if (!botJustAdded) return;

  const adderId = data.sourceId;
  const [groupName, adderName] = await Promise.all([
    getThreadName(api, threadId),
    getUserName(api, adderId),
  ]);

  const message = `Tên nhóm: ${groupName}
Ng add: ${adderName}
ADD CON ME MAY , ADD NX CON ME MAY CHET Á`;

  try {
    await api.sendMessage({ msg: message, ttl: 60000 }, threadId, event.type);
  } catch (error) {
    console.warn('[antiAddGuard] Không gửi được cảnh báo:', error?.message || error);
  }

  try {
    await api.leaveGroup(threadId);
  } catch (error) {
    console.warn('[antiAddGuard] Không thể rời nhóm:', error?.message || error);
  }
};
