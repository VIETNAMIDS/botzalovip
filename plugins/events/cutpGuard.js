const { ThreadType, GroupEventType } = require("zca-js");

function ensureThreadConfig(data = {}) {
  if (!data.cutp || typeof data.cutp !== "object") {
    data.cutp = {
      enabled: true,
      users: {}
    };
  }
  if (typeof data.cutp.enabled !== "boolean") data.cutp.enabled = true;
  if (!data.cutp.users || typeof data.cutp.users !== "object") data.cutp.users = {};
  return data;
}

function extractAffectedMemberIds(event) {
  const data = event?.data || {};
  const arr = Array.isArray(data.updateMembers) ? data.updateMembers : [];
  return arr.map((m) => String(m?.id || m?.uid || "").trim()).filter(Boolean);
}

function isBlocked(threadData, uid) {
  const rec = threadData?.cutp?.users?.[String(uid)];
  return !!rec?.blocked;
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
  name: "cutpGuard",
  version: "1.0.0",
  author: "Cascade",
  description: "Auto-kick user đã bị cutp khi join lại group"
};

module.exports.run = async ({ api, event, Threads }) => {
  try {
    if (Number(event?.type) !== Number(GroupEventType.JOIN)) return;

    const threadId = String(event?.threadId || "").trim();
    if (!threadId) return;

    if (!Threads || typeof Threads.getData !== "function" || typeof Threads.setData !== "function") return;

    const threadRecord = await Threads.getData(threadId).catch(() => null);
    const data = ensureThreadConfig(threadRecord?.data || {});
    if (!data.cutp.enabled) return;

    const botId = typeof api?.getOwnId === "function" ? String(api.getOwnId()).trim() : "";

    const affectedIds = extractAffectedMemberIds(event);
    if (!affectedIds.length) return;

    let changed = false;

    for (const uid of affectedIds) {
      if (!uid) continue;
      if (botId && uid === botId) continue;

      if (isBlocked(data, uid)) {
        await tryKick(api, threadId, uid);
        changed = true;
      }
    }

    if (changed) {
      await Threads.setData(threadId, data);
    }
  } catch {
    return;
  }
};
