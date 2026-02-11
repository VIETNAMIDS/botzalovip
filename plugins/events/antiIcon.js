const { ThreadType, GroupEventType } = require("zca-js");

function ensureThreadConfig(data = {}) {
  if (!data.antiIcon || typeof data.antiIcon !== "object") {
    data.antiIcon = {
      enabled: false,
      threshold: 8,
      windowMs: 60 * 1000,
      banMs: 0,
      users: {}
    };
  }

  if (typeof data.antiIcon.enabled !== "boolean") data.antiIcon.enabled = false;
  if (!Number.isFinite(Number(data.antiIcon.threshold)) || Number(data.antiIcon.threshold) < 1) data.antiIcon.threshold = 8;
  if (!Number.isFinite(Number(data.antiIcon.windowMs)) || Number(data.antiIcon.windowMs) < 1000) data.antiIcon.windowMs = 60 * 1000;
  if (!Number.isFinite(Number(data.antiIcon.banMs))) data.antiIcon.banMs = 0;
  if (!data.antiIcon.users || typeof data.antiIcon.users !== "object") data.antiIcon.users = {};

  return data;
}

function ensureAdminCache() {
  if (!(global.__bonzAntiIconAdminCache instanceof Map)) {
    global.__bonzAntiIconAdminCache = new Map();
  }
  return global.__bonzAntiIconAdminCache;
}

function getGroupDetailFromGetGroupInfoResult(info, threadId) {
  if (!info) return null;
  const tid = String(threadId);
  return info?.gridInfoMap?.[tid] || info?.groupInfo?.[tid] || info?.data?.[tid] || info?.data || info;
}

function normalizeId(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    // memVerList sometimes is "uid_xxx"
    if (s.includes("_")) return s.split("_")[0].trim() || null;
    return s;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    return (
      normalizeId(value.uid) ||
      normalizeId(value.id) ||
      normalizeId(value.userId) ||
      normalizeId(value.userID) ||
      normalizeId(value.memberId) ||
      null
    );
  }
  return null;
}

function collectIdList(set, list) {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    const id = normalizeId(item);
    if (id) set.add(id);
  }
}

function extractCreatorId(detail) {
  return (
    normalizeId(detail?.creatorId) ||
    normalizeId(detail?.creator_id) ||
    normalizeId(detail?.creatorID) ||
    normalizeId(detail?.ownerId) ||
    normalizeId(detail?.owner_id) ||
    normalizeId(detail?.ownerID) ||
    normalizeId(detail?.creator?.id) ||
    normalizeId(detail?.creator?.uid) ||
    normalizeId(detail?.owner?.id) ||
    normalizeId(detail?.owner?.uid) ||
    null
  );
}

function extractAdminIds(detail) {
  const set = new Set();
  if (!detail) return [];

  collectIdList(set, detail?.adminIds);
  collectIdList(set, detail?.adminIDs);
  collectIdList(set, detail?.adminIdList);
  collectIdList(set, detail?.adminList);
  collectIdList(set, detail?.admins);
  collectIdList(set, detail?.admin_list);
  collectIdList(set, detail?.managerIds);
  collectIdList(set, detail?.managerIDs);
  collectIdList(set, detail?.managers);

  // Some payloads embed admin flags inside member lists
  if (Array.isArray(detail?.memVerList)) {
    for (const entry of detail.memVerList) {
      if (typeof entry === "string") {
        const id = normalizeId(entry);
        if (id) set.add(id);
      } else if (entry && typeof entry === "object") {
        const role = String(entry.role || entry.type || entry.position || "").toLowerCase();
        const isAdmin = entry.isAdmin === true || entry.admin === true || role.includes("admin") || role.includes("manager");
        if (isAdmin) {
          const id = normalizeId(entry);
          if (id) set.add(id);
        }
      }
    }
  }

  return Array.from(set);
}

async function fetchGroupDetail(api, threadId) {
  if (typeof api?.getGroupInfo === "function") {
    try {
      const info = await api.getGroupInfo(String(threadId));
      const detail = getGroupDetailFromGetGroupInfoResult(info, threadId);
      if (detail) return detail;
    } catch {}
  }
  if (typeof api?.getThreadInfo === "function") {
    try {
      const info = await api.getThreadInfo(String(threadId));
      if (info) return info;
    } catch {}
  }
  return null;
}

async function isGroupAdminOrCreator(api, threadId, uid) {
  const userId = String(uid || "").trim();
  if (!userId) return false;

  const cache = ensureAdminCache();
  const key = String(threadId);
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && now - Number(cached.ts || 0) < 5 * 60 * 1000) {
    if (cached.creatorId && String(cached.creatorId) === userId) return true;
    if (Array.isArray(cached.adminIds) && cached.adminIds.includes(userId)) return true;
    return false;
  }

  const detail = await fetchGroupDetail(api, threadId);
  const creatorId = extractCreatorId(detail);
  const adminIds = extractAdminIds(detail).map((x) => String(x).trim()).filter(Boolean);
  cache.set(key, { ts: now, creatorId: creatorId ? String(creatorId) : null, adminIds });

  if (creatorId && String(creatorId) === userId) return true;
  if (adminIds.includes(userId)) return true;
  return false;
}

function extractThreadId(event) {
  return String(
    event?.threadId ??
    event?.data?.threadId ??
    event?.data?.grid ??
    event?.data?.gridId ??
    event?.data?.groupId ??
    event?.data?.chatId ??
    ""
  ).trim();
}

function extractActorId(event) {
  const data = event?.data || {};
  return String(data.userId || data.uid || data.uidFrom || data.senderId || data.authorId || event?.authorId || "").trim();
}

function extractAffectedMemberIds(event) {
  const data = event?.data || {};
  const arr = Array.isArray(data.updateMembers) ? data.updateMembers : [];
  return arr.map((m) => String(m?.id || "").trim()).filter(Boolean);
}

function isBlocked(threadData, uid, now) {
  const conf = threadData.antiIcon;
  const rec = conf.users?.[String(uid)];
  if (!rec) return false;
  if (rec.blocked) return true;
  const until = Number(rec.bannedUntil) || 0;
  return until > now;
}

function pushReaction(threadData, uid, now) {
  const conf = threadData.antiIcon;
  const key = String(uid);
  const rec = conf.users[key] && typeof conf.users[key] === "object"
    ? conf.users[key]
    : { events: [], blocked: false, blockedAt: 0, bannedUntil: 0 };

  const windowMs = Number(conf.windowMs) || 0;
  const cutoff = now - windowMs;

  const events = Array.isArray(rec.events) ? rec.events.map((t) => Number(t)).filter((t) => Number.isFinite(t)) : [];
  const filtered = events.filter((t) => t >= cutoff);
  filtered.push(now);

  rec.events = filtered.slice(-100);
  rec.blocked = !!rec.blocked;
  rec.blockedAt = Number(rec.blockedAt) || 0;
  rec.bannedUntil = Number(rec.bannedUntil) || 0;

  conf.users[key] = rec;
  return filtered.length;
}

function blockUser(threadData, uid, now) {
  const conf = threadData.antiIcon;
  const key = String(uid);
  const rec = conf.users[key] && typeof conf.users[key] === "object"
    ? conf.users[key]
    : { events: [], blocked: false, blockedAt: 0, bannedUntil: 0 };

  const banMs = Number(conf.banMs) || 0;
  if (banMs <= 0) {
    rec.blocked = true;
    rec.blockedAt = now;
    rec.bannedUntil = 0;
  } else {
    rec.bannedUntil = now + banMs;
  }

  conf.users[key] = rec;
}

async function tryKick(api, threadId, uid) {
  if (typeof api?.removeUserFromGroup !== "function") return false;
  try {
    await api.removeUserFromGroup(String(uid), String(threadId));
    return true;
  } catch {
    return false;
  }
}

module.exports.config = {
  event_type: ["reaction", "group_event"],
  name: "antiIcon",
  version: "1.0.0",
  author: "Cascade",
  description: "Chặn spam thả icon (reaction): vượt ngưỡng sẽ bị kick + block theo nhóm"
};

module.exports.run = async ({ api, event, Threads }) => {
  try {
    if (!Threads || typeof Threads.getData !== "function" || typeof Threads.setData !== "function") return;

    const threadId = extractThreadId(event);
    if (!threadId) return;

    const evtType = String(event?.eventType || event?.type || "").toLowerCase();

    const threadRecord = await Threads.getData(threadId).catch(() => null);
    const data = ensureThreadConfig(threadRecord?.data || {});
    if (!data.antiIcon.enabled) return;

    const botId = typeof api?.getOwnId === "function" ? String(api.getOwnId()).trim() : "";
    const now = Date.now();

    // Auto-kick if user is already blacklisted and tries to re-join by link
    // Only handle the JOIN group_event; ignore other group_event types.
    if (evtType === "group_event") {
      if (Number(event?.type) !== Number(GroupEventType.JOIN)) return;
      const affectedIds = extractAffectedMemberIds(event);
      if (affectedIds.length === 0) return;
      for (const uid of affectedIds) {
        if (!uid) continue;
        if (botId && uid === botId) continue;
        // never punish admins/creator
        if (await isGroupAdminOrCreator(api, threadId, uid)) continue;
        if (isBlocked(data, uid, now)) {
          await tryKick(api, threadId, uid);
        }
      }
      await Threads.setData(threadId, data);
      return;
    }

    // Only handle reaction events below
    if (evtType && evtType !== "reaction") return;

    // Reaction handling
    const actorId = extractActorId(event);
    if (!actorId) return;
    if (botId && actorId === botId) return;

    // Ignore group admins/creator
    if (await isGroupAdminOrCreator(api, threadId, actorId)) return;

    const count = pushReaction(data, actorId, now);
    if (count < Number(data.antiIcon.threshold)) {
      await Threads.setData(threadId, data);
      return;
    }

    if (!isBlocked(data, actorId, now)) {
      blockUser(data, actorId, now);
    }

    const kicked = await tryKick(api, threadId, actorId);
    await Threads.setData(threadId, data);

    try {
      const mins = Math.max(1, Math.round(Number(data.antiIcon.windowMs) / 60000));
      const tag = `@${actorId}`;
      const msg = kicked
        ? `🛡️ AntiIcon\n🚫 ${tag} đã bị chặn vì spam thả icon (${count}/${data.antiIcon.threshold} trong ${mins}p).\nℹ️ Từ giờ user sẽ bị kick mỗi lần join (blacklist theo nhóm).`
        : `🛡️ AntiIcon\n⚠️ Phát hiện ${tag} spam thả icon (${count}/${data.antiIcon.threshold} trong ${mins}p) nhưng bot không kick được. Vui lòng cấp quyền admin.`;
      const pos = msg.indexOf(tag);
      const mentions = pos >= 0 ? [{ pos, len: tag.length, uid: actorId }] : [];
      await api.sendMessage({ msg, mentions }, threadId, ThreadType.Group);
    } catch {}
  } catch {
    return;
  }
};
