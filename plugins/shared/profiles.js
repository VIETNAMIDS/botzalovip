const fs = require('fs');
const path = require('path');

// Profiles data file (re-use ../../data like farm uses)
const PROFILES_FILE = path.join(__dirname, '../../data/bonz_profiles.json');

// Ensure data directory exists
const dataDir = path.dirname(PROFILES_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// In-memory cache
if (!global.bonzProfiles) global.bonzProfiles = new Map();

function loadProfiles() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
      const obj = JSON.parse(raw || '{}');
      global.bonzProfiles = new Map(Object.entries(obj));
    }
  } catch (e) {
    console.warn('[PROFILES] load error:', e?.message);
  }
}

function saveProfiles() {
  try {
    const obj = Object.fromEntries(global.bonzProfiles.entries());
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn('[PROFILES] save error:', e?.message);
  }
}

function getProfile(userId) {
  if (!global.bonzProfiles) loadProfiles();
  return global.bonzProfiles.get(String(userId));
}

function hasProfile(userId) {
  return !!getProfile(userId);
}

function ensureProfile(userId, name) {
  const id = String(userId);
  if (!global.bonzProfiles) loadProfiles();
  if (!global.bonzProfiles.has(id)) {
    const prof = {
      id,
      name: name && String(name).trim() || `Người chơi ${id.slice(-4)}`,
      createdAt: Date.now(),
      // shared wallet for all games (example):
      coins: 0,
      vip: 0,
      stats: { games: 0 }
    };
    global.bonzProfiles.set(id, prof);
    saveProfiles();
  }
  return global.bonzProfiles.get(id);
}

function setProfileName(userId, newName) {
  const id = String(userId);
  if (!global.bonzProfiles) loadProfiles();
  const p = global.bonzProfiles.get(id);
  if (!p) return false;
  p.name = String(newName || '').trim() || p.name;
  saveProfiles();
  return true;
}

// Eager load
try { loadProfiles(); } catch {}

module.exports = {
  loadProfiles,
  saveProfiles,
  getProfile,
  hasProfile,
  ensureProfile,
  setProfileName,
  PROFILES_FILE
};
