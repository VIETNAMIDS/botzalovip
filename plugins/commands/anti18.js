'use strict';

module.exports.config = {
  name: 'anti18',
  version: '1.0.0',
  role: 1,
  author: 'Cascade',
  description: 'Chống ảnh nhạy cảm (18+) - xoá tin và kick theo cấu hình',
  category: 'Nhom',
  usage: 'anti18 <on|off|status|threshold|limit|autokick|heavy>',
  cooldowns: 2,
  aliases: ['antinsfw', 'antinude', 'anti18plus']
};

const DEFAULT_NSFW_THRESHOLD = 0.88;

function formatProbability(value) {
  if (!Number.isFinite(value)) return '0.0%';
  const pct = Math.min(Math.max(value * 100, 0), 100);
  return `${pct.toFixed(1)}%`;
}

function ensureGuard(threadData) {
  if (!threadData.data) threadData.data = {};
  if (!threadData.data.antiBotGuard) threadData.data.antiBotGuard = {};

  const guard = threadData.data.antiBotGuard;

  if (typeof guard.enabled !== 'boolean') guard.enabled = false;
  if (typeof guard.autoKick !== 'boolean') guard.autoKick = true;
  if (typeof guard.heavyMode !== 'boolean') guard.heavyMode = false;
  if (typeof guard.violationLimit !== 'number' || guard.violationLimit < 1) guard.violationLimit = 3;

  if (typeof guard.detectSensitiveImage !== 'boolean') guard.detectSensitiveImage = true;
  if (!Number.isFinite(guard.nsfwThreshold) || guard.nsfwThreshold <= 0 || guard.nsfwThreshold >= 1) {
    guard.nsfwThreshold = DEFAULT_NSFW_THRESHOLD;
  }

  return guard;
}

async function sendReply(api, threadId, type, msg) {
  try {
    return await api.sendMessage(msg, threadId, type);
  } catch {
    return;
  }
}

module.exports.run = async ({ api, event, args = [], Threads }) => {
  const threadId = event?.threadId;
  const type = event?.type;
  if (!threadId || typeof type === 'undefined') return;

  const sub = String(args[0] || 'status').toLowerCase();

  let threadData;
  try {
    threadData = await Threads.getData(threadId);
  } catch {
    return;
  }

  const guard = ensureGuard(threadData);

  if (sub === 'help') {
    const msg = [
      '🧠 Anti18 (NSFW ảnh) - dùng chung engine antibot',
      '',
      '• anti18 on',
      '• anti18 off',
      '• anti18 status',
      '• anti18 threshold <0.5-0.99>',
      '• anti18 limit <1-10>',
      '• anti18 autokick <on|off>',
      '• anti18 heavy <on|off>',
      '',
      'Ghi chú:',
      '- Khi bật anti18, bot sẽ tự bật antibot engine (antiBotGuard.enabled).',
      '- Heavy = kick ngay lần đầu (limit=1, autokick=on).'
    ].join('\n');
    return sendReply(api, threadId, type, msg);
  }

  if (sub === 'on') {
    guard.enabled = true;
    guard.detectSensitiveImage = true;
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `✅ Anti18: BAT | Kick: ${guard.autoKick ? 'ON' : 'OFF'} | Limit: ${guard.violationLimit} | Threshold: ${formatProbability(guard.nsfwThreshold)}`);
  }

  if (sub === 'off') {
    guard.detectSensitiveImage = false;
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, '🔕 Anti18: TAT (NSFW scan)');
  }

  if (sub === 'status') {
    const msg = [
      '📊 Anti18 Status',
      '━━━━━━━━━━━━━━━━━━━━',
      `• Engine: ${guard.enabled ? '🟢 ON' : '🔴 OFF'}`,
      `• Anti18: ${guard.detectSensitiveImage ? '🟢 ON' : '🔴 OFF'}`,
      `• Threshold: ${formatProbability(guard.nsfwThreshold)}`,
      `• AutoKick: ${guard.autoKick ? '🟢 ON' : '🔴 OFF'}`,
      `• Limit: ${guard.violationLimit}`,
      `• Heavy: ${guard.heavyMode ? '🟢 ON' : '🔴 OFF'}`
    ].join('\n');
    return sendReply(api, threadId, type, msg);
  }

  if (sub === 'threshold') {
    const value = Number.parseFloat(args[1]);
    if (!Number.isFinite(value) || value < 0.5 || value >= 1) {
      return sendReply(api, threadId, type, '⚠️ Dung: anti18 threshold <0.5-0.99> (vd: anti18 threshold 0.9)');
    }
    guard.nsfwThreshold = value;
    guard.enabled = true;
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `✅ Anti18 threshold: ${formatProbability(value)}`);
  }

  if (sub === 'limit') {
    const value = parseInt(args[1], 10);
    if (!value || value < 1 || value > 10) {
      return sendReply(api, threadId, type, '⚠️ Dung: anti18 limit <1-10>');
    }
    guard.violationLimit = value;
    guard.enabled = true;
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `✅ Anti18 limit: ${value}`);
  }

  if (sub === 'autokick') {
    const toggle = String(args[1] || '').toLowerCase();
    if (!['on', 'off'].includes(toggle)) {
      return sendReply(api, threadId, type, '⚠️ Dung: anti18 autokick <on|off>');
    }
    guard.autoKick = toggle === 'on';
    guard.enabled = true;
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `✅ Anti18 autokick: ${guard.autoKick ? 'ON' : 'OFF'}`);
  }

  if (sub === 'heavy' || sub === 'hard') {
    const toggle = String(args[1] || '').toLowerCase();
    if (!['on', 'off', '1', '0'].includes(toggle)) {
      return sendReply(api, threadId, type, '⚠️ Dung: anti18 heavy <on|off>');
    }
    const enable = toggle === 'on' || toggle === '1';
    guard.heavyMode = enable;
    guard.enabled = true;
    guard.detectSensitiveImage = true;
    if (enable) {
      guard.autoKick = true;
      guard.violationLimit = 1;
    }
    await Threads.setData(threadId, threadData.data);
    return sendReply(api, threadId, type, `💥 Anti18 heavy: ${guard.heavyMode ? 'ON' : 'OFF'}`);
  }

  return sendReply(api, threadId, type, "❓ Lenh khong hop le. Dung: anti18 help");
};
