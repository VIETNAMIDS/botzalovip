const fs = require('fs');
const path = require('path');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');

// Đường dẫn file lưu dữ liệu
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DICEROLL_DATA_FILE = path.join(DATA_DIR, 'diceroll_data.json');

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
    fs.writeFileSync(DICEROLL_DATA_FILE, JSON.stringify(dataToSave, null, 2));
    console.log('[DICEROLL] Đã lưu dữ liệu người chơi');
  } catch (error) {
    console.error('[DICEROLL] Lỗi khi lưu dữ liệu:', error);
  }
}

function loadPlayerData() {
  try {
    if (fs.existsSync(DICEROLL_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DICEROLL_DATA_FILE, 'utf8'));
      for (const [userId, userData] of Object.entries(data)) {
        playerData.set(userId, userData);
      }
      console.log('[DICEROLL] Đã tải dữ liệu người chơi');
    }
  } catch (error) {
    console.error('[DICEROLL] Lỗi khi tải dữ liệu:', error);
  }
}

// Load dữ liệu khi khởi động
loadPlayerData();

// Function tạo player mới hoặc lấy player hiện có
function createPlayer(userId) {
  if (!playerData.has(userId)) {
    playerData.set(userId, {
      coins: 1000,
      totalRolls: 0,
      wins: 0,
      losses: 0,
      winStreak: 0,
      bestStreak: 0,
      totalWinnings: 0,
      totalLosses: 0,
      lastPlayed: null,
      achievements: [],
      rollHistory: []
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

// Hàm tung xúc xắc
function rollDice(sides = 6) {
  return Math.floor(Math.random() * sides) + 1;
}

// Hàm tung nhiều xúc xắc
function rollMultipleDice(count, sides = 6) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(rollDice(sides));
  }
  return results;
}

// Emoji cho xúc xắc
function getDiceEmoji(number) {
  const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  return diceEmojis[number] || '🎲';
}

// Hàm kiểm tra achievements
function checkAchievements(player) {
  const newAchievements = [];
  
  if (player.totalRolls >= 10 && !player.achievements.includes('first_10')) {
    newAchievements.push('🎯 First 10 Rolls!');
    player.achievements.push('first_10');
  }
  
  if (player.totalRolls >= 100 && !player.achievements.includes('century')) {
    newAchievements.push('💯 Century Roller!');
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
  
  // Kiểm tra roll 6 liên tiếp
  if (player.rollHistory.length >= 3) {
    const lastThree = player.rollHistory.slice(-3);
    if (lastThree.every(roll => roll === 6) && !player.achievements.includes('triple_six')) {
      newAchievements.push('🎰 Triple Six!');
      player.achievements.push('triple_six');
    }
  }
  
  return newAchievements;
}

module.exports.config = {
  name: "diceroll",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "YourName",
  description: "Tung xúc xắc đoán kết quả",
  commandCategory: "Game",
  usages: "diceroll <bet_type> <bet_amount>",
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
        return makeHeader('Dice Roll', { name: prof.name || userName, uid: senderId, coins: prof.coins });
      } catch {
        return `👤 Tên: ${userName} | 🎮 Game: Dice Roll | 🆔 UID: ${senderId}`;
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
        '🎲 **DICE ROLL GAME** 🎲',
        '',
        '📋 **CÁCH CHƠI:**',
        '• Đoán kết quả xúc xắc (1-6)',
        '• Đặt cược với số coins',
        '• Thắng x5 tiền cược nếu đoán đúng số',
        '• Thắng x2 nếu đoán đúng chẵn/lẻ',
        '• Thắng x2 nếu đoán đúng cao/thấp',
        '',
        '💡 **COMMANDS:**',
        '• diceroll 6 100 - Cược 100 coins vào số 6',
        '• diceroll even 50 - Cược 50 coins vào chẵn',
        '• diceroll odd 50 - Cược 50 coins vào lẻ',
        '• diceroll high 50 - Cược 50 coins vào cao (4-6)',
        '• diceroll low 50 - Cược 50 coins vào thấp (1-3)',
        '• diceroll multi 2 100 - Tung 2 xúc xắc, cược 100',
        '• diceroll stats - Xem thống kê',
        '• diceroll top - Bảng xếp hạng',
        '• diceroll daily - Nhận coins hàng ngày',
        '',
        '💰 **COINS HIỆN TẠI:** ' + player.coins.toLocaleString(),
        '🎯 **TỶ LỆ THẮNG:** ' + (player.totalRolls > 0 ? Math.round((player.wins / player.totalRolls) * 100) : 0) + '%'
      ];
      
      return send(helpMsg.join('\n'));
    }
    
    // Stats command
    if (action === 'stats') {
      const winRate = player.totalRolls > 0 ? Math.round((player.wins / player.totalRolls) * 100) : 0;
      const statsMsg = [
        `🎲 **DICE ROLL STATS - ${userName}** 🎲`,
        '',
        `💰 **Coins:** ${player.coins.toLocaleString()}`,
        `🎯 **Tổng lần chơi:** ${player.totalRolls}`,
        `✅ **Thắng:** ${player.wins} (${winRate}%)`,
        `❌ **Thua:** ${player.losses}`,
        `🔥 **Win streak hiện tại:** ${player.winStreak}`,
        `⚡ **Win streak tốt nhất:** ${player.bestStreak}`,
        `💎 **Tổng thắng:** ${player.totalWinnings.toLocaleString()}`,
        `💸 **Tổng thua:** ${player.totalLosses.toLocaleString()}`,
        `📅 **Lần chơi cuối:** ${player.lastPlayed ? new Date(player.lastPlayed).toLocaleString('vi-VN') : 'Chưa chơi'}`,
        '',
        `🎲 **Lịch sử gần đây:** ${player.rollHistory.slice(-10).map(r => getDiceEmoji(r)).join(' ')}`,
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
          totalRolls: data.totalRolls,
          winRate: data.totalRolls > 0 ? Math.round((data.wins / data.totalRolls) * 100) : 0
        }))
        .sort((a, b) => b.coins - a.coins)
        .slice(0, 10);
      
      if (allPlayers.length === 0) {
        return send('📊 Chưa có ai chơi Dice Roll!');
      }
      
      let leaderboard = [
        '🏆 **TOP DICE ROLL PLAYERS** 🏆',
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
        leaderboard.push(`   🎯 ${player.wins}W/${player.totalRolls}G (${player.winRate}%)`);
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
    
    // Admin commands
    if (action === 'admin' && isAdmin(senderId)) {
      const subAction = args[1];
      
      if (subAction === 'give') {
        const targetId = args[2];
        const amount = parseInt(args[3]);
        
        if (!targetId || !amount || amount <= 0) {
          return api.sendMessage('❌ Cú pháp: diceroll admin give <user_id> <amount>', threadId, type);
        }
        
        const targetPlayer = createPlayer(targetId);
        targetPlayer.coins += amount;
        savePlayerData();
        
        return api.sendMessage(`✅ Đã cộng ${amount.toLocaleString()} coins cho ${targetId}`, threadId, type);
      }
      
      return api.sendMessage('💡 Admin commands: diceroll admin give <user_id> <amount>', threadId, type);
    }
    
    // Multi dice roll
    if (action === 'multi') {
      const diceCount = parseInt(args[1]);
      const betAmount = parseInt(args[2]);
      
      if (!diceCount || diceCount < 2 || diceCount > 5) {
        return send('❌ Số xúc xắc phải từ 2-5!\n💡 Ví dụ: diceroll multi 3 100');
      }
      
      if (!betAmount || betAmount <= 0) {
        return send('❌ Số tiền cược phải lớn hơn 0!');
      }
      
      const profM = profiles.ensureProfile(senderId, userName);
      const balanceM = profM?.coins || 0;
      if (betAmount > balanceM) {
        return send(`❌ Bạn không đủ coins! Hiện có: ${balanceM.toLocaleString()}`);
      }
      
      if (betAmount > 5000) {
        return send('❌ Số tiền cược tối đa là 5,000 coins!');
      }
      // Deduct bet upfront
      try { profM.coins = (profM.coins || 0) - betAmount; profiles.saveProfiles(); } catch {}
      
      // Tung nhiều xúc xắc
      const results = rollMultipleDice(diceCount);
      const total = results.reduce((sum, val) => sum + val, 0);
      const average = total / diceCount;
      
      // Logic thắng thua (đơn giản: tổng >= trung bình có thể thắng)
      const maxPossible = diceCount * 6;
      const threshold = maxPossible * 0.6; // 60% của max
      const won = total >= threshold;
      
      // Cập nhật stats
      player.totalRolls++;
      player.lastPlayed = Date.now();
      
      const winMultiplier = won ? 1.5 : 0; // Thắng x1.5
      const winAmount = Math.floor(betAmount * winMultiplier);
      
      if (won) {
        player.wins++;
        // Credit payout to wallet (bet already deducted)
        try { const p = profiles.getProfile(senderId); p.coins = (p.coins||0) + winAmount; profiles.saveProfiles(); } catch {}
        player.totalWinnings += (winAmount - betAmount);
        player.winStreak++;
        if (player.winStreak > player.bestStreak) {
          player.bestStreak = player.winStreak;
        }
      } else {
        player.losses++;
        player.totalLosses += betAmount;
        player.winStreak = 0;
      }
      
      // Lưu lịch sử (chỉ lưu xúc xắc đầu tiên)
      player.rollHistory.push(results[0]);
      if (player.rollHistory.length > 20) {
        player.rollHistory = player.rollHistory.slice(-20);
      }
      
      const newAchievements = checkAchievements(player);
      savePlayerData();
      
      let resultMsg = [
        `🎲 **MULTI DICE ROLL RESULT** 🎲`,
        '',
        `👤 **Player:** ${userName}`,
        `🎯 **Số xúc xắc:** ${diceCount}`,
        `💰 **Cược:** ${betAmount.toLocaleString()} coins`,
        '',
        `🎲 **KẾT QUẢ:** ${results.map(r => getDiceEmoji(r)).join(' ')}`,
        `📊 **Chi tiết:** ${results.join(' + ')} = ${total}`,
        `🎯 **Ngưỡng thắng:** ${threshold}`,
        '',
        won ? `🎉 **THẮNG!** 🎉` : `💔 **THUA!** 💔`,
        won ? `💰 +${(winAmount - betAmount).toLocaleString()} coins` : `💸 -${betAmount.toLocaleString()} coins`,
        `💎 **Coins còn lại:** ${player.coins.toLocaleString()}`,
        '',
        `📊 **Stats:** ${player.wins}W/${player.losses}L (${player.totalRolls} games)`,
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
    }
    
    // Main game logic
    const betType = action;
    const betAmount = parseInt(args[1]);
    
    if (!betAmount || betAmount <= 0) {
      return send('❌ Số tiền cược phải lớn hơn 0!\n💡 Ví dụ: diceroll 6 100');
    }
    
    const prof = profiles.ensureProfile(senderId, userName);
    const balance = prof?.coins || 0;
    if (betAmount > balance) {
      return send(`❌ Bạn không đủ coins! Hiện có: ${balance.toLocaleString()}`);
    }
    
    if (betAmount > 10000) {
      return send('❌ Số tiền cược tối đa là 10,000 coins!');
    }
    // Deduct bet upfront
    try { prof.coins = (prof.coins || 0) - betAmount; profiles.saveProfiles(); } catch {}
    
    // Tung xúc xắc
    const result = rollDice();
    let won = false;
    let winMultiplier = 0;
    let betDescription = '';
    
    // Kiểm tra loại cược
    if (['1', '2', '3', '4', '5', '6'].includes(betType)) {
      // Cược số cụ thể
      const guessNumber = parseInt(betType);
      won = result === guessNumber;
      winMultiplier = won ? 5 : 0; // x5 nếu đoán đúng số
      betDescription = `Số ${guessNumber}`;
    } else if (betType === 'even' || betType === 'chan') {
      // Cược chẵn
      won = result % 2 === 0;
      winMultiplier = won ? 2 : 0; // x2 nếu đoán đúng chẵn/lẻ
      betDescription = 'Chẵn';
    } else if (betType === 'odd' || betType === 'le') {
      // Cược lẻ
      won = result % 2 === 1;
      winMultiplier = won ? 2 : 0;
      betDescription = 'Lẻ';
    } else if (betType === 'high' || betType === 'cao') {
      // Cược cao (4-6)
      won = result >= 4;
      winMultiplier = won ? 2 : 0;
      betDescription = 'Cao (4-6)';
    } else if (betType === 'low' || betType === 'thap') {
      // Cược thấp (1-3)
      won = result <= 3;
      winMultiplier = won ? 2 : 0;
      betDescription = 'Thấp (1-3)';
    } else {
      return api.sendMessage(
        '❌ Loại cược không hợp lệ!\n\n' +
        '💡 **Các loại cược:**\n' +
        '• 1-6: Đoán số cụ thể (x5)\n' +
        '• even/chan: Đoán chẵn (x2)\n' +
        '• odd/le: Đoán lẻ (x2)\n' +
        '• high/cao: Đoán cao 4-6 (x2)\n' +
        '• low/thap: Đoán thấp 1-3 (x2)',
        threadId, type
      );
    }
    
    // Cập nhật stats
    player.totalRolls++;
    player.lastPlayed = Date.now();
    
    // Lưu vào lịch sử
    player.rollHistory.push(result);
    if (player.rollHistory.length > 20) {
      player.rollHistory = player.rollHistory.slice(-20);
    }
    
    const winAmount = Math.floor(betAmount * winMultiplier);
    
    if (won) {
      player.wins++;
      // Credit payout to wallet (bet already deducted)
      try { const p = profiles.getProfile(senderId); p.coins = (p.coins||0) + winAmount; profiles.saveProfiles(); } catch {}
      player.totalWinnings += (winAmount - betAmount);
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
    let resultMsg = [
      `🎲 **DICE ROLL RESULT** 🎲`,
      '',
      `👤 **Player:** ${userName}`,
      `🎯 **Dự đoán:** ${betDescription}`,
      `💰 **Cược:** ${betAmount.toLocaleString()} coins`,
      '',
      `${getDiceEmoji(result)} **KẾT QUẢ: ${result}** ${getDiceEmoji(result)}`,
      '',
      won ? `🎉 **THẮNG!** 🎉` : `💔 **THUA!** 💔`,
      won ? `💰 +${(winAmount - betAmount).toLocaleString()} coins (x${winMultiplier})` : `💸 -${betAmount.toLocaleString()} coins`,
      `💎 **Coins còn lại:** ${player.coins.toLocaleString()}`,
      '',
      `📊 **Stats:** ${player.wins}W/${player.losses}L (${player.totalRolls} games)`,
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
    console.error('[DICEROLL] Lỗi:', error);
    return api.sendMessage('❌ Có lỗi xảy ra khi chơi Dice Roll!', threadId, type);
  }
};
