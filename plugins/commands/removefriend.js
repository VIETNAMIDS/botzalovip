module.exports.config = {
  name: "removefriend",
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Hủy kết bạn với UID hoặc người được tag.",
  category: "Quản lý",
  usage: "removefriend <uid|@tag>",
  cooldowns: 3
};

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist].map(String));
  return all.has(String(uid));
}

function sanitizeUidCandidate(value) {
  if (!value && value !== 0) return null;
  let str = String(value);
  if (str.includes("_")) str = str.split("_")[0];
  const digits = str.replace(/[^\d]/g, "");
  return digits.length >= 12 ? digits : null;
}

function resolveTargetUserId(args = [], data = {}) {
  if (Array.isArray(data?.mentions) && data.mentions.length > 0) {
    const mentionUid = sanitizeUidCandidate(data.mentions[0]?.uid || data.mentions[0]?.id);
    if (mentionUid) return mentionUid;
  }

  if (args.length > 0) {
    const candidate = sanitizeUidCandidate(args[0]);
    if (candidate) return candidate;
  }

  return null;
}

function getErrorCode(error) {
  return error?.code ||
    error?.error_code ||
    error?.response?.data?.error_code ||
    error?.response?.status ||
    null;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  if (typeof api.removeFriend !== "function") {
    return api.sendMessage(
      "⚠️ API removeFriend không khả dụng trên phiên bản bot hiện tại.",
      threadId,
      type
    );
  }

  const targetId = resolveTargetUserId(args, data);
  if (!targetId) {
    return api.sendMessage(
      "❌ Vui lòng cung cấp UID hợp lệ hoặc tag người cần hủy kết bạn.\nVí dụ: removefriend 0123456789012",
      threadId,
      type
    );
  }

  try {
    await api.removeFriend(targetId);
    return api.sendMessage(
      `✅ Đã hủy kết bạn với UID ${targetId}.`,
      threadId,
      type
    );
  } catch (error) {
    const code = getErrorCode(error);
    return api.sendMessage(
      `❌ Không thể hủy kết bạn với UID ${targetId}.\n• Mã lỗi: ${code ?? "Không xác định"}\n• Chi tiết: ${error?.message || String(error)}`,
      threadId,
      type
    );
  }
};
