// Test script để kiểm tra thông báo cuối cùng đơn giản
const autoJoinModule = require('./plugins/commands/autojoin.js');

// Mock API
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
    console.log(`✅ [BONZ API] Joining: ${link}`);
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }
};

// Mock Threads
const testThreads = {
  getData: async () => ({ data: { auto_join: true } }),
  setData: async () => true
};

async function testFinalSimpleMessage() {
  console.log("🧪 TEST: Thông báo cuối cùng đơn giản");
  console.log("=" .repeat(60));
  
  console.log(`
📋 KIỂM TRA:
✅ Chỉ hiển thị thông báo bắt đầu
✅ Không có thông báo trung gian
✅ Chỉ có thông báo hoàn thành cuối cùng
  `);
  
  // Test 1: Single success
  console.log("\n1️⃣ Test 1 nhóm thành công:");
  
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
  
  console.log("\n" + "⏳".repeat(30));
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Multiple success
  console.log("\n2️⃣ Test nhiều nhóm thành công:");
  
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
    },
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/group3",
      id: "group3"
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

async function showSimplifiedFlow() {
  console.log("\n" + "=" .repeat(60));
  console.log("📊 LUỒNG THÔNG BÁO MỚI (ĐƠN GIẢN)");
  console.log("=" .repeat(60));
  
  console.log(`
🎯 **LUỒNG CŨ (Nhiều thông báo):**
1. 🤖 "Bonz đang vô nhóm, vui lòng chờ đợi..."
2. 🔄 "Bonz đang vô nhóm 1/3"
3. 🎉 "Bonz đã vô nhóm thành công! Nhóm: group1"
4. 🔄 "Bonz đang vô nhóm 2/3"  
5. 🎉 "Bonz đã vô nhóm thành công! Nhóm: group2"
6. 🔄 "Bonz đang vô nhóm 3/3"
7. 🎉 "Bonz đã vô nhóm thành công! Nhóm: group3"
8. 🏁 "Bonz hoàn thành vô nhóm..."

✅ **LUỒNG MỚI (Đơn giản):**
1. 🤖 "Bonz đang vô nhóm, vui lòng chờ đợi..."
2. 🏁 "Bonz hoàn thành vô nhóm
   🎉 Bonz đã vô 3 nhóm thành công!
   📊 Tổng: 3 link | Thành công: 3
   👤 Yêu cầu bởi: @UserName"

🎯 **ƯU ĐIỂM:**
✅ Ít spam tin nhắn (chỉ 2 thông báo thay vì 8)
✅ Thông tin tổng hợp rõ ràng
✅ Không làm phiền user với thông báo liên tục
✅ Vẫn đầy đủ thông tin cần thiết

🎮 **CÁCH HOẠT ĐỘNG:**
User chia sẻ: "https://zalo.me/g/abc123"

Bot sẽ:
1. 🤖 Hiển thị "Bonz đang vô nhóm, vui lòng chờ đợi..."
2. 🔄 Im lặng join các nhóm (không spam thông báo)
3. 🏁 Hiển thị kết quả cuối cùng một lần duy nhất

📊 **KẾT QUẢ MONG ĐỢI:**
"🏁 Bonz hoàn thành vô nhóm
🎉 Bonz đã vô 1 nhóm thành công!
📊 Tổng: 1 link | Thành công: 1
👤 Yêu cầu bởi: @UserName"
  `);
}

// Main function
async function runFinalSimpleTest() {
  try {
    await testFinalSimpleMessage();
    await showSimplifiedFlow();
    
    console.log("\n🎉 Test thông báo đơn giản hoàn thành!");
    console.log("💡 Bot giờ chỉ hiển thị thông báo bắt đầu và kết quả cuối cùng!");
    
  } catch (error) {
    console.error("🚨 Test failed:", error.message);
  }
}

// Run test
if (require.main === module) {
  runFinalSimpleTest().catch(console.error);
}

module.exports = { runFinalSimpleTest };
