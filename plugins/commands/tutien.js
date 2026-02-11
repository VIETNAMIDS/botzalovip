function handleArtifact(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const sub = (context.args[0] || "list").toLowerCase();

  if (sub === 'list') {
    const owned = player.artifacts.length ? player.artifacts.map((key) => ARTIFACTS[key]?.name || key).join(", ") : "Chưa có";
    const cards = Object.entries(ARTIFACTS).map(([key, data]) => `• ${data.name} (${key}) – ${data.desc} | Giá: ${formatInventoryCost(data.cost)}`);
    const sections = [
      `🎒 Đang sở hữu: ${owned}`,
      `🔧 Đang trang bị: ${player.artifactEquipped ? ARTIFACTS[player.artifactEquipped]?.name || player.artifactEquipped : "Chưa có"}`,
      "",
      cards.join("\n"),
      "",
      "Dùng: tu artifact forge <tên> hoặc tu artifact equip <tên>"
    ];
    return { text: formatPanel("Artifact Hall", sections, { accent: "💎" }) };
  }

  if (sub === 'forge') {
    const key = (context.args[1] || '').toLowerCase();
    const artifact = ARTIFACTS[key];
    if (!artifact) return { text: "Không tìm thấy artifact." };
    if (player.artifacts.includes(key)) {
      return { text: "Bạn đã sở hữu artifact này." };
    }
    const missing = Object.entries(artifact.cost).filter(([res, amount]) => player.inventory[res] < amount);
    if (missing.length) {
      const missText = missing.map(([res, amount]) => `${amount - player.inventory[res]} ${res}`).join(", ");
      return { text: `Thiếu nguyên liệu: ${missText}` };
    }
    Object.entries(artifact.cost).forEach(([res, amount]) => {
      player.inventory[res] -= amount;
    });
    player.artifacts.push(key);
    player.stats.artifactsForged += 1;
    scheduleSave();
    return { text: `🔨 Bạn đã luyện thành ${artifact.name}! Dùng 'tu artifact equip ${key}' để trang bị.` , save: true };
  }

  if (sub === 'equip') {
    const key = (context.args[1] || '').toLowerCase();
    if (!player.artifacts.includes(key)) {
      return { text: "Bạn chưa sở hữu artifact này." };
    }
    player.artifactEquipped = key;
    scheduleSave();
    return { text: `💫 Đã trang bị ${ARTIFACTS[key]?.name || key}.` , save: true };
  }

  if (sub === 'unequip') {
    player.artifactEquipped = null;
    scheduleSave();
    return { text: "Bạn cất artifact vào kho." , save: true };
  }

  return { text: "Cú pháp: tu artifact [list|forge|equip|unequip]" };
}

function handleMail(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  ensureMailbox(player);
  const sub = (context.args[0] || "inbox").toLowerCase();

  if (sub === 'inbox') {
    if (!player.mailbox.length) return { text: "📭 Hộp thư trống." };
    const list = player.mailbox.slice(-5).map((letter, idx) => {
      const status = letter.claimed ? "(đã nhận)" : letter.read ? "(đã đọc)" : "(mới)";
      return `${idx + 1}. ${letter.title} ${status}`;
    });
    return { text: formatPanel("Hộp Thư", list, { accent: "📬" }) };
  }

  if (sub === 'read') {
    const index = parseInt(context.args[1], 10) || 1;
    const letter = player.mailbox[index - 1];
    if (!letter) return { text: "Không tìm thấy thư." };
    letter.read = true;
    scheduleSave();
    return { text: formatPanel(letter.title, [letter.body, "", (letter.claimed ? "Đã nhận thưởng." : "Dùng 'tu mail claim <stt>' để nhận quà")], { accent: "📩" }) };
  }

  if (sub === 'claim') {
    const index = parseInt(context.args[1], 10) || 1;
    const letter = player.mailbox[index - 1];
    if (!letter) return { text: "Không tìm thấy thư." };
    if (letter.claimed) return { text: "Đã nhận thư này rồi." };
    const rewardText = applyReward(player, letter.reward);
    letter.claimed = true;
    player.stats.lettersRead += 1;
    scheduleSave();
    return { text: `🎁 Nhận thư: ${letter.title}\n${rewardText}` , save: true };
  }

  return { text: "Cú pháp: tu mail [inbox|read <stt>|claim <stt>]" };
}

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "tutien_players.json");
const SAVE_INTERVAL = 2 * 60 * 1000;

const REALMS = [
  { name: "Luyện Khí", levels: 9, bonus: 0 },
  { name: "Trúc Cơ", levels: 6, bonus: 1 },
  { name: "Kim Đan", levels: 3, bonus: 2 },
  { name: "Nguyên Anh", levels: 3, bonus: 3 },
  { name: "Hóa Thần", levels: 3, bonus: 4 },
  { name: "Luyện Hư", levels: 3, bonus: 5 },
  { name: "Hợp Thể", levels: 2, bonus: 6 },
  { name: "Đại Thừa", levels: 2, bonus: 7 },
  { name: "Chân Tiên", levels: 1, bonus: 10 }
];

const ROOTS = [
  { name: "Kim", bonus: 8, luck: 5 },
  { name: "Mộc", bonus: 6, luck: 3 },
  { name: "Thủy", bonus: 7, luck: 4 },
  { name: "Hỏa", bonus: 5, luck: 6 },
  { name: "Thổ", bonus: 6, luck: 5 },
  { name: "Lôi", bonus: 9, luck: 8 },
  { name: "Quang", bonus: 10, luck: 10 },
  { name: "Âm", bonus: 8, luck: 7 }
];

const LOCATIONS = [
  { name: "Phàm Giới", desc: "Thanh bình, phù hợp tân thủ", bonus: 0 },
  { name: "Vân Mộng Trạch", desc: "Sương mù huyền ảo, tăng tỉ lệ dược liệu", bonus: 10 },
  { name: "U Minh Cốc", desc: "Âm khí dày đặc, dễ gặp yêu thú", bonus: 15 },
  { name: "Thiên Uyên Hải", desc: "Mặt biển sấm chớp, tăng tốc ngộ đạo", bonus: 20 },
  { name: "Tiên Linh Sơn", desc: "Khí tiên dồi dào, hỗ trợ đột phá", bonus: 25 }
];

const SHOP_ITEMS = {
  herb: { price: 120, label: "Dược thảo phổ thông", inventoryKey: "herb" },
  rareherb: { price: 520, label: "Linh thảo hiếm", inventoryKey: "rareHerb" },
  ore: { price: 140, label: "Quặng", inventoryKey: "ore" },
  steel: { price: 260, label: "Tinh thiết", inventoryKey: "steel" },
  beastfood: { price: 200, label: "Đan thú", inventoryKey: "beastFood" },
  treasurekey: { price: 800, label: "Chìa khoá bí cảnh", inventoryKey: "treasureKey" },
  charm: { price: 340, label: "Hộ phù", inventoryKey: "charm" },
  pillminor: { price: 620, label: "Tiểu hồi khí đơn", inventoryKey: "pillMinor" },
  pillmajor: { price: 1820, label: "Đại tụ linh đan", inventoryKey: "pillMajor" }
};

const BEAST_POOL = [
  { name: "Hắc Lang", bonus: 30 },
  { name: "Hỏa Phượng", bonus: 60 },
  { name: "Lôi Ưng", bonus: 55 },
  { name: "Bạch Trạch", bonus: 80 },
  { name: "Thanh Long Cub", bonus: 90 }
];

const COMPANIONS = [
  { name: "Tiểu Linh", role: "Luyện đan", bonus: 5 },
  { name: "Bạch Y", role: "Kiếm tu", bonus: 8 },
  { name: "Cửu Nguyệt", role: "Trận pháp", bonus: 6 },
  { name: "Hàn Phong", role: "Thợ rèn", bonus: 7 },
  { name: "Mặc Vũ", role: "Thu thập", bonus: 4 }
];

const WORLD_EVENTS = [
  "Thiên kiếp quét qua, tu vi toàn cõi dao động!",
  "Tàn hồn cổ tiên xuất hiện, truyền thừa bất ngờ xuất thế.",
  "Ngoại vực mở cổng, dị bảo tràn ra khắp nơi.",
  "Thánh địa tuyên bố chiêu mộ tán tu, phần thưởng khổng lồ.",
  "Ma Vực trỗi dậy, yêu ma xâm lấn biên cảnh."
];

const BLESSINGS = [
  { name: "Thiên Cơ Phù", effect: (player) => { player.luck += 5; } },
  { name: "Đạo Tâm", effect: (player) => { player.comprehension += 3; } },
  { name: "Hộ Thể Quang", effect: (player) => { player.guard = true; } },
  { name: "Tinh Minh", effect: (player) => { player.qiMax += 30; } },
  { name: "Phúc Duyên", effect: (player) => { player.spiritStones += 300; } }
];

function formatPanel(title, sections = [], options = {}) {
  const accent = options.accent || "✦";
  const width = options.width || 46;
  const border = "─".repeat(width);
  const lines = [`╭${border}╮`, `│ ${accent} ${title.toUpperCase()}`];
  lines.push(`├${border}┤`);
  sections.forEach((section, index) => {
    if (section === null || typeof section === "undefined") return;
    const chunk = String(section).split("\n");
    chunk.forEach((line) => {
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

function getEquippedArtifact(player) {
  if (!player || !player.artifactEquipped) return null;
  const data = ARTIFACTS[player.artifactEquipped];
  if (!data) return null;
  return { key: player.artifactEquipped, ...data };
}

function getArtifactBonusValue(player, field) {
  const artifact = getEquippedArtifact(player);
  if (artifact && artifact.bonus && typeof artifact.bonus[field] === "number") {
    return artifact.bonus[field];
  }
  return 0;
}

function getEffectivePower(player) {
  return player.power + getArtifactBonusValue(player, "power");
}

function getEffectiveLuck(player) {
  return player.luck + getArtifactBonusValue(player, "luck");
}

function getEffectiveComprehension(player) {
  return player.comprehension + getArtifactBonusValue(player, "comprehension");
}

function getEffectiveQiMax(player) {
  return player.qiMax + getArtifactBonusValue(player, "qi");
}

function applyReward(player, reward = {}) {
  let summary = [];
  Object.entries(reward).forEach(([key, value]) => {
    if (!value) return;
    switch (key) {
      case 'stones':
        player.spiritStones += value;
        summary.push(`+${value} linh thạch`);
        break;
      case 'qi':
        gainQi(player, value);
        summary.push(`+${value} khí`);
        break;
      case 'exp':
        player.exp += value;
        summary.push(`+${value} exp`);
        break;
      case 'skillPoints':
        player.skillPoints += value;
        summary.push(`+${value} điểm kỹ năng`);
        break;
      case 'rareHerb':
        player.inventory.rareHerb += value;
        summary.push(`+${value} linh thảo`);
        break;
      case 'herb':
        player.inventory.herb += value;
        summary.push(`+${value} dược thảo`);
        break;
      case 'ore':
        player.inventory.ore += value;
        summary.push(`+${value} quặng`);
        break;
      case 'essence':
        player.inventory.essence += value;
        summary.push(`+${value} tinh thạch`);
        break;
      case 'shard':
        player.inventory.shard += value;
        summary.push(`+${value} thiên thạch vụn`);
        break;
      case 'treasureKey':
        player.inventory.treasureKey += value;
        summary.push(`+${value} chìa khoá bí cảnh`);
        break;
      default:
        if (player.inventory[key] !== undefined) {
          player.inventory[key] += value;
          summary.push(`+${value} ${key}`);
        }
        break;
    }
  });
  return summary.join(", ");
}

function grantShardChance(player, chance = 0.15) {
  if (Math.random() < chance) {
    player.inventory.shard += 1;
    return true;
  }
  return false;
}

function pickWorldEvent() {
  currentWorldEvent = {
    ...randomElement(WORLD_EVENT_POOL),
    startedAt: Date.now()
  };
}

function startWorldEventCycle() {
  try {
    pickWorldEvent();
    if (worldEventTimer) clearInterval(worldEventTimer);
    worldEventTimer = setInterval(() => {
      pickWorldEvent();
    }, 60 * 60 * 1000);
  } catch (error) {
    console.error('[TuTien] world event rotation error', error);
  }
}

function createLetter() {
  const template = randomElement(NPC_LETTER_POOL);
  return {
    id: `${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    title: template.title,
    body: template.body,
    reward: template.reward,
    ts: Date.now(),
    claimed: false,
    read: false
  };
}

function ensureMailbox(player) {
  if (!Array.isArray(player.mailbox)) player.mailbox = [];
  const now = Date.now();
  if (player.mailbox.length === 0) {
    player.mailbox.push(createLetter());
    return;
  }
  const lastLetter = player.mailbox[player.mailbox.length - 1];
  if (now - (lastLetter?.ts || 0) > 2 * 60 * 60 * 1000 && player.mailbox.length < 5) {
    player.mailbox.push(createLetter());
  }
}

function formatInventoryCost(cost = {}) {
  return Object.entries(cost)
    .map(([key, value]) => `${value} ${key}`)
    .join(" + ");
}

const ARTIFACTS = {
  starlotus: {
    name: "Liên Tinh Hoa",
    desc: "Tăng lực chiến +40, khí tối đa +30, may mắn +2",
    cost: { shard: 12, essence: 1 },
    bonus: { power: 40, qi: 30, luck: 2 }
  },
  dragonsoul: {
    name: "Long Hồn Tháp",
    desc: "Tăng lực chiến +65, may mắn +3",
    cost: { shard: 18, essence: 2 },
    bonus: { power: 65, luck: 3 }
  },
  moonmirror: {
    name: "Nguyệt Ảnh Kính",
    desc: "Tăng ngộ tính +3, hồi thêm khí khi meditate",
    cost: { shard: 14, essence: 1 },
    bonus: { comprehension: 3 },
    extra: { meditateQi: 10 }
  }
};

const NPC_LETTER_POOL = [
  {
    title: "Thư của Trưởng Lão",
    body: "Hãy dùng số linh thạch này để trùng tu pháp khí, đừng phụ kỳ vọng của tông môn.",
    reward: { stones: 600, herb: 1 }
  },
  {
    title: "Tiểu Linh gửi lời",
    body: "Ta vừa tìm được ít linh thảo, mong huynh dùng tốt.",
    reward: { rareHerb: 1, shard: 2 }
  },
  {
    title: "Tin khẩn từ biên cảnh",
    body: "Ma tộc sắp tràn tới, hãy chuẩn bị artifact mạnh hơn!",
    reward: { shard: 3, essence: 1 }
  }
];

const WORLD_EVENT_POOL = [
  {
    key: "storm",
    name: "Lôi Bão Dị Tượng",
    description: "Thiên lôi phủ đầy trời, tu sĩ sấm hệ mạnh vượt trội.",
    buff: "+15% sát thương raid",
    reward: { qi: 90, stones: 400 }
  },
  {
    key: "lotus",
    name: "Liên Trì Khai Nở",
    description: "Tiên liên nở rộ, tâm cảnh an định giúp thiền nhanh hơn.",
    buff: "Meditate +25 khí",
    reward: { qi: 60, skillPoints: 1 }
  },
  {
    key: "meteor",
    name: "Thiên Thạch Giáng",
    description: "Thiên thạch rơi giải phóng linh khoáng quý.",
    buff: "Explore dễ kiếm quặng",
    reward: { ore: 2, shard: 2 }
  }
];

let currentWorldEvent = null;
let worldEventTimer = null;

const DEFAULT_INVENTORY = {
  herb: 0,
  rareHerb: 0,
  ore: 0,
  steel: 0,
  essence: 0,
  pillMinor: 0,
  pillMajor: 0,
  beastFood: 0,
  treasureKey: 0,
  charm: 0,
  insightScroll: 0,
  shard: 0
};

const DEFAULT_STATS = {
  missions: 0,
  quests: 0,
  breakthroughs: 0,
  duels: 0,
  crafts: 0,
  alchemy: 0,
  explorations: 0,
  treasures: 0,
  raids: 0,
  artifactsForged: 0,
  lettersRead: 0
};

let players = new Map();
let autosaveId = null;
let saveTimeout = null;
const raidRooms = new Map();

function ensureDataEnv() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "{}");
  }
}

function loadPlayers() {
  ensureDataEnv();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8").trim() || "{}";
    const parsed = JSON.parse(raw);
    players = new Map();
    for (const [id, payload] of Object.entries(parsed)) {
      players.set(id, hydratePlayer(payload));
    }
  } catch (error) {
    console.error("[TuTien] Lỗi tải dữ liệu:", error);
    players = new Map();
  }
}

function savePlayers() {
  try {
    const payload = Object.fromEntries(players);
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error("[TuTien] Lỗi lưu dữ liệu:", error);
  }
}

function scheduleSave(immediate = false) {
  if (immediate) {
    savePlayers();
    return;
  }
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    savePlayers();
    saveTimeout = null;
  }, 800);
}

function hydratePlayer(raw = {}) {
  const player = { ...raw };
  player.inventory = { ...DEFAULT_INVENTORY, ...(raw.inventory || {}) };
  player.stats = { ...DEFAULT_STATS, ...(raw.stats || {}) };
  player.cooldowns = raw.cooldowns || {};
  player.weapons = Array.isArray(raw.weapons) ? raw.weapons : [];
  player.blessings = Array.isArray(raw.blessings) ? raw.blessings : [];
  player.contracts = Array.isArray(raw.contracts) ? raw.contracts : [];
  player.qiMax = raw.qiMax || 120;
  player.qi = raw.qi || 0;
  player.power = raw.power || 50;
  player.realmIdx = typeof raw.realmIdx === "number" ? raw.realmIdx : 0;
  player.realmLevel = raw.realmLevel || 1;
  player.exp = raw.exp || 0;
  player.expToNext = raw.expToNext || 500;
  player.comprehension = raw.comprehension || 5;
  player.luck = raw.luck || 0;
  player.spiritStones = raw.spiritStones || 200;
  player.location = raw.location || "Phàm Giới";
  player.guard = Boolean(raw.guard);
  player.name = raw.name || "Ẩn Tu";
  player.spiritualRoot = raw.spiritualRoot || "Vô thuộc tính";
  player.sect = raw.sect || null;
  player.reputation = raw.reputation || 0;
  player.skillPoints = typeof raw.skillPoints === "number" ? raw.skillPoints : 0;
  player.skills = Array.isArray(raw.skills) ? raw.skills : [];
  player.artifacts = Array.isArray(raw.artifacts) ? raw.artifacts : [];
  player.artifactEquipped = raw.artifactEquipped || null;
  player.mailbox = Array.isArray(raw.mailbox) ? raw.mailbox : [];
  player.lastWorldEventClaim = raw.lastWorldEventClaim || null;
  player.weapons = player.weapons.length ? player.weapons : ["Kiếm Gỗ"];
  if (!player.equippedWeapon && player.weapons.length) {
    player.equippedWeapon = player.weapons[0];
  }
  if (!player.blessings.length) {
    player.blessings = [];
  }
  player.lastStory = raw.lastStory || 0;
  return player;
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function ensurePlayer(senderId, displayName, customName) {
  let player = players.get(senderId);
  if (!player) {
    const root = randomElement(ROOTS);
    player = {
      id: senderId,
      name: customName || displayName || `Tán Tu ${root.name}`,
      spiritualRoot: root.name,
      comprehension: root.bonus,
      luck: root.luck,
      realmIdx: 0,
      realmLevel: 1,
      exp: 0,
      expToNext: 500,
      qi: 60,
      qiMax: 120,
      power: 70,
      spiritStones: 800,
      location: "Phàm Giới",
      sect: null,
      reputation: 0,
      inventory: { ...DEFAULT_INVENTORY, herb: 3, ore: 2, pillMinor: 1 },
      stats: { ...DEFAULT_STATS },
      cooldowns: {},
      weapons: ["Kiếm Gỗ"],
      equippedWeapon: "Kiếm Gỗ",
      beast: null,
      companion: null,
      blessings: [],
      contracts: [],
      guard: false,
      lastStory: 0,
      skillPoints: 0,
      skills: [],
      artifacts: [],
      artifactEquipped: null,
      mailbox: [],
      lastWorldEventClaim: null
    };
    players.set(senderId, player);
  } else {
    players.set(senderId, hydratePlayer(player));
  }
  return players.get(senderId);
}

function formatRealm(player) {
  const realm = REALMS[player.realmIdx] || REALMS[REALMS.length - 1];
  return `${realm.name} Tầng ${player.realmLevel}`;
}

function calcExpToNext(player) {
  const realm = REALMS[player.realmIdx] || REALMS[0];
  const base = 400 + player.realmIdx * 350 + player.realmLevel * 120;
  player.expToNext = Math.round(base * (1 + realm.bonus / 10));
}

function formatCooldown(ms) {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}p${seconds > 0 ? `${seconds}s` : ""}`;
  return `${seconds}s`;
}

function isOnCooldown(player, key) {
  const now = Date.now();
  return player.cooldowns[key] && player.cooldowns[key] > now;
}

function setCooldown(player, key, seconds) {
  player.cooldowns[key] = Date.now() + seconds * 1000;
}

function remainingCooldown(player, key) {
  const now = Date.now();
  const left = (player.cooldowns[key] || 0) - now;
  return left > 0 ? left : 0;
}

const COMMAND_ORDER = [
  "help",
  "register",
  "rename",
  "profile",
  "realms",
  "meditate",
  "cultivate",
  "train",
  "breakthrough",
  "mission",
  "quest",
  "explore",
  "dungeon",
  "treasure",
  "gather",
  "forage",
  "refine",
  "alchemy",
  "pill",
  "forge",
  "equip",
  "unequip",
  "shop",
  "buy",
  "sell",
  "inventory",
  "beast",
  "feed",
  "companion",
  "travel",
  "map",
  "sect",
  "joinsect",
  "leavesect",
  "leaderboard",
  "gift",
  "trade",
  "focus",
  "bless",
  "insight",
  "protect",
  "event",
  "contract",
  "story",
  "tutorial",
  "skill",
  "raid",
  "artifact",
  "mail"
];

const CATEGORY_NOTE = `📚 Nhóm lệnh:
• Nhân vật: register, rename, profile, realms, story
• Tu luyện: meditate, cultivate, train, breakthrough, focus, insight
• Nhiệm vụ/khám phá: mission, quest, explore, gather, forage, dungeon, treasure, event, raid
• Chế tác: refine, alchemy, pill, forge
• Trang bị/tài sản: equip, unequip, inventory, shop, buy, sell, trade
• Artifact & thư: artifact, mail, contract
• Linh thú/đồng hành: beast, feed, companion
• Di chuyển & tông môn: map, travel, sect, joinsect, leavesect
• Xã giao & phòng thủ: leaderboard, gift, bless, protect`;

const COMMAND_ALIASES = {
  menu: "help",
  start: "register",
  info: "profile",
  stats: "profile",
  realmslist: "realms",
  meditate: "meditate",
  cultivate: "cultivate",
  train: "train",
  questing: "quest",
  exploreland: "explore",
  dungeonrun: "dungeon",
  inventory: "inventory",
  bag: "inventory",
  beastbond: "beast",
  feedbeast: "feed",
  compan: "companion",
  travelto: "travel",
  mapinfo: "map",
  sectinfo: "sect",
  join: "joinsect",
  leave: "leavesect",
  rank: "leaderboard",
  donate: "gift",
  focusqi: "focus",
  blessme: "bless",
  comprehend: "insight",
  guard: "protect",
  eventnews: "event",
  pact: "contract",
  lore: "story",
  tutorial: "tutorial",
  guide: "tutorial",
  skilltree: "skill",
  skills: "skill",
  raidboss: "raid",
  boss: "raid",
  artifact: "artifact",
  forgeartifact: "artifact",
  mail: "mail",
  letters: "mail",
  news: "event"
};

async function handleHelp() {
  const commandBlock = COMMAND_ORDER.map((cmd, index) => `${String(index + 1).padStart(2, "0")}. ${cmd}`).join("\n");
  const sections = [
    "✨ Flow luyện công đề xuất:",
    formatList(
      [
        "Đăng ký: tu register <tên>",
        "Luân phiên meditate → cultivate để tích khí",
        "Làm mission/quest/explore để gom tài nguyên",
        "Đủ exp thì breakthrough, nhớ bật protect",
        "Rèn pháp khí & săn thú bằng forge/beast",
        "Tham gia tông môn với joinsect và chia sẻ qua gift"
      ],
      "•"
    ),
    "",
    "📚 Nhóm chính:",
    CATEGORY_NOTE,
    "",
    "🗂️ Danh sách lệnh:",
    commandBlock,
    "",
    "💡 Tip: gõ 'tutien help' để xem bản mở rộng kèm hướng dẫn chi tiết."
  ];
  const message = formatPanel("TuTien Menu", sections, { accent: "🪷" });
  return { text: message };
}

function requirePlayerContext(context) {
  const player = players.get(context.senderId);
  if (!player) {
    return {
      error: "⚠️ Bạn chưa đăng ký. Gõ: tu register <tên> để bắt đầu tu tiên!"
    };
  }
  ensureMailbox(player);
  return { player };
}

function handleRegister(context) {
  const displayName = context.event?.senderName || "Tán Tu";
  const customName = context.args.join(" ").trim();
  if (players.has(context.senderId)) {
    return { text: "Bạn đã gia nhập con đường tu tiên rồi!", save: false };
  }
  const player = ensurePlayer(context.senderId, displayName, customName);
  calcExpToNext(player);
  scheduleSave(true);
  return {
    text: `✨ Đăng ký thành công! Linh căn: ${player.spiritualRoot}. Nhập 'tu help' để xem 40 lệnh.`
  };
}

function handleRename(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const newName = context.args.join(" ").trim();
  if (!newName) return { text: "Hãy nhập tên mới." };
  player.name = newName.slice(0, 32);
  scheduleSave();
  return { text: `🎭 Đã đổi đạo hiệu thành ${player.name}.` , save: true };
}

function handleProfile(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const realmText = formatRealm(player);
  const beastText = player.beast ? `${player.beast.name} (+${player.beast.bonus} lực chiến)` : "Chưa có";
  const companionText = player.companion ? `${player.companion.name} (${player.companion.role})` : "Chưa kết giao";
  const sectText = player.sect || "Tán tu";
  const sections = [
    `🪷 ${player.name} | Linh căn: ${player.spiritualRoot}`,
    `🔰 Cảnh giới: ${realmText}`,
    `⚡ Lực chiến: ${getEffectivePower(player)}`,
    `🌿 Khí: ${player.qi}/${getEffectiveQiMax(player)} • 📚 Ngộ tính: ${getEffectiveComprehension(player)}`,
    `💠 Linh thạch: ${player.spiritStones}`,
    `🏯 Môn phái: ${sectText}`,
    `🦊 Linh thú: ${beastText}`,
    `🤝 Đồng hành: ${companionText}`,
    `📍 Khu vực: ${player.location}`,
    `⭐ Điểm kỹ năng: ${player.skillPoints} | Đã mở: ${player.skills.length ? player.skills.join(", ") : "Chưa có"}`,
    `💎 Artifact: ${player.artifactEquipped ? ARTIFACTS[player.artifactEquipped]?.name || player.artifactEquipped : "Chưa trang bị"}`
  ];
  return { text: formatPanel("Hồ Sơ Tu Tiên", sections, { accent: "🌸" }) };
}

function handleRealms() {
  let message = "📜 BẢNG CẢNH GIỚI\n";
  REALMS.forEach((realm, idx) => {
    message += `${idx + 1}. ${realm.name} (${realm.levels} tầng)\n`;
  });
  return { text: message };
}

function gainQi(player, amount) {
  const cap = getEffectiveQiMax(player);
  player.qi = Math.min(cap, player.qi + amount);
}

function handleMeditate(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (isOnCooldown(player, "meditate")) {
    return { text: `⏳ Cần chờ ${formatCooldown(remainingCooldown(player, "meditate"))} nữa mới có thể tĩnh toạ.` };
  }
  const extra = (getEquippedArtifact(player)?.extra?.meditateQi || 0);
  const gain = 40 + Math.floor(Math.random() * 20) + Math.floor(getEffectiveComprehension(player) / 2) + extra;
  gainQi(player, gain);
  setCooldown(player, "meditate", 75);
  scheduleSave();
  return { text: `🧘‍♂️ Bạn hấp thu được ${gain} điểm linh khí. Hiện có ${player.qi}/${player.qiMax}.`, save: true };
}

function handleCultivate(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (player.qi < 20) return { text: "Linh khí quá thấp để vận công." };
  const spend = Math.min(player.qi, 80);
  player.qi -= spend;
  const bonus = 1 + (getEffectiveComprehension(player) + getEffectiveLuck(player)) / 100;
  const expGain = Math.round(spend * bonus);
  player.exp += expGain;
  scheduleSave();
  return { text: `🌌 Bạn chuyển hóa ${spend} khí thành ${expGain} kinh nghiệm. Tiến độ: ${player.exp}/${player.expToNext}.`, save: true };
}

function handleTrain(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  let gain = 10 + Math.floor(Math.random() * 15);
  if (player.skills.includes("swordmaster")) {
    gain += 5;
  }
  player.power += gain;
  player.stats.missions += 1;
  scheduleSave();
  return { text: `⚔️ Bạn khổ luyện và tăng ${gain} lực chiến. Tổng lực chiến: ${player.power}.`, save: true };
}

function handleBreakthrough(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (player.exp < player.expToNext) {
    return { text: `Tích lũy chưa đủ. Cần ${player.expToNext - player.exp} exp nữa.` };
  }
  const base = 65 - player.realmIdx * 3 + getEffectiveLuck(player) * 0.4;
  const chance = Math.min(92, Math.max(30, base));
  const roll = Math.random() * 100;
  if (roll <= chance) {
    player.exp -= player.expToNext;
    player.realmLevel += 1;
    const realmInfo = REALMS[player.realmIdx] || REALMS[REALMS.length - 1];
    if (player.realmLevel > realmInfo.levels) {
      player.realmIdx = Math.min(REALMS.length - 1, player.realmIdx + 1);
      player.realmLevel = 1;
    }
    calcExpToNext(player);
    player.stats.breakthroughs += 1;
    player.power += 40;
    player.qiMax += 25;
    player.skillPoints += 1;
    scheduleSave();
    return { text: `🌠 Thiên lôi đánh xuống nhưng bạn vẫn vững vàng! Đột phá thành công tới ${formatRealm(player)} (+1 điểm kỹ năng).`, save: true };
  }
  player.exp = Math.floor(player.exp * 0.8);
  scheduleSave();
  return { text: "⚡ Thiên kiếp quá hung hãn, bạn thất bại và mất 20% kinh nghiệm.", save: true };
}

function randomReward(player, type = "mission") {
  const base = 200 + player.realmIdx * 100;
  const stones = Math.round(base + Math.random() * 200);
  player.spiritStones += stones;
  const exp = Math.round(120 + Math.random() * 160);
  player.exp += exp;
  const qi = 30 + Math.floor(Math.random() * 30);
  gainQi(player, qi);
  const gainSkillPoint = Math.random() < 0.15;
  if (gainSkillPoint) {
    player.skillPoints += 1;
  }
  if (type === "quest" && Math.random() < 0.3) {
    player.inventory.rareHerb += 1;
  }
  calcExpToNext(player);
  return { stones, exp, qi, skillPoint: gainSkillPoint };
}

function handleMission(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const reward = randomReward(player, "mission");
  player.stats.missions += 1;
  scheduleSave();
  const extra = reward.skillPoint ? " +1 điểm kỹ năng" : "";
  return { text: `📜 Hoàn thành nhiệm vụ tông môn. Nhận ${reward.stones} linh thạch, ${reward.exp} exp, ${reward.qi} khí${extra}.` , save: true };
}

function handleQuest(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const reward = randomReward(player, "quest");
  player.stats.quests += 1;
  scheduleSave();
  const extra = reward.skillPoint ? " +1 điểm kỹ năng" : "";
  return { text: `🗺️ Phiêu lưu hoàn tất! Lộc trời: ${reward.stones} linh thạch, ${reward.exp} exp, ${reward.qi} khí${extra}.` , save: true };
}

function handleExplore(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const eventChance = Math.random();
  let text = "";
  if (eventChance < 0.4) {
    player.inventory.herb += 1;
    text = "🌿 Bạn nhặt được thêm 1 dược thảo.";
  } else if (eventChance < 0.7) {
    player.inventory.ore += 1;
    text = "⛰️ Bạn đào được 1 khối quặng.";
  } else {
    player.luck += 1;
    text = "✨ Gặp kỳ duyên, vận khí tăng lên.";
  }
  player.stats.explorations += 1;
  scheduleSave();
  return { text, save: true };
}

function handleDungeon(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (player.inventory.treasureKey <= 0) {
    return { text: "Cần chìa khóa bí cảnh (treasureKey) để vào." };
  }
  player.inventory.treasureKey -= 1;
  const success = Math.random() * 100 < 70 + player.luck;
  if (success) {
    player.inventory.rareHerb += 2;
    player.inventory.essence += 1;
    player.stats.treasures += 1;
    scheduleSave();
    return { text: "🏯 Bạn dẹp sạch bí cảnh và thu được 2 linh thảo hiếm + 1 linh tinh." , save: true };
  }
  player.qi = Math.max(0, player.qi - 30);
  scheduleSave();
  return { text: "💥 Bí cảnh bộc phát! Bạn bị thương nhẹ và mất 30 khí." , save: true };
}

function handleTreasure(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (Math.random() < 0.5) {
    player.inventory.charm += 1;
    player.inventory.insightScroll += 1;
    scheduleSave();
    return { text: "🎁 Kho báu ban tặng 1 hộ phù & 1 ngộ đạo quyển." , save: true };
  }
  player.spiritStones += 500;
  scheduleSave();
  return { text: "💎 Bạn tìm thấy rương chứa 500 linh thạch." , save: true };
}

function handleGather(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const amount = 1 + Math.floor(Math.random() * 3);
  player.inventory.herb += amount;
  scheduleSave();
  return { text: `🌱 Thu thập được ${amount} dược thảo.` , save: true };
}

function handleForage(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const eventBoost = currentWorldEvent?.key === 'meteor' ? 1 : 0;
  const amount = 1 + Math.floor(Math.random() * 2) + eventBoost;
  player.inventory.ore += amount;
  scheduleSave();
  return { text: `⛏️ Đào được ${amount} quặng linh.` , save: true };
}

function handleRefine(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (player.inventory.ore < 2) return { text: "Cần ít nhất 2 quặng để luyện tinh." };
  player.inventory.ore -= 2;
  player.inventory.essence += 1;
  scheduleSave();
  return { text: "🔥 Luyện được 1 tinh thạch." , save: true };
}

function handleAlchemy(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (player.inventory.herb < 3) return { text: "Thiếu dược liệu (cần 3)." };
  player.inventory.herb -= 3;
  const rareChance = player.skills.includes("alchemist") ? 0.35 : 0.2;
  if (Math.random() < rareChance) {
    player.inventory.rareHerb += 1;
    return { text: "⚗️ Lò đan nổ tung nhưng ngẫu nhiên tạo ra 1 linh thảo hiếm!", save: true };
  }
  const pillGain = player.skills.includes("alchemist") ? 2 : 1;
  player.inventory.pillMinor += pillGain;
  player.stats.alchemy += 1;
  scheduleSave();
  return { text: `🧪 Luyện thành công ${pillGain} tiểu tụ linh đan.` , save: true };
}

function handlePill(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const type = (context.args[0] || "minor").toLowerCase();
  if (type === "minor") {
    if (player.inventory.pillMinor <= 0) return { text: "Bạn không có tiểu đan." };
    player.inventory.pillMinor -= 1;
    gainQi(player, 80);
    return { text: "💊 Dùng tiểu đan, khí lực hồi phục 80." , save: true };
  }
  if (player.inventory.pillMajor <= 0) return { text: "Bạn không có đại đan." };
  player.inventory.pillMajor -= 1;
  gainQi(player, 120);
  player.exp += 120;
  scheduleSave();
  return { text: "💊 Đại tụ linh đan giúp hồi 120 khí và +120 exp." , save: true };
}

function handleForge(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (player.inventory.steel < 1 || player.inventory.essence < 1) {
    return { text: "Cần 1 tinh thiết + 1 tinh thạch để rèn binh." };
  }
  player.inventory.steel -= 1;
  player.inventory.essence -= 1;
  const weapon = `Pháp khí cấp ${player.realmIdx + 1}-${player.weapons.length + 1}`;
  player.weapons.push(weapon);
  player.power += 25;
  player.stats.crafts += 1;
  scheduleSave();
  return { text: `🔨 Bạn rèn được ${weapon}.` , save: true };
}

function handleEquip(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const keyword = context.args.join(" ").toLowerCase();
  const weapon = player.weapons.find((w) => w.toLowerCase() === keyword);
  if (!weapon) return { text: "Không tìm thấy pháp khí trong kho." };
  player.equippedWeapon = weapon;
  scheduleSave();
  return { text: `⚙️ Đã trang bị ${weapon}.` , save: true };
}

function handleUnequip(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  player.equippedWeapon = null;
  scheduleSave();
  return { text: "Bạn cất pháp khí vào túi." , save: true };
}

function handleShop() {
  let message = "🏪 TIỆM TÀI NGUYÊN\n";
  Object.entries(SHOP_ITEMS).forEach(([key, item]) => {
    message += `• ${key} - ${item.label}: ${item.price} linh thạch\n`;
  });
  message += "\nMua: tu buy <tên> <số lượng>";
  return { text: message };
}

function handleBuy(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const itemKey = (context.args[0] || "").toLowerCase();
  const qty = Math.max(1, parseInt(context.args[1], 10) || 1);
  const item = SHOP_ITEMS[itemKey];
  if (!item) return { text: "Vật phẩm không tồn tại." };
  const cost = item.price * qty;
  if (player.spiritStones < cost) return { text: "Không đủ linh thạch." };
  player.spiritStones -= cost;
  player.inventory[item.inventoryKey] += qty;
  scheduleSave();
  return { text: `🛒 Mua ${qty} ${item.label}. Còn ${player.spiritStones} linh thạch.` , save: true };
}

function handleSell(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const itemKey = (context.args[0] || "").toLowerCase();
  const qty = Math.max(1, parseInt(context.args[1], 10) || 1);
  const item = SHOP_ITEMS[itemKey];
  if (!item) return { text: "Không thể bán vật phẩm này." };
  const invKey = item.inventoryKey;
  if (player.inventory[invKey] < qty) return { text: "Bạn không có đủ vật phẩm." };
  player.inventory[invKey] -= qty;
  const gain = Math.round(item.price * qty * 0.5);
  player.spiritStones += gain;
  scheduleSave();
  return { text: `💰 Bán được ${gain} linh thạch.` , save: true };
}

function handleInventory(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const lines = Object.entries(player.inventory)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `• ${key}: ${value}`);
  const message = lines.length ? lines.join("\n") : "Túi trống trơn.";
  return { text: `🎒 TÚI ĐỒ\n${message}` };
}

function handleBeast(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (player.beast) {
    return { text: `Bạn đã có ${player.beast.name}. Dùng 'tu feed' để chăm sóc.` };
  }
  const beast = randomElement(BEAST_POOL);
  const bonusChance = player.skills.includes("beastmaster") ? 15 : 0;
  if (Math.random() * 100 < 55 + getEffectiveLuck(player) + bonusChance) {
    player.beast = beast;
    player.power += beast.bonus;
    scheduleSave();
    return { text: `🦊 Tâm linh tương hợp! Bạn thuần phục ${beast.name} (+${beast.bonus} lực chiến).` , save: true };
  }
  return { text: "🐾 Linh thú bỏ chạy, thử lại sau." };
}

function handleFeed(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (!player.beast) return { text: "Bạn chưa có linh thú." };
  if (player.inventory.beastFood <= 0) return { text: "Cần beastFood để cho ăn." };
  player.inventory.beastFood -= 1;
  const bonus = player.skills.includes("beastmaster") ? 8 : 5;
  player.beast.bonus += bonus;
  player.power += bonus;
  scheduleSave();
  return { text: `🍖 ${player.beast.name} vui vẻ và tăng thêm ${bonus} lực chiến.` , save: true };
}

function handleCompanion(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (player.companion) return { text: `Bạn đang đồng hành cùng ${player.companion.name}.` };
  const companion = randomElement(COMPANIONS);
  player.companion = companion;
  player.comprehension += companion.bonus;
  scheduleSave();
  return { text: `🤝 ${companion.name} (${companion.role}) gia nhập, +${companion.bonus} ngộ tính.` , save: true };
}

function handleTravel(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const destination = context.args.join(" ");
  const target = LOCATIONS.find((loc) => loc.name.toLowerCase() === destination.toLowerCase());
  if (!target) return { text: "Không tìm thấy địa điểm." };
  player.location = target.name;
  scheduleSave();
  return { text: `🚶‍♂️ Bạn di chuyển tới ${target.name}: ${target.desc}.` , save: true };
}

function handleMap() {
  let message = "🗺️ BẢN ĐỒ\n";
  LOCATIONS.forEach((loc) => {
    message += `• ${loc.name} – ${loc.desc}\n`;
  });
  return { text: message };
}

function handleSect(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const sectText = player.sect || "Bạn là tán tu, chưa nhập tông.";
  return { text: `🏯 ${sectText}` };
}

function handleJoinSect(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const name = context.args.join(" ");
  if (!name) return { text: "Nhập tên tông môn muốn gia nhập." };
  player.sect = name.slice(0, 40);
  player.reputation += 30;
  scheduleSave();
  return { text: `🎎 Bạn chính thức gia nhập ${player.sect}.` , save: true };
}

function handleLeaveSect(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  player.sect = null;
  scheduleSave();
  return { text: "📜 Bạn đã rời tông, trở lại làm tán tu." , save: true };
}

function handleLeaderboard() {
  const ranking = Array.from(players.values())
    .sort((a, b) => b.power - a.power)
    .slice(0, 5);
  if (!ranking.length) return { text: "Chưa có người tu luyện." };
  let message = "🏆 TOP CAO THỦ\n";
  ranking.forEach((player, index) => {
    message += `${index + 1}. ${player.name} – ${player.power} lực chiến (${formatRealm(player)})\n`;
  });
  return { text: message };
}

function handleGift(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const amount = parseInt(context.args[1], 10) || 0;
  const mentionId = Object.keys(context.event.mentions || {})[0] || context.args[0];
  if (!mentionId) return { text: "Hãy nhắc người nhận." };
  if (amount <= 0) return { text: "Số lượng không hợp lệ." };
  if (player.spiritStones < amount) return { text: "Bạn không đủ linh thạch." };
  const targetId = String(mentionId);
  const target = players.get(targetId);
  if (!target) return { text: "Người nhận chưa tu tiên." };
  player.spiritStones -= amount;
  target.spiritStones += amount;
  scheduleSave();
  return { text: `🎁 Bạn tặng ${amount} linh thạch cho ${target.name}.` , save: true };
}

function handleTrade(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const mode = (context.args[0] || "stones2qi").toLowerCase();
  if (mode === "stones2qi") {
    if (player.spiritStones < 200) return { text: "Cần 200 linh thạch." };
    player.spiritStones -= 200;
    gainQi(player, 120);
    scheduleSave();
    return { text: "🔄 Đổi 200 linh thạch lấy 120 khí." , save: true };
  }
  if (player.qi < 80) return { text: "Không đủ khí để chuyển." };
  player.qi -= 80;
  player.spiritStones += 140;
  scheduleSave();
  return { text: "🔄 Chuyển 80 khí thành 140 linh thạch." , save: true };
}

function handleFocus(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  player.cooldowns.meditate = Date.now();
  scheduleSave();
  return { text: "🧠 Tâm thần thanh tịnh, bạn có thể tĩnh toạ ngay." , save: true };
}

function handleBless(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const blessing = randomElement(BLESSINGS);
  blessing.effect(player);
  player.blessings.push({ name: blessing.name, ts: Date.now() });
  scheduleSave();
  return { text: `✨ Nhận được phúc duyên: ${blessing.name}.` , save: true };
}

function handleInsight(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (player.exp < 150) return { text: "Cần 150 exp để ngộ đạo." };
  player.exp -= 150;
  player.comprehension += 2;
  player.inventory.insightScroll = Math.max(0, player.inventory.insightScroll - 1);
  scheduleSave();
  return { text: "🌀 Bạn ngộ ra chân ý, +2 ngộ tính." , save: true };
}

function handleProtect(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  player.guard = !player.guard;
  scheduleSave();
  return { text: player.guard ? "🛡️ Bạn kích hoạt hộ thân phù, giảm thiệt hại." : "🛡️ Bạn cất hộ thân phù." , save: true };
}

function handleEvent(context) {
  if (!currentWorldEvent) pickWorldEvent();
  const sub = (context?.args[0] || "status").toLowerCase();
  const lines = [
    `🌍 ${currentWorldEvent.name}`,
    currentWorldEvent.description,
    `Hiệu ứng: ${currentWorldEvent.buff}`,
    `Thưởng khi claim: ${formatList(Object.entries(currentWorldEvent.reward).map(([k, v]) => `${v} ${k}`), "•")}`
  ];

  if (sub === 'claim') {
    const check = requirePlayerContext(context);
    if (check.error) return { text: check.error };
    const player = check.player;
    const claimed = player.lastWorldEventClaim;
    if (claimed && claimed.key === currentWorldEvent.key && claimed.ts === currentWorldEvent.startedAt) {
      return { text: "Bạn đã nhận thưởng sự kiện này rồi." };
    }
    const rewardText = applyReward(player, currentWorldEvent.reward) || "Bạn nhận được quà.";
    player.lastWorldEventClaim = { key: currentWorldEvent.key, ts: currentWorldEvent.startedAt };
    scheduleSave();
    return { text: formatPanel("World Event", [...lines, "", `🎁 Nhận thưởng: ${rewardText}`], { accent: "🌐" }) , save: true };
  }

  return { text: formatPanel("World Event", lines, { accent: "🌐" }) };
}

function handleContract(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  if (!player.beast) return { text: "Cần linh thú để ký khế ước." };
  const contract = {
    name: player.beast.name,
    ts: Date.now()
  };
  player.contracts.push(contract);
  player.power += 20;
  scheduleSave();
  return { text: `📜 Bạn ký khế ước với ${player.beast.name}, lực chiến +20.` , save: true };
}

function handleStory(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const lines = [
    `${player.name} phiêu bạt khắp ${player.location},`,
    `trải qua ${player.stats.missions + player.stats.quests} nhiệm vụ,`,
    `đã ${player.stats.breakthroughs} lần đối mặt thiên kiếp,`,
    `và hiện đạt tới ${formatRealm(player)}.`
  ];
  return { text: formatPanel("Truyền Kỳ", [`📖 ${lines.join(" ")}`], { accent: "📜" }) };
}

function handleTutorial() {
  const sections = [
    formatList(TUTORIAL_STEPS, "✔"),
    "",
    "Tip: gõ 'tutien help' để xem hướng dẫn đầy đủ hoặc 'tu skill' mở talent tree."
  ];
  return { text: formatPanel("Hướng Dẫn Nhanh", sections, { accent: "📘" }) };
}

function handleSkill(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const action = (context.args[0] || "").toLowerCase();
  if (action !== "unlock") {
    const owned = player.skills.length ? player.skills.map((key) => SKILLS[key]?.name || key).join(", ") : "Chưa mở";
    const body = Object.entries(SKILLS).map(([key, skill]) => {
      const status = player.skills.includes(key) ? "✅ Đã mở" : `Cost ${skill.cost}`;
      return `${skill.name} (${key}) – ${skill.desc} [${status}]`;
    }).join("\n");
    const sections = [
      `⭐ Điểm kỹ năng: ${player.skillPoints}`,
      `🎯 Đã sở hữu: ${owned}`,
      "",
      body,
      "",
      "Dùng: tu skill unlock <tên>"
    ];
    return { text: formatPanel("Skill Tree", sections, { accent: "🌟" }) };
  }

  const skillKey = (context.args[1] || "").toLowerCase();
  const skill = SKILLS[skillKey];
  if (!skill) {
    return { text: "⚠️ Không tìm thấy kỹ năng." };
  }
  if (player.skills.includes(skillKey)) {
    return { text: "Bạn đã mở kỹ năng này rồi." };
  }
  if (player.skillPoints < skill.cost) {
    return { text: `Cần ${skill.cost} điểm kỹ năng để mở.` };
  }
  player.skillPoints -= skill.cost;
  player.skills.push(skillKey);
  scheduleSave();
  return { text: `✨ Đã mở khóa ${skill.name}! Hiệu ứng áp dụng ngay.` , save: true };
}

function getRaidRoom(threadId) {
  return raidRooms.get(threadId);
}

function describeRaid(room) {
  if (!room || !room.active) {
    return formatPanel("Raid", ["Hiện chưa có boss nào. Dùng 'tu raid start' để mở bí cảnh."], { accent: "⚔️" });
  }
  const lines = [
    `👹 ${room.boss.name} – HP ${room.hp}/${room.maxHp}`,
    `🔥 Người gọi: ${room.startedByName}`,
    `👥 Người tham gia: ${room.contributors.size}`
  ];
  if (room.contributors.size) {
    const top = Array.from(room.contributors.values())
      .sort((a, b) => b.damage - a.damage)
      .slice(0, 3)
      .map((c) => `${c.name}: ${c.damage}`);
    lines.push(`🏅 Top damage: ${top.join(" | ")}`);
  }
  return formatPanel("Raid Status", lines, { accent: "⚔️" });
}

function resolveRaidRewards(threadId, room) {
  const totalDamage = Array.from(room.contributors.values()).reduce((sum, entry) => sum + entry.damage, 0) || 1;
  const summary = [`🏆 ${room.boss.name} đã bị đánh bại! Phát thưởng:`];
  for (const [id, data] of room.contributors.entries()) {
    const participant = players.get(id);
    if (!participant) continue;
    const share = data.damage / totalDamage;
    const stones = Math.max(300, Math.round(room.boss.reward.stones * share));
    const rareHerb = Math.max(share >= 0.25 ? 1 : 0, Math.round(room.boss.reward.rareHerb * share));
    const pill = share >= 0.35 ? room.boss.reward.pillMajor : 0;
    const essence = share >= 0.5 ? 1 : 0;
    participant.spiritStones += stones;
    participant.inventory.rareHerb += rareHerb;
    if (pill) participant.inventory.pillMajor += pill;
    if (essence) participant.inventory.essence += essence;
    participant.skillPoints += 1;
    participant.stats.raids = (participant.stats.raids || 0) + 1;
    summary.push(`• ${data.name}: +${stones} linh thạch${rareHerb ? `, ${rareHerb} linh thảo` : ""}${pill ? `, ${pill} đại đan` : ""}${essence ? ", 1 tinh thạch" : ""}`);
  }
  raidRooms.delete(threadId);
  scheduleSave();
  return formatPanel("Raid Victory", summary, { accent: "🏆" });
}

function applyRaidDamage(threadId, player, damage) {
  const room = raidRooms.get(threadId);
  if (!room || !room.active) {
    return { finished: false, message: formatPanel("Raid", ["⚠️ Chưa có boss để tấn công."], { accent: "⚔️" }) };
  }
  room.hp = Math.max(0, room.hp - damage);
  const entry = room.contributors.get(player.id) || { damage: 0, name: player.name };
  entry.damage += damage;
  entry.name = player.name;
  room.contributors.set(player.id, entry);
  if (room.hp === 0) {
    const rewardMessage = resolveRaidRewards(threadId, room);
    return { finished: true, message: `${rewardMessage}` };
  }
  return {
    finished: false,
    message: formatPanel(
      "Raid Strike",
      [`💥 Bạn gây ${damage} sát thương lên ${room.boss.name}.`, `HP còn: ${room.hp}/${room.maxHp}.`],
      { accent: "⚔️" }
    )
  };
}

function handleRaid(context) {
  const check = requirePlayerContext(context);
  if (check.error) return { text: check.error };
  const player = check.player;
  const sub = (context.args[0] || "status").toLowerCase();
  const threadId = context.threadId;

  if (sub === "start") {
    const existing = getRaidRoom(threadId);
    if (existing && existing.active) {
      return { text: "👹 Đã có boss đang hoạt động. Dùng 'tu raid status' để xem." };
    }
    if (player.inventory.treasureKey <= 0) {
      return { text: "Cần 1 treasureKey để mở bí cảnh raid." };
    }
    player.inventory.treasureKey -= 1;
    const boss = randomElement(RAID_BOSSES);
    const maxHp = boss.baseHp + player.power * 2 + player.realmIdx * 150;
    raidRooms.set(threadId, {
      active: true,
      boss,
      hp: maxHp,
      maxHp,
      contributors: new Map(),
      startedBy: player.id,
      startedByName: player.name
    });
    scheduleSave();
    const card = formatPanel(
      "Raid Xuất Hiện",
      [
        `👹 ${boss.name} đã giáng lâm (${maxHp} HP).`,
        "Dùng 'tu raid strike' để tấn công hoặc 'tu raid contribute <khí>' để truyền khí." 
      ],
      { accent: "⚔️" }
    );
    return { text: card , save: true };
  }

  if (sub === "status") {
    return { text: describeRaid(getRaidRoom(threadId)) };
  }

  if (sub === "contribute") {
    const amount = Math.max(10, parseInt(context.args[1], 10) || 0);
    if (player.qi < amount) {
      return { text: "Không đủ linh khí để dẫn truyền." };
    }
    player.qi -= amount;
    const multiplier = 1 + player.comprehension / 60 + (player.skills.includes("swordmaster") ? 0.2 : 0);
    const damage = Math.round(amount * multiplier);
    const result = applyRaidDamage(threadId, player, damage);
    scheduleSave();
    return { text: result.message , save: true };
  }

  if (sub === "strike" || sub === "fight") {
    const base = player.power * (0.6 + Math.random() * 0.6);
    const damage = Math.round(base * (player.skills.includes("swordmaster") ? 1.25 : 1));
    const result = applyRaidDamage(threadId, player, damage);
    scheduleSave();
    return { text: result.message , save: true };
  }

  return {
    text: "Raid commands: \n• tu raid start\n• tu raid status\n• tu raid strike\n• tu raid contribute <khí>"
  };
}

const COMMAND_HANDLERS = {
  help: handleHelp,
  register: handleRegister,
  rename: handleRename,
  profile: handleProfile,
  realms: handleRealms,
  meditate: handleMeditate,
  cultivate: handleCultivate,
  train: handleTrain,
  breakthrough: handleBreakthrough,
  mission: handleMission,
  quest: handleQuest,
  explore: handleExplore,
  dungeon: handleDungeon,
  treasure: handleTreasure,
  gather: handleGather,
  forage: handleForage,
  refine: handleRefine,
  alchemy: handleAlchemy,
  pill: handlePill,
  forge: handleForge,
  equip: handleEquip,
  unequip: handleUnequip,
  shop: handleShop,
  buy: handleBuy,
  sell: handleSell,
  inventory: handleInventory,
  beast: handleBeast,
  feed: handleFeed,
  companion: handleCompanion,
  travel: handleTravel,
  map: handleMap,
  sect: handleSect,
  joinsect: handleJoinSect,
  leavesect: handleLeaveSect,
  leaderboard: handleLeaderboard,
  gift: handleGift,
  trade: handleTrade,
  focus: handleFocus,
  bless: handleBless,
  insight: handleInsight,
  protect: handleProtect,
  contract: handleContract,
  story: handleStory,
  tutorial: handleTutorial,
  skill: handleSkill,
  raid: handleRaid,
  artifact: handleArtifact,
  mail: handleMail,
  event: handleEvent
};

function resolveCommand(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  const mapped = COMMAND_ALIASES[lower] || lower;
  return COMMAND_HANDLERS[mapped] ? { key: mapped, handler: COMMAND_HANDLERS[mapped] } : null;
}

module.exports = {
  config: {
    name: "tu",
    version: "1.0.0",
    hasPermission: 0,
    credits: "Cascade Tu Tiên",
    description: "Game tu tiên với 40+ lệnh tương tác.",
    commandCategory: "Game",
    usages: "tu <lệnh>",
    cooldowns: 2
  },
  onLoad: () => {
    loadPlayers();
    if (autosaveId) clearInterval(autosaveId);
    autosaveId = setInterval(() => {
      savePlayers();
    }, SAVE_INTERVAL);
    console.log("[TuTien] Đã sẵn sàng với", players.size, "tu sĩ");
    startWorldEventCycle();
  },
  run: async function ({ api, event, args }) {
    const threadId = event.threadId || event.threadID || event.thread_id;
    const type = event.type || event.messageType;
    const senderId = String(event?.data?.uidFrom || event?.authorId || event?.senderID);
    if (!threadId || !senderId) return;

    const sub = args[0];
    if (!sub) {
      const help = await handleHelp();
      return api.sendMessage(help.text, threadId, type);
    }
    const command = resolveCommand(sub);
    if (!command) {
      return api.sendMessage("❓ Lệnh không hợp lệ. Gõ 'tu help' để xem 40 lệnh.", threadId, type);
    }

    const context = {
      api,
      event,
      threadId,
      type,
      senderId,
      args: args.slice(1)
    };

    const skipRegistration = new Set(["register", "help", "tutorial", "event"]);
    if (!skipRegistration.has(command.key)) {
      if (!players.has(senderId)) {
        return api.sendMessage("⚠️ Bạn chưa đăng ký. Gõ: tu register <tên>.", threadId, type);
      }
    }

    const result = await command.handler(context);
    if (!result) return;
    if (result.save) scheduleSave();
    return api.sendMessage(result.text, threadId, type);
  }
};
