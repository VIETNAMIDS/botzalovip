const { ThreadType } = require("zca-js");

// DEBUG VERSION - Tests all possible mention formats one by one
// Use this to identify which format your zca-js version supports

module.exports.config = {
  name: "testmention",
  aliases: ["debugmention", "testag"],
  version: "1.0.0",
  role: 2,
  author: "Cascade",
  description: "Test mention formats để tìm format đúng cho zca-js",
  category: "Debug",
  usage: "testmention",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args = [] }) {
  const { threadId, type, data } = event;
  
  if (type !== ThreadType.Group) {
    return api.sendMessage("❌ Lệnh này chỉ sử dụng trong nhóm.", threadId, type);
  }

  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const owners = Array.isArray(cfg.owner_bot)
    ? cfg.owner_bot.map(String)
    : (typeof cfg.owner_bot === "string" && cfg.owner_bot.trim() ? [cfg.owner_bot.trim()] : []);

  const senderId = String(data?.uidFrom || event?.authorId || "");
  if (!senderId || (!admins.includes(senderId) && !owners.includes(senderId))) {
    return api.sendMessage("🚫 Chỉ admin/owner bot mới được phép dùng lệnh này.", threadId, type);
  }

  // Get thread info to find members
  let threadInfo = {};
  try {
    if (typeof api.getThreadInfo === "function") {
      threadInfo = await api.getThreadInfo(threadId);
    } else if (typeof api.getGroupInfo === "function") {
      const info = await api.getGroupInfo(threadId);
      threadInfo = info?.gridInfoMap?.[threadId] || info?.groupInfo?.[threadId] || info;
    }
  } catch (error) {
    console.error("[testmention] Error getting thread info:", error);
  }

  // Get member IDs
  let memberIds = [];
  const sources = [
    threadInfo?.participantIDs,
    threadInfo?.participantIds,
    threadInfo?.participants,
    threadInfo?.members,
    event?.data?.participantIDs,
    event?.data?.participantIds
  ];

  for (const source of sources) {
    if (Array.isArray(source)) {
      memberIds.push(...source);
    }
  }

  memberIds = [...new Set(memberIds.map(id => String(id)).filter(Boolean))];

  if (!memberIds.length) {
    return api.sendMessage("❌ Không tìm thấy member IDs", threadId);
  }

  // Take first 3 members for testing
  const testMembers = memberIds.slice(0, 3);
  
  await api.sendMessage(
    `🧪 Bắt đầu test ${testMembers.length} members...\nFormat nào PING được bạn = format đúng!`,
    threadId
  );

  await new Promise(r => setTimeout(r, 1000));

  // Test all formats
  const formats = [
    {
      name: "Format 1: msg + mentions (object with uid+id)",
      test: async () => {
        await api.sendMessage({
          msg: "📍 Test Format 1",
          mentions: testMembers.map(uid => ({ uid: String(uid), id: String(uid) }))
        }, threadId);
      }
    },
    {
      name: "Format 2: msg + mention (singular, object)",
      test: async () => {
        await api.sendMessage({
          msg: "📍 Test Format 2",
          mention: testMembers.map(uid => ({ uid: String(uid), id: String(uid) }))
        }, threadId);
      }
    },
    {
      name: "Format 3: msg + mentions (string array)",
      test: async () => {
        await api.sendMessage({
          msg: "📍 Test Format 3",
          mentions: testMembers.map(uid => String(uid))
        }, threadId);
      }
    },
    {
      name: "Format 4: body + mentions (string array)",
      test: async () => {
        await api.sendMessage({
          body: "📍 Test Format 4",
          mentions: testMembers.map(uid => String(uid))
        }, threadId);
      }
    },
    {
      name: "Format 5: text + mentions (string array)",
      test: async () => {
        await api.sendMessage({
          text: "📍 Test Format 5",
          mentions: testMembers.map(uid => String(uid))
        }, threadId);
      }
    },
    {
      name: "Format 6: Legacy format (string, threadId, options)",
      test: async () => {
        await api.sendMessage(
          "📍 Test Format 6",
          threadId,
          { mentions: testMembers.map(uid => String(uid)) }
        );
      }
    },
    {
      name: "Format 7: msg + mentions (with offset)",
      test: async () => {
        const msg = "📍 Test Format 7";
        await api.sendMessage({
          msg: msg,
          mentions: testMembers.map(uid => ({
            uid: String(uid),
            offset: msg.length,
            length: 0
          }))
        }, threadId);
      }
    },
    {
      name: "Format 8: msg + mentions (with pos+len)",
      test: async () => {
        await api.sendMessage({
          msg: "📍 Test Format 8",
          mentions: testMembers.map(uid => ({
            uid: String(uid),
            pos: 0,
            len: 0
          }))
        }, threadId);
      }
    },
    {
      name: "Format 9: body + mention (object singular)",
      test: async () => {
        await api.sendMessage({
          body: "📍 Test Format 9",
          mention: testMembers.map(uid => ({ uid: String(uid) }))
        }, threadId);
      }
    },
    {
      name: "Format 10: msg + mentions (object with uid only)",
      test: async () => {
        await api.sendMessage({
          msg: "📍 Test Format 10",
          mentions: testMembers.map(uid => ({ uid: String(uid) }))
        }, threadId);
      }
    }
  ];

  let successCount = 0;
  let failedFormats = [];

  for (let i = 0; i < formats.length; i++) {
    const format = formats[i];
    
    try {
      await format.test();
      successCount++;
      console.log(`[testmention] ✓ ${format.name} - SUCCESS`);
      await new Promise(r => setTimeout(r, 800));
    } catch (error) {
      failedFormats.push(format.name);
      console.error(`[testmention] ✗ ${format.name} - FAILED:`, error?.message || error);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Summary
  await new Promise(r => setTimeout(r, 1000));
  await api.sendMessage(
    `✅ Test hoàn tất!\n\n` +
    `📊 Gửi thành công: ${successCount}/${formats.length} formats\n\n` +
    `🎯 Format nào PING bạn = dùng format đó!\n\n` +
    `⚠️ Nếu không format nào ping được, có thể:\n` +
    `- Bot account không có quyền mention\n` +
    `- zca-js version cũ/mới không hỗ trợ\n` +
    `- Zalo API đã thay đổi`,
    threadId
  );

  if (failedFormats.length > 0) {
    console.log(`[testmention] Failed formats:`, failedFormats);
  }

  return;
};