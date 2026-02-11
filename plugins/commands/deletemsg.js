const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "deletemsg",
  aliases: ["delmsg", "deleteMessage", "thuhoi", "thu-hoi", "revoke", "unsend"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Xóa tin nhắn bằng API deleteMessage (cần reply vào tin cần xoá)",
  category: "Quản lý",
  usage: "deletemsg [me|all] (reply vào tin nhắn)",
  cooldowns: 5,
};

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist]);
  return all.has(String(uid));
}

function buildDestination(event) {
  const { threadId, type } = event;
  const reply = event?.messageReply || event?.data?.quote;
  if (!reply) return null;

  const data = reply.data || {};

  const cliMsgId =
    data.cliMsgId ||
    reply.cliMsgId ||
    reply.msgID ||
    reply.messageID ||
    reply.clientMsgId ||
    0;

  const msgId =
    data.msgId ||
    reply.globalMsgId ||
    reply.msgId ||
    reply.messageId ||
    reply.messageID ||
    reply.cliMsgId;

  const uidFrom =
    data.uidFrom ||
    reply.uidFrom ||
    reply.authorId ||
    reply.senderID ||
    event?.data?.uidFrom ||
    event?.authorId;

  if (!msgId || !uidFrom) return null;

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

async function tryDeleteMessage(api, destination, onlyMe) {
  if (!api || !destination) return { ok: false, method: null };
  const { threadId, type, data } = destination;
  const msgId = data?.msgId;
  const cliMsgId = data?.cliMsgId;

  const attempts = [
    {
      name: `deleteMessage(object, ${onlyMe ? "onlyMe" : "all"})`,
      fn: async () => {
        if (typeof api.deleteMessage !== 'function') return false;
        await api.deleteMessage(destination, Boolean(onlyMe));
        return true;
      }
    },
    {
      name: 'deleteMessage(msgId)',
      fn: async () => {
        if (typeof api.deleteMessage !== 'function') return false;
        if (!msgId) return false;
        await api.deleteMessage(msgId);
        return true;
      }
    },
    {
      name: 'deleteMessage(threadId, msgId)',
      fn: async () => {
        if (typeof api.deleteMessage !== 'function') return false;
        if (!threadId || !msgId) return false;
        await api.deleteMessage(threadId, msgId);
        return true;
      }
    },
    {
      name: 'unsendMessage(msgId|cliMsgId)',
      fn: async () => {
        if (typeof api.unsendMessage !== 'function') return false;
        const id = msgId || cliMsgId;
        if (!id) return false;
        await api.unsendMessage(id);
        return true;
      }
    }
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const ok = await attempt.fn();
      if (ok) return { ok: true, method: attempt.name, error: null };
    } catch (error) {
      lastError = error;
    }
  }
  return { ok: false, method: null, error: lastError };
}

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  if (typeof api.deleteMessage !== "function") {
    return api.sendMessage("⚠️ API deleteMessage chưa khả dụng trên phiên bản bot này.", threadId, type);
  }

  const hasReply = Boolean(event?.messageReply || event?.data?.quote);
  if (!hasReply) {
    return api.sendMessage("❌ Vui lòng reply vào tin nhắn cần xoá rồi dùng: deletemsg [me|all]", threadId, type);
  }

  const destination = buildDestination(event);
  if (!destination) {
    return api.sendMessage("❌ Không lấy được thông tin tin nhắn. Thử reply tin khác hoặc đợi vài giây.", threadId, type);
  }

  const option = (args[0] || "").toLowerCase();
  const onlyMe = option === "me" || option === "self";

  if (!onlyMe && destination.type === ThreadType.User) {
    return api.sendMessage("⚠️ Không thể xoá cho tất cả trong chat riêng tư. Dùng `deletemsg me` để xoá phía bot.", threadId, type);
  }

  try {
    let result = await tryDeleteMessage(api, destination, onlyMe);
    if (!result.ok && !onlyMe) {
      result = await tryDeleteMessage(api, destination, true);
    }

    if (result.ok) {
      return api.sendMessage(
        `✅ Đã thu hồi/xóa tin nhắn (${result.method}).`,
        threadId,
        type
      );
    }

    const code = result?.error?.code;
    const reason = result?.error?.message || "Không xác định";
    console.error("[DELETEMSG] Lỗi:", result?.error || reason);
    return api.sendMessage(
      "❌ Không thể thu hồi tin nhắn.\n" +
      `Lý do: ${reason}${code ? ` (code=${code})` : ""}\n\n` +
      "Gợi ý:\n" +
      "- Chỉ thu hồi được trong nhóm và thường chỉ thu hồi được tin do bot gửi\n" +
      "- Chat riêng thường chỉ xóa phía bot (me)",
      threadId,
      type
    );
  } catch (error) {
    console.error("[DELETEMSG] Lỗi:", error);
    return api.sendMessage(
      `❌ Không thể xoá tin nhắn.\nLý do: ${error?.message || "Không xác định"}`,
      threadId,
      type
    );
  }
};


