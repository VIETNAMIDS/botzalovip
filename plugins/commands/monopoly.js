module.exports.config = {
  name: "monopoly",
  aliases: ['cotyphu', 'ctp'],
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Bonz Games",
  description: "Game Cờ Tỷ Phú multiplayer với mua bán bất động sản",
  commandCategory: "Game",
  usages: "[start/join/roll/buy/stats] <amount>",
  cooldowns: 3
};

// Initialize game storage
if (!global.monopolyGames) global.monopolyGames = new Map();
if (!global.monopolyStats) global.monopolyStats = {};

// Game board properties
const BOARD_PROPERTIES = [
  { id: 0, name: 'START', type: 'start', price: 0, rent: 0, color: 'special' },
  { id: 1, name: 'Hà Nội', type: 'property', price: 60, rent: 2, color: 'brown' },
  { id: 2, name: 'Cơ Hội', type: 'chance', price: 0, rent: 0, color: 'special' },
  { id: 3, name: 'TP.HCM', type: 'property', price: 60, rent: 4, color: 'brown' },
  { id: 4, name: 'Thuế', type: 'tax', price: 0, rent: 200, color: 'special' },
  { id: 5, name: 'Sân Bay Nội Bài', type: 'airport', price: 200, rent: 25, color: 'airport' },
  { id: 6, name: 'Đà Nẵng', type: 'property', price: 100, rent: 6, color: 'lightblue' },
  { id: 7, name: 'Rủi Ro', type: 'risk', price: 0, rent: 0, color: 'special' },
  { id: 8, name: 'Huế', type: 'property', price: 100, rent: 6, color: 'lightblue' },
  { id: 9, name: 'Hội An', type: 'property', price: 120, rent: 8, color: 'lightblue' },
  { id: 10, name: 'Tù', type: 'jail', price: 0, rent: 0, color: 'special' },
  { id: 11, name: 'Nha Trang', type: 'property', price: 140, rent: 10, color: 'pink' },
  { id: 12, name: 'Điện Lực', type: 'utility', price: 150, rent: 0, color: 'utility' },
  { id: 13, name: 'Vũng Tàu', type: 'property', price: 140, rent: 10, color: 'pink' },
  { id: 14, name: 'Phú Quốc', type: 'property', price: 160, rent: 12, color: 'pink' },
  { id: 15, name: 'Sân Bay Tân Sơn Nhất', type: 'airport', price: 200, rent: 25, color: 'airport' },
  { id: 16, name: 'Cần Thơ', type: 'property', price: 180, rent: 14, color: 'orange' },
  { id: 17, name: 'Cơ Hội', type: 'chance', price: 0, rent: 0, color: 'special' },
  { id: 18, name: 'Hạ Long', type: 'property', price: 180, rent: 14, color: 'orange' },
  { id: 19, name: 'Sa Pa', type: 'property', price: 200, rent: 16, color: 'orange' },
  { id: 20, name: 'Đỗ Xe Miễn Phí', type: 'parking', price: 0, rent: 0, color: 'special' },
  { id: 21, name: 'Đà Lạt', type: 'property', price: 220, rent: 18, color: 'red' },
  { id: 22, name: 'Rủi Ro', type: 'risk', price: 0, rent: 0, color: 'special' },
  { id: 23, name: 'Quy Nhon', type: 'property', price: 220, rent: 18, color: 'red' },
  { id: 24, name: 'Phan Thiết', type: 'property', price: 240, rent: 20, color: 'red' },
  { id: 25, name: 'Sân Bay Đà Nẵng', type: 'airport', price: 200, rent: 25, color: 'airport' },
  { id: 26, name: 'Hải Phòng', type: 'property', price: 260, rent: 22, color: 'yellow' },
  { id: 27, name: 'Vinh', type: 'property', price: 260, rent: 22, color: 'yellow' },
  { id: 28, name: 'Nước', type: 'utility', price: 150, rent: 0, color: 'utility' },
  { id: 29, name: 'Thanh Hóa', type: 'property', price: 280, rent: 24, color: 'yellow' },
  { id: 30, name: 'Vào Tù', type: 'gotojail', price: 0, rent: 0, color: 'special' },
  { id: 31, name: 'Buôn Ma Thuột', type: 'property', price: 300, rent: 26, color: 'green' },
  { id: 32, name: 'Pleiku', type: 'property', price: 300, rent: 26, color: 'green' },
  { id: 33, name: 'Cơ Hội', type: 'chance', price: 0, rent: 0, color: 'special' },
  { id: 34, name: 'Kon Tum', type: 'property', price: 320, rent: 28, color: 'green' },
  { id: 35, name: 'Sân Bay Phú Quốc', type: 'airport', price: 200, rent: 25, color: 'airport' },
  { id: 36, name: 'Rủi Ro', type: 'risk', price: 0, rent: 0, color: 'special' },
  { id: 37, name: 'Bình Định', type: 'property', price: 350, rent: 35, color: 'blue' },
  { id: 38, name: 'Thuế Xa Xỉ', type: 'tax', price: 0, rent: 100, color: 'special' },
  { id: 39, name: 'Kiên Giang', type: 'property', price: 400, rent: 50, color: 'blue' }
];

// Chance and Risk cards
const CHANCE_CARDS = [
  { text: 'Nhận 200k từ ngân hàng', action: 'money', value: 200 },
  { text: 'Trả thuế 50k', action: 'money', value: -50 },
  { text: 'Về START và nhận 200k', action: 'move', value: 0 },
  { text: 'Tiến 3 ô', action: 'move', value: 3 },
  { text: 'Lùi 3 ô', action: 'move', value: -3 },
  { text: 'Nhận quà từ người chơi khác 100k', action: 'collect', value: 100 }
];

const RISK_CARDS = [
  { text: 'Mất 100k vì tai nạn', action: 'money', value: -100 },
  { text: 'Vào tù ngay lập tức', action: 'jail', value: 0 },
  { text: 'Trả phí sửa chữa 150k', action: 'money', value: -150 },
  { text: 'Nhận bảo hiểm 80k', action: 'money', value: 80 },
  { text: 'Di chuyển đến ô gần nhất', action: 'nearest', value: 0 }
];

// Get player name
async function getPlayerName(api, userId) {
  try {
    const info = await api.getUserInfo(userId);
    return info?.changed_profiles?.[userId]?.displayName || `Player${userId.slice(-4)}`;
  } catch {
    return `Player${userId.slice(-4)}`;
  }
}

// Format player list with money and position
function formatPlayerList(game) {
  return game.players.map((playerId, index) => {
    const player = game.playerData[playerId];
    const position = BOARD_PROPERTIES[player.position];
    const status = player.inJail ? ' 🔒' : player.bankrupt ? ' 💸' : '';
    return `${index + 1}. ${player.name} - $${player.money}k (${position.name})${status}`;
  }).join('\n');
}

// Roll dice
function rollDice() {
  return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
}

// Handle property landing
function handlePropertyLanding(game, playerId, propertyId) {
  const property = BOARD_PROPERTIES[propertyId];
  const player = game.playerData[playerId];
  
  if (game.propertyOwners[propertyId]) {
    // Property is owned, pay rent
    const ownerId = game.propertyOwners[propertyId];
    if (ownerId !== playerId) {
      const owner = game.playerData[ownerId];
      const rent = property.rent * (game.propertyHouses[propertyId] + 1);
      
      if (player.money >= rent) {
        player.money -= rent;
        owner.money += rent;
        return `💰 Trả tiền thuê ${rent}k cho ${owner.name}`;
      } else {
        player.bankrupt = true;
        return `💸 Phá sản! Không đủ tiền trả thuê ${rent}k`;
      }
    }
  } else {
    // Property available for purchase
    return `🏠 ${property.name} có thể mua với giá ${property.price}k\nGõ "monopoly buy" để mua`;
  }
  
  return '';
}

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const action = (args[0] || '').toLowerCase();
  
  // Initialize player stats
  if (!global.monopolyStats[senderId]) {
    global.monopolyStats[senderId] = {
      gamesPlayed: 0,
      gamesWon: 0,
      totalMoney: 0,
      propertiesBought: 0,
      bankruptcies: 0
    };
  }
  
  if (!action || action === 'help') {
    return api.sendMessage([
      '🏠 **CỜ TỶ PHÚ (MONOPOLY)**',
      '',
      '🎯 **CÁCH CHƠI:**',
      '• Lăn xúc xắc di chuyển quanh bàn cờ',
      '• Mua bất động sản và thu tiền thuê',
      '• Tránh phá sản, trở thành tỷ phú!',
      '',
      '📋 **LỆNH:**',
      '• monopoly start - Tạo phòng game (2-6 người)',
      '• monopoly join - Tham gia game',
      '• monopoly roll - Lăn xúc xắc',
      '• monopoly buy - Mua bất động sản',
      '• monopoly stats - Thống kê cá nhân',
      '',
      '💰 **BẮT ĐẦU:**',
      '• Mỗi người có $1500k',
      '• Qua START nhận $200k',
      '• Mua nhà để tăng tiền thuê',
      '',
      '🏆 **THẮNG:** Là người cuối cùng không phá sản!'
    ].join('\n'), threadId, type);
  }
  
  const gameKey = threadId;
  
  if (action === 'start') {
    if (global.monopolyGames.has(gameKey)) {
      const game = global.monopolyGames.get(gameKey);
      if (!game.ended) {
        return api.sendMessage('❌ Đã có game đang diễn ra trong nhóm này!', threadId, type);
      }
    }
    
    const playerName = await getPlayerName(api, senderId);
    
    const game = {
      host: senderId,
      players: [senderId],
      playerData: {
        [senderId]: {
          name: playerName,
          money: 1500,
          position: 0,
          properties: [],
          inJail: false,
          jailTurns: 0,
          bankrupt: false
        }
      },
      propertyOwners: {},
      propertyHouses: {},
      currentPlayer: 0,
      turn: 1,
      started: false,
      ended: false,
      lastActivity: Date.now()
    };
    
    global.monopolyGames.set(gameKey, game);
    
    return api.sendMessage([
      '🏠 **PHÒNG CỜ TỶ PHÚ ĐÃ TẠO!**',
      '',
      `👑 Host: ${playerName}`,
      `👥 Người chơi: 1/6`,
      `💰 Tiền khởi điểm: $1,500k`,
      '',
      '📋 **DANH SÁCH:**',
      `1. ${playerName} - $1,500k (START)`,
      '',
      '💡 **HƯỚNG DẪN:**',
      '• Gõ "monopoly join" để tham gia',
      '• Cần 2-6 người để bắt đầu',
      '• Host gõ "monopoly begin" khi đủ người'
    ].join('\n'), threadId, type);
  }
  
  const game = global.monopolyGames.get(gameKey);
  if (!game) {
    return api.sendMessage(
      '❌ Không có game nào đang diễn ra!\n\n' +
      '🎯 Gõ "monopoly start" để tạo phòng mới',
      threadId, type
    );
  }
  
  if (action === 'join') {
    if (game.started) {
      return api.sendMessage('❌ Game đã bắt đầu, không thể tham gia!', threadId, type);
    }
    
    if (game.players.includes(senderId)) {
      return api.sendMessage('❌ Bạn đã tham gia rồi!', threadId, type);
    }
    
    if (game.players.length >= 6) {
      return api.sendMessage('❌ Phòng đã đầy (6/6)!', threadId, type);
    }
    
    const playerName = await getPlayerName(api, senderId);
    game.players.push(senderId);
    game.playerData[senderId] = {
      name: playerName,
      money: 1500,
      position: 0,
      properties: [],
      inJail: false,
      jailTurns: 0,
      bankrupt: false
    };
    game.lastActivity = Date.now();
    
    return api.sendMessage([
      '✅ **ĐÃ THAM GIA THÀNH CÔNG!**',
      '',
      `👥 Người chơi: ${game.players.length}/6`,
      '',
      '📋 **DANH SÁCH:**',
      formatPlayerList(game),
      '',
      game.players.length >= 2 ? 
        '🎯 Host có thể gõ "monopoly begin" để bắt đầu!' :
        '💡 Cần thêm ít nhất 1 người nữa'
    ].join('\n'), threadId, type);
  }
  
  if (action === 'begin') {
    if (game.host !== senderId) {
      return api.sendMessage('❌ Chỉ host mới có thể bắt đầu game!', threadId, type);
    }
    
    if (game.started) {
      return api.sendMessage('❌ Game đã bắt đầu rồi!', threadId, type);
    }
    
    if (game.players.length < 2) {
      return api.sendMessage('❌ Cần ít nhất 2 người để chơi!', threadId, type);
    }
    
    game.started = true;
    game.lastActivity = Date.now();
    
    // Initialize property houses
    for (let i = 0; i < BOARD_PROPERTIES.length; i++) {
      game.propertyHouses[i] = 0;
    }
    
    const currentPlayerName = game.playerData[game.players[game.currentPlayer]].name;
    
    return api.sendMessage([
      '🎮 **GAME CỜ TỶ PHÚ BẮT ĐẦU!**',
      '',
      `👥 Người chơi: ${game.players.length}`,
      `🎯 Lượt của: ${currentPlayerName}`,
      '',
      '📋 **DANH SÁCH:**',
      formatPlayerList(game),
      '',
      '💡 **HƯỚNG DẪN:**',
      `• ${currentPlayerName} gõ "monopoly roll" để lăn xúc xắc`,
      '• Mua bất động sản khi dừng lại',
      '• Thu tiền thuê từ người khác',
      '',
      '🎲 Bắt đầu lăn xúc xắc!'
    ].join('\n'), threadId, type);
  }
  
  if (action === 'roll') {
    if (!game.started) {
      return api.sendMessage('❌ Game chưa bắt đầu!', threadId, type);
    }
    
    const currentPlayerId = game.players[game.currentPlayer];
    if (senderId !== currentPlayerId) {
      const currentPlayerName = game.playerData[currentPlayerId].name;
      return api.sendMessage(`❌ Không phải lượt của bạn! Lượt của ${currentPlayerName}`, threadId, type);
    }
    
    const player = game.playerData[senderId];
    if (player.bankrupt) {
      return api.sendMessage('❌ Bạn đã phá sản!', threadId, type);
    }
    
    // Handle jail
    if (player.inJail) {
      player.jailTurns++;
      if (player.jailTurns >= 3) {
        player.inJail = false;
        player.jailTurns = 0;
        return api.sendMessage('🔓 Bạn đã ra tù sau 3 lượt!', threadId, type);
      } else {
        return api.sendMessage(`🔒 Bạn còn ${3 - player.jailTurns} lượt trong tù`, threadId, type);
      }
    }
    
    const dice = rollDice();
    const total = dice[0] + dice[1];
    const oldPosition = player.position;
    player.position = (player.position + total) % 40;
    
    // Check if passed START
    let passedStart = '';
    if (player.position < oldPosition) {
      player.money += 200;
      passedStart = '\n🎯 Qua START, nhận $200k!';
    }
    
    const currentProperty = BOARD_PROPERTIES[player.position];
    let actionResult = '';
    
    // Handle different property types
    switch (currentProperty.type) {
      case 'property':
      case 'airport':
      case 'utility':
        actionResult = handlePropertyLanding(game, senderId, player.position);
        break;
      case 'chance':
        const chanceCard = CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)];
        actionResult = `🎴 Cơ Hội: ${chanceCard.text}`;
        if (chanceCard.action === 'money') {
          player.money += chanceCard.value;
        }
        break;
      case 'risk':
        const riskCard = RISK_CARDS[Math.floor(Math.random() * RISK_CARDS.length)];
        actionResult = `⚠️ Rủi Ro: ${riskCard.text}`;
        if (riskCard.action === 'money') {
          player.money += riskCard.value;
        } else if (riskCard.action === 'jail') {
          player.inJail = true;
          player.position = 10;
        }
        break;
      case 'tax':
        player.money -= currentProperty.rent;
        actionResult = `💸 Trả thuế ${currentProperty.rent}k`;
        break;
      case 'gotojail':
        player.inJail = true;
        player.position = 10;
        actionResult = '🔒 Vào tù!';
        break;
    }
    
    // Check bankruptcy
    if (player.money < 0) {
      player.bankrupt = true;
      actionResult += '\n💸 Phá sản!';
    }
    
    // Next player turn
    do {
      game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
    } while (game.playerData[game.players[game.currentPlayer]].bankrupt);
    
    game.turn++;
    game.lastActivity = Date.now();
    
    // Check win condition
    const activePlayers = game.players.filter(p => !game.playerData[p].bankrupt);
    if (activePlayers.length === 1) {
      const winner = game.playerData[activePlayers[0]];
      game.ended = true;
      
      // Update stats
      for (const playerId of game.players) {
        const stats = global.monopolyStats[playerId];
        stats.gamesPlayed++;
        stats.totalMoney += game.playerData[playerId].money;
        stats.propertiesBought += game.playerData[playerId].properties.length;
        if (game.playerData[playerId].bankrupt) stats.bankruptcies++;
        if (playerId === activePlayers[0]) stats.gamesWon++;
      }
      
      return api.sendMessage([
        '🎉 **GAME KẾT THÚC!**',
        '',
        `🏆 **NGƯỜI THẮNG: ${winner.name}**`,
        `💰 Tài sản: $${winner.money}k`,
        `🏠 Bất động sản: ${winner.properties.length}`,
        '',
        '📊 **BẢNG XẾP HẠNG:**',
        game.players
          .sort((a, b) => game.playerData[b].money - game.playerData[a].money)
          .map((p, i) => {
            const player = game.playerData[p];
            const status = player.bankrupt ? ' 💸' : '';
            return `${i + 1}. ${player.name} - $${player.money}k${status}`;
          }).join('\n'),
        '',
        '🎯 Gõ "monopoly start" để chơi lại!'
      ].join('\n'), threadId, type);
    }
    
    const nextPlayerName = game.playerData[game.players[game.currentPlayer]].name;
    
    return api.sendMessage([
      `🎲 **${player.name} lăn được: ${dice[0]} + ${dice[1]} = ${total}**`,
      '',
      `📍 Đến: ${currentProperty.name}`,
      actionResult,
      passedStart,
      '',
      `💰 Tiền hiện tại: $${player.money}k`,
      `🎯 Lượt tiếp: ${nextPlayerName}`,
      '',
      '💡 Gõ "monopoly roll" để tiếp tục'
    ].join('\n'), threadId, type);
  }
  
  if (action === 'buy') {
    if (!game.started) {
      return api.sendMessage('❌ Game chưa bắt đầu!', threadId, type);
    }
    
    const player = game.playerData[senderId];
    if (!player) {
      return api.sendMessage('❌ Bạn không tham gia game này!', threadId, type);
    }
    
    if (player.bankrupt) {
      return api.sendMessage('❌ Bạn đã phá sản!', threadId, type);
    }
    
    const property = BOARD_PROPERTIES[player.position];
    
    if (!['property', 'airport', 'utility'].includes(property.type)) {
      return api.sendMessage('❌ Không thể mua ở vị trí này!', threadId, type);
    }
    
    if (game.propertyOwners[player.position]) {
      return api.sendMessage('❌ Bất động sản này đã có chủ!', threadId, type);
    }
    
    if (player.money < property.price) {
      return api.sendMessage(`❌ Không đủ tiền! Cần $${property.price}k, bạn có $${player.money}k`, threadId, type);
    }
    
    // Buy property
    player.money -= property.price;
    player.properties.push(player.position);
    game.propertyOwners[player.position] = senderId;
    
    return api.sendMessage([
      '🏠 **MUA THÀNH CÔNG!**',
      '',
      `📍 Bất động sản: ${property.name}`,
      `💰 Giá: $${property.price}k`,
      `💵 Tiền thuê: $${property.rent}k`,
      `💳 Tiền còn lại: $${player.money}k`,
      '',
      '🎯 Bây giờ bạn sẽ thu tiền thuê từ người khác!'
    ].join('\n'), threadId, type);
  }
  
  if (action === 'stats') {
    const stats = global.monopolyStats[senderId];
    const winRate = stats.gamesPlayed > 0 ? (stats.gamesWon / stats.gamesPlayed * 100).toFixed(1) : 0;
    const avgMoney = stats.gamesPlayed > 0 ? Math.floor(stats.totalMoney / stats.gamesPlayed) : 0;
    
    return api.sendMessage([
      '📊 **MONOPOLY STATS**',
      '',
      `🎮 Games: ${stats.gamesPlayed} | Thắng: ${stats.gamesWon}`,
      `🏆 Tỉ lệ thắng: ${winRate}%`,
      `💰 Tiền TB: $${avgMoney}k`,
      `🏠 Tổng BĐS mua: ${stats.propertiesBought}`,
      `💸 Số lần phá sản: ${stats.bankruptcies}`,
      '',
      '🎯 Trở thành tỷ phú thực thụ!'
    ].join('\n'), threadId, type);
  }
  
  // Show current game status
  if (!game.started) {
    return api.sendMessage([
      '⏳ **ĐANG CHỜ NGƯỜI CHƠI**',
      '',
      `👥 Người chơi: ${game.players.length}/6`,
      '',
      '📋 **DANH SÁCH:**',
      formatPlayerList(game),
      '',
      game.players.length >= 2 ? 
        '🎯 Host gõ "monopoly begin" để bắt đầu!' :
        '💡 Cần thêm ít nhất 1 người',
      '',
      '💡 Gõ "monopoly join" để tham gia'
    ].join('\n'), threadId, type);
  }
  
  const currentPlayerName = game.playerData[game.players[game.currentPlayer]].name;
  
  return api.sendMessage([
    '🏠 **CỜ TỶ PHÚ ĐANG DIỄN RA**',
    '',
    `🎯 Lượt: ${game.turn} | Người chơi: ${currentPlayerName}`,
    '',
    '📋 **DANH SÁCH:**',
    formatPlayerList(game),
    '',
    '💡 **LỆNH:**',
    '• monopoly roll - Lăn xúc xắc',
    '• monopoly buy - Mua bất động sản',
    '• monopoly stats - Xem thống kê'
  ].join('\n'), threadId, type);
};
