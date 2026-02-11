const isGroupLink = (value = "") => /zalo\.me\/g\//i.test(String(value || "").trim());

const extractGroupCode = (value = "") => {
  const match = String(value || "").trim().match(/zalo\.me\/g\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
};

const normalizeGroupLink = (value = "") => {
  const code = extractGroupCode(value);
  return code ? `https://zalo.me/g/${code}` : null;
};

const ERROR_CODE_MAP = {
  304: "Bạn chưa đăng nhập hoặc phiên đăng nhập của bot đã hết hạn.",
  401: "Bot thiếu quyền truy cập nhóm này.",
  403: "Link nhóm đã bị khóa hoặc bị đặt riêng tư.",
  604: "Link mời không hợp lệ hoặc đã hết hạn. Hãy yêu cầu chủ nhóm gửi lại link mới.",
};

const formatNumber = (num) => {
  if (typeof num !== "number") return "Không rõ";
  return num.toLocaleString("vi-VN");
};

const summarizeList = (items = [], limit = 5, formatter = (v) => v) => {
  if (!Array.isArray(items) || items.length === 0) return "Không có";
  const displayItems = items.slice(0, limit).map(formatter);
  const remaining = items.length - displayItems.length;
  return `${displayItems.join("\n")}${remaining > 0 ? `\n… và ${remaining} nữa` : ""}`;
};

module.exports.config = {
  name: "linkinfo",
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Lấy thông tin chi tiết của nhóm Zalo thông qua link mời.",
  category: "Tiện ích",
  usage: "linkinfo <link_zalo_group> [trang_thành_viên]",
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;

  if (typeof api.getGroupLinkInfo !== "function") {
    return api.sendMessage(
      "❌ API hiện tại chưa hỗ trợ getGroupLinkInfo. Vui lòng cập nhật bot hoặc thử lại sau.",
      threadId,
      type
    );
  }

  if (!args.length) {
    return api.sendMessage(
      "❌ Thiếu link nhóm Zalo.\n" +
        "Cách dùng: linkinfo https://zalo.me/g/abc123 [trang]\n" +
        "Ví dụ: linkinfo https://zalo.me/g/abc123 2",
      threadId,
      type
    );
  }

  const rawLink = args[0].trim();
  const normalizedLink = normalizeGroupLink(rawLink);
  const pageArg = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : 1;
  const memberPage = Math.max(1, Math.min(pageArg, 10));

  if (!normalizedLink) {
    return api.sendMessage(
      "❌ Link không hợp lệ. Vui lòng dùng định dạng: https://zalo.me/g/<mã_nhóm>",
      threadId,
      type
    );
  }

  try {
    const linkInfo = await api.getGroupLinkInfo({ link: normalizedLink, memberPage });
    const data = linkInfo?.data || linkInfo;

    if (!data?.groupId) {
      throw new Error("Không nhận được dữ liệu nhóm hợp lệ.");
    }

    const {
      groupId,
      name,
      desc,
      type: groupType,
      creatorId,
      avt,
      fullAvt,
      adminIds = [],
      currentMems = [],
      hasMoreMember,
      subType,
      totalMember,
      setting,
      globalId,
    } = data;

    const memberPreview = summarizeList(
      currentMems,
      5,
      (mem, index) =>
        `• ${mem.dName || mem.zaloName || "Người dùng"} (${mem.id || "?"}) - trạng thái ${mem.accountStatus}`
    );

    const adminsPreview = summarizeList(adminIds, 5, (id, index) => `• ${id}`);

    const message =
      `📌 THÔNG TIN NHÓM QUA LINK\n` +
      `🔗 Link: ${normalizedLink}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🆔 Group ID: ${groupId}\n` +
      `🌐 Global ID: ${globalId || "Không rõ"}\n` +
      `📝 Tên: ${name || "Không rõ"}\n` +
      `📣 Mô tả: ${desc || "Không có"}\n` +
      `📦 Loại: ${groupType ?? "Không rõ"} | SubType: ${subType ?? "Không rõ"}\n` +
      `👑 Chủ nhóm: ${creatorId || "Không rõ"}\n` +
      `🖼️ Avatar: ${fullAvt || avt || "Không có"}\n` +
      `👥 Tổng thành viên: ${formatNumber(totalMember || currentMems.length)}\n` +
      `📄 Trang thành viên hiện tại: ${memberPage} ${hasMoreMember === 1 ? "(còn trang sau)" : "(hết dữ liệu)"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👮 Admins:\n${adminsPreview}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👥 Thành viên hiển thị (trang ${memberPage}):\n${memberPreview}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚙️ Setting: ${setting ? JSON.stringify(setting) : "Không có dữ liệu"}`;

    return api.sendMessage(message, threadId, type);
  } catch (error) {
    console.error("[linkinfo] Lỗi lấy thông tin nhóm:", error);
    const errorCode = error?.code ?? error?.error_code;
    const friendlyMessage =
      ERROR_CODE_MAP[errorCode] ||
      error?.message ||
      "Không thể lấy thông tin nhóm do lỗi không xác định.";

    if (errorCode === 604 && memberPage > 1) {
      return api.sendMessage(
        "❌ Trang thành viên yêu cầu không hợp lệ. Vui lòng nhập lại trang nhỏ hơn hoặc bỏ qua tham số trang.",
        threadId,
        type
      );
    }

    if (errorCode === 604) {
      const hint =
        memberPage > 1
          ? "Trang thành viên này không còn dữ liệu. Vui lòng thử trang nhỏ hơn."
          : "Link mời có thể đã hết hạn hoặc bot chưa có quyền xem nhóm. Hãy xin lại link mới hoặc chắc chắn bot đã đăng nhập bằng tài khoản có quyền.";
      return api.sendMessage(
        `❌ Không thể lấy thông tin nhóm.\nMã lỗi: 604\nChi tiết: ${friendlyMessage}\n💡 Gợi ý: ${hint}`,
        threadId,
        type
      );
    }

    return api.sendMessage(
      `❌ Không thể lấy thông tin nhóm.\nMã lỗi: ${errorCode ?? "UNKNOWN"}\nChi tiết: ${friendlyMessage}`,
      threadId,
      type
    );
  }
};
