const { childRental, convertTimestamp } = require("../../utils/index");

module.exports.config = {
  name: "childthue",
  aliases: ["rentchild", "childrent"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Thuê bot con trong thời gian nhất định, chỉ admin/owner sử dụng",
  category: "Admin",
  usage: "childthue <childKey> <duration> [--note <ghi chú>]",
  cooldowns: 3
};

module.exports.onLoad = async () => {
  try {
    childRental.ensureWatcher();
    await childRental.checkExpirations();
  } catch (error) {
    console.warn(`[childthue] onLoad error: ${error?.message || error}`);
  }
};

const CHILD_KEY_DEFAULT = "__default";
const DURATION_REGEX = /^([0-9]+(?:\.[0-9]+)?)([smhd])$/i;

function normalizeChildKey(rawKey) {
  const trimmed = String(rawKey || "").trim();
  if (!trimmed || trimmed === CHILD_KEY_DEFAULT) return CHILD_KEY_DEFAULT;
  const lowered = trimmed.toLowerCase();
  if (lowered === "default") return CHILD_KEY_DEFAULT;
  return lowered
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "") || CHILD_KEY_DEFAULT;
}

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

function getChildLoginInfo(childKey = CHILD_KEY_DEFAULT) {
  // Lấy thông tin rental để kiểm tra
  const rental = childRental.getRental(childKey);
  if (!rental) return null;

  // Trả về thông tin cơ bản từ rental
  return {
    childKey: normalizeChildKey(childKey),
    isActive: !rental.locked && rental.expireAt > Date.now()
  };
}

function parseDuration(token) {
  if (!token || typeof token !== "string") return null;
  const match = token.trim().match(DURATION_REGEX);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (Number.isNaN(value) || value <= 0) return null;
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "s":
      return { ms: value * 1000, text: `${value} giây` };
    case "m":
      return { ms: value * 60 * 1000, text: `${value} phút` };
    case "h":
      return { ms: value * 60 * 60 * 1000, text: `${value} giờ` };
    case "d":
      return { ms: value * 24 * 60 * 60 * 1000, text: `${value} ngày` };
    default:
      return null;
  }
}

function extractNote(args = []) {
  const tokens = [...args];
  const noteIndex = tokens.findIndex((token) => token === "--note" || token === "-n");
  if (noteIndex === -1) return { remaining: tokens, note: null };
  const noteParts = tokens.slice(noteIndex + 1);
  const note = noteParts.join(" ").trim();
  return {
    remaining: tokens.slice(0, noteIndex),
    note: note || null
  };
}

function formatRemaining(ms) {
  if (!ms || ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const sec = seconds % 60;
    return sec ? `${minutes}m${sec}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const min = minutes % 60;
    return min ? `${hours}h${min}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const hourPart = hours % 24;
  return hourPart ? `${days}d${hourPart}h` : `${days}d`;
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

  if (!Array.isArray(args) || args.length < 2) {
    const guide = [
      "❌ Thiếu tham số!",
      "📝 Cách dùng: childthue <childKey> <thời lượng>",
      "   • Đơn vị: s (giây), m (phút), h (giờ), d (ngày)",
      "   • Ví dụ: childthue child1 2d",
      "   • Thêm ghi chú: childthue child1 1h --note khách A"
    ].join("\n");
    return api.sendMessage(guide, threadId, type);
  }

  const { remaining: tokens, note } = extractNote(args);
  if (tokens.length < 2) {
    return api.sendMessage("❌ Thiếu childKey hoặc thời lượng.", threadId, type);
  }

  const childKey = normalizeChildKey(tokens[0]);
  const durationToken = tokens[1];
  const parsedDuration = parseDuration(durationToken);
  if (!parsedDuration) {
    return api.sendMessage("❌ Thời lượng không hợp lệ. Ví dụ: 30m, 2h, 1d", threadId, type);
  }

  const now = Date.now();
  const expireAt = now + parsedDuration.ms;
  const durationText = parsedDuration.text;

  // Get login information for the child bot
  const loginInfo = getChildLoginInfo(childKey);

  const payload = {
    childKey,
    expireAt,
    durationMs: parsedDuration.ms,
    durationText,
    createdAt: now,
    createdBy: senderId,
    createdThreadId: threadId,
    createdThreadType: type,
    note,
    loginInfo: loginInfo ? {
      uid: loginInfo.uid,
      displayName: loginInfo.displayName,
      avatar: loginInfo.avatar,
      lastLogin: loginInfo.lastLogin,
      isActive: loginInfo.isActive
    } : null
  };

  try {
    const record = childRental.setRental(childKey, payload);
    const expireAtStr = convertTimestamp(record.expireAt);
    const remainText = formatRemaining(record.expireAt - Date.now());

    const lines = [
      "✅ Đã thiết lập thuê bot con!",
      `🤖 Bot: ${childKey === CHILD_KEY_DEFAULT ? "default" : childKey}`,
      `⏳ Thời lượng: ${durationText}`,
      `🛑 Hết hạn lúc: ${expireAtStr} (còn ${remainText})`,
      note ? `🗒️ Ghi chú: ${note}` : null,
      "",
      loginInfo && loginInfo.isActive ? "👤 Thông tin đăng nhập:" : null,
      loginInfo?.displayName ? `└ Tên: ${loginInfo.displayName}` : null,
      loginInfo?.uid ? `└ UID: ${loginInfo.uid}` : null,
      loginInfo?.lastLogin ? `└ Đăng nhập cuối: ${convertTimestamp(loginInfo.lastLogin)}` : null,
      "",
      "ℹ️ Khi hết hạn bot sẽ tự động dừng và khoá truy cập."
    ].filter(Boolean);

    return api.sendMessage(lines.join("\n"), threadId, type);
  } catch (error) {
    const message = error?.message || String(error);
    return api.sendMessage(`⚠️ Không thể thiết lập thuê bot con: ${message}`, threadId, type);
  }
};
