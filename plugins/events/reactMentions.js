const { Reactions } = require('zca-js');

module.exports.config = {
  name: 'reactMentions',
  version: '1.0.0',
  author: 'Cascade',
  description: 'Tự động thả 20 reaction khi bot bị tag hoặc khi có @all trong tin nhắn',
  event_type: ['message']
};

const REACTION_POOL = [
  Reactions.HEART,
  Reactions.LIKE,
  Reactions.WOW,
  Reactions.SUN,
  Reactions.HANDCLAP,
  Reactions.COOL,
  Reactions.OK,
  Reactions.ROSE,
  Reactions.KISS,
  Reactions.BOMB,
  Reactions.THINK,
  Reactions.CRY,
  Reactions.SAD,
  Reactions.CONFUSED,
  Reactions.ANGRY,
  Reactions.LAUGH
];

const REACTION_COUNT = 3;
const HEART_SEQUENCE_COUNT = 3;
const LINK_REACTION_COUNT = 3;
const MAX_CACHE_SIZE = 400;
const ALL_KEYWORDS = new Set(['@all', '@alll', '@everyone']);
const UNIQUE_ATTEMPTS = 5;
const LINK_REGEX = /(https?:\/\/\S+|www\.\S+)/i;
let lastRandomReactionKey = null;

function ensureMessageCache() {
  if (!global.__reactMentionedMessages) {
    global.__reactMentionedMessages = new Set();
  }
  return global.__reactMentionedMessages;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildReactionSequence(count = REACTION_COUNT) {
  const validPool = REACTION_POOL.filter((reaction) => reaction && reaction !== Reactions.NONE);
  if (!validPool.length || count <= 0) return [];

  for (let attempt = 0; attempt < UNIQUE_ATTEMPTS; attempt += 1) {
    const candidate = [];
    let bag = [];

    while (candidate.length < count) {
      if (!bag.length) {
        bag = shuffleArray([...validPool]);
      }
      if (!bag.length) break;
      candidate.push(bag.pop());
    }

    if (!candidate.length) break;

    const signature = `${count}:${candidate.join('|')}`;
    if (signature !== lastRandomReactionKey || attempt === UNIQUE_ATTEMPTS - 1) {
      lastRandomReactionKey = signature;
      return candidate;
    }
  }

  return [];
}

function collectMentionIds(event) {
  const ids = new Set();
  const append = (value) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (str) ids.add(str);
  };

  const mentionData = event?.data?.mentions;
  if (Array.isArray(mentionData)) {
    mentionData.forEach((m) => {
      append(m?.uid);
      append(m?.id);
      append(m?.userId);
    });
  } else if (mentionData && typeof mentionData === 'object') {
    Object.keys(mentionData).forEach((key) => {
      append(key);
      const val = mentionData[key];
      if (val && typeof val === 'object') {
        append(val.uid);
        append(val.id);
        append(val.userId);
      }
    });
  }

  if (Array.isArray(event?.mentions)) {
    event.mentions.forEach((m) => {
      append(m?.uid);
      append(m?.id);
      append(m?.userId);
    });
  }

  // Một số tin nhắn mention lưu trong propertyExt.avatarUrlTextBlockList
  const blocks = event?.data?.propertyExt?.avatarUrlTextBlockList;
  if (Array.isArray(blocks)) {
    blocks.forEach((block) => {
      append(block?.uid);
      append(block?.userId);
      append(block?.id);
    });
  }

  return ids;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function extractTTL(data = {}) {
  const direct = firstFiniteNumber(
    data?.ttl,
    data?.timeToLive,
    data?.ttlMs,
    data?.ttlTime,
    data?.ttlDuration,
    data?.clientTtl
  );
  if (direct) return direct;

  const ext = data?.propertyExt || {};
  const extDirect = firstFiniteNumber(
    ext?.ttl,
    ext?.ttlMs,
    ext?.ttlTime,
    ext?.ttlDuration,
    ext?.timeToLive,
    ext?.clientTtl,
    ext?.msgTtl
  );
  if (extDirect) return extDirect;

  const properties = ext?.properties;
  if (properties && typeof properties === 'object') {
    const propTtl = firstFiniteNumber(
      properties.ttl,
      properties.ttlMs,
      properties.ttlTime,
      properties.ttlDuration,
      properties.timeToLive
    );
    if (propTtl) return propTtl;
  }

  const ttlInfo = ext?.ttlInfo;
  if (ttlInfo && typeof ttlInfo === 'object') {
    const infoTtl = firstFiniteNumber(
      ttlInfo.ttl,
      ttlInfo.ttlMs,
      ttlInfo.ttlTime,
      ttlInfo.ttlDuration,
      ttlInfo.timeToLive
    );
    if (infoTtl) return infoTtl;
  }

  return null;
}

function containsTTLMarker(text) {
  if (typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return text.includes('⏱️') || lower.includes('tự động xóa') || lower.includes('auto delete');
}

module.exports.run = async function reactMentions({ api, event }) {
  try {
    const { threadId, type, data } = event || {};
    if (!threadId || !data?.msgId || !type) return;

    const candidateSenderIds = [
      data?.uidFrom,
      data?.senderId,
      data?.authorId,
      event?.senderID,
      event?.authorId
    ].filter((id) => id !== undefined && id !== null);

    const selfId = typeof api?.getCurrentUserID === 'function'
      ? String(api.getCurrentUserID())
      : (typeof global?.api?.getCurrentUserID === 'function' ? String(global.api.getCurrentUserID()) : null);

    const isSelfMessage = Boolean(
      selfId && candidateSenderIds.some((id) => String(id) === selfId)
    );

    const mentionIds = collectMentionIds(event);
    const rawContent = data?.content?.title ?? data?.content;
    const normalizedContent = typeof rawContent === 'string' ? rawContent.toLowerCase() : '';

    const hasAnyMention = mentionIds.size > 0;
    const hasAtSymbol = typeof rawContent === 'string' && rawContent.includes('@');
    const hasKeywordMention = Array.from(ALL_KEYWORDS).some((kw) => normalizedContent.includes(kw));
    const hasLink = typeof rawContent === 'string' && LINK_REGEX.test(rawContent);
    const ttlNumeric = extractTTL(data);
    const hasTTL = (Number.isFinite(ttlNumeric) && ttlNumeric > 0) || containsTTLMarker(rawContent);

    const sequences = [];

    if (hasTTL && (isSelfMessage || containsTTLMarker(rawContent))) {
      const ttlSequence = buildReactionSequence(HEART_SEQUENCE_COUNT);
      if (ttlSequence.length) sequences.push(ttlSequence);
    }

    if (hasLink) {
      const linkSequence = buildReactionSequence(LINK_REACTION_COUNT);
      if (linkSequence.length) sequences.push(linkSequence);
    }

    if (!isSelfMessage && (hasAnyMention || hasAtSymbol || hasKeywordMention)) {
      const mentionSequence = buildReactionSequence(REACTION_COUNT);
      if (mentionSequence.length) sequences.push(mentionSequence);
    }

    if (!sequences.length) return;

    const cache = ensureMessageCache();
    const messageKey = `${threadId}:${data.msgId}`;
    if (cache.has(messageKey)) return;
    cache.add(messageKey);
    if (cache.size > MAX_CACHE_SIZE) {
      const iterator = cache.values();
      const first = iterator.next();
      if (!first.done) cache.delete(first.value);
    }

    const target = {
      data: { msgId: data.msgId, cliMsgId: data.cliMsgId },
      threadId,
      type
    };

    try {
      await api.addReaction(Reactions.NONE, target);
    } catch {}

    for (const sequence of sequences) {
      for (const reaction of sequence) {
        try {
          await api.addReaction(reaction, target);
        } catch (error) {
          console.warn('[reactMentions] addReaction error:', reaction, error?.message || error);
        }
      }
    }
  } catch (err) {
    console.warn('[reactMentions] Handler error:', err?.message || err);
  }
};
