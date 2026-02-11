const formatPendingUser = (user, index) => {
  if (!user) return `#${index + 1}: (không rõ)`;
  const fields = [
    `#${index + 1}`,
    `UID: ${user?.uid || user?.id || "Không rõ"}`,
    `Tên: ${user?.displayName || user?.fullName || user?.name || "Không rõ"}`,
    `Lý do: ${user?.questionAns || user?.reason || "Không có"}`,
    `Thời gian: ${user?.createdTime || user?.joinTime || "Không rõ"}`,
    `Trạng thái: ${user?.status ?? "Không rõ"}`,
  ];
  return fields.join("\n");
};

module.exports.config = {
  name: "pendingmembers",
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Liệt kê danh sách thành viên đang chờ duyệt vào nhóm.",
  category: "Quản lý nhóm",
  usage: "pendingmembers <groupId> [limit]",
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;

  if (typeof api.getPendingGroupMembers !== "function") {
    return api.sendMessage(
      "❌ API hiện tại chưa hỗ trợ getPendingGroupMembers. Vui lòng cập nhật bot hoặc thử lại sau.",
      threadId,
      type
    );
  }

  if (!args.length) {
    return api.sendMessage(
      "❌ Thiếu groupId.\nCách dùng: pendingmembers 123456789 [limit]",
      threadId,
      type
    );
  }

  const groupId = args[0].trim();
  if (!/^\d{6,30}$/.test(groupId)) {
    return api.sendMessage(
      "❌ groupId không hợp lệ. Vui lòng nhập dãy số (6-30 ký tự).",
      threadId,
      type
    );
  }

  const limitArg = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : 20;
  const limit = Math.max(1, Math.min(limitArg, 50));

  try {
    const response = await api.getPendingGroupMembers(groupId);
    const data = response?.data || response?.pendingMembers || response;
    const members = Array.isArray(data) ? data : data?.pendingMembers || [];

    if (!members.length) {
      return api.sendMessage(
        `✅ Không có thành viên nào đang chờ duyệt trong nhóm ${groupId}.`,
        threadId,
        type
      );
    }

    const preview = members.slice(0, limit).map(formatPendingUser);
    const remaining = members.length - preview.length;

    const message =
      `📋 DANH SÁCH CHỜ DUYỆT (${preview.length}/${members.length})\n` +
      `🆔 Group ID: ${groupId}\n` +
      `${preview.join("\n━━━━━━━━━━━━\n")}` +
      (remaining > 0 ? `\n… và ${remaining} người nữa.` : "");

    return api.sendMessage(message, threadId, type);
  } catch (error) {
    console.error("[pendingmembers] Lỗi getPendingGroupMembers:", error);
    const code = error?.code || error?.error_code || "UNKNOWN";

    let hint = "Kiểm tra lại groupId và đảm bảo bot có quyền duyệt thành viên.";
    if (code === 304) {
      hint = "Bot chưa đăng nhập hoặc session đã hết hạn.";
    } else if (code === 401 || code === 403) {
      hint = "Bot không đủ quyền xem danh sách chờ duyệt.";
    }

    return api.sendMessage(
      `❌ Không thể lấy danh sách thành viên chờ duyệt.\nMã lỗi: ${code}\nChi tiết: ${error?.message || error}\n💡 Gợi ý: ${hint}`,
      threadId,
      type
    );
  }
};
