module.exports.config = {
  name: "hi",
  aliases: ["hello", "chào", "xin chào", "helo", "halo"],
  version: "1.0.0",
  role: 0,
  author: "NG ĐÌNH THẮNG LỢI",
  description: "Bot chào hỏi ngẫu nhiên",
  category: "Giải trí",
  usage: "hi",
  cooldowns: 3
};

// Danh sách ID chủ nhân (thêm ID của bạn vào đây)
const ownerIDs = [
  "100000000000000", // Thay bằng ID thật của chủ nhân
  "100000000000001"  // Có thể thêm nhiều ID chủ nhân
];

// Câu chào cho chủ nhân
const ownerGreetings = [
  "👑 Xin chào Chủ nhân! Tôi luôn sẵn sàng phục vụ bạn!",
  "🛡️ Chào Master! Có gì tôi có thể giúp đỡ không?",
  "⭐ Kính chào Chủ nhân yêu quý! Hôm nay bạn thế nào?",
  "💎 Hello Boss! Tôi đang chờ lệnh từ bạn!",
  "🔥 Chào Chủ nhân! Tôi rất vui khi gặp bạn!",
  "👨‍💻 Xin chào Developer! Cảm ơn bạn đã tạo ra tôi!",
  "🎯 Chào Master! Tôi sẽ làm tất cả theo ý bạn!",
  "💫 Kính chào Chủ nhân! Bạn là người quan trọng nhất!",
  "🚀 Hello Boss! Tôi đã sẵn sàng cho mọi nhiệm vụ!",
  "👑 Chào Chủ nhân tuyệt vời! Bạn cần gì từ tôi?"
];

// Câu chào cho người dùng thường
const normalGreetings = [
  "👋 Xin chào! Tôi là 亗彡ッ彡彡 Bonzzzzz ッ彡ッ彡亗 シ, rất vui được gặp bạn!",
  "🤖 Hi! Tôi có thể giúp gì cho bạn hôm nay?",
  "😊 Chào bạn! Gõ 'bonz menu' để xem tất cả lệnh nhé!",
  "🌟 Hello! Chúc bạn một ngày tuyệt vời!",
  "👋 Chào! Tôi đang sẵn sàng hỗ trợ bạn!",
  "🎉 Hi there! Có gì tôi có thể giúp không?",
  "😄 Xin chào! Bạn cần hỗ trợ gì từ bot không?",
  "🤝 Hello! Rất vui được trò chuyện với bạn!",
  "✨ Chào bạn! Hãy thử các lệnh thú vị của tôi nhé!",
  "🚀 Hi! Tôi là bot đa năng, sẵn sàng phục vụ!",
  "💫 Xin chào! Gõ 'help' để biết thêm về tôi!",
  "🎈 Hello! Chúc bạn luôn vui vẻ và hạnh phúc!",
  "🌈 Chào! Tôi hy vọng có thể làm bạn với bạn!",
  "🎯 Hi! Hãy khám phá những tính năng tuyệt vời của tôi!",
  "💝 Xin chào! Cảm ơn bạn đã sử dụng bot của tôi!",
  "🔥 Hello! Tôi đang trong tâm trạng rất tốt hôm nay!",
  "⭐ Chào bạn! Bạn có muốn chơi game không?",
  "🎊 Hi! Tôi có nhiều tính năng thú vị lắm đó!",
  "🌸 Xin chào! Hy vọng tôi có thể giúp ích cho bạn!",
  "🎭 Hello! Tôi là bot thông minh và thân thiện!"
];

module.exports.run = async ({ api, event }) => {
  const { threadId, type, data } = event;  
  // Kiểm tra chế độ silent mode - vô hiệu hóa hoàn toàn
  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return; // Vô hiệu hóa hoàn toàn, kể cả prefix commands
  }
  const senderId = String(data?.uidFrom || event?.authorId || '');
  
  try {
    // Kiểm tra xem người gửi có phải chủ nhân không
    const isOwner = ownerIDs.includes(senderId);
    
    let randomGreeting;
    if (isOwner) {
      // Chọn câu chào đặc biệt cho chủ nhân
      randomGreeting = ownerGreetings[Math.floor(Math.random() * ownerGreetings.length)];
    } else {
      // Chọn câu chào thường cho người dùng
      randomGreeting = normalGreetings[Math.floor(Math.random() * normalGreetings.length)];
    }
    
    return api.sendMessage(randomGreeting, threadId, type);
  } catch (error) {
    console.error("Error in hi command:", error);
    return api.sendMessage("❌ Có lỗi xảy ra khi chào hỏi!", threadId, type);
  }
};
