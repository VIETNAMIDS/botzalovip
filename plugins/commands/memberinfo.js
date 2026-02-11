const formatField = (label, value) => `${label}: ${value ?? "Không rõ"}`;

module.exports.config = {
  name: "memberinfo",
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Xem thông tin các thành viên bằng UID thông qua API getGroupMembersInfo.",
  category: "Tiện ích",
  usage: "memberinfo <uid1> <uid2> ...",
  cooldowns: 3,
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;

  if (typeof api.getGroupMembersInfo !== "function") {
    return api.sendMessage(
      "❌ API hiện tại chưa hỗ trợ getGroupMembersInfo. Vui lòng cập nhật bot hoặc thử lại sau.",
      threadId,
      type
    );
  }

  const uids = args.map((uid) => uid.trim()).filter(Boolean);

  if (!uids.length) {
    return api.sendMessage(
      "❌ Thiếu UID.\nCách dùng: memberinfo 123456789 987654321",
      threadId,
      type
    );
  }

  // Giới hạn tối đa để tránh spam
  if (uids.length > 20) {
    return api.sendMessage("⚠️ Vui lòng nhập tối đa 20 UID mỗi lần.", threadId, type);
  }

  try {
    const result = await api.getGroupMembersInfo(uids);
    const members = Array.isArray(result?.data) ? result.data : result;

    if (!members || !members.length) {
      return api.sendMessage("❌ Không tìm thấy thông tin cho các UID đã cung cấp.", threadId, type);
    }

    const lines = members.map((mem, index) => {
      const info = [
        `#${index + 1}`,
        formatField("UID", mem.uid || mem.id),
        formatField("Tên", mem.displayName || mem.fullName || mem.name),
        formatField("Nickname", mem.nickName || mem.alias),
        formatField("Trạng thái", mem.accountStatus),
        formatField("Loại", mem.type),
      ].filter(Boolean);
      return info.join("\n");
    });

    const message = `📋 THÔNG TIN THÀNH VIÊN (${lines.length})\n\n${lines.join(
      "\n━━━━━━━━━━━━\n"
    )}`;

    return api.sendMessage(message, threadId, type);
  } catch (error) {
    console.error("[memberinfo] Lỗi getGroupMembersInfo:", error);
    const code = error?.code || error?.error_code || "UNKNOWN";

    let hint = "Vui lòng kiểm tra lại UID và quyền truy cập của bot.";
    if (code === 304) {
      hint = "Bot chưa đăng nhập hoặc session đã hết hạn.";
    } else if (code === 401 || code === 403) {
      hint = "Bot không có quyền xem thông tin người này.";
    }

    return api.sendMessage(
      `❌ Không thể lấy thông tin thành viên.\nMã lỗi: ${code}\nChi tiết: ${error?.message || error}\n💡 Gợi ý: ${hint}`,
      threadId,
      type
    );
  }
};
