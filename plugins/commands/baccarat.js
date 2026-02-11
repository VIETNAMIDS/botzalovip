// Import leaderboard functions
const leaderboard = require('./leaderboard.js');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');

module.exports.config = {
  name: "baccarat",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Bonz Bot Enhanced",
  description: "Game Baccarat với side bets và luật casino chuẩn",
  commandCategory: "Casino",
  usages: "[bet/stats/help] <player/banker/tie> <amount>",
  cooldowns: 3
};

// Initialize game storage
if (!global.gameLeaderboard) global.gameLeaderboard = {};
if (!global.gameLeaderboard.baccarat) global.gameLeaderboard.baccarat = {};

// Card system
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
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

function getCardValue(card) {
  if (card.rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(card.rank)) return 0;
  return parseInt(card.rank) || 10; // 10 = 0 in baccarat
}

function calculateHandValue(hand) {
  const total = hand.reduce((sum, card) => sum + getCardValue(card), 0);
  return total % 10; // Only last digit matters
}

function formatCard(card) {
  return `${card.rank}${card.suit}`;
}

function formatHand(hand) {
  return hand.map(formatCard).join(' ');
}

// Baccarat drawing rules
function shouldPlayerDraw(playerValue) {
  return playerValue <= 5;
}

function shouldBankerDraw(bankerValue, playerThirdCard = null) {
  if (bankerValue <= 2) return true;
  if (bankerValue >= 7) return false;
  
  if (playerThirdCard === null) {
    // Player didn't draw third card
    return bankerValue <= 5;
  }
  
  const thirdCardValue = getCardValue(playerThirdCard);
  
  switch (bankerValue) {
    case 3:
      return thirdCardValue !== 8;
    case 4:
      return [2, 3, 4, 5, 6, 7].includes(thirdCardValue);
    case 5:
      return [4, 5, 6, 7].includes(thirdCardValue);
    case 6:
      return [6, 7].includes(thirdCardValue);
    default:
      return false;
  }
}

function playBaccaratHand() {
  const deck = createDeck();
  
  // Initial deal - 2 cards each
  const playerHand = [deck.pop(), deck.pop()];
  const bankerHand = [deck.pop(), deck.pop()];
  
  let playerValue = calculateHandValue(playerHand);
  let bankerValue = calculateHandValue(bankerHand);
  
  // Check for natural (8 or 9)
  const playerNatural = playerValue >= 8;
  const bankerNatural = bankerValue >= 8;
  
  if (playerNatural || bankerNatural) {
    // Game ends with naturals
    return {
      playerHand,
      bankerHand,
      playerValue,
      bankerValue,
      winner: playerValue > bankerValue ? 'player' : bankerValue > playerValue ? 'banker' : 'tie',
      natural: true
    };
  }
  
  // Player drawing rules
  let playerThirdCard = null;
  if (shouldPlayerDraw(playerValue)) {
    playerThirdCard = deck.pop();
    playerHand.push(playerThirdCard);
    playerValue = calculateHandValue(playerHand);
  }
  
  // Banker drawing rules
  if (shouldBankerDraw(bankerValue, playerThirdCard)) {
    bankerHand.push(deck.pop());
    bankerValue = calculateHandValue(bankerHand);
  }
  
  // Determine winner
  let winner;
  if (playerValue > bankerValue) {
    winner = 'player';
  } else if (bankerValue > playerValue) {
    winner = 'banker';
  } else {
    winner = 'tie';
  }
  
  return {
    playerHand,
    bankerHand,
    playerValue,
    bankerValue,
    winner,
    natural: false
  };
}

function calculatePayout(betType, betAmount, result) {
  switch (betType) {
    case 'player':
      return result.winner === 'player' ? betAmount * 2 : 0;
    case 'banker':
      if (result.winner === 'banker') {
        // Banker wins pay 1.95:1 (5% commission)
        return Math.floor(betAmount * 1.95);
      }
      return 0;
    case 'tie':
      return result.winner === 'tie' ? betAmount * 8 : 0; // 8:1 payout
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
      return makeHeader('Baccarat', { name: prof.name || userName, uid: senderId, coins: prof.coins });
    } catch {
      return `👤 Tên: ${userName} | 🎮 Game: Baccarat | 🆔 UID: ${senderId}`;
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
      '💳 BACCARAT',
      '',
      '📋 CÁCH CHƠI:',
      '• baccarat bet player <amount> - Cược Player',
      '• baccarat bet banker <amount> - Cược Banker',
      '• baccarat bet tie <amount> - Cược Tie',
      '• baccarat stats - Xem thống kê',
      '',
      '🎯 LUẬT CHƠI:',
      '• Mục tiêu: Tay gần 9 điểm nhất thắng',
      '• A=1, 2-9=giá trị, 10/J/Q/K=0',
      '• Chỉ tính chữ số cuối (VD: 15 = 5)',
      '• Natural 8/9 = thắng ngay',
      '',
      '📜 LUẬT RÚT BÀI:',
      '• Player ≤5: Rút thêm bài',
      '• Banker: Theo luật phức tạp',
      '• Natural 8/9: Không rút',
      '',
      '💰 PAYOUT:',
      '• Player: x2 (1:1)',
      '• Banker: x1.95 (1:1 - 5% fee)',
      '• Tie: x8 (8:1)',
      '',
      '🎲 SIDE BETS:',
      '• Player Pair: x11',
      '• Banker Pair: x11',
      '• Perfect Pair: x25',
      '',
      '💡 VÍ DỤ:',
      '• baccarat bet player 20000',
      '• baccarat bet banker 15000',
      '• baccarat bet tie 5000'
    ].join('\n');
    
    return send(helpMsg);
  }

  // Stats command
  if (action === 'stats') {
    const userStats = global.gameLeaderboard.baccarat[senderId] || {
      wins: 0, losses: 0, ties: 0, totalBet: 0, totalWin: 0, 
      playerWins: 0, bankerWins: 0, tieWins: 0, naturals: 0
    };
    
    const totalGames = userStats.wins + userStats.losses + userStats.ties;
    const winRate = totalGames > 0 ? ((userStats.wins / totalGames) * 100).toFixed(1) : '0.0';
    const profit = userStats.totalWin - userStats.totalBet;
    
    const statsMsg = [
      `💳 THỐNG KÊ BACCARAT - ${userName}`,
      '',
      `🎯 Tổng games: ${totalGames}`,
      `🏆 Thắng: ${userStats.wins} | 💥 Thua: ${userStats.losses} | 🤝 Hòa: ${userStats.ties}`,
      `📊 Win rate: ${winRate}%`,
      `💰 Tổng cược: ${userStats.totalBet.toLocaleString()}`,
      `💎 Tổng thắng: ${userStats.totalWin.toLocaleString()}`,
      `📈 Lợi nhuận: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}`,
      '',
      `🎲 Chi tiết:`,
      `• Player wins: ${userStats.playerWins}`,
      `• Banker wins: ${userStats.bankerWins}`,
      `• Tie wins: ${userStats.tieWins}`,
      `• Naturals: ${userStats.naturals}`
    ].join('\n');
    
    return send(statsMsg);
  }

  // Bet command
  if (action === 'bet') {
    const betType = args[1]?.toLowerCase();
    const betAmount = parseInt(args[2]);

    if (!['player', 'banker', 'tie'].includes(betType)) {
      return send('❌ Vui lòng chọn "player", "banker" hoặc "tie"!\n💡 Ví dụ: baccarat bet player 10000');
    }

    if (!betAmount || betAmount <= 0) {
      return send('❌ Số tiền cược không hợp lệ!\n💡 Ví dụ: baccarat bet banker 15000');
    }

    if (betAmount < 1000) {
      return send('❌ Số tiền cược tối thiểu là 1,000!');
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

    // Play the hand
    const result = playBaccaratHand();
    const payout = calculatePayout(betType, betAmount, result);
    const isWin = payout > 0;

    // Initialize user stats
    if (!global.gameLeaderboard.baccarat[senderId]) {
      global.gameLeaderboard.baccarat[senderId] = {
        wins: 0, losses: 0, ties: 0, totalBet: 0, totalWin: 0,
        playerWins: 0, bankerWins: 0, tieWins: 0, naturals: 0
      };
    }

    const userStats = global.gameLeaderboard.baccarat[senderId];
    userStats.totalBet += betAmount;

    let message = [
      '💳 BACCARAT GAME',
      '',
      `🎯 ${userName} cược: ${betType.toUpperCase()} - ${betAmount.toLocaleString()}`,
      '',
      `👤 Player: ${formatHand(result.playerHand)} = ${result.playerValue}`,
      `🏦 Banker: ${formatHand(result.bankerHand)} = ${result.bankerValue}`,
      ''
    ];

    if (result.natural) {
      message.push('✨ NATURAL! Game kết thúc sớm');
      userStats.naturals++;
    }

    message.push(`🏆 Winner: ${result.winner.toUpperCase()}`);
    message.push('');

    // Update stats based on actual game result
    if (result.winner === 'player') {
      userStats.playerWins++;
    } else if (result.winner === 'banker') {
      userStats.bankerWins++;
    } else {
      userStats.tieWins++;
    }

    // Update win/loss for user's bet
    if (isWin) {
      userStats.wins++;
      userStats.totalWin += payout;
      const profit = payout - betAmount;
      message.push(`🎉 THẮNG! +${profit.toLocaleString()}`);
      
      if (betType === 'tie') {
        message.push('💎 TIE WIN x8!');
      } else if (betType === 'banker') {
        message.push('🏦 Banker win (5% commission)');
      }
      // Wallet credit payout
      try { prof.coins = (prof.coins || 0) + payout; profiles.saveProfiles(); } catch {}
    } else {
      if (result.winner === betType) {
        userStats.ties++;
        message.push('🤝 HÒA! Hoàn tiền');
        userStats.totalWin += betAmount; // Return bet
        // Refund bet to wallet
        try { prof.coins = (prof.coins || 0) + betAmount; profiles.saveProfiles(); } catch {}
      } else {
        userStats.losses++;
        message.push(`💥 THUA! -${betAmount.toLocaleString()}`);
      }
    }

    // Add stats
    const totalGames = userStats.wins + userStats.losses + userStats.ties;
    const winRate = totalGames > 0 ? ((userStats.wins / totalGames) * 100).toFixed(1) : '0.0';
    const totalProfit = userStats.totalWin - userStats.totalBet;
    
    message.push('');
    message.push(`📊 Stats: ${userStats.wins}W-${userStats.losses}L-${userStats.ties}T (${winRate}%)`);
    message.push(`📈 Profit: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString()}`);

    // Show trend
    const trends = [];
    if (userStats.playerWins > userStats.bankerWins) trends.push('👤 Player hot');
    if (userStats.bankerWins > userStats.playerWins) trends.push('🏦 Banker hot');
    if (userStats.tieWins > 0) trends.push(`🤝 ${userStats.tieWins} ties`);
    if (trends.length > 0) {
      message.push(`🔥 Trend: ${trends.join(', ')}`);
    }

    return send(message.join('\n'));
  }

  // Default - show help
  return send('❌ Lệnh không hợp lệ! Gõ "baccarat help" để xem hướng dẫn.');
};
