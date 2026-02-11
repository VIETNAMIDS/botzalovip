const { ThreadType } = require("zca-js");

const HARD_MAX_LOOPS = 5000;
const DEFAULT_DELAY_MS = 400;
const PRE_LEAVE_DELAY_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNumericGroupId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

function isAlreadyMemberMessage(message = "") {
  const n = String(message || "").toLowerCase();
  return (n.includes("already") && n.includes("member")) || n.includes("đã là thành viên");
}

async function safeSend(api, payload, threadId, type) {
  try {
    if (!api?.sendMessage) return null;
    return await api.sendMessage(payload, threadId, type);
  } catch {
    return null;
  }
}

async function sendFinalSummary(api, event, text) {
  const threadId = event?.threadId;
  const type = event?.type;
  const senderId = getSenderId(event);

  const sentToThread = await safeSend(api, text, threadId, type);
  if (sentToThread) return true;

  if (senderId) {
    const sentToUser = await safeSend(api, text, senderId, ThreadType.User);
    if (sentToUser) return true;
  }

  return false;
}

function getSenderId(event) {
  return String(event?.data?.uidFrom || event?.authorId || event?.senderID || event?.senderId || "").trim();
}

function isBotAdmin(senderId) {
  try {
    const cfg = global?.config || {};
    const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
    const owners = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
    if (admins.includes(String(senderId)) || owners.includes(String(senderId))) return true;
  } catch {}

  try {
    const list = global?.users?.admin;
    if (Array.isArray(list) && list.map(String).includes(String(senderId))) return true;
  } catch {}

  return false;
}

function extractFirstLink(text) {
  if (!text) return null;
  const s = String(text);
  const m = s.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

function extractFirstZaloLikeLink(text) {
  if (!text) return null;
  const s = String(text);
  const m = s.match(/(?:https?:\/\/)?(?:chat\.zalo\.me\/join\/|zalo\.me\/(?:g|group)\/)[^\s]+/i);
  return m ? m[0] : null;
}

function normalizeGroupLink(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;

  // If user pasted without scheme
  if (/^(?:chat\.zalo\.me\/join\/|zalo\.me\/(?:g|group)\/)/i.test(s)) {
    s = `https://${s}`;
  }

  // If user only passed a code, build a best-effort link
  if (/^[a-zA-Z0-9]{6,}$/.test(s) && !/\//.test(s)) {
    s = `https://zalo.me/g/${s}`;
  }

  return s;
}

function parseRejoinArgs(args = []) {
  const text = Array.isArray(args) ? args.join(" ") : String(args || "");

  const rawLink = extractFirstLink(text) || extractFirstZaloLikeLink(text);
  const link = normalizeGroupLink(rawLink || args.find((t) => /zalo\.me\/(?:g|group)\//i.test(String(t))) || args.find((t) => /chat\.zalo\.me\/join\//i.test(String(t))) || args.find((t) => /^[a-zA-Z0-9]{6,}$/.test(String(t))));

  const nums = (Array.isArray(args) ? args : [])
    .map((x) => String(x).trim())
    .filter((x) => /^\d+(?:\.\d+)?$/.test(x))
    .map(Number);

  const count = nums.length >= 1 ? Math.floor(nums[0]) : NaN;
  const delaySeconds = nums.length >= 2 ? Number(nums[1]) : NaN;

  return { link, count, delaySeconds };
}

function extractInviteCode(link) {
  if (typeof link !== "string") return null;
  const patterns = [
    /zalo\.me\/g\/([a-zA-Z0-9]+)/i,
    /chat\.zalo\.me\/join\/([a-zA-Z0-9]+)/i,
    /zalo\.me\/group\/([a-zA-Z0-9]+)/i
  ];
  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractGroupIdFromResult(data) {
  if (!data || typeof data !== "object") return null;
  const direct = [
    data.groupId,
    data.chatId,
    data.threadId,
    data.id,
    data.gid,
    data.grid,
    data?.data?.groupId,
    data?.data?.chatId,
    data?.data?.threadId,
    data?.result?.groupId,
    data?.result?.chatId,
    data?.result?.id
  ];

  for (const v of direct) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }

  return null;
}

async function resolveGroupIdFromLink(api, link) {
  const inviteCode = extractInviteCode(link);
  const candidates = new Set();

  const push = (v) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (s) candidates.add(s);
  };

  if (inviteCode) push(inviteCode);

  const resolvers = [
    () => (typeof api.resolveInviteLink === "function" ? api.resolveInviteLink(link) : null),
    () => (typeof api.getGroupInfoFromLink === "function" ? api.getGroupInfoFromLink(link) : null)
  ];

  for (const fn of resolvers) {
    try {
      const res = fn();
      const out = res && typeof res.then === "function" ? await res : res;
      if (!out) continue;

      push(out.groupId);
      push(out.chatId);
      push(out.threadId);
      push(out.id);
      push(out?.data?.groupId);

      const map = out?.gridInfoMap;
      if (map && typeof map === "object") {
        Object.keys(map).forEach(push);
      }
    } catch {}
  }

  const numeric = [...candidates].find((x) => /^\d+$/.test(x));
  return numeric || (candidates.size ? candidates.values().next().value : null);
}

async function joinGroupByLinkWithFallback(api, link) {
  const methods = [
    () => (typeof api.joinGroupByLink === "function" ? api.joinGroupByLink(link) : null),
    () => (typeof api.joinGroup === "function" ? api.joinGroup(link) : null),
    () => (typeof api.joinChatByLink === "function" ? api.joinChatByLink(link) : null),
    () => {
      const code = extractInviteCode(link);
      return code && typeof api.joinGroupByCode === "function" ? api.joinGroupByCode(code) : null;
    }
  ];

  let lastError;
  for (const attempt of methods) {
    try {
      const res = attempt();
      if (!res) continue;
      const out = typeof res.then === "function" ? await res : res;
      return out ?? { ok: true };
    } catch (e) {
      const msg = e?.message || String(e);
      if (isAlreadyMemberMessage(msg)) {
        return { ok: true, alreadyMember: true, note: msg };
      }
      lastError = e;
    }
  }

  if (lastError) throw lastError;
  throw new Error("API joinGroup/joinGroupByLink không hỗ trợ");
}

async function leaveGroupWithFallback(api, groupId) {
  const candidates = [
    () => (typeof api.leaveGroup === "function" ? api.leaveGroup(groupId) : null),
    () => (typeof api.leaveConversation === "function" ? api.leaveConversation(groupId) : null),
    () => (typeof api.leaveThread === "function" ? api.leaveThread(groupId) : null),
    () => (typeof api.leaveChat === "function" ? api.leaveChat(groupId) : null)
  ];

  let lastError;
  for (const attempt of candidates) {
    try {
      const res = attempt();
      if (!res) continue;
      if (typeof res.then === "function") await res;
      return;
    } catch (e) {
      lastError = e;
    }
  }

  if (lastError) throw lastError;
  throw new Error("leaveGroup not supported");
}

module.exports.config = {
  name: "rejoinlink",
  aliases: ["rjl", "rejoinloop"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Thoát nhóm rồi join lại theo link (tùy chỉnh số lần).",
  category: "Admin",
  usage: "rejoinlink <link> <số_lần> [delay-giây]",
  cooldowns: 5
};

module.exports.run = async ({ api, event, args = [] }) => {
  const { threadId, type } = event || {};
  if (!threadId) return;

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") return;

  const senderId = getSenderId(event);
  if (!isBotAdmin(senderId)) {
    return api.sendMessage("🚫 Bạn không có quyền dùng lệnh này.", threadId, type);
  }

  if (!args.length) {
    return api.sendMessage(
      "⚙️ Cú pháp: rejoinlink <link> <số_lần> [delay-giây]\n" +
        "Ví dụ: rejoinlink https://zalo.me/g/abcdef123 3 2",
      threadId,
      type
    );
  }

  const parsed = parseRejoinArgs(args);
  const link = parsed.link;
  const requestedLoops = parsed.count;
  const delaySeconds = parsed.delaySeconds;

  if (!link || !/^https?:\/\//i.test(String(link))) {
    return api.sendMessage(
      "❌ Tham số không hợp lệ. Không tìm thấy link/mã nhóm.\n" +
        "✅ Ví dụ:\n" +
        "- rejoinlink https://zalo.me/g/abcdef123 3 2\n" +
        "- rejoinlink zalo.me/g/abcdef123 3\n" +
        "- rejoinlink abcdef123 3",
      threadId,
      type
    );
  }

  if (!Number.isFinite(requestedLoops) || requestedLoops <= 0) {
    return api.sendMessage("❌ Số lần phải là số nguyên dương.", threadId, type);
  }

  const requested = requestedLoops;
  const loops = Math.min(requestedLoops, HARD_MAX_LOOPS);
  const delayMs = Number.isFinite(delaySeconds) && delaySeconds >= 0 ? Math.max(0, Math.round(delaySeconds * 1000)) : DEFAULT_DELAY_MS;

  let resolvedGroupId = null;
  if (type === ThreadType.Group && isNumericGroupId(threadId)) {
    resolvedGroupId = String(threadId);
  } else {
    resolvedGroupId = await resolveGroupIdFromLink(api, link);
  }

  let warnedNonNumericGroupId = false;

  const stats = {
    requestedLoops: requested,
    loops,
    leaveOk: 0,
    leaveFail: 0,
    joinOk: 0,
    joinFail: 0,
    alreadyMember: 0
  };

  const errors = [];

  for (let i = 0; i < loops; i += 1) {
    const step = i + 1;

    try {
      if (!resolvedGroupId) {
        // silent
      } else if (!isNumericGroupId(resolvedGroupId) && !warnedNonNumericGroupId) {
        warnedNonNumericGroupId = true;
        // silent
      }

      // LEAVE (thử cả numeric & non-numeric vì tùy API)
      if (resolvedGroupId) {
        await sleep(PRE_LEAVE_DELAY_MS);
        try {
          await leaveGroupWithFallback(api, String(resolvedGroupId));
          stats.leaveOk += 1;
        } catch (e) {
          stats.leaveFail += 1;
          errors.push(`Leave fail (${step}/${loops}): ${e?.message || e}`);
        }
      }

      await sleep(delayMs);

      // JOIN
      let joinResult;
      try {
        joinResult = await joinGroupByLinkWithFallback(api, String(link));
        stats.joinOk += 1;
        if (joinResult?.alreadyMember) stats.alreadyMember += 1;
      } catch (e) {
        stats.joinFail += 1;
        errors.push(`Join fail (${step}/${loops}): ${e?.message || e}`);
        await sleep(delayMs);
        continue;
      }

      // Update groupId if possible
      const fromJoin = extractGroupIdFromResult(joinResult);
      if (fromJoin && isNumericGroupId(fromJoin)) {
        resolvedGroupId = String(fromJoin);
      } else if (!resolvedGroupId) {
        const retryResolved = await resolveGroupIdFromLink(api, link);
        if (retryResolved && isNumericGroupId(retryResolved)) {
          resolvedGroupId = String(retryResolved);
        }
      }

      await sleep(delayMs);
    } catch (e) {
      errors.push(`Error (${step}/${loops}): ${e?.message || e}`);
      await sleep(delayMs);
    }
  }

  const gidLine = resolvedGroupId ? `\n• groupId: ${resolvedGroupId}` : "";
  const codeLine = !isNumericGroupId(resolvedGroupId) && resolvedGroupId ? `\n• inviteCode: ${resolvedGroupId}` : "";
  const errorLines = errors.length
    ? `\n\n⚠️ Lỗi (tối đa 5 dòng):\n- ${errors.slice(0, 5).join("\n- ")}${errors.length > 5 ? `\n- ... (${errors.length - 5} lỗi khác)` : ""}`
    : "";

  const summary =
    `✅ Hoàn tất rejoin.\n` +
    `• Loops: ${stats.loops}${stats.requestedLoops !== stats.loops ? ` (requested: ${stats.requestedLoops})` : ""}\n` +
    `• Leave OK/Fail: ${stats.leaveOk}/${stats.leaveFail}\n` +
    `• Join OK/Fail: ${stats.joinOk}/${stats.joinFail}\n` +
    `• Already member: ${stats.alreadyMember}` +
    `${gidLine}${codeLine}${errorLines}`;

  await sendFinalSummary(api, event, summary);
  return;
};
