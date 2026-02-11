const path = require("path");
const fs = require("fs");

const GUIDE_PATH = path.join(__dirname, "../../docs/TUTIEN_GUIDE.md");

function formatPanel(title, sections = [], options = {}) {
  const accent = options.accent || "✦";
  const width = options.width || 60;
  const border = "─".repeat(width);
  const lines = [`╭${border}╮`, `│ ${accent} ${title.toUpperCase()}`];
  lines.push(`├${border}┤`);
  sections.forEach((block, index) => {
    if (block === null || typeof block === "undefined") return;
    const parts = String(block).split("\n");
    parts.forEach((line) => {
      lines.push(`│ ${line}`);
    });
    if (index < sections.length - 1) {
      lines.push("│");
    }
  });
  lines.push(`╰${border}╯`);
  return lines.join("\n");
}

function formatList(items = [], bullet = "•") {
  return items.map((item) => `${bullet} ${item}`).join("\n");
}

const QUICK_STEPS = [
  "tu register <đạo hiệu> để tạo nhân vật.",
  "tu help để xem toàn bộ thao tác luyện công.",
  "Xen kẽ tu meditate → tu cultivate → tu mission/quest để tích lũy tài nguyên.",
  "Đủ exp thì dùng tu breakthrough và nhớ bật tu protect trước hoạt động nguy hiểm.",
  "Mua đồ ở tu shop, rèn pháp khí bằng tu forge, nuôi thú bằng tu beast/tu feed.",
  "Tham gia tông môn với tu joinsect <tên> và chia sẻ bằng tu gift @tag <số>."
];

const COMMAND_SECTIONS = [
  {
    title: "Cơ bản",
    commands: [
      { name: "help", usage: "tu help", desc: "Hiển thị menu tóm tắt và flow luyện công." },
      { name: "register", usage: "tu register <đạo hiệu>", desc: "Tạo nhân vật mới." },
      { name: "rename", usage: "tu rename <tên>", desc: "Đổi đạo hiệu khi cần." },
      { name: "profile", usage: "tu profile", desc: "Xem hồ sơ, power, artifact." },
      { name: "realms", usage: "tu realms", desc: "Danh sách cảnh giới và số tầng." },
      { name: "story", usage: "tu story", desc: "Kể nhanh hành trình của bạn." }
    ]
  },
  {
    title: "Tu luyện",
    commands: [
      { name: "meditate", usage: "tu meditate", desc: "Tĩnh tọa hồi khí (ảnh hưởng artifact)." },
      { name: "cultivate", usage: "tu cultivate", desc: "Đốt khí lấy exp." },
      { name: "train", usage: "tu train", desc: "Tăng lực chiến qua luyện võ." },
      { name: "breakthrough", usage: "tu breakthrough", desc: "Đột phá cảnh giới khi đủ exp." },
      { name: "focus", usage: "tu focus", desc: "Xoá cooldown meditate." },
      { name: "insight", usage: "tu insight", desc: "Tiêu exp để tăng ngộ tính." },
      { name: "protect", usage: "tu protect", desc: "Bật / tắt hộ thể." },
      { name: "tutorial", usage: "tu tutorial", desc: "Hướng dẫn 8 bước chơi nhanh." },
      { name: "skill", usage: "tu skill [unlock <tên>]", desc: "Xem cây kỹ năng hoặc mở talent." }
    ]
  },
  {
    title: "Nhiệm vụ & khám phá",
    commands: [
      { name: "mission", usage: "tu mission", desc: "Làm nhiệm vụ tông môn – thưởng exp, qi, skill point." },
      { name: "quest", usage: "tu quest", desc: "Phiêu lưu tự do lấy vật phẩm hiếm." },
      { name: "explore", usage: "tu explore", desc: "Lang thang nhặt dược liệu, quặng hoặc tăng luck." },
      { name: "gather", usage: "tu gather", desc: "Thu thập dược thảo." },
      { name: "forage", usage: "tu forage", desc: "Đào quặng (buff khi world event Meteor)." },
      { name: "dungeon", usage: "tu dungeon", desc: "Tiến vào bí cảnh bằng treasureKey." },
      { name: "treasure", usage: "tu treasure", desc: "Tìm kho báu random, có thể ra charm/linh thạch." },
      { name: "event", usage: "tu event [claim]", desc: "Xem/nhận thưởng sự kiện thế giới đang diễn ra." },
      { name: "raid", usage: "tu raid <start|status|strike|contribute>", desc: "Hợp lực tiêu diệt boss, nhận thưởng chia damage." }
    ]
  },
  {
    title: "Chế tác & tài nguyên",
    commands: [
      { name: "refine", usage: "tu refine", desc: "Luyện quặng thành tinh thạch." },
      { name: "alchemy", usage: "tu alchemy", desc: "Dùng dược liệu luyện đan, có tỉ lệ ra linh thảo hiếm." },
      { name: "pill", usage: "tu pill [minor|major]", desc: "Uống đan để hồi khí / lấy exp." },
      { name: "forge", usage: "tu forge", desc: "Rèn pháp khí mới nếu có tinh thiết + tinh thạch." },
      { name: "artifact", usage: "tu artifact [list|forge|equip|unequip]", desc: "Luyện và trang bị bảo vật tăng chỉ số." }
    ]
  },
  {
    title: "Kinh tế & kho đồ",
    commands: [
      { name: "shop", usage: "tu shop", desc: "Xem cửa hàng cơ bản." },
      { name: "buy", usage: "tu buy <item> <số>", desc: "Mua vật phẩm bằng linh thạch." },
      { name: "sell", usage: "tu sell <item> <số>", desc: "Bán vật phẩm lấy linh thạch." },
      { name: "inventory", usage: "tu inventory", desc: "Tra túi đồ hiện tại." },
      { name: "trade", usage: "tu trade [stones2qi|qi2stones]", desc: "Đổi linh thạch ↔ khí." },
      { name: "mail", usage: "tu mail [inbox|read|claim]", desc: "Nhận thư NPC và thưởng ngẫu nhiên." }
    ]
  },
  {
    title: "Linh thú & đồng hành",
    commands: [
      { name: "beast", usage: "tu beast", desc: "Săn linh thú – phụ thuộc luck." },
      { name: "feed", usage: "tu feed", desc: "Cho linh thú ăn để tăng lực chiến." },
      { name: "companion", usage: "tu companion", desc: "Kết giao đồng hành tăng ngộ tính." },
      { name: "contract", usage: "tu contract", desc: "Ký khế ước với linh thú đã thuần." }
    ]
  },
  {
    title: "Di chuyển & tông môn",
    commands: [
      { name: "travel", usage: "tu travel <địa danh>", desc: "Di chuyển tới map khác." },
      { name: "map", usage: "tu map", desc: "Danh sách địa danh & mô tả." },
      { name: "sect", usage: "tu sect", desc: "Xem tông môn hiện tại." },
      { name: "joinsect", usage: "tu joinsect <tên>", desc: "Gia nhập tông môn." },
      { name: "leavesect", usage: "tu leavesect", desc: "Rời tông môn trở lại tán tu." }
    ]
  },
  {
    title: "Xã giao & bảng xếp hạng",
    commands: [
      { name: "leaderboard", usage: "tu leaderboard", desc: "Top lực chiến các tu sĩ." },
      { name: "gift", usage: "tu gift @tag <số>", desc: "Tặng linh thạch cho người khác." }
    ]
  }
];

const CATEGORY_NOTE = `📚 Nhóm lệnh:
• Nhân vật: register, rename, profile, realms, story
• Tu luyện: meditate, cultivate, train, breakthrough, focus, insight
• Nhiệm vụ/khám phá: mission, quest, explore, gather, forage, dungeon, treasure, event
• Chế tác: refine, alchemy, pill, forge
• Trang bị/tài sản: equip, unequip, inventory, shop, buy, sell, trade
• Linh thú/đồng hành: beast, feed, companion, contract
• Di chuyển & tông môn: map, travel, sect, joinsect, leavesect
• Xã giao & phòng thủ: leaderboard, gift, bless, protect`;

function readGuideSummary() {
  try {
    if (fs.existsSync(GUIDE_PATH)) {
      const content = fs.readFileSync(GUIDE_PATH, "utf8");
      return content.split("\n").slice(0, 20).join("\n");
    }
  } catch (error) {
    console.error("[TuTienHelp] Không đọc được guide:", error);
  }
  return null;
}

async function sendChunked(api, text, threadId, type, size = 1800) {
  const str = String(text || "");
  for (let i = 0; i < str.length; i += size) {
    const part = str.slice(i, i + size);
    // eslint-disable-next-line no-await-in-loop
    await api.sendMessage(part, threadId, type);
  }
}

function buildMessage() {
  const guideSnippet = readGuideSummary();
  const sectionBlocks = COMMAND_SECTIONS.map((group) => {
    const detail = group.commands.map((cmd) => `• ${cmd.name} — ${cmd.desc}\n  Dùng: ${cmd.usage}`).join("\n");
    return `❖ ${group.title}\n${detail}`;
  }).join("\n\n");

  const sections = [
    "✨ Cách chơi nhanh:",
    formatList(QUICK_STEPS, "✔"),
    "",
    CATEGORY_NOTE,
    "",
    "🗂️ Danh sách & chú thích lệnh:",
    sectionBlocks,
    "",
    guideSnippet
      ? `📖 Trích docs/TUTIEN_GUIDE.md:\n${guideSnippet}`
      : "📖 Chi tiết xem docs/TUTIEN_GUIDE.md trong repo."
  ];
  return formatPanel("TuTien Help", sections, { accent: "🪷", width: 68 });
}

module.exports = {
  config: {
    name: "tutien",
    version: "1.0.0",
    hasPermission: 0,
    credits: "Cascade",
    description: "Hướng dẫn cách chơi và danh sách 40 lệnh game tu tiên",
    commandCategory: "Game",
    usages: "tutien help",
    cooldowns: 3
  },

  run: async function ({ api, event, args }) {
    const { threadId, type } = event;
    const sub = (args[0] || "").toLowerCase();

    if (sub !== "help") {
      return api.sendMessage("🔎 Dùng: tutien help để xem hướng dẫn chi tiết.", threadId, type);
    }

    const msg = buildMessage();
    return sendChunked(api, msg, threadId, type);
  }
};
