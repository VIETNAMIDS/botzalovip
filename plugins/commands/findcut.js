const { ThreadType } = require("zca-js");

const findMemberModule = require("./findmember");
const helpers = (findMemberModule && findMemberModule.helpers) || {};

const MAX_RESULTS = 20;
const MAX_KICK_TARGETS = 5;
const FALLBACK_BATCH_SIZE = 25;

const fallbackNormalizeText = (value) => {
  if (!value && value !== 0) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const fallbackToStringId = (value) => {
  if (value == null) return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    return value.uid || value.id || value.userId || value.userID || null;
  }
  return null;
};

const fallbackUniqueStrings = (items = []) => {
  const set = new Set();
  items.forEach((item) => {
    if (!item && item !== 0) return;
    const normalized = String(item).trim();
    if (normalized) set.add(normalized);
  });
  return Array.from(set);
};

const fallbackCollectThreadInfo = async (api, threadId) => {
  const infoCandidates = [];

  if (typeof api.getThreadInfo === "function") {
    try {
      const info = await api.getThreadInfo(threadId);
      if (info) infoCandidates.push(info);
    } catch (_) {}
  }

  if (infoCandidates.length === 0 && typeof api.getGroupInfo === "function") {
    try {
      const info = await api.getGroupInfo(threadId);
      if (info) {
        const detail = info?.gridInfoMap?.[threadId] || info?.groupInfo?.[threadId] || info;
        if (detail) infoCandidates.push(detail);
      }
    } catch (_) {}
  }

  return infoCandidates[0] || {};
};

const fallbackCollectMemberIds = (threadInfo = {}, toId = fallbackToStringId) => {
  const ids = new Set();
  const pushList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      const resolved = toId(item);
      if (resolved) ids.add(String(resolved));
    });
  };

  pushList(threadInfo.participantIDs);
  pushList(threadInfo.participantIds);
  pushList(threadInfo.participants);
  pushList(threadInfo.members);

  if (Array.isArray(threadInfo.memVerList)) {
    threadInfo.memVerList.forEach((entry) => {
      if (typeof entry === "string") {
        const uid = entry.split("_")[0];
        if (uid) ids.add(uid);
      } else {
        const resolved = toId(entry);
        if (resolved) ids.add(String(resolved));
      }
    });
  }

  return Array.from(ids);
};

const fallbackFetchProfiles = async (api, memberIds = [], batchSize = FALLBACK_BATCH_SIZE) => {
  if (!memberIds.length) return {};
  const result = {};

  if (typeof api.getUserInfo !== "function") return result;

  const chunks = [];
  for (let i = 0; i < memberIds.length; i += batchSize) {
    chunks.push(memberIds.slice(i, i + batchSize));
  }

  for (const chunk of chunks) {
    try {
      const data = await api.getUserInfo(chunk);
      if (!data) continue;

      const changed = data.changed_profiles || {};
      const unchanged = data.unchanged_profiles || {};

      chunk.forEach((uid) => {
        result[uid] =
          changed[uid] ||
          unchanged[uid] ||
          data[uid] ||
          data?.profiles?.[uid] ||
          null;
      });
    } catch (error) {
      console.warn("[findcut] getUserInfo chunk error:", error?.message || error);
    }
  }

  return result;
};

const fallbackBuildMemberRecord = (uid, threadInfo = {}, profileMap = {}, uniqueFn = fallbackUniqueStrings) => {
  const profile = profileMap[uid] || {};
  const nicknameMap = threadInfo.nicknames || {};

  const candidates = uniqueFn([
    profile.displayName,
    profile.zaloName,
    profile.name,
    profile.fullName,
    profile.alias,
    profile.nickName,
    nicknameMap?.[uid],
    profile.username,
    profile.custom_name,
    profile.customName
  ]);

  const displayName = candidates[0] || uid;

  return {
    uid,
    displayName,
    nickname: nicknameMap?.[uid] || profile.nickName || profile.alias || null,
    candidates
  };
};

const fallbackMatchMember = (record, normalizedQuery, normalizer = fallbackNormalizeText) => {
  if (!normalizedQuery) return false;
  const haystack = record.candidates.length ? record.candidates : [record.uid];
  return haystack.some((candidate) => normalizer(candidate).includes(normalizedQuery));
};

const normalizeText = typeof helpers.normalizeText === "function" ? helpers.normalizeText : fallbackNormalizeText;
const toStringId = typeof helpers.toStringId === "function" ? helpers.toStringId : fallbackToStringId;
const uniqueStrings = typeof helpers.uniqueStrings === "function" ? helpers.uniqueStrings : fallbackUniqueStrings;
const collectThreadInfo = typeof helpers.collectThreadInfo === "function"
  ? helpers.collectThreadInfo
  : fallbackCollectThreadInfo;
const collectMemberIds = typeof helpers.collectMemberIds === "function"
  ? helpers.collectMemberIds
  : (threadInfo) => fallbackCollectMemberIds(threadInfo, toStringId);
const fetchProfiles = typeof helpers.fetchProfiles === "function"
  ? helpers.fetchProfiles
  : (api, memberIds) => fallbackFetchProfiles(api, memberIds, FALLBACK_BATCH_SIZE);
const buildMemberRecord = typeof helpers.buildMemberRecord === "function"
  ? helpers.buildMemberRecord
  : (uid, threadInfo, profileMap) => fallbackBuildMemberRecord(uid, threadInfo, profileMap, uniqueStrings);
const matchMember = typeof helpers.matchMember === "function"
  ? helpers.matchMember
  : (record, normalizedQuery) => fallbackMatchMember(record, normalizedQuery, normalizeText);

const methodCandidates = [
  "removeUserFromGroup",
  "removeParticipant",
  "kickMember",
  "removeMember",
  "removeUser",
  "kickUsersInGroup",
  "kick"
];

const truncate = (text, limit = 160) => {
  if (!text) return "";
  const value = String(text);
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

const toStringSet = (input) => {
  const result = new Set();
  if (Array.isArray(input)) {
    input.forEach((item) => {
      if (item === null || item === undefined) return;
      result.add(String(item));
    });
  } else if (typeof input === "object" && input) {
    Object.keys(input).forEach((key) => result.add(String(input[key])));
  } else if (input || input === 0) {
    result.add(String(input));
  }
  return result;
};

const addListToSet = (set, list) => {
  if (!Array.isArray(list)) return;
  list.forEach((value) => {
    if (value === null || value === undefined) return;
    set.add(String(value));
  });
};

module.exports.config = {
  name: "findcut",
  aliases: ["findkick", "timcut", "timkick"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Tìm thành viên theo tên và kick khỏi nhóm (cần quyền admin).",
  category: "Quản lý nhóm",
  usage: "findcut <từ khóa>",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, data } = event;
  const senderId = String(data?.uidFrom || event?.authorId || "");

  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ dùng trong nhóm.", threadId, type);
  }

  const interactionMode = global.bonzInteractionSettings?.[threadId] || "all";
  if (interactionMode === "silent") {
    return;
  }

  if (!args.length) {
    return api.sendMessage(
      "❗ Vui lòng nhập tên hoặc từ khóa cần tìm.\nVí dụ: findcut mai linh",
      threadId,
      type
    );
  }

  const query = args.join(" ").trim();
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return api.sendMessage(
      "⚠️ Từ khóa không hợp lệ. Vui lòng nhập tên khác.",
      threadId,
      type
    );
  }

  let threadInfo = {};
  try {
    threadInfo = await collectThreadInfo(api, threadId);
  } catch (error) {
    console.warn("[findcut] collectThreadInfo error:", error?.message || error);
  }

  const cfg = global?.config || {};
  const adminBotList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownerBotList = Array.isArray(cfg.owner_bot)
    ? cfg.owner_bot.map(String)
    : (typeof cfg.owner_bot === "string" && cfg.owner_bot.trim() ? [cfg.owner_bot.trim()] : []);

  const runtimeAdmins = Array.isArray(global?.users?.admin) ? global.users.admin.map(String) : adminBotList;
  const runtimeOwners = Array.isArray(global?.users?.owner) ? global.users.owner.map(String) : ownerBotList;

  const botAdminSet = new Set([...adminBotList, ...runtimeAdmins].map(String));
  const botOwnerSet = new Set([...ownerBotList, ...runtimeOwners].map(String));

  const threadAdminSet = new Set();
  addListToSet(threadAdminSet, threadInfo?.adminIDs);
  addListToSet(threadAdminSet, threadInfo?.adminIds);
  addListToSet(threadAdminSet, threadInfo?.adminList);
  addListToSet(threadAdminSet, threadInfo?.admins);
  addListToSet(threadAdminSet, event?.data?.adminIDs);
  addListToSet(threadAdminSet, event?.data?.adminIds);

  const creatorId = threadInfo?.creatorId || threadInfo?.creatorID || threadInfo?.ownerId || threadInfo?.ownerID;
  if (creatorId) {
    threadAdminSet.add(String(creatorId));
  }

  const isBotPrivileged = botAdminSet.has(senderId) || botOwnerSet.has(senderId);
  const isGroupAdmin = threadAdminSet.has(senderId) || (creatorId && String(creatorId) === senderId);

  if (!(isBotPrivileged || isGroupAdmin)) {
    return api.sendMessage(
      "❌ Bạn cần là admin nhóm hoặc admin/owner bot để dùng lệnh này.",
      threadId,
      type
    );
  }

  let memberIds = [];
  try {
    memberIds = collectMemberIds(threadInfo);
  } catch (error) {
    console.warn("[findcut] collectMemberIds error:", error?.message || error);
  }

  if (!memberIds.length) {
    const fallback = uniqueStrings([
      ...(Array.isArray(event?.data?.participantIDs) ? event.data.participantIDs : []),
      ...(Array.isArray(event?.data?.participants) ? event.data.participants : [])
    ]);
    memberIds = fallback;
  }

  if (!memberIds.length) {
    return api.sendMessage(
      "❌ Không thể lấy danh sách thành viên trong nhóm. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }

  const profileMap = await fetchProfiles(api, memberIds);
  const memberRecords = memberIds.map((uid) => buildMemberRecord(uid, threadInfo, profileMap));
  const matches = memberRecords.filter((record) => matchMember(record, normalizedQuery));

  if (!matches.length) {
    return api.sendMessage(
      `🔎 Không tìm thấy thành viên nào khớp với "${query}".`,
      threadId,
      type
    );
  }

  const kickMethod = methodCandidates.find((method) => typeof api[method] === "function");
  if (!kickMethod) {
    return api.sendMessage(
      "❌ API hiện không hỗ trợ kick thành viên. Vui lòng kiểm tra lại cấu hình bot.",
      threadId,
      type
    );
  }

  let botId = null;
  try {
    const currentId = await api.getCurrentUserID?.();
    if (currentId) botId = String(currentId);
  } catch (error) {
    console.warn("[findcut] getCurrentUserID error:", error?.message || error);
  }

  const protectedSet = new Set([botId, ...botAdminSet, ...botOwnerSet].filter(Boolean).map(String));
  threadAdminSet.forEach((uid) => protectedSet.add(String(uid)));
  if (creatorId) protectedSet.add(String(creatorId));

  const matchesToProcess = matches.slice(0, Math.min(matches.length, MAX_KICK_TARGETS, MAX_RESULTS));
  const leftoverMatches = matches.length - matchesToProcess.length;

  const results = [];

  for (const member of matchesToProcess) {
    const memberId = String(member.uid);
    const result = {
      member,
      status: "pending",
      reason: null
    };

    if (memberId === senderId && !isBotPrivileged) {
      result.status = "skipped";
      result.reason = "Không thể tự kick bản thân.";
      results.push(result);
      continue;
    }

    if (protectedSet.has(memberId)) {
      result.status = "skipped";
      result.reason = "Thành viên được bảo vệ (admin/owner/bot).";
      results.push(result);
      continue;
    }

    try {
      await api[kickMethod](memberId, threadId);
      result.status = "success";
    } catch (error) {
      result.status = "failed";
      result.reason = truncate(error?.message || error?.code || String(error));
    }

    results.push(result);
  }

  const successCount = results.filter((item) => item.status === "success").length;
  const failedCount = results.filter((item) => item.status === "failed").length;
  const skippedCount = results.filter((item) => item.status === "skipped").length;

  let message = "";
  const mentionsPayload = [];

  const appendLine = (line) => {
    const needsPrefix = message.length > 0;
    const startIndex = message.length + (needsPrefix ? 1 : 0);
    message += (needsPrefix ? "\n" : "") + line;
    return startIndex;
  };

  appendLine(`🔪 KẾT QUẢ TÌM & KICK (${matches.length})`);
  appendLine(`🔎 Từ khóa: "${query}"`);
  appendLine(`👤 Người yêu cầu: ${senderId}`);
  appendLine(`🛠️ Phương thức: ${kickMethod}`);
  appendLine(`✅ Đã kick: ${successCount} • ❌ Thất bại: ${failedCount} • ⚠️ Bỏ qua: ${skippedCount}`);

  if (leftoverMatches > 0) {
    appendLine(`📌 Còn ${leftoverMatches} thành viên khớp khác (giới hạn xử lý ${MAX_KICK_TARGETS}).`);
  }

  if (!results.length) {
    appendLine("");
    appendLine("❗ Không có thành viên nào được xử lý.");
  } else {
    appendLine("");
    results.forEach((result, index) => {
      const member = result.member;
      const memberId = String(member.uid);
      const displayName = member.displayName || memberId;

      if (index > 0) appendLine("");

      appendLine(`#${index + 1}. ${displayName}`);
      appendLine(`• UID: ${memberId}`);

      if (member.nickname && member.nickname !== displayName) {
        appendLine(`• Nickname: ${member.nickname}`);
      }

      if (result.status === "success") {
        appendLine("• Kết quả: ✅ Đã kick khỏi nhóm");
      } else if (result.status === "failed") {
        appendLine(`• Kết quả: ❌ Thất bại - ${result.reason || "Lý do không xác định"}`);
      } else if (result.status === "skipped") {
        appendLine(`• Kết quả: ⚠️ Bỏ qua - ${result.reason || "Không rõ lý do"}`);
      }

      const tagLabel = `@${displayName}`;
      const tagLine = `• Tag: ${tagLabel}`;
      const start = appendLine(tagLine);
      const localPos = tagLine.indexOf(tagLabel);
      if (localPos !== -1) {
        const absolutePos = start + localPos;
        mentionsPayload.push({
          uid: memberId,
          pos: absolutePos,
          len: tagLabel.length,
          offset: absolutePos,
          length: tagLabel.length
        });
      }

      if (result.reason && result.status !== "success") {
        appendLine(`• Chi tiết: ${result.reason}`);
      }
    });
  }

  const payload = mentionsPayload.length
    ? { msg: message, mentions: mentionsPayload }
    : message;

  return api.sendMessage(payload, threadId, type);
};
