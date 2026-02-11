// Script khởi tạo AI Learning System
const fs = require('fs');
const path = require('path');

console.log('🚀 KHỞI TẠO AI LEARNING SYSTEM...\n');

// Tạo thư mục data nếu chưa có
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ Đã tạo thư mục data/');
} else {
  console.log('✅ Thư mục data/ đã tồn tại');
}

// Khởi tạo file dữ liệu học rỗng
const learningDataFile = path.join(dataDir, 'ai_learning.json');
if (!fs.existsSync(learningDataFile)) {
  const initialData = {
    conversations: {},
    patterns: {},
    responses: {},
    userProfiles: {},
    contextMemory: {},
    keywords: {},
    emotions: {},
    lastUpdate: Date.now(),
    version: "1.0.0",
    created: new Date().toISOString()
  };
  
  fs.writeFileSync(learningDataFile, JSON.stringify(initialData, null, 2));
  console.log('✅ Đã tạo file ai_learning.json');
} else {
  console.log('✅ File ai_learning.json đã tồn tại');
}

// Khởi tạo file lịch sử hội thoại rỗng
const conversationFile = path.join(dataDir, 'conversations.json');
if (!fs.existsSync(conversationFile)) {
  const initialConversations = {
    created: new Date().toISOString(),
    version: "1.0.0"
  };
  
  fs.writeFileSync(conversationFile, JSON.stringify(initialConversations, null, 2));
  console.log('✅ Đã tạo file conversations.json');
} else {
  console.log('✅ File conversations.json đã tồn tại');
}

// Kiểm tra files cần thiết
const requiredFiles = [
  'plugins/events/aiLearning.js',
  'plugins/commands/ailearn.js',
  'plugins/commands/bonz.js'
];

console.log('\n🔍 KIỂM TRA FILES CẦN THIẾT:');
let allFilesExist = true;

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - THIẾU FILE!`);
    allFilesExist = false;
  }
});

// Test load modules
console.log('\n🧪 TEST LOAD MODULES:');

try {
  const aiLearning = require('./plugins/events/aiLearning.js');
  console.log('✅ aiLearning.js - Module loaded successfully');
  
  // Test basic functions
  if (typeof aiLearning.getLearningData === 'function') {
    console.log('✅ getLearningData function available');
  }
  
  if (typeof aiLearning.generateResponse === 'function') {
    console.log('✅ generateResponse function available');
  }
  
} catch (error) {
  console.log('❌ aiLearning.js - Failed to load:', error.message);
  allFilesExist = false;
}

try {
  const aiLearnCmd = require('./plugins/commands/ailearn.js');
  console.log('✅ ailearn.js - Command module loaded successfully');
  
  if (aiLearnCmd.config && aiLearnCmd.run) {
    console.log('✅ Command structure is valid');
  }
  
} catch (error) {
  console.log('❌ ailearn.js - Failed to load:', error.message);
  allFilesExist = false;
}

// Tạo sample data để test
console.log('\n📝 TẠO DỮ LIỆU TEST MẪU:');

const sampleData = {
  conversations: {},
  patterns: {
    "xin_chào": {
      count: 5,
      examples: ["xin chào", "hello", "hi"],
      responses: ["Chào bạn!", "Hello!", "Hi there!"],
      emotion: "happy",
      users: ["user1", "user2"]
    }
  },
  responses: {
    "greeting": ["Xin chào!", "Hello!", "Chào bạn!"]
  },
  userProfiles: {
    "sample_user": {
      messageCount: 10,
      commonWords: {
        "xin": 3,
        "chào": 3,
        "cảm": 2,
        "ơn": 2
      },
      emotions: {
        "happy": 5,
        "neutral": 3,
        "love": 2
      },
      lastSeen: Date.now(),
      personality: "friendly"
    }
  },
  contextMemory: {},
  keywords: {
    "xin": {
      count: 5,
      contexts: ["xin chào", "xin cảm ơn"],
      emotion: "happy"
    },
    "chào": {
      count: 5,
      contexts: ["xin chào", "chào buổi sáng"],
      emotion: "happy"
    }
  },
  emotions: {
    "happy": 10,
    "neutral": 5,
    "love": 3
  },
  lastUpdate: Date.now(),
  version: "1.0.0",
  sampleDataCreated: new Date().toISOString()
};

// Ghi sample data
fs.writeFileSync(learningDataFile, JSON.stringify(sampleData, null, 2));
console.log('✅ Đã tạo sample data trong ai_learning.json');

// Tạo sample conversations
const sampleConversations = {
  "sample_thread_123": [
    {
      userId: "user1",
      message: "Xin chào bot!",
      timestamp: Date.now() - 3600000,
      isBot: false,
      emotion: "happy",
      keywords: ["xin", "chào", "bot"]
    },
    {
      userId: "bot",
      message: "Chào bạn! Tôi có thể giúp gì cho bạn?",
      timestamp: Date.now() - 3599000,
      isBot: true,
      emotion: "happy",
      keywords: ["chào", "giúp"]
    },
    {
      userId: "user1", 
      message: "Cảm ơn bot rất nhiều!",
      timestamp: Date.now() - 3598000,
      isBot: false,
      emotion: "love",
      keywords: ["cảm", "ơn", "bot"]
    }
  ],
  created: new Date().toISOString(),
  version: "1.0.0"
};

fs.writeFileSync(conversationFile, JSON.stringify(sampleConversations, null, 2));
console.log('✅ Đã tạo sample conversations');

// Tóm tắt kết quả
console.log('\n📊 KẾT QUẢ KHỞI TẠO:');

if (allFilesExist) {
  console.log('🎉 THÀNH CÔNG! AI Learning System đã sẵn sàng hoạt động');
  console.log('\n📋 HƯỚNG DẪN SỬ DỤNG:');
  console.log('1. Khởi động bot bình thường');
  console.log('2. Gõ "bonz learn stats" để xem thống kê');
  console.log('3. Gõ "ailearn stats" (admin) để xem chi tiết');
  console.log('4. Bot sẽ tự động học từ tin nhắn người dùng');
  console.log('5. Đọc AI_LEARNING_README.md để biết thêm chi tiết');
  
  console.log('\n🧪 TEST COMMANDS:');
  console.log('- bonz learn stats');
  console.log('- ailearn stats');
  console.log('- ailearn analyze Hôm nay tôi rất vui');
  console.log('- ailearn response Xin chào bot');
  
} else {
  console.log('❌ THẤT BẠI! Một số files bị thiếu');
  console.log('Vui lòng kiểm tra và tạo lại các files cần thiết');
}

console.log('\n💾 DATA FILES:');
console.log(`- ${learningDataFile}`);
console.log(`- ${conversationFile}`);

console.log('\n📚 DOCUMENTATION:');
console.log('- AI_LEARNING_README.md - Hướng dẫn chi tiết');
console.log('- test_ai_learning.js - Script test hệ thống');

console.log('\n🔧 NEXT STEPS:');
console.log('1. Chạy "node test_ai_learning.js" để test');
console.log('2. Khởi động bot và test các lệnh');
console.log('3. Monitor console logs để debug');
console.log('4. Tùy chỉnh cấu hình nếu cần');

console.log('\n✨ AI Learning System initialization completed!');
