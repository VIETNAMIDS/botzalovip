const autoLeaveLockChat = require("../events/autoLeaveLockChat");
const { ThreadType } = require("zca-js");

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist].map(String));
  return all.has(String(uid));
}

module.exports.config = {
  name: "lockleave",
  aliases: ["autoleave", "leaveguard"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Bật/tắt cơ chế bot tự thoát nhóm khoá chat (auto leave lock chat).",
  category: "Quản trị",
  usage: "lockleave [on|off|toggle|status]",
  cooldowns: 3
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId || event?.senderID;

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  const action = (args[0] || "status").toLowerCase();
  const currentState = autoLeaveLockChat.isAutoLeaveEnabled();

  const respondState = () => {
    const icon = currentState ? "🟢" : "🔴";
    const statusText = currentState ? "ĐANG BẬT" : "ĐANG TẮT";
    const detail = currentState
      ? "Bot sẽ tự rời nhóm khi phát hiện bị khoá chat (trừ danh sách /dontleave hoặc whitelist)."
      : "Bot sẽ không tự rời kể cả khi nhóm bị khoá chat.";

    return api.sendMessage(
      `${icon} AUTO LEAVE LOCK CHAT ${statusText}\n${detail}\n\n• Cú pháp: lockleave [on|off|toggle|status]`,
      threadId,
      type || ThreadType.Group
    );
  };

  if (["status", "info", "check"].includes(action)) {
    return respondState();
  }

  if (["on", "enable", "1"].includes(action)) {
    autoLeaveLockChat.setAutoLeaveEnabled(true);
    return api.sendMessage(
      "✅ ĐÃ BẬT auto leave lock chat. Bot sẽ kiểm tra nhóm khoá chat và tự rời khi cần.",
      threadId,
      type
    );
  }

  if (["off", "disable", "0"].includes(action)) {
    autoLeaveLockChat.setAutoLeaveEnabled(false);
    return api.sendMessage(
      "✅ ĐÃ TẮT auto leave lock chat. Bot sẽ ở lại kể cả khi nhóm bị khoá chat.",
      threadId,
      type
    );
  }

  if (["toggle", "switch"].includes(action)) {
    const next = autoLeaveLockChat.toggleAutoLeaveEnabled();
    return api.sendMessage(
      next
        ? "✅ ĐÃ BẬT lại auto leave lock chat."
        : "✅ ĐÃ TẮT auto leave lock chat.",
      threadId,
      type
    );
  }

  return api.sendMessage(
    "⚙️ Cú pháp: lockleave [on|off|toggle|status]",
    threadId,
    type
  );
};
