const blacklist = require("../../utils/blacklist");

module.exports.config = {
  name: "den",
  aliases: ["blacklist", "banden"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Quản lý danh sách đen (người bị chặn không dùng được bot)",
  category: "Hệ thống",
  usage: "den [add|remove|list|clear] @user",
  cooldowns: 2
};

function pickMentionUid(event) {
  const mentions = Array.isArray(event?.data?.mentions) ? event.data.mentions : [];
  const uid = mentions?.[0]?.uid;
  return uid ? String(uid) : null;
}

function buildHelp(prefix = "") {
  const cmd = `${prefix}den`;
  return [
    "📛 LỆNH ĐEN (BLACKLIST)",
    `- ${cmd} list: xem danh sách đen`,
    `- ${cmd} add @user: thêm người vào danh sách đen`,
    `- ${cmd} remove @user: gỡ người khỏi danh sách đen`,
    `- ${cmd} clear: xoá toàn bộ danh sách đen`,
    "",
    "Ví dụ:",
    `- ${cmd} add @Tên`,
    `- ${cmd} remove @Tên`
  ].join("\n");
}

module.exports.run = async function ({ api, event, args = [] }) {
  const { threadId, type } = event;

  const sub = String(args[0] || "").trim().toLowerCase();
  const action = ["add", "remove", "rm", "del", "list", "clear", "help"].includes(sub) ? sub : null;

  if (!action || action === "help") {
    const prefix = typeof global?.config?.prefix === "string" ? global.config.prefix : "";
    return api.sendMessage(buildHelp(prefix), threadId, type);
  }

  if (!action || action === "list") {
    const list = blacklist.getList();
    if (!list.length) {
      return api.sendMessage("ℹ️ Danh sách đen đang trống.", threadId, type);
    }
    const preview = list.slice(0, 50);
    const lines = preview.map((id, idx) => `${idx + 1}. ${id}`);
    if (list.length > preview.length) lines.push(`... còn ${list.length - preview.length} người khác.`);
    return api.sendMessage([`📛 Danh sách đen: ${list.length} người`, ...lines].join("\n"), threadId, type);
  }

  if (action === "clear") {
    const res = blacklist.clear();
    return api.sendMessage(`🧹 Đã xoá danh sách đen (${res.had} người).`, threadId, type);
  }

  const uid = pickMentionUid(event);
  if (!uid) {
    return api.sendMessage("❌ Vui lòng tag người cần thao tác. Ví dụ: den add @tên", threadId, type);
  }

  if (action === "remove" || action === "rm" || action === "del") {
    const res = blacklist.remove(uid);
    return api.sendMessage(
      res.changed ? `✅ Đã gỡ ${uid} khỏi danh sách đen.` : `ℹ️ ${uid} không có trong danh sách đen.`,
      threadId,
      type
    );
  }

  const res = blacklist.add(uid);
  return api.sendMessage(
    res.changed ? `✅ Đã thêm ${uid} vào danh sách đen.` : `ℹ️ ${uid} đã có trong danh sách đen.`,
    threadId,
    type
  );
};
