const MAX_VIOLATIONS = 3;
const VIOLATION_RESET_MS = 10 * 60 * 1000;
const PHOTO_MSG_TYPES = new Set([
  "chat.photo",
  "photo",
  "image",
  "chat.image",
  "chat.photo.zalocore"
]);

const STICKER_TYPE_HINTS = [/sticker/i, /sticker\.*/i];

module.exports.config = {
  name: "antiPhoto",
  version: "1.0.0",
  author: "Cascade",
  description: "Cảnh cáo và kick người gửi ảnh khi tính năng được bật",
  event_type: ["message"]
};

function ensureViolationStore() {
  if (!(global.__bonzAntiPhotoViolations instanceof Map)) {
    global.__bonzAntiPhotoViolations = new Map();
  }
  return global.__bonzAntiPhotoViolations;
}

function incrementViolation(threadId, senderId) {
  const store = ensureViolationStore();
  const threadKey = String(threadId);
  if (!store.has(threadKey)) {
    store.set(threadKey, new Map());
  }
  const threadMap = store.get(threadKey);
  const now = Date.now();
  const record = threadMap.get(senderId) || { count: 0, lastAt: 0 };
  if (now - record.lastAt > VIOLATION_RESET_MS) {
    record.count = 0;
  }
  record.count += 1;
  record.lastAt = now;
  threadMap.set(senderId, record);
  return record.count;
}

function resetViolation(threadId, senderId) {
  const store = ensureViolationStore();
  const threadMap = store.get(String(threadId));
  if (threadMap) {
    threadMap.delete(senderId);
  }
}

function extractMessageIds(payload) {
  try {
    const data = payload?.data || payload;
    const msgId = data?.msgId || data?.messageId;
    const cliMsgId = data?.cliMsgId || data?.clientMsgId;
    return {
      msgId: msgId ?? null,
      cliMsgId: cliMsgId ?? null
    };
  } catch {
    return { msgId: null, cliMsgId: null };
  }
}

async function safeDelete(api, threadId, type, ids) {
  try {
    if (!ids?.msgId && !ids?.cliMsgId) return;
    await api.deleteMessage(
      {
        threadId,
        type,
        data: {
          msgId: ids.msgId || "",
          cliMsgId: ids.cliMsgId || 0
        }
      },
      false
    );
  } catch (_) {}
}

function scheduleDelete(api, threadId, type, ids, delayMs) {
  try {
    setTimeout(() => {
      safeDelete(api, threadId, type, ids);
    }, Math.max(0, Number(delayMs) || 0));
  } catch (_) {}
}

function hasPhotoAttachment(data = {}) {
  const attachments = data?.propertyExt?.attachments;
  if (Array.isArray(attachments)) {
    const hasPhoto = attachments.some((att) => {
      const t = String(att?.type || '').toLowerCase();
      if (!t) return false;
      if (STICKER_TYPE_HINTS.some((re) => re.test(t))) return false;
      // Only accept explicit photo/image types
      if (PHOTO_MSG_TYPES.has(t)) return true;
      if (t === 'photo' || t === 'image') return true;
      if (t === 'chat.photo' || t === 'chat.image' || t === 'chat.photo.zalocore') return true;
      // Avoid broad regex that can match sticker payloads
      return false;
    });
    if (hasPhoto) return true;
  }

  const mediaList = data?.propertyExt?.mediaList;
  if (Array.isArray(mediaList)) {
    const hasPhoto = mediaList.some((item) => {
      const t = String(item?.type || '').toLowerCase();
      if (!t) return false;
      if (STICKER_TYPE_HINTS.some((re) => re.test(t))) return false;
      if (PHOTO_MSG_TYPES.has(t)) return true;
      if (t === 'photo' || t === 'image') return true;
      if (t === 'chat.photo' || t === 'chat.image' || t === 'chat.photo.zalocore') return true;
      return false;
    });
    if (hasPhoto) return true;
  }

  if (typeof data.image_url === "string" && data.image_url) return true;
  if (Array.isArray(data.attachments)) {
    const hasPhoto = data.attachments.some((att) => {
      const t = String(att?.type || '').toLowerCase();
      if (!t) return false;
      if (STICKER_TYPE_HINTS.some((re) => re.test(t))) return false;
      if (PHOTO_MSG_TYPES.has(t)) return true;
      if (t === 'photo' || t === 'image') return true;
      if (t === 'chat.photo' || t === 'chat.image' || t === 'chat.photo.zalocore') return true;
      return false;
    });
    if (hasPhoto) return true;
  }

  return false;
}

function isPhotoMessage(event = {}) {
  const data = event.data || {};
  const msgType = String(data.msgType || data.type || "").toLowerCase();
  if (/sticker/.test(msgType)) return false;
  if (PHOTO_MSG_TYPES.has(msgType)) return true;
  if (/photo|image/.test(msgType)) return true;
  return hasPhotoAttachment(data);
}

async function isAntiPhotoEnabled(threadId, Threads) {
  const envDefault = process.env.ANTI_PHOTO_DEFAULT === "on";
  if (!threadId || !Threads || typeof Threads.getData !== "function") {
    return envDefault;
  }
  try {
    const data = await Threads.getData(threadId);
    if (typeof data?.data?.antiPhoto?.enabled === "boolean") {
      return data.data.antiPhoto.enabled;
    }
    return envDefault;
  } catch {
    return envDefault;
  }
}

module.exports.run = async function antiPhoto({ api, event, eventType, Threads }) {
  try {
    if ((eventType || event?.eventType) !== "message") return;
    if (!event || !event.data || !event.threadId) return;
    if (event.data.isOutbox || event.data.isSelf || event.isSelf) return;
    if (!isPhotoMessage(event)) return;

    const featureEnabled = await isAntiPhotoEnabled(event.threadId, Threads);
    if (!featureEnabled) return;

    const threadId = event.threadId;
    const type = event.type;
    const senderId = String(event.data.uidFrom || event.authorId || "");
    if (!senderId) return;

    const senderName = event.data.dName || event.data.displayName || "Người dùng";
    const violationCount = incrementViolation(threadId, senderId);

    const lines = [
      "ANTI PHOTO",
      `ng vi phạm : ${senderName}`,
      `số lần : ${violationCount}/${MAX_VIOLATIONS}`,
      "bot by : bonz",
      "thông báo : vui lòng không gửi ảnh trong nhóm này"
    ];

    let kicked = false;
    let kickError = null;
    const isGroupThread =
      event.isGroup === true ||
      event.type === "group" ||
      event.type === 1 ||
      (String(threadId || "").length > 15 && event.type !== 0);

    if (violationCount >= MAX_VIOLATIONS && isGroupThread) {
      try {
        await api.removeUserFromGroup(senderId, threadId);
        kicked = true;
        resetViolation(threadId, senderId);
      } catch (error) {
        kickError = error;
      }
    }

    if (kicked) {
      lines.push("", "👢 Đã kick khỏi nhóm vì gửi ảnh.");
    } else if (violationCount >= MAX_VIOLATIONS) {
      lines.push(
        "",
        "⚠️ Bot không có quyền kick hoặc đang ở cuộc trò chuyện riêng – vui lòng kiểm tra quyền admin."
      );
    }

    const warning = lines.join("\n");
    const mentionPos = warning.indexOf(senderName);
    const mentions = [{ pos: mentionPos >= 0 ? mentionPos : 0, uid: senderId, len: String(senderName).length }];

    try {
      await api.deleteMessage(event, false);
    } catch (_) {}

    const sent = await api.sendMessage({ msg: warning, mentions }, threadId, type);
    const ids = extractMessageIds(sent);
    scheduleDelete(api, threadId, type, ids, 60000);

    if (kickError) {
      console.warn("[antiPhoto] Không thể kick user:", kickError?.message || kickError);
    }
  } catch (error) {
    console.warn("[antiPhoto] Lỗi cảnh cáo ảnh:", error?.message || error);
  }
};
