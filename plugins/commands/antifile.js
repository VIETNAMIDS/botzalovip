const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antifile",
  aliases: ["anti-file"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "(Đã gỡ) Chống gửi file trong nhóm",
  category: "Nhóm",
  usage: "antifile on/off/status [onlyDangerous on/off] [autokick on/off]",
  cooldowns: 3
};

function ensure(data = {}) {
  if (!data.antiFile || typeof data.antiFile !== "object") {
    data.antiFile = { enabled: false, onlyDangerous: true, autoKick: true, whitelist: [] };
  }
  const c = data.antiFile;
  if (typeof c.enabled !== "boolean") c.enabled = false;
  if (typeof c.onlyDangerous !== "boolean") c.onlyDangerous = true;
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

  return api.sendMessage("⚠️ AntiFile đã bị gỡ theo cấu hình bot.", threadId, type);

  if (!Threads?.getData || !Threads?.setData) {
    return api.sendMessage("❌ Thiếu Threads storage.", threadId, type);
  }

  const action = args.length ? String(args[0] || "status").toLowerCase() : "toggle";
  const row = await Threads.getData(threadId);
  const tData = ensure(row?.data || {});
  const c = tData.antiFile;

  if (action === "toggle") {
    c.enabled = !c.enabled;
    c.autoKick = true;
    c.updatedBy = String(data?.uidFrom || event?.authorId || "");
    c.updatedAt = Date.now();
    await Threads.setData(threadId, tData);
    return api.sendMessage(`✅ AntiFile ${c.enabled ? "BẬT" : "TẮT"}. (autokick: ON)`, threadId, type);
  }

  if (action === "status") {
    return api.sendMessage(
      `🛡️ AntiFile: ${c.enabled ? "🟢 BẬT" : "🔴 TẮT"}\n• onlyDangerous: ${c.onlyDangerous ? "ON" : "OFF"}\n• autokick: ${c.autoKick ? "ON" : "OFF"}`,
      threadId,
      type
    );
  }

  const enable = ["on", "bat", "bật", "1", "enable"].includes(action)
    ? true
    : ["off", "tat", "tắt", "0", "disable"].includes(action)
      ? false
      : !c.enabled;

  const onlyDangerous = parseToggle(args[1]);
  const autoKick = parseToggle(args[2]);

  c.enabled = enable;
  if (onlyDangerous != null) c.onlyDangerous = onlyDangerous;
  if (autoKick != null) c.autoKick = autoKick;
  c.updatedBy = String(data?.uidFrom || event?.authorId || "");
  c.updatedAt = Date.now();

  await Threads.setData(threadId, tData);
  return api.sendMessage(`✅ AntiFile ${c.enabled ? "BẬT" : "TẮT"}.`, threadId, type);
};
