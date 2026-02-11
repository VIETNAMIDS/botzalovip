const { sendTemplateVideo } = require('../commands/capcut');

module.exports.config = {
  event_type: ["message"],
  name: "capcutReply",
  version: "1.1.0",
  author: "Cascade",
  description: "Bắt reply hoặc tin nhắn số để chọn template CapCut",
  dependencies: {}
};

function parseIndex(text) {
  const n = parseInt(String(text).trim(), 10);
  return Number.isFinite(n) ? n - 1 : NaN;
}

function ensureSelectionStores() {
  if (!(global.capcutSelections instanceof Map)) {
    global.capcutSelections = new Map();
  }
  if (!(global.capcutUserSelections instanceof Map)) {
    global.capcutUserSelections = new Map();
  }
}

function getSelectionBySender(senderId, threadId) {
  ensureSelectionStores();
  if (!senderId) return null;
  const record = global.capcutUserSelections.get(String(senderId));
  if (!record) return null;
  if (threadId && record.threadId && record.threadId !== threadId) return null;
  return record;
}

function deleteSelectionRecord(record) {
  ensureSelectionStores();
  if (!record) return;
  const aliases = Array.isArray(record.keyAliases) ? record.keyAliases : [];
  aliases.forEach((key) => global.capcutSelections.delete(String(key)));
  if (record.senderId) {
    const existing = global.capcutUserSelections.get(String(record.senderId));
    if (existing && existing === record) {
      global.capcutUserSelections.delete(String(record.senderId));
    }
  }
}

async function handleSelection(api, event, selection, index) {
  const { threadId, type, data, messageID } = event;
  if (!selection || !Array.isArray(selection.templates) || selection.templates.length === 0) {
    return true;
  }

  if (!Number.isFinite(index) || index < 0 || index >= selection.templates.length) {
    await api.sendMessage('⚠️ Lựa chọn không hợp lệ. Vui lòng nhập số trong danh sách.', threadId, type);
    return true;
  }

  const template = selection.templates[index];
  deleteSelectionRecord(selection);

  try {
    if (messageID && typeof api.setMessageReaction === 'function') {
      try {
        await api.setMessageReaction('💗', messageID, threadId, true);
      } catch (reactionError) {
        console.warn('[CAPCUT] Không thể thả tim:', reactionError?.message || reactionError);
      }
    }

    const senderName = selection.senderName || data?.dName || 'Người dùng';
    await sendTemplateVideo(api, { threadId, type, senderName }, selection, template);
  } catch (error) {
    console.error('[CAPCUT] Lỗi gửi template qua sự kiện:', error?.message || error);
    await api.sendMessage(`❌ Không thể gửi template: ${error?.message || error}`, threadId, type);
  }

  return true;
}

module.exports.run = async ({ api, event }) => {
  const { data, threadId, type } = event;
  ensureSelectionStores();
  if (!global.capcutSelections || typeof global.capcutSelections.size !== 'number') return;

  try {
    const senderId = data?.uidFrom || event.authorId;
    const content = String(data?.content || '').trim();

    const quote = data?.quote;
    if (quote && quote.globalMsgId && global.capcutSelections.has(String(quote.globalMsgId))) {
      const key = String(quote.globalMsgId);
      const selection = global.capcutSelections.get(key);
      if (!selection || String(senderId) !== String(selection.senderId)) return true;

      const index = parseIndex(content);
      return handleSelection(api, event, selection, index);
    }

    if (/^\d+$/.test(content)) {
      const selection = getSelectionBySender(senderId, threadId);
      if (!selection) return;

      const index = parseIndex(content);
      return handleSelection(api, event, selection, index);
    }
  } catch (error) {
    console.error('[CAPCUT] Lỗi xử lý sự kiện CapCut:', error?.message || error);
  }
};
