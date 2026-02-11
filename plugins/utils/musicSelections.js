const TTL_DEFAULT = 60 * 1000;
const CLEAN_INTERVAL = 15 * 1000;

const storeByMessage = new Map(); // msgId -> record
const storeByUser = new Map(); // `${threadId}:${senderId}` -> record

function makeUserKey(threadId, senderId) {
  return `${threadId || ''}:${senderId || ''}`;
}

function normalizeMessageIds(ids) {
  return Array.from(new Set(ids.filter(Boolean).map(String)));
}

function cleanupExpired() {
  const now = Date.now();
  for (const record of Array.from(storeByUser.values())) {
    if (!record || record.expiresAt <= now) {
      removeRecord(record);
    }
  }
}

function removeRecord(record) {
  if (!record) return;
  if (Array.isArray(record.messageIds)) {
    for (const id of record.messageIds) {
      if (storeByMessage.get(id) === record) {
        storeByMessage.delete(id);
      }
    }
  }

  const key = makeUserKey(record.threadId, record.senderId);
  if (storeByUser.get(key) === record) {
    storeByUser.delete(key);
  }
}

function registerSelection(options = {}) {
  const {
    messageIds = [],
    threadId,
    senderId,
    platform,
    items = [],
    ttl = TTL_DEFAULT,
    onSelect,
    metadata = {},
    autoRemove = true,
  } = options;

  if (!threadId || !senderId || typeof onSelect !== 'function') {
    throw new Error('registerSelection: missing threadId, senderId hoặc onSelect');
  }

  const normalizedIds = normalizeMessageIds(messageIds);
  if (!normalizedIds.length) {
    throw new Error('registerSelection: messageIds rỗng');
  }

  const record = {
    messageIds: normalizedIds,
    threadId,
    senderId: String(senderId),
    platform,
    items,
    metadata: { ...metadata },
    onSelect,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttl,
    autoRemove,
  };

  const userKey = makeUserKey(threadId, senderId);
  const previous = storeByUser.get(userKey);
  if (previous) {
    removeRecord(previous);
  }

  storeByUser.set(userKey, record);
  for (const id of normalizedIds) {
    storeByMessage.set(id, record);
  }

  return record;
}

function getRecordFromReply(event) {
  const reply = event?.messageReply || event?.data?.quote;
  if (!reply) return null;
  const ids = normalizeMessageIds([
    reply?.globalMsgId,
    reply?.msgId,
    reply?.messageId,
    reply?.msgID,
    reply?.cliMsgId,
    reply?.data?.msgId,
    reply?.data?.cliMsgId,
  ]);

  for (const id of ids) {
    const record = storeByMessage.get(id);
    if (record) {
      return record;
    }
  }
  return null;
}

function parseSelectionContent(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/);
  const index = Number.parseInt(tokens[0], 10);
  if (!Number.isFinite(index)) {
    return null;
  }
  const modifiers = tokens.slice(1).map((token) => token.toLowerCase());
  return { index, modifiers, original: trimmed };
}

async function handleSelection(record, context) {
  if (!record || typeof record.onSelect !== 'function') return false;
  try {
    const result = await record.onSelect(context);
    return result !== false;
  } catch (error) {
    console.error('[musicSelections] Lỗi xử lý lựa chọn:', error);
    return false;
  }
}

async function handleReplySelection(api, event, expectedPlatform = null) {
  const record = getRecordFromReply(event);
  if (!record) return false;

  if (record.__processing) {
    return true;
  }
  record.__processing = true;

  if (record.threadId && record.threadId !== event.threadId) {
    record.__processing = false;
    return false;
  }

  if (expectedPlatform && record.platform && record.platform !== expectedPlatform) {
    record.__processing = false;
    return false;
  }

  const senderId = String(event?.data?.uidFrom || event?.authorId || event?.senderID);
  if (senderId && senderId !== record.senderId) {
    if (api?.sendMessage) {
      try {
        await api.sendMessage({
          msg: '⚠️ Đây không phải là danh sách bạn đã yêu cầu.',
          ttl: 20000,
        }, event.threadId, event.type);
      } catch (err) {
        console.warn('[musicSelections] Không gửi được cảnh báo quyền chọn:', err?.message || err);
      }
    }
    return true;
  }

  const rawContent = event?.data?.content?.title ?? event?.data?.content;
  const selection = parseSelectionContent(typeof rawContent === 'string' ? rawContent : '');
  if (!selection) {
    if (api?.sendMessage) {
      try {
        await api.sendMessage({
          msg: '❌ Vui lòng trả lời bằng số thứ tự bài hát.',
          ttl: 20000,
        }, event.threadId, event.type);
      } catch {}
    }
    return true;
  }

  const context = {
    api,
    event,
    record,
    index: selection.index,
    modifiers: selection.modifiers,
    selectionText: selection.original,
  };

  try {
    // Đánh dấu đã xử lý qua reply để tránh triggerSelectionByUser chạy lại
    record.__handledByReply = true;
    const handled = await handleSelection(record, context);
    if (handled && record.autoRemove !== false) {
      removeRecord(record);
    }
    return handled;
  } finally {
    record.__processing = false;
  }
}

async function triggerSelectionByUser(threadId, senderId, selectionText, api = null, event = null, expectedPlatform = null) {
  const key = makeUserKey(threadId, senderId);
  const record = storeByUser.get(key);
  if (!record) return false;
  if (expectedPlatform && record.platform && record.platform !== expectedPlatform) {
    return false;
  }
  if (record.__processing) {
    return true;
  }
  // Nếu đã xử lý qua reply rồi thì bỏ qua
  if (record.__handledByReply) {
    return true;
  }
  record.__processing = true;
  const parsed = parseSelectionContent(selectionText);
  if (!parsed) return false;
  const context = {
    record,
    index: parsed.index,
    modifiers: parsed.modifiers,
    selectionText: parsed.original,
    api,
    event,
  };
  try {
    const handled = await handleSelection(record, context);
    if (handled && record.autoRemove !== false) {
      removeRecord(record);
    }
    return handled;
  } finally {
    record.__processing = false;
  }
}

setInterval(cleanupExpired, CLEAN_INTERVAL).unref?.();

module.exports = {
  registerSelection,
  handleReplySelection,
  triggerSelectionByUser,
  removeRecord,
};
