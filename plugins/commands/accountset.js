const SETTINGS = [
  {
    type: "view_birthday",
    label: "Hiển thị ngày sinh",
    description: "Cho phép bạn bè thấy ngày sinh của bạn."
  },
  {
    type: "online_status",
    label: "Trạng thái online",
    description: "Hiện trạng thái đang hoạt động của bạn."
  },
  {
    type: "seen_status",
    label: "Đã xem",
    description: "Hiện thông báo đã xem tin nhắn."
  },
  {
    type: "receive_message",
    label: "Nhận tin nhắn lạ",
    description: "Cho phép người lạ gửi tin nhắn cho bạn."
  },
  {
    type: "accept_call",
    label: "Nhận cuộc gọi lạ",
    description: "Cho phép người lạ gọi điện cho bạn."
  },
  {
    type: "phone_search",
    label: "Tìm qua số điện thoại",
    description: "Cho phép người khác tìm bạn bằng số điện thoại."
  },
  {
    type: "find_me_via_qr",
    label: "Tìm qua QR",
    description: "Cho phép kết bạn thông qua mã QR của bạn."
  },
  {
    type: "common_group",
    label: "Bạn chung",
    description: "Cho phép kết bạn qua nhóm chung."
  },
  {
    type: "find_me_via_contact",
    label: "Tìm qua danh bạ",
    description: "Cho phép người khác tìm bạn qua đồng bộ danh bạ."
  },
  {
    type: "recommend_friend",
    label: "Gợi ý kết bạn",
    description: "Cho phép xuất hiện trong gợi ý kết bạn."
  },
  {
    type: "archive_chat",
    label: "Lưu trữ chat",
    description: "Bật tính năng lưu trữ hội thoại."
  },
  {
    type: "quick_msg",
    label: "Tin nhắn nhanh",
    description: "Cho phép sử dụng bộ tin nhắn nhanh."
  }
];

const TYPE_INFO = new Map(SETTINGS.map((item, index) => [item.type, { ...item, index }]));
const ALIAS_TO_TYPE = new Map();
const REPLY_STATE_KEY = "__updatesettings_reply_state";
const REPLY_STATE_TTL = 2 * 60 * 1000;

const normalizeKey = (input) => String(input || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function registerAlias(alias, type) {
  if (!alias) return;
  ALIAS_TO_TYPE.set(normalizeKey(alias), type);
}

SETTINGS.forEach((setting, idx) => {
  registerAlias(setting.type, setting.type);
  registerAlias(setting.type.replace(/_/g, ""), setting.type);
  registerAlias(setting.type.replace(/_/g, " "), setting.type);
  registerAlias(setting.label, setting.type);
  registerAlias(setting.label.replace(/\s+/g, ""), setting.type);
  registerAlias(idx + 1, setting.type);
});

const STATUS_MAP = new Map([
  ["on", 1],
  ["enable", 1],
  ["true", 1],
  ["1", 1],
  ["bat", 1],
  ["mo", 1],
  ["open", 1],
  ["yes", 1],
  ["off", 0],
  ["disable", 0],
  ["false", 0],
  ["0", 0],
  ["tat", 0],
  ["dong", 0],
  ["close", 0],
  ["no", 0]
]);

function resolveType(token) {
  const normalized = normalizeKey(token);
  if (!normalized) return null;
  return ALIAS_TO_TYPE.get(normalized) || null;
}

function parseStatus(token) {
  const normalized = normalizeKey(token);
  if (!normalized) return null;
  if (STATUS_MAP.has(normalized)) return STATUS_MAP.get(normalized);
  return null;
}

function formatSettingList() {
  const lines = ["⚙️ UPDATESETTINGS - QUẢN LÝ CÀI ĐẶT TÀI KHOẢN", "-------------------------------------------"];
  SETTINGS.forEach((setting, idx) => {
    lines.push(`${idx + 1}. ${setting.type} → ${setting.label}`);
    lines.push(`   ${setting.description}`);
  });
  lines.push("\nCú pháp: updatesettings <loại> <on/off>");
  lines.push("Ví dụ: updatesettings online_status off");
  return lines.join("\n");
}

function ensureReplyStore() {
  if (!(global[REPLY_STATE_KEY] instanceof Map)) {
    global[REPLY_STATE_KEY] = new Map();
  }
}

function makeStateKey(threadId, senderId) {
  return `${threadId || ""}:${senderId || ""}`;
}

function saveReplyState({ threadId, senderId, messageIds, timestamp = Date.now() }) {
  if (!threadId || !senderId) return;
  ensureReplyStore();
  const key = makeStateKey(threadId, senderId);
  global[REPLY_STATE_KEY].set(key, {
    threadId,
    senderId,
    messageIds: Array.isArray(messageIds) ? messageIds.map(String) : [],
    timestamp
  });
}

function getReplyStateByMessage(messageId) {
  if (!messageId) return null;
  ensureReplyStore();

  let found = null;
  for (const state of global[REPLY_STATE_KEY].values()) {
    if (state?.messageIds?.includes(String(messageId))) {
      found = state;
      break;
    }
  }

  if (!found) return null;
  if (!found.timestamp || Date.now() - found.timestamp > REPLY_STATE_TTL) {
    removeReplyState(found.threadId, found.senderId);
    return null;
  }
  return found;
}

function removeReplyState(threadId, senderId) {
  ensureReplyStore();
  const key = makeStateKey(threadId, senderId);
  global[REPLY_STATE_KEY].delete(key);
}

if (!global.__updatesettingsCleanupTimer) {
  global.__updatesettingsCleanupTimer = setInterval(() => {
    try {
      ensureReplyStore();
      const now = Date.now();
      for (const [key, state] of global[REPLY_STATE_KEY].entries()) {
        if (!state?.timestamp || now - state.timestamp > REPLY_STATE_TTL) {
          global[REPLY_STATE_KEY].delete(key);
        }
      }
    } catch (err) {
      console.warn("[updatesettings] cleanup error", err?.message || err);
    }
  }, 60000);
  if (typeof global.__updatesettingsCleanupTimer.unref === "function") {
    global.__updatesettingsCleanupTimer.unref();
  }
}

function collectMessageIds(result) {
  const collect = [];
  const visit = (payload) => {
    if (!payload || typeof payload !== "object") return;
    ["globalMsgId", "msgId", "cliMsgId", "messageId"].forEach((prop) => {
      if (payload[prop]) collect.push(String(payload[prop]));
    });
  };

  visit(result?.message);
  if (Array.isArray(result?.messages)) result.messages.forEach(visit);
  if (Array.isArray(result?.attachment)) result.attachment.forEach(visit);

  return collect;
}

async function sendMenuList({ api, threadId, type, senderId }) {
  const msg = formatSettingList();
  const sendResult = await api.sendMessage(msg, threadId, type);
  const ids = collectMessageIds(sendResult);
  if (ids.length) {
    saveReplyState({ threadId, senderId, messageIds: ids });
  }
  return sendResult;
}

async function handleToggle(api, threadId, type, status, stateKey) {
  const info = TYPE_INFO.get(type);
  const statusLabel = status === 1 ? "BẬT" : "TẮT";
  try {
    await api.updateSettings(type, status);
    if (stateKey) {
      removeReplyState(stateKey.threadId, stateKey.senderId);
    }
    return api.sendMessage(`✅ Đã cập nhật "${info?.label || type}" → ${statusLabel}.`, threadId);
  } catch (err) {
    console.error("[updatesettings] update error", err);
    return api.sendMessage(`❌ Không thể cập nhật: ${err?.message || err}`, threadId);
  }
}

function parseReplyContent(body) {
  if (!body) return null;
  const trimmed = body.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[,;:\-]+/g, " ").replace(/\s+/g, " " ).trim();
  const parts = normalized.split(" ").filter(Boolean);
  if (!parts.length) return null;
  return parts;
}

module.exports.config = {
  name: "updatesettings",
  aliases: ["usettings", "uas"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Bật / tắt các cài đặt tài khoản Zalo (view birthday, online status, ...)",
  category: "Quản lý bot",
  usage: "updatesettings <type> <on/off>",
  cooldowns: 3
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data, messageReply, body } = event || {};
  const senderId = data?.uidFrom || event?.authorId;
  const tokens = Array.isArray(args) ? args.filter(Boolean) : [];

  if (typeof api?.updateSettings !== "function") {
    return api.sendMessage("❌ SDK hiện tại chưa hỗ trợ updateSettings.", threadId, type);
  }

  const firstToken = tokens[0]?.toLowerCase();
  if (!tokens.length || ["help", "list", "menu"].includes(firstToken)) {
    return sendMenuList({ api, threadId, type, senderId });
  }

  let targetToken = tokens[0];
  let statusToken = tokens[1];

  if (targetToken.includes("=")) {
    const [lhs, rhs] = targetToken.split("=", 2);
    targetToken = lhs;
    statusToken = statusToken || rhs;
  }

  if (!statusToken && tokens.length >= 3) {
    statusToken = tokens[2];
  }

  if (!targetToken || !statusToken) {
    return api.sendMessage("❗ Vui lòng nhập đủ định dạng: updatesettings <loại> <on/off>. Gõ 'updatesettings list' để xem danh sách.", threadId, type);
  }

  const resolvedType = resolveType(targetToken);
  if (!resolvedType) {
    return api.sendMessage(`❗ Không nhận ra loại cài đặt '${targetToken}'. Gõ 'updatesettings list' để xem danh sách.`, threadId, type);
  }

  const status = parseStatus(statusToken);
  if (status === null) {
    return api.sendMessage(`❗ Trạng thái '${statusToken}' không hợp lệ. Dùng on/off, 1/0, bật/tắt.`, threadId, type);
  }

  const info = TYPE_INFO.get(resolvedType);
  const statusLabel = status === 1 ? "BẬT" : "TẮT";

  try {
    await api.updateSettings(resolvedType, status);
    removeReplyState(threadId, senderId);
    return api.sendMessage(`✅ Đã cập nhật "${info?.label || resolvedType}" → ${statusLabel}.`, threadId, type);
  } catch (err) {
    console.error("[updatesettings] update error", err);
    return api.sendMessage(`❌ Không thể cập nhật: ${err?.message || err}`, threadId, type);
  }
};

module.exports.handleEvent = async function ({ api, event }) {
  const currentType = event?.eventType || event?.type;
  if (currentType !== "message" && currentType !== 1) return;

  const messageReply = event?.messageReply;
  const threadId = event?.threadId;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const body = event?.body;

  if (!messageReply || !threadId || !senderId || !body) return;

  const state = getReplyStateByMessage(messageReply?.messageID || messageReply?.msgId || messageReply?.cliMsgId);
  if (!state || state.threadId !== threadId || state.senderId !== senderId) return;

  const parts = parseReplyContent(body);
  if (!parts || !parts.length) return;

  const typePart = parts[0];
  let statusPart = parts[1];

  if (typePart?.includes("=")) {
    const [lhs, rhs] = typePart.split("=", 2);
    statusPart = statusPart || rhs;
    parts[0] = lhs;
  }

  if (!statusPart && parts.length >= 2) {
    statusPart = parts[1];
  }

  if (!statusPart) {
    return api.sendMessage("❗ Vui lòng nhập dạng <số> <on/off>.", threadId);
  }

  const resolvedType = resolveType(parts[0]);
  if (!resolvedType) {
    return api.sendMessage("❗ Không hiểu tuỳ chọn bạn chọn.", threadId);
  }

  const status = parseStatus(statusPart);
  if (status === null) {
    return api.sendMessage("❗ Trạng thái không hợp lệ. Dùng on/off, 1/0, bật/tắt.", threadId);
  }

  await handleToggle(api, threadId, resolvedType, status, state);
};
