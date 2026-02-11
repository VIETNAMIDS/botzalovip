const { convertTimestamp } = require("../../utils/index");
const childRental = require("../../utils/childRental");

module.exports.config = {
  name: "childgiahan",
  aliases: ["giahan", "renewchild", "childrenew"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Gia hạn thời gian thuê bot con (admin/owner)",
  category: "Admin",
  usage: "childgiahan <childKey> <thời lượng> [--note <ghi chú>]",
  cooldowns: 3
};

module.exports.onLoad = async () => {
  try {
    childRental.ensureWatcher();
  } catch (error) {
    console.warn(`[childgiahan] onLoad error: ${error?.message || error}`);
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

const extendRental = childRental.extendRental || ((childKey, additionalDurationMs, options = {}) => {
  const amount = Number(additionalDurationMs);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Thời lượng gia hạn phải lớn hơn 0");
  }

  const existing = childRental.getRental(childKey);
  if (!existing) {
    throw new Error("Chưa có thông tin thuê cho bot con này");
  }

  const now = Date.now();
  const base = typeof existing.expireAt === "number" && existing.expireAt > now ? existing.expireAt : now;
  const newExpireAt = base + amount;

  const noteValue = options.note !== undefined ? options.note : existing.note;

  const payload = {
    childKey,
    expireAt: newExpireAt,
    durationMs: (Number(existing.durationMs) || 0) + amount,
    durationText: options.durationText || existing.durationText,
    createdAt: existing.createdAt || now,
    createdBy: existing.createdBy || options.extendedBy || null,
    createdThreadId: options.extendedThreadId || existing.createdThreadId || null,
    createdThreadType: options.extendedThreadType || existing.createdThreadType || null,
    note: noteValue
  };

  const record = childRental.setRental(childKey, payload);
  if (record) {
    record.lastRenewAt = now;
    record.lastRenewBy = options.extendedBy ? String(options.extendedBy) : existing.lastRenewBy || existing.createdBy || null;
  }
  return record;
});

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
      "📝 Cách dùng: childgiahan <childKey> <thời lượng>",
      "   • Đơn vị: s (giây), m (phút), h (giờ), d (ngày)",
      "   • Ví dụ: childgiahan child1 2h",
      "   • Thêm ghi chú: childgiahan child1 3d --note gia hạn cho khách A"
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

  const existing = childRental.getRental(childKey);
  if (!existing) {
    return api.sendMessage(`⚠️ Chưa thiết lập thuê cho ${childKey === CHILD_KEY_DEFAULT ? "default" : childKey}. Vui lòng dùng childthue trước.`, threadId, type);
  }

  const prevExpire = typeof existing.expireAt === "number" ? existing.expireAt : null;
  const prevExpireText = prevExpire ? convertTimestamp(prevExpire) : "Không xác định";
  const prevRemaining = prevExpire ? Math.max(0, prevExpire - Date.now()) : 0;

  try {
    const updated = extendRental(childKey, parsedDuration.ms, {
      durationText: parsedDuration.text,
      extendedBy: senderId,
      extendedThreadId: threadId,
      extendedThreadType: type,
      note: note !== null ? note : undefined
    });

    const newExpireText = convertTimestamp(updated.expireAt);
    const newRemaining = formatRemaining(updated.expireAt - Date.now());

    const lines = [
      "✅ Đã gia hạn thuê bot con!",
      `🤖 Bot: ${childKey === CHILD_KEY_DEFAULT ? "default" : childKey}`,
      `➕ Thêm: ${parsedDuration.text}`,
      `🕒 Hết hạn cũ: ${prevExpireText}${prevRemaining ? ` (còn ${formatRemaining(prevRemaining)})` : ""}`,
      `⏳ Hết hạn mới: ${newExpireText} (còn ${newRemaining})`,
      existing.locked ? "🔓 Bot đã được mở khóa lại." : null,
      note ? `🗒️ Ghi chú mới: ${note}` : null
    ].filter(Boolean);

    return api.sendMessage(lines.join("\n"), threadId, type);
  } catch (error) {
    const message = error?.message || String(error);
    return api.sendMessage(`⚠️ Không thể gia hạn: ${message}`, threadId, type);
  }
};
