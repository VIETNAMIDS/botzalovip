const { ThreadType } = require("zca-js");

const COOLDOWN_MS = 60 * 60 * 1000;
const JOIN_DELAY_MS = 2500;
const PRE_LEAVE_DELAY_MS = 1200;

function isBotAdmin(senderId) {
  try {
    const cfg = global?.config || {};
    const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    return admins.includes(String(senderId)) || owners.includes(String(senderId));
  } catch {
    return false;
  }
}

function ensureStore() {
  if (!(global.__rejoinTestCooldowns instanceof Map)) {
    global.__rejoinTestCooldowns = new Map();
  }
  return global.__rejoinTestCooldowns;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enableGroupLinkAndGet(api, groupId) {
  if (typeof api?.enableGroupLink !== "function") return null;
  try {
    const resp = await api.enableGroupLink(String(groupId));
    const link = resp?.link || resp?.url || null;
    return link ? String(link) : null;
  } catch {
    return null;
  }
}

async function leaveGroupWithFallback(api, groupId) {
  const candidates = [
    () => (typeof api.leaveGroup === "function" ? api.leaveGroup(groupId) : null),
    () => (typeof api.leaveConversation === "function" ? api.leaveConversation(groupId) : null),
    () => (typeof api.leaveThread === "function" ? api.leaveThread(groupId) : null),
    () => (typeof api.leaveChat === "function" ? api.leaveChat(groupId) : null)
  ];

  let lastError;
  for (const attempt of candidates) {
    try {
      const res = attempt();
      if (res && typeof res.then === "function") await res;
      return;
    } catch (e) {
      lastError = e;
    }
  }

  if (lastError) throw lastError;
  throw new Error("leaveGroup not supported");
}

module.exports.config = {
  name: "rejointest",
  aliases: ["rejoin", "jt"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Test JOIN/LEAVE: bot rời nhóm hiện tại rồi tự vào lại 1 lần (có giới hạn an toàn).",
  category: "Admin",
  usage: "rejointest go",
  cooldowns: 5
};

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type, data } = event || {};
  if (!threadId) return;

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  const senderId = String(data?.uidFrom || event?.authorId || "").trim();
  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Bạn không có quyền dùng lệnh này.", threadId, type);
  }

  const confirm = String(args?.[0] || "").toLowerCase();
  if (confirm !== "go") {
    return api.sendMessage(
      "⚠️ Lệnh này sẽ khiến bot RỜI nhóm và VÀO LẠI để test event JOIN/LEAVE.\n" +
        "✅ Dùng đúng cú pháp: rejointest go",
      threadId,
      type
    );
  }

  const store = ensureStore();
  const now = Date.now();
  const key = String(threadId);
  const last = Number(store.get(key) || 0);
  if (last && now - last < COOLDOWN_MS) {
    const left = Math.ceil((COOLDOWN_MS - (now - last)) / 60000);
    return api.sendMessage(`⏳ Đang cooldown rejoin test. Thử lại sau ~${left} phút.`, threadId, type);
  }

  const link = await enableGroupLinkAndGet(api, threadId);
  if (!link) {
    return api.sendMessage(
      "❌ Không lấy được link mời nhóm (API enableGroupLink không hỗ trợ hoặc bot thiếu quyền).\n" +
        "💡 Gợi ý: thử `cutlink on` trước để bật link nhóm.",
      threadId,
      type
    );
  }

  store.set(key, now);

  await api.sendMessage(
    "🧪 RejoinTest: Bot sẽ rời nhóm và tự vào lại để test event JOIN/LEAVE.\n" +
      "⏳ Nếu nhóm bật duyệt vào nhóm thì bot có thể không vào lại được.",
    threadId,
    type
  );

  await sleep(PRE_LEAVE_DELAY_MS);

  try {
    await leaveGroupWithFallback(api, String(threadId));
  } catch (e) {
    return;
  }

  await sleep(JOIN_DELAY_MS);

  let joined = false;
  let errMsg = "";
  try {
    if (typeof api?.joinGroup === "function") {
      await api.joinGroup(String(link));
      joined = true;
    } else if (typeof api?.joinGroupByLink === "function") {
      await api.joinGroupByLink(String(link));
      joined = true;
    } else if (typeof api?.joinChatByLink === "function") {
      await api.joinChatByLink(String(link));
      joined = true;
    } else {
      errMsg = "API joinGroup/joinGroupByLink không hỗ trợ.";
    }
  } catch (e) {
    errMsg = e?.message || String(e);
  }

  if (!joined) {
    // Bot đã rời nhóm nên không thể sendMessage lại vào group.
    try {
      console.warn("[rejointest] Re-join failed:", errMsg);
    } catch {}
    return;
  }

  // Sau khi join lại, thử gửi tin nhắn xác nhận
  try {
    await sleep(1200);
    await api.sendMessage("✅ RejoinTest: Bot đã vào lại nhóm (nếu bạn thấy tin này là PASS).", threadId, ThreadType.Group);
  } catch {}
};
