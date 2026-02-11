const { ThreadType } = require('zca-js');

const DEFAULT_COUNT = 5;
const MAX_COUNT = 100;
const DEFAULT_DELAY = 250;
const MIN_DELAY = 0;
const UNSEND_DELAY_MS = 40;

module.exports.config = {
  name: 'spamhidden',
  version: '1.0.0',
  role: 1,
  author: 'Cascade',
  description: 'Spam tin nhắn nhưng lập tức thu hồi để không hiển thị trong khung chat',
  category: 'Tiện ích',
  usage: 'spamhidden <số_lần> [delay_ms] <nội dung>',
  cooldowns: 5,
  aliases: ['spamghost', 'ghostspam']
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, authorId } = event;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') {
    return;
  }

  if (!Array.isArray(args) || args.length === 0) {
    return api.sendMessage('⚙️ Cú pháp: spamhidden <số_lần> [delay_ms] <nội_dung>', threadId, type);
  }

  let count = DEFAULT_COUNT;
  if (!Number.isNaN(Number(args[0]))) {
    count = Math.max(1, Math.min(MAX_COUNT, parseInt(args.shift(), 10) || DEFAULT_COUNT));
  }

  let delayMs = DEFAULT_DELAY;
  if (args.length && !Number.isNaN(Number(args[0]))) {
    delayMs = Math.max(MIN_DELAY, parseInt(args.shift(), 10) || DEFAULT_DELAY);
  }

  const message = args.join(' ').trim();
  if (!message.length) {
    return api.sendMessage('❌ Bạn cần nhập nội dung để spam.', threadId, type);
  }

  const stats = {
    sent: 0,
    unsent: 0,
    failed: 0
  };

  for (let i = 0; i < count; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await api.sendMessage({ body: message }, threadId, type);
      stats.sent += 1;
      if (response?.msgId) {
        // eslint-disable-next-line no-await-in-loop
        await attemptUnsendWithRetry(api, response.msgId, stats);
      }
    } catch (error) {
      stats.failed += 1;
    }

    if (delayMs > 0 && i < count - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(delayMs);
    }
  }

  const summaryLines = [
    `👻 Đã xử lý spam ẩn ${count} lần.`,
    `✅ Gửi: ${stats.sent}`,
    `🗑️ Thu hồi: ${stats.unsent}`,
    stats.failed ? `⚠️ Thất bại: ${stats.failed}` : null,
    delayMs ? `⏱ Delay: ${delayMs}ms` : '⚡ Không delay'
  ].filter(Boolean);

  if (authorId && authorId !== threadId) {
    try {
      await api.sendMessage(summaryLines.join('\n'), authorId, ThreadType.Private);
    } catch (error) {
      console.warn('[spamhidden] Không gửi được summary riêng tư:', error?.message || error);
    }
  }
};
async function attemptUnsendWithRetry(api, msgId, stats, retries = 3) {
  if (!msgId || typeof api.unsendMessage !== 'function') {
    return false;
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(UNSEND_DELAY_MS * attempt);
    }

    try {
      await api.unsendMessage(msgId);
      if (stats) {
        stats.unsent += 1;
      }
      return true;
    } catch (error) {
      const reason = (error?.message || '').toLowerCase();
      const transient = reason.includes('not found') || reason.includes('cannot find') || reason.includes('chưa gửi');
      if (!transient && attempt === retries) {
        if (stats) {
          stats.failed += 1;
        }
        console.error('[spamhidden] unsendMessage error:', error?.message || error);
        return false;
      }
      if (!transient && attempt < retries) {
        // Nếu lỗi không phải tạm thời, không cần thử lại nhiều lần
        if (stats && attempt === retries) {
          stats.failed += 1;
        }
        console.error('[spamhidden] unsendMessage non-transient error:', error?.message || error);
        return false;
      }
    }
  }

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
