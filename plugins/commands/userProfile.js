const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROFILE_FILE = path.join(DATA_DIR, 'user_profiles.json');

function ensureDir() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function loadAll() {
  try {
    ensureDir();
    if (!fs.existsSync(PROFILE_FILE)) return new Map();
    const obj = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
    const m = new Map();
    for (const [k, v] of Object.entries(obj)) m.set(k, v);
    return m;
  } catch (e) { console.error('[Profile] Load error:', e); return new Map(); }
}

function saveAll(map) {
  try {
    ensureDir();
    const obj = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { console.error('[Profile] Save error:', e); }
}

const profiles = loadAll();

function nowTs() { return Date.now(); }

function defaultProfile(uid, name) {
  return {
    uid: String(uid),
    name: name || 'Người chơi',
    createdAt: nowTs(),
    updatedAt: nowTs(),
    games: {
      boss: { wins: 0, bestTier: 'I', level: 1, coinsEarned: 0, lastPlayed: 0 },
      fishing: { level: 1, exp: 0, coins: 0, legendary: 0, rare: 0, lastPlayed: 0 },
      caro: { wins: 0, losses: 0, draws: 0, lastPlayed: 0 },
      casino: {
        taixiu: { wins: 0, losses: 0, jackpots: 0, biggestWin: 0 },
        blackjack: { wins: 0, losses: 0, pushes: 0, blackjacks: 0 },
        poker: { wins: 0, losses: 0, hands: 0, totalWin: 0 },
        roulette: { wins: 0, losses: 0, spins: 0, biggestWin: 0 },
        baccarat: { wins: 0, losses: 0, ties: 0, naturals: 0 }
      }
    }
  };
}

function get(uid, name) {
  const key = String(uid);
  if (!profiles.has(key)) profiles.set(key, defaultProfile(uid, name));
  return profiles.get(key);
}

function set(uid, profile) {
  profiles.set(String(uid), profile);
  saveAll(profiles);
}

function update(uid, updater) {
  const p = get(uid);
  const next = updater ? updater({ ...p }) : p;
  if (next) {
    next.updatedAt = nowTs();
    set(uid, next);
    return next;
  }
  return p;
}

function recordBoss(uid, data = {}) {
  return update(uid, (p) => {
    p.name = data.name || p.name;
    if (!p.games.boss) p.games.boss = { wins: 0, bestTier: 'I', level: 1, coinsEarned: 0, lastPlayed: 0 };
    const b = p.games.boss;
    if (typeof data.wins === 'number') b.wins = data.wins;
    if (typeof data.level === 'number') b.level = data.level;
    if (typeof data.coinsEarned === 'number') b.coinsEarned = (b.coinsEarned || 0) + data.coinsEarned;
    if (data.bestTier) b.bestTier = data.bestTier;
    b.lastPlayed = nowTs();
    return p;
  });
}

module.exports = {
  // helper APIs
  get,
  update,
  recordBoss,
  // other games
  recordCaro: (uid, data = {}) => update(uid, (p) => {
    if (!p.games.caro) p.games.caro = { wins: 0, losses: 0, draws: 0, lastPlayed: 0 };
    const c = p.games.caro;
    if (data.result === 'win') c.wins++;
    else if (data.result === 'loss') c.losses++;
    else if (data.result === 'draw') c.draws++;
    c.lastPlayed = nowTs();
    return p;
  }),
  recordFishing: (uid, data = {}) => update(uid, (p) => {
    if (!p.games.fishing) p.games.fishing = { level: 1, exp: 0, coins: 0, legendary: 0, rare: 0, lastPlayed: 0 };
    const f = p.games.fishing;
    if (typeof data.level === 'number') f.level = data.level;
    if (typeof data.exp === 'number') f.exp = data.exp;
    if (typeof data.coinsDelta === 'number') f.coins = (f.coins || 0) + data.coinsDelta;
    if (typeof data.legendaryDelta === 'number') f.legendary = (f.legendary || 0) + data.legendaryDelta;
    if (typeof data.rareDelta === 'number') f.rare = (f.rare || 0) + data.rareDelta;
    f.lastPlayed = nowTs();
    return p;
  }),
  recordCasino: (uid, game, payload = {}) => update(uid, (p) => {
    if (!p.games.casino) p.games.casino = {};
    const c = p.games.casino;
    if (!c[game]) c[game] = {};
    Object.keys(payload).forEach(k => {
      if (typeof payload[k] === 'number') {
        c[game][k] = (c[game][k] || 0) + payload[k];
      } else {
        c[game][k] = payload[k];
      }
    });
    return p;
  }),

  // Minimal command metadata to avoid loader complaints
  config: {
    name: '_user_profile_helper',
    version: '1.0.0',
    role: 2,
    author: 'Cascade',
    description: 'Helper lưu hồ sơ người dùng (không phải lệnh).',
    category: 'Hệ thống',
    usage: '',
    cooldowns: 0
  },
  run: async () => {}
};

// Expose to global for easy access across modules without require()
try {
  if (typeof global !== 'undefined') {
    global.userProfileHelper = module.exports;
    global.userProfile = module.exports;
  }
} catch {}
