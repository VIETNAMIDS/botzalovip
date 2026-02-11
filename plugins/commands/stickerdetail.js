module.exports.config = {
  name: "stickerdetail",
  aliases: ["sendsticker", "sd"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Lấy StickerDetail và gửi sticker thật theo stickerId",
  category: "Tiện ích",
  usage: "stickerdetail <stickerId>",
  cooldowns: 3
};

function parseStickerId(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function pickSticker(detailList, stickerId) {
  if (!Array.isArray(detailList)) return null;
  const byId = detailList.find((x) => Number(x?.id) === Number(stickerId));
  return byId || detailList[0] || null;
}

module.exports.run = async function ({ api, event, args = [] }) {
  const { threadId, type } = event;

  const stickerId = parseStickerId(args[0]);
  if (!stickerId) {
    return api.sendMessage(
      "❌ Thiếu stickerId hợp lệ.\nVí dụ: stickerdetail 12345",
      threadId,
      type
    );
  }

  if (typeof api?.getStickersDetail !== "function") {
    return api.sendMessage(
      "⚠️ API getStickersDetail chưa khả dụng ở phiên bản bot hiện tại.",
      threadId,
      type
    );
  }

  if (typeof api?.sendSticker !== "function") {
    return api.sendMessage(
      "⚠️ API sendSticker chưa khả dụng ở phiên bản bot hiện tại.",
      threadId,
      type
    );
  }

  let details;
  try {
    details = await api.getStickersDetail(stickerId);
  } catch (error) {
    console.error("[stickerdetail] getStickersDetail error:", error);
    return api.sendMessage(
      `❌ Không thể lấy sticker detail. Lý do: ${error?.message || "Không xác định"}`,
      threadId,
      type
    );
  }

  const sticker = pickSticker(details, stickerId);
  if (!sticker) {
    return api.sendMessage("❌ Không tìm thấy sticker detail phù hợp.", threadId, type);
  }

  const stickerType = sticker.type;
  const cateId = sticker.cateId;

  if (typeof stickerType !== "number" || typeof cateId !== "number") {
    return api.sendMessage(
      "❌ Sticker detail thiếu cateId/type nên không thể gửi sticker thật.",
      threadId,
      type
    );
  }

  try {
    await api.sendSticker({ id: stickerId, cateId, type: stickerType }, threadId, type);
  } catch (error) {
    console.error("[stickerdetail] sendSticker error:", error);
    return api.sendMessage(
      `❌ Không thể gửi sticker. Lý do: ${error?.message || "Không xác định"}`,
      threadId,
      type
    );
  }

  return api.sendMessage(
    `✅ Đã gửi sticker thật!\n- id: ${stickerId}\n- cateId: ${cateId}\n- type: ${stickerType}`,
    threadId,
    type
  );
};
