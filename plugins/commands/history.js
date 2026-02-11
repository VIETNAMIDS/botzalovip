module.exports.config = {
  name: "history",
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt cho phép thành viên mới đọc tin nhắn gần nhất",
  category: "Nhóm",
  usage: "history [on/off|1/0]",
  cooldowns: 2
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const input = (args?.[0] || '').toString().toLowerCase();

  if (!input || !["on", "off", "1", "0"].includes(input)) {
    return api.sendMessage(
      "⚠️ Vui lòng chọn on/off hoặc 1/0\nCú pháp: history [on/off|1/0]",
      threadId,
      type
    );
  }

  const enable = input === "on" || input === "1"; // true = cho phép đọc tin nhắn gần nhất

  try {
    await api.updateGroupSettings({ enableMsgHistory: enable }, String(threadId));
    const statusTxt = enable ? "đã BẬT cho phép thành viên mới đọc tin nhắn gần nhất" : "đã TẮT quyền đọc tin nhắn gần nhất của thành viên mới";
    return api.sendMessage(`✅ ${statusTxt}`, threadId, type);
  } catch (err) {
    return api.sendMessage(`❌ Không thể cập nhật cài đặt: ${err?.message || err}`, threadId, type);
  }
};
