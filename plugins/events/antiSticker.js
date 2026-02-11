const COOLDOWN_MS = 0;
const MAX_VIOLATIONS = 3;
const VIOLATION_RESET_MS = 10 * 60 * 1000;
const STICKER_MSG_TYPES = new Set([
  "chat.sticker",
  "chat.sticker.zalocore",
  "sticker",
  "sticker.zalocore",
  "chat.sticker.zcore"
]);

module.exports.config = {
  name: "antiSticker",
  version: "1.0.0",
  author: "Cascade",
  description: "Cảnh cáo mọi người gửi sticker trong nhóm",
  event_type: ["message"]
};

function ensureCooldownStore() {
  if (!(global.__bonzAntiStickerCooldown instanceof Map)) {
    global.__bonzAntiStickerCooldown = new Map();
  }
  return global.__bonzAntiStickerCooldown;
}

function ensureViolationStore() {
  if (!(global.__bonzAntiStickerViolations instanceof Map)) {
    global.__bonzAntiStickerViolations = new Map();
  }
  return global.__bonzAntiStickerViolations;
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

function isStickerMessage(event = {}) {
  const data = event.data || {};
  const msgType = String(data.msgType || data.type || "").toLowerCase();
  if (STICKER_MSG_TYPES.has(msgType)) return true;
  if (msgType.includes("sticker")) return true;

  const attachments = data?.propertyExt?.attachments;
  if (Array.isArray(attachments)) {
    return attachments.some((att) => String(att?.type || "").toLowerCase().includes("sticker"));
  }
  return false;
}

async function isAntiStickerEnabled(threadId, Threads) {
  if (!threadId || !Threads || typeof Threads.getData !== "function") {
    return process.env.ANTI_STICKER_DEFAULT === "on";
  }
  try {
    const data = await Threads.getData(threadId);
    if (data?.data?.antiSticker && typeof data.data.antiSticker.enabled === "boolean") {
      return data.data.antiSticker.enabled;
    }
    return process.env.ANTI_STICKER_DEFAULT === "on";
  } catch {
    return process.env.ANTI_STICKER_DEFAULT === "on";
  }
}

module.exports.run = async function antiSticker({ api, event, eventType, Threads }) {
  try {
    if ((eventType || event?.eventType) !== "message") return;
    if (!event || !event.data || !event.threadId) return;
    if (event.data.isOutbox || event.data.isSelf || event.isSelf) return;
    if (!isStickerMessage(event)) return;

    const featureEnabled = await isAntiStickerEnabled(event.threadId, Threads);
    if (!featureEnabled) return;

    const threadId = event.threadId;
    const type = event.type;
    const senderId = String(event.data.uidFrom || event.authorId || "");
    if (!senderId) return;

    const cooldownStore = ensureCooldownStore();
    if (COOLDOWN_MS > 0) {
      const key = `${threadId}:${senderId}`;
      const now = Date.now();
      const lastAt = cooldownStore.get(key) || 0;
      if (now - lastAt < COOLDOWN_MS) return;
      cooldownStore.set(key, now);
    }

    const senderName = event.data.dName || event.data.displayName || "Người dùng";
    const violationCount = incrementViolation(threadId, senderId);

    const lines = [
      "ANTI STICKER",
      `ng vi phạm : ${senderName}`,
      `số lần : ${violationCount}/${MAX_VIOLATIONS}`,
      "bot by : bonz",
      "thông báo : vui lòng không gửi sticker trong nhóm này"
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
      lines.push("", "👢 Đã kick khỏi nhóm vì spam sticker.");
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
      console.warn("[antiSticker] Không thể kick user:", kickError?.message || kickError);
    }
  } catch (error) {
    console.warn("[antiSticker] Lỗi cảnh cáo sticker:", error?.message || error);
  }
};
