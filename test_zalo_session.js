// Test script cho Zalo session
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
      console.log("\n📝 To test group join, use:");
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

testZaloSession().catch(console.error);