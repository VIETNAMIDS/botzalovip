const fs = require('fs');
const path = require('path');

// Lưu trữ dữ liệu leaderboard
const leaderboardData = new Map();

module.exports.config = {
  name: "leaderboard",
  aliases: ['rank', 'top', 'bxh'],
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zeid Bot",
  description: "Xem bảng xếp hạng các game",
  commandCategory: "Game",
  usages: "[caro/fishing/all]",
  cooldowns: 3
};

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  let userName = 'Người chơi';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người chơi';
  } catch {}

  const gameType = (args[0] || 'all').toLowerCase();

  // Khởi tạo dữ liệu nếu chưa có
  if (!global.gameLeaderboard) {
    global.gameLeaderboard = {
      caro: new Map(),
      fishing: new Map(),
      taixiu: {},
      blackjack: {},
      poker: {},
      roulette: {},
      baccarat: {},
      baucua: {}
    };
  }
  
  // Đảm bảo caro được khởi tạo đúng
  if (!global.gameLeaderboard.caro) {
    global.gameLeaderboard.caro = new Map();
  }

  // Hướng dẫn sử dụng
  if (gameType === 'help') {
    const helpMsg = [
      '🏆 BẢNG XẾP HẠNG GAME',
      '',
      '📋 LỆNH:',
      '• leaderboard - Xem tất cả BXH',
      '• leaderboard caro - BXH Cờ Caro',
      '• leaderboard fishing - BXH Câu Cá',
      '• leaderboard taixiu - BXH Tài Xỉu',
      '• leaderboard blackjack - BXH Blackjack',
      '• leaderboard poker - BXH Poker',
      '• leaderboard roulette - BXH Roulette',
      '• leaderboard baccarat - BXH Baccarat',
      '• leaderboard baucua - BXH Bầu Cua',
      '• leaderboard all - Tất cả game',
      '',
      '🎮 GAME HỖ TRỢ:',
      '• 🎯 Cờ Caro - Thắng/Thua/Hòa',
      '• 🎣 Câu Cá - Level/EXP/Coins',
      '• 🎲 Tài Xỉu - Thắng/Thua/Jackpot',
      '• 🃏 Blackjack - Win Rate/Profit',
      '• 🎰 Poker - Hands/Best Hand',
      '• 🎡 Roulette - Spins/Hot Numbers',
      '• 💳 Baccarat - Player/Banker/Tie',
      '• 🎲 Bầu Cua - Win Rate/Streak',
      '',
      '🏅 THỐNG KÊ:',
      '• Top 10 người chơi xuất sắc',
      '• Điểm số chi tiết',
      '• Thành tích cá nhân'
    ].join('\n');
    
    return api.sendMessage(helpMsg, threadId, type);
  }

  // Xem BXH Tài Xỉu
  if (gameType === 'taixiu') {
    return module.exports.showLeaderboard(api, threadId, type, 'taixiu');
  }

  // Xem BXH Blackjack
  if (gameType === 'blackjack') {
    return module.exports.showLeaderboard(api, threadId, type, 'blackjack');
  }

  // Xem BXH Poker
  if (gameType === 'poker') {
    return module.exports.showLeaderboard(api, threadId, type, 'poker');
  }

  // Xem BXH Roulette
  if (gameType === 'roulette') {
    return module.exports.showLeaderboard(api, threadId, type, 'roulette');
  }

  // Xem BXH Baccarat
  if (gameType === 'baccarat') {
    return module.exports.showLeaderboard(api, threadId, type, 'baccarat');
  }

  // Xem BXH Bầu Cua
  if (gameType === 'baucua') {
    return module.exports.showLeaderboard(api, threadId, type, 'baucua');
  }

  // Xem BXH Cờ Caro
  if (gameType === 'caro') {
    const caroStats = global.gameLeaderboard.caro;
    const sortedPlayers = Array.from(caroStats.entries())
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        winRate: stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : 0,
        score: stats.wins * 3 + stats.draws * 1 - stats.losses * 0.5
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (sortedPlayers.length === 0) {
      return api.sendMessage('🎯 Chưa có dữ liệu BXH Cờ Caro!\nHãy chơi game để xuất hiện trong bảng xếp hạng.', threadId, type);
    }

    let caroMsg = [
      '🏆 BẢNG XẾP HẠNG CỜ CARO',
      '',
      '🎯 TOP 10 CAO THỦ:'
    ];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
      
      // Lấy tên người chơi
      let playerName = 'Người chơi';
      try {
        const info = await api.getUserInfo(player.userId);
        playerName = info?.changed_profiles?.[player.userId]?.displayName || 'Người chơi';
      } catch {}

      caroMsg.push(`${medal} ${playerName}`);
      caroMsg.push(`   📊 ${player.wins}W-${player.losses}L-${player.draws}D`);
      caroMsg.push(`   🎯 Tỉ lệ thắng: ${player.winRate}%`);
      caroMsg.push(`   ⭐ Điểm: ${player.score.toFixed(1)}`);
      caroMsg.push('');
    }

    // Thêm thống kê cá nhân
    const personalStats = caroStats.get(senderId);
    if (personalStats) {
      const personalRank = sortedPlayers.findIndex(p => p.userId === senderId) + 1;
      caroMsg.push('👤 THÀNH TÍCH CỦA BẠN:');
      caroMsg.push(`🏅 Hạng: ${personalRank > 0 ? `#${personalRank}` : 'Ngoài Top 10'}`);
      caroMsg.push(`📊 ${personalStats.wins}W-${personalStats.losses}L-${personalStats.draws}D`);
      caroMsg.push(`🎯 Tỉ lệ thắng: ${personalStats.totalGames > 0 ? Math.round((personalStats.wins / personalStats.totalGames) * 100) : 0}%`);
    }

    return api.sendMessage(caroMsg.join('\n'), threadId, type);
  }

  // Xem BXH Câu Cá
  if (gameType === 'fishing' || gameType === 'fish') {
    const fishingStats = global.gameLeaderboard.fishing;
    const sortedPlayers = Array.from(fishingStats.entries())
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        score: stats.level * 1000 + stats.exp + stats.coins * 0.1 + stats.legendary * 500 + stats.rare * 100
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (sortedPlayers.length === 0) {
      return api.sendMessage('🎣 Chưa có dữ liệu BXH Câu Cá!\nHãy chơi game để xuất hiện trong bảng xếp hạng.', threadId, type);
    }

    let fishingMsg = [
      '🏆 BẢNG XẾP HẠNG CÂU CÁ',
      '',
      '🎣 TOP 10 NGƯ DÂN:'
    ];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
      
      // Lấy tên người chơi
      let playerName = 'Ngư dân';
      try {
        const info = await api.getUserInfo(player.userId);
        playerName = info?.changed_profiles?.[player.userId]?.displayName || 'Ngư dân';
      } catch {}

      fishingMsg.push(`${medal} ${playerName}`);
      fishingMsg.push(`   🎯 Level: ${player.level} | EXP: ${player.exp}`);
      fishingMsg.push(`   💰 Coins: ${player.coins.toLocaleString()}`);
      fishingMsg.push(`   🐉 Huyền thoại: ${player.legendary} | 🍣 Hiếm: ${player.rare}`);
      fishingMsg.push(`   ⭐ Điểm: ${Math.round(player.score)}`);
      fishingMsg.push('');
    }

    // Thêm thống kê cá nhân
    const personalStats = fishingStats.get(senderId);
    if (personalStats) {
      const personalRank = sortedPlayers.findIndex(p => p.userId === senderId) + 1;
      fishingMsg.push('👤 THÀNH TÍCH CỦA BẠN:');
      fishingMsg.push(`🏅 Hạng: ${personalRank > 0 ? `#${personalRank}` : 'Ngoài Top 10'}`);
      fishingMsg.push(`🎯 Level: ${personalStats.level} | EXP: ${personalStats.exp}`);
      fishingMsg.push(`💰 Coins: ${personalStats.coins.toLocaleString()}`);
      fishingMsg.push(`🐉 Huyền thoại: ${personalStats.legendary} | 🍣 Hiếm: ${personalStats.rare}`);
    }

    return api.sendMessage(fishingMsg.join('\n'), threadId, type);
  }

  // Xem tất cả BXH
  if (gameType === 'all' || !gameType) {
    const caroCount = global.gameLeaderboard.caro.size;
    const fishingCount = global.gameLeaderboard.fishing.size;
    
    let allMsg = [
      '🏆 TỔNG QUAN BẢNG XẾP HẠNG',
      '',
      '🎮 CÁC GAME CÓ BXH:',
      '',
      `🎯 CỜ CARO`,
      `   👥 Người chơi: ${caroCount}`,
      `   📋 Xem chi tiết: leaderboard caro`,
      '',
      `🎣 CÂU CÁ`,
      `   👥 Người chơi: ${fishingCount}`,
      `   📋 Xem chi tiết: leaderboard fishing`,
      '',
      '💡 HƯỚNG DẪN:',
      '• leaderboard caro - BXH Cờ Caro',
      '• leaderboard fishing - BXH Câu Cá',
      '• Chơi game để lên BXH!'
    ];

    // Thêm top 3 tổng hợp nếu có dữ liệu
    if (caroCount > 0 || fishingCount > 0) {
      allMsg.push('');
      allMsg.push('🌟 TOP GAME THỦ TỔNG HỢP:');
      
      // Tính điểm tổng hợp
      const allPlayers = new Map();
      
      // Thêm điểm từ Caro
      for (const [userId, stats] of global.gameLeaderboard.caro.entries()) {
        const score = stats.wins * 3 + stats.draws * 1;
        allPlayers.set(userId, (allPlayers.get(userId) || 0) + score);
      }
      
      // Thêm điểm từ Fishing
      for (const [userId, stats] of global.gameLeaderboard.fishing.entries()) {
        const score = stats.level * 10 + Math.floor(stats.exp / 100);
        allPlayers.set(userId, (allPlayers.get(userId) || 0) + score);
      }
      
      const topPlayers = Array.from(allPlayers.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      for (let i = 0; i < topPlayers.length; i++) {
        const [userId, score] = topPlayers[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        
        let playerName = 'Game thủ';
        try {
          const info = await api.getUserInfo(userId);
          playerName = info?.changed_profiles?.[userId]?.displayName || 'Game thủ';
        } catch {}
        
        allMsg.push(`${medal} ${playerName} - ${score} điểm`);
      }
    }

    return api.sendMessage(allMsg.join('\n'), threadId, type);
  }

  // Lệnh không hợp lệ
  return api.sendMessage('❌ Game không hợp lệ! Gõ "leaderboard help" để xem hướng dẫn.', threadId, type);
};

// Hàm cập nhật BXH Caro
module.exports.updateCaroStats = function(userId, result) {
  if (!global.gameLeaderboard) {
    global.gameLeaderboard = {
      caro: new Map(),
      fishing: new Map(),
      taixiu: {},
      blackjack: {},
      poker: {},
      roulette: {},
      baccarat: {}
    };
  }
  
  // Đảm bảo caro được khởi tạo đúng
  if (!global.gameLeaderboard.caro) {
    global.gameLeaderboard.caro = new Map();
  }

  const stats = global.gameLeaderboard.caro.get(userId) || {
    wins: 0,
    losses: 0,
    draws: 0,
    totalGames: 0
  };

  stats.totalGames++;
  if (result === 'win') {
    stats.wins++;
  } else if (result === 'loss') {
    stats.losses++;
  } else if (result === 'draw') {
    stats.draws++;
  }

  global.gameLeaderboard.caro.set(userId, stats);
};

// Hàm cập nhật BXH Fishing
module.exports.updateFishingStats = function(userId, playerData) {
  if (!global.gameLeaderboard) {
    global.gameLeaderboard = {
      caro: new Map(),
      fishing: new Map(),
      taixiu: {},
      blackjack: {},
      poker: {},
      roulette: {},
      baccarat: {}
    };
  }
  
  // Đảm bảo fishing được khởi tạo đúng
  if (!global.gameLeaderboard.fishing) {
    global.gameLeaderboard.fishing = new Map();
  }

  const stats = {
    level: playerData.level,
    exp: playerData.exp,
    coins: playerData.coins,
    totalCatch: playerData.totalCatch,
    common: playerData.stats.common,
    rare: playerData.stats.rare,
    legendary: playerData.stats.legendary,
    trash: playerData.stats.trash
  };

  global.gameLeaderboard.fishing.set(userId, stats);
};

// Thêm xử lý casino games leaderboard
module.exports.showLeaderboard = async function(api, threadId, type, gameType) {
  if (gameType === 'taixiu') {
    const taixiuStats = global.gameLeaderboard.taixiu || {};
    const sortedPlayers = Object.entries(taixiuStats)
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        winRate: stats.wins + stats.losses > 0 ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) : '0.0',
        profit: stats.totalWin - stats.totalBet,
        score: stats.wins * 2 + stats.jackpots * 10 - stats.losses * 0.5
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (sortedPlayers.length === 0) {
      return api.sendMessage('🎲 Chưa có dữ liệu BXH Tài Xỉu!\nHãy chơi game để xuất hiện trong bảng xếp hạng.', threadId, type);
    }

    let taixiuMsg = [
      '🏆 BẢNG XẾP HẠNG TÀI XỈU',
      '',
      '🎲 TOP 10 CAO THỦ:'
    ];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
      
      let playerName = 'Người chơi';
      try {
        const info = await api.getUserInfo(player.userId);
        playerName = info?.changed_profiles?.[player.userId]?.displayName || 'Người chơi';
      } catch {}

      taixiuMsg.push(`${medal} ${playerName}`);
      taixiuMsg.push(`   📊 ${player.wins}W-${player.losses}L (${player.winRate}%)`);
      taixiuMsg.push(`   💰 Lợi nhuận: ${player.profit >= 0 ? '+' : ''}${player.profit.toLocaleString()}`);
      taixiuMsg.push(`   🎰 Jackpots: ${player.jackpots} | 🔥 Max Streak: ${player.maxStreak}`);
      taixiuMsg.push('');
    }

    taixiuMsg.push('🎯 Gõ "taixiu stats" để xem thống kê cá nhân!');
    return api.sendMessage(taixiuMsg.join('\n'), threadId, type);
  }

  // Blackjack leaderboard
  if (gameType === 'blackjack') {
    const blackjackStats = global.gameLeaderboard.blackjack || {};
    const sortedPlayers = Object.entries(blackjackStats)
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        totalGames: stats.wins + stats.losses + stats.pushes,
        winRate: stats.wins + stats.losses + stats.pushes > 0 ? ((stats.wins / (stats.wins + stats.losses + stats.pushes)) * 100).toFixed(1) : '0.0',
        profit: stats.totalWin - stats.totalBet,
        score: stats.wins * 2 + stats.blackjacks * 5 - stats.losses * 0.5
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (sortedPlayers.length === 0) {
      return api.sendMessage('🃏 Chưa có dữ liệu BXH Blackjack!\nHãy chơi game để xuất hiện trong bảng xếp hạng.', threadId, type);
    }

    let blackjackMsg = [
      '🏆 BẢNG XẾP HẠNG BLACKJACK',
      '',
      '🃏 TOP 10 CAO THỦ:'
    ];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
      
      let playerName = 'Người chơi';
      try {
        const info = await api.getUserInfo(player.userId);
        playerName = info?.changed_profiles?.[player.userId]?.displayName || 'Người chơi';
      } catch {}

      blackjackMsg.push(`${medal} ${playerName}`);
      blackjackMsg.push(`   📊 ${player.wins}W-${player.losses}L-${player.pushes}P (${player.winRate}%)`);
      blackjackMsg.push(`   💰 Lợi nhuận: ${player.profit >= 0 ? '+' : ''}${player.profit.toLocaleString()}`);
      blackjackMsg.push(`   🃏 Blackjacks: ${player.blackjacks}`);
      blackjackMsg.push('');
    }

    blackjackMsg.push('🎯 Gõ "blackjack stats" để xem thống kê cá nhân!');
    return api.sendMessage(blackjackMsg.join('\n'), threadId, type);
  }

  // Roulette leaderboard
  if (gameType === 'roulette') {
    const rouletteStats = global.gameLeaderboard.roulette || {};
    const sortedPlayers = Object.entries(rouletteStats)
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        winRate: stats.spins > 0 ? ((stats.wins / stats.spins) * 100).toFixed(1) : '0.0',
        profit: stats.totalWin - stats.totalBet,
        score: stats.wins * 2 + (stats.biggestWin / 1000) - stats.losses * 0.5
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (sortedPlayers.length === 0) {
      return api.sendMessage('🎡 Chưa có dữ liệu BXH Roulette!\nHãy chơi game để xuất hiện trong bảng xếp hạng.', threadId, type);
    }

    let rouletteMsg = [
      '🏆 BẢNG XẾP HẠNG ROULETTE',
      '',
      '🎡 TOP 10 CAO THỦ:'
    ];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
      
      let playerName = 'Người chơi';
      try {
        const info = await api.getUserInfo(player.userId);
        playerName = info?.changed_profiles?.[player.userId]?.displayName || 'Người chơi';
      } catch {}

      rouletteMsg.push(`${medal} ${playerName}`);
      rouletteMsg.push(`   📊 ${player.wins}W-${player.losses}L (${player.winRate}%)`);
      rouletteMsg.push(`   💰 Lợi nhuận: ${player.profit >= 0 ? '+' : ''}${player.profit.toLocaleString()}`);
      rouletteMsg.push(`   🎰 Biggest win: ${player.biggestWin.toLocaleString()}`);
      rouletteMsg.push('');
    }

    rouletteMsg.push('🎯 Gõ "roulette stats" để xem thống kê cá nhân!');
    return api.sendMessage(rouletteMsg.join('\n'), threadId, type);
  }

  // Baccarat leaderboard
  if (gameType === 'baccarat') {
    const baccaratStats = global.gameLeaderboard.baccarat || {};
    const sortedPlayers = Object.entries(baccaratStats)
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        totalGames: stats.wins + stats.losses + stats.ties,
        winRate: stats.wins + stats.losses + stats.ties > 0 ? ((stats.wins / (stats.wins + stats.losses + stats.ties)) * 100).toFixed(1) : '0.0',
        profit: stats.totalWin - stats.totalBet,
        score: stats.wins * 2 + stats.naturals * 3 - stats.losses * 0.5
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (sortedPlayers.length === 0) {
      return api.sendMessage('💳 Chưa có dữ liệu BXH Baccarat!\nHãy chơi game để xuất hiện trong bảng xếp hạng.', threadId, type);
    }

    let baccaratMsg = [
      '🏆 BẢNG XẾP HẠNG BACCARAT',
      '',
      '💳 TOP 10 CAO THỦ:'
    ];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
      
      let playerName = 'Người chơi';
      try {
        const info = await api.getUserInfo(player.userId);
        playerName = info?.changed_profiles?.[player.userId]?.displayName || 'Người chơi';
      } catch {}

      baccaratMsg.push(`${medal} ${playerName}`);
      baccaratMsg.push(`   📊 ${player.wins}W-${player.losses}L-${player.ties}T (${player.winRate}%)`);
      baccaratMsg.push(`   💰 Lợi nhuận: ${player.profit >= 0 ? '+' : ''}${player.profit.toLocaleString()}`);
      baccaratMsg.push(`   ✨ Naturals: ${player.naturals}`);
      baccaratMsg.push('');
    }

    baccaratMsg.push('🎯 Gõ "baccarat stats" để xem thống kê cá nhân!');
    return api.sendMessage(baccaratMsg.join('\n'), threadId, type);
  }

  // Poker leaderboard
  if (gameType === 'poker') {
    const pokerStats = global.gameLeaderboard.poker || {};
    const sortedPlayers = Object.entries(pokerStats)
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        winRate: stats.handsPlayed > 0 ? ((stats.wins / stats.handsPlayed) * 100).toFixed(1) : '0.0',
        profit: stats.totalWin - stats.totalBet,
        score: stats.wins * 3 + (stats.totalWin / 10000) - stats.losses * 0.5
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (sortedPlayers.length === 0) {
      return api.sendMessage('🎰 Chưa có dữ liệu BXH Poker!\nHãy chơi game để xuất hiện trong bảng xếp hạng.', threadId, type);
    }

    let pokerMsg = [
      '🏆 BẢNG XẾP HẠNG POKER',
      '',
      '🎰 TOP 10 CAO THỦ:'
    ];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
      
      let playerName = 'Người chơi';
      try {
        const info = await api.getUserInfo(player.userId);
        playerName = info?.changed_profiles?.[player.userId]?.displayName || 'Người chơi';
      } catch {}

      pokerMsg.push(`${medal} ${playerName}`);
      pokerMsg.push(`   📊 ${player.wins}W-${player.losses}L (${player.winRate}%)`);
      pokerMsg.push(`   💰 Lợi nhuận: ${player.profit >= 0 ? '+' : ''}${player.profit.toLocaleString()}`);
      pokerMsg.push(`   🃏 Best hand: ${player.bestHand || 'High Card'}`);
      pokerMsg.push('');
    }

    pokerMsg.push('🎯 Gõ "poker stats" để xem thống kê cá nhân!');
    return api.sendMessage(pokerMsg.join('\n'), threadId, type);
  }

  // Bầu Cua leaderboard
  if (gameType === 'baucua') {
    const baucuaStats = global.gameLeaderboard.baucua || {};
    const sortedPlayers = Object.entries(baucuaStats)
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        winRate: stats.gamesPlayed > 0 ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1) : '0.0',
        profit: stats.totalWin - stats.totalBet,
        score: stats.wins * 2 + stats.biggestWin / 1000 - stats.losses * 0.5
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (sortedPlayers.length === 0) {
      return api.sendMessage('🎲 Chưa có dữ liệu BXH Bầu Cua!\nHãy chơi game để xuất hiện trong bảng xếp hạng.', threadId, type);
    }

    let baucuaMsg = [
      '🏆 BẢNG XẾP HẠNG BẦU CUA',
      '',
      '🎲 TOP 10 CAO THỦ:'
    ];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
      
      let playerName = 'Người chơi';
      try {
        const info = await api.getUserInfo(player.userId);
        playerName = info?.changed_profiles?.[player.userId]?.displayName || 'Người chơi';
      } catch {}

      baucuaMsg.push(`${medal} ${playerName}`);
      baucuaMsg.push(`   📊 ${player.wins}W-${player.losses}L (${player.winRate}%)`);
      baucuaMsg.push(`   💰 Lợi nhuận: ${player.profit >= 0 ? '+' : ''}${player.profit.toLocaleString()}`);
      baucuaMsg.push(`   🔥 Streak: ${player.winStreak} | ⭐ Max: ${player.maxWinStreak}`);
      baucuaMsg.push(`   💎 Thắng lớn nhất: ${player.biggestWin.toLocaleString()}đ`);
      baucuaMsg.push('');
    }

    baucuaMsg.push('🎯 Gõ "baucua stats" để xem thống kê cá nhân!');
    return api.sendMessage(baucuaMsg.join('\n'), threadId, type);
  }
};
