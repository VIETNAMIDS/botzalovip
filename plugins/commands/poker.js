// Import leaderboard functions
const leaderboard = require('./leaderboard.js');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');

module.exports.config = {
  name: "poker",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Bonz Bot Enhanced",
  description: "Game Poker Texas Hold'em với tournaments",
  commandCategory: "Casino",
  usages: "[join/bet/call/raise/fold/check/stats/help] <amount>",
  cooldowns: 3
};

// Initialize game storage
if (!global.gameLeaderboard) global.gameLeaderboard = {};
if (!global.gameLeaderboard.poker) global.gameLeaderboard.poker = {};
if (!global.pokerGames) global.pokerGames = new Map();

// Card system
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: RANK_VALUES[rank] });
    }
  }
  
  // Shuffle deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

function formatCard(card) {
  return `${card.rank}${card.suit}`;
}

function formatHand(cards) {
  return cards.map(formatCard).join(' ');
}

// Hand evaluation functions
function evaluateHand(cards) {
  if (cards.length !== 7) return { rank: 0, name: 'Invalid' };
  
  const allCombinations = getCombinations(cards, 5);
  let bestHand = { rank: 0, name: 'High Card', cards: [] };
  
  for (const combo of allCombinations) {
    const hand = getHandRank(combo);
    if (hand.rank > bestHand.rank) {
      bestHand = hand;
    }
  }
  
  return bestHand;
}

function getCombinations(arr, k) {
  if (k === 1) return arr.map(x => [x]);
  if (k === arr.length) return [arr];
  
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(combo => [first, ...combo]);
  const withoutFirst = getCombinations(rest, k);
  
  return [...withFirst, ...withoutFirst];
}

function getHandRank(cards) {
  const sortedCards = [...cards].sort((a, b) => b.value - a.value);
  const suits = cards.map(c => c.suit);
  const values = cards.map(c => c.value);
  
  const isFlush = suits.every(suit => suit === suits[0]);
  const isStraight = checkStraight(values);
  
  const valueCounts = {};
  values.forEach(v => valueCounts[v] = (valueCounts[v] || 0) + 1);
  const counts = Object.values(valueCounts).sort((a, b) => b - a);
  
  // Royal Flush
  if (isFlush && isStraight && values.includes(14) && values.includes(13)) {
    return { rank: 9, name: 'Royal Flush', cards: sortedCards };
  }
  
  // Straight Flush
  if (isFlush && isStraight) {
    return { rank: 8, name: 'Straight Flush', cards: sortedCards };
  }
  
  // Four of a Kind
  if (counts[0] === 4) {
    return { rank: 7, name: 'Four of a Kind', cards: sortedCards };
  }
  
  // Full House
  if (counts[0] === 3 && counts[1] === 2) {
    return { rank: 6, name: 'Full House', cards: sortedCards };
  }
  
  // Flush
  if (isFlush) {
    return { rank: 5, name: 'Flush', cards: sortedCards };
  }
  
  // Straight
  if (isStraight) {
    return { rank: 4, name: 'Straight', cards: sortedCards };
  }
  
  // Three of a Kind
  if (counts[0] === 3) {
    return { rank: 3, name: 'Three of a Kind', cards: sortedCards };
  }
  
  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    return { rank: 2, name: 'Two Pair', cards: sortedCards };
  }
  
  // One Pair
  if (counts[0] === 2) {
    return { rank: 1, name: 'One Pair', cards: sortedCards };
  }
  
  // High Card
  return { rank: 0, name: 'High Card', cards: sortedCards };
}

function checkStraight(values) {
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  if (uniqueValues.length !== 5) return false;
  
  // Check for regular straight
  for (let i = 1; i < uniqueValues.length; i++) {
    if (uniqueValues[i] !== uniqueValues[i-1] + 1) {
      // Check for A-2-3-4-5 straight (wheel)
      if (uniqueValues.join(',') === '2,3,4,5,14') return true;
      return false;
    }
  }
  return true;
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
      return makeHeader('Poker', { name: prof.name || userName, uid: senderId, coins: prof.coins });
    } catch {
      return `👤 Tên: ${userName} | 🎮 Game: Poker | 🆔 UID: ${senderId}`;
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
      '🎰 POKER TEXAS HOLD\'EM',
      '',
      '📋 CÁCH CHƠI:',
      '• poker join <buy_in> - Tham gia bàn',
      '• poker bet <amount> - Đặt cược',
      '• poker call - Theo cược',
      '• poker raise <amount> - Tăng cược',
      '• poker fold - Bỏ bài',
      '• poker check - Bỏ lượt',
      '• poker stats - Xem thống kê',
      '',
      '🎯 LUẬT CHƠI:',
      '• 2 lá bài cá nhân + 5 lá chung',
      '• Tạo hand 5 lá tốt nhất',
      '• 4 vòng cược: Pre-flop, Flop, Turn, River',
      '',
      '🏆 HAND RANKINGS (cao → thấp):',
      '• Royal Flush - A♠️ K♠️ Q♠️ J♠️ 10♠️',
      '• Straight Flush - 5 lá liên tiếp cùng chất',
      '• Four of a Kind - 4 lá giống nhau',
      '• Full House - 3 + 2 lá giống nhau',
      '• Flush - 5 lá cùng chất',
      '• Straight - 5 lá liên tiếp',
      '• Three of a Kind - 3 lá giống nhau',
      '• Two Pair - 2 đôi',
      '• One Pair - 1 đôi',
      '• High Card - Lá cao nhất',
      '',
      '💡 VÍ DỤ:',
      '• poker join 50000'
    ].join('\n');
    
    return send(helpMsg);
  }

  // Stats command
  if (action === 'stats') {
    const userStats = global.gameLeaderboard.poker[senderId] || {
      wins: 0, losses: 0, totalBet: 0, totalWin: 0, handsPlayed: 0, bestHand: 'High Card'
    };
    
    const winRate = userStats.handsPlayed > 0 ? ((userStats.wins / userStats.handsPlayed) * 100).toFixed(1) : '0.0';
    const profit = userStats.totalWin - userStats.totalBet;
    
    const statsMsg = [
      `🎰 THỐNG KÊ POKER - ${userName}`,
      '',
      `🎯 Hands played: ${userStats.handsPlayed}`,
      `🏆 Thắng: ${userStats.wins} | 💥 Thua: ${userStats.losses}`,
      `📊 Win rate: ${winRate}%`,
      `💰 Tổng cược: ${userStats.totalBet.toLocaleString()}`,
      `💎 Tổng thắng: ${userStats.totalWin.toLocaleString()}`,
      `📈 Lợi nhuận: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()}`,
      `🃏 Best hand: ${userStats.bestHand}`
    ].join('\n');
    
    return send(statsMsg);
  }

  // Join table
  if (action === 'join') {
    const buyIn = parseInt(args[1]) || 50000;
    
    if (buyIn < 10000) {
      return send('❌ Buy-in tối thiểu là 10,000!');
    }

    // Create new game or join existing
    let game = global.pokerGames.get(threadId);
    
    if (!game) {
      // Create new table
      const deck = createDeck();
      game = {
        deck,
        communityCards: [],
        players: new Map(),
        pot: 0,
        currentBet: 0,
        round: 'pre-flop', // pre-flop, flop, turn, river
        gameActive: false,
        dealerButton: 0
      };
      global.pokerGames.set(threadId, game);
    }

    // Wallet: ensure and validate coins
    let prof = null;
    try { prof = profiles.ensureProfile(senderId, userName); } catch {}
    const coins = prof?.coins ?? 0;
    if (coins < buyIn) {
      return send(`❌ Số dư không đủ! Cần ${buyIn.toLocaleString()} nhưng chỉ có ${Number(coins).toLocaleString()}.`);
    }

    // Deduct buy-in upfront
    try { prof.coins = (prof.coins || 0) - buyIn; profiles.saveProfiles(); } catch {}

    // Add player to game
    if (game.players.has(senderId)) {
      return send('❌ Bạn đã tham gia bàn này rồi!');
    }

    if (game.players.size >= 6) {
      return send('❌ Bàn đã đầy! (tối đa 6 người)');
    }

    game.players.set(senderId, {
      name: userName,
      chips: buyIn,
      hand: [],
      bet: 0,
      folded: false,
      allIn: false
    });

    let message = [
      '🎰 POKER TEXAS HOLD\'EM',
      '',
      `✅ ${userName} tham gia với ${buyIn.toLocaleString()} chips`,
      `👥 Người chơi: ${game.players.size}/6`,
      ''
    ];

    // List all players
    for (const [playerId, player] of game.players) {
      message.push(`• ${player.name}: ${player.chips.toLocaleString()} chips`);
    }

    if (game.players.size >= 2 && !game.gameActive) {
      message.push('');
      message.push('🎯 Đủ người chơi! Game sẽ bắt đầu...');
      
      // Start game
      setTimeout(() => {
        startPokerGame(api, threadId, type);
      }, 3000);
    }

    return send(message.join('\n'));
  }

  // Get current game
  const game = global.pokerGames.get(threadId);
  if (!game) {
    return send('❌ Không có bàn poker nào! Gõ "poker join <buy_in>" để tạo bàn.');
  }

  if (!game.players.has(senderId)) {
    return send('❌ Bạn chưa tham gia bàn! Gõ "poker join <buy_in>".');
  }

  if (!game.gameActive) {
    return send('❌ Game chưa bắt đầu! Cần ít nhất 2 người chơi.');
  }

  const player = game.players.get(senderId);
  if (player.folded) {
    return send('❌ Bạn đã fold! Chờ hand tiếp theo.');
  }

  // Betting actions
  if (action === 'bet') {
    const betAmount = parseInt(args[1]);
    if (!betAmount || betAmount <= 0) {
      return send('❌ Số tiền cược không hợp lệ!');
    }

    if (betAmount > player.chips) {
      return send('❌ Không đủ chips!');
    }

    player.chips -= betAmount;
    player.bet += betAmount;
    game.pot += betAmount;
    game.currentBet = Math.max(game.currentBet, player.bet);

    return send(`🎰 ${userName} bet ${betAmount.toLocaleString()}!\n💰 Pot: ${game.pot.toLocaleString()}`);
  }

  if (action === 'call') {
    const callAmount = game.currentBet - player.bet;
    if (callAmount <= 0) {
      return send('❌ Không có gì để call!');
    }

    if (callAmount > player.chips) {
      // All-in
      game.pot += player.chips;
      player.bet += player.chips;
      player.chips = 0;
      player.allIn = true;
      return send(`🎰 ${userName} ALL-IN với ${player.bet.toLocaleString()}!\n💰 Pot: ${game.pot.toLocaleString()}`);
    }

    player.chips -= callAmount;
    player.bet += callAmount;
    game.pot += callAmount;
    return send(`🎰 ${userName} call ${callAmount.toLocaleString()}!\n💰 Pot: ${game.pot.toLocaleString()}`);
  }

  if (action === 'raise') {
    const raiseAmount = parseInt(args[1]);
    if (!raiseAmount || raiseAmount <= game.currentBet) {
      return send('❌ Raise phải lớn hơn current bet!');
    }

    const totalBet = raiseAmount - player.bet;
    if (totalBet > player.chips) {
      return send('❌ Không đủ chips!');
    }
    
    player.chips -= totalBet;
    player.bet = raiseAmount;
    game.pot += totalBet;
    game.currentBet = raiseAmount;
    return send(`🎰 ${userName} raise to ${raiseAmount.toLocaleString()}!\n💰 Pot: ${game.pot.toLocaleString()}`);
  }

  if (action === 'fold') {
    player.folded = true;
    return send(`🎰 ${userName} fold!`);
  }

  if (action === 'check') {
    if (game.currentBet > player.bet) {
      return send('❌ Không thể check! Phải call hoặc fold.');
    }
    return send(`🎰 ${userName} check!`);
  }

  // Default - show current game state
  const message = [
    '🎰 POKER GAME STATE',
    '',
    `🃏 Your hand: ${formatHand(player.hand)}`,
    `💰 Your chips: ${player.chips.toLocaleString()}`,
    `🎯 Your bet: ${player.bet.toLocaleString()}`,
    `💰 Pot: ${game.pot.toLocaleString()}`,
    `📊 Current bet: ${game.currentBet.toLocaleString()}`,
    `🎲 Round: ${game.round}`,
    ''
  ];

  if (game.communityCards.length > 0) {
    message.push(`🎴 Community: ${formatHand(game.communityCards)}`);
  }

  return send(message.join('\n'));
};

// Start poker game function
async function startPokerGame(api, threadId, type) {
  const game = global.pokerGames.get(threadId);
  if (!game || game.gameActive) return;

  game.gameActive = true;
  game.deck = createDeck();
  game.communityCards = [];
  game.pot = 0;
  game.currentBet = 0;
  game.round = 'pre-flop';

  // Reset players
  for (const [playerId, player] of game.players) {
    player.hand = [game.deck.pop(), game.deck.pop()];
    player.bet = 0;
    player.folded = false;
    player.allIn = false;
  }

  // Deal community cards for flop
  game.deck.pop(); // Burn card
  game.communityCards = [
    game.deck.pop(),
    game.deck.pop(),
    game.deck.pop()
  ];

  let message = [
    '🎰 POKER GAME STARTED!',
    '',
    `👥 Players: ${game.players.size}`,
    `🎴 Flop: ${formatHand(game.communityCards)}`,
    '',
    '💡 Actions available:',
    '• poker bet <amount>',
    '• poker call',
    '• poker raise <amount>',
    '• poker fold',
    '• poker check'
  ];

  api.sendMessage(message.join('\n'), threadId, type);

  // Send private hands to players
  for (const [playerId, player] of game.players) {
    try {
      const handMsg = `🃏 Your hand: ${formatHand(player.hand)}\n🎴 Flop: ${formatHand(game.communityCards)}`;
      api.sendMessage(handMsg, playerId, 'user');
    } catch {}
  }
}
