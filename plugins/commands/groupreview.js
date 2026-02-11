const { ThreadType } = require("zca-js");
const path = require("path");
const fs = require("fs").promises;
const { createGroupReviewImage } = require("../utils/groupreview-canvas");

module.exports.config = {
  name: "groupreview",
  aliases: ["reviewpending", "pendinglist", "reviewmem"],
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Liệt kê thành viên đang chờ duyệt vào nhóm và cung cấp thông tin cơ bản",
  category: "Quản lý nhóm",
  usage: "groupreview [groupId]",
  cooldowns: 5
};

const MIN_UID_LENGTH = 12;

function extractUid(input = "") {
  if (!input) return "";
  if (typeof input === "string") {
    const digits = input.replace(/[^\d]/g, "");
    if (digits.length >= MIN_UID_LENGTH) return digits;
  }
  if (typeof input === "object") {
    const candidates = [
      input.uid,
      input.id,
      input.userId,
      input.user_id,
      input.uidFrom,
      input.senderID,
      input.authorId
    ];
    for (const candidate of candidates) {
      const digits = extractUid(candidate);
      if (digits.length >= MIN_UID_LENGTH) return digits;
    }
  }
  return "";
}

function normalizeDigits(input = "") {
  if (!input) return "";
  return input.replace(/[^\d]/g, "");
}

function resolveGroupId(rawArgs = [], fallbackThreadId = null, type = ThreadType.Group) {
  for (const token of rawArgs) {
    const digits = normalizeDigits(token);
    if (digits.length >= MIN_UID_LENGTH) {
      return digits;
    }
  }
  if (type === ThreadType.Group && fallbackThreadId) {
    return String(fallbackThreadId);
  }
  return null;
}

async function fetchGroupInfoCompatible(api, groupId) {
  const attempts = [
    async () => {
      if (typeof api.getThreadInfo === "function") {
        return api.getThreadInfo(groupId);
      }
      return null;
    },
    async () => {
      if (typeof api.getGroupInfo === "function") {
        return api.getGroupInfo(groupId);
      }
      return null;
    }
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch (error) {
      // thử method khác
    }
  }
  return null;
}

function collectPendingUids(source, collector) {
  if (!source) return;
  const candidates = [
    source?.pendingApprove?.uids,
    source?.pendingApprove,
    source?.pendingMembers,
    source?.pendingRequests,
    source?.approvalQueue,
    source?.pending
  ];

  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    list.forEach((item) => {
      const uid = extractUid(item);
      if (uid.length >= MIN_UID_LENGTH) collector.add(uid);
    });
  }
}

async function getPendingMembers(api, groupId, cachedInfo = null) {
  const ids = new Set();

  const info = cachedInfo || (await fetchGroupInfoCompatible(api, groupId));
  if (info) {
    collectPendingUids(info, ids);
    if (info.gridInfoMap && info.gridInfoMap[groupId]) {
      collectPendingUids(info.gridInfoMap[groupId], ids);
    }
    if (info.groupInfo && info.groupInfo[groupId]) {
      collectPendingUids(info.groupInfo[groupId], ids);
    }
  }

  if (ids.size === 0 && typeof api.getPendingGroupMembers === "function") {
    try {
      const response = await api.getPendingGroupMembers(groupId);
      const data = response?.data || response?.pendingMembers || response;
      const pendingList = Array.isArray(data) ? data : data?.pendingMembers;
      if (Array.isArray(pendingList)) {
        pendingList.forEach((item) => {
          const uid = extractUid(item);
          if (uid.length >= MIN_UID_LENGTH) ids.add(uid);
        });
      }
    } catch (error) {
      console.warn("[GROUPREVIEW] getPendingGroupMembers failed:", error?.message || error);
    }
  }

  return {
    pendingUids: [...ids],
    info
  };
}

function buildSummaryMessage(groupId, reviewers, reviewerInfos) {
  const lines = [];
  lines.push("📝 **DANH SÁCH THÀNH VIÊN ĐANG CHỜ DUYỆT**");
  lines.push(`🏷️ Nhóm: ${groupId}`);
  lines.push(`👥 Tổng số: ${reviewers.length}`);
  lines.push("");

  if (reviewers.length === 0) {
    lines.push("_Hiện không có thành viên nào đang chờ duyệt._");
    return lines.join("\n");
  }

  reviewers.forEach((uid, index) => {
    const info = reviewerInfos.get(uid) || {};
    const name = info.name || "Không rõ";
    const genderMap = { 1: "Nam", 2: "Nữ" };
    const gender = genderMap[info.gender] || "Không rõ";
    const friendStatusMap = {
      0: "Chưa kết bạn",
      1: "Đã kết bạn",
      2: "Đang chờ kết bạn"
    };
    const friendStatus = friendStatusMap[info.isFriend] || "Không rõ";
    const linesForMember = [
      `#${index + 1} • UID: ${uid}`,
      `Tên: ${name}`,
      `Giới tính: ${gender}`,
      `Quan hệ: ${friendStatus}`
    ];
    lines.push(linesForMember.join(" | "));
  });

  lines.push("");
  lines.push("💡 Dùng lệnh `duyetmem approve|reject ...` để xử lý các yêu cầu này.");
  return lines.join("\n");
}

async function fetchUserProfiles(api, uids = []) {
  const infoMap = new Map();
  if (!uids.length || typeof api.getUserInfo !== "function") return infoMap;

  const chunks = [];
  for (let i = 0; i < uids.length; i += 20) {
    chunks.push(uids.slice(i, i + 20));
  }

  for (const chunk of chunks) {
    try {
      const result = await api.getUserInfo(chunk);
      const profiles = result?.changed_profiles || result || {};
      chunk.forEach((uid) => {
        const profile = profiles[uid] || {};
        infoMap.set(uid, {
          name: profile.displayName || profile.name || profile.fullName,
          gender: profile.gender,
          isFriend: profile.friend_status ?? profile.isFriend,
          avatar:
            profile.avatar ||
            profile.avatarUrl ||
            profile.profilePicture ||
            profile.profile_picture ||
            profile.profilePic ||
            profile.profile_pic
        });
      });
    } catch (error) {
      console.warn("[GROUPREVIEW] getUserInfo failed:", error?.message || error);
    }
  }

  return infoMap;
}

function resolveGroupName(info, groupId) {
  if (!info) return null;
  return (
    info.threadName ||
    info.name ||
    info.groupName ||
    info.title ||
    info?.gridInfoMap?.[groupId]?.name ||
    info?.groupInfo?.[groupId]?.name ||
    info?.gridInfoMap?.[groupId]?.threadName ||
    null
  );
}

function buildCanvasMembersData(uids, profileMap) {
  return uids.map((uid) => {
    const profile = profileMap.get(uid) || {};
    return {
      uid,
      name: profile.name || `UID ${uid.slice(-6)}`,
      gender: profile.gender,
      friendStatus: profile.isFriend,
      avatar: profile.avatar
    };
  });
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type } = event;
  const groupId = resolveGroupId(args || [], threadId, type);

  if (!groupId) {
    return api.sendMessage(
      "⚠️ Không xác định được groupId. Vui lòng dùng trong nhóm hoặc truyền groupId sau lệnh.\nVí dụ: groupreview 1234567890123",
      threadId,
      type
    );
  }

  try {
    const { pendingUids, info } = await getPendingMembers(api, groupId, null);
    const profiles = await fetchUserProfiles(api, pendingUids);
    const summaryMessage = buildSummaryMessage(groupId, pendingUids, profiles);
    const groupName = resolveGroupName(info, groupId) || "Không rõ";
    const canvasMembers = buildCanvasMembersData(pendingUids, profiles);

    try {
      const imageBuffer = await createGroupReviewImage({
        groupId,
        groupName,
        members: canvasMembers
      });
      const cacheDir = path.join(__dirname, "../../cache");
      await fs.mkdir(cacheDir, { recursive: true });
      const imagePath = path.join(cacheDir, `groupreview_${groupId}_${Date.now()}.png`);
      await fs.writeFile(imagePath, imageBuffer);

      await api.sendMessage(
        {
          msg: pendingUids.length
            ? `📝 Có ${pendingUids.length} thành viên đang chờ duyệt. Xem chi tiết trong ảnh kèm theo.`
            : "✅ Không có thành viên nào đang chờ duyệt. (Ảnh minh họa đính kèm)",
          attachments: [imagePath]
        },
        threadId,
        type
      );

      setTimeout(() => {
        fs.unlink(imagePath).catch(() => {});
      }, 60 * 1000);
    } catch (imageError) {
      console.error("[GROUPREVIEW] Canvas error:", imageError);
      await api.sendMessage(summaryMessage, threadId, type);
    }
  } catch (error) {
    console.error("[GROUPREVIEW] Error:", error);
    await api.sendMessage(
      `❌ Không thể lấy danh sách thành viên đang chờ duyệt.\nLý do: ${error?.message || "Không xác định"}`,
      threadId,
      type
    );
  }
};
