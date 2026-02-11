module.exports.config = {
  name: "joinappr",
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt chế độ phê duyệt thành viên",
  category: "Nhóm",
  usage: "joinappr [on/off|1/0]",
  cooldowns: 2
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const input = (args?.[0] || '').toString().toLowerCase();

  if (!input || !["on", "off", "1", "0"].includes(input)) {
    return api.sendMessage(
      "⚠️ Vui lòng chọn on/off hoặc 1/0\nCú pháp: joinappr [on/off|1/0]",
      threadId,
      type
    );
  }

  const enable = input === "on" || input === "1"; // true = bật phê duyệt thành viên

  try {
    await api.updateGroupSettings({ joinAppr: enable }, String(threadId));
    const statusTxt = enable ? "đã BẬT chế độ phê duyệt thành viên" : "đã TẮT chế độ phê duyệt thành viên";
    return api.sendMessage(`✅ ${statusTxt}`, threadId, type);
  } catch (err) {
    return api.sendMessage(`❌ Không thể cập nhật cài đặt: ${err?.message || err}`, threadId, type);
  }
};
