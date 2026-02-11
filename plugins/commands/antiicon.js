const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antiicon",
  aliases: ["anti-icon", "antireaction"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt chống spam thả icon (reaction) trong nhóm",
  category: "Quản lý",
  usage: "antiicon on/off/status [threshold] [windowSeconds]",
  cooldowns: 3
};

const ENABLE_KEYWORDS = ["on", "bat", "bật", "enable", "1"];
const DISABLE_KEYWORDS = ["off", "tat", "tắt", "disable", "0"];

function ensureThreadConfig(data = {}) {
  if (!data.antiIcon || typeof data.antiIcon !== "object") {
    data.antiIcon = {
      enabled: false,
      threshold: 8,
      windowMs: 60 * 1000,
      banMs: 0,
      users: {}
    };
  }

  if (typeof data.antiIcon.enabled !== "boolean") data.antiIcon.enabled = false;
  if (!Number.isFinite(Number(data.antiIcon.threshold)) || Number(data.antiIcon.threshold) < 1) data.antiIcon.threshold = 8;
  if (!Number.isFinite(Number(data.antiIcon.windowMs)) || Number(data.antiIcon.windowMs) < 1000) data.antiIcon.windowMs = 60 * 1000;
  if (!Number.isFinite(Number(data.antiIcon.banMs))) data.antiIcon.banMs = 0;
  if (!data.antiIcon.users || typeof data.antiIcon.users !== "object") data.antiIcon.users = {};

  return data;
}

module.exports.run = async ({ api, event, args = [], Threads }) => {
  const { threadId, type } = event || {};
  if (!threadId || Number(type) !== Number(ThreadType.Group)) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  if (!Threads || typeof Threads.getData !== "function" || typeof Threads.setData !== "function") {
    return api.sendMessage("❌ Thiếu Threads storage, không thể lưu cấu hình antiicon.", threadId, type);
  }

  const actionRaw = String(args?.[0] || "").toLowerCase();
  const action = ENABLE_KEYWORDS.includes(actionRaw)
    ? "on"
    : DISABLE_KEYWORDS.includes(actionRaw)
      ? "off"
      : (actionRaw === "status" || actionRaw === "st" ? "status" : "toggle");

  const thresholdArg = args?.[1];
  const threshold = Number.isFinite(Number(thresholdArg)) ? Math.floor(Number(thresholdArg)) : null;

  const windowArg = args?.[2];
  const windowSeconds = Number.isFinite(Number(windowArg)) ? Math.floor(Number(windowArg)) : null;

  const threadRecord = await Threads.getData(threadId);
  const data = ensureThreadConfig(threadRecord?.data || {});

  if (action === "status") {
    const status = data.antiIcon.enabled ? "đang BẬT" : "đang TẮT";
    const secs = Math.round(Number(data.antiIcon.windowMs) / 1000);
    const now = Date.now();
    const users = data?.antiIcon?.users && typeof data.antiIcon.users === "object" ? data.antiIcon.users : {};
    const bannedCount = Object.keys(users).filter((uid) => {
      const rec = users[uid];
      if (!rec || typeof rec !== "object") return false;
      if (rec.blocked) return true;
      const until = Number(rec.bannedUntil) || 0;
      return until > now;
    }).length;
    return api.sendMessage(
      `🛡️ AntiIcon hiện ${status}.\n` +
      `• Ngưỡng: ${data.antiIcon.threshold} reaction\n` +
      `• Cửa sổ: ${secs}s\n` +
      `• Đang blacklist: ${bannedCount} user\n` +
      `📌 Dùng: antiicon on|off [threshold] [windowSeconds]`,
      threadId,
      type
    );
  }

  const next = action === "toggle" ? !data.antiIcon.enabled : (action === "on");
  data.antiIcon.enabled = next;

  if (threshold != null && threshold >= 1 && threshold <= 50) {
    data.antiIcon.threshold = threshold;
  }
  if (windowSeconds != null && windowSeconds >= 5 && windowSeconds <= 3600) {
    data.antiIcon.windowMs = windowSeconds * 1000;
  }

  data.antiIcon.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
  data.antiIcon.updatedAt = Date.now();

  await Threads.setData(threadId, data);

  const statusText = next ? "đã BẬT" : "đã TẮT";
  const emoji = next ? "🚫" : "✅";
  const secs = Math.round(Number(data.antiIcon.windowMs) / 1000);

  const hint = next
    ? `Ai thả icon quá ${data.antiIcon.threshold} lần trong ${secs}s sẽ bị kick + đưa vào blacklist nhóm.`
    : "AntiIcon sẽ không hoạt động cho đến khi bật lại.";

  return api.sendMessage(`${emoji} AntiIcon ${statusText}.\nℹ️ ${hint}\n📌 Dùng 'antiicon status' để xem trạng thái.`, threadId, type);
};
