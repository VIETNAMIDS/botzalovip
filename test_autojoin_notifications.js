// Test file for auto join notifications and progress messages
const fs = require('fs');
const path = require('path');

// Import the autojoin module
const autoJoinModule = require('./plugins/commands/autojoin.js');

// Enhanced mock API with message tracking
const mockAPI = {
  messageHistory: [],
  
  sendMessage: async (messageData, threadId, type) => {
    const timestamp = new Date().toLocaleTimeString();
    const message = messageData.msg || messageData;
    
    console.log(`\n📤 [${timestamp}] Mock API - Tin nhắn gửi tới ${threadId}:`);
    console.log(`📝 Nội dung: ${message}`);
    
    if (messageData.mentions) {
      console.log(`👥 Mentions: ${messageData.mentions.length} người dùng`);
    }
    
    if (messageData.ttl) {
      console.log(`⏰ TTL: ${messageData.ttl}ms (${Math.round(messageData.ttl/1000)}s)`);
    }
    
    // Store message for tracking
    mockAPI.messageHistory.push({
      timestamp: Date.now(),
      threadId,
      message,
      ttl: messageData.ttl
    });
    
    return { success: true, messageId: `mock_${Date.now()}` };
  },
  
  joinGroup: async (groupId) => {
    console.log(`\n🔗 Mock API - Đang thử join nhóm: ${groupId}`);
    
    // Simulate realistic join process with delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate different outcomes based on group ID
    if (groupId.includes('success') || groupId.includes('test')) {
      console.log(`✅ Mock API - Join thành công: ${groupId}`);
      return { success: true, groupId, joined: true };
    } else if (groupId.includes('fail')) {
      console.log(`❌ Mock API - Join thất bại: ${groupId}`);
      throw new Error('Nhóm không tồn tại hoặc bị từ chối');
    } else {
      // Random success/failure for demo
      const success = Math.random() > 0.3; // 70% success rate
      if (success) {
        console.log(`✅ Mock API - Join thành công: ${groupId}`);
        return { success: true, groupId, joined: true };
      } else {
        console.log(`❌ Mock API - Join thất bại: ${groupId}`);
        throw new Error('Không thể tham gia nhóm');
      }
    }
  },
  
  getCurrentUserId: () => 'mock_bot_id_123',
  
  getMessageHistory: () => mockAPI.messageHistory,
  
  clearHistory: () => {
    mockAPI.messageHistory = [];
  }
};

// Mock Threads object
const mockThreads = {
  getData: async (threadId) => {
    return {
      data: {
        auto_join: true,
        anti_link: false,
        anti_spam: false
      }
    };
  },
  
  setData: async (threadId, data) => {
    console.log(`💾 Mock Threads - Lưu dữ liệu cho ${threadId}:`, data);
    return true;
  }
};

// Test scenarios for notifications
const testScenarios = [
  {
    name: "Single Zalo Group (Success)",
    links: [
      {
        type: "ZALO_GROUP",
        link: "https://zalo.me/g/testsuccess123",
        id: "testsuccess123"
      }
    ]
  },
  {
    name: "Single Zalo Group (Failure)",
    links: [
      {
        type: "ZALO_GROUP", 
        link: "https://zalo.me/g/testfail456",
        id: "testfail456"
      }
    ]
  },
  {
    name: "Multiple Zalo Groups",
    links: [
      {
        type: "ZALO_GROUP",
        link: "https://zalo.me/g/group1success",
        id: "group1success"
      },
      {
        type: "ZALO_GROUP",
        link: "https://zalo.me/g/group2fail",
        id: "group2fail"
      },
      {
        type: "ZALO_INVITE",
        link: "https://zalo.me/s/invitesuccess",
        id: "invitesuccess"
      }
    ]
  },
  {
    name: "Mixed Platforms",
    links: [
      {
        type: "ZALO_GROUP",
        link: "https://zalo.me/g/mixedtest",
        id: "mixedtest"
      },
      {
        type: "DISCORD_INVITE",
        link: "https://discord.gg/testserver",
        id: "testserver"
      }
    ]
  }
];

// Function to test notification flow
async function testNotificationFlow(scenario) {
  console.log("\n" + "=".repeat(60));
  console.log(`🧪 Testing Scenario: ${scenario.name}`);
  console.log("=".repeat(60));
  
  // Clear previous messages
  mockAPI.clearHistory();
  
  try {
    console.log(`📋 Sẽ xử lý ${scenario.links.length} link(s):`);
    scenario.links.forEach((link, index) => {
      console.log(`   ${index + 1}. ${link.type}: ${link.link}`);
    });
    
    console.log("\n🚀 Bắt đầu quá trình auto join...");
    
    // Call the handleAutoJoin function
    await autoJoinModule.handleAutoJoin(
      mockAPI,
      "test_thread_123",
      1, // Group type
      "test_user_456", 
      "TestUser",
      scenario.links
    );
    
    console.log("\n✅ Hoàn thành scenario!");
    
    // Show message summary
    const messages = mockAPI.getMessageHistory();
    console.log(`\n📊 Tổng cộng đã gửi ${messages.length} tin nhắn:`);
    messages.forEach((msg, index) => {
      const timeAgo = Date.now() - msg.timestamp;
      console.log(`   ${index + 1}. [${Math.round(timeAgo/1000)}s trước] ${msg.message.substring(0, 50)}...`);
    });
    
  } catch (error) {
    console.log(`❌ Lỗi trong scenario: ${error.message}`);
  }
}

// Function to test command notifications
async function testCommandNotifications() {
  console.log("\n" + "=".repeat(60));
  console.log("🎮 Testing Command Notifications");
  console.log("=".repeat(60));
  
  const commands = [
    { args: ["on"], description: "Bật auto join" },
    { args: ["status"], description: "Xem trạng thái" },
    { args: ["off"], description: "Tắt auto join" }
  ];
  
  for (const cmd of commands) {
    console.log(`\n🔧 Testing command: autojoin ${cmd.args.join(' ')} (${cmd.description})`);
    
    mockAPI.clearHistory();
    
    try {
      const mockEvent = {
        threadId: "test_thread_123",
        type: 1,
        data: {
          uidFrom: "test_user_456",
          dName: "TestUser"
        }
      };
      
      await autoJoinModule.run({
        api: mockAPI,
        event: mockEvent,
        args: cmd.args,
        Threads: mockThreads
      });
      
      const messages = mockAPI.getMessageHistory();
      console.log(`📊 Đã gửi ${messages.length} tin nhắn cho lệnh này`);
      
    } catch (error) {
      console.log(`❌ Lỗi lệnh: ${error.message}`);
    }
  }
}

// Function to demonstrate notification timing
async function demonstrateNotificationTiming() {
  console.log("\n" + "=".repeat(60));
  console.log("⏰ Demonstration: Notification Timing Flow");
  console.log("=".repeat(60));
  
  const demoLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/demo1",
      id: "demo1"
    },
    {
      type: "ZALO_GROUP", 
      link: "https://zalo.me/g/demo2",
      id: "demo2"
    }
  ];
  
  console.log("📋 Sẽ demo với 2 nhóm Zalo:");
  console.log("   1. demo1 (có thể thành công)");
  console.log("   2. demo2 (có thể thất bại)");
  
  console.log("\n🎬 Bắt đầu demo...");
  console.log("👀 Quan sát thứ tự và thời gian của các thông báo:");
  
  mockAPI.clearHistory();
  
  await autoJoinModule.handleAutoJoin(
    mockAPI,
    "demo_thread",
    1,
    "demo_user",
    "DemoUser", 
    demoLinks
  );
  
  console.log("\n🏁 Demo hoàn thành!");
  console.log("\n📝 Tóm tắt luồng thông báo:");
  console.log("   1. 🤖 Thông báo bắt đầu xử lý");
  console.log("   2. 🔄 Thông báo đang join từng nhóm");
  console.log("   3. ✅/❌ Thông báo kết quả từng nhóm");
  console.log("   4. 🏁 Thông báo tổng kết cuối cùng");
}

// Main test runner
async function runNotificationTests() {
  console.log("🚀 Starting Auto Join Notification Tests");
  console.log("🎯 Mục tiêu: Test các thông báo tiến trình và kết quả");
  
  try {
    // Test each scenario
    for (const scenario of testScenarios) {
      await testNotificationFlow(scenario);
      
      // Wait between scenarios
      console.log("\n⏳ Chờ 2 giây trước scenario tiếp theo...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Test command notifications
    await testCommandNotifications();
    
    // Demonstrate timing
    await demonstrateNotificationTiming();
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 Hoàn thành tất cả tests!");
    console.log("=".repeat(60));
    
    console.log("\n📚 Tóm tắt tính năng thông báo:");
    console.log("✅ Thông báo bắt đầu xử lý");
    console.log("✅ Thông báo tiến trình từng nhóm");
    console.log("✅ Thông báo kết quả ngay lập tức");
    console.log("✅ Thông báo tổng kết cuối cùng");
    console.log("✅ Hiển thị số nhóm đã join thành công");
    console.log("✅ Thống kê tỷ lệ thành công/thất bại");
    
    console.log("\n🎮 Cách sử dụng:");
    console.log("1. Bật auto join: 'autojoin on'");
    console.log("2. Chia sẻ link Zalo group trong chat");
    console.log("3. Bot sẽ hiển thị:");
    console.log("   • 'Bot đang join vui lòng chờ'");
    console.log("   • 'Đang join nhóm X/Y'");
    console.log("   • 'Thành công! Đã vào nhóm: [ID]'");
    console.log("   • 'Bot đã vào X nhóm thành công!'");
    
  } catch (error) {
    console.error("🚨 Test runner failed:", error.message);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runNotificationTests().catch(console.error);
}

module.exports = {
  runNotificationTests,
  testNotificationFlow,
  testCommandNotifications,
  demonstrateNotificationTiming
};
