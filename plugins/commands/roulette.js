// Import leaderboard functions
const leaderboard = require('./leaderboard.js');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');

module.exports.config = {
  name: "roulette",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Bonz Bot Enhanced",
  description: "Game Roulette với statistics và hot/cold numbers",
  commandCategory: "Casino",
  usages: "[bet/stats/hot/help] <số/màu/type> <amount>",
  cooldowns: 3
};

// Initialize game storage
if (!global.gameLeaderboard) global.gameLeaderboard = {};
if (!global.gameLeaderboard.roulette) global.gameLeaderboard.roulette = {};
if (!global.rouletteStats) global.rouletteStats = {
  numbers: {},
  recentSpins: [],
  totalSpins: 0
};

// Roulette wheel setup (European style - 0-36)
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

function getNumberColor(num) {
  if (num === 0) return 'green';
  if (RED_NUMBERS.includes(num)) return 'red';
  if (BLACK_NUMBERS.includes(num)) return 'black';
  return 'unknown';
}

function getNumberEmoji(num) {
  const color = getNumberColor(num);
  if (color === 'red') return '🔴';
  if (color === 'black') return '⚫';
  return '🟢'; // green for 0
}

function spinWheel() {
  return Math.floor(Math.random() * 37); // 0-36
}

function updateStats(number) {
  if (!global.rouletteStats.numbers[number]) {
    global.rouletteStats.numbers[number] = 0;
  }
  global.rouletteStats.numbers[number]++;
  global.rouletteStats.totalSpins++;
  
  // Keep recent spins (last 50)
  global.rouletteStats.recentSpins.unshift(number);
  if (global.rouletteStats.recentSpins.length > 50) {
    global.rouletteStats.recentSpins.pop();
  }
}

function getHotColdNumbers() {
  const numbers = global.rouletteStats.numbers;
  const entries = Object.entries(numbers).map(([num, count]) => ({
    number: parseInt(num),
    count,
    percentage: ((count / global.rouletteStats.totalSpins) * 100).toFixed(1)
  }));
  
  entries.sort((a, b) => b.count - a.count);
  
  const hot = entries.slice(0, 5);
  const cold = entries.slice(-5).reverse();
  
  return { hot, cold };
}

function calculatePayout(betType, betValue, winningNumber, betAmount) {
  const color = getNumberColor(winningNumber);
  
  switch (betType) {
    case 'straight': // Single number
      return betValue === winningNumber ? betAmount * 35 : 0;
      
    case 'red':
      return color === 'red' ? betAmount * 2 : 0;
      
    case 'black':
      return color === 'black' ? betAmount * 2 : 0;
      
    case 'even':
      return winningNumber > 0 && winningNumber % 2 === 0 ? betAmount * 2 : 0;
      
    case 'odd':
      return winningNumber > 0 && winningNumber % 2 === 1 ? betAmount * 2 : 0;
      
    case 'low': // 1-18
      return winningNumber >= 1 && winningNumber <= 18 ? betAmount * 2 : 0;
      
    case 'high': // 19-36
      return winningNumber >= 19 && winningNumber <= 36 ? betAmount * 2 : 0;
      
    default:
      return 0;
  }
}

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  let userName = 'Người chơi';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người chơi';
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
  function makeHeaderLine() {
    try {
      const prof = profiles.getProfile(senderId) || { id: senderId, name: userName, coins: 0 };
      return makeHeader('Roulette', { name: prof.name || userName, uid: senderId, coins: prof.coins });
    } catch {
      return `👤 Tên: ${userName} | 🎮 Game: Roulette | 🆔 UID: ${senderId}`;
    }
  }
  async function send(content) {
    const parts = Array.isArray(content) ? content : [String(content)];
    parts.unshift(makeHeaderLine());
    return api.sendMessage(parts.join('\n'), threadId, type);
  }

  const action = (args[0] || '').toLowerCase();
  
  // Help command
  if (!action || action === 'help') {
    const helpMsg = [
      '🎡 ROULETTE EUROPEAN',
      '',
      '📋 CÁCH CHƠI:',
      '• roulette bet <số> <amount> - Cược số (0-36)',
      '• roulette bet <màu> <amount> - Cược màu',
      '• roulette bet <type> <amount> - Cược loại',
      '• roulette stats - Xem thống kê',
      '• roulette hot - Số hot/cold',
      '',
      '🎯 LOẠI CƯỢC:',
      '• Số (0-36): Payout x35',
      '• Màu (red/black): Payout x2',
      '• Chẵn/Lẻ (even/odd): Payout x2',
      '• Cao/Thấp (high/low): Payout x2',
      '',
      '🎨 MÀU SẮC:',
      '• 🔴 Red: 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36',
      '• ⚫ Black: 2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35',
      '• 🟢 Green: 0',
      '',
      '💡 VÍ DỤ:',
      '• roulette bet 7 10000',
      '• roulette bet red 20000',
      '• roulette bet even 15000'
    ].join('\n');
    
    return send(helpMsg);
  }

  // Stats command
  if (action === 'stats') {
    const userStats = global.gameLeaderboard.roulette[senderId] || {
      wins: 0, losses: 0, totalBet: 0, totalWin: 0, biggestWin: 0, spins: 0
    };
    
    const winRate = userStats.spins > 0 ? ((userStats.wins / userStats.spins) * 100).toFixed(1) : '0.0';
    const profit = userStats.totalWin - userStats.totalBet;
    
    const statsMsg = [
      `🎡 THỐNG KÊ ROULETTE - ${userName}`,
      '',
      `🎯 Tổng spins: ${userStats.spins}`,
      `🏆 Thắng: ${userStats.wins} | 💥 Thua: ${userStats.losses}`,
      `📊 Win rate: ${winRate}%`,
      `💰 Tổng cược: ${userStats.totalBet.toLocaleString()}`,
      `💎 Tổng thắng: ${userStats.totalWin.toLocaleString()}`,
      `📈 Lợi nhuận: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}`,
      `🎰 Biggest win: ${userStats.biggestWin.toLocaleString()}`
    ].join('\n');
    
    return send(statsMsg);
  }

  // Hot/Cold numbers
  if (action === 'hot') {
    if (global.rouletteStats.totalSpins === 0) {
      return send('📊 Chưa có dữ liệu! Hãy chơi vài game trước.');
    }

    const { hot, cold } = getHotColdNumbers();
    const recent = global.rouletteStats.recentSpins.slice(0, 10);
    
    let message = [
      '🎡 ROULETTE STATISTICS',
      '',
      `📊 Tổng spins: ${global.rouletteStats.totalSpins}`,
      '',
      '🔥 HOT NUMBERS (xuất hiện nhiều):',
    ];

    hot.forEach((item, i) => {
      const emoji = getNumberEmoji(item.number);
      message.push(`${i + 1}. ${emoji} ${item.number} - ${item.count} lần (${item.percentage}%)`);
    });

    message.push('');
    message.push('🧊 COLD NUMBERS (xuất hiện ít):');
    
    cold.forEach((item, i) => {
      const emoji = getNumberEmoji(item.number);
      message.push(`${i + 1}. ${emoji} ${item.number} - ${item.count} lần (${item.percentage}%)`);
    });

    if (recent.length > 0) {
      message.push('');
      message.push('📈 10 SPINS GẦN NHẤT:');
      const recentStr = recent.map(num => `${getNumberEmoji(num)}${num}`).join(' ');
      message.push(recentStr);
    }

    return send(message.join('\n'));
  }

  // Bet command
  if (action === 'bet') {
    const betTarget = args[1]?.toLowerCase();
    const betAmount = parseInt(args[2]);

    if (!betTarget) {
      return send('❌ Vui lòng chọn số hoặc loại cược!\n💡 Ví dụ: roulette bet 7 10000');
    }

    if (!betAmount || betAmount <= 0) {
      return send('❌ Số tiền cược không hợp lệ!\n💡 Ví dụ: roulette bet red 10000');
    }

    if (betAmount < 1000) {
      return send('❌ Số tiền cược tối thiểu là 1,000!');
    }

    // Determine bet type and value
    let betType = '';
    let betValue = null;

    // Check if it's a number bet
    const num = parseInt(betTarget);
    if (!isNaN(num) && num >= 0 && num <= 36) {
      betType = 'straight';
      betValue = num;
    } else {
      // Check other bet types
      switch (betTarget) {
        case 'red':
        case 'black':
        case 'even':
        case 'odd':
        case 'low':
        case 'high':
          betType = betTarget;
          break;
        default:
          return send('❌ Loại cược không hợp lệ!\n💡 Gõ "roulette help" để xem hướng dẫn.');
      }
    }

    // Wallet: ensure and validate coins
    let prof = null;
    try { prof = profiles.ensureProfile(senderId, userName); } catch {}
    const coins = prof?.coins ?? 0;
    if (coins < betAmount) {
      return send(`❌ Số dư không đủ! Cần ${betAmount.toLocaleString()} nhưng chỉ có ${Number(coins).toLocaleString()}.`);
    }
    // Deduct bet upfront
    try { prof.coins = (prof.coins || 0) - betAmount; profiles.saveProfiles(); } catch {}

    // Spin the wheel
    const winningNumber = spinWheel();
    const winningColor = getNumberColor(winningNumber);
    const winningEmoji = getNumberEmoji(winningNumber);
    
    // Update global stats
    updateStats(winningNumber);

    // Calculate payout
    const payout = calculatePayout(betType, betValue, winningNumber, betAmount);
    const isWin = payout > 0;

    // Initialize user stats
    if (!global.gameLeaderboard.roulette[senderId]) {
      global.gameLeaderboard.roulette[senderId] = {
        wins: 0, losses: 0, totalBet: 0, totalWin: 0, biggestWin: 0, spins: 0
      };
    }

    const userStats = global.gameLeaderboard.roulette[senderId];
    userStats.spins++;
    userStats.totalBet += betAmount;

    let message = [
      '🎡 ROULETTE SPIN',
      '',
      `🎯 ${userName} cược: ${betTarget.toUpperCase()} - ${betAmount.toLocaleString()}`,
      `🎲 Kết quả: ${winningEmoji} ${winningNumber} (${winningColor.toUpperCase()})`,
      ''
    ];

    if (isWin) {
      userStats.wins++;
      userStats.totalWin += payout;
      userStats.biggestWin = Math.max(userStats.biggestWin, payout);
      
      const profit = payout - betAmount;
      message.push(`🎉 THẮNG! +${profit.toLocaleString()}`);
      
      if (betType === 'straight') {
        message.push('💎 STRAIGHT WIN x35!');
      }
    } else {
      userStats.losses++;
      message.push(`💥 THUA! -${betAmount.toLocaleString()}`);
    }

    // Add stats
    const winRate = userStats.spins > 0 ? ((userStats.wins / userStats.spins) * 100).toFixed(1) : '0.0';
    const totalProfit = userStats.totalWin - userStats.totalBet;
    
    message.push('');
    message.push(`📊 Stats: ${userStats.wins}W-${userStats.losses}L (${winRate}%)`);
    message.push(`📈 Profit: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString()}`);

    // Show recent numbers
    const recent = global.rouletteStats.recentSpins.slice(0, 5);
    if (recent.length > 0) {
      const recentStr = recent.map(num => `${getNumberEmoji(num)}${num}`).join(' ');
      message.push(`🔄 Recent: ${recentStr}`);
    }

    // Wallet credit if win
    try {
      if (isWin) {
        prof.coins = (prof.coins || 0) + payout; // bet already deducted
        profiles.saveProfiles();
      }
    } catch {}

    return send(message.join('\n'));
  }

  // Default - show help
  return send('❌ Lệnh không hợp lệ! Gõ "roulette help" để xem hướng dẫn.');
};
