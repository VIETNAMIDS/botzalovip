const { ThreadType } = require("zca-js");

const autoLeaveModule = require("../events/autoLeaveLockChat");

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist].map(String));
  return all.has(String(uid));
}

async function resolveGroupName(api, threadId, fallback) {
  try {
    if (typeof api.getGroupInfo === "function") {
      const info = await api.getGroupInfo(threadId);
      const detail = info?.gridInfoMap?.[threadId] || info?.groupInfo?.[threadId] || info?.info;
      if (detail?.name) return detail.name;
    }
    if (typeof api.getThreadInfo === "function") {
      const info = await api.getThreadInfo(threadId);
      if (info?.name) return info.name;
    }
  } catch (error) {
    console.warn("[dontleave] resolveGroupName error:", error?.message || error);
  }
  return fallback || `Nhóm ${threadId}`;
}

module.exports.config = {
  name: "dontleave",
  aliases: ["nolockleave", "keepgroup"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Đánh dấu nhóm không auto rời khi quét khoá chat.",
  category: "Quản trị",
  usage: "dontleave [on|off|status]",
  cooldowns: 3
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId || event?.senderID;

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ sử dụng trong nhóm.", threadId, type);
  }

  const action = (args[0] || "on").toLowerCase();

  if (action === "status" || action === "list") {
    const list = autoLeaveModule.getManualNoLeaveList();
    if (list.length === 0) {
      return api.sendMessage("📭 Chưa có nhóm nào được đánh dấu /dontleave.", threadId, type);
    }

    const lines = ["📋 DANH SÁCH NHÓM ĐANG GIỮ LẠI:"];
    list.forEach((item, idx) => {
      const time = new Date(item.savedAt).toLocaleString("vi-VN");
      lines.push(`${idx + 1}. ${item.name} (${item.id}) • lưu lúc ${time}`);
    });
    return api.sendMessage(lines.join("\n"), threadId, type);
  }

  if (["off", "remove", "clear"].includes(action)) {
    const success = autoLeaveModule.removeManualNoLeave(threadId);
    if (success) {
      return api.sendMessage("✅ Đã xoá /dontleave. Nhóm sẽ được quét bình thường.", threadId, type);
    }
    return api.sendMessage("ℹ️ Nhóm này chưa nằm trong danh sách /dontleave.", threadId, type);
  }

  // Default: add / update
  const fallbackName = data?.threadName || data?.thread_name;
  const name = await resolveGroupName(api, threadId, fallbackName);
  autoLeaveModule.addManualNoLeave(threadId, name);
  return api.sendMessage(`✅ Đã đánh dấu nhóm "${name}" vào danh sách /dontleave.`, threadId, type);
};
