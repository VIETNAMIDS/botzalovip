const safe = require('../commands/safe.js');

module.exports.config = {
  event_type: ["message"],
  name: "safeGuard",
  version: "1.0.0",
  author: "Cascade",
  description: "Kiểm duyệt tin nhắn theo Safe Mode (link, từ/cụm từ cấm, ảnh nhạy cảm)",
  dependencies: {}
};

module.exports.run = async ({ event, eventType, api }) => {
  if (eventType !== 'message') return;
  try {
    const allowed = Array.isArray(global?.config?.allowed_threads) ? global.config.allowed_threads.map(String) : [];
    if (allowed.length > 0) {
      const tid = String(event?.threadId || '');
      if (!allowed.includes(tid)) return; // Không hoạt động ở nhóm không nằm trong whitelist
    }
  } catch {}
  try {
    // Ưu tiên phản hồi lịch sự nếu có chửi/spam gọi bot
    await safe.respondAbuse({ api, event });
    // Sau đó mới kiểm duyệt/xóa nếu là vi phạm Safe Mode
    const handled = await safe.checkSafeMode({ api, event });
    if (handled) return;
  } catch (e) {
    try { console.warn('[safeGuard] error:', e?.message); } catch {}
  }
};
