module.exports.config = {
  event_type: ["message"],
  name: "bonzAutoReply",
  version: "1.0.0",
  author: "Bonz",
  description: "Auto reply tin nhắn riêng về BONZ - CHỈ HOẠT ĐỘNG TRONG TIN NHẮN RIÊNG",
  dependencies: {}
};

// Cooldown system để tránh spam
const userCooldowns = new Map();
const COOLDOWN_TIME = 10000; // 10 giây

module.exports.run = async ({ event, eventType, api, replyData }) => {
  try {
    // ĐÃ BẬT LẠI PLUGIN VỚI TÍNH NĂNG CÂU ĐỐ
    // return;
    
    // KIỂM TRA ĐẦU TIÊN: CHỈ XỬ LÝ TIN NHẮN RIÊNG
    // Nếu có bất kỳ dấu hiệu nào của tin nhắn nhóm -> thoát ngay
    if (event.isGroup === true || 
        event.type === 'group' || 
        event.threadId?.toString().length > 15 || // Group ID thường dài hơn
        eventType !== 'message') {
      return; // Thoát im lặng, không log để tránh spam console
    }
    
    // Debug log chi tiết (chỉ cho tin nhắn riêng)
    console.log("[BonzAutoReply] Private message event:", {
      eventType: eventType,
      threadId: event.threadId,
      type: event.type,
      isGroup: event.isGroup,
      content: event.data?.content
    });
    
    
    const { threadId, type } = event;
    const content = event.data?.content;
    
    if (!content || typeof content !== 'string') {
      console.log("[BonzAutoReply] Skip - no content");
      return;
    }
    
    // Đã kiểm tra ở đầu function, bỏ qua check trùng lặp
    
    // Kiểm tra cooldown để tránh spam
    const userId = threadId; // Sử dụng threadId làm userId cho tin nhắn riêng
    const now = Date.now();
    const lastReply = userCooldowns.get(userId);
    
    if (lastReply && (now - lastReply) < COOLDOWN_TIME) {
      const remaining = Math.ceil((COOLDOWN_TIME - (now - lastReply)) / 1000);
      console.log(`[BonzAutoReply] Cooldown active for user ${userId}, ${remaining}s remaining`);
      return;
    }
    
    console.log("[BonzAutoReply] Processing private message:", content);
    
    const message = content.toLowerCase();
    
    // Kiểm tra từ khóa về chủ nhân
    const ownerKeywords = [
      "ai là chủ nhân",
      "chủ nhân của bạn", 
      "ai tạo ra bạn",
      "người tạo bot",
      "bonz là ai",
      "ai là bonz"
    ];
    
    const hasOwnerKeyword = ownerKeywords.some(keyword => message.includes(keyword));
    
    if (hasOwnerKeyword) {
      console.log("[BonzAutoReply] Detected owner question!");
      
      const reply = "👑 **THÔNG TIN CHỦ NHÂN** 👑\n\n" +
                   "🤖 Chủ nhân của tôi là **BONZ** - một chủ nhân siêu đẹp trai và hiền lành, luôn giúp đỡ mọi người! 😊\n\n" +
                   "✨ **Về chủ nhân BONZ:**\n" +
                   "• 🎯 Chuyên gia tạo chatbot và automation\n" +
                   "• 💝 Tính cách hiền lành, nhiệt tình\n" +
                   "• 🚀 Luôn sẵn sàng hỗ trợ cộng đồng\n" +
                   "• 🏆 Kỹ năng lập trình xuất sắc\n\n" +
                   "💬 **LIÊN HỆ:**\n" +
                   "🔗 Zalo: https://zalo.me/0937802799\n" +
                   "📝 Gõ `/bonz pr` để xem dịch vụ!\n\n" +
                   "🌟 Cảm ơn bạn đã quan tâm! 🌟";
      
      await api.sendMessage({ msg: reply }, threadId, type);
      console.log("[BonzAutoReply] Sent owner reply");
      
      // Set cooldown
      userCooldowns.set(userId, now);
      return;
    }
    
    // Kiểm tra từ khóa về dịch vụ
    const serviceKeywords = [
      "dịch vụ",
      "service",
      "làm bot",
      "tạo bot",
      "giá bot",
      "báo giá"
    ];
    
    const hasServiceKeyword = serviceKeywords.some(keyword => message.includes(keyword));
    
    if (hasServiceKeyword) {
      console.log("[BonzAutoReply] Detected service question!");
      
      const reply = "🛍️ **DỊCH VỤ BONZ TECH** 🛍️\n\n" +
                   "🤖 Chào bạn! Tôi là bot của **BONZ** - chuyên gia về chatbot và automation!\n\n" +
                   "🚀 **DỊCH VỤ CHÍNH:**\n" +
                   "• 🤖 Tạo chatbot Zalo/Facebook\n" +
                   "• 🔧 Tool automation đa dạng\n" +
                   "• 🌐 Website/Landing page\n" +
                   "• 📱 Ứng dụng mobile\n\n" +
                   "💰 **XEM BẢNG GIÁ:**\n" +
                   "Gõ lệnh `/bonz pr` để xem chi tiết!\n\n" +
                   "📞 **LIÊN HỆ:**\n" +
                   "🔗 Zalo: https://zalo.me/0937802799\n\n" +
                   "🌟 Cảm ơn bạn đã quan tâm! 🌟";
      
      await api.sendMessage({ msg: reply }, threadId, type);
      console.log("[BonzAutoReply] Sent service reply");
      
      // Set cooldown
      userCooldowns.set(userId, now);
      return;
    }
    
    // Kiểm tra lời chào
    const greetingKeywords = ["hello", "hi", "chào", "xin chào"];
    const hasGreeting = greetingKeywords.some(keyword => message.includes(keyword));
    
    if (hasGreeting && message.length < 20) {
      console.log("[BonzAutoReply] Detected greeting!");
      
      const reply = "👋 **Xin chào bạn!** 👋\n\n" +
                   "🤖 Tôi là bot của **BONZ** - rất vui được gặp bạn!\n\n" +
                   "💬 **Bạn có thể hỏi tôi:**\n" +
                   "• 👑 Ai là chủ nhân của bot?\n" +
                   "• 🛍️ Có dịch vụ gì không?\n" +
                   "• 🧩 Câu đố thú vị\n\n" +
                   "📝 Gõ `/bonz pr` để xem dịch vụ!\n\n" +
                   "🌟 Chúc bạn một ngày tốt lành! 🌟";
      
      await api.sendMessage({ msg: reply }, threadId, type);
      console.log("[BonzAutoReply] Sent greeting reply");
      
      // Set cooldown
      userCooldowns.set(userId, now);
      return;
    }
    
    // Kiểm tra từ khóa câu đố
    const riddleKeywords = ["câu đố", "đố vui", "riddle", "puzzle", "đố", "câu hỏi vui"];
    const hasRiddleKeyword = riddleKeywords.some(keyword => message.includes(keyword));
    
    if (hasRiddleKeyword) {
      console.log("[BonzAutoReply] Detected riddle request!");
      
      // Danh sách câu đố
      const riddles = [
        {
          question: "🧩 **CÂU ĐỐ VUI** 🧩\n\nCái gì có 4 chân buổi sáng, 2 chân buổi trưa, 3 chân buổi tối?",
          answer: "Đáp án: Con người! (bò khi nhỏ, đi khi lớn, chống gậy khi già)"
        },
        {
          question: "🧩 **CÂU ĐỐ VUI** 🧩\n\nCái gì càng cho đi càng có nhiều?",
          answer: "Đáp án: Tình yêu và kiến thức!"
        },
        {
          question: "🧩 **CÂU ĐỐ VUI** 🧩\n\nCái gì có thể bay mà không có cánh?",
          answer: "Đáp án: Thời gian!"
        },
        {
          question: "🧩 **CÂU ĐỐ VUI** 🧩\n\nCái gì càng rửa càng bẩn?",
          answer: "Đáp án: Nước!"
        },
        {
          question: "🧩 **CÂU ĐỐ VUI** 🧩\n\nCái gì có đầu mà không có cổ?",
          answer: "Đáp án: Đồng xu!"
        },
        {
          question: "🧩 **CÂU ĐỐ VUI** 🧩\n\nCái gì có răng mà không cắn được?",
          answer: "Đáp án: Lược!"
        },
        {
          question: "🧩 **CÂU ĐỐ VUI** 🧩\n\nCái gì có mắt mà không nhìn được?",
          answer: "Đáp án: Kim khâu!"
        },
        {
          question: "🧩 **CÂU ĐỐ VUI** 🧩\n\nCái gì càng cắt càng dài?",
          answer: "Đáp án: Đường rãnh (khi đào)!"
        }
      ];
      
      // Chọn câu đố ngẫu nhiên
      const randomRiddle = riddles[Math.floor(Math.random() * riddles.length)];
      
      const reply = randomRiddle.question + "\n\n" +
                   "🤔 **Hãy suy nghĩ và trả lời!**\n\n" +
                   "💡 **Gợi ý:** Đây là câu đố truyền thống Việt Nam\n\n" +
                   "⏰ **Đáp án sẽ được tiết lộ sau 30 giây...**\n\n" +
                   "🎯 **Powered by BONZ** - Chủ nhân siêu đẹp trai!";
      
      await api.sendMessage({ msg: reply }, threadId, type);
      console.log("[BonzAutoReply] Sent riddle question");
      
      // Gửi đáp án sau 30 giây
      setTimeout(async () => {
        try {
          const answerReply = "🎉 **ĐÁP ÁN CÔNG BỐ!** 🎉\n\n" +
                             randomRiddle.answer + "\n\n" +
                             "🧠 **Bạn có đoán đúng không?**\n\n" +
                             "🎮 **Muốn câu đố khác?** Gõ 'câu đố' để tiếp tục!\n\n" +
                             "🌟 **BONZ** luôn có những câu đố thú vị! 😊";
          
          await api.sendMessage({ msg: answerReply }, threadId, type);
          console.log("[BonzAutoReply] Sent riddle answer");
        } catch (error) {
          console.error("[BonzAutoReply] Error sending riddle answer:", error);
        }
      }, 30000); // 30 giây
      
      // Set cooldown
      userCooldowns.set(userId, now);
      return;
    }
    
    // Không trả lời nếu không khớp từ khóa nào để tránh spam
    console.log("[BonzAutoReply] No keywords matched, not replying to avoid spam");
    
  } catch (error) {
    console.error("[BonzAutoReply] Error:", error);
  }
};
