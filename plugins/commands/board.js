const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Import các hàm từ event
const antiBadwordEvent = require('../events/antiBadword');

module.exports.config = {
  name: "antibadword",
  version: "2.0.0",
  role: 1,
  author: "Bonz",
  description: "Quản lý từ cấm trong nhóm",
  category: "Quản trị",
  usage: "antibadword [on/off/add/remove/list/show] [từ]",
  cooldowns: 3,
  aliases: ["badword", "tucam"]
};

// Helper function: Gửi tin nhắn tự xóa sau 60 giây
async function sendAutoDeleteMessage(api, message, threadId, type, deleteAfter = 60000) {
  try {
    const sentMsg = await api.sendMessage(
      message + '\n\n⏱️ Tin nhắn này sẽ tự động xóa sau 60 giây...',
      threadId,
      type
    );
    
    console.log(chalk.blue(`📨 Tin nhắn đã gửi (Thread: ${threadId}):`, JSON.stringify(sentMsg, null, 2)));
    
    // Tự động xóa sau thời gian quy định
    setTimeout(async () => {
      try {
        // Kiểm tra các trường hợp có thể có của sentMsg
        let deleteParams = null;
        
        // Trường hợp 1: sentMsg có data với msgId
        if (sentMsg?.data?.msgId) {
          deleteParams = {
            threadId,
            type,
            data: {
              cliMsgId: sentMsg.data.cliMsgId,
              msgId: sentMsg.data.msgId,
              uidFrom: sentMsg.data.uidFrom
            }
          };
        }
        // Trường hợp 2: sentMsg trực tiếp có msgId (không có data)
        else if (sentMsg?.msgId) {
          deleteParams = {
            threadId,
            type,
            data: {
              cliMsgId: sentMsg.cliMsgId,
              msgId: sentMsg.msgId,
              uidFrom: sentMsg.uidFrom
            }
          };
        }
        // Trường hợp 3: sentMsg là string messageId
        else if (typeof sentMsg === 'string') {
          deleteParams = {
            threadId,
            type,
            data: {
              msgId: sentMsg
            }
          };
        }
        
        if (deleteParams) {
          console.log(chalk.yellow('🗑️ Đang thử xóa tin với params:', JSON.stringify(deleteParams, null, 2)));
          
          await api.deleteMessage(deleteParams, false);
          
          console.log(chalk.green(`✅ Đã tự động xóa tin antibadword sau 60s (Thread: ${threadId})`));
        } else {
          console.log(chalk.red('❌ Không thể xác định cấu trúc tin nhắn để xóa'));
          console.log('sentMsg structure:', JSON.stringify(sentMsg, null, 2));
        }
      } catch (error) {
        console.error(chalk.red('❌ Lỗi khi tự động xóa tin nhắn antibadword:'), error.message);
        console.error('Error details:', error);
      }
    }, deleteAfter);
    
    return sentMsg;
  } catch (error) {
    console.error(chalk.red('❌ Lỗi khi gửi tin nhắn:'), error);
    return null;
  }
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom;
  const senderName = data?.dName || 'User';
  
  // Kiểm tra quyền admin
  const admins = global?.config?.admin_bot || [];
  if (!admins.includes(String(senderId))) {
    return api.sendMessage(
      "⚠️ Chỉ admin bot mới có thể sử dụng lệnh này!",
      threadId,
      type
    );
  }
  
  const command = args[0]?.toLowerCase();
  const badwordData = antiBadwordEvent.getBadwordData();
  
  // ===== LIST - Xem danh sách từ cấm =====
  if (command === "list") {
    const wordsList = badwordData.badWords || [];
    
    if (wordsList.length === 0) {
      return sendAutoDeleteMessage(
        api,
        "📝 Hiện tại chưa có từ ngữ nào bị cấm.",
        threadId,
        type
      );
    }
    
    const formattedList = wordsList.map((word, i) => `${i + 1}. ${word}`).join('\n');
    return sendAutoDeleteMessage(
      api,
      `📝 DANH SÁCH TỪ CẤM (${wordsList.length} từ):\n\n${formattedList}\n\n💡 Hướng dẫn:\n• /antibadword add [từ] - Thêm từ cấm\n• /antibadword remove [từ] - Xóa từ cấm\n• /antibadword show @user - Xem vi phạm`,
      threadId,
      type
    );
  }
  
  // ===== ADD - Thêm từ cấm =====
  if (command === "add") {
    const word = args.slice(1).join(" ").trim();
    
    if (!word) {
      return sendAutoDeleteMessage(
        api,
        "⚠️ Vui lòng nhập từ khóa cần thêm!\nVí dụ: /antibadword add đm",
        threadId,
        type
      );
    }
    
    const currentBadWords = [...badwordData.badWords];
    
    if (currentBadWords.includes(word)) {
      return sendAutoDeleteMessage(
        api,
        `⚠️ Từ "${word}" đã có trong danh sách từ cấm rồi!`,
        threadId,
        type
      );
    }
    
    currentBadWords.push(word);
    antiBadwordEvent.updateBadwordData({ badWords: currentBadWords });
    
    return sendAutoDeleteMessage(
      api,
      `✅ Đã thêm "${word}" vào danh sách từ cấm!\n📊 Tổng cộng: ${currentBadWords.length} từ`,
      threadId,
      type
    );
  }
  
  // ===== REMOVE - Xóa từ cấm =====
  if (command === "remove") {
    const word = args.slice(1).join(" ").trim();
    
    if (!word) {
      return sendAutoDeleteMessage(
        api,
        "⚠️ Vui lòng nhập từ khóa cần xóa!\nVí dụ: /antibadword remove đm",
        threadId,
        type
      );
    }
    
    const currentBadWords = [...badwordData.badWords];
    const index = currentBadWords.indexOf(word);
    
    if (index === -1) {
      return sendAutoDeleteMessage(
        api,
        `⚠️ Không tìm thấy "${word}" trong danh sách từ cấm!`,
        threadId,
        type
      );
    }
    
    currentBadWords.splice(index, 1);
    antiBadwordEvent.updateBadwordData({ badWords: currentBadWords });
    
    return sendAutoDeleteMessage(
      api,
      `✅ Đã xóa "${word}" khỏi danh sách từ cấm!\n📊 Còn lại: ${currentBadWords.length} từ`,
      threadId,
      type
    );
  }
  
  // ===== SHOW - Xem lịch sử vi phạm =====
  if (command === "show") {
    const violations = badwordData.violations || {};
    const threadViolations = violations[threadId] || {};
    
    // Nếu không có mentions, hiển thị tất cả vi phạm trong nhóm
    const mentions = data?.mentions || [];
    
    if (mentions.length === 0) {
      const users = Object.keys(threadViolations);
      
      if (users.length === 0) {
        return sendAutoDeleteMessage(
          api,
          "📝 Nhóm này chưa có ai vi phạm từ cấm.",
          threadId,
          type
        );
      }
      
      let msg = `📝 LỊCH SỬ VI PHẠM TRONG NHÓM (${users.length} người):\n\n`;
      
      users.slice(0, 10).forEach((userId, i) => {
        const userInfo = threadViolations[userId];
        msg += `${i + 1}. ${userInfo.name}\n`;
        msg += `   • Vi phạm: ${userInfo.count} lần\n`;
        if (userInfo.words.length > 0) {
          const lastWord = userInfo.words[userInfo.words.length - 1];
          msg += `   • Gần nhất: "${lastWord.word}"\n`;
        }
        msg += '\n';
      });
      
      if (users.length > 10) {
        msg += `\n...và ${users.length - 10} người khác`;
      }
      
      return sendAutoDeleteMessage(api, msg, threadId, type);
    }
    
    // Hiển thị vi phạm của người được tag
    let responseMsg = "📝 LỊCH SỬ VI PHẠM:\n\n";
    
    for (const mention of mentions) {
      const userId = mention.uid;
      const userViolations = threadViolations[userId];
      
      if (!userViolations || userViolations.words.length === 0) {
        responseMsg += `• ${userViolations?.name || 'Unknown'}: Chưa có vi phạm\n\n`;
      } else {
        responseMsg += `• ${userViolations.name}:\n`;
        responseMsg += `  Tổng: ${userViolations.count} lần\n`;
        responseMsg += `  Gần nhất:\n`;
        userViolations.words.slice(-3).forEach((v, i) => {
          const time = new Date(v.time).toLocaleString('vi-VN');
          responseMsg += `  ${i + 1}. "${v.word}" - ${time}\n`;
        });
        responseMsg += '\n';
      }
    }
    
    return sendAutoDeleteMessage(api, responseMsg.trim(), threadId, type);
  }
  
  // ===== CLEAR - Xóa tất cả vi phạm trong nhóm =====
  if (command === "clear") {
    const violations = {...badwordData.violations};
    
    if (!violations[threadId] || Object.keys(violations[threadId]).length === 0) {
      return sendAutoDeleteMessage(
        api,
        "📝 Nhóm này chưa có vi phạm nào để xóa.",
        threadId,
        type
      );
    }
    
    const count = Object.keys(violations[threadId]).length;
    delete violations[threadId];
    
    antiBadwordEvent.updateBadwordData({ violations });
    
    return sendAutoDeleteMessage(
      api,
      `✅ Đã xóa lịch sử vi phạm của ${count} người trong nhóm này!`,
      threadId,
      type
    );
  }
  
  // ===== ON/OFF - Bật/tắt tính năng (future) =====
  if (command === "on" || command === "off") {
    const status = command === "on" ? "bật" : "tắt";
    return sendAutoDeleteMessage(
      api,
      `✅ Tính năng anti badword luôn hoạt động!\n💡 Sử dụng /antibadword add/remove để quản lý từ cấm.`,
      threadId,
      type
    );
  }
  
  // ===== Mặc định - Hướng dẫn =====
  return sendAutoDeleteMessage(
    api,
    `🛡️ ANTI BADWORD - QUẢN LÝ TỪ CẤM\n\n` +
    `📋 Các lệnh:\n` +
    `• /antibadword list - Xem danh sách từ cấm\n` +
    `• /antibadword add [từ] - Thêm từ cấm\n` +
    `• /antibadword remove [từ] - Xóa từ cấm\n` +
    `• /antibadword show - Xem tất cả vi phạm\n` +
    `• /antibadword show @user - Xem vi phạm của user\n` +
    `• /antibadword clear - Xóa lịch sử vi phạm nhóm\n\n` +
    `⚡ Tính năng tự động:\n` +
    `• Xóa tin nhắn chứa từ cấm\n` +
    `• Cảnh báo 3 lần\n` +
    `• 👢 KICK tự động sau 3 lần vi phạm\n` +
    `• Reset vi phạm sau 30 phút\n` +
    `• Log chi tiết ra terminal`,
    threadId,
    type
  );
};