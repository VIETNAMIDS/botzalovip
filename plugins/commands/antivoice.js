const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antivoice",
  aliases: ["anti-voice"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Bật/tắt chống gửi voice/audio trong nhóm",
  category: "Nhóm",
  usage: "antivoice on/off/status [notify on/off] [autokick on/off]",
  cooldowns: 3
};

function ensure(data = {}) {
  if (!data.antiVoice || typeof data.antiVoice !== "object") {
    data.antiVoice = { enabled: false, notify: true, autoKick: true, whitelist: [] };
  }
  const c = data.antiVoice;
  if (typeof c.enabled !== "boolean") c.enabled = false;
  if (typeof c.notify !== "boolean") c.notify = true;
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
  const c = tData.antiVoice;

  if (action === "toggle") {
    c.enabled = !c.enabled;
    c.autoKick = true;
    c.updatedBy = String(data?.uidFrom || event?.authorId || "");
    c.updatedAt = Date.now();
    await Threads.setData(threadId, tData);
    return api.sendMessage(`✅ AntiVoice ${c.enabled ? "BẬT" : "TẮT"}. (autokick: ON)`, threadId, type);
  }

  if (action === "status") {
    return api.sendMessage(
      `🛡️ AntiVoice: ${c.enabled ? "🟢 BẬT" : "🔴 TẮT"}\n• notify: ${c.notify ? "ON" : "OFF"}\n• autokick: ${c.autoKick ? "ON" : "OFF"}`,
      threadId,
      type
    );
  }

  const enable = ["on", "bat", "bật", "1", "enable"].includes(action)
    ? true
    : ["off", "tat", "tắt", "0", "disable"].includes(action)
      ? false
      : !c.enabled;

  const notify = parseToggle(args[1]);
  const autoKick = parseToggle(args[2]);

  c.enabled = enable;
  if (notify != null) c.notify = notify;
  if (autoKick != null) c.autoKick = autoKick;
  c.updatedBy = String(data?.uidFrom || event?.authorId || "");
  c.updatedAt = Date.now();

  await Threads.setData(threadId, tData);
  return api.sendMessage(`✅ AntiVoice ${c.enabled ? "BẬT" : "TẮT"}.`, threadId, type);
};
