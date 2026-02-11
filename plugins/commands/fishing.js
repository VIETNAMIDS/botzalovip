const fs = require('fs');
const path = require('path');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');

// Đường dẫn file lưu dữ liệu
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FISHING_DATA_FILE = path.join(DATA_DIR, 'fishing_data.json');
const COOLDOWNS_FILE = path.join(DATA_DIR, 'fishing_cooldowns.json');

// Tạo thư mục data nếu chưa có
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Expose saver to global so other modules can persist updates (e.g., wallet deductions)
if (!global.saveFishingPlayerData) global.saveFishingPlayerData = savePlayerData;

// Lưu trữ dữ liệu người chơi
const playerData = new Map();
const fishingCooldowns = new Map();

// Expose to global for cross-module wallet access (read/update safely)
if (!global.fishingPlayerData) global.fishingPlayerData = playerData;

// Function tạo player mới hoặc lấy player hiện có
function createPlayer(userId) {
  if (!playerData.has(userId)) {
    console.log(`[FISHING] Tạo player mới cho userId: ${userId}`);
    playerData.set(userId, {
      level: 1,
      exp: 0,
      totalCatch: 0,
      coins: 100,
      inventory: {},
      fishingRods: {
        'Cần Câu Cơ Bản': 1
      },
      currentRod: 'Cần Câu Cơ Bản',
      currentArea: 'Hồ Cơ Bản',
      baits: {},
      activeBait: null,
      baitUsesLeft: 0,
      totalBaitUses: 0,
      maxBaitUses: 5,
      bossItems: {},
      bossCooldowns: {},
      tournamentStats: {
        wins: 0,
        participations: 0,
        titles: []
      },
      currentTournament: null,
      guild: {
        id: null,
        role: null,
        joinDate: null,
        contribution: 0
      },
      vip: {
        level: 0,
        purchaseDate: null,
        totalSpent: 0
      },
      vipMoney: {
        level: 0,
        totalSpent: 0,
        purchaseHistory: [],
        lastPurchase: null
      },
      achievements: [],
      achievementProgress: {},
      equipmentLevels: {},
      stats: {
        common: 0,
        rare: 0,
        legendary: 0,
        trash: 0
      },
      dailyQuest: {
        date: new Date().toDateString(),
        catchCount: 0,
        rareCount: 0,
        completed: false,
        reward: 200
      },
      bank: {
        balance: 0,
        transactions: [],
        interestRate: 0.02,
        lastInterest: Date.now(),
        loan: {
          amount: 0,
          startDate: null,
          interestRate: 0.05,
          dueDate: null,
          autoDeductEnabled: true
        }
      }
    });
    console.log(`[FISHING] Player mới đã được tạo, đang lưu...`);
    savePlayerData();
  }
  return playerData.get(userId);
}

// Functions để save/load dữ liệu
function savePlayerData() {
  try {
    const dataToSave = {};
    for (const [userId, data] of playerData.entries()) {
      dataToSave[userId] = data;
      // Also persist to shared user profile (absolute values)
      try {
        const up = (global.userProfile || global.userProfileHelper);
        if (up && typeof up.update === 'function') {
          up.update(userId, (p) => {
            const name = p?.name || undefined;
            const f = (p.games && p.games.fishing) || {};
            const next = p || { uid: String(userId), name: name || 'Người chơi', games: {} };
            next.name = name || next.name || 'Người chơi';
            next.games = next.games || {};
            next.games.fishing = {
              level: data.level || 1,
              exp: data.exp || 0,
              coins: data.coins || 0,
              legendary: data.stats?.legendary || 0,
              rare: data.stats?.rare || 0,
              lastPlayed: Date.now()
            };
            return next;
          });
        }
      } catch {}
    }
    fs.writeFileSync(FISHING_DATA_FILE, JSON.stringify(dataToSave, null, 2));
    
    // Đồng bộ với global.gameLeaderboard để persistent leaderboard
    syncToGlobalLeaderboard();
    
    console.log(`[FISHING] Đã lưu ${Object.keys(dataToSave).length} người chơi và leaderboard`);
    console.log(`[FISHING] PlayerData size: ${playerData.size}`);
  } catch (error) {
    console.error('[FISHING] Lỗi khi lưu dữ liệu:', error);
  }
}

// Đồng bộ fishing data với global leaderboard
function syncToGlobalLeaderboard() {
  try {
    // Khởi tạo global.gameLeaderboard nếu chưa có
    if (!global.gameLeaderboard) {
      global.gameLeaderboard = {
        caro: new Map(),
        fishing: new Map(),
        taixiu: {},
        blackjack: {},
        poker: {},
        roulette: {},
        baccarat: {}
      };
    }
    
    if (!global.gameLeaderboard.fishing) {
      global.gameLeaderboard.fishing = new Map();
    }
    
    // Sync tất cả fishing data vào global leaderboard
    for (const [userId, userData] of playerData.entries()) {
      const leaderboardStats = {
        level: userData.level,
        exp: userData.exp,
        coins: userData.coins,
        totalCatch: userData.totalCatch,
        common: userData.stats.common,
        rare: userData.stats.rare,
        legendary: userData.stats.legendary,
        trash: userData.stats.trash
      };
      global.gameLeaderboard.fishing.set(userId, leaderboardStats);
    }
    
    console.log('[FISHING] Đã đồng bộ với global leaderboard');
  } catch (error) {
    console.error('[FISHING] Lỗi khi đồng bộ leaderboard:', error);
  }
}

function loadPlayerData() {
  try {
    if (fs.existsSync(FISHING_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(FISHING_DATA_FILE, 'utf8'));
      for (const [userId, userData] of Object.entries(data)) {
        playerData.set(userId, userData);
      }
      
      // Đồng bộ với global leaderboard sau khi load
      syncToGlobalLeaderboard();
      
      console.log(`[FISHING] Đã tải ${Object.keys(data).length} người chơi và đồng bộ leaderboard`);
      console.log(`[FISHING] PlayerData size: ${playerData.size}`);
    } else {
      console.log('[FISHING] File dữ liệu không tồn tại, sẽ tạo mới khi có người chơi');
    }
  } catch (error) {
    console.error('[FISHING] Lỗi khi tải dữ liệu:', error);
  }
}

function saveCooldowns() {
  try {
    const dataToSave = {};
    for (const [userId, cooldown] of fishingCooldowns.entries()) {
      // Chỉ lưu cooldown còn hiệu lực
      if (cooldown > Date.now()) {
        dataToSave[userId] = cooldown;
      }
    }
    fs.writeFileSync(COOLDOWNS_FILE, JSON.stringify(dataToSave, null, 2));
  } catch (error) {
    console.error('[FISHING] Lỗi khi lưu cooldowns:', error);
  }
}

function loadCooldowns() {
  try {
    if (fs.existsSync(COOLDOWNS_FILE)) {
      const data = JSON.parse(fs.readFileSync(COOLDOWNS_FILE, 'utf8'));
      for (const [userId, cooldown] of Object.entries(data)) {
        // Chỉ load cooldown còn hiệu lực
        if (cooldown > Date.now()) {
          fishingCooldowns.set(userId, cooldown);
        }
      }
      console.log(`[FISHING] Đã tải ${Object.keys(data).length} cooldowns`);
    }
  } catch (error) {
    console.error('[FISHING] Lỗi khi tải cooldowns:', error);
  }
}

// Guild save/load functions
function saveGuildData() {
  try {
    // Save guilds
    const guildsToSave = {};
    for (const [guildId, guildData] of global.fishingGuilds.guilds.entries()) {
      // Convert Map to Object for JSON serialization
      const membersObj = {};
      for (const [userId, memberData] of guildData.members.entries()) {
        membersObj[userId] = memberData;
      }
      
      guildsToSave[guildId] = {
        ...guildData,
        members: membersObj
      };
    }
    
    fs.writeFileSync(GUILD_DATA_FILE, JSON.stringify(guildsToSave, null, 2));
    
    // Save invitations
    const invitationsToSave = {};
    for (const [key, inviteData] of global.fishingGuilds.invitations.entries()) {
      invitationsToSave[key] = inviteData;
    }
    
    fs.writeFileSync(GUILD_INVITATIONS_FILE, JSON.stringify(invitationsToSave, null, 2));
    
    console.log(`[FISHING] Đã lưu ${Object.keys(guildsToSave).length} guild và ${Object.keys(invitationsToSave).length} lời mời`);
  } catch (error) {
    console.error('[FISHING] Lỗi khi lưu guild data:', error);
  }
}

function loadGuildData() {
  try {
    // Load guilds
    if (fs.existsSync(GUILD_DATA_FILE)) {
      const guildsData = JSON.parse(fs.readFileSync(GUILD_DATA_FILE, 'utf8'));
      
      for (const [guildId, guildData] of Object.entries(guildsData)) {
        // Convert Object back to Map for members
        const membersMap = new Map();
        for (const [userId, memberData] of Object.entries(guildData.members)) {
          membersMap.set(userId, memberData);
        }
        
        global.fishingGuilds.guilds.set(guildId, {
          ...guildData,
          members: membersMap
        });
      }
      
      console.log(`[FISHING] Đã tải ${Object.keys(guildsData).length} guild`);
    }
    
    // Load invitations
    if (fs.existsSync(GUILD_INVITATIONS_FILE)) {
      const invitationsData = JSON.parse(fs.readFileSync(GUILD_INVITATIONS_FILE, 'utf8'));
      
      for (const [key, inviteData] of Object.entries(invitationsData)) {
        global.fishingGuilds.invitations.set(key, inviteData);
      }
      
      console.log(`[FISHING] Đã tải ${Object.keys(invitationsData).length} lời mời guild`);
    }
  } catch (error) {
    console.error('[FISHING] Lỗi khi tải guild data:', error);
  }
}

// Auto-save mỗi 5 phút
setInterval(() => {
  savePlayerData();
  saveCooldowns();
  saveGuildData();
}, 5 * 60 * 1000);

// Graceful shutdown - save khi thoát
process.on('SIGINT', () => {
  console.log('[FISHING] Đang lưu dữ liệu trước khi thoát...');
  savePlayerData();
  saveCooldowns();
  saveGuildData();
  console.log('[FISHING] Đã lưu xong!');
});

process.on('SIGTERM', () => {
  console.log('[FISHING] Đang lưu dữ liệu trước khi thoát...');
  savePlayerData();
  saveCooldowns();
  saveGuildData();
  console.log('[FISHING] Đã lưu xong!');
});

// Import leaderboard functions
const leaderboard = require('./leaderboard.js');

// Safe sender for long messages (split into chunks)
async function sendChunked(api, text, threadId, type, size = 1800) {
  if (!text || typeof text !== 'string') return;
  for (let i = 0; i < text.length; i += size) {
    const part = text.slice(i, i + size);
    try { // eslint-disable-next-line no-await-in-loop
      await api.sendMessage(part, threadId, type);
    } catch (e) {
      try { await api.sendMessage(part, threadId, type); } catch {}
    }
  }
}

// Dữ liệu khu vực câu cá
// AREA SYSTEM: 200+ locations with high entry fees for late tiers
const BIOMES = ['Hồ', 'Sông', 'Biển', 'San Hô', 'Đầm Lầy', 'Băng Giá', 'Núi Lửa', 'Hang Động', 'Rừng Ngập Mặn', 'Đảo'];
function feeForTier(tier) {
  // Progressive fees (VND coins): tiers later cost up to tens of billions
  if (tier <= 3) return [0, 50000, 250000][tier - 1];
  if (tier <= 6) return [1000000, 3000000, 5000000][tier - 4];
  if (tier <= 9) return [50000000, 200000000, 500000000][tier - 7];
  if (tier <= 12) return [2000000000, 5000000000, 10000000000][tier - 10]; // 2-10 tỷ
  return [20000000000, 50000000000, 100000000000][(tier - 13) % 3]; // 20-100 tỷ cho tier 13+
}
function bonusForTier(tier) {
  // Base chances; these are relative weights to be interpreted by getRandomCatch caller
  const common = Math.max(30 - tier, 5);
  const rare = Math.min(50, 10 + tier * 2);
  const legendary = Math.min(25, Math.floor(tier / 2));
  return { common, rare, legendary };
}
function generateFishingAreas() {
  const areas = [];
  // Always include a free basic pond
  areas.push({ id: 1, key: 'BASIC_POND', name: 'Hồ Cơ Bản', emoji: '🐟', biome: 'Hồ', reqLevel: 1, fee: 0, bonus: { common: 60, rare: 8, legendary: 1 } });
  let id = 2;
  for (let tier = 2; tier <= 20; tier++) { // 19 tiers → ~ (19*10)=190 areas + 1 basic = 191
    for (let i = 0; i < BIOMES.length; i++) {
      const biome = BIOMES[i];
      const key = `${biome.toUpperCase().replace(/\s/g,'_')}_T${tier}_${i+1}`;
      const name = `${biome} Tier ${tier}`;
      const emojiMap = { 'Hồ':'🏞️', 'Sông':'🏞️', 'Biển':'🌊', 'San Hô':'🪸', 'Đầm Lầy':'🫧', 'Băng Giá':'🧊', 'Núi Lửa':'🌋', 'Hang Động':'🕳️', 'Rừng Ngập Mặn':'🌿', 'Đảo':'🏝️' };
      areas.push({
        id,
        key,
        name,
        emoji: emojiMap[biome] || '🎣',
        biome,
        reqLevel: Math.min(200, 3 * tier + i),
        fee: feeForTier(tier),
        bonus: bonusForTier(tier)
      });
      id++;
    }
  }
  // Ensure > 200
  return areas;
}
const AREA_CATALOG = generateFishingAreas();
const AREA_INDEX_BY_ID = new Map(AREA_CATALOG.map(a => [a.id, a]));
const AREA_INDEX_BY_KEY = new Map(AREA_CATALOG.map(a => [a.key.toLowerCase(), a]));
const AREA_INDEX_BY_NAME = new Map(AREA_CATALOG.map(a => [a.name.toLowerCase(), a]));

function findAreaByAny(query) {
  if (!query) return null;
  const q = String(query).trim();
  if (/^\d+$/.test(q)) return AREA_INDEX_BY_ID.get(Number(q)) || null;
  const byKey = AREA_INDEX_BY_KEY.get(q.toLowerCase());
  if (byKey) return byKey;
  return AREA_INDEX_BY_NAME.get(q.toLowerCase()) || null;
}
function getPlayerCurrentArea(player) {
  // Prefer stable key; fallback legacy display name
  const raw = player.currentAreaKey || player.currentArea;
  let area = null;
  if (raw && typeof raw === 'string') {
    // Try resolve by key first
    area = AREA_INDEX_BY_KEY.get(raw.toLowerCase());
    // If not found, try resolve by name (legacy)
    if (!area) area = AREA_INDEX_BY_NAME.get(raw.toLowerCase());
    // If resolved by name, normalize to key for future
    if (area && player.currentAreaKey !== area.key) {
      player.currentAreaKey = area.key;
      player.currentArea = area.name; // keep legacy display in sync
    }
  }
  // If still missing (catalog changed), try any owned area that exists
  if (!area && Array.isArray(player.ownedAreas) && player.ownedAreas.length > 0) {
    for (const k of player.ownedAreas) {
      const a = AREA_INDEX_BY_KEY.get(String(k).toLowerCase());
      if (a) { area = a; player.currentAreaKey = a.key; player.currentArea = a.name; break; }
    }
  }
  // Final fallback: BASIC_POND always exists
  if (!area) {
    area = AREA_INDEX_BY_KEY.get('basic_pond');
    if (area) { player.currentAreaKey = area.key; player.currentArea = area.name; }
  }
  return area;
}

// Migrate/normalize player areas to handle catalog updates
function migrateAllPlayersAreas() {
  try {
    const validKeys = new Set(AREA_CATALOG.map(a => a.key));
    for (const [uid, data] of playerData.entries()) {
      // Prune invalid ownedAreas
      if (Array.isArray(data.ownedAreas)) {
        data.ownedAreas = data.ownedAreas.filter(k => validKeys.has(k));
      }
      // Normalize current area via resolver (auto-fixes legacy/current)
      const area = getPlayerCurrentArea(data);
      // Ensure we always have a key stored
      if (area && data.currentAreaKey !== area.key) data.currentAreaKey = area.key;
      // Remove legacy display name field to avoid confusion (optional)
      // keep for backward-compat but prefer key
    }
    // Persist after migration
    savePlayerData();
  } catch (e) {
    console.error('[FISHING] migrateAllPlayersAreas error:', e);
  }
}
function formatAreaCard(area) {
  return [
    `${area.emoji} ${area.name} (${area.biome})`,
    `🔑 Key: ${area.key}`,
    `🧭 ID: ${area.id} | 🎯 Yêu cầu cấp: ${area.reqLevel}`,
    `💸 Phí vào khu: ${area.fee.toLocaleString()} coins`,
    `🎁 Bonus: Thường ${area.bonus.common} | Hiếm ${area.bonus.rare} | Huyền thoại ${area.bonus.legendary}`
  ].join('\n');
}
// Unified wallet helpers (Farm + Fishing) for area fee
function unifiedGetBalances(threadId, userId) {
  let farmCoins = 0, fishCoins = 0;
  try {
    const farm = global.bonzFarmData?.get?.(`${threadId}_${userId}`);
    farmCoins = farm?.coins || 0;
  } catch {}
  try {
    const fish = global.fishingPlayerData?.get?.(String(userId));
    fishCoins = fish?.coins || 0;
  } catch {}
  return { farmCoins, fishCoins, total: farmCoins + fishCoins };
}
function unifiedDeduct(threadId, userId, amount) {
  const { farmCoins, fishCoins, total } = unifiedGetBalances(threadId, userId);
  if (total < amount) return false;
  let remain = amount;
  try {
    const farm = global.bonzFarmData?.get?.(`${threadId}_${userId}`);
    if (farm && farm.coins > 0 && remain > 0) {
      const take = Math.min(farm.coins, remain);
      farm.coins -= take; remain -= take;
    }
  } catch {}
  try {
    const fish = global.fishingPlayerData?.get?.(String(userId));
    if (fish && fish.coins > 0 && remain > 0) {
      const take = Math.min(fish.coins, remain);
      fish.coins -= take; remain -= take;
    }
  } catch {}
  try { if (typeof saveFarmData === 'function') saveFarmData(); } catch {}
  try { if (typeof global.saveFishingPlayerData === 'function') global.saveFishingPlayerData(); } catch {}
  return true;
}
// Expose unified wallet helpers for cross-module usage (e.g., stock.js)
try {
  if (!global.unifiedDeduct) global.unifiedDeduct = unifiedDeduct;
  if (!global.unifiedGetBalances) global.unifiedGetBalances = unifiedGetBalances;
} catch {}
const FISHING_AREAS = {
  'Hồ Cơ Bản': {
    name: 'Hồ Cơ Bản',
    emoji: '🏞️',
    cost: 0,
    description: 'Khu vực miễn phí cho người mới bắt đầu',
    fishBonus: {
      common: 70,
      rare: 20,
      legendary: 5,
      trash: 5
    },
    expMultiplier: 1.0,
    coinMultiplier: 1.0,
    unlockLevel: 1
  },
  'Sông Lớn': {
    name: 'Sông Lớn',
    emoji: '🌊',
    cost: 50,
    description: 'Sông rộng với nhiều loài cá đa dạng',
    fishBonus: {
      common: 60,
      rare: 30,
      legendary: 8,
      trash: 2
    },
    expMultiplier: 1.2,
    coinMultiplier: 1.1,
    unlockLevel: 5
  },
  'Biển Sâu': {
    name: 'Biển Sâu',
    emoji: '🌊',
    cost: 200,
    description: 'Vùng biển sâu với cá hiếm và nguy hiểm',
    fishBonus: {
      common: 40,
      rare: 45,
      legendary: 12,
      trash: 3
    },
    expMultiplier: 1.5,
    coinMultiplier: 1.3,
    unlockLevel: 10
  },
  'Đại Dương': {
    name: 'Đại Dương',
    emoji: '🌀',
    cost: 500,
    description: 'Đại dương bao la với những sinh vật huyền thoại',
    fishBonus: {
      common: 30,
      rare: 40,
      legendary: 25,
      trash: 5
    },
    expMultiplier: 2.0,
    coinMultiplier: 1.8,
    unlockLevel: 20
  },
  'Vùng Cấm': {
    name: 'Vùng Cấm',
    emoji: '⚡',
    cost: 1000,
    description: 'Khu vực nguy hiểm với boss fish và kho báu',
    fishBonus: {
      common: 20,
      rare: 30,
      legendary: 40,
      trash: 10
    },
    expMultiplier: 3.0,
    coinMultiplier: 2.5,
    unlockLevel: 30
  }
};

// Dữ liệu mồi câu
const FISHING_BAITS = {
  'Giun Đất': {
    name: 'Giun Đất',
    emoji: '🪱',
    price: 50,
    effects: {
      commonBonus: 15,
      rareBonus: 0,
      legendaryBonus: 0,
      duration: 5 // số lần câu
    },
    description: '+15% cá thường, 5 lần sử dụng'
  },
  'Tôm Sống': {
    name: 'Tôm Sống',
    emoji: '🦐',
    price: 200,
    effects: {
      commonBonus: 0,
      rareBonus: 20,
      legendaryBonus: 0,
      duration: 3
    },
    description: '+20% cá hiếm, 3 lần sử dụng'
  },
  'Mồi Huyền Thoại': {
    name: 'Mồi Huyền Thoại',
    emoji: '✨',
    price: 1000,
    effects: {
      commonBonus: 0,
      rareBonus: 10,
      legendaryBonus: 30,
      duration: 2
    },
    description: '+10% cá hiếm, +30% cá huyền thoại, 2 lần sử dụng'
  },
  'Mồi Vàng': {
    name: 'Mồi Vàng',
    emoji: '🌟',
    price: 500,
    effects: {
      commonBonus: 10,
      rareBonus: 15,
      legendaryBonus: 5,
      duration: 4
    },
    description: '+10% thường, +15% hiếm, +5% huyền thoại, 4 lần sử dụng'
  },
  'Mồi Siêu Cấp': {
    name: 'Mồi Siêu Cấp',
    emoji: '💎',
    price: 2000,
    effects: {
      commonBonus: 0,
      rareBonus: 25,
      legendaryBonus: 50,
      duration: 1
    },
    description: '+25% cá hiếm, +50% cá huyền thoại, 1 lần sử dụng'
  }
};

// Dữ liệu cần câu - EXPANDED VIP EDITION
const FISHING_RODS = {
  'Cần Câu Cơ Bản': {
    name: 'Cần Câu Cơ Bản',
    emoji: '🎣',
    price: 0,
    effects: {
      expBonus: 0,
      rareBonus: 0,
      coinBonus: 0,
      cooldownReduction: 0
    },
    description: 'Cần câu miễn phí cho người mới'
  },
  'Cần Câu Gỗ': {
    name: 'Cần Câu Gỗ',
    emoji: '🪵',
    price: 500,
    effects: {
      expBonus: 10,
      rareBonus: 5,
      coinBonus: 0,
      cooldownReduction: 0
    },
    description: '+10% EXP, +5% cá hiếm'
  },
  'Cần Câu Tre': {
    name: 'Cần Câu Tre',
    emoji: '🎋',
    price: 1000,
    effects: {
      expBonus: 15,
      rareBonus: 8,
      coinBonus: 5,
      cooldownReduction: 2000
    },
    description: '+15% EXP, +8% cá hiếm, +5% coins, -2s cooldown'
  },
  'Cần Câu Vàng': {
    name: 'Cần Câu Vàng',
    emoji: '✨',
    price: 2000,
    effects: {
      expBonus: 25,
      rareBonus: 10,
      coinBonus: 15,
      cooldownReduction: 5000
    },
    description: '+25% EXP, +10% cá hiếm, +15% coins, -5s cooldown'
  },
  'Cần Câu Bạc': {
    name: 'Cần Câu Bạc',
    emoji: '🤍',
    price: 3500,
    effects: {
      expBonus: 35,
      rareBonus: 15,
      coinBonus: 20,
      cooldownReduction: 7000
    },
    description: '+35% EXP, +15% cá hiếm, +20% coins, -7s cooldown'
  },
  'Cần Câu Kim Cương': {
    name: 'Cần Câu Kim Cương',
    emoji: '💎',
    price: 5000,
    effects: {
      expBonus: 50,
      rareBonus: 20,
      coinBonus: 30,
      cooldownReduction: 10000
    },
    description: '+50% EXP, +20% cá hiếm, +30% coins, -10s cooldown'
  },
  'Cần Câu Ruby': {
    name: 'Cần Câu Ruby',
    emoji: '♦️',
    price: 10000,
    effects: {
      expBonus: 75,
      rareBonus: 30,
      coinBonus: 40,
      cooldownReduction: 12000
    },
    description: '+75% EXP, +30% cá hiếm, +40% coins, -12s cooldown'
  },
  'Cần Câu Emerald': {
    name: 'Cần Câu Emerald',
    emoji: '💚',
    price: 15000,
    effects: {
      expBonus: 100,
      rareBonus: 40,
      coinBonus: 50,
      cooldownReduction: 15000
    },
    description: '+100% EXP, +40% cá hiếm, +50% coins, -15s cooldown'
  },
  'Cần Câu Sapphire': {
    name: 'Cần Câu Sapphire',
    emoji: '💙',
    price: 25000,
    effects: {
      expBonus: 150,
      rareBonus: 50,
      coinBonus: 75,
      cooldownReduction: 18000
    },
    description: '+150% EXP, +50% cá hiếm, +75% coins, -18s cooldown'
  },
  'Cần Câu Platinum': {
    name: 'Cần Câu Platinum',
    emoji: '🤍',
    price: 50000,
    effects: {
      expBonus: 200,
      rareBonus: 75,
      coinBonus: 100,
      cooldownReduction: 20000
    },
    description: '+200% EXP, +75% cá hiếm, +100% coins, -20s cooldown'
  },
  'Cần Câu Huyền Thoại': {
    name: 'Cần Câu Huyền Thoại',
    emoji: '🌟',
    price: 75000,
    effects: {
      expBonus: 300,
      rareBonus: 100,
      coinBonus: 150,
      cooldownReduction: 22000
    },
    description: '+300% EXP, +100% cá hiếm, +150% coins, -22s cooldown'
  },
  'Cần Câu Thần Thoại': {
    name: 'Cần Câu Thần Thoại',
    emoji: '👑',
    price: 100000,
    effects: {
      expBonus: 500,
      rareBonus: 150,
      coinBonus: 200,
      cooldownReduction: 25000
    },
    description: '+500% EXP, +150% cá hiếm, +200% coins, -25s cooldown'
  },
  'Cần Câu Tối Thượng': {
    name: 'Cần Câu Tối Thượng',
    emoji: '⚡',
    price: 250000,
    effects: {
      expBonus: 1000,
      rareBonus: 300,
      coinBonus: 500,
      cooldownReduction: 28000
    },
    description: '+1000% EXP, +300% cá hiếm, +500% coins, -28s cooldown'
  },
  'Cần Câu Vô Cực': {
    name: 'Cần Câu Vô Cực',
    emoji: '♾️',
    price: 500000,
    effects: {
      expBonus: 2000,
      rareBonus: 500,
      coinBonus: 1000,
      cooldownReduction: 29000
    },
    description: '+2000% EXP, +500% cá hiếm, +1000% coins, -29s cooldown'
  },
  'Cần Câu Bonzzz': {
    name: 'Cần Câu Bonzzz',
    emoji: '👑',
    price: 1000000,
    effects: {
      expBonus: 5000,
      rareBonus: 1000,
      coinBonus: 2000,
      cooldownReduction: 29500
    },
    description: '+5000% EXP, +1000% cá hiếm, +2000% coins, -29.5s cooldown'
  },
  // 100 CẦN CÂU VIP COLLECTION - ULTIMATE EDITION
  'Cần Câu Titanium': {
    name: 'Cần Câu Titanium',
    emoji: '🔩',
    price: 1500000,
    effects: { expBonus: 6000, rareBonus: 1200, coinBonus: 2500, cooldownReduction: 29600 },
    description: '+6000% EXP, +1200% cá hiếm, +2500% coins'
  },
  'Cần Câu Vibranium': {
    name: 'Cần Câu Vibranium',
    emoji: '🛡️',
    price: 2000000,
    effects: { expBonus: 7000, rareBonus: 1400, coinBonus: 3000, cooldownReduction: 29700 },
    description: '+7000% EXP, +1400% cá hiếm, +3000% coins'
  },
  'Cần Câu Adamantium': {
    name: 'Cần Câu Adamantium',
    emoji: '⚔️',
    price: 2500000,
    effects: { expBonus: 8000, rareBonus: 1600, coinBonus: 3500, cooldownReduction: 29750 },
    description: '+8000% EXP, +1600% cá hiếm, +3500% coins'
  },
  'Cần Câu Mithril': {
    name: 'Cần Câu Mithril',
    emoji: '✨',
    price: 3000000,
    effects: { expBonus: 9000, rareBonus: 1800, coinBonus: 4000, cooldownReduction: 29800 },
    description: '+9000% EXP, +1800% cá hiếm, +4000% coins'
  },
  'Cần Câu Orichalcum': {
    name: 'Cần Câu Orichalcum',
    emoji: '🟫',
    price: 3500000,
    effects: { expBonus: 10000, rareBonus: 2000, coinBonus: 4500, cooldownReduction: 29850 },
    description: '+10000% EXP, +2000% cá hiếm, +4500% coins'
  },
  'Cần Câu Unobtainium': {
    name: 'Cần Câu Unobtainium',
    emoji: '🌌',
    price: 4000000,
    effects: { expBonus: 12000, rareBonus: 2500, coinBonus: 5000, cooldownReduction: 29900 },
    description: '+12000% EXP, +2500% cá hiếm, +5000% coins'
  },
  'Cần Câu Neutronium': {
    name: 'Cần Câu Neutronium',
    emoji: '⚛️',
    price: 5000000,
    effects: { expBonus: 15000, rareBonus: 3000, coinBonus: 6000, cooldownReduction: 29920 },
    description: '+15000% EXP, +3000% cá hiếm, +6000% coins'
  },
  'Cần Câu Dark Matter': {
    name: 'Cần Câu Dark Matter',
    emoji: '🖤',
    price: 6000000,
    effects: { expBonus: 18000, rareBonus: 3500, coinBonus: 7000, cooldownReduction: 29940 },
    description: '+18000% EXP, +3500% cá hiếm, +7000% coins'
  },
  'Cần Câu Antimatter': {
    name: 'Cần Câu Antimatter',
    emoji: '💥',
    price: 7000000,
    effects: { expBonus: 20000, rareBonus: 4000, coinBonus: 8000, cooldownReduction: 29950 },
    description: '+20000% EXP, +4000% cá hiếm, +8000% coins'
  },
  'Cần Câu Quantum': {
    name: 'Cần Câu Quantum',
    emoji: '🔬',
    price: 8000000,
    effects: { expBonus: 25000, rareBonus: 5000, coinBonus: 10000, cooldownReduction: 29960 },
    description: '+25000% EXP, +5000% cá hiếm, +10000% coins'
  },
  'Cần Câu Plasma': {
    name: 'Cần Câu Plasma',
    emoji: '⚡',
    price: 9000000,
    effects: { expBonus: 30000, rareBonus: 6000, coinBonus: 12000, cooldownReduction: 29970 },
    description: '+30000% EXP, +6000% cá hiếm, +12000% coins'
  },
  'Cần Câu Singularity': {
    name: 'Cần Câu Singularity',
    emoji: '🌑',
    price: 10000000,
    effects: { expBonus: 35000, rareBonus: 7000, coinBonus: 15000, cooldownReduction: 29975 },
    description: '+35000% EXP, +7000% cá hiếm, +15000% coins'
  },
  'Cần Câu Void': {
    name: 'Cần Câu Void',
    emoji: '🕳️',
    price: 12000000,
    effects: { expBonus: 40000, rareBonus: 8000, coinBonus: 18000, cooldownReduction: 29980 },
    description: '+40000% EXP, +8000% cá hiếm, +18000% coins'
  },
  'Cần Câu Cosmic': {
    name: 'Cần Câu Cosmic',
    emoji: '🌌',
    price: 15000000,
    effects: { expBonus: 50000, rareBonus: 10000, coinBonus: 20000, cooldownReduction: 29985 },
    description: '+50000% EXP, +10000% cá hiếm, +20000% coins'
  },
  'Cần Câu Galactic': {
    name: 'Cần Câu Galactic',
    emoji: '🌠',
    price: 18000000,
    effects: { expBonus: 60000, rareBonus: 12000, coinBonus: 25000, cooldownReduction: 29987 },
    description: '+60000% EXP, +12000% cá hiếm, +25000% coins'
  },
  'Cần Câu Universal': {
    name: 'Cần Câu Universal',
    emoji: '🌟',
    price: 20000000,
    effects: { expBonus: 70000, rareBonus: 15000, coinBonus: 30000, cooldownReduction: 29990 },
    description: '+70000% EXP, +15000% cá hiếm, +30000% coins'
  },
  'Cần Câu Multiversal': {
    name: 'Cần Câu Multiversal',
    emoji: '🎆',
    price: 25000000,
    effects: { expBonus: 80000, rareBonus: 18000, coinBonus: 35000, cooldownReduction: 29992 },
    description: '+80000% EXP, +18000% cá hiếm, +35000% coins'
  },
  'Cần Câu Omniversal': {
    name: 'Cần Câu Omniversal',
    emoji: '🎇',
    price: 30000000,
    effects: { expBonus: 100000, rareBonus: 20000, coinBonus: 40000, cooldownReduction: 29994 },
    description: '+100000% EXP, +20000% cá hiếm, +40000% coins'
  },
  'Cần Câu Transcendent': {
    name: 'Cần Câu Transcendent',
    emoji: '🔮',
    price: 35000000,
    effects: { expBonus: 120000, rareBonus: 25000, coinBonus: 50000, cooldownReduction: 29995 },
    description: '+120000% EXP, +25000% cá hiếm, +50000% coins'
  },
  'Cần Câu Ascended': {
    name: 'Cần Câu Ascended',
    emoji: '👼',
    price: 40000000,
    effects: { expBonus: 150000, rareBonus: 30000, coinBonus: 60000, cooldownReduction: 29996 },
    description: '+150000% EXP, +30000% cá hiếm, +60000% coins'
  },
  'Cần Câu Enlightened': {
    name: 'Cần Câu Enlightened',
    emoji: '🧘',
    price: 50000000,
    effects: { expBonus: 200000, rareBonus: 40000, coinBonus: 80000, cooldownReduction: 29997 },
    description: '+200000% EXP, +40000% cá hiếm, +80000% coins'
  },
  'Cần Câu Nirvana': {
    name: 'Cần Câu Nirvana',
    emoji: '☯️',
    price: 60000000,
    effects: { expBonus: 250000, rareBonus: 50000, coinBonus: 100000, cooldownReduction: 29998 },
    description: '+250000% EXP, +50000% cá hiếm, +100000% coins'
  },
  'Cần Câu Zen': {
    name: 'Cần Câu Zen',
    emoji: '🕉️',
    price: 70000000,
    effects: { expBonus: 300000, rareBonus: 60000, coinBonus: 120000, cooldownReduction: 29998.5 },
    description: '+300000% EXP, +60000% cá hiếm, +120000% coins'
  },
  'Cần Câu Moksha': {
    name: 'Cần Câu Moksha',
    emoji: '🪬',
    price: 80000000,
    effects: { expBonus: 350000, rareBonus: 70000, coinBonus: 150000, cooldownReduction: 29999 },
    description: '+350000% EXP, +70000% cá hiếm, +150000% coins'
  },
  'Cần Câu Samsara': {
    name: 'Cần Câu Samsara',
    emoji: '♻️',
    price: 90000000,
    effects: { expBonus: 400000, rareBonus: 80000, coinBonus: 180000, cooldownReduction: 29999.2 },
    description: '+400000% EXP, +80000% cá hiếm, +180000% coins'
  },
  'Cần Câu Karma': {
    name: 'Cần Câu Karma',
    emoji: '⚖️',
    price: 100000000,
    effects: { expBonus: 500000, rareBonus: 100000, coinBonus: 200000, cooldownReduction: 29999.5 },
    description: '+500000% EXP, +100000% cá hiếm, +200000% coins'
  },
  'Cần Câu Dharma': {
    name: 'Cần Câu Dharma',
    emoji: '☸️',
    price: 120000000,
    effects: { expBonus: 600000, rareBonus: 120000, coinBonus: 250000, cooldownReduction: 29999.6 },
    description: '+600000% EXP, +120000% cá hiếm, +250000% coins'
  },
  'Cần Câu Brahman': {
    name: 'Cần Câu Brahman',
    emoji: '🔯',
    price: 150000000,
    effects: { expBonus: 750000, rareBonus: 150000, coinBonus: 300000, cooldownReduction: 29999.7 },
    description: '+750000% EXP, +150000% cá hiếm, +300000% coins'
  },
  'Cần Câu Atman': {
    name: 'Cần Câu Atman',
    emoji: '🪷',
    price: 180000000,
    effects: { expBonus: 900000, rareBonus: 180000, coinBonus: 350000, cooldownReduction: 29999.8 },
    description: '+900000% EXP, +180000% cá hiếm, +350000% coins'
  },
  'Cần Câu Chakra': {
    name: 'Cần Câu Chakra',
    emoji: '🌈',
    price: 200000000,
    effects: { expBonus: 1000000, rareBonus: 200000, coinBonus: 400000, cooldownReduction: 29999.85 },
    description: '+1000000% EXP, +200000% cá hiếm, +400000% coins'
  },
  'Cần Câu Kundalini': {
    name: 'Cần Câu Kundalini',
    emoji: '🐍',
    price: 250000000,
    effects: { expBonus: 1250000, rareBonus: 250000, coinBonus: 500000, cooldownReduction: 29999.9 },
    description: '+1250000% EXP, +250000% cá hiếm, +500000% coins'
  },
  'Cần Câu Prana': {
    name: 'Cần Câu Prana',
    emoji: '💨',
    price: 300000000,
    effects: { expBonus: 1500000, rareBonus: 300000, coinBonus: 600000, cooldownReduction: 29999.92 },
    description: '+1500000% EXP, +300000% cá hiếm, +600000% coins'
  },
  'Cần Câu Mantra': {
    name: 'Cần Câu Mantra',
    emoji: '🎵',
    price: 350000000,
    effects: { expBonus: 1750000, rareBonus: 350000, coinBonus: 700000, cooldownReduction: 29999.94 },
    description: '+1750000% EXP, +350000% cá hiếm, +700000% coins'
  },
  'Cần Câu Yantra': {
    name: 'Cần Câu Yantra',
    emoji: '🔺',
    price: 400000000,
    effects: { expBonus: 2000000, rareBonus: 400000, coinBonus: 800000, cooldownReduction: 29999.95 },
    description: '+2000000% EXP, +400000% cá hiếm, +800000% coins'
  },
  'Cần Câu Tantra': {
    name: 'Cần Câu Tantra',
    emoji: '🔶',
    price: 450000000,
    effects: { expBonus: 2250000, rareBonus: 450000, coinBonus: 900000, cooldownReduction: 29999.96 },
    description: '+2250000% EXP, +450000% cá hiếm, +900000% coins'
  },
  'Cần Câu Mudra': {
    name: 'Cần Câu Mudra',
    emoji: '🤲',
    price: 500000000,
    effects: { expBonus: 2500000, rareBonus: 500000, coinBonus: 1000000, cooldownReduction: 29999.97 },
    description: '+2500000% EXP, +500000% cá hiếm, +1000000% coins'
  },
  'Cần Câu Bandha': {
    name: 'Cần Câu Bandha',
    emoji: '🔒',
    price: 600000000,
    effects: { expBonus: 3000000, rareBonus: 600000, coinBonus: 1200000, cooldownReduction: 29999.975 },
    description: '+3000000% EXP, +600000% cá hiếm, +1200000% coins'
  },
  'Cần Câu Pranayama': {
    name: 'Cần Câu Pranayama',
    emoji: '🌬️',
    price: 700000000,
    effects: { expBonus: 3500000, rareBonus: 700000, coinBonus: 1400000, cooldownReduction: 29999.98 },
    description: '+3500000% EXP, +700000% cá hiếm, +1400000% coins'
  },
  'Cần Câu Samadhi': {
    name: 'Cần Câu Samadhi',
    emoji: '🧠',
    price: 800000000,
    effects: { expBonus: 4000000, rareBonus: 800000, coinBonus: 1600000, cooldownReduction: 29999.985 },
    description: '+4000000% EXP, +800000% cá hiếm, +1600000% coins'
  },
  'Cần Câu Satori': {
    name: 'Cần Câu Satori',
    emoji: '💡',
    price: 900000000,
    effects: { expBonus: 4500000, rareBonus: 900000, coinBonus: 1800000, cooldownReduction: 29999.99 },
    description: '+4500000% EXP, +900000% cá hiếm, +1800000% coins'
  },
  // 200 CẦN CÂU VIP SIÊU CAO CẤP - ULTIMATE COLLECTION
  'Cần Câu Alpha': {
    name: 'Cần Câu Alpha',
    emoji: '🅰️',
    price: 1100000000,
    levelRequired: 310,
    effects: { expBonus: 5500000, rareBonus: 1100000, coinBonus: 2200000, cooldownReduction: 29999.99 },
    description: '🅰️ ALPHA DOMINANCE 🅰️ +5500000% EXP, +1100000% cá hiếm, +2200000% coins'
  },
  'Cần Câu Beta': {
    name: 'Cần Câu Beta',
    emoji: '🅱️',
    price: 1200000000,
    levelRequired: 320,
    effects: { expBonus: 6000000, rareBonus: 1200000, coinBonus: 2400000, cooldownReduction: 29999.99 },
    description: '🅱️ BETA POWER 🅱️ +6000000% EXP, +1200000% cá hiếm, +2400000% coins'
  },
  'Cần Câu Gamma': {
    name: 'Cần Câu Gamma',
    emoji: '☢️',
    price: 1300000000,
    levelRequired: 330,
    effects: { expBonus: 6500000, rareBonus: 1300000, coinBonus: 2600000, cooldownReduction: 29999.99 },
    description: '☢️ GAMMA RADIATION ☢️ +6500000% EXP, +1300000% cá hiếm, +2600000% coins'
  },
  'Cần Câu Delta': {
    name: 'Cần Câu Delta',
    emoji: '🔺',
    price: 1400000000,
    levelRequired: 340,
    effects: { expBonus: 7000000, rareBonus: 1400000, coinBonus: 2800000, cooldownReduction: 29999.99 },
    description: '🔺 DELTA FORCE 🔺 +7000000% EXP, +1400000% cá hiếm, +2800000% coins'
  },
  'Cần Câu Epsilon': {
    name: 'Cần Câu Epsilon',
    emoji: '🌀',
    price: 1500000000,
    levelRequired: 350,
    effects: { expBonus: 7500000, rareBonus: 1500000, coinBonus: 3000000, cooldownReduction: 29999.99 },
    description: '🌀 EPSILON VORTEX 🌀 +7500000% EXP, +1500000% cá hiếm, +3000000% coins'
  },
  'Cần Câu Zeta': {
    name: 'Cần Câu Zeta',
    emoji: '⚡',
    price: 1600000000,
    levelRequired: 360,
    effects: { expBonus: 8000000, rareBonus: 1600000, coinBonus: 3200000, cooldownReduction: 29999.99 },
    description: '⚡ ZETA LIGHTNING ⚡ +8000000% EXP, +1600000% cá hiếm, +3200000% coins'
  },
  'Cần Câu Eta': {
    name: 'Cần Câu Eta',
    emoji: '🌟',
    price: 1700000000,
    levelRequired: 370,
    effects: { expBonus: 8500000, rareBonus: 1700000, coinBonus: 3400000, cooldownReduction: 29999.99 },
    description: '🌟 ETA STELLAR 🌟 +8500000% EXP, +1700000% cá hiếm, +3400000% coins'
  },
  'Cần Câu Theta': {
    name: 'Cần Câu Theta',
    emoji: '🎯',
    price: 1800000000,
    levelRequired: 380,
    effects: { expBonus: 9000000, rareBonus: 1800000, coinBonus: 3600000, cooldownReduction: 29999.99 },
    description: '🎯 THETA PRECISION 🎯 +9000000% EXP, +1800000% cá hiếm, +3600000% coins'
  },
  'Cần Câu Iota': {
    name: 'Cần Câu Iota',
    emoji: '💫',
    price: 1900000000,
    levelRequired: 390,
    effects: { expBonus: 9500000, rareBonus: 1900000, coinBonus: 3800000, cooldownReduction: 29999.99 },
    description: '💫 IOTA INFINITY 💫 +9500000% EXP, +1900000% cá hiếm, +3800000% coins'
  },
  'Cần Câu Kappa': {
    name: 'Cần Câu Kappa',
    emoji: '😏',
    price: 2000000000,
    levelRequired: 400,
    effects: { expBonus: 10000000, rareBonus: 2000000, coinBonus: 4000000, cooldownReduction: 29999.99 },
    description: '😏 KAPPA MEME 😏 +10000000% EXP, +2000000% cá hiếm, +4000000% coins'
  },
  'Cần Câu Lambda': {
    name: 'Cần Câu Lambda',
    emoji: '🔬',
    price: 2200000000,
    levelRequired: 420,
    effects: { expBonus: 11000000, rareBonus: 2200000, coinBonus: 4400000, cooldownReduction: 29999.99 },
    description: '🔬 LAMBDA SCIENCE 🔬 +11000000% EXP, +2200000% cá hiếm, +4400000% coins'
  },
  'Cần Câu Mu': {
    name: 'Cần Câu Mu',
    emoji: '🐄',
    price: 2400000000,
    levelRequired: 440,
    effects: { expBonus: 12000000, rareBonus: 2400000, coinBonus: 4800000, cooldownReduction: 29999.99 },
    description: '🐄 MU POWER 🐄 +12000000% EXP, +2400000% cá hiếm, +4800000% coins'
  },
  'Cần Câu Nu': {
    name: 'Cần Câu Nu',
    emoji: '🌊',
    price: 2600000000,
    levelRequired: 460,
    effects: { expBonus: 13000000, rareBonus: 2600000, coinBonus: 5200000, cooldownReduction: 29999.99 },
    description: '🌊 NU TSUNAMI 🌊 +13000000% EXP, +2600000% cá hiếm, +5200000% coins'
  },
  'Cần Câu Xi': {
    name: 'Cần Câu Xi',
    emoji: '🐉',
    price: 2800000000,
    levelRequired: 480,
    effects: { expBonus: 14000000, rareBonus: 2800000, coinBonus: 5600000, cooldownReduction: 29999.99 },
    description: '🐉 XI DRAGON 🐉 +14000000% EXP, +2800000% cá hiếm, +5600000% coins'
  },
  'Cần Câu Omicron': {
    name: 'Cần Câu Omicron',
    emoji: '🦠',
    price: 3000000000,
    levelRequired: 500,
    effects: { expBonus: 15000000, rareBonus: 3000000, coinBonus: 6000000, cooldownReduction: 29999.99 },
    description: '🦠 OMICRON VARIANT 🦠 +15000000% EXP, +3000000% cá hiếm, +6000000% coins'
  },
  'Cần Câu Pi': {
    name: 'Cần Câu Pi',
    emoji: '🥧',
    price: 3141592653,
    levelRequired: 520,
    effects: { expBonus: 15700000, rareBonus: 3141592, coinBonus: 6283185, cooldownReduction: 29999.99 },
    description: '🥧 PI MATHEMATICAL 🥧 +15700000% EXP, +3141592% cá hiếm, +6283185% coins'
  },
  'Cần Câu Rho': {
    name: 'Cần Câu Rho',
    emoji: '💎',
    price: 3500000000,
    levelRequired: 540,
    effects: { expBonus: 17500000, rareBonus: 3500000, coinBonus: 7000000, cooldownReduction: 29999.99 },
    description: '💎 RHO DIAMOND 💎 +17500000% EXP, +3500000% cá hiếm, +7000000% coins'
  },
  'Cần Câu Sigma': {
    name: 'Cần Câu Sigma',
    emoji: '🗿',
    price: 4000000000,
    levelRequired: 560,
    effects: { expBonus: 20000000, rareBonus: 4000000, coinBonus: 8000000, cooldownReduction: 29999.99 },
    description: '🗿 SIGMA CHAD 🗿 +20000000% EXP, +4000000% cá hiếm, +8000000% coins'
  },
  'Cần Câu Tau': {
    name: 'Cần Câu Tau',
    emoji: '🌀',
    price: 4500000000,
    levelRequired: 580,
    effects: { expBonus: 22500000, rareBonus: 4500000, coinBonus: 9000000, cooldownReduction: 29999.99 },
    description: '🌀 TAU SPIRAL 🌀 +22500000% EXP, +4500000% cá hiếm, +9000000% coins'
  },
  'Cần Câu Upsilon': {
    name: 'Cần Câu Upsilon',
    emoji: '🔥',
    price: 5000000000,
    levelRequired: 600,
    effects: { expBonus: 25000000, rareBonus: 5000000, coinBonus: 10000000, cooldownReduction: 29999.99 },
    description: '🔥 UPSILON FIRE 🔥 +25000000% EXP, +5000000% cá hiếm, +10000000% coins'
  },
  'Cần Câu Phi': {
    name: 'Cần Câu Phi',
    emoji: '🌟',
    price: 5500000000,
    levelRequired: 620,
    effects: { expBonus: 27500000, rareBonus: 5500000, coinBonus: 11000000, cooldownReduction: 29999.99 },
    description: '🌟 PHI GOLDEN RATIO 🌟 +27500000% EXP, +5500000% cá hiếm, +11000000% coins'
  },
  'Cần Câu Chi': {
    name: 'Cần Câu Chi',
    emoji: '⚡',
    price: 6000000000,
    levelRequired: 640,
    effects: { expBonus: 30000000, rareBonus: 6000000, coinBonus: 12000000, cooldownReduction: 29999.99 },
    description: '⚡ CHI ENERGY ⚡ +30000000% EXP, +6000000% cá hiếm, +12000000% coins'
  },
  'Cần Câu Psi': {
    name: 'Cần Câu Psi',
    emoji: '🧠',
    price: 6500000000,
    levelRequired: 660,
    effects: { expBonus: 32500000, rareBonus: 6500000, coinBonus: 13000000, cooldownReduction: 29999.99 },
    description: '🧠 PSI PSYCHIC 🧠 +32500000% EXP, +6500000% cá hiếm, +13000000% coins'
  },
  'Cần Câu Omega': {
    name: 'Cần Câu Omega',
    emoji: '🔚',
    price: 7000000000,
    levelRequired: 680,
    effects: { expBonus: 35000000, rareBonus: 7000000, coinBonus: 14000000, cooldownReduction: 29999.99 },
    description: '🔚 OMEGA END 🔚 +35000000% EXP, +7000000% cá hiếm, +14000000% coins'
  },
  'Tớ Yêu Cậu': {
    name: 'Tớ Yêu Cậu',
    emoji: '💖',
    price: 10000000000,
    levelRequired: 700,
    effects: { expBonus: 50000000, rareBonus: 10000000, coinBonus: 20000000, cooldownReduction: 29999.99 },
    description: '💖 LOVE CONQUERS ALL 💖 +50000000% EXP, +10000000% cá hiếm, +20000000% coins'
  }
};

// Dữ liệu Boss Fish
const BOSS_FISH = {
  'Kraken Nhỏ': {
    name: 'Kraken Nhỏ',
    emoji: '🐙',
    hp: 500,
    damage: 50,
    reward: {
      exp: 200,
      coins: 2000,
      items: ['Mắt Kraken', 'Xúc Tu Kraken']
    },
    unlockLevel: 15,
    cooldown: 3600000, // 1 giờ
    description: 'Boss cấp thấp với sức mạnh đáng gờm'
  },
  'Megalodon': {
    name: 'Megalodon',
    emoji: '🦈',
    hp: 1000,
    damage: 80,
    reward: {
      exp: 500,
      coins: 5000,
      items: ['Răng Megalodon', 'Vây Cá Mập Khổng Lồ']
    },
    unlockLevel: 25,
    cooldown: 7200000, // 2 giờ
    description: 'Cá mập khổng lồ từ thời tiền sử'
  },
  'Rồng Biển': {
    name: 'Rồng Biển',
    emoji: '🐉',
    hp: 2000,
    damage: 120,
    reward: {
      exp: 1000,
      coins: 10000,
      items: ['Vảy Rồng', 'Ngọc Trai Rồng', 'Cần Câu Rồng']
    },
    unlockLevel: 35,
    cooldown: 14400000, // 4 giờ
    description: 'Sinh vật huyền thoại cai trị đại dương'
  },
  'Leviathan': {
    name: 'Leviathan',
    emoji: '🌊',
    hp: 5000,
    damage: 200,
    reward: {
      exp: 2500,
      coins: 25000,
      items: ['Trái Tim Leviathan', 'Vương Miện Biển Cả', 'Cần Câu Huyền Thoại']
    },
    unlockLevel: 50,
    cooldown: 86400000, // 24 giờ
    description: 'Chúa tể tối cao của tất cả đại dương'
  }
};

// Global boss battles storage
if (!global.bossBattles) {
  global.bossBattles = new Map();
}

// Global tournament system
if (!global.fishingTournaments) {
  global.fishingTournaments = {
    active: null,
    participants: new Map(),
    history: []
  };
}

// Global guild system
if (!global.fishingGuilds) {
  global.fishingGuilds = {
    guilds: new Map(),
    invitations: new Map()
  };
}

// Guild data files
const GUILD_DATA_FILE = path.join(DATA_DIR, 'fishing_guilds.json');
const GUILD_INVITATIONS_FILE = path.join(DATA_DIR, 'fishing_invitations.json');

// VIP System - 1000 levels với giá tăng theo cấp số nhân
function generateVIPLevels() {
  const vipLevels = {};
  
  for (let level = 1; level <= 1000; level++) {
    // Công thức giá: basePrice * (multiplier ^ level)
    // Level 1000 = 10,000 tỷ = 10,000,000,000,000
    const basePrice = 1000000; // 1 triệu
    const multiplier = Math.pow(10000000000000 / basePrice, 1/999); // Tính multiplier để level 1000 = 10,000 tỷ
    const price = Math.floor(basePrice * Math.pow(multiplier, level - 1));
    
    // Tính benefits theo level
    const expBonus = level * 0.1; // +0.1% mỗi level
    const coinBonus = level * 0.05; // +0.05% mỗi level
    const rareBonus = level * 0.02; // +0.02% mỗi level
    const cooldownReduction = Math.min(level * 0.01, 99); // Max 99% reduction
    
    // VIP tier names
    let tierName = 'Bronze';
    let emoji = '🥉';
    if (level >= 800) { tierName = 'Legendary'; emoji = '👑'; }
    else if (level >= 600) { tierName = 'Mythic'; emoji = '🌟'; }
    else if (level >= 400) { tierName = 'Diamond'; emoji = '💎'; }
    else if (level >= 200) { tierName = 'Platinum'; emoji = '🏆'; }
    else if (level >= 100) { tierName = 'Gold'; emoji = '🥇'; }
    else if (level >= 50) { tierName = 'Silver'; emoji = '🥈'; }
    
    vipLevels[level] = {
      level: level,
      price: price,
      tierName: tierName,
      emoji: emoji,
      benefits: {
        expBonus: expBonus,
        coinBonus: coinBonus,
        rareBonus: rareBonus,
        cooldownReduction: cooldownReduction
      },
      description: `${emoji} VIP ${level} - ${tierName} | +${expBonus}% EXP, +${coinBonus}% Coins, +${rareBonus}% Rare Fish, -${cooldownReduction}% Cooldown`
    };
  }
  
  return vipLevels;
}

const VIP_LEVELS = generateVIPLevels();

// Global achievement system
if (!global.fishingAchievements) {
  global.fishingAchievements = new Map();
}

// Guild data structures
const GUILD_LEVELS = {
  1: { name: 'Tân Binh', maxMembers: 5, bonus: { exp: 0.05, coins: 0.05 }, cost: 0 },
  2: { name: 'Phát Triển', maxMembers: 8, bonus: { exp: 0.10, coins: 0.10 }, cost: 5000 },
  3: { name: 'Thành Thạo', maxMembers: 12, bonus: { exp: 0.15, coins: 0.15 }, cost: 15000 },
  4: { name: 'Tinh Anh', maxMembers: 16, bonus: { exp: 0.20, coins: 0.20 }, cost: 35000 },
  5: { name: 'Huyền Thoại', maxMembers: 20, bonus: { exp: 0.25, coins: 0.25 }, cost: 75000 }
};

const GUILD_ROLES = {
  'Leader': { name: 'Hội Trưởng', permissions: ['invite', 'kick', 'promote', 'demote', 'upgrade', 'disband'], emoji: '👑' },
  'Officer': { name: 'Phó Hội', permissions: ['invite', 'kick', 'promote'], emoji: '⭐' },
  'Member': { name: 'Thành Viên', permissions: [], emoji: '👤' }
};

// Equipment upgrade system
const EQUIPMENT_UPGRADES = {
  // Cần câu upgrades
  'Cần Tre': {
    maxLevel: 5,
    upgrades: {
      1: { cost: 500, bonus: { exp: 0.05, luck: 0.02 }, name: '+1' },
      2: { cost: 1500, bonus: { exp: 0.10, luck: 0.05 }, name: '+2' },
      3: { cost: 3500, bonus: { exp: 0.15, luck: 0.08 }, name: '+3' },
      4: { cost: 7500, bonus: { exp: 0.20, luck: 0.12 }, name: '+4' },
      5: { cost: 15000, bonus: { exp: 0.25, luck: 0.15 }, name: '+5' }
    }
  },
  'Cần Sắt': {
    maxLevel: 5,
    upgrades: {
      1: { cost: 1000, bonus: { exp: 0.08, luck: 0.03 }, name: '+1' },
      2: { cost: 2500, bonus: { exp: 0.15, luck: 0.07 }, name: '+2' },
      3: { cost: 5000, bonus: { exp: 0.22, luck: 0.12 }, name: '+3' },
      4: { cost: 10000, bonus: { exp: 0.30, luck: 0.18 }, name: '+4' },
      5: { cost: 20000, bonus: { exp: 0.40, luck: 0.25 }, name: '+5' }
    }
  },
  'Cần Carbon': {
    maxLevel: 5,
    upgrades: {
      1: { cost: 2000, bonus: { exp: 0.12, luck: 0.05 }, name: '+1' },
      2: { cost: 4000, bonus: { exp: 0.25, luck: 0.10 }, name: '+2' },
      3: { cost: 8000, bonus: { exp: 0.40, luck: 0.18 }, name: '+3' },
      4: { cost: 16000, bonus: { exp: 0.55, luck: 0.28 }, name: '+4' },
      5: { cost: 32000, bonus: { exp: 0.75, luck: 0.40 }, name: '+5' }
    }
  },
  'Cần Titan': {
    maxLevel: 5,
    upgrades: {
      1: { cost: 5000, bonus: { exp: 0.20, luck: 0.08 }, name: '+1' },
      2: { cost: 10000, bonus: { exp: 0.40, luck: 0.15 }, name: '+2' },
      3: { cost: 20000, bonus: { exp: 0.65, luck: 0.25 }, name: '+3' },
      4: { cost: 40000, bonus: { exp: 0.95, luck: 0.40 }, name: '+4' },
      5: { cost: 80000, bonus: { exp: 1.30, luck: 0.60 }, name: '+5' }
    }
  },
  'Cần Huyền Thoại': {
    maxLevel: 10,
    upgrades: {
      1: { cost: 10000, bonus: { exp: 0.30, luck: 0.12 }, name: '+1' },
      2: { cost: 20000, bonus: { exp: 0.60, luck: 0.25 }, name: '+2' },
      3: { cost: 40000, bonus: { exp: 0.95, luck: 0.40 }, name: '+3' },
      4: { cost: 80000, bonus: { exp: 1.35, luck: 0.60 }, name: '+4' },
      5: { cost: 160000, bonus: { exp: 1.80, luck: 0.85 }, name: '+5' },
      6: { cost: 320000, bonus: { exp: 2.30, luck: 1.15 }, name: '+6' },
      7: { cost: 640000, bonus: { exp: 2.85, luck: 1.50 }, name: '+7' },
      8: { cost: 1280000, bonus: { exp: 3.45, luck: 1.90 }, name: '+8' },
      9: { cost: 2560000, bonus: { exp: 4.10, luck: 2.35 }, name: '+9' },
      10: { cost: 5120000, bonus: { exp: 5.00, luck: 3.00 }, name: '+10 MAX' }
    }
  }
};

// Achievement system
const ACHIEVEMENTS = {
  // Thành tựu câu cá cơ bản
  'first_catch': {
    id: 'first_catch',
    name: 'Lần Đầu Câu Cá',
    description: 'Câu được con cá đầu tiên',
    emoji: '🎣',
    type: 'basic',
    condition: { totalCatch: 1 },
    reward: { coins: 100, exp: 50 },
    rarity: 'common'
  },
  'catch_10': {
    id: 'catch_10',
    name: 'Thợ Câu Mới',
    description: 'Câu được 10 con cá',
    emoji: '🐟',
    type: 'basic',
    condition: { totalCatch: 10 },
    reward: { coins: 500, exp: 200 },
    rarity: 'common'
  },
  'catch_100': {
    id: 'catch_100',
    name: 'Thợ Câu Lão Luyện',
    description: 'Câu được 100 con cá',
    emoji: '🎯',
    type: 'basic',
    condition: { totalCatch: 100 },
    reward: { coins: 2000, exp: 1000 },
    rarity: 'rare'
  },
  'catch_1000': {
    id: 'catch_1000',
    name: 'Bậc Thầy Câu Cá',
    description: 'Câu được 1000 con cá',
    emoji: '🏆',
    type: 'basic',
    condition: { totalCatch: 1000 },
    reward: { coins: 10000, exp: 5000 },
    rarity: 'legendary'
  },

  // Thành tựu cá hiếm
  'first_rare': {
    id: 'first_rare',
    name: 'Cá Hiếm Đầu Tiên',
    description: 'Câu được con cá hiếm đầu tiên',
    emoji: '🍣',
    type: 'rare_fish',
    condition: { rare: 1 },
    reward: { coins: 300, exp: 150 },
    rarity: 'rare'
  },
  'rare_collector': {
    id: 'rare_collector',
    name: 'Thợ Săn Cá Hiếm',
    description: 'Câu được 50 cá hiếm',
    emoji: '🎪',
    type: 'rare_fish',
    condition: { rare: 50 },
    reward: { coins: 5000, exp: 2500 },
    rarity: 'epic'
  },
  'first_legendary': {
    id: 'first_legendary',
    name: 'Huyền Thoại Đầu Tiên',
    description: 'Câu được cá huyền thoại đầu tiên',
    emoji: '🐉',
    type: 'legendary_fish',
    condition: { legendary: 1 },
    reward: { coins: 1000, exp: 500 },
    rarity: 'epic'
  },
  'legendary_master': {
    id: 'legendary_master',
    name: 'Chúa Tể Huyền Thoại',
    description: 'Câu được 10 cá huyền thoại',
    emoji: '👑',
    type: 'legendary_fish',
    condition: { legendary: 10 },
    reward: { coins: 20000, exp: 10000 },
    rarity: 'legendary'
  },

  // Thành tựu level
  'level_10': {
    id: 'level_10',
    name: 'Thăng Tiến',
    description: 'Đạt level 10',
    emoji: '⬆️',
    type: 'level',
    condition: { level: 10 },
    reward: { coins: 1000, exp: 0 },
    rarity: 'rare'
  },
  'level_25': {
    id: 'level_25',
    name: 'Cao Thủ',
    description: 'Đạt level 25',
    emoji: '🌟',
    type: 'level',
    condition: { level: 25 },
    reward: { coins: 5000, exp: 0 },
    rarity: 'epic'
  },
  'level_50': {
    id: 'level_50',
    name: 'Siêu Cao Thủ',
    description: 'Đạt level 50',
    emoji: '💫',
    type: 'level',
    condition: { level: 50 },
    reward: { coins: 15000, exp: 0 },
    rarity: 'legendary'
  },

  // Thành tựu coins
  'rich_10k': {
    id: 'rich_10k',
    name: 'Tiểu Thương Gia',
    description: 'Sở hữu 10,000 coins',
    emoji: '💰',
    type: 'wealth',
    condition: { coins: 10000 },
    reward: { coins: 2000, exp: 500 },
    rarity: 'rare'
  },
  'rich_100k': {
    id: 'rich_100k',
    name: 'Đại Thương Gia',
    description: 'Sở hữu 100,000 coins',
    emoji: '💎',
    type: 'wealth',
    condition: { coins: 100000 },
    reward: { coins: 10000, exp: 2000 },
    rarity: 'epic'
  },
  'millionaire': {
    id: 'millionaire',
    name: 'Triệu Phú',
    description: 'Sở hữu 1,000,000 coins',
    emoji: '🏦',
    type: 'wealth',
    condition: { coins: 1000000 },
    reward: { coins: 100000, exp: 10000 },
    rarity: 'legendary'
  },

  // Thành tựu đặc biệt
  'tournament_winner': {
    id: 'tournament_winner',
    name: 'Nhà Vô Địch',
    description: 'Thắng tournament đầu tiên',
    emoji: '🏅',
    type: 'tournament',
    condition: { tournamentWins: 1 },
    reward: { coins: 5000, exp: 2000 },
    rarity: 'epic'
  },
  'guild_founder': {
    id: 'guild_founder',
    name: 'Người Sáng Lập',
    description: 'Tạo guild đầu tiên',
    emoji: '🏰',
    type: 'guild',
    condition: { guildCreated: true },
    reward: { coins: 3000, exp: 1000 },
    rarity: 'rare'
  },
  'boss_slayer': {
    id: 'boss_slayer',
    name: 'Sát Thủ Boss',
    description: 'Đánh bại boss đầu tiên',
    emoji: '⚔️',
    type: 'boss',
    condition: { bossDefeated: 1 },
    reward: { coins: 2000, exp: 1500 },
    rarity: 'epic'
  }
};

// Tournament data structure
const TOURNAMENT_TYPES = {
  'Cuộc Thi Câu Cá Nhanh': {
    name: 'Cuộc Thi Câu Cá Nhanh',
    emoji: '⚡',
    duration: 300000, // 5 phút
    goal: 'totalCatch',
    description: 'Câu được nhiều cá nhất trong 5 phút',
    minParticipants: 3,
    maxParticipants: 20,
    entryFee: 100,
    rewards: {
      1: { coins: 1000, exp: 200, title: 'Tốc Độ Vàng' },
      2: { coins: 500, exp: 100, title: 'Tốc Độ Bạc' },
      3: { coins: 250, exp: 50, title: 'Tốc Độ Đồng' }
    }
  },
  'Cuộc Thi Cá Hiếm': {
    name: 'Cuộc Thi Cá Hiếm',
    emoji: '🍣',
    duration: 600000, // 10 phút
    goal: 'rareCount',
    description: 'Câu được nhiều cá hiếm + huyền thoại nhất',
    minParticipants: 3,
    maxParticipants: 15,
    entryFee: 200,
    rewards: {
      1: { coins: 2000, exp: 500, title: 'Thợ Săn Huyền Thoại' },
      2: { coins: 1000, exp: 250, title: 'Thợ Săn Tinh Anh' },
      3: { coins: 500, exp: 125, title: 'Thợ Săn Khởi Đầu' }
    }
  },
  'Cuộc Thi Kiếm Tiền': {
    name: 'Cuộc Thi Kiếm Tiền',
    emoji: '💰',
    duration: 900000, // 15 phút
    goal: 'coinsEarned',
    description: 'Kiếm được nhiều coins nhất từ việc câu cá',
    minParticipants: 5,
    maxParticipants: 25,
    entryFee: 300,
    rewards: {
      1: { coins: 5000, exp: 1000, title: 'Triệu Phú Câu Cá' },
      2: { coins: 2500, exp: 500, title: 'Doanh Nhân Câu Cá' },
      3: { coins: 1000, exp: 200, title: 'Thương Gia Câu Cá' }
    }
  }
};

// Dữ liệu cá và rác - EXPANDED VIP EDITION
const FISH_DATA = {
  // Cá thường (60% tỉ lệ) - Expanded
  common: [
    { name: 'Cá Rô', emoji: '🐟', exp: 10, value: 50, rarity: 'Thường' },
    { name: 'Cá Chép', emoji: '🐠', exp: 12, value: 60, rarity: 'Thường' },
    { name: 'Cá Trê', emoji: '🐡', exp: 15, value: 70, rarity: 'Thường' },
    { name: 'Cá Sấu Nhỏ', emoji: '🦈', exp: 18, value: 80, rarity: 'Thường' },
    { name: 'Cá Bống', emoji: '🐟', exp: 14, value: 65, rarity: 'Thường' },
    { name: 'Cá Lóc', emoji: '🐠', exp: 16, value: 75, rarity: 'Thường' },
    { name: 'Cá Diêu Hồng', emoji: '🐡', exp: 13, value: 55, rarity: 'Thường' },
    { name: 'Cá Rô Phi', emoji: '🐟', exp: 11, value: 45, rarity: 'Thường' },
    { name: 'Cá Chuối', emoji: '🐠', exp: 17, value: 85, rarity: 'Thường' },
    { name: 'Cá Kèo', emoji: '🐡', exp: 19, value: 90, rarity: 'Thường' },
    { name: 'Cá Lăng', emoji: '🐟', exp: 20, value: 95, rarity: 'Thường' },
    { name: 'Cá Chạch', emoji: '🐠', exp: 9, value: 40, rarity: 'Thường' },
    { name: 'Cá Cơm', emoji: '🐡', exp: 8, value: 35, rarity: 'Thường' },
    { name: 'Cá Đù', emoji: '🐟', exp: 21, value: 100, rarity: 'Thường' },
    { name: 'Cá Basa', emoji: '🐠', exp: 22, value: 105, rarity: 'Thường' }
  ],
  // Cá hiếm (25% tỉ lệ) - Greatly Expanded
  rare: [
    { name: 'Cá Hồi', emoji: '🍣', exp: 25, value: 150, rarity: 'Hiếm' },
    { name: 'Cá Ngừ', emoji: '🐟', exp: 30, value: 200, rarity: 'Hiếm' },
    { name: 'Cá Mập', emoji: '🦈', exp: 35, value: 250, rarity: 'Hiếm' },
    { name: 'Bạch Tuộc', emoji: '🐙', exp: 40, value: 300, rarity: 'Hiếm' },
    { name: 'Cá Kiếm', emoji: '⚔️', exp: 45, value: 350, rarity: 'Hiếm' },
    { name: 'Cá Voi Nhỏ', emoji: '🐋', exp: 50, value: 400, rarity: 'Hiếm' },
    { name: 'Cá Manta', emoji: '🟫', exp: 42, value: 320, rarity: 'Hiếm' },
    { name: 'Cá Đuối', emoji: '🔷', exp: 38, value: 280, rarity: 'Hiếm' },
    { name: 'Cá Heo', emoji: '🐬', exp: 55, value: 450, rarity: 'Hiếm' },
    { name: 'Tôm Hùm', emoji: '🦞', exp: 32, value: 220, rarity: 'Hiếm' },
    { name: 'Cua Hoàng Gia', emoji: '🦀', exp: 28, value: 180, rarity: 'Hiếm' },
    { name: 'Ốc Sên Biển', emoji: '🐌', exp: 26, value: 160, rarity: 'Hiếm' },
    { name: 'Sao Biển', emoji: '⭐', exp: 33, value: 230, rarity: 'Hiếm' },
    { name: 'Cá Bơn', emoji: '🐟', exp: 37, value: 270, rarity: 'Hiếm' },
    { name: 'Cá Thu', emoji: '🐠', exp: 41, value: 310, rarity: 'Hiếm' },
    { name: 'Cá Cờ', emoji: '🚩', exp: 46, value: 360, rarity: 'Hiếm' },
    { name: 'Cá Chình', emoji: '🐍', exp: 39, value: 290, rarity: 'Hiếm' },
    { name: 'Cá Lưỡi Trâu', emoji: '👅', exp: 34, value: 240, rarity: 'Hiếm' },
    { name: 'Cá Bướm', emoji: '🦋', exp: 36, value: 260, rarity: 'Hiếm' },
    { name: 'Cá Vây Vàng', emoji: '🟡', exp: 43, value: 330, rarity: 'Hiếm' },
    { name: 'Cá Mú', emoji: '🔴', exp: 44, value: 340, rarity: 'Hiếm' },
    { name: 'Cá Hồng', emoji: '🌸', exp: 47, value: 370, rarity: 'Hiếm' },
    { name: 'Cá Xanh', emoji: '💙', exp: 48, value: 380, rarity: 'Hiếm' },
    { name: 'Cá Bạc', emoji: '🤍', exp: 49, value: 390, rarity: 'Hiếm' },
    { name: 'Cá Tím', emoji: '💜', exp: 51, value: 410, rarity: 'Hiếm' }
  ],
  // Cá huyền thoại (10% tỉ lệ) - Massively Expanded
  legendary: [
    { name: 'Rồng Biển', emoji: '🐉', exp: 100, value: 1000, rarity: 'Huyền Thoại' },
    { name: 'Cá Vàng Thần', emoji: '🟨', exp: 80, value: 800, rarity: 'Huyền Thoại' },
    { name: 'Phượng Hoàng Biển', emoji: '🔥', exp: 120, value: 1200, rarity: 'Huyền Thoại' },
    { name: 'Kỳ Lân Biển', emoji: '🦄', exp: 150, value: 1500, rarity: 'Huyền Thoại' },
    { name: 'Thiên Long', emoji: '🌟', exp: 200, value: 2000, rarity: 'Huyền Thoại' },
    { name: 'Bạch Long Vương', emoji: '🤍', exp: 180, value: 1800, rarity: 'Huyền Thoại' },
    { name: 'Hắc Long Vương', emoji: '🖤', exp: 190, value: 1900, rarity: 'Huyền Thoại' },
    { name: 'Kim Long', emoji: '🟡', exp: 220, value: 2200, rarity: 'Huyền Thoại' },
    { name: 'Ngân Long', emoji: '🤍', exp: 210, value: 2100, rarity: 'Huyền Thoại' },
    { name: 'Hỏa Long', emoji: '🔥', exp: 240, value: 2400, rarity: 'Huyền Thoại' },
    { name: 'Thủy Long', emoji: '💧', exp: 230, value: 2300, rarity: 'Huyền Thoại' },
    { name: 'Thổ Long', emoji: '🟤', exp: 250, value: 2500, rarity: 'Huyền Thoại' },
    { name: 'Mộc Long', emoji: '🟢', exp: 260, value: 2600, rarity: 'Huyền Thoại' },
    { name: 'Cá Voi Vàng', emoji: '🟨', exp: 300, value: 3000, rarity: 'Huyền Thoại' },
    { name: 'Megalodon', emoji: '🦈', exp: 350, value: 3500, rarity: 'Huyền Thoại' },
    { name: 'Kraken', emoji: '🐙', exp: 400, value: 4000, rarity: 'Huyền Thoại' },
    { name: 'Leviathan', emoji: '🌊', exp: 450, value: 4500, rarity: 'Huyền Thoại' },
    { name: 'Poseidon Fish', emoji: '🔱', exp: 500, value: 5000, rarity: 'Huyền Thoại' },
    { name: 'Atlantis Guardian', emoji: '🏛️', exp: 550, value: 5500, rarity: 'Huyền Thoại' },
    { name: 'Crystal Fish', emoji: '💎', exp: 600, value: 6000, rarity: 'Huyền Thoại' },
    { name: 'Rainbow Fish', emoji: '🌈', exp: 650, value: 6500, rarity: 'Huyền Thoại' },
    { name: 'Cosmic Fish', emoji: '🌌', exp: 700, value: 7000, rarity: 'Huyền Thoại' },
    { name: 'Time Fish', emoji: '⏰', exp: 750, value: 7500, rarity: 'Huyền Thoại' },
    { name: 'Space Fish', emoji: '🚀', exp: 800, value: 8000, rarity: 'Huyền Thoại' },
    { name: 'Divine Fish', emoji: '✨', exp: 850, value: 8500, rarity: 'Huyền Thoại' }
  ],
  // Cá siêu huyền thoại (3% tỉ lệ) - NEW TIER
  mythical: [
    { name: 'Cá Thần Thoại', emoji: '👑', exp: 1000, value: 10000, rarity: 'Siêu Huyền Thoại' },
    { name: 'Emperor Fish', emoji: '👑', exp: 1200, value: 12000, rarity: 'Siêu Huyền Thoại' },
    { name: 'Genesis Fish', emoji: '🌍', exp: 1500, value: 15000, rarity: 'Siêu Huyền Thoại' },
    { name: 'Omega Fish', emoji: '♦️', exp: 2000, value: 20000, rarity: 'Siêu Huyền Thoại' },
    { name: 'Alpha Fish', emoji: '♠️', exp: 2500, value: 25000, rarity: 'Siêu Huyền Thoại' },
    { name: 'Infinity Fish', emoji: '♾️', exp: 3000, value: 30000, rarity: 'Siêu Huyền Thoại' },
    { name: 'God Fish', emoji: '🙏', exp: 5000, value: 50000, rarity: 'Siêu Huyền Thoại' },
    { name: 'Universe Fish', emoji: '🌟', exp: 10000, value: 100000, rarity: 'Siêu Huyền Thoại' }
  ],
  // Cá tối thượng (1% tỉ lệ) - ULTIMATE TIER
  ultimate: [
    { name: 'Bonzzz Fish', emoji: '👑', exp: 50000, value: 500000, rarity: 'Tối Thượng' },
    { name: 'Zeid Fish', emoji: '🔥', exp: 100000, value: 1000000, rarity: 'Tối Thượng' },
    { name: 'Admin Fish', emoji: '⚡', exp: 200000, value: 2000000, rarity: 'Tối Thượng' }
  ],
  // Rác (1% tỉ lệ) - Reduced
  trash: [
    { name: 'Giày Cũ', emoji: '👟', exp: 1, value: 0, rarity: 'Rác' },
    { name: 'Lon Bia', emoji: '🥫', exp: 1, value: 0, rarity: 'Rác' },
    { name: 'Túi Nilon', emoji: '🛍️', exp: 1, value: 0, rarity: 'Rác' },
    { name: 'Chai Nhựa', emoji: '🍼', exp: 1, value: 0, rarity: 'Rác' },
    { name: 'Đồ Chơi Hỏng', emoji: '🧸', exp: 1, value: 0, rarity: 'Rác' },
    { name: 'Điện Thoại Cũ', emoji: '📱', exp: 1, value: 0, rarity: 'Rác' }
  ]
};

// EXTRA FISH DIVERSITY - merged into FISH_DATA at load
const EXTRA_FISH = {
  common: [
    { name: 'Cá Trích', emoji: '🐟', exp: 11, value: 55, rarity: 'Thường' },
    { name: 'Cá Cầu Vồng', emoji: '🌈', exp: 17, value: 85, rarity: 'Thường' },
    { name: 'Cá Phát Sáng', emoji: '✨', exp: 18, value: 92, rarity: 'Thường' },
    { name: 'Cá Sa Mạc', emoji: '🏜️', exp: 13, value: 58, rarity: 'Thường' },
    { name: 'Cá Rừng', emoji: '🌲', exp: 16, value: 78, rarity: 'Thường' }
  ],
  rare: [
    { name: 'Cá Hổ', emoji: '🐯', exp: 44, value: 340, rarity: 'Hiếm' },
    { name: 'Cá Rồng Bạc', emoji: '🐉', exp: 48, value: 380, rarity: 'Hiếm' },
    { name: 'Cá Đuối Điện', emoji: '⚡', exp: 46, value: 360, rarity: 'Hiếm' },
    { name: 'Cá San Hô', emoji: '🪸', exp: 41, value: 315, rarity: 'Hiếm' },
    { name: 'Cá Lửa', emoji: '🔥', exp: 43, value: 330, rarity: 'Hiếm' }
  ],
  legendary: [
    { name: 'Long Ngư', emoji: '🐲', exp: 120, value: 5000, rarity: 'Huyền Thoại' },
    { name: 'Cá Phượng Hoàng', emoji: '🦅', exp: 110, value: 4200, rarity: 'Huyền Thoại' },
    { name: 'Cá Băng Linh', emoji: '❄️', exp: 105, value: 4000, rarity: 'Huyền Thoại' },
    { name: 'Cá Dung Nham', emoji: '🌋', exp: 115, value: 4500, rarity: 'Huyền Thoại' }
  ],
  trash: [
    { name: 'Vỏ Ốc Vỡ', emoji: '🐚', exp: 1, value: 1, rarity: 'Rác' },
    { name: 'Hộp Thiếc', emoji: '🧃', exp: 1, value: 1, rarity: 'Rác' },
    { name: 'Túi Nilon', emoji: '🛍️', exp: 1, value: 1, rarity: 'Rác' },
    { name: 'Dây Cước Cũ', emoji: '🧵', exp: 1, value: 1, rarity: 'Rác' }
  ]
};

try {
  if (typeof FISH_DATA !== 'undefined') {
    if (Array.isArray(FISH_DATA.common)) FISH_DATA.common.push(...EXTRA_FISH.common);
    if (Array.isArray(FISH_DATA.rare)) FISH_DATA.rare.push(...EXTRA_FISH.rare);
    if (Array.isArray(FISH_DATA.legendary)) FISH_DATA.legendary.push(...EXTRA_FISH.legendary);
    if (Array.isArray(FISH_DATA.trash)) FISH_DATA.trash.push(...EXTRA_FISH.trash);
  }
} catch {}

module.exports.config = {
  name: "fishing",
  aliases: ['fish', 'câu', 'cau'],
  version: "2.0.0",
  role: 0,
  author: "Zeid Bot Enhanced",
  description: "Game câu cá với hệ thống kinh nghiệm và auto-save",
  category: "Game",
  usage: "fishing [cast/stats/inventory/shop/buy/sell/cần/area/goto/bait/boss/attack/defend/heal/tournament/guild/achievement/upgrade/quest/vip/admin/bank/give/id/guess/kbb/tht/war/bac/pvp/bj/arena/monster/help]",
  cooldowns: 5
};

// Load dữ liệu khi khởi động
module.exports.onLoad = async () => {
  console.log('[FISHING] Đang tải dữ liệu...');
  loadPlayerData();
  loadCooldowns();
  loadGuildData();
  
  // Đảm bảo global leaderboard được khởi tạo và sync
  syncToGlobalLeaderboard();
  // Migrate player areas after catalog changes
  try { migrateAllPlayersAreas(); } catch {}
  
  console.log('[FISHING] Hoàn tất tải dữ liệu, guild và đồng bộ leaderboard!');
};

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  let userName = 'Ngư dân';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Ngư dân';
  } catch {}
  try {
    const profName = (profiles.getProfile(senderId) || {}).name;
    if (profName) userName = profName;
  } catch {}

  const action = (args[0] || '').toLowerCase();

  // Sử dụng createPlayer function để đảm bảo consistency
  const player = createPlayer(senderId);
  
  // Safe message sender with header
  const __origSend = api.sendMessage.bind(api);
  
  // Enforce profile registration
  try {
    if (!profiles.hasProfile(senderId)) {
      return __origSend("⚠️ M chưa có hồ sơ game. Gõ: 'profile create <tên>' để tạo trước rồi quay lại chơi nha.", threadId, type);
    }
  } catch {}
  let __headerShown = false;
  const __headerLine = () => {
    try {
      return `👤 Tên: ${userName} | 🎮 Game: Fishing | 🆔 UID: ${senderId} | 💰 Tiền: ${(player?.coins||0).toLocaleString('vi-VN')}`;
    } catch {
      return `👤 Tên: ${userName} | 🎮 Game: Fishing | 🆔 UID: ${senderId} | 💰 Tiền: ${player?.coins||0}`;
    }
  };
  
  // Create safe wrapper function
  const safeSendMessage = (message, toThreadId, toType, ...extraArgs) => {
    try {
      // Validate message parameter
      if (!message) {
        console.error('[FISHING] Empty message detected');
        return Promise.resolve();
      }
      
      // Add header only once
      if (!__headerShown && typeof message === 'string') {
        const header = __headerLine();
        message = header + '\n' + message;
        __headerShown = true;
      }
      
      // Validate parameters
      const finalThreadId = toThreadId || threadId;
      const finalType = toType || type;
      
      // Validate threadId
      if (!finalThreadId) {
        console.error('[FISHING] Invalid threadId:', finalThreadId);
        return Promise.resolve();
      }
      
      // Log parameters for debugging
      console.log('[FISHING] SendMessage params:', {
        messageType: typeof message,
        threadId: finalThreadId,
        type: finalType,
        extraArgsCount: extraArgs.length
      });
      
      // Call original with proper parameters
      if (extraArgs.length > 0) {
        return __origSend(message, finalThreadId, finalType, ...extraArgs);
      } else {
        return __origSend(message, finalThreadId, finalType);
      }
    } catch (error) {
      console.error('[FISHING] SendMessage Error:', error);
      console.error('[FISHING] Error details:', {
        message: typeof message,
        threadId: toThreadId || threadId,
        type: toType || type
      });
      // Fallback to original API without header
      try {
        return __origSend(String(message || ''), toThreadId || threadId, toType || type);
      } catch (fallbackError) {
        console.error('[FISHING] Fallback also failed:', fallbackError);
        return Promise.resolve();
      }
    }
  };
  
  // Replace api.sendMessage with safe version
  api.sendMessage = safeSendMessage;
  
  // Kiểm tra nợ quá hạn trước khi xử lý lệnh
  checkOverdueLoan(player, api, threadId, type);
  
  // WALLET VIEW (Unified Farm + Fishing)
  if (['wallet', 'ví', 'vi', 'balance'].includes(action)) {
    const { farmCoins, fishCoins, total } = unifiedGetBalances(threadId, senderId);
    const msg = [
      '💳 VÍ CHUNG (Farm + Fishing)',
      '━━━━━━━━━━━━━━━━━━━━',
      `🌾 Farm: ${farmCoins.toLocaleString()} coins`,
      `🎣 Fishing: ${fishCoins.toLocaleString()} coins`,
      `💰 Tổng: ${total.toLocaleString()} coins`,
      '',
      '💡 Mẹo: "game farm plant/harvest" hoặc "fishing cast/sell" để kiếm coins'
    ].join('\n');
    return api.sendMessage(msg, threadId, type);
  }
  
  // AREA COMMANDS
  if (['areas', 'area', 'goto'].includes(action)) {
    if (action === 'areas') {
      // filters: page, biome
      let page = 1;
      let biomeFilter = null;
      const listOwnedOnly = (args[1] && /^my$/i.test(args[1]));
      const pageIdx = args.findIndex(x => /^page$/i.test(x));
      if (pageIdx !== -1 && args[pageIdx + 1] && /^\d+$/.test(args[pageIdx + 1])) {
        page = Math.max(1, parseInt(args[pageIdx + 1]));
      } else if (args[1] && /^\d+$/.test(args[1])) {
        page = Math.max(1, parseInt(args[1]));
      }
      const biomeIdx = args.findIndex(x => /^biome$/i.test(x));
      if (biomeIdx !== -1 && args[biomeIdx + 1]) biomeFilter = args.slice(biomeIdx + 1).join(' ').trim();
      let list = AREA_CATALOG;
      if (listOwnedOnly) {
        const owned = new Set(Array.isArray(player.ownedAreas) ? player.ownedAreas : []);
        list = list.filter(a => owned.has(a.key));
      }
      if (biomeFilter) list = list.filter(a => a.biome.toLowerCase().includes(biomeFilter.toLowerCase()));
      const per = 50; const totalPages = Math.max(1, Math.ceil(list.length / per));
      if (page > totalPages) page = totalPages;
      const slice = list.slice((page - 1) * per, page * per);
      const ownedSet = new Set(Array.isArray(player.ownedAreas) ? player.ownedAreas : []);
      const lines = slice.map(a => {
        const owned = ownedSet.has(a.key);
        const feeLabel = owned ? 'FREE' : a.fee.toLocaleString();
        const ownMark = owned ? ' ✅OWN' : '';
        return `${a.id.toString().padStart(3,' ')} | ${a.emoji} ${a.name} [${a.biome}] — Lv${a.reqLevel} — Fee ${feeLabel}${ownMark}`;
      });
      const head = `📍 DANH SÁCH KHU VỰC CÂU CÁ (${list.length} khu)\nTrang ${page}/${totalPages}${biomeFilter ? ` | Biome: ${biomeFilter}` : ''}${listOwnedOnly ? ' | Chỉ hiển thị: ĐÃ SỞ HỮU' : ''}`;
      const tail = `\nDùng: "fishing goto <id|key|tên>" để di chuyển\nLọc: "fishing areas biome <tên>" | Trang: "fishing areas page <số>"\nSở hữu: "fishing areas my" (chỉ hiện khu đã mua)`;
      return sendChunked(api, [head, '────────────────', ...lines, tail].join('\n'), threadId, type);
    }
    if (action === 'area') {
      const area = getPlayerCurrentArea(player);
      const balances = unifiedGetBalances(threadId, senderId);
      const owned = Array.isArray(player.ownedAreas) && player.ownedAreas.includes(area.key);
      const msg = [
        `🧭 KHU VỰC HIỆN TẠI ${owned ? '✅ (ĐÃ SỞ HỮU)' : ''}`,
        formatAreaCard(area),
        '',
        `💳 Số dư ví chung: ${balances.total.toLocaleString()} coins`
      ].join('\n');
      return sendChunked(api, msg, threadId, type);
    }
    if (action === 'goto') {
      const target = args.slice(1).join(' ').trim();
      if (!target) return api.sendMessage('❗ Dùng: fishing goto <id|key|tên_khu>', threadId, type);
      const area = findAreaByAny(target);
      if (!area) return api.sendMessage('❌ Không tìm thấy khu vực phù hợp!', threadId, type);
      if ((player.level || 1) < area.reqLevel) return api.sendMessage(`⛔ Cấp quá thấp! Cần level ${area.reqLevel}.`, threadId, type);
      const isOwned = Array.isArray(player.ownedAreas) && player.ownedAreas.includes(area.key);
      // Deduct fee nếu chưa sở hữu
      if (area.fee > 0 && !isOwned) {
        const { total } = unifiedGetBalances(threadId, senderId);
        if (total < area.fee) {
          return sendChunked(api, `❌ Không đủ coins để vào khu này (cần ${area.fee.toLocaleString()}).\n💡 Gợi ý: "game farm harvest" hoặc "fishing cast" rồi "fishing sell" để kiếm thêm coins.`, threadId, type);
        }
        const ok = unifiedDeduct(threadId, senderId, area.fee);
        if (!ok) return api.sendMessage('⚠️ Lỗi trừ phí ví chung. Thử lại sau.', threadId, type);
      }
      player.currentAreaKey = area.key;
      player.currentArea = area.name;
      savePlayerData();
      const balances = unifiedGetBalances(threadId, senderId);
      const msg = [
        `🚩 ĐÃ DI CHUYỂN KHU VỰC!${isOwned ? ' 🏠 (Miễn phí - khu đã sở hữu)' : ''}`,
        formatAreaCard(area),
        `💳 Số dư còn: ${balances.total.toLocaleString()} coins`
      ].join('\n');
      return sendChunked(api, msg, threadId, type);
    }
    // Mua khu vực/hồ: fishing buy <id|key|tên>
    if (action === 'buy') {
      const target = args.slice(1).join(' ').trim();
      if (!target) return api.sendMessage('❗ Dùng: fishing buy <id|key|tên_khu>', threadId, type);
      const area = findAreaByAny(target);
      if (!area) return api.sendMessage('❌ Không tìm thấy khu vực phù hợp!', threadId, type);
      if ((player.level || 1) < area.reqLevel) return api.sendMessage(`⛔ Cấp quá thấp! Cần level ${area.reqLevel}.`, threadId, type);
      player.ownedAreas = Array.isArray(player.ownedAreas) ? player.ownedAreas : [];
      if (player.ownedAreas.includes(area.key)) {
        return api.sendMessage('✅ Bạn đã sở hữu khu vực này rồi!', threadId, type);
      }
      // Giá mua: dựa trên fee và yêu cầu level
      const price = Math.max(1000, area.fee * 50 + area.reqLevel * 500);
      const { total } = unifiedGetBalances(threadId, senderId);
      if (total < price) {
        return api.sendMessage(`💸 Giá mua khu: ${price.toLocaleString()} coins\n❌ Không đủ coins để mua!`, threadId, type);
      }
      const ok = unifiedDeduct(threadId, senderId, price);
      if (!ok) return api.sendMessage('⚠️ Lỗi trừ tiền ví chung. Thử lại sau.', threadId, type);
      player.ownedAreas.push(area.key);
      // Auto-teleport to the purchased area
      player.currentAreaKey = area.key;
      player.currentArea = area.name;
      savePlayerData();
      return api.sendMessage(
        [
          '📝 MUA KHU VỰC THÀNH CÔNG! 🏠',
          `${area.emoji} ${area.name} (${area.biome})`,
          `💳 Đã trừ: ${price.toLocaleString()} coins`,
          '🎁 Từ nay vào khu này sẽ MIỄN PHÍ!',
          '🚩 ĐÃ DI CHUYỂN đến khu vừa mua!'
        ].join('\n'),
        threadId, type
      );
    }
  }
  
  // Đảm bảo player có tất cả fields cần thiết (cho user cũ)
  let needsSave = false;
  
  if (!player.fishingRods) {
    player.fishingRods = { 'Cần Câu Cơ Bản': 1 };
    needsSave = true;
  }
  if (!player.currentRod) {
    player.currentRod = 'Cần Câu Cơ Bản';
    needsSave = true;
  }
  if (!player.currentArea) {
    player.currentArea = 'Hồ Cơ Bản';
    needsSave = true;
  }
  // Sở hữu khu vực/hồ: dùng key để định danh
  if (!Array.isArray(player.ownedAreas)) {
    player.ownedAreas = [];
    needsSave = true;
  }
  if (!player.baits) {
    player.baits = {};
    needsSave = true;
  }
  if (!player.activeBait) {
    player.activeBait = null;
    needsSave = true;
  }
  if (player.baitUsesLeft === undefined) {
    player.baitUsesLeft = 0;
    needsSave = true;
  }
  if (!player.bossItems) {
    player.bossItems = {};
    needsSave = true;
  }
  if (!player.bossCooldowns) {
    player.bossCooldowns = {};
    needsSave = true;
  }
  if (player.totalBaitUses === undefined) {
    player.totalBaitUses = 0;
    needsSave = true;
  }
  if (player.maxBaitUses === undefined) {
    player.maxBaitUses = 5;
    needsSave = true;
  }
  if (!player.tournamentStats) {
    player.tournamentStats = {
      wins: 0,
      participations: 0,
      titles: []
    };
    needsSave = true;
  }
  if (!player.currentTournament) {
    player.currentTournament = null;
    needsSave = true;
  }
  if (!player.guild) {
    player.guild = {
      id: null,
      role: null,
      joinDate: null,
      contribution: 0
    };
    needsSave = true;
  }
  if (!player.vip) {
    player.vip = {
      level: 0,
      purchaseDate: null,
      totalSpent: 0
    };
    needsSave = true;
  }
  if (!player.achievements) {
    player.achievements = [];
    needsSave = true;
  }
  if (!player.achievementProgress) {
    player.achievementProgress = {};
    needsSave = true;
  }
  if (!player.equipmentLevels) {
    player.equipmentLevels = {};
    needsSave = true;
  }
  if (!player.stats) {
    player.stats = {
      common: 0,
      rare: 0,
      legendary: 0,
      trash: 0
    };
    needsSave = true;
  }
  if (!player.dailyQuest) {
    player.dailyQuest = {
      date: new Date().toDateString(),
      catchCount: 0,
      rareCount: 0,
      completed: false,
      reward: 200
    };
    needsSave = true;
  }
  if (!player.vipMoney) {
    player.vipMoney = {
      level: 0,
      totalSpent: 0,
      purchaseHistory: [],
      lastPurchase: null
    };
    needsSave = true;
  }
  if (!player.bank) {
    player.bank = {
      balance: 0,
      transactions: [],
      interestRate: 0.02,
      lastInterest: Date.now(),
      loan: {
        amount: 0,
        startDate: null,
        interestRate: 0.05,
        dueDate: null,
        autoDeductEnabled: true
      }
    };
    needsSave = true;
  }
  // Backup loan fields cho user cũ
  if (!player.bank.loan) {
    player.bank.loan = {
      amount: 0,
      startDate: null,
      interestRate: 0.05,
      dueDate: null,
      autoDeductEnabled: true
    };
    needsSave = true;
  }
  
  // Save nếu có thay đổi fields cho user cũ
  if (needsSave) {
    console.log(`[FISHING] Cập nhật fields cho user cũ: ${senderId}`);
    savePlayerData();
  }

  // Debug command để force sync leaderboard
  if (action === 'debug' && args[1] === 'sync') {
    console.log('[FISHING] Force sync leaderboard...');
    syncToGlobalLeaderboard();
    return api.sendMessage(
      `🔧 **DEBUG SYNC COMPLETED**\n\n` +
      `📊 PlayerData size: ${playerData.size}\n` +
      `🏆 Global leaderboard fishing size: ${global.gameLeaderboard?.fishing?.size || 0}\n` +
      `💾 Đã force sync leaderboard!`,
      threadId, type
    );
  }

  // Debug command để clean inventory
  if (action === 'debug' && args[1] === 'clean') {
    const inventory = player.inventory;
    const itemsBefore = Object.keys(inventory).length;
    let removedCount = 0;
    
    // Xóa items không hợp lệ
    for (const itemName of Object.keys(inventory)) {
      const item = findItemByName(itemName);
      if (!item) {
        console.log(`[FISHING] Removing invalid item: ${itemName}`);
        delete inventory[itemName];
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      savePlayerData();
    }
    
    return api.sendMessage(
      `🧹 **INVENTORY CLEANUP COMPLETED**\n\n` +
      `📦 Items trước: ${itemsBefore}\n` +
      `🗑️ Items đã xóa: ${removedCount}\n` +
      `📦 Items sau: ${Object.keys(inventory).length}\n` +
      `💾 ${removedCount > 0 ? 'Đã lưu thay đổi!' : 'Không có thay đổi!'}`,
      threadId, type
    );
  }

  // ======================== FISHING BANK SYSTEM ========================
  
  // Bank - Gửi tiền vào ngân hàng
  if (action === 'bank') {
    const subAction = (args[1] || '').toLowerCase();
    
    // Khởi tạo bank account nếu chưa có
    if (!player.bank) {
      player.bank = {
        balance: 0,
        transactions: [],
        interestRate: 0.02, // 2% lãi suất/ngày
        lastInterest: Date.now()
      };
    }
    
    if (!subAction || subAction === 'info') {
      // Hiển thị thông tin bank
      const daysSinceInterest = Math.floor((Date.now() - player.bank.lastInterest) / (24 * 60 * 60 * 1000));
      const pendingInterest = Math.floor(player.bank.balance * player.bank.interestRate * daysSinceInterest);
      
      // Tính nợ hiện tại nếu có
      let debtInfo = '';
      if (player.bank.loan && player.bank.loan.amount > 0) {
        const currentDebt = player.bank.loan.amount;
        const timeLeft = player.bank.loan.dueDate - Date.now();
        
        if (timeLeft > 0) {
          const minutesLeft = Math.floor(timeLeft / (60 * 1000));
          const secondsLeft = Math.floor((timeLeft % (60 * 1000)) / 1000);
          debtInfo = `💳 Nợ hiện tại: ${currentDebt.toLocaleString()} coins`;
          debtInfo += `\n⏰ Thời gian còn lại: ${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`;
        } else {
          debtInfo = `💳 Nợ hiện tại: ${currentDebt.toLocaleString()} coins`;
          debtInfo += `\n🚨 ĐÃ QUÁ HẠN! Sẽ tự động trừ tiền!`;
        }
      }
      
      const bankMsg = [
        `🏦 **FISHING BANK - ${userName}**`,
        '',
        `💰 Số dư tài khoản: ${player.bank.balance.toLocaleString()} coins`,
        `💳 Tiền mặt: ${player.coins.toLocaleString()} coins`,
        `📈 Lãi suất: ${(player.bank.interestRate * 100).toFixed(1)}%/ngày`,
        `💎 Lãi chờ nhận: ${pendingInterest.toLocaleString()} coins`,
        debtInfo ? debtInfo : '',
        '',
        '📋 **LỆNH BANK:**',
        '• fishing bank deposit <số> - Gửi tiền',
        '• fishing bank withdraw <số> - Rút tiền',
        '• fishing bank interest - Nhận lãi',
        '• fishing bank loan <số> - Vay tiền (lãi suất 5%/ngày)',
        '• fishing bank repay <số> - Trả nợ',
        '• fishing bank history - Lịch sử giao dịch',
        '',
        '🎁 **LỆNH TẶNG:**',
        '• fishing give coins @user <số> - Tặng coins (mention)',
        '• fishing give coins <userID> <số> - Tặng coins (ID)',
        '• fishing give rod @user <tên_cần> - Tặng cần câu',
        '• fishing give fish @user <tên_cá> <số> - Tặng cá',
        '',
        '💡 **LỢI ÍCH BANK:**',
        '• 🔒 Bảo vệ tiền khỏi mất khi chơi',
        '• 📈 Nhận lãi suất hàng ngày',
        '• 💸 Chuyển tiền cho bạn bè'
      ].join('\n');
      
      return api.sendMessage(bankMsg, threadId, type);
    }
    
    if (subAction === 'deposit') {
      const amount = parseInt(args[2]);
      if (!amount || amount <= 0) {
        return api.sendMessage('❌ Số tiền không hợp lệ! Ví dụ: fishing bank deposit 1000', threadId, type);
      }
      
      if (player.coins < amount) {
        return api.sendMessage(`❌ Không đủ tiền! Bạn chỉ có ${player.coins.toLocaleString()} coins.`, threadId, type);
      }
      
      player.coins -= amount;
      player.bank.balance += amount;
      player.bank.transactions.push({
        type: 'deposit',
        amount: amount,
        timestamp: Date.now(),
        description: 'Gửi tiền vào bank'
      });
      
      // Giữ tối đa 20 giao dịch gần nhất
      if (player.bank.transactions.length > 20) {
        player.bank.transactions = player.bank.transactions.slice(-20);
      }
      
      savePlayerData();
      
      return api.sendMessage(
        `✅ **GỬI TIỀN THÀNH CÔNG!**\n\n` +
        `💰 Đã gửi: ${amount.toLocaleString()} coins\n` +
        `🏦 Số dư bank: ${player.bank.balance.toLocaleString()} coins\n` +
        `💳 Tiền mặt còn lại: ${player.coins.toLocaleString()} coins`,
        threadId, type
      );
    }
    
    if (subAction === 'withdraw') {
      const amount = parseInt(args[2]);
      if (!amount || amount <= 0) {
        return api.sendMessage('❌ Số tiền không hợp lệ! Ví dụ: fishing bank withdraw 1000', threadId, type);
      }
      
      if (player.bank.balance < amount) {
        return api.sendMessage(`❌ Số dư không đủ! Bank chỉ có ${player.bank.balance.toLocaleString()} coins.`, threadId, type);
      }
      
      player.bank.balance -= amount;
      player.coins += amount;
      player.bank.transactions.push({
        type: 'withdraw',
        amount: amount,
        timestamp: Date.now(),
        description: 'Rút tiền từ bank'
      });
      
      if (player.bank.transactions.length > 20) {
        player.bank.transactions = player.bank.transactions.slice(-20);
      }
      
      savePlayerData();
      
      return api.sendMessage(
        `✅ **RÚT TIỀN THÀNH CÔNG!**\n\n` +
        `💰 Đã rút: ${amount.toLocaleString()} coins\n` +
        `🏦 Số dư bank: ${player.bank.balance.toLocaleString()} coins\n` +
        `💳 Tiền mặt hiện tại: ${player.coins.toLocaleString()} coins`,
        threadId, type
      );
    }
    
    if (subAction === 'interest') {
      const daysSinceInterest = Math.floor((Date.now() - player.bank.lastInterest) / (24 * 60 * 60 * 1000));
      
      if (daysSinceInterest < 1) {
        const hoursLeft = 24 - Math.floor((Date.now() - player.bank.lastInterest) / (60 * 60 * 1000));
        return api.sendMessage(`⏰ Chưa đến thời gian nhận lãi! Còn ${hoursLeft} giờ nữa.`, threadId, type);
      }
      
      const interestAmount = Math.floor(player.bank.balance * player.bank.interestRate * daysSinceInterest);
      
      if (interestAmount <= 0) {
        return api.sendMessage('❌ Không có lãi để nhận! Hãy gửi tiền vào bank trước.', threadId, type);
      }
      
      player.bank.balance += interestAmount;
      player.bank.lastInterest = Date.now();
      player.bank.transactions.push({
        type: 'interest',
        amount: interestAmount,
        timestamp: Date.now(),
        description: `Lãi suất ${daysSinceInterest} ngày`
      });
      
      if (player.bank.transactions.length > 20) {
        player.bank.transactions = player.bank.transactions.slice(-20);
      }
      
      savePlayerData();
      
      return api.sendMessage(
        `💎 **NHẬN LÃI THÀNH CÔNG!**\n\n` +
        `📈 Lãi nhận được: ${interestAmount.toLocaleString()} coins\n` +
        `📅 Số ngày: ${daysSinceInterest} ngày\n` +
        `🏦 Số dư mới: ${player.bank.balance.toLocaleString()} coins\n` +
        `⏰ Lãi tiếp theo: 24 giờ nữa`,
        threadId, type
      );
    }
    
    if (subAction === 'history') {
      if (!player.bank.transactions || player.bank.transactions.length === 0) {
        return api.sendMessage('📋 Chưa có giao dịch nào!', threadId, type);
      }
      
      let historyMsg = [
        `📋 **LỊCH SỬ GIAO DỊCH - ${userName}**`,
        `🏦 Số dư hiện tại: ${player.bank.balance.toLocaleString()} coins`,
        ''
      ];
      
      const recentTransactions = player.bank.transactions.slice(-10).reverse();
      recentTransactions.forEach((tx, index) => {
        const date = new Date(tx.timestamp).toLocaleString('vi-VN');
        const typeEmoji = tx.type === 'deposit' ? '📥' : tx.type === 'withdraw' ? '📤' : '💎';
        const sign = tx.type === 'withdraw' ? '-' : '+';
        
        historyMsg.push(`${typeEmoji} ${sign}${tx.amount.toLocaleString()} - ${tx.description}`);
        historyMsg.push(`   📅 ${date}`);
        if (index < recentTransactions.length - 1) historyMsg.push('');
      });
      
      return api.sendMessage(historyMsg.join('\n'), threadId, type);
    }
    
    if (subAction === 'loan') {
      const amount = parseInt(args[2]);
      if (!amount || amount <= 0) {
        return api.sendMessage('❌ Số tiền không hợp lệ! Ví dụ: fishing bank loan 5000', threadId, type);
      }
      
      // Khởi tạo loan info nếu chưa có
      if (!player.bank.loan) {
        player.bank.loan = {
          amount: 0,
          startDate: null,
          interestRate: 0.05, // 5% lãi suất/ngày
          dueDate: null,      // Hạn trả nợ (30 phút)
          autoDeductEnabled: true
        };
      }
      
      if (player.bank.loan.amount > 0) {
        return api.sendMessage(`❌ Bạn đang có khoản nợ ${player.bank.loan.amount.toLocaleString()} coins! Hãy trả nợ trước.`, threadId, type);
      }
      
      const maxLoan = Math.max(10000, player.level * 1000); // Tối thiểu 10k, tăng theo level
      if (amount > maxLoan) {
        return api.sendMessage(`❌ Số tiền vay vượt quá giới hạn! Tối đa: ${maxLoan.toLocaleString()} coins (dựa trên level ${player.level})`, threadId, type);
      }
      
      player.coins += amount;
      player.bank.loan.amount = amount;
      player.bank.loan.startDate = Date.now();
      player.bank.loan.dueDate = Date.now() + (30 * 60 * 1000); // 30 phút từ bây giờ
      
      player.bank.transactions.push({
        type: 'loan',
        amount: amount,
        timestamp: Date.now(),
        description: `Vay ${amount.toLocaleString()} coins (lãi 5%/ngày)`
      });
      
      if (player.bank.transactions.length > 20) {
        player.bank.transactions = player.bank.transactions.slice(-20);
      }
      
      savePlayerData();
      
      const dueTime = new Date(player.bank.loan.dueDate).toLocaleString('vi-VN');
      
      return api.sendMessage(
        `💳 **VAY TIỀN THÀNH CÔNG!**\n\n` +
        `💰 Số tiền vay: ${amount.toLocaleString()} coins\n` +
        `⏰ Hạn trả nợ: ${dueTime} (30 phút)\n` +
        `📈 Lãi suất: 5%/ngày\n` +
        `💳 Tiền mặt hiện tại: ${player.coins.toLocaleString()} coins\n\n` +
        `⚠️ **QUAN TRỌNG:**\n` +
        `• Phải trả nợ trong 30 phút!\n` +
        `• Sau 30 phút sẽ TỰ ĐỘNG trừ tiền từ tài khoản!\n` +
        `• Nếu không đủ tiền sẽ bị phạt nặng!\n\n` +
        `💡 Dùng "fishing bank repay <số>" để trả nợ ngay`,
        threadId, type
      );
    }
    
    if (subAction === 'repay') {
      if (!player.bank.loan || player.bank.loan.amount <= 0) {
        return api.sendMessage('❌ Bạn không có khoản nợ nào!', threadId, type);
      }
      
      // Tính lãi tích lũy
      const daysSinceLoan = Math.floor((Date.now() - player.bank.loan.startDate) / (24 * 60 * 60 * 1000));
      const currentDebt = Math.floor(player.bank.loan.amount * Math.pow(1 + player.bank.loan.interestRate, daysSinceLoan));
      
      const amount = parseInt(args[2]);
      if (!amount || amount <= 0) {
        return api.sendMessage(
          `💳 **THÔNG TIN NỢ:**\n\n` +
          `💰 Nợ gốc: ${player.bank.loan.amount.toLocaleString()} coins\n` +
          `📅 Số ngày: ${daysSinceLoan} ngày\n` +
          `📈 Nợ hiện tại: ${currentDebt.toLocaleString()} coins\n\n` +
          `💡 Dùng "fishing bank repay <số>" để trả nợ\n` +
          `💡 Ví dụ: fishing bank repay ${currentDebt}`,
          threadId, type
        );
      }
      
      if (player.coins < amount) {
        return api.sendMessage(`❌ Không đủ tiền! Bạn chỉ có ${player.coins.toLocaleString()} coins.`, threadId, type);
      }
      
      player.coins -= amount;
      const newDebt = Math.max(0, currentDebt - amount);
      
      if (newDebt <= 0) {
        // Trả hết nợ
        player.bank.loan.amount = 0;
        player.bank.loan.startDate = null;
        player.bank.loan.dueDate = null;
        
        player.bank.transactions.push({
          type: 'repay_full',
          amount: -amount,
          timestamp: Date.now(),
          description: `Trả hết nợ ${amount.toLocaleString()} coins`
        });
        
        savePlayerData();
        
        return api.sendMessage(
          `✅ **TRẢ NỢ HOÀN TẤT!**\n\n` +
          `💰 Đã trả: ${amount.toLocaleString()} coins\n` +
          `🎉 Bạn đã hết nợ!\n` +
          `💳 Tiền mặt còn lại: ${player.coins.toLocaleString()} coins`,
          threadId, type
        );
      } else {
        // Trả một phần
        player.bank.loan.amount = newDebt;
        player.bank.loan.startDate = Date.now(); // Reset thời gian tính lãi
        
        player.bank.transactions.push({
          type: 'repay_partial',
          amount: -amount,
          timestamp: Date.now(),
          description: `Trả nợ ${amount.toLocaleString()} coins`
        });
        
        savePlayerData();
        
        return api.sendMessage(
          `✅ **TRẢ NỢ THÀNH CÔNG!**\n\n` +
          `💰 Đã trả: ${amount.toLocaleString()} coins\n` +
          `💳 Nợ còn lại: ${newDebt.toLocaleString()} coins\n` +
          `💳 Tiền mặt còn lại: ${player.coins.toLocaleString()} coins\n\n` +
          `💡 Tiếp tục trả để tránh lãi suất!`,
          threadId, type
        );
      }
    }
    
    return api.sendMessage('❌ Lệnh không hợp lệ! Gõ "fishing bank" để xem hướng dẫn.', threadId, type);
  }

  // Give - Tặng đồ cho người khác
  if (action === 'give') {
    const giveType = (args[1] || '').toLowerCase();
    const targetMention = args[2];
    
    if (!giveType || !targetMention) {
      return api.sendMessage(
        '🎁 **HƯỚNG DẪN TẶNG ĐỒ:**\n\n' +
        '• fishing give coins @user <số> - Tặng coins (mention)\n' +
        '• fishing give coins <userID> <số> - Tặng coins (ID)\n' +
        '• fishing give rod @user <tên_cần> - Tặng cần câu\n' +
        '• fishing give rod <userID> <tên_cần> - Tặng cần câu (ID)\n' +
        '• fishing give fish @user <tên_cá> <số> - Tặng cá\n' +
        '• fishing give fish <userID> <tên_cá> <số> - Tặng cá (ID)\n\n' +
        '💡 Ví dụ: fishing give coins @user 1000\n' +
        '💡 Ví dụ: fishing give coins 100012345678 1000',
        threadId, type
      );
    }
    
    // Lấy target user ID từ mention hoặc ID trực tiếp
    let targetId = null;
    if (targetMention.includes('@')) {
      // Extract ID from mention format
      const match = targetMention.match(/(\d+)/);
      if (match) targetId = match[1];
    } else if (/^\d+$/.test(targetMention)) {
      // Direct user ID (chỉ số)
      targetId = targetMention;
    }
    
    if (!targetId) {
      return api.sendMessage('❌ Không tìm thấy người dùng! Hãy tag (@) hoặc nhập ID người bạn muốn tặng.', threadId, type);
    }
    
    if (targetId === senderId) {
      return api.sendMessage('❌ Không thể tặng cho chính mình!', threadId, type);
    }
    
    // Tạo player cho target nếu chưa có
    const targetPlayer = createPlayer(targetId);
    
    // Lấy tên target user
    let targetName = 'Người chơi';
    try {
      const targetInfo = await api.getUserInfo(targetId);
      targetName = targetInfo?.changed_profiles?.[targetId]?.displayName || 'Người chơi';
    } catch {}
    
    if (giveType === 'coins') {
      const amount = parseInt(args[3]);
      if (!amount || amount <= 0) {
        return api.sendMessage('❌ Số coins không hợp lệ! Ví dụ: fishing give coins @user 1000', threadId, type);
      }
      
      if (player.coins < amount) {
        return api.sendMessage(`❌ Không đủ coins! Bạn chỉ có ${player.coins.toLocaleString()} coins.`, threadId, type);
      }
      
      player.coins -= amount;
      targetPlayer.coins += amount;
      
      // Ghi log giao dịch cho cả hai
      if (!player.bank) player.bank = { balance: 0, transactions: [] };
      if (!targetPlayer.bank) targetPlayer.bank = { balance: 0, transactions: [] };
      
      player.bank.transactions.push({
        type: 'give_coins',
        amount: -amount,
        timestamp: Date.now(),
        description: `Tặng ${targetName} ${amount.toLocaleString()} coins`
      });
      
      targetPlayer.bank.transactions.push({
        type: 'receive_coins', 
        amount: amount,
        timestamp: Date.now(),
        description: `Nhận từ ${userName} ${amount.toLocaleString()} coins`
      });
      
      savePlayerData();
      
      return api.sendMessage(
        `🎁 **TẶNG COINS THÀNH CÔNG!**\n\n` +
        `👤 Người tặng: ${userName}\n` +
        `🎯 Người nhận: ${targetName}\n` +
        `💰 Số tiền: ${amount.toLocaleString()} coins\n\n` +
        `💳 Coins còn lại của bạn: ${player.coins.toLocaleString()}`,
        threadId, type
      );
    }
    
    if (giveType === 'rod') {
      const rodName = args.slice(3).join(' ');
      if (!rodName) {
        return api.sendMessage('❌ Tên cần câu không hợp lệ! Ví dụ: fishing give rod @user Cần Câu Vàng', threadId, type);
      }
      
      if (!player.fishingRods[rodName] || player.fishingRods[rodName] <= 0) {
        return api.sendMessage(`❌ Bạn không có cần câu "${rodName}"!`, threadId, type);
      }
      
      player.fishingRods[rodName]--;
      if (player.fishingRods[rodName] <= 0) {
        delete player.fishingRods[rodName];
        // Chuyển về cần câu cơ bản nếu đang dùng cần này
        if (player.currentRod === rodName) {
          player.currentRod = 'Cần Câu Cơ Bản';
        }
      }
      
      if (!targetPlayer.fishingRods[rodName]) {
        targetPlayer.fishingRods[rodName] = 0;
      }
      targetPlayer.fishingRods[rodName]++;
      
      savePlayerData();
      
      return api.sendMessage(
        `🎣 **TẶNG CẦN CÂU THÀNH CÔNG!**\n\n` +
        `👤 Người tặng: ${userName}\n` +
        `🎯 Người nhận: ${targetName}\n` +
        `🎣 Cần câu: ${rodName}\n\n` +
        `💡 ${targetName} có thể dùng lệnh "fishing cần" để xem cần câu mới!`,
        threadId, type
      );
    }
    
    if (giveType === 'fish') {
      const fishName = args.slice(3, -1).join(' ');
      const amount = parseInt(args[args.length - 1]);
      
      if (!fishName || !amount || amount <= 0) {
        return api.sendMessage('❌ Thông tin không hợp lệ! Ví dụ: fishing give fish @user Cá Rô 5', threadId, type);
      }
      
      if (!player.inventory[fishName] || player.inventory[fishName] < amount) {
        return api.sendMessage(`❌ Bạn không có đủ ${fishName}! Hiện có: ${player.inventory[fishName] || 0}`, threadId, type);
      }
      
      player.inventory[fishName] -= amount;
      if (player.inventory[fishName] <= 0) {
        delete player.inventory[fishName];
      }
      
      if (!targetPlayer.inventory[fishName]) {
        targetPlayer.inventory[fishName] = 0;
      }
      targetPlayer.inventory[fishName] += amount;
      
      savePlayerData();
      
      return api.sendMessage(
        `🐟 **TẶNG CÁ THÀNH CÔNG!**\n\n` +
        `👤 Người tặng: ${userName}\n` +
        `🎯 Người nhận: ${targetName}\n` +
        `🐟 Loại cá: ${fishName}\n` +
        `📦 Số lượng: ${amount}\n\n` +
        `💡 ${targetName} có thể xem trong "fishing inventory"!`,
        threadId, type
      );
    }
    
    return api.sendMessage('❌ Loại tặng không hợp lệ! Chỉ có thể tặng: coins, rod, fish', threadId, type);
  }

  // ======================== MINI GAMES ========================
  
  // Guess Number Game
  if (action === 'guessnumber' || action === 'guess') {
    const subAction = args[1];
    
    // Khởi tạo minigames data
    if (!player.minigames) {
      player.minigames = {
        guessnumber: { 
          wins: 0, 
          losses: 0, 
          currentGame: null,
          bestStreak: 0,
          currentStreak: 0
        }
      };
    }
    if (!player.minigames.guessnumber) {
      player.minigames.guessnumber = { 
        wins: 0, 
        losses: 0, 
        currentGame: null,
        bestStreak: 0,
        currentStreak: 0
      };
    }
    
    if (!subAction || subAction === 'start') {
      // Bắt đầu game mới
      const targetNumber = Math.floor(Math.random() * 100) + 1;
      player.minigames.guessnumber.currentGame = {
        target: targetNumber,
        attempts: 0,
        maxAttempts: 7,
        startTime: Date.now()
      };
      
      savePlayerData();
      
      return api.sendMessage(
        `🎯 **GUESS THE NUMBER!**\n\n` +
        `🎲 Tôi đã nghĩ ra một số từ 1-100!\n` +
        `🎯 Bạn có ${player.minigames.guessnumber.currentGame.maxAttempts} lần đoán\n` +
        `💰 Thắng nhận: 1000 coins\n\n` +
        `💡 Sử dụng: fishing guess <số>\n` +
        `💡 Ví dụ: fishing guess 50`,
        threadId, type
      );
    }
    
    if (subAction === 'stats') {
      const stats = player.minigames.guessnumber;
      const winRate = stats.wins + stats.losses > 0 ? 
        ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) : 0;
      
      return api.sendMessage(
        `📊 **GUESS NUMBER STATS - ${userName}**\n\n` +
        `🏆 Thắng: ${stats.wins}\n` +
        `💀 Thua: ${stats.losses}\n` +
        `📈 Tỷ lệ thắng: ${winRate}%\n` +
        `🔥 Streak tốt nhất: ${stats.bestStreak}\n` +
        `⚡ Streak hiện tại: ${stats.currentStreak}\n\n` +
        `💡 Chơi ngay: fishing guess start`,
        threadId, type
      );
    }
    
    // Đoán số
    const guessNumber = parseInt(subAction);
    if (!guessNumber || guessNumber < 1 || guessNumber > 100) {
      return api.sendMessage('❌ Vui lòng nhập số từ 1-100!\n💡 Ví dụ: fishing guess 50', threadId, type);
    }
    
    const currentGame = player.minigames.guessnumber.currentGame;
    if (!currentGame) {
      return api.sendMessage('❌ Chưa có game nào! Sử dụng "fishing guess start" để bắt đầu.', threadId, type);
    }
    
    currentGame.attempts++;
    const target = currentGame.target;
    const attemptsLeft = currentGame.maxAttempts - currentGame.attempts;
    
    if (guessNumber === target) {
      // THẮNG!
      const timeBonus = Math.max(0, 60 - Math.floor((Date.now() - currentGame.startTime) / 1000));
      const attemptBonus = Math.max(0, (currentGame.maxAttempts - currentGame.attempts) * 100);
      const reward = 1000 + timeBonus * 10 + attemptBonus;
      
      player.coins += reward;
      player.minigames.guessnumber.wins++;
      player.minigames.guessnumber.currentStreak++;
      
      if (player.minigames.guessnumber.currentStreak > player.minigames.guessnumber.bestStreak) {
        player.minigames.guessnumber.bestStreak = player.minigames.guessnumber.currentStreak;
      }
      
      player.minigames.guessnumber.currentGame = null;
      savePlayerData();
      
      return api.sendMessage(
        `🎉 **CHÍNH XÁC! THẮNG RỒI!**\n\n` +
        `🎯 Số đúng: ${target}\n` +
        `🎲 Lần đoán: ${currentGame.attempts}/${currentGame.maxAttempts}\n` +
        `💰 Phần thưởng: ${reward.toLocaleString()} coins\n` +
        `⚡ Streak: ${player.minigames.guessnumber.currentStreak}\n\n` +
        `💎 **BONUS:**\n` +
        `• Thời gian: +${timeBonus * 10} coins\n` +
        `• Ít lần đoán: +${attemptBonus} coins\n\n` +
        `🎮 Chơi lại: fishing guess start`,
        threadId, type
      );
      
    } else if (attemptsLeft <= 0) {
      // THUA!
      player.minigames.guessnumber.losses++;
      player.minigames.guessnumber.currentStreak = 0;
      player.minigames.guessnumber.currentGame = null;
      savePlayerData();
      
      return api.sendMessage(
        `💀 **HẾT LƯỢT! THUA RỒI!**\n\n` +
        `🎯 Số đúng là: ${target}\n` +
        `🎲 Số bạn đoán: ${guessNumber}\n` +
        `💔 Đã hết ${currentGame.maxAttempts} lần đoán\n\n` +
        `📊 Thống kê: fishing guess stats\n` +
        `🎮 Chơi lại: fishing guess start`,
        threadId, type
      );
      
    } else {
      // Tiếp tục đoán
      const hint = guessNumber > target ? '📉 **THẤP HỚN!**' : '📈 **CAO HỚN!**';
      const range = guessNumber > target ? 
        `🎯 Số cần tìm: 1 - ${guessNumber - 1}` :
        `🎯 Số cần tìm: ${guessNumber + 1} - 100`;
      
      savePlayerData();
      
      return api.sendMessage(
        `${hint}\n\n` +
        `🎲 Số bạn đoán: ${guessNumber}\n` +
        `${range}\n` +
        `🎯 Còn lại: ${attemptsLeft} lần đoán\n\n` +
        `💡 Tiếp tục: fishing guess <số>`,
        threadId, type
      );
    }
  }

  // Kéo Búa Bao Game
  if (action === 'kéo-búa-bao' || action === 'rps' || action === 'kbb') {
    const playerChoice = (args[1] || '').toLowerCase();
    const betAmount = parseInt(args[2]) || 100;
    
    // Khởi tạo minigames data
    if (!player.minigames) {
      player.minigames = {};
    }
    if (!player.minigames.rps) {
      player.minigames.rps = { 
        wins: 0, 
        losses: 0, 
        draws: 0,
        totalBet: 0,
        totalWon: 0,
        streak: 0,
        bestStreak: 0
      };
    }
    
    const choices = ['kéo', 'búa', 'bao', 'scissors', 'rock', 'paper'];
    const choiceMap = {
      'kéo': 'kéo', 'scissors': 'kéo',
      'búa': 'búa', 'rock': 'búa', 'đá': 'búa',
      'bao': 'bao', 'paper': 'bao', 'giấy': 'bao'
    };
    
    if (!playerChoice || !choices.includes(playerChoice)) {
      return api.sendMessage(
        '✂️ **KÉO BÚA BAO GAME**\n\n' +
        '💡 Cách chơi: fishing kéo-búa-bao <lựa_chọn> <coins>\n' +
        '💡 Lựa chọn: kéo/búa/bao (hoặc scissors/rock/paper)\n' +
        '💡 Ví dụ: fishing kbb kéo 1000\n\n' +
        '🎯 **LUẬT CHƠI:**\n' +
        '• ✂️ Kéo thắng 📄 Bao\n' +
        '• 🔨 Búa thắng ✂️ Kéo\n' +
        '• 📄 Bao thắng 🔨 Búa\n' +
        '• Thắng: +coins, Thua: -coins, Hòa: không mất tiền\n\n' +
        '📊 Xem thống kê: fishing kbb stats',
        threadId, type
      );
    }
    
    if (playerChoice === 'stats') {
      const stats = player.minigames.rps;
      const totalGames = stats.wins + stats.losses + stats.draws;
      const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : 0;
      const profit = stats.totalWon - stats.totalBet;
      
      return api.sendMessage(
        `📊 **KÉO BÚA BAO STATS - ${userName}**\n\n` +
        `🏆 Thắng: ${stats.wins}\n` +
        `💀 Thua: ${stats.losses}\n` +
        `🤝 Hòa: ${stats.draws}\n` +
        `📈 Tỷ lệ thắng: ${winRate}%\n` +
        `🔥 Streak hiện tại: ${stats.streak}\n` +
        `⚡ Streak tốt nhất: ${stats.bestStreak}\n` +
        `💰 Tổng cược: ${stats.totalBet.toLocaleString()} coins\n` +
        `💎 Tổng thắng: ${stats.totalWon.toLocaleString()} coins\n` +
        `📊 Lãi/Lỗ: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} coins\n\n` +
        `💡 Chơi ngay: fishing kbb kéo 1000`,
        threadId, type
      );
    }
    
    if (betAmount < 100 || betAmount > player.coins) {
      return api.sendMessage(
        `❌ Số coins không hợp lệ!\n` +
        `💰 Bạn có: ${player.coins.toLocaleString()} coins\n` +
        `💡 Cược tối thiểu: 100 coins`,
        threadId, type
      );
    }
    
    const normalizedChoice = choiceMap[playerChoice];
    const botChoices = ['kéo', 'búa', 'bao'];
    const botChoice = botChoices[Math.floor(Math.random() * 3)];
    
    const emojiMap = {
      'kéo': '✂️',
      'búa': '🔨', 
      'bao': '📄'
    };
    
    // Xác định kết quả
    let result = '';
    let winAmount = 0;
    
    if (normalizedChoice === botChoice) {
      result = 'HÒA';
      player.minigames.rps.draws++;
      player.minigames.rps.streak = 0;
    } else if (
      (normalizedChoice === 'kéo' && botChoice === 'bao') ||
      (normalizedChoice === 'búa' && botChoice === 'kéo') ||
      (normalizedChoice === 'bao' && botChoice === 'búa')
    ) {
      result = 'THẮNG';
      winAmount = betAmount;
      player.coins += winAmount;
      player.minigames.rps.wins++;
      player.minigames.rps.totalWon += winAmount;
      player.minigames.rps.streak++;
      
      if (player.minigames.rps.streak > player.minigames.rps.bestStreak) {
        player.minigames.rps.bestStreak = player.minigames.rps.streak;
      }
    } else {
      result = 'THUA';
      player.coins -= betAmount;
      player.minigames.rps.losses++;
      player.minigames.rps.streak = 0;
    }
    
    player.minigames.rps.totalBet += betAmount;
    savePlayerData();
    
    const resultEmoji = result === 'THẮNG' ? '🎉' : result === 'THUA' ? '💀' : '🤝';
    const resultColor = result === 'THẮNG' ? '🟢' : result === 'THUA' ? '🔴' : '🟡';
    
    return api.sendMessage(
      `${resultEmoji} **KÉO BÚA BAO - ${result}!**\n\n` +
      `👤 Bạn: ${emojiMap[normalizedChoice]} ${normalizedChoice.toUpperCase()}\n` +
      `🤖 Bot: ${emojiMap[botChoice]} ${botChoice.toUpperCase()}\n\n` +
      `${resultColor} **KẾT QUẢ: ${result}**\n` +
      `💰 Cược: ${betAmount.toLocaleString()} coins\n` +
      `${result === 'THẮNG' ? `💎 Thắng: +${winAmount.toLocaleString()} coins` : 
        result === 'THUA' ? `💸 Thua: -${betAmount.toLocaleString()} coins` : 
        `🤝 Hòa: không mất tiền`}\n` +
      `💳 Coins hiện tại: ${player.coins.toLocaleString()}\n` +
      `🔥 Streak: ${player.minigames.rps.streak}\n\n` +
      `🎮 Chơi lại: fishing kbb ${normalizedChoice} ${betAmount}`,
      threadId, type
    );
  }

  // Thật Hay Thách Game
  if (action === 'thật-hay-thách' || action === 'truth-or-dare' || action === 'tht') {
    const subAction = (args[1] || '').toLowerCase();
    
    // Database câu hỏi và thách thức
    const truthQuestions = [
      "Bạn đã từng nói dối về điều gì lớn nhất?",
      "Ai là người bạn thích nhất trong nhóm này?",
      "Bạn đã từng làm gì mà cảm thấy xấu hổ nhất?",
      "Bí mật lớn nhất mà bạn chưa từng kể ai?",
      "Bạn có crush ai không? Tên gì?",
      "Điều gì khiến bạn sợ nhất?",
      "Bạn đã từng khóc vì ai?",
      "Nếu chỉ còn 24h để sống, bạn sẽ làm gì?",
      "Điều hối hận nhất trong cuộc đời bạn?",
      "Bạn có từng ghen tị với ai không?",
      "Lần đầu tiên bạn yêu ai?",
      "Bạn nghĩ gì về người ngồi bên trái bạn?",
      "Điều bạn không bao giờ muốn bố mẹ biết?",
      "Bạn đã từng làm gì để gây ấn tượng với crush?",
      "Nếu có thể đọc được suy nghĩ của 1 người, bạn chọn ai?",
      "Bạn có từng nói xấu bạn thân sau lưng không?",
      "Điều gì khiến bạn cảm thấy tự ti nhất?",
      "Bạn đã từng ăn cắp gì chưa?",
      "Nếu được làm lại, bạn sẽ thay đổi điều gì?",
      "Ai là người bạn ghét nhất và tại sao?"
    ];
    
    const dareActions = [
      "Hát 1 bài hát yêu thích của bạn",
      "Nhảy 30 giây không có nhạc",
      "Gọi điện cho crush và nói 'Em yêu anh/chị'",
      "Đăng 1 status Facebook kỳ quặc",
      "Ăn 1 thìa muối",
      "Làm 20 cái hít đất",
      "Nói 'Tôi yêu bạn' với 5 người trong nhóm",
      "Chụp selfie xấu nhất có thể và đăng lên story",
      "Bắt chước tiếng kêu của 3 con vật",
      "Nhắn tin 'Anh/Em có thích tôi không?' cho 1 người bất kỳ",
      "Uống 1 ly nước mắm pha nước lọc",
      "Đi ra ngoài và hét 'Tôi là siêu nhân' 3 lần",
      "Để người khác vẽ lên mặt bạn",
      "Gọi điện cho mẹ và nói bạn đã có người yêu",
      "Nhảy gangnam style trong 1 phút",
      "Ăn 1 quả ớt cay",
      "Nói chuyện bằng giọng Donald Duck trong 5 phút",
      "Đăng ảnh thời thơ ấu xấu nhất lên Facebook",
      "Làm 50 cái squat",
      "Hôn má người ngồi bên cạnh"
    ];
    
    if (!subAction || subAction === 'help') {
      return api.sendMessage(
        '🎪 **THẬT HAY THÁCH GAME**\n\n' +
        '💡 Cách chơi:\n' +
        '• fishing tht thật - Câu hỏi thật\n' +
        '• fishing tht thách - Thử thách\n' +
        '• fishing tht random - Ngẫu nhiên\n' +
        '• fishing tht add thật <câu_hỏi> - Thêm câu hỏi\n' +
        '• fishing tht add thách <thử_thách> - Thêm thử thách\n\n' +
        '🎯 **LUẬT CHƠI:**\n' +
        '• Chọn THẬT: Trả lời câu hỏi thành thật\n' +
        '• Chọn THÁCH: Thực hiện thử thách\n' +
        '• Không được từ chối!\n\n' +
        '🎮 Bắt đầu ngay: fishing tht random',
        threadId, type
      );
    }
    
    // Khởi tạo custom database cho user
    if (!global.truthOrDareCustom) {
      global.truthOrDareCustom = {};
    }
    if (!global.truthOrDareCustom[senderId]) {
      global.truthOrDareCustom[senderId] = {
        truths: [],
        dares: []
      };
    }
    
    if (subAction === 'add') {
      const type = (args[2] || '').toLowerCase();
      const content = args.slice(3).join(' ');
      
      if (!type || !content || !['thật', 'thách', 'truth', 'dare'].includes(type)) {
        return api.sendMessage(
          '❌ Cách sử dụng:\n' +
          '• fishing tht add thật <câu_hỏi>\n' +
          '• fishing tht add thách <thử_thách>\n\n' +
          '💡 Ví dụ:\n' +
          '• fishing tht add thật Bạn có yêu ai không?\n' +
          '• fishing tht add thách Hát 1 bài hát',
          threadId, type
        );
      }
      
      const isTruth = ['thật', 'truth'].includes(type);
      const targetArray = isTruth ? global.truthOrDareCustom[senderId].truths : global.truthOrDareCustom[senderId].dares;
      
      targetArray.push(content);
      
      return api.sendMessage(
        `✅ **ĐÃ THÊM ${isTruth ? 'CÂU HỎI THẬT' : 'THỬ THÁCH'}!**\n\n` +
        `📝 Nội dung: "${content}"\n` +
        `📊 Tổng ${isTruth ? 'câu hỏi thật' : 'thử thách'}: ${targetArray.length}\n\n` +
        `💡 Sử dụng ngay: fishing tht ${isTruth ? 'thật' : 'thách'}`,
        threadId, type
      );
    }
    
    if (['thật', 'truth'].includes(subAction)) {
      // Kết hợp câu hỏi mặc định và custom
      const allTruths = [...truthQuestions, ...global.truthOrDareCustom[senderId].truths];
      const randomTruth = allTruths[Math.floor(Math.random() * allTruths.length)];
      
      return api.sendMessage(
        `💭 **THẬT - CÂU HỎI CHO ${userName.toUpperCase()}**\n\n` +
        `❓ ${randomTruth}\n\n` +
        `⚠️ **LƯU Ý:** Bạn phải trả lời thành thật!\n` +
        `🚫 Không được từ chối hoặc nói dối!\n\n` +
        `🎮 Tiếp tục: fishing tht random`,
        threadId, type
      );
    }
    
    if (['thách', 'dare'].includes(subAction)) {
      // Kết hợp thử thách mặc định và custom
      const allDares = [...dareActions, ...global.truthOrDareCustom[senderId].dares];
      const randomDare = allDares[Math.floor(Math.random() * allDares.length)];
      
      return api.sendMessage(
        `🎯 **THÁCH - THỬ THÁCH CHO ${userName.toUpperCase()}**\n\n` +
        `🎪 ${randomDare}\n\n` +
        `⚠️ **LƯU Ý:** Bạn phải thực hiện thử thách!\n` +
        `🚫 Không được từ chối!\n` +
        `📹 Hãy quay video làm bằng chứng!\n\n` +
        `🎮 Tiếp tục: fishing tht random`,
        threadId, type
      );
    }
    
    if (subAction === 'random') {
      const isTrue = Math.random() < 0.5;
      
      if (isTrue) {
        const allTruths = [...truthQuestions, ...global.truthOrDareCustom[senderId].truths];
        const randomTruth = allTruths[Math.floor(Math.random() * allTruths.length)];
        
        return api.sendMessage(
          `🎲 **RANDOM: THẬT** 💭\n\n` +
          `❓ ${randomTruth}\n\n` +
          `⚠️ Trả lời thành thật nhé ${userName}!\n\n` +
          `🎮 Tiếp tục: fishing tht random`,
          threadId, type
        );
      } else {
        const allDares = [...dareActions, ...global.truthOrDareCustom[senderId].dares];
        const randomDare = allDares[Math.floor(Math.random() * allDares.length)];
        
        return api.sendMessage(
          `🎲 **RANDOM: THÁCH** 🎯\n\n` +
          `🎪 ${randomDare}\n\n` +
          `⚠️ Thực hiện ngay đi ${userName}!\n\n` +
          `🎮 Tiếp tục: fishing tht random`,
          threadId, type
        );
      }
    }
    
    return api.sendMessage('❌ Lệnh không hợp lệ! Sử dụng "fishing tht help" để xem hướng dẫn.', threadId, type);
  }

  // Chiến Tranh Bài Game (War Card Game)
  if (action === 'chiến-tranh-bài' || action === 'war' || action === 'ctb') {
    const subAction = (args[1] || '').toLowerCase();
    const betAmount = parseInt(args[2]) || 1000;
    
    // Khởi tạo minigames data
    if (!player.minigames) {
      player.minigames = {};
    }
    if (!player.minigames.war) {
      player.minigames.war = { 
        wins: 0, 
        losses: 0, 
        wars: 0,
        totalBet: 0,
        totalWon: 0,
        biggestWin: 0
      };
    }
    
    // Card values và suits
    const suits = ['♠️', '♥️', '♦️', '♣️'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    
    function createCard() {
      const suit = suits[Math.floor(Math.random() * suits.length)];
      const rank = ranks[Math.floor(Math.random() * ranks.length)];
      return { suit, rank, value: values[rank] };
    }
    
    if (!subAction || subAction === 'help') {
      return api.sendMessage(
        '🃏 **CHIẾN TRANH BÀI GAME**\n\n' +
        '💡 Cách chơi: fishing war start <coins>\n' +
        '💡 Ví dụ: fishing war start 5000\n\n' +
        '🎯 **LUẬT CHƠI:**\n' +
        '• Mỗi người rút 1 lá bài\n' +
        '• Lá cao hơn thắng\n' +
        '• Nếu bằng nhau → CHIẾN TRANH!\n' +
        '• Chiến tranh: rút thêm 3 lá úp + 1 lá ngửa\n' +
        '• Lá ngửa cao hơn thắng tất cả\n\n' +
        '📊 Thứ tự bài: 2 < 3 < ... < J < Q < K < A\n' +
        '📈 Xem thống kê: fishing war stats',
        threadId, type
      );
    }
    
    if (subAction === 'stats') {
      const stats = player.minigames.war;
      const totalGames = stats.wins + stats.losses;
      const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : 0;
      const profit = stats.totalWon - stats.totalBet;
      
      return api.sendMessage(
        `📊 **CHIẾN TRANH BÀI STATS - ${userName}**\n\n` +
        `🏆 Thắng: ${stats.wins}\n` +
        `💀 Thua: ${stats.losses}\n` +
        `⚔️ Số lần chiến tranh: ${stats.wars}\n` +
        `📈 Tỷ lệ thắng: ${winRate}%\n` +
        `💰 Tổng cược: ${stats.totalBet.toLocaleString()} coins\n` +
        `💎 Tổng thắng: ${stats.totalWon.toLocaleString()} coins\n` +
        `🎯 Thắng lớn nhất: ${stats.biggestWin.toLocaleString()} coins\n` +
        `📊 Lãi/Lỗ: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} coins\n\n` +
        `💡 Chơi ngay: fishing war start 5000`,
        threadId, type
      );
    }
    
    if (subAction === 'start') {
      if (betAmount < 1000 || betAmount > player.coins) {
        return api.sendMessage(
          `❌ Số coins không hợp lệ!\n` +
          `💰 Bạn có: ${player.coins.toLocaleString()} coins\n` +
          `💡 Cược tối thiểu: 1000 coins`,
          threadId, type
        );
      }
      
      let playerCard = createCard();
      let botCard = createCard();
      let totalBet = betAmount;
      let warCount = 0;
      let gameLog = [];
      
      gameLog.push(`🎴 **VÒNG 1:**`);
      gameLog.push(`👤 Bạn: ${playerCard.suit}${playerCard.rank} (${playerCard.value})`);
      gameLog.push(`🤖 Bot: ${botCard.suit}${botCard.rank} (${botCard.value})`);
      
      // Xử lý chiến tranh nếu bằng nhau
      while (playerCard.value === botCard.value) {
        warCount++;
        totalBet += betAmount; // Tăng gấp đôi cược mỗi lần chiến tranh
        
        if (totalBet > player.coins) {
          return api.sendMessage(
            `❌ Không đủ coins cho chiến tranh!\n` +
            `💰 Cần: ${totalBet.toLocaleString()} coins\n` +
            `💳 Có: ${player.coins.toLocaleString()} coins`,
            threadId, type
          );
        }
        
        gameLog.push(`\n⚔️ **CHIẾN TRANH ${warCount}!**`);
        gameLog.push(`💥 Bài bằng nhau! Rút thêm 4 lá...`);
        gameLog.push(`🎯 Cược tăng lên: ${totalBet.toLocaleString()} coins`);
        
        // Rút 3 lá úp (không hiển thị) + 1 lá ngửa
        playerCard = createCard();
        botCard = createCard();
        
        gameLog.push(`👤 Bạn: ${playerCard.suit}${playerCard.rank} (${playerCard.value})`);
        gameLog.push(`🤖 Bot: ${botCard.suit}${botCard.rank} (${botCard.value})`);
      }
      
      // Xác định kết quả
      let result = '';
      let winAmount = 0;
      
      if (playerCard.value > botCard.value) {
        result = 'THẮNG';
        winAmount = totalBet;
        player.coins += winAmount;
        player.minigames.war.wins++;
        player.minigames.war.totalWon += winAmount;
        
        if (winAmount > player.minigames.war.biggestWin) {
          player.minigames.war.biggestWin = winAmount;
        }
      } else {
        result = 'THUA';
        player.coins -= totalBet;
        player.minigames.war.losses++;
      }
      
      player.minigames.war.totalBet += totalBet;
      player.minigames.war.wars += warCount;
      savePlayerData();
      
      const resultEmoji = result === 'THẮNG' ? '🎉' : '💀';
      const resultColor = result === 'THẮNG' ? '🟢' : '🔴';
      
      return api.sendMessage(
        `🃏 **CHIẾN TRANH BÀI**\n\n` +
        `${gameLog.join('\n')}\n\n` +
        `${resultEmoji} ${resultColor} **KẾT QUẢ: ${result}!**\n` +
        `💰 Tổng cược: ${totalBet.toLocaleString()} coins\n` +
        `${result === 'THẮNG' ? `💎 Thắng: +${winAmount.toLocaleString()} coins` : 
          `💸 Thua: -${totalBet.toLocaleString()} coins`}\n` +
        `💳 Coins hiện tại: ${player.coins.toLocaleString()}\n` +
        `⚔️ Số lần chiến tranh: ${warCount}\n\n` +
        `🎮 Chơi lại: fishing war start ${betAmount}`,
        threadId, type
      );
    }
    
    return api.sendMessage('❌ Lệnh không hợp lệ! Sử dụng "fishing war help" để xem hướng dẫn.', threadId, type);
  }

  // Đấu Tay Đôi Game (PvP)
  if (action === 'đấu-tay-đôi' || action === 'pvp' || action === 'duel') {
    const subAction = (args[1] || '').toLowerCase();
    
    // Initialize PvP system
    if (!global.pvpSystem) {
      global.pvpSystem = {
        challenges: new Map(), // challengerId -> { targetId, amount, timestamp }
        activeBattles: new Map() // battleId -> battle data
      };
    }
    
    // Khởi tạo minigames data
    if (!player.minigames) {
      player.minigames = {};
    }
    if (!player.minigames.pvp) {
      player.minigames.pvp = { 
        wins: 0, 
        losses: 0, 
        draws: 0,
        totalBet: 0,
        totalWon: 0,
        streak: 0,
        bestStreak: 0,
        knockouts: 0,
        perfectWins: 0
      };
    }
    
    if (!subAction || subAction === 'help') {
      return api.sendMessage(
        '⚔️ **ĐẤU TAY ĐÔI GAME**\n\n' +
        '💡 Cách chơi: fishing pvp challenge @user <coins>\n' +
        '💡 Chấp nhận: fishing pvp accept\n' +
        '💡 Từ chối: fishing pvp decline\n\n' +
        '🎯 **LUẬT CHƠI:**\n' +
        '• Mỗi người có 100 HP, 20 ATK, 10 DEF\n' +
        '• Lượt lượt tấn công cho đến khi hết HP\n' +
        '• Damage = ATK + random(1-10) - DEF\n' +
        '• Critical hit 10% (x2 damage)\n' +
        '• Dodge 15% (tránh hoàn toàn)\n\n' +
        '💰 **THƯỞNG:**\n' +
        '• Thắng: +coins đặt cược\n' +
        '• Knockout bonus: +20%\n' +
        '• Perfect win: +50%\n\n' +
        '📊 Xem thống kê: fishing pvp stats\n' +
        '👥 Xem thách đấu: fishing pvp list',
        threadId, type
      );
    }
    
    if (subAction === 'stats') {
      const stats = player.minigames.pvp;
      const totalGames = stats.wins + stats.losses + stats.draws;
      const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : 0;
      const profit = stats.totalWon - stats.totalBet;
      
      return api.sendMessage(
        `📊 **PVP STATS - ${userName}**\n\n` +
        `🏆 Thắng: ${stats.wins}\n` +
        `💀 Thua: ${stats.losses}\n` +
        `🤝 Hòa: ${stats.draws}\n` +
        `📈 Tỷ lệ thắng: ${winRate}%\n` +
        `🔥 Streak hiện tại: ${stats.streak}\n` +
        `⚡ Streak tốt nhất: ${stats.bestStreak}\n` +
        `💰 Tổng cược: ${stats.totalBet.toLocaleString()} coins\n` +
        `💎 Tổng thắng: ${stats.totalWon.toLocaleString()} coins\n` +
        `📊 Lãi/Lỗ: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} coins\n\n` +
        `🎯 **Thành tích đặc biệt:**\n` +
        `• Knockouts: ${stats.knockouts}\n` +
        `• Perfect wins: ${stats.perfectWins}\n\n` +
        `💡 Thách đấu: fishing pvp challenge @user 10000`,
        threadId, type
      );
    }
    
    if (subAction === 'challenge') {
      const mentionedUsers = Object.keys(event.mentions || {});
      const targetUserId = mentionedUsers[0] || args[2];
      const betAmount = parseInt(args[3]) || 10000;
      
      if (!targetUserId) {
        return api.sendMessage(
          '❌ Vui lòng mention người chơi hoặc nhập User ID!\n' +
          '💡 Ví dụ: fishing pvp challenge @user 15000',
          threadId, type
        );
      }
      
      if (targetUserId === senderId) {
        return api.sendMessage('❌ Không thể thách đấu chính mình!', threadId, type);
      }
      
      if (betAmount < 5000 || betAmount > player.coins) {
        return api.sendMessage(
          `❌ Số coins không hợp lệ!\n` +
          `💰 Bạn có: ${player.coins.toLocaleString()} coins\n` +
          `💡 Cược tối thiểu: 5000 coins`,
          threadId, type
        );
      }
      
      // Check if target has enough coins
      if (!playerData.has(targetUserId)) {
        return api.sendMessage('❌ Người chơi này chưa có dữ liệu game!', threadId, type);
      }
      
      const targetPlayer = playerData.get(targetUserId);
      if (targetPlayer.coins < betAmount) {
        return api.sendMessage(
          `❌ Người chơi này không đủ coins!\n` +
          `💰 Họ có: ${targetPlayer.coins.toLocaleString()} coins\n` +
          `💡 Cần: ${betAmount.toLocaleString()} coins`,
          threadId, type
        );
      }
      
      // Check if already challenged
      if (global.pvpSystem.challenges.has(senderId)) {
        return api.sendMessage('❌ Bạn đã gửi thách đấu rồi! Hãy chờ phản hồi.', threadId, type);
      }
      
      // Create challenge
      global.pvpSystem.challenges.set(senderId, {
        targetId: targetUserId,
        amount: betAmount,
        timestamp: Date.now()
      });
      
      let targetName = 'Unknown User';
      try {
        const targetInfo = await api.getUserInfo(targetUserId);
        targetName = targetInfo?.changed_profiles?.[targetUserId]?.displayName || 'Unknown User';
      } catch {}
      
      return api.sendMessage(
        `⚔️ **THÁCH ĐẤU ĐÃ GỬI!**\n\n` +
        `👤 ${userName} thách đấu ${targetName}\n` +
        `💰 Cược: ${betAmount.toLocaleString()} coins\n\n` +
        `⏰ Chờ phản hồi...\n` +
        `💡 ${targetName} có thể:\n` +
        `• fishing pvp accept - Chấp nhận\n` +
        `• fishing pvp decline - Từ chối`,
        threadId, type
      );
    }
    
    if (subAction === 'accept') {
      // Find challenge where current user is target
      let challengerId = null;
      let challenge = null;
      
      for (const [cId, c] of global.pvpSystem.challenges.entries()) {
        if (c.targetId === senderId) {
          challengerId = cId;
          challenge = c;
          break;
        }
      }
      
      if (!challenge) {
        return api.sendMessage('❌ Không có thách đấu nào dành cho bạn!', threadId, type);
      }
      
      // Check coins again
      if (player.coins < challenge.amount) {
        return api.sendMessage(
          `❌ Bạn không đủ coins!\n` +
          `💰 Cần: ${challenge.amount.toLocaleString()} coins\n` +
          `💳 Có: ${player.coins.toLocaleString()} coins`,
          threadId, type
        );
      }
      
      const challenger = playerData.get(challengerId);
      if (challenger.coins < challenge.amount) {
        global.pvpSystem.challenges.delete(challengerId);
        return api.sendMessage('❌ Người thách đấu không đủ coins! Thách đấu đã bị hủy.', threadId, type);
      }
      
      // Remove challenge and start battle
      global.pvpSystem.challenges.delete(challengerId);
      
      // Battle simulation
      const fighter1 = {
        id: challengerId,
        name: 'Challenger',
        hp: 100,
        maxHp: 100,
        atk: 20,
        def: 10
      };
      
      const fighter2 = {
        id: senderId,
        name: userName,
        hp: 100,
        maxHp: 100,
        atk: 20,
        def: 10
      };
      
      try {
        const challengerInfo = await api.getUserInfo(challengerId);
        fighter1.name = challengerInfo?.changed_profiles?.[challengerId]?.displayName || 'Challenger';
      } catch {}
      
      let battleLog = [];
      let turn = 1;
      let attacker = Math.random() < 0.5 ? fighter1 : fighter2;
      let defender = attacker === fighter1 ? fighter2 : fighter1;
      
      battleLog.push(`⚔️ **TRẬN ĐẤU BẮT ĐẦU!**`);
      battleLog.push(`👤 ${fighter1.name} vs ${fighter2.name}`);
      battleLog.push(`💰 Cược: ${challenge.amount.toLocaleString()} coins\n`);
      
      while (fighter1.hp > 0 && fighter2.hp > 0 && turn <= 20) {
        // Calculate damage
        let baseDamage = attacker.atk + Math.floor(Math.random() * 10) + 1;
        let finalDamage = Math.max(1, baseDamage - defender.def);
        
        // Check for critical hit (10%)
        const isCritical = Math.random() < 0.1;
        if (isCritical) {
          finalDamage *= 2;
        }
        
        // Check for dodge (15%)
        const isDodge = Math.random() < 0.15;
        if (isDodge) {
          finalDamage = 0;
        }
        
        // Apply damage
        defender.hp = Math.max(0, defender.hp - finalDamage);
        
        // Log turn
        let turnLog = `🔄 **Turn ${turn}:** ${attacker.name}`;
        if (isDodge) {
          turnLog += ` tấn công nhưng ${defender.name} né tránh!`;
        } else if (isCritical) {
          turnLog += ` CRITICAL HIT! ${finalDamage} damage!`;
        } else {
          turnLog += ` gây ${finalDamage} damage`;
        }
        turnLog += `\n   ${defender.name}: ${defender.hp}/${defender.maxHp} HP`;
        
        battleLog.push(turnLog);
        
        // Switch turns
        [attacker, defender] = [defender, attacker];
        turn++;
      }
      
      // Determine winner
      let winner, loser, winnerStats, loserStats;
      if (fighter1.hp <= 0) {
        winner = fighter2;
        loser = fighter1;
        winnerStats = player.minigames.pvp;
        loserStats = challenger.minigames?.pvp;
      } else if (fighter2.hp <= 0) {
        winner = fighter1;
        loser = fighter2;
        winnerStats = challenger.minigames?.pvp;
        loserStats = player.minigames.pvp;
      } else {
        // Draw (timeout)
        battleLog.push(`\n🤝 **HÒA!** Cả hai đều kiệt sức!`);
        
        // Update draw stats
        if (!challenger.minigames) challenger.minigames = {};
        if (!challenger.minigames.pvp) challenger.minigames.pvp = { wins: 0, losses: 0, draws: 0, totalBet: 0, totalWon: 0, streak: 0, bestStreak: 0, knockouts: 0, perfectWins: 0 };
        
        challenger.minigames.pvp.draws++;
        player.minigames.pvp.draws++;
        
        battleLog.push(`💰 Hoàn tiền cho cả hai!`);
        
        savePlayerData();
        return api.sendMessage(battleLog.join('\n'), threadId, type);
      }
      
      // Initialize loser stats if needed
      if (!loserStats) {
        if (loser.id === challengerId) {
          if (!challenger.minigames) challenger.minigames = {};
          challenger.minigames.pvp = { wins: 0, losses: 0, draws: 0, totalBet: 0, totalWon: 0, streak: 0, bestStreak: 0, knockouts: 0, perfectWins: 0 };
          loserStats = challenger.minigames.pvp;
        }
      }
      
      battleLog.push(`\n🏆 **${winner.name} THẮNG!**`);
      
      // Calculate bonuses
      let winAmount = challenge.amount;
      let bonusText = [];
      
      // Knockout bonus (enemy has 0 HP)
      if (loser.hp === 0) {
        winAmount = Math.floor(winAmount * 1.2);
        bonusText.push('💀 Knockout bonus +20%');
        winnerStats.knockouts++;
      }
      
      // Perfect win bonus (winner full HP)
      if (winner.hp === winner.maxHp) {
        winAmount = Math.floor(winAmount * 1.5);
        bonusText.push('✨ Perfect win bonus +50%');
        winnerStats.perfectWins++;
      }
      
      // Update coins and stats
      if (winner.id === challengerId) {
        challenger.coins += winAmount;
        player.coins -= challenge.amount;
        winnerStats.wins++;
        winnerStats.streak++;
        if (winnerStats.streak > winnerStats.bestStreak) {
          winnerStats.bestStreak = winnerStats.streak;
        }
        loserStats.losses++;
        loserStats.streak = 0;
      } else {
        player.coins += winAmount;
        challenger.coins -= challenge.amount;
        winnerStats.wins++;
        winnerStats.streak++;
        if (winnerStats.streak > winnerStats.bestStreak) {
          winnerStats.bestStreak = winnerStats.streak;
        }
        loserStats.losses++;
        loserStats.streak = 0;
      }
      
      winnerStats.totalBet += challenge.amount;
      winnerStats.totalWon += winAmount;
      loserStats.totalBet += challenge.amount;
      
      battleLog.push(`💰 Thắng: +${winAmount.toLocaleString()} coins`);
      if (bonusText.length > 0) {
        battleLog.push(bonusText.join('\n'));
      }
      
      savePlayerData();
      return api.sendMessage(battleLog.join('\n'), threadId, type);
    }
    
    if (subAction === 'decline') {
      // Find challenge where current user is target
      let challengerId = null;
      
      for (const [cId, c] of global.pvpSystem.challenges.entries()) {
        if (c.targetId === senderId) {
          challengerId = cId;
          break;
        }
      }
      
      if (!challengerId) {
        return api.sendMessage('❌ Không có thách đấu nào dành cho bạn!', threadId, type);
      }
      
      global.pvpSystem.challenges.delete(challengerId);
      
      let challengerName = 'Unknown User';
      try {
        const challengerInfo = await api.getUserInfo(challengerId);
        challengerName = challengerInfo?.changed_profiles?.[challengerId]?.displayName || 'Unknown User';
      } catch {}
      
      return api.sendMessage(
        `❌ **THÁCH ĐẤU BỊ TỪ CHỐI!**\n\n` +
        `${userName} đã từ chối thách đấu của ${challengerName}`,
        threadId, type
      );
    }
    
    return api.sendMessage('❌ Lệnh không hợp lệ! Sử dụng "fishing pvp help" để xem hướng dẫn.', threadId, type);
  }

  // Xì Dách Game (Blackjack)
  if (action === 'xì-dách' || action === 'blackjack' || action === 'bj') {
    const subAction = (args[1] || '').toLowerCase();
    const betAmount = parseInt(args[2]) || 5000;
    
    // Khởi tạo minigames data
    if (!player.minigames) {
      player.minigames = {};
    }
    if (!player.minigames.blackjack) {
      player.minigames.blackjack = { 
        wins: 0, 
        losses: 0, 
        pushes: 0,
        totalBet: 0,
        totalWon: 0,
        blackjacks: 0,
        busts: 0,
        doubleDowns: 0,
        biggestWin: 0
      };
    }
    
    // Card system
    const suits = ['♠️', '♥️', '♦️', '♣️'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    function createDeck() {
      const deck = [];
      for (const suit of suits) {
        for (const rank of ranks) {
          deck.push({ suit, rank });
        }
      }
      
      // Shuffle deck
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      
      return deck;
    }
    
    function getCardValue(card, currentTotal = 0) {
      if (['J', 'Q', 'K'].includes(card.rank)) return 10;
      if (card.rank === 'A') {
        // Ace is 11 if it doesn't bust, otherwise 1
        return (currentTotal + 11 <= 21) ? 11 : 1;
      }
      return parseInt(card.rank);
    }
    
    function calculateHandValue(hand) {
      let total = 0;
      let aces = 0;
      
      // Count non-aces first
      for (const card of hand) {
        if (card.rank === 'A') {
          aces++;
        } else if (['J', 'Q', 'K'].includes(card.rank)) {
          total += 10;
        } else {
          total += parseInt(card.rank);
        }
      }
      
      // Add aces (11 if possible, otherwise 1)
      for (let i = 0; i < aces; i++) {
        if (total + 11 <= 21) {
          total += 11;
        } else {
          total += 1;
        }
      }
      
      return total;
    }
    
    function formatCard(card) {
      return `${card.rank}${card.suit}`;
    }
    
    function formatHand(hand) {
      return hand.map(formatCard).join(' ');
    }
    
    function isBlackjack(hand) {
      return hand.length === 2 && calculateHandValue(hand) === 21;
    }
    
    if (!subAction || subAction === 'help') {
      return api.sendMessage(
        '🃏 **XÌ DÁCH GAME (BLACKJACK)**\n\n' +
        '💡 Cách chơi: fishing bj start <coins>\n' +
        '💡 Ví dụ: fishing bj start 10000\n\n' +
        '🎯 **LUẬT CHƠI:**\n' +
        '• Mục tiêu: Đạt 21 điểm hoặc gần nhất\n' +
        '• A = 1 hoặc 11, J/Q/K = 10\n' +
        '• Blackjack = A + 10/J/Q/K (21 với 2 lá)\n' +
        '• Bust = Vượt quá 21 điểm\n' +
        '• Dealer rút bài đến khi ≥17\n\n' +
        '💰 **PAYOUT:**\n' +
        '• Blackjack: x2.5 (3:2)\n' +
        '• Thắng thường: x2 (1:1)\n' +
        '• Push (hòa): Hoàn tiền\n' +
        '• Bust: Mất tiền\n\n' +
        '📊 Xem thống kê: fishing bj stats',
        threadId, type
      );
    }
    
    if (subAction === 'stats') {
      const stats = player.minigames.blackjack;
      const totalGames = stats.wins + stats.losses + stats.pushes;
      const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : 0;
      const profit = stats.totalWon - stats.totalBet;
      
      return api.sendMessage(
        `📊 **BLACKJACK STATS - ${userName}**\n\n` +
        `🏆 Thắng: ${stats.wins}\n` +
        `💀 Thua: ${stats.losses}\n` +
        `🤝 Push: ${stats.pushes}\n` +
        `📈 Tỷ lệ thắng: ${winRate}%\n` +
        `💰 Tổng cược: ${stats.totalBet.toLocaleString()} coins\n` +
        `💎 Tổng thắng: ${stats.totalWon.toLocaleString()} coins\n` +
        `🎯 Thắng lớn nhất: ${stats.biggestWin.toLocaleString()} coins\n` +
        `📊 Lãi/Lỗ: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} coins\n\n` +
        `🎯 **Thành tích đặc biệt:**\n` +
        `• Blackjacks: ${stats.blackjacks}\n` +
        `• Busts: ${stats.busts}\n` +
        `• Double downs: ${stats.doubleDowns}\n\n` +
        `💡 Chơi ngay: fishing bj start 10000`,
        threadId, type
      );
    }
    
    if (subAction === 'start') {
      if (betAmount < 2000 || betAmount > player.coins) {
        return api.sendMessage(
          `❌ Số coins không hợp lệ!\n` +
          `💰 Bạn có: ${player.coins.toLocaleString()} coins\n` +
          `💡 Cược tối thiểu: 2000 coins`,
          threadId, type
        );
      }
      
      const deck = createDeck();
      
      // Initial deal
      const playerHand = [deck.pop(), deck.pop()];
      const dealerHand = [deck.pop(), deck.pop()];
      
      let playerValue = calculateHandValue(playerHand);
      let dealerValue = calculateHandValue(dealerHand);
      
      let gameLog = [];
      gameLog.push('🃏 **BLACKJACK GAME**\n');
      gameLog.push(`💰 Cược: ${betAmount.toLocaleString()} coins\n`);
      gameLog.push(`👤 **Your hand:** ${formatHand(playerHand)} = ${playerValue}`);
      gameLog.push(`🏦 **Dealer:** ${formatCard(dealerHand[0])} ?? = ??\n`);
      
      // Check for blackjacks
      const playerBlackjack = isBlackjack(playerHand);
      const dealerBlackjack = isBlackjack(dealerHand);
      
      let result = '';
      let winAmount = 0;
      const stats = player.minigames.blackjack;
      
      if (playerBlackjack && dealerBlackjack) {
        // Both blackjack = push
        result = 'PUSH';
        winAmount = betAmount; // Return bet
        gameLog.push('🎯 **Cả hai đều BLACKJACK! PUSH!**');
        stats.pushes++;
      } else if (playerBlackjack) {
        // Player blackjack wins
        result = 'BLACKJACK';
        winAmount = Math.floor(betAmount * 2.5); // 3:2 payout
        gameLog.push('🎉 **BLACKJACK! Bạn thắng!**');
        stats.wins++;
        stats.blackjacks++;
      } else if (dealerBlackjack) {
        // Dealer blackjack wins
        result = 'DEALER_BLACKJACK';
        winAmount = 0;
        gameLog.push('💀 **Dealer có BLACKJACK! Bạn thua!**');
        stats.losses++;
      } else {
        // Normal game - player can hit/stand
        gameLog.push('🎯 **Bạn muốn:**');
        gameLog.push('• fishing bj hit - Rút thêm bài');
        gameLog.push('• fishing bj stand - Dừng lại');
        
        // Store game state for hit/stand actions
        if (!global.blackjackGames) global.blackjackGames = new Map();
        global.blackjackGames.set(senderId, {
          deck,
          playerHand,
          dealerHand,
          betAmount,
          timestamp: Date.now()
        });
        
        return api.sendMessage(gameLog.join('\n'), threadId, type);
      }
      
      // Game ended immediately
      gameLog.push(`🏦 **Dealer:** ${formatHand(dealerHand)} = ${dealerValue}\n`);
      
      // Update stats and coins
      stats.totalBet += betAmount;
      if (result === 'PUSH') {
        // No change in coins for push
        stats.totalWon += betAmount;
        gameLog.push(`🤝 **PUSH!** Hoàn tiền: ${betAmount.toLocaleString()} coins`);
      } else if (winAmount > 0) {
        const profit = winAmount - betAmount;
        player.coins += profit;
        stats.totalWon += winAmount;
        
        if (profit > stats.biggestWin) {
          stats.biggestWin = profit;
        }
        
        gameLog.push(`🎉 **THẮNG!** +${profit.toLocaleString()} coins`);
        if (result === 'BLACKJACK') {
          gameLog.push('💎 **BLACKJACK BONUS x2.5!**');
        }
      } else {
        player.coins -= betAmount;
        gameLog.push(`💥 **THUA!** -${betAmount.toLocaleString()} coins`);
      }
      
      gameLog.push(`💳 Coins hiện tại: ${player.coins.toLocaleString()}`);
      gameLog.push(`\n🎮 Chơi lại: fishing bj start ${betAmount}`);
      
      savePlayerData();
      return api.sendMessage(gameLog.join('\n'), threadId, type);
    }
    
    if (subAction === 'hit') {
      if (!global.blackjackGames || !global.blackjackGames.has(senderId)) {
        return api.sendMessage('❌ Không có game nào đang chơi! Sử dụng "fishing bj start" để bắt đầu.', threadId, type);
      }
      
      const game = global.blackjackGames.get(senderId);
      
      // Check timeout (5 minutes)
      if (Date.now() - game.timestamp > 300000) {
        global.blackjackGames.delete(senderId);
        return api.sendMessage('⏰ Game đã hết thời gian! Sử dụng "fishing bj start" để chơi lại.', threadId, type);
      }
      
      // Player hits
      const newCard = game.deck.pop();
      game.playerHand.push(newCard);
      const playerValue = calculateHandValue(game.playerHand);
      
      let gameLog = [];
      gameLog.push('🃏 **BLACKJACK - HIT**\n');
      gameLog.push(`🎴 Bạn rút: ${formatCard(newCard)}`);
      gameLog.push(`👤 **Your hand:** ${formatHand(game.playerHand)} = ${playerValue}\n`);
      
      if (playerValue > 21) {
        // Player busts
        global.blackjackGames.delete(senderId);
        
        gameLog.push('💥 **BUST! Bạn vượt quá 21!**');
        gameLog.push(`💀 **THUA!** -${game.betAmount.toLocaleString()} coins`);
        
        // Update stats
        const stats = player.minigames.blackjack;
        stats.losses++;
        stats.busts++;
        stats.totalBet += game.betAmount;
        player.coins -= game.betAmount;
        
        gameLog.push(`💳 Coins hiện tại: ${player.coins.toLocaleString()}`);
        gameLog.push(`\n🎮 Chơi lại: fishing bj start ${game.betAmount}`);
        
        savePlayerData();
        return api.sendMessage(gameLog.join('\n'), threadId, type);
      } else if (playerValue === 21) {
        // Player has 21, auto-stand
        gameLog.push('🎯 **21! Tự động STAND**\n');
        
        // Continue to dealer play
        return this.run({ api, event: { ...event, data: { ...event.data } }, args: ['bj', 'stand'] });
      } else {
        // Player can continue
        gameLog.push('🎯 **Bạn muốn:**');
        gameLog.push('• fishing bj hit - Rút thêm bài');
        gameLog.push('• fishing bj stand - Dừng lại');
        
        return api.sendMessage(gameLog.join('\n'), threadId, type);
      }
    }
    
    if (subAction === 'stand') {
      if (!global.blackjackGames || !global.blackjackGames.has(senderId)) {
        return api.sendMessage('❌ Không có game nào đang chơi! Sử dụng "fishing bj start" để bắt đầu.', threadId, type);
      }
      
      const game = global.blackjackGames.get(senderId);
      global.blackjackGames.delete(senderId);
      
      const playerValue = calculateHandValue(game.playerHand);
      
      // Dealer plays
      let dealerValue = calculateHandValue(game.dealerHand);
      
      let gameLog = [];
      gameLog.push('🃏 **BLACKJACK - STAND**\n');
      gameLog.push(`👤 **Your hand:** ${formatHand(game.playerHand)} = ${playerValue}`);
      gameLog.push(`🏦 **Dealer reveals:** ${formatHand(game.dealerHand)} = ${dealerValue}\n`);
      
      // Dealer hits until 17 or higher
      while (dealerValue < 17) {
        const newCard = game.deck.pop();
        game.dealerHand.push(newCard);
        dealerValue = calculateHandValue(game.dealerHand);
        gameLog.push(`🏦 Dealer rút: ${formatCard(newCard)} → ${formatHand(game.dealerHand)} = ${dealerValue}`);
      }
      
      gameLog.push('');
      
      // Determine winner
      let result = '';
      let winAmount = 0;
      const stats = player.minigames.blackjack;
      
      if (dealerValue > 21) {
        // Dealer busts
        result = 'DEALER_BUST';
        winAmount = game.betAmount * 2;
        gameLog.push('💥 **Dealer BUST! Bạn thắng!**');
        stats.wins++;
      } else if (playerValue > dealerValue) {
        // Player wins
        result = 'WIN';
        winAmount = game.betAmount * 2;
        gameLog.push('🎉 **Bạn thắng!**');
        stats.wins++;
      } else if (dealerValue > playerValue) {
        // Dealer wins
        result = 'LOSE';
        winAmount = 0;
        gameLog.push('💀 **Dealer thắng!**');
        stats.losses++;
      } else {
        // Push
        result = 'PUSH';
        winAmount = game.betAmount;
        gameLog.push('🤝 **PUSH! Hòa!**');
        stats.pushes++;
      }
      
      // Update stats and coins
      stats.totalBet += game.betAmount;
      
      if (result === 'PUSH') {
        stats.totalWon += game.betAmount;
        gameLog.push(`🤝 **Hoàn tiền:** ${game.betAmount.toLocaleString()} coins`);
      } else if (winAmount > 0) {
        const profit = winAmount - game.betAmount;
        player.coins += profit;
        stats.totalWon += winAmount;
        
        if (profit > stats.biggestWin) {
          stats.biggestWin = profit;
        }
        
        gameLog.push(`🎉 **Thắng:** +${profit.toLocaleString()} coins`);
      } else {
        player.coins -= game.betAmount;
        gameLog.push(`💥 **Thua:** -${game.betAmount.toLocaleString()} coins`);
      }
      
      gameLog.push(`💳 Coins hiện tại: ${player.coins.toLocaleString()}`);
      gameLog.push(`\n🎮 Chơi lại: fishing bj start ${game.betAmount}`);
      
      savePlayerData();
      return api.sendMessage(gameLog.join('\n'), threadId, type);
    }
    
    return api.sendMessage('❌ Lệnh không hợp lệ! Sử dụng "fishing bj help" để xem hướng dẫn.', threadId, type);
  }

  // Đấu Trường Game (Arena)
  if (action === 'đấu-trường' || action === 'arena' || action === 'dt') {
    const subAction = (args[1] || '').toLowerCase();
    
    // Khởi tạo minigames data
    if (!player.minigames) {
      player.minigames = {};
    }
    if (!player.minigames.arena) {
      player.minigames.arena = { 
        wins: 0, 
        losses: 0, 
        level: 1,
        exp: 0,
        totalBet: 0,
        totalWon: 0,
        streak: 0,
        bestStreak: 0,
        bossKills: 0,
        perfectWins: 0
      };
    }
    
    // Arena enemies by level
    const enemies = {
      1: [
        { name: 'Goblin Yếu', hp: 50, atk: 15, def: 5, reward: 500, exp: 10 },
        { name: 'Slime Xanh', hp: 40, atk: 12, def: 3, reward: 400, exp: 8 },
        { name: 'Skeleton Tân Binh', hp: 60, atk: 18, def: 7, reward: 600, exp: 12 }
      ],
      2: [
        { name: 'Orc Chiến Binh', hp: 80, atk: 25, def: 10, reward: 1000, exp: 20 },
        { name: 'Wolf Alpha', hp: 70, atk: 30, def: 8, reward: 900, exp: 18 },
        { name: 'Dark Mage', hp: 60, atk: 35, def: 5, reward: 1100, exp: 22 }
      ],
      3: [
        { name: 'Troll Khổng Lồ', hp: 120, atk: 40, def: 15, reward: 2000, exp: 40 },
        { name: 'Dragon Nhỏ', hp: 100, atk: 45, def: 12, reward: 2200, exp: 45 },
        { name: 'Lich Sorcerer', hp: 90, atk: 50, def: 10, reward: 2500, exp: 50 }
      ],
      4: [
        { name: 'Demon Lord', hp: 200, atk: 60, def: 20, reward: 5000, exp: 100 },
        { name: 'Ancient Dragon', hp: 180, atk: 70, def: 25, reward: 5500, exp: 110 },
        { name: 'Shadow King', hp: 160, atk: 80, def: 15, reward: 6000, exp: 120 }
      ]
    };
    
    function getPlayerStats(arenaData) {
      const baseHp = 100;
      const baseAtk = 20;
      const baseDef = 10;
      
      const level = arenaData.level;
      const hp = baseHp + (level - 1) * 20;
      const atk = baseAtk + (level - 1) * 5;
      const def = baseDef + (level - 1) * 3;
      
      return { hp, maxHp: hp, atk, def, level };
    }
    
    function getExpNeeded(level) {
      return level * 100;
    }
    
    if (!subAction || subAction === 'help') {
      return api.sendMessage(
        '⚔️ **ĐẤU TRƯỜNG GAME**\n\n' +
        '💡 Cách chơi: fishing arena fight\n' +
        '💡 Xem thông tin: fishing arena info\n\n' +
        '🎯 **LUẬT CHƠI:**\n' +
        '• Đánh bại quái vật để nhận coins và EXP\n' +
        '• Level up để mở khóa quái mạnh hơn\n' +
        '• Mỗi level tăng HP, ATK, DEF\n' +
        '• Critical hit 15% (x2 damage)\n' +
        '• Dodge 10% (tránh hoàn toàn)\n\n' +
        '💰 **THƯỞNG:**\n' +
        '• Coins từ quái vật\n' +
        '• EXP để level up\n' +
        '• Boss kill bonus\n' +
        '• Perfect win bonus\n\n' +
        '📊 Xem thống kê: fishing arena stats',
        threadId, type
      );
    }
    
    if (subAction === 'info') {
      const stats = player.minigames.arena;
      const playerStats = getPlayerStats(stats);
      const expNeeded = getExpNeeded(stats.level);
      const expProgress = (stats.exp / expNeeded * 100).toFixed(1);
      
      return api.sendMessage(
        `⚔️ **THÔNG TIN CHIẾN BINH - ${userName}**\n\n` +
        `🏆 Level: ${stats.level}\n` +
        `💪 HP: ${playerStats.hp}\n` +
        `⚔️ ATK: ${playerStats.atk}\n` +
        `🛡️ DEF: ${playerStats.def}\n\n` +
        `📈 EXP: ${stats.exp}/${expNeeded} (${expProgress}%)\n` +
        `🎯 Cần thêm: ${expNeeded - stats.exp} EXP\n\n` +
        `🏟️ **Khu vực mở khóa:**\n` +
        `• Level 1: Goblin Forest ✅\n` +
        `• Level 2: Orc Territory ${stats.level >= 2 ? '✅' : '🔒'}\n` +
        `• Level 3: Dragon Lair ${stats.level >= 3 ? '✅' : '🔒'}\n` +
        `• Level 4: Demon Realm ${stats.level >= 4 ? '✅' : '🔒'}\n\n` +
        `💡 Chiến đấu: fishing arena fight`,
        threadId, type
      );
    }
    
    if (subAction === 'stats') {
      const stats = player.minigames.arena;
      const totalFights = stats.wins + stats.losses;
      const winRate = totalFights > 0 ? ((stats.wins / totalFights) * 100).toFixed(1) : 0;
      const profit = stats.totalWon - stats.totalBet;
      
      return api.sendMessage(
        `📊 **ARENA STATS - ${userName}**\n\n` +
        `🏆 Level: ${stats.level}\n` +
        `📈 EXP: ${stats.exp}\n` +
        `⚔️ Thắng: ${stats.wins}\n` +
        `💀 Thua: ${stats.losses}\n` +
        `📊 Tỷ lệ thắng: ${winRate}%\n` +
        `🔥 Streak hiện tại: ${stats.streak}\n` +
        `⚡ Streak tốt nhất: ${stats.bestStreak}\n` +
        `💰 Tổng thưởng: ${stats.totalWon.toLocaleString()} coins\n` +
        `📊 Lãi: ${profit.toLocaleString()} coins\n\n` +
        `🎯 **Thành tích đặc biệt:**\n` +
        `• Boss kills: ${stats.bossKills}\n` +
        `• Perfect wins: ${stats.perfectWins}\n\n` +
        `💡 Chiến đấu: fishing arena fight`,
        threadId, type
      );
    }
    
    if (subAction === 'fight') {
      const stats = player.minigames.arena;
      const playerStats = getPlayerStats(stats);
      
      // Get available enemies for current level
      const maxLevel = Math.min(4, stats.level);
      const availableEnemies = [];
      
      for (let i = 1; i <= maxLevel; i++) {
        availableEnemies.push(...enemies[i]);
      }
      
      // Random enemy
      const enemy = { ...availableEnemies[Math.floor(Math.random() * availableEnemies.length)] };
      enemy.maxHp = enemy.hp;
      
      // Battle simulation
      let battleLog = [];
      battleLog.push(`⚔️ **ĐẤU TRƯỜNG - ${enemy.name.toUpperCase()}**\n`);
      battleLog.push(`👤 ${userName}: ${playerStats.hp} HP, ${playerStats.atk} ATK, ${playerStats.def} DEF`);
      battleLog.push(`👹 ${enemy.name}: ${enemy.hp} HP, ${enemy.atk} ATK, ${enemy.def} DEF\n`);
      
      let turn = 1;
      let attacker = Math.random() < 0.5 ? 'player' : 'enemy';
      
      while (playerStats.hp > 0 && enemy.hp > 0 && turn <= 30) {
        let damage = 0;
        let isCritical = false;
        let isDodge = false;
        
        if (attacker === 'player') {
          // Player attacks
          let baseDamage = playerStats.atk + Math.floor(Math.random() * 10) + 1;
          damage = Math.max(1, baseDamage - enemy.def);
          
          // Critical hit 15%
          isCritical = Math.random() < 0.15;
          if (isCritical) damage *= 2;
          
          // Enemy dodge 10%
          isDodge = Math.random() < 0.1;
          if (isDodge) damage = 0;
          
          enemy.hp = Math.max(0, enemy.hp - damage);
          
          let turnLog = `🔄 Turn ${turn}: ${userName}`;
          if (isDodge) {
            turnLog += ` tấn công nhưng ${enemy.name} né tránh!`;
          } else if (isCritical) {
            turnLog += ` CRITICAL HIT! ${damage} damage!`;
          } else {
            turnLog += ` gây ${damage} damage`;
          }
          turnLog += `\n   ${enemy.name}: ${enemy.hp}/${enemy.maxHp} HP`;
          
          battleLog.push(turnLog);
          attacker = 'enemy';
        } else {
          // Enemy attacks
          let baseDamage = enemy.atk + Math.floor(Math.random() * 8) + 1;
          damage = Math.max(1, baseDamage - playerStats.def);
          
          // Player dodge 10%
          isDodge = Math.random() < 0.1;
          if (isDodge) damage = 0;
          
          playerStats.hp = Math.max(0, playerStats.hp - damage);
          
          let turnLog = `🔄 Turn ${turn}: ${enemy.name}`;
          if (isDodge) {
            turnLog += ` tấn công nhưng ${userName} né tránh!`;
          } else {
            turnLog += ` gây ${damage} damage`;
          }
          turnLog += `\n   ${userName}: ${playerStats.hp}/${playerStats.maxHp} HP`;
          
          battleLog.push(turnLog);
          attacker = 'player';
        }
        
        turn++;
      }
      
      battleLog.push('');
      
      // Determine result
      let result = '';
      let reward = 0;
      let expGain = 0;
      
      if (playerStats.hp <= 0) {
        // Player loses
        result = 'DEFEAT';
        battleLog.push('💀 **BẠN ĐÃ THUA!**');
        battleLog.push(`${enemy.name} đã đánh bại bạn!`);
        stats.losses++;
        stats.streak = 0;
      } else if (enemy.hp <= 0) {
        // Player wins
        result = 'VICTORY';
        reward = enemy.reward;
        expGain = enemy.exp;
        
        // Bonuses
        let bonusText = [];
        
        // Perfect win bonus (full HP)
        if (playerStats.hp === playerStats.maxHp) {
          reward = Math.floor(reward * 1.5);
          expGain = Math.floor(expGain * 1.3);
          bonusText.push('✨ Perfect win bonus +50%');
          stats.perfectWins++;
        }
        
        // Boss kill bonus (level 4 enemies)
        if (enemy.reward >= 5000) {
          reward = Math.floor(reward * 1.2);
          expGain = Math.floor(expGain * 1.2);
          bonusText.push('👑 Boss kill bonus +20%');
          stats.bossKills++;
        }
        
        battleLog.push('🎉 **CHIẾN THẮNG!**');
        battleLog.push(`Bạn đã đánh bại ${enemy.name}!`);
        battleLog.push(`💰 Thưởng: +${reward.toLocaleString()} coins`);
        battleLog.push(`📈 EXP: +${expGain}`);
        
        if (bonusText.length > 0) {
          battleLog.push(bonusText.join('\n'));
        }
        
        // Update stats
        player.coins += reward;
        stats.wins++;
        stats.streak++;
        stats.totalWon += reward;
        stats.exp += expGain;
        
        if (stats.streak > stats.bestStreak) {
          stats.bestStreak = stats.streak;
        }
        
        // Check level up
        const expNeeded = getExpNeeded(stats.level);
        if (stats.exp >= expNeeded) {
          stats.level++;
          stats.exp -= expNeeded;
          battleLog.push(`\n🎊 **LEVEL UP!** Bạn đã đạt Level ${stats.level}!`);
          battleLog.push(`💪 Tăng HP, ATK, DEF!`);
          
          if (stats.level === 2) {
            battleLog.push(`🗺️ Mở khóa: Orc Territory!`);
          } else if (stats.level === 3) {
            battleLog.push(`🗺️ Mở khóa: Dragon Lair!`);
          } else if (stats.level === 4) {
            battleLog.push(`🗺️ Mở khóa: Demon Realm!`);
          }
        }
      } else {
        // Timeout draw
        result = 'DRAW';
        battleLog.push('⏰ **HÒA!** Trận đấu kéo dài quá lâu!');
        reward = Math.floor(enemy.reward * 0.3);
        expGain = Math.floor(enemy.exp * 0.3);
        battleLog.push(`💰 Thưởng nhỏ: +${reward.toLocaleString()} coins`);
        battleLog.push(`📈 EXP nhỏ: +${expGain}`);
        
        player.coins += reward;
        stats.totalWon += reward;
        stats.exp += expGain;
      }
      
      battleLog.push(`\n💳 Coins hiện tại: ${player.coins.toLocaleString()}`);
      battleLog.push(`📊 Streak: ${stats.streak} | Level: ${stats.level}`);
      battleLog.push(`\n🎮 Tiếp tục: fishing arena fight`);
      
      savePlayerData();
      return api.sendMessage(battleLog.join('\n'), threadId, type);
    }
    
    return api.sendMessage('❌ Lệnh không hợp lệ! Sử dụng "fishing arena help" để xem hướng dẫn.', threadId, type);
  }

  // Chiến Đấu Quái Vật Game (Monster Battle)
  if (action === 'chiến-đấu-quái-vật' || action === 'monster' || action === 'cdqv') {
    const subAction = (args[1] || '').toLowerCase();
    
    // Khởi tạo minigames data
    if (!player.minigames) {
      player.minigames = {};
    }
    if (!player.minigames.monster) {
      player.minigames.monster = { 
        wins: 0, 
        losses: 0, 
        totalBet: 0,
        totalWon: 0,
        monstersDefeated: 0,
        rareMonsters: 0,
        legendaryMonsters: 0,
        biggestWin: 0,
        streak: 0,
        bestStreak: 0
      };
    }
    
    // Monster types with evolution system
    const monsters = [
      // Common monsters
      { name: 'Slime Nhỏ', rarity: 'common', hp: 30, atk: 10, reward: 200, emoji: '🟢' },
      { name: 'Goblin Trẻ', rarity: 'common', hp: 40, atk: 15, reward: 300, emoji: '👹' },
      { name: 'Bat Dơi', rarity: 'common', hp: 25, atk: 20, reward: 250, emoji: '🦇' },
      { name: 'Spider Nhỏ', rarity: 'common', hp: 35, atk: 12, reward: 280, emoji: '🕷️' },
      
      // Rare monsters
      { name: 'Orc Warrior', rarity: 'rare', hp: 80, atk: 30, reward: 800, emoji: '👺' },
      { name: 'Fire Wolf', rarity: 'rare', hp: 70, atk: 35, reward: 900, emoji: '🐺' },
      { name: 'Ice Bear', rarity: 'rare', hp: 100, atk: 25, reward: 1000, emoji: '🐻‍❄️' },
      { name: 'Thunder Eagle', rarity: 'rare', hp: 60, atk: 40, reward: 1100, emoji: '🦅' },
      
      // Legendary monsters
      { name: 'Dragon Rồng', rarity: 'legendary', hp: 200, atk: 60, reward: 5000, emoji: '🐉' },
      { name: 'Phoenix Phượng', rarity: 'legendary', hp: 150, atk: 80, reward: 6000, emoji: '🔥' },
      { name: 'Kraken Bạch Tuộc', rarity: 'legendary', hp: 250, atk: 50, reward: 5500, emoji: '🐙' },
      { name: 'Titan Khổng Lồ', rarity: 'legendary', hp: 300, atk: 45, reward: 7000, emoji: '⛰️' }
    ];
    
    function getRandomMonster() {
      const rand = Math.random();
      let availableMonsters;
      
      if (rand < 0.6) {
        // 60% common
        availableMonsters = monsters.filter(m => m.rarity === 'common');
      } else if (rand < 0.9) {
        // 30% rare
        availableMonsters = monsters.filter(m => m.rarity === 'rare');
      } else {
        // 10% legendary
        availableMonsters = monsters.filter(m => m.rarity === 'legendary');
      }
      
      return availableMonsters[Math.floor(Math.random() * availableMonsters.length)];
    }
    
    if (!subAction || subAction === 'help') {
      return api.sendMessage(
        '👹 **CHIẾN ĐẤU QUÁI VẬT GAME**\n\n' +
        '💡 Cách chơi: fishing monster hunt <coins>\n' +
        '💡 Ví dụ: fishing monster hunt 2000\n\n' +
        '🎯 **LUẬT CHƠI:**\n' +
        '• Săn lùng quái vật để nhận thưởng\n' +
        '• 3 loại quái: Common (60%), Rare (30%), Legendary (10%)\n' +
        '• Cược coins để tăng damage\n' +
        '• Thắng = nhận coins + bonus\n' +
        '• Thua = mất coins cược\n\n' +
        '💰 **THƯỞNG:**\n' +
        '• Common: 200-300 coins\n' +
        '• Rare: 800-1100 coins + bonus\n' +
        '• Legendary: 5000-7000 coins + mega bonus\n\n' +
        '📊 Xem thống kê: fishing monster stats',
        threadId, type
      );
    }
    
    if (subAction === 'stats') {
      const stats = player.minigames.monster;
      const totalBattles = stats.wins + stats.losses;
      const winRate = totalBattles > 0 ? ((stats.wins / totalBattles) * 100).toFixed(1) : 0;
      const profit = stats.totalWon - stats.totalBet;
      
      return api.sendMessage(
        `📊 **MONSTER BATTLE STATS - ${userName}**\n\n` +
        `🏆 Thắng: ${stats.wins}\n` +
        `💀 Thua: ${stats.losses}\n` +
        `📈 Tỷ lệ thắng: ${winRate}%\n` +
        `🔥 Streak hiện tại: ${stats.streak}\n` +
        `⚡ Streak tốt nhất: ${stats.bestStreak}\n` +
        `💰 Tổng cược: ${stats.totalBet.toLocaleString()} coins\n` +
        `💎 Tổng thắng: ${stats.totalWon.toLocaleString()} coins\n` +
        `🎯 Thắng lớn nhất: ${stats.biggestWin.toLocaleString()} coins\n` +
        `📊 Lãi/Lỗ: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} coins\n\n` +
        `👹 **Quái vật đã tiêu diệt:**\n` +
        `• Tổng số: ${stats.monstersDefeated}\n` +
        `• Rare: ${stats.rareMonsters}\n` +
        `• Legendary: ${stats.legendaryMonsters}\n\n` +
        `💡 Săn quái: fishing monster hunt 2000`,
        threadId, type
      );
    }
    
    if (subAction === 'hunt') {
      const betAmount = parseInt(args[2]) || 1000;
      
      if (betAmount < 500 || betAmount > player.coins) {
        return api.sendMessage(
          `❌ Số coins không hợp lệ!\n` +
          `💰 Bạn có: ${player.coins.toLocaleString()} coins\n` +
          `💡 Cược tối thiểu: 500 coins`,
          threadId, type
        );
      }
      
      // Get random monster
      const monster = { ...getRandomMonster() };
      monster.maxHp = monster.hp;
      
      // Player stats based on bet amount
      const playerHp = 100 + Math.floor(betAmount / 100);
      const playerAtk = 20 + Math.floor(betAmount / 200);
      const playerDef = 10 + Math.floor(betAmount / 300);
      
      let playerStats = { hp: playerHp, maxHp: playerHp, atk: playerAtk, def: playerDef };
      
      // Battle simulation
      let battleLog = [];
      battleLog.push(`👹 **MONSTER HUNT - ${monster.emoji} ${monster.name.toUpperCase()}**\n`);
      battleLog.push(`💰 Cược: ${betAmount.toLocaleString()} coins`);
      battleLog.push(`🎯 Rarity: ${monster.rarity.toUpperCase()}\n`);
      battleLog.push(`👤 ${userName}: ${playerStats.hp} HP, ${playerStats.atk} ATK, ${playerStats.def} DEF`);
      battleLog.push(`${monster.emoji} ${monster.name}: ${monster.hp} HP, ${monster.atk} ATK\n`);
      
      let turn = 1;
      let attacker = Math.random() < 0.6 ? 'player' : 'monster'; // Player có lợi thế
      
      while (playerStats.hp > 0 && monster.hp > 0 && turn <= 25) {
        let damage = 0;
        let isCritical = false;
        let isDodge = false;
        
        if (attacker === 'player') {
          // Player attacks
          let baseDamage = playerStats.atk + Math.floor(Math.random() * 15) + 1;
          damage = Math.max(1, baseDamage);
          
          // Critical hit 20% (higher than arena)
          isCritical = Math.random() < 0.2;
          if (isCritical) damage = Math.floor(damage * 2.5);
          
          // Monster dodge 8%
          isDodge = Math.random() < 0.08;
          if (isDodge) damage = 0;
          
          monster.hp = Math.max(0, monster.hp - damage);
          
          let turnLog = `🔄 Turn ${turn}: ${userName}`;
          if (isDodge) {
            turnLog += ` tấn công nhưng ${monster.name} né tránh!`;
          } else if (isCritical) {
            turnLog += ` CRITICAL HIT! ${damage} damage!`;
          } else {
            turnLog += ` gây ${damage} damage`;
          }
          turnLog += `\n   ${monster.emoji} ${monster.name}: ${monster.hp}/${monster.maxHp} HP`;
          
          battleLog.push(turnLog);
          attacker = 'monster';
        } else {
          // Monster attacks
          let baseDamage = monster.atk + Math.floor(Math.random() * 10) + 1;
          damage = Math.max(1, baseDamage - playerStats.def);
          
          // Player dodge 12%
          isDodge = Math.random() < 0.12;
          if (isDodge) damage = 0;
          
          playerStats.hp = Math.max(0, playerStats.hp - damage);
          
          let turnLog = `🔄 Turn ${turn}: ${monster.emoji} ${monster.name}`;
          if (isDodge) {
            turnLog += ` tấn công nhưng ${userName} né tránh!`;
          } else {
            turnLog += ` gây ${damage} damage`;
          }
          turnLog += `\n   👤 ${userName}: ${playerStats.hp}/${playerStats.maxHp} HP`;
          
          battleLog.push(turnLog);
          attacker = 'player';
        }
        
        turn++;
      }
      
      battleLog.push('');
      
      // Determine result
      let result = '';
      let reward = 0;
      const stats = player.minigames.monster;
      
      if (playerStats.hp <= 0) {
        // Player loses
        result = 'DEFEAT';
        battleLog.push(`💀 **BẠN ĐÃ THUA!**`);
        battleLog.push(`${monster.emoji} ${monster.name} đã đánh bại bạn!`);
        battleLog.push(`💸 Mất: -${betAmount.toLocaleString()} coins`);
        
        player.coins -= betAmount;
        stats.losses++;
        stats.streak = 0;
      } else if (monster.hp <= 0) {
        // Player wins
        result = 'VICTORY';
        reward = monster.reward;
        
        // Rarity bonuses
        let bonusMultiplier = 1;
        let bonusText = [];
        
        if (monster.rarity === 'rare') {
          bonusMultiplier = 1.5;
          bonusText.push('🌟 Rare monster bonus +50%');
          stats.rareMonsters++;
        } else if (monster.rarity === 'legendary') {
          bonusMultiplier = 3;
          bonusText.push('💎 Legendary monster bonus +200%');
          stats.legendaryMonsters++;
        }
        
        // Bet multiplier (higher bet = higher reward)
        const betMultiplier = 1 + (betAmount / 10000);
        reward = Math.floor(reward * bonusMultiplier * betMultiplier);
        
        // Perfect win bonus
        if (playerStats.hp === playerStats.maxHp) {
          reward = Math.floor(reward * 1.3);
          bonusText.push('✨ Perfect hunt bonus +30%');
        }
        
        battleLog.push(`🎉 **CHIẾN THẮNG!**`);
        battleLog.push(`Bạn đã tiêu diệt ${monster.emoji} ${monster.name}!`);
        battleLog.push(`💰 Thưởng: +${reward.toLocaleString()} coins`);
        
        if (bonusText.length > 0) {
          battleLog.push(bonusText.join('\n'));
        }
        
        // Update stats
        const profit = reward - betAmount;
        player.coins += profit;
        stats.wins++;
        stats.streak++;
        stats.monstersDefeated++;
        stats.totalWon += reward;
        
        if (reward > stats.biggestWin) {
          stats.biggestWin = reward;
        }
        
        if (stats.streak > stats.bestStreak) {
          stats.bestStreak = stats.streak;
        }
        
        // Special achievements
        if (monster.rarity === 'legendary') {
          battleLog.push(`🏆 **LEGENDARY KILL!** Thành tích hiếm!`);
        }
        
        if (stats.streak >= 5) {
          battleLog.push(`🔥 **KILLING SPREE!** ${stats.streak} streak!`);
        }
      } else {
        // Timeout draw
        result = 'DRAW';
        battleLog.push(`⏰ **HÒA!** Cả hai đều kiệt sức!`);
        reward = Math.floor(betAmount * 0.5);
        battleLog.push(`💰 Hoàn một phần: +${reward.toLocaleString()} coins`);
        
        const profit = reward - betAmount;
        player.coins += profit;
        stats.totalWon += reward;
      }
      
      stats.totalBet += betAmount;
      
      battleLog.push(`\n💳 Coins hiện tại: ${player.coins.toLocaleString()}`);
      battleLog.push(`📊 Streak: ${stats.streak} | Monsters: ${stats.monstersDefeated}`);
      battleLog.push(`\n🎮 Tiếp tục săn: fishing monster hunt ${betAmount}`);
      
      savePlayerData();
      return api.sendMessage(battleLog.join('\n'), threadId, type);
    }
    
    return api.sendMessage('❌ Lệnh không hợp lệ! Sử dụng "fishing monster help" để xem hướng dẫn.', threadId, type);
  }

  // ID - Hiển thị ID của người dùng
  if (action === 'id' || action === 'myid') {
    return api.sendMessage(
      `🆔 **THÔNG TIN ID CỦA BẠN**\n\n` +
      `👤 Tên: ${userName}\n` +
      `🆔 User ID: ${senderId}\n\n` +
      `💡 **CÁCH SỬ DỤNG:**\n` +
      `• Chia sẻ ID này với bạn bè để nhận quà\n` +
      `• Bạn bè có thể tặng bằng lệnh:\n` +
      `  fishing give coins ${senderId} <số>\n` +
      `  fishing give rod ${senderId} <tên_cần>\n` +
      `  fishing give fish ${senderId} <tên_cá> <số>\n\n` +
      `🎁 Hoặc họ có thể tag (@) bạn như bình thường!`,
      threadId, type
    );
  }

  // Hướng dẫn sử dụng với phân trang
  if (!action || action === 'help') {
    const page = parseInt(args[1]) || 1;
    
    const helpPages = {
      1: {
        title: '🎣 GAME CÂU CÁ - TRANG 1/3',
        content: [
          '',
          '📋 LỆNH CƠ BẢN:',
          '• fishing cast - Thả cần câu',
          '• fishing stats - Xem thống kê',
          '• fishing inventory - Xem túi đồ',
          '• fishing shop - Xem trang 1 shop (100+ items)',
          '• fishing shop <trang> - Xem trang cụ thể',
          '• fishing buy <số> - Mua đồ từ shop',
          '• fishing sell - Xem menu bán cá',
          '• fishing sell all - Bán hết tất cả',
          '• fishing sell <số> - Bán theo số thứ tự',
          '• fishing sell <tên_cá> - Bán 1 con',
          '• fishing sell <tên_cá> all - Bán hết loại này',
          '',
          '🎣 CẦN CÂU & KHU VỰC:',
          '• fishing cần - Xem cần câu đang có',
          '• fishing cần <số> - Sử dụng cần câu',
          '• fishing area - Xem khu vực câu cá',
          '• fishing goto <số> - Di chuyển khu vực',
          '• fishing areas - Xem danh sách khu vực',
          '• fishing areas <trang> - Xem trang khu vực',
          '• fishing bait - Xem mồi câu đang có',
          '• fishing bait <số> - Sử dụng mồi câu',
          '',
          '🐟 LOẠI CÁ:',
          '• 🐟 Cá Thường (70%) - 10-18 EXP',
          '• 🍣 Cá Hiếm (20%) - 25-40 EXP',
          '• 🐉 Cá Huyền Thoại (5%) - 80-120 EXP',
          '• 👟 Rác (5%) - 1 EXP',
          '',
          '⏰ Cooldown: 30 giây/lần câu',
          '🎯 Level up để mở khóa tính năng mới!'
        ]
      },
      2: {
        title: '🎣 GAME CÂU CÁ - TRANG 2/3',
        content: [
          '',
          '🏦 NGÂN HÀNG:',
          '• fishing bank - Xem thông tin bank',
          '• fishing bank deposit <số> - Gửi tiền',
          '• fishing bank withdraw <số> - Rút tiền',
          '• fishing bank interest - Nhận lãi',
          '• fishing bank loan <số> - Vay tiền (lãi 5%/ngày)',
          '• fishing bank repay <số> - Trả nợ',
          '• fishing bank history - Lịch sử giao dịch',
          '',
          '🎮 MINI GAMES:',
          '• fishing guess start - Đoán số 1-100',
          '• fishing kbb kéo 1000 - Kéo búa bao',
          '• fishing tht random - Thật hay thách',
          '• fishing war start 5000 - Chiến tranh bài',
          '• fishing bac bet player 10000 - Baccarat',
          '• fishing pvp challenge @user 10000 - Đấu tay đôi',
          '• fishing bj start 10000 - Xì dách (Blackjack)',
          '• fishing arena fight - Đấu trường RPG',
          '• fishing monster hunt 2000 - Chiến đấu quái vật',
          '',
          '👑 VIP SYSTEM:',
          '• fishing vip - Xem VIP status',
          '• fishing vip buy <level> - Mua VIP level',
          '• fishing vip top - Xem bảng giá VIP',
          '• fishing vip leaderboard - Top VIP players',
          '• fishing vipmoney - Xem VIP Money status',
          '• fishing vipmoney request <level> - Yêu cầu mua VIP Money',
          '• fishing vipmoney top - Top VIP Money players'
        ]
      },
      3: {
        title: '🎣 GAME CÂU CÁ - TRANG 3/3',
        content: [
          '',
          '🎁 TẶNG ĐỒ:',
          '• fishing id - Xem ID của bạn để chia sẻ',
          '• fishing give coins @user <số> - Tặng coins (mention)',
          '• fishing give coins <userID> <số> - Tặng coins (ID)',
          '• fishing give rod @user <tên_cần> - Tặng cần câu',
          '• fishing give rod <userID> <tên_cần> - Tặng cần câu (ID)',
          '• fishing give fish @user <tên_cá> <số> - Tặng cá',
          '• fishing give fish <userID> <tên_cá> <số> - Tặng cá (ID)',
          '',
          '🏆 HOẠT ĐỘNG NÂNG CAO:',
          '• fishing boss - Xem danh sách boss',
          '• fishing boss <số> - Thách đấu boss',
          '• fishing tournament - Xem tournament',
          '• fishing tournament join <số> - Tham gia tournament',
          '• fishing guild - Xem guild',
          '• fishing guild create <tên> - Tạo guild',
          '• fishing guild join <id> - Tham gia guild',
          '• fishing achievement - Xem thành tựu',
          '• fishing upgrade - Nâng cấp thiết bị',
          '• fishing quest - Nhiệm vụ hàng ngày',
          '',
          '🪱 GIỚI HẠN MỒI CÂU:',
          '• Mỗi người chỉ có 5 lần sử dụng mồi miễn phí',
          '• Mua mồi câu từ shop để reset lại giới hạn',
          '',
          '🔧 DEBUG & ADMIN:',
          '• fishing debug sync - Force sync leaderboard',
          '• fishing debug clean - Clean invalid inventory items',
          '• fishing admin - Admin commands (VIP max, coins max, delete user)'
        ]
      }
    };
    
    const currentPage = helpPages[page];
    if (!currentPage) {
      return api.sendMessage('❌ Trang không tồn tại! Chỉ có trang 1-3.\n💡 Sử dụng: fishing help <1-3>', threadId, type);
    }
    
    const helpMsg = [
      currentPage.title,
      ...currentPage.content,
      '',
      '📖 NAVIGATION:',
      page > 1 ? `• fishing help ${page - 1} - Trang trước` : '',
      page < 3 ? `• fishing help ${page + 1} - Trang tiếp` : '',
      '• fishing help 1 - Trang 1 (Lệnh cơ bản)',
      '• fishing help 2 - Trang 2 (Ngân hàng & Mini games)',
      '• fishing help 3 - Trang 3 (Tặng đồ & Nâng cao)'
    ].filter(line => line !== '').join('\n');
    
    return api.sendMessage(helpMsg, threadId, type);
  }

  // Thống kê người chơi
  if (action === 'stats' || action === 'stat') {
    const expToNext = getExpToNextLevel(player.level);
    const expProgress = player.exp - getExpForLevel(player.level);
    
    // VIP status display
    let vipDisplay = '';
    if (player.vip.level > 0) {
      const vipData = VIP_LEVELS[player.vip.level];
      vipDisplay = `👑 VIP: ${vipData.emoji} Level ${player.vip.level} - ${vipData.tierName}`;
    } else {
      vipDisplay = '👑 VIP: ❌ Chưa có VIP';
    }
    
    // VIP Money status display
    let vipMoneyDisplay = '';
    if (player.vipMoney && player.vipMoney.level > 0) {
      vipMoneyDisplay = `💰 VIP Money: 💎 Level ${player.vipMoney.level}`;
    } else {
      vipMoneyDisplay = '💰 VIP Money: ❌ Chưa có VIP Money';
    }

    const statsMsg = [
      `🎣 THỐNG KÊ CÂU CÁ - ${userName}`,
      '',
      `🎯 Level: ${player.level}`,
      `⭐ EXP: ${expProgress}/${expToNext} (${player.exp} tổng)`,
      `💰 Coins: ${player.coins.toLocaleString()}`,
      `🎣 Tổng lần câu: ${player.totalCatch}`,
      vipDisplay,
      vipMoneyDisplay,
      '',
      '📊 THỐNG KÊ THEO LOẠI:',
      `🐟 Cá Thường: ${player.stats.common}`,
      `🍣 Cá Hiếm: ${player.stats.rare}`,
      `🐉 Cá Huyền Thoại: ${player.stats.legendary}`,
      `👟 Rác: ${player.stats.trash}`,
      '',
      `🏆 Tỉ lệ thành công: ${player.totalCatch > 0 ? Math.round(((player.stats.common + player.stats.rare + player.stats.legendary) / player.totalCatch) * 100) : 0}%`
    ].join('\n');
    
    return api.sendMessage(statsMsg, threadId, type);
  }

  // Xem túi đồ
  if (action === 'inventory' || action === 'inv') {
    const inventory = player.inventory;
    const items = Object.keys(inventory);
    
    if (items.length === 0) {
      return api.sendMessage('🎒 Túi đồ trống! Hãy đi câu cá để có đồ.', threadId, type);
    }

    let invMsg = [
      `🎒 TÚI ĐỒ - ${userName}`,
      `💰 Coins: ${player.coins.toLocaleString()}`,
      ''
    ];

    // Nhóm theo độ hiếm
    const grouped = { legendary: [], rare: [], common: [], trash: [], unknown: [] };
    
    items.forEach(itemName => {
      const count = inventory[itemName];
      const item = findItemByName(itemName);
      if (item) {
        const rarity = item.rarity.toLowerCase().replace(' ', '').replace('huyềnthoại', 'legendary').replace('hiếm', 'rare').replace('thường', 'common').replace('rác', 'trash');
        grouped[rarity] = grouped[rarity] || [];
        grouped[rarity].push(`${item.emoji} ${itemName} x${count}`);
      } else {
        // Item không tìm thấy trong FISH_DATA
        console.log(`[FISHING] Unknown item in inventory: ${itemName}`);
        grouped.unknown.push(`❓ ${itemName} x${count} (Unknown)`);
      }
    });

    // Hiển thị theo thứ tự độ hiếm
    if (grouped.legendary.length > 0) {
      invMsg.push('🐉 HUYỀN THOẠI:');
      invMsg.push(...grouped.legendary);
      invMsg.push('');
    }
    if (grouped.rare.length > 0) {
      invMsg.push('🍣 HIẾM:');
      invMsg.push(...grouped.rare);
      invMsg.push('');
    }
    if (grouped.common.length > 0) {
      invMsg.push('🐟 THƯỜNG:');
      invMsg.push(...grouped.common);
      invMsg.push('');
    }
    if (grouped.trash.length > 0) {
      invMsg.push('👟 RÁC:');
      invMsg.push(...grouped.trash);
      invMsg.push('');
    }
    if (grouped.unknown.length > 0) {
      invMsg.push('❓ KHÔNG XÁC ĐỊNH:');
      invMsg.push(...grouped.unknown);
      invMsg.push('');
      invMsg.push('⚠️ Một số items có thể bị lỗi dữ liệu');
    }

    return api.sendMessage(invMsg.join('\n'), threadId, type);
  }

  // Helper function để tạo shop items
  function createShopItems() {
    const shopItems = [];
    
    // Thêm cần câu vào shop (trừ cần câu cơ bản) - SORTED BY PRICE
    const sortedRods = Object.values(FISHING_RODS)
      .filter(rod => rod.price > 0) // Không bán cần câu miễn phí
      .sort((a, b) => a.price - b.price); // Sắp xếp theo giá từ thấp đến cao
    
    
    sortedRods.forEach(rod => {
      shopItems.push({
        name: rod.name,
        price: rod.price,
        effect: rod.description || `${rod.emoji} ${rod.name}`,
        emoji: rod.emoji,
        type: 'rod',
        levelRequired: rod.levelRequired || 0
      });
    });
    
    // Thêm mồi câu vào shop
    Object.values(FISHING_BAITS).forEach(bait => {
      shopItems.push({
        name: bait.name,
        price: bait.price,
        effect: bait.description,
        emoji: bait.emoji,
        type: 'bait'
      });
    });
    
    // Thêm items khác
    shopItems.push(
      { name: 'Lưới Câu', price: 2000, effect: '+2 Cá/lần', emoji: '🕸️', type: 'item' },
      { name: 'Máy Dò Cá', price: 1500, effect: 'Hiện vị trí cá', emoji: '📡', type: 'item' },
      { name: 'Bình Oxy', price: 800, effect: 'Giảm cooldown 50%', emoji: '🫧', type: 'item' }
    );

    return shopItems;
  }

  // Cửa hàng với pagination
  if (action === 'shop') {
    const page = parseInt(args[1]) || 1;
    const itemsPerPage = 10;
    
    const shopItems = createShopItems();

    // Pagination logic
    const totalPages = Math.ceil(shopItems.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = shopItems.slice(startIndex, endIndex);

    if (page > totalPages || page < 1) {
      return api.sendMessage(`❌ Trang không hợp lệ!\n📄 Có ${totalPages} trang. Gõ "fishing shop 1" đến "fishing shop ${totalPages}"`, threadId, type);
    }

    let shopMsg = [
      `🏪 CỬA HÀNG CÂU CÁ - ${userName}`,
      `💰 Coins: ${player.coins.toLocaleString()} | 📊 Level: ${player.level}`,
      `📄 Trang ${page}/${totalPages} (${shopItems.length} items)`,
      '',
      '🛒 SẢN PHẨM:'
    ];

    pageItems.forEach((item, index) => {
      const globalIndex = startIndex + index + 1;
      const canBuy = !item.levelRequired || player.level >= item.levelRequired;
      const statusIcon = canBuy ? '✅' : '🔒';
      
      shopMsg.push(`${globalIndex}. ${statusIcon} ${item.emoji} ${item.name}`);
      shopMsg.push(`   💰 ${item.price.toLocaleString()} coins`);
      if (item.levelRequired && item.levelRequired > 0) {
        shopMsg.push(`   🎯 Level ${item.levelRequired}`);
      }
      shopMsg.push(`   ✨ ${item.effect}`);
      shopMsg.push('');
    });

    shopMsg.push('💡 HƯỚNG DẪN:');
    shopMsg.push(`• fishing shop <trang> - Xem trang khác`);
    shopMsg.push(`• fishing buy <số> - Mua item`);
    if (page < totalPages) {
      shopMsg.push(`• fishing shop ${page + 1} - Trang tiếp theo`);
    }

    return api.sendMessage(shopMsg.join('\n'), threadId, type);
  }

  // Mua đồ từ shop
  if (action === 'buy') {
    const itemIndex = parseInt(args[1]) - 1;
    
    const shopItems = createShopItems();

    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= shopItems.length) {
      return api.sendMessage('❌ Số thứ tự không hợp lệ!\n💡 Ví dụ: fishing buy 1', threadId, type);
    }

    const item = shopItems[itemIndex];
    
    // Kiểm tra level requirement cho cần câu VIP
    if (item.levelRequired && player.level < item.levelRequired) {
      return api.sendMessage(`❌ Level không đủ!\n🎯 Cần: Level ${item.levelRequired}\n📊 Hiện tại: Level ${player.level}\n💡 Hãy câu cá để lên level!`, threadId, type);
    }
    
    if (player.coins < item.price) {
      return api.sendMessage(`❌ Không đủ coins!\n💰 Cần: ${item.price.toLocaleString()} coins\n💳 Có: ${player.coins.toLocaleString()} coins`, threadId, type);
    }

    // Mua thành công
    player.coins -= item.price;
    
    if (item.type === 'rod') {
      // Mua cần câu
      if (player.fishingRods[item.name]) {
        player.fishingRods[item.name]++;
      } else {
        player.fishingRods[item.name] = 1;
      }
      
      const buyMsg = [
        `🎣 MUA CẦN CÂU THÀNH CÔNG!`,
        '',
        `${item.emoji} **${item.name}**`,
        `💰 Đã trả: ${item.price.toLocaleString()} coins`,
        `💳 Coins còn lại: ${player.coins.toLocaleString()}`,
        `✨ Hiệu ứng: ${item.effect}`,
        '',
        '🎯 Gõ "fishing cần" để xem và sử dụng cần câu mới!'
      ].join('\n');
      
      // Auto-save sau khi mua
      savePlayerData();
      
      return api.sendMessage(buyMsg, threadId, type);
      
    } else if (item.type === 'bait') {
      // Mua mồi câu
      if (player.baits[item.name]) {
        player.baits[item.name]++;
      } else {
        player.baits[item.name] = 1;
      }
      
      // Reset lại giới hạn sử dụng mồi câu khi mua
      player.totalBaitUses = 0;
      
      const buyMsg = [
        `🪱 MUA MỒI CÂU THÀNH CÔNG!`,
        '',
        `${item.emoji} **${item.name}**`,
        `💰 Đã trả: ${item.price.toLocaleString()} coins`,
        `💳 Coins còn lại: ${player.coins.toLocaleString()}`,
        `✨ Hiệu ứng: ${item.effect}`,
        '',
        `🔄 **RESET GIỚI HẠN:** Bạn lại có ${player.maxBaitUses} lần sử dụng mồi câu miễn phí!`,
        '',
        '🎯 Gõ "fishing bait" để xem và sử dụng mồi câu mới!'
      ].join('\n');
      
      // Auto-save sau khi mua
      savePlayerData();
      
      return api.sendMessage(buyMsg, threadId, type);
      
    } else {
      // Mua items thường
      if (player.inventory[item.name]) {
        player.inventory[item.name]++;
      } else {
        player.inventory[item.name] = 1;
      }

      const buyMsg = [
        `🛒 MUA THÀNH CÔNG!`,
        '',
        `${item.emoji} **${item.name}**`,
        `💰 Đã trả: ${item.price.toLocaleString()} coins`,
        `💳 Coins còn lại: ${player.coins.toLocaleString()}`,
        `✨ Hiệu ứng: ${item.effect}`,
        '',
        '💡 Gõ "fishing inventory" để xem túi đồ'
      ].join('\n');
      
      // Auto-save sau khi mua
      savePlayerData();

      return api.sendMessage(buyMsg, threadId, type);
    }
  }

  // Quản lý cần câu
  if (action === 'cần' || action === 'can' || action === 'rod') {
    const rodInput = args[1];
    
    // Nếu không có input, hiển thị danh sách cần câu
    if (!rodInput) {
      const rods = Object.keys(player.fishingRods);
      
      if (rods.length === 0) {
        return api.sendMessage('❌ Bạn không có cần câu nào!', threadId, type);
      }

      let rodMenu = [
        `🎣 CẦN CÂU CỦA ${userName}`,
        `🎯 Đang sử dụng: ${FISHING_RODS[player.currentRod]?.emoji} ${player.currentRod}`,
        '',
        '📋 CÁCH SỬ DỤNG:',
        '• fishing cần <số> - Chuyển cần câu',
        '',
        '🎣 CẦN CÂU ĐANG CÓ:'
      ];

      rods.forEach((rodName, index) => {
        const rod = FISHING_RODS[rodName];
        const count = player.fishingRods[rodName];
        const isActive = rodName === player.currentRod ? ' ⭐' : '';
        
        if (rod) {
          rodMenu.push(`${index + 1}. ${rod.emoji} ${rodName} x${count}${isActive}`);
          rodMenu.push(`   ${rod.description}`);
        }
      });

      rodMenu.push('');
      rodMenu.push('💡 Ví dụ: fishing cần 2 (chuyển sang cần câu số 2)');
      rodMenu.push('🛒 Mua cần câu mới tại shop: fishing shop');

      return api.sendMessage(rodMenu.join('\n'), threadId, type);
    }
    
    // Sử dụng cần câu theo số thứ tự
    const rodIndex = parseInt(rodInput) - 1;
    const rods = Object.keys(player.fishingRods);
    
    if (isNaN(rodIndex) || rodIndex < 0 || rodIndex >= rods.length) {
      return api.sendMessage('❌ Số thứ tự không hợp lệ!\n💡 Gõ "fishing cần" để xem danh sách', threadId, type);
    }

    const selectedRod = rods[rodIndex];
    
    if (selectedRod === player.currentRod) {
      return api.sendMessage(`❌ Bạn đã đang sử dụng ${FISHING_RODS[selectedRod]?.emoji} ${selectedRod}!`, threadId, type);
    }

    // Chuyển cần câu
    player.currentRod = selectedRod;
    
    // Auto-save
    savePlayerData();

    const rod = FISHING_RODS[selectedRod];
    const switchMsg = [
      `🎣 ĐÃ CHUYỂN CẦN CÂU!`,
      '',
      `${rod.emoji} **${selectedRod}**`,
      `✨ ${rod.description}`,
      '',
      '🎯 HIỆU ỨNG:',
      rod.effects.expBonus > 0 ? `• +${rod.effects.expBonus}% EXP` : null,
      rod.effects.rareBonus > 0 ? `• +${rod.effects.rareBonus}% Cá hiếm` : null,
      rod.effects.coinBonus > 0 ? `• +${rod.effects.coinBonus}% Coins` : null,
      rod.effects.cooldownReduction > 0 ? `• -${rod.effects.cooldownReduction/1000}s Cooldown` : null,
      '',
      '🎣 Sẵn sàng câu cá với cần câu mới!'
    ].filter(line => line !== null).join('\n');

    return api.sendMessage(switchMsg, threadId, type);
  }

  // Quản lý khu vực câu cá
  if (action === 'area' || action === 'khu' || action === 'vùng') {
    const areas = Object.values(FISHING_AREAS);
    
    let areaMenu = [
      `🏞️ KHU VỰC CÂU CÁ - ${userName}`,
      `📍 Đang ở: ${FISHING_AREAS[player.currentArea]?.emoji} ${player.currentArea}`,
      `🎯 Level: ${player.level} | 💰 Coins: ${player.coins.toLocaleString()}`,
      '',
      '📋 CÁCH SỬ DỤNG:',
      '• fishing goto <số> - Di chuyển đến khu vực',
      '',
      '🗺️ DANH SÁCH KHU VỰC:'
    ];

    areas.forEach((area, index) => {
      const isUnlocked = player.level >= area.unlockLevel;
      const isCurrent = area.name === player.currentArea;
      const status = isCurrent ? ' 📍' : (isUnlocked ? ' ✅' : ' 🔒');
      
      areaMenu.push(`${index + 1}. ${area.emoji} ${area.name}${status}`);
      areaMenu.push(`   ${area.description}`);
      
      if (isUnlocked) {
        areaMenu.push(`   💰 Phí: ${area.cost.toLocaleString()} coins | 🎯 Yêu cầu: Level ${area.unlockLevel}`);
        areaMenu.push(`   ⭐ EXP: x${area.expMultiplier} | 💰 Coins: x${area.coinMultiplier}`);
      } else {
        areaMenu.push(`   🔒 Cần Level ${area.unlockLevel} để mở khóa`);
      }
      areaMenu.push('');
    });

    areaMenu.push('💡 Ví dụ: fishing goto 2 (di chuyển đến khu vực số 2)');

    return api.sendMessage(areaMenu.join('\n'), threadId, type);
  }

  // Di chuyển đến khu vực
  if (action === 'goto' || action === 'di' || action === 'move') {
    const areaInput = args[1];
    
    if (!areaInput) {
      return api.sendMessage('❌ Vui lòng chọn khu vực!\n💡 Gõ "fishing area" để xem danh sách', threadId, type);
    }
    
    const areaIndex = parseInt(areaInput) - 1;
    const areas = Object.values(FISHING_AREAS);
    
    if (isNaN(areaIndex) || areaIndex < 0 || areaIndex >= areas.length) {
      return api.sendMessage('❌ Số thứ tự không hợp lệ!\n💡 Gõ "fishing area" để xem danh sách', threadId, type);
    }

    const targetArea = areas[areaIndex];
    
    // Kiểm tra level requirement
    if (player.level < targetArea.unlockLevel) {
      return api.sendMessage(`❌ Bạn cần Level ${targetArea.unlockLevel} để vào ${targetArea.emoji} ${targetArea.name}!\n🎯 Level hiện tại: ${player.level}`, threadId, type);
    }
    
    // Kiểm tra nếu đã ở khu vực đó
    if (targetArea.name === player.currentArea) {
      return api.sendMessage(`❌ Bạn đã đang ở ${targetArea.emoji} ${targetArea.name}!`, threadId, type);
    }
    
    // Kiểm tra coins (nếu có phí)
    if (targetArea.cost > 0 && player.coins < targetArea.cost) {
      return api.sendMessage(`❌ Không đủ coins để vào ${targetArea.emoji} ${targetArea.name}!\n💰 Cần: ${targetArea.cost.toLocaleString()} coins\n💳 Có: ${player.coins.toLocaleString()} coins`, threadId, type);
    }

    // Trừ phí và di chuyển
    if (targetArea.cost > 0) {
      player.coins -= targetArea.cost;
    }
    player.currentArea = targetArea.name;
    
    // Auto-save
    savePlayerData();

    const moveMsg = [
      `🚀 DI CHUYỂN THÀNH CÔNG!`,
      '',
      `📍 **${targetArea.emoji} ${targetArea.name}**`,
      `✨ ${targetArea.description}`,
      '',
      '🎯 ĐẶC ĐIỂM KHU VỰC:',
      `• ⭐ EXP Bonus: x${targetArea.expMultiplier}`,
      `• 💰 Coin Bonus: x${targetArea.coinMultiplier}`,
      `• 🐟 Tỉ lệ cá hiếm: ${targetArea.fishBonus.rare + targetArea.fishBonus.legendary}%`,
      targetArea.cost > 0 ? `• 💸 Đã trả phí: ${targetArea.cost.toLocaleString()} coins` : null,
      '',
      `💳 Coins còn lại: ${player.coins.toLocaleString()}`,
      '🎣 Sẵn sàng câu cá tại khu vực mới!'
    ].filter(line => line !== null).join('\n');

    return api.sendMessage(moveMsg, threadId, type);
  }

  // Quản lý mồi câu
  if (action === 'bait' || action === 'mồi' || action === 'moi') {
    const baitInput = args[1];
    
    // Nếu không có input, hiển thị danh sách mồi câu
    if (!baitInput) {
      const baits = Object.keys(player.baits).filter(bait => player.baits[bait] > 0);
      
      let baitMenu = [
        `🪱 MỒI CÂU CỦA ${userName}`,
        `🎯 Đang sử dụng: ${player.activeBait ? `${FISHING_BAITS[player.activeBait]?.emoji} ${player.activeBait} (${player.baitUsesLeft} lần)` : 'Không có'}`,
        `📊 Giới hạn: ${player.totalBaitUses}/${player.maxBaitUses} lần đã sử dụng ${player.totalBaitUses >= player.maxBaitUses ? '🚫' : '✅'}`,
        '',
        '📋 CÁCH SỬ DỤNG:',
        '• fishing bait <số> - Sử dụng mồi câu',
        '',
        '🪱 MỒI CÂU ĐANG CÓ:'
      ];

      if (baits.length === 0) {
        baitMenu.push('❌ Không có mồi câu nào!');
        baitMenu.push('🛒 Mua mồi câu tại shop: fishing shop');
      } else {
        baits.forEach((baitName, index) => {
          const bait = FISHING_BAITS[baitName];
          const count = player.baits[baitName];
          const isActive = baitName === player.activeBait ? ' ⭐' : '';
          
          if (bait) {
            baitMenu.push(`${index + 1}. ${bait.emoji} ${baitName} x${count}${isActive}`);
            baitMenu.push(`   ${bait.description}`);
          }
        });

        baitMenu.push('');
        baitMenu.push('💡 Ví dụ: fishing bait 2 (sử dụng mồi câu số 2)');
      }

      baitMenu.push('🛒 Mua mồi câu mới tại shop: fishing shop');

      return api.sendMessage(baitMenu.join('\n'), threadId, type);
    }
    
    // Sử dụng mồi câu theo số thứ tự
    const baitIndex = parseInt(baitInput) - 1;
    const baits = Object.keys(player.baits).filter(bait => player.baits[bait] > 0);
    
    if (isNaN(baitIndex) || baitIndex < 0 || baitIndex >= baits.length) {
      return api.sendMessage('❌ Số thứ tự không hợp lệ!\n💡 Gõ "fishing bait" để xem danh sách', threadId, type);
    }

    const selectedBait = baits[baitIndex];
    
    if (selectedBait === player.activeBait) {
      return api.sendMessage(`❌ Bạn đã đang sử dụng ${FISHING_BAITS[selectedBait]?.emoji} ${selectedBait}!`, threadId, type);
    }

    // Kiểm tra giới hạn sử dụng mồi câu
    if (player.totalBaitUses >= player.maxBaitUses) {
      return api.sendMessage([
        `❌ **HẾT LƯỢT SỬ DỤNG MỒI CÂU!**`,
        '',
        `🚫 Bạn đã sử dụng hết ${player.maxBaitUses} lần mồi câu miễn phí!`,
        `💰 Muốn tiếp tục sử dụng mồi câu, bạn cần mua thêm từ shop.`,
        '',
        '🛒 **CÁCH MUA MỒI CÂU:**',
        '• fishing shop - Xem danh sách mồi câu',
        '• fishing buy <số> - Mua mồi câu',
        '',
        '💡 Mỗi lần mua mồi câu sẽ reset lại giới hạn sử dụng!'
      ].join('\n'), threadId, type);
    }

    // Sử dụng mồi câu
    player.activeBait = selectedBait;
    player.baitUsesLeft = FISHING_BAITS[selectedBait].effects.duration;
    player.totalBaitUses++; // Tăng counter sử dụng mồi câu
    
    // Trừ 1 mồi câu từ inventory
    player.baits[selectedBait]--;
    if (player.baits[selectedBait] <= 0) {
      delete player.baits[selectedBait];
    }
    
    // Auto-save
    savePlayerData();

    const bait = FISHING_BAITS[selectedBait];
    const useMsg = [
      `🪱 ĐÃ SỬ DỤNG MỒI CÂU!`,
      '',
      `${bait.emoji} **${selectedBait}**`,
      `✨ ${bait.description}`,
      '',
      '🎯 HIỆU ỨNG:',
      bait.effects.commonBonus > 0 ? `• +${bait.effects.commonBonus}% Cá thường` : null,
      bait.effects.rareBonus > 0 ? `• +${bait.effects.rareBonus}% Cá hiếm` : null,
      bait.effects.legendaryBonus > 0 ? `• +${bait.effects.legendaryBonus}% Cá huyền thoại` : null,
      `• Còn lại: ${player.baitUsesLeft} lần sử dụng`,
      '',
      `🎯 **GIỚI HẠN MỒI CÂU:** ${player.totalBaitUses}/${player.maxBaitUses} lần đã sử dụng`,
      player.totalBaitUses >= player.maxBaitUses - 1 ? '⚠️ Đây là lần cuối! Hãy mua mồi câu mới từ shop.' : `💡 Còn lại ${player.maxBaitUses - player.totalBaitUses} lần sử dụng miễn phí`,
      '',
      '🎣 Sẵn sàng câu cá với mồi câu mới!'
    ].filter(line => line !== null).join('\n');

    return api.sendMessage(useMsg, threadId, type);
  }

  // Boss Battle System
  if (action === 'boss') {
    const bossInput = args[1];
    
    // Nếu không có input, hiển thị danh sách boss
    if (!bossInput) {
      const bosses = Object.values(BOSS_FISH);
      
      let bossMenu = [
        `🐉 BOSS FISH - ${userName}`,
        `🎯 Level: ${player.level} | 💰 Coins: ${player.coins.toLocaleString()}`,
        '',
        '📋 CÁCH THÁCH ĐẤU:',
        '• fishing boss <số> - Thách đấu boss',
        '',
        '🐉 DANH SÁCH BOSS:'
      ];

      bosses.forEach((boss, index) => {
        const isUnlocked = player.level >= boss.unlockLevel;
        const cooldownKey = `${senderId}_${boss.name}`;
        const lastBattle = player.bossCooldowns[boss.name] || 0;
        const now = Date.now();
        const isOnCooldown = (now - lastBattle) < boss.cooldown;
        
        let status = '';
        if (!isUnlocked) {
          status = ' 🔒';
        } else if (isOnCooldown) {
          const remaining = Math.ceil((boss.cooldown - (now - lastBattle)) / 60000);
          status = ` ⏰ ${remaining}m`;
        } else {
          status = ' ✅';
        }
        
        bossMenu.push(`${index + 1}. ${boss.emoji} ${boss.name}${status}`);
        bossMenu.push(`   ${boss.description}`);
        
        if (isUnlocked) {
          bossMenu.push(`   💪 HP: ${boss.hp} | ⚔️ Damage: ${boss.damage}`);
          bossMenu.push(`   🎁 Reward: ${boss.reward.exp} EXP, ${boss.reward.coins.toLocaleString()} coins`);
          bossMenu.push(`   ⏰ Cooldown: ${boss.cooldown / 3600000}h`);
        } else {
          bossMenu.push(`   🔒 Cần Level ${boss.unlockLevel} để mở khóa`);
        }
        bossMenu.push('');
      });

      bossMenu.push('💡 Ví dụ: fishing boss 1 (thách đấu boss số 1)');
      bossMenu.push('⚠️ Boss battles tiêu tốn nhiều HP và có cooldown dài!');

      return api.sendMessage(bossMenu.join('\n'), threadId, type);
    }
    
    // Thách đấu boss theo số thứ tự
    const bossIndex = parseInt(bossInput) - 1;
    const bosses = Object.values(BOSS_FISH);
    
    if (isNaN(bossIndex) || bossIndex < 0 || bossIndex >= bosses.length) {
      return api.sendMessage('❌ Số thứ tự không hợp lệ!\n💡 Gõ "fishing boss" để xem danh sách', threadId, type);
    }

    const selectedBoss = bosses[bossIndex];
    
    // Kiểm tra level requirement
    if (player.level < selectedBoss.unlockLevel) {
      return api.sendMessage(`❌ Bạn cần Level ${selectedBoss.unlockLevel} để thách đấu ${selectedBoss.emoji} ${selectedBoss.name}!\n🎯 Level hiện tại: ${player.level}`, threadId, type);
    }
    
    // Kiểm tra cooldown
    const lastBattle = player.bossCooldowns[selectedBoss.name] || 0;
    const now = Date.now();
    if ((now - lastBattle) < selectedBoss.cooldown) {
      const remaining = Math.ceil((selectedBoss.cooldown - (now - lastBattle)) / 60000);
      return api.sendMessage(`⏰ Bạn cần đợi ${remaining} phút nữa mới có thể thách đấu ${selectedBoss.emoji} ${selectedBoss.name}!`, threadId, type);
    }

    // Bắt đầu boss battle
    const battleId = `${threadId}_${senderId}_${Date.now()}`;
    const battle = {
      bossName: selectedBoss.name,
      bossHp: selectedBoss.hp,
      maxBossHp: selectedBoss.hp,
      playerHp: Math.max(100, player.level * 20), // HP dựa trên level
      maxPlayerHp: Math.max(100, player.level * 20),
      playerId: senderId,
      threadId: threadId,
      turn: 'player',
      startTime: now
    };
    
    global.bossBattles.set(battleId, battle);
    
    // Set cooldown
    player.bossCooldowns[selectedBoss.name] = now;
    savePlayerData();

    const startMsg = [
      `⚔️ BOSS BATTLE BẮT ĐẦU!`,
      '',
      `${selectedBoss.emoji} **${selectedBoss.name}**`,
      `💪 Boss HP: ${battle.bossHp}/${battle.maxBossHp}`,
      `❤️ Your HP: ${battle.playerHp}/${battle.maxPlayerHp}`,
      '',
      `✨ ${selectedBoss.description}`,
      '',
      '🎮 **LƯỢT CỦA BẠN!**',
      '• Gõ "fishing attack" để tấn công',
      '• Gõ "fishing defend" để phòng thủ',
      '• Gõ "fishing heal" để hồi máu',
      '',
      '⏰ Bạn có 60 giây để hành động!'
    ].join('\n');

    // Set timeout để auto-lose nếu không hành động
    setTimeout(() => {
      const currentBattle = global.bossBattles.get(battleId);
      if (currentBattle) {
        global.bossBattles.delete(battleId);
        api.sendMessage(`⏰ Hết thời gian! ${selectedBoss.emoji} ${selectedBoss.name} đã thắng do bạn không hành động!`, threadId, type);
      }
    }, 60000);

    return api.sendMessage(startMsg, threadId, type);
  }

  // Boss Battle Actions
  if (action === 'attack' || action === 'defend' || action === 'heal') {
    // Tìm battle đang diễn ra của player
    let currentBattle = null;
    let battleId = null;
    
    for (const [id, battle] of global.bossBattles.entries()) {
      if (battle.playerId === senderId && battle.threadId === threadId) {
        currentBattle = battle;
        battleId = id;
        break;
      }
    }
    
    if (!currentBattle) {
      return api.sendMessage('❌ Bạn không đang trong battle nào!\n💡 Gõ "fishing boss" để bắt đầu thách đấu', threadId, type);
    }
    
    if (currentBattle.turn !== 'player') {
      return api.sendMessage('❌ Không phải lượt của bạn!', threadId, type);
    }

    const boss = BOSS_FISH[currentBattle.bossName];
    let battleMsg = [`⚔️ **BOSS BATTLE** - ${boss.emoji} ${boss.name}`, ''];
    
    // Xử lý hành động của player
    if (action === 'attack') {
      const damage = Math.floor(Math.random() * 50) + player.level * 2; // Damage dựa trên level
      currentBattle.bossHp -= damage;
      battleMsg.push(`⚔️ Bạn tấn công gây ${damage} damage!`);
      
      if (currentBattle.bossHp <= 0) {
        // Player thắng!
        global.bossBattles.delete(battleId);
        
        player.exp += boss.reward.exp;
        player.coins += boss.reward.coins;
        
        // Thêm boss items
        boss.reward.items.forEach(item => {
          if (player.bossItems[item]) {
            player.bossItems[item]++;
          } else {
            player.bossItems[item] = 1;
          }
        });
        
        savePlayerData();
        
        const winMsg = [
          `🎉 **CHIẾN THẮNG!** 🎉`,
          '',
          `${boss.emoji} ${boss.name} đã bị đánh bại!`,
          '',
          '🎁 **PHẦN THƯỞNG:**',
          `⭐ +${boss.reward.exp} EXP`,
          `💰 +${boss.reward.coins.toLocaleString()} coins`,
          `🎒 Items: ${boss.reward.items.join(', ')}`,
          '',
          `🎯 Level: ${player.level} | EXP: ${player.exp}`,
          `💰 Coins: ${player.coins.toLocaleString()}`,
          '',
          '🏆 Bạn đã chứng minh được sức mạnh của mình!'
        ].join('\n');
        
        return api.sendMessage(winMsg, threadId, type);
      }
      
    } else if (action === 'defend') {
      battleMsg.push(`🛡️ Bạn phòng thủ, giảm 50% damage nhận vào!`);
      currentBattle.defending = true;
      
    } else if (action === 'heal') {
      const healAmount = Math.floor(currentBattle.maxPlayerHp * 0.3);
      currentBattle.playerHp = Math.min(currentBattle.maxPlayerHp, currentBattle.playerHp + healAmount);
      battleMsg.push(`💚 Bạn hồi ${healAmount} HP!`);
    }
    
    // Lượt của boss
    if (currentBattle.bossHp > 0) {
      const bossDamage = Math.floor(Math.random() * boss.damage) + boss.damage / 2;
      const actualDamage = currentBattle.defending ? Math.floor(bossDamage / 2) : bossDamage;
      currentBattle.playerHp -= actualDamage;
      currentBattle.defending = false;
      
      battleMsg.push(`${boss.emoji} ${boss.name} tấn công gây ${actualDamage} damage!`);
      
      if (currentBattle.playerHp <= 0) {
        // Player thua!
        global.bossBattles.delete(battleId);
        
        const loseMsg = [
          `💀 **THẤT BẠI!** 💀`,
          '',
          `${boss.emoji} ${boss.name} đã đánh bại bạn!`,
          '',
          '😵 Bạn đã kiệt sức trong trận chiến',
          '💡 Hãy luyện tập thêm và thử lại sau!',
          '',
          `⏰ Cooldown: ${boss.cooldown / 3600000} giờ`
        ].join('\n');
        
        return api.sendMessage(loseMsg, threadId, type);
      }
    }
    
    // Tiếp tục battle
    battleMsg.push('');
    battleMsg.push(`💪 Boss HP: ${currentBattle.bossHp}/${currentBattle.maxBossHp}`);
    battleMsg.push(`❤️ Your HP: ${currentBattle.playerHp}/${currentBattle.maxPlayerHp}`);
    battleMsg.push('');
    battleMsg.push('🎮 **LƯỢT CỦA BẠN!**');
    battleMsg.push('• fishing attack - Tấn công');
    battleMsg.push('• fishing defend - Phòng thủ');
    battleMsg.push('• fishing heal - Hồi máu');
    
    currentBattle.turn = 'player';
    
    // Reset timeout
    setTimeout(() => {
      const battle = global.bossBattles.get(battleId);
      if (battle) {
        global.bossBattles.delete(battleId);
        api.sendMessage(`⏰ Hết thời gian! ${boss.emoji} ${boss.name} đã thắng do bạn không hành động!`, threadId, type);
      }
    }, 60000);
    
    return api.sendMessage(battleMsg.join('\n'), threadId, type);
  }

  // Tournament System
  if (action === 'tournament' || action === 'tour') {
    const subAction = args[1];
    
    // Nếu không có sub-action, hiển thị thông tin tournament
    if (!subAction) {
      const activeTournament = global.fishingTournaments.active;
      const tournaments = Object.values(TOURNAMENT_TYPES);
      
      let tournamentMenu = [
        `🏆 FISHING TOURNAMENT - ${userName}`,
        `🎯 Level: ${player.level} | 💰 Coins: ${player.coins.toLocaleString()}`,
        `🏅 Thống kê: ${player.tournamentStats.wins} thắng / ${player.tournamentStats.participations} tham gia`,
        ''
      ];

      if (activeTournament) {
        const timeLeft = Math.ceil((activeTournament.endTime - Date.now()) / 1000);
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        
        tournamentMenu.push('🔥 **TOURNAMENT ĐANG DIỄN RA:**');
        tournamentMenu.push(`${activeTournament.type.emoji} ${activeTournament.type.name}`);
        tournamentMenu.push(`⏰ Thời gian còn lại: ${minutes}:${seconds.toString().padStart(2, '0')}`);
        tournamentMenu.push(`👥 Người tham gia: ${activeTournament.participants.size}/${activeTournament.type.maxParticipants}`);
        tournamentMenu.push(`🎯 Mục tiêu: ${activeTournament.type.description}`);
        
        if (player.currentTournament === activeTournament.id) {
          const myStats = activeTournament.participants.get(senderId);
          tournamentMenu.push(`📊 Thành tích của bạn: ${myStats[activeTournament.type.goal] || 0}`);
        } else {
          tournamentMenu.push('💡 Bạn chưa tham gia tournament này!');
        }
        
        tournamentMenu.push('');
        tournamentMenu.push('🏆 **TOP 3 HIỆN TẠI:**');
        const sortedParticipants = Array.from(activeTournament.participants.entries())
          .sort((a, b) => (b[1][activeTournament.type.goal] || 0) - (a[1][activeTournament.type.goal] || 0))
          .slice(0, 3);
          
        sortedParticipants.forEach((participant, index) => {
          const [userId, stats] = participant;
          const rank = ['🥇', '🥈', '🥉'][index];
          tournamentMenu.push(`${rank} ${stats.name}: ${stats[activeTournament.type.goal] || 0}`);
        });
        
      } else {
        tournamentMenu.push('❌ **KHÔNG CÓ TOURNAMENT NÀO ĐANG DIỄN RA**');
        tournamentMenu.push('');
        tournamentMenu.push('🎮 **CÁC LOẠI TOURNAMENT:**');
        
        tournaments.forEach((tournament, index) => {
          tournamentMenu.push(`${index + 1}. ${tournament.emoji} ${tournament.name}`);
          tournamentMenu.push(`   ${tournament.description}`);
          tournamentMenu.push(`   ⏰ Thời gian: ${tournament.duration / 60000} phút`);
          tournamentMenu.push(`   💰 Phí tham gia: ${tournament.entryFee.toLocaleString()} coins`);
          tournamentMenu.push(`   👥 ${tournament.minParticipants}-${tournament.maxParticipants} người`);
          tournamentMenu.push('');
        });
        
        tournamentMenu.push('💡 **CÁCH TẠO TOURNAMENT:**');
        tournamentMenu.push('• fishing tournament create <số> - Tạo tournament');
        tournamentMenu.push('• Cần ít nhất 3 người tham gia để bắt đầu');
      }

      return api.sendMessage(tournamentMenu.join('\n'), threadId, type);
    }
    
    // Tạo tournament mới
    if (subAction === 'create') {
      const tournamentIndex = parseInt(args[2]) - 1;
      const tournaments = Object.values(TOURNAMENT_TYPES);
      
      if (global.fishingTournaments.active) {
        return api.sendMessage('❌ Đã có tournament đang diễn ra! Hãy đợi tournament hiện tại kết thúc.', threadId, type);
      }
      
      if (isNaN(tournamentIndex) || tournamentIndex < 0 || tournamentIndex >= tournaments.length) {
        return api.sendMessage('❌ Số thứ tự tournament không hợp lệ!\n💡 Gõ "fishing tournament" để xem danh sách', threadId, type);
      }

      const selectedTournament = tournaments[tournamentIndex];
      
      if (player.coins < selectedTournament.entryFee) {
        return api.sendMessage(`❌ Không đủ coins để tạo tournament!\n💰 Cần: ${selectedTournament.entryFee.toLocaleString()} coins\n💳 Có: ${player.coins.toLocaleString()} coins`, threadId, type);
      }

      // Tạo tournament mới
      const tournamentId = `${threadId}_${Date.now()}`;
      const tournament = {
        id: tournamentId,
        type: selectedTournament,
        creator: senderId,
        threadId: threadId,
        participants: new Map(),
        startTime: null,
        endTime: null,
        status: 'waiting', // waiting, active, finished
        prizePool: 0
      };
      
      // Thêm creator vào tournament
      player.coins -= selectedTournament.entryFee;
      player.currentTournament = tournamentId;
      tournament.participants.set(senderId, {
        name: userName,
        totalCatch: 0,
        rareCount: 0,
        coinsEarned: 0,
        joinTime: Date.now()
      });
      tournament.prizePool += selectedTournament.entryFee;
      
      global.fishingTournaments.active = tournament;
      savePlayerData();

      const createMsg = [
        `🏆 **TOURNAMENT ĐÃ ĐƯỢC TẠO!**`,
        '',
        `${selectedTournament.emoji} **${selectedTournament.name}**`,
        `🎯 ${selectedTournament.description}`,
        `⏰ Thời gian: ${selectedTournament.duration / 60000} phút`,
        `💰 Phí tham gia: ${selectedTournament.entryFee.toLocaleString()} coins`,
        `👥 Cần ${selectedTournament.minParticipants} người để bắt đầu`,
        '',
        `💳 Coins của bạn: ${player.coins.toLocaleString()}`,
        `🏆 Prize pool hiện tại: ${tournament.prizePool.toLocaleString()} coins`,
        '',
        '📢 **THÔNG BÁO CHO MỌI NGƯỜI:**',
        `"${userName} đã tạo tournament ${selectedTournament.name}!"`,
        '💡 Gõ "fishing tournament join" để tham gia!'
      ].join('\n');

      return api.sendMessage(createMsg, threadId, type);
    }
    
    // Tham gia tournament
    if (subAction === 'join') {
      const activeTournament = global.fishingTournaments.active;
      
      if (!activeTournament) {
        return api.sendMessage('❌ Không có tournament nào đang mở!\n💡 Gõ "fishing tournament create <số>" để tạo tournament mới', threadId, type);
      }
      
      if (activeTournament.threadId !== threadId) {
        return api.sendMessage('❌ Tournament này không thuộc nhóm chat này!', threadId, type);
      }
      
      if (activeTournament.status !== 'waiting') {
        return api.sendMessage('❌ Tournament đã bắt đầu hoặc kết thúc! Không thể tham gia.', threadId, type);
      }
      
      if (activeTournament.participants.has(senderId)) {
        return api.sendMessage('❌ Bạn đã tham gia tournament này rồi!', threadId, type);
      }
      
      if (activeTournament.participants.size >= activeTournament.type.maxParticipants) {
        return api.sendMessage(`❌ Tournament đã đầy! (${activeTournament.type.maxParticipants} người)`, threadId, type);
      }
      
      if (player.coins < activeTournament.type.entryFee) {
        return api.sendMessage(`❌ Không đủ coins để tham gia!\n💰 Cần: ${activeTournament.type.entryFee.toLocaleString()} coins\n💳 Có: ${player.coins.toLocaleString()} coins`, threadId, type);
      }

      // Tham gia tournament
      player.coins -= activeTournament.type.entryFee;
      player.currentTournament = activeTournament.id;
      activeTournament.participants.set(senderId, {
        name: userName,
        totalCatch: 0,
        rareCount: 0,
        coinsEarned: 0,
        joinTime: Date.now()
      });
      activeTournament.prizePool += activeTournament.type.entryFee;
      
      savePlayerData();

      const joinMsg = [
        `🎉 **THAM GIA TOURNAMENT THÀNH CÔNG!**`,
        '',
        `${activeTournament.type.emoji} **${activeTournament.type.name}**`,
        `👥 Người tham gia: ${activeTournament.participants.size}/${activeTournament.type.maxParticipants}`,
        `💰 Đã trả phí: ${activeTournament.type.entryFee.toLocaleString()} coins`,
        `💳 Coins còn lại: ${player.coins.toLocaleString()}`,
        `🏆 Prize pool: ${activeTournament.prizePool.toLocaleString()} coins`,
        '',
        activeTournament.participants.size >= activeTournament.type.minParticipants ? 
          '✅ Đủ người tham gia! Tournament sẽ bắt đầu sau 30 giây...' :
          `⏳ Cần thêm ${activeTournament.type.minParticipants - activeTournament.participants.size} người nữa để bắt đầu`,
        '',
        '🎯 Sẵn sàng cho cuộc thi câu cá!'
      ].join('\n');

      // Tự động bắt đầu tournament nếu đủ người
      if (activeTournament.participants.size >= activeTournament.type.minParticipants) {
        setTimeout(() => {
          const tournament = global.fishingTournaments.active;
          if (tournament && tournament.id === activeTournament.id && tournament.status === 'waiting') {
            startTournament(tournament, api, threadId);
          }
        }, 30000);
      }

      return api.sendMessage(joinMsg, threadId, type);
    }
    
    return api.sendMessage('❌ Lệnh tournament không hợp lệ!\n💡 Sử dụng: fishing tournament [create/join]', threadId, type);
  }

  // Guild System
  if (action === 'guild' || action === 'hoi') {
    const subAction = args[1];
    
    // Nếu không có sub-action, hiển thị thông tin guild
    if (!subAction) {
      const playerGuild = player.guild;
      
      if (!playerGuild.id) {
        // Người chơi chưa có guild
        const availableGuilds = Array.from(global.fishingGuilds.guilds.values())
          .filter(guild => guild.members.size < GUILD_LEVELS[guild.level].maxMembers)
          .slice(0, 5);
        
        let guildMenu = [
          `🏰 FISHING GUILD - ${userName}`,
          `🎯 Level: ${player.level} | 💰 Coins: ${player.coins.toLocaleString()}`,
          '',
          '❌ **BẠN CHƯA THAM GIA GUILD NÀO**',
          '',
          '🎮 **LỆNH GUILD:**',
          '• fishing guild create <tên> - Tạo guild mới (1000 coins)',
          '• fishing guild join <id> - Tham gia guild',
          '• fishing guild list - Xem danh sách guild công khai',
          '',
          '💡 **LỢI ÍCH GUILD:**',
          '• Bonus EXP và Coins khi câu cá',
          '• Chat riêng với thành viên guild',
          '• Tham gia Guild Wars và events',
          '• Chia sẻ tài nguyên và kinh nghiệm'
        ];
        
        if (availableGuilds.length > 0) {
          guildMenu.push('');
          guildMenu.push('🏰 **GUILD CÓ THỂ THAM GIA:**');
          availableGuilds.forEach(guild => {
            const guildLevel = GUILD_LEVELS[guild.level];
            guildMenu.push(`${guild.id}. ${guild.name} (${guild.members.size}/${guildLevel.maxMembers})`);
            guildMenu.push(`   Level ${guild.level} - ${guildLevel.name}`);
            guildMenu.push(`   Bonus: +${Math.round(guildLevel.bonus.exp * 100)}% EXP, +${Math.round(guildLevel.bonus.coins * 100)}% Coins`);
          });
        }
        
        return api.sendMessage(guildMenu.join('\n'), threadId, type);
      } else {
        // Người chơi đã có guild
        const guild = global.fishingGuilds.guilds.get(playerGuild.id);
        if (!guild) {
          // Guild không tồn tại, reset player guild
          player.guild = { id: null, role: null, joinDate: null, contribution: 0 };
          savePlayerData();
          return api.sendMessage('❌ Guild không tồn tại! Đã reset thông tin guild của bạn.', threadId, type);
        }
        
        const guildLevel = GUILD_LEVELS[guild.level];
        const roleInfo = GUILD_ROLES[playerGuild.role];
        
        // Sắp xếp members theo contribution
        const sortedMembers = Array.from(guild.members.entries())
          .sort((a, b) => b[1].contribution - a[1].contribution);
        
        let guildInfo = [
          `🏰 **${guild.name.toUpperCase()}** - Level ${guild.level}`,
          `${roleInfo.emoji} Vai trò của bạn: ${roleInfo.name}`,
          `📊 Đóng góp: ${playerGuild.contribution.toLocaleString()} coins`,
          `📅 Tham gia: ${new Date(playerGuild.joinDate).toLocaleDateString()}`,
          '',
          `🎯 **THÔNG TIN GUILD:**`,
          `👥 Thành viên: ${guild.members.size}/${guildLevel.maxMembers}`,
          `⭐ Cấp độ: ${guild.level} - ${guildLevel.name}`,
          `💰 Kho bạc: ${guild.treasury.toLocaleString()} coins`,
          `🎁 Bonus: +${Math.round(guildLevel.bonus.exp * 100)}% EXP, +${Math.round(guildLevel.bonus.coins * 100)}% Coins`,
          '',
          '👥 **TOP ĐÓNG GÓP:**'
        ];
        
        sortedMembers.slice(0, 5).forEach((member, index) => {
          const [userId, memberData] = member;
          const memberRole = GUILD_ROLES[memberData.role];
          const rank = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
          guildInfo.push(`${rank} ${memberRole.emoji} ${memberData.name}: ${memberData.contribution.toLocaleString()}`);
        });
        
        guildInfo.push('');
        guildInfo.push('🎮 **LỆNH GUILD:**');
        
        if (roleInfo.permissions.includes('invite')) {
          guildInfo.push('• fishing guild invite <@user> - Mời người vào guild');
        }
        if (roleInfo.permissions.includes('kick')) {
          guildInfo.push('• fishing guild kick <@user> - Đuổi thành viên');
        }
        if (roleInfo.permissions.includes('promote')) {
          guildInfo.push('• fishing guild promote <@user> - Thăng chức');
        }
        if (roleInfo.permissions.includes('upgrade')) {
          guildInfo.push('• fishing guild upgrade - Nâng cấp guild');
        }
        
        guildInfo.push('• fishing guild leave - Rời guild');
        guildInfo.push('• fishing guild donate <số> - Đóng góp coins');
        
        return api.sendMessage(guildInfo.join('\n'), threadId, type);
      }
    }
    
    // Tạo guild mới
    if (subAction === 'create') {
      if (player.guild.id) {
        return api.sendMessage('❌ Bạn đã tham gia guild rồi! Hãy rời guild hiện tại trước.', threadId, type);
      }
      
      const guildName = args.slice(2).join(' ');
      if (!guildName || guildName.length < 3 || guildName.length > 20) {
        return api.sendMessage('❌ Tên guild phải từ 3-20 ký tự!\n💡 Ví dụ: fishing guild create Câu Cá Siêu Sao', threadId, type);
      }
      
      // Kiểm tra tên guild đã tồn tại
      const existingGuild = Array.from(global.fishingGuilds.guilds.values())
        .find(guild => guild.name.toLowerCase() === guildName.toLowerCase());
      
      if (existingGuild) {
        return api.sendMessage('❌ Tên guild đã tồn tại! Hãy chọn tên khác.', threadId, type);
      }
      
      if (player.coins < 1000) {
        return api.sendMessage('❌ Không đủ coins để tạo guild!\n💰 Cần: 1,000 coins\n💳 Có: ' + player.coins.toLocaleString() + ' coins', threadId, type);
      }
      
      // Tạo guild mới
      const guildId = global.fishingGuilds.guilds.size + 1;
      const newGuild = {
        id: guildId,
        name: guildName,
        level: 1,
        treasury: 0,
        createdDate: Date.now(),
        leader: senderId,
        members: new Map(),
        settings: {
          public: true,
          autoAccept: false
        }
      };
      
      // Thêm leader vào guild
      newGuild.members.set(senderId, {
        name: userName,
        role: 'Leader',
        joinDate: Date.now(),
        contribution: 0,
        lastActive: Date.now()
      });
      
      // Cập nhật player data
      player.guild = {
        id: guildId,
        role: 'Leader',
        joinDate: Date.now(),
        contribution: 0
      };
      player.coins -= 1000;
      
      global.fishingGuilds.guilds.set(guildId, newGuild);
      savePlayerData();
      saveGuildData();
      
      const createMsg = [
        `🏰 **GUILD ĐÃ ĐƯỢC TẠO!**`,
        '',
        `👑 **${guildName}** - ID: ${guildId}`,
        `🎯 Bạn là Hội Trưởng của guild này`,
        `💰 Đã trả: 1,000 coins`,
        `💳 Coins còn lại: ${player.coins.toLocaleString()}`,
        '',
        '🎁 **LỢI ÍCH GUILD LEVEL 1:**',
        '• +5% EXP khi câu cá',
        '• +5% Coins khi câu cá',
        '• Tối đa 5 thành viên',
        '',
        '💡 **BƯỚC TIẾP THEO:**',
        '• fishing guild invite <@user> - Mời bạn bè',
        '• fishing guild donate <số> - Đóng góp để nâng cấp',
        '• fishing guild upgrade - Nâng cấp guild'
      ].join('\n');
      
      return api.sendMessage(createMsg, threadId, type);
    }
    
    // Tham gia guild
    if (subAction === 'join') {
      if (player.guild.id) {
        return api.sendMessage('❌ Bạn đã tham gia guild rồi! Hãy rời guild hiện tại trước.', threadId, type);
      }
      
      const guildId = parseInt(args[2]);
      if (isNaN(guildId)) {
        return api.sendMessage('❌ ID guild không hợp lệ!\n💡 Ví dụ: fishing guild join 1', threadId, type);
      }
      
      const guild = global.fishingGuilds.guilds.get(guildId);
      if (!guild) {
        return api.sendMessage('❌ Guild không tồn tại!', threadId, type);
      }
      
      const guildLevel = GUILD_LEVELS[guild.level];
      if (guild.members.size >= guildLevel.maxMembers) {
        return api.sendMessage(`❌ Guild đã đầy! (${guild.members.size}/${guildLevel.maxMembers} thành viên)`, threadId, type);
      }
      
      if (!guild.settings.public) {
        return api.sendMessage('❌ Guild này không công khai! Cần được mời để tham gia.', threadId, type);
      }
      
      // Tham gia guild
      guild.members.set(senderId, {
        name: userName,
        role: 'Member',
        joinDate: Date.now(),
        contribution: 0,
        lastActive: Date.now()
      });
      
      player.guild = {
        id: guildId,
        role: 'Member',
        joinDate: Date.now(),
        contribution: 0
      };
      
      savePlayerData();
      saveGuildData();
      
      const joinMsg = [
        `🎉 **THAM GIA GUILD THÀNH CÔNG!**`,
        '',
        `🏰 **${guild.name}** - Level ${guild.level}`,
        `👤 Vai trò: Thành Viên`,
        `👥 Thành viên: ${guild.members.size}/${guildLevel.maxMembers}`,
        '',
        '🎁 **LỢI ÍCH NHẬN ĐƯỢC:**',
        `• +${Math.round(guildLevel.bonus.exp * 100)}% EXP khi câu cá`,
        `• +${Math.round(guildLevel.bonus.coins * 100)}% Coins khi câu cá`,
        '',
        '💡 Gõ "fishing guild" để xem thông tin chi tiết!'
      ].join('\n');
      
      return api.sendMessage(joinMsg, threadId, type);
    }
    
    // Rời guild
    if (subAction === 'leave') {
      if (!player.guild.id) {
        return api.sendMessage('❌ Bạn chưa tham gia guild nào!', threadId, type);
      }
      
      const guild = global.fishingGuilds.guilds.get(player.guild.id);
      if (!guild) {
        player.guild = { id: null, role: null, joinDate: null, contribution: 0 };
        savePlayerData();
        return api.sendMessage('❌ Guild không tồn tại! Đã reset thông tin guild của bạn.', threadId, type);
      }
      
      if (player.guild.role === 'Leader') {
        return api.sendMessage('❌ Hội trưởng không thể rời guild! Hãy chuyển quyền lãnh đạo hoặc giải tán guild.', threadId, type);
      }
      
      // Xóa khỏi guild
      guild.members.delete(senderId);
      player.guild = { id: null, role: null, joinDate: null, contribution: 0 };
      savePlayerData();
      saveGuildData();
      
      return api.sendMessage(`✅ Đã rời guild **${guild.name}** thành công!`, threadId, type);
    }
    
    // Đóng góp coins
    if (subAction === 'donate') {
      if (!player.guild.id) {
        return api.sendMessage('❌ Bạn chưa tham gia guild nào!', threadId, type);
      }
      
      const amount = parseInt(args[2]);
      if (isNaN(amount) || amount <= 0) {
        return api.sendMessage('❌ Số coins không hợp lệ!\n💡 Ví dụ: fishing guild donate 1000', threadId, type);
      }
      
      if (player.coins < amount) {
        return api.sendMessage(`❌ Không đủ coins!\n💰 Cần: ${amount.toLocaleString()}\n💳 Có: ${player.coins.toLocaleString()}`, threadId, type);
      }
      
      const guild = global.fishingGuilds.guilds.get(player.guild.id);
      if (!guild) {
        player.guild = { id: null, role: null, joinDate: null, contribution: 0 };
        savePlayerData();
        return api.sendMessage('❌ Guild không tồn tại! Đã reset thông tin guild của bạn.', threadId, type);
      }
      
      // Thực hiện đóng góp
      player.coins -= amount;
      player.guild.contribution += amount;
      guild.treasury += amount;
      
      // Cập nhật member data trong guild
      const memberData = guild.members.get(senderId);
      if (memberData) {
        memberData.contribution += amount;
      }
      
      savePlayerData();
      saveGuildData();
      
      const donateMsg = [
        `💰 **ĐÓNG GÓP THÀNH CÔNG!**`,
        '',
        `🏰 Guild: **${guild.name}**`,
        `💵 Đã đóng góp: ${amount.toLocaleString()} coins`,
        `💳 Coins còn lại: ${player.coins.toLocaleString()}`,
        `📊 Tổng đóng góp của bạn: ${player.guild.contribution.toLocaleString()}`,
        `🏦 Kho bạc guild: ${guild.treasury.toLocaleString()}`,
        '',
        '💡 Đóng góp giúp guild nâng cấp và nhận bonus cao hơn!'
      ].join('\n');
      
      return api.sendMessage(donateMsg, threadId, type);
    }
    
    // Nâng cấp guild
    if (subAction === 'upgrade') {
      if (!player.guild.id) {
        return api.sendMessage('❌ Bạn chưa tham gia guild nào!', threadId, type);
      }
      
      const guild = global.fishingGuilds.guilds.get(player.guild.id);
      if (!guild) {
        player.guild = { id: null, role: null, joinDate: null, contribution: 0 };
        savePlayerData();
        return api.sendMessage('❌ Guild không tồn tại! Đã reset thông tin guild của bạn.', threadId, type);
      }
      
      const roleInfo = GUILD_ROLES[player.guild.role];
      if (!roleInfo.permissions.includes('upgrade')) {
        return api.sendMessage('❌ Bạn không có quyền nâng cấp guild!', threadId, type);
      }
      
      const currentLevel = guild.level;
      const nextLevel = currentLevel + 1;
      const nextLevelData = GUILD_LEVELS[nextLevel];
      
      if (!nextLevelData) {
        return api.sendMessage('✨ Guild đã đạt cấp độ tối đa!', threadId, type);
      }
      
      if (guild.treasury < nextLevelData.cost) {
        return api.sendMessage(
          `❌ Kho bạc guild không đủ để nâng cấp!\n💰 Cần: ${nextLevelData.cost.toLocaleString()}\n🏦 Có: ${guild.treasury.toLocaleString()}`,
          threadId, type
        );
      }
      
      // Thực hiện nâng cấp
      guild.treasury -= nextLevelData.cost;
      guild.level = nextLevel;
      savePlayerData();
      saveGuildData();
      
      const upgradeMsg = [
        `🎉 **GUILD NÂNG CẤP THÀNH CÔNG!**`,
        '',
        `🏰 **${guild.name}**`,
        `⬆️ Level: ${currentLevel} → ${nextLevel}`,
        `⭐ Cấp độ: ${nextLevelData.name}`,
        `💰 Chi phí: ${nextLevelData.cost.toLocaleString()} coins`,
        `🏦 Kho bạc còn lại: ${guild.treasury.toLocaleString()}`,
        '',
        `🎁 **BONUS MỚI:**`,
        `👥 Tối đa ${nextLevelData.maxMembers} thành viên`,
        `⭐ +${Math.round(nextLevelData.bonus.exp * 100)}% EXP`,
        `💰 +${Math.round(nextLevelData.bonus.coins * 100)}% Coins`,
        '',
        '🎊 Chúc mừng guild đã lên cấp!'
      ].join('\n');
      
      return api.sendMessage(upgradeMsg, threadId, type);
    }
    
    return api.sendMessage('❌ Lệnh guild không hợp lệ!\n💡 Sử dụng: fishing guild [create/join/leave/donate/upgrade]', threadId, type);
  }

  // VIP System
  if (action === 'vip') {
    const subAction = args[1];
    
    if (!subAction) {
      // Hiển thị VIP status
      const currentVIP = player.vip.level;
      const currentVIPData = VIP_LEVELS[currentVIP] || null;
      const nextVIP = currentVIP + 1;
      const nextVIPData = VIP_LEVELS[nextVIP] || null;
      
      let vipStatus = [
        `👑 VIP STATUS - ${userName}`,
        `💰 Coins: ${player.coins.toLocaleString()}`,
        `📊 Level: ${player.level} | 🎣 Total Catch: ${player.totalCatch}`,
        ''
      ];
      
      if (currentVIP === 0) {
        vipStatus.push('❌ **CHƯA CÓ VIP**');
        vipStatus.push('');
        vipStatus.push('🌟 **VIP BENEFITS:**');
        vipStatus.push('• Bonus EXP khi câu cá');
        vipStatus.push('• Bonus Coins khi câu cá');
        vipStatus.push('• Tăng tỷ lệ cá hiếm');
        vipStatus.push('• Giảm cooldown câu cá');
        vipStatus.push('• VIP badge trong profile');
      } else {
        vipStatus.push(`✅ **${currentVIPData.description}**`);
        vipStatus.push(`📅 Mua ngày: ${new Date(player.vip.purchaseDate).toLocaleDateString()}`);
        vipStatus.push(`💸 Tổng chi tiêu: ${player.vip.totalSpent.toLocaleString()} coins`);
        vipStatus.push('');
        vipStatus.push('🎁 **BENEFITS HIỆN TẠI:**');
        vipStatus.push(`• +${currentVIPData.benefits.expBonus}% EXP`);
        vipStatus.push(`• +${currentVIPData.benefits.coinBonus}% Coins`);
        vipStatus.push(`• +${currentVIPData.benefits.rareBonus}% Rare Fish`);
        vipStatus.push(`• -${currentVIPData.benefits.cooldownReduction}% Cooldown`);
      }
      
      if (nextVIPData) {
        vipStatus.push('');
        vipStatus.push(`🚀 **NEXT VIP ${nextVIP}:**`);
        vipStatus.push(`${nextVIPData.description}`);
        vipStatus.push(`💰 Giá: ${nextVIPData.price.toLocaleString()} coins`);
        vipStatus.push(`💡 Lệnh: fishing vip buy ${nextVIP}`);
      } else if (currentVIP === 1000) {
        vipStatus.push('');
        vipStatus.push('🏆 **CHÚC MỪNG! BẠN ĐÃ ĐẠT VIP MAX!**');
        vipStatus.push('👑 Legendary VIP 1000 - Đỉnh cao của đỉnh cao!');
      }
      
      // Hiển thị top VIP tiers
      vipStatus.push('');
      vipStatus.push('🏆 **VIP TIERS:**');
      vipStatus.push('🥉 Bronze (1-49) | 🥈 Silver (50-99) | 🥇 Gold (100-199)');
      vipStatus.push('🏆 Platinum (200-399) | 💎 Diamond (400-599)');
      vipStatus.push('🌟 Mythic (600-799) | 👑 Legendary (800-1000)');
      
      return api.sendMessage(vipStatus.join('\n'), threadId, type);
    }
    
    if (subAction === 'buy') {
      const targetLevel = parseInt(args[2]);
      
      if (isNaN(targetLevel) || targetLevel < 1 || targetLevel > 1000) {
        return api.sendMessage('❌ VIP level không hợp lệ! Chọn từ 1-1000.\n💡 Ví dụ: fishing vip buy 5', threadId, type);
      }
      
      if (targetLevel <= player.vip.level) {
        return api.sendMessage(`❌ Bạn đã có VIP ${player.vip.level}! Chỉ có thể mua level cao hơn.`, threadId, type);
      }
      
      const targetVIPData = VIP_LEVELS[targetLevel];
      if (!targetVIPData) {
        return api.sendMessage('❌ VIP level không tồn tại!', threadId, type);
      }
      
      // Tính tổng chi phí từ level hiện tại đến target level
      let totalCost = 0;
      for (let level = player.vip.level + 1; level <= targetLevel; level++) {
        totalCost += VIP_LEVELS[level].price;
      }
      
      if (player.coins < totalCost) {
        return api.sendMessage(
          `❌ Không đủ coins để mua VIP ${targetLevel}!\n💰 Cần: ${totalCost.toLocaleString()}\n💳 Có: ${player.coins.toLocaleString()}\n💸 Thiếu: ${(totalCost - player.coins).toLocaleString()}`,
          threadId, type
        );
      }
      
      // Thực hiện mua VIP
      player.coins -= totalCost;
      player.vip.level = targetLevel;
      player.vip.purchaseDate = Date.now();
      player.vip.totalSpent += totalCost;
      
      savePlayerData();
      
      const purchaseMsg = [
        `🎉 **MUA VIP THÀNH CÔNG!**`,
        '',
        `${targetVIPData.description}`,
        `💰 Chi phí: ${totalCost.toLocaleString()} coins`,
        `💳 Coins còn lại: ${player.coins.toLocaleString()}`,
        `💸 Tổng chi tiêu VIP: ${player.vip.totalSpent.toLocaleString()}`,
        '',
        '🎁 **BENEFITS MỚI:**',
        `• +${targetVIPData.benefits.expBonus}% EXP khi câu cá`,
        `• +${targetVIPData.benefits.coinBonus}% Coins khi câu cá`,
        `• +${targetVIPData.benefits.rareBonus}% Rare Fish`,
        `• -${targetVIPData.benefits.cooldownReduction}% Cooldown`,
        '',
        '✨ VIP benefits sẽ áp dụng ngay từ lần câu cá tiếp theo!'
      ].join('\n');
      
      return api.sendMessage(purchaseMsg, threadId, type);
    }
    
    if (subAction === 'top') {
      // Hiển thị top VIP levels với giá
      const topVIPs = [
        `👑 TOP VIP LEVELS - FISHING GAME`,
        '',
        '🏆 **LEGENDARY TIER (800-1000):**'
      ];
      
      // Hiển thị một số VIP levels quan trọng
      const importantLevels = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      importantLevels.forEach(level => {
        const vipData = VIP_LEVELS[level];
        topVIPs.push(`${vipData.emoji} VIP ${level} - ${vipData.tierName}: ${vipData.price.toLocaleString()} coins`);
      });
      
      topVIPs.push('');
      topVIPs.push('💡 **CÁCH MUA:**');
      topVIPs.push('• fishing vip buy <level> - Mua VIP level cụ thể');
      topVIPs.push('• Có thể mua nhảy cấp (tự động tính tổng chi phí)');
      topVIPs.push('• VIP benefits áp dụng ngay lập tức');
      
      return api.sendMessage(topVIPs.join('\n'), threadId, type);
    }
    
    if (subAction === 'leaderboard' || subAction === 'lb') {
      // Tạo VIP leaderboard
      const allPlayers = Array.from(playerData.entries())
        .map(([userId, data]) => ({
          userId,
          name: data.name || 'Unknown',
          vipLevel: data.vip?.level || 0,
          totalSpent: data.vip?.totalSpent || 0
        }))
        .filter(player => player.vipLevel > 0)
        .sort((a, b) => {
          if (b.vipLevel !== a.vipLevel) return b.vipLevel - a.vipLevel;
          return b.totalSpent - a.totalSpent;
        })
        .slice(0, 10);
      
      if (allPlayers.length === 0) {
        return api.sendMessage('👑 Chưa có ai mua VIP! Hãy là người đầu tiên với "fishing vip buy 1"', threadId, type);
      }
      
      const leaderboard = [
        '👑 **VIP LEADERBOARD - TOP 10**',
        ''
      ];
      
      allPlayers.forEach((player, index) => {
        const rank = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][index];
        const vipData = VIP_LEVELS[player.vipLevel];
        leaderboard.push(`${rank} ${vipData.emoji} **${player.name}**`);
        leaderboard.push(`   VIP ${player.vipLevel} - ${vipData.tierName}`);
        leaderboard.push(`   💸 Chi tiêu: ${player.totalSpent.toLocaleString()} coins`);
        if (index < allPlayers.length - 1) leaderboard.push('');
      });
      
      leaderboard.push('');
      leaderboard.push('💡 Gõ "fishing vip" để xem VIP status của bạn!');
      
      return api.sendMessage(leaderboard.join('\n'), threadId, type);
    }
    
    return api.sendMessage('❌ Lệnh VIP không hợp lệ!\n💡 Sử dụng: fishing vip [buy <level>/top/leaderboard]', threadId, type);
  }

  // Achievement System
  if (action === 'achievement' || action === 'thanhtuu' || action === 'tt') {
    const playerAchievements = player.achievements || [];
    const allAchievements = Object.values(ACHIEVEMENTS);
    
    // Tính toán thành tựu có thể đạt được
    const availableAchievements = allAchievements.filter(ach => !playerAchievements.includes(ach.id));
    const completedAchievements = allAchievements.filter(ach => playerAchievements.includes(ach.id));
    
    let achievementMenu = [
      `🏆 THÀNH TỰU CÂU CÁ - ${userName}`,
      `🎯 Level: ${player.level} | 💰 Coins: ${player.coins.toLocaleString()}`,
      `🏅 Đã đạt: ${completedAchievements.length}/${allAchievements.length} thành tựu`,
      ''
    ];

    if (completedAchievements.length > 0) {
      achievementMenu.push('✅ **THÀNH TỰU ĐÃ ĐẠT:**');
      
      // Sắp xếp theo rarity
      const sortedCompleted = completedAchievements.sort((a, b) => {
        const rarityOrder = { 'legendary': 4, 'epic': 3, 'rare': 2, 'common': 1 };
        return rarityOrder[b.rarity] - rarityOrder[a.rarity];
      });
      
      sortedCompleted.slice(0, 8).forEach(ach => {
        const rarityEmoji = {
          'legendary': '🌟',
          'epic': '💜',
          'rare': '💙',
          'common': '🤍'
        };
        achievementMenu.push(`${ach.emoji} ${rarityEmoji[ach.rarity]} **${ach.name}**`);
        achievementMenu.push(`   ${ach.description}`);
      });
      
      if (completedAchievements.length > 8) {
        achievementMenu.push(`   ... và ${completedAchievements.length - 8} thành tựu khác`);
      }
      achievementMenu.push('');
    }

    // Hiển thị thành tựu gần đạt được
    const nearAchievements = availableAchievements.filter(ach => {
      return checkAchievementProgress(player, ach) >= 0.5; // >= 50% progress
    }).slice(0, 5);

    if (nearAchievements.length > 0) {
      achievementMenu.push('🎯 **THÀNH TỰU GẦN ĐẠT:**');
      nearAchievements.forEach(ach => {
        const progress = checkAchievementProgress(player, ach);
        const progressPercent = Math.round(progress * 100);
        achievementMenu.push(`${ach.emoji} **${ach.name}** (${progressPercent}%)`);
        achievementMenu.push(`   ${ach.description}`);
        achievementMenu.push(`   🎁 Phần thưởng: ${ach.reward.coins} coins, ${ach.reward.exp} EXP`);
      });
      achievementMenu.push('');
    }

    // Hiển thị một số thành tựu khác
    const otherAchievements = availableAchievements
      .filter(ach => !nearAchievements.includes(ach))
      .slice(0, 5);

    if (otherAchievements.length > 0) {
      achievementMenu.push('📋 **THÀNH TỰU KHÁC:**');
      otherAchievements.forEach(ach => {
        const progress = checkAchievementProgress(player, ach);
        const progressPercent = Math.round(progress * 100);
        achievementMenu.push(`${ach.emoji} **${ach.name}** (${progressPercent}%)`);
        achievementMenu.push(`   ${ach.description}`);
      });
      achievementMenu.push('');
    }

    achievementMenu.push('💡 **CÁCH ĐẠT THÀNH TỰU:**');
    achievementMenu.push('• 🎣 Câu cá thường xuyên để đạt milestone');
    achievementMenu.push('• 🍣 Tập trung câu cá hiếm và huyền thoại');
    achievementMenu.push('• 🏆 Tham gia tournament và guild');
    achievementMenu.push('• ⚔️ Thách đấu boss để có thành tựu đặc biệt');

    return api.sendMessage(achievementMenu.join('\n'), threadId, type);
  }

  // Equipment Upgrade System
  if (action === 'upgrade' || action === 'nangcap' || action === 'nc') {
    const currentRod = player.currentRod;
    const currentLevel = player.equipmentLevels[currentRod] || 0;
    const upgradeData = EQUIPMENT_UPGRADES[currentRod];
    
    if (!upgradeData) {
      return api.sendMessage('❌ Cần câu hiện tại không thể nâng cấp!', threadId, type);
    }
    
    if (currentLevel >= upgradeData.maxLevel) {
      return api.sendMessage(`✨ ${currentRod} đã đạt cấp độ tối đa (+${upgradeData.maxLevel})!`, threadId, type);
    }
    
    const nextLevel = currentLevel + 1;
    const upgrade = upgradeData.upgrades[nextLevel];
    
    if (!upgrade) {
      return api.sendMessage('❌ Không thể nâng cấp thêm!', threadId, type);
    }
    
    // Nếu có tham số, thực hiện nâng cấp
    if (args[1] === 'confirm' || args[1] === 'xacnhan') {
      if (player.coins < upgrade.cost) {
        return api.sendMessage(
          `❌ Không đủ coins để nâng cấp!\n💰 Cần: ${upgrade.cost.toLocaleString()} coins\n💰 Có: ${player.coins.toLocaleString()} coins`,
          threadId, type
        );
      }
      
      // Thực hiện nâng cấp
      player.coins -= upgrade.cost;
      player.equipmentLevels[currentRod] = nextLevel;
      
      savePlayerData();
      
      const upgradeMsg = [
        `✨ **NÂNG CẤP THÀNH CÔNG!** ✨`,
        '',
        `🎣 **${currentRod} ${upgrade.name}**`,
        `⬆️ Cấp độ: ${currentLevel} → ${nextLevel}`,
        `💰 Chi phí: ${upgrade.cost.toLocaleString()} coins`,
        '',
        `🎁 **BONUS MỚI:**`,
        `⭐ +${Math.round(upgrade.bonus.exp * 100)}% EXP`,
        `🍀 +${Math.round(upgrade.bonus.luck * 100)}% Luck (cá hiếm)`,
        '',
        `💰 Coins còn lại: ${player.coins.toLocaleString()}`,
        '',
        '🎣 Bonus sẽ áp dụng ngay từ lần câu tiếp theo!'
      ].join('\n');
      
      return api.sendMessage(upgradeMsg, threadId, type);
    }
    
    // Hiển thị thông tin nâng cấp
    const currentBonus = currentLevel > 0 ? upgradeData.upgrades[currentLevel] : null;
    
    let upgradeMenu = [
      `🔧 NÂNG CẤP THIẾT BỊ - ${userName}`,
      `🎯 Level: ${player.level} | 💰 Coins: ${player.coins.toLocaleString()}`,
      '',
      `🎣 **${currentRod}** ${currentLevel > 0 ? `+${currentLevel}` : '(Chưa nâng cấp)'}`,
    ];
    
    if (currentBonus) {
      upgradeMenu.push('');
      upgradeMenu.push('✨ **BONUS HIỆN TẠI:**');
      upgradeMenu.push(`⭐ +${Math.round(currentBonus.bonus.exp * 100)}% EXP`);
      upgradeMenu.push(`🍀 +${Math.round(currentBonus.bonus.luck * 100)}% Luck`);
    }
    
    upgradeMenu.push('');
    upgradeMenu.push(`🔼 **NÂNG CẤP TIẾP THEO: +${nextLevel}**`);
    upgradeMenu.push(`💰 Chi phí: ${upgrade.cost.toLocaleString()} coins`);
    upgradeMenu.push('');
    upgradeMenu.push('🎁 **BONUS SAU NÂNG CẤP:**');
    upgradeMenu.push(`⭐ +${Math.round(upgrade.bonus.exp * 100)}% EXP`);
    upgradeMenu.push(`🍀 +${Math.round(upgrade.bonus.luck * 100)}% Luck`);
    
    const expIncrease = currentBonus ? 
      Math.round((upgrade.bonus.exp - currentBonus.bonus.exp) * 100) : 
      Math.round(upgrade.bonus.exp * 100);
    const luckIncrease = currentBonus ? 
      Math.round((upgrade.bonus.luck - currentBonus.bonus.luck) * 100) : 
      Math.round(upgrade.bonus.luck * 100);
    
    upgradeMenu.push('');
    upgradeMenu.push('📈 **TĂNG THÊM:**');
    upgradeMenu.push(`⭐ +${expIncrease}% EXP`);
    upgradeMenu.push(`🍀 +${luckIncrease}% Luck`);
    
    upgradeMenu.push('');
    upgradeMenu.push(`🎯 Tiến độ: ${nextLevel}/${upgradeData.maxLevel}`);
    
    if (player.coins >= upgrade.cost) {
      upgradeMenu.push('');
      upgradeMenu.push('✅ **ĐỦ COINS ĐỂ NÂNG CẤP!**');
      upgradeMenu.push('💡 Gõ "fishing upgrade confirm" để nâng cấp');
    } else {
      upgradeMenu.push('');
      upgradeMenu.push('❌ **CHƯA ĐỦ COINS**');
      upgradeMenu.push(`💰 Cần thêm: ${(upgrade.cost - player.coins).toLocaleString()} coins`);
    }
    
    upgradeMenu.push('');
    upgradeMenu.push('💡 **LỢI ÍCH NÂNG CẤP:**');
    upgradeMenu.push('• ⭐ Tăng EXP từ mỗi lần câu cá');
    upgradeMenu.push('• 🍀 Tăng tỷ lệ câu được cá hiếm');
    upgradeMenu.push('• 🏆 Tăng điểm leaderboard nhanh hơn');
    upgradeMenu.push('• ✨ Hiệu ứng visual đặc biệt');
    
    return api.sendMessage(upgradeMenu.join('\n'), threadId, type);
  }

  // Bán cá (nâng cấp với nhiều options)
  if (action === 'sell') {
    const inventory = player.inventory;
    const items = Object.keys(inventory).filter(item => inventory[item] > 0);
    
    if (items.length === 0) {
      return api.sendMessage('❌ Túi đồ trống! Không có gì để bán.', threadId, type);
    }

    const input = args.slice(1).join(' ').toLowerCase();
    
    // Nếu không có input, hiển thị menu bán
    if (!input) {
      let sellMenu = [
        `💰 MENU BÁN CÁ - ${userName}`,
        `💳 Coins hiện tại: ${player.coins.toLocaleString()}`,
        '',
        '📋 CÁCH BÁN:',
        '• fishing sell all - Bán hết tất cả',
        '• fishing sell <số> - Bán theo số thứ tự',
        '• fishing sell <tên_cá> - Bán 1 con theo tên',
        '• fishing sell <tên_cá> all - Bán hết loại này',
        '',
        '🎒 TÚI ĐỒ CỦA BẠN:'
      ];

      // Hiển thị danh sách cá với số thứ tự
      items.forEach((itemName, index) => {
        const count = inventory[itemName];
        const item = findItemByName(itemName);
        if (item) {
          const sellPrice = Math.floor(item.value * 0.8);
          sellMenu.push(`${index + 1}. ${item.emoji} ${itemName} x${count} (${sellPrice.toLocaleString()} coins/con)`);
        } else {
          sellMenu.push(`${index + 1}. ❓ ${itemName} x${count} (Không thể bán - Item lỗi)`);
        }
      });

      sellMenu.push('');
      sellMenu.push('💡 Ví dụ: fishing sell 1, fishing sell all, fishing sell Cá Rô');

      return api.sendMessage(sellMenu.join('\n'), threadId, type);
    }

    let soldItems = [];
    let totalEarned = 0;

    // Bán hết tất cả
    if (input === 'all') {
      for (const itemName of items) {
        const count = inventory[itemName];
        const item = findItemByName(itemName);
        if (item && item.value > 0) {
          const sellPrice = Math.floor(item.value * 0.8);
          const totalPrice = sellPrice * count;
          
          soldItems.push({
            name: itemName,
            emoji: item.emoji,
            count: count,
            unitPrice: sellPrice,
            totalPrice: totalPrice
          });
          
          totalEarned += totalPrice;
          delete inventory[itemName];
        }
      }
    }
    // Bán theo số thứ tự
    else if (!isNaN(parseInt(input))) {
      const itemIndex = parseInt(input) - 1;
      if (itemIndex < 0 || itemIndex >= items.length) {
        return api.sendMessage('❌ Số thứ tự không hợp lệ!\n💡 Gõ "fishing sell" để xem danh sách', threadId, type);
      }

      const itemName = items[itemIndex];
      const item = findItemByName(itemName);
      if (item && item.value > 0) {
        const sellPrice = Math.floor(item.value * 0.8);
        
        soldItems.push({
          name: itemName,
          emoji: item.emoji,
          count: 1,
          unitPrice: sellPrice,
          totalPrice: sellPrice
        });
        
        totalEarned += sellPrice;
        inventory[itemName]--;
        if (inventory[itemName] === 0) {
          delete inventory[itemName];
        }
      }
    }
    // Bán theo tên cá
    else {
      const parts = input.split(' ');
      const isAll = parts[parts.length - 1] === 'all';
      const itemName = isAll ? parts.slice(0, -1).join(' ') : input;
      
      // Tìm tên cá chính xác hoặc gần đúng
      let targetItem = null;
      let targetName = null;
      
      // Tìm chính xác trước
      for (const name of items) {
        if (name.toLowerCase() === itemName) {
          targetItem = findItemByName(name);
          targetName = name;
          break;
        }
      }
      
      // Nếu không tìm thấy chính xác, tìm gần đúng
      if (!targetItem) {
        for (const name of items) {
          if (name.toLowerCase().includes(itemName)) {
            targetItem = findItemByName(name);
            targetName = name;
            break;
          }
        }
      }

      if (!targetItem || !targetName) {
        return api.sendMessage(`❌ Không tìm thấy "${itemName}" trong túi đồ!\n💡 Gõ "fishing sell" để xem danh sách`, threadId, type);
      }

      if (targetItem.value > 0) {
        const sellPrice = Math.floor(targetItem.value * 0.8);
        const sellCount = isAll ? inventory[targetName] : 1;
        const totalPrice = sellPrice * sellCount;
        
        soldItems.push({
          name: targetName,
          emoji: targetItem.emoji,
          count: sellCount,
          unitPrice: sellPrice,
          totalPrice: totalPrice
        });
        
        totalEarned += totalPrice;
        
        if (isAll) {
          delete inventory[targetName];
        } else {
          inventory[targetName]--;
          if (inventory[targetName] === 0) {
            delete inventory[targetName];
          }
        }
      }
    }

    if (soldItems.length === 0) {
      return api.sendMessage('❌ Không có gì để bán hoặc không thể bán được!', threadId, type);
    }

    // Cập nhật coins
    player.coins += totalEarned;

    // Auto-save dữ liệu sau khi bán (sẽ tự động sync leaderboard)
    savePlayerData();

    // Tạo thông báo kết quả
    let sellMsg = [
      `💰 ĐÃ BÁN THÀNH CÔNG!`,
      '',
      '🐟 ĐÃ BÁN:'
    ];

    soldItems.forEach(item => {
      if (item.count === 1) {
        sellMsg.push(`${item.emoji} ${item.name} - ${item.totalPrice.toLocaleString()} coins`);
      } else {
        sellMsg.push(`${item.emoji} ${item.name} x${item.count} - ${item.totalPrice.toLocaleString()} coins`);
      }
    });

    sellMsg.push('');
    sellMsg.push(`💰 Tổng nhận được: ${totalEarned.toLocaleString()} coins`);
    sellMsg.push(`💳 Coins hiện tại: ${player.coins.toLocaleString()}`);
    sellMsg.push('');
    sellMsg.push('💡 Gõ "fishing inventory" để xem túi đồ');

    return api.sendMessage(sellMsg.join('\n'), threadId, type);
  }

  // Nhiệm vụ hàng ngày
  if (action === 'quest' || action === 'daily') {
    // Reset quest nếu qua ngày mới
    const today = new Date().toDateString();
    if (player.dailyQuest.date !== today) {
      player.dailyQuest = {
        date: today,
        catchCount: 0,
        rareCount: 0,
        completed: false,
        reward: 200 + (player.level * 50) // Tăng reward theo level
      };
    }

    const quest = player.dailyQuest;
    const questMsg = [
      `🎯 NHIỆM VỤ HÀNG NGÀY - ${userName}`,
      `📅 Ngày: ${new Date().toLocaleDateString('vi-VN')}`,
      '',
      '📋 MỤC TIÊU:',
      `🎣 Câu cá: ${quest.catchCount}/10 lần`,
      `🍣 Cá hiếm: ${quest.rareCount}/3 con`,
      '',
      `💰 Phần thưởng: ${quest.reward.toLocaleString()} coins`,
      `📊 Tiến độ: ${Math.round(((quest.catchCount/10 + quest.rareCount/3)/2)*100)}%`
    ];

    if (quest.completed) {
      questMsg.push('');
      questMsg.push('✅ ĐÃ HOÀN THÀNH!');
      questMsg.push('🎉 Phần thưởng đã được nhận!');
      questMsg.push('⏰ Quest mới vào 0h ngày mai');
    } else {
      questMsg.push('');
      questMsg.push('💡 HƯỚNG DẪN:');
      questMsg.push('• Câu cá 10 lần bất kỳ');
      questMsg.push('• Câu được 3 cá hiếm trở lên');
      questMsg.push('• Tự động nhận thưởng khi hoàn thành');
    }

    return api.sendMessage(questMsg.join('\n'), threadId, type);
  }

  // Thả cần câu
  if (action === 'cast' || action === 'câu' || action === 'cau') {
    // Lấy thông tin cần câu và khu vực hiện tại
    const currentRod = FISHING_RODS[player.currentRod] || FISHING_RODS['Cần Câu Cơ Bản'];
    const currentArea = FISHING_AREAS[player.currentArea] || FISHING_AREAS['Hồ Cơ Bản'];
    
    // Kiểm tra cooldown (có thể giảm bởi cần câu)
    const now = Date.now();
    const cooldownKey = `${senderId}_${threadId}`;
    const lastFish = fishingCooldowns.get(cooldownKey) || 0;
    const baseCooldownTime = 30000; // 30 giây
    
    // VIP cooldown reduction
    let vipCooldownReduction = 0;
    if (player.vip.level > 0) {
      const vipData = VIP_LEVELS[player.vip.level];
      if (vipData) {
        vipCooldownReduction = baseCooldownTime * vipData.benefits.cooldownReduction / 100;
      }
    }
    
    // VIP Money cooldown reduction
    let vipMoneyCooldownReduction = 0;
    if (player.vipMoney && player.vipMoney.level > 0) {
      const reductionPercent = Math.min(player.vipMoney.level * 0.5, 10); // Max 10%
      vipMoneyCooldownReduction = baseCooldownTime * reductionPercent / 100;
    }
    
    const cooldownTime = Math.max(1000, baseCooldownTime - currentRod.effects.cooldownReduction - vipCooldownReduction - vipMoneyCooldownReduction); // Tối thiểu 1 giây
    
    if (now - lastFish < cooldownTime) {
      const remaining = Math.ceil((cooldownTime - (now - lastFish)) / 1000);
      return api.sendMessage(`⏰ Bạn cần đợi ${remaining} giây nữa mới có thể câu tiếp!`, threadId, type);
    }

    // Set cooldown
    fishingCooldowns.set(cooldownKey, now);

    // Lấy thông tin mồi câu hiện tại
    const currentBait = player.activeBait ? FISHING_BAITS[player.activeBait] : null;
    const baitRareBonus = currentBait ? currentBait.effects.rareBonus : 0;

    // Equipment upgrade bonus (luck bonus cho random)
    let equipmentExpBonus = 0;
    let equipmentLuckBonus = 0;
    const currentRodLevel = player.equipmentLevels[player.currentRod] || 0;
    if (currentRodLevel > 0) {
      const upgradeData = EQUIPMENT_UPGRADES[player.currentRod];
      if (upgradeData && upgradeData.upgrades[currentRodLevel]) {
        const upgrade = upgradeData.upgrades[currentRodLevel];
        equipmentLuckBonus = upgrade.bonus.luck;
      }
    }
    
    // VIP rare fish bonus
    let vipRareBonus = 0;
    if (player.vip.level > 0) {
      const vipData = VIP_LEVELS[player.vip.level];
      if (vipData) {
        vipRareBonus = vipData.benefits.rareBonus;
      }
    }
    
    // VIP Money rare fish bonus
    let vipMoneyRareBonus = 0;
    if (player.vipMoney && player.vipMoney.level > 0) {
      vipMoneyRareBonus = player.vipMoney.level * 1; // +1% per level
    }
    
    // Random kết quả câu cá với bonus (bao gồm equipment luck bonus và VIP rare bonus)
    const totalLuckBonus = baitRareBonus + equipmentLuckBonus + vipRareBonus + vipMoneyRareBonus;
    const result = getRandomCatch(player.level, totalLuckBonus, currentArea, currentBait);
    
    // Áp dụng hiệu ứng cần câu và khu vực
    const rodExpBonus = Math.floor(result.exp * currentRod.effects.expBonus / 100);
    const rodCoinBonus = Math.floor(result.value * currentRod.effects.coinBonus / 100);
    const areaExpBonus = Math.floor(result.exp * (currentArea.expMultiplier - 1));
    const areaCoinBonus = Math.floor(result.value * (currentArea.coinMultiplier - 1));
    
    // Guild bonus
    let guildExpBonus = 0;
    let guildCoinBonus = 0;
    if (player.guild.id) {
      const guild = global.fishingGuilds.guilds.get(player.guild.id);
      if (guild) {
        const guildLevel = GUILD_LEVELS[guild.level];
        guildExpBonus = Math.floor(result.exp * guildLevel.bonus.exp);
        guildCoinBonus = Math.floor(result.value * guildLevel.bonus.coins);
      }
    }

    // VIP bonus
    let vipExpBonus = 0;
    let vipCoinBonus = 0;
    if (player.vip.level > 0) {
      const vipData = VIP_LEVELS[player.vip.level];
      if (vipData) {
        vipExpBonus = Math.floor(result.exp * vipData.benefits.expBonus / 100);
        vipCoinBonus = Math.floor(result.value * vipData.benefits.coinBonus / 100);
      }
    }
    
    // VIP Money bonus
    let vipMoneyExpBonus = 0;
    let vipMoneyCoinBonus = 0;
    if (player.vipMoney && player.vipMoney.level > 0) {
      vipMoneyExpBonus = Math.floor(result.exp * (player.vipMoney.level * 2) / 100); // +2% per level
      vipMoneyCoinBonus = Math.floor(result.value * (player.vipMoney.level * 1.5) / 100); // +1.5% per level
    }

    // Tính equipment EXP bonus sau khi có result
    if (currentRodLevel > 0) {
      const upgradeData = EQUIPMENT_UPGRADES[player.currentRod];
      if (upgradeData && upgradeData.upgrades[currentRodLevel]) {
        const upgrade = upgradeData.upgrades[currentRodLevel];
        equipmentExpBonus = Math.floor(result.exp * upgrade.bonus.exp);
      }
    }
    
    const totalExpBonus = rodExpBonus + areaExpBonus + guildExpBonus + vipExpBonus + equipmentExpBonus + vipMoneyExpBonus;
    const totalCoinBonus = rodCoinBonus + areaCoinBonus + guildCoinBonus + vipCoinBonus + vipMoneyCoinBonus;
    
    // Cập nhật dữ liệu người chơi
    player.totalCatch++;
    player.exp += result.exp + totalExpBonus;
    player.coins += result.value + totalCoinBonus;
    
    // Cập nhật tournament stats nếu đang tham gia
    const activeTournament = global.fishingTournaments.active;
    if (activeTournament && 
        activeTournament.status === 'active' && 
        player.currentTournament === activeTournament.id &&
        activeTournament.participants.has(senderId)) {
      
      const tournamentStats = activeTournament.participants.get(senderId);
      tournamentStats.totalCatch++;
      
      if (result.rarity === 'Hiếm' || result.rarity === 'Huyền Thoại') {
        tournamentStats.rareCount++;
      }
      
      tournamentStats.coinsEarned += result.value + totalCoinBonus;
    }
    
    // Cập nhật inventory
    if (player.inventory[result.name]) {
      player.inventory[result.name]++;
    } else {
      player.inventory[result.name] = 1;
    }
    
    // Cập nhật stats
    const rarityKey = result.rarity.toLowerCase().replace(' ', '').replace('huyềnthoại', 'legendary').replace('hiếm', 'rare').replace('thường', 'common').replace('rác', 'trash');
    player.stats[rarityKey]++;

    // Kiểm tra level up
    const oldLevel = player.level;
    checkLevelUp(player);
    const leveledUp = player.level > oldLevel;

    // Cập nhật daily quest
    const today = new Date().toDateString();
    if (player.dailyQuest.date !== today) {
      player.dailyQuest = {
        date: today,
        catchCount: 0,
        rareCount: 0,
        completed: false,
        reward: 200 + (player.level * 50)
      };
    }
    
    player.dailyQuest.catchCount++;
    if (result.rarity === 'Hiếm' || result.rarity === 'Huyền Thoại') {
      player.dailyQuest.rareCount++;
    }

    // Kiểm tra hoàn thành quest
    let questCompleted = false;
    if (!player.dailyQuest.completed && 
        player.dailyQuest.catchCount >= 10 && 
        player.dailyQuest.rareCount >= 3) {
      player.dailyQuest.completed = true;
      player.coins += player.dailyQuest.reward;
      questCompleted = true;
    }

    // Giảm số lần sử dụng mồi câu
    if (player.activeBait && player.baitUsesLeft > 0) {
      player.baitUsesLeft--;
      if (player.baitUsesLeft <= 0) {
        player.activeBait = null;
        player.baitUsesLeft = 0;
      }
    }
    
    // Check achievements
    checkAndAwardAchievements(player, api, threadId, type);
    
    // Auto-save dữ liệu sau khi câu cá (sẽ tự động sync leaderboard)
    savePlayerData();
    saveCooldowns();

    // Tạo thông báo kết quả
    let resultMsg = [
      `🎣 ${userName} câu cá tại ${currentArea.emoji} ${player.currentArea}`,
      `🎣 Sử dụng: ${currentRod.emoji} ${player.currentRod}`,
      currentBait ? `🪱 Mồi câu: ${currentBait.emoji} ${player.activeBait} (${player.baitUsesLeft + 1} → ${player.baitUsesLeft})` : null,
      '',
      '🌊 *Plop!* Có gì đó cắn câu!',
      '',
      `${result.emoji} **${result.name}** (${result.rarity})`,
      `⭐ +${result.exp} EXP${totalExpBonus > 0 ? ` (+${totalExpBonus} bonus)` : ''}`,
    ];

    if (result.value > 0) {
      resultMsg.push(`💰 +${result.value} coins${totalCoinBonus > 0 ? ` (+${totalCoinBonus} bonus)` : ''}`);
    }

    // Hiển thị guild bonus nếu có
    if (guildExpBonus > 0 || guildCoinBonus > 0) {
      const guild = global.fishingGuilds.guilds.get(player.guild.id);
      if (guild) {
        resultMsg.push(`🏰 Guild ${guild.name}: +${guildExpBonus} EXP, +${guildCoinBonus} coins`);
      }
    }

    // Hiển thị equipment bonus nếu có
    if (equipmentExpBonus > 0) {
      const rodLevel = player.equipmentLevels[player.currentRod];
      resultMsg.push(`🔧 ${player.currentRod} +${rodLevel}: +${equipmentExpBonus} EXP`);
    }

    resultMsg.push('');
    resultMsg.push(`🎯 Level: ${player.level} | EXP: ${player.exp}`);
    resultMsg.push(`💰 Coins: ${player.coins.toLocaleString()}`);
    resultMsg.push(`📊 BXH: Gõ "leaderboard fishing" để xem`);

    if (leveledUp) {
      resultMsg.push('');
      resultMsg.push(`🎉 LEVEL UP! Bạn đã lên level ${player.level}!`);
      resultMsg.push('🎁 Mở khóa tính năng mới!');
      resultMsg.push('🏆 Điểm BXH tăng mạnh!');
    }

    // Thêm thông báo đặc biệt cho cá hiếm - ENHANCED VIP EDITION
    if (result.rarity === 'Tối Thượng') {
      resultMsg.push('');
      resultMsg.push('👑🔥 HOLY SHIT! CÁ TỐI THƯỢNG!!! 🔥👑');
      resultMsg.push('⚡ LEGENDARY CATCH OF THE CENTURY! ⚡');
      resultMsg.push('🎊 CONGRATULATIONS FISHING GOD! 🎊');
    } else if (result.rarity === 'Siêu Huyền Thoại') {
      resultMsg.push('');
      resultMsg.push('💎✨ INCREDIBLE! CÁ SIÊU HUYỀN THOẠI! ✨💎');
      resultMsg.push('🌟 MYTHICAL BEAST CAPTURED! 🌟');
    } else if (result.rarity === 'Huyền Thoại') {
      resultMsg.push('');
      resultMsg.push('🌟 WOW! Bạn đã câu được cá HUYỀN THOẠI! 🌟');
    } else if (result.rarity === 'Hiếm') {
      resultMsg.push('');
      resultMsg.push('✨ Tuyệt vời! Cá hiếm đấy! ✨');
    }

    // Thông báo quest completed
    if (questCompleted) {
      resultMsg.push('');
      resultMsg.push('🎉 HOÀN THÀNH NHIỆM VỤ HÀNG NGÀY! 🎉');
      resultMsg.push(`💰 +${player.dailyQuest.reward.toLocaleString()} coins thưởng!`);
      resultMsg.push('🏆 Quest mới vào ngày mai!');
    }

    return api.sendMessage(resultMsg.join('\n'), threadId, type);
  }

  // Admin commands - VIP và Coins cao nhất
  if (action === 'admin' && (senderId === '764450365581940909' || senderId === '5575182743701364501' || senderId === '712905978506993838')) {
    const subAction = args[1];
    
    if (subAction === 'maxvip') {
      // Set VIP 1000 cho admin
      player.vip.level = 1000;
      player.vip.purchaseDate = Date.now();
      player.vip.totalSpent = 10000000000000; // 10,000 tỷ
      
      savePlayerData();
      
      return api.sendMessage(
        `👑 **ADMIN VIP MAX ACTIVATED!**\n\n` +
        `${VIP_LEVELS[1000].description}\n` +
        `💸 Total Spent: 10,000,000,000,000 coins\n` +
        `📅 Purchase Date: ${new Date().toLocaleDateString()}\n\n` +
        `🎁 **ULTIMATE BENEFITS:**\n` +
        `• +100% EXP khi câu cá\n` +
        `• +50% Coins khi câu cá\n` +
        `• +20% Rare Fish chance\n` +
        `• -10% Cooldown reduction\n\n` +
        `🏆 **BẠN LÀ VIP CAO NHẤT!** 👑`,
        threadId, type
      );
    }
    
    if (subAction === 'maxcoins') {
      // Set coins cao nhất (999 tỷ)
      player.coins = 999999999999999;
      
      savePlayerData();
      
      return api.sendMessage(
        `💰 **ADMIN MAX COINS ACTIVATED!**\n\n` +
        `💳 Coins: ${player.coins.toLocaleString()}\n` +
        `🏆 **BẠN CÓ TIỀN CAO NHẤT!**\n\n` +
        `💡 Bây giờ bạn có thể:\n` +
        `• Mua tất cả VIP levels\n` +
        `• Mua tất cả items trong shop\n` +
        `• Donate guild không giới hạn\n` +
        `• Upgrade equipment tối đa\n\n` +
        `👑 **ULTIMATE FISHING ADMIN!** 💎`,
        threadId, type
      );
    }
    
    if (subAction === 'ultimate') {
      // Set cả VIP max và coins max
      player.vip.level = 1000;
      player.vip.purchaseDate = Date.now();
      player.vip.totalSpent = 10000000000000;
      player.coins = 999999999999999;
      player.level = 999;
      player.exp = 99999999999;
      
      savePlayerData();
      
      return api.sendMessage(
        `🚀 **ULTIMATE ADMIN MODE ACTIVATED!**\n\n` +
        `👑 VIP: ${VIP_LEVELS[1000].emoji} Level 1000 - Legendary\n` +
        `💰 Coins: ${player.coins.toLocaleString()}\n` +
        `📊 Level: ${player.level} | EXP: ${player.exp.toLocaleString()}\n\n` +
        `🎁 **ULTIMATE BENEFITS:**\n` +
        `• +100% EXP | +50% Coins | +20% Rare Fish\n` +
        `• -10% Cooldown | VIP 1000 Badge\n` +
        `• Unlimited purchasing power\n` +
        `• Max level progression\n\n` +
        `🏆 **BẠN LÀ FISHING GOD!** ⚡👑💎`,
        threadId, type
      );
    }
    
    if (subAction === 'vipall') {
      // Set VIP cho tất cả mọi người trong group
      try {
        const threadInfo = await api.getThreadInfo(threadId);
        const participants = threadInfo.participantIDs || [];
        
        let vipLevel = parseInt(args[2]) || 100; // Default VIP 100
        if (vipLevel < 1 || vipLevel > 1000) {
          return api.sendMessage('❌ VIP level phải từ 1-1000!\n💡 Ví dụ: fishing admin vipall 100', threadId, type);
        }
        
        const vipData = VIP_LEVELS[vipLevel];
        let successCount = 0;
        
        // Set VIP cho tất cả members
        for (const userId of participants) {
          if (userId !== senderId) { // Không set cho chính admin
            const memberPlayer = createPlayer(userId);
            memberPlayer.vip.level = vipLevel;
            memberPlayer.vip.purchaseDate = Date.now();
            memberPlayer.vip.totalSpent = vipData.price;
            successCount++;
          }
        }
        
        savePlayerData();
        
        return api.sendMessage(
          `🎉 **VIP MASS DISTRIBUTION COMPLETED!**\n\n` +
          `👑 **VIP GIVEN:** ${vipData.description}\n` +
          `👥 **RECIPIENTS:** ${successCount} members\n` +
          `💰 **VALUE:** ${vipData.price.toLocaleString()} coins each\n` +
          `💸 **TOTAL VALUE:** ${(vipData.price * successCount).toLocaleString()} coins\n\n` +
          `🎁 **BENEFITS FOR ALL:**\n` +
          `• +${vipData.benefits.expBonus}% EXP\n` +
          `• +${vipData.benefits.coinBonus}% Coins\n` +
          `• +${vipData.benefits.rareBonus}% Rare Fish\n` +
          `• -${vipData.benefits.cooldownReduction}% Cooldown\n\n` +
          `🏆 **EVERYONE IS NOW VIP ${vipLevel}!** 🎊`,
          threadId, type
        );
        
      } catch (error) {
        return api.sendMessage('❌ Không thể lấy thông tin group! Vui lòng thử lại.', threadId, type);
      }
    }
    
    if (subAction === 'coinsall') {
      // Set coins cho tất cả mọi người trong group
      try {
        const threadInfo = await api.getThreadInfo(threadId);
        const participants = threadInfo.participantIDs || [];
        
        let coinAmount = parseInt(args[2]) || 1000000000; // Default 1 tỷ
        if (coinAmount < 1000 || coinAmount > 999999999999999) {
          return api.sendMessage('❌ Coins phải từ 1,000 - 999,999,999,999,999!\n💡 Ví dụ: fishing admin coinsall 1000000000', threadId, type);
        }
        
        let successCount = 0;
        
        // Set coins cho tất cả members
        for (const userId of participants) {
          if (userId !== senderId) { // Không set cho chính admin
            const memberPlayer = createPlayer(userId);
            memberPlayer.coins = coinAmount;
            successCount++;
          }
        }
        
        savePlayerData();
        
        return api.sendMessage(
          `💰 **COINS MASS DISTRIBUTION COMPLETED!**\n\n` +
          `💳 **COINS GIVEN:** ${coinAmount.toLocaleString()} each\n` +
          `👥 **RECIPIENTS:** ${successCount} members\n` +
          `💸 **TOTAL DISTRIBUTED:** ${(coinAmount * successCount).toLocaleString()} coins\n\n` +
          `🎁 **NOW EVERYONE CAN:**\n` +
          `• Buy VIP levels\n` +
          `• Purchase all shop items\n` +
          `• Upgrade equipment\n` +
          `• Donate to guilds\n\n` +
          `🏆 **EVERYONE IS NOW RICH!** 💎`,
          threadId, type
        );
        
      } catch (error) {
        return api.sendMessage('❌ Không thể lấy thông tin group! Vui lòng thử lại.', threadId, type);
      }
    }
    
    if (!subAction) {
      return api.sendMessage(
        `🛠️ **FISHING ADMIN COMMANDS:**\n\n` +
        `**👤 PERSONAL:**\n` +
        `• fishing admin maxvip - Set VIP 1000 cho bản thân\n` +
        `• fishing admin maxcoins - Set coins max cho bản thân\n` +
        `• fishing admin ultimate - Set tất cả max cho bản thân\n\n` +
        `**👥 GROUP COMMANDS:**\n` +
        `• fishing admin vipall <level> - Set VIP cho tất cả (1-1000)\n` +
        `• fishing admin coinsall <amount> - Set coins cho tất cả\n\n` +
        `**🗑️ DANGER ZONE:**\n` +
        `• fishing admin deleteuser <userID> - XÓA HOÀN TOÀN dữ liệu user\n\n` +
        `**💡 VÍ DỤ:**\n` +
        `• fishing admin vipall 100 - Cho tất cả VIP 100\n` +
        `• fishing admin coinsall 1000000000 - Cho tất cả 1 tỷ coins\n` +
        `• fishing admin deleteuser 100012345678 - Xóa user\n\n` +
        `⚠️ **CHỈ DÀNH CHO ADMIN!** 👑`,
        threadId, type
      );
    }
    
    if (subAction === 'deleteuser') {
      const targetUserId = args[2];
      
      if (!targetUserId) {
        return api.sendMessage(
          '🗑️ **XÓA DỮ LIỆU USER:**\n\n' +
          '💡 Cách sử dụng: fishing admin deleteuser <userID>\n' +
          '💡 Ví dụ: fishing admin deleteuser 100012345678\n\n' +
          '⚠️ **CẢNH BÁO:** Lệnh này sẽ xóa HOÀN TOÀN tất cả dữ liệu của user!\n' +
          '• Coins, Bank balance, Nợ\n' +
          '• Inventory, Fishing rods\n' +
          '• Level, EXP, Stats\n' +
          '• VIP status, Achievements\n' +
          '• Guild membership\n' +
          '• Tất cả lịch sử giao dịch\n\n' +
          '🚨 **KHÔNG THỂ KHÔI PHỤC!**',
          threadId, type
        );
      }
      
      // Validate User ID
      if (!/^\d+$/.test(targetUserId)) {
        return api.sendMessage('❌ User ID không hợp lệ! Chỉ được nhập số.', threadId, type);
      }
      
      // Không thể xóa chính admin
      if (targetUserId === senderId) {
        return api.sendMessage('❌ Không thể xóa dữ liệu của chính mình!', threadId, type);
      }
      
      // Kiểm tra user có tồn tại không
      if (!playerData.has(targetUserId)) {
        return api.sendMessage(`❌ Không tìm thấy dữ liệu của user ID: ${targetUserId}`, threadId, type);
      }
      
      // Lấy thông tin user trước khi xóa
      const targetPlayer = playerData.get(targetUserId);
      let targetName = 'Unknown User';
      try {
        const targetInfo = await api.getUserInfo(targetUserId);
        targetName = targetInfo?.changed_profiles?.[targetUserId]?.displayName || 'Unknown User';
      } catch {}
      
      // Backup thông tin quan trọng để hiển thị
      const backupInfo = {
        name: targetName,
        level: targetPlayer.level || 0,
        coins: targetPlayer.coins || 0,
        bankBalance: targetPlayer.bank?.balance || 0,
        vipLevel: targetPlayer.vip?.level || 0,
        inventoryCount: Object.keys(targetPlayer.inventory || {}).length,
        rodCount: Object.keys(targetPlayer.fishingRods || {}).length
      };
      
      // XÓA HOÀN TOÀN dữ liệu user
      playerData.delete(targetUserId);
      
      // Xóa khỏi global leaderboard nếu có
      if (global.gameLeaderboard && global.gameLeaderboard.fishing) {
        global.gameLeaderboard.fishing.delete(targetUserId);
      }
      
      // Xóa cooldown nếu có
      if (fishingCooldowns.has(targetUserId)) {
        fishingCooldowns.delete(targetUserId);
      }
      
      // Save dữ liệu sau khi xóa
      savePlayerData();
      saveCooldowns();
      
      console.log(`[FISHING ADMIN] User data deleted: ${targetUserId} (${targetName}) by admin: ${senderId}`);
      
      return api.sendMessage(
        `🗑️ **XÓA DỮ LIỆU USER THÀNH CÔNG!**\n\n` +
        `👤 **USER ĐÃ XÓA:**\n` +
        `• Tên: ${backupInfo.name}\n` +
        `• ID: ${targetUserId}\n\n` +
        `📊 **DỮ LIỆU ĐÃ XÓA:**\n` +
        `• Level: ${backupInfo.level}\n` +
        `• Coins: ${backupInfo.coins.toLocaleString()}\n` +
        `• Bank: ${backupInfo.bankBalance.toLocaleString()}\n` +
        `• VIP Level: ${backupInfo.vipLevel}\n` +
        `• Inventory: ${backupInfo.inventoryCount} items\n` +
        `• Fishing Rods: ${backupInfo.rodCount} rods\n\n` +
        `✅ **HOÀN TẤT:**\n` +
        `• Xóa khỏi PlayerData\n` +
        `• Xóa khỏi Leaderboard\n` +
        `• Xóa Cooldowns\n` +
        `• Đã save dữ liệu\n\n` +
        `⚠️ User này sẽ bắt đầu lại từ đầu nếu chơi tiếp!`,
        threadId, type
      );
    }
    
    return api.sendMessage('❌ Admin command không hợp lệ!\n💡 Sử dụng: fishing admin [maxvip/maxcoins/ultimate/vipall/coinsall/deleteuser]', threadId, type);
  }

  // VIP MONEY SYSTEM - Mua VIP bằng tiền thật
  if (action === 'vipmoney') {
    const subAction = args[1];
    
    if (!subAction) {
      // Hiển thị thông tin VIP Money system
      const vipMoneyInfo = player.vipMoney || { level: 0, totalSpent: 0, purchaseHistory: [] };
      
      let result = [
        `💰 **VIP MONEY SYSTEM** 💰`,
        ``,
        `👤 **Player:** ${userName}`,
        `💎 **VIP Money Level:** ${vipMoneyInfo.level}`,
        `💸 **Tổng chi tiêu:** ${vipMoneyInfo.totalSpent.toLocaleString()} VND`,
        `📅 **Lần mua cuối:** ${vipMoneyInfo.lastPurchase ? new Date(vipMoneyInfo.lastPurchase).toLocaleDateString('vi-VN') : 'Chưa mua'}`,
        ``,
        `💰 **GIÁ VIP MONEY:**`,
        `• Mỗi level = 10,000 VND`,
        `• VIP Money Level 1 = 10,000 VND`,
        `• VIP Money Level 5 = 50,000 VND`,
        `• VIP Money Level 10 = 100,000 VND`,
        ``,
        `🎁 **BENEFITS VIP MONEY:**`,
        `• +${vipMoneyInfo.level * 2}% EXP Bonus`,
        `• +${vipMoneyInfo.level * 1.5}% Coins Bonus`,
        `• +${vipMoneyInfo.level * 1}% Rare Fish Chance`,
        `• -${Math.min(vipMoneyInfo.level * 0.5, 10)}% Cooldown Reduction`,
        ``,
        `📞 **CÁCH MUA:**`,
        `• Liên hệ Admin để mua VIP Money`,
        `• Thanh toán qua: Momo/Banking/Thẻ cào`,
        `• Admin sẽ cấp VIP sau khi nhận tiền`,
        ``,
        `💡 **COMMANDS:**`,
        `• fishing vipmoney - Xem thông tin`,
        `• fishing vipmoney top - Bảng xếp hạng`,
        `• fishing vipmoney request <level> - Yêu cầu mua VIP`
      ];
      
      return api.sendMessage(result.join('\n'), threadId, type);
    }
    
    if (subAction === 'request') {
      // Yêu cầu mua VIP Money
      const requestLevel = parseInt(args[2]);
      if (!requestLevel || requestLevel < 1 || requestLevel > 100) {
        return api.sendMessage('❌ VIP Money level phải từ 1-100!\n💡 Ví dụ: fishing vipmoney request 5', threadId, type);
      }
      
      const currentLevel = player.vipMoney?.level || 0;
      if (requestLevel <= currentLevel) {
        return api.sendMessage(`❌ Bạn đã có VIP Money Level ${currentLevel}! Chỉ có thể mua level cao hơn.`, threadId, type);
      }
      
      const totalCost = (requestLevel - currentLevel) * 10000;
      
      let requestMsg = [
        `💰 **YÊU CẦU MUA VIP MONEY** 💰`,
        ``,
        `👤 **Player:** ${userName}`,
        `🆔 **User ID:** ${senderId}`,
        `📊 **Level hiện tại:** ${currentLevel}`,
        `🎯 **Level muốn mua:** ${requestLevel}`,
        `💸 **Số tiền cần thanh toán:** ${totalCost.toLocaleString()} VND`,
        ``,
        `📞 **THÔNG TIN THANH TOÁN:**`,
        `• Momo: [Số điện thoại admin]`,
        `• Banking: [Số tài khoản admin]`,
        `• Nội dung CK: VIP${requestLevel}_${senderId}`,
        ``,
        `⚠️ **LƯU Ý:**`,
        `• Sau khi chuyển tiền, chụp bill gửi admin`,
        `• Admin sẽ cấp VIP trong 24h`,
        `• Không hoàn tiền sau khi đã cấp VIP`,
        ``,
        `🔔 **Yêu cầu đã được gửi đến Admin!**`
      ];
      
      // Lưu yêu cầu vào hệ thống
      if (!global.vipMoneyRequests) global.vipMoneyRequests = [];
      global.vipMoneyRequests.push({
        userId: senderId,
        userName: userName,
        currentLevel: currentLevel,
        requestLevel: requestLevel,
        cost: totalCost,
        timestamp: Date.now(),
        status: 'pending'
      });
      
      return api.sendMessage(requestMsg.join('\n'), threadId, type);
    }
    
    if (subAction === 'top') {
      // Bảng xếp hạng VIP Money
      const allPlayers = Array.from(playerData.entries())
        .map(([userId, data]) => ({
          userId,
          name: data.name || 'Unknown',
          vipMoneyLevel: data.vipMoney?.level || 0,
          totalSpent: data.vipMoney?.totalSpent || 0
        }))
        .filter(player => player.vipMoneyLevel > 0)
        .sort((a, b) => b.vipMoneyLevel - a.vipMoneyLevel || b.totalSpent - a.totalSpent)
        .slice(0, 10);
      
      if (allPlayers.length === 0) {
        return api.sendMessage('📊 Chưa có ai mua VIP Money!', threadId, type);
      }
      
      let leaderboard = [
        `💰 **TOP VIP MONEY PLAYERS** 💰`,
        ``
      ];
      
      allPlayers.forEach((player, index) => {
        const rank = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][index];
        leaderboard.push(`${rank} **${player.name}**`);
        leaderboard.push(`   💎 VIP Money Level ${player.vipMoneyLevel}`);
        leaderboard.push(`   💸 Chi tiêu: ${player.totalSpent.toLocaleString()} VND`);
        leaderboard.push(``);
      });
      
      return api.sendMessage(leaderboard.join('\n'), threadId, type);
    }
    
    return api.sendMessage('❌ VIP Money command không hợp lệ!\n💡 Sử dụng: fishing vipmoney [request <level>/top]', threadId, type);
  }

  // ADMIN VIP MONEY COMMANDS
  if (action === 'adminvip' && (senderId === '764450365581940909' || senderId === '5575182743701364501' || senderId === '712905978506993838')) {
    const subAction = args[1];
    
    if (subAction === 'give') {
      // Cấp VIP Money cho user
      const targetId = args[2];
      const vipLevel = parseInt(args[3]);
      
      if (!targetId || !vipLevel || vipLevel < 1 || vipLevel > 100) {
        return api.sendMessage('❌ Cú pháp: fishing adminvip give <user_id> <level>\n💡 Ví dụ: fishing adminvip give 123456789 5', threadId, type);
      }
      
      const targetPlayer = createPlayer(targetId);
      const oldLevel = targetPlayer.vipMoney?.level || 0;
      const cost = (vipLevel - oldLevel) * 10000;
      
      if (vipLevel <= oldLevel) {
        return api.sendMessage(`❌ User đã có VIP Money Level ${oldLevel}! Chỉ có thể cấp level cao hơn.`, threadId, type);
      }
      
      // Cấp VIP Money
      if (!targetPlayer.vipMoney) {
        targetPlayer.vipMoney = {
          level: 0,
          totalSpent: 0,
          purchaseHistory: [],
          lastPurchase: null
        };
      }
      
      targetPlayer.vipMoney.level = vipLevel;
      targetPlayer.vipMoney.totalSpent += cost;
      targetPlayer.vipMoney.lastPurchase = Date.now();
      targetPlayer.vipMoney.purchaseHistory.push({
        level: vipLevel,
        cost: cost,
        timestamp: Date.now(),
        grantedBy: senderId
      });
      
      savePlayerData();
      
      let successMsg = [
        `✅ **VIP MONEY ĐÃ ĐƯỢC CẤP!** ✅`,
        ``,
        `👤 **Target:** ${targetId}`,
        `💎 **VIP Money Level:** ${oldLevel} → ${vipLevel}`,
        `💸 **Giá trị:** ${cost.toLocaleString()} VND`,
        `📅 **Thời gian:** ${new Date().toLocaleString('vi-VN')}`,
        `👨‍💼 **Admin:** ${senderId}`,
        ``,
        `🎁 **Benefits được kích hoạt:**`,
        `• +${vipLevel * 2}% EXP Bonus`,
        `• +${vipLevel * 1.5}% Coins Bonus`,
        `• +${vipLevel * 1}% Rare Fish Chance`,
        `• -${Math.min(vipLevel * 0.5, 10)}% Cooldown Reduction`
      ];
      
      return api.sendMessage(successMsg.join('\n'), threadId, type);
    }
    
    if (subAction === 'requests') {
      // Xem danh sách yêu cầu mua VIP
      const requests = global.vipMoneyRequests || [];
      const pendingRequests = requests.filter(req => req.status === 'pending');
      
      if (pendingRequests.length === 0) {
        return api.sendMessage('📋 Không có yêu cầu VIP Money nào đang chờ xử lý.', threadId, type);
      }
      
      let requestList = [
        `📋 **DANH SÁCH YÊU CẦU VIP MONEY** 📋`,
        ``
      ];
      
      pendingRequests.slice(0, 10).forEach((req, index) => {
        requestList.push(`${index + 1}. **${req.userName}**`);
        requestList.push(`   🆔 ID: ${req.userId}`);
        requestList.push(`   📊 ${req.currentLevel} → ${req.requestLevel}`);
        requestList.push(`   💸 ${req.cost.toLocaleString()} VND`);
        requestList.push(`   📅 ${new Date(req.timestamp).toLocaleString('vi-VN')}`);
        requestList.push(``);
      });
      
      requestList.push(`💡 **Cấp VIP:** fishing adminvip give <user_id> <level>`);
      
      return api.sendMessage(requestList.join('\n'), threadId, type);
    }
    
    if (subAction === 'help') {
      let adminHelp = [
        `👨‍💼 **ADMIN VIP MONEY COMMANDS** 👨‍💼`,
        ``,
        `**📋 QUẢN LÝ VIP:**`,
        `• fishing adminvip give <user_id> <level> - Cấp VIP Money`,
        `• fishing adminvip requests - Xem yêu cầu mua VIP`,
        `• fishing adminvip help - Hướng dẫn admin`,
        ``,
        `**💡 VÍ DỤ:**`,
        `• fishing adminvip give 123456789 5`,
        `• fishing adminvip requests`,
        ``,
        `**⚠️ LƯU Ý:**`,
        `• Chỉ admin mới dùng được lệnh này`,
        `• Kiểm tra thanh toán trước khi cấp VIP`,
        `• Mỗi level = 10,000 VND`
      ];
      
      return api.sendMessage(adminHelp.join('\n'), threadId, type);
    }
    
    return api.sendMessage('❌ Admin VIP command không hợp lệ!\n💡 Sử dụng: fishing adminvip [give/requests/help]', threadId, type);
  }

  // Lệnh không hợp lệ
  return api.sendMessage('❌ Lệnh không hợp lệ! Gõ "fishing help" để xem hướng dẫn.', threadId, type);
};

// Hàm random kết quả câu cá - ENHANCED VIP EDITION
function getRandomCatch(playerLevel, rareBonus = 0, areaBonus = null, baitBonus = null) {
  const rand = Math.random() * 100;
  
  let category;
  
  // Tính toán bonus từ level cao
  const levelBonus = Math.min(playerLevel * 0.5, 50); // Tăng level bonus cho level cao
  const vipLevelBonus = playerLevel > 50 ? Math.min((playerLevel - 50) * 0.2, 20) : 0;
  
  if (areaBonus) {
    // Sử dụng tỉ lệ từ khu vực với VIP tiers
    let commonChance = areaBonus.common + (baitBonus?.commonBonus || 0);
    let rareChance = areaBonus.rare + (baitBonus?.rareBonus || 0);
    let legendaryChance = areaBonus.legendary + (baitBonus?.legendaryBonus || 0);
    let mythicalChance = Math.min(levelBonus + vipLevelBonus + rareBonus * 0.1, 15); // Max 15%
    let ultimateChance = Math.min(levelBonus * 0.2 + vipLevelBonus * 0.5 + rareBonus * 0.05, 5); // Max 5%
    let trashChance = Math.max(areaBonus.trash - levelBonus * 0.1, 0.5); // Min 0.5%
    
    // Normalize để tổng = 100%
    const total = commonChance + rareChance + legendaryChance + mythicalChance + ultimateChance + trashChance;
    if (total > 100) {
      const scale = 100 / total;
      commonChance *= scale;
      rareChance *= scale;
      legendaryChance *= scale;
      mythicalChance *= scale;
      ultimateChance *= scale;
      trashChance *= scale;
    }
    
    // Random với tất cả tiers
    if (rand < ultimateChance) {
      category = 'ultimate';
    } else if (rand < ultimateChance + mythicalChance) {
      category = 'mythical';
    } else if (rand < ultimateChance + mythicalChance + legendaryChance) {
      category = 'legendary';
    } else if (rand < ultimateChance + mythicalChance + legendaryChance + rareChance) {
      category = 'rare';
    } else if (rand < ultimateChance + mythicalChance + legendaryChance + rareChance + trashChance) {
      category = 'trash';
    } else {
      category = 'common';
    }
  } else {
    // Logic mới với tất cả tiers
    const totalRareBonus = levelBonus + vipLevelBonus + rareBonus;
    
    if (rand < 0.1 + totalRareBonus * 0.01) { // Ultimate: 0.1% + bonus
      category = 'ultimate';
    } else if (rand < 1 + totalRareBonus * 0.05) { // Mythical: 1% + bonus
      category = 'mythical';
    } else if (rand < 5 + totalRareBonus * 0.2) { // Legendary: 5% + bonus
      category = 'legendary';
    } else if (rand < 20 + totalRareBonus * 0.5) { // Rare: 20% + bonus
      category = 'rare';
    } else if (rand < 22 + Math.max(0, 5 - totalRareBonus * 0.1)) { // Trash: giảm theo bonus
      category = 'trash';
    } else { // Common: còn lại
      category = 'common';
    }
  }
  
  // Fallback nếu category không tồn tại
  if (!FISH_DATA[category] || FISH_DATA[category].length === 0) {
    category = 'common';
  }
  
  const fishArray = FISH_DATA[category];
  const randomFish = fishArray[Math.floor(Math.random() * fishArray.length)];
  
  return randomFish;
}

// Tournament helper functions
function startTournament(tournament, api, threadId) {
  tournament.status = 'active';
  tournament.startTime = Date.now();
  tournament.endTime = tournament.startTime + tournament.type.duration;
  
  const startMsg = [
    `🚀 **TOURNAMENT BẮT ĐẦU!**`,
    '',
    `${tournament.type.emoji} **${tournament.type.name}**`,
    `🎯 ${tournament.type.description}`,
    `⏰ Thời gian: ${tournament.type.duration / 60000} phút`,
    `👥 Người tham gia: ${tournament.participants.size}`,
    `🏆 Prize pool: ${tournament.prizePool.toLocaleString()} coins`,
    '',
    '🎣 **BẮT ĐẦU CÂU CÁ NGAY!**',
    'Mọi lần câu cá sẽ được tính vào tournament!'
  ].join('\n');
  
  api.sendMessage(startMsg, threadId);
  
  // Set timer để kết thúc tournament
  setTimeout(() => {
    endTournament(tournament, api, threadId);
  }, tournament.type.duration);
}

function endTournament(tournament, api, threadId) {
  if (tournament.status !== 'active') return;
  
  tournament.status = 'finished';
  
  // Sắp xếp thứ hạng
  const rankings = Array.from(tournament.participants.entries())
    .sort((a, b) => (b[1][tournament.type.goal] || 0) - (a[1][tournament.type.goal] || 0));
  
  let resultMsg = [
    `🏁 **TOURNAMENT KẾT THÚC!**`,
    '',
    `${tournament.type.emoji} **${tournament.type.name}**`,
    `🏆 Prize pool: ${tournament.prizePool.toLocaleString()} coins`,
    '',
    '🏆 **KẾT QUẢ CUỐI CÙNG:**'
  ];
  
  // Trao thưởng cho top 3
  rankings.forEach((participant, index) => {
    const [userId, stats] = participant;
    const rank = index + 1;
    const rankEmoji = ['🥇', '🥈', '🥉'][index] || `${rank}.`;
    
    resultMsg.push(`${rankEmoji} ${stats.name}: ${stats[tournament.type.goal] || 0}`);
    
    // Trao thưởng
    if (rank <= 3 && tournament.type.rewards[rank]) {
      const reward = tournament.type.rewards[rank];
      const player = playerData.get(userId);
      
      if (player) {
        player.coins += reward.coins;
        player.exp += reward.exp;
        player.tournamentStats.wins += (rank === 1 ? 1 : 0);
        player.tournamentStats.participations++;
        
        if (reward.title && !player.tournamentStats.titles.includes(reward.title)) {
          player.tournamentStats.titles.push(reward.title);
        }
        
        player.currentTournament = null;
      }
    } else {
      // Người không thắng giải vẫn được cộng participation
      const player = playerData.get(userId);
      if (player) {
        player.tournamentStats.participations++;
        player.currentTournament = null;
      }
    }
  });
  
  if (rankings.length > 0) {
    const winner = rankings[0];
    resultMsg.push('');
    resultMsg.push(`🎉 Chúc mừng ${winner[1].name} đã giành chiến thắng!`);
    
    if (tournament.type.rewards[1]) {
      const reward = tournament.type.rewards[1];
      resultMsg.push(`🎁 Phần thưởng: ${reward.coins.toLocaleString()} coins, ${reward.exp} EXP`);
      if (reward.title) {
        resultMsg.push(`🏅 Danh hiệu: "${reward.title}"`);
      }
    }
  }
  
  // Lưu vào lịch sử
  global.fishingTournaments.history.push({
    type: tournament.type.name,
    participants: tournament.participants.size,
    winner: rankings.length > 0 ? rankings[0][1].name : 'Không có',
    prizePool: tournament.prizePool,
    endTime: Date.now()
  });
  
  // Xóa tournament active
  global.fishingTournaments.active = null;
  
  // Lưu dữ liệu
  savePlayerData();
  
  api.sendMessage(resultMsg.join('\n'), threadId);
}

// Achievement helper functions
function checkAchievementProgress(player, achievement) {
  const condition = achievement.condition;
  let progress = 0;
  
  for (const [key, targetValue] of Object.entries(condition)) {
    let current = 0;
    let target = targetValue;
    
    switch (key) {
      case 'totalCatch':
        current = player.totalCatch || 0;
        break;
      case 'rare':
        current = player.stats?.rare || 0;
        break;
      case 'legendary':
        current = player.stats?.legendary || 0;
        break;
      case 'level':
        current = player.level || 1;
        break;
      case 'coins':
        current = player.coins || 0;
        break;
      case 'tournamentWins':
        current = player.tournamentStats?.wins || 0;
        break;
      case 'guildCreated':
        current = player.guild?.role === 'Leader' ? 1 : 0;
        target = 1;
        break;
      case 'bossDefeated':
        current = Object.keys(player.bossItems || {}).length;
        break;
    }
    
    progress = Math.max(progress, Math.min(1, current / target));
  }
  
  return progress;
}

function checkAndAwardAchievements(player, api, threadId, type) {
  const playerAchievements = player.achievements || [];
  const allAchievements = Object.values(ACHIEVEMENTS);
  const newAchievements = [];
  
  for (const achievement of allAchievements) {
    if (playerAchievements.includes(achievement.id)) continue;
    
    const progress = checkAchievementProgress(player, achievement);
    if (progress >= 1) {
      // Đạt được achievement
      player.achievements.push(achievement.id);
      player.coins += achievement.reward.coins;
      player.exp += achievement.reward.exp;
      newAchievements.push(achievement);
    }
  }
  
  // Thông báo achievement mới
  if (newAchievements.length > 0) {
    setTimeout(() => {
      newAchievements.forEach(ach => {
        const rarityEmoji = {
          'legendary': '🌟',
          'epic': '💜', 
          'rare': '💙',
          'common': '🤍'
        };
        
        const achievementMsg = [
          `🎉 **THÀNH TỰU MỚI!** 🎉`,
          '',
          `${ach.emoji} ${rarityEmoji[ach.rarity]} **${ach.name}**`,
          `✨ ${ach.description}`,
          '',
          `🎁 **PHẦN THƯỞNG:**`,
          `💰 +${ach.reward.coins.toLocaleString()} coins`,
          `⭐ +${ach.reward.exp.toLocaleString()} EXP`,
          '',
          '🏆 Gõ "fishing achievement" để xem tất cả thành tựu!'
        ].join('\n');
        
        api.sendMessage(achievementMsg, threadId, type);
      });
    }, 2000);
  }
  
  return newAchievements.length > 0;
}

// Tìm item theo tên
function findItemByName(name) {
  for (const category of Object.values(FISH_DATA)) {
    const item = category.find(item => item.name === name);
    if (item) return item;
  }
  return null; // Trả về null nếu không tìm thấy
}

// Kiểm tra và xử lý nợ quá hạn
function checkOverdueLoan(player, api, threadId, type) {
  if (!player.bank || !player.bank.loan || player.bank.loan.amount <= 0) {
    return; // Không có nợ
  }
  
  const now = Date.now();
  const dueDate = player.bank.loan.dueDate;
  
  if (!dueDate || now < dueDate) {
    return; // Chưa quá hạn
  }
  
  // Nợ đã quá hạn - tự động trừ tiền
  const debtAmount = player.bank.loan.amount;
  const totalCoins = player.coins + player.bank.balance;
  
  console.log(`[FISHING] Processing overdue loan for user: ${player.userId || 'unknown'}, debt: ${debtAmount}, total coins: ${totalCoins}`);
  
  if (totalCoins >= debtAmount) {
    // Đủ tiền để trả nợ - trừ từ tiền mặt trước, sau đó từ bank
    let remainingDebt = debtAmount;
    
    if (player.coins >= remainingDebt) {
      // Trừ hết từ tiền mặt
      player.coins -= remainingDebt;
    } else {
      // Trừ hết tiền mặt, còn lại trừ từ bank
      remainingDebt -= player.coins;
      player.coins = 0;
      player.bank.balance -= remainingDebt;
    }
    
    // Clear nợ
    player.bank.loan.amount = 0;
    player.bank.loan.startDate = null;
    player.bank.loan.dueDate = null;
    
    // Ghi log
    player.bank.transactions.push({
      type: 'auto_deduct',
      amount: -debtAmount,
      timestamp: Date.now(),
      description: `Tự động trừ nợ quá hạn ${debtAmount.toLocaleString()} coins`
    });
    
    if (player.bank.transactions.length > 20) {
      player.bank.transactions = player.bank.transactions.slice(-20);
    }
    
    savePlayerData();
    
    // Thông báo cho user
    api.sendMessage(
      `⚠️ **NỢ QUÁ HẠN - ĐÃ TỰ ĐỘNG TRỪ TIỀN!**\n\n` +
      `💰 Số tiền đã trừ: ${debtAmount.toLocaleString()} coins\n` +
      `💳 Tiền mặt còn lại: ${player.coins.toLocaleString()} coins\n` +
      `🏦 Số dư bank: ${player.bank.balance.toLocaleString()} coins\n\n` +
      `✅ Khoản nợ đã được thanh toán!\n` +
      `💡 Lần sau hãy trả nợ đúng hạn để tránh tự động trừ tiền.`,
      threadId, type
    );
    
  } else {
    // Không đủ tiền - áp dụng penalty
    const penalty = Math.floor(debtAmount * 0.5); // Phạt 50% số nợ
    const newDebt = debtAmount + penalty;
    
    // Trừ hết tiền hiện có
    player.coins = 0;
    player.bank.balance = 0;
    
    // Tăng nợ với penalty
    player.bank.loan.amount = newDebt;
    player.bank.loan.dueDate = Date.now() + (30 * 60 * 1000); // Gia hạn thêm 30 phút
    
    // Ghi log
    player.bank.transactions.push({
      type: 'penalty',
      amount: -penalty,
      timestamp: Date.now(),
      description: `Phạt nợ quá hạn +${penalty.toLocaleString()} coins (50% nợ gốc)`
    });
    
    if (player.bank.transactions.length > 20) {
      player.bank.transactions = player.bank.transactions.slice(-20);
    }
    
    savePlayerData();
    
    // Thông báo penalty
    const newDueTime = new Date(player.bank.loan.dueDate).toLocaleString('vi-VN');
    api.sendMessage(
      `🚨 **NỢ QUÁ HẠN - KHÔNG ĐỦ TIỀN TRẢ!**\n\n` +
      `💸 Đã tịch thu tất cả tài sản!\n` +
      `⚡ Phạt thêm: ${penalty.toLocaleString()} coins (50%)\n` +
      `💳 Nợ mới: ${newDebt.toLocaleString()} coins\n` +
      `⏰ Hạn mới: ${newDueTime} (30 phút)\n\n` +
      `⚠️ **CẢNH BÁO:** Nếu tiếp tục quá hạn sẽ bị phạt nặng hơn!\n` +
      `💡 Hãy câu cá để kiếm tiền trả nợ ngay!`,
      threadId, type
    );
  }
}

// Tính EXP cần cho level tiếp theo - ENHANCED FOR HIGH LEVELS
function getExpToNextLevel(level) {
  if (level <= 50) {
    return level * 100 + (level - 1) * 50; // Level 1-50: tăng dần
  } else if (level <= 100) {
    return level * 200 + (level - 50) * 100; // Level 51-100: tăng nhanh hơn
  } else if (level <= 200) {
    return level * 500 + (level - 100) * 300; // Level 101-200: tăng rất nhanh
  } else {
    return level * 1000 + (level - 200) * 500; // Level 200+: siêu khó
  }
}

// Tính tổng EXP cho level hiện tại
function getExpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += getExpToNextLevel(i);
  }
  return total;
}

// Kiểm tra và xử lý level up
function checkLevelUp(player) {
  while (true) {
    const expNeeded = getExpForLevel(player.level + 1);
    if (player.exp >= expNeeded) {
      player.level++;
    } else {
      break;
    }
  }
}
