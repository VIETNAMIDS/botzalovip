'use strict';

module.exports.config = {
  event_type: ['message'],
  name: 'xepgoReply',
  version: '1.0.0',
  author: 'Cascade',
  description: 'Cho phép reply "1 A1" vào ảnh game Xếp Gỗ để đặt miếng',
  dependencies: {}
};

function ensureStores() {
  if (!(global.xepgoBoardMessages instanceof Map)) {
    global.xepgoBoardMessages = new Map();
  }
}

function getGameRecordFromReply(event) {
  const quote = event?.data?.quote;
  if (!quote || !quote.globalMsgId) return null;
  ensureStores();
  const record = global.xepgoBoardMessages.get(String(quote.globalMsgId));
  if (!record) return null;
  return record;
}

function getActiveRecordForThread(threadId, senderId) {
  ensureStores();
  const now = Date.now();
  let latest = null;

  for (const [msgId, record] of global.xepgoBoardMessages.entries()) {
    if (!record || record.threadId !== threadId) continue;

    if (record.expiresAt && record.expiresAt < now) {
      global.xepgoBoardMessages.delete(msgId);
      continue;
    }

    const allowed = Array.isArray(record.allowedPlayers)
      ? record.allowedPlayers.map(String)
      : [];

    if (allowed.length > 0 && !allowed.includes(String(senderId))) {
      continue;
    }

    latest = record;
  }

  return latest;
}

function normalizePlaceText(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  const normalized = text
    .replace(/[,;:_|]+/g, ' ')
    .replace(/\s*[-]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Accept: 1 55 (numeric cell)
  let m = normalized.match(/^(\d)\s+(\d{1,3})$/i);
  if (m) return { piece: m[1], coord: String(m[2]) };

  // Accept: place 1 55 / đặt 1 55
  m = normalized.match(/^(?:place|dat|đặt)\s+(\d)\s+(\d{1,3})$/i);
  if (m) return { piece: m[1], coord: String(m[2]) };

  // Accept: xepgo place 1 55
  m = normalized.match(/^xepgo\s+(?:place|dat|đặt)\s+(\d)\s+(\d{1,3})$/i);
  if (m) return { piece: m[1], coord: String(m[2]) };

  // Accept: 1A1 / 1 a1
  m = normalized.match(/^(\d)\s*([A-J])\s*(10|[1-9])$/i);
  if (m) return { piece: m[1], coord: `${m[2]}${m[3]}` };

  // Accept: 1 A1
  m = normalized.match(/^(\d)\s+([A-J]\s*(?:10|[1-9]))$/i);
  if (m) return { piece: m[1], coord: m[2].replace(/\s+/g, '') };

  // Accept: place 1 A1 / đặt 1 A1
  m = normalized.match(/^(?:place|dat|đặt)\s+(\d)\s+([A-J]\s*(?:10|[1-9]))$/i);
  if (m) return { piece: m[1], coord: m[2].replace(/\s+/g, '') };

  // Accept: xepgo place 1 A1
  m = normalized.match(/^xepgo\s+(?:place|dat|đặt)\s+(\d)\s+([A-J]\s*(?:10|[1-9]))$/i);
  if (m) return { piece: m[1], coord: m[2].replace(/\s+/g, '') };

  return null;
}

module.exports.run = async ({ api, event }) => {
  try {
    const { threadId } = event;
    const data = event?.data;
    if (!threadId || !data) return;

    const rawContent = data?.content?.title ?? data?.content;
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';

    const place = normalizePlaceText(content);
    if (!place) return;

    const senderId = data?.uidFrom || event?.authorId || event?.senderID;
    if (!senderId) return;

    let record = getGameRecordFromReply(event);
    if (!record) {
      record = getActiveRecordForThread(threadId, senderId);
    }
    if (!record) return;

    const allowedPlayers = Array.isArray(record.allowedPlayers)
      ? record.allowedPlayers.map(String)
      : [];

    if (allowedPlayers.length > 0 && !allowedPlayers.includes(String(senderId))) {
      return;
    }

    const cmd = global.client?.commands?.get('xepgo');
    if (!cmd || typeof cmd.run !== 'function') return;

    await cmd.run({
      api,
      event,
      args: ['place', String(place.piece), String(place.coord)]
    });
  } catch (error) {
    console.error('[xepgoReply] Lỗi xử lý sự kiện:', error?.message || error);
  }
};
