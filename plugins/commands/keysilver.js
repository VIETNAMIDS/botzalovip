module.exports.config = {
  name: "keysilver",
  version: "1.0.0",
  role: 1,
  author: "Cascade",
  description: "Phong phó nhóm (trao key bạc) cho thành viên được chỉ định",
  category: "Nhóm",
  usage: "keysilver @user | keysilver <uid>",
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
      "⚠️ Vui lòng tag người nhận hoặc nhập UID.\nCú pháp: keysilver @user | keysilver <uid>",
      threadId,
      type
    );
  }

  try {
    await api.addGroupDeputy(String(targetId), String(threadId));
    return api.sendMessage(`✅ Đã phong phó nhóm (key bạc) cho UID: ${targetId}`, threadId, type);
  } catch (err) {
    return api.sendMessage(`❌ Không thể phong phó nhóm: ${err?.message || err}`, threadId, type);
  }
};
