#!/usr/bin/env node

/**
 * Zefoy Web Server Starter
 * Khởi động web server để mở Zefoy và xử lý captcha
 */

const path = require('path');

console.log('🚀 Starting Zefoy Web Server...');

// Import and start the web server
try {
  require('./web/zefoy-server.js');
  console.log('✅ Zefoy Web Server started successfully!');
  console.log('🌐 Access: http://localhost:3000');
  console.log('📋 Bot integration: Ready');
  console.log('');
  console.log('💡 Usage:');
  console.log('   1. Use bot command: bonz của tớ <service> <url>');
  console.log('   2. Bot will send web link');
  console.log('   3. Open link to access Zefoy');
  console.log('   4. Complete captcha on web');
  console.log('   5. Bot receives result automatically');
  console.log('');
  console.log('⚠️  Keep this terminal open while using Zefoy features');
} catch (error) {
  console.error('❌ Failed to start Zefoy Web Server:', error.message);
  process.exit(1);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Zefoy Web Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Zefoy Web Server...');
  process.exit(0);
});
