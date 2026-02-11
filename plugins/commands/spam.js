const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "spam",
  version: "1.0.0", 
  role: 1,
  author: "ShinTHL09",
  description: "Bật/tắt chống spam nhanh",
  category: "Nhóm",
  usage: "spam",
  cooldowns: 2
};

module.exports.run = async function ({ api, event, Threads }) {
  const { threadId, type } = event;

  if (type !== ThreadType.Group) {
    return api.sendMessage("Lệnh này chỉ có thể được sử dụng trong nhóm chat.", threadId, type);
  }

  try {
    const threadData = await Threads.getData(threadId);
    const currentValue = threadData.data.anti_spam || false;
    const newValue = !currentValue;

    threadData.data.anti_spam = newValue;
    await Threads.setData(threadId, threadData.data);

    const statusText = newValue ? "bật" : "tắt";
    const emoji = newValue ? "🛡️" : "❌";
    
    return api.sendMessage(
      `${emoji} Đã ${statusText} chế độ chống spam!\n\n` +
      `📊 Tính năng bao gồm:\n` +
      `• Phát hiện tin nhắn nhanh (3+ tin/3s)\n` +
      `• Phát hiện nội dung lặp lại (5+ tin giống nhau)\n` +
      `• Phát hiện tin nhắn dài hàng loạt (3+ tin >100 ký tự)\n\n` +
      `💡 Dùng "anti" để xem thêm tùy chọn khác!`,
      threadId,
      type
    );
  } catch (error) {
    console.error("Lỗi khi toggle spam:", error);
    return api.sendMessage("❌ Có lỗi xảy ra khi thay đổi cài đặt spam.", threadId, type);
  }
};
