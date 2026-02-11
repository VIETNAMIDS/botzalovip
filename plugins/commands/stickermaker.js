const COOLDOWN_MS = 5000;
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

module.exports.run = async function antiSticker({ api, event, eventType }) {
  try {
    if ((eventType || event?.eventType) !== "message") return;
    if (!event || !event.data || !event.threadId) return;
    if (event.data.isOutbox || event.data.isSelf || event.isSelf) return;
    if (!isStickerMessage(event)) return;

    const threadId = event.threadId;
    const type = event.type;
    const senderId = String(event.data.uidFrom || event.authorId || "");
    if (!senderId) return;

    const cooldownStore = ensureCooldownStore();
    const key = `${threadId}:${senderId}`;
    const now = Date.now();
    const lastAt = cooldownStore.get(key) || 0;
    if (now - lastAt < COOLDOWN_MS) return;
    cooldownStore.set(key, now);

    const senderName = event.data.dName || event.data.displayName || "Người dùng";
    const warning = [
      "🚫 ANTI STICKER",
      `⚠️ ${senderName} (UID: ${senderId}) vừa gửi sticker và bị cảnh cáo!`,
      "❗ Vui lòng không gửi sticker trong nhóm này."
    ].join("\n");

    const mentions = [
      {
        tag: senderName,
        uid: senderId,
        fromIndex: warning.indexOf(senderName)
      }
    ];

    await api.sendMessage({ msg: warning, mentions, ttl: 60000 }, threadId, type);
  } catch (error) {
    console.warn("[antiSticker] Lỗi cảnh cáo sticker:", error?.message || error);
  }
};
