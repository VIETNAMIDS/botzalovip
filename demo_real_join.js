// Demo script để test auto join thật với session Zalo
const autoJoinModule = require('./plugins/commands/autojoin.js');
const ZaloAPI = require('./plugins/commands/zaloapi.js');

// Demo API với session thật
const realAPI = {
  sendMessage: async (messageData, threadId, type) => {
    const message = messageData.msg || messageData;
    console.log(`\n📱 [BOT MESSAGE] ${message}`);
    
    if (messageData.ttl) {
      console.log(`⏰ Auto-delete after ${messageData.ttl/1000}s`);
    }
    
    return { success: true };
  },
  
  // Sử dụng ZaloAPI thật thay vì mock
  joinGroup: async (groupId) => {
    console.log(`\n🔗 [REAL API] Attempting to join group: ${groupId}`);
    
    const zaloAPI = new ZaloAPI();
    
    if (zaloAPI.autoConfigureSession()) {
      try {
        const result = await zaloAPI.joinGroup(groupId);
        
        if (result.success) {
          console.log(`✅ [REAL API] Successfully joined group: ${groupId}`);
          return { success: true, groupId, joined: true, data: result.data };
        } else {
          console.log(`❌ [REAL API] Failed to join group: ${result.error}`);
          throw new Error(result.error);
        }
      } catch (error) {
        console.log(`❌ [REAL API] Error joining group: ${error.message}`);
        throw error;
      }
    } else {
      throw new Error('Zalo session not configured properly');
    }
  }
};

// Mock Threads
const realThreads = {
  getData: async () => ({ data: { auto_join: true } }),
  setData: async () => true
};

// Test với link Zalo thật
async function testRealAutoJoin() {
  console.log("🚀 DEMO: Auto Join Thật với Session Zalo");
  console.log("=" .repeat(60));
  
  // Kiểm tra session trước
  const zaloAPI = new ZaloAPI();
  
  if (!zaloAPI.autoConfigureSession()) {
    console.log(`
❌ KHÔNG THỂ LOAD SESSION ZALO!

💡 Vui lòng setup session trước:
1. Chạy: node setup_zalo_session.js
2. Làm theo hướng dẫn để lấy session thật
3. Chạy lại script này

⚠️ Hiện tại bot chỉ có thể mô phỏng, không join thật được.
    `);
    return;
  }
  
  // Test connection
  console.log("\n🧪 Testing Zalo API connection...");
  const connectionTest = await zaloAPI.testConnection();
  
  if (!connectionTest.success) {
    console.log(`
❌ KẾT NỐI ZALO API THẤT BẠI!

Lỗi: ${connectionTest.message}

💡 Có thể session đã hết hạn hoặc không hợp lệ.
Vui lòng update session mới.
    `);
    return;
  }
  
  console.log("✅ Zalo API connection successful!");
  
  // Demo với link test (thay bằng link thật nếu có)
  console.log("\n📋 Demo với link Zalo group:");
  console.log("⚠️  Lưu ý: Thay đổi link bên dưới thành link nhóm test của bạn");
  
  const testLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/YOUR_TEST_GROUP_ID", // Thay bằng link thật
      id: "YOUR_TEST_GROUP_ID"
    }
  ];
  
  console.log(`
🎯 Sẽ test với link: ${testLinks[0].link}

⚠️  QUAN TRỌNG:
• Thay YOUR_TEST_GROUP_ID bằng ID nhóm test thật
• Đảm bảo nhóm cho phép bot join
• Sử dụng nhóm test, không phải nhóm chính
  `);
  
  // Hỏi user có muốn tiếp tục không
  console.log("\n❓ Bạn có muốn tiếp tục test với link trên không?");
  console.log("💡 Chỉnh sửa link trong file demo_real_join.js trước khi chạy");
  
  if (testLinks[0].id === "YOUR_TEST_GROUP_ID") {
    console.log(`
⏸️  DEMO DỪNG LẠI - CHƯA CÓ LINK TEST

📝 Để test thật:
1. Mở file: demo_real_join.js
2. Thay YOUR_TEST_GROUP_ID bằng ID nhóm thật
3. Chạy lại script

🔗 Ví dụ: 
   Link: https://zalo.me/g/abc123xyz
   ID: abc123xyz
    `);
    return;
  }
  
  try {
    console.log("\n🚀 Bắt đầu auto join thật...");
    
    await autoJoinModule.handleAutoJoin(
      realAPI,
      "real_test_thread",
      1,
      "test_user",
      "RealTestUser", 
      testLinks
    );
    
    console.log("\n🎉 Demo hoàn thành!");
    
  } catch (error) {
    console.log(`\n❌ Lỗi trong quá trình demo: ${error.message}`);
    
    if (error.message.includes('session')) {
      console.log(`
💡 Lỗi liên quan đến session:
• Kiểm tra lại session trong config/zalo_session.json
• Session có thể đã hết hạn
• Thử đăng nhập lại Zalo Web và lấy session mới
      `);
    }
  }
}

// Test commands với session thật
async function testRealCommands() {
  console.log("\n🎮 Testing Commands với Session Thật");
  console.log("=" .repeat(60));
  
  const commands = [
    { args: ["on"], desc: "Bật auto join" },
    { args: ["status"], desc: "Xem trạng thái" }
  ];
  
  for (const cmd of commands) {
    console.log(`\n🔧 Command: autojoin ${cmd.args.join(' ')} (${cmd.desc})`);
    
    try {
      await autoJoinModule.run({
        api: realAPI,
        event: {
          threadId: "real_test_thread",
          type: 1,
          data: { uidFrom: "real_user", dName: "RealUser" }
        },
        args: cmd.args,
        Threads: realThreads
      });
    } catch (error) {
      console.log(`❌ Command error: ${error.message}`);
    }
  }
}

// Main function
async function runRealDemo() {
  try {
    await testRealAutoJoin();
    await testRealCommands();
    
    console.log("\n" + "=" .repeat(60));
    console.log("📋 TÓM TẮT:");
    console.log("=" .repeat(60));
    
    console.log(`
✅ Đã setup API thật cho auto join
✅ Bot có thể join thật vào nhóm Zalo (nếu có session hợp lệ)
✅ Thông báo tiến trình hoạt động bình thường

🎯 CÁCH SỬ DỤNG THẬT:
1. Setup session: node setup_zalo_session.js
2. Test session: node test_zalo_session.js
3. Bật auto join: autojoin on
4. Chia sẻ link Zalo group trong chat
5. Bot sẽ tự động join thật vào nhóm!

⚠️ LƯU Ý:
• Cần session Zalo hợp lệ
• Sử dụng tài khoản phụ để test
• Tuân thủ quy định của Zalo
    `);
    
  } catch (error) {
    console.error("🚨 Demo failed:", error.message);
  }
}

// Chạy demo
if (require.main === module) {
  runRealDemo().catch(console.error);
}

module.exports = { runRealDemo };
