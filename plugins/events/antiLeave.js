const { ThreadType, GroupEventType } = require("zca-js");

function ensureThreadConfig(data = {}) {
  if (!data.antiLeave || typeof data.antiLeave !== "object") {
    data.antiLeave = {
      enabled: false,
      threshold: 4,
      windowMs: 30 * 60 * 1000,
      banMs: 24 * 60 * 60 * 1000,
      users: {}
    };
  }

  if (typeof data.antiLeave.enabled !== "boolean") data.antiLeave.enabled = false;
  if (!Number.isFinite(Number(data.antiLeave.threshold)) || Number(data.antiLeave.threshold) < 1) data.antiLeave.threshold = 4;
  if (!Number.isFinite(Number(data.antiLeave.windowMs)) || Number(data.antiLeave.windowMs) < 10 * 1000) data.antiLeave.windowMs = 30 * 60 * 1000;
  if (!Number.isFinite(Number(data.antiLeave.banMs)) || Number(data.antiLeave.banMs) < 10 * 1000) data.antiLeave.banMs = 24 * 60 * 60 * 1000;
  if (!data.antiLeave.users || typeof data.antiLeave.users !== "object") data.antiLeave.users = {};

  return data;
}

function extractActorId(event) {
  const data = event?.data || {};
  return String(data.uidFrom || data.sourceId || event.authorId || "").trim();
}

function extractAffectedMemberIds(event) {
  const data = event?.data || {};
  const arr = Array.isArray(data.updateMembers) ? data.updateMembers : [];
  return arr.map((m) => String(m?.id || "").trim()).filter(Boolean);
}

function pushEventAndGetCount(threadData, uid, now) {
  const conf = threadData.antiLeave;
  const windowMs = Number(conf.windowMs) || 0;
  const key = String(uid);
  const rec = conf.users[key] && typeof conf.users[key] === "object"
    ? conf.users[key]
    : { events: [], bannedUntil: 0, blocked: false, blockedAt: 0 };

  const events = Array.isArray(rec.events) ? rec.events.map((t) => Number(t)).filter((t) => Number.isFinite(t)) : [];
  const cutoff = now - windowMs;
  const filtered = events.filter((t) => t >= cutoff);
  filtered.push(now);

  rec.events = filtered.slice(-50);
  rec.bannedUntil = Number(rec.bannedUntil) || 0;
  rec.blocked = !!rec.blocked;
  rec.blockedAt = Number(rec.blockedAt) || 0;
  conf.users[key] = rec;

  return filtered.length;
}

function isBanned(threadData, uid, now) {
  const conf = threadData.antiLeave;
  const rec = conf.users?.[String(uid)];
  if (rec?.blocked) return true;
  const until = Number(rec?.bannedUntil) || 0;
  return until > now;
}

function banUser(threadData, uid, now) {
  const conf = threadData.antiLeave;
  const key = String(uid);
  const rec = conf.users[key] && typeof conf.users[key] === "object"
    ? conf.users[key]
    : { events: [], bannedUntil: 0, blocked: false, blockedAt: 0 };

  // If banMs is 0 or negative -> treat as permanent block
  const banMs = Number(conf.banMs) || 0;
  if (banMs <= 0) {
    rec.blocked = true;
    rec.blockedAt = now;
    rec.bannedUntil = 0;
  } else {
    rec.bannedUntil = now + banMs;
  }
  conf.users[key] = rec;
  return rec.bannedUntil;
}

async function tryBlockUser(api, uid) {
  if (typeof api?.blockUser !== "function") return false;
  try {
    await api.blockUser(String(uid));
    return true;
  } catch {
    return false;
  }
}

function cleanupUsers(threadData, now) {
  const conf = threadData.antiLeave;
  const cutoff = now - (Number(conf.windowMs) || 0) - (Number(conf.banMs) || 0) - 60 * 1000;
  const users = conf.users || {};

  const keys = Object.keys(users);
  if (keys.length <= 500) return;

  for (const key of keys) {
    const rec = users[key];
    const until = Number(rec?.bannedUntil) || 0;
    const lastEvent = Array.isArray(rec?.events) ? Math.max(0, ...rec.events.map((t) => Number(t) || 0)) : 0;
    if (until <= now && lastEvent <= cutoff) {
      delete users[key];
    }
  }
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
  event_type: ["group_event"],
  name: "antiLeave",
  version: "1.0.0",
  author: "Cascade",
  description: "Chặn spam join/leave: user join/leave quá nhiều lần sẽ bị kick khi join"
};

module.exports.run = async ({ api, event, Threads }) => {
  try {
    if (!event?.threadId || Number(event?.type) !== Number(GroupEventType.JOIN) && Number(event?.type) !== Number(GroupEventType.LEAVE)) return;

    const threadId = String(event.threadId);
    if (Number(event?.type) && Number(event?.type) !== Number(GroupEventType.JOIN) && Number(event?.type) !== Number(GroupEventType.LEAVE)) return;

    if (!Threads || typeof Threads.getData !== "function" || typeof Threads.setData !== "function") return;

    const threadRecord = await Threads.getData(threadId);
    const data = ensureThreadConfig(threadRecord?.data || {});

    if (!data.antiLeave.enabled) return;

    const now = Date.now();

    const actorId = extractActorId(event);
    const botId = typeof api?.getOwnId === "function" ? String(api.getOwnId()).trim() : "";

    const affectedIds = extractAffectedMemberIds(event);
    if (affectedIds.length === 0) return;

    for (const uid of affectedIds) {
      if (!uid) continue;
      if (botId && uid === botId) continue;
      if (actorId && uid === actorId && botId && actorId === botId) continue;

      const count = pushEventAndGetCount(data, uid, now);

      if (count >= Number(data.antiLeave.threshold || 4)) {
        banUser(data, uid, now);
        // optional: also block user from bot perspective (doesn't replace group ban)
        await tryBlockUser(api, uid);
      }

      if (Number(event.type) === Number(GroupEventType.JOIN) && isBanned(data, uid, now)) {
        await tryKick(api, threadId, uid);
      }
    }

    cleanupUsers(data, now);
    await Threads.setData(threadId, data);

    if (Number(event.type) === Number(GroupEventType.JOIN)) {
      const bannedNow = affectedIds.filter((uid) => isBanned(data, uid, Date.now()));
      if (bannedNow.length > 0) {
        const tag = bannedNow.map((id) => `@${id}`).join(", ");
        const msg = `🛡️ AntiLeave\n🚫 Đã chặn spam join/leave: ${tag}\nℹ️ User join/leave quá ${Number(data.antiLeave.threshold)} lần trong ${(Number(data.antiLeave.windowMs) / 60000).toFixed(0)} phút sẽ bị kick khi join.`;
        const mentions = [];
        let cursor = msg.indexOf(tag);
        if (cursor >= 0) {
          let runPos = cursor;
          for (const uid of bannedNow) {
            const t = `@${uid}`;
            const p = msg.indexOf(t, runPos);
            if (p >= 0) {
              mentions.push({ pos: p, len: t.length, uid });
              runPos = p + t.length;
            }
          }
        }
        await api.sendMessage({ msg, mentions }, threadId, ThreadType.Group);
      }
    }
  } catch {
    return;
  }
};
