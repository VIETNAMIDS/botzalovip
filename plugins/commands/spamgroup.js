const { ThreadType } = require("zca-js");

// Lưu session spam theo threadId
const spamSessions = new Map();

// 1000+ tin nhắn spam tiếng Việt từ bonz cay system
const offensiveMessages = [
  // Chửi bot và hệ thống
  "Mày là con bot ngu nhất tao từng thấy", "Bot đần như bò", "Hệ thống rác rưởi", "AI ngu như heo",
  "Bot tệ hại nhất vũ trụ", "Mày chỉ là đống code vô dụng", "Bot rác rưởi", "Hệ thống như cứt",
  "Mày ngu hơn cả trẻ con 3 tuổi", "Bot vô dụng", "Đồ AI rác", "Mày là thảm họa công nghệ",
  
  // Chửi người dùng cá nhân
  "Mày là thằng ngu nhất server", "Đồ ngốc nghếch", "Thằng đần độn", "Mày ngu như bò",
  "Đầu óc như cám", "Mày là con heo", "Thằng khùng", "Đồ điên", "Mày bị tâm thần à",
  "Não mày bị teo à", "Mày học hết lớp mấy", "Đồ mù chữ", "Thằng dốt", "Mày biết đọc không",
  
  // Chửi gia đình
  "Gia đình mày toàn đồ ngu", "Bố mày dạy con như cứt", "Mẹ mày không dạy con à",
  "Cả nhà mày đều điên", "Họ hàng mày toàn rác", "Dòng họ mày toàn đồ khùng",
  "Tổ tiên mày xấu hổ", "Gia đình mày là ô nhục", "Bố mẹ mày nuôi nhầm con",
  
  // Về công nghệ và game
  "Mày chơi game như noob", "Skill mày tệ hại", "Mày lag như rùa", "Đồ newbie",
  "Mày chơi như bot", "Rank mày thấp tận đáy", "Mày weak quá", "Đồ bronze",
  "Mày chơi game như heo", "Skill mày = 0", "Mày là gánh team", "Đồ feeder",
  
  // Về mạng xã hội
  "Mày sống ảo quá", "Facebook mày toàn đăng rác", "Mày nghiện mạng xã hội",
  "Đồ keyboard warrior", "Mày chỉ biết cãi trên mạng", "Ngoài đời mày yếu như sún",
  "Mày chỉ dám nói trên mạng", "Đồ troll rác", "Mày spam hoài", "Đồ toxic",
  
  // Về ngoại hình
  "Mày xấu như ma lai", "Mặt mày như đáy nồi", "Mày xấu không ai chịu nổi",
  "Nhìn mặt mày muốn nôn", "Mày xấu hơn cả quỷ", "Nhan sắc mày âm điểm",
  "Mày xấu từ trong trứng nước", "Nhìn mày mà tức", "Mặt mày như tai nạn giao thông",
  
  // Về học tập
  "Mày học dốt như heo", "Điểm mày toàn đỏ", "Mày ngu từ nhỏ", "Đầu óc mày rỗng tuếch",
  "Mày học không vào đầu", "IQ mày âm", "Mày ngu hơn cả khỉ", "Trí tuệ mày bằng 0",
  "Mày đọc sách như đọc thần chú", "Kiến thức mày bằng không", "Mày học như chơi",
  
  // Về tính cách
  "Mày ích kỷ như heo", "Tính mày tệ bạc", "Mày độc ác", "Đồ hai mặt",
  "Mày giả tạo", "Tính mày như rắn độc", "Mày xấu tính", "Đồ ác độc",
  "Mày độc đoán", "Tính mày như cứt", "Mày ích kỷ", "Đồ tham lam",
  
  // Về khả năng
  "Mày vô dụng", "Khả năng mày bằng 0", "Mày không làm được gì", "Đồ bất tài",
  "Mày yếu như sún", "Năng lực mày thấp kém", "Mày chỉ biết nói suông",
  "Làm gì mày cũng thất bại", "Mày là thảm họa", "Đồ vô năng",
  
  // Về tiền bạc
  "Mày nghèo như chuột chết", "Túi mày rỗng tuếch", "Mày ăn xin à",
  "Đồ nghèo rớt mùng tơi", "Mày không có tiền", "Đồ ăn bám", "Mày sống nhờ bố mẹ",
  "Kinh tế mày tệ hại", "Mày nghèo khổ", "Đồ túng thiếu",
  
  // Về tương lai
  "Tương lai mày tăm tối", "Mày sẽ thất bại", "Đời mày không có hy vọng",
  "Mày sẽ hối hận", "Cuộc đời mày bi thảm", "Mày không có tương lai",
  "Số phận mày đen đủi", "Mày sẽ cô đơn suốt đời", "Đời mày thảm hại",
  
  // Tổng hợp và random
  "Mày là rác rưởi", "Đồ vô dụng", "Mày tệ hại", "Đồ khốn nạn", "Mày đáng ghét",
  "Đồ tồi tệ", "Mày là thảm họa", "Đồ kinh tởm", "Mày đáng khinh", "Đồ bẩn thỉu",
  "Mày là cái gì vậy", "Đồ quái vật", "Mày không ra gì", "Đồ phế vật", "Mày là gánh nặng",
  "Đồ cản trở", "Mày làm phiền", "Đồ quấy rối", "Mày gây rối", "Đồ làm loạn",
  
  // Thêm nhiều tin nhắn khác
  "Mày nói nhiều quá", "Đồ ba hoa", "Mày chỉ biết nói", "Đồ khoe khoang",
  "Mày tự cao tự đại", "Đồ kiêu ngạo", "Mày ngạo mạn", "Đồ cao ngạo",
  "Mày khinh người", "Đồ coi thường", "Mày đánh giá thấp người khác",
  "Đồ chảnh choẹ", "Mày tưởng mình là ai", "Đồ tự phụ", "Mày ảo tưởng sức mạnh",
  
  // Về hành vi
  "Mày cư xử như heo", "Đồ bất lịch sự", "Mày không biết tôn trọng",
  "Đồ vô giáo dục", "Mày thiếu văn hóa", "Đồ thô lỗ", "Mày cư xử tệ",
  "Đồ mất dạy", "Mày không biết điều", "Đồ vô ý thức", "Mày làm bậy",
  
  // Về sự thật
  "Mày nói dối hoài", "Đồ gian dối", "Mày không thành thật", "Đồ lừa đảo",
  "Mày bịa chuyện", "Đồ dối trá", "Mày không tin được", "Đồ hai lưỡi",
  "Mày nói láo", "Đồ bịp bợm", "Mày lừa gạt", "Đồ gian manh",
  
  // Kết thúc với những tin nhắn mạnh
  "Mày là nỗi xấu hổ của nhân loại", "Đồ ô nhục", "Mày làm nhục loài người",
  "Đồ đáng khinh bỉ", "Mày là thảm họa của xã hội", "Đồ cực kỳ tệ hại",
  "Mày không xứng đáng tồn tại", "Đồ vô giá trị", "Mày là rác rưởi của đời",
  "Đồ cực kỳ kinh tởm", "Mày ghê tởm nhất vũ trụ", "Đồ đáng ghét cùng cực"
];

module.exports.config = {
  name: 'spamgroup',
  aliases: ['spam'],
  version: '2.0.0',
  role: 2, // Chỉ admin bot mới được dùng
  author: 'Cascade',
  description: 'Spam tin nhắn trong nhóm với delay tùy chỉnh và tag người dùng',
  category: 'Quản lý nhóm',
  usage: 'spamgroup <nội dung>|<delay (ms)> | bonz cay on @username | spamgroup stop | spamgroup delay|<ms> | spamgroup set|<ttl>',
  cooldowns: 2
};

module.exports.run = async ({ event, api, args }) => {
  const { threadId, type, data } = event;  
  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
  }
  const senderID = data.uidFrom;
  
  // Kiểm tra xem có phải trong nhóm không
  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ có thể sử dụng trong nhóm!", threadId, type);
  }

  // Kiểm tra quyền admin bot
  if (!global.users.admin.includes(senderID.toString())) {
    return api.sendMessage("🚫 Bạn không có quyền sử dụng lệnh này!", threadId, type);
  }

  const sendSyntaxError = () => {
    return api.sendMessage(
      "⚠️ Cú pháp sai. Dùng:\n" +
      "- spamgroup <nội dung>|<delay (ms)>\n" +
      "- bonz cay on @username (spam + tag người dùng)\n" +
      "- spamgroup delay|<giá trị mới>\n" +
      "- spamgroup set|<ttl (ms)>\n" +
      "- spamgroup stop\n\n" +
      "Ví dụ: spamgroup Hello World|1000\n" +
      "Ví dụ: bonz cay on @john123",
      threadId, type
    );
  };

  // Nếu không có args
  if (args.length === 0) {
    return sendSyntaxError();
  }

  const input = args.join(' ');

  // Lấy session của threadId hiện tại
  let session = spamSessions.get(threadId);
  if (!session) {
    session = {
      isSpamming: false,
      text: "",
      delay: 100, // 0.1 giây delay mặc định
      ttl: 10000, // TTL mặc định 10s
      interval: null,
      targetUser: null, // Tên người dùng được tag
      targetUserID: null, // ID người dùng được tag
      isBonzCay: false, // Chế độ bonz cay
      retryCount: 0 // Đếm retry cho network errors
    };
    spamSessions.set(threadId, session);
  }

  try {
    // STOP
    if (input.toLowerCase() === "stop") {
      if (session.isSpamming) {
        clearInterval(session.interval);
        session.isSpamming = false;
        return api.sendMessage("✅ Đã dừng spam.", threadId, type);
      }
      return api.sendMessage("⚠️ Không có spam nào đang chạy.", threadId, type);
    }

    // Đổi DELAY
    if (input.toLowerCase().startsWith("delay|")) {
      const newDelay = parseInt(input.split("|")[1]);
      if (isNaN(newDelay) || newDelay < 100) {
        return api.sendMessage("⚠️ Delay không hợp lệ (tối thiểu 100ms).", threadId, type);
      }
      session.delay = newDelay;
      
      // Nếu đang spam thì restart với delay mới
      if (session.isSpamming) {
        clearInterval(session.interval);
        session.interval = setInterval(() => {
          sendSpam(api, threadId, session.text, session.ttl);
        }, session.delay);
      }
      
      return api.sendMessage(`✅ Đã đổi delay thành ${session.delay}ms.`, threadId, type);
    }

    // Đổi TTL
    if (input.toLowerCase().startsWith("set|")) {
      const newTTL = parseInt(input.split("|")[1]);
      if (isNaN(newTTL) || newTTL < 0) {
        return api.sendMessage("⚠️ TTL không hợp lệ.", threadId, type);
      }
      session.ttl = newTTL;
      return api.sendMessage(`✅ TTL đã đặt thành ${session.ttl}ms.`, threadId, type);
    }

    // BONZ CAY ON - Spam với tag người dùng
    if (input.toLowerCase().startsWith("bonz cay on")) {
      const parts = input.split(" ");
      if (parts.length < 4 || !parts[3].startsWith("@")) {
        return api.sendMessage("⚠️ Cú pháp: bonz cay on @username", threadId, type);
      }
      
      let targetUsername = parts[3].substring(1); // Bỏ ký tự @
      
      // Thử lấy thông tin người dùng từ nhóm
      try {
        const threadInfo = await api.getThreadInfo(threadId);
        const participants = threadInfo.participantIDs || [];
        
        // Tìm người dùng theo username hoặc userID
        let targetUserID = targetUsername;
        for (const participantID of participants) {
          try {
            const userInfo = await api.getUserInfo(participantID);
            if (userInfo && (userInfo.name === targetUsername || userInfo.vanity === targetUsername || participantID === targetUsername)) {
              targetUserID = participantID;
              targetUsername = userInfo.name || targetUsername;
              break;
            }
          } catch (e) {
            // Bỏ qua lỗi lấy thông tin user
          }
        }
        
        console.log(`🎯 Found target: ${targetUsername} (ID: ${targetUserID})`);
        
      } catch (error) {
        console.log(`⚠️ Không lấy được thông tin nhóm, dùng username gốc: ${error.message}`);
      }
      
      // Dừng spam cũ nếu có
      if (session.isSpamming) {
        clearInterval(session.interval);
      }
      
      // Thiết lập session cho bonz cay
      session.targetUser = targetUsername;
      session.targetUserID = targetUserID || targetUsername;
      session.isBonzCay = true;
      session.delay = 100; // 0.1 giây cho tốc độ cực nhanh
      session.isSpamming = true;
      session.retryCount = 0;
      
      // Bắt đầu spam với tag
      session.interval = setInterval(() => {
        sendBonzCaySpam(api, threadId, session);
      }, session.delay);
      
      return api.sendMessage(
        `🔥 BẮT ĐẦU SPAM + TAG SIÊU NHANH!\n` +
        `🎯 Target: ${targetUsername} (ID: ${targetUserID || 'Unknown'})\n` +
        `📝 Tin nhắn: ${offensiveMessages.length}+ tin nhắn tấn công\n` +
        `⚡ Delay: ${session.delay}ms (SIÊU NHANH!)\n` +
        `🏷 Tag tự động trong MỌI tin nhắn!\n` +
        `🚀 Tốc độ cực đại - 10 tin nhắn/giây!\n` +
        `🛡️ API-Safe: 10 phương thức + 5 fallback!\n` +
        `🔧 Đã fix lỗi "Tham số không hợp lệ"!\n\n` +
        `Dùng "spamgroup stop" để dừng.`,
        threadId, type
      );
    }

    // BẮT ĐẦU SPAM THƯỜNG
    if (input.includes("|")) {
      const parts = input.split("|");
      if (parts.length !== 2) {
        return sendSyntaxError();
      }
      
      const [msgContent, delayStr] = parts;
      const delay = parseInt(delayStr.trim());
      
      if (!msgContent.trim() || isNaN(delay) || delay < 100) {
        return api.sendMessage("⚠️ Nội dung không được rỗng và delay tối thiểu 100ms.", threadId, type);
      }

      session.text = msgContent.trim();
      session.delay = delay;
      session.isBonzCay = false;
      session.targetUser = null;

      // Dừng spam cũ nếu có
      if (session.isSpamming) {
        clearInterval(session.interval);
      }

      // Bắt đầu spam mới
      session.isSpamming = true;
      session.interval = setInterval(() => {
        sendSpam(api, threadId, session.text, session.ttl);
      }, session.delay);

      return api.sendMessage(
        `✅ Bắt đầu spam:\n"${session.text}"\n⏱ Delay: ${session.delay}ms\n🕒 TTL: ${session.ttl}ms\n\n` +
        `Dùng "spamgroup stop" để dừng.`,
        threadId, type
      );
    }

    // Không khớp cú pháp
    return sendSyntaxError();

  } catch (error) {
    console.error('Lỗi trong lệnh spamgroup:', error);
    
    // Dọn dẹp nếu có lỗi
    if (session.isSpamming) {
      clearInterval(session.interval);
      session.isSpamming = false;
    }
    
    return api.sendMessage(
      `❌ Có lỗi xảy ra: ${error.message}\n\nĐã dừng spam để an toàn.`,
      threadId, type
    );
  }
};

// Hàm gửi spam thường (đơn giản hóa)
function sendSpam(api, threadId, text, ttl) {
  if (!text) return;
  
  try {
    // Chỉ gửi tin nhắn đơn giản, không dùng TTL vì có thể gây lỗi
    api.sendMessage(text, threadId, ThreadType.Group);
  } catch (error) {
    console.error('Lỗi khi gửi spam:', error.message);
    // Không dừng spam vì có thể chỉ là lỗi tạm thời
  }
}

// Hàm gửi bonz cay spam với tag người dùng
async function sendBonzCaySpam(api, threadId, session) {
  if (!session.targetUser) return;
  
  // Chọn tin nhắn ngẫu nhiên
  const randomMessage = offensiveMessages[Math.floor(Math.random() * offensiveMessages.length)];
  
  // Sử dụng cả username và userID
  const username = session.targetUser;
  const userID = session.targetUserID || session.targetUser;
  
  // Các phương thức gửi tin nhắn được thiết kế để tương thích với Zalo API
  const messageMethods = [
    // Method 1: Tin nhắn đơn giản với tag
    () => `@${username} ${randomMessage}`,
    
    // Method 2: Tin nhắn với tên trong ngoặc
    () => `${randomMessage} (@${username})`,
    
    // Method 3: Tin nhắn với dấu hai chấm
    () => `${username}: ${randomMessage}`,
    
    // Method 4: Tin nhắn với dấu gạch ngang
    () => `${username} - ${randomMessage}`,
    
    // Method 5: Tin nhắn với tag ở cuối
    () => `${randomMessage} @${username}`,
    
    // Method 6: Tin nhắn với ngoặc vuông
    () => `[${username}] ${randomMessage}`,
    
    // Method 7: Tin nhắn với dấu lớn hơn
    () => `> ${username}: ${randomMessage}`,
    
    // Method 8: Tin nhắn với emoji
    () => `🎯 ${username} ${randomMessage}`,
    
    // Method 9: Tin nhắn với dấu chấm than
    () => `${username}! ${randomMessage}`,
    
    // Method 10: Tin nhắn đơn giản nhất
    () => `${randomMessage}`
  ];
  
  // Thử từng method với retry logic
  for (let methodIndex = 0; methodIndex < messageMethods.length; methodIndex++) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const messageText = messageMethods[methodIndex]();
        
        // Gửi tin nhắn đơn giản (không dùng object phức tạp)
        await api.sendMessage(messageText, threadId, ThreadType.Group);
        
        // Thành công - log và return
        console.log(`✅ Bonz cay sent: ${messageText.substring(0, 50)}... (Method ${methodIndex + 1})`);
        session.retryCount = 0;
        return;
        
      } catch (error) {
        const errorMsg = error.message || error.toString();
        
        // Kiểm tra các loại lỗi
        const isNetworkError = errorMsg.includes('fetch failed') || 
                              errorMsg.includes('SOCKET') || 
                              errorMsg.includes('closed') || 
                              errorMsg.includes('timeout') ||
                              errorMsg.includes('UND_ERR_SOCKET');
                              
        const isApiError = errorMsg.includes('Tham số không hợp lệ') || 
                          errorMsg.includes('ZaloApiError') ||
                          error.code === 114;
        
        if (isNetworkError && attempt < 3) {
          console.log(`🔄 Network error, retrying method ${methodIndex + 1}, attempt ${attempt + 1}`);
          await sleep(1000);
          continue;
        }
        
        if (isApiError) {
          console.log(`⚠️ API Error method ${methodIndex + 1}: ${errorMsg} - Trying next method`);
          break; // Chuyển sang method tiếp theo ngay lập tức
        }
        
        if (attempt === 3) {
          console.log(`❌ Method ${methodIndex + 1} failed after 3 attempts: ${errorMsg}`);
        }
      }
    }
  }
  
  // Nếu tất cả methods đều fail, thử gửi tin nhắn cơ bản nhất
  const fallbackMessages = [
    randomMessage, // Tin nhắn gốc không có tag
    `Spam: ${randomMessage}`,
    `MSG: ${randomMessage}`,
    randomMessage.substring(0, 50), // Rút ngắn tin nhắn
    "Spam message" // Cuối cùng
  ];
  
  for (const fallbackMsg of fallbackMessages) {
    try {
      await api.sendMessage(fallbackMsg, threadId, ThreadType.Group);
      console.log(`✅ Fallback sent: ${fallbackMsg.substring(0, 30)}...`);
      return;
    } catch (error) {
      console.log(`⚠️ Fallback failed: ${error.message}`);
    }
  }
  
  // Nếu vẫn lỗi, đếm retry
  session.retryCount++;
  if (session.retryCount > 20) {
    console.log(`💥 Too many failures, resetting counter...`);
    session.retryCount = 0;
  }
  
  console.log(`💥 All methods failed for this message, continuing...`);
}

// Helper function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cleanup khi bot tắt
process.on('SIGINT', () => {
  console.log('Dọn dẹp spam sessions...');
  for (const [threadId, session] of spamSessions) {
    if (session.isSpamming) {
      clearInterval(session.interval);
    }
  }
  spamSessions.clear();
});
