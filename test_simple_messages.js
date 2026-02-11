// Test script để kiểm tra thông báo đơn giản mới
const autoJoinModule = require('./plugins/commands/autojoin.js');

// Mock API với bonz methods
const mockAPI = {
  sendMessage: async (messageData, threadId, type) => {
    const message = messageData.msg || messageData;
    console.log(`\n📱 [THÔNG BÁO] ${message}`);
    
    if (messageData.ttl) {
      console.log(`⏰ Tự xóa sau: ${messageData.ttl/1000}s`);
    }
    
    return { success: true };
  },
  
  // Mock bonz API methods
  joinGroupByLink: async (link) => {
    console.log(`✅ [BONZ API] Đang join: ${link}`);
    // Simulate realistic delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    return true;
  }
};

// Mock Threads
const testThreads = {
  getData: async () => ({ data: { auto_join: true } }),
  setData: async () => true
};

async function testSimpleMessages() {
  console.log("🧪 TEST: Thông báo đơn giản - 'Bonz đang vô nhóm'");
  console.log("=" .repeat(60));
  
  console.log(`
📋 KIỂM TRA THÔNG BÁO MỚI:
✅ "Bonz đang vô nhóm, vui lòng chờ đợi để bot vô nhóm"
✅ "Bonz đang vô nhóm X/Y"
✅ "Bonz đã vô nhóm thành công!"
✅ "Bonz hoàn thành vô nhóm"
  `);
  
  // Test 1: Single link
  console.log("\n1️⃣ Test với 1 link Zalo:");
  
  const testLinks1 = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/test123",
      id: "test123"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPI,
      "test_thread_1",
      1,
      "user123",
      "TestUser",
      testLinks1
    );
    
    console.log("✅ Test 1 hoàn thành!");
    
  } catch (error) {
    console.log(`❌ Test 1 lỗi: ${error.message}`);
  }
  
  console.log("\n" + "⏳".repeat(20));
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Multiple links
  console.log("\n2️⃣ Test với nhiều link:");
  
  const testLinks2 = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/group1",
      id: "group1"
    },
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/group2", 
      id: "group2"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPI,
      "test_thread_2",
      1,
      "user456",
      "MultiUser",
      testLinks2
    );
    
    console.log("✅ Test 2 hoàn thành!");
    
  } catch (error) {
    console.log(`❌ Test 2 lỗi: ${error.message}`);
  }
}

async function showMessageComparison() {
  console.log("\n" + "=" .repeat(60));
  console.log("📊 SO SÁNH THÔNG BÁO CŨ VÀ MỚI");
  console.log("=" .repeat(60));
  
  console.log(`
❌ **THÔNG BÁO CŨ (Phức tạp):**
"🤖 Bot đang xử lý Auto Join
⏳ Đang phân tích 1 link(s)...
🔄 Vui lòng chờ trong giây lát!"

"🔄 Đang join nhóm 1/1
⏳ Bot đang tham gia: https://zalo.me/g/abc123
🤖 Vui lòng chờ..."

"🎉 Thành công!
✅ Đã vào nhóm: abc123
📊 Tổng nhóm đã vào: 1"

"🏁 Hoàn thành Auto Join
📊 Kết quả tổng hợp:
• Tổng link xử lý: 1
• Thành công: 1 nhóm
• Thất bại: 0 nhóm
• Tỷ lệ thành công: 100%
🎉 Bot đã vào 1 nhóm thành công!"

✅ **THÔNG BÁO MỚI (Đơn giản):**
"🤖 Bonz đang vô nhóm
⏳ Vui lòng chờ đợi để bot vô nhóm..."

"🔄 Bonz đang vô nhóm 1/1
⏳ Vui lòng chờ đợi để bot vô nhóm..."

"🎉 Bonz đã vô nhóm thành công!
✅ Nhóm: abc123
📊 Tổng: 1 nhóm"

"🏁 Bonz hoàn thành vô nhóm
🎉 Bonz đã vô 1 nhóm thành công!
📊 Tổng: 1 link | Thành công: 1"

🎯 **ƯU ĐIỂM THÔNG BÁO MỚI:**
✅ Ngắn gọn, dễ hiểu
✅ Sử dụng từ "Bonz" thân thiện
✅ Ít spam hơn
✅ Thông tin cần thiết vẫn đầy đủ
✅ Phù hợp với yêu cầu người dùng
  `);
}

// Main function
async function runSimpleTest() {
  try {
    await testSimpleMessages();
    await showMessageComparison();
    
    console.log("\n🎉 Test thông báo mới hoàn thành!");
    console.log("💡 Thông báo giờ đơn giản và thân thiện hơn!");
    
  } catch (error) {
    console.error("🚨 Test failed:", error.message);
  }
}

// Run test
if (require.main === module) {
  runSimpleTest().catch(console.error);
}

module.exports = { runSimpleTest };
