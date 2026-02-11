const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antiemoji",
  aliases: ["anti-emoji"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt chống spam emoji trong nhóm",
  category: "Nhóm",
  usage: "antiemoji on/off/status [limit] [autokick on/off]",
  cooldowns: 3
};

function ensure(data = {}) {
  if (!data.antiEmoji || typeof data.antiEmoji !== "object") {
    data.antiEmoji = { enabled: false, limit: 12, autoKick: true, whitelist: [] };
  }
  const c = data.antiEmoji;
  if (typeof c.enabled !== "boolean") c.enabled = false;
  if (!Number.isFinite(Number(c.limit)) || Number(c.limit) < 3) c.limit = 12;
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
  if (!Threads?.getData || !Threads?.setData) {
    return api.sendMessage("❌ Thiếu Threads storage.", threadId, type);
  }

  const action = args.length ? String(args[0] || "status").toLowerCase() : "toggle";
  const row = await Threads.getData(threadId);
  const tData = ensure(row?.data || {});
  const c = tData.antiEmoji;

  if (action === "toggle") {
    c.enabled = !c.enabled;
    c.autoKick = true;
    c.updatedBy = String(data?.uidFrom || event?.authorId || "");
    c.updatedAt = Date.now();
    await Threads.setData(threadId, tData);
    return api.sendMessage(`✅ AntiEmoji ${c.enabled ? "BẬT" : "TẮT"}. (autokick: ON)`, threadId, type);
  }

  if (action === "status") {
    return api.sendMessage(
      `🛡️ AntiEmoji: ${c.enabled ? "🟢 BẬT" : "🔴 TẮT"}\n• limit: ${c.limit}\n• autokick: ${c.autoKick ? "ON" : "OFF"}`,
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
  const autoKick = parseToggle(args[2]);

  c.enabled = enable;
  if (limit != null && limit >= 3 && limit <= 200) c.limit = limit;
  if (autoKick != null) c.autoKick = autoKick;
  c.updatedBy = String(data?.uidFrom || event?.authorId || "");
  c.updatedAt = Date.now();

  await Threads.setData(threadId, tData);
  return api.sendMessage(`✅ AntiEmoji ${c.enabled ? "BẬT" : "TẮT"}.`, threadId, type);
};
