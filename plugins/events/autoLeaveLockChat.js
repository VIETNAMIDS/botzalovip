const fs = require("fs");
const path = require("path");
const { ThreadType, GroupEventType, TextStyle } = require("zca-js");

const WAIT_AFTER_JOIN_MS = 2000;
const LEAVE_DELAY_MS = 500;
const STARTUP_SCAN_DELAY_MS = 250;
const RECURRING_SCAN_INTERVAL_MS = 60 * 60 * 1000;
const FETCH_RETRY_LIMIT = 3;
const FETCH_RETRY_DELAY_MS = 800;
const MAX_STYLE_SEGMENTS = 12;

const DATA_FILE_PATH = path.join(__dirname, "../../data/auto_leave_lockchat.json");

let manualNoLeave = new Map();
let autoLeaveEnabled = true;

function ensureDataDir() {
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (error) {
    console.warn("[autoLeaveLockChat] ensure data dir error:", error?.message || error);
  }
}

function loadState() {
  ensureDataDir();
  try {
    if (!fs.existsSync(DATA_FILE_PATH)) {
      manualNoLeave = new Map();
      autoLeaveEnabled = true;
      return;
    }
    const raw = fs.readFileSync(DATA_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const entries = parsed?.manual || {};

    manualNoLeave = new Map(
      Object.entries(entries).map(([id, meta]) => [normalizeId(id), {
        name: meta?.name || `Nhóm ${id}`,
        savedAt: meta?.savedAt || Date.now()
      }])
    );

    if (typeof parsed?.enabled === "boolean") {
      autoLeaveEnabled = parsed.enabled;
    } else {
      autoLeaveEnabled = true;
    }
  } catch (error) {
    console.warn("[autoLeaveLockChat] load manual list error:", error?.message || error);
    manualNoLeave = new Map();
    autoLeaveEnabled = true;
  }
}

function saveState() {
  ensureDataDir();
  try {
    const payload = {
      manual: Object.fromEntries(
        Array.from(manualNoLeave.entries()).map(([id, meta]) => [id, meta])
      ),
      enabled: autoLeaveEnabled
    };
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.warn("[autoLeaveLockChat] save manual list error:", error?.message || error);
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function shouldStripStyles(error) {
  const code = error?.code || error?.statusCode;
  return code === 112 || code === 400;
}

function buildMultiColorStyle(text) {
  const message = typeof text === "string" ? text : String(text ?? "");
  if (!message.length) return [];

  const palette = [TextStyle.Yellow, TextStyle.Orange, TextStyle.Red, TextStyle.Green];
  const styles = [];
  let cursor = 0;
  const total = message.length;
  const baseChunk = Math.max(1, Math.floor(total / MAX_STYLE_SEGMENTS));

  while (cursor < total) {
    const remaining = total - cursor;
    let chunkSize;
    if (styles.length >= MAX_STYLE_SEGMENTS - 1) {
      chunkSize = remaining;
    } else {
      const randomBoost = Math.floor(Math.random() * 4);
      chunkSize = Math.min(remaining, Math.max(3, baseChunk + randomBoost));
    }

    const style = palette[Math.floor(Math.random() * palette.length)];
    styles.push({ start: cursor, len: chunkSize, st: style });
    cursor += chunkSize;
  }

  return styles;
}

async function sendStyledMessage(api, threadId, threadType, text, options = {}) {
  const message = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  const payload = { msg: message };

  if (options.ttl) payload.ttl = options.ttl;
  if (options.mentions) payload.mentions = options.mentions;
  if (options.attachments) payload.attachments = options.attachments;

  const styles = options.styles || buildMultiColorStyle(message);
  if (styles.length) payload.styles = styles;

  try {
    await api.sendMessage(payload, threadId, threadType);
    return true;
  } catch (error) {
    if (shouldStripStyles(error)) {
      try {
        const fallback = { ...payload };
        delete fallback.styles;
        await api.sendMessage(fallback, threadId, threadType);
        return true;
      } catch (fallbackError) {
        console.warn(`[autoLeaveLockChat] sendStyledMessage fallback error -> ${threadId}:`, fallbackError?.message || fallbackError);
      }
    } else {
      console.warn(`[autoLeaveLockChat] sendStyledMessage error -> ${threadId}:`, error?.message || error);
    }
  }

  return false;
}

function normalizeId(value) {
  if (!value) return "";
  return String(value);
}

function resolveThreadId(event) {
  return normalizeId(
    event?.threadId ??
      event?.data?.threadId ??
      event?.data?.grid ??
      event?.data?.gridId
  );
}

function resolveMemberId(member) {
  return normalizeId(member?.id || member?.uid || member?.userId);
}

function getBotId(api) {
  return normalizeId(api.getOwnId?.() || global?.config?.bot_id || global?.botID);
}

function addManualNoLeave(threadId, name, options = {}) {
  const tid = normalizeId(threadId);
  if (!tid) return false;

  const existing = manualNoLeave.get(tid);
  const finalName = name || existing?.name || `Nhóm ${tid}`;
  const touch = options.touchTimestamp !== false; // mặc định cập nhật thời gian

  let changed = false;
  const nextValue = {
    name: finalName,
    savedAt: existing?.savedAt || Date.now()
  };

  if (!existing) {
    changed = true;
    nextValue.savedAt = Date.now();
  } else {
    if (existing.name !== finalName) {
      changed = true;
    }
    if (touch) {
      nextValue.savedAt = Date.now();
      changed = true;
    }
  }

  if (changed) {
    manualNoLeave.set(tid, nextValue);
    saveState();
  } else if (!existing) {
    manualNoLeave.set(tid, nextValue);
    saveState();
  }

  return true;
}

function removeManualNoLeave(threadId) {
  const tid = normalizeId(threadId);
  if (!tid) return false;
  const existed = manualNoLeave.delete(tid);
  if (existed) {
    saveState();
  }
  return existed;
}

function isManualNoLeave(threadId) {
  return manualNoLeave.has(normalizeId(threadId));
}

function listManualNoLeave() {
  return Array.from(manualNoLeave.entries()).map(([id, meta]) => ({
    id,
    name: meta?.name || `Nhóm ${id}`,
    savedAt: meta?.savedAt || Date.now()
  }));
}

function isAutoLeaveEnabled() {
  return autoLeaveEnabled !== false;
}

function setAutoLeaveEnabled(value) {
  const normalized = !!value;
  if (autoLeaveEnabled !== normalized) {
    autoLeaveEnabled = normalized;
    saveState();
  }
  return autoLeaveEnabled;
}

function toggleAutoLeaveEnabled() {
  return setAutoLeaveEnabled(!isAutoLeaveEnabled());
}

function getConfigWhitelist() {
  const set = new Set();
  try {
    const globalConfig = global?.config || {};
    if (Array.isArray(globalConfig.lockchat_auto_leave_whitelist)) {
      globalConfig.lockchat_auto_leave_whitelist.forEach(id => {
        const tid = normalizeId(id);
        if (tid) set.add(tid);
      });
    }
    if (Array.isArray(globalConfig.allowed_threads)) {
      globalConfig.allowed_threads.forEach(id => {
        const tid = normalizeId(id);
        if (tid) set.add(tid);
      });
    }
  } catch (error) {
    console.warn("[autoLeaveLockChat] cannot read config whitelist:", error?.message || error);
  }
  return set;
}

loadState();

function extractGroupDetail(raw, threadId) {
  if (!raw) return null;
  const tid = normalizeId(threadId);
  return raw?.gridInfoMap?.[tid]
    || raw?.groupInfo?.[tid]
    || raw?.info
    || raw?.data
    || raw;
}

function extractSettings(detail) {
  if (!detail) return {};
  return detail?.setting
    || detail?.settings
    || detail?.cvsSetting
    || detail?.config
    || {};
}

function isLockEnabled(detail) {
  if (!detail) return false;
  const settings = extractSettings(detail);
  const flags = [
    detail?.lockSendMsg,
    detail?.lock_send_msg,
    detail?.lock_send,
    settings?.lockSendMsg,
    settings?.lock_send_msg,
    settings?.lockSend,
    settings?.lock_send,
  ];
  return flags.some(value => value === true || Number(value) === 1);
}

function listAdminIds(detail) {
  if (!detail) return [];
  const directAdmins = Array.isArray(detail?.adminIds) ? detail.adminIds : [];
  const managerIds = Array.isArray(detail?.managerIds) ? detail.managerIds : [];
  const owner = detail?.creatorId || detail?.creator_id;

  const fromMembers = Array.isArray(detail?.memVerList)
    ? detail.memVerList.filter(member => {
        const role = member?.role || member?.memberRole || member?.member_type;
        return role === 1 || role === "admin" || role === "ADMIN";
      }).map(member => member?.uid || member?.id)
    : [];

  const merged = [
    ...directAdmins,
    ...managerIds,
    ...fromMembers,
    owner
  ].filter(Boolean).map(normalizeId);

  return Array.from(new Set(merged));
}

function getMemberCount(detail) {
  if (!detail) return null;
  return detail?.totalMember
    ?? detail?.memberCount
    ?? detail?.participantCount
    ?? detail?.member_total
    ?? detail?.members
    ?? null;
}

async function fetchGroupDetail(api, threadId) {
  const attemptFns = [
    async () => (typeof api.getGroupInfo === "function") ? api.getGroupInfo(threadId) : null,
    async () => (typeof api.getThreadInfo === "function") ? api.getThreadInfo(threadId) : null,
    async () => (typeof api.getConversationInfo === "function") ? api.getConversationInfo(threadId) : null
  ];

  for (const fn of attemptFns) {
    if (typeof fn !== "function") continue;

    let lastError = null;
    for (let attempt = 0; attempt < FETCH_RETRY_LIMIT; attempt++) {
      try {
        const result = await fn();
        if (result) return extractGroupDetail(result, threadId);
        break;
      } catch (error) {
        lastError = error;
        const message = error?.message || String(error || "");
        if (message && message.toLowerCase().includes("retry limit")) {
          await sleep(FETCH_RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        break;
      }
    }

    if (lastError) {
      console.warn("[autoLeaveLockChat] fetch detail error:", lastError?.message || lastError);
    }
  }

  return null;
}

async function tryLeaveGroup(api, threadId, botId) {
  const attempts = [
    {
      name: "leaveGroup",
      fn: async () => {
        if (typeof api.leaveGroup === "function") {
          await api.leaveGroup(threadId);
          return true;
        }
        return false;
      }
    },
    {
      name: "leaveConversation",
      fn: async () => {
        if (typeof api.leaveConversation === "function") {
          await api.leaveConversation(threadId);
          return true;
        }
        return false;
      }
    },
    {
      name: "removeUserFromGroup",
      fn: async () => {
        if (typeof api.removeUserFromGroup === "function" && botId) {
          await api.removeUserFromGroup(botId, threadId);
          return true;
        }
        return false;
      }
    },
    {
      name: "removeUser",
      fn: async () => {
        if (typeof api.removeUser === "function" && botId) {
          await api.removeUser(botId, threadId);
          return true;
        }
        return false;
      }
    },
    {
      name: "removeParticipant",
      fn: async () => {
        if (typeof api.removeParticipant === "function" && botId) {
          await api.removeParticipant(threadId, botId);
          return true;
        }
        return false;
      }
    }
  ];

  for (const attempt of attempts) {
    try {
      const succeed = await attempt.fn();
      if (succeed) {
        console.log(`[autoLeaveLockChat] Left group ${threadId} via ${attempt.name}`);
        return true;
      }
    } catch (error) {
      console.warn(`[autoLeaveLockChat] ${attempt.name} failed:`, error?.message || error);
    }
  }

  return false;
}

function shouldSkip(threadId) {
  const tid = normalizeId(threadId);
  if (!tid) return false;
  try {
    const whitelist = getConfigWhitelist();
    return whitelist.has(tid);
  } catch (error) {
    console.warn("[autoLeaveLockChat] cannot evaluate whitelist:", error?.message || error);
    return false;
  }
}

function getAdminRecipients() {
  try {
    const config = global?.config || {};
    const admins = Array.isArray(config.admin_bot) ? config.admin_bot : [];
    const owners = Array.isArray(config.owner_bot) ? config.owner_bot : [];
    const notify = Array.isArray(config.lockchat_admin_notify) ? config.lockchat_admin_notify : [];
    const recipients = new Set([
      ...admins,
      ...owners,
      ...notify
    ].map(normalizeId).filter(Boolean));
    return Array.from(recipients);
  } catch (error) {
    console.warn("[autoLeaveLockChat] cannot read admin recipients:", error?.message || error);
    return [];
  }
}

function getConfigWhitelist() {
  const set = new Set();
  try {
    const globalConfig = global?.config || {};
    if (Array.isArray(globalConfig.lockchat_auto_leave_whitelist)) {
      globalConfig.lockchat_auto_leave_whitelist.forEach(id => {
        const tid = normalizeId(id);
        if (tid) set.add(tid);
      });
    }
    if (Array.isArray(globalConfig.allowed_threads)) {
      globalConfig.allowed_threads.forEach(id => {
        const tid = normalizeId(id);
        if (tid) set.add(tid);
      });
    }
  } catch (error) {
    console.warn("[autoLeaveLockChat] cannot read config whitelist:", error?.message || error);
  }
  return set;
}

async function collectGroupIds(api, Threads) {
  const ids = new Set();

  if (typeof api.getAllGroups === "function") {
    try {
      const allGroups = await api.getAllGroups();
      const grid = allGroups?.gridVerMap || {};
      for (const key of Object.keys(grid)) {
        ids.add(normalizeId(key));
      }
    } catch (error) {
      console.warn("[autoLeaveLockChat] getAllGroups error:", error?.message || error);
    }
  }

  if (typeof api.getThreadList === "function") {
    try {
      const list = await api.getThreadList(200, null, ["GROUP"]);
      const threads = list?.threads || list?.data || list || [];
      if (Array.isArray(threads)) {
        for (const item of threads) {
          const tid = normalizeId(item?.threadId || item?.id || item?.group_id);
          if (tid) ids.add(tid);
        }
      }
    } catch (error) {
      console.warn("[autoLeaveLockChat] getThreadList error:", error?.message || error);
    }
  }

  if (Threads && typeof Threads.getAll === "function") {
    try {
      const cached = Threads.getAll();
      if (Array.isArray(cached)) {
        for (const entry of cached) {
          const tid = normalizeId(entry?.threadId || entry?.id);
          if (tid) ids.add(tid);
        }
      }
    } catch (error) {
      console.warn("[autoLeaveLockChat] Threads.getAll error:", error?.message || error);
    }
  }

  return Array.from(ids).filter(Boolean);
}

async function notifyAdmins(api, summaryLines) {
  const recipients = getAdminRecipients();
  if (recipients.length === 0) return;

  for (const uid of recipients) {
    await sendStyledMessage(api, uid, ThreadType.User, summaryLines);
  }
}

async function reportLockedLeaveResult(api, { id, name, members, context, left }) {
  if (!api || !id) return;
  const displayName = name || `Nhóm ${id}`;
  const lines = [
    left
      ? "🔐 Bot vừa rời một nhóm khoá chat."
      : "❗ Bot phát hiện nhóm khoá chat nhưng không thể tự rời.",
    `• Tên: ${displayName}`,
    `• ID: ${id}`
  ];

  if (typeof members === "number" && Number.isFinite(members)) {
    lines.push(`• Thành viên: ${members}`);
  }

  lines.push("• Lý do: Nhóm đang bị khoá chat");

  if (context) {
    lines.push(`• Ngữ cảnh: ${context}`);
  }

  await notifyAdmins(api, lines);
}

async function handleLockedGroup({ api, threadId, detail, context }) {
  const tid = normalizeId(threadId);
  if (!tid || !api) return false;

  if (isManualNoLeave(tid)) {
    const meta = manualNoLeave.get(tid);
    if (detail?.name || detail?.groupName) {
      addManualNoLeave(tid, detail?.name || detail?.groupName, { touchTimestamp: false });
    }
    console.log(`[autoLeaveLockChat] ${tid} nằm trong danh sách /dontleave, bỏ qua.`);
    return false;
  }

  if (shouldSkip(tid)) return false;

  const info = detail || await fetchGroupDetail(api, tid);
  if (!info || !isLockEnabled(info)) return false;

  const botId = getBotId(api);
  if (!botId) return false;

  const adminIds = listAdminIds(info);
  if (adminIds.includes(botId)) {
    console.log(`[autoLeaveLockChat] Bot là admin ở nhóm khoá ${tid}, bỏ qua auto leave.`);
    return false;
  }

  const groupName = info?.name || info?.groupName || `nhóm ${tid}`;

  await sleep(LEAVE_DELAY_MS);
  const left = await tryLeaveGroup(api, tid, botId);

  await reportLockedLeaveResult(api, {
    id: tid,
    name: groupName,
    members: getMemberCount(info),
    context,
    left
  });

  return left;
}

async function runStartupScan(api, Threads) {
  try {
    if (!isAutoLeaveEnabled()) return;
    const botId = getBotId(api);
    if (!botId) return;

    const groupIds = await collectGroupIds(api, Threads);
    if (!groupIds.length) return;

    const adminGroups = [];
    const adminGroupSet = new Set();
    const manualKeptMap = new Map();
    const lockedAdminsMap = new Map();
    const pendingLeave = [];

    for (const threadId of groupIds) {
      const tid = normalizeId(threadId);
      if (!tid) continue;

      let detail = null;
      try {
        detail = await fetchGroupDetail(api, tid);
      } catch (error) {
        console.warn(`[autoLeaveLockChat] fetch detail startup: ${tid}`, error?.message || error);
      }

      const manualMeta = manualNoLeave.get(tid);
      const displayName = detail?.name || detail?.groupName || manualMeta?.name || `Nhóm ${tid}`;

      if (isManualNoLeave(tid)) {
        addManualNoLeave(tid, displayName, { touchTimestamp: false });
        manualKeptMap.set(tid, { id: tid, name: displayName });
      }

      if (detail) {
        const adminIds = listAdminIds(detail);
        const creatorId = normalizeId(detail?.creatorId || detail?.creator_id);
        const botIsAdmin = adminIds.includes(botId) || creatorId === botId;

        if (botIsAdmin && !adminGroupSet.has(tid)) {
          adminGroupSet.add(tid);
          adminGroups.push({
            id: tid,
            name: displayName,
            members: detail?.totalMember || detail?.memberCount || detail?.participantCount || detail?.messageCount || 0,
            role: creatorId === botId ? "creator" : "admin"
          });
        }

        if (isLockEnabled(detail)) {
          const record = { id: tid, name: displayName };

          if (manualKeptMap.has(tid)) {
            // Đã đánh dấu /dontleave, không đưa vào pending
          } else if (adminGroupSet.has(tid)) {
            lockedAdminsMap.set(tid, record);
          } else if (!shouldSkip(tid)) {
            pendingLeave.push(record);
          }
        }
      }

      await sleep(STARTUP_SCAN_DELAY_MS);
    }

    const leftGroups = [];
    const failedGroups = [];
    const manualKeptAfterNotice = new Map(manualKeptMap);

    for (const group of pendingLeave) {
      const tid = group.id;

      if (isManualNoLeave(tid) || shouldSkip(tid)) {
        const meta = manualNoLeave.get(tid) || {};
        const name = meta.name || group.name;
        manualKeptAfterNotice.set(tid, { id: tid, name });
        continue;
      }

      let detail = null;
      try {
        detail = await fetchGroupDetail(api, tid);
      } catch {}

      if (!detail) {
        continue;
      }

      const groupLocked = isLockEnabled(detail);
      const updatedName = detail?.name || detail?.groupName || group.name;

      const adminIds = listAdminIds(detail);
      const creatorId = normalizeId(detail?.creatorId || detail?.creator_id);
      const botIsAdmin = adminIds.includes(botId) || creatorId === botId;

      if (botIsAdmin) {
        lockedAdminsMap.set(tid, { id: tid, name: updatedName });
        continue;
      }

      if (!groupLocked) {
        continue;
      }

      const left = await tryLeaveGroup(api, tid, botId);
      if (left) {
        leftGroups.push({ id: tid, name: updatedName });
        await reportLockedLeaveResult(api, {
          id: tid,
          name: updatedName,
          members: getMemberCount(detail),
          context: "Quét định kỳ phát hiện nhóm khoá chat",
          left: true
        });
      } else {
        failedGroups.push({ id: tid, name: updatedName });
        await reportLockedLeaveResult(api, {
          id: tid,
          name: updatedName,
          members: getMemberCount(detail),
          context: "Quét định kỳ phát hiện nhóm khoá chat",
          left: false
        });
      }

      await sleep(STARTUP_SCAN_DELAY_MS);
    }

    const manualSummary = Array.from(manualKeptAfterNotice.values());
    const lockedAdminSummary = Array.from(lockedAdminsMap.values());

    if (manualSummary.length > 0) {
      manualSummary.forEach(group => {
        console.log(`[autoLeaveLockChat] giữ lại nhóm thủ công: ${group.name} (${group.id})`);
      });
    }

    if (lockedAdminSummary.length > 0) {
      lockedAdminSummary.forEach(group => {
        console.log(`[autoLeaveLockChat] bot giữ quyền admin nên không rời: ${group.name} (${group.id})`);
      });
    }

    if (failedGroups.length > 0) {
      failedGroups.forEach(group => {
        console.warn(`[autoLeaveLockChat] rời thất bại: ${group.name} (${group.id})`);
      });
    }
  } catch (error) {
    console.warn("[autoLeaveLockChat] startup scan error:", error?.message || error);
  }
}

module.exports.config = {
  event_type: ["group_event"],
  name: "autoLeaveLockChat",
  version: "1.0.0",
  author: "Cascade",
  description: "Tự động rời nhóm khoá chat ngay khi bot bị thêm vào"
};

module.exports.onLoad = ({ api, Threads }) => {
  if (!api) return;

  const executeScan = () => {
    if (!isAutoLeaveEnabled()) return;
    runStartupScan(api, Threads).catch(error => {
      console.warn("[autoLeaveLockChat] onLoad scan error:", error?.message || error);
    });
  };

  executeScan();
  setInterval(executeScan, RECURRING_SCAN_INTERVAL_MS);
};

module.exports.run = async ({ api, event }) => {
  try {
    if (!isAutoLeaveEnabled()) return;
    if (!event || !event.type) return;

    const threadId = resolveThreadId(event);
    if (!threadId) return;

    if (event.type === GroupEventType.JOIN) {
      const updateMembers = Array.isArray(event?.data?.updateMembers) ? event.data.updateMembers : [];
      if (updateMembers.length === 0) return;

      const botId = getBotId(api);
      if (!botId) return;

      const botJustJoined = updateMembers.some(member => resolveMemberId(member) === botId);
      if (!botJustJoined) return;

      await sleep(WAIT_AFTER_JOIN_MS);

      const detail = await fetchGroupDetail(api, threadId);
      if (!detail) return;

      await handleLockedGroup({
        api,
        threadId,
        detail,
        context: "Bot vừa được thêm vào nhóm khoá chat và tự rời"
      });
      return;
    }

    if (event.type === GroupEventType.UPDATE_SETTING || event.type === GroupEventType.UPDATE) {
      await handleLockedGroup({
        api,
        threadId,
        context: "Nhóm chuyển sang chế độ khoá chat, bot tự rời"
      });
    }
  } catch (error) {
    console.warn("[autoLeaveLockChat] error:", error?.message || error);
  }
};

module.exports.addManualNoLeave = addManualNoLeave;
module.exports.removeManualNoLeave = removeManualNoLeave;
module.exports.getManualNoLeaveList = listManualNoLeave;
module.exports.isAutoLeaveEnabled = isAutoLeaveEnabled;
module.exports.setAutoLeaveEnabled = setAutoLeaveEnabled;
module.exports.toggleAutoLeaveEnabled = toggleAutoLeaveEnabled;
