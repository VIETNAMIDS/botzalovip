const { ThreadType } = require("zca-js");

const DEFAULT_LOOP = 10000;
const MAX_LOOP = 10000;
const DEFAULT_DELAY = 1000;
const MIN_DELAY = 1000;
const MAX_DELAY = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractMentionName(eventData, mention) {
  const raw = eventData?.content;
  if (typeof raw === "string" && typeof mention?.from === "number" && typeof mention?.len === "number") {
    const slice = raw.slice(mention.from, mention.from + mention.len);
    return slice.replace(/^@/, "").trim() || mention.uid;
  }
  return mention?.uid || "unknown";
}

async function tryAddUser(api, userId, threadId) {
  let lastError = null;

  if (typeof api.addUserToGroup === "function") {
    try {
      await api.addUserToGroup(userId, threadId);
      return { success: true, method: "addUserToGroup" };
    } catch (error) {
      lastError = error;
    }
  }

  if (typeof api.addUsersToGroup === "function") {
    try {
      await api.addUsersToGroup([userId], threadId);
      return { success: true, method: "addUsersToGroup" };
    } catch (error) {
      lastError = error;
    }
  }

  if (typeof api.addUser === "function") {
    try {
      await api.addUser(threadId, userId);
      return { success: true, method: "addUser" };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    success: false,
    error: lastError?.message || "Không có API phù hợp để thêm thành viên"
  };
}

async function tryKickUser(api, userId, threadId) {
  const methods = [
    { fn: api.removeUserFromGroup, name: "removeUserFromGroup" },
    { fn: api.kickUsersInGroup, name: "kickUsersInGroup" },
    { fn: api.removeParticipant, name: "removeParticipant", argsOrder: "thread-first" },
    { fn: api.removeMember, name: "removeMember", argsOrder: "thread-first" },
    { fn: api.kick, name: "kick" }
  ];

  let lastError = null;
  for (const method of methods) {
    if (typeof method.fn !== "function") continue;
    try {
      if (method.argsOrder === "thread-first") {
        await method.fn(threadId, userId);
      } else {
        await method.fn(userId, threadId);
      }
      return { success: true, method: method.name };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    success: false,
    error: lastError?.message || "Không thể kick thành viên"
  };
}

function formatStepResult(action, result) {
  if (result.success) {
    return `✅ ${action} (${result.method})`;
  }
  return `❌ ${action}: ${result.error || "Không rõ lỗi"}`;
}

module.exports.config = {
  name: "spamvip",
  version: "1.1.0",
  role: 1,
  author: "Cascade",
  description: "Liên tục add rồi kick thành viên được chỉ định (có thể chỉnh vòng & delay)",
  category: "Nhóm",
  usage: "spamvip @user [số_lần] [delay_giây]",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, data } = event;

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm!", threadId, type);
  }

  const mentions = Array.isArray(data?.mentions) ? data.mentions : [];
  if (mentions.length === 0) {
    return api.sendMessage("⚠️ Vui lòng @ thành viên cần spam VIP!", threadId, type);
  }

  const orderedNumbers = [];
  for (const arg of args) {
    if (/^\d+$/.test(arg)) {
      orderedNumbers.push(parseInt(arg, 10));
    }
  }

  let loopCount = DEFAULT_LOOP;
  let stepDelay = DEFAULT_DELAY;

  if (orderedNumbers.length >= 1 && Number.isFinite(orderedNumbers[0])) {
    loopCount = orderedNumbers[0];
  }
  if (orderedNumbers.length >= 2 && Number.isFinite(orderedNumbers[1])) {
    stepDelay = orderedNumbers[1] * 1000;
  }

  loopCount = Math.min(Math.max(loopCount, 1), MAX_LOOP);
  stepDelay = Math.min(Math.max(stepDelay, MIN_DELAY), MAX_DELAY);

  await api.sendMessage(
    `🌀 Bắt đầu spam VIP ${mentions.length} mục tiêu trong ${loopCount} vòng / delay ${stepDelay}ms.`,
    threadId,
    type
  );

  const summary = [];

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = extractMentionName(data, mention);
    summary.push(`\n🎯 Mục tiêu: ${targetName} (${targetId})`);

    // Ensure mục tiêu đang ở trạng thái có thể add lại
    const preKick = await tryKickUser(api, targetId, threadId);
    summary.push(`- Chuẩn bị: ${formatStepResult("Kick", preKick)}`);
    await sleep(600);

    for (let i = 0; i < loopCount; i += 1) {
      const cycle = i + 1;
      summary.push(`  • Vòng ${cycle}:`);

      const addResult = await tryAddUser(api, targetId, threadId);
      summary.push(`    - ${formatStepResult("Add", addResult)}`);
      await sleep(stepDelay);

      const kickResult = await tryKickUser(api, targetId, threadId);
      summary.push(`    - ${formatStepResult("Kick", kickResult)}`);
      await sleep(stepDelay);
    }
  }

  return api.sendMessage(summary.join("\n"), threadId, type);
};
