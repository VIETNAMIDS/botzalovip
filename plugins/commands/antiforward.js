const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antiforward",
  aliases: ["anti-forward"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt chống forward tin nhắn trong nhóm",
  category: "Nhóm",
  usage: "antiforward on/off/status [autokick on/off]",
  cooldowns: 3
};

function ensure(data = {}) {
  if (!data.antiForward || typeof data.antiForward !== "object") {
    data.antiForward = { enabled: false, autoKick: true, whitelist: [] };
  }
  const c = data.antiForward;
  if (typeof c.enabled !== "boolean") c.enabled = false;
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
  const c = tData.antiForward;

  if (action === "toggle") {
    c.enabled = !c.enabled;
    c.autoKick = true;
    c.updatedBy = String(data?.uidFrom || event?.authorId || "");
    c.updatedAt = Date.now();
    await Threads.setData(threadId, tData);
    return api.sendMessage(`✅ AntiForward ${c.enabled ? "BẬT" : "TẮT"}. (autokick: ON)`, threadId, type);
  }

  if (action === "status") {
    return api.sendMessage(
      `🛡️ AntiForward: ${c.enabled ? "🟢 BẬT" : "🔴 TẮT"}\n• autokick: ${c.autoKick ? "ON" : "OFF"}`,
      threadId,
      type
    );
  }

  const enable = ["on", "bat", "bật", "1", "enable"].includes(action)
    ? true
    : ["off", "tat", "tắt", "0", "disable"].includes(action)
      ? false
      : !c.enabled;

  const autoKick = parseToggle(args[1]);

  c.enabled = enable;
  if (autoKick != null) c.autoKick = autoKick;
  c.updatedBy = String(data?.uidFrom || event?.authorId || "");
  c.updatedAt = Date.now();

  await Threads.setData(threadId, tData);
  return api.sendMessage(`✅ AntiForward ${c.enabled ? "BẬT" : "TẮT"}.`, threadId, type);
};
