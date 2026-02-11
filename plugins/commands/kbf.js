module.exports.config = {
  name: "sendfriend",
  version: "1.2.0",
  role: 2,
  author: "Cascade",
  description: "Gửi lời mời kết bạn kèm lời nhắn (hỗ trợ gửi nhiều UID/tags hoặc toàn bộ thành viên).",
  category: "Quản lý",
  usage: "sendfriend <uid|@tag|all> [uid2 ...] [-- lời nhắn]",
  cooldowns: 3
};

function isBotAdmin(uid) {
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  const whitelist = Array.isArray(cfg.protected_admins) ? cfg.protected_admins.map(String) : [];
  const all = new Set([...admins, ...owners, ...whitelist].map(String));
  return all.has(String(uid));
}

const MAX_BULK_INVITES = 100;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorCode(error) {
  return error?.code ||
    error?.error_code ||
    error?.response?.data?.error_code ||
    error?.response?.status ||
    null;
}

function isIgnorableFriendError(code) {
  if (!code && code !== 0) return false;
  const normalized = Number(code);
  return [216, 222, 225].includes(normalized);
}

function formatFailureDetails(details = []) {
  if (!details.length) return "";
  const samples = details.slice(0, 5)
    .map(({ uid, code, message }) => `• UID ${uid}: code ${code ?? "?"} - ${message}`)
    .join("\n");
  const extra = details.length > 5 ? `\n(… ${details.length - 5} lỗi khác)` : "";
  return `\n❗ Chi tiết lỗi:\n${samples}${extra}`;
}

function isUidToken(token = "") {
  if (!token) return false;
  const digits = token.replace(/[^\d]/g, "");
  return digits.length >= 12;
}

function normalizeUid(token = "") {
  return token.replace(/[^\d]/g, "");
}

function sanitizeUidCandidate(value) {
  if (!value && value !== 0) return null;
  let str = String(value);
  if (str.includes("_")) str = str.split("_")[0];
  const digits = str.replace(/[^\d]/g, "");
  return digits.length >= 12 ? digits : null;
}

function splitArgsByDelimiter(args = []) {
  const delimiterIdx = args.findIndex(t => t === "--" || t === "|");
  if (delimiterIdx === -1) {
    return { idTokens: args, messageTokens: [], hasDelimiter: false };
  }
  return {
    idTokens: args.slice(0, delimiterIdx),
    messageTokens: args.slice(delimiterIdx + 1),
    hasDelimiter: true
  };
}

function extractTargetsAndMessage(args = [], data = {}) {
  const mentions = Array.isArray(data?.mentions) ? data.mentions : [];
  const mentionUids = mentions
    .map(m => sanitizeUidCandidate(m?.uid || m?.id))
    .filter(Boolean)
    .map(String);

  const { idTokens, messageTokens, hasDelimiter } = splitArgsByDelimiter(args);

  const idsFromTokens = [];
  for (const token of idTokens) {
    if (isUidToken(token)) {
      const normalized = sanitizeUidCandidate(token);
      if (normalized) idsFromTokens.push(normalized);
    } else if (!hasDelimiter) {
      break; // gặp token không phải UID -> phần message bắt đầu (khi không có delimiter)
    }
  }

  let fallbackMessageTokens = [];
  if (!hasDelimiter) {
    const firstNonUidIdx = idTokens.findIndex(token => !isUidToken(token));
    if (firstNonUidIdx !== -1) {
      fallbackMessageTokens = idTokens.slice(firstNonUidIdx);
    }
  }

  const finalMessageTokens =
    messageTokens.length > 0
      ? messageTokens
      : fallbackMessageTokens;

  const targets = [...new Set([...mentionUids, ...idsFromTokens].filter(Boolean))];

  return {
    targets,
    messageTokens: finalMessageTokens
  };
}

async function getGroupMemberIds(api, threadId) {
  const uids = new Set();
  const attempts = [
    async () => {
      if (typeof api.getGroupInfo === "function") return api.getGroupInfo(threadId);
    },
    async () => {
      if (typeof api.getThreadInfo === "function") return api.getThreadInfo(threadId);
    }
  ];
  for (const attempt of attempts) {
    try {
      const info = await attempt();
      if (!info) continue;
      const detail = info?.gridInfoMap?.[threadId] || info?.groupInfo?.[threadId] || info;
      const candidates = [
        detail?.memVerList,
        detail?.members,
        detail?.participants,
        info?.participantIDs,
        info?.userInfo
      ];
      for (const list of candidates) {
        if (Array.isArray(list)) {
          list.forEach(item => {
            if (!item) return;
            if (typeof item === "string") uids.add(item);
            else if (typeof item === "object") {
              const id = item.id || item.uid || item.userId;
              if (id) uids.add(String(id));
            }
          });
        }
      }
      if (uids.size > 0) break;
    } catch (_) {
      // thử nguồn khác
    }
  }
  return [...uids];
}

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  const selfId = typeof api.getOwnId === "function" ? api.getOwnId() : null;

  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Lệnh này chỉ dành cho admin/owner bot.", threadId, type);
  }

  const isBulk = (args[0] || "").toLowerCase() === "all";
  if (isBulk && type !== 1) {
    return api.sendMessage("⚠️ Chỉ có thể dùng sendfriend all trong nhóm.", threadId, type);
  }

  if (typeof api.sendFriendRequest !== "function") {
    return api.sendMessage(
      "⚠️ API sendFriendRequest không khả dụng trên phiên bản bot hiện tại.",
      threadId,
      type
    );
  }

  if (isBulk) {
    const message = args.slice(1).join(" ") || "Xin chào, hãy kết bạn với tôi!";
    const members = await getGroupMemberIds(api, threadId);
    const targets = members
      .map(sanitizeUidCandidate)
      .filter(uid => uid && uid !== selfId)
      .slice(0, MAX_BULK_INVITES);

    if (targets.length === 0) {
      return api.sendMessage("⚠️ Không tìm thấy thành viên hợp lệ để gửi lời mời.", threadId, type);
    }

    await api.sendMessage(
      `⏳ Đang gửi lời mời kết bạn tới tối đa ${targets.length} thành viên...`,
      threadId,
      type
    );

    let success = 0, fail = 0;
    const failures = [];
    for (const uid of targets) {
      try {
        await api.sendFriendRequest(message, uid);
        success++;
      } catch (err) {
        const code = getErrorCode(err);
        if (isIgnorableFriendError(code)) {
          success++;
        } else {
          fail++;
          failures.push({
            uid,
            code,
            message: err?.message || String(err)
          });
        }
      }
      await delay(600);
    }

    return api.sendMessage(
      `✅ Hoàn tất gửi lời mời.\n• Thành công: ${success}\n• Thất bại: ${fail}\n💬 Nội dung: "${message}"${formatFailureDetails(failures)}`,
      threadId,
      type
    );
  }

  const { targets, messageTokens } = extractTargetsAndMessage(args, data);
  if (targets.length === 0) {
    return api.sendMessage(
      "⚠️ Vui lòng cung cấp ít nhất một UID hợp lệ, tag người cần gửi hoặc dùng \"sendfriend all\".\nVí dụ: sendfriend 0123456789012 9876543210987 -- Xin chào!",
      threadId,
      type
    );
  }

  const message = messageTokens.length > 0
    ? messageTokens.join(" ")
    : "Xin chào, hãy kết bạn với tôi!";

  let success = 0, fail = 0;
  const failures = [];

  for (const uid of targets) {
    if (!uid || uid === selfId) continue;
    try {
      await api.sendFriendRequest(message, uid);
      success++;
    } catch (error) {
      const code = getErrorCode(error);
      if (isIgnorableFriendError(code)) {
        success++;
      } else {
        fail++;
        failures.push({
          uid,
          code,
          message: error?.message || String(error)
        });
      }
    }
    await delay(400);
  }

  return api.sendMessage(
    `✅ Đã xử lý gửi lời mời cho ${targets.length} UID.\n• Thành công: ${success}\n• Thất bại: ${fail}\n💬 Nội dung: "${message}"${formatFailureDetails(failures)}`,
    threadId,
    type
  );
};
