'use strict';

module.exports.config = {
  event_type: ['message'],
  name: 'doantuReply',
  version: '1.0.0',
  author: 'Cascade',
  description: 'Bắt reply vào ảnh game doantu và chấm đúng/sai',
  dependencies: {}
};

const WRONG_REPLY_COOLDOWN_MS = 6000;

function ensureStore() {
  if (!(global.doantuMessages instanceof Map)) {
    global.doantuMessages = new Map();
  }
  if (!(global.doantuWrongCooldown instanceof Map)) {
    global.doantuWrongCooldown = new Map();
  }
}

function normalizeText(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function isCorrectGuess(guessNorm, answerNorm) {
  const g = String(guessNorm || '').trim();
  const a = String(answerNorm || '').trim();
  if (!g || !a) return false;
  if (g === a) return true;

  // Ignore spaces for matching (e.g., "vietnam" vs "viet nam")
  const gCompact = g.replace(/\s+/g, '');
  const aCompact = a.replace(/\s+/g, '');
  if (gCompact === aCompact) return true;

  // Allow phrases containing answer
  if (g.includes(a)) return true;
  if (gCompact.includes(aCompact)) return true;

  return false;
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
    quote?.data?.cliMsgId,
  ]
    .filter(Boolean)
    .map(String);

  ensureStore();
  for (const id of ids) {
    const record = global.doantuMessages.get(id);
    if (record) return record;
  }
  return null;
}

function getLatestActiveRecordForThread(threadId) {
  ensureStore();
  const now = Date.now();
  let latest = null;
  for (const [, record] of global.doantuMessages.entries()) {
    if (!record) continue;
    if (String(record.threadId) !== String(threadId)) continue;
    if (record.expiresAt && record.expiresAt < now) continue;
    if (!latest || (record.createdAt || 0) > (latest.createdAt || 0)) {
      latest = record;
    }
  }
  return latest;
}

module.exports.run = async ({ api, event }) => {
  try {
    const threadId = event?.threadId;
    const type = event?.type;
    const data = event?.data;
    if (!threadId || typeof type === 'undefined' || !data) return;

    const contentRaw = data?.content?.title ?? data?.content;
    const content = typeof contentRaw === 'string' ? contentRaw.trim() : '';
    if (!content) return;

    let record = getRecordFromReply(event);
    if (!record) {
      record = getLatestActiveRecordForThread(threadId);
    }
    if (!record) return;

    if (String(record.threadId) !== String(threadId)) return;

    ensureStore();
    const now = Date.now();
    if (record.expiresAt && record.expiresAt < now) {
      // cleanup expired
      for (const [k, v] of global.doantuMessages.entries()) {
        if (v === record) global.doantuMessages.delete(k);
      }
      await api.sendMessage({ msg: '⏱️ Câu hỏi đã hết hạn. Gõ doantu để chơi lại!', ttl: 20000 }, threadId, type);
      return;
    }

    const guessNorm = normalizeText(content);
    if (!guessNorm) return;

    const senderId = data?.uidFrom || event?.authorId || event?.senderID;
    const cooldownKey = `${String(threadId)}:${String(senderId || 'unknown')}`;

    if (isCorrectGuess(guessNorm, record.answerNorm)) {
      // cleanup this record
      for (const [k, v] of global.doantuMessages.entries()) {
        if (v === record) global.doantuMessages.delete(k);
      }

      await api.sendMessage({
        msg: `🎉 Chính xác! Đáp án là: ${record.answer}\n🧩 Gõ doantu để chơi tiếp!`,
        ttl: 60000
      }, threadId, type);
      return;
    }

    // wrong answer: keep record for further tries
    ensureStore();
    const now2 = Date.now();
    const lastWrong = global.doantuWrongCooldown.get(cooldownKey) || 0;
    if (now2 - lastWrong < WRONG_REPLY_COOLDOWN_MS) {
      return;
    }
    global.doantuWrongCooldown.set(cooldownKey, now2);
    await api.sendMessage({ msg: '❌ Sai rồi! Reply đoán lại nha.', ttl: 15000 }, threadId, type);
  } catch (error) {
    console.error('[doantuReply] Lỗi xử lý sự kiện:', error?.message || error);
  }
};
