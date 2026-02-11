const fs = require('fs');
const path = require('path');
const { ThreadType } = require('zca-js');

const CONTENT_FILE = path.join(__dirname, 'noidung.txt');
const DEFAULT_DELAY = 2000;
const DEFAULT_COUNT = 10;
const MAX_COUNT = 100;
const MIN_DELAY = 500;
const SUPPRESS_RENAME_MS = 7000;

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
  name: 'spamname',
  version: '1.0.0',
  role: 1,
  author: 'Cascade',
  description: 'Spam đổi tên nhóm dựa trên danh sách trong noidung.txt',
  category: 'Quản lý nhóm',
  usage: 'spamname [delay_ms] [số_lần]',
  cooldowns: 5
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const threadKey = String(threadId);

  const interactionMode = global.bonzInteractionSettings?.[threadId] || 'all';
  if (interactionMode === 'silent') return;

  if (type !== ThreadType.Group) {
    return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const senderId = event?.data?.uidFrom || event?.authorId;
  const hasPermission = await canRename(api, threadId, senderId);
  if (!hasPermission) {
    return api.sendMessage('❌ Bạn cần là admin nhóm hoặc admin/owner bot để spam đổi tên.', threadId, type);
  }

  let delayMs = DEFAULT_DELAY;
  if (args.length && !Number.isNaN(Number(args[0]))) {
    delayMs = Math.max(MIN_DELAY, parseInt(args.shift(), 10) || DEFAULT_DELAY);
  }

  let count = DEFAULT_COUNT;
  if (args.length && !Number.isNaN(Number(args[0]))) {
    count = Math.max(1, Math.min(MAX_COUNT, parseInt(args.shift(), 10) || DEFAULT_COUNT));
  }

  const names = loadNames();
  if (!names.length) {
    return api.sendMessage('❌ Không đọc được nội dung từ noidung.txt.', threadId, type);
  }

  await api.sendMessage(
    `⏳ Bắt đầu spam tên nhóm (${count} lần, delay ${delayMs}ms).`,
    threadId,
    type
  );

  let success = 0;
  let failed = 0;
  let lastName = null;
  let lastMethod = null;
  let lastError = null;

  for (let i = 0; i < count; i += 1) {
    const name = names[i % names.length];
    try {
      const { ok, methodUsed, error } = await renameGroup(api, threadId, name);
      if (ok) {
        success += 1;
        lastName = name;
        lastMethod = methodUsed;
        markSpamRename(threadKey);
      } else {
        failed += 1;
        lastError = error;
      }
    } catch (error) {
      failed += 1;
      lastError = error;
    }

    if (i < count - 1) {
      await sleep(delayMs);
    }
  }

  const summary = [
    `✅ Thành công: ${success}/${count}`,
    lastName ? `🏷 Tên cuối: ${lastName}` : null,
    lastMethod ? `⚙️ Method: ${lastMethod}` : null,
    failed ? `⚠️ Lỗi gần nhất: ${lastError?.message || lastError || 'Không rõ'}` : null
  ].filter(Boolean).join('\n');

  return api.sendMessage(summary, threadId, type);
};

function loadNames() {
  try {
    const raw = fs.readFileSync(CONTENT_FILE, 'utf8');
    return raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.error('[spamname] Không đọc được file noidung.txt:', error?.message || error);
    return [];
  }
}

async function canRename(api, threadId, senderId) {
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  if (adminList.includes(String(senderId)) || ownerList.includes(String(senderId))) {
    return true;
  }

  try {
    const info = (await (api.getGroupInfo?.(threadId) || api.getThreadInfo?.(threadId) || api.getConversationInfo?.(threadId))) || {};
    const creatorId = info?.creator_id || info?.adminIDs?.[0] || info?.owner_id;
    const admins = (info?.adminIDs || info?.admins || info?.participants?.filter?.(m => m?.is_admin).map?.(m => m?.id)) || [];
    if (String(senderId) === String(creatorId)) return true;
    return admins.map(String).includes(String(senderId));
  } catch (error) {
    console.error('[spamname] Lỗi lấy thông tin nhóm:', error?.message || error);
    return false;
  }
}

async function renameGroup(api, threadId, newName) {
  let lastError = null;
  for (const method of renameMethodNames) {
    if (typeof api[method] !== 'function') continue;

    try {
      if (method === 'changeGroupName') {
        try { await api.changeGroupName(newName, threadId); return { ok: true, methodUsed: `${method}:name-threadId` }; } catch {}
        try { await api.changeGroupName(String(newName), String(threadId)); return { ok: true, methodUsed: `${method}:string-name-threadId` }; } catch {}
        try { await api.changeGroupName({ threadId, name: newName }); return { ok: true, methodUsed: `${method}:object-threadId-name` }; } catch {}
        await api.changeGroupName({ groupId: threadId, name: newName });
        return { ok: true, methodUsed: `${method}:object-groupId-name` };
      }

      if (method === 'updateGroupSettings') {
        const bodies = [
          { name: newName },
          { groupName: newName },
          { title: newName }
        ];
        for (const body of bodies) {
          try { await api.updateGroupSettings(threadId, body); return { ok: true, methodUsed: `${method}:${Object.keys(body)[0]}` }; } catch {}
          try { await api.updateGroupSettings(String(threadId), body); return { ok: true, methodUsed: `${method}:${Object.keys(body)[0]}` }; } catch {}
          await api.updateGroupSettings({ groupId: threadId, ...body });
          return { ok: true, methodUsed: `${method}:${Object.keys(body)[0]}` };
        }
        continue;
      }

      if (method === 'setTitle' || method === 'renameGroup') {
        await api[method](threadId, newName);
        return { ok: true, methodUsed: method };
      }

      await api[method](newName, threadId);
      return { ok: true, methodUsed: method };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  return { ok: false, error: lastError };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function markSpamRename(threadId) {
  if (!threadId) return;
  const store = getSpamRenameStore();
  store.set(String(threadId), Date.now());
  setTimeout(() => {
    const last = store.get(String(threadId));
    if (last && Date.now() - last >= SUPPRESS_RENAME_MS) {
      store.delete(String(threadId));
    }
  }, SUPPRESS_RENAME_MS + 1000).unref?.();
}

function getSpamRenameStore() {
  if (!global.__spamnameRenameStore) {
    global.__spamnameRenameStore = new Map();
  }
  return global.__spamnameRenameStore;
}
