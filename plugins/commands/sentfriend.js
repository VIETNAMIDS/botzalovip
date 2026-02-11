const fs = require("fs");
const { createSentFriendDashboard, cleanupSentFriendFiles } = require("../utils/sentFriendRenderer");

module.exports.config = {
  name: "sentfriend",
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Liệt kê các lời mời kết bạn đã gửi (pending).",
  category: "Quản lý",
  usage: "sentfriend [số lượng tối đa hiển thị]",
  cooldowns: 5
};

const MAX_ITEMS = 50;
const DEFAULT_LIMIT = 10;

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist].map(String));
  return all.has(String(uid));
}

function getErrorCode(error) {
  return error?.code ||
    error?.error_code ||
    error?.response?.data?.error_code ||
    error?.response?.status ||
    null;
}

function parseLimit(raw) {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_ITEMS);
}

function formatTimestamp(ts) {
  if (!ts && ts !== 0) return "Không xác định";
  const date = new Date(Number(ts));
  if (Number.isNaN(date.getTime())) return "Không xác định";
  return date.toLocaleString("vi-VN", { hour12: false });
}

function formatEntry(info, index) {
  const name = info.displayName || info.zaloName || "Không tên";
  const message = info.fReqInfo?.message || "(không có lời nhắn)";
  const src = info.fReqInfo?.src ?? "Không rõ";
  const time = formatTimestamp(info.fReqInfo?.time);
  return [
    `#${index + 1}. ${name}`,
    `• UID: ${info.userId}`,
    `• Lời nhắn: ${message}`,
    `• Nguồn: ${src}`,
    `• Thời gian gửi: ${time}`
  ].join("\n");
}

function parseArgs(args = []) {
  const result = {
    page: 1,
    limit: DEFAULT_LIMIT
  };

  if (!args || args.length === 0) return result;

  const first = args[0];
  const second = args[1];

  if (first === "page") {
    result.page = Math.max(1, parseInt(second, 10) || 1);
    result.limit = parseLimit(args[2]);
  } else if (!Number.isNaN(Number(first))) {
    result.limit = parseLimit(first);
  }

  return result;
}

function buildHelpMessage() {
  return [
    "📖 Hướng dẫn sentfriend:",
    "",
    "• `sentfriend` → Trang 1, hiển thị 10 yêu cầu mới nhất.",
    "• `sentfriend 20` → Trang 1, hiển thị 20 yêu cầu.",
    "• `sentfriend page 2` → Trang 2, hiển thị 10 yêu cầu.",
    "• `sentfriend page 3 15` → Trang 3, mỗi trang 15 yêu cầu.",
    "",
    "Tips:",
    "• Dữ liệu luôn sắp từ mới → cũ.",
    "• Dashboard ảnh tự cập nhật theo trang.",
    "• Giới hạn tối đa 50 yêu cầu mỗi trang."
  ].join("\n");
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  if (args[0] === "help") {
    return api.sendMessage(buildHelpMessage(), threadId, type);
  }

  if (typeof api.getSentFriendRequest !== "function") {
    return api.sendMessage(
      "⚠️ API getSentFriendRequest không khả dụng trên phiên bản bot hiện tại.",
      threadId,
      type
    );
  }

  const { page, limit } = parseArgs(args);

  let tempFiles = [];
  try {
    const response = await api.getSentFriendRequest();
    const entries = Object.values(response || {});

    if (entries.length === 0) {
      return api.sendMessage("✅ Bạn không có lời mời kết bạn nào đang chờ phản hồi.", threadId, type);
    }

    const sorted = entries
      .map((item, idx) => ({
        ...item,
        index: idx + 1,
        userId: item.userId,
        name: item.displayName || item.zaloName || `UID ${item.userId}`,
        avatar: item.avatar,
        message: item.fReqInfo?.message || "",
        src: item.fReqInfo?.src ?? null,
        time: item.fReqInfo?.time ?? null
      }))
      .sort((a, b) => (b?.time || 0) - (a?.time || 0));

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const pageEntries = sorted.slice(start, start + limit);

    pageEntries.forEach((item, idx) => {
      item.index = idx + 1;
    });

    let attachmentPayloads = [];
    if (typeof createSentFriendDashboard === "function") {
      try {
        const dashboard = await createSentFriendDashboard(pageEntries, {
          total: total,
          page: safePage,
          totalPages
        });
        tempFiles.push(dashboard.filePath);
        attachmentPayloads.push({
          data: dashboard.buffer,
          filename: dashboard.fileName,
          metadata: {
            width: dashboard.width,
            height: dashboard.height,
            totalSize: dashboard.buffer.length
          }
        });
      } catch (renderErr) {
        console.error("[SENTFRIEND] Lỗi tạo ảnh dashboard:", renderErr);
      }
    }

    const formatted = pageEntries.map((info, idx) => formatEntry(info, start + idx)).join("\n\n");
    const extra = totalPages > 1
      ? `\n\nTrang ${safePage}/${totalPages} • Dùng: sentfriend page <số> [limit]`
      : "";

    const payload = attachmentPayloads.length
      ? { msg: "", attachments: attachmentPayloads }
      : `📤 Danh sách lời mời đã gửi (${start + pageEntries.length}/${total}):\n\n${formatted}${extra}`;

    const result = await api.sendMessage(payload, threadId, type);

    if (tempFiles.length && typeof cleanupSentFriendFiles === "function") {
      setTimeout(() => cleanupSentFriendFiles(tempFiles), 5000);
    }

    return result;
  } catch (error) {
    const code = getErrorCode(error);
    console.error("[SENTFRIEND] Lỗi:", error);
    return api.sendMessage(
      `❌ Không thể lấy danh sách lời mời đã gửi.\n• Mã lỗi: ${code ?? "Không xác định"}\n• Chi tiết: ${error?.message || String(error)}`,
      threadId,
      type
    );
  }
};
