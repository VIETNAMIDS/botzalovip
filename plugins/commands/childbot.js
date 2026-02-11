const { ThreadType } = require("zca-js");
const { getChild, readRegistry, setCustomName, resolveBestName, normalizeChildKey } = require("../utils/childbotRegistry");

const startchild = require("./startchild.js");
const stopchild = require("./stopchild.js");
const childinfo = require("./childinfo.js");

module.exports.config = {
  name: "childbot",
  aliases: ["cb"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Quản lý bot con (start/stop/restart/list/info/name)",
  category: "Admin",
  usage: "childbot <list|info|start|stop|restart|name> [childKey] [args...]",
  cooldowns: 3
};

function isAdmin(senderId) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  let owners = [];
  const ownersConf = cfg.owner_bot;
  if (Array.isArray(ownersConf)) owners = ownersConf.map(String);
  else if (typeof ownersConf === "string" && ownersConf.trim()) owners = [ownersConf.trim()];

  const id = String(senderId || "");
  return id && (admins.includes(id) || owners.includes(id));
}

function isChildRunning(childKey) {
  const key = normalizeChildKey(childKey);
  const state = global.__childBots?.[key];
  return Boolean(state?.api);
}

function formatChildKeyLabel(childKey) {
  const key = normalizeChildKey(childKey);
  return key === "__default" ? "bot con mặc định" : `bot con \"${key}\"`;
}

async function sendList(api, threadId, type) {
  const registry = readRegistry();
  const keys = Object.keys(registry);

  if (keys.length === 0) {
    return api.sendMessage("ℹ️ Chưa có bot con nào trong registry. Hãy dùng startchild để đăng nhập.", threadId, type);
  }

  const lines = [];
  lines.push("📋 DANH SÁCH BOT CON (REGISTRY)");
  lines.push("────────────────");

  keys.sort().forEach((key, idx) => {
    const entry = registry[key];
    const bestName = resolveBestName(entry, null) || "(chưa đặt tên)";
    const uid = entry?.uid || "?";
    const status = isChildRunning(key) ? "🟢 online" : "⚫ offline";
    lines.push(`${idx + 1}. ${key} • ${status}`);
    lines.push(`   👤 Tên: ${bestName}`);
    lines.push(`   🆔 UID: ${uid}`);
  });

  lines.push("", "ℹ️ Dùng: childbot info <key> | childbot name <key> <tên> | childbot start/stop/restart <key>");

  return api.sendMessage({ msg: lines.join("\n") }, threadId, type);
}

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") {
    return;
  }

  if (!isAdmin(senderId)) {
    return api.sendMessage("🚫 Bạn không có quyền sử dụng lệnh này.", threadId, type);
  }

  const sub = String(args[0] || "list").toLowerCase();

  if (sub === "list") {
    return sendList(api, threadId, type);
  }

  if (sub === "info") {
    const key = normalizeChildKey(args[1]);
    return childinfo.run({ api, event, args: [key] });
  }

  if (sub === "name") {
    const key = normalizeChildKey(args[1]);
    const newName = args.slice(2).join(" ").trim();
    if (!newName) {
      return api.sendMessage(`⚠️ Cú pháp: childbot name <childKey> <tên mới>`, threadId, type);
    }

    const updated = setCustomName(key, newName);
    const bestName = resolveBestName(updated, null) || newName;
    return api.sendMessage(`✅ Đã đặt tên cho ${formatChildKeyLabel(key)}: ${bestName}`, threadId, type);
  }

  if (sub === "start") {
    const key = normalizeChildKey(args[1]);
    const mode = String(args[2] || "session").toLowerCase();
    const startArgs = [key];
    if (mode === "qr") startArgs.push("qr");
    else startArgs.push("session");
    return startchild.run({ api, event, args: startArgs });
  }

  if (sub === "stop") {
    const key = normalizeChildKey(args[1]);
    return stopchild.run({ api, event, args: [key] });
  }

  if (sub === "restart") {
    const key = normalizeChildKey(args[1]);
    if (!key) {
      return api.sendMessage("⚠️ Cú pháp: childbot restart <childKey>", threadId, type);
    }

    await api.sendMessage(`⏳ Đang restart ${formatChildKeyLabel(key)}...`, threadId, type);

    try {
      if (typeof stopchild.stopChildByKey === "function") {
        await stopchild.stopChildByKey(key);
      } else {
        await stopchild.run({ api, event, args: [key] });
      }
    } catch {
      // ignore stop errors
    }

    return startchild.run({ api, event, args: [key, "session"] });
  }

  return api.sendMessage(
    "⚠️ Lệnh không hợp lệ. Dùng: childbot list | info | name | start | stop | restart",
    threadId,
    type
  );
};
