const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antileave",
  aliases: ["anti-leave", "antijoinleave"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt chống spam join/leave: user join/leave quá nhiều lần sẽ bị kick khi join",
  category: "Quản lý",
  usage: "antileave on/off/status [threshold] [banHours|perma]",
  cooldowns: 3
};

const ENABLE_KEYWORDS = ["on", "bat", "bật", "enable", "1"];
const DISABLE_KEYWORDS = ["off", "tat", "tắt", "disable", "0"];

function ensureThreadConfig(data = {}) {
  if (!data.antiLeave || typeof data.antiLeave !== "object") {
    data.antiLeave = {
      enabled: false,
      threshold: 4,
      windowMs: 30 * 60 * 1000,
      banMs: 24 * 60 * 60 * 1000,
      users: {}
    };
  }

  if (typeof data.antiLeave.enabled !== "boolean") data.antiLeave.enabled = false;
  if (!Number.isFinite(Number(data.antiLeave.threshold)) || Number(data.antiLeave.threshold) < 1) data.antiLeave.threshold = 4;
  if (!Number.isFinite(Number(data.antiLeave.windowMs)) || Number(data.antiLeave.windowMs) < 10 * 1000) data.antiLeave.windowMs = 30 * 60 * 1000;
  if (!Number.isFinite(Number(data.antiLeave.banMs)) || Number(data.antiLeave.banMs) < 10 * 1000) data.antiLeave.banMs = 24 * 60 * 60 * 1000;
  if (!data.antiLeave.users || typeof data.antiLeave.users !== "object") data.antiLeave.users = {};

  return data;
}

module.exports.run = async ({ api, event, args = [], Threads }) => {
  const { threadId, type } = event || {};
  if (!threadId || Number(type) !== Number(ThreadType.Group)) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  if (!Threads || typeof Threads.getData !== "function" || typeof Threads.setData !== "function") {
    return api.sendMessage("❌ Thiếu Threads storage, không thể lưu cấu hình antileave.", threadId, type);
  }

  const actionRaw = String(args?.[0] || "").toLowerCase();
  const action = ENABLE_KEYWORDS.includes(actionRaw)
    ? "on"
    : DISABLE_KEYWORDS.includes(actionRaw)
      ? "off"
      : (actionRaw === "status" || actionRaw === "st" ? "status" : "toggle");

  const thresholdArg = args?.[1];
  const threshold = Number.isFinite(Number(thresholdArg)) ? Math.floor(Number(thresholdArg)) : null;

  const banArg = String(args?.[2] || "").toLowerCase().trim();
  const banHours = Number.isFinite(Number(banArg)) ? Number(banArg) : null;
  const banMode = banArg === "perma" || banArg === "perm" || banArg === "forever" ? "perma" : null;

  const threadRecord = await Threads.getData(threadId);
  const data = ensureThreadConfig(threadRecord?.data || {});

  if (action === "status") {
    const status = data.antiLeave.enabled ? "đang BẬT" : "đang TẮT";
    const mins = Math.round(Number(data.antiLeave.windowMs) / 60000);
    const banHoursDisplay = Number(data.antiLeave.banMs) <= 0 ? "VĨNH VIỄN" : `${Math.round(Number(data.antiLeave.banMs) / 3600000)} giờ`;
    return api.sendMessage(
      `🛡️ AntiLeave hiện ${status}.\n` +
      `• Ngưỡng: ${data.antiLeave.threshold} lần join/leave\n` +
      `• Cửa sổ: ${mins} phút\n` +
      `• Ban: ${banHoursDisplay}\n` +
      `📌 Dùng: antileave on|off [threshold]`,
      threadId,
      type
    );
  }

  const next = action === "toggle" ? !data.antiLeave.enabled : (action === "on");
  data.antiLeave.enabled = next;

  if (threshold != null && threshold >= 1 && threshold <= 20) {
    data.antiLeave.threshold = threshold;
  }

  if (banMode === "perma") {
    data.antiLeave.banMs = 0;
  } else if (banHours != null && banHours >= 1 && banHours <= 720) {
    data.antiLeave.banMs = Math.floor(banHours * 3600000);
  }

  data.antiLeave.updatedBy = String(event?.data?.uidFrom || event?.authorId || "");
  data.antiLeave.updatedAt = Date.now();

  await Threads.setData(threadId, data);

  const statusText = next ? "đã BẬT" : "đã TẮT";
  const emoji = next ? "🚫" : "✅";
  const mins = Math.round(Number(data.antiLeave.windowMs) / 60000);

  const banText = Number(data.antiLeave.banMs) <= 0
    ? "VĨNH VIỄN"
    : `${Math.round(Number(data.antiLeave.banMs) / 3600000)} giờ`;

  const hint = next
    ? `Ai join/leave quá ${data.antiLeave.threshold} lần trong ${mins} phút sẽ bị chặn (${banText}) và kick khi join.`
    : "AntiLeave sẽ không hoạt động cho đến khi bật lại.";

  return api.sendMessage(`${emoji} AntiLeave ${statusText}.\nℹ️ ${hint}\n📌 Dùng 'antileave status' để xem trạng thái.`, threadId, type);
};
