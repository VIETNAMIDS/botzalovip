const STATE_KEY = "__autoundo_state";
const { getMessageCache } = require("../../utils/index");

module.exports.config = {
  name: "autoundo",
  aliases: ["autodel", "autothuhoi", "thuhoitudong", "undoauto"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tự động thu hồi tin nhắn của bot chứa từ khóa chỉ định (mặc định: undo)",
  category: "Tiện ích",
  usage: "autoundo <on|off|status|set <keyword>|time <seconds>|timeoff>",
  cooldowns: 3
};

function ensureState() {
  if (!(global[STATE_KEY] instanceof Map)) {
    global[STATE_KEY] = new Map();
  }
  return global[STATE_KEY];
}

function getThreadConfig(threadId) {
  if (!threadId) return { enabled: false, keyword: "undo", delaySeconds: 0 };
  const state = ensureState();
  return state.get(String(threadId)) || { enabled: false, keyword: "undo", delaySeconds: 0 };
}

function updateThreadConfig(threadId, patch) {
  if (!threadId) return;
  const state = ensureState();
  const current = getThreadConfig(threadId);
  const next = { ...current, ...patch, updatedAt: Date.now() };
  state.set(String(threadId), next);
  return next;
}

function formatStatus(threadId) {
  const cfg = getThreadConfig(threadId);
  const delay = Number(cfg.delaySeconds) > 0 ? `${Number(cfg.delaySeconds)}s` : "tắt";
  return `⚙️ autoundo ${cfg.enabled ? "đang bật" : "đang tắt"} | keyword: ${cfg.keyword} | time: ${delay}`;
}

function buildUndoTarget(event) {
  const threadId = event?.threadId;
  const rawType = event?.type ?? event?.threadType ?? event?.data?.type;
  const type = Number(rawType) === 1 ? 1 : 0;
  const data = event?.data || {};
  const cliMsgIdRaw =
    data.cliMsgId ||
    data.clientMsgId ||
    data?.content?.cliMsgId ||
    data?.content?.clientMsgId ||
    null;
  const cliMsgId = cliMsgIdRaw != null ? String(cliMsgIdRaw) : null;

  let msgId = data.msgId || data.messageId || data?.content?.msgId || null;
  if (!msgId && cliMsgId) {
    try {
      const cache = typeof getMessageCache === "function" ? getMessageCache() : null;
      const cached = cache && typeof cache === "object" ? cache[cliMsgId] : null;
      msgId = cached?.msgId || cached?.data?.msgId || null;
    } catch (_) {}
  }

  if (!threadId || type == null || !msgId || !cliMsgId) return null;
  return {
    threadId,
    type,
    data: {
      msgId,
      cliMsgId
    }
  };
}

async function tryUndo(api, event) {
  if (typeof api?.undo !== "function") return false;
  const target = buildUndoTarget(event);
  if (!target) return false;

  const msgId = target.data.msgId;
  const cliMsgId = target.data.cliMsgId;
  const threadId = target.threadId;
  const type = target.type;

  // zca-js@2.0.0-beta.25 signature: undo(payload, threadId, type)
  // payload: { msgId, cliMsgId }
  const candidates = [
    () => api.undo({ msgId, cliMsgId }, threadId, type),
    () => api.undo({ msgId, cliMsgId }, threadId)
  ];

  for (const fn of candidates) {
    try {
      const res = await fn();
      if (res !== undefined) return true;
      return true;
    } catch (_) {}
  }

  return false;
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;
  const action = String(args[0] || "status").toLowerCase();

  if (!threadId) {
    return api.sendMessage("❌ Không xác định được thread hiện tại.", threadId, type);
  }

  if (action === "status") {
    return api.sendMessage(formatStatus(threadId), threadId, type);
  }

  if (action === "on") {
    updateThreadConfig(threadId, { enabled: true });
    return api.sendMessage("✅ autoundo đã bật.", threadId, type);
  }

  if (action === "off") {
    updateThreadConfig(threadId, { enabled: false });
    return api.sendMessage("🛑 autoundo đã tắt.", threadId, type);
  }

  if (action === "time") {
    const raw = args[1];
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return api.sendMessage("❌ Thời gian không hợp lệ. Ví dụ: autoundo time 40", threadId, type);
    }
    const capped = Math.min(3600, Math.floor(seconds));
    updateThreadConfig(threadId, { delaySeconds: capped, enabled: true });
    return api.sendMessage(`⏱️ Đã bật thu hồi theo thời gian: ${capped}s`, threadId, type);
  }

  if (action === "timeoff") {
    updateThreadConfig(threadId, { delaySeconds: 0 });
    return api.sendMessage("⏱️ Đã tắt thu hồi theo thời gian.", threadId, type);
  }

  if (action === "set") {
    const keyword = args.slice(1).join(" ").trim();
    if (!keyword) {
      return api.sendMessage("❌ Vui lòng nhập keyword. Ví dụ: autoundo set xin lỗi", threadId, type);
    }
    updateThreadConfig(threadId, { keyword });
    return api.sendMessage(`✨ Đã đổi keyword autoundo thành: ${keyword}`, threadId, type);
  }

  return api.sendMessage("❓ Sai cú pháp. Dùng: autoundo on | off | status | set <keyword> | time <seconds> | timeoff", threadId, type);
};

function scheduleUndo(api, event, delaySeconds) {
  const ms = Math.max(0, Math.floor(Number(delaySeconds) * 1000));
  if (!ms) return;
  const snapshot = {
    threadId: event?.threadId,
    type: event?.type,
    data: {
      msgId: event?.data?.msgId,
      cliMsgId: event?.data?.cliMsgId,
      content: event?.data?.content
    }
  };
  const t = setTimeout(() => {
    tryUndo(api, snapshot).catch(() => {});
  }, ms);
  if (typeof t?.unref === "function") t.unref();
}

module.exports.handleEvent = async function ({ api, event, eventType }) {
  if ((eventType || event?.eventType) !== "message") return;
  if (!event?.threadId || !event?.isSelf) return;
  const cfg = getThreadConfig(event.threadId);
  if (!cfg.enabled) return;

  if (Number(cfg.delaySeconds) > 0) {
    scheduleUndo(api, event, cfg.delaySeconds);
    return;
  }

  const content = event?.data?.content;
  const keyword = cfg.keyword || "undo";
  if (typeof content !== "string" || !content.includes(keyword)) return;

  const ok = await tryUndo(api, event);
  if (!ok) {
    const target = buildUndoTarget(event);
    const missing = {
      threadId: !event?.threadId,
      type: event?.type == null,
      msgId: !(target?.data?.msgId),
      cliMsgId: !(target?.data?.cliMsgId)
    };
    console.warn(
      "[autoundo] undo error: Tham số không hợp lệ",
      target
        ? {
            threadId: target.threadId,
            type: target.type,
            msgId: target.data?.msgId,
            cliMsgId: target.data?.cliMsgId,
            missing
          }
        : { reason: "missing threadId/type/msgId", missing }
    );
  }
};
