const { updateConfigArray } = require("../../utils/index");

module.exports.config = {
  name: "childgrant",
  aliases: ["grantchild", "childadmin"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Thêm UID vào quyền admin/owner của bot con",
  category: "Admin",
  usage: "childgrant <uid1> [uid2 ...]",
  cooldowns: 3
};

function normalizeUid(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!/^\d{5,}$/.test(trimmed)) return null;
  return trimmed;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") {
    return;
  }

  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  let owners = [];
  const ownersConf = cfg.owner_bot;
  if (Array.isArray(ownersConf)) owners = ownersConf.map(String);
  else if (typeof ownersConf === "string" && ownersConf.trim()) owners = [ownersConf.trim()];

  const id = String(senderId || "");
  const isAdmin = id && (admins.includes(id) || owners.includes(id));
  if (!isAdmin) {
    return api.sendMessage("🚫 Bạn không có quyền sử dụng lệnh này.", threadId, type);
  }

  if (!Array.isArray(args) || args.length === 0) {
    return api.sendMessage("⚠️ Vui lòng cung cấp ít nhất 1 UID.", threadId, type);
  }

  const validUids = args
    .map(normalizeUid)
    .filter(Boolean);

  if (validUids.length === 0) {
    return api.sendMessage("❌ Không có UID hợp lệ.", threadId, type);
  }

  let addedAdmin = [];
  let addedOwner = [];

  for (const uid of validUids) {
    if (!admins.includes(uid)) {
      admins.push(uid);
      addedAdmin.push(uid);
    }
    if (!owners.includes(uid)) {
      owners.push(uid);
      addedOwner.push(uid);
    }
  }

  cfg.admin_bot = admins;
  cfg.owner_bot = owners;
  global.users.admin = admins;
  global.users.owner = owners;

  try {
    updateConfigArray("admin_bot", admins);
  } catch (err) {
    // ignore but log to console for debugging
    console.warn("[childgrant] Không thể ghi admin_bot vào config:", err?.message || err);
  }

  try {
    updateConfigArray("owner_bot", owners);
  } catch (err) {
    console.warn("[childgrant] Không thể ghi owner_bot vào config:", err?.message || err);
  }

  const lines = [
    "✅ Đã cập nhật quyền cho bot con!",
    addedAdmin.length ? `• Admin thêm mới: ${addedAdmin.join(", ")}` : "• Admin: không có UID mới",
    addedOwner.length ? `• Owner thêm mới: ${addedOwner.join(", ")}` : "• Owner: không có UID mới",
    "",
    `Danh sách admin hiện tại: ${admins.join(", ")}`,
    `Danh sách owner hiện tại: ${owners.join(", ")}`
  ];

  return api.sendMessage({ msg: lines.join("\n") }, threadId, type);
};
