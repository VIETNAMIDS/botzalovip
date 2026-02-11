const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "remoteuser",
  aliases: ["ru", "remote", "ruser"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Block/unblock hoặc nhắn tin riêng tới user theo UID",
  category: "Quản lý",
  usage: "remoteuser <dm|block|unblock> <uid> [nội dung]",
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

function normalizeDigits(input = "") {
  return String(input || "").replace(/[^\d]/g, "");
}

function parseUid(raw) {
  const uid = normalizeDigits(raw);
  if (!uid) return null;
  if (uid.length < 6) return null;
  return uid;
}

function getSenderId(event) {
  return String(event?.data?.uidFrom || event?.authorId || "").trim();
}

function buildHelpText() {
  return (
    "📌 RemoteUser - điều khiển user từ xa\n" +
    "\n" +
    "Cách dùng:\n" +
    "- remoteuser dm <uid> <nội dung>\n" +
    "- remoteuser block <uid>\n" +
    "- remoteuser unblock <uid>\n" +
    "\n" +
    "Ví dụ:\n" +
    "- remoteuser dm 0123456789012 Xin chào bạn\n" +
    "- remoteuser block 0123456789012\n" +
    "- remoteuser unblock 0123456789012\n" +
    "\n" +
    "Alias: ru | remote | ruser"
  );
}

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type } = event;
  const senderId = getSenderId(event);

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  const action = String(args[0] || "").trim().toLowerCase();
  if (!action || action === "help" || action === "h" || action === "?" || action === "-h" || action === "--help") {
    return api.sendMessage(buildHelpText(), threadId, type);
  }

  const uid = parseUid(args[1]);
  if (!uid) {
    return api.sendMessage(buildHelpText(), threadId, type);
  }

  if (action === "dm" || action === "msg" || action === "send") {
    const text = args.slice(2).join(" ").trim();
    if (!text) {
      return api.sendMessage("❌ Thiếu nội dung DM. Ví dụ: remoteuser dm 0123456789012 Xin chào", threadId, type);
    }

    try {
      await api.sendMessage(text, uid, ThreadType.User);
      return api.sendMessage(`✅ Đã gửi tin nhắn tới UID ${uid}.`, threadId, type);
    } catch (error) {
      console.error("[remoteuser:dm]", error);
      return api.sendMessage(
        `❌ Không thể gửi tin nhắn tới UID ${uid}.\nLý do: ${error?.message || "Không xác định"}`,
        threadId,
        type
      );
    }
  }

  if (action === "block") {
    if (typeof api?.blockUser !== "function") {
      return api.sendMessage("⚠️ API blockUser hiện không khả dụng trên phiên bản bot này.", threadId, type);
    }

    try {
      await api.blockUser(uid);
      return api.sendMessage(`✅ Đã block UID ${uid}.`, threadId, type);
    } catch (error) {
      console.error("[remoteuser:block]", error);
      return api.sendMessage(
        `❌ Không thể block UID ${uid}.\nLý do: ${error?.message || "Không xác định"}`,
        threadId,
        type
      );
    }
  }

  if (action === "unblock" || action === "ub") {
    if (typeof api?.unblockUser !== "function") {
      return api.sendMessage("⚠️ API unblockUser hiện không khả dụng trên phiên bản bot này.", threadId, type);
    }

    try {
      await api.unblockUser(uid);
      return api.sendMessage(`✅ Đã unblock UID ${uid}.`, threadId, type);
    } catch (error) {
      console.error("[remoteuser:unblock]", error);
      return api.sendMessage(
        `❌ Không thể unblock UID ${uid}.\nLý do: ${error?.message || "Không xác định"}`,
        threadId,
        type
      );
    }
  }

  return api.sendMessage(
    "❌ Action không hợp lệ. Dùng: remoteuser <dm|block|unblock> <uid> [nội dung]",
    threadId,
    type
  );
};
