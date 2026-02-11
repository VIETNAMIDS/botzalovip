// Demo script để test thông báo auto join trong thực tế
const autoJoinModule = require('./plugins/commands/autojoin.js');

// Mock API đơn giản để demo
const demoAPI = {
  sendMessage: async (messageData, threadId, type) => {
    const message = messageData.msg || messageData;
    console.log(`\n📱 [THÔNG BÁO] ${message}`);
    
    if (messageData.ttl) {
      console.log(`⏰ Tin nhắn sẽ tự xóa sau ${messageData.ttl/1000}s`);
    }
    
    return { success: true };
  },
  
  joinGroup: async (groupId) => {
    // Giả lập thời gian join thực tế
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 80% thành công, 20% thất bại
    const success = Math.random() > 0.2;
    
    if (success) {
      console.log(`✅ API: Đã join thành công nhóm ${groupId}`);
      return { success: true, groupId };
    } else {
      console.log(`❌ API: Join thất bại nhóm ${groupId}`);
      throw new Error('Nhóm không tồn tại hoặc đã đầy');
    }
  }
};

// Mock Threads
const demoThreads = {
  getData: async () => ({ data: { auto_join: true } }),
  setData: async () => true
};

// Demo các scenario thông báo
async function demoNotificationFlow() {
  console.log("🎬 DEMO: Luồng thông báo Auto Join Zalo Group");
  console.log("=" .repeat(60));
  
  // Scenario 1: Một nhóm thành công
  console.log("\n📋 Scenario 1: Một link Zalo group");
  const links1 = [{
    type: "ZALO_GROUP",
    link: "https://zalo.me/g/demo123",
    id: "demo123"
  }];
  
  await autoJoinModule.handleAutoJoin(
    demoAPI,
    "demo_thread",
    1,
    "user123",
    "DemoUser",
    links1
  );
  
  console.log("\n⏳ Chờ 3 giây...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Scenario 2: Nhiều nhóm
  console.log("\n📋 Scenario 2: Nhiều link Zalo group");
  const links2 = [
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
      type: "ZALO_INVITE",
      link: "https://zalo.me/s/invite1",
      id: "invite1"
    }
  ];
  
  await autoJoinModule.handleAutoJoin(
    demoAPI,
    "demo_thread",
    1,
    "user456", 
    "MultiUser",
    links2
  );
}

// Demo lệnh
async function demoCommands() {
  console.log("\n🎮 DEMO: Các lệnh Auto Join");
  console.log("=" .repeat(60));
  
  const commands = [
    { args: ["on"], desc: "Bật auto join" },
    { args: ["status"], desc: "Xem trạng thái" },
    { args: ["test"], desc: "Test phát hiện link" }
  ];
  
  for (const cmd of commands) {
    console.log(`\n🔧 Lệnh: autojoin ${cmd.args.join(' ')} (${cmd.desc})`);
    
    try {
      await autoJoinModule.run({
        api: demoAPI,
        event: {
          threadId: "demo_thread",
          type: 1,
          data: { uidFrom: "demo_user", dName: "DemoUser" }
        },
        args: cmd.args,
        Threads: demoThreads
      });
    } catch (error) {
      console.log(`❌ Lỗi: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Hàm chính
async function runDemo() {
  console.log("🚀 DEMO AUTO JOIN ZALO GROUP - THÔNG BÁO");
  console.log("🎯 Mô phỏng các thông báo khi bot join nhóm");
  console.log("=" .repeat(60));
  
  try {
    await demoNotificationFlow();
    await demoCommands();
    
    console.log("\n" + "=" .repeat(60));
    console.log("🎉 DEMO HOÀN THÀNH!");
    console.log("=" .repeat(60));
    
    console.log("\n📝 Tóm tắt luồng thông báo:");
    console.log("1. 🤖 'Bot đang xử lý Auto Join' - Thông báo bắt đầu");
    console.log("2. 🔄 'Đang join nhóm X/Y' - Tiến trình từng nhóm");
    console.log("3. ✅ 'Thành công! Đã vào nhóm: [ID]' - Kết quả ngay lập tức");
    console.log("4. 🏁 'Bot đã vào X nhóm thành công!' - Tổng kết cuối");
    
    console.log("\n🎮 Cách sử dụng thực tế:");
    console.log("• Bật: 'autojoin on' hoặc 'anti autojoin'");
    console.log("• Chia sẻ link: https://zalo.me/g/[group_id]");
    console.log("• Bot sẽ tự động join và báo kết quả");
    
  } catch (error) {
    console.error("🚨 Lỗi demo:", error.message);
  }
}

// Chạy demo
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { runDemo };
