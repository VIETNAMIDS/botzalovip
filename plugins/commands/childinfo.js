const path = require("path");
const fs = require("fs");
const { convertTimestamp } = require("../../utils/index");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "child_login_history.json");
const SESSION_FILE = path.join(DATA_DIR, "child_session.json");

module.exports.config = {
  name: "childinfo",
  aliases: ["botinfo", "infochild"],
  version: "2.0.0",
  role: 2,
  author: "Cascade",
  description: "Hiển thị thông tin tài khoản đang đăng nhập bot con (đa bot)",
  category: "Admin",
  usage: "childinfo [childKey]",
  cooldowns: 3
};

const CHILD_KEY_DEFAULT = "__default";

function normalizeChildKey(rawKey) {
  const trimmed = String(rawKey || "").trim();
  if (!trimmed) return CHILD_KEY_DEFAULT;
  if (trimmed === CHILD_KEY_DEFAULT || trimmed.toLowerCase() === "default") {
    return CHILD_KEY_DEFAULT;
  }
  const normalized = trimmed
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  return normalized || CHILD_KEY_DEFAULT;
}

function formatChildLabel(childKey = CHILD_KEY_DEFAULT) {
  return childKey === CHILD_KEY_DEFAULT ? "bot con mặc định" : `bot con \"${childKey}\"`;
}

function getChildState(childKey = CHILD_KEY_DEFAULT) {
  if (!global.__childBots) return null;
  return global.__childBots[normalizeChildKey(childKey)] || null;
}

function getHistoryFilePath(childKey = CHILD_KEY_DEFAULT) {
  if (childKey === CHILD_KEY_DEFAULT) {
    return HISTORY_FILE;
  }
  const childDir = path.join(DATA_DIR, "childbots", childKey);
  return path.join(childDir, "history.json");
}

function getSessionFilePath(childKey = CHILD_KEY_DEFAULT) {
  if (childKey === CHILD_KEY_DEFAULT) {
    return SESSION_FILE;
  }
  const childDir = path.join(DATA_DIR, "childbots", childKey);
  return path.join(childDir, "session.json");
}

function readHistory(childKey = CHILD_KEY_DEFAULT) {
  try {
    const filePath = getHistoryFilePath(childKey);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readSession(childKey = CHILD_KEY_DEFAULT) {
  try {
    const filePath = getSessionFilePath(childKey);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.cookie && parsed.imei) return parsed;
    return null;
  } catch {
    return null;
  }
}

module.exports.run = async ({ api, event, args = [] }) => {
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

  const childKey = normalizeChildKey(args[0]);
  const state = getChildState(childKey);
  if (!state || !state.api) {
    return api.sendMessage(`ℹ️ ${formatChildLabel(childKey)} hiện chưa được khởi động.`, threadId, type);
  }

  let accountInfo = state.accountInfo || null;
  if (typeof state.api.fetchAccountInfo === "function") {
    try {
      const fetched = await state.api.fetchAccountInfo();
      if (fetched && typeof fetched === "object") {
        accountInfo = fetched;
        state.accountInfo = fetched;
      }
    } catch (error) {
      console.warn(`[childinfo] Không thể fetch account info: ${error?.message || error}`);
    }
  }

  const uid = accountInfo?.uid || accountInfo?.userId || accountInfo?.user_id || state.api?.ctx?.userId || state.loginInfo?.uid || "Không rõ";
  const displayName = accountInfo?.displayName || accountInfo?.name || accountInfo?.display_name || state.api?.ctx?.displayName || state.loginInfo?.displayName || "Không rõ";
  const avatar = accountInfo?.avatarUrl || accountInfo?.avatar || state.api?.ctx?.avatar || "Không rõ";

  const lastLogin = state.loginTime || state.api?.ctx?.lastLoginTime || state.api?.ctx?.loginTime;
  const lastLoginStr = lastLogin ? convertTimestamp(lastLogin) : "Không rõ";

  const adminsList = (global.config?.admin_bot || []).map(String).join(", ") || "(trống)";
  const ownersList = (global.config?.owner_bot || []).map(String).join(", ") || "(trống)";

  const history = readHistory(childKey);
  const lastEntries = history.slice(-5).reverse();
  const historyLines = lastEntries.length
    ? lastEntries.map((entry, index) => {
        const timeStr = entry.timestamp ? convertTimestamp(entry.timestamp) : "Không rõ";
        const display = entry.displayName || entry.uid || "Không rõ";
        const startedBy = entry.startedBy ? ` • bởi ${entry.startedBy}` : "";
        return `${index + 1}. ${display} (${entry.uid || "?"}) • ${timeStr}${startedBy}`;
      })
    : ["(chưa có lịch sử)"];

  const sessionInfo = readSession(childKey);
  const sessionStatus = sessionInfo?.loginTime
    ? `Đã lưu từ ${convertTimestamp(sessionInfo.loginTime)}`
    : sessionInfo ? "Đã lưu" : "Chưa lưu";

  const lines = [
    `🤖 THÔNG TIN ${formatChildLabel(childKey).toUpperCase()}`,
    "────────────────",
    `👤 Tên hiển thị: ${displayName}`,
    `🆔 UID: ${uid}`,
    `🖼️ Avatar: ${avatar}`,
    `🕒 Đăng nhập: ${lastLoginStr}`,
    "",
    "🔐 Quyền hạn hiện tại:",
    `• Admin bot: ${adminsList}`,
    `• Owner bot: ${ownersList}`,
    "",
    `📂 File QR lần cuối: ${state.qrFilePath ? path.relative(path.join(__dirname, "..", ".."), state.qrFilePath) : "(đã xoá)"}`,
    `💾 Session lưu: ${sessionStatus}`,
    "",
    "🕘 Lịch sử đăng nhập gần nhất:",
    ...historyLines,
    "",
    "ℹ️ Lệnh này chỉ hiển thị thông tin nội bộ; không chia sẻ ra ngoài."
  ];

  return api.sendMessage({ msg: lines.join("\n") }, threadId, type);
};
