const TTL = 60000;
const MAX_ITEMS = 50;
const DEFAULT_LIMIT = 10;
const ACCEPT_MAX_TARGETS = 30;
const ACCEPT_DELAY_MS = 350;

module.exports.config = {
  name: "showall",
  aliases: ["friendrequests", "reqs", "invites"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Hiển thị danh sách lời mời kết bạn đang chờ xử lý.",
  category: "Quản lý",
  usage: "showall [limit]|showall page <số> [limit]",
  cooldowns: 5
};

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist].map(String));
  return all.has(String(uid));
}

function parseLimit(raw) {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_ITEMS);
}

function parseArgs(args = []) {
  if (!Array.isArray(args) || args.length === 0) {
    return { page: 1, limit: DEFAULT_LIMIT };
  }

  const first = args[0];
  const second = args[1];

  if (String(first).toLowerCase() === "page") {
    return {
      page: Math.max(1, parseInt(second, 10) || 1),
      limit: parseLimit(args[2])
    };
  }

  if (!Number.isNaN(Number(first))) {
    return { page: 1, limit: parseLimit(first) };
  }

  return { page: 1, limit: DEFAULT_LIMIT };
}

function formatTimestamp(ts) {
  if (!ts && ts !== 0) return "Không xác định";
  const date = new Date(Number(ts));
  if (Number.isNaN(date.getTime())) return "Không xác định";
  return date.toLocaleString("vi-VN", { hour12: false });
}

const SOURCE_MAP = {
  0: "Không rõ",
  1: "Đề xuất từ hệ thống",
  2: "Bạn bè chung",
  3: "QR/Zalo Link",
  4: "Nhóm/Zalo OA",
  5: "Tìm kiếm",
  6: "Danh bạ"
};

function resolveSource(info = {}) {
  const raw = info.source ?? info.recommSrc;
  if (raw === undefined || raw === null) return "Không rõ";
  return SOURCE_MAP[raw] || `Nguồn #${raw}`;
}

function resolveStatus(status, isSeen) {
  if (typeof status === "string" && status.trim()) {
    return status;
  }
  if (isSeen === true) return "Đã xem";
  if (isSeen === false) return "Chưa xem";
  return "Chưa xác định";
}

function formatEntry(info, index) {
  const name = info.displayName || info.zaloName || "Không tên";
  const message = info.recommInfo?.message || "(không có lời nhắn)";
  const status = resolveStatus(info.status, info.isSeenFriendReq);
  const source = resolveSource(info.recommInfo || info);
  const time = formatTimestamp(info.recommTime || info.recommInfo?.time || info.dob);

  return [
    `#${index + 1}. ${name}`,
    `• UID: ${info.userId || "Không rõ"}`,
    `• Trạng thái: ${status}`,
    `• Lời nhắn: ${message}`,
    `• Nguồn: ${source}`,
    `• Thời gian: ${time}`
  ].join("\n");
}

function buildHelpMessage(prefix = "showall") {
  return [
    "📖 Hướng dẫn showall:",
    "",
    `• \`${prefix}\` → Hiển thị 10 lời mời mới nhất.`,
    `• \`${prefix} 20\` → Hiển thị 20 lời mời mới nhất.`,
    `• \`${prefix} page 2\` → Trang 2, mặc định 10 mục.`,
    `• \`${prefix} page 3 15\` → Trang 3, mỗi trang 15 yêu cầu.`,
    `• \`${prefix} accept <index|uid|all>\` → Chấp nhận lời mời cụ thể.`,
    `• \`${prefix} accept 1 3\` → Chấp nhận theo số thứ tự trong danh sách.`,
    `• \`${prefix} accept all\` → Chấp nhận tối đa ${ACCEPT_MAX_TARGETS} lời mời mới nhất.`,
    "",
    "Tips:",
    "• Danh sách sắp xếp mới nhất lên trước.",
    "• Giới hạn tối đa 50 yêu cầu mỗi trang.",
    "• Chỉ admin/owner bot mới dùng được lệnh.",
    "• Có thể tag người dùng để chấp nhận nhanh (nếu có trong danh sách)."
  ].join("\n");
}

function getErrorCode(error) {
  return error?.code ||
    error?.error_code ||
    error?.response?.data?.error_code ||
    error?.response?.status ||
    null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeUidCandidate(value) {
  if (!value && value !== 0) return null;
  const digits = String(value).replace(/[^\d]/g, "");
  return digits.length >= 12 ? digits : null;
}

function extractMentionUids(data = {}) {
  const mentions = Array.isArray(data.mentions) ? data.mentions : [];
  return mentions
    .map(item => sanitizeUidCandidate(item?.uid || item?.id))
    .filter(Boolean);
}

function resolveAcceptTargets(tokens = [], data = {}, entries = []) {
  const entryMap = new Map();
  entries.forEach(item => {
    const uid = sanitizeUidCandidate(item?.userId);
    if (uid) entryMap.set(uid, item);
  });

  const total = entries.length;
  const normalizedTokens = tokens.map(token => String(token || "").trim()).filter(Boolean);
  const results = new Set();
  const notes = [];

  const wantsAll = normalizedTokens.some(token => token.toLowerCase() === "all");
  if (wantsAll) {
    entries.forEach(item => {
      const uid = sanitizeUidCandidate(item?.userId);
      if (uid) results.add(uid);
    });
  }

  const mentionUids = extractMentionUids(data);
  mentionUids.forEach(uid => {
    results.add(uid);
    if (!entryMap.has(uid)) {
      notes.push(`• UID ${uid} không nằm trong danh sách lời mời, vẫn thử chấp nhận.`);
    }
  });

  normalizedTokens.forEach(token => {
    if (token.toLowerCase() === "all") return;
    const digits = token.replace(/[^\d]/g, "");
    if (!digits) {
      notes.push(`• Bỏ qua tham số không hợp lệ: "${token}".`);
      return;
    }

    if (digits.length >= 12) {
      results.add(digits);
      if (!entryMap.has(digits)) {
        notes.push(`• UID ${digits} không nằm trong danh sách lời mời, vẫn thử chấp nhận.`);
      }
      return;
    }

    const index = Number(digits);
    if (!Number.isNaN(index) && index >= 1 && index <= total) {
      const entry = entries[index - 1];
      const uid = sanitizeUidCandidate(entry?.userId);
      if (uid) results.add(uid);
      return;
    }

    notes.push(`• Chỉ số ${token} không hợp lệ (giá trị hợp lệ: 1-${total}).`);
  });

  return {
    targetUids: [...results],
    notes
  };
}

async function fetchPendingEntries(api) {
  const response = await api.getReceivedFriendRequests();
  const items = Array.isArray(response?.recommItems) ? response.recommItems : [];
  const entries = items
    .map(item => item?.dataInfo)
    .filter(Boolean)
    .sort((a, b) => (b?.recommTime || 0) - (a?.recommTime || 0));

  return { entries, response };
}

function formatFailureDetails(failures = [], entryMap = new Map()) {
  if (!failures.length) return "";
  const lines = failures.slice(0, 5).map(({ uid, code, message }) => {
    const name = entryMap.get(uid)?.displayName || entryMap.get(uid)?.zaloName || "(không rõ)";
    return `• UID ${uid} (${name}) → lỗi ${code ?? "?"}: ${message}`;
  });
  const extra = failures.length > 5 ? `\n(… ${failures.length - 5} lỗi khác)` : "";
  return `\n❗ Chi tiết lỗi:\n${lines.join("\n")}${extra}`;
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  const prefix = global?.config?.prefix || "/";

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  const primaryArg = (args?.[0] || "").toLowerCase();

  if ((args?.[0] || "").toLowerCase() === "help") {
    return api.sendMessage(buildHelpMessage(`${prefix}showall`), threadId, type);
  }

  if (typeof api.getReceivedFriendRequests !== "function") {
    return api.sendMessage(
      "⚠️ API getReceivedFriendRequests không khả dụng trên phiên bản bot hiện tại.",
      threadId,
      type
    );
  }

  if (primaryArg === "accept") {
    if (typeof api.acceptFriendRequest !== "function") {
      return api.sendMessage(
        "⚠️ API acceptFriendRequest không khả dụng trên phiên bản bot hiện tại.",
        threadId,
        type
      );
    }

    const acceptTokens = args.slice(1);

    try {
      const { entries } = await fetchPendingEntries(api);

      if (entries.length === 0) {
        return api.sendMessage("✅ Không có lời mời nào để chấp nhận.", threadId, type);
      }

      const { targetUids, notes } = resolveAcceptTargets(acceptTokens, data, entries);

      if (!targetUids.length) {
        return api.sendMessage(
          [
            "⚠️ Bạn cần cung cấp ít nhất một UID hoặc số thứ tự hợp lệ.",
            `Ví dụ: ${prefix}showall accept 1 2`,
            `Hoặc: ${prefix}showall accept all`
          ].join("\n"),
          threadId,
          type
        );
      }

      const entryMap = new Map(entries.map(item => [sanitizeUidCandidate(item?.userId), item]));

      let limitNotice = "";
      let batch = targetUids;
      if (targetUids.length > ACCEPT_MAX_TARGETS) {
        batch = targetUids.slice(0, ACCEPT_MAX_TARGETS);
        limitNotice = `\n⚠️ Giới hạn xử lý ${ACCEPT_MAX_TARGETS} UID/lệnh, chỉ chấp nhận ${ACCEPT_MAX_TARGETS} mục đầu tiên.`;
      }

      let success = 0;
      const failures = [];

      for (const uid of batch) {
        if (!uid) continue;
        try {
          await api.acceptFriendRequest(uid);
          success++;
        } catch (error) {
          failures.push({
            uid,
            code: getErrorCode(error),
            message: error?.message || String(error)
          });
        }
        await delay(ACCEPT_DELAY_MS);
      }

      const failureDetails = formatFailureDetails(failures, entryMap);
      const warnings = notes.length ? `⚠️ Ghi chú:\n${notes.join("\n")}\n\n` : "";
      const footer = batch.length < targetUids.length
        ? `\n\nℹ️ Bị bỏ qua ${targetUids.length - batch.length} UID do giới hạn.`
        : "";

      const title = failures.length === batch.length
        ? "❌ Không thể chấp nhận các lời mời mong muốn."
        : "✅ Đã xử lý chấp nhận lời mời.";

      return api.sendMessage(
        `${warnings}${title}\n• Đã thử: ${batch.length}\n• Thành công: ${success}\n• Thất bại: ${failures.length}${failureDetails}${limitNotice}${footer}`,
        threadId,
        type
      );
    } catch (error) {
      const code = getErrorCode(error);
      console.error("[SHOWALL ACCEPT] Lỗi:", error);
      return api.sendMessage(
        `❌ Không thể xử lý chấp nhận lời mời.\n• Mã lỗi: ${code ?? "Không xác định"}\n• Chi tiết: ${error?.message || String(error)}`,
        threadId,
        type
      );
    }
  }

  const { page, limit } = parseArgs(args);

  try {
    const { entries } = await fetchPendingEntries(api);

    if (entries.length === 0) {
      return api.sendMessage("✅ Hiện bạn không có lời mời kết bạn nào đang chờ xử lý.", threadId, type);
    }

    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const pageEntries = entries.slice(start, start + limit);

    const formatted = pageEntries
      .map((info, idx) => formatEntry(info, start + idx))
      .join("\n\n");

    const extra = totalPages > 1
      ? `\n\nTrang ${safePage}/${totalPages} • Dùng: ${prefix}showall page <số> [limit]`
      : "";

    return api.sendMessage(
      `📥 Lời mời kết bạn đang chờ (${start + pageEntries.length}/${total}):\n\n${formatted}${extra}`,
      threadId,
      type
    );
  } catch (error) {
    const code = getErrorCode(error);
    console.error("[SHOWALL] Lỗi:", error);
    return api.sendMessage(
      `❌ Không thể lấy danh sách lời mời kết bạn.\n• Mã lỗi: ${code ?? "Không xác định"}\n• Chi tiết: ${error?.message || String(error)}`,
      threadId,
      type
    );
  }
};
