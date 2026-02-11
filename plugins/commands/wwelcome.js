module.exports.config = {
  name: 'welcome',
  version: '1.0.0',
  role: 1, // Admin only
  author: 'Bonz + GPT',
  description: 'Quản lý welcome system cho nhóm',
  category: 'Admin',
  usage: 'welcome [on/off/status]',
  cooldowns: 2
};

const utils = require('../../utils');

module.exports.run = async ({ args, event, api }) => {
  const { threadId, type } = event;
  
  try {
    const botUid = api.getOwnId();
    
    if (!args[0]) {
      // Hiển thị trạng thái hiện tại
      const allow = utils.getAllowWelcome(botUid, threadId);
      return api.sendMessage(
        `🚦 ═══════════════════════════════════\n` +
        `🤖 WELCOME SYSTEM STATUS\n` +
        `═══════════════════════════════════\n` +
        `📊 Trạng thái: ${allow ? '🟢 ĐANG BẬT' : '🔴 ĐANG TẮT'}\n` +
        `🏠 Nhóm: ${threadId}\n` +
        `═══════════════════════════════════\n` +
        `📝 Lệnh quản lý:\n` +
        `• welcome on - Bật welcome\n` +
        `• welcome off - Tắt welcome\n` +
        `• welcome status - Xem trạng thái\n` +
        `═══════════════════════════════════\n` +
        `💡 Welcome tự động chào mừng thành viên mới!`,
        threadId, 
        type
      );
    }
    
    const command = args[0].toLowerCase();
    
    // Bật welcome
    if (command === 'on' || command === 'enable') {
      const msg = utils.handleWelcomeOn(botUid, threadId);
      return api.sendMessage(
        `✅ ═══════════════════════════════════\n` +
        `🟢 ĐÃ BẬT WELCOME SYSTEM\n` +
        `═══════════════════════════════════\n` +
        `🎉 Welcome đã được kích hoạt cho nhóm này!\n` +
        `🤖 Bot sẽ tự động chào mừng thành viên mới\n` +
        `🖼️ Bao gồm ảnh welcome đẹp mắt\n` +
        `═══════════════════════════════════\n` +
        `💡 Thêm người vào nhóm để test!`,
        threadId, 
        type
      );
    }
    
    // Tắt welcome
    if (command === 'off' || command === 'disable') {
      const msg = utils.handleWelcomeOff(botUid, threadId);
      return api.sendMessage(
        `❌ ═══════════════════════════════════\n` +
        `🔴 ĐÃ TẮT WELCOME SYSTEM\n` +
        `═══════════════════════════════════\n` +
        `😴 Welcome đã được vô hiệu hóa\n` +
        `🤖 Bot sẽ không chào mừng thành viên mới\n` +
        `💡 Dùng "welcome on" để bật lại\n` +
        `═══════════════════════════════════`,
        threadId, 
        type
      );
    }
    
    // Xem trạng thái
    if (command === 'status' || command === 'check') {
      const allow = utils.getAllowWelcome(botUid, threadId);
      return api.sendMessage(
        `📊 ═══════════════════════════════════\n` +
        `🔍 WELCOME SYSTEM STATUS\n` +
        `═══════════════════════════════════\n` +
        `🏠 Nhóm ID: ${threadId}\n` +
        `🤖 Bot ID: ${botUid}\n` +
        `📊 Trạng thái: ${allow ? '🟢 HOẠT ĐỘNG' : '🔴 TẮT'}\n` +
        `⏰ Kiểm tra lúc: ${new Date().toLocaleString('vi-VN')}\n` +
        `═══════════════════════════════════\n` +
        `💡 ${allow ? 'Welcome đang hoạt động bình thường!' : 'Dùng "welcome on" để bật!'}`,
        threadId, 
        type
      );
    }
    
    // Lệnh không hợp lệ
    return api.sendMessage(
      `❌ Lệnh không hợp lệ!\n\n` +
      `📝 Các lệnh có sẵn:\n` +
      `• welcome on - Bật welcome\n` +
      `• welcome off - Tắt welcome\n` +
      `• welcome status - Xem trạng thái\n\n` +
      `💡 Dùng "welcome" để xem trạng thái hiện tại.`,
      threadId, 
      type
    );
    
  } catch (error) {
    console.error('[Welcome] Command error:', error);
    return api.sendMessage(
      `❌ Lỗi xử lý welcome command!\n` +
      `🚫 Error: ${error.message}\n` +
      `💡 Hãy thử lại sau.`,
      threadId, 
      type
    );
  }
};
