'use strict';

module.exports.config = {
  event_type: ['message'],
  name: 'caroReply',
  version: '1.0.0',
  author: 'Cascade',
  description: 'Cho phép reply số vào ảnh bàn cờ để đánh cờ Caro',
  dependencies: {}
};

function ensureStores() {
  if (!(global.caroBoardMessages instanceof Map)) {
    global.caroBoardMessages = new Map();
  }
}

function getGameRecordFromReply(event) {
  const quote = event?.data?.quote;
  if (!quote || !quote.globalMsgId) return null;
  ensureStores();
  const record = global.caroBoardMessages.get(String(quote.globalMsgId));
  if (!record) return null;
  return record;
}

function getActiveRecordForThread(threadId, senderId) {
  ensureStores();
  const now = Date.now();
  let latestRecord = null;

  for (const [msgId, record] of global.caroBoardMessages.entries()) {
    if (!record || record.threadId !== threadId) continue;

    if (record.expiresAt && record.expiresAt < now) {
      global.caroBoardMessages.delete(msgId);
      continue;
    }

    const allowed = Array.isArray(record.allowedPlayers)
      ? record.allowedPlayers.map(String)
      : [];

    if (allowed.length > 0 && !allowed.includes(String(senderId))) {
      continue;
    }

    latestRecord = record;
  }

  return latestRecord;
}

module.exports.run = async ({ api, event }) => {
  try {
    const { data, threadId } = event;
    if (!data) return;

    const content = String(data?.content || '').trim();
    if (!/^\d+$/.test(content)) return;

    const senderId = data?.uidFrom || event.authorId;
    if (!senderId) return;

    let record = getGameRecordFromReply(event);
    if (!record && threadId) {
      record = getActiveRecordForThread(threadId, senderId);
    }
    if (!record) return;

    const allowedPlayers = Array.isArray(record.allowedPlayers)
      ? record.allowedPlayers.map(String)
      : [];

    if (allowedPlayers.length > 0 && !allowedPlayers.includes(String(senderId))) {
      return;
    }

    const position = parseInt(content, 10);
    if (!Number.isFinite(position)) return;

    const command = global.client?.commands?.get('caro');
    if (!command || typeof command.run !== 'function') {
      return;
    }

    await command.run({
      api,
      event,
      args: ['move', String(position)]
    });
  } catch (error) {
    console.error('[caroReply] Lỗi xử lý sự kiện:', error?.message || error);
  }
};
