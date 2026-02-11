// Script để setup session Zalo thật cho tính năng auto join
const fs = require('fs');
const path = require('path');

console.log("🔧 SETUP ZALO SESSION CHO AUTO JOIN");
console.log("=" .repeat(50));

console.log(`
📋 HƯỚNG DẪN LẤY SESSION ZALO:

1. 🌐 Mở trình duyệt và đăng nhập Zalo Web:
   • Truy cập: https://chat.zalo.me
   • Đăng nhập bằng tài khoản Zalo của bạn

2. 🔍 Mở Developer Tools (F12):
   • Nhấn F12 hoặc Ctrl+Shift+I
   • Chuyển sang tab "Application" hoặc "Storage"

3. 🍪 Lấy Cookies:
   • Trong phần "Storage" > "Cookies" > "https://chat.zalo.me"
   • Tìm và copy các giá trị sau:
     - zpw_sek (Secret Key)
     - zpw_uid (User ID) 
     - _zlang (Language)
     - zalo_session (Session)

4. 📱 Lấy IMEI:
   • Trong tab "Network", tìm request có chứa "imei"
   • Hoặc sử dụng IMEI giả: "bot_" + timestamp

5. 🔑 Lấy Secret Key:
   • Trong tab "Network", tìm request POST
   • Xem trong request headers hoặc payload
   • Thường có format base64

📝 CÁCH SETUP:
`);

// Tạo template session
const sessionTemplate = {
  cookies: {
    zpw_sek: "YOUR_ZPW_SEK_HERE",
    zpw_uid: "YOUR_USER_ID_HERE", 
    _zlang: "vi",
    zalo_session: "YOUR_SESSION_HERE"
  },
  secretKey: "YOUR_SECRET_KEY_BASE64_HERE",
  imei: "YOUR_IMEI_OR_DEVICE_ID_HERE",
  userId: "YOUR_USER_ID_HERE",
  extractedAt: new Date().toISOString(),
  note: "Real Zalo session for auto join functionality"
};

const configPath = path.join(__dirname, 'config', 'zalo_session.json');

console.log(`
🔧 SETUP NHANH:

1. Chỉnh sửa file: ${configPath}
2. Thay thế các giá trị YOUR_*_HERE bằng dữ liệu thật
3. Chạy lại bot để test

📄 Template đã được tạo tại: ${configPath}_template
`);

// Tạo file template
const templatePath = configPath + '_template';
fs.writeFileSync(templatePath, JSON.stringify(sessionTemplate, null, 2));

console.log(`
✅ Đã tạo template tại: ${templatePath}

🧪 TEST SESSION:
Sau khi setup, chạy lệnh sau để test:
node test_zalo_session.js

⚠️ LƯU Ý:
• Không chia sẻ session với người khác
• Session có thể hết hạn, cần update định kỳ
• Sử dụng tài khoản phụ để test
`);

// Tạo script test session
const testScript = `// Test script cho Zalo session
const ZaloAPI = require('./plugins/commands/zaloapi.js');

async function testZaloSession() {
  console.log("🧪 Testing Zalo Session...");
  
  const zaloAPI = new ZaloAPI();
  
  // Try auto-configure
  if (zaloAPI.autoConfigureSession()) {
    console.log("✅ Session loaded successfully");
    
    // Test connection
    const testResult = await zaloAPI.testConnection();
    
    if (testResult.success) {
      console.log("✅ Connection test passed!");
      console.log("🎉 Zalo API ready for auto join!");
      
      // Test join (with a test group if available)
      console.log("\\n📝 To test group join, use:");
      console.log("await zaloAPI.joinGroupByLink('https://zalo.me/g/YOUR_TEST_GROUP');");
      
    } else {
      console.log("❌ Connection test failed:", testResult.message);
      console.log("💡 Please check your session data");
    }
  } else {
    console.log("❌ Failed to load session");
    console.log("💡 Please setup session first using setup_zalo_session.js");
  }
}

testZaloSession().catch(console.error);`;

fs.writeFileSync(path.join(__dirname, 'test_zalo_session.js'), testScript);

console.log(`
🎯 NEXT STEPS:

1. 📝 Chỉnh sửa: ${configPath}
2. 🧪 Test: node test_zalo_session.js  
3. 🚀 Sử dụng: autojoin on

🔗 Khi có session thật, bot sẽ thực sự join vào nhóm Zalo!
`);

// Kiểm tra session hiện tại
try {
  const currentSession = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  if (currentSession.secretKey.includes('dummy') || currentSession.cookies.zpw_sek.includes('dummy')) {
    console.log(`
⚠️  CẢNH BÁO: Session hiện tại là DUMMY DATA
Bot sẽ không thể join thật vào nhóm Zalo.
Vui lòng setup session thật theo hướng dẫn trên.
    `);
  } else {
    console.log(`
✅ Session hiện tại có vẻ là dữ liệu thật.
Chạy test để kiểm tra: node test_zalo_session.js
    `);
  }
} catch (error) {
  console.log(`
❌ Không thể đọc session hiện tại: ${error.message}
Vui lòng tạo file session mới.
  `);
}

console.log("=" .repeat(50));
