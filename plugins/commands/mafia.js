module.exports.config = {
  name: "mafia",
  aliases: ['masoi', 'werewolf'],
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Bonz Games",
  description: "Game Ma Sói multiplayer với voting system",
  commandCategory: "Game",
  usages: "[start/join/vote/stats] <target>",
  cooldowns: 5
};

// Initialize game storage
if (!global.mafiaGames) global.mafiaGames = new Map();
if (!global.mafiaStats) global.mafiaStats = {};

// Game roles and settings
const ROLES = {
  VILLAGER: { name: '🏘️ Dân Làng', team: 'village', description: 'Tìm và loại bỏ Ma Sói' },
  MAFIA: { name: '🐺 Ma Sói', team: 'mafia', description: 'Tiêu diệt tất cả Dân Làng' },
  DETECTIVE: { name: '🕵️ Thám Tử', team: 'village', description: 'Điều tra vai trò người khác' },
  DOCTOR: { name: '👨‍⚕️ Bác Sĩ', team: 'village', description: 'Cứu 1 người mỗi đêm' }
};

const GAME_PHASES = {
  WAITING: 'waiting',
  DAY: 'day',
  NIGHT: 'night',
  VOTING: 'voting',
  ENDED: 'ended'
};

// Role distribution based on player count
function getRoleDistribution(playerCount) {
  if (playerCount < 4) return null;
  
  const distributions = {
    4: { MAFIA: 1, VILLAGER: 2, DETECTIVE: 1 },
    5: { MAFIA: 1, VILLAGER: 3, DETECTIVE: 1 },
    6: { MAFIA: 2, VILLAGER: 3, DETECTIVE: 1 },
    7: { MAFIA: 2, VILLAGER: 3, DETECTIVE: 1, DOCTOR: 1 },
    8: { MAFIA: 2, VILLAGER: 4, DETECTIVE: 1, DOCTOR: 1 }
  };
  
  return distributions[Math.min(playerCount, 8)] || distributions[8];
}

// Assign roles to players
function assignRoles(players) {
  const distribution = getRoleDistribution(players.length);
  if (!distribution) return null;
  
  const roles = [];
  for (const [role, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i++) {
      roles.push(role);
    }
  }
  
  // Shuffle roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  
  // Assign to players
  const assignments = {};
  for (let i = 0; i < players.length; i++) {
    assignments[players[i]] = roles[i];
  }
  
  return assignments;
}

// Get player name
async function getPlayerName(api, userId) {
  try {
    const info = await api.getUserInfo(userId);
    return info?.changed_profiles?.[userId]?.displayName || `Player${userId.slice(-4)}`;
  } catch {
    return `Player${userId.slice(-4)}`;
  }
}

// Format player list
function formatPlayerList(players, playerNames, showRoles = false, roleAssignments = null) {
  return players.map((playerId, index) => {
    const name = playerNames[playerId] || `Player${playerId.slice(-4)}`;
    const role = showRoles && roleAssignments ? ` (${ROLES[roleAssignments[playerId]].name})` : '';
    return `${index + 1}. ${name}${role}`;
  }).join('\n');
}

// Check win conditions
function checkWinCondition(game) {
  const alivePlayers = game.players.filter(p => game.playerStates[p].alive);
  const aliveMafia = alivePlayers.filter(p => ROLES[game.roleAssignments[p]].team === 'mafia');
  const aliveVillage = alivePlayers.filter(p => ROLES[game.roleAssignments[p]].team === 'village');
  
  if (aliveMafia.length === 0) {
    return { winner: 'village', message: '🏘️ **DÂN LÀNG THẮNG!** Đã tiêu diệt hết Ma Sói!' };
  }
  
  if (aliveMafia.length >= aliveVillage.length) {
    return { winner: 'mafia', message: '🐺 **MA SÓI THẮNG!** Đã chiếm đa số!' };
  }
  
  return null;
}

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const action = (args[0] || '').toLowerCase();
  
  // Initialize player stats
  if (!global.mafiaStats[senderId]) {
    global.mafiaStats[senderId] = {
      gamesPlayed: 0,
      gamesWon: 0,
      villageWins: 0,
      mafiaWins: 0,
      rolesPlayed: {},
      totalSurvivalTime: 0
    };
  }
  
  if (!action || action === 'help') {
    return api.sendMessage([
      '🐺 **GAME MA SÓI (MAFIA)**',
      '',
      '🎯 **CÁCH CHƠI:**',
      '• Dân Làng: Tìm và vote loại Ma Sói',
      '• Ma Sói: Giết dân làng vào ban đêm',
      '• Thám Tử: Điều tra vai trò người khác',
      '• Bác Sĩ: Cứu 1 người mỗi đêm',
      '',
      '📋 **LỆNH:**',
      '• mafia start - Tạo phòng game (4-8 người)',
      '• mafia join - Tham gia game',
      '• mafia vote <số> - Vote loại người chơi',
      '• mafia stats - Thống kê cá nhân',
      '',
      '🏆 **ĐIỀU KIỆN THẮNG:**',
      '• Dân Làng: Loại hết Ma Sói',
      '• Ma Sói: Bằng hoặc nhiều hơn Dân Làng',
      '',
      '💡 Cần ít nhất 4 người để bắt đầu!'
    ].join('\n'), threadId, type);
  }
  
  const gameKey = threadId;
  
  if (action === 'start') {
    if (global.mafiaGames.has(gameKey)) {
      const game = global.mafiaGames.get(gameKey);
      if (game.phase !== GAME_PHASES.ENDED) {
        return api.sendMessage('❌ Đã có game đang diễn ra trong nhóm này!', threadId, type);
      }
    }
    
    const playerName = await getPlayerName(api, senderId);
    
    const game = {
      host: senderId,
      players: [senderId],
      playerNames: { [senderId]: playerName },
      phase: GAME_PHASES.WAITING,
      day: 0,
      roleAssignments: {},
      playerStates: {},
      votes: {},
      nightActions: {},
      lastActivity: Date.now(),
      startTime: null
    };
    
    global.mafiaGames.set(gameKey, game);
    
    return api.sendMessage([
      '🐺 **PHÒNG MA SÓI ĐÃ TẠO!**',
      '',
      `👑 Host: ${playerName}`,
      `👥 Người chơi: 1/8`,
      '',
      '📋 **DANH SÁCH:**',
      `1. ${playerName}`,
      '',
      '💡 **HƯỚNG DẪN:**',
      '• Gõ "mafia join" để tham gia',
      '• Cần 4-8 người để bắt đầu',
      '• Host gõ "mafia begin" khi đủ người'
    ].join('\n'), threadId, type);
  }
  
  const game = global.mafiaGames.get(gameKey);
  if (!game) {
    return api.sendMessage(
      '❌ Không có game nào đang diễn ra!\n\n' +
      '🎯 Gõ "mafia start" để tạo phòng mới',
      threadId, type
    );
  }
  
  if (action === 'join') {
    if (game.phase !== GAME_PHASES.WAITING) {
      return api.sendMessage('❌ Game đã bắt đầu, không thể tham gia!', threadId, type);
    }
    
    if (game.players.includes(senderId)) {
      return api.sendMessage('❌ Bạn đã tham gia rồi!', threadId, type);
    }
    
    if (game.players.length >= 8) {
      return api.sendMessage('❌ Phòng đã đầy (8/8)!', threadId, type);
    }
    
    const playerName = await getPlayerName(api, senderId);
    game.players.push(senderId);
    game.playerNames[senderId] = playerName;
    game.lastActivity = Date.now();
    
    return api.sendMessage([
      '✅ **ĐÃ THAM GIA THÀNH CÔNG!**',
      '',
      `👥 Người chơi: ${game.players.length}/8`,
      '',
      '📋 **DANH SÁCH:**',
      formatPlayerList(game.players, game.playerNames),
      '',
      game.players.length >= 4 ? 
        '🎯 Host có thể gõ "mafia begin" để bắt đầu!' :
        `💡 Cần thêm ${4 - game.players.length} người nữa`
    ].join('\n'), threadId, type);
  }
  
  if (action === 'stats') {
    const stats = global.mafiaStats[senderId];
    const winRate = stats.gamesPlayed > 0 ? (stats.gamesWon / stats.gamesPlayed * 100).toFixed(1) : 0;
    
    return api.sendMessage([
      '📊 **MAFIA STATS**',
      '',
      `🎮 Games: ${stats.gamesPlayed} | Thắng: ${stats.gamesWon}`,
      `🏆 Tỉ lệ thắng: ${winRate}%`,
      '',
      '🏘️ **THÀNH TÍCH:**',
      `• Dân Làng thắng: ${stats.villageWins}`,
      `• Ma Sói thắng: ${stats.mafiaWins}`,
      '',
      '🎯 Tham gia thêm game để cải thiện stats!'
    ].join('\n'), threadId, type);
  }
  
  return api.sendMessage('❓ Lệnh không hợp lệ! Gõ "mafia help" để xem hướng dẫn.', threadId, type);
};
