// Import leaderboard functions
const leaderboard = require('./leaderboard.js');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');

module.exports.config = {
  name: "blackjack",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Bonz Bot Enhanced",
  description: "Game Blackjack 21 với AI Dealer thông minh",
  commandCategory: "Casino",
  usages: "[start/hit/stand/stats/help] <bet_amount>",
  cooldowns: 3
};

// Initialize game storage
if (!global.gameLeaderboard) global.gameLeaderboard = {};
if (!global.gameLeaderboard.blackjack) global.gameLeaderboard.blackjack = {};
if (!global.blackjackGames) global.blackjackGames = new Map();

// Card system
function createDeck() {
  const suits = ['♠️', '♥️', '♦️', '♣️'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
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
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank);
}

function getHandValue(hand) {
  let value = 0;
  let aces = 0;
  
  for (const card of hand) {
    const cardValue = getCardValue(card);
    value += cardValue;
    if (card.rank === 'A') aces++;
  }
  
  // Adjust for aces
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  
  return value;
}

function formatHand(hand, hideFirst = false) {
  if (hideFirst && hand.length > 0) {
    const visibleCards = hand.slice(1);
    return `🂠 ${visibleCards.map(card => `${card.rank}${card.suit}`).join(' ')}`;
  }
  return hand.map(card => `${card.rank}${card.suit}`).join(' ');
}

function isBlackjack(hand) {
  return hand.length === 2 && getHandValue(hand) === 21;
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
      return api.sendMessage('⚠️ M chưa có hồ sơ game. Gõ: \"profile create <tên>\" để tạo trước rồi quay lại chơi nha.', threadId, type);
    }
  } catch {}

  // Helper to prepend standardized header
  function makeHeaderLine() {
    try {
      const prof = profiles.getProfile(senderId) || { id: senderId, name: userName, coins: 0 };
      return makeHeader('Blackjack', { name: prof.name || userName, uid: senderId, coins: prof.coins });
    } catch {
      return `👤 Tên: ${userName} | 🎮 Game: Blackjack | 🆔 UID: ${senderId}`;
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
      '🃏 BLACKJACK 21',
      '',
      '📋 CÁCH CHƠI:',
      '• blackjack start <bet> - Bắt đầu game',
      '• blackjack hit - Rút thêm bài',
      '• blackjack stand - Dừng lại',
      '• blackjack stats - Xem thống kê',
      '',
      '🎯 LUẬT CHƠI:',
      '• Mục tiêu: Đạt 21 điểm hoặc gần nhất',
      '• A = 1 hoặc 11, J/Q/K = 10',
      '• Blackjack (21 với 2 lá) = x2.5',
      '• Dealer rút bài đến 17+',
      '',
      '💰 PAYOUT:',
      '• Thắng thường: x2 tiền cược',
      '• Blackjack: x2.5 tiền cược',
      '• Hòa: Hoàn tiền',
      '',
      '💡 VÍ DỤ:',
      '• blackjack start 10000'
    ].join('\n');
    return send(helpMsg);
  }

  // Stats command
  if (action === 'stats') {
    const userStats = global.gameLeaderboard.blackjack[senderId] || {
      wins: 0, losses: 0, pushes: 0, blackjacks: 0, totalBet: 0, totalWin: 0
    };
    const totalGames = userStats.wins + userStats.losses + userStats.pushes;
    const winRate = totalGames > 0 ? ((userStats.wins / totalGames) * 100).toFixed(1) : '0.0';
    const profit = userStats.totalWin - userStats.totalBet;
    const statsMsg = [
      `🃏 THỐNG KÊ BLACKJACK - ${userName}`,
      '',
      `🎯 Tổng trận: ${totalGames}`,
      `🏆 Thắng: ${userStats.wins} | 💥 Thua: ${userStats.losses} | 🤝 Hòa: ${userStats.pushes}`,
      `📊 Tỷ lệ thắng: ${winRate}%`,
      `💰 Tổng cược: ${userStats.totalBet.toLocaleString()}`,
      `💎 Tổng thắng: ${userStats.totalWin.toLocaleString()}`,
      `📈 Lợi nhuận: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}`,
      `🃏 Blackjacks: ${userStats.blackjacks}`
    ].join('\n');
    return send(statsMsg);
  }

  // Start new game
  if (action === 'start') {
    const betAmount = parseInt(args[1]) || 10000;
    if (betAmount < 1000) return send('❌ Số tiền cược tối thiểu là 1,000!');

    // Wallet: ensure and validate coins
    let prof = null;
    try { prof = profiles.ensureProfile(senderId, userName); } catch {}
    const coins = prof?.coins ?? 0;
    if (coins < betAmount) {
      return send(`❌ Số dư không đủ! Cần ${betAmount.toLocaleString()} nhưng chỉ có ${Number(coins).toLocaleString()}.`);
    }
    // Deduct bet upfront
    try { prof.coins = (prof.coins || 0) - betAmount; profiles.saveProfiles(); } catch {}

    // Create new game
    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];
    const game = { deck, playerHand, dealerHand, bet: betAmount, gameOver: false };
    global.blackjackGames.set(threadId, game);

    const playerValue = getHandValue(playerHand);
    const dealerFirstCard = getCardValue(dealerHand[0]);

    let message = [
      '🃏 BLACKJACK 21 - GAME MỚI',
      '',
      `💰 Cược: ${betAmount.toLocaleString()}`,
      '',
      `🎯 ${userName}: ${formatHand(playerHand)} (${playerValue})`,
      `🤖 Dealer: ${formatHand(dealerHand, true)} (?+${dealerFirstCard})`,
      ''
    ];

    if (isBlackjack(playerHand)) {
      if (isBlackjack(dealerHand)) {
        message.push('🤝 PUSH! Cả hai đều có Blackjack!');
        game.gameOver = true;
        if (!global.gameLeaderboard.blackjack[senderId]) {
          global.gameLeaderboard.blackjack[senderId] = { wins: 0, losses: 0, pushes: 0, blackjacks: 0, totalBet: 0, totalWin: 0 };
        }
        const userStats = global.gameLeaderboard.blackjack[senderId];
        userStats.pushes++;
        userStats.blackjacks++;
        userStats.totalBet += betAmount;
        userStats.totalWin += betAmount; // Return bet
        // Refund bet to wallet
        try { prof.coins = (prof.coins || 0) + betAmount; profiles.saveProfiles(); } catch {}
      } else {
        message.push('🎉 BLACKJACK! Bạn thắng x2.5!');
        game.gameOver = true;
        if (!global.gameLeaderboard.blackjack[senderId]) {
          global.gameLeaderboard.blackjack[senderId] = { wins: 0, losses: 0, pushes: 0, blackjacks: 0, totalBet: 0, totalWin: 0 };
        }
        const userStats = global.gameLeaderboard.blackjack[senderId];
        const winAmount = Math.floor(betAmount * 2.5);
        userStats.wins++;
        userStats.blackjacks++;
        userStats.totalBet += betAmount;
        userStats.totalWin += winAmount;
        message.push(`💰 +${winAmount.toLocaleString()}`);
        // Credit payout to wallet
        try { prof.coins = (prof.coins || 0) + winAmount; profiles.saveProfiles(); } catch {}
      }
    } else if (isBlackjack(dealerHand)) {
      message.push(`💥 Dealer có Blackjack: ${formatHand(dealerHand)} (21)!`);
      message.push('Bạn thua!');
      game.gameOver = true;
      if (!global.gameLeaderboard.blackjack[senderId]) {
        global.gameLeaderboard.blackjack[senderId] = { wins: 0, losses: 0, pushes: 0, blackjacks: 0, totalBet: 0, totalWin: 0 };
      }
      const userStats = global.gameLeaderboard.blackjack[senderId];
      userStats.losses++;
      userStats.totalBet += betAmount;
      message.push(`💸 -${betAmount.toLocaleString()}`);
    } else {
      message.push('💡 Lựa chọn:');
      message.push('• blackjack hit - Rút thêm bài');
      message.push('• blackjack stand - Dừng lại');
    }
    return send(message.join('\n'));
  }

  // Get current game
  const game = global.blackjackGames.get(threadId);
  if (!game) return send('❌ Không có game nào đang chơi! Gõ "blackjack start <bet>" để bắt đầu.');
  if (game.gameOver) return send('❌ Game đã kết thúc! Gõ "blackjack start <bet>" để chơi lại.');

  // Hit - draw another card
  if (action === 'hit') {
    const newCard = game.deck.pop();
    game.playerHand.push(newCard);
    const playerValue = getHandValue(game.playerHand);
    let message = [
      '🃏 BLACKJACK - HIT',
      '',
      `🎯 ${userName}: ${formatHand(game.playerHand)} (${playerValue})`,
      `🤖 Dealer: ${formatHand(game.dealerHand, true)}`,
      ''
    ];
    if (playerValue > 21) {
      message.push('💥 BUST! Bạn thua!');
      game.gameOver = true;
      if (!global.gameLeaderboard.blackjack[senderId]) {
        global.gameLeaderboard.blackjack[senderId] = { wins: 0, losses: 0, pushes: 0, blackjacks: 0, totalBet: 0, totalWin: 0 };
      }
      const userStats = global.gameLeaderboard.blackjack[senderId];
      userStats.losses++;
      userStats.totalBet += game.bet;
      message.push(`💸 -${game.bet.toLocaleString()}`);
      // No wallet change on loss (bet already deducted)
    } else {
      message.push('💡 Tiếp tục:');
      message.push('• blackjack hit - Rút thêm bài');
      message.push('• blackjack stand - Dừng lại');
    }
    return send(message.join('\n'));
  }

  // Stand - end player turn
  if (action === 'stand') {
    while (getHandValue(game.dealerHand) < 17) {
      game.dealerHand.push(game.deck.pop());
    }
    const playerValue = getHandValue(game.playerHand);
    const dealerValue = getHandValue(game.dealerHand);
    let message = [
      '🃏 BLACKJACK - KẾT QUẢ',
      '',
      `🎯 ${userName}: ${formatHand(game.playerHand)} (${playerValue})`,
      `🤖 Dealer: ${formatHand(game.dealerHand)} (${dealerValue})`,
      ''
    ];
    if (!global.gameLeaderboard.blackjack[senderId]) {
      global.gameLeaderboard.blackjack[senderId] = { wins: 0, losses: 0, pushes: 0, blackjacks: 0, totalBet: 0, totalWin: 0 };
    }
    const userStats = global.gameLeaderboard.blackjack[senderId];
    userStats.totalBet += game.bet;
    if (dealerValue > 21) {
      message.push('🎉 Dealer BUST! Bạn thắng!');
      const winAmount = game.bet * 2;
      userStats.wins++;
      userStats.totalWin += winAmount;
      message.push(`💰 +${winAmount.toLocaleString()}`);
      try { const p = profiles.getProfile(senderId); p.coins = (p.coins||0)+winAmount; profiles.saveProfiles(); } catch {}
    } else if (playerValue > dealerValue) {
      message.push('🎉 Bạn thắng!');
      const winAmount = game.bet * 2;
      userStats.wins++;
      userStats.totalWin += winAmount;
      message.push(`💰 +${winAmount.toLocaleString()}`);
      try { const p = profiles.getProfile(senderId); p.coins = (p.coins||0)+winAmount; profiles.saveProfiles(); } catch {}
    } else if (playerValue < dealerValue) {
      message.push('💥 Dealer thắng! Bạn thua!');
      userStats.losses++;
      message.push(`💸 -${game.bet.toLocaleString()}`);
      // No wallet change on loss (bet already deducted)
    } else {
      message.push('🤝 PUSH! Hòa!');
      userStats.pushes++;
      userStats.totalWin += game.bet;
      message.push('💰 Hoàn tiền');
      // Refund bet
      try { const p = profiles.getProfile(senderId); p.coins = (p.coins||0)+game.bet; profiles.saveProfiles(); } catch {}
    }
    game.gameOver = true;
    const totalGames = userStats.wins + userStats.losses + userStats.pushes;
    const winRate = totalGames > 0 ? ((userStats.wins / totalGames) * 100).toFixed(1) : '0.0';
    message.push('');
    message.push(`📊 Stats: ${userStats.wins}W-${userStats.losses}L-${userStats.pushes}P (${winRate}%)`);
    return send(message.join('\n'));
  }

  // Default - show help
  return send('❌ Lệnh không hợp lệ! Gõ "blackjack help" để xem hướng dẫn.');
};
