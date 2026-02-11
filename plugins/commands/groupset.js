const { ThreadType } = require("zca-js");

const SETTINGS = [
  { key: "blockName", label: "Khoá đổi tên và ảnh", description: "Không cho phép thành viên đổi tên hoặc thay ảnh nhóm." },
  { key: "signAdminMsg", label: "Đánh dấu tin nhắn admin", description: "Làm nổi bật tin nhắn của trưởng/phó nhóm." },
  { key: "setTopicOnly", label: "Khoá ghim và bình chọn", description: "Chỉ quản trị viên được ghim tin, tạo ghi chú hoặc bình chọn." },
  { key: "enableMsgHistory", label: "Cho xem lịch sử", description: "Thành viên mới có thể xem tin nhắn cũ." },
  { key: "joinAppr", label: "Phê duyệt thành viên", description: "Yêu cầu duyệt khi có người xin vào nhóm." },
  { key: "lockCreatePost", label: "Khoá tạo ghi chú", description: "Chỉ quản trị viên được tạo ghi chú hoặc nhắc hẹn." },
  { key: "lockCreatePoll", label: "Khoá tạo bình chọn", description: "Chỉ quản trị viên được tạo bình chọn mới." },
  { key: "lockSendMsg", label: "Khoá gửi tin nhắn", description: "Chỉ quản trị viên được gửi tin nhắn." },
  { key: "lockViewMember", label: "Ẩn danh sách thành viên", description: "Ẩn danh sách thành viên đối với cộng đồng." }
];

const ALIAS_MAP = new Map();
SETTINGS.forEach((item) => {
  const base = item.key;
  const aliases = [
    base,
    base.replace(/^lock/, ""),
    base.replace(/^enable/, ""),
    base.replace(/^set/, ""),
    base.replace(/^sign/, ""),
    base.replace(/^block/, ""),
    base.replace(/^join/, ""),
    base.replace(/^lockCreate/, "")
  ].filter(Boolean).map((v) => v.toLowerCase());
  ALIAS_MAP.set(item.key, Array.from(new Set(aliases)));
});

const SETTING_LOOKUP = new Map(SETTINGS.map((item) => [item.key, item]));

const PRESETS = {
  full: {
    blockName: true,
    signAdminMsg: true,
    setTopicOnly: true,
    enableMsgHistory: true,
    joinAppr: true,
    lockCreatePost: true,
    lockCreatePoll: true,
    lockSendMsg: true,
    lockViewMember: true
  },
  default: {
    blockName: false,
    signAdminMsg: false,
    setTopicOnly: false,
    enableMsgHistory: true,
    joinAppr: false,
    lockCreatePost: false,
    lockCreatePoll: false,
    lockSendMsg: false,
    lockViewMember: false
  }
};

const SELECTION_TTL = 2 * 60 * 1000;

function resolveKey(input) {
  const text = (input || "").toLowerCase().replace(/[\s_]/g, "");
  for (const item of SETTINGS) {
    const aliases = ALIAS_MAP.get(item.key) || [];
    if (aliases.includes(text)) return item.key;
  }
  return null;
}

function listSettings(state) {
  const on = [];
  const off = [];
  SETTINGS.forEach((item) => {
    const line = `${item.label}: ${state[item.key] ? "BẬT" : "TẮT"}`;
    if (state[item.key]) on.push(line);
    else off.push(line);
  });
  return { on, off };
}

function renderStatus(state) {
  const summary = listSettings(state);
  const lines = ["Trạng thái cài đặt:"];
  if (summary.on.length) {
    lines.push("", "Đang bật:");
    summary.on.forEach((line) => lines.push(`• ${line}`));
  }
  if (summary.off.length) {
    lines.push("", "Đang tắt:");
    summary.off.forEach((line) => lines.push(`• ${line}`));
  }
  return lines.join("\n");
}

function ensureSelectionStore() {
  if (!(global.__groupsetSelectionsByUser instanceof Map)) {
    global.__groupsetSelectionsByUser = new Map();
  }
  if (!(global.__groupsetSelectionsByMessage instanceof Map)) {
    global.__groupsetSelectionsByMessage = new Map();
  }
}

function selectionKey(threadId, senderId) {
  return `${threadId}:${senderId}`;
}

function removeSelection(record) {
  if (!record) return;
  ensureSelectionStore();

  const { threadId, senderId, messageKeys } = record;
  if (Array.isArray(messageKeys)) {
    messageKeys.forEach((key) => {
      global.__groupsetSelectionsByMessage.delete(String(key));
    });
  }
  if (threadId && senderId) {
    const userKey = selectionKey(threadId, senderId);
    const current = global.__groupsetSelectionsByUser.get(userKey);
    if (current && current === record) {
      global.__groupsetSelectionsByUser.delete(userKey);
    }
  }
}

function storeSelection(messageKeys, record) {
  if (!record?.threadId || !record?.senderId) return null;
  ensureSelectionStore();

  const userKey = selectionKey(record.threadId, record.senderId);
  const previous = global.__groupsetSelectionsByUser.get(userKey);
  if (previous) {
    removeSelection(previous);
  }

  const keys = Array.isArray(messageKeys) ? messageKeys.filter(Boolean).map(String) : [];
  record.messageKeys = keys;
  record.createdAt = Date.now();

  global.__groupsetSelectionsByUser.set(userKey, record);
  keys.forEach((key) => {
    global.__groupsetSelectionsByMessage.set(key, record);
  });

  return record;
}

function getSelectionBySender(threadId, senderId) {
  if (!threadId || !senderId) return null;
  ensureSelectionStore();
  const record = global.__groupsetSelectionsByUser.get(selectionKey(threadId, senderId));
  if (!record) return null;
  if (!record.createdAt || Date.now() - record.createdAt > SELECTION_TTL) {
    removeSelection(record);
    return null;
  }
  return record;
}

function getSelectionByMessageId(key) {
  if (!key) return null;
  ensureSelectionStore();
  const record = global.__groupsetSelectionsByMessage.get(String(key));
  if (!record) return null;
  if (!record.createdAt || Date.now() - record.createdAt > SELECTION_TTL) {
    removeSelection(record);
    return null;
  }
  return record;
}

if (!global.__groupsetSelectionCleaner) {
  global.__groupsetSelectionCleaner = setInterval(() => {
    try {
      ensureSelectionStore();
      const now = Date.now();
      for (const record of global.__groupsetSelectionsByUser.values()) {
        if (!record?.createdAt || now - record.createdAt > SELECTION_TTL) {
          removeSelection(record);
        }
      }
    } catch (err) {
      console.warn("[groupset] cleanup error", err?.message || err);
    }
  }, 30000);
  if (typeof global.__groupsetSelectionCleaner.unref === "function") {
    global.__groupsetSelectionCleaner.unref();
  }
}

module.exports.config = {
  name: "groupset",
  aliases: ["gs", "groupsettings", "setgroup"],
  version: "1.0.1",
  role: 1,
  author: "Cascade",
  description: "Xem hoặc đổi nhiều cài đặt nhóm Zalo trong một lệnh.",
  category: "Nhóm",
  usage: "groupset status | groupset key=on/off ... | groupset preset full",
  cooldowns: 3
};

async function getCurrentSettings(api, threadId) {
  const readers = ["getGroupInfo", "getThreadInfo", "getConversationInfo"];
  for (const method of readers) {
    if (typeof api[method] !== "function") continue;
    try {
      const info = await api[method](threadId);
      if (!info) continue;
      const candidate = info.setting || info.gridInfo?.setting || info.gridInfoMap?.[threadId]?.setting || info.gridInfoMap?.[threadId] || info;
      const result = {};
      SETTINGS.forEach((item) => {
        result[item.key] = Boolean(candidate?.[item.key]);
      });
      return result;
    } catch (err) {
      // continue trying next method
    }
  }
  return null;
}

async function updateSettings(api, threadId, payload) {
  if (typeof api.updateGroupSettings !== "function") {
    throw new Error("API không hỗ trợ updateGroupSettings");
  }

  const attempts = [
    () => api.updateGroupSettings(payload, String(threadId)),
    () => api.updateGroupSettings({ groupId: threadId, ...payload }),
    () => api.updateGroupSettings(String(threadId), payload)
  ];

  let lastErr = null;
  for (const fn of attempts) {
    try {
      await fn();
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Không thể cập nhật cài đặt nhóm");
}

function renderHelp(prefix) {
  const lines = [];
  lines.push("GROUPSET - Quản lý cài đặt nhóm");
  lines.push("--------------------------------");
  lines.push(`• ${prefix}              → mở menu chọn số`);
  lines.push(`• ${prefix} status       → xem trạng thái hiện tại`);
  lines.push(`• ${prefix} key=on/off   → chỉnh nhanh một tuỳ chọn`);
  lines.push(`• ${prefix} preset full  → bật sẵn tất cả tuỳ chọn`);
  lines.push("");
  lines.push("Tuỳ chọn hỗ trợ:");
  SETTINGS.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.key} → ${item.label}`);
  });
  lines.push("10. preset full  → bật toàn bộ");
  lines.push("11. preset default → cấu hình mặc định");
  return lines.join("\n");
}

function renderChanges(changes) {
  const lines = ["Đã cập nhật cài đặt:"];
  Object.entries(changes).forEach(([key, value]) => {
    const setting = SETTING_LOOKUP.get(key);
    const label = setting ? setting.label : key;
    lines.push(`• ${label}: ${value ? "BẬT" : "TẮT"}`);
  });
  return lines.join("\n");
}

function buildMenuMessage(currentState) {
  const lines = [];
  lines.push("⚙️ GROUPSET - CHỌN SỐ ĐỂ THAO TÁC");
  lines.push("--------------------------------");
  SETTINGS.forEach((item, idx) => {
    const status = currentState ? (currentState[item.key] ? "(đang bật)" : "(đang tắt)") : "";
    lines.push(`${idx + 1}. ${item.label} ${status}`.trim());
  });
  lines.push("10. Áp preset FULL");
  lines.push("11. Áp preset DEFAULT");
  lines.push("");
  lines.push("💡 Gõ số (hoặc reply số) để bật/tắt tuỳ chọn tương ứng");
  lines.push("⏱️ Menu có hiệu lực trong 2 phút");
  return lines.join("\n");
}

function toggleSettingValue(state, key) {
  const current = !!state?.[key];
  return !current;
}

async function applyToggle(api, threadId, key, currentState) {
  const nextValue = toggleSettingValue(currentState, key);
  await updateSettings(api, threadId, { [key]: nextValue });
  return renderChanges({ [key]: nextValue });
}

async function applyPreset(api, threadId, name) {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error("Preset không hợp lệ");
  }
  await updateSettings(api, threadId, preset);
  return renderChanges(preset);
}

function collectMessageKeys(sendResult) {
  const keys = [];
  const collect = (payload) => {
    if (!payload || typeof payload !== "object") return;
    ["globalMsgId", "msgId", "cliMsgId", "messageId"].forEach((prop) => {
      if (payload[prop]) keys.push(String(payload[prop]));
    });
  };
  collect(sendResult?.message);
  if (Array.isArray(sendResult?.messages)) {
    sendResult.messages.forEach(collect);
  }
  if (Array.isArray(sendResult?.attachment)) {
    sendResult.attachment.forEach(collect);
  }
  return keys;
}

async function sendMenu({ api, event }) {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  const current = await getCurrentSettings(api, threadId);
  const msg = buildMenuMessage(current);

  const sendResult = await api.sendMessage({ msg }, threadId, type);
  const keys = collectMessageKeys(sendResult);
  if (keys.length) {
    storeSelection(keys, {
      threadId,
      senderId,
      currentState: current,
      type
    });
  }
  return sendResult;
}

async function ensureAdmin(api, event) {
  const { threadId, type, data } = event;
  if (type !== ThreadType.Group) {
    throw new Error("Lệnh này chỉ dùng trong nhóm");
  }

  const senderId = data?.uidFrom || event?.authorId;
  const cfg = global?.config || {};
  const botAdmins = new Set([...(cfg.admin_bot || []), ...(cfg.owner_bot || [])].map(String));
  if (botAdmins.has(String(senderId))) return;

  const readers = ["getGroupInfo", "getThreadInfo", "getConversationInfo"];
  for (const method of readers) {
    if (typeof api[method] !== "function") continue;
    try {
      const info = await api[method](threadId);
      if (!info) continue;
      const creator = info.creator_id || info.owner_id || info.creatorId;
      const adminIds = info.adminIDs || info.adminIds || info.admins || [];
      const adminSet = new Set(adminIds.map(String));
      if (adminSet.has(String(senderId)) || String(senderId) === String(creator)) return;
    } catch (err) {
      // try next method
    }
  }

  throw new Error("Bạn cần là quản trị viên nhóm hoặc admin bot");
}

function parseArgs(args) {
  const values = {};
  const errors = [];

  args.forEach((token, index) => {
    if (!token) return;
    let keyToken;
    let valueToken;

    if (token.includes("=")) {
      const parts = token.split("=", 2);
      keyToken = parts[0];
      valueToken = parts[1];
    } else {
      keyToken = token;
      const next = args[index + 1];
      if (next && !next.includes("=")) {
        valueToken = next;
      }
    }

    if (!keyToken) return;

    const resolved = resolveKey(keyToken);
    if (!resolved) {
      errors.push(`Không nhận ra tuỳ chọn: ${keyToken}`);
      return;
    }

    if (!valueToken) {
      errors.push(`Thiếu giá trị on/off cho: ${resolved}`);
      return;
    }

    const normalized = valueToken.toLowerCase();
    if (!["on", "off", "1", "0", "true", "false"].includes(normalized)) {
      errors.push(`Giá trị không hợp lệ: ${valueToken}`);
      return;
    }

    values[resolved] = ["on", "1", "true"].includes(normalized);
  });

  return { values, errors };
}

async function handleNumericSelection({ api, event, selection, index }) {
  if (!selection) return false;
  const { threadId, type } = event;

  const maxToggleIndex = SETTINGS.length;
  const presetFullIndex = maxToggleIndex + 1;
  const presetDefaultIndex = maxToggleIndex + 2;

  if (index < 1 || index > presetDefaultIndex) {
    await api.sendMessage("⚠️ Số không hợp lệ. Chọn trong phạm vi menu.", threadId, type);
    return true;
  }

  let message;
  try {
    if (index >= 1 && index <= maxToggleIndex) {
      const target = SETTINGS[index - 1];
      selection.currentState = selection.currentState || {};
      message = await applyToggle(api, threadId, target.key, selection.currentState);
      selection.currentState[target.key] = !selection.currentState[target.key];
    } else if (index === presetFullIndex) {
      message = await applyPreset(api, threadId, "full");
      selection.currentState = { ...PRESETS.full };
    } else if (index === presetDefaultIndex) {
      message = await applyPreset(api, threadId, "default");
      selection.currentState = { ...PRESETS.default };
    }
  } catch (err) {
    await api.sendMessage(`❌ Không thể thực hiện: ${err?.message || err}`, threadId, type);
    return true;
  }

  selection.createdAt = Date.now();

  if (event.messageID && typeof api.setMessageReaction === "function") {
    try {
      await api.setMessageReaction("💗", event.messageID, threadId, true);
    } catch (_) {}
  }

  if (message) {
    await api.sendMessage(message, threadId, type);
  }

  return true;
}

function extractSelectionFromQuote(data) {
  const quote = data?.quote;
  if (!quote) return null;
  return (
    getSelectionByMessageId(quote.globalMsgId) ||
    getSelectionByMessageId(quote.messageId) ||
    getSelectionByMessageId(quote.msgId) ||
    getSelectionByMessageId(quote.cliMsgId)
  );
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  const prefix = global.config?.PREFIX || "groupset";

  try {
    await ensureAdmin(api, event);
  } catch (err) {
    return api.sendMessage(`❌ ${err.message}`, threadId, type);
  }

  if (!args?.length) {
    try {
      await sendMenu({ api, event });
    } catch (err) {
      await api.sendMessage(`❌ Không thể mở menu: ${err?.message || err}`, threadId, type);
      await api.sendMessage(renderHelp(prefix), threadId, type);
    }
    return;
  }

  const firstRaw = args[0];
  const first = firstRaw.toLowerCase();

  if (["help", "h", "?"].includes(first)) {
    return api.sendMessage(renderHelp(prefix), threadId, type);
  }

  if (/^\d+$/.test(firstRaw)) {
    const selection = getSelectionBySender(threadId, senderId);
    if (!selection) {
      return api.sendMessage("⚠️ Không tìm thấy menu gần đây. Gõ groupset để mở lại.", threadId, type);
    }
    await handleNumericSelection({ api, event, selection, index: parseInt(firstRaw, 10) });
    return;
  }

  if (first === "status") {
    const current = await getCurrentSettings(api, threadId);
    if (!current) {
      return api.sendMessage("❌ Không thể lấy trạng thái hiện tại", threadId, type);
    }
    return api.sendMessage(renderStatus(current), threadId, type);
  }

  if (first === "preset") {
    const presetName = (args[1] || "").toLowerCase();
    const chosen = PRESETS[presetName];
    if (!chosen) {
      return api.sendMessage("⚠️ Preset hợp lệ: full | default", threadId, type);
    }

    try {
      await updateSettings(api, threadId, chosen);
      return api.sendMessage(renderChanges(chosen), threadId, type);
    } catch (err) {
      return api.sendMessage(`❌ Không thể áp dụng preset: ${err?.message || err}`, threadId, type);
    }
  }

  const { values, errors } = parseArgs(args);
  if (errors.length) {
    return api.sendMessage(errors.join("\n"), threadId, type);
  }

  if (!Object.keys(values).length) {
    return api.sendMessage("⚠️ Không có tuỳ chọn hợp lệ. Dùng: groupset status | groupset key=on/off", threadId, type);
  }

  try {
    await updateSettings(api, threadId, values);
    return api.sendMessage(renderChanges(values), threadId, type);
  } catch (err) {
    return api.sendMessage(`❌ Không thể cập nhật: ${err?.message || err}`, threadId, type);
  }
};

module.exports.handleEvent = async ({ eventType, event, api }) => {
  if (eventType !== "message") return false;
  const { threadId, data } = event || {};
  const senderId = data?.uidFrom || event?.authorId;
  if (!threadId || !senderId) return false;

  const content = String(data?.message ?? data?.content ?? "").trim();
  if (/^\d+$/.test(content)) {
    const selection = getSelectionBySender(threadId, senderId);
    if (!selection) return false;
    await handleNumericSelection({ api, event, selection, index: parseInt(content, 10) });
    return true;
  }

  const numeric = String(content).replace(/[^0-9]/g, "");
  if (!numeric) return false;

  const selection = extractSelectionFromQuote(data);
  if (!selection || String(selection.senderId) !== String(senderId)) return false;

  const index = parseInt(numeric, 10);
  if (!Number.isFinite(index)) return false;

  await handleNumericSelection({ api, event, selection, index });
  return true;
};
