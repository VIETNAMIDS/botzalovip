const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "bonz",
  version: "1.0.0",
  role: 1, 
  author: "ShinTHL09",
  description: "Menu anti đầy đủ của Bonz",
  category: "Nhóm",
  usage: "bonz anti",
  cooldowns: 2
};

module.exports.run = async function ({ api, event, args, Threads }) {
  const { threadId, type } = event;
  const action = (args[0] || "").toLowerCase();

  if (type !== ThreadType.Group) {
    return api.sendMessage("Lệnh này chỉ có thể được sử dụng trong nhóm chat.", threadId, type);
  }

  // Chỉ xử lý khi có argument "anti"
  if (action !== "anti") {
    return; // Không phản hồi nếu không phải "bonz anti"
  }

  try {
    const threadData = await Threads.getData(threadId);
    const data = threadData.data || {};

    // Lấy trạng thái hiện tại của các tính năng
    const antiUndo = data.anti_undo || false;
    const antiLink = data.anti_link || false; 
    const antiSpam = data.anti_spam || false;
    const onlyText = data.onlyText || false;
    const muteCount = Object.keys(data.muteList || {}).length;

    const statusEmoji = (status) => status ? "🟢 BẬT" : "🔴 TẮT";

    return api.sendMessage(
      "🎯 BONZ ANTI - MENU ĐẦY ĐỦ\n\n" +
      "📊 TRẠNG THÁI HIỆN TẠI:\n" +
      `• Anti Undo: ${statusEmoji(antiUndo)}\n` +
      `• Anti Link: ${statusEmoji(antiLink)}\n` +
      `• Anti Spam: ${statusEmoji(antiSpam)}\n` +
      `• Only Text: ${statusEmoji(onlyText)}\n` +
      `• Muted Users: ${muteCount} người\n\n` +
      
      "🛡️ LỆNH ĐIỀU KHIỂN:\n" +
      "• anti undo - Chống thu hồi tin nhắn\n" +
      "• anti link - Chống gửi link + QR scan\n" +
      "• anti spam - Chống spam thông minh\n" +
      "• anti onlytext - Chỉ cho phép text\n\n" +
      
      "🔇 QUẢN LÝ MUTE:\n" +
      "• anti mute @user 30m - Mute user\n" +
      "• anti unmute @user - Unmute user\n" +
      "• anti mutelist - Xem danh sách\n\n" +
      
      "⚡ LỆNH NHANH:\n" +
      "• spam - Toggle anti-spam\n" +
      "• bonz anti - Menu này\n\n" +
      
      "💡 TIP: Dùng 'anti' để xem hướng dẫn chi tiết!",
      threadId,
      type
    );
  } catch (error) {
    console.error("Lỗi khi hiển thị bonz anti menu:", error);
    return api.sendMessage("❌ Có lỗi xảy ra khi tải menu anti.", threadId, type);
  }
};
