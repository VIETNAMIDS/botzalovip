const chatgr = require("../../utils/chatgr");

module.exports.config = {
  name: "chatgr",
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Quản lý nhóm mà bot được phép lắng nghe",
  category: "Hệ thống",
  usage: "chatgr [on|off|all|list|add <id>|remove <id>|clear|here|status|<id>]",
  cooldowns: 2
};

function formatReply(lines = []) {
  return lines.filter(Boolean).join("\n");
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const sub = (args[0] || "").toLowerCase();

  const send = (lines) => api.sendMessage({
    msg: formatReply(Array.isArray(lines) ? lines : [lines]),
    ttl: 30_000
  }, threadId, type);

  if (!sub) {
    const state = chatgr.describeState();
    return send([
      "📡 ChatGR Control",
      "➤ chatgr on / chatgr all : bot nghe tất cả group",
      "➤ chatgr off            : bot tắt hoàn toàn ở group",
      "➤ chatgr list           : bật chế độ chỉ nghe whitelist",
      "➤ chatgr here           : thêm group hiện tại vào whitelist",
      "➤ chatgr add <id>       : thêm group theo ID",
      "➤ chatgr remove <id>    : gỡ group khỏi whitelist",
      "➤ chatgr clear          : xoá toàn bộ whitelist",
      "➤ chatgr status         : xem trạng thái hiện tại",
      "",
      state
    ]);
  }

  if (["on", "all"].includes(sub)) {
    const state = chatgr.setMode("all");
    return send(`✅ Đã chuyển sang chế độ nghe TẤT CẢ group (mode=${state.mode}).`);
  }

  if (sub === "off") {
    const state = chatgr.setMode("off");
    return send(`🔕 Bot sẽ không lắng nghe group nào cho tới khi bật lại (mode=${state.mode}).`);
  }

  if (sub === "list") {
    const state = chatgr.setMode("list");
    return send([
      "🎯 Đã chuyển sang chế độ whitelist.",
      state.allowed.length
        ? `Danh sách hiện có ${state.allowed.length} nhóm.`
        : "Danh sách đang trống, dùng chatgr add <id> hoặc chatgr here để thêm."
    ]);
  }

  if (sub === "status") {
    return send(chatgr.describeState());
  }

  if (["here", "this"].includes(sub)) {
    const state = chatgr.allowThread(threadId);
    chatgr.setMode("list");
    return send([
      `✅ Đã thêm group hiện tại (${threadId}) vào whitelist.`,
      `Tổng số nhóm đang nghe: ${state.allowed.length}.`
    ]);
  }

  if (["add", "+"].includes(sub)) {
    const targetId = args[1] || threadId;
    if (!targetId) {
      return send("⚠️ Không xác định được ID nhóm cần thêm.");
    }
    chatgr.setMode("list");
    const state = chatgr.allowThread(targetId);
    const label = args[1] ? `group ${targetId}` : `group hiện tại (${targetId})`;
    return send(`✅ Đã thêm ${label}. Whitelist hiện có ${state.allowed.length} nhóm.`);
  }

  if (["remove", "rm", "del", "-"].includes(sub)) {
    const targetId = args[1];
    if (!targetId) {
      return send("⚠️ Vui lòng cung cấp ID nhóm cần xoá: chatgr remove <groupId>.");
    }
    const removed = chatgr.removeThread(targetId);
    return send(removed
      ? `🗑️ Đã gỡ group ${targetId} khỏi whitelist.`
      : `ℹ️ Group ${targetId} không có trong whitelist.`);
  }

  if (sub === "clear") {
    const count = chatgr.clearAllowed();
    return send(count
      ? `🧹 Đã xoá ${count} group khỏi whitelist.`
      : "ℹ️ Whitelist đang trống, không cần xoá.");
  }

  // Nếu sub là ID (số) -> thêm trực tiếp
  if (/^\d+$/.test(sub)) {
    chatgr.setMode("list");
    const state = chatgr.allowThread(sub);
    return send(`✅ Đã thêm group ${sub} vào whitelist (tổng ${state.allowed.length}).`);
  }

  return send("❌ Tham số không hợp lệ. Dùng 'chatgr' để xem hướng dẫn.");
};
