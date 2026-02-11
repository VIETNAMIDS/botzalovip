'use strict';

module.exports.config = {
  event_type: ['message'],
  name: 'chessReply',
  version: '1.0.0',
  author: 'Cascade',
  description: 'Cho phép reply nước đi (e2e4) vào ảnh bàn cờ để đánh cờ vua',
  dependencies: {}
};

function ensureStores() {
  if (!(global.chessBoardMessages instanceof Map)) {
    global.chessBoardMessages = new Map();
  }
}

function getRecordFromReply(event) {
  const quote = event?.data?.quote;
  if (!quote) return null;

  const ids = [
    quote.globalMsgId,
    quote.msgId,
    quote.messageId,
    quote.cliMsgId,
    quote?.data?.msgId,
    quote?.data?.cliMsgId
  ]
    .filter(Boolean)
    .map(String);

  ensureStores();
  for (const id of ids) {
    const record = global.chessBoardMessages.get(id);
    if (record) return record;
  }
  return null;
}

function getActiveRecordForThread(threadId) {
  ensureStores();
  const now = Date.now();
  let latest = null;
  for (const [msgId, record] of global.chessBoardMessages.entries()) {
    if (!record || record.threadId !== threadId) continue;
    if (record.expiresAt && record.expiresAt < now) {
      global.chessBoardMessages.delete(msgId);
      continue;
    }
    latest = record;
  }
  return latest;
}

function normalizeMoveText(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  // Accept: e2e4, e7e8q
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(text)) {
    return text.toLowerCase();
  }

  // Accept: move e2e4
  const m1 = text.match(/^move\s+([a-h][1-8][a-h][1-8][qrbn]?)$/i);
  if (m1) return m1[1].toLowerCase();

  // Accept: chess move e2e4
  const m2 = text.match(/^chess\s+move\s+([a-h][1-8][a-h][1-8][qrbn]?)$/i);
  if (m2) return m2[1].toLowerCase();

  return null;
}

module.exports.run = async ({ api, event }) => {
  try {
    const { threadId } = event;
    const data = event?.data;
    if (!threadId || !data) return;

    const rawContent = data?.content?.title ?? data?.content;
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';

    const move = normalizeMoveText(content);
    if (!move) return;

    const senderId = data?.uidFrom || event?.authorId || event?.senderID;
    if (!senderId) return;

    let record = getRecordFromReply(event);
    if (!record) {
      record = getActiveRecordForThread(threadId);
    }
    if (!record) return;

    const game = global.chessGames instanceof Map ? global.chessGames.get(threadId) : null;
    if (!game || game.status !== 'playing' || !game.chess) return;

    const isParticipant = game.vsBot
      ? String(senderId) === String(game.player)
      : String(senderId) === String(game.white) || String(senderId) === String(game.black);

    if (!isParticipant) return;

    const cmd = global.client?.commands?.get('chess');
    if (!cmd || typeof cmd.run !== 'function') return;

    await cmd.run({
      api,
      event,
      args: ['move', move]
    });
  } catch (error) {
    console.error('[chessReply] Lỗi xử lý sự kiện:', error?.message || error);
  }
};
