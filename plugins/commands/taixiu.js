const fs = require("fs");
const axios = require("axios");
const path = require("path");
const Jimp = require("jimp");
// Shared user profile helper
let userProfile = null;
try { userProfile = require('./userProfile.js'); } catch { userProfile = (global.userProfile || global.userProfileHelper) || null; }

// Import leaderboard functions
const leaderboard = require('./leaderboard.js');
const profiles = require('../shared/profiles');
const { makeHeader } = require('../shared/gameHeader');

module.exports.config = {
  name: "taixiu",
  version: "2.0.0",
  role: 0,
  author: "Bonz Bot Enhanced",
  description: "Game Tài Xỉu Nâng Cao - 3 xúc xắc với jackpot và multiplier",
  category: "Casino",
  usage: "taixiu [bet/stats/leaderboard/help] <tai/xiu> <amount>",
  cooldowns: 5,
  dependencies: {
    "jimp": "0.16.1"
  }
};

const diceDir = path.join(__dirname, "cache", "taixiu");
const diceURLs = {
  1: "https://i.postimg.cc/QdpW76h1/dice-1.jpg",
  2: "https://i.postimg.cc/pX5jWWS0/dice-2.jpg",
  3: "https://i.postimg.cc/5tbQSw2G/dice-3.jpg",
  4: "https://i.postimg.cc/Fz8Jy8Yg/dice-4.jpg",
  5: "https://i.postimg.cc/MpkQvk2z/dice-5.jpg",
  6: "https://i.postimg.cc/T24mvLtL/dice-6.jpg"
};

const ROOM_CONFIGS = [
  {
    id: 1,
    code: "pho-thong",
    name: "Phòng Phổ Thông",
    desc: "Bàn thường cho mọi người, cược từ 10K đến 5M",
    minBet: 10_000,
    maxBet: 5_000_000,
    betDuration: 45_000,
    whaleChance: 0.05,
    whaleMin: 200_000_000,
    whaleMax: 2_000_000_000
  },
  {
    id: 2,
    code: "vip",
    name: "Phòng VIP",
    desc: "Anh em đại gia, cược 100K - 200M",
    minBet: 100_000,
    maxBet: 200_000_000,
    betDuration: 45_000,
    whaleChance: 0.15,
    whaleMin: 1_000_000_000,
    whaleMax: 10_000_000_000
  },
  {
    id: 3,
    code: "sieucap",
    name: "Phòng Siêu Cấp",
    desc: "Trải nghiệm cá voi – cược 1M tới 50 tỷ",
    minBet: 1_000_000,
    maxBet: 50_000_000_000,
    betDuration: 60_000,
    whaleChance: 0.3,
    whaleMin: 5_000_000_000,
    whaleMax: 50_000_000_000
  }
];

const DEFAULT_ROOM_ID = ROOM_CONFIGS[0].id;
const SIGNUP_BONUS = 100_000;

const ROLL_DELAY = 4_000; // thời gian lắc xúc xắc trước khi trả kết quả
const HISTORY_LIMIT = 24;
const SIDE_LABEL = { tai: "TÀI", xiu: "XỈU" };

function formatMoney(value = 0) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function adjustCoins(profile, delta = 0) {
  if (!profile) return 0;
  const current = Number(profile.coins || 0);
  profile.coins = Math.max(0, current + delta);
  try {
    profiles.saveProfiles();
  } catch {}
  return profile.coins;
}

function ensureStats(uid) {
  if (!global.gameLeaderboard.taixiu[uid]) {
    global.gameLeaderboard.taixiu[uid] = {
      wins: 0,
      losses: 0,
      totalBet: 0,
      totalWin: 0,
      jackpots: 0,
      maxStreak: 0,
      currentStreak: 0
    };
  }
  return global.gameLeaderboard.taixiu[uid];
}

function randBetween(min = 0, max = 0) {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRoomConfig(roomId) {
  return ROOM_CONFIGS.find((room) => room.id === roomId) || ROOM_CONFIGS[0];
}

function maybeInjectWhale(room, round) {
  const { whaleChance, whaleMin, whaleMax } = room.config;
  if (!whaleChance || !whaleMin || !whaleMax) return;
  if (Math.random() > whaleChance) return;
  const side = Math.random() > 0.5 ? "tai" : "xiu";
  const amount = randBetween(whaleMin, whaleMax);
  round.whale = { side, amount };
  round.totals[side] += amount;
}

function hasTaiXiuAccount(profile) {
  return Boolean(profile?.taixiu?.signupBonusClaimed);
}

function ensureTaiXiuData(profile) {
  if (!profile.taixiu) {
    profile.taixiu = {
      roomId: DEFAULT_ROOM_ID,
      signupBonusClaimed: false,
      createdAt: Date.now()
    };
  }
  if (!profile.taixiu.roomId) {
    profile.taixiu.roomId = DEFAULT_ROOM_ID;
  }
  return profile.taixiu;
}

function removeThreadFromAllRooms(engine, threadId) {
  engine.rooms.forEach((room) => {
    room.watchers.delete(threadId);
    room.currentRound?.threadIds?.delete(threadId);
  });
}

function resolveRoomIdentifier(input) {
  if (!input && input !== 0) return null;
  const raw = String(input).trim();
  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) {
    const byId = ROOM_CONFIGS.find((room) => room.id === numeric);
    if (byId) return byId.id;
  }
  const lower = raw.toLowerCase();
  const byCode = ROOM_CONFIGS.find((room) => room.code === lower);
  if (byCode) return byCode.id;
  const byName = ROOM_CONFIGS.find((room) => room.name.toLowerCase().includes(lower));
  if (byName) return byName.id;
  return null;
}

function buildRoomListMessage(currentRoomId) {
  const lines = ["🏢 DANH SÁCH PHÒNG TÀI XỈU"];
  ROOM_CONFIGS.forEach((cfg) => {
    const marker = cfg.id === currentRoomId ? "⭐" : "▫";
    lines.push(`${marker} #${cfg.id} – ${cfg.name}`);
    lines.push(`   ${cfg.desc}`);
    lines.push(`   Cược: ${formatMoney(cfg.minBet)} – ${formatMoney(cfg.maxBet)} | Chu kỳ ${Math.floor(cfg.betDuration / 1000)}s`);
    lines.push(`   Cá voi ghé thăm ~${Math.round((cfg.whaleChance || 0) * 100)}% (đơn ${formatMoney(cfg.whaleMin || 0)} - ${formatMoney(cfg.whaleMax || 0)})`);
  });
  lines.push("");
  lines.push('🔁 Gõ "taixiu room <id>" để chuyển bàn.');
  return lines.join("\n");
}

function getEngine() {
  if (!global.taixiuGame) {
    global.taixiuGame = {
      rooms: new Map(),
      players: new Map(),
      api: null
    };
  }
  return global.taixiuGame;
}

function ensureRoom(engine, roomId) {
  const existing = engine.rooms.get(roomId);
  if (existing) return existing;
  const config = ROOM_CONFIGS.find((r) => r.id === roomId) || ROOM_CONFIGS[0];
  const roomState = {
    id: config.id,
    config,
    engine,
    roundCounter: 0,
    currentRound: null,
    history: [],
    watchers: new Set(),
    timers: {}
  };
  engine.rooms.set(roomId, roomState);
  startNewRound(roomState);
  return roomState;
}

function ensureEngine(api) {
  const engine = getEngine();
  if (api) engine.api = api;
  ROOM_CONFIGS.forEach((room) => ensureRoom(engine, room.id));
  return engine;
}

function startNewRound(room) {
  const now = Date.now();
  const round = {
    id: ++room.roundCounter,
    status: "betting",
    startAt: now,
    lockAt: now + room.config.betDuration,
    dice: [],
    total: 0,
    result: null,
    isJackpot: false,
    totals: { tai: 0, xiu: 0 },
    bets: {},
    threadIds: new Set(room.watchers ? Array.from(room.watchers) : [])
  };
  room.currentRound = round;
  maybeInjectWhale(room, round);
  scheduleLock(room, round);
  return round;
}

function scheduleLock(room, round) {
  room.timers.lock && clearTimeout(room.timers.lock);
  room.timers.lock = setTimeout(() => lockRound(room, round.id), Math.max(0, round.lockAt - Date.now()));
}

function lockRound(room, roundId) {
  const round = room.currentRound;
  if (!round || round.id !== roundId || round.status !== "betting") return;
  round.status = "locked";
  round.lockedAt = Date.now();
  room.timers.roll && clearTimeout(room.timers.roll);
  room.timers.roll = setTimeout(() => settleRound(room, roundId), ROLL_DELAY);
}

function settleRound(room, roundId) {
  const round = room.currentRound;
  if (!round || round.id !== roundId || round.status === "settled") return;
  if (!round.dice.length) {
    round.dice = rollDice();
    round.total = round.dice.reduce((a, b) => a + b, 0);
    round.result = round.total >= 11 ? "tai" : "xiu";
    round.isJackpot = round.dice[0] === round.dice[1] && round.dice[1] === round.dice[2];
  }
  round.status = "settled";
  round.settledAt = Date.now();

  const payouts = [];
  for (const [uid, betList] of Object.entries(round.bets)) {
    const stats = ensureStats(uid);
    const profile = profiles.ensureProfile(uid, betList[0]?.name);
    const roundTotalBet = betList.reduce((sum, bet) => sum + bet.amount, 0);
    stats.totalBet += roundTotalBet;

    const roundWin = betList.some((bet) => bet.choice === round.result);
    let streakMultiplier = 1;
    let totalWin = 0;
    if (roundWin) {
      stats.currentStreak += 1;
      if (stats.currentStreak >= 5) streakMultiplier = 1.5;
      else if (stats.currentStreak >= 3) streakMultiplier = 1.2;
    } else {
      stats.currentStreak = 0;
    }

    for (const bet of betList) {
      if (bet.choice !== round.result) continue;
      let multiplier = round.isJackpot ? 10 : 2;
      multiplier *= streakMultiplier;
      const win = Math.floor(bet.amount * multiplier);
      totalWin += win;
    }

    if (roundWin) {
      stats.wins += 1;
      stats.totalWin += totalWin;
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      if (round.isJackpot) stats.jackpots += 1;
    } else {
      stats.losses += 1;
    }

    if (totalWin > 0) {
      adjustCoins(profile, totalWin);
    }

    try {
      userProfile?.recordCasino?.(uid, "taixiu", {
        wins: roundWin ? 1 : 0,
        losses: roundWin ? 0 : 1,
        totalBet: roundTotalBet,
        totalWin,
        jackpots: round.isJackpot && roundWin ? 1 : 0
      });
    } catch {}

    payouts.push({
      uid,
      name: betList[0]?.name || profile?.name || `Người chơi ${String(uid).slice(-4)}`,
      totalWin,
      bet: roundTotalBet,
      roundWin
    });
  }

  addHistoryEntry(room, round);
  const participants = Array.from(round.threadIds || []);
  const nextRound = startNewRound(room);
  announceRoundResult(room, round, nextRound, participants, payouts);
}

function rollDice() {
  return [0, 0, 0].map(() => Math.floor(Math.random() * 6) + 1);
}

function addHistoryEntry(room, round) {
  room.history.unshift({
    id: round.id,
    dice: round.dice,
    total: round.total,
    result: round.result,
    isJackpot: round.isJackpot,
    tai: round.totals.tai,
    xiu: round.totals.xiu,
    settledAt: round.settledAt
  });
  room.history = room.history.slice(0, HISTORY_LIMIT);
}

function analyzeHistory(history = []) {
  if (!history.length) {
    return {
      counts: { tai: 0, xiu: 0 },
      current: { side: null, count: 0 },
      longest: { side: null, count: 0 }
    };
  }
  const counts = history.reduce((acc, entry) => {
    acc[entry.result] = (acc[entry.result] || 0) + 1;
    return acc;
  }, { tai: 0, xiu: 0 });

  let current = { side: history[0].result, count: 0 };
  for (const entry of history) {
    if (entry.result === current.side) current.count += 1;
    else break;
  }

  let longest = { side: null, count: 0 };
  let streakSide = null;
  let streakCount = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const side = history[i].result;
    if (side === streakSide) {
      streakCount += 1;
    } else {
      streakSide = side;
      streakCount = 1;
    }
    if (streakCount > longest.count) {
      longest = { side, count: streakCount };
    }
  }

  return { counts, current, longest };
}

function formatHistoryLine(history = [], limit = 10) {
  if (!history.length) return "Chưa có dữ liệu.";
  return history
    .slice(0, limit)
    .map((entry) => {
      const label = entry.result === "tai" ? "T" : "X";
      const badge = entry.isJackpot ? "🎰" : "";
      return `${label}${badge}(${entry.total})`;
    })
    .join(" → ");
}

function formatUserBets(round, uid) {
  const bets = round?.bets?.[uid];
  if (!bets?.length) return "• Chưa có vé cược trong phiên này.";
  return bets
    .map((bet, idx) => `• Vé #${idx + 1}: ${bet.choice.toUpperCase()} - ${formatMoney(bet.amount)}`)
    .join("\n");
}

function getTimeLeft(round) {
  if (!round || round.status !== "betting") return 0;
  return Math.max(0, round.lockAt - Date.now());
}

function formatCountdown(ms) {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function buildStatusMessage(room, round, uid) {
  if (!round) return "⚠️ Hệ thống tài xỉu chưa khởi động.";
  const lines = [];
  const state = round.status === "betting" ? "ĐANG NHẬN CƯỢC" : round.status === "locked" ? "ĐANG LẮC" : "ĐANG CHUẨN BỊ";
  lines.push(`🎲 ${room.config.name} – Phiên #${round.id}`);
  lines.push(`📊 Trạng thái: ${state}`);
  lines.push(`⏱️ ${round.status === "betting" ? `Khóa sau ${formatCountdown(getTimeLeft(round))}` : "Đã khóa"}`);
  lines.push(`💼 Pool: ${SIDE_LABEL.tai} ${formatMoney(round.totals.tai)} | ${SIDE_LABEL.xiu} ${formatMoney(round.totals.xiu)}`);
  const poolTotal = round.totals.tai + round.totals.xiu;
  if (poolTotal > 0) {
    const ratioTai = Math.round((round.totals.tai / poolTotal) * 100);
    const ratioXiu = 100 - ratioTai;
    const hot = round.totals.tai === round.totals.xiu ? "Cân nhau" : round.totals.tai > round.totals.xiu ? SIDE_LABEL.tai : SIDE_LABEL.xiu;
    lines.push(`⚖️ Tỷ trọng: ${ratioTai}% - ${ratioXiu}% • Cửa nóng: ${hot}`);
  }
  lines.push("");
  lines.push("🎟️ Vé của bạn:");
  lines.push(formatUserBets(round, uid));
  lines.push("");
  lines.push(`📜 Lịch sử nhanh: ${formatHistoryLine(room.history, 12)}`);
  return lines.join("\n");
}

function buildHistoryMessage(room) {
  if (!room.history.length) return "📚 Lịch sử trống. Hãy đặt cược để mở phiên đầu tiên.";
  const lines = ["📚 LỊCH SỬ 10 PHIÊN GẦN NHẤT"];
  room.history.slice(0, 10).forEach((entry) => {
    const label = SIDE_LABEL[entry.result] || entry.result;
    lines.push(`• #${entry.id} | ${entry.dice.join(' + ')} = ${entry.total} → ${label}${entry.isJackpot ? ' 🎰' : ''} | Pool T: ${formatMoney(entry.tai)} / X: ${formatMoney(entry.xiu)}`);
  });
  return lines.join("\n");
}

function buildSoiCauMessage(room) {
  const analysis = analyzeHistory(room.history);
  const lines = ["🔮 SOI CẦU – DATA 24 PHIÊN"];
  lines.push(`• Tổng: ${analysis.counts.tai + analysis.counts.xiu} phiên (${analysis.counts.tai} Tài / ${analysis.counts.xiu} Xỉu)`);
  if (analysis.current.side) {
    lines.push(`• Chuỗi hiện tại: ${analysis.current.count} ${SIDE_LABEL[analysis.current.side]}`);
  } else {
    lines.push("• Chuỗi hiện tại: chưa có");
  }
  if (analysis.longest.side) {
    lines.push(`• Chuỗi dài nhất: ${analysis.longest.count} ${SIDE_LABEL[analysis.longest.side]}`);
  }
  const last = room.history[0];
  if (last) {
    lines.push(`• Phiên gần nhất: #${last.id} (${SIDE_LABEL[last.result]} - ${last.total})`);
  }
  let hint = "Cửa đang cân bằng, tuỳ chiến thuật.";
  if (analysis.current.count >= 4) {
    hint = `Chuỗi ${analysis.current.count} ${SIDE_LABEL[analysis.current.side]} đang chạy. Có thể theo tiếp hoặc bắt đảo chiều.`;
  } else if (analysis.counts.tai - analysis.counts.xiu >= 4) {
    hint = "TÀI đang áp đảo tổng thể, cân nhắc đánh Xỉu để cân pool.";
  } else if (analysis.counts.xiu - analysis.counts.tai >= 4) {
    hint = "XỈU đang áp đảo tổng thể, cân nhắc theo Tài phủ đầu.";
  }
  lines.push(`💡 Gợi ý: ${hint}`);
  lines.push("");
  lines.push(`📜 Lịch sử: ${formatHistoryLine(room.history, 15)}`);
  return lines.join("\n");
}

function buildPoolMessage(room, round) {
  if (!round) return "⚠️ Chưa có phiên nào.";
  const lines = [
    `🏦 ${room.config.name} – Pool phiên #${round.id}`,
    `• ${SIDE_LABEL.tai}: ${formatMoney(round.totals.tai)} (${round.totals.tai ? round.totals.tai.toLocaleString() : '0'})`,
    `• ${SIDE_LABEL.xiu}: ${formatMoney(round.totals.xiu)}`
  ];
  const total = round.totals.tai + round.totals.xiu;
  if (total > 0) {
    lines.push(`• Tổng pool: ${formatMoney(total)}`);
  }
  return lines.join("\n");
}

function buildMyBetsMessage(room, round, uid) {
  if (!round) return "⚠️ Chưa có phiên.";
  const lines = [`🎟️ Vé của bạn - ${room.config.name} #${round.id}`];
  lines.push(formatUserBets(round, uid));
  lines.push(`⏱️ ${round.status === 'betting' ? `Khóa sau ${formatCountdown(getTimeLeft(round))}` : 'Phiên đã khóa'}`);
  return lines.join("\n");
}

async function announceRoundResult(room, round, nextRound, threadIds = [], payouts = []) {
  if (!room?.engine?.api || !threadIds.length) return;
  const winners = payouts.filter((p) => p.totalWin > 0);
  const baseLines = [
    `📣 ${room.config.name} – KẾT QUẢ #${round.id}`,
    `🎲 ${round.dice.join(' + ')} = ${round.total} → ${SIDE_LABEL[round.result]}${round.isJackpot ? ' 🎰 JACKPOT' : ''}`,
    `💼 Pool: ${SIDE_LABEL.tai} ${formatMoney(round.totals.tai)} | ${SIDE_LABEL.xiu} ${formatMoney(round.totals.xiu)}`
  ];
  if (winners.length) {
    baseLines.push('🏆 Người trúng:');
    winners.slice(0, 5).forEach((win) => {
      baseLines.push(`• ${win.name}: +${formatMoney(win.totalWin)}`);
    });
  } else {
    baseLines.push('⚠️ Không có vé thắng ở phiên này.');
  }
  const losers = payouts.length - winners.length;
  if (losers > 0) {
    baseLines.push(`💥 Vé thua: ${losers}`);
  }
  baseLines.push(`📜 Chuỗi: ${formatHistoryLine(room.history, 10)}`);
  baseLines.push(`🆕 Phiên #${nextRound.id} đã mở tại ${room.config.name}. Gõ "taixiu bet <tai/xiu> <tiền>" để vào kèo.`);

  for (const tid of threadIds) {
    try {
      const attachment = await createDiceImage(round.dice);
      await room.engine.api.sendMessage({ body: baseLines.join('\n'), attachment }, tid);
    } catch (err) {
      try {
        await room.engine.api.sendMessage(baseLines.join('\n'), tid);
      } catch (sendErr) {
        console.warn('[taixiu] announce error', sendErr?.message);
      }
    }
  }
}

async function ensureDiceImagesExist() {
  if (!fs.existsSync(diceDir)) fs.mkdirSync(diceDir, { recursive: true });
  for (let i = 1; i <= 6; i++) {
    const filePath = path.join(diceDir, `dice_${i}.jpg`);
    if (!fs.existsSync(filePath)) {
      const res = await axios.get(diceURLs[i], {
        responseType: "arraybuffer",
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://imgur.com/',
            'Accept': 'image/*,*/*;q=0.8'
          }
      });
      fs.writeFileSync(filePath, res.data);
    }
  }
}

// Function tạo ảnh 3 xúc xắc
async function createDiceImage(dice) {
  try {
    // Tạo canvas nền
    const canvasWidth = 600;
    const canvasHeight = 250;
    const canvas = new Jimp(canvasWidth, canvasHeight, '#2C3E50'); // Dark blue background
    
    // Load dice images với caching
    const diceImages = [];
    for (let i = 0; i < 3; i++) {
      const diceValue = dice[i];
      
      // Kiểm tra cache trước
      if (!diceImageCache[diceValue]) {
        const dicePath = path.join(diceDir, `dice_${diceValue}.jpg`);
        if (fs.existsSync(dicePath)) {
          const diceImg = await Jimp.read(dicePath);
          diceImg.resize(150, 150); // Resize dice to 150x150
          diceImageCache[diceValue] = diceImg.clone(); // Cache image
        }
      }
      
      if (diceImageCache[diceValue]) {
        diceImages.push(diceImageCache[diceValue].clone());
      }
    }
    
    // Vẽ 3 xúc xắc lên canvas
    if (diceImages.length === 3) {
      canvas.composite(diceImages[0], 50, 50);   // Dice 1
      canvas.composite(diceImages[1], 225, 50);  // Dice 2  
      canvas.composite(diceImages[2], 400, 50);  // Dice 3
    }
    
    // Thêm text kết quả
    const total = dice.reduce((a, b) => a + b, 0);
    const result = total >= 11 ? 'TÀI' : 'XỈU';
    const isJackpot = dice[0] === dice[1] && dice[1] === dice[2];
    
    // Load font (sử dụng font mặc định của Jimp)
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    
    // Vẽ text
    canvas.print(font, 0, 210, {
      text: `${dice.join(' + ')} = ${total} (${result})${isJackpot ? ' 🎰 JACKPOT!' : ''}`,
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
    }, canvasWidth);
    
    // Save ảnh tạm
    const outputPath = path.join(diceDir, `result_${Date.now()}.png`);
    await canvas.writeAsync(outputPath);
    
    // Tạo stream và cleanup sau khi đọc xong
    const stream = fs.createReadStream(outputPath);
    stream.on('end', () => {
      // Xóa file tạm sau 5 giây
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }, 5000);
    });
    
    return stream;
    
  } catch (error) {
    console.error('Error creating dice image:', error);
    return null;
  }
}

module.exports.onLoad = async () => {
  await ensureDiceImagesExist();
}

// Initialize game storage
if (!global.gameLeaderboard) global.gameLeaderboard = {};
if (!global.gameLeaderboard.taixiu) global.gameLeaderboard.taixiu = {};

// Cache cho dice images để tăng performance
let diceImageCache = {};

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const engine = ensureEngine(api);

  let userName = 'Người chơi';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người chơi';
  } catch {}

  if (!profiles.hasProfile(senderId)) {
    return api.sendMessage("⚠️ Bạn chưa có hồ sơ game. Gõ: profile create <tên> rồi quay lại Tài Xỉu.", threadId, type);
  }

  const profile = profiles.ensureProfile(senderId, userName);
  userName = profile.name || userName;
  const taixiuData = ensureTaiXiuData(profile);
  let profileDirty = false;
  let signupBonusMsg = '';
  if (!taixiuData.signupBonusClaimed) {
    adjustCoins(profile, SIGNUP_BONUS);
    taixiuData.signupBonusClaimed = true;
    profileDirty = true;
    signupBonusMsg = `💵 Tạo tài khoản Tài Xỉu thành công! Bạn được cộng ${formatMoney(SIGNUP_BONUS)} xu.`;
  }

  let room = ensureRoom(engine, taixiuData.roomId || DEFAULT_ROOM_ID);
  if (taixiuData.roomId !== room.id) {
    taixiuData.roomId = room.id;
    profileDirty = true;
  }

  if (profileDirty) {
    try {
      profiles.saveProfiles();
    } catch {}
  }

  const round = room.currentRound;

  function makeHeaderLine() {
    try {
      return makeHeader('Tài Xỉu Live', { name: userName, uid: senderId, coins: profile.coins });
    } catch {
      return `👤 ${userName} | 🎮 Tài Xỉu | 🆔 UID: ${senderId}`;
    }
  }

  async function send(content) {
    const header = makeHeaderLine();
    if (typeof content === 'string') {
      return api.sendMessage([header, content].join('\n'), threadId, type);
    }
    if (content && typeof content === 'object' && 'body' in content) {
      content.body = [header, content.body].join('\n');
      return api.sendMessage(content, threadId, type);
    }
    const parts = Array.isArray(content) ? content : [String(content)];
    parts.unshift(header);
    return api.sendMessage(parts.join('\n'), threadId, type);
  }

  const action = (args[0] || '').toLowerCase();

  const roomSummaries = ROOM_CONFIGS.map((cfg) => `#${cfg.id} ${cfg.name}: ${formatMoney(cfg.minBet)} – ${formatMoney(cfg.maxBet)} xu`).join('\n');
  const helpLines = [
    '🎲 TÀI XỈU LIVE – MÔ PHỎNG SÒNG WEB',
    '',
    '📋 LỆNH CƠ BẢN:',
    '• taixiu account      → Mở tài khoản & nhận 100.000 xu (1 lần)',
    '• taixiu             → Xem bàn live của phòng đang chọn',
    '• taixiu bet <tai/xiu> <tiền>  → Đặt cược',
    '• taixiu room [id]   → Danh sách + chuyển phòng (vd: taixiu room 1)',
    '• taixiu history     → 10 phiên gần nhất của phòng',
    '• taixiu soicau      → Data 24 phiên + gợi ý cửa',
    '• taixiu pool        → Pool chi tiết phiên hiện tại',
    '• taixiu my          → Vé bạn đã vào',
    '• taixiu watch [on/off] → Nhận thông báo mỗi khi ra kết quả',
    '• taixiu stats       → Thống kê cá nhân',
    '• taixiu leaderboard → BXH giàu có',
    '',
    '🏢 Phòng cược:',
    roomSummaries,
    '',
    '🐳 Cá voi đôi lúc ghé phòng VIP/Siêu Cấp và ném kèo vài chục tỷ để tăng độ chân thật.',
    '🎯 Luật: 3 xúc xắc, tổng 4-10 = XỈU, 11-17 = TÀI, 3 số trùng = JACKPOT x10.',
    '🔥 Thắng liên tiếp 3+ vé bonus x1.2, 5+ vé bonus x1.5.'
  ];

  if (!action || action === 'status') {
    const base = buildStatusMessage(room, round, senderId);
    return send(signupBonusMsg ? `${signupBonusMsg}\n\n${base}` : base);
  }

  if (action === 'help') {
    return send(helpLines.join('\n'));
  }

  if (action === 'account' || action === 'signup') {
    const claimed = taixiuData.signupBonusClaimed;
    const lines = [
      '📄 TÀI KHOẢN TÀI XỈU',
      `👤 ${userName}`,
      `💰 Ví hiện có: ${formatMoney(profile.coins)} xu`,
      `🏢 Phòng đang chọn: #${room.id} – ${room.config.name}`,
      claimed
        ? '✅ Bạn đã nhận 100.000 xu mở tài khoản. Tiếp tục đặt cược để lên VIP!'
        : `🎁 Chưa nhận bonus. Dùng "taixiu" hoặc "taixiu account" để kích hoạt +${formatMoney(SIGNUP_BONUS)}.`
    ];
    if (!claimed) {
      const reminder = signupBonusMsg || `💵 Bạn sắp nhận ${formatMoney(SIGNUP_BONUS)} xu khi kích hoạt.`;
      lines.push('', reminder);
    }
    return send(lines.join('\n'));
  }

  if (action === 'room') {
    const target = args[1];
    if (!target) {
      return send(buildRoomListMessage(room.id));
    }
    const resolved = resolveRoomIdentifier(target);
    if (!resolved) {
      return send('❌ Không tìm thấy phòng này. Dùng "taixiu room" để xem danh sách.');
    }
    const newRoom = ensureRoom(engine, resolved);
    taixiuData.roomId = newRoom.id;
    try {
      profiles.saveProfiles();
    } catch {}
    room = newRoom;
    return send(`✅ Đã chuyển sang ${room.config.name}. Dùng "taixiu" để xem trạng thái và đặt cược.`);
  }

  if (action === 'history') {
    return send(buildHistoryMessage(room));
  }

  if (['soicau', 'xoso', 'tips'].includes(action)) {
    return send(buildSoiCauMessage(room));
  }

  if (action === 'pool') {
    return send(buildPoolMessage(room, round));
  }

  if (action === 'my') {
    return send(buildMyBetsMessage(room, round, senderId));
  }

  if (action === 'watch') {
    const mode = (args[1] || '').toLowerCase();
    const enabled = room.watchers.has(threadId);
    let shouldEnable = enabled;
    if (mode === 'on') shouldEnable = true;
    else if (mode === 'off') shouldEnable = false;
    else shouldEnable = !enabled;

    if (shouldEnable) {
      removeThreadFromAllRooms(engine, threadId);
      room.watchers.add(threadId);
      room.currentRound?.threadIds?.add(threadId);
    } else {
      removeThreadFromAllRooms(engine, threadId);
    }

    return send(shouldEnable
      ? `📡 Đã bật thông báo tự động cho ${room.config.name}.`
      : '🚫 Đã tắt thông báo tự động.');
  }

  if (action === 'stats') {
    const userStats = ensureStats(senderId);
    const totalRounds = userStats.wins + userStats.losses;
    const winRate = totalRounds > 0 ? ((userStats.wins / totalRounds) * 100).toFixed(1) : '0.0';
    const profit = userStats.totalWin - userStats.totalBet;
    const statsMsg = [
      `🎲 THỐNG KÊ TÀI XỈU – ${userName}`,
      '',
      `🎯 Tổng vé: ${totalRounds}`,
      `🏆 Thắng: ${userStats.wins} | 💥 Thua: ${userStats.losses}`,
      `📊 Win rate: ${winRate}%`,
      `💰 Tổng cược: ${formatMoney(userStats.totalBet)}`,
      `💎 Tổng ăn: ${formatMoney(userStats.totalWin)}`,
      `📈 Lợi nhuận: ${profit >= 0 ? '+' : ''}${formatMoney(profit)}`,
      `🎰 Jackpot: ${userStats.jackpots}`,
      `🔥 Streak hiện tại: ${userStats.currentStreak}`,
      `⭐ Streak cao nhất: ${userStats.maxStreak}`
    ].join('\n');
    return send(statsMsg);
  }

  if (action === 'leaderboard' || action === 'bxh') {
    return leaderboard.showLeaderboard(api, threadId, type, 'taixiu');
  }

  if (action === 'bet') {
    if (!round || round.status === 'settled') {
      return send('⏳ Hệ thống đang khởi động phiên mới, thử lại sau 1s.');
    }
    if (round.status !== 'betting') {
      return send('🥢 Phiên hiện tại đã khóa, đợi xúc xắc ra rồi đặt cho phiên kế nhé!');
    }

    const choice = args[1]?.toLowerCase();
    if (!['tai', 'xiu'].includes(choice)) {
      return send('❌ Chọn "tai" hoặc "xiu". Ví dụ: taixiu bet tai 100000');
    }

    const betAmount = Number(args[2]);
    const { minBet, maxBet } = room.config;
    if (!betAmount || betAmount < minBet) {
      return send(`❌ Phòng này chỉ nhận từ ${formatMoney(minBet)} xu trở lên.`);
    }
    if (maxBet && betAmount > maxBet) {
      return send(`❌ Cược tối đa tại ${room.config.name} là ${formatMoney(maxBet)} xu.`);
    }

    const balance = Number(profile?.coins || 0);
    if (balance < betAmount) {
      return send(`💸 Thiếu tiền! Bạn có ${formatMoney(balance)} nhưng cần ${formatMoney(betAmount)}.`);
    }

    adjustCoins(profile, -betAmount);

    if (!round.bets[senderId]) {
      round.bets[senderId] = [];
    }
    round.bets[senderId].push({
      choice,
      amount: betAmount,
      name: userName,
      threadId,
      placedAt: Date.now()
    });
    round.totals[choice] += betAmount;
    round.threadIds.add(threadId);

    const tickets = formatUserBets(round, senderId);
    const eta = formatCountdown(getTimeLeft(round));
    const reply = [
      `✅ Đã lên kèo ${SIDE_LABEL[choice]} - ${formatMoney(betAmount)} tại ${room.config.name} (phiên #${round.id}).`,
      `⏱️ Khoá sau ${eta}.`,
      '',
      tickets
    ];
    return send(reply.join('\n'));
  }

  return send(helpLines.join('\n'));
};
