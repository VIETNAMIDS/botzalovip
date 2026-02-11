const os = require('os');
const { execSync } = require('child_process');
const chatPrefs = require('../state/chatPrefs');

function formatBytes(bytes = 0) {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (!bytes) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${sizes[i]}`;
}

function formatLoad(loadArr) {
  return loadArr.map((val) => val.toFixed(2)).join(' / ');
}

function collectDiskInfo() {
  try {
    if (process.platform === 'win32') {
      const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
      return output.trim();
    }
    return execSync('df -h', { encoding: 'utf8' });
  } catch (error) {
    return `Không thể lấy thông tin ổ đĩa: ${error?.message || error}`;
  }
}

module.exports = function buildMonitoringCommands(helpers = {}) {
  const commands = [];

  commands.push({
    name: 'status',
    aliases: ['s'],
    description: 'Xem trạng thái watchdog và bot Zalo',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx }) => {
      const status = helpers.getStatus ? helpers.getStatus() : {};
      const lines = [
        `🔌 Đang chạy: ${status.running ? 'Có' : 'Không'}`,
        `⚙️ PID: ${status.pid || 'n/a'}`,
        `⏱️ Uptime bot: ${status.running ? `${Math.round(status.uptime / 60)} phút` : 'n/a'}`,
        `♻️ Auto restart: ${status.autoRestart ? 'BẬT' : 'TẮT'}`,
        status.lastExit ? `⛔ Dừng lần cuối: code=${status.lastExit.code} signal=${status.lastExit.signal || 'n/a'}` : null,
        `📂 CMD: ${status.cmd || 'npm start'}`,
      ].filter(Boolean);
      await ctx.reply(lines.join('\n'));
    },
  });

  commands.push({
    name: 'start_zalo',
    aliases: ['on'],
    description: 'Khởi động bot Zalo',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx }) => {
      const res = helpers.startZaloBot ? helpers.startZaloBot('telegram') : { message: 'Không có startZaloBot' };
      await ctx.reply(res?.message || 'Đã gửi lệnh start.');
    },
  });

  commands.push({
    name: 'stop_zalo',
    aliases: ['off'],
    description: 'Dừng bot Zalo',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx }) => {
      const res = helpers.stopZaloBot ? helpers.stopZaloBot() : { message: 'Không có stopZaloBot' };
      await ctx.reply(res?.message || 'Đã gửi lệnh stop.');
    },
  });

  commands.push({
    name: 'restart_zalo',
    aliases: ['r'],
    description: 'Khởi động lại bot Zalo',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx }) => {
      const res = helpers.restartZaloBot ? helpers.restartZaloBot() : { message: 'Không có restartZaloBot' };
      await ctx.reply(res?.message || 'Đang restart.');
    },
  });

  commands.push({
    name: 'tail',
    aliases: ['t'],
    description: 'Xem log gần nhất (watchdog)',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx }) => {
      const tail = helpers.getTail ? helpers.getTail() : [];
      const output = tail.length ? tail.slice(-60).join('\n') : '(chưa có log)';
      await ctx.reply(output.slice(-3900));
    },
  });

  commands.push({
    name: 'logsearch',
    description: 'Tìm chuỗi trong log watchdog',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx, args }) => {
      const keyword = args.join(' ').trim();
      if (!keyword) {
        await ctx.reply('🔍 Dùng: /logsearch <chuỗi cần tìm>');
        return;
      }
      const tail = helpers.getTail ? helpers.getTail() : [];
      const matched = tail.filter((line) => line.toLowerCase().includes(keyword.toLowerCase()));
      if (!matched.length) {
        await ctx.reply('❌ Không tìm thấy kết quả phù hợp.');
        return;
      }
      await ctx.reply(matched.slice(-20).join('\n'));
    },
  });

  commands.push({
    name: 'alerts',
    description: 'Bật/tắt cảnh báo lỗi tự động',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx, args }) => {
      const prefs = chatPrefs.get(ctx.chat.id);
      let value;
      if (args[0]) {
        value = ['on', 'true', '1', 'enable'].includes(args[0].toLowerCase());
      } else {
        value = !prefs.alerts;
      }
      chatPrefs.update(ctx.chat.id, { alerts: value });
      await ctx.reply(`⚠️ Cảnh báo tự động: ${value ? 'BẬT' : 'TẮT'}`);
    },
  });

  commands.push({
    name: 'cpu',
    description: 'Xem tải CPU hiện tại',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx }) => {
      await ctx.reply(`🧮 Load trung bình (1/5/15 phút): ${formatLoad(os.loadavg())}`);
    },
  });

  commands.push({
    name: 'memory',
    description: 'Xem bộ nhớ đang sử dụng',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx }) => {
      const used = os.totalmem() - os.freemem();
      await ctx.reply(`💾 RAM đang dùng: ${formatBytes(used)} / ${formatBytes(os.totalmem())}`);
    },
  });

  commands.push({
    name: 'disk',
    description: 'Hiển thị thông tin ổ đĩa hệ thống',
    category: 'Giám sát',
    adminOnly: true,
    run: async ({ ctx }) => {
      const info = collectDiskInfo();
      await ctx.reply(`💽 Disk info:\n${info.slice(-3900)}`);
    },
  });

  return commands;
};
