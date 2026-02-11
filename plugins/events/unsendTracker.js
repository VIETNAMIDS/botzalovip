const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: "unsendTracker",
  event_type: ["message"],
  version: "1.0.0",
  credits: "Zeid Bot",
  description: "Theo dõi tin nhắn để phát hiện khi bị xóa"
};

// Lưu trữ tin nhắn tạm thời
const messageCache = new Map();

// Đường dẫn file lưu lịch sử
const unsendHistoryPath = path.join(__dirname, '..', '..', 'data', 'unsend_history.json');

// Đảm bảo thư mục data tồn tại
function ensureDataDir() {
  const dataDir = path.dirname(unsendHistoryPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Đọc lịch sử thu hồi
function readUnsendHistory() {
  try {
    ensureDataDir();
    if (fs.existsSync(unsendHistoryPath)) {
      const data = fs.readFileSync(unsendHistoryPath, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('Lỗi đọc unsend history:', error);
    return {};
  }
}

// Ghi lịch sử thu hồi
function writeUnsendHistory(history) {
  try {
    ensureDataDir();
    fs.writeFileSync(unsendHistoryPath, JSON.stringify(history, null, 2), 'utf8');
  } catch (error) {
    console.error('Lỗi ghi unsend history:', error);
  }
}

// Lưu tin nhắn vào cache
function saveMessageToCache(messageId, messageData) {
  messageCache.set(messageId, {
    ...messageData,
    timestamp: Date.now()
  });

  // Xóa tin nhắn cũ hơn 24 giờ khỏi cache
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  for (const [id, data] of messageCache.entries()) {
    if (data.timestamp < oneDayAgo) {
      messageCache.delete(id);
    }
  }
}

// Lưu tin nhắn bị thu hồi vào lịch sử
function saveUnsendToHistory(threadId, messageData) {
  const history = readUnsendHistory();
  
  if (!history[threadId]) {
    history[threadId] = [];
  }

  // Giới hạn 100 tin nhắn gần nhất mỗi nhóm
  if (history[threadId].length >= 100) {
    history[threadId] = history[threadId].slice(-99);
  }

  history[threadId].push({
    ...messageData,
    unsendTime: Date.now(),
    unsendDate: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  });

  writeUnsendHistory(history);
}

// Cleanup cache cũ (tin nhắn cũ hơn 24h)
function cleanupOldCache() {
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  for (const [id, data] of messageCache.entries()) {
    if (data.timestamp < oneDayAgo) {
      messageCache.delete(id);
    }
  }
}

// Theo dõi tin nhắn và phát hiện khi bị xóa bằng cách kiểm tra định kỳ
let messageCheckInterval;

module.exports.run = async ({ event, api, eventType }) => {
  try {
    const { threadId, data, messageID, type } = event || {};

    // Chuẩn hóa nội dung về string để tránh lỗi startsWith khi content không phải chuỗi
    const rawContent = data?.content;
    const content = (typeof rawContent === 'string')
      ? rawContent
      : (rawContent == null ? '' : (() => { try { return JSON.stringify(rawContent); } catch { return String(rawContent); } })());

    if (eventType === 'message' && content && !content.startsWith('🔄 PHÁT HIỆN')) {
      const actualMessageId = data?.cliMsgId || data?.msgId || messageID;
      
      // Lưu tin nhắn vào cache
      const messageData = {
        messageId: actualMessageId,
        threadId: threadId,
        senderId: data.uidFrom,
        content,
        timestamp: Date.now(),
        date: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      };

      // Lấy tên người gửi
      try {
        const userInfo = await api.getUserInfo(data.uidFrom);
        messageData.senderName = userInfo?.changed_profiles?.[data.uidFrom]?.displayName || 'Người dùng';
      } catch {
        messageData.senderName = 'Người dùng';
      }

      saveMessageToCache(actualMessageId, messageData);
      
      // Kiểm tra tin nhắn sau 3 giây để phát hiện thu hồi (nếu SDK hỗ trợ)
      setTimeout(async () => {
        try {
          let messageExists = true;
          if (typeof api.getThreadMessages === 'function') {
            const messages = await api.getThreadMessages(threadId, 50);
            messageExists = messages?.some(msg =>
              msg.msgId == actualMessageId ||
              msg.cliMsgId == actualMessageId ||
              msg.globalMsgId == actualMessageId
            );
          } else if (typeof api.getMessages === 'function') {
            const messages = await api.getMessages(threadId, { limit: 50 });
            messageExists = messages?.some(msg =>
              msg.msgId == actualMessageId ||
              msg.cliMsgId == actualMessageId ||
              msg.globalMsgId == actualMessageId
            );
          } else {
            // SDK không hỗ trợ truy vấn lịch sử -> bỏ qua kiểm tra chủ động
            return;
          }

          const cachedMessage = messageCache.get(actualMessageId);
          if (cachedMessage && !messageExists) {
            // Tin nhắn đã bị thu hồi
            saveUnsendToHistory(threadId, cachedMessage);
            
            const notificationMessage = [
              `🔄 PHÁT HIỆN THU HỒI TIN NHẮN`,
              `👤 Người gửi: ${cachedMessage.senderName}`,
              `💬 Nội dung: "${cachedMessage.content}"`,
              `⏰ Thời gian gửi: ${cachedMessage.date}`,
              `🗑️ Thu hồi lúc: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
            ].join('\n');

            api.sendMessage(notificationMessage, threadId, type);
            messageCache.delete(actualMessageId);
          }
        } catch (error) {
          console.error('Lỗi kiểm tra tin nhắn thu hồi:', error);
        }
      }, 3000);
    }

    // Cleanup cache cũ (tin nhắn cũ hơn 24h)
    cleanupOldCache();

  } catch (error) {
    console.error('Lỗi trong unsendTracker:', error);
  }
};
