module.exports.config = {
  event_type: ["message"],
  name: "muteGuard",
  version: "1.0.0",
  author: "Cascade",
  description: "Chặn tin nhắn của thành viên đang bị mute trong nhóm",
  dependencies: {}
};

const PERMANENT_MUTE = -1; // thời hạn vĩnh viễn

function nowSec() { return Math.floor(Date.now() / 1000); }

function isMuted(threadData, userId) {
  const muteList = threadData?.muteList || {};
  const allInfo = muteList['-1'];
  const userInfo = muteList[String(userId)];

  const check = (info) => {
    if (!info) return false;
    if (info.timeMute === PERMANENT_MUTE) return true;
    return nowSec() < info.timeMute;
  };

  return check(allInfo) || check(userInfo);
}

module.exports.run = async ({ api, event, Threads }) => {
  const { threadId, type, data } = event;
  if (!threadId || !data) return;

  try {
    const thread = await Threads.getData(threadId);
    const tData = thread?.data || {};
    const senderId = String(data.uidFrom || event.authorId || '');

    if (!tData.muteList || Object.keys(tData.muteList).length === 0) return;

    if (isMuted(tData, senderId)) {
      try {
        await api.deleteMessage(event, false);
      } catch (_) {}
    }
  } catch (e) {
    // ignore
  }
};
