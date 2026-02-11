const logger = require("./logger");

const COMMAND_WINDOW_MS = 10_000; // 10s
const COMMAND_THRESHOLD = 8;

const MESSAGE_WINDOW_MS = 7_000; // 7s
const MESSAGE_THRESHOLD = 18;

const IDENTICAL_WINDOW_MS = 6_000; // 6s
const IDENTICAL_THRESHOLD = 4;

const RESTART_COOLDOWN_MS = 60_000; // 60s

const commandActivity = new Map(); // userId -> number[] timestamps
const messageActivity = new Map(); // userId -> number[] timestamps
const identicalActivity = new Map(); // key -> number[] timestamps

let lastRestartTrigger = 0;

function pruneEntries(list, now, windowMs) {
  while (list.length && now - list[0] > windowMs) {
    list.shift();
  }
}

function pushActivity(store, key, now, windowMs) {
  let list = store.get(key);
  if (!list) {
    list = [];
    store.set(key, list);
  }
  list.push(now);
  pruneEntries(list, now, windowMs);
  if (list.length === 0) {
    store.delete(key);
  }
  return list.length;
}

function buildReason(type, userId, count, threshold) {
  return `${type} spam bởi ${userId} (${count}/${threshold})`;
}

function recordEvent({ userId, threadId, isCommand = false, content }) {
  const now = Date.now();
  const uid = userId ? String(userId) : "unknown";
  const normalizedContent = typeof content === "string" ? content.trim() : "";
  const contentKey = normalizedContent.length ? normalizedContent : "__EMPTY__";
  const threadKey = threadId ? String(threadId) : "__GLOBAL__";

  let triggerReason = null;

  if (isCommand) {
    const commandCount = pushActivity(commandActivity, uid, now, COMMAND_WINDOW_MS);
    if (commandCount >= COMMAND_THRESHOLD) {
      triggerReason = buildReason("Command", uid, commandCount, COMMAND_THRESHOLD);
    }
  }

  const messageCount = pushActivity(messageActivity, uid, now, MESSAGE_WINDOW_MS);
  if (!triggerReason && messageCount >= MESSAGE_THRESHOLD) {
    triggerReason = buildReason("Message", uid, messageCount, MESSAGE_THRESHOLD);
  }

  const identicalKey = `${threadKey}::${uid}::${contentKey}`;
  const identicalCount = pushActivity(identicalActivity, identicalKey, now, IDENTICAL_WINDOW_MS);
  if (!triggerReason && identicalCount >= IDENTICAL_THRESHOLD) {
    triggerReason = buildReason("Repeating", uid, identicalCount, IDENTICAL_THRESHOLD);
  }

  if (!triggerReason) {
    return { shouldRestart: false };
  }

  if (now - lastRestartTrigger < RESTART_COOLDOWN_MS) {
    return { shouldRestart: false, suppressed: true, reason: triggerReason };
  }

  lastRestartTrigger = now;
  logger.log(`[SpamGuard] Phát hiện spam nghiêm trọng: ${triggerReason}`, "warn");
  return { shouldRestart: true, reason: triggerReason };
}

module.exports = {
  recordEvent,
};
