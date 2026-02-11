const path = require('path');

console.log('🔍 Testing Zefoy Web Server...');

try {
  // Load web server module
  const webServer = require('./web/zefoy-server.js');
  console.log('✅ Web server module loaded successfully');
  
  // Test startServer function
  if (webServer.startServer) {
    console.log('✅ startServer function exists');
    webServer.startServer();
    console.log('✅ startServer called');
  } else {
    console.log('❌ startServer function not found');
  }
  
  // Wait a bit for server to start
  setTimeout(async () => {
    try {
      // Test createSession function
      if (webServer.createSession) {
        console.log('✅ createSession function exists');
        
        const testSession = await webServer.createSession('hearts', 'https://tiktok.com/@test', 'test123', 'user456');
        console.log('✅ createSession test result:', testSession);
        
        if (testSession && testSession.success) {
          console.log('🎉 Web server is working correctly!');
          console.log('🔗 Test URL:', testSession.webUrl);
        } else {
          console.log('❌ createSession returned invalid result');
        }
      } else {
        console.log('❌ createSession function not found');
      }
    } catch (error) {
      console.error('❌ Error testing createSession:', error);
    }
    
    console.log('\n💡 Test completed. If everything is ✅, the web server should work in bot.');
    console.log('💡 If you see ❌, there might be an issue with the web server setup.');
    console.log('💡 Try: node start-zefoy-web.js');
    
  }, 3000);
  
} catch (error) {
  console.error('❌ Error loading web server:', error);
  console.log('\n💡 Possible solutions:');
  console.log('• Check if web/zefoy-server.js exists');
  console.log('• Check if all dependencies are installed');
  console.log('• Try: npm install express');
}
