const { exec } = require('child_process');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

function runShellCommand(command, cwd) {
  return new Promise((resolve) => {
    const child = exec(command, { cwd, env: process.env, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        code: error?.code ?? 0,
        stdout,
        stderr,
        errorMsg: error?.message,
      });
    });

    child.stdin?.end();
  });
}

module.exports.config = {
  name: 'capnhat',
  aliases: ['terminal', 'shell', 'cmdrun'],
  version: '2.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Chạy lệnh terminal (npm, node, git, v.v.) trực tiếp từ bot',
  category: 'Hệ thống',
  usage: 'capnhat <câu lệnh shell>',
  cooldowns: 3,
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;
  const command = args?.length ? args.join(' ') : null;

  if (!command) {
    return api.sendMessage({
      msg: '❗ Dùng: capnhat <câu lệnh terminal>\nVí dụ: capnhat npm install hoặc capnhat node update_accounts.js',
      ttl: 20000,
    }, threadId, type);
  }

  await api.sendMessage({ msg: `🖥️ Đang chạy: ${command}`, ttl: 15000 }, threadId, type);

  const result = await runShellCommand(command, process.cwd());

  const trimOutput = (text = '') => {
    const clean = text.trim();
    if (!clean) return '—';
    const MAX_LEN = 1800;
    return clean.length > MAX_LEN ? `${clean.slice(0, MAX_LEN)}\n... (đã cắt bớt)` : clean;
  };

  const finalMsg = [
    result.success ? '✅ Lệnh chạy thành công.' : '❌ Lệnh chạy thất bại.',
    `• Mã thoát: ${result.code}`,
    `• Lệnh: ${command}`,
    '─────────── STDOUT ───────────',
    trimOutput(result.stdout),
    '─────────── STDERR ───────────',
    trimOutput(result.stderr),
    result.errorMsg ? `⚠️ Lỗi: ${result.errorMsg}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return api.sendMessage({ msg: finalMsg, ttl: 60000 }, threadId, type);
};
