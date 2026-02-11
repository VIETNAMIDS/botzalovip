const fs = require('fs');
const path = require('path');

// =========================
// Bonz Pet System (MVP v1)
// Commands: pet create <species> [name] | pet name <newName> | pet stats | pet feed | pet train <atk|def|spd|crit|luck> | pet battle <@user|userId>
// =========================

// Storage
if (!global.bonzPetData) {
  global.bonzPetData = new Map(); // key: `${threadId}_${userId}` -> PetProfile
}

const PET_DATA_FILE = path.join(__dirname, '../../data/bonzpet_data.json');
const dataDir = path.dirname(PET_DATA_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function savePetData() {
  try {
    const obj = {};
    for (const [k, v] of global.bonzPetData.entries()) obj[k] = v;
    fs.writeFileSync(PET_DATA_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { console.error('[PET] Save error:', e); }
}
function loadPetData() {
  try {
    if (fs.existsSync(PET_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(PET_DATA_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) global.bonzPetData.set(k, v);
    }
  } catch (e) { console.error('[PET] Load error:', e); }
}

// Helper: chunked sender
async function sendChunked(api, text, threadId, type, size = 1800) {
  const s = String(text || '');
  for (let i = 0; i < s.length; i += size) {
    const part = s.slice(i, i + size);
    try { // eslint-disable-next-line no-await-in-loop
      await api.sendMessage(part, threadId, type);
    } catch (e) {
      try { await api.sendMessage(part, threadId, type); } catch {}
    }
  }
}

// Wallet helpers (Unified: Farm + Fishing)
function getFarm(threadId, userId) {
  try { return global.bonzFarmData?.get?.(`${threadId}_${userId}`) || null; } catch { return null; }
}
function getFishing(userId) {
  try { return global.fishingPlayerData?.get?.(String(userId)) || null; } catch { return null; }
}
function getCoins(threadId, userId) {
  const farm = getFarm(threadId, userId);
  const fish = getFishing(userId);
  const farmCoins = farm ? (farm.coins || 0) : 0;
  const fishCoins = fish ? (fish.coins || 0) : 0;
  return farmCoins + fishCoins;
}
function getBalances(threadId, userId) {
  const farm = getFarm(threadId, userId);
  const fish = getFishing(userId);
  const farmCoins = farm ? (farm.coins || 0) : 0;
  const fishCoins = fish ? (fish.coins || 0) : 0;
  return { farmCoins, fishCoins, total: farmCoins + fishCoins };
}
function deductCoins(threadId, userId, amount) {
  let remain = amount;
  const farm = getFarm(threadId, userId);
  const fish = getFishing(userId);
  // Deduct from Farm first
  if (farm && farm.coins > 0 && remain > 0) {
    const take = Math.min(farm.coins, remain);
    farm.coins -= take;
    remain -= take;
  }
  // Then Fishing
  if (fish && fish.coins > 0 && remain > 0) {
    const take = Math.min(fish.coins, remain);
    fish.coins -= take;
    remain -= take;
  }
  if (remain <= 0) {
    if (typeof saveFarmData === 'function') { try { saveFarmData(); } catch {} }
    if (typeof global.saveFishingPlayerData === 'function') { try { global.saveFishingPlayerData(); } catch {} }
    return true;
  }
  // Not enough, rollback is not performed because we always take min; so coins unchanged if not enough? We partially deducted; revert to prevent partial charge
  // Revert partial deductions if any
  const diff = amount - remain;
  if (diff > 0) {
    // Put back to fishing first (reverse last deduction)
    if (fish) fish.coins += Math.max(0, Math.min(diff, (fish ? fish.coins : 0))); // best-effort
    if (farm) farm.coins += Math.max(0, diff); // best-effort
  }
  return false;
}

// Species catalog (diverse & balanced)
const SPECIES = {
  DRAGON:   { icon: '🐉', base: { hp: 120, atk: 18, def: 10, spd: 7,  crit: 10, luck: 5  }, passive: 'Kháng sát thương +10%' },
  PHOENIX:  { icon: '🦅', base: { hp: 100, atk: 16, def: 10, spd: 12, crit: 10, luck: 8  }, passive: 'Hồi phục nhẹ sau trận' },
  TIGER:    { icon: '🐯', base: { hp: 105, atk: 17, def: 10, spd: 11, crit: 12, luck: 6  }, passive: 'Tăng sát thương +5%' },
  WOLF:     { icon: '🐺', base: { hp: 90,  atk: 16, def: 8,  spd: 12, crit: 12, luck: 6  }, passive: 'Tăng tốc độ +10%' },
  FOX:      { icon: '🦊', base: { hp: 95,  atk: 15, def: 9,  spd: 12, crit: 10, luck: 10 }, passive: 'Né tránh +5%' },
  DOG:      { icon: '🐶', base: { hp: 100, atk: 14, def: 10, spd: 10, crit: 8,  luck: 10 }, passive: 'May mắn +10%' },
  CAT:      { icon: '🐱', base: { hp: 85,  atk: 12, def: 9,  spd: 13, crit: 14, luck: 8  }, passive: 'Tỉ lệ chí mạng +10%' },
  RABBIT:   { icon: '🐰', base: { hp: 80,  atk: 11, def: 8,  spd: 15, crit: 10, luck: 12 }, passive: 'Tăng né tránh +3%' },
  BEAR:     { icon: '🐻', base: { hp: 130, atk: 16, def: 14, spd: 6,  crit: 6,  luck: 6  }, passive: 'Giảm sát thương nhận +10%' },
  TURTLE:   { icon: '🐢', base: { hp: 130, atk: 10, def: 16, spd: 6,  crit: 6,  luck: 6  }, passive: 'Phòng thủ +15%' },
  PANDA:    { icon: '🐼', base: { hp: 120, atk: 12, def: 14, spd: 7,  crit: 8,  luck: 10 }, passive: 'An định: ít biến động sát thương' },
  EAGLE:    { icon: '🦅', base: { hp: 90,  atk: 15, def: 8,  spd: 14, crit: 12, luck: 8  }, passive: 'Tăng tỉ lệ đánh trước' },
  HORSE:    { icon: '🐴', base: { hp: 105, atk: 14, def: 10, spd: 13, crit: 9,  luck: 9  }, passive: 'Bền bỉ: tăng HP nhẹ' },
  MONKEY:   { icon: '🐒', base: { hp: 95,  atk: 14, def: 9,  spd: 13, crit: 11, luck: 10 }, passive: 'Xảo quyệt: +5% crit' },
  ELEPHANT: { icon: '🐘', base: { hp: 150, atk: 13, def: 16, spd: 5,  crit: 5,  luck: 6  }, passive: 'Cản phá: giảm crit nhận' },
  LION:     { icon: '🦁', base: { hp: 110, atk: 18, def: 11, spd: 10, crit: 11, luck: 6  }, passive: 'Uy dũng: +5% ATK' },
  SNAKE:    { icon: '🐍', base: { hp: 85,  atk: 13, def: 8,  spd: 14, crit: 13, luck: 9  }, passive: 'Độc tố: +5% crit' },
  CROCODILE:{ icon: '🐊', base: { hp: 120, atk: 16, def: 13, spd: 8,  crit: 7,  luck: 7  }, passive: 'Cắn mạnh: +5% dmg' },
  KANGAROO: { icon: '🦘', base: { hp: 100, atk: 15, def: 10, spd: 12, crit: 10, luck: 10 }, passive: 'Bật nhảy: +3 SPD' },
  PENGUIN:  { icon: '🐧', base: { hp: 95,  atk: 12, def: 11, spd: 10, crit: 8,  luck: 12 }, passive: 'Lạnh: giảm dmg nhận nhẹ' },
  UNICORN:  { icon: '🦄', base: { hp: 110, atk: 16, def: 11, spd: 12, crit: 12, luck: 10 }, passive: 'Thần thánh: +5% mọi chỉ số nhỏ' },
};
const SPECIES_KEYS = Object.keys(SPECIES);

function listSpeciesLines() {
  return SPECIES_KEYS.map((k, i) => `${i + 1}. ${SPECIES[k].icon} ${k}`).join('\n');
}

function newPet(speciesKey, name) {
  const sp = SPECIES[speciesKey];
  return {
    species: speciesKey,
    name: name || `${sp.icon} ${speciesKey}`,
    level: 1,
    exp: 0,
    expToNext: 100,
    stats: { ...sp.base },
    wins: 0,
    losses: 0,
    lastBattleAt: 0,
  };
}

function keyOf(threadId, userId) { return `${threadId}_${userId}`; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function levelUpIfNeeded(pet) {
  let up = false;
  while (pet.exp >= pet.expToNext) {
    pet.exp -= pet.expToNext;
    pet.level += 1;
    pet.expToNext = Math.floor(pet.level * 120);
    // Small stat increases per level
    pet.stats.hp += 8; pet.stats.atk += 2; pet.stats.def += 2; pet.stats.spd += 1; pet.stats.crit += 1; pet.stats.luck += 1;
    up = true;
  }
  return up;
}

function renderPetCard(pet) {
  const sp = SPECIES[pet.species];
  const bar = (val, max, len = 12) => {
    const pct = clamp(Math.round((val / max) * len), 0, len);
    return '█'.repeat(pct) + '░'.repeat(len - pct);
  };
  return [
    `${sp.icon} PET • ${pet.name}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🧬 Loài: ${pet.species} • Cấp: ${pet.level} • ⭐ ${pet.exp}/${pet.expToNext}`,
    `⚔️ ATK ${pet.stats.atk}  🛡️ DEF ${pet.stats.def}  🏃 SPD ${pet.stats.spd}`,
    `❤️ HP ${pet.stats.hp}  🎯 CRIT ${pet.stats.crit}%  🍀 LUCK ${pet.stats.luck}%`,
    `🏆 ${pet.wins}W-${pet.losses}L • Bị động: ${sp.passive}`,
  ].join('\n');
}

function parseTargetId(event, args) {
  // Try mention in event.data.mentions or args numeric
  const mention = event?.data?.mentions && Object.keys(event.data.mentions)[0];
  if (mention) return mention;
  const maybeId = (args || []).join(' ').trim();
  if (/^\d+$/.test(maybeId)) return maybeId;
  return null;
}

// Combat helpers
function calcDamage(attacker, defender) {
  const base = attacker.stats.atk + Math.floor(Math.random() * 6) - 2; // ±2 variance
  const mitig = Math.max(1, base - Math.floor(defender.stats.def * 0.6));
  // Crit check
  const critRoll = Math.random() * 100 < attacker.stats.crit;
  let dmg = mitig * (critRoll ? 1.8 : 1);
  // Species passive: simple modifiers
  if (attacker.species === 'WOLF') dmg *= 1.05; // speed/aggression
  if (defender.species === 'TURTLE') dmg *= 0.9; // tanky
  if (defender.species === 'DRAGON') dmg *= 0.9; // resist
  return { dmg: Math.max(1, Math.floor(dmg)), crit: critRoll };
}

module.exports = {
  config: {
    name: 'pet',
    version: '1.0.0',
    hasPermission: 0,
    credits: 'Bonz Pet System',
    description: 'Nuôi thú cưng + PvP',
    commandCategory: 'Game',
    usages: 'pet [create|name|stats|feed|train|battle] ...',
    cooldowns: 3,
  },

  onLoad: () => {
    loadPetData();
    try {
      if (global.bonzPetAutoSaveId) clearInterval(global.bonzPetAutoSaveId);
      global.bonzPetAutoSaveId = setInterval(() => { try { savePetData(); } catch {} }, 5 * 60 * 1000);
      if (!global.__bonzPetShutdownHook) {
        const doSave = () => { try { savePetData(); } catch {} };
        process.on('SIGINT', () => { doSave(); setTimeout(() => process.exit(0), 50); });
        process.on('SIGTERM', () => { doSave(); setTimeout(() => process.exit(0), 50); });
        process.on('beforeExit', () => { doSave(); });
        global.__bonzPetShutdownHook = true;
      }
    } catch (e) { console.error('[PET] onLoad error:', e); }
  },

  run: async function({ api, event, args }) {
    const { threadId, type } = event;
    const senderId = event?.data?.uidFrom || event?.authorId;
    const sub = (args[0] || '').toLowerCase();
    const playerKey = keyOf(threadId, senderId);

    try {
      if (!sub || sub === 'help') {
        const usage = [
          '🐾 PET SYSTEM — Lệnh:',
          '• pet create <species|số> [name]  — Tạo thú cưng',
          '• pet name <tên_mới>           — Đặt lại tên',
          '• pet stats                     — Xem hồ sơ',
          '• pet feed                      — Cho ăn (tăng EXP nhẹ)',
          '• pet train <atk|def|spd|crit|luck> — Huấn luyện (tốn coins)',
          '• pet battle <@user|userId>     — Thách đấu PvP',
          '',
          '🐾 Danh sách loài:',
          listSpeciesLines(),
        ].join('\n');
        return sendChunked(api, usage, threadId, type);
      }

      // CREATE
      if (sub === 'create') {
        let speciesArg = (args[1] || '').toUpperCase();
        const nameArg = args.slice(2).join(' ').trim();
        // allow numeric selection
        if (/^\d+$/.test(speciesArg)) {
          const idx = parseInt(speciesArg, 10) - 1;
          if (idx >= 0 && idx < SPECIES_KEYS.length) speciesArg = SPECIES_KEYS[idx];
        }
        if (!SPECIES[speciesArg]) {
          let list = listSpeciesLines();
          return sendChunked(api, `❗ Loài không hợp lệ. Chọn một:\n${list}\n💡 Dùng: pet create 1 [Tên] hoặc pet create DRAGON [Tên]`, threadId, type);
        }
        if (global.bonzPetData.has(playerKey)) {
          return api.sendMessage('❌ Bạn đã có thú cưng rồi!', threadId, type);
        }
        const pet = newPet(speciesArg, nameArg);
        global.bonzPetData.set(playerKey, pet);
        savePetData();
        return sendChunked(api, `🎉 TẠO THÚ CƯNG THÀNH CÔNG!
${renderPetCard(pet)}`, threadId, type);
      }

      // NAME
      if (sub === 'name') {
        const pet = global.bonzPetData.get(playerKey);
        if (!pet) return api.sendMessage('❌ Bạn chưa có thú cưng. Dùng: pet create ...', threadId, type);
        const newName = args.slice(1).join(' ').trim();
        if (!newName) return api.sendMessage('❗ Dùng: pet name <tên_mới>', threadId, type);
        // Cost 1000 coins (unified wallet)
        const NAME_COST = 1000;
        if (!deductCoins(threadId, senderId, NAME_COST)) {
          const bal = getCoins(threadId, senderId);
          return api.sendMessage(`❌ Không đủ coins để đổi tên (cần ${NAME_COST}). Số dư: ${bal}.\n💡 Mẹo: Hãy đi farm/câu cá để kiếm coins: 'game farm plant' hoặc 'fishing cast'`, threadId, type);
        }
        pet.name = newName.slice(0, 32);
        savePetData();
        const bal2 = getCoins(threadId, senderId);
        return sendChunked(api, `✏️ ĐỔI TÊN THÀNH CÔNG! (−1000 coins)
${renderPetCard(pet)}
💳 Số dư còn: ${bal2.toLocaleString()} coins`, threadId, type);
      }

      // STATS
      if (sub === 'stats') {
        const pet = global.bonzPetData.get(playerKey);
        if (!pet) return api.sendMessage('❌ Bạn chưa có thú cưng. Dùng: pet create ...', threadId, type);
        return sendChunked(api, renderPetCard(pet), threadId, type);
      }

      // FEED (gain small exp) — cost 100 coins
      if (sub === 'feed') {
        const pet = global.bonzPetData.get(playerKey);
        if (!pet) return api.sendMessage('❌ Bạn chưa có thú cưng. Dùng: pet create ...', threadId, type);
        const FEED_COST = 100;
        if (!deductCoins(threadId, senderId, FEED_COST)) {
          const bal = getCoins(threadId, senderId);
          return api.sendMessage(`❌ Không đủ coins để cho ăn (cần ${FEED_COST}). Số dư: ${bal}.\n💡 Mẹo: 'game farm harvest' hoặc 'fishing sell' để có thêm coins`, threadId, type);
        }
        pet.exp += 20;
        const up = levelUpIfNeeded(pet);
        savePetData();
        let msg = `🍖 CHO ĂN THÀNH CÔNG! (−${FEED_COST} coins) +20 EXP\n`;
        if (up) msg += `🎊 LEVEL UP! Cấp ${pet.level}\n`;
        const bal2 = getCoins(threadId, senderId);
        msg += `⭐ ${pet.exp}/${pet.expToNext}\n💳 Số dư còn: ${bal2.toLocaleString()} coins`;
        return api.sendMessage(msg, threadId, type);
      }

      // TRAIN (cost coins from Farm if exists)
      if (sub === 'train') {
        const stat = (args[1] || '').toLowerCase();
        const ALLOWED = ['atk', 'def', 'spd', 'crit', 'luck'];
        if (!ALLOWED.includes(stat)) {
          return api.sendMessage('❗ Dùng: pet train <atk|def|spd|crit|luck>', threadId, type);
        }
        const pet = global.bonzPetData.get(playerKey);
        if (!pet) return api.sendMessage('❌ Bạn chưa có thú cưng. Dùng: pet create ...', threadId, type);
        const cost = 500;
        if (!deductCoins(threadId, senderId, cost)) {
          const bal = getCoins(threadId, senderId);
          return api.sendMessage(`❌ Không đủ coins (cần ${cost}). Số dư: ${bal}.\n💡 Gợi ý: 'game farm market' để trồng/bán, hoặc 'fishing cast' rồi 'fishing sell'`, threadId, type);
        }
        pet.stats[stat] += stat === 'crit' || stat === 'luck' ? 1 : 2;
        pet.exp += 15;
        const up = levelUpIfNeeded(pet);
        savePetData();
        let msg = `🏋️ HUẤN LUYỆN ${stat.toUpperCase()} +${stat === 'crit' || stat === 'luck' ? 1 : 2} (−${cost} coins)\n`;
        if (up) msg += `🎊 LEVEL UP! Cấp ${pet.level}\n`;
        const bal2 = getCoins(threadId, senderId);
        msg += `${renderPetCard(pet)}\n💳 Số dư còn: ${bal2.toLocaleString()} coins`;
        return sendChunked(api, msg, threadId, type);
      }

      // WALLET VIEW
      if (['wallet', 'ví', 'vi', 'balance'].includes(sub)) {
        const { farmCoins, fishCoins, total } = getBalances(threadId, senderId);
        const text = [
          '💳 VÍ CHUNG (Farm + Fishing)',
          '━━━━━━━━━━━━━━━━━━━━',
          `🌾 Farm: ${farmCoins.toLocaleString()} coins`,
          `🎣 Fishing: ${fishCoins.toLocaleString()} coins`,
          `💰 Tổng: ${total.toLocaleString()} coins`,
          '',
          '💡 Mẹo kiếm coins: "game farm plant/harvest" hoặc "fishing cast/sell"'
        ].join('\n');
        return sendChunked(api, text, threadId, type);
      }

      // BATTLE
      if (sub === 'battle') {
        const petA = global.bonzPetData.get(playerKey);
        if (!petA) return api.sendMessage('❌ Bạn chưa có thú cưng. Dùng: pet create ...', threadId, type);
        const targetId = parseTargetId(event, args.slice(1));
        if (!targetId) return api.sendMessage('❗ Dùng: pet battle <@user|userId>', threadId, type);
        const oppKey = keyOf(threadId, targetId);
        const petB = global.bonzPetData.get(oppKey);
        if (!petB) return api.sendMessage('❌ Đối thủ chưa có thú cưng!', threadId, type);

        // Cooldown 60s
        const now = Date.now();
        if (petA.lastBattleAt && now - petA.lastBattleAt < 60000) {
          const remain = Math.ceil((60000 - (now - petA.lastBattleAt)) / 1000);
          return api.sendMessage(`⏳ Vui lòng đợi ${remain}s trước khi đấu tiếp.`, threadId, type);
        }

        // Simulate simple turn-based battle
        const log = [];
        let hpA = petA.stats.hp;
        let hpB = petB.stats.hp;
        const first = (petA.stats.spd >= petB.stats.spd) ? 'A' : 'B';
        log.push(`🐾 TRẬN ĐẤU THÚ CƯNG`);
        log.push(`━━━━━━━━━━━━━━━━━━━━`);
        log.push(`A) ${SPECIES[petA.species].icon} ${petA.name} — HP ${hpA}`);
        log.push(`B) ${SPECIES[petB.species].icon} ${petB.name} — HP ${hpB}`);
        log.push('');

        let turn = 1;
        let attacker = first;
        while (hpA > 0 && hpB > 0 && turn <= 20) {
          if (attacker === 'A') {
            const { dmg, crit } = calcDamage(petA, petB);
            hpB = Math.max(0, hpB - dmg);
            log.push(`🔸 Lượt ${turn}: ${petA.name} gây ${dmg} sát thương${crit ? ' (CRIT!)' : ''} → B: ${hpB} HP`);
            attacker = 'B';
          } else {
            const { dmg, crit } = calcDamage(petB, petA);
            hpA = Math.max(0, hpA - dmg);
            log.push(`🔹 Lượt ${turn}: ${petB.name} gây ${dmg} sát thương${crit ? ' (CRIT!)' : ''} → A: ${hpA} HP`);
            attacker = 'A';
          }
          turn += 1;
        }

        let result = '';
        if (hpA === hpB) result = '⚖️ Hòa';
        else if (hpA > hpB) result = `🏆 Thắng: ${petA.name}`;
        else result = `🏆 Thắng: ${petB.name}`;
        log.push('');
        log.push(result);

        // Rewards
        if (hpA > hpB) { petA.wins++; petB.losses++; petA.exp += 40; levelUpIfNeeded(petA); }
        else if (hpB > hpA) { petB.wins++; petA.losses++; petB.exp += 40; levelUpIfNeeded(petB); }
        else { petA.exp += 15; petB.exp += 15; levelUpIfNeeded(petA); levelUpIfNeeded(petB); }
        petA.lastBattleAt = Date.now();
        savePetData();

        return sendChunked(api, log.join('\n'), threadId, type);
      }

      return api.sendMessage('❗ Lệnh không hợp lệ. Dùng: pet help', threadId, type);
    } catch (e) {
      console.error('[PET] Error:', e);
      return api.sendMessage('❌ Lỗi xử lý lệnh PET', threadId, type);
    }
  }
};
