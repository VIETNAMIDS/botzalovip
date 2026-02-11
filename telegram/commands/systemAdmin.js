const os = require('os');
const chatPrefs = require('../state/chatPrefs');

function formatDuration(seconds) {
  const sec = Math.floor(seconds % 60);
  const min = Math.floor((seconds / 60) % 60);
  const hour = Math.floor((seconds / 3600) % 24);
  const day = Math.floor(seconds / 86400);
  const parts = [];
  if (day) parts.push(`${day} ngày`);
  if (hour) parts.push(`${hour} giờ`);
  if (min) parts.push(`${min} phút`);
  parts.push(`${sec} giây`);
  return parts.join(' ');
}

function buildMenuText() {
  const categories = [
    'Hệ thống & quản trị',
    'Giám sát bot Zalo',
    'Tiện ích nhóm',
    'Tra cứu nhanh',
    'Thời tiết & địa điểm',
    'Giải trí & mini game',
    'Media & âm nhạc',
    'Mạng xã hội & news',
    'AI & sáng tạo',
    'Học tập & đời sống',
  ];
  return `📚 Danh mục lệnh:\n${categories.map((c, idx) => `${idx + 1}. ${c}`).join('\n')}`;
}

module.exports = function buildSystemCommands(helpers = {}) {
  const commands = [];

  commands.push({
    name: 'ping',
    description: 'Kiểm tra độ trễ phản hồi của bot',
    category: 'Hệ thống',
    run: async ({ ctx }) => {
      const start = Date.now();
      const sent = await ctx.reply('🏓 Đang kiểm tra ping...');
      const latency = Date.now() - start;
      await ctx.telegram.editMessageText(sent.chat.id, sent.message_id, undefined, `🏓 Pong! ${latency}ms`);
    },
  });

  commands.push({
    name: 'botinfo',
    description: 'Thông tin phiên bản và môi trường bot',
    category: 'Hệ thống',
    run: async ({ ctx, helpers }) => {
      const info = [
        `🤖 Node ${process.version}`,
        `🖥️ HĐH: ${os.type()} ${os.release()}`,
        `🧠 RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB` ,
        `🕒 Uptime hệ thống: ${formatDuration(os.uptime())}`,
        helpers.commandStats ? `📦 Lệnh mô-đun: ${helpers.commandStats.total}` : null,
      ].filter(Boolean);
      await ctx.reply(info.join('\n'));
    },
  });

  commands.push({
    name: 'uptime',
    description: 'Xem thời gian bot chạy liên tục',
    category: 'Hệ thống',
    run: async ({ ctx }) => {
      await ctx.reply(`⏱️ Bot đã chạy ${formatDuration(process.uptime())}`);
    },
  });

  const menuCommand = {
    description: 'Hiển thị danh mục lệnh Telegram',
    category: 'Hệ thống',
    run: async ({ ctx }) => {
      await ctx.reply(buildMenuText());
    },
  };

  commands.push({ ...menuCommand, name: 'telehelp' });
  commands.push({ ...menuCommand, name: 'menu' });
  commands.push({ ...menuCommand, name: 'help' });

  commands.push({
    name: 'setlang',
    description: 'Đặt ngôn ngữ câu trả lời (vi hoặc en)',
    category: 'Hệ thống',
    adminOnly: true,
    run: async ({ ctx, args }) => {
      const lang = (args[0] || '').toLowerCase();
      if (!lang || !['vi', 'en'].includes(lang)) {
        await ctx.reply('⚙️ Dùng: /setlang <vi|en>');
        return;
      }
      chatPrefs.update(ctx.chat.id, { lang });
      await ctx.reply(`✅ Đã đặt ngôn ngữ mặc định là ${lang.toUpperCase()}`);
    },
  });

  commands.push({
    name: 'lang',
    description: 'Xem cấu hình ngôn ngữ hiện tại',
    category: 'Hệ thống',
    run: async ({ ctx }) => {
      const prefs = chatPrefs.get(ctx.chat.id);
      await ctx.reply(`🌐 Ngôn ngữ hiện tại: ${prefs.lang.toUpperCase()}`);
    },
  });

  commands.push({
    name: 'setwelcome',
    description: 'Tuỳ chỉnh lời chào cho nhóm',
    category: 'Hệ thống',
    adminOnly: true,
    run: async ({ ctx, args }) => {
      const text = args.join(' ');
      if (!text) {
        await ctx.reply('⚙️ Dùng: /setwelcome <nội dung>');
        return;
      }
      chatPrefs.update(ctx.chat.id, { welcome: text });
      await ctx.reply('✅ Đã cập nhật lời chào.');
    },
  });

  commands.push({
    name: 'welcome',
    description: 'Xem lời chào đang áp dụng',
    category: 'Hệ thống',
    run: async ({ ctx }) => {
      const prefs = chatPrefs.get(ctx.chat.id);
      await ctx.reply(`🙌 Lời chào: ${prefs.welcome}`);
    },
  });

  commands.push({
    name: 'reloadenv',
    description: 'Reload cấu hình .env.watchdog',
    category: 'Hệ thống',
    adminOnly: true,
    run: async ({ ctx, helpers }) => {
      if (typeof helpers.reloadEnv !== 'function') {
        await ctx.reply('⚠️ Chưa hỗ trợ reloadEnv.');
        return;
      }
      const res = helpers.reloadEnv();
      await ctx.reply(res?.message || 'Đã reload cấu hình.');
    },
  });

  commands.push({
    name: 'diag',
    description: 'Chẩn đoán nhanh tình trạng bot',
    category: 'Hệ thống',
    adminOnly: true,
    run: async ({ ctx, helpers }) => {
      const status = helpers.getStatus ? helpers.getStatus() : {};
      const lines = [
        `🔧 Running: ${status.running ? 'Có' : 'Không'}`,
        `⚙️ PID: ${status.pid || 'n/a'}`,
        `♻️ Auto restart: ${status.autoRestart ? 'ON' : 'OFF'}`,
        status.lastExit ? `⛔ Lần dừng cuối: code=${status.lastExit.code}` : null,
        helpers.commandStats ? `📊 Số lệnh: ${helpers.commandStats.total}` : null,
      ].filter(Boolean);
      await ctx.reply(lines.join('\n'));
    },
  });

  return commands;
};
