const fs = require('fs');
const path = require('path');
// User profile helper (persistent cross-game profiles)
let userProfile = null;
try { userProfile = require('./userProfile.js'); } catch (_) { userProfile = null; }

// Data paths
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BOSS_DATA_FILE = path.join(DATA_DIR, 'boss_data.json');

// Ensure data dir
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// In-memory stores
const bossPlayers = new Map(); // key: `${threadId}_${userId}` -> player
const activeBattles = new Map(); // key: `${threadId}_${userId}` -> battle state

// Safe chunked sender to avoid Zalo invalid parameter
async function sendChunked(api, text, threadId, type, size = 1800) {
  const str = String(text || '');
  for (let i = 0; i < str.length; i += size) {
    const part = str.slice(i, i + size);
    try { // eslint-disable-next-line no-await-in-loop
      await api.sendMessage(part, threadId, type);
    } catch (_) { try { /* eslint-disable no-await-in-loop */ await api.sendMessage(part, threadId, type); } catch {} }
  }
}

// Persistence
function saveBossData() {
  try {
    const out = {};
    for (const [k, v] of bossPlayers.entries()) out[k] = v;
    fs.writeFileSync(BOSS_DATA_FILE, JSON.stringify(out, null, 2));
  } catch (e) { console.error('[BOSS] Save error:', e); }
}

function loadBossData() {
  try {
    if (fs.existsSync(BOSS_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(BOSS_DATA_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) bossPlayers.set(k, v);
    }
  } catch (e) { console.error('[BOSS] Load error:', e); }
}

// Eager load in case onLoad not called by loader
try { loadBossData(); } catch (e) {}

// Unified wallet helpers (Farm + Fishing)
function unifiedGetBalances(threadId, userId) {
  // Farm
  const farmKey = `${threadId}_${userId}`;
  const farmMap = global.bonzFarmData instanceof Map ? global.bonzFarmData : null;
  const farmCoins = farmMap?.get(farmKey)?.coins || 0;
  // Fishing (support multiple map names)
  const fishMap = (global.fishingPlayerData instanceof Map
    ? global.fishingPlayerData
    : (global.playerData instanceof Map ? global.playerData : null));
  const fishCoins = fishMap?.get(userId)?.coins || 0;
  return { farmCoins, fishCoins, total: (farmCoins + fishCoins) };
}

function unifiedDeduct(threadId, userId, amount) {
  if (amount <= 0) return true;
  const farmKey = `${threadId}_${userId}`;
  const farmMap = global.bonzFarmData instanceof Map ? global.bonzFarmData : null;
  const fishMap = (global.fishingPlayerData instanceof Map
    ? global.fishingPlayerData
    : (global.playerData instanceof Map ? global.playerData : null));
  let farmCoins = farmMap?.get(farmKey)?.coins || 0;
  let fishCoins = fishMap?.get(userId)?.coins || 0;
  if (farmCoins + fishCoins < amount) return false;
  // Deduct farm first, then fishing
  let remain = amount;
  if (farmCoins > 0) {
    const take = Math.min(farmCoins, remain);
    farmCoins -= take; remain -= take;
    if (farmMap?.get(farmKey)) { farmMap.get(farmKey).coins = farmCoins; }
  }
  if (remain > 0 && fishCoins > 0) {
    const take = Math.min(fishCoins, remain);
    fishCoins -= take; remain -= take;
    if (fishMap?.get(userId)) { fishMap.get(userId).coins = fishCoins; }
  }
  // Persist if savers exist
  try { if (global.saveFarmData) global.saveFarmData(); } catch {}
  try {
    if (global.saveFishingPlayerData) global.saveFishingPlayerData();
    else if (global.savePlayerData) global.savePlayerData();
  } catch {}
  return true;
}

// Elements and skills
const ELEMENTS = {
  fire: { name: 'Lửa', emoji: '🔥', strong: 'ice', weak: 'water' },
  water: { name: 'Nước', emoji: '💧', strong: 'fire', weak: 'electric' },
  electric: { name: 'Sét', emoji: '⚡', strong: 'water', weak: 'earth' },
  earth: { name: 'Đất', emoji: '🪨', strong: 'electric', weak: 'wind' },
  wind: { name: 'Gió', emoji: '🌪️', strong: 'earth', weak: 'ice' },
  ice: { name: 'Băng', emoji: '❄️', strong: 'wind', weak: 'fire' }
};

const TIER_FEES = { I: 1000, II: 2500, III: 5000, IV: 10000, V: 25000 };

function createDefaultPlayer(name) {
  return {
    name: name || 'Chiến Binh',
    element: null,
    level: 1,
    exp: 0,
    stats: { hp: 120, atk: 25, def: 8, crit: 0.1, speed: 10 },
    inventory: { stones: 0, runes: {}, equipped: { 1: null, 2: null, 3: null } },
    wins: 0,
    bestTier: 'I',
    ultimateUnlocked: false,
    rewardPref: 'fishing', // fishing | farm | split
    daily: { date: null, progress: 0, target: 1, claimed: false },
    weekly: { week: null, progress: 0, target: 5, claimed: false },
    tower: { best: 0 }
  };
}

function ensurePlayer(threadId, userId) {
  const key = `${threadId}_${userId}`;
  if (!bossPlayers.has(key)) {
    bossPlayers.set(key, createDefaultPlayer());
    saveBossData();
  }
  const p = bossPlayers.get(key);
  p.__threadId = threadId;
  p.__userId = userId;
  return p;
}

// Battle generation
function genBoss(tier, playerElement) {
  const base = { I: 1, II: 2, III: 3, IV: 4, V: 5 }[tier] || 1;
  const hp = 150 * base + Math.floor(Math.random() * 30 * base);
  const atk = 20 * base + Math.floor(Math.random() * 10 * base);
  const def = 6 * base + Math.floor(Math.random() * 4 * base);
  const speed = 8 + base * 2;
  // Choose element with mild counter to player
  const elKeys = Object.keys(ELEMENTS);
  let elementKey = elKeys[Math.floor(Math.random() * elKeys.length)];
  if (playerElement && Math.random() < 0.5) {
    // 50% pick player's weak to make it harder
    const weakTo = Object.entries(ELEMENTS).find(([k, v]) => v.strong === playerElement)?.[0];
    if (weakTo) elementKey = weakTo;
  }
  return { name: `Boss Tier ${tier}`, element: elementKey, stats: { hp, atk, def, speed } };
}

function elemMultiplier(attacker, defender) {
  if (!attacker || !defender) return 1;
  const a = ELEMENTS[attacker];
  const d = ELEMENTS[defender];
  if (!a || !d) return 1;
  if (a.strong === defender) return 1.25;
  if (a.weak === defender) return 0.85;
  return 1;
}

function calcDamage(atk, def) {
  return Math.max(1, Math.floor((atk * 1.5) - (def * 0.8)));
}

function formatBattleState(p, b) {
  return [
    `🆚 Trận đấu: ${p.name} (${ELEMENTS[p.element]?.emoji||''}${ELEMENTS[p.element]?.name||'?'}) vs ${b.boss.name} (${ELEMENTS[b.boss.element]?.emoji||''}${ELEMENTS[b.boss.element]?.name||'?'})`,
    `❤️ HP bạn: ${b.pHp} | ⚔️ ATK: ${p.stats.atk} | 🛡️ DEF: ${p.stats.def}`,
    `💀 HP boss: ${b.bHp} | ⚔️ ATK: ${b.boss.stats.atk} | 🛡️ DEF: ${b.boss.stats.def}`,
    `⚡ Năng lượng: ${b.energy}/100 | 🔁 Lượt: ${b.turn}`,
    `💡 Dùng: "boss cast <đánh|khiên|hồi|tối-thượng>" hoặc "boss flee"`
  ].join('\n');
}

function startBattle(player, tier) {
  const boss = genBoss(tier, player.element);
  const pst = getEffectiveStats(player);
  return {
    boss,
    tier,
    pHp: Math.round(pst.hp * 1.0),
    bHp: boss.stats.hp,
    energy: 0,
    turn: 1,
    lastLog: [],
    mode: 'normal',
    towerFloor: 0
  };
}

function applyCast(player, battle, cmd) {
  const logs = [];
  const pst = getEffectiveStats(player);
  const pm = elemMultiplier(player.element, battle.boss.element);
  const bm = elemMultiplier(battle.boss.element, player.element);

  const playerSpeedFirst = (player.stats.speed >= battle.boss.stats.speed);
  const order = playerSpeedFirst ? ['player','boss'] : ['boss','player'];

  const act = {
    player() {
      if (cmd === 'đánh' || cmd === 'danh' || cmd === 'attack') {
        const base = calcDamage(pst.atk, battle.boss.stats.def);
        let dmg = Math.floor(base * pm * (Math.random() < pst.crit ? 1.8 : 1));
        // Elemental passives on attack
        if (player.element === 'fire') dmg = Math.floor(dmg * 1.1);
        if (player.element === 'water') { const heal = 5; battle.pHp = Math.min(battle.pHp + heal, pst.hp); logs.push(`💧 Bị động Nước: hồi ${heal} HP.`); }
        if (player.element === 'electric' && Math.random() < 0.15) { battle._stunBoss = true; logs.push('⚡ Bị động Sét: Làm choáng boss 1 lượt!'); }
        if (player.element === 'earth') { battle._shield = Math.max(battle._shield||0, 0.3); logs.push('🪨 Bị động Đất: Giảm thêm 30% sát thương lượt này.'); }
        if (player.element === 'wind') { battle.energy = Math.min(100, battle.energy + 10); logs.push('🌪️ Bị động Gió: +10 năng lượng.'); }
        if (player.element === 'ice' && Math.random() < 0.10) { battle._stunBoss = true; logs.push('❄️ Bị động Băng: Đóng băng boss 1 lượt!'); }
        battle.bHp = Math.max(0, battle.bHp - dmg);
        logs.push(`🗡️ Bạn gây ${dmg} sát thương (x${pm.toFixed(2)})!`);
        battle.energy = Math.min(100, battle.energy + 20);
      } else if (cmd === 'khiên' || cmd === 'shield') {
        battle._shield = 0.5; // 50% giảm sát thương một lượt
        logs.push('🛡️ Bạn dựng khiên, giảm 50% sát thương lượt này!');
        battle.energy = Math.min(100, battle.energy + 10);
      } else if (cmd === 'hồi' || cmd === 'heal') {
        const heal = Math.min(30 + Math.floor(pst.hp * 0.15), pst.hp - battle.pHp);
        battle.pHp += heal;
        logs.push(`💚 Bạn hồi ${heal} HP!`);
        battle.energy = Math.min(100, battle.energy + 10);
      } else if (cmd === 'tối-thượng' || cmd === 'ulti' || cmd === 'ultimate') {
        if (battle.energy < 100) {
          logs.push('⚠️ Chưa đủ năng lượng (cần 100).');
        } else {
          const base = calcDamage(pst.atk * 2.2, battle.boss.stats.def * 0.8);
          const dmg = Math.floor(base * pm * 1.2);
          battle.bHp = Math.max(0, battle.bHp - dmg);
          logs.push(`💥 TỐI THƯỢNG! Gây ${dmg} sát thương (x${pm.toFixed(2)})!`);
          battle.energy = 0;
        }
      } else {
        logs.push('❔ Lệnh skill không hợp lệ. Dùng: đánh | khiên | hồi | tối-thượng');
      }
    },
    boss() {
      if (battle.bHp <= 0) return;
      if (battle._stunBoss) { logs.push('⏸️ Boss bị choáng/đóng băng, bỏ lượt!'); battle._stunBoss = false; battle._shield = 0; return; }
      // Boss hành động
      const roll = Math.random();
      if (roll < 0.75) {
        const base = calcDamage(battle.boss.stats.atk, pst.def);
        let dmg = Math.floor(base * bm);
        if (battle._shield) dmg = Math.floor(dmg * (1 - battle._shield));
        battle.pHp = Math.max(0, battle.pHp - dmg);
        logs.push(`💢 Boss đánh bạn ${dmg} sát thương (x${bm.toFixed(2)})!`);
      } else {
        // Buff nhỏ
        battle.boss.stats.atk += 2;
        logs.push('🔥 Boss tăng ATK của mình (+2)!');
      }
      battle._shield = 0; // reset khiên sau lượt
    }
  };

  for (const who of order) act[who]();
  battle.turn += 1;
  battle.lastLog = logs;

  let result = null; // 'win' | 'lose' | null
  if (battle.bHp <= 0 && battle.pHp > 0) result = 'win';
  if (battle.pHp <= 0 && battle.bHp > 0) result = 'lose';
  if (battle.pHp <= 0 && battle.bHp <= 0) result = 'win'; // hòa coi như win

  // Tower continuation
  if (result === 'win' && battle.mode === 'tower') {
    battle.towerFloor = (battle.towerFloor || 1) + 1;
    // scale boss
    const scale = 1 + Math.min(1, battle.towerFloor * 0.05);
    battle.boss.stats.hp = Math.floor(battle.boss.stats.hp * scale);
    battle.boss.stats.atk = Math.floor(battle.boss.stats.atk * scale);
    battle.boss.stats.def = Math.floor(battle.boss.stats.def * scale);
    battle.bHp = battle.boss.stats.hp;
    logs.push(`🏯 Leo Tháp: Sang tầng ${battle.towerFloor}! Boss mạnh lên ${Math.floor((scale-1)*100)}%.`);
    result = null; // keep fighting
  }

  return { logs, result };
}

// Rewards
function grantRewards(player, tier) {
  const fee = TIER_FEES[tier] || 0;
  const coins = Math.floor(fee * 2.2);
  // Default: add coins based on rewardPref
  try {
    const userId = player.__userId;
    const farmKey = `${player.__threadId}_${userId}`;
    const farmMap = global.bonzFarmData instanceof Map ? global.bonzFarmData : null;
    const fishMap = (global.fishingPlayerData instanceof Map ? global.fishingPlayerData : (global.playerData instanceof Map ? global.playerData : null));
    const addTo = player.rewardPref || 'fishing';
    if (addTo === 'fishing' && fishMap && userId) {
      const pdata = fishMap.get(userId); if (pdata) pdata.coins = (pdata.coins || 0) + coins;
      if (global.saveFishingPlayerData) global.saveFishingPlayerData(); else if (global.savePlayerData) global.savePlayerData();
    } else if (addTo === 'farm' && farmMap) {
      const f = farmMap.get(farmKey); if (f) f.coins = (f.coins || 0) + coins;
      if (global.saveFarmData) global.saveFarmData();
    } else if (addTo === 'split') {
      const half = Math.floor(coins / 2);
      if (fishMap && userId) { const pdata = fishMap.get(userId); if (pdata) pdata.coins = (pdata.coins || 0) + half; }
      if (farmMap) { const f = farmMap.get(farmKey); if (f) f.coins = (f.coins || 0) + (coins - half); }
      try { if (global.saveFishingPlayerData) global.saveFishingPlayerData(); else if (global.savePlayerData) global.savePlayerData(); } catch {}
      try { if (global.saveFarmData) global.saveFarmData(); } catch {}
    }
  } catch {}
  // Drops: stones and rune chance
  const stones = 1 + Math.floor(Math.random() * (['I','II','III','IV','V'].indexOf(tier)+1));
  player.inventory.stones = (player.inventory.stones || 0) + stones;
  const rune = maybeDropRune();
  let dropMsg = `🪨 Nhặt được ${stones} đá nâng cấp.`;
  if (rune) {
    player.inventory.runes[rune.id] = rune;
    dropMsg += `\n💎 Nhận rune ${rune.tier} +${rune.stat} (${rune.value}).`;
  }
  // Player progression
  player.wins += 1;
  player.exp += 50 * (['I','II','III','IV','V'].indexOf(tier) + 1);
  while (player.exp >= player.level * 100) {
    player.exp -= player.level * 100;
    player.level += 1;
    // Small stat growth
    player.stats.hp += 10;
    player.stats.atk += 3;
    player.stats.def += 1;
    if (player.level % 5 === 0) player.stats.crit = Math.min(0.5, player.stats.crit + 0.02);
  }
  // Best tier
  const tierRank = { I:1, II:2, III:3, IV:4, V:5 };
  if (tierRank[tier] > tierRank[player.bestTier]) player.bestTier = tier;
  // Sync to global leaderboard
  try {
    if (!global.gameLeaderboard) {
      global.gameLeaderboard = { caro: new Map(), fishing: new Map(), taixiu: {}, blackjack: {}, poker: {}, roulette: {}, baccarat: {}, boss: new Map() };
    }
    if (!(global.gameLeaderboard.boss instanceof Map)) global.gameLeaderboard.boss = new Map();
    global.gameLeaderboard.boss.set(player.__userId, {
      name: player.name,
      wins: player.wins,
      bestTier: player.bestTier,
      level: player.level
    });
  } catch {}
  // Persist to user profile helper
  try {
    if (userProfile && typeof userProfile.recordBoss === 'function') {
      userProfile.recordBoss(player.__userId, {
        name: player.name,
        wins: player.wins,
        level: player.level,
        bestTier: player.bestTier,
        coinsEarned: coins
      });
    }
  } catch {}
  return { coins, dropMsg };
}

// Formatters
function formatStats(p) {
  const pst = getEffectiveStats(p);
  return [
    `👤 ${p.name}${p.element ? ` • ${ELEMENTS[p.element].emoji}${ELEMENTS[p.element].name}` : ''}`,
    `⭐ Level ${p.level} • EXP ${p.exp}/${p.level*100}`,
    `❤️ HP ${pst.hp} • ⚔️ ATK ${pst.atk} • 🛡️ DEF ${pst.def}`,
    `🎯 CRIT ${(pst.crit*100).toFixed(0)}% • 🏃 SPEED ${pst.speed}`,
    `🏆 Thắng ${p.wins} • Tier cao nhất: ${p.bestTier}`,
    `🎁 Nhận thưởng về: ${p.rewardPref || 'fishing'} • 🪨 Đá: ${p.inventory.stones}`,
    `🔹 Rune trang bị: [1] ${fmtRune(p.inventory.equipped[1])} | [2] ${fmtRune(p.inventory.equipped[2])} | [3] ${fmtRune(p.inventory.equipped[3])}`
  ].join('\n');
}

// Rune system
const RUNE_TIERS = [
  { tier: 'D', weight: 55, value: [1,2] },
  { tier: 'C', weight: 25, value: [2,4] },
  { tier: 'B', weight: 12, value: [4,6] },
  { tier: 'A', weight: 6,  value: [6,9] },
  { tier: 'S', weight: 2,  value: [9,12] }
];
const RUNE_STATS = ['hp','atk','def','crit','speed'];

function maybeDropRune() {
  if (Math.random() > 0.35) return null; // 35% chance
  const total = RUNE_TIERS.reduce((a,b)=>a+b.weight,0);
  let r = Math.random()*total; let chosen = RUNE_TIERS[0];
  for (const t of RUNE_TIERS) { if ((r-=t.weight)<=0) { chosen=t; break; } }
  const stat = RUNE_STATS[Math.floor(Math.random()*RUNE_STATS.length)];
  const val = randInt(chosen.value[0], chosen.value[1]);
  return { id: `R${Date.now()}${Math.floor(Math.random()*1000)}`, tier: chosen.tier, stat, value: val };
}

function randInt(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }

function fmtRune(r) {
  if (!r) return 'Trống';
  if (typeof r === 'string') return r;
  return `${r.tier}-${r.stat}+${r.value}`;
}

function getEffectiveStats(p) {
  const base = { ...p.stats };
  const eq = p.inventory?.equipped || {};
  const add = { hp:0, atk:0, def:0, crit:0, speed:0 };
  for (const slot of [1,2,3]) {
    const r = eq[slot];
    if (!r) continue;
    if (r.stat === 'crit') add.crit += (r.value/100);
    else add[r.stat] += r.value;
  }
  return {
    hp: base.hp + add.hp,
    atk: base.atk + add.atk,
    def: base.def + add.def,
    speed: base.speed + add.speed,
    crit: Math.min(0.9, base.crit + add.crit)
  };
}

module.exports = {
  config: {
    name: 'boss',
    version: '1.2.0',
    role: 0,
    author: 'Bonz Boss Game',
    description: 'Đánh Boss theo lượt với hệ nguyên tố',
    category: 'Game',
    usage: 'boss [help/create/setname/choose/stats/skills/fight/cast/flee/leaderboard/reward/rune/daily/weekly/claim/tower]',
    cooldowns: 2
  },

  onLoad: () => {
    loadBossData();
    // Autosave timer
    try {
      if (global.__bossAutoSaveId) clearInterval(global.__bossAutoSaveId);
      global.__bossAutoSaveId = setInterval(() => { try { saveBossData(); } catch {} }, 5*60*1000);
      if (!global.__bossShutdownHook) {
        const doSave = () => { try { saveBossData(); } catch {} };
        process.on('SIGINT', () => { doSave(); setTimeout(() => process.exit(0), 50); });
        process.on('SIGTERM', () => { doSave(); setTimeout(() => process.exit(0), 50); });
        process.on('beforeExit', () => { doSave(); });
        global.__bossShutdownHook = true;
      }
    } catch (e) { console.error('[BOSS] onLoad:', e); }
  },

  run: async function({ api, event, args }) {
    const { threadId, type } = event;
    const userId = event?.data?.uidFrom || event?.authorId;
    const action = (args[0]||'').toLowerCase();

    const playerKey = `${threadId}_${userId}`;

    if (!action || action === 'help') {
      const msg = [
        '👹 GAME ĐÁNH BOSS - HỆ NGUYÊN TỐ',
        '━━━━━━━━━━━━━━━━━━━━',
        '• boss create <tên>  → Tạo nhân vật',
        '• boss setname <tên> → Đổi tên',
        '• boss choose <hệ>   → Chọn: lửa/nước/sét/đất/gió/băng',
        '• boss stats         → Xem chỉ số',
        '• boss fight <tier>  → Đánh boss I/II/III/IV/V (mất phí)',
        '• boss cast <skill>  → đánh | khiên | hồi | tối-thượng',
        '• boss flee          → Bỏ chạy',
        '• boss leaderboard   → BXH thắng boss',
        '• boss reward set <fishing|farm|split> | boss reward get',
        '• boss rune          → Xem rune & trang bị',
        '• boss equip <slot> <runeId> | boss upgrade <runeId>',
        '• boss daily | boss weekly | boss claim',
        '• boss tower start|stats|stop',
        '',
        'Ví dụ: boss create Anh Hùng | boss choose lửa | boss fight I'
      ].join('\n');
      return sendChunked(api, msg, threadId, type);
    }

    if (action === 'create') {
      const name = args.slice(1).join(' ').trim() || 'Chiến Binh';
      const p = ensurePlayer(threadId, userId);
      p.name = name.slice(0, 30);
      saveBossData();
      return api.sendMessage(`✅ Đã tạo nhân vật: ${p.name}. Dùng "boss choose <hệ>" để chọn nguyên tố.`, threadId, type);
    }

    if (action === 'setname') {
      const p = ensurePlayer(threadId, userId);
      const name = args.slice(1).join(' ').trim();
      if (!name) return api.sendMessage('❗ Dùng: boss setname <tên>', threadId, type);
      p.name = name.slice(0, 30);
      saveBossData();
      return api.sendMessage(`✍️ Đã đổi tên: ${p.name}`, threadId, type);
    }

    if (action === 'choose') {
      const el = (args[1]||'').toLowerCase();
      const map = { 'lua':'fire','lửa':'fire','nuoc':'water','nước':'water','set':'electric','sét':'electric','dat':'earth','đất':'earth','gio':'wind','gió':'wind','bang':'ice','băng':'ice' };
      const key = map[el] || el;
      if (!ELEMENTS[key]) return api.sendMessage('❌ Hệ không hợp lệ. Chọn: lửa/nước/sét/đất/gió/băng', threadId, type);
      const p = ensurePlayer(threadId, userId);
      p.element = key;
      saveBossData();
      return api.sendMessage(`✨ Đã chọn hệ: ${ELEMENTS[key].emoji} ${ELEMENTS[key].name}`, threadId, type);
    }

    if (action === 'stats') {
      const p = ensurePlayer(threadId, userId);
      return sendChunked(api, formatStats(p), threadId, type);
    }

    if (action === 'skills') {
      const p = ensurePlayer(threadId, userId);
      if (!p.element) return api.sendMessage('❗ Chọn hệ trước: boss choose <hệ>', threadId, type);
      const lines = [
        `🧠 KỸ NĂNG (${ELEMENTS[p.element].emoji} ${ELEMENTS[p.element].name})`,
        '- đánh: Gây sát thương theo ATK, cộng dồn nộ',
        '- khiên: Giảm 50% sát thương 1 lượt',
        '- hồi: Hồi một phần HP',
        '- tối-thượng: Cần 100 năng lượng, sát thương lớn',
      ].join('\n');
      return api.sendMessage(lines, threadId, type);
    }

    if (action === 'fight') {
      const tier = (args[1]||'I').toUpperCase();
      if (!TIER_FEES[tier]) return api.sendMessage('❗ Dùng: boss fight I|II|III|IV|V', threadId, type);
      const p = ensurePlayer(threadId, userId);
      if (!p.element) return api.sendMessage('❗ Chọn hệ trước: boss choose <hệ>', threadId, type);
      // Fee
      const fee = TIER_FEES[tier];
      const bal = unifiedGetBalances(threadId, userId);
      if (bal.total < fee) {
        return sendChunked(api, `❌ Không đủ coins (cần ${fee.toLocaleString()}).\n💡 Gợi ý: game farm harvest hoặc fishing cast rồi fishing sell.`, threadId, type);
      }
      const ok = unifiedDeduct(threadId, userId, fee);
      if (!ok) return api.sendMessage('⚠️ Lỗi trừ ví chung, thử lại.', threadId, type);
      // Start battle
      const battle = startBattle(p, tier);
      activeBattles.set(playerKey, battle);
      const msg = [`🎮 BẮT ĐẦU ĐÁNH BOSS TIER ${tier}! Phí: ${fee.toLocaleString()} coins`, '', formatBattleState(p, battle)].join('\n');
      return sendChunked(api, msg, threadId, type);
    }

    if (action === 'cast') {
      const p = ensurePlayer(threadId, userId);
      const battle = activeBattles.get(playerKey);
      if (!battle) return api.sendMessage('❗ Bạn chưa ở trong trận. Dùng: boss fight <tier>', threadId, type);
      const cmd = (args[1]||'').toLowerCase();
      const { logs, result } = applyCast(p, battle, cmd);
      let out = '';
      out += logs.join('\n') + '\n\n';
      if (result === 'win') {
        const { coins, dropMsg } = grantRewards(p, battle.tier);
        // progress daily/weekly
        try {
          const today = new Date();
          const dayKey = today.toISOString().slice(0,10);
          if (p.daily.date !== dayKey) { p.daily = { date: dayKey, progress: 0, target: 1, claimed: false }; }
          p.daily.progress += 1;
          const week = getYearWeek(today);
          if (p.weekly.week !== week) { p.weekly = { week, progress: 0, target: 5, claimed: false }; }
          p.weekly.progress += 1;
        } catch {}
        activeBattles.delete(playerKey);
        saveBossData();
        out += `🏆 THẮNG! Nhận ${coins.toLocaleString()} coins.\n${dropMsg}\n\n` + formatStats(p);
      } else if (result === 'lose') {
        activeBattles.delete(playerKey);
        saveBossData();
        out += `💀 THUA! Cố gắng nâng cấp chỉ số và thử lại.\n\n` + formatStats(p);
      } else {
        out += formatBattleState(p, battle);
      }
      return sendChunked(api, out, threadId, type);
    }

    if (action === 'flee') {
      if (!activeBattles.has(playerKey)) return api.sendMessage('❗ Bạn không ở trong trận.', threadId, type);
      activeBattles.delete(playerKey);
      return api.sendMessage('🏳️ Bạn đã rút lui.', threadId, type);
    }

    if (action === 'leaderboard') {
      // Simple local LB by wins then best tier
      const arr = [];
      for (const [key, pl] of bossPlayers.entries()) {
        const [tId, uId] = key.split('_');
        if (String(tId) !== String(threadId)) continue; // per-thread lb
        arr.push({ name: pl.name, wins: pl.wins||0, tier: pl.bestTier||'I' });
      }
      if (arr.length === 0) return api.sendMessage('📭 Chưa có dữ liệu BXH.', threadId, type);
      const rankVal = { I:1, II:2, III:3, IV:4, V:5 };
      arr.sort((a,b)=> (b.wins - a.wins) || (rankVal[b.tier]-rankVal[a.tier]));
      const top = arr.slice(0, 10);
      const lines = top.map((r,i)=> `${i+1}. ${r.name} — 🏆 ${r.wins} win • Tier ${r.tier}`);
      return sendChunked(api, ['🏆 BẢNG XẾP HẠNG BOSS', '━━━━━━━━━━━━━━━━━━━━', ...lines].join('\n'), threadId, type);
    }

    // reward set/get
    if (action === 'reward') {
      const sub = (args[1]||'').toLowerCase();
      const p = ensurePlayer(threadId, userId);
      if (sub === 'set') {
        const pref = (args[2]||'').toLowerCase();
        if (!['fishing','farm','split'].includes(pref)) return api.sendMessage('❗ Chọn: fishing | farm | split', threadId, type);
        p.rewardPref = pref; saveBossData();
        return api.sendMessage(`✅ Đã đặt kênh thưởng: ${pref}`, threadId, type);
      }
      return api.sendMessage(`🎁 Kênh thưởng hiện tại: ${p.rewardPref}`, threadId, type);
    }

    // rune list
    if (action === 'rune') {
      const p = ensurePlayer(threadId, userId);
      const list = Object.values(p.inventory.runes||{});
      if (!list.length) return api.sendMessage('📦 Bạn chưa có rune nào.', threadId, type);
      const lines = list.slice(0, 50).map(r=> `${r.id}: ${r.tier}-${r.stat}+${r.value}`);
      return sendChunked(api, ['💎 TÚI RUNE', '━━━━━━━━', ...lines].join('\n'), threadId, type);
    }

    if (action === 'equip') {
      const p = ensurePlayer(threadId, userId);
      const slot = parseInt(args[1],10);
      const id = args[2];
      if (![1,2,3].includes(slot) || !id) return api.sendMessage('❗ Dùng: boss equip <1|2|3> <runeId>', threadId, type);
      const r = p.inventory.runes[id];
      if (!r) return api.sendMessage('❌ Không tìm thấy rune.', threadId, type);
      p.inventory.equipped[slot] = r; saveBossData();
      return api.sendMessage(`✅ Đã trang bị slot [${slot}] → ${fmtRune(r)}`, threadId, type);
    }

    if (action === 'upgrade') {
      const p = ensurePlayer(threadId, userId);
      const id = args[1]; if (!id) return api.sendMessage('❗ Dùng: boss upgrade <runeId>', threadId, type);
      const r = p.inventory.runes[id]; if (!r) return api.sendMessage('❌ Không tìm thấy rune.', threadId, type);
      const costMap = { D:2, C:3, B:5, A:8, S:12 };
      const cost = costMap[r.tier] || 3;
      if ((p.inventory.stones||0) < cost) return api.sendMessage(`❌ Cần ${cost} đá để nâng cấp.`, threadId, type);
      p.inventory.stones -= cost;
      r.value += 1;
      saveBossData();
      return api.sendMessage(`🔧 Đã nâng ${id} → ${fmtRune(r)} (−${cost} đá).`, threadId, type);
    }

    if (action === 'daily' || action === 'weekly' || action === 'claim') {
      const p = ensurePlayer(threadId, userId);
      const today = new Date();
      const dayKey = today.toISOString().slice(0,10);
      const week = getYearWeek(today);
      if (p.daily.date !== dayKey) p.daily = { date: dayKey, progress: 0, target: 1, claimed: false };
      if (p.weekly.week !== week) p.weekly = { week, progress: 0, target: 5, claimed: false };
      if (action === 'daily') {
        return api.sendMessage(`📅 Daily: ${p.daily.progress}/${p.daily.target} • ${p.daily.claimed ? 'ĐÃ NHẬN' : 'Chưa nhận'}`, threadId, type);
      }
      if (action === 'weekly') {
        return api.sendMessage(`🗓️ Weekly: ${p.weekly.progress}/${p.weekly.target} • ${p.weekly.claimed ? 'ĐÃ NHẬN' : 'Chưa nhận'}`, threadId, type);
      }
      if (action === 'claim') {
        let msg = [];
        if (!p.daily.claimed && p.daily.progress >= p.daily.target) { p.daily.claimed = true; p.inventory.stones = (p.inventory.stones||0)+2; msg.push('✅ Nhận daily: +2 đá.'); }
        if (!p.weekly.claimed && p.weekly.progress >= p.weekly.target) { p.weekly.claimed = true; const rr = maybeDropRune(); if (rr) { p.inventory.runes[rr.id] = rr; msg.push(`✅ Nhận weekly: rune ${fmtRune(rr)}.`); } else { p.inventory.stones+=5; msg.push('✅ Nhận weekly: +5 đá.'); } }
        if (!msg.length) return api.sendMessage('ℹ️ Chưa đủ điều kiện nhận thưởng.', threadId, type);
        saveBossData();
        return sendChunked(api, msg.join('\n'), threadId, type);
      }
    }

    if (action === 'tower') {
      const sub = (args[1]||'').toLowerCase();
      const p = ensurePlayer(threadId, userId);
      if (sub === 'stats' || !sub) {
        return api.sendMessage(`🏯 Tháp: Kỷ lục cao nhất: tầng ${p.tower.best||0}`, threadId, type);
      }
      if (sub === 'start') {
        // no fee for tower start tier I
        const battle = startBattle(p, 'I');
        battle.mode = 'tower'; battle.towerFloor = 1;
        activeBattles.set(playerKey, battle);
        return sendChunked(api, ['🏯 BẮT ĐẦU LEO THÁP!', formatBattleState(p, battle)].join('\n'), threadId, type);
      }
      if (sub === 'stop') {
        const b = activeBattles.get(playerKey);
        if (!b || b.mode !== 'tower') return api.sendMessage('ℹ️ Bạn không ở trong chế độ Tháp.', threadId, type);
        // update best
        p.tower.best = Math.max(p.tower.best||0, b.towerFloor||1);
        activeBattles.delete(playerKey); saveBossData();
        return api.sendMessage(`✅ Dừng Tháp. Kỷ lục: tầng ${p.tower.best}`, threadId, type);
      }
      return api.sendMessage('❗ Dùng: boss tower start|stats|stop', threadId, type);
    }

    // Default
    return api.sendMessage('❗ Dùng: boss help', threadId, type);
  }
};
