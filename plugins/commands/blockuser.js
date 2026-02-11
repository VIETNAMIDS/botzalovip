module.exports.config = {
  name: "blockuser",
  aliases: ["blockfriend"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Chặn một tài khoản khỏi danh sách bạn bè của bot",
  category: "Quản lý",
  usage: "blockuser <uid hoặc @tag>",
  cooldowns: 5
};

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist]);
  return all.has(String(uid));
}

function resolveTargetUserId(args = [], data = {}) {
  if (Array.isArray(data?.mentions) && data.mentions.length > 0) {
    const mentionUid = data.mentions[0]?.uid;
    if (mentionUid) return String(mentionUid);
  }

  if (args.length > 0) {
    const candidate = args[0].replace(/[^\d]/g, "");
    if (candidate.length >= 12) {
      return candidate;
    }
  }

  return null;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  if (typeof api.blockUser !== "function") {
    return api.sendMessage(
      "⚠️ API blockUser hiện không khả dụng trên phiên bản bot này.",
      threadId,
      type
    );
  }

  const userId = resolveTargetUserId(args, data);

  if (!userId) {
    return api.sendMessage(
      "❌ Bạn cần cung cấp UID hợp lệ hoặc tag người cần chặn.\nVí dụ: blockuser 0123456789012",
      threadId,
      type
    );
  }

  try {
    await api.blockUser(userId);
    return api.sendMessage(`✅ Đã block thành công UID ${userId}.`, threadId, type);
  } catch (error) {
    console.error("[BLOCKUSER] Lỗi:", error);
    return api.sendMessage(
      `❌ Không thể block UID ${userId}.\nLý do: ${error?.message || "Không xác định"}`,
      threadId,
      type
    );
  }
};
