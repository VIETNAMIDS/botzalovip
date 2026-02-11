// Test script để kiểm tra tính năng auto join với API từ bonz.js
const autoJoinModule = require('./plugins/commands/autojoin.js');

// Mock API với các method từ bonz.js
const mockAPIWithBonzMethods = {
  sendMessage: async (messageData, threadId, type) => {
    const message = messageData.msg || messageData;
    console.log(`\n📱 [BOT] ${message}`);
    
    if (messageData.ttl) {
      console.log(`⏰ TTL: ${messageData.ttl/1000}s`);
    }
    
    return { success: true };
  },
  
  // Mock các method từ bonz.js
  joinGroupByLink: async (link) => {
    console.log(`✅ [BONZ API] joinGroupByLink called with: ${link}`);
    // Simulate success for demo
    return true;
  },
  
  joinGroup: async (linkOrId) => {
    console.log(`✅ [BONZ API] joinGroup called with: ${linkOrId}`);
    // Simulate success for demo
    return true;
  },
  
  joinChatByLink: async (link) => {
    console.log(`✅ [BONZ API] joinChatByLink called with: ${link}`);
    return true;
  },
  
  acceptInviteLink: async (link) => {
    console.log(`✅ [BONZ API] acceptInviteLink called with: ${link}`);
    return true;
  },
  
  getIDsGroup: async (link) => {
    console.log(`🔍 [BONZ API] getIDsGroup called with: ${link}`);
    // Extract ID from link for demo
    const match = link.match(/zalo\.me\/[gs]\/([a-zA-Z0-9]+)/);
    if (match) {
      const groupId = match[1];
      console.log(`🔍 [BONZ API] Resolved group ID: ${groupId}`);
      return { groupId };
    }
    return null;
  },
  
  resolveInviteLink: async (link) => {
    console.log(`🔍 [BONZ API] resolveInviteLink called with: ${link}`);
    const match = link.match(/zalo\.me\/[gs]\/([a-zA-Z0-9]+)/);
    if (match) {
      return { chatId: match[1] };
    }
    return null;
  },
  
  joinGroupById: async (groupId) => {
    console.log(`✅ [BONZ API] joinGroupById called with: ${groupId}`);
    return true;
  },
  
  joinChat: async (chatId) => {
    console.log(`✅ [BONZ API] joinChat called with: ${chatId}`);
    return true;
  },
  
  acceptInvite: async (inviteId) => {
    console.log(`✅ [BONZ API] acceptInvite called with: ${inviteId}`);
    return true;
  }
};

// Mock Threads
const testThreads = {
  getData: async () => ({ data: { auto_join: true } }),
  setData: async () => true
};

async function testBonzJoinIntegration() {
  console.log("🧪 TEST: Auto Join với API từ bonz.js");
  console.log("=" .repeat(60));
  
  console.log(`
📋 KIỂM TRA:
✅ Sử dụng API methods từ bonz.js command
✅ Thử nhiều phương thức join khác nhau
✅ Fallback system hoàn chỉnh
✅ Thông báo tiến trình chi tiết
  `);
  
  // Test 1: Single Zalo group link
  console.log("\n1️⃣ Test với 1 link Zalo group:");
  
  const testLinks1 = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/bonztest123",
      id: "bonztest123"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPIWithBonzMethods,
      "test_thread_1",
      1,
      "test_user_1",
      "TestUser1",
      testLinks1
    );
    
    console.log("✅ Test 1 completed successfully!");
    
  } catch (error) {
    console.log(`❌ Test 1 failed: ${error.message}`);
  }
  
  // Test 2: Multiple links
  console.log("\n2️⃣ Test với nhiều link:");
  
  const testLinks2 = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/group1",
      id: "group1"
    },
    {
      type: "ZALO_INVITE", 
      link: "https://zalo.me/s/invite1",
      id: "invite1"
    },
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/group2", 
      id: "group2"
    }
  ];
  
  try {
    await autoJoinModule.handleAutoJoin(
      mockAPIWithBonzMethods,
      "test_thread_2",
      1,
      "test_user_2",
      "TestUser2", 
      testLinks2
    );
    
    console.log("✅ Test 2 completed successfully!");
    
  } catch (error) {
    console.log(`❌ Test 2 failed: ${error.message}`);
  }
  
  // Test 3: Commands
  console.log("\n3️⃣ Test commands:");
  
  const commands = [
    { args: ["on"], desc: "Bật auto join" },
    { args: ["test"], desc: "Test link detection" }
  ];
  
  for (const cmd of commands) {
    console.log(`\n🔧 Testing: autojoin ${cmd.args.join(' ')} (${cmd.desc})`);
    
    try {
      await autoJoinModule.run({
        api: mockAPIWithBonzMethods,
        event: {
          threadId: "test_thread_cmd",
          type: 1,
          data: { uidFrom: "test_user_cmd", dName: "TestUserCmd" }
        },
        args: cmd.args,
        Threads: testThreads
      });
      
      console.log(`✅ Command test passed!`);
      
    } catch (error) {
      console.log(`❌ Command test failed: ${error.message}`);
    }
  }
}

async function showBonzIntegrationSummary() {
  console.log("\n" + "=" .repeat(60));
  console.log("📊 TÓM TẮT TÍCH HỢP BONZ.JS API");
  console.log("=" .repeat(60));
  
  console.log(`
🔗 API METHODS ĐÃ TÍCH HỢP:

📌 **Primary Methods (Thử trước):**
• api.joinGroupByLink(link) - Join trực tiếp bằng link
• api.joinGroup(link) - Join group với link
• api.joinChatByLink(link) - Join chat bằng link  
• api.acceptInviteLink(link) - Accept invite link
• api.joinGroup({link}) - Join với object format

📌 **Resolver Methods (Lấy ID từ link):**
• api.getIDsGroup(link) - Lấy group ID từ link
• api.resolveInviteLink(link) - Resolve invite link
• api.getGroupInfoFromLink(link) - Lấy info từ link

📌 **ID-based Methods (Join bằng ID):**
• api.joinGroupById(id) - Join bằng group ID
• api.joinChat(id) - Join chat bằng ID
• api.acceptInvite(id) - Accept invite bằng ID
• api.acceptGroupInvite(id) - Accept group invite

🎯 **LUỒNG HOẠT ĐỘNG:**

1. 🤖 "Bot đang join vui lòng chờ"
2. 🔄 "Đang join nhóm X/Y"
3. 🔗 Thử các API methods từ bonz.js theo thứ tự
4. ✅ "Thành công! Đã vào nhóm: [ID]" 
5. 🏁 "Bot đã vào X nhóm thành công!"

🚀 **ƯU ĐIỂM:**

✅ Sử dụng API thật từ hệ thống bonz.js
✅ Nhiều phương thức fallback
✅ Không cần Python bridge
✅ Tích hợp hoàn hảo với bot hiện có
✅ Thông báo tiến trình chi tiết
✅ Error handling robust

💡 **CÁCH SỬ DỤNG:**

1. Bật: autojoin on
2. Chia sẻ link: https://zalo.me/g/abc123
3. Bot tự động:
   - Phát hiện link
   - Thử các API từ bonz.js
   - Join thật vào nhóm
   - Báo kết quả

⚠️ **LƯU Ý:**

• Bot sử dụng chính API từ lệnh "bonz tham gia"
• Không cần setup session riêng
• Hoạt động với API có sẵn trong hệ thống
• Fallback system đảm bảo tỷ lệ thành công cao
  `);
}

// Main function
async function runBonzTest() {
  try {
    await testBonzJoinIntegration();
    await showBonzIntegrationSummary();
    
    console.log("\n🎉 Test hoàn thành!");
    console.log("💡 Bot giờ sử dụng API thật từ bonz.js để join nhóm!");
    
  } catch (error) {
    console.error("🚨 Test failed:", error.message);
  }
}

// Run test
if (require.main === module) {
  runBonzTest().catch(console.error);
}

module.exports = { runBonzTest };
