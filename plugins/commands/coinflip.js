const fs = require('fs');
const path = require('path');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');

// Đường dẫn file lưu dữ liệu
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const COINFLIP_DATA_FILE = path.join(DATA_DIR, 'coinflip_data.json');

// Tạo thư mục data nếu chưa có
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Lưu trữ dữ liệu người chơi
const playerData = new Map();

// Functions để save/load dữ liệu
function savePlayerData() {
  try {
    const dataToSave = {};
    for (const [userId, data] of playerData.entries()) {
      dataToSave[userId] = data;
    }
    fs.writeFileSync(COINFLIP_DATA_FILE, JSON.stringify(dataToSave, null, 2));
    console.log('[COINFLIP] Đã lưu dữ liệu người chơi');
  } catch (error) {
    console.error('[COINFLIP] Lỗi khi lưu dữ liệu:', error);
  }
}

function loadPlayerData() {
  try {
    if (fs.existsSync(COINFLIP_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(COINFLIP_DATA_FILE, 'utf8'));
      for (const [userId, userData] of Object.entries(data)) {
        playerData.set(userId, userData);
      }
      console.log('[COINFLIP] Đã tải dữ liệu người chơi');
    }
  } catch (error) {
    console.error('[COINFLIP] Lỗi khi tải dữ liệu:', error);
  }
}

// Load dữ liệu khi khởi động
loadPlayerData();

// Function tạo player mới hoặc lấy player hiện có
function createPlayer(userId) {
  if (!playerData.has(userId)) {
    playerData.set(userId, {
      coins: 1000,
      totalFlips: 0,
      wins: 0,
      losses: 0,
      winStreak: 0,
      bestStreak: 0,
      totalWinnings: 0,
      totalLosses: 0,
      lastPlayed: null,
      achievements: []
    });
    savePlayerData();
  }
  return playerData.get(userId);
}

// Kiểm tra admin
function isAdmin(userId) {
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot.map(String) : [];
  return adminList.includes(String(userId)) || ownerList.includes(String(userId));
}

// Hàm tung đồng xu với random tốt hơn
function flipCoin() {
  // Sử dụng multiple random sources để tăng tính ngẫu nhiên
  const random1 = Math.random();
  const random2 = Math.random();
  const random3 = Math.random();
  
  // Kết hợp 3 nguồn random và thêm timestamp
  const combinedRandom = (random1 + random2 + random3 + (Date.now() % 1000) / 1000) / 4;
  
  // Đảm bảo kết quả trong khoảng 0-1
  const finalRandom = combinedRandom % 1;
  
  const result = finalRandom < 0.5 ? 'heads' : 'tails';
  
  // Debug logging (tắt trong production)
  // console.log(`[COINFLIP DEBUG] Random: ${finalRandom.toFixed(4)} -> ${result}`);
  
  return result;
}

// Hàm test tỷ lệ coin flip (chỉ dành cho admin)
function testCoinFlipRatio(iterations = 1000) {
  let headsCount = 0;
  let tailsCount = 0;
  
  for (let i = 0; i < iterations; i++) {
    const result = flipCoin();
    if (result === 'heads') {
      headsCount++;
    } else {
      tailsCount++;
    }
  }
  
  return {
    heads: headsCount,
    tails: tailsCount,
    headsPercent: Math.round((headsCount / iterations) * 100),
    tailsPercent: Math.round((tailsCount / iterations) * 100)
  };
}

// Hàm kiểm tra achievements
function checkAchievements(player) {
  const newAchievements = [];
  
  if (player.totalFlips >= 10 && !player.achievements.includes('first_10')) {
    newAchievements.push('🎯 First 10 Flips!');
    player.achievements.push('first_10');
  }
  
  if (player.totalFlips >= 100 && !player.achievements.includes('century')) {
    newAchievements.push('💯 Century Flipper!');
    player.achievements.push('century');
  }
  
  if (player.winStreak >= 5 && !player.achievements.includes('streak_5')) {
    newAchievements.push('🔥 5 Win Streak!');
    player.achievements.push('streak_5');
  }
  
  if (player.winStreak >= 10 && !player.achievements.includes('streak_10')) {
    newAchievements.push('⚡ 10 Win Streak!');
    player.achievements.push('streak_10');
  }
  
  if (player.totalWinnings >= 10000 && !player.achievements.includes('rich')) {
    newAchievements.push('💰 Big Winner!');
    player.achievements.push('rich');
  }
  
  return newAchievements;
}

module.exports.config = {
  name: "coinflip",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "YourName",
  description: "Tung đồng xu đoán ngửa/sấp",
  commandCategory: "Game",
  usages: "coinflip <heads/tails> <bet_amount>",
  cooldowns: 3
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const senderId = String(event?.data?.uidFrom || event?.authorId || '');
  
  try {
    // Lấy thông tin người dùng
    let userName = 'Player';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Player';
    } catch {}
    try {
      const profName = (profiles.getProfile(senderId) || {}).name;
      if (profName) userName = profName;
    } catch {}

    // Enforce profile registration
    try {
      if (!profiles.hasProfile(senderId)) {
        return api.sendMessage("⚠️ M chưa có hồ sơ game. Gõ: 'profile create <tên>' để tạo trước rồi quay lại chơi nha.", threadId, type);
      }
    } catch {}

    // Helper to prepend standardized header
    function headerLine() {
      try {
        const prof = profiles.getProfile(senderId) || { id: senderId, name: userName, coins: 0 };
        return makeHeader('Coin Flip', { name: prof.name || userName, uid: senderId, coins: prof.coins });
      } catch {
        return `👤 Tên: ${userName} | 🎮 Game: Coin Flip | 🆔 UID: ${senderId}`;
      }
    }
    async function send(content) {
      const header = headerLine();
      if (typeof content === 'string') return api.sendMessage([header, content].join('\n'), threadId, type);
      const parts = Array.isArray(content) ? content : [String(content)];
      parts.unshift(header);
      return api.sendMessage(parts.join('\n'), threadId, type);
    }
    
    const player = createPlayer(senderId);
    const action = (args[0] || '').toLowerCase();
    
    // Help command
    if (!action || action === 'help') {
      const helpMsg = [
        '🪙 **COIN FLIP GAME** 🪙',
        '',
        '📋 **CÁCH CHƠI:**',
        '• Đoán mặt đồng xu: heads (ngửa) hoặc tails (sấp)',
        '• Đặt cược với số coins',
        '• Thắng x2 tiền cược, thua mất tiền',
        '',
        '💡 **COMMANDS:**',
        '• coinflip heads 100 - Cược 100 coins vào ngửa',
        '• coinflip tails 50 - Cược 50 coins vào sấp',
        '• coinflip test [số_lần] - Test tỷ lệ ngẫu nhiên (max 1000)',
        '• coinflip stats - Xem thống kê',
        '• coinflip top - Bảng xếp hạng',
        '• coinflip daily - Nhận coins hàng ngày',
        '',
        '💰 **COINS HIỆN TẠI:** ' + ((profiles.getProfile(senderId)?.coins || 0).toLocaleString()),
        '🎯 **TỶ LỆ THẮNG:** ' + (player.totalFlips > 0 ? Math.round((player.wins / player.totalFlips) * 100) : 0) + '%'
      ];
      
      return send(helpMsg.join('\n'));
    }
    
    // Stats command
    if (action === 'stats') {
      const winRate = player.totalFlips > 0 ? Math.round((player.wins / player.totalFlips) * 100) : 0;
      const statsMsg = [
        `🪙 **COIN FLIP STATS - ${userName}** 🪙`,
        '',
        `💰 **Coins:** ${player.coins.toLocaleString()}`,
        `🎯 **Tổng lần chơi:** ${player.totalFlips}`,
        `✅ **Thắng:** ${player.wins} (${winRate}%)`,
        `❌ **Thua:** ${player.losses}`,
        `🔥 **Win streak hiện tại:** ${player.winStreak}`,
        `⚡ **Win streak tốt nhất:** ${player.bestStreak}`,
        `💎 **Tổng thắng:** ${player.totalWinnings.toLocaleString()}`,
        `💸 **Tổng thua:** ${player.totalLosses.toLocaleString()}`,
        `📅 **Lần chơi cuối:** ${player.lastPlayed ? new Date(player.lastPlayed).toLocaleString('vi-VN') : 'Chưa chơi'}`,
        '',
        `🏆 **ACHIEVEMENTS (${player.achievements.length}):**`,
        player.achievements.length > 0 ? player.achievements.map(a => `• ${a}`).join('\n') : '• Chưa có achievement nào'
      ];
      
      return send(statsMsg.join('\n'));
    }
    
    // Top command
    if (action === 'top') {
      const allPlayers = Array.from(playerData.entries())
        .map(([userId, data]) => ({
          userId,
          coins: data.coins,
          wins: data.wins,
          totalFlips: data.totalFlips,
          winRate: data.totalFlips > 0 ? Math.round((data.wins / data.totalFlips) * 100) : 0
        }))
        .sort((a, b) => b.coins - a.coins)
        .slice(0, 10);
      
      if (allPlayers.length === 0) {
        return send('📊 Chưa có ai chơi Coin Flip!');
      }
      
      let leaderboard = [
        '🏆 **TOP COIN FLIP PLAYERS** 🏆',
        ''
      ];
      
      for (let i = 0; i < allPlayers.length; i++) {
        const rank = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][i];
        const player = allPlayers[i];
        
        let playerName = player.userId;
        try {
          const info = await api.getUserInfo(player.userId);
          playerName = info?.changed_profiles?.[player.userId]?.displayName || player.userId;
        } catch {}
        
        leaderboard.push(`${rank} **${playerName}**`);
        leaderboard.push(`   💰 ${player.coins.toLocaleString()} coins`);
        leaderboard.push(`   🎯 ${player.wins}W/${player.totalFlips}G (${player.winRate}%)`);
        leaderboard.push('');
      }
      
      return send(leaderboard.join('\n'));
    }
    
    // Daily coins
    if (action === 'daily') {
      const now = new Date();
      const today = now.toDateString();
      const lastDaily = player.lastDaily || '';
      
      if (lastDaily === today) {
        return send('⏰ Bạn đã nhận coins hàng ngày rồi! Quay lại vào ngày mai.');
      }
      
      const dailyAmount = 500;
      try {
        const prof = profiles.ensureProfile(senderId, userName);
        prof.coins = (prof.coins || 0) + dailyAmount;
        profiles.saveProfiles();
      } catch {}
      player.lastDaily = today;
      savePlayerData();
      const balance = (profiles.getProfile(senderId)?.coins || 0);
      return send(
        `🎁 **DAILY COINS!** 🎁\n\n` +
        `💰 Bạn đã nhận ${dailyAmount.toLocaleString()} coins!\n` +
        `💎 Ví chung: ${balance.toLocaleString()}\n\n` +
        `⏰ Quay lại vào ngày mai để nhận thêm!`
      );
    }
    
    // Test command (cho tất cả người dùng)
    if (action === 'test') {
      const iterations = parseInt(args[1]) || 100;
      if (iterations > 1000) {
        return send('❌ Người dùng thường tối đa 1,000 lần test!');
      }
      
      const testResult = testCoinFlipRatio(iterations);
      
      return send(
        `🧪 **COIN FLIP TEST RESULTS** 🧪\n\n` +
        `👤 **Tester:** ${userName}\n` +
        `🎯 **Số lần test:** ${iterations.toLocaleString()}\n` +
        `🪙 **Heads (Ngửa):** ${testResult.heads} (${testResult.headsPercent}%)\n` +
        `🔘 **Tails (Sấp):** ${testResult.tails} (${testResult.tailsPercent}%)\n\n` +
        `📊 **Kết luận:** ${Math.abs(testResult.headsPercent - 50) <= 5 ? '✅ Tỷ lệ bình thường' : '⚠️ Tỷ lệ bất thường'}\n\n` +
        `💡 **Lưu ý:** Tỷ lệ lý thuyết là 50-50%. Với số lần test nhỏ có thể có sai lệch.`,
      );
    }

    // Admin commands
    if (action === 'admin' && isAdmin(senderId)) {
      const subAction = args[1];
      
      if (subAction === 'give') {
        const targetId = args[2];
        const amount = parseInt(args[3]);
        
        if (!targetId || !amount || amount <= 0) {
          return api.sendMessage('❌ Cú pháp: coinflip admin give <user_id> <amount>', threadId, type);
        }
        
        const targetPlayer = createPlayer(targetId);
        targetPlayer.coins += amount;
        savePlayerData();
        
        return api.sendMessage(`✅ Đã cộng ${amount.toLocaleString()} coins cho ${targetId}`, threadId, type);
      }
      
      if (subAction === 'test') {
        const iterations = parseInt(args[2]) || 1000;
        if (iterations > 10000) {
          return send('❌ Admin tối đa 10,000 lần test!');
        }
        
        const testResult = testCoinFlipRatio(iterations);
        
        return send(
          `🧪 **ADMIN COIN FLIP TEST** 🧪\n\n` +
          `🎯 **Số lần test:** ${iterations.toLocaleString()}\n` +
          `🪙 **Heads (Ngửa):** ${testResult.heads} (${testResult.headsPercent}%)\n` +
          `🔘 **Tails (Sấp):** ${testResult.tails} (${testResult.tailsPercent}%)\n\n` +
          `📊 **Kết luận:** ${Math.abs(testResult.headsPercent - 50) <= 5 ? '✅ Tỷ lệ bình thường' : '⚠️ Tỷ lệ bất thường'}`,
        );
      }
      
      return send(
        '💡 **Admin commands:**\n' +
        '• coinflip admin give <user_id> <amount>\n' +
        '• coinflip admin test [iterations] - Test tỷ lệ (max 10K)'
      );
    }
    
    // Main game logic
    const guess = action;
    const betAmount = parseInt(args[1]);
    
    if (!['heads', 'tails', 'ngua', 'sap'].includes(guess)) {
      return send('❌ Chọn heads (ngửa) hoặc tails (sấp)!\n💡 Ví dụ: coinflip heads 100');
    }
    
    if (!betAmount || betAmount <= 0) {
      return send('❌ Số tiền cược phải lớn hơn 0!\n💡 Ví dụ: coinflip heads 100');
    }
    
    const prof = profiles.ensureProfile(senderId, userName);
    const balance = prof?.coins || 0;
    if (betAmount > balance) {
      return send(`❌ Bạn không đủ coins! Hiện có: ${balance.toLocaleString()}`);
    }
    
    if (betAmount > 10000) {
      return send('❌ Số tiền cược tối đa là 10,000 coins!');
    }
    
    // Deduct bet upfront from shared wallet
    try { prof.coins = (prof.coins || 0) - betAmount; profiles.saveProfiles(); } catch {}

    // Chuẩn hóa guess
    const normalizedGuess = (guess === 'ngua' || guess === 'heads') ? 'heads' : 'tails';
    
    // Tung đồng xu
    const result = flipCoin();
    const won = normalizedGuess === result;
    
    // Cập nhật stats
    player.totalFlips++;
    player.lastPlayed = Date.now();
    
    if (won) {
      player.wins++;
      // Credit payout to shared wallet (bet already deducted)
      try { const p = profiles.getProfile(senderId); p.coins = (p.coins||0) + (betAmount * 2); profiles.saveProfiles(); } catch {}
      player.totalWinnings += betAmount;
      player.winStreak++;
      if (player.winStreak > player.bestStreak) {
        player.bestStreak = player.winStreak;
      }
    } else {
      player.losses++;
      player.totalLosses += betAmount;
      player.winStreak = 0;
    }
    
    // Kiểm tra achievements
    const newAchievements = checkAchievements(player);
    
    savePlayerData();
    
    // Tạo kết quả
    const coinEmoji = result === 'heads' ? '🪙' : '🔘';
    const resultText = result === 'heads' ? 'HEADS (Ngửa)' : 'TAILS (Sấp)';
    const guessText = normalizedGuess === 'heads' ? 'HEADS (Ngửa)' : 'TAILS (Sấp)';
    
    let resultMsg = [
      `🪙 **COIN FLIP RESULT** 🪙`,
      '',
      `👤 **Player:** ${userName}`,
      `🎯 **Dự đoán:** ${guessText}`,
      `💰 **Cược:** ${betAmount.toLocaleString()} coins`,
      '',
      `${coinEmoji} **KẾT QUẢ: ${resultText}** ${coinEmoji}`,
      '',
      won ? `🎉 **THẮNG!** 🎉` : `💔 **THUA!** 💔`,
      won ? `💰 +${betAmount.toLocaleString()} coins` : `💸 -${betAmount.toLocaleString()} coins`,
      `💎 **Ví chung:** ${(profiles.getProfile(senderId)?.coins || 0).toLocaleString()}`,
      '',
      `📊 **Stats:** ${player.wins}W/${player.losses}L (${player.totalFlips} games)`,
      `🔥 **Win Streak:** ${player.winStreak}`
    ];
    
    if (newAchievements.length > 0) {
      resultMsg.push('');
      resultMsg.push('🏆 **NEW ACHIEVEMENTS:**');
      newAchievements.forEach(achievement => {
        resultMsg.push(`• ${achievement}`);
      });
    }
    
    return send(resultMsg.join('\n'));
    
  } catch (error) {
    console.error('[COINFLIP] Lỗi:', error);
    return api.sendMessage('❌ Có lỗi xảy ra khi chơi Coin Flip!', threadId, type);
  }
};
