// Test script để kiểm tra tính năng join thật với zlapi Python bridge
const autoJoinModule = require('./plugins/commands/autojoin.js');

// Mock API để test
const testAPI = {
  sendMessage: async (messageData, threadId, type) => {
    const message = messageData.msg || messageData;
    console.log(`\n📱 [BOT] ${message}`);
    
    if (messageData.ttl) {
      console.log(`⏰ TTL: ${messageData.ttl/1000}s`);
    }
    
    return { success: true };
  }
};

// Mock Threads
const testThreads = {
  getData: async () => ({ data: { auto_join: true } }),
  setData: async () => true
};

async function testRealJoin() {
  console.log("🧪 TEST: Auto Join Thật với zlapi Python Bridge");
  console.log("=" .repeat(60));
  
  // Test 1: Kiểm tra Python bridge
  console.log("\n1️⃣ Testing Python bridge...");
  
  try {
    const { spawn } = require('child_process');
    const path = require('path');
    
    const bridgePath = path.join(__dirname, 'zalo_join_bridge.py');
    
    // Test với link giả để kiểm tra bridge
    const testResult = await new Promise((resolve, reject) => {
      const python = spawn('python', [bridgePath, 'https://zalo.me/g/test123']);
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      python.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Parse error: ${parseError.message}`));
          }
        } else {
          reject(new Error(`Python failed: ${stderr}`));
        }
      });
      
      setTimeout(() => {
        python.kill();
        reject(new Error('Timeout'));
      }, 10000);
    });
    
    console.log("✅ Python bridge working!");
    console.log(`📊 Result: ${testResult.success ? 'Success' : 'Failed'}`);
    
    if (!testResult.success) {
      console.log(`❌ Error: ${testResult.error}`);
      
      if (testResult.error.includes('dummy')) {
        console.log(`
💡 HƯỚNG DẪN SETUP SESSION:
1. Chạy: node setup_zalo_session.js
2. Làm theo hướng dẫn để lấy session thật từ Zalo Web
3. Thay thế dữ liệu dummy trong config/zalo_session.json
4. Chạy lại test này
        `);
      }
    }
    
  } catch (error) {
    console.log(`❌ Python bridge test failed: ${error.message}`);
    
    if (error.message.includes('spawn')) {
      console.log(`
💡 LỖI PYTHON:
• Đảm bảo Python đã được cài đặt
• Kiểm tra PATH environment variable
• Thử chạy: python --version
      `);
    }
    
    return;
  }
  
  // Test 2: Test với autojoin module
  console.log("\n2️⃣ Testing autojoin module...");
  
  const testLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/test123", // Link test
      id: "test123"
    }
  ];
  
  try {
    console.log("🚀 Testing handleAutoJoin...");
    
    await autoJoinModule.handleAutoJoin(
      testAPI,
      "test_thread",
      1,
      "test_user",
      "TestUser",
      testLinks
    );
    
    console.log("✅ AutoJoin module test completed!");
    
  } catch (error) {
    console.log(`❌ AutoJoin test failed: ${error.message}`);
  }
  
  // Test 3: Test commands
  console.log("\n3️⃣ Testing commands...");
  
  try {
    await autoJoinModule.run({
      api: testAPI,
      event: {
        threadId: "test_thread",
        type: 1,
        data: { uidFrom: "test_user", dName: "TestUser" }
      },
      args: ["status"],
      Threads: testThreads
    });
    
    console.log("✅ Command test completed!");
    
  } catch (error) {
    console.log(`❌ Command test failed: ${error.message}`);
  }
}

async function showUsageInstructions() {
  console.log("\n" + "=" .repeat(60));
  console.log("📚 HƯỚNG DẪN SỬ DỤNG AUTO JOIN THẬT");
  console.log("=" .repeat(60));
  
  console.log(`
🔧 SETUP (Chỉ cần làm 1 lần):
1. Chạy: node setup_zalo_session.js
2. Làm theo hướng dẫn để lấy session Zalo thật
3. Cập nhật file config/zalo_session.json

🎮 SỬ DỤNG:
1. Bật auto join: autojoin on
2. Khi có người chia sẻ link Zalo group
3. Bot sẽ tự động join thật vào nhóm!

🔗 LINK HỖ TRỢ:
• https://zalo.me/g/[group_id] - Link nhóm công khai
• https://zalo.me/s/[invite_code] - Link mời nhóm

⚠️ LƯU Ý:
• Cần session Zalo hợp lệ
• Bot sẽ thực sự join vào nhóm (không phải giả lập)
• Tuân thủ quy định của Zalo
• Sử dụng tài khoản phụ để test

🎯 LUỒNG HOẠT ĐỘNG:
1. 🤖 "Bot đang join vui lòng chờ"
2. 🔄 "Đang join nhóm X/Y" 
3. ✅ "Thành công! Đã vào nhóm: [ID]"
4. 🏁 "Bot đã vào X nhóm thành công!"
  `);
}

// Main function
async function runTest() {
  try {
    await testRealJoin();
    await showUsageInstructions();
    
    console.log("\n🎉 Test hoàn thành!");
    console.log("💡 Nếu tất cả test pass, bot đã sẵn sàng join thật vào nhóm Zalo!");
    
  } catch (error) {
    console.error("🚨 Test failed:", error.message);
  }
}

// Run test
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = { runTest };
