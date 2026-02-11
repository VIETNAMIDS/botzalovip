const fs = require('fs');
const path = require('path');

// Đường dẫn file lưu dữ liệu
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const WHEEL_DATA_FILE = path.join(DATA_DIR, 'wheelfortune_data.json');

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
    fs.writeFileSync(WHEEL_DATA_FILE, JSON.stringify(dataToSave, null, 2));
    console.log('[WHEEL] Đã lưu dữ liệu người chơi');
  } catch (error) {
    console.error('[WHEEL] Lỗi khi lưu dữ liệu:', error);
  }
}

function loadPlayerData() {
  try {
    if (fs.existsSync(WHEEL_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(WHEEL_DATA_FILE, 'utf8'));
      for (const [userId, userData] of Object.entries(data)) {
        playerData.set(userId, userData);
      }
      console.log('[WHEEL] Đã tải dữ liệu người chơi');
    }
  } catch (error) {
    console.error('[WHEEL] Lỗi khi tải dữ liệu:', error);
  }
}

// Load dữ liệu khi khởi động
loadPlayerData();

// Function tạo player mới hoặc lấy player hiện có
function createPlayer(userId) {
  if (!playerData.has(userId)) {
    playerData.set(userId, {
      coins: 1000,
      totalSpins: 0,
      totalWinnings: 0,
      totalLosses: 0,
      biggestWin: 0,
      jackpotWins: 0,
      bonusRounds: 0,
      winStreak: 0,
      bestStreak: 0,
      lastPlayed: null,
      achievements: [],
      spinHistory: []
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

// Cấu hình bánh xe may mắn
const WHEEL_SEGMENTS = [
  // Jackpot (1%)
  { name: 'JACKPOT', multiplier: 100, probability: 1, emoji: '💎', color: 'Gold' },
  
  // Big wins (4%)
  { name: 'Big Win', multiplier: 20, probability: 2, emoji: '🎰', color: 'Purple' },
  { name: 'Super Win', multiplier: 15, probability: 2, emoji: '⭐', color: 'Blue' },
  
  // Medium wins (15%)
  { name: 'Lucky 7', multiplier: 10, probability: 3, emoji: '🍀', color: 'Green' },
  { name: 'Triple', multiplier: 8, probability: 4, emoji: '🎯', color: 'Orange' },
  { name: 'Double', multiplier: 5, probability: 8, emoji: '💰', color: 'Yellow' },
  
  // Small wins (30%)
  { name: 'Win', multiplier: 3, probability: 10, emoji: '✨', color: 'Cyan' },
  { name: 'Small Win', multiplier: 2, probability: 20, emoji: '🎁', color: 'Pink' },
  
  // Bonus (10%)
  { name: 'Bonus Round', multiplier: 0, probability: 5, emoji: '🎪', color: 'Rainbow', special: 'bonus' },
  { name: 'Free Spin', multiplier: 0, probability: 5, emoji: '🔄', color: 'Silver', special: 'freespin' },
  
  // Losses (40%)
  { name: 'Try Again', multiplier: 0, probability: 20, emoji: '😅', color: 'Gray' },
  { name: 'Better Luck', multiplier: 0, probability: 20, emoji: '🤞', color: 'White' }
];

// Hàm quay bánh xe
function spinWheel() {
  const totalProbability = WHEEL_SEGMENTS.reduce((sum, segment) => sum + segment.probability, 0);
  const random = Math.random() * totalProbability;
  
  let currentProbability = 0;
  for (const segment of WHEEL_SEGMENTS) {
    currentProbability += segment.probability;
    if (random <= currentProbability) {
      return segment;
    }
  }
  
  // Fallback (không bao giờ xảy ra)
  return WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1];
}

// Hàm bonus round
function playBonusRound() {
  const bonusResults = [];
  const bonusSpins = 3;
  let totalMultiplier = 0;
  
  for (let i = 0; i < bonusSpins; i++) {
    const bonusMultiplier = Math.floor(Math.random() * 10) + 1; // 1-10x
    bonusResults.push(bonusMultiplier);
    totalMultiplier += bonusMultiplier;
  }
  
  return {
    results: bonusResults,
    totalMultiplier: totalMultiplier,
    description: `🎪 BONUS: ${bonusResults.join(' + ')} = ${totalMultiplier}x`
  };
}

// Hàm kiểm tra achievements
function checkAchievements(player) {
  const newAchievements = [];
  
  if (player.totalSpins >= 10 && !player.achievements.includes('first_10')) {
    newAchievements.push('🎯 First 10 Spins!');
    player.achievements.push('first_10');
  }
  
  if (player.totalSpins >= 100 && !player.achievements.includes('century')) {
    newAchievements.push('💯 Century Spinner!');
    player.achievements.push('century');
  }
  
  if (player.jackpotWins >= 1 && !player.achievements.includes('jackpot')) {
    newAchievements.push('💎 Jackpot Winner!');
    player.achievements.push('jackpot');
  }
  
  if (player.bonusRounds >= 5 && !player.achievements.includes('bonus_master')) {
    newAchievements.push('🎪 Bonus Master!');
    player.achievements.push('bonus_master');
  }
  
  if (player.winStreak >= 5 && !player.achievements.includes('streak_5')) {
    newAchievements.push('🔥 5 Win Streak!');
    player.achievements.push('streak_5');
  }
  
  if (player.biggestWin >= 50000 && !player.achievements.includes('big_winner')) {
    newAchievements.push('💰 Big Winner!');
    player.achievements.push('big_winner');
  }
  
  return newAchievements;
}

module.exports.config = {
  name: "wheelfortune",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "YourName",
  description: "Quay bánh xe may mắn",
  commandCategory: "Game",
  usages: "wheelfortune <bet_amount>",
  cooldowns: 5
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
    
    const player = createPlayer(senderId);
    const action = (args[0] || '').toLowerCase();
    
    // Help command
    if (!action || action === 'help') {
      const helpMsg = [
        '🎡 **WHEEL OF FORTUNE** 🎡',
        '',
        '📋 **CÁCH CHƠI:**',
        '• Đặt cược và quay bánh xe may mắn',
        '• Có thể thắng từ x2 đến x100 tiền cược',
        '• Jackpot 💎 thắng x100 (1% tỷ lệ)',
        '• Bonus Round 🎪 cho phép quay thêm',
        '• Free Spin 🔄 quay miễn phí',
        '',
        '💡 **COMMANDS:**',
        '• wheelfortune 100 - Cược 100 coins',
        '• wheelfortune 1000 - Cược 1000 coins',
        '• wheelfortune stats - Xem thống kê',
        '• wheelfortune top - Bảng xếp hạng',
        '• wheelfortune daily - Nhận coins hàng ngày',
        '• wheelfortune segments - Xem các ô trên bánh xe',
        '',
        '🎰 **TỶ LỆ THẮNG:**',
        '• 💎 Jackpot (1%): x100',
        '• 🎰 Big Win (2%): x20',
        '• ⭐ Super Win (2%): x15',
        '• 🍀 Lucky 7 (3%): x10',
        '• 🎯 Triple (4%): x8',
        '• 💰 Double (8%): x5',
        '• ✨ Win (10%): x3',
        '• 🎁 Small Win (20%): x2',
        '• 🎪 Bonus Round (5%): Quay thêm',
        '• 🔄 Free Spin (5%): Miễn phí',
        '• 😅 Try Again (40%): Thua',
        '',
        '💰 **COINS HIỆN TẠI:** ' + player.coins.toLocaleString(),
        '🎯 **TỔNG QUAY:** ' + player.totalSpins
      ];
      
      return api.sendMessage(helpMsg.join('\n'), threadId, type);
    }
    
    // Stats command
    if (action === 'stats') {
      const winRate = player.totalSpins > 0 ? Math.round(((player.totalSpins - (player.totalLosses / 100)) / player.totalSpins) * 100) : 0;
      const avgWin = player.totalSpins > 0 ? Math.round(player.totalWinnings / player.totalSpins) : 0;
      
      const statsMsg = [
        `🎡 **WHEEL OF FORTUNE STATS - ${userName}** 🎡`,
        '',
        `💰 **Coins:** ${player.coins.toLocaleString()}`,
        `🎯 **Tổng lần quay:** ${player.totalSpins}`,
        `📈 **Tỷ lệ thắng:** ${winRate}%`,
        `💎 **Jackpot wins:** ${player.jackpotWins}`,
        `🎪 **Bonus rounds:** ${player.bonusRounds}`,
        `🔥 **Win streak hiện tại:** ${player.winStreak}`,
        `⚡ **Win streak tốt nhất:** ${player.bestStreak}`,
        `💸 **Tổng thắng:** ${player.totalWinnings.toLocaleString()}`,
        `💔 **Tổng thua:** ${player.totalLosses.toLocaleString()}`,
        `🏆 **Thắng lớn nhất:** ${player.biggestWin.toLocaleString()}`,
        `📅 **Lần chơi cuối:** ${player.lastPlayed ? new Date(player.lastPlayed).toLocaleString('vi-VN') : 'Chưa chơi'}`,
        '',
        `🏆 **ACHIEVEMENTS (${player.achievements.length}):**`,
        player.achievements.length > 0 ? player.achievements.map(a => `• ${a}`).join('\n') : '• Chưa có achievement nào'
      ];
      
      return api.sendMessage(statsMsg.join('\n'), threadId, type);
    }
    
    // Segments command
    if (action === 'segments') {
      const segmentsMsg = [
        '🎡 **BÁNH XE MAY MẮN - CÁC Ô** 🎡',
        '',
        '💎 **JACKPOT ZONE:**',
        '• 💎 JACKPOT (1%) - x100 tiền cược',
        '',
        '🎰 **BIG WIN ZONE:**',
        '• 🎰 Big Win (2%) - x20 tiền cược',
        '• ⭐ Super Win (2%) - x15 tiền cược',
        '',
        '🍀 **LUCKY ZONE:**',
        '• 🍀 Lucky 7 (3%) - x10 tiền cược',
        '• 🎯 Triple (4%) - x8 tiền cược',
        '• 💰 Double (8%) - x5 tiền cược',
        '',
        '✨ **WIN ZONE:**',
        '• ✨ Win (10%) - x3 tiền cược',
        '• 🎁 Small Win (20%) - x2 tiền cược',
        '',
        '🎪 **SPECIAL ZONE:**',
        '• 🎪 Bonus Round (5%) - Quay thêm 3 lần',
        '• 🔄 Free Spin (5%) - Quay lại miễn phí',
        '',
        '😅 **LOSE ZONE:**',
        '• 😅 Try Again (20%) - Mất tiền cược',
        '• 🤞 Better Luck (20%) - Mất tiền cược',
        '',
        '🎯 **TỔNG TỶ LỆ:** 100%',
        '💡 **Mẹo:** Cược nhiều để thắng lớn!'
      ];
      
      return api.sendMessage(segmentsMsg.join('\n'), threadId, type);
    }
    
    // Top command
    if (action === 'top') {
      const allPlayers = Array.from(playerData.entries())
        .map(([userId, data]) => ({
          userId,
          coins: data.coins,
          totalWinnings: data.totalWinnings,
          jackpotWins: data.jackpotWins,
          totalSpins: data.totalSpins,
          biggestWin: data.biggestWin
        }))
        .sort((a, b) => b.totalWinnings - a.totalWinnings)
        .slice(0, 10);
      
      if (allPlayers.length === 0) {
        return api.sendMessage('📊 Chưa có ai chơi Wheel of Fortune!', threadId, type);
      }
      
      let leaderboard = [
        '🏆 **TOP WHEEL OF FORTUNE PLAYERS** 🏆',
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
        leaderboard.push(`   🏆 Thắng: ${player.totalWinnings.toLocaleString()}`);
        leaderboard.push(`   💎 Jackpots: ${player.jackpotWins}`);
        leaderboard.push(`   🎯 Spins: ${player.totalSpins}`);
        leaderboard.push('');
      }
      
      return api.sendMessage(leaderboard.join('\n'), threadId, type);
    }
    
    // Daily coins
    if (action === 'daily') {
      const now = new Date();
      const today = now.toDateString();
      const lastDaily = player.lastDaily || '';
      
      if (lastDaily === today) {
        return api.sendMessage('⏰ Bạn đã nhận coins hàng ngày rồi! Quay lại vào ngày mai.', threadId, type);
      }
      
      const dailyAmount = 500;
      player.coins += dailyAmount;
      player.lastDaily = today;
      savePlayerData();
      
      return api.sendMessage(
        `🎁 **DAILY COINS!** 🎁\n\n` +
        `💰 Bạn đã nhận ${dailyAmount} coins!\n` +
        `💎 Tổng coins: ${player.coins.toLocaleString()}\n\n` +
        `⏰ Quay lại vào ngày mai để nhận thêm!`,
        threadId, type
      );
    }
    
    // Admin commands
    if (action === 'admin' && isAdmin(senderId)) {
      const subAction = args[1];
      
      if (subAction === 'give') {
        const targetId = args[2];
        const amount = parseInt(args[3]);
        
        if (!targetId || !amount || amount <= 0) {
          return api.sendMessage('❌ Cú pháp: wheelfortune admin give <user_id> <amount>', threadId, type);
        }
        
        const targetPlayer = createPlayer(targetId);
        targetPlayer.coins += amount;
        savePlayerData();
        
        return api.sendMessage(`✅ Đã cộng ${amount.toLocaleString()} coins cho ${targetId}`, threadId, type);
      }
      
      return api.sendMessage('💡 Admin commands: wheelfortune admin give <user_id> <amount>', threadId, type);
    }
    
    // Main game logic
    const betAmount = parseInt(action);
    
    if (!betAmount || betAmount <= 0) {
      return api.sendMessage('❌ Số tiền cược phải lớn hơn 0!\n💡 Ví dụ: wheelfortune 100', threadId, type);
    }
    
    if (betAmount > player.coins) {
      return api.sendMessage(`❌ Bạn không đủ coins! Hiện có: ${player.coins.toLocaleString()}`, threadId, type);
    }
    
    if (betAmount > 50000) {
      return api.sendMessage('❌ Số tiền cược tối đa là 50,000 coins!', threadId, type);
    }
    
    // Quay bánh xe
    const result = spinWheel();
    let winAmount = 0;
    let bonusInfo = '';
    let isWin = false;
    
    // Xử lý kết quả
    if (result.special === 'bonus') {
      // Bonus Round
      const bonus = playBonusRound();
      winAmount = betAmount * bonus.totalMultiplier;
      bonusInfo = bonus.description;
      player.bonusRounds++;
      isWin = true;
    } else if (result.special === 'freespin') {
      // Free Spin - quay lại không mất tiền
      const freeResult = spinWheel();
      if (freeResult.multiplier > 0) {
        winAmount = betAmount * freeResult.multiplier;
        bonusInfo = `🔄 FREE SPIN → ${freeResult.emoji} ${freeResult.name} (x${freeResult.multiplier})`;
        isWin = true;
      } else {
        bonusInfo = `🔄 FREE SPIN → ${freeResult.emoji} ${freeResult.name}`;
        isWin = false;
      }
    } else if (result.multiplier > 0) {
      // Thắng thường
      winAmount = betAmount * result.multiplier;
      isWin = true;
      
      if (result.name === 'JACKPOT') {
        player.jackpotWins++;
      }
    }
    
    // Cập nhật stats
    player.totalSpins++;
    player.lastPlayed = Date.now();
    
    if (isWin) {
      const profit = winAmount - betAmount;
      player.coins += profit;
      player.totalWinnings += profit;
      player.winStreak++;
      
      if (winAmount > player.biggestWin) {
        player.biggestWin = winAmount;
      }
      
      if (player.winStreak > player.bestStreak) {
        player.bestStreak = player.winStreak;
      }
    } else {
      player.coins -= betAmount;
      player.totalLosses += betAmount;
      player.winStreak = 0;
    }
    
    // Lưu vào lịch sử
    player.spinHistory.push({
      result: result.name,
      bet: betAmount,
      win: winAmount,
      timestamp: Date.now()
    });
    if (player.spinHistory.length > 20) {
      player.spinHistory = player.spinHistory.slice(-20);
    }
    
    // Kiểm tra achievements
    const newAchievements = checkAchievements(player);
    
    savePlayerData();
    
    // Animation effect
    const spinAnimation = [
      '🎡 Bánh xe đang quay... 🔄',
      '🎡 Bánh xe đang quay... ⚡',
      '🎡 Bánh xe đang quay... ✨',
      '🎡 Bánh xe đang quay... 🎯'
    ];
    
    // Tạo kết quả
    let resultMsg = [
      `🎡 **WHEEL OF FORTUNE RESULT** 🎡`,
      '',
      `👤 **Player:** ${userName}`,
      `💰 **Cược:** ${betAmount.toLocaleString()} coins`,
      '',
      `${result.emoji} **KẾT QUẢ: ${result.name}** ${result.emoji}`,
      `🎨 **Màu:** ${result.color}`,
      ''
    ];
    
    if (bonusInfo) {
      resultMsg.push(bonusInfo);
      resultMsg.push('');
    }
    
    if (isWin) {
      resultMsg.push(`🎉 **THẮNG!** 🎉`);
      if (result.multiplier > 0) {
        resultMsg.push(`💰 +${(winAmount - betAmount).toLocaleString()} coins (x${result.multiplier})`);
      } else {
        resultMsg.push(`💰 +${(winAmount - betAmount).toLocaleString()} coins`);
      }
      
      if (result.name === 'JACKPOT') {
        resultMsg.push('💎 **JACKPOT! CHÚC MỪNG!** 💎');
      }
    } else {
      resultMsg.push(`💔 **THUA!** 💔`);
      resultMsg.push(`💸 -${betAmount.toLocaleString()} coins`);
    }
    
    resultMsg.push(`💎 **Coins còn lại:** ${player.coins.toLocaleString()}`);
    resultMsg.push('');
    resultMsg.push(`📊 **Stats:** ${player.totalSpins} spins | 💎 ${player.jackpotWins} jackpots`);
    resultMsg.push(`🔥 **Win Streak:** ${player.winStreak}`);
    
    if (newAchievements.length > 0) {
      resultMsg.push('');
      resultMsg.push('🏆 **NEW ACHIEVEMENTS:**');
      newAchievements.forEach(achievement => {
        resultMsg.push(`• ${achievement}`);
      });
    }
    
    return api.sendMessage(resultMsg.join('\n'), threadId, type);
    
  } catch (error) {
    console.error('[WHEEL] Lỗi:', error);
    return api.sendMessage('❌ Có lỗi xảy ra khi chơi Wheel of Fortune!', threadId, type);
  }
};
