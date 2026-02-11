const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antirecall",
  aliases: ["anti-recall", "antirecall2"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "(Đã gỡ) Chống thu hồi tin nhắn quá nhiều trong nhóm",
  category: "Nhóm",
  usage: "antirecall on/off/status [limit] [windowSeconds] [autokick on/off]",
  cooldowns: 3
};

function ensure(data = {}) {
  if (!data.antiRecall || typeof data.antiRecall !== "object") {
    data.antiRecall = { enabled: false, limit: 3, windowMs: 5 * 60 * 1000, autoKick: true, whitelist: [] };
  }
  const c = data.antiRecall;
  if (typeof c.enabled !== "boolean") c.enabled = false;
  if (!Number.isFinite(Number(c.limit)) || Number(c.limit) < 1) c.limit = 3;
  if (!Number.isFinite(Number(c.windowMs)) || Number(c.windowMs) < 10 * 1000) c.windowMs = 5 * 60 * 1000;
  if (typeof c.autoKick !== "boolean") c.autoKick = true;
  if (!Array.isArray(c.whitelist)) c.whitelist = [];
  return data;
}

function parseToggle(tok) {
  const t = String(tok || "").toLowerCase();
  if (["on", "1", "enable", "bat", "bật"].includes(t)) return true;
  if (["off", "0", "disable", "tat", "tắt"].includes(t)) return false;
  return null;
}

module.exports.run = async ({ api, event, args = [], Threads }) => {
  const { threadId, type, data } = event || {};
  if (!threadId || Number(type) !== Number(ThreadType.Group)) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  return api.sendMessage("⚠️ AntiRecall đã bị gỡ theo cấu hình bot.", threadId, type);

  if (!Threads?.getData || !Threads?.setData) {
    return api.sendMessage("❌ Thiếu Threads storage.", threadId, type);
  }

  const action = args.length ? String(args[0] || "status").toLowerCase() : "toggle";
  const row = await Threads.getData(threadId);
  const tData = ensure(row?.data || {});
  const c = tData.antiRecall;

  if (action === "toggle") {
    c.enabled = !c.enabled;
    c.autoKick = true;
    c.updatedBy = String(data?.uidFrom || event?.authorId || "");
    c.updatedAt = Date.now();
    await Threads.setData(threadId, tData);
    return api.sendMessage(`✅ AntiRecall ${c.enabled ? "BẬT" : "TẮT"}. (autokick: ON)`, threadId, type);
  }

  if (action === "status") {
    return api.sendMessage(
      `🛡️ AntiRecall: ${c.enabled ? "🟢 BẬT" : "🔴 TẮT"}\n• limit: ${c.limit}\n• window: ${Math.round(c.windowMs / 1000)}s\n• autokick: ${c.autoKick ? "ON" : "OFF"}`,
      threadId,
      type
    );
  }

  const enable = ["on", "bat", "bật", "1", "enable"].includes(action)
    ? true
    : ["off", "tat", "tắt", "0", "disable"].includes(action)
      ? false
      : !c.enabled;

  const limit = Number.isFinite(Number(args[1])) ? Math.floor(Number(args[1])) : null;
  const windowSeconds = Number.isFinite(Number(args[2])) ? Math.floor(Number(args[2])) : null;
  const autoKick = parseToggle(args[3]);

  c.enabled = enable;
  if (limit != null && limit >= 1 && limit <= 30) c.limit = limit;
  if (windowSeconds != null && windowSeconds >= 10 && windowSeconds <= 3600) c.windowMs = windowSeconds * 1000;
  if (autoKick != null) c.autoKick = autoKick;
  c.updatedBy = String(data?.uidFrom || event?.authorId || "");
  c.updatedAt = Date.now();

  await Threads.setData(threadId, tData);
  return api.sendMessage(`✅ AntiRecall ${c.enabled ? "BẬT" : "TẮT"}.`, threadId, type);
};
