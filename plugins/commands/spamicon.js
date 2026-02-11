const { Reactions } = require("zca-js");

const STORE_KEY = "__spamiconThreadStates";
const DEFAULT_TRIGGER = ":)";
const MAX_TRIGGER_LENGTH = 60;

const SPAMICON_REACTIONS = [
  Reactions.HEART,
  Reactions.LIKE,
  Reactions.WOW,
  Reactions.SUN,
  Reactions.HANDCLAP,
  Reactions.COOL,
  Reactions.OK,
  Reactions.ROSE,
  Reactions.KISS,
  Reactions.THINK,
  Reactions.BOMB,
  Reactions.SAD,
  Reactions.CRY,
  Reactions.CONFUSED,
  Reactions.ANGRY,
  Reactions.LAUGH,
  Reactions.HAHA
].filter(Boolean);

function ensureStore() {
  if (!(global[STORE_KEY] instanceof Map)) {
    global[STORE_KEY] = new Map();
  }
  return global[STORE_KEY];
}

function getDefaultConfig() {
  return {
    enabled: false,
    trigger: DEFAULT_TRIGGER,
    reactionCount: Math.max(1, SPAMICON_REACTIONS.length) || 1,
    updatedAt: 0
  };
}

function getThreadConfig(threadId) {
  if (!threadId) return getDefaultConfig();
  const store = ensureStore();
  const existing = store.get(String(threadId));
  if (!existing) return getDefaultConfig();
  return {
    ...getDefaultConfig(),
    ...existing
  };
}

function updateThreadConfig(threadId, patch = {}) {
  if (!threadId) return getDefaultConfig();
  const current = getThreadConfig(threadId);
  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now()
  };
  ensureStore().set(String(threadId), next);
  return next;
}

function setThreadState(threadId, enabled) {
  if (!threadId) return;
  updateThreadConfig(threadId, { enabled: Boolean(enabled) });
}

function isThreadEnabled(threadId) {
  if (!threadId) return false;
  const state = getThreadConfig(threadId);
  return Boolean(state.enabled);
}

function describeState(threadId) {
  return isThreadEnabled(threadId) ? "đang bật" : "đang tắt";
}

function sanitizeTrigger(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  return text.length > MAX_TRIGGER_LENGTH ? text.slice(0, MAX_TRIGGER_LENGTH) : text;
}

function formatStatusMessage(threadId) {
  const config = getThreadConfig(threadId);
  return [
    `🤖 Spamicon hiện ${config.enabled ? "đang bật" : "đang tắt"} trong nhóm này.`,
    `• Từ khóa: "${config.trigger}"`,
    `• Số lượng icon / lần: ${config.reactionCount}`,
    "Cú pháp: spamicon on | off | toggle | set <chuỗi> | count <số> | reset"
  ].join("\n");
}

function sanitizeCount(raw) {
  if (raw === undefined) return null;
  const parsed = parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

function extractTextContent(data = {}) {
  if (typeof data.content === "string") return data.content;
  if (typeof data.content?.title === "string") return data.content.title;
  if (typeof data.body === "string") return data.body;
  return "";
}

function isSelfMessage(event = {}) {
  const data = event.data || {};
  return Boolean(
    event.isSelf || data.isOutbox || data.direction === "OUT" || data.isSelf
  );
}

module.exports.config = {
  name: "spamicon",
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tự động thả cảm xúc HAHA vào tin nhắn chứa chuỗi tùy chỉnh",
  category: "Tiện ích",
  usage: "spamicon <on|off|toggle|set <chuỗi>|count <số>|reset|status>",
  cooldowns: 3
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;
  const action = String(args[0] || "").toLowerCase();

  if (!threadId) {
    return api.sendMessage("❌ Không xác định được thread hiện tại.", threadId, type);
  }

  if (!action || action === "status") {
    return api.sendMessage(formatStatusMessage(threadId), threadId, type);
  }

  if (["on", "enable", "start"].includes(action)) {
    setThreadState(threadId, true);
    return api.sendMessage(
      "✅ Đã bật spamicon. Bot sẽ thả HAHA vào mỗi tin nhắn chứa chuỗi đã cấu hình.",
      threadId,
      type
    );
  }

  if (["off", "disable", "stop"].includes(action)) {
    setThreadState(threadId, false);
    return api.sendMessage(
      "🛑 Đã tắt spamicon trong nhóm này.",
      threadId,
      type
    );
  }

  if (["set", "trigger", "text"].includes(action)) {
    const newTrigger = sanitizeTrigger(args.slice(1).join(" "));
    if (!newTrigger) {
      return api.sendMessage(
        "❌ Vui lòng nhập chuỗi cần theo dõi. Ví dụ: spamicon set hehe",
        threadId,
        type
      );
    }
    updateThreadConfig(threadId, { trigger: newTrigger });
    return api.sendMessage(
      `✨ Đã cập nhật từ khóa spamicon thành "${newTrigger}"`,
      threadId,
      type
    );
  }

  if (action === "reset") {
    updateThreadConfig(threadId, { trigger: DEFAULT_TRIGGER });
    return api.sendMessage(
      `♻️ Đã đưa từ khóa về mặc định "${DEFAULT_TRIGGER}"`,
      threadId,
      type
    );
  }

  if (["count", "amount", "reactions"].includes(action)) {
    const nextCount = sanitizeCount(args[1]);
    if (!nextCount) {
      return api.sendMessage(
        "❌ Giá trị không hợp lệ. Dùng: spamicon count <số nguyên dương>",
        threadId,
        type
      );
    }
    updateThreadConfig(threadId, { reactionCount: nextCount });
    return api.sendMessage(
      `🌈 Sẽ thả ${nextCount} icon cho mỗi tin nhắn khớp trigger.`,
      threadId,
      type
    );
  }

  if (action === "toggle") {
    const nextState = !isThreadEnabled(threadId);
    setThreadState(threadId, nextState);
    return api.sendMessage(
      nextState
        ? "✅ Đã bật spamicon (toggle)."
        : "🛑 Đã tắt spamicon (toggle).",
      threadId,
      type
    );
  }

  return api.sendMessage(formatStatusMessage(threadId), threadId, type);
};

module.exports.handleEvent = async function ({ api, event, eventType }) {
  if ((eventType || event?.eventType) !== "message") return;
  if (!event || !event.threadId) return;
  const config = getThreadConfig(event.threadId);
  if (!config.enabled) return;
  if (typeof api?.addReaction !== "function") return;
  if (isSelfMessage(event)) return;

  const { threadId, type, data } = event;
  const text = extractTextContent(data);
  if (typeof text !== "string") return;

  const trigger = String(config.trigger || DEFAULT_TRIGGER).trim();
  if (!trigger) return;

  const normalizedText = text.toLowerCase();
  const normalizedTrigger = trigger.toLowerCase();
  if (!normalizedText.includes(normalizedTrigger)) return;

  const destination = {
    data: { msgId: data?.msgId, cliMsgId: data?.cliMsgId },
    threadId,
    type
  };

  if (!destination.data.msgId && !destination.data.cliMsgId) return;

  const pool = SPAMICON_REACTIONS.length ? SPAMICON_REACTIONS : [Reactions.HAHA];
  for (let i = 0; i < config.reactionCount; i += 1) {
    const reaction = pool[i % pool.length];
    try {
      await api.addReaction(reaction, destination);
    } catch (error) {
      console.warn("[spamicon] addReaction lỗi:", reaction, error?.message || error);
      break;
    }
  }
};
