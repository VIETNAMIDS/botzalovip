// Safe wrapper cho api.sendMessage để tránh lỗi "Nhóm này không tồn tại"

// Blacklist của các threadId có vấn đề
const PROBLEMATIC_THREAD_IDS = [
  '5575182743701364501', // ThreadId gây lỗi "Nhóm này không tồn tại"
];

// Helper function kiểm tra threadId có an toàn không
function isThreadIdSafe(threadId) {
  if (!threadId || threadId === 'undefined' || threadId === 'null') {
    return false;
  }
  return !PROBLEMATIC_THREAD_IDS.includes(String(threadId));
}

// Safe wrapper cho api.sendMessage (theo zca-js: message, threadId, msgType)
async function safeSendMessage(api, message, threadId, msgType = 1) {
  try {
    // Kiểm tra threadId có an toàn không
    if (!isThreadIdSafe(threadId)) {
      console.log(`[SAFE SEND] Skipping send to problematic threadId: ${threadId}`);
      return { success: false, reason: 'problematic_thread_id' };
    }

    const finalType = (typeof msgType === 'number' ? msgType : 1);
    console.log(`[SAFE SEND] Attempt send #1 (2-arg) -> threadId: ${threadId}`);
    try {
      const r = await api.sendMessage(message, threadId);
      console.log(`[SAFE SEND] Send #1 success`);
      return { success: true, result: r };
    } catch (e1) {
      console.warn(`[SAFE SEND] Send #1 failed: ${e1?.message || e1}`);
      console.log(`[SAFE SEND] Attempt send #2 (3-arg, GROUP=2) -> threadId: ${threadId}`);
      try {
        const r2 = await api.sendMessage(message, threadId, 2);
        console.log(`[SAFE SEND] Send #2 success`);
        return { success: true, result: r2 };
      } catch (e2) {
        console.warn(`[SAFE SEND] Send #2 failed: ${e2?.message || e2}`);
        console.log(`[SAFE SEND] Attempt send #3 (3-arg, USER=1) -> threadId: ${threadId}`);
        const r3 = await api.sendMessage(message, threadId, finalType);
        console.log(`[SAFE SEND] Send #3 success`);
        return { success: true, result: r3 };
      }
    }
    
    
  } catch (error) {
    console.error(`[SAFE SEND] Error sending message to threadId ${threadId}:`, error);
    
    // Nếu lỗi "Nhóm không tồn tại", thêm vào blacklist
    if (error.message && error.message.includes('Nhóm này không tồn tại')) {
      console.log(`[SAFE SEND] Adding ${threadId} to problematic threads list`);
      if (!PROBLEMATIC_THREAD_IDS.includes(String(threadId))) {
        PROBLEMATIC_THREAD_IDS.push(String(threadId));
      }
    }
    
    return { success: false, error: error, reason: 'send_failed' };
  }
}

// Export functions
module.exports = {
  safeSendMessage,
  isThreadIdSafe,
  PROBLEMATIC_THREAD_IDS
};
