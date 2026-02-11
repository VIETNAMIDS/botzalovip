module.exports.config = {
  name: "keygold",
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Nhường quyền chủ nhóm cho thành viên được chỉ định",
  category: "Nhóm",
  usage: "keygold @user | keygold <uid>",
  cooldowns: 2
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type, data } = event;

  // Ưu tiên lấy từ mention
  let targetId = data?.mentions?.[0]?.uid;

  // Nếu không có mention, thử lấy từ args[0]
  if (!targetId && args && args.length > 0) {
    const first = String(args[0]).trim();
    if (/^\d+$/.test(first)) targetId = first;
  }

  if (!targetId) {
    return api.sendMessage(
      "⚠️ Vui lòng tag người nhận hoặc nhập UID.\nCú pháp: keygold @user | keygold <uid>",
      threadId,
      type
    );
  }

  try {
    await api.changeGroupOwner(String(targetId), String(threadId));
    return api.sendMessage(`✅ Đã nhường quyền chủ nhóm cho UID: ${targetId}`, threadId, type);
  } catch (err) {
    return api.sendMessage(`❌ Không thể nhường chủ nhóm: ${err?.message || err}`, threadId, type);
  }
};
