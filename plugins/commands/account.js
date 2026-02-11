module.exports.config = {
  name: 'account',
  version: '1.1.0',
  role: 0,
  author: 'Cascade',
  description: 'Thông báo người dùng không cần đăng ký tài khoản, dùng trực tiếp lệnh thu',
  category: 'Tiện ích',
  usage: 'account',
  cooldowns: 3,
  allowUnauthed: true,
  requireLogin: false
};

const INFO_MESSAGE = `🔓 Bot mở quyền sử dụng cho mọi người.
✅ Không cần đăng ký hay xác thực email.
📜 Gõ /menu để xem danh sách lệnh.`;

module.exports.run = async ({ api, event }) => {
  const { threadId, type } = event;
  return api.sendMessage({
    msg: INFO_MESSAGE,
    ttl: 45000
  }, threadId, type);
};
