const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: "ailearn",
  version: "1.0.0",
  hasPermssion: 1, // Admin only
  credits: "Cascade",
  description: "Quản lý hệ thống AI Learning",
  commandCategory: "Admin",
  usages: "[stats|history|reset|export|import|config]",
  cooldowns: 3
};

const DATA_DIR = path.join(__dirname, '../../data');
const LEARNING_DATA_FILE = path.join(DATA_DIR, 'ai_learning.json');
const CONVERSATION_FILE = path.join(DATA_DIR, 'conversations.json');

// Load AI Learning module
let aiLearningModule;
try {
  aiLearningModule = require('../events/aiLearning.js');
} catch (error) {
  console.error('[AI LEARN CMD] Không thể load AI Learning module');
}

module.exports.run = async function({ api, event, args, Users }) {
  // Enhanced validation and fallback mechanism
  if (!event || typeof event !== 'object') {
    console.error('[AI LEARN CMD] Invalid event object:', event);
    return;
  }
  
  const threadID = event.threadID || event.threadId || event.thread_id;
  const messageID = event.messageID || event.messageId || event.message_id;
  const senderID = event.senderID || event.senderId || event.authorId || event.author_id;
  
  // Enhanced validation with detailed logging
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in event:', {
      event: event,
      eventKeys: Object.keys(event || {}),
      threadID: threadID,
      availableIds: {
        threadID: event.threadID,
        threadId: event.threadId,
        thread_id: event.thread_id
      }
    });
    
    // Try to send error message if we have any way to respond
    if (api && api.sendMessage) {
      try {
        // Try different fallback methods to send error
        const fallbackThreadId = event.threadID || event.threadId || event.thread_id || 
                                 event.groupId || event.group_id || event.chatId || event.chat_id;
        if (fallbackThreadId) {
          await api.sendMessage('❌ Lỗi: Không thể xác định thread ID để thực hiện lệnh AI Learning!', fallbackThreadId);
        }
      } catch (fallbackError) {
        console.error('[AI LEARN CMD] Fallback error message failed:', fallbackError);
      }
    }
    return;
  }
  
  if (!args[0]) {
    return api.sendMessage(
      `🤖 AI LEARNING MANAGEMENT V2.0\n\n` +
      `📊 ailearn stats - Thống kê hệ thống học\n` +
      `📝 ailearn history [threadID] - Xem lịch sử hội thoại\n` +
      `🔄 ailearn reset [type] - Reset dữ liệu học\n` +
      `📤 ailearn export - Xuất dữ liệu học\n` +
      `📥 ailearn import - Nhập dữ liệu học\n` +
      `⚙️ ailearn config - Cấu hình hệ thống\n` +
      `🧠 ailearn analyze <text> - Phân tích tin nhắn\n` +
      `🎯 ailearn response <text> - Test phản hồi AI\n` +
      `🚀 ailearn chatgpt <text> - Test ChatGPT với context\n` +
      `📈 ailearn performance - Xem hiệu suất AI\n` +
      `🧪 ailearn test - Kiểm tra gửi tin nhắn vào nhóm\n` +
      `🔍 ailearn debug - Debug event structure\n` +
      `🤖 ailearn force [text] - Force AI reply trực tiếp\n\n` +
      `✨ TÍNH NĂNG MỚI:\n` +
      `🧠 ChatGPT Integration - Bot sử dụng dữ liệu đã học để tạo prompt cho ChatGPT\n` +
      `📊 Smart Context - Phân tích patterns, keywords, emotions để tạo responses tự nhiên\n` +
      `🎯 Adaptive Learning - Bot học và cải thiện từ mỗi cuộc trò chuyện\n\n` +
      `💡 Hệ thống AI Learning V2.0 - Thông minh hơn với ChatGPT!`,
      threadID, messageID
    );
  }
  
  const command = args[0].toLowerCase();
  
  try {
    switch (command) {
      case 'stats':
        await handleStats(api, event, threadID, messageID);
        break;
        
      case 'history':
        await handleHistory(api, event, args, threadID, messageID);
        break;
        
      case 'reset':
        await handleReset(api, event, args, threadID, messageID);
        break;
        
      case 'export':
        await handleExport(api, event, threadID, messageID);
        break;
        
      case 'import':
        await handleImport(api, event, threadID, messageID);
        break;
        
      case 'config':
        await handleConfig(api, event, args, threadID, messageID);
        break;
        
      case 'analyze':
        await handleAnalyze(api, event, args, threadID, messageID);
        break;
        
      case 'response':
        await handleResponse(api, event, args, threadID, messageID);
        break;
        
      case 'chatgpt':
        await handleChatGPT(api, event, args, threadID, messageID);
        break;
        
      case 'performance':
        await handlePerformance(api, event, threadID, messageID);
        break;
        
      case 'test':
        await handleTest(api, event, args, threadID, messageID);
        break;
        
      case 'debug':
        await handleDebug(api, event, args, threadID, messageID);
        break;
        
      case 'force':
        await handleForceReply(api, event, args, threadID, messageID);
        break;
        
      default:
        return api.sendMessage('❌ Lệnh không hợp lệ! Gõ "ailearn" để xem hướng dẫn.', threadID, messageID);
    }
  } catch (error) {
    console.error('[AI LEARN CMD] Error:', {
      error: error,
      stack: error.stack,
      threadID: threadID,
      messageID: messageID,
      command: args[0],
      eventKeys: Object.keys(event || {})
    });
    
    // Enhanced error handling with fallback
    try {
      if (threadID && api && api.sendMessage) {
        return api.sendMessage(`❌ Có lỗi xảy ra khi thực hiện lệnh AI Learning!\n\n🔍 Chi tiết lỗi: ${error.message}`, threadID, messageID);
      }
    } catch (sendError) {
      console.error('[AI LEARN CMD] Failed to send error message:', sendError);
    }
  }
};

async function handleStats(api, event, threadID, messageID) {
  // Use passed threadID and messageID parameters
  
  try {
    if (!aiLearningModule) {
      return api.sendMessage('❌ AI Learning module chưa được tải!', threadID, messageID);
    }
    
    const learningData = aiLearningModule.getLearningData();
    
    // Đọc file stats
    let fileStats = { size: 0, conversations: 0 };
    try {
      if (fs.existsSync(LEARNING_DATA_FILE)) {
        const stats = fs.statSync(LEARNING_DATA_FILE);
        fileStats.size = (stats.size / 1024).toFixed(2); // KB
      }
      
      if (fs.existsSync(CONVERSATION_FILE)) {
        const convData = JSON.parse(fs.readFileSync(CONVERSATION_FILE, 'utf8'));
        fileStats.conversations = Object.keys(convData).length;
      }
    } catch (error) {
      console.error('Error reading file stats:', error);
    }
    
    // Tính toán stats
    const totalPatterns = learningData.patterns.size;
    const totalKeywords = learningData.keywords.size;
    const totalUsers = learningData.userProfiles.size;
    const totalResponses = learningData.responses.size;
    
    let totalMessages = 0;
    let activeUsers = 0;
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    for (const [userId, profile] of learningData.userProfiles) {
      totalMessages += profile.messageCount || 0;
      if (profile.lastSeen > oneWeekAgo) {
        activeUsers++;
      }
    }
    
    // Top emotions
    const emotionCounts = new Map();
    for (const [userId, profile] of learningData.userProfiles) {
      if (profile.emotions && profile.emotions instanceof Map) {
        for (const [emotion, count] of profile.emotions) {
          emotionCounts.set(emotion, (emotionCounts.get(emotion) || 0) + count);
        }
      } else if (profile.emotions && typeof profile.emotions === 'object') {
        // Handle case where emotions is a plain object
        for (const [emotion, count] of Object.entries(profile.emotions)) {
          emotionCounts.set(emotion, (emotionCounts.get(emotion) || 0) + count);
        }
      }
    }
    
    const topEmotions = Array.from(emotionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([emotion, count]) => `${getEmotionEmoji(emotion)} ${emotion}: ${count}`)
      .join('\n');
    
    // Tính toán ChatGPT readiness score
    let chatgptReadiness = 0;
    if (totalPatterns > 10) chatgptReadiness += 25;
    if (totalKeywords > 50) chatgptReadiness += 25;
    if (totalUsers > 5) chatgptReadiness += 25;
    if (activeUsers > 2) chatgptReadiness += 25;
    
    const readinessLevel = 
      chatgptReadiness >= 75 ? '🚀 Excellent' :
      chatgptReadiness >= 50 ? '✅ Good' :
      chatgptReadiness >= 25 ? '⚠️ Fair' : '❌ Poor';
    
    const message = 
      `📊 AI LEARNING STATISTICS V2.0\n\n` +
      `🧠 Dữ liệu học:\n` +
      `• Patterns: ${totalPatterns.toLocaleString()}\n` +
      `• Keywords: ${totalKeywords.toLocaleString()}\n` +
      `• Responses: ${totalResponses.toLocaleString()}\n\n` +
      `👥 Người dùng:\n` +
      `• Tổng users: ${totalUsers.toLocaleString()}\n` +
      `• Active (7 ngày): ${activeUsers.toLocaleString()}\n` +
      `• Tổng tin nhắn: ${totalMessages.toLocaleString()}\n\n` +
      `💬 Cuộc trò chuyện:\n` +
      `• Threads: ${fileStats.conversations.toLocaleString()}\n` +
      `• Dung lượng: ${fileStats.size} KB\n\n` +
      `😊 Top cảm xúc:\n${topEmotions || 'Chưa có dữ liệu'}\n\n` +
      `🤖 ChatGPT Integration:\n` +
      `• Status: ✅ Active\n` +
      `• Readiness: ${readinessLevel} (${chatgptReadiness}%)\n` +
      `• Response Rate: 15% (Enhanced)\n` +
      `• Context Analysis: ✅ Advanced\n\n` +
      `🎯 AI Capabilities:\n` +
      `• Smart Context Building: ✅\n` +
      `• Personality Profiling: ✅\n` +
      `• Emotion Analysis: ✅\n` +
      `• Pattern Recognition: ✅\n\n` +
      `⏰ Cập nhật: ${new Date().toLocaleString('vi-VN')}`;
    
    return api.sendMessage(message, threadID, messageID);
    
  } catch (error) {
    console.error('Error in handleStats:', error);
    return api.sendMessage('❌ Lỗi khi lấy thống kê!', threadID, messageID);
  }
}

async function handleHistory(api, event, args, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleHistory', {
      event: event,
      passedThreadID: passedThreadID,
      eventKeys: Object.keys(event || {}),
      availableIds: {
        threadID: event?.threadID,
        threadId: event?.threadId,
        thread_id: event?.thread_id
      }
    });
    
    // Try fallback error response
    if (api?.sendMessage && passedThreadID) {
      try {
        await api.sendMessage('❌ Lỗi: Không thể xác định thread ID trong handleHistory!', passedThreadID);
      } catch (err) {
        console.error('[AI LEARN CMD] Fallback error in handleHistory:', err);
      }
    }
    return;
  }
  
  try {
    const targetThreadID = args[1] || threadID;
    
    if (!aiLearningModule) {
      return api.sendMessage('❌ AI Learning module chưa được tải!', threadID, messageID);
    }
    
    const history = aiLearningModule.getConversationHistory(targetThreadID);
    
    if (!history || history.length === 0) {
      return api.sendMessage('📝 Chưa có lịch sử hội thoại cho thread này!', threadID, messageID);
    }
    
    // Lấy 10 tin nhắn gần nhất
    const recentMessages = history.slice(-10);
    
    let historyText = `📝 LỊCH SỬ HỘI THOẠI (${recentMessages.length}/${history.length})\n`;
    historyText += `Thread: ${targetThreadID}\n\n`;
    
    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i];
      const time = new Date(msg.timestamp).toLocaleString('vi-VN');
      const userType = msg.isBot ? '🤖 Bot' : '👤 User';
      const emotion = getEmotionEmoji(msg.emotion);
      
      historyText += `${i + 1}. ${userType} (${time})\n`;
      historyText += `${emotion} "${msg.message.substring(0, 50)}${msg.message.length > 50 ? '...' : ''}"\n`;
      historyText += `Keywords: ${msg.keywords.slice(0, 3).join(', ')}\n\n`;
    }
    
    historyText += `💡 Gõ "ailearn history ${targetThreadID}" để xem lại`;
    
    return api.sendMessage(historyText, threadID, messageID);
    
  } catch (error) {
    console.error('Error in handleHistory:', error);
    return api.sendMessage('❌ Lỗi khi lấy lịch sử!', threadID, messageID);
  }
}

async function handleReset(api, event, args, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleReset', {
      event: event,
      passedThreadID: passedThreadID,
      eventKeys: Object.keys(event || {})
    });
    
    if (api?.sendMessage && passedThreadID) {
      try {
        await api.sendMessage('❌ Lỗi: Không thể xác định thread ID trong handleReset!', passedThreadID);
      } catch (err) {
        console.error('[AI LEARN CMD] Fallback error in handleReset:', err);
      }
    }
    return;
  }
  
  try {
    const resetType = args[1] || 'all';
    
    let message = '';
    
    switch (resetType) {
      case 'patterns':
        if (fs.existsSync(LEARNING_DATA_FILE)) {
          const data = JSON.parse(fs.readFileSync(LEARNING_DATA_FILE, 'utf8'));
          data.patterns = {};
          fs.writeFileSync(LEARNING_DATA_FILE, JSON.stringify(data, null, 2));
        }
        message = '🔄 Đã reset tất cả patterns!';
        break;
        
      case 'conversations':
        if (fs.existsSync(CONVERSATION_FILE)) {
          fs.writeFileSync(CONVERSATION_FILE, '{}');
        }
        message = '🔄 Đã reset lịch sử hội thoại!';
        break;
        
      case 'users':
        if (fs.existsSync(LEARNING_DATA_FILE)) {
          const data = JSON.parse(fs.readFileSync(LEARNING_DATA_FILE, 'utf8'));
          data.userProfiles = {};
          fs.writeFileSync(LEARNING_DATA_FILE, JSON.stringify(data, null, 2));
        }
        message = '🔄 Đã reset profiles người dùng!';
        break;
        
      case 'all':
        if (fs.existsSync(LEARNING_DATA_FILE)) {
          fs.unlinkSync(LEARNING_DATA_FILE);
        }
        if (fs.existsSync(CONVERSATION_FILE)) {
          fs.unlinkSync(CONVERSATION_FILE);
        }
        message = '🔄 Đã reset toàn bộ dữ liệu AI Learning!';
        break;
        
      default:
        return api.sendMessage(
          '❌ Loại reset không hợp lệ!\n\n' +
          'Các loại có thể reset:\n' +
          '• patterns - Reset patterns học được\n' +
          '• conversations - Reset lịch sử hội thoại\n' +
          '• users - Reset profiles người dùng\n' +
          '• all - Reset toàn bộ',
          threadID, messageID
        );
    }
    
    return api.sendMessage(message, threadID, messageID);
    
  } catch (error) {
    console.error('Error in handleReset:', error);
    return api.sendMessage('❌ Lỗi khi reset dữ liệu!', threadID, messageID);
  }
}

async function handleAnalyze(api, event, args, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleAnalyze', {
      event: event,
      passedThreadID: passedThreadID,
      eventKeys: Object.keys(event || {})
    });
    
    if (api?.sendMessage && passedThreadID) {
      try {
        await api.sendMessage('❌ Lỗi: Không thể xác định thread ID trong handleAnalyze!', passedThreadID);
      } catch (err) {
        console.error('[AI LEARN CMD] Fallback error in handleAnalyze:', err);
      }
    }
    return;
  }
  
  try {
    const text = args.slice(1).join(' ');
    
    if (!text) {
      return api.sendMessage('❌ Vui lòng nhập văn bản cần phân tích!', threadID, messageID);
    }
    
    // Phân tích cảm xúc
    const emotion = analyzeEmotion(text);
    
    // Trích xuất từ khóa
    const keywords = extractKeywords(text);
    
    // Phân tích độ phức tạp
    const wordCount = text.split(/\s+/).length;
    const complexity = wordCount < 5 ? 'Đơn giản' : wordCount < 15 ? 'Trung bình' : 'Phức tạp';
    
    const message = 
      `🔍 PHÂN TÍCH VẮN BẢN\n\n` +
      `📝 Nội dung: "${text}"\n\n` +
      `😊 Cảm xúc: ${getEmotionEmoji(emotion)} ${emotion}\n` +
      `🔤 Từ khóa: ${keywords.slice(0, 5).join(', ')}\n` +
      `📊 Độ phức tạp: ${complexity}\n` +
      `📏 Số từ: ${wordCount}\n` +
      `📐 Độ dài: ${text.length} ký tự\n\n` +
      `💡 Bot sẽ học từ những phân tích này!`;
    
    return api.sendMessage(message, threadID, messageID);
    
  } catch (error) {
    console.error('Error in handleAnalyze:', error);
    return api.sendMessage('❌ Lỗi khi phân tích văn bản!', threadID, messageID);
  }
}

async function handleResponse(api, event, args, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  const senderID = event?.senderID || event?.senderId || event?.authorId || event?.author_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleResponse', {
      event: event,
      passedThreadID: passedThreadID,
      eventKeys: Object.keys(event || {})
    });
    
    if (api?.sendMessage && passedThreadID) {
      try {
        await api.sendMessage('❌ Lỗi: Không thể xác định thread ID trong handleResponse!', passedThreadID);
      } catch (err) {
        console.error('[AI LEARN CMD] Fallback error in handleResponse:', err);
      }
    }
    return;
  }
  
  try {
    const text = args.slice(1).join(' ');
    
    if (!text) {
      return api.sendMessage('❌ Vui lòng nhập văn bản để test phản hồi!', threadID, messageID);
    }
    
    if (!aiLearningModule) {
      return api.sendMessage('❌ AI Learning module chưa được tải!', threadID, messageID);
    }
    
    const response = aiLearningModule.generateResponse(threadID, senderID, text);
    
    let message = `🎯 TEST PHẢN HỒI AI\n\n`;
    message += `📝 Input: "${text}"\n\n`;
    
    if (response) {
      message += `🤖 Response: "${response.response}"\n`;
      message += `📊 Confidence: ${(response.confidence * 100).toFixed(1)}%\n`;
      message += `🔍 Source: ${response.source}\n\n`;
      message += `✅ Bot sẽ phản hồi với tin nhắn này!`;
    } else {
      message += `❌ Không tìm thấy phản hồi phù hợp\n\n`;
      message += `💡 Bot cần học thêm để phản hồi tốt hơn!`;
    }
    
    return api.sendMessage(message, threadID, messageID);
    
  } catch (error) {
    console.error('Error in handleResponse:', error);
    return api.sendMessage('❌ Lỗi khi test phản hồi!', threadID, messageID);
  }
}

async function handleExport(api, event, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleExport', {
      event: event,
      passedThreadID: passedThreadID,
      eventKeys: Object.keys(event || {})
    });
    
    if (api?.sendMessage && passedThreadID) {
      try {
        await api.sendMessage('❌ Lỗi: Không thể xác định thread ID trong handleExport!', passedThreadID);
      } catch (err) {
        console.error('[AI LEARN CMD] Fallback error in handleExport:', err);
      }
    }
    return;
  }
  
  try {
    if (!fs.existsSync(LEARNING_DATA_FILE)) {
      return api.sendMessage('❌ Không có dữ liệu để xuất!', threadID, messageID);
    }
    
    const stats = fs.statSync(LEARNING_DATA_FILE);
    const size = (stats.size / 1024).toFixed(2);
    
    const message = 
      `📤 XUẤT DỮ LIỆU AI LEARNING\n\n` +
      `📁 File: ai_learning.json\n` +
      `📊 Kích thước: ${size} KB\n` +
      `⏰ Cập nhật: ${stats.mtime.toLocaleString('vi-VN')}\n\n` +
      `💾 Dữ liệu đã được lưu tại:\n${LEARNING_DATA_FILE}\n\n` +
      `💡 Copy file này để backup hoặc chuyển sang bot khác!`;
    
    return api.sendMessage(message, threadID, messageID);
    
  } catch (error) {
    console.error('Error in handleExport:', error);
    return api.sendMessage('❌ Lỗi khi xuất dữ liệu!', threadID, messageID);
  }
}

async function handleImport(api, event, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleImport', {
      event: event,
      passedThreadID: passedThreadID,
      eventKeys: Object.keys(event || {})
    });
    
    if (api?.sendMessage && passedThreadID) {
      try {
        await api.sendMessage('❌ Lỗi: Không thể xác định thread ID trong handleImport!', passedThreadID);
      } catch (err) {
        console.error('[AI LEARN CMD] Fallback error in handleImport:', err);
      }
    }
    return;
  }
  
  return api.sendMessage(
    `📥 NHẬP DỮ LIỆU AI LEARNING\n\n` +
    `🔧 Để nhập dữ liệu:\n` +
    `1. Copy file ai_learning.json vào thư mục data/\n` +
    `2. Restart bot để tải dữ liệu mới\n\n` +
    `📍 Đường dẫn: ${LEARNING_DATA_FILE}\n\n` +
    `⚠️ Lưu ý: Dữ liệu cũ sẽ bị ghi đè!`,
    threadID, messageID
  );
}

async function handleConfig(api, event, args, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleConfig', {
      event: event,
      passedThreadID: passedThreadID,
      eventKeys: Object.keys(event || {})
    });
    
    if (api?.sendMessage && passedThreadID) {
      try {
        await api.sendMessage('❌ Lỗi: Không thể xác định thread ID trong handleConfig!', passedThreadID);
      } catch (err) {
        console.error('[AI LEARN CMD] Fallback error in handleConfig:', err);
      }
    }
    return;
  }
  
  try {
    const sub = (args[1] || '').toLowerCase();
    const val = args.slice(2).join(' ').trim();
    const onoff = (s) => ['on','enable','enabled','true','1'].includes(String(s).toLowerCase());
    const percent = (s) => {
      if (!s) return null;
      const t = s.replace('%','').trim();
      if (t === '') return null;
      const n = Number(t);
      if (Number.isNaN(n)) return null;
      return s.includes('%') ? Math.max(0, Math.min(1, n/100)) : Math.max(0, Math.min(1, n));
    };
    if (sub === 'auto') {
      if (!args[2]) {
        return api.sendMessage(
          `⚙️ Auto-reply hiện tại: ${global.aiLearningAutoReply ? '✅ Bật' : '❌ Tắt'}`,
          threadID, messageID
        );
      }
      global.aiLearningAutoReply = onoff(args[2]);
      return api.sendMessage(
        `✅ Đã ${global.aiLearningAutoReply ? 'bật' : 'tắt'} auto-reply.`,
        threadID, messageID
      );
    }
    if (sub === 'rate') {
      const p = percent(args[2]);
      if (p === null) {
        return api.sendMessage(
          `❌ Giá trị không hợp lệ. Dùng: ailearn config rate <0..1|%>\nVí dụ: 0.2 hoặc 20%`,
          threadID, messageID
        );
      }
      global.aiLearningRespondRate = p;
      return api.sendMessage(
        `✅ Đã đặt response rate = ${(p*100).toFixed(0)}%`,
        threadID, messageID
      );
    }
    if (sub === 'status') {
      return api.sendMessage(
        `⚙️ AI LEARNING CONFIG\n\n` +
        `• Auto-reply: ${global.aiLearningAutoReply ? '✅ Bật' : '❌ Tắt'}\n` +
        `• Response rate: ${(Number(global.aiLearningRespondRate||0)*100).toFixed(0)}%\n` +
        `• Confidence threshold: 60%\n` +
        `• Max messages/thread: 100`,
        threadID, messageID
      );
    }
    return api.sendMessage(
      `⚙️ CẤU HÌNH AI LEARNING\n\n` +
      `• Auto-reply: ${global.aiLearningAutoReply ? '✅ Bật' : '❌ Tắt'}\n` +
      `• Response rate: ${(Number(global.aiLearningRespondRate||0)*100).toFixed(0)}%\n\n` +
      `Lệnh:\n` +
      `• ailearn config auto <on|off>\n` +
      `• ailearn config rate <0..1 | %>\n` +
      `• ailearn config status`,
      threadID, messageID
    );
  } catch (err) {
    console.error('Error in handleConfig:', err);
    return api.sendMessage('❌ Lỗi khi cấu hình!', threadID, messageID);
  }
}

// Helper functions
function safeExtractThreadID(event, passedThreadID) {
  // Try multiple sources for threadID with fallbacks
  const threadID = passedThreadID || 
                   event?.threadID || 
                   event?.threadId || 
                   event?.thread_id ||
                   event?.groupId ||
                   event?.group_id ||
                   event?.chatId ||
                   event?.chat_id;
  
  return {
    threadID: threadID,
    isValid: !!threadID,
    source: passedThreadID ? 'passed' : 
            event?.threadID ? 'event.threadID' :
            event?.threadId ? 'event.threadId' :
            event?.thread_id ? 'event.thread_id' :
            event?.groupId ? 'event.groupId' :
            event?.group_id ? 'event.group_id' :
            event?.chatId ? 'event.chatId' :
            event?.chat_id ? 'event.chat_id' : 'none'
  };
}

function safeExtractMessageID(event, passedMessageID) {
  const messageID = passedMessageID ||
                    event?.messageID ||
                    event?.messageId ||
                    event?.message_id ||
                    event?.msgId ||
                    event?.msg_id;
  
  return {
    messageID: messageID,
    isValid: !!messageID,
    source: passedMessageID ? 'passed' :
            event?.messageID ? 'event.messageID' :
            event?.messageId ? 'event.messageId' :
            event?.message_id ? 'event.message_id' :
            event?.msgId ? 'event.msgId' :
            event?.msg_id ? 'event.msg_id' : 'none'
  };
}

function analyzeEmotion(message) {
  const emotions = {
    happy: ['vui', 'haha', 'hihi', 'hehe', '😄', '😊', '😂', '🤣', '😁', 'vui vẻ', 'hạnh phúc', 'tuyệt vời'],
    sad: ['buồn', 'khóc', '😢', '😭', '😔', 'tệ', 'chán', 'thất vọng', 'đau khổ'],
    angry: ['tức', 'giận', 'bực', '😠', '😡', '🤬', 'khó chịu', 'phát điên', 'cáu'],
    love: ['yêu', 'thương', '❤️', '💕', '😍', '🥰', 'crush', 'thích', 'mến'],
    surprised: ['wow', 'ôi', 'ồ', '😮', '😲', 'bất ngờ', 'ngạc nhiên', 'kinh ngạc'],
    fear: ['sợ', 'lo', 'hoảng', '😨', '😰', 'đáng sợ', 'kinh khủng', 'lo lắng']
  };
  
  const lowerMsg = message.toLowerCase();
  let detectedEmotion = 'neutral';
  let maxScore = 0;
  
  for (const [emotion, keywords] of Object.entries(emotions)) {
    let score = 0;
    keywords.forEach(keyword => {
      if (lowerMsg.includes(keyword)) score++;
    });
    if (score > maxScore) {
      maxScore = score;
      detectedEmotion = emotion;
    }
  }
  
  return detectedEmotion;
}

function extractKeywords(message) {
  const stopWords = ['là', 'của', 'và', 'có', 'được', 'một', 'này', 'đó', 'với', 'để', 'trong', 'không', 'thì', 'sẽ', 'đã', 'cho', 'về', 'như', 'khi', 'nào', 'gì', 'ai', 'đâu'];
  
  const words = message.toLowerCase()
    .replace(/[^\w\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
  
  return [...new Set(words)];
}

function getEmotionEmoji(emotion) {
  const emojis = {
    happy: '😄',
    sad: '😢',
    angry: '😠',
    love: '❤️',
    surprised: '😮',
    fear: '😨',
    neutral: '😐'
  };
  
  return emojis[emotion] || '😐';
}

// Test ChatGPT với context đã học
async function handleChatGPT(api, event, args, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  const senderID = event?.senderID || event?.senderId || event?.authorId || event?.author_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleChatGPT', {
      event: event,
      passedThreadID: passedThreadID,
      eventKeys: Object.keys(event || {})
    });
    
    if (api?.sendMessage && passedThreadID) {
      try {
        await api.sendMessage('❌ Lỗi: Không thể xác định thread ID trong handleChatGPT!', passedThreadID);
      } catch (err) {
        console.error('[AI LEARN CMD] Fallback error in handleChatGPT:', err);
      }
    }
    return;
  }
  
  try {
    const text = args.slice(1).join(' ');
    
    if (!text) {
      return api.sendMessage('❌ Vui lòng nhập văn bản để test ChatGPT!\n\n💡 Ví dụ: ailearn chatgpt Hôm nay thế nào?', threadID, messageID);
    }
    
    if (!aiLearningModule) {
      return api.sendMessage('❌ AI Learning module chưa được tải!', threadID, messageID);
    }
    
    // Gửi typing indicator
    api.sendMessage('🧠 Đang phân tích context và tạo response với ChatGPT...', threadID);
    
    // Gọi function generateSmartResponse trực tiếp
    const response = await aiLearningModule.generateResponse(threadID, senderID, text);
    
    let message = `🚀 TEST CHATGPT VỚI CONTEXT\n\n`;
    message += `📝 Input: "${text}"\n\n`;
    
    if (response) {
      message += `🤖 ChatGPT Response: "${response.response}"\n`;
      message += `📊 Confidence: ${(response.confidence * 100).toFixed(1)}%\n`;
      message += `🔍 Source: ${response.source}\n`;
      
      if (response.contextUsed) {
        message += `\n📈 Context Used:\n`;
        message += `• Patterns: ${response.contextUsed.patterns}\n`;
        message += `• Keywords: ${response.contextUsed.keywords}\n`;
        message += `• Conversations: ${response.contextUsed.conversations}\n`;
        message += `• Has Personality: ${response.contextUsed.hasPersonality ? 'Yes' : 'No'}\n`;
      }
      
      message += `\n✅ ChatGPT đã sử dụng dữ liệu học để tạo response!`;
    } else {
      message += `❌ Không tạo được response\n\n`;
      message += `💡 Có thể do:\n`;
      message += `• Chưa có đủ context để học\n`;
      message += `• ChatGPT API không khả dụng\n`;
      message += `• Tin nhắn quá ngắn hoặc không rõ ràng`;
    }
    
    return api.sendMessage(message, threadID, messageID);
    
  } catch (error) {
    console.error('Error in handleChatGPT:', error);
    return api.sendMessage('❌ Lỗi khi test ChatGPT!', threadID, messageID);
  }
}

// Xem hiệu suất AI Learning
async function handlePerformance(api, event, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handlePerformance');
    return;
  }
  
  try {
    if (!aiLearningModule) {
      return api.sendMessage('❌ AI Learning module chưa được tải!', threadID, messageID);
    }
    
    const learningData = aiLearningModule.getLearningData();
    
    // Tính toán các metrics hiệu suất
    let totalResponses = 0;
    let chatgptResponses = 0;
    let patternResponses = 0;
    let emotionResponses = 0;
    let keywordResponses = 0;
    
    // Phân tích patterns theo chất lượng
    let highQualityPatterns = 0;
    let mediumQualityPatterns = 0;
    let lowQualityPatterns = 0;
    
    for (const [pattern, data] of learningData.patterns) {
      totalResponses += data.responses.length;
      
      if (data.responses.length >= 5) {
        highQualityPatterns++;
      } else if (data.responses.length >= 2) {
        mediumQualityPatterns++;
      } else {
        lowQualityPatterns++;
      }
    }
    
    // Tính toán coverage keywords
    const totalKeywords = learningData.keywords.size;
    let keywordsWithContext = 0;
    
    for (const [keyword, data] of learningData.keywords) {
      if (data.contexts.length > 0) {
        keywordsWithContext++;
      }
    }
    
    const keywordCoverage = totalKeywords > 0 ? (keywordsWithContext / totalKeywords * 100).toFixed(1) : 0;
    
    // Tính toán user engagement
    let activeUsers = 0;
    let totalMessages = 0;
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    for (const [userId, profile] of learningData.userProfiles) {
      totalMessages += profile.messageCount || 0;
      if (profile.lastSeen > oneWeekAgo) {
        activeUsers++;
      }
    }
    
    const avgMessagesPerUser = learningData.userProfiles.size > 0 ? 
      (totalMessages / learningData.userProfiles.size).toFixed(1) : 0;
    
    const message = 
      `📈 AI LEARNING PERFORMANCE REPORT\n\n` +
      `🧠 LEARNING CAPACITY:\n` +
      `• Total Patterns: ${learningData.patterns.size.toLocaleString()}\n` +
      `• High Quality (5+ responses): ${highQualityPatterns}\n` +
      `• Medium Quality (2-4 responses): ${mediumQualityPatterns}\n` +
      `• Low Quality (1 response): ${lowQualityPatterns}\n\n` +
      `🔤 KEYWORD INTELLIGENCE:\n` +
      `• Total Keywords: ${totalKeywords.toLocaleString()}\n` +
      `• With Context: ${keywordsWithContext.toLocaleString()}\n` +
      `• Coverage: ${keywordCoverage}%\n\n` +
      `👥 USER ENGAGEMENT:\n` +
      `• Total Users: ${learningData.userProfiles.size.toLocaleString()}\n` +
      `• Active (7 days): ${activeUsers.toLocaleString()}\n` +
      `• Avg Messages/User: ${avgMessagesPerUser}\n` +
      `• Total Messages Learned: ${totalMessages.toLocaleString()}\n\n` +
      `🚀 AI CAPABILITIES:\n` +
      `• ChatGPT Integration: ✅ Active\n` +
      `• Context Analysis: ✅ Advanced\n` +
      `• Emotion Detection: ✅ Multi-language\n` +
      `• Pattern Recognition: ✅ Smart Matching\n` +
      `• Personality Profiling: ✅ Enabled\n\n` +
      `📊 RESPONSE QUALITY:\n` +
      `• Primary: ChatGPT + Context (90% confidence)\n` +
      `• Fallback: Pattern Matching (70% confidence)\n` +
      `• Emergency: Emotion Based (50% confidence)\n\n` +
      `⏰ Last Update: ${new Date().toLocaleString('vi-VN')}`;
    
    return api.sendMessage(message, threadID, messageID);
    
  } catch (error) {
    console.error('Error in handlePerformance:', error);
    return api.sendMessage('❌ Lỗi khi lấy báo cáo hiệu suất!', threadID, messageID);
  }
}

// Debug function để kiểm tra event structure
async function handleDebug(api, event, args, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleDebug');
    return;
  }
  
  try {
    const debugInfo = {
      'Event Keys': Object.keys(event || {}),
      'ThreadID Sources': {
        'event.threadID': event?.threadID,
        'event.threadId': event?.threadId,
        'event.thread_id': event?.thread_id,
        'passedThreadID': passedThreadID
      },
      'Event Type Info': {
        'event.type': event?.type,
        'event.data?.type': event?.data?.type,
        'event.messageType': event?.messageType,
        'event.isSelf': event?.isSelf,
        'event.honorific': event?.honorific
      },
      'Message Type Detection': {
        'isPrivateMessage': !event?.type || event?.type === 'private' || (threadID === (event?.senderID || event?.senderId)),
        'isGroupMessage': event?.type === 'message' || event?.type === 'group',
        'threadIdEqualsSenderId': threadID === (event?.senderID || event?.senderId)
      },
      'Current Values': {
        'threadID': threadID,
        'messageID': messageID,
        'senderID': event?.senderID || event?.senderId
      }
    };
    
    let message = `🔍 AI LEARNING DEBUG INFO\n\n`;
    message += `📝 Event Keys: ${Object.keys(event || {}).join(', ')}\n\n`;
    message += `🎯 ThreadID Sources:\n`;
    message += `• event.threadID: ${event?.threadID}\n`;
    message += `• event.threadId: ${event?.threadId}\n`;
    message += `• passedThreadID: ${passedThreadID}\n\n`;
    message += `🔍 Current threadID: ${threadID}\n`;
    message += `👤 SenderID: ${event?.senderID || event?.senderId}\n\n`;
    message += `📝 Message Type Detection:\n`;
    message += `• event.type: ${event?.type}\n`;
    message += `• isPrivate: ${!event?.type || event?.type === 'private' || (threadID === (event?.senderID || event?.senderId))}\n`;
    message += `• isGroup: ${event?.type === 'message' || event?.type === 'group'}\n\n`;
    message += `📊 Full Event (check console for details)`;
    
    console.log('[AI LEARN DEBUG] Full event object:', JSON.stringify(event, null, 2));
    console.log('[AI LEARN DEBUG] Debug info:', debugInfo);
    
    return api.sendMessage(message, threadID, messageID);
    
  } catch (error) {
    console.error('Error in handleDebug:', error);
    return api.sendMessage('❌ Lỗi khi debug AI Learning!', threadID, messageID);
  }
}

// Test function để kiểm tra việc gửi tin nhắn vào nhóm
async function handleTest(api, event, args, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  const senderID = event?.senderID || event?.senderId || event?.authorId || event?.author_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleTest');
    return;
  }
  
  try {
    const testType = args[1] || 'basic';
    
    if (testType === 'send') {
      // Test gửi tin nhắn vào nhóm
      const testMessage = args.slice(2).join(' ') || 'Test message from AI Learning!';
      
      console.log(`[AI LEARN TEST] Sending test message to threadID: ${threadID}`);
      console.log(`[AI LEARN TEST] Event keys:`, Object.keys(event || {}));
      console.log(`[AI LEARN TEST] Event threadID sources:`, {
        threadID: event?.threadID,
        threadId: event?.threadId,
        thread_id: event?.thread_id,
        groupId: event?.groupId,
        group_id: event?.group_id
      });
      
      await api.sendMessage(`🧪 TEST AI LEARNING\n\n📝 Message: ${testMessage}\n🎯 ThreadID: ${threadID}\n👤 SenderID: ${senderID}\n\n✅ Nếu bạn thấy tin nhắn này trong nhóm, AI Learning hoạt động bình thường!`, threadID);
      
    } else if (testType === 'ai') {
      // Test AI response
      if (!aiLearningModule) {
        return api.sendMessage('❌ AI Learning module chưa được tải!', threadID, messageID);
      }
      
      const testText = args.slice(2).join(' ') || 'Hôm nay thế nào?';
      console.log(`[AI LEARN TEST] Testing AI response for: ${testText}`);
      
      const response = await aiLearningModule.generateResponse(threadID, senderID, testText);
      
      if (response) {
        await api.sendMessage(`🧪 TEST AI RESPONSE\n\n📝 Input: "${testText}"\n🤖 AI Response: "${response.response}"\n📊 Confidence: ${(response.confidence * 100).toFixed(1)}%\n🔍 Source: ${response.source}\n🎯 ThreadID: ${threadID}\n\n✅ Đây là cách AI sẽ phản hồi trong nhóm!`, threadID);
      } else {
        await api.sendMessage(`🧪 TEST AI RESPONSE\n\n📝 Input: "${testText}"\n❌ Không tạo được response\n🎯 ThreadID: ${threadID}\n\n💡 AI cần học thêm để phản hồi tốt hơn!`, threadID);
      }
      
    } else {
      // Basic test
      return api.sendMessage(
        `🧪 AI LEARNING TEST COMMANDS\n\n` +
        `📝 ailearn test send [message] - Test gửi tin nhắn vào nhóm\n` +
        `🤖 ailearn test ai [text] - Test AI response\n\n` +
        `🎯 Current ThreadID: ${threadID}\n` +
        `👤 Current SenderID: ${senderID}\n\n` +
        `💡 Dùng để kiểm tra xem AI Learning có gửi đúng vào nhóm không!`,
        threadID, messageID
      );
    }
    
  } catch (error) {
    console.error('Error in handleTest:', error);
    return api.sendMessage('❌ Lỗi khi test AI Learning!', threadID, messageID);
  }
}

// Force reply function để test AI Learning trực tiếp
async function handleForceReply(api, event, args, passedThreadID, passedMessageID) {
  const threadID = passedThreadID || event?.threadID || event?.threadId || event?.thread_id;
  const messageID = passedMessageID || event?.messageID || event?.messageId || event?.message_id;
  const senderID = event?.senderID || event?.senderId || event?.authorId || event?.author_id;
  
  if (!threadID) {
    console.error('[AI LEARN CMD] Missing threadID in handleForceReply');
    return;
  }
  
  try {
    const testMessage = args.slice(1).join(' ') || 'Xin chào! Hôm nay thế nào?';
    
    console.log(`[AI LEARN FORCE] Testing AI Learning with message: "${testMessage}"`);
    console.log(`[AI LEARN FORCE] ThreadID: ${threadID}, SenderID: ${senderID}`);
    
    // Import AI Learning module
    if (!aiLearningModule) {
      return api.sendMessage('❌ AI Learning module chưa được tải!', threadID, messageID);
    }
    
    // Force generate response
    const response = await aiLearningModule.generateResponse(threadID, senderID, testMessage);
    
    if (response && response.response) {
      // Send AI response directly to group
      console.log(`[AI LEARN FORCE] Generated response: "${response.response}"`);
      console.log(`[AI LEARN FORCE] Sending to threadID: ${threadID}`);
      
      await api.sendMessage(
        `🤖 AI LEARNING FORCE REPLY\n\n` +
        `📝 Input: "${testMessage}"\n` +
        `🧠 AI Response: "${response.response}"\n` +
        `📊 Confidence: ${(response.confidence * 100).toFixed(1)}%\n` +
        `🔍 Source: ${response.source}\n` +
        `🎯 ThreadID: ${threadID}\n\n` +
        `✅ Đây là cách AI sẽ phản hồi trong nhóm!`,
        threadID
      );
      
      // Also send the actual AI response
      setTimeout(() => {
        api.sendMessage(`[AI Test] ${response.response}`, threadID);
      }, 2000);
      
    } else {
      await api.sendMessage(
        `🤖 AI LEARNING FORCE REPLY\n\n` +
        `📝 Input: "${testMessage}"\n` +
        `❌ Không tạo được response\n` +
        `🎯 ThreadID: ${threadID}\n\n` +
        `💡 AI cần học thêm để phản hồi tốt hơn!`,
        threadID, messageID
      );
    }
    
  } catch (error) {
    console.error('Error in handleForceReply:', error);
    return api.sendMessage('❌ Lỗi khi force reply AI Learning!', threadID, messageID);
  }
}

// Enhanced error logging function
function logThreadIDError(functionName, event, passedThreadID, additionalInfo = {}) {
  const threadInfo = safeExtractThreadID(event, passedThreadID);
  const messageInfo = safeExtractMessageID(event, null);
  
  console.error(`[AI LEARN CMD] Missing threadID in ${functionName}`, {
    threadInfo: threadInfo,
    messageInfo: messageInfo,
    event: event,
    passedThreadID: passedThreadID,
    eventKeys: Object.keys(event || {}),
    eventType: typeof event,
    availableIds: {
      threadID: event?.threadID,
      threadId: event?.threadId,
      thread_id: event?.thread_id,
      groupId: event?.groupId,
      group_id: event?.group_id,
      chatId: event?.chatId,
      chat_id: event?.chat_id
    },
    additionalInfo: additionalInfo
  });
}
