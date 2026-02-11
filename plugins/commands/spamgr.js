const { ThreadType } = require("zca-js");

const DEFAULT_LOOP = 3;
const MAX_LOOP = 30;
const DEFAULT_DELAY_MS = 2000;
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function leaveGroupWithFallback(api, groupId) {
  if (!groupId) return { success: false, error: "Không xác định được groupId" };
  const candidates = [
    { name: "leaveGroup", call: () => typeof api.leaveGroup === "function" && api.leaveGroup(groupId) },
    { name: "leaveConversation", call: () => typeof api.leaveConversation === "function" && api.leaveConversation(groupId) },
    { name: "leaveThread", call: () => typeof api.leaveThread === "function" && api.leaveThread(groupId) },
    { name: "leaveChat", call: () => typeof api.leaveChat === "function" && api.leaveChat(groupId) }
  ];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const result = await candidate.call();
      if (result !== false && result !== null && result !== undefined) {
        return { success: true, method: candidate.name };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return { success: false, error: lastError?.message || "Không có API leaveGroup khả dụng" };
}

function extractNumericArgs(args = []) {
  const numbers = [];
  for (const arg of args) {
    if (/^\d+$/.test(arg)) {
      numbers.push(parseInt(arg, 10));
    }
  }
  return numbers;
}

function collectTargetIds(event, args) {
  const mentionEntries = Array.isArray(event?.data?.mentions) ? event.data.mentions : [];
  const mentionMap = new Map();
  mentionEntries.forEach((mention) => {
    if (mention?.uid) {
      const name = mention?.tag?.replace(/^@/, "") || mention?.name || mention.uid;
      mentionMap.set(String(mention.uid), name);
    }
  });

  const idFromArgs = args
    .filter((arg) => /^\d{6,}$/.test(arg))
    .map((id) => ({ id, name: id }));

  const mentionList = Array.from(mentionMap.entries()).map(([id, name]) => ({ id, name }));
  const combined = [...mentionList, ...idFromArgs];

  const deduped = [];
  const seen = new Set();
  combined.forEach((entry) => {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      deduped.push(entry);
    }
  });

  return deduped;
}

async function ensureTargetName(api, target) {
  if (target.name && target.name !== target.id) return target.name;
  try {
    const info = await api.getUserInfo(target.id);
    const displayName = info?.changed_profiles?.[target.id]?.displayName;
    if (displayName) {
      return displayName;
    }
  } catch (_) {
    // ignore
  }
  return target.name || target.id;
}

async function createGroupWithTarget(api, targetId, groupName) {
  if (typeof api.createGroup !== "function") {
    throw new Error("API createGroup không khả dụng trên phiên bản bot hiện tại");
  }
  const response = await api.createGroup({
    name: groupName,
    members: [targetId]
  });
  const groupId = response?.groupId || response?.gid || response?.group_id;
  if (!groupId) {
    throw new Error("API không trả về groupId");
  }
  return { groupId, response };
}

module.exports.config = {
  name: "spamgr",
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Tạo group spam với user được chọn, tự động rời sau mỗi lần tạo",
  category: "Nhóm",
  usage: "spamgr @user [số_lần] [delay_giây]",
  cooldowns: 8
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm!", threadId, type);
  }

  const targets = collectTargetIds(event, args);
  if (targets.length === 0) {
    return api.sendMessage("⚠️ Vui lòng @ hoặc nhập UID người cần spam group!", threadId, type);
  }

  const numericArgs = extractNumericArgs(args);
  let loopCount = DEFAULT_LOOP;
  let delayMs = DEFAULT_DELAY_MS;

  if (numericArgs.length >= 1 && Number.isFinite(numericArgs[0])) {
    loopCount = numericArgs[0];
  }
  if (numericArgs.length >= 2 && Number.isFinite(numericArgs[1])) {
    delayMs = numericArgs[1] * 1000;
  }

  loopCount = Math.min(Math.max(loopCount, 1), MAX_LOOP);
  delayMs = Math.min(Math.max(delayMs, MIN_DELAY_MS), MAX_DELAY_MS);

  await api.sendMessage(
    `🌀 Bắt đầu spam group cho ${targets.length} mục tiêu / ${loopCount} vòng / delay ${delayMs}ms.`,
    threadId,
    type
  );

  const summary = [];

  for (const rawTarget of targets) {
    const targetName = await ensureTargetName(api, rawTarget);
    summary.push(`\n🎯 Mục tiêu: ${targetName} (${rawTarget.id})`);

    for (let i = 0; i < loopCount; i += 1) {
      const cycle = i + 1;
      const groupName = `SpamGR • ${targetName} • ${new Date().toLocaleTimeString("vi-VN")}`;
      summary.push(`  • Vòng ${cycle}:`);

      try {
        const { groupId } = await createGroupWithTarget(api, rawTarget.id, groupName);
        summary.push(`    - ✅ Đã tạo group ${groupId}`);

        const leaveResult = await leaveGroupWithFallback(api, groupId);
        if (leaveResult.success) {
          summary.push(`    - 🚪 Bot đã rời group (${leaveResult.method})`);
        } else {
          summary.push(`    - ⚠️ Không rời được group: ${leaveResult.error}`);
        }
      } catch (error) {
        summary.push(`    - ❌ Lỗi: ${error?.message || error}`);
      }

      if (i < loopCount - 1) {
        await sleep(delayMs);
      }
    }
  }

  return api.sendMessage(summary.join("\n"), threadId, type);
};
