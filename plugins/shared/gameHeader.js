const profiles = require('./profiles');

function formatNumber(n) {
  try { return Number(n || 0).toLocaleString('vi-VN'); } catch { return String(n || 0); }
}

// Create a standardized header for all games
// Usage: makeHeader('Fishing', { name, uid, coins })
function makeHeader(gameName, user) {
  const name = user?.name || 'Người chơi';
  const uid = String(user?.uid || '');
  let coins = user?.coins;
  if (typeof coins === 'undefined') {
    try {
      const p = profiles.getProfile(uid);
      coins = p?.coins ?? 0;
    } catch { coins = 0; }
  }
  return `👤 Tên: ${name} | 🎮 Game: ${gameName} | 🆔 UID: ${uid} | 💰 Tiền: ${formatNumber(coins)}`;
}

module.exports = { makeHeader };
