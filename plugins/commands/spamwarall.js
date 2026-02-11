const fs = require('fs');
const path = require('path');
const { ThreadType } = require('zca-js');

const NOIDUNG_PATH = path.join(__dirname, 'noidung.txt');
const DEFAULT_COUNT = 15;
const MAX_COUNT = 60;
const DEFAULT_DELAY = 2000;
const MIN_DELAY = 300;
const DEFAULT_CARD_TTL = 30000;
const DEFAULT_MESSAGE_TTL = 10000;
const SUPPRESS_RENAME_MS = 7000;

const DEFAULT_POLL_TEMPLATES = [
  { question: 'Bạn chọn phe nào?', options: ['Team Cay', 'Team Im Lặng', 'Team Out Nhóm'] },
  { question: 'Vote mức độ cay?', options: ['Không cay', 'Cay nhẹ', 'Cay tới nóc'] },
  { question: 'Ai đáng bị spam tiếp?', options: ['Đối thủ 1', 'Đối thủ 2', 'Đối thủ 3'] }
];

const renameMethodNames = [
  'changeGroupName',
  'updateGroupSettings',
  'setThreadName',
  'setGroupName',
  'changeThreadName',
  'setTitle',
  'renameGroup'
];

module.exports.config = {
  name: 'spamwar',
  version: '1.1.0',
  role: 1,
  author: 'Cascade',
  description: 'Spam tổng hợp (random spamname/spamcard/cay/spampoll)',
  category: 'Quản lý nhóm',
  usage: 'spamwar all [số_lần] [delay_ms] @target',
  cooldowns: 8
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event || {};
  if (!threadId) return;

  if (type !== ThreadType.Group) {
    return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

function loadPollContent() {
  try {
    if (!fs.existsSync(NOIDUNG_PATH)) {
      return DEFAULT_POLL_TEMPLATES.slice();
    }
    const parsed = fs.readFileSync(NOIDUNG_PATH, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(parsePollLine)
      .filter(Boolean);
    return parsed.length ? parsed : DEFAULT_POLL_TEMPLATES.slice();
  } catch (error) {
    console.log('[spamwar] load poll content error:', error.message || error);
    return DEFAULT_POLL_TEMPLATES.slice();
  }
}

function parsePollLine(line) {
  const separator = line.includes('|') ? '|' : line.includes(',') ? ',' : null;
  if (!separator) return null;
  const parts = line.split(separator).map(part => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  return {
    question: parts[0],
    options: parts.slice(1, Math.min(parts.length, 21))
  };
}

  const mode = (args[0] || '').toLowerCase();
  if (mode !== 'all') {
    return api.sendMessage('⚔️ Dùng: spamwar all [số_lần] [delay_ms] @target', threadId, type);
  }

  args.shift();

  let count = DEFAULT_COUNT;
  if (args.length && !Number.isNaN(Number(args[0]))) {
    count = Math.max(1, Math.min(MAX_COUNT, parseInt(args.shift(), 10) || DEFAULT_COUNT));
  }

  let delayMs = DEFAULT_DELAY;
  if (args.length && !Number.isNaN(Number(args[0]))) {
    delayMs = Math.max(MIN_DELAY, parseInt(args.shift(), 10) || DEFAULT_DELAY);
  }

  const mentionTargets = await collectMentions(api, event);
  const hasMentionTargets = mentionTargets.length > 0;

  if (!hasMentionTargets) {
    await api.sendMessage('⚠️ Không thấy target được tag. Lệnh vẫn chạy nhưng chỉ đổi tên nhóm.', threadId, type);
  }

  const noidungList = loadNoiDung();
  const namePool = noidungList.length ? noidungList : ['BONZ WAR MODE'];
  const cayPool = noidungList.length ? noidungList : ['Cay chưa?'];
  const cardPool = noidungList.length ? noidungList : ['Spam card'];

  const pollPool = loadPollContent();
  const pollAvailable = pollPool.length > 0 && typeof api.createPoll === 'function';

  const actions = hasMentionTargets
    ? ['spamname', 'spamcard', 'cay', ...(pollAvailable ? ['spampoll'] : [])]
    : ['spamname', ...(pollAvailable ? ['spampoll'] : [])];

  const stats = { spamname: 0, spamcard: 0, cay: 0, spampoll: 0, failed: 0 };

  await api.sendMessage(
    `⚔️ BẮT ĐẦU SPAMWAR ALL (${count} lần, delay ${delayMs}ms)`,
    threadId,
    type
  );

  for (let i = 0; i < count; i += 1) {
    const action = pickRandom(actions);
    try {
      if (action === 'spamname') {
        const newName = pickRandom(namePool).slice(0, 60);
        await renameGroup(api, threadId, newName);
        markSpamRename(threadId);
        stats.spamname += 1;
      } else if (action === 'spamcard') {
        const payloadTarget = pickRandom(mentionTargets);
        if (payloadTarget) {
          const payload = {
            userId: payloadTarget.uid,
            ttl: DEFAULT_CARD_TTL,
            phoneNumber: pickRandom(cardPool).slice(0, 50)
          };
          await api.sendCard(payload, threadId, type);
          stats.spamcard += 1;
        } else {
          stats.failed += 1;
        }
      } else if (action === 'spampoll') {
        const pollData = pickRandom(pollPool);
        if (pollData) {
          try {
            await api.createPoll(pollData, threadId);
            stats.spampoll += 1;
          } catch (error) {
            stats.failed += 1;
            console.log('[spamwar] spampoll error:', error?.message || error);
          }
        } else {
          stats.failed += 1;
        }
      } else if (action === 'cay') {
        const cayTarget = pickRandom(mentionTargets);
        if (cayTarget) {
          const msgText = `${cayTarget.tag} ${pickRandom(cayPool)}`.slice(0, 500);
          await api.sendMessage({
            msg: msgText,
            mentions: buildMentions(msgText, cayTarget.tag, cayTarget.uid),
            ttl: DEFAULT_MESSAGE_TTL
          }, threadId, type);
          stats.cay += 1;
        } else {
          stats.failed += 1;
        }
      }
    } catch (error) {
      stats.failed += 1;
      console.log('[spamwar] action error:', error.message || error);
    }

    if (i < count - 1) {
      await sleep(delayMs);
    }
  }

  const summary = [
    '✅ SPAMWAR HOÀN TẤT',
    `• spamname: ${stats.spamname}`,
    `• spamcard: ${stats.spamcard}`,
    `• cay: ${stats.cay}`,
    pollAvailable ? `• spampoll: ${stats.spampoll}` : null,
    stats.failed ? `• Lỗi: ${stats.failed}` : null
  ].filter(Boolean).join('\n');

  return api.sendMessage(summary, threadId, type);
};

async function collectMentions(api, event) {
  const sources = [
    event?.data?.mentions,
    event?.mentions,
    event?.messageReply?.mentions
  ].filter(Array.isArray);

  const unique = new Map();

  for (const list of sources) {
    for (const item of list) {
      const uid = item?.uid || item?.id;
      if (!uid) continue;
      if (unique.has(uid)) continue;

      let tag = formatTag(item?.tag || item?.dName);
      if (!tag) {
        const displayName = await resolveDisplayName(api, uid);
        tag = `@${displayName}`;
      }

      unique.set(String(uid), {
        uid: String(uid),
        tag
      });
    }
  }

  return Array.from(unique.values());
}

function formatTag(raw) {
  if (!raw) return null;
  return raw.startsWith('@') ? raw : `@${raw}`;
}

function loadNoiDung() {
  try {
    if (!fs.existsSync(NOIDUNG_PATH)) {
      return [];
    }
    return fs.readFileSync(NOIDUNG_PATH, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.log('[spamwar] load noidung error:', error.message || error);
    return [];
  }
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

async function resolveDisplayName(api, uid) {
  try {
    const info = await api.getUserInfo?.(uid) || await api.getUserInfo?.([uid]);
    if (Array.isArray(info)) {
      const first = info[0];
      if (first?.changed_profiles?.[uid]?.displayName) return first.changed_profiles[uid].displayName;
      if (first?.name) return first.name;
    } else if (info) {
      if (info.changed_profiles?.[uid]?.displayName) return info.changed_profiles[uid].displayName;
      if (info[uid]?.name) return info[uid].name;
      if (info.name) return info.name;
    }
  } catch {}
  return String(uid);
}

async function renameGroup(api, threadId, newName) {
  let lastError = null;
  for (const method of renameMethodNames) {
    if (typeof api[method] !== 'function') continue;
    try {
      if (method === 'changeGroupName') {
        try { await api.changeGroupName(newName, threadId); return true; } catch {}
        try { await api.changeGroupName(String(newName), String(threadId)); return true; } catch {}
        try { await api.changeGroupName({ threadId, name: newName }); return true; } catch {}
        await api.changeGroupName({ groupId: threadId, name: newName });
        return true;
      }

      if (method === 'updateGroupSettings') {
        const bodies = [
          { name: newName },
          { groupName: newName },
          { title: newName }
        ];
        for (const body of bodies) {
          try { await api.updateGroupSettings(threadId, body); return true; } catch {}
          try { await api.updateGroupSettings(String(threadId), body); return true; } catch {}
          await api.updateGroupSettings({ groupId: threadId, ...body });
          return true;
        }
        continue;
      }

      if (method === 'setTitle' || method === 'renameGroup') {
        await api[method](threadId, newName);
        return true;
      }

      await api[method](newName, threadId);
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('Không thể đổi tên nhóm');
}

function markSpamRename(threadId) {
  if (!threadId) return;
  if (!global.__spamnameRenameStore) {
    global.__spamnameRenameStore = new Map();
  }
  global.__spamnameRenameStore.set(String(threadId), Date.now());
  setTimeout(() => {
    const store = global.__spamnameRenameStore;
    if (!store) return;
    const last = store.get(String(threadId));
    if (last && Date.now() - last >= SUPPRESS_RENAME_MS) {
      store.delete(String(threadId));
    }
  }, SUPPRESS_RENAME_MS + 1000).unref?.();
}

function buildMentions(message, tag, uid) {
  if (!message || !tag || !uid) return [];
  const positions = [];
  let idx = message.indexOf(tag);
  while (idx !== -1) {
    positions.push(idx);
    idx = message.indexOf(tag, idx + tag.length);
  }
  const len = tag.length;
  return positions.map(pos => ({
    tag,
    id: uid,
    uid,
    pos,
    len,
    offset: pos,
    length: len,
    fromIndex: pos
  }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
