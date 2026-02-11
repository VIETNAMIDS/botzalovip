module.exports.config = {
  name: "sudoku",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Bonz Games",
  description: "Game Sudoku 9x9 với 3 độ khó",
  commandCategory: "Game",
  usages: "[start/move/hint/solve/stats] <difficulty> <row> <col> <number>",
  cooldowns: 3
};

// Initialize game storage
if (!global.sudokuGames) global.sudokuGames = new Map();
if (!global.sudokuStats) global.sudokuStats = {};

// Sudoku difficulty levels
const DIFFICULTIES = {
  'easy': { name: 'Dễ', clues: 45, reward: 1000 },
  'medium': { name: 'Trung bình', clues: 35, reward: 2500 },
  'hard': { name: 'Khó', clues: 25, reward: 5000 }
};

// Generate complete Sudoku solution
function generateCompleteSudoku() {
  const grid = Array(9).fill().map(() => Array(9).fill(0));
  
  function isValid(grid, row, col, num) {
    // Check row
    for (let x = 0; x < 9; x++) {
      if (grid[row][x] === num) return false;
    }
    
    // Check column
    for (let x = 0; x < 9; x++) {
      if (grid[x][col] === num) return false;
    }
    
    // Check 3x3 box
    const startRow = row - row % 3;
    const startCol = col - col % 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (grid[i + startRow][j + startCol] === num) return false;
      }
    }
    
    return true;
  }
  
  function solveSudoku(grid) {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (grid[row][col] === 0) {
          const numbers = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
          for (const num of numbers) {
            if (isValid(grid, row, col, num)) {
              grid[row][col] = num;
              if (solveSudoku(grid)) return true;
              grid[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }
  
  solveSudoku(grid);
  return grid;
}

// Create puzzle by removing numbers
function createPuzzle(solution, difficulty) {
  const puzzle = solution.map(row => [...row]);
  const clues = DIFFICULTIES[difficulty].clues;
  const cellsToRemove = 81 - clues;
  
  const positions = [];
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      positions.push([i, j]);
    }
  }
  
  // Shuffle positions
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  
  // Remove numbers
  for (let i = 0; i < cellsToRemove; i++) {
    const [row, col] = positions[i];
    puzzle[row][col] = 0;
  }
  
  return puzzle;
}

// Format grid for display
function formatGrid(grid, playerGrid = null) {
  let result = '```\n  1 2 3   4 5 6   7 8 9\n';
  
  for (let i = 0; i < 9; i++) {
    if (i === 3 || i === 6) {
      result += '  ------+-------+------\n';
    }
    
    result += `${i + 1} `;
    for (let j = 0; j < 9; j++) {
      if (j === 3 || j === 6) result += '| ';
      
      const value = playerGrid ? playerGrid[i][j] : grid[i][j];
      if (value === 0) {
        result += '. ';
      } else {
        // Show original clues vs player moves
        const isOriginal = grid[i][j] !== 0;
        result += isOriginal ? `${value} ` : `${value} `;
      }
    }
    result += '\n';
  }
  
  result += '```';
  return result;
}

// Check if move is valid
function isValidMove(grid, row, col, num) {
  // Check if cell is empty
  if (grid[row][col] !== 0) return false;
  
  // Check row
  for (let x = 0; x < 9; x++) {
    if (grid[row][x] === num) return false;
  }
  
  // Check column
  for (let x = 0; x < 9; x++) {
    if (grid[x][col] === num) return false;
  }
  
  // Check 3x3 box
  const startRow = row - row % 3;
  const startCol = col - col % 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[i + startRow][j + startCol] === num) return false;
    }
  }
  
  return true;
}

// Check if puzzle is complete
function isComplete(grid) {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if (grid[i][j] === 0) return false;
    }
  }
  return true;
}

// Get hint for player
function getHint(solution, playerGrid) {
  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if (playerGrid[i][j] === 0) {
        emptyCells.push([i, j]);
      }
    }
  }
  
  if (emptyCells.length === 0) return null;
  
  const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const [row, col] = randomCell;
  
  return {
    row: row + 1,
    col: col + 1,
    number: solution[row][col]
  };
}

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const action = (args[0] || '').toLowerCase();
  
  // Initialize player stats
  if (!global.sudokuStats[senderId]) {
    global.sudokuStats[senderId] = {
      gamesPlayed: 0,
      gamesWon: 0,
      totalTime: 0,
      bestTime: { easy: null, medium: null, hard: null },
      hintsUsed: 0
    };
  }
  
  const gameKey = `${threadId}_${senderId}`;
  
  if (!action || action === 'help') {
    return api.sendMessage([
      '🧩 **SUDOKU 9x9**',
      '',
      '🎯 **CÁCH CHƠI:**',
      '• Điền số 1-9 vào ô trống',
      '• Mỗi hàng, cột, ô 3x3 không trùng số',
      '• Hoàn thành toàn bộ để thắng',
      '',
      '📋 **LỆNH:**',
      '• sudoku start <easy/medium/hard> - Bắt đầu game',
      '• sudoku move <hàng> <cột> <số> - Đặt số',
      '• sudoku hint - Gợi ý (trừ 100 coins)',
      '• sudoku solve - Xem lời giải',
      '• sudoku stats - Thống kê cá nhân',
      '',
      '🏆 **ĐỘ KHÓ:**',
      '• 🟢 Easy: 45 số cho sẵn (+1,000 coins)',
      '• 🟡 Medium: 35 số cho sẵn (+2,500 coins)',
      '• 🔴 Hard: 25 số cho sẵn (+5,000 coins)',
      '',
      '💡 **VÍ DỤ:**',
      '• sudoku start easy',
      '• sudoku move 1 1 5',
      '• sudoku hint'
    ].join('\n'), threadId, type);
  }
  
  if (action === 'start') {
    const difficulty = (args[1] || 'easy').toLowerCase();
    
    if (!DIFFICULTIES[difficulty]) {
      return api.sendMessage(
        '❌ Độ khó không hợp lệ!\n\n' +
        '🎯 Các độ khó:\n' +
        '• easy - Dễ (45 số cho sẵn)\n' +
        '• medium - Trung bình (35 số)\n' +
        '• hard - Khó (25 số)',
        threadId, type
      );
    }
    
    // Generate new puzzle
    const solution = generateCompleteSudoku();
    const puzzle = createPuzzle(solution, difficulty);
    const playerGrid = puzzle.map(row => [...row]);
    
    const game = {
      solution,
      puzzle,
      playerGrid,
      difficulty,
      startTime: Date.now(),
      hintsUsed: 0,
      moves: 0
    };
    
    global.sudokuGames.set(gameKey, game);
    
    const diffInfo = DIFFICULTIES[difficulty];
    return api.sendMessage([
      '🧩 **SUDOKU GAME STARTED!**',
      '',
      `🎯 Độ khó: ${diffInfo.name}`,
      `💰 Phần thưởng: ${diffInfo.reward.toLocaleString()} coins`,
      `🔢 Số cho sẵn: ${diffInfo.clues}/81`,
      '',
      formatGrid(puzzle),
      '',
      '📋 **HƯỚNG DẪN:**',
      '• Gõ: sudoku move <hàng> <cột> <số>',
      '• VD: sudoku move 1 1 5',
      '• Hint: sudoku hint (100 coins)',
      '• Solve: sudoku solve'
    ].join('\n'), threadId, type);
  }
  
  const game = global.sudokuGames.get(gameKey);
  if (!game) {
    return api.sendMessage(
      '❌ Bạn chưa bắt đầu game nào!\n\n' +
      '🎯 Gõ "sudoku start <easy/medium/hard>" để chơi',
      threadId, type
    );
  }
  
  if (action === 'move') {
    const row = parseInt(args[1]) - 1;
    const col = parseInt(args[2]) - 1;
    const num = parseInt(args[3]);
    
    if (isNaN(row) || isNaN(col) || isNaN(num) || 
        row < 0 || row > 8 || col < 0 || col > 8 || 
        num < 1 || num > 9) {
      return api.sendMessage(
        '❌ Cú pháp không đúng!\n\n' +
        '📋 Đúng: sudoku move <hàng> <cột> <số>\n' +
        '💡 VD: sudoku move 1 1 5\n' +
        '📊 Hàng/Cột: 1-9, Số: 1-9',
        threadId, type
      );
    }
    
    // Check if cell is already filled
    if (game.puzzle[row][col] !== 0) {
      return api.sendMessage(
        '❌ Ô này đã có số rồi!\n\n' +
        '💡 Chọn ô trống (dấu .) để điền số',
        threadId, type
      );
    }
    
    // Check if move is valid
    if (!isValidMove(game.playerGrid, row, col, num)) {
      return api.sendMessage(
        '❌ Nước đi không hợp lệ!\n\n' +
        '🚫 Số này đã tồn tại trong:\n' +
        '• Hàng hoặc cột tương ứng\n' +
        '• Ô vuông 3x3 chứa vị trí này\n\n' +
        '💡 Thử số khác!',
        threadId, type
      );
    }
    
    // Make the move
    game.playerGrid[row][col] = num;
    game.moves++;
    
    // Check if puzzle is complete
    if (isComplete(game.playerGrid)) {
      const timeElapsed = Date.now() - game.startTime;
      const minutes = Math.floor(timeElapsed / 60000);
      const seconds = Math.floor((timeElapsed % 60000) / 1000);
      
      // Update stats
      const stats = global.sudokuStats[senderId];
      stats.gamesPlayed++;
      stats.gamesWon++;
      stats.totalTime += timeElapsed;
      
      if (!stats.bestTime[game.difficulty] || timeElapsed < stats.bestTime[game.difficulty]) {
        stats.bestTime[game.difficulty] = timeElapsed;
      }
      
      // Calculate reward
      const baseReward = DIFFICULTIES[game.difficulty].reward;
      const timeBonus = Math.max(0, Math.floor((1800000 - timeElapsed) / 60000) * 100); // Bonus for under 30 min
      const moveBonus = Math.max(0, (200 - game.moves) * 10); // Bonus for fewer moves
      const hintPenalty = game.hintsUsed * 100;
      const totalReward = Math.max(100, baseReward + timeBonus + moveBonus - hintPenalty);
      
      // Add coins (integrate with fishing system if available)
      try {
        const fishingModule = require('./fishing.js');
        if (global.playerData && global.playerData[senderId]) {
          global.playerData[senderId].coins += totalReward;
          fishingModule.savePlayerData();
        }
      } catch (e) {
        // Fallback if fishing system not available
      }
      
      global.sudokuGames.delete(gameKey);
      
      return api.sendMessage([
        '🎉 **SUDOKU HOÀN THÀNH!**',
        '',
        formatGrid(game.solution),
        '',
        `⏱️ Thời gian: ${minutes}:${seconds.toString().padStart(2, '0')}`,
        `🎯 Số nước đi: ${game.moves}`,
        `💡 Hints sử dụng: ${game.hintsUsed}`,
        '',
        '💰 **PHẦN THƯỞNG:**',
        `• Base: ${baseReward.toLocaleString()} coins`,
        `• Time bonus: +${timeBonus.toLocaleString()}`,
        `• Move bonus: +${moveBonus.toLocaleString()}`,
        `• Hint penalty: -${hintPenalty.toLocaleString()}`,
        `• **Tổng: ${totalReward.toLocaleString()} coins**`,
        '',
        '🏆 Gõ "sudoku stats" để xem thống kê!'
      ].join('\n'), threadId, type);
    }
    
    return api.sendMessage([
      '✅ **ĐÃ ĐẶT SỐ THÀNH CÔNG!**',
      '',
      formatGrid(game.puzzle, game.playerGrid),
      '',
      `🎯 Nước đi: ${game.moves}`,
      `💡 Hints: ${game.hintsUsed}`,
      `📊 Tiến độ: ${Math.floor((81 - game.playerGrid.flat().filter(x => x === 0).length) / 81 * 100)}%`,
      '',
      '💡 Tiếp tục: sudoku move <hàng> <cột> <số>'
    ].join('\n'), threadId, type);
  }
  
  if (action === 'hint') {
    // Check coins (integrate with fishing system)
    let hasEnoughCoins = true;
    try {
      const fishingModule = require('./fishing.js');
      if (global.playerData && global.playerData[senderId]) {
        if (global.playerData[senderId].coins < 100) {
          hasEnoughCoins = false;
        } else {
          global.playerData[senderId].coins -= 100;
          fishingModule.savePlayerData();
        }
      }
    } catch (e) {
      // Continue without coin check if fishing system not available
    }
    
    if (!hasEnoughCoins) {
      return api.sendMessage(
        '❌ Không đủ coins!\n\n' +
        '💰 Cần: 100 coins\n' +
        '💡 Chơi fishing để kiếm coins',
        threadId, type
      );
    }
    
    const hint = getHint(game.solution, game.playerGrid);
    if (!hint) {
      return api.sendMessage('🎉 Bạn đã hoàn thành puzzle!', threadId, type);
    }
    
    game.hintsUsed++;
    global.sudokuStats[senderId].hintsUsed++;
    
    return api.sendMessage([
      '💡 **HINT:**',
      '',
      `🎯 Hàng ${hint.row}, Cột ${hint.col}: Số ${hint.number}`,
      '',
      `💰 Đã trừ 100 coins`,
      `🔍 Hints đã dùng: ${game.hintsUsed}`,
      '',
      `📋 Gõ: sudoku move ${hint.row} ${hint.col} ${hint.number}`
    ].join('\n'), threadId, type);
  }
  
  if (action === 'solve') {
    global.sudokuGames.delete(gameKey);
    
    return api.sendMessage([
      '🔍 **LỜI GIẢI SUDOKU:**',
      '',
      formatGrid(game.solution),
      '',
      '❌ Game đã kết thúc (không có phần thưởng)',
      '🎯 Gõ "sudoku start" để chơi lại!'
    ].join('\n'), threadId, type);
  }
  
  if (action === 'stats') {
    const stats = global.sudokuStats[senderId];
    const winRate = stats.gamesPlayed > 0 ? (stats.gamesWon / stats.gamesPlayed * 100).toFixed(1) : 0;
    const avgTime = stats.gamesWon > 0 ? Math.floor(stats.totalTime / stats.gamesWon / 1000) : 0;
    
    const formatTime = (ms) => {
      if (!ms) return 'Chưa có';
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    
    return api.sendMessage([
      '📊 **SUDOKU STATS**',
      '',
      `🎮 Games: ${stats.gamesPlayed} | Thắng: ${stats.gamesWon}`,
      `🏆 Tỉ lệ thắng: ${winRate}%`,
      `⏱️ Thời gian TB: ${Math.floor(avgTime / 60)}:${(avgTime % 60).toString().padStart(2, '0')}`,
      `💡 Hints sử dụng: ${stats.hintsUsed}`,
      '',
      '🏁 **BEST TIMES:**',
      `• 🟢 Easy: ${formatTime(stats.bestTime.easy)}`,
      `• 🟡 Medium: ${formatTime(stats.bestTime.medium)}`,
      `• 🔴 Hard: ${formatTime(stats.bestTime.hard)}`,
      '',
      '🎯 Thử thách bản thân với độ khó cao hơn!'
    ].join('\n'), threadId, type);
  }
  
  // Show current game status
  return api.sendMessage([
    '🧩 **SUDOKU HIỆN TẠI**',
    '',
    formatGrid(game.puzzle, game.playerGrid),
    '',
    `🎯 Độ khó: ${DIFFICULTIES[game.difficulty].name}`,
    `🎮 Nước đi: ${game.moves}`,
    `💡 Hints: ${game.hintsUsed}`,
    `📊 Tiến độ: ${Math.floor((81 - game.playerGrid.flat().filter(x => x === 0).length) / 81 * 100)}%`,
    '',
    '📋 **LỆNH:**',
    '• sudoku move <hàng> <cột> <số>',
    '• sudoku hint (100 coins)',
    '• sudoku solve (xem đáp án)'
  ].join('\n'), threadId, type);
};
