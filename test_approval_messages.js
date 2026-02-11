// Test script để kiểm tra thông báo "duyệt bonz vào với làm ơn"
const autoJoinModule = require('./plugins/commands/autojoin.js');

// Mock API với các scenarios khác nhau
const mockAPIWithApproval = {
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

async function testApprovalMessages() {
  console.log("🧪 TEST: Thông báo 'duyệt bonz vào với làm ơn'");
  console.log("=" .repeat(60));
  
  console.log(`
📋 KIỂM TRA CÁC SCENARIO:
✅ Nhóm cần duyệt → "duyệt bonz vào với làm ơn"
✅ Nhóm thành công → "Bonz đã vô nhóm thành công!"
✅ Nhóm lỗi khác → "Bonz không thể vô nhóm"
  `);
  
  // Test 1: Nhóm cần approval
  console.log("\n1️⃣ Test nhóm cần duyệt:");
  
  const approvalLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/approval123",
      id: "approval123"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPIWithApproval,
      "test_thread_1",
      1,
      "user123",
      "TestUser",
      approvalLinks
    );
    
    console.log("✅ Test approval completed!");
    
  } catch (error) {
    console.log(`❌ Test approval failed: ${error.message}`);
  }
  
  console.log("\n" + "⏳".repeat(20));
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Nhóm thành công
  console.log("\n2️⃣ Test nhóm thành công:");
  
  const successLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/success123",
      id: "success123"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPIWithApproval,
      "test_thread_2",
      1,
      "user456",
      "SuccessUser",
      successLinks
    );
    
    console.log("✅ Test success completed!");
    
  } catch (error) {
    console.log(`❌ Test success failed: ${error.message}`);
  }
  
  console.log("\n" + "⏳".repeat(20));
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 3: Nhóm lỗi khác
  console.log("\n3️⃣ Test nhóm lỗi khác:");
  
  const failLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/fail123",
      id: "fail123"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPIWithApproval,
      "test_thread_3",
      1,
      "user789",
      "FailUser",
      failLinks
    );
    
    console.log("✅ Test fail completed!");
    
  } catch (error) {
    console.log(`❌ Test fail failed: ${error.message}`);
  }
  
  console.log("\n" + "⏳".repeat(20));
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 4: Mix scenarios
  console.log("\n4️⃣ Test mix scenarios:");
  
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
      mockAPIWithApproval,
      "test_thread_4",
      1,
      "user999",
      "MixUser",
      mixLinks
    );
    
    console.log("✅ Test mix completed!");
    
  } catch (error) {
    console.log(`❌ Test mix failed: ${error.message}`);
  }
}

async function showApprovalMessageExamples() {
  console.log("\n" + "=" .repeat(60));
  console.log("📊 CÁC LOẠI THÔNG BÁO THEO TÌNH HUỐNG");
  console.log("=" .repeat(60));
  
  console.log(`
🎯 **SCENARIO 1: Nhóm cần duyệt**
Khi API trả về lỗi chứa: "approval", "permission", "request", "pending"

📱 Thông báo hiển thị:
"⏳ Nhóm cần duyệt
🙏 Duyệt bonz vào với làm ơn
📝 Nhóm: abc123"

---

🎯 **SCENARIO 2: Join thành công**
Khi API join thành công

📱 Thông báo hiển thị:
"🎉 Bonz đã vô nhóm thành công!
✅ Nhóm: abc123
📊 Tổng: 1 nhóm"

---

🎯 **SCENARIO 3: Lỗi khác**
Khi có lỗi không phải approval (network, invalid link, etc.)

📱 Thông báo hiển thị:
"❌ Bonz không thể vô nhóm
🚫 Nhóm: abc123
📝 Lý do: Network error occurred"

---

🔍 **KEYWORDS PHÁT HIỆN APPROVAL:**
• "approval" - cần phê duyệt
• "permission" - không có quyền
• "request" - yêu cầu tham gia
• "pending" - đang chờ duyệt
• "duyệt" - từ tiếng Việt
• "phê duyệt" - từ tiếng Việt
• "yêu cầu" - từ tiếng Việt
• "chờ" - từ tiếng Việt

🎮 **CÁCH SỬ DỤNG:**
1. Bật: autojoin on
2. Chia sẻ link nhóm Zalo
3. Bot sẽ tự động:
   - Thử join
   - Nếu cần duyệt → "duyệt bonz vào với làm ơn"
   - Nếu thành công → "Bonz đã vô nhóm thành công!"
   - Nếu lỗi khác → "Bonz không thể vô nhóm"
  `);
}

// Main function
async function runApprovalTest() {
  try {
    await testApprovalMessages();
    await showApprovalMessageExamples();
    
    console.log("\n🎉 Test approval messages hoàn thành!");
    console.log("💡 Bot giờ sẽ hiển thị 'duyệt bonz vào với làm ơn' khi nhóm cần duyệt!");
    
  } catch (error) {
    console.error("🚨 Test failed:", error.message);
  }
}

// Run test
if (require.main === module) {
  runApprovalTest().catch(console.error);
}

module.exports = { runApprovalTest };
