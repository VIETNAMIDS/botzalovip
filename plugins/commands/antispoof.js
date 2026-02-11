const { ThreadType } = require("zca-js");

module.exports.config = {
  name: "antispoof",
  aliases: ["anti-spoof"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "(Đã gỡ) Chống giả mạo admin/mod (dạng header + kèm link) trong nhóm",
  category: "Nhóm",
  usage: "antispoof on/off/status [autokick on/off]",
  cooldowns: 3
};

function ensure(data = {}) {
  if (!data.antiSpoof || typeof data.antiSpoof !== "object") {
    data.antiSpoof = { enabled: false, autoKick: true, whitelist: [] };
  }
  const c = data.antiSpoof;
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

  return api.sendMessage("⚠️ AntiSpoof đã bị gỡ theo cấu hình bot.", threadId, type);

  if (!Threads?.getData || !Threads?.setData) {
    return api.sendMessage("❌ Thiếu Threads storage.", threadId, type);
  }

  const action = args.length ? String(args[0] || "status").toLowerCase() : "toggle";
  const row = await Threads.getData(threadId);
  const tData = ensure(row?.data || {});
  const c = tData.antiSpoof;

  if (action === "toggle") {
    c.enabled = !c.enabled;
    c.autoKick = true;
    c.updatedBy = String(data?.uidFrom || event?.authorId || "");
    c.updatedAt = Date.now();
    await Threads.setData(threadId, tData);
    return api.sendMessage(`✅ AntiSpoof ${c.enabled ? "BẬT" : "TẮT"}. (autokick: ON)`, threadId, type);
  }

  if (action === "status") {
    return api.sendMessage(
      `🛡️ AntiSpoof: ${c.enabled ? "🟢 BẬT" : "🔴 TẮT"}\n• autokick: ${c.autoKick ? "ON" : "OFF"}`,
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
  return api.sendMessage(`✅ AntiSpoof ${c.enabled ? "BẬT" : "TẮT"}.`, threadId, type);
};
