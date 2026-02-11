const { ThreadType } = require("zca-js");
const { getMessageCache } = require("../../utils/index");

module.exports.config = {
  name: "delafter",
  aliases: ["delau", "xoasau", "thuhoisau"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Xoá/thu hồi tin nhắn sau X giây (reply hoặc tự lấy tin nhắn gần nhất)",
  category: "Quản lý",
  usage: "delafter <giây> <me|all|undo> (reply hoặc không reply để xoá tin gần nhất)",
  cooldowns: 5
};

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist]);
  return all.has(String(uid));
}

function resolveFromCache(cliMsgId) {
  if (!cliMsgId || typeof getMessageCache !== "function") return null;
  try {
    const cache = getMessageCache();
    return cache && typeof cache === "object" ? cache[String(cliMsgId)] : null;
  } catch {
    return null;
  }
}

function findLatestMessageInThread({ threadId, type, beforeTs = null, excludeCliMsgId = null }) {
  if (!threadId || typeof getMessageCache !== "function") return null;
  let cache;
  try {
    cache = getMessageCache();
  } catch {
    cache = null;
  }
  if (!cache || typeof cache !== "object") return null;

  const values = Object.values(cache);
  const normalizedThreadId = String(threadId);
  const normalizedType = type;
  const exclude = excludeCliMsgId != null ? String(excludeCliMsgId) : null;
  const limitTs = beforeTs != null ? Number(beforeTs) : null;

  let best = null;
  let bestTs = -1;
  for (const msg of values) {
    if (!msg || typeof msg !== "object") continue;
    if (String(msg.threadId || "") !== normalizedThreadId) continue;
    if (normalizedType != null && msg.type != null && Number(msg.type) !== Number(normalizedType)) continue;
    if (exclude && String(msg.cliMsgId || "") === exclude) continue;

    const ts = Number(msg.timestamp);
    if (!Number.isFinite(ts)) continue;
    if (limitTs != null && Number.isFinite(limitTs) && ts >= limitTs) continue;

    if (ts > bestTs) {
      bestTs = ts;
      best = msg;
    }
  }

  return best;
}

function buildDestinationFromReply(event) {
  const { threadId, type, messageReply } = event;
  if (!threadId || type == null || !messageReply) return null;

  const data = messageReply.data || {};

  const cliMsgId =
    data.cliMsgId ||
    messageReply.cliMsgId ||
    messageReply.msgID ||
    messageReply.messageID ||
    null;

  let msgId =
    data.msgId ||
    messageReply.globalMsgId ||
    messageReply.msgId ||
    null;

  const uidFrom =
    data.uidFrom ||
    messageReply.authorId ||
    messageReply.senderID ||
    null;

  if (!msgId && cliMsgId) {
    const cached = resolveFromCache(cliMsgId);
    msgId = cached?.msgId || null;
  }

  if (!cliMsgId || !msgId || !uidFrom) return null;

  return {
    threadId,
    type: type || ThreadType.User,
    data: {
      cliMsgId: String(cliMsgId),
      msgId: String(msgId),
      uidFrom: String(uidFrom)
    }
  };
}

async function undoMessage(api, dest) {
  if (typeof api?.undo !== "function") throw new Error("API undo chưa khả dụng");
  const { threadId, type, data } = dest;
  const threadType = Number(type) === 1 ? ThreadType.Group : ThreadType.User;
  return api.undo({ msgId: data.msgId, cliMsgId: data.cliMsgId }, threadId, threadType);
}

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  const seconds = Number(args[0]);
  const mode = String(args[1] || "").toLowerCase();
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return api.sendMessage("❌ Thời gian không hợp lệ. Ví dụ: delafter 5 undo", threadId, type);
  }
  const delayMs = Math.min(3600, Math.floor(seconds)) * 1000;

  let dest = null;
  if (event?.messageReply) {
    dest = buildDestinationFromReply(event);
  } else {
    const beforeTs = event?.data?.ts;
    const excludeCliMsgId = event?.data?.cliMsgId;
    const latest = findLatestMessageInThread({
      threadId,
      type,
      beforeTs,
      excludeCliMsgId
    });

    if (latest) {
      const cliMsgId = latest.cliMsgId;
      const msgId = latest.msgId;
      const uidFrom = latest.uidFrom;
      if (cliMsgId && msgId && uidFrom) {
        dest = {
          threadId,
          type: type || ThreadType.User,
          data: {
            cliMsgId: String(cliMsgId),
            msgId: String(msgId),
            uidFrom: String(uidFrom)
          }
        };
      }
    }
  }

  if (!dest) {
    return api.sendMessage(
      "❌ Không lấy được tin nhắn để xoá/thu hồi. Hãy reply vào tin nhắn cần xoá rồi thử lại.",
      threadId,
      type
    );
  }

  if (!mode || !["me", "all", "undo"].includes(mode)) {
    return api.sendMessage("❌ Mode không hợp lệ. Dùng: delafter <giây> <me|all|undo>", threadId, type);
  }

  if (mode === "undo" && dest.data.uidFrom !== "0" && dest.data.uidFrom !== String(global?.api?.uid || "")) {
    // Không chắc ctx.uid là gì trong wrapper; vẫn cho phép thử, nhưng cảnh báo
  }

  setTimeout(async () => {
    try {
      if (mode === "undo") {
        await undoMessage(api, dest);
        return;
      }

      if (typeof api?.deleteMessage !== "function") {
        throw new Error("API deleteMessage chưa khả dụng");
      }

      const onlyMe = mode === "me";
      await api.deleteMessage(dest, onlyMe);
    } catch (err) {
      console.error("[delafter] error:", err?.message || err);
    }
  }, delayMs);

  return api.sendMessage(`✅ Đã đặt lịch ${mode === "undo" ? "thu hồi" : "xoá"} sau ${Math.floor(delayMs / 1000)}s.`, threadId, type);
};
