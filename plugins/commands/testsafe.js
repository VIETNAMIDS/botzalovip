// Test command để kiểm tra safe functionality
const safeUtil = require('./safe.js');

module.exports.config = {
  name: "testsafe",
  aliases: ["ts"],
  version: "1.0.0",
  role: 0,
  author: "Debug",
  description: "Test safe command",
  category: "Debug",
  usage: "testsafe <action>",
  cooldowns: 1,
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const action = (args[0] || '').toLowerCase();
  
  try {
    console.log('[TESTSAFE] Called with action:', action, 'args:', args);
    
    if (!action) {
      return api.sendMessage('🧪 TEST SAFE\n• testsafe từ <word> - thêm từ\n• testsafe status - xem trạng thái', threadId, type);
    }
    
    if (action === 'từ' || action === 'tu') {
      const terms = args.slice(1).filter(Boolean);
      if (!terms.length) {
        return api.sendMessage('❌ Thiếu từ! Dùng: testsafe từ <word>', threadId, type);
      }
      
      console.log('[TESTSAFE] Adding words:', terms);
      const res = safeUtil.addForbiddenWords(terms);
      console.log('[TESTSAFE] Result:', res);
      
      if (res?.ok) {
        return api.sendMessage(`✅ Đã thêm từ: ${terms.join(', ')}`, threadId, type);
      } else {
        return api.sendMessage('❌ Không thể thêm từ: ' + (res?.error || 'unknown'), threadId, type);
      }
    }
    
    if (action === 'status') {
      const globalOn = safeUtil.getSafeMode();
      const threadOn = safeUtil.getThreadSafeMode(threadId);
      const extras = safeUtil.listForbiddenExtras?.() || { words: [], links: [] };
      
      return api.sendMessage(
        `🛡️ SAFE STATUS\n` +
        `• Global: ${globalOn ? 'ON' : 'OFF'}\n` +
        `• Thread: ${threadOn === null ? 'default' : (threadOn ? 'ON' : 'OFF')}\n` +
        `• Custom words: ${extras.words.length}\n` +
        `• Custom links: ${extras.links.length}`,
        threadId, type
      );
    }
    
    return api.sendMessage('❌ Lệnh không hợp lệ. Dùng: testsafe hoặc testsafe từ <word>', threadId, type);
    
  } catch (e) {
    console.error('[TESTSAFE] Error:', e);
    return api.sendMessage('❌ Lỗi: ' + e.message, threadId, type);
  }
};
