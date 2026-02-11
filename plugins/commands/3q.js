const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "3q_players.json");

const HERO_LIBRARY = [
  { id: "trieu_van", name: "Triệu Vân", rarity: "SSR", basePower: 1850, faction: "Thục", role: "Sát thương", skill: "Long Đảm Kích", desc: "Kỵ binh đột kích với tỷ lệ chí mạng cao." },
  { id: "lu_bo", name: "Lữ Bố", rarity: "SSR", basePower: 2000, faction: "Lương", role: "Chiến thần", skill: "Phương Thiên Hoả", desc: "ATK cực lớn, gây sát thương lan." },
  { id: "quan_vu", name: "Quan Vũ", rarity: "SR", basePower: 1550, faction: "Thục", role: "Đấu sĩ", skill: "Thanh Long Đao", desc: "Gây sát thương chuẩn và giảm giáp." },
  { id: "truong_phi", name: "Trương Phi", rarity: "SR", basePower: 1500, faction: "Thục", role: "Đỡ đòn", skill: "Xà Man Hống", desc: "Tăng thủ, phản kích mạnh." },
  { id: "chu_du", name: "Chu Du", rarity: "SR", basePower: 1480, faction: "Ngô", role: "Pháp sư", skill: "Hỏa Phượng Liễn", desc: "Gây đốt cháy liên tục." },
  { id: "tu_ma_y", name: "Tư Mã Ý", rarity: "R", basePower: 1300, faction: "Ngụy", role: "Khống chế", skill: "Thiên Lôi Đình", desc: "Trói chân, giảm nộ." },
  { id: "mach_thu", name: "Mãnh Thú", rarity: "R", basePower: 1200, faction: "Hoang", role: "Săn boss", skill: "Bạo Nộ", desc: "Càng đánh càng khoẻ." },
  { id: "trieu_co", name: "Triệu Cơ", rarity: "N", basePower: 950, faction: "Quần", role: "Hỗ trợ", skill: "Nguyệt Linh", desc: "Hồi máu nhẹ, buff tốc." },
  { id: "dan_sinh", name: "Đản Sinh", rarity: "N", basePower: 900, faction: "Quần", role: "Du hiệp", skill: "Ảnh trảm", desc: "Tăng né tránh và phản kích." }
];

const HERO_MAP = Object.fromEntries(HERO_LIBRARY.map((hero) => [hero.id, hero]));
const RARITY_RATES = { SSR: 0.05, SR: 0.2, R: 0.35, N: 0.4 };
const STAR_COST = { SSR: 60, SR: 40, R: 20, N: 10 };
const FRAGMENT_RETURN = { SSR: 30, SR: 18, R: 9, N: 4 };

const ITEM_CATALOG = {
  exp_potion: { name: "Bình EXP", type: "consumable", desc: "Tăng 1 cấp cho tướng chính.", effect: { level: 1 } },
  gold_crate: { name: "Rương Vàng", type: "consumable", desc: "+50.000 xu", effect: { coins: 50000 } },
  diamond_pouch: { name: "Túi Kim Cương", type: "consumable", desc: "+150 kim cương", effect: { diamonds: 150 } },
  tower_ticket: { name: "Vé Thông Thiên", type: "utility", desc: "+1 lượt leo tháp tức thì.", effect: { tower: 1 } },
  boss_bomb: { name: "Bomb Chấn Thiên", type: "utility", desc: "+10% sát thương boss lượt tới.", effect: { bossBoost: 0.1 } },
  weapon_token: { name: "Mảnh Vũ Khí", type: "material", desc: "Dùng để đột phá vũ khí.", effect: {} },
  armor_token: { name: "Mảnh Giáp", type: "material", desc: "Nâng thủ cơ bản.", effect: {} },
  artifact_scroll: { name: "Thần Khí Phù", type: "artifact", power: 220, desc: "Cộng lực chiến lớn." },
  jade_core: { name: "Ngọc Tâm", type: "material", desc: "Nguyên liệu đột phá sao.", effect: {} }
};

const SHOP_ITEMS = [
  { id: "exp_potion", price: 15000, currency: "coins" },
  { id: "gold_crate", price: 120, currency: "diamonds" },
  { id: "diamond_pouch", price: 80000, currency: "coins" },
  { id: "tower_ticket", price: 60, currency: "diamonds" },
  { id: "boss_bomb", price: 90, currency: "diamonds" },
  { id: "artifact_scroll", price: 220, currency: "diamonds" },
  { id: "weapon_token", price: 30000, currency: "coins" },
  { id: "armor_token", price: 28000, currency: "coins" },
  { id: "jade_core", price: 14000, currency: "coins" }
];

const THANKHI_LIBRARY = [
  { id: "long_linh", name: "Long Linh Kiếm", rarity: "S", bonus: "+15% ATK", desc: "Thần khí của Triệu Vân." },
  { id: "bach_ho", name: "Bạch Hổ Ấn", rarity: "A", bonus: "+10% HP", desc: "Phù hộ phòng thủ." },
  { id: "lh_dao", name: "Lưỡi Hào", rarity: "A", bonus: "+8% xuyên giáp", desc: "Thích hợp PVP." },
  { id: "thuong_thien", name: "Thương Thiên Tháp", rarity: "S", bonus: "+18% sát thương boss", desc: "Kích hoạt khi leo tháp." }
];

const PHAPBAO_LIBRARY = [
  { id: "ho_loan_co", name: "Họa Loan Cổ", bonus: "+12% sát thương phép", desc: "Chu Du yêu thích." },
  { id: "hao_thien_chung", name: "Hạo Thiên Chung", bonus: "+150 kháng", desc: "Giảm sát thương diện rộng." },
  { id: "kim_lan", name: "Kim Luân", bonus: "+10% chí mạng", desc: "Thích hợp tướng sát thủ." }
];

const DOGIAM_LIBRARY = {
  tuong: HERO_LIBRARY.map((hero) => `${hero.name} (${hero.rarity}) – ${hero.role}`),
  thoitrang: [
    "Chiến Bào Thiên Vũ – tăng 5% lực chiến",
    "Hổ Uy Tuyệt Ảnh – tăng 3% né tránh",
    "Thanh Vân Cẩm Phục – tăng 4% kháng phép"
  ],
  boss: [
    "Xích Diệm Long – rơi thần khí", "Huyền Lân Thú – rơi vật liệu hiếm", "Ma Ảnh Kỵ – rơi trang sức" ]
};

const TOWER_REWARDS = [
  { floor: 1, coins: 1000, fragments: 2 },
  { floor: 5, coins: 8000, fragments: 8 },
  { floor: 10, coins: 20000, fragments: 15, diamonds: 20 },
  { floor: 20, coins: 45000, fragments: 30, diamonds: 60 },
  { floor: 30, coins: 90000, fragments: 55, diamonds: 120 }
];

const BOSS_TEMPLATE = { level: 1, hp: 120000, maxHp: 120000, rewardPool: { coins: 150000, diamonds: 200, fragments: 40 } };

const NAP_PACKAGES = [
  { id: "nap50", label: "Gói 50K", diamonds: 500, vip: 50, bonusItems: { diamond_pouch: 1 } },
  { id: "nap100", label: "Gói 100K", diamonds: 1200, vip: 120, bonusItems: { artifact_scroll: 1 } },
  { id: "nap200", label: "Gói 200K", diamonds: 2600, vip: 260, bonusItems: { boss_bomb: 2, tower_ticket: 2 } },
  { id: "nap500", label: "Gói 500K", diamonds: 7000, vip: 700, bonusItems: { artifact_scroll: 2, weapon_token: 2 } }
];

const DAILY_REWARD = { coins: 50000, diamonds: 80, fragments: 12 };

const DEFAULT_DB = () => ({
  players: {},
  globals: {
    boss: { ...BOSS_TEMPLATE, history: [] },
    cup: { season: 1, contenders: [], lastResult: [] }
  }
});

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB(), null, 2));
}

function loadDB() {
  ensureDataFile();
  try {
    const content = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(content || "{}");
    return {
      ...DEFAULT_DB(),
      ...parsed,
      players: parsed.players || {},
      globals: {
        boss: { ...BOSS_TEMPLATE, ...(parsed.globals?.boss || {} ), history: parsed.globals?.boss?.history || [] },
        cup: parsed.globals?.cup || { season: 1, contenders: [], lastResult: [] }
      }
    };
  } catch (error) {
    console.warn("[3Q] Failed to load DB", error);
    return DEFAULT_DB();
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.warn("[3Q] Failed to save DB", error);
  }
}

function defaultPlayer(uid, name) {
  return {
    id: uid,
    name: name || `Tướng quân ${uid}`,
    createdAt: Date.now(),
    resources: {
      coins: 150000,
      diamonds: 600,
      vipPoints: 0,
      honor: 0
    },
    heroes: {
      main: null,
      roster: {}
    },
    inventory: {},
    progress: {
      towerFloor: 1,
      bestTower: 1,
      autoBoss: false,
      autoCup: false,
      lastDaily: 0,
      lastTowerTime: 0
    },
    stats: {
      power: 0,
      wins: 0,
      losses: 0,
      bossDamage: 0,
      cupScore: 0,
      vipLevel: 0
    },
    logs: {
      boss: [],
      cup: []
    }
  };
}

function ensurePlayer(db, uid, name) {
  if (!db.players[uid]) {
    db.players[uid] = defaultPlayer(uid, name);
  }
  return db.players[uid];
}

function computeHeroPower(hero) {
  if (!hero) return 0;
  const def = HERO_MAP[hero.id];
  if (!def) return 0;
  const starBonus = (hero.star - 1) * 250;
  const levelBonus = (hero.level - 1) * 40;
  const breakthrough = (hero.breakthrough || 0) * 420;
  const gearBonus = Object.values(hero.gear || {}).reduce((sum, itemId) => {
    const item = ITEM_CATALOG[itemId];
    if (!item || typeof item.power !== "number") return sum;
    return sum + item.power;
  }, 0);
  return def.basePower + starBonus + levelBonus + breakthrough + gearBonus;
}

function recalcPlayerPower(player) {
  const roster = player.heroes.roster;
  let top = 0;
  Object.values(roster).forEach((hero) => {
    hero.power = computeHeroPower(hero);
    if (hero.power > top) top = hero.power;
  });
  player.stats.power = top;
}

function formatResources(res) {
  return `💰 ${res.coins.toLocaleString()} xu | 💎 ${res.diamonds} KC | VIP ${res.vipPoints}`;
}

function getInventorySummary(player) {
  const entries = Object.entries(player.inventory || {});
  if (!entries.length) return "(Túi đồ trống)";
  return entries
    .map(([id, qty]) => {
      const item = ITEM_CATALOG[id];
      const label = item ? item.name : id;
      return `• ${label} x${qty}`;
    })
    .join("\n");
}

function randomHero() {
  const roll = Math.random();
  let cumulative = 0;
  let chosenRarity = "N";
  for (const [rarity, rate] of Object.entries(RARITY_RATES)) {
    cumulative += rate;
    if (roll <= cumulative) {
      chosenRarity = rarity;
      break;
    }
  }
  const pool = HERO_LIBRARY.filter((hero) => hero.rarity === chosenRarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

function addItem(player, itemId, quantity = 1) {
  if (!ITEM_CATALOG[itemId]) return false;
  player.inventory[itemId] = (player.inventory[itemId] || 0) + quantity;
  return true;
}

function consumeItem(player, itemId, quantity = 1) {
  if (!player.inventory[itemId] || player.inventory[itemId] < quantity) return false;
  player.inventory[itemId] -= quantity;
  if (player.inventory[itemId] <= 0) delete player.inventory[itemId];
  return true;
}

function getMentionId(event, fallback) {
  const mentions = event.data?.mentions;
  if (Array.isArray(mentions) && mentions.length > 0) {
    return mentions[0].uid || mentions[0].id;
  }
  if (event.mentions && Object.keys(event.mentions).length > 0) {
    return Object.keys(event.mentions)[0];
  }
  return fallback;
}

function formatHero(hero) {
  if (!hero) return "Chưa sở hữu tướng nào.";
  const def = HERO_MAP[hero.id];
  const gear = hero.gear || {};
  return [
    `⭐ ${def.name} (${def.rarity})`,
    `Vai trò: ${def.role} | Phe: ${def.faction}`,
    `Cấp ${hero.level}, Sao ${hero.star}, Đột phá ${hero.breakthrough || 0}`,
    `Lực chiến: ${hero.power}`,
    `Trang bị: ${gear.weapon || "(trống)"} / ${gear.armor || "(trống)"} / ${gear.artifact || "(trống)"}`,
    `Mảnh: ${hero.fragments} | Bản sao: ${hero.copies}`
  ].join("\n");
}

function formatTowerProgress(player) {
  return `🏯 Thông Thiên Tháp: tầng ${player.progress.towerFloor} (cao nhất: ${player.progress.bestTower})`;
}

function ensureHero(player, heroDef) {
  const roster = player.heroes.roster;
  if (!roster[heroDef.id]) {
    roster[heroDef.id] = {
      id: heroDef.id,
      star: 1,
      level: 1,
      copies: 1,
      fragments: 0,
      breakthrough: 0,
      gear: { weapon: null, armor: null, artifact: null },
      power: heroDef.basePower
    };
  }
  return roster[heroDef.id];
}

async function handleHelp(ctx) {
  return {
    message: [
      "📖 Game Tam Quốc v1.1.2",
      "Các lệnh chính:",
      "• .3q quay – quay tướng",
      "• .3q chon <id|tên> – chọn tướng chính",
      "• .3q tuong/@tag – xem tướng",
      "• .3q tuido – xem túi đồ",
      "• .3q soi <item> – soi vật phẩm",
      "• .3q dung/huy/thao – quản lý vật phẩm",
      "• .3q quydoi/nangsao/dotpha – nâng cấp tướng",
      "• .3q leothap / leothaps – leo Thông Thiên Tháp",
      "• .3q pvp / danhboss / soipve",
      "• .3q diemdanh / tranhcup / soicup / tudongtranhcup",
      "• .3q shop / mua / giaodich / tangqua",
      "• .3q nap / banggianap / bxh / bxhthap / bxhnap",
      "• .3q thaboss / tudongboss",
      "• .3q timkiem / thankhi / phapbao / dogiam",
      "• .3q rest – reset dữ liệu",
      "Gõ .3q <lệnh> để biết thêm chi tiết."
    ].join("\n")
  };
}

function locateHeroId(input) {
  if (!input) return null;
  const key = input.toLowerCase();
  const byId = HERO_LIBRARY.find((hero) => hero.id === key);
  if (byId) return byId.id;
  const byName = HERO_LIBRARY.find((hero) => hero.name.toLowerCase().includes(key));
  return byName ? byName.id : null;
}

function formatShop() {
  return SHOP_ITEMS.map((item, index) => {
    const meta = ITEM_CATALOG[item.id];
    const label = meta ? meta.name : item.id;
    return `${index + 1}. ${label} (${item.id}) – ${item.price} ${item.currency === "diamonds" ? "KC" : "xu"}`;
  }).join("\n");
}

function formatNap() {
  return NAP_PACKAGES.map((pkg) => `${pkg.id}: ${pkg.label} – ${pkg.diamonds} KC + VIP ${pkg.vip}`).join("\n");
}

const COMMAND_HANDLERS = {
  help: handleHelp
};

async function dispatch(ctx, subCommand) {
  const handler = COMMAND_HANDLERS[subCommand] || handleHelp;
  return handler(ctx);
}

module.exports.config = {
  name: "3q",
  version: "1.1.2",
  role: 0,
  author: "Cascade",
  description: "Game Tam Quốc full lệnh",
  category: "Game",
  cooldowns: 2
};

module.exports.run = async ({ api, event, args }) => {
  const db = loadDB();
  const uid = event.data?.uidFrom;
  const name = event.data?.dName || event.senderID;
  const player = ensurePlayer(db, uid, name);
  recalcPlayerPower(player);

  const sub = (args[0] || "help").toLowerCase();
  const ctx = { api, event, args: args.slice(1), db, player };

  const result = await dispatch(ctx, sub);
  if (result?.dirty) {
    recalcPlayerPower(player);
    saveDB(db);
  } else {
    saveDB(db);
  }
  const message = result?.message || "Đã cập nhật.";
  api.sendMessage({ msg: message, ttl: 45_000 }, event.threadId, event.type);
};
