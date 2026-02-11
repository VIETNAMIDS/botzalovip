module.exports.config = {
  name: "unkey",
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Gỡ phó nhóm (thu hồi key bạc) của thành viên được chỉ định",
  category: "Nhóm",
  usage: "unkey @user | unkey <uid>",
  cooldowns: 2
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;

  // Lấy UID từ mention đầu tiên hoặc từ args[0]
  let targetId = data?.mentions?.[0]?.uid;
  if (!targetId && args && args.length > 0) {
    const first = String(args[0]).trim();
    if (/^\d+$/.test(first)) targetId = first;
  }

  if (!targetId) {
    return api.sendMessage(
      "⚠️ Vui lòng tag người cần gỡ hoặc nhập UID.\nCú pháp: unkey @user | unkey <uid>",
      threadId,
      type
    );
  }

  try {
    await api.removeGroupDeputy(String(targetId), String(threadId));
    return api.sendMessage(`✅ Đã gỡ phó nhóm (thu hồi key bạc) của UID: ${targetId}` , threadId, type);
  } catch (err) {
    return api.sendMessage(`❌ Không thể gỡ phó nhóm: ${err?.message || err}`, threadId, type);
  }
};