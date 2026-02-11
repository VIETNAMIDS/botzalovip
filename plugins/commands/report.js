const fs = require('fs');
const path = require('path');

const ReportReason = {
  Other: 0,
  Sensitive: 1,
  Annoy: 2,
  Fraud: 3
};

function normalizeReason(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === '0' || raw === 'other' || raw === 'khac' || raw === 'khác') return ReportReason.Other;
  if (raw === '1' || raw === 'sensitive' || raw === 'nhaycam' || raw === 'nhạy_cảm' || raw === 'nhạy-cảm' || raw === 'nhạy cảm') return ReportReason.Sensitive;
  if (raw === '2' || raw === 'annoy' || raw === 'lamphien' || raw === 'làmphiền' || raw === 'làm phiền') return ReportReason.Annoy;
  if (raw === '3' || raw === 'fraud' || raw === 'luaDao' || raw === 'luadao' || raw === 'lừađảo' || raw === 'lừa đảo') return ReportReason.Fraud;
  return null;
}

function makeReportId() {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureReportsFile(filePath) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
  } catch (_) {}
}

function readReports(filePath) {
  try {
    ensureReportsFile(filePath);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeReports(filePath, reports) {
  try {
    ensureReportsFile(filePath);
    fs.writeFileSync(filePath, JSON.stringify(reports, null, 2), 'utf8');
  } catch (_) {}
}

async function trySendPlatformReport(api, options) {
  if (!api) return null;

  const targetUid = options?.uid || options?.userId || options?.targetId || options?.targetUid || null;
  const candidates = [
    () => api.sendReport(options),
    () => api.report(options),
    () => api.sendReport(options.reason, options.content),
    () => api.report(options.reason, options.content),
    () => api.sendReport(targetUid, options.reason, options.content),
    () => api.report(targetUid, options.reason, options.content),
    () => api.sendReport({ uid: targetUid, reason: options.reason, content: options.content }),
    () => api.sendReport({ userId: targetUid, reason: options.reason, content: options.content }),
    () => api.sendReport({ targetId: targetUid, reason: options.reason, content: options.content }),
    () => api.sendReport({ targetUid, reason: options.reason, content: options.content }),
    () => api.report({ uid: targetUid, reason: options.reason, content: options.content }),
    () => api.report({ userId: targetUid, reason: options.reason, content: options.content }),
    () => api.report({ targetId: targetUid, reason: options.reason, content: options.content }),
    () => api.report({ targetUid, reason: options.reason, content: options.content })
  ];

  for (const fn of candidates) {
    try {
      if (typeof fn !== 'function') continue;
      const res = await fn();
      if (res) return res;
    } catch (_) {
      // try next
    }
  }

  return null;
}

module.exports.config = {
  name: 'report',
  version: '1.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Report người dùng (tag @user) với lý do tự động.',
  category: 'Tiện ích',
  usage: 'report @user',
  cooldowns: 3
};

module.exports.run = async function ({ api, event, args = [] }) {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId || event?.senderID;

  const mentions = Array.isArray(data?.mentions) ? data.mentions : [];
  const targetUid = mentions?.[0]?.uid ? String(mentions[0].uid) : null;
  const targetName = mentions?.[0]?.tag || mentions?.[0]?.title || null;

  if (!targetUid) {
    return api.sendMessage('❌ Hãy tag người bạn muốn report.\nVí dụ: report @tên', threadId, type);
  }

  const reasonValue = ReportReason.Annoy;
  const content = '';

  const reportId = makeReportId();
  const createdAt = new Date().toISOString();

  const reportRecord = {
    reportId,
    createdAt,
    reason: reasonValue,
    targetUid,
    targetName: targetName ? String(targetName) : undefined,
    reporterId: senderId ? String(senderId) : undefined,
    threadId: threadId ? String(threadId) : undefined,
    msgId: data?.msgId || data?.globalMsgId || event?.messageID || undefined
  };

  const reportsPath = path.join(__dirname, '../../data/reports.json');
  const reports = readReports(reportsPath);
  reports.push(reportRecord);
  writeReports(reportsPath, reports);

  let platformReportId = null;
  try {
    const platformRes = await trySendPlatformReport(api, {
      uid: targetUid,
      reason: reasonValue
    });

    platformReportId =
      platformRes?.reportId ||
      platformRes?.data?.reportId ||
      platformRes?.id ||
      null;
  } catch (_) {}

  const admins = Array.isArray(global?.users?.admin) ? global.users.admin.map(String) : [];
  const notifyText = [
    '📝 REPORT MỚI',
    `- reportId: ${reportId}`,
    platformReportId ? `- platformReportId: ${platformReportId}` : null,
    `- targetUid: ${targetUid}`,
    targetName ? `- targetName: ${targetName}` : null,
    `- reason: ${reasonValue}`,
    senderId ? `- reporterId: ${senderId}` : null,
    threadId ? `- threadId: ${threadId}` : null,
    reportRecord.msgId ? `- msgId: ${reportRecord.msgId}` : null,
    `- time: ${createdAt}`
  ].filter(Boolean).join('\n');

  for (const adminId of admins) {
    try {
      await api.sendMessage(notifyText, adminId, type);
    } catch (_) {}
  }

  const userReply = platformReportId
    ? `✅ Đã gửi report!\nreportId: ${platformReportId}`
    : `✅ Đã ghi nhận report!\nreportId: ${reportId}`;

  return api.sendMessage(userReply, threadId, type);
};
