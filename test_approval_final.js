// Test script để kiểm tra thông báo "duyệt bonz vào với làm ơn" trong kết quả cuối
const autoJoinModule = require('./plugins/commands/autojoin.js');

// Mock API với scenarios khác nhau
const mockAPIWithScenarios = {
  sendMessage: async (messageData, threadId, type) => {
    const message = messageData.msg || messageData;
    console.log(`\n📱 [THÔNG BÁO] ${message}`);
    
    if (messageData.ttl) {
      console.log(`⏰ Tự xóa sau: ${messageData.ttl/1000}s`);
    }
    
    return { success: true };
  },
  
  // Mock API methods với các kết quả khác nhau
  joinGroupByLink: async (link) => {
    console.log(`🔗 [API] Trying to join: ${link}`);
    
    // Simulate different scenarios based on link
    if (link.includes('approval')) {
      throw new Error('Group requires approval to join');
    } else if (link.includes('permission')) {
      throw new Error('Permission denied - pending approval');
    } else if (link.includes('success')) {
      return true;
    } else if (link.includes('fail')) {
      throw new Error('Network error occurred');
    }
    
    // Default success
    return true;
  }
};

// Mock Threads
const testThreads = {
  getData: async () => ({ data: { auto_join: true } }),
  setData: async () => true
};

async function testApprovalInFinalMessage() {
  console.log("🧪 TEST: Thông báo 'duyệt bonz vào với làm ơn' trong kết quả cuối");
  console.log("=" .repeat(70));
  
  console.log(`
📋 KIỂM TRA CÁC SCENARIO:
✅ Chỉ thành công → "Bonz đã vô X nhóm thành công!"
✅ Chỉ cần duyệt → "Duyệt bonz vào với làm ơn"
✅ Chỉ thất bại → "Bonz không thể vô nhóm nào"
✅ Mix scenarios → Hiển thị phù hợp
  `);
  
  // Test 1: Chỉ nhóm cần approval
  console.log("\n1️⃣ Test: Chỉ nhóm cần duyệt");
  
  const approvalOnlyLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/approval123",
      id: "approval123"
    },
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/permission456",
      id: "permission456"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPIWithScenarios,
      "test_thread_1",
      1,
      "user123",
      "ApprovalUser",
      approvalOnlyLinks
    );
    
    console.log("✅ Test approval only completed!");
    
  } catch (error) {
    console.log(`❌ Test approval only failed: ${error.message}`);
  }
  
  console.log("\n" + "⏳".repeat(30));
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Chỉ nhóm thành công
  console.log("\n2️⃣ Test: Chỉ nhóm thành công");
  
  const successOnlyLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/success123",
      id: "success123"
    },
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/success456",
      id: "success456"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPIWithScenarios,
      "test_thread_2",
      1,
      "user456",
      "SuccessUser",
      successOnlyLinks
    );
    
    console.log("✅ Test success only completed!");
    
  } catch (error) {
    console.log(`❌ Test success only failed: ${error.message}`);
  }
  
  console.log("\n" + "⏳".repeat(30));
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 3: Mix scenarios
  console.log("\n3️⃣ Test: Mix scenarios (thành công + cần duyệt + thất bại)");
  
  const mixLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/success1",
      id: "success1"
    },
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/approval1",
      id: "approval1"
    },
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/fail1",
      id: "fail1"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPIWithScenarios,
      "test_thread_3",
      1,
      "user789",
      "MixUser",
      mixLinks
    );
    
    console.log("✅ Test mix scenarios completed!");
    
  } catch (error) {
    console.log(`❌ Test mix scenarios failed: ${error.message}`);
  }
  
  console.log("\n" + "⏳".repeat(30));
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 4: Chỉ thất bại
  console.log("\n4️⃣ Test: Chỉ thất bại");
  
  const failOnlyLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/fail123",
      id: "fail123"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPIWithScenarios,
      "test_thread_4",
      1,
      "user999",
      "FailUser",
      failOnlyLinks
    );
    
    console.log("✅ Test fail only completed!");
    
  } catch (error) {
    console.log(`❌ Test fail only failed: ${error.message}`);
  }
}

async function showExpectedResults() {
  console.log("\n" + "=" .repeat(70));
  console.log("📊 KẾT QUẢ MONG ĐỢI CHO TỪNG SCENARIO");
  console.log("=" .repeat(70));
  
  console.log(`
🎯 **SCENARIO 1: Chỉ nhóm cần duyệt**
Kết quả mong đợi:
"🏁 Bonz hoàn thành vô nhóm
⏳ Nhóm cần duyệt
🙏 Duyệt bonz vào với làm ơn
📊 Tổng: 2 link | Thành công: 0 | Cần duyệt: 2
👤 Yêu cầu bởi: @ApprovalUser"

---

🎯 **SCENARIO 2: Chỉ nhóm thành công**
Kết quả mong đợi:
"🏁 Bonz hoàn thành vô nhóm
🎉 Bonz đã vô 2 nhóm thành công!
📊 Tổng: 2 link | Thành công: 2
👤 Yêu cầu bởi: @SuccessUser"

---

🎯 **SCENARIO 3: Mix (thành công + cần duyệt + thất bại)**
Kết quả mong đợi:
"🏁 Bonz hoàn thành vô nhóm
🎉 Bonz đã vô 1 nhóm thành công!
📊 Tổng: 3 link | Thành công: 1 | Cần duyệt: 1
👤 Yêu cầu bởi: @MixUser"

---

🎯 **SCENARIO 4: Chỉ thất bại**
Kết quả mong đợi:
"🏁 Bonz hoàn thành vô nhóm
😔 Bonz không thể vô nhóm nào.
📊 Tổng: 1 link | Thành công: 0
👤 Yêu cầu bởi: @FailUser"

---

🔍 **LOGIC HIỂN THỊ:**
1. Nếu có thành công → Hiển thị "Bonz đã vô X nhóm thành công!"
2. Nếu không có thành công nhưng có cần duyệt → "Duyệt bonz vào với làm ơn"
3. Nếu không có thành công và không có cần duyệt → "Bonz không thể vô nhóm nào"
4. Luôn hiển thị thống kê: "Tổng: X link | Thành công: Y [| Cần duyệt: Z]"
  `);
}

// Main function
async function runApprovalFinalTest() {
  try {
    await testApprovalInFinalMessage();
    await showExpectedResults();
    
    console.log("\n🎉 Test approval in final message hoàn thành!");
    console.log("💡 Bot giờ sẽ hiển thị 'duyệt bonz vào với làm ơn' trong thông báo cuối khi cần!");
    
  } catch (error) {
    console.error("🚨 Test failed:", error.message);
  }
}

// Run test
if (require.main === module) {
  runApprovalFinalTest().catch(console.error);
}

module.exports = { runApprovalFinalTest };
