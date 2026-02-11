const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "cutp",
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Tag ai đó để kick + đưa vào danh sách auto-kick khi join lại",
  category: "Quản lý",
  usage: "cutp @user | cutp on/off/status | cutp list | cutp unban @user | cutp clear",
  cooldowns: 3
};

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

function extractMentionIds(event) {
  const ids = new Set();

  const arr = Array.isArray(event?.data?.mentions) ? event.data.mentions : [];
  for (const m of arr) {
    const uid = m?.uid || m?.id || m?.userId;
    if (uid != null && uid !== "") ids.add(String(uid));
  }

  const map = event?.data?.mentions && !Array.isArray(event.data.mentions) && typeof event.data.mentions === "object"
    ? event.data.mentions
    : null;
  if (map) {
    for (const v of Object.values(map)) {
      const uid = v?.uid || v?.id || v?.userId;
      if (uid != null && uid !== "") ids.add(String(uid));
    }
  }

  if (event?.mentions && typeof event.mentions === "object") {
    for (const k of Object.keys(event.mentions)) {
      if (k) ids.add(String(k));
    }
  }

  return Array.from(ids);
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

function listBlockedUsers(data) {
  const users = data?.cutp?.users && typeof data.cutp.users === "object" ? data.cutp.users : {};
  return Object.keys(users).filter((uid) => users?.[uid]?.blocked);
}

module.exports.run = async ({ api, event, args = [], Threads }) => {
  const { threadId, type } = event || {};
  if (!threadId || Number(type) !== Number(ThreadType.Group)) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  if (!Threads || typeof Threads.getData !== "function" || typeof Threads.setData !== "function") {
    return api.sendMessage("❌ Thiếu Threads storage, không thể lưu cấu hình cutp.", threadId, type);
  }

  const botId = typeof api?.getOwnId === "function" ? String(api.getOwnId()).trim() : "";

  const action = String(args?.[0] || "").toLowerCase();
  const threadRecord = await Threads.getData(threadId).catch(() => null);
  const data = ensureThreadConfig(threadRecord?.data || {});

  if (!action || action === "status" || action === "st") {
    const status = data.cutp.enabled ? "đang BẬT" : "đang TẮT";
    const blockedCount = listBlockedUsers(data).length;
    return api.sendMessage(
      `🛡️ CUTP hiện ${status}.\n` +
      `• Blacklist: ${blockedCount} user\n` +
      `📌 Dùng: cutp @user | cutp list | cutp unban @user | cutp clear | cutp on/off`,
      threadId,
      type
    );
  }

  if (action === "on" || action === "bat" || action === "bật" || action === "1") {
    data.cutp.enabled = true;
    data.cutp.updatedAt = Date.now();
    data.cutp.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
    await Threads.setData(threadId, data);
    return api.sendMessage("✅ Đã BẬT CUTP.", threadId, type);
  }

  if (action === "off" || action === "tat" || action === "tắt" || action === "0") {
    data.cutp.enabled = false;
    data.cutp.updatedAt = Date.now();
    data.cutp.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
    await Threads.setData(threadId, data);
    return api.sendMessage("✅ Đã TẮT CUTP.", threadId, type);
  }

  if (action === "list" || action === "ls") {
    const blocked = listBlockedUsers(data);
    if (!blocked.length) return api.sendMessage("ℹ️ CUTP: blacklist trống.", threadId, type);
    const preview = blocked.slice(0, 30).map((uid) => `- ${uid}`).join("\n");
    const more = blocked.length > 30 ? `\n... và ${blocked.length - 30} user khác` : "";
    return api.sendMessage(`📌 CUTP blacklist (${blocked.length}):\n${preview}${more}`, threadId, type);
  }

  if (action === "clear") {
    data.cutp.users = {};
    data.cutp.updatedAt = Date.now();
    data.cutp.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
    await Threads.setData(threadId, data);
    return api.sendMessage("✅ Đã xoá toàn bộ CUTP blacklist.", threadId, type);
  }

  if (action === "unban" || action === "del" || action === "remove") {
    const ids = extractMentionIds(event);
    if (!ids.length) return api.sendMessage("⚠️ Tag người cần gỡ. VD: cutp unban @user", threadId, type);

    let removed = 0;
    for (const uid of ids) {
      if (uid && data.cutp.users?.[uid]) {
        delete data.cutp.users[uid];
        removed++;
      }
    }

    data.cutp.updatedAt = Date.now();
    data.cutp.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
    await Threads.setData(threadId, data);

    return api.sendMessage(`✅ Đã gỡ CUTP: ${removed} user.`, threadId, type);
  }

  // Default behavior: tag -> ban + kick
  if (!data.cutp.enabled) {
    return api.sendMessage("⚠️ CUTP đang tắt. Bật lại bằng: cutp on", threadId, type);
  }

  const ids = extractMentionIds(event);
  if (!ids.length) {
    return api.sendMessage("⚠️ Tag người cần cutp. VD: cutp @user", threadId, type);
  }

  const now = Date.now();
  let kicked = 0;
  let added = 0;

  for (const uid of ids) {
    if (!uid) continue;
    if (botId && uid === botId) continue;

    const rec = data.cutp.users[uid] && typeof data.cutp.users[uid] === "object"
      ? data.cutp.users[uid]
      : { blocked: false, blockedAt: 0, blockedBy: null };

    if (!rec.blocked) {
      rec.blocked = true;
      rec.blockedAt = now;
      rec.blockedBy = String(event?.data?.uidFrom || event?.authorId || "");
      data.cutp.users[uid] = rec;
      added++;
    }

    const ok = await tryKick(api, threadId, uid);
    if (ok) kicked++;
  }

  data.cutp.updatedAt = now;
  data.cutp.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
  await Threads.setData(threadId, data);

  return api.sendMessage(
    `✅ CUTP: đã thêm blacklist ${added} user, kick ${kicked}/${ids.length} user.\nℹ️ User trong blacklist sẽ bị kick mỗi lần join lại.`,
    threadId,
    type
  );
};
