const { ThreadType } = require("zca-js");

const MAX_ITERATIONS = 20;
const DEFAULT_DELAY_MS = 1000;

module.exports.config = {
  name: "spamjoinreal",
  aliases: ["spamjoinlink", "spamjoinreal"],
  version: "1.0.2",
  role: 2,
  author: "Phan Thế An (ported by Cascade)",
  description: "Spam join nhóm thật bằng link và rời nhóm nếu API hỗ trợ.",
  category: "Admin",
  usage: "spamjoinreal <link> <số_lần> <delay-giây>",
  cooldowns: 3
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") return;

  const senderId = (data?.uidFrom || event.authorId || event.senderID || event.senderId || "").toString();

  if (!global?.users?.admin?.includes(senderId)) {
    return api.sendMessage("🚫 Bạn không có quyền dùng lệnh này.", threadId, type);
  }

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ sử dụng trong nhóm.", threadId, type);
  }

  if (args.length < 3) {
    return api.sendMessage(
      "⚙️ Cú pháp: spamjoinreal <link> <số_lần> <delay-giây>\nVí dụ: spamjoinreal https://chat.zalo.me/abcd 5 2",
      threadId, type
    );
  }

  const [rawLink, rawCount, rawDelay] = args;
  const link = rawLink?.trim();
  const requestedCount = parseInt(rawCount, 10);
  const delaySeconds = parseFloat(rawDelay);

  if (!link || !/^https?:\/\//i.test(link)) {
    return api.sendMessage("❌ Link không hợp lệ.", threadId, type);
  }
  if (Number.isNaN(requestedCount) || requestedCount <= 0) {
    return api.sendMessage("❌ Số lần phải là số nguyên dương.", threadId, type);
  }
  if (Number.isNaN(delaySeconds) || delaySeconds < 0) {
    return api.sendMessage("❌ Delay phải là số không âm.", threadId, type);
  }

  const count = Math.min(requestedCount, MAX_ITERATIONS);
  const delayMs = delaySeconds > 0 ? delaySeconds * 1000 : DEFAULT_DELAY_MS;

  if (count !== requestedCount) {
    await api.sendMessage("⚠️ Đã giới hạn số lần còn 20 để tránh bị khóa tài khoản.", threadId, type);
  }

  // Debug: Liệt kê các API methods có sẵn
  const availableMethods = listAvailableApiMethods(api);
  console.log("[spamjoinreal] Available API methods:", availableMethods);

  await api.sendMessage(
    `📎 Bắt đầu spam join/leave ${count} lần.\n⏳ Delay: ${(delayMs / 1000).toFixed(2)} giây`,
    threadId, type
  );

  const stats = { joinSuccess: 0, leaveSuccess: 0, alreadyMember: 0, approvalPending: 0, joinFailures: 0, leaveFailures: 0, successfulIterations: 0 };
  const errorMessages = [];

  // Cache group ID sau lần join đầu tiên
  let cachedGroupId = null;

  for (let i = 0; i < count; i += 1) {
    try {
      const joinResult = await tryJoinGroup(api, link);
      
      if (!joinResult.success) {
        if (joinResult.approvalPending) {
          stats.approvalPending += 1;
          errorMessages.push(`Lần ${i + 1}: Đang chờ duyệt tham gia nhóm.`);
        } else {
          stats.joinFailures += 1;
          errorMessages.push(`Lần ${i + 1}: Join thất bại (${joinResult.reason})`);
        }
        continue;
      }

      stats.joinSuccess += 1;
      if (joinResult.data?.alreadyMember || joinResult.data?.note) stats.alreadyMember += 1;

      // Lưu group ID từ kết quả join
      const joinedGroupId = extractGroupIdFromResult(joinResult.data);
      if (joinedGroupId && /^\d+$/.test(joinedGroupId)) {
        cachedGroupId = joinedGroupId;
        console.log(`[spamjoinreal] Cached groupId from join result: ${cachedGroupId}`);
      }

      await sleep(delayMs);

      // Thử resolve group ID (ưu tiên numeric)
      let targetGroupId = cachedGroupId || await resolveGroupId(api, link, joinResult.data);

      if (!targetGroupId) {
        stats.leaveFailures += 1;
        errorMessages.push(`Lần ${i + 1}: Không xác định được groupId để rời.`);
        await sleep(delayMs);
        continue;
      }

      if (!/^\d+$/.test(targetGroupId)) {
        stats.leaveFailures += 1;
        errorMessages.push(`Lần ${i + 1}: Không có groupId dạng số để rời (nhận được "${targetGroupId}").`);
        console.warn(`[spamjoinreal] Bỏ qua leave vì groupId không phải số: ${targetGroupId}`);
        await sleep(delayMs);
        continue;
      }

      console.log(`[spamjoinreal] Attempting leave with groupId: ${targetGroupId}`);

      const goodbyePayload = buildGoodbyePayload();
      try {
        await api.sendMessage(goodbyePayload, targetGroupId, ThreadType.Group);
      } catch (error) {
        console.warn(`[spamjoinreal] Không gửi được tin tạm biệt: ${error?.message || error}`);
      }

      await sleep(1200);

      const leaveResult = await tryLeaveGroup(api, targetGroupId, link, goodbyePayload);
      if (leaveResult.success) {
        stats.leaveSuccess += 1;
        stats.successfulIterations += 1;
        // Nếu leave thành công, giữ lại cached ID
      } else {
        stats.leaveFailures += 1;
        errorMessages.push(`Lần ${i + 1}: Leave thất bại (${leaveResult.reason})`);
      }

      await sleep(delayMs);
    } catch (error) {
      stats.joinFailures += 1;
      errorMessages.push(`Lần ${i + 1}: ${error.message || error}`);
      await sleep(delayMs);
    }
  }

  const summaryLines = [
    "✅ Đã hoàn tất vòng lặp spam join/leave.",
    `• Chu kỳ join & leave thành công: ${stats.successfulIterations}/${count}`,
    `• Join thành công: ${stats.joinSuccess} (đã là thành viên: ${stats.alreadyMember})`,
    `• Leave thành công: ${stats.leaveSuccess}`,
    `• Chờ duyệt: ${stats.approvalPending}`,
    `• Lỗi join khác: ${stats.joinFailures}`,
    `• Lỗi leave: ${stats.leaveFailures}`
  ];

  if (cachedGroupId) {
    summaryLines.push(`• Group ID đã xác định: ${cachedGroupId}`);
  }

  if (errorMessages.length > 0) {
    summaryLines.push("\n⚠️ Chi tiết lỗi:");
    errorMessages.slice(0, 5).forEach((msg) => summaryLines.push(`- ${msg}`));
    if (errorMessages.length > 5) summaryLines.push(`- ... (${errorMessages.length - 5} lỗi khác)`);
  }

  return api.sendMessage(summaryLines.join("\n"), threadId, type);
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listAvailableApiMethods(api) {
  const relevantMethods = [
    "joinGroup", "joinGroupByLink", "joinGroupByCode", "joinGroupByInviteLink",
    "leaveGroup", "leaveConversation", "leaveThread", "leaveChat",
    "getGroupInfo", "getGroupInfoFromLink", "resolveInviteLink",
    "removeUserFromGroup", "kickMember", "removeMember",
    "getOwnId", "getCurrentUserID", "getContext"
  ];
  return relevantMethods.filter((m) => typeof api[m] === "function");
}

function extractGroupIdFromResult(data) {
  if (!data || typeof data !== "object") return null;
  
  // Các field phổ biến chứa group ID
  const fields = [
    "groupId", "chatId", "threadId", "id", "gid", "grid",
    "data.groupId", "data.chatId", "data.threadId", "data.id",
    "result.groupId", "result.chatId", "result.id"
  ];
  
  for (const field of fields) {
    const val = getNestedValue(data, field);
    if (val) return String(val);
  }
  
  // Tìm trong object bất kỳ field nào có giá trị là numeric string dài
  const allValues = getAllValues(data);
  const numericIds = allValues.filter((v) => typeof v === "string" && /^\d{10,}$/.test(v));
  if (numericIds.length > 0) {
    return numericIds[0];
  }
  
  return null;
}

function getAllValues(obj, depth = 0) {
  if (depth > 3 || !obj || typeof obj !== "object") return [];
  const values = [];
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" || typeof val === "number") {
      values.push(String(val));
    } else if (typeof val === "object" && val !== null) {
      values.push(...getAllValues(val, depth + 1));
    }
  }
  return values;
}

function getNestedValue(obj, path) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

async function tryJoinGroup(api, link) {
  const attempts = [];
  const inviteCode = extractInviteCode(link);

  const linkMethods = [
    { method: "joinGroupByLink", args: [link], label: "joinGroupByLink" },
    { method: "addUserToGroup", args: [link], label: "addUserToGroup(link)" },
    { method: "joinGroup", args: [link], label: "joinGroup(link)" },
    { method: "joinChatByLink", args: [link], label: "joinChatByLink" },
    { method: "acceptInviteLink", args: [link], label: "acceptInviteLink" },
    { method: "joinGroupByInviteLink", args: [link], label: "joinGroupByInviteLink" },
    { method: "acceptGroupInviteLink", args: [link], label: "acceptGroupInviteLink" }
  ];

  const linkResult = await runJoinAttempts(api, linkMethods, attempts);
  if (linkResult) return { success: true, data: linkResult };

  if (inviteCode) {
    const codeMethods = [
      { method: "joinGroupByCode", args: [inviteCode], label: "joinGroupByCode" },
      { method: "joinGroup", args: [inviteCode], label: "joinGroup(code)" },
      { method: "acceptInvite", args: [inviteCode], label: "acceptInvite(code)" },
      { method: "acceptGroupInvite", args: [inviteCode], label: "acceptGroupInvite(code)" },
      { method: "joinGroupByInviteCode", args: [inviteCode], label: "joinGroupByInviteCode" },
      { method: "joinChat", args: [inviteCode], label: "joinChat(code)" }
    ];

    const codeResult = await runJoinAttempts(api, codeMethods, attempts);
    if (codeResult) return { success: true, data: codeResult };
  }

  // Object format
  if (inviteCode) {
    const objectMethods = [
      { method: "joinGroup", args: [{ link }], label: "joinGroup({link})" },
      { method: "joinGroup", args: [{ inviteLink: link }], label: "joinGroup({inviteLink})" },
      { method: "joinGroup", args: [{ link, inviteCode }], label: "joinGroup({link,inviteCode})" },
      { method: "acceptInvite", args: [{ link, code: inviteCode }], label: "acceptInvite({link,code})" }
    ];

    const objectResult = await runJoinAttempts(api, objectMethods, attempts);
    if (objectResult) return { success: true, data: objectResult };
  }

  const approvalPending = attempts.some((a) => a.status === "pending_approval");
  const attemptSummary = formatAttemptSummary(attempts);
  let reason = approvalPending 
    ? `Đang chờ duyệt. ${attemptSummary}` 
    : (attemptSummary || "Không có API join nào hoạt động.");

  console.warn("[spamjoinreal] Join attempts failed:", JSON.stringify(attempts, null, 2));
  return { success: false, reason, attempts, approvalPending };
}

async function resolveGroupId(api, link, joinData = {}) {
  const candidates = new Set();
  const inviteCode = extractInviteCode(link);

  const pushCandidate = (value) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (str.length > 0) {
      candidates.add(str);
    }
  };

  const candidatePaths = [
    "groupId",
    "chatId",
    "threadId",
    "id",
    "data.groupId",
    "data.chatId",
    "data.threadId",
    "result.groupId",
    "result.chatId",
    "result.id"
  ];
  candidatePaths.forEach((path) => pushCandidate(getNestedValue(joinData, path)));

  if (inviteCode) {
    pushCandidate(inviteCode);
  }

  const resolverSpecs = [
    { name: "resolveInviteLink", fn: () => api.resolveInviteLink?.(link) },
    { name: "getGroupInfoFromLink", fn: () => api.getGroupInfoFromLink?.(link) }
  ];

  for (const spec of resolverSpecs) {
    try {
      if (typeof spec.fn !== "function") {
        continue;
      }
      const result = await spec.fn();
      pushCandidate(result?.groupId);
      pushCandidate(result?.chatId);
      pushCandidate(result?.id);
      pushCandidate(result?.data?.groupId);

      const map = result?.gridInfoMap;
      if (map && typeof map === "object") {
        Object.keys(map).forEach(pushCandidate);
      }
    } catch (error) {
      console.warn(`[spamjoinreal] ${spec.name} thất bại:`, error?.message || error);
    }
  }

  const numericIds = [...candidates].filter((id) => /^\d+$/.test(id));
  if (numericIds.length > 0) {
    return numericIds[0];
  }

  if (inviteCode && /^\d+$/.test(inviteCode) && typeof api.getGroupInfo === "function") {
    try {
      const info = await api.getGroupInfo([inviteCode]);
      const map = info?.gridInfoMap;
      if (map && typeof map === "object") {
        const numericKeys = Object.keys(map).filter((key) => /^\d+$/.test(key));
        if (numericKeys.length > 0) {
          return numericKeys[0];
        }
      }

      const resolved = extractGroupIdFromResult(info);
      if (resolved && /^\d+$/.test(resolved)) {
        return resolved;
      }
    } catch (error) {
      console.warn("[spamjoinreal] getGroupInfo(inviteCode) thất bại:", error?.message || error);
    }
  }

  if (inviteCode && !/^\d+$/.test(inviteCode)) {
    console.warn("[spamjoinreal] Invite code không phải số, bỏ qua gọi getGroupInfo để tránh lỗi.");
  }

  if (candidates.size > 0) {
    const first = candidates.values().next().value;
    console.warn(`[spamjoinreal] Không tìm được groupId dạng số, trả về candidate đầu tiên: ${first}`);
    return first;
  }

  console.warn("[spamjoinreal] Không xác định được groupId từ link/joinData.");
  return null;
}

async function tryLeaveGroup(api, groupId, originalLink = "", goodbyePayload = null) {
  if (!groupId) {
    return { success: false, reason: "groupId là null/undefined" };
  }

  const numericId = String(groupId);
  const leaveMethods = [
    { name: "leaveGroup", fn: () => api.leaveGroup?.(numericId) },
    { name: "leaveConversation", fn: () => api.leaveConversation?.(numericId) },
    { name: "leaveThread", fn: () => api.leaveThread?.(numericId) },
    { name: "leaveChat", fn: () => api.leaveChat?.(numericId) }
  ];

  for (const method of leaveMethods) {
    try {
      if (typeof method.fn !== "function") continue;
      const result = await method.fn();
      if (result !== undefined && result !== null) {
        return { success: true, method: method.name };
      }
    } catch (error) {
      const errMsg = error?.message || String(error);
      console.warn(`[spamjoinreal] ${method.name} thất bại:`, errMsg);
      if (isNotMemberMessage(errMsg)) {
        return { success: true, method: method.name, note: "Không còn là thành viên" };
      }
    }
  }

  try {
    const botId = await resolveBotId(api);
    if (botId && typeof api.removeUserFromGroup === "function") {
      await api.removeUserFromGroup(botId, numericId);
      return { success: true, method: "removeUserFromGroup" };
    }
  } catch (error) {
    console.warn("[spamjoinreal] removeUserFromGroup fallback thất bại:", error?.message || error);
  }

  return { success: false, reason: `Không thể rời nhóm ${groupId}. Kiểm tra API có hỗ trợ leaveGroup không.` };
}

function buildGoodbyePayload() {
  return {
    body:
      "✨ ━━━━━━━━━━━━━━━━ ✨\n\n" +
      "👋 Tạm biệt mọi người!\n\n" +
      "🤖 Bot đang rời nhóm theo yêu cầu quản trị viên.\n" +
      "❤️ Cảm ơn mọi người đã đồng hành!\n\n" +
      "✨ ━━━━━━━━━━━━━━━━ ✨"
  };
}

function isNotMemberMessage(message = "") {
  const n = message.toLowerCase();
  return n.includes("not a member") || n.includes("không phải thành viên") || 
         n.includes("not in group") || n.includes("không trong nhóm") ||
         n.includes("already left") || n.includes("đã rời");
}

async function runJoinAttempts(api, entries, attempts) {
  for (const entry of entries) {
    const result = await attemptJoinMethod(api, entry, attempts);
    if (result) return result;
  }
  return null;
}

async function attemptJoinMethod(api, entry, attempts) {
  const { method, args = [], label = method } = entry || {};
  const targetMethod = api?.[method];

  if (typeof targetMethod !== "function") {
    attempts.push({ label, status: "not_supported" });
    return null;
  }

  try {
    const result = await targetMethod.apply(api, args);
    console.log(`[spamjoinreal] ${label} returned:`, JSON.stringify(result));
    
    if (result === false || (result && typeof result === "object" && result.success === false)) {
      attempts.push({ label, status: "api_return_false" });
      return null;
    }

    return result && typeof result === "object" ? { ...result, method: label } : { method: label, rawResult: result };
  } catch (error) {
    const detail = error?.message || String(error);

    if (isAlreadyMemberMessage(detail)) {
      attempts.push({ label, status: "already_member" });
      return { method: label, alreadyMember: true, note: detail };
    }

    if (isApprovalPendingMessage(detail)) {
      attempts.push({ label, status: "pending_approval", detail });
      return null;
    }

    attempts.push({ label, status: "error", detail });
    return null;
  }
}

function formatAttemptSummary(attempts, limit = 6) {
  if (!Array.isArray(attempts) || attempts.length === 0) return "";

  const meaningful = attempts.filter(
    (a) => a.status !== "already_member" && a.status !== "pending_approval"
  );

  if (meaningful.length === 0) return "";

  const parts = meaningful.slice(0, limit).map((a) => {
    const label = a.label || "unknown";
    switch (a.status) {
      case "not_supported": return `${label}: N/A`;
      case "error": return `${label}: ${a.detail?.slice(0, 30) || "lỗi"}`;
      case "api_return_false": return `${label}: false`;
      default: return `${label}: ${a.status}`;
    }
  });

  if (meaningful.length > limit) parts.push("...");
  return parts.join("; ");
}

function isAlreadyMemberMessage(message = "") {
  const n = message.toLowerCase();
  return (n.includes("already") && n.includes("member")) || n.includes("đã là thành viên");
}

function isApprovalPendingMessage(message = "") {
  const n = message.toLowerCase();
  return n.includes("waiting for approv") || n.includes("đang chờ duyệt") || n.includes("phê duyệt");
}

async function resolveBotId(api) {
  const methods = [
    () => api.getOwnId?.(),
    () => api.getCurrentUserID?.(),
    () => api.getContext?.().then((ctx) => ctx?.odId || ctx?.userId),
    () => api.getCurrentUser?.().then((u) => u?.id || u?.odId)
  ];

  for (const method of methods) {
    try {
      const id = await method();
      if (id) return String(id);
    } catch {}
  }

  return global?.botID?.toString() || global?.config?.bot_id?.toString() || null;
}

function extractInviteCode(link) {
  if (typeof link !== "string") return null;
  const patterns = [
    /zalo\.me\/g\/([a-zA-Z0-9]+)/i,
    /chat\.zalo\.me\/join\/([a-zA-Z0-9]+)/i,
    /zalo\.me\/group\/([a-zA-Z0-9]+)/i,
    /zalo\.me\/([a-zA-Z0-9]{6,})/i
  ];
  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}