const path = require("path");
const { convertTimestamp } = require("../../utils/index");

module.exports.config = {
  name: "childhelp",
  aliases: ["child", "childcmd", "childcommands"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Hiển thị hướng dẫn sử dụng các lệnh quản lý bot con",
  category: "Admin",
  usage: "childhelp",
  cooldowns: 3
};

module.exports.run = async ({ api, event }) => {
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

  const isAdmin = admins.includes(String(senderId)) || owners.includes(String(senderId));
  if (!isAdmin) {
    return api.sendMessage("🚫 Bạn không có quyền sử dụng lệnh này.", threadId, type);
  }

  const helpLines = [
    "🤖 TRỢ GIÚP BOT CON",
    "────────────────",
    "1. startchild start",
    "   • Tạo mã QR mới để đăng nhập bot con",
    "   • Dùng khi muốn thay tài khoản hoặc chưa quét lần nào",
    "",
    "2. startchild all (hoặc startchild session)",
    "   • Khởi động lại bot con từ session đã lưu (không cần QR)",
    "   • Bot sẽ tự chuyển sang quét QR nếu chưa có session hợp lệ",
    "",
    "3. stopchild",
    "   • Dừng bot con đang chạy và xoá listener",
    "",
    "4. childthue <childKey> <thời lượng>",
    "   • Thuê bot con theo thời gian (s: giây, m: phút, h: giờ, d: ngày)",
    "   • Khi hết hạn bot con sẽ tự dừng và khoá quyền truy cập",
    "",
    "5. childgiahan <childKey> <thời lượng>",
    "   • Gia hạn thuê bot con, mở khóa nếu đã bị khoá do hết hạn",
    "   • Ví dụ: childgiahan child1 3h --note gia hạn khách A",
    "",
    "6. childxoa <childKey>",
    "   • Xóa hoàn toàn dữ liệu của bot con (session, lịch sử, thuê)",
    "   • Bot sẽ cần đăng nhập lại nếu muốn dùng tiếp",
    "",
    "7. childinfo",
    "   • Xem thông tin tài khoản bot con, quyền hạn và lịch sử đăng nhập",
    "",
    "📂 Thư mục dữ liệu",
    `   • Session: data${path.sep}child_session.json`,
    `   • Lịch sử đăng nhập: data${path.sep}child_login_history.json`,
    "",
    "📝 Gợi ý quy trình",
    "   • Bước 1: startchild start → quét QR",
    "   • Bước 2: Kiểm tra session bằng childinfo",
    "   • Bước 3: Từ lần sau dùng startchild all để bật nhanh",
    "",
    "💡 Lưu ý",
    "   • Chỉ admin/owner bot mẹ mới dùng được các lệnh trên",
    "   • Nếu session thất bại, bot sẽ yêu cầu quét QR lại",
    "   • Có thể xoá file session để buộc đăng nhập lại từ đầu"
  ];

  return api.sendMessage({ msg: helpLines.join("\n") }, threadId, type);
};
