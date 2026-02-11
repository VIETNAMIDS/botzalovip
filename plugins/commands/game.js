const fs = require('fs');
const path = require('path');
const profiles = require('../shared/profiles');

// Global farm data storage
if (!global.bonzFarmData) {
  global.bonzFarmData = new Map();
}

// Farm data file path
const FARM_DATA_FILE = path.join(__dirname, '../../data/bonzfarm_data.json');

// Ensure data directory exists
const dataDir = path.dirname(FARM_DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Helper: safe chunked send for long messages
async function sendChunked(api, text, threadId, type, size = 1800) {
  const str = String(text || '');
  for (let i = 0; i < str.length; i += size) {
    const part = str.slice(i, i + size);
    try {
      // Try normal send first
      // eslint-disable-next-line no-await-in-loop
      await api.sendMessage(part, threadId, type);
    } catch (e) {
      // Fallback: try again once
      try { /* eslint-disable no-await-in-loop */ await api.sendMessage(part, threadId, type); } catch {}
    }
  }
}

// Eager-load farm data on module load to survive loaders that don't call onLoad
try { loadFarmData(); } catch (e) { console.error('[BONZ FARM] Initial load error:', e); }

// 10 CROP TYPES
const CROPS = {
  RICE: { name: "🌾 Lúa", growTime: 15*60*1000, seedCost: 100, sellPrice: 200, exp: 25 },
  CORN: { name: "🌽 Ngô", growTime: 12*60*1000, seedCost: 80, sellPrice: 160, exp: 20 },
  TOMATO: { name: "🍅 Cà Chua", growTime: 8*60*1000, seedCost: 60, sellPrice: 120, exp: 15 },
  CARROT: { name: "🥕 Cà Rót", growTime: 6*60*1000, seedCost: 40, sellPrice: 80, exp: 12 },
  WHEAT: { name: "🌾 Lúa Mì", growTime: 20*60*1000, seedCost: 150, sellPrice: 300, exp: 35 },
  POTATO: { name: "🥔 Khoai Tây", growTime: 10*60*1000, seedCost: 70, sellPrice: 140, exp: 18 },
  CABBAGE: { name: "🥬 Bắp Cải", growTime: 14*60*1000, seedCost: 90, sellPrice: 180, exp: 22 },
  PUMPKIN: { name: "🎃 Bí Ngô", growTime: 25*60*1000, seedCost: 200, sellPrice: 400, exp: 45 },
  STRAWBERRY: { name: "🍓 Dâu Tây", growTime: 18*60*1000, seedCost: 120, sellPrice: 240, exp: 30 },
  WATERMELON: { name: "🍉 Dưa Hấu", growTime: 30*60*1000, seedCost: 300, sellPrice: 600, exp: 60 }
};

// 8 ANIMAL TYPES
const ANIMALS = {
  CHICKEN: { name: "🐔 Gà", buyCost: 500, productTime: 8*60*1000, product: "🥚 Trứng", productValue: 50, feedCost: 20 },
  COW: { name: "🐄 Bò", buyCost: 2000, productTime: 12*60*1000, product: "🥛 Sữa", productValue: 150, feedCost: 80 },
  PIG: { name: "🐷 Heo", buyCost: 1500, productTime: 10*60*1000, product: "🥓 Thịt", productValue: 120, feedCost: 60 },
  SHEEP: { name: "🐑 Cừu", buyCost: 1200, productTime: 14*60*1000, product: "🧶 Len", productValue: 100, feedCost: 50 },
  DUCK: { name: "🦆 Vịt", buyCost: 800, productTime: 9*60*1000, product: "🥚 Trứng Vịt", productValue: 70, feedCost: 30 },
  GOAT: { name: "🐐 Dê", buyCost: 1800, productTime: 16*60*1000, product: "🥛 Sữa Dê", productValue: 180, feedCost: 70 },
  RABBIT: { name: "🐰 Thỏ", buyCost: 600, productTime: 6*60*1000, product: "🧶 Lông Thỏ", productValue: 40, feedCost: 25 },
  HORSE: { name: "🐴 Ngựa", buyCost: 5000, productTime: 24*60*1000, product: "🏃 Sức Lao Động", productValue: 500, feedCost: 150 }
};

// 12 BUILDING TYPES
const BUILDINGS = {
  BARN: { name: "🏚️ Chuồng Trại", cost: 1000, capacity: 5, type: "animal" },
  SILO: { name: "🏗️ Kho Thóc", cost: 800, capacity: 100, type: "storage" },
  GREENHOUSE: { name: "🏠 Nhà Kính", cost: 2000, boost: 1.5, type: "crop_boost" },
  WELL: { name: "🚰 Giếng Nước", cost: 1500, effect: "water", type: "utility" },
  WINDMILL: { name: "🌪️ Cối Xay Gió", cost: 3000, effect: "process", type: "production" },
  FENCE: { name: "🚧 Hàng Rào", cost: 500, effect: "protect", type: "defense" },
  TRACTOR: { name: "🚜 Máy Cày", cost: 5000, effect: "speed", type: "equipment" },
  MARKET: { name: "🏪 Chợ Nông Sản", cost: 4000, effect: "sell_boost", type: "commerce" },
  LABORATORY: { name: "🧪 Phòng Thí Nghiệm", cost: 6000, effect: "research", type: "tech" },
  WAREHOUSE: { name: "📦 Kho Hàng", cost: 2500, capacity: 200, type: "storage" },
  FACTORY: { name: "🏭 Nhà Máy Chế Biến", cost: 8000, effect: "manufacture", type: "production" },
  OFFICE: { name: "🏢 Văn Phòng Quản Lý", cost: 3500, effect: "management", type: "admin" }
};

// WEATHER SYSTEM
const WEATHER_TYPES = {
  SUNNY: { name: "☀️ Nắng", cropBoost: 1.2, animalBoost: 1.0, probability: 0.4 },
  RAINY: { name: "🌧️ Mưa", cropBoost: 1.5, animalBoost: 0.8, probability: 0.3 },
  CLOUDY: { name: "☁️ Nhiều Mây", cropBoost: 1.0, animalBoost: 1.1, probability: 0.2 },
  STORMY: { name: "⛈️ Bão", cropBoost: 0.5, animalBoost: 0.6, probability: 0.1 }
};

// SEASON SYSTEM
const SEASONS = {
  SPRING: { name: "🌸 Xuân", cropBoost: 1.3, duration: 7 },
  SUMMER: { name: "☀️ Hạ", cropBoost: 1.1, duration: 7 },
  AUTUMN: { name: "🍂 Thu", cropBoost: 1.2, duration: 7 },
  WINTER: { name: "❄️ Đông", cropBoost: 0.8, duration: 7 }
};

// ACHIEVEMENTS SYSTEM
const ACHIEVEMENTS = {
  FIRST_HARVEST: { name: "🌾 Lần Đầu Thu Hoạch", desc: "Thu hoạch lần đầu tiên", reward: 500 },
  PLANT_MASTER: { name: "🌱 Thầy Trồng Trọt", desc: "Trồng 100 cây", reward: 2000, target: 100 },
  ANIMAL_LOVER: { name: "🐄 Người Yêu Động Vật", desc: "Mua 20 động vật", reward: 3000, target: 20 },
  RICH_FARMER: { name: "💰 Nông Dân Giàu Có", desc: "Có 100,000 coins", reward: 5000, target: 100000 },
  LEVEL_10: { name: "⭐ Cấp 10", desc: "Đạt level 10", reward: 10000, target: 10 },
  BUILDER: { name: "🏗️ Kiến Trúc Sư", desc: "Xây 10 công trình", reward: 7500, target: 10 },
  WEATHER_MASTER: { name: "🌤️ Thầy Thời Tiết", desc: "Trải qua tất cả thời tiết", reward: 4000 },
  SEASON_VETERAN: { name: "🗓️ Cựu Chiến Binh", desc: "Trải qua tất cả mùa", reward: 6000 }
};

// DAILY QUESTS
const DAILY_QUESTS = {
  PLANT_QUEST: { name: "🌱 Trồng Cây", desc: "Trồng 5 cây", reward: 1000, target: 5, type: "plant" },
  HARVEST_QUEST: { name: "🌾 Thu Hoạch", desc: "Thu hoạch 3 cây", reward: 800, target: 3, type: "harvest" },
  FEED_QUEST: { name: "🍖 Cho Ăn", desc: "Cho động vật ăn 2 lần", reward: 600, target: 2, type: "feed" },
  BUILD_QUEST: { name: "🏗️ Xây Dựng", desc: "Xây 1 công trình", reward: 1500, target: 1, type: "build" },
  EARN_QUEST: { name: "💰 Kiếm Tiền", desc: "Kiếm 5000 coins", reward: 2000, target: 5000, type: "earn" }
};

function createFarm(farmName) {
  return {
    name: farmName,
    level: 1,
    exp: 0,
    expToNext: 1000,
    coins: 5000,
    plots: Array(9).fill(null), // 3x3 grid
    animals: new Map(),
    buildings: new Map(),
    inventory: new Map(),
    lastActive: Date.now(),
    totalEarnings: 0,
    achievements: [],
    weather: "SUNNY",
    season: "SPRING",
    weatherChangeTime: Date.now() + 2*60*60*1000, // 2 hours
    seasonChangeTime: Date.now() + 7*24*60*60*1000, // 7 days
    dailyQuests: generateDailyQuests(),
    questProgress: new Map(),
    lastQuestReset: Date.now(),
    statistics: {
      totalPlanted: 0,
      totalHarvested: 0,
      totalAnimalsOwned: 0,
      totalBuildings: 0,
      totalFeedTimes: 0,
      weathersExperienced: new Set(["SUNNY"]),
      seasonsExperienced: new Set(["SPRING"])
    }
  };
}

function generateDailyQuests() {
  const questKeys = Object.keys(DAILY_QUESTS);
  const selectedQuests = [];
  
  // Select 3 random quests
  for (let i = 0; i < 3; i++) {
    const randomIndex = Math.floor(Math.random() * questKeys.length);
    const questKey = questKeys[randomIndex];
    if (!selectedQuests.includes(questKey)) {
      selectedQuests.push(questKey);
    }
  }
  
  return selectedQuests;
}

function saveFarmData() {
  try {
    const dataToSave = {};
    for (const [key, data] of global.bonzFarmData.entries()) {
      dataToSave[key] = {
        ...data,
        animals: Object.fromEntries(data.animals),
        buildings: Object.fromEntries(data.buildings),
        inventory: Object.fromEntries(data.inventory)
      };
    }
    fs.writeFileSync(FARM_DATA_FILE, JSON.stringify(dataToSave, null, 2));
  } catch (error) {
    console.error('[BONZ FARM] Save error:', error);
  }
}

// Expose saver for other modules (e.g., unified wallet in fishing.js)
if (!global.saveFarmData) global.saveFarmData = saveFarmData;

function loadFarmData() {
  try {
    if (fs.existsSync(FARM_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(FARM_DATA_FILE, 'utf8'));
      for (const [key, farmData] of Object.entries(data)) {
        global.bonzFarmData.set(key, {
          ...farmData,
          animals: new Map(Object.entries(farmData.animals || {})),
          buildings: new Map(Object.entries(farmData.buildings || {})),
          inventory: new Map(Object.entries(farmData.inventory || {}))
        });
      }
    }
  } catch (error) {
    console.error('[BONZ FARM] Load error:', error);
  }
}

module.exports = {
  config: {
    name: "game",
    version: "1.0.0",
    hasPermission: 0,
    credits: "Bonz Farm System",
    description: "Nông trại ảo với 40+ chức năng",
    commandCategory: "Game",
    usages: "game farm [action]",
    cooldowns: 3
  },

  onLoad: () => {
    loadFarmData();
    console.log('[BONZ FARM] Loaded farm data successfully!');
    try {
      // Clear previous interval if hot-reloaded
      if (global.bonzFarmAutoSaveId) {
        clearInterval(global.bonzFarmAutoSaveId);
      }
      // Autosave every 5 minutes
      global.bonzFarmAutoSaveId = setInterval(() => {
        try { saveFarmData(); } catch (e) { console.error('[BONZ FARM] Autosave error:', e); }
      }, 5 * 60 * 1000);

      // Register graceful shutdown once
      if (!global.__bonzFarmShutdownHook) {
        const doSave = () => { try { saveFarmData(); } catch (e) {} };
        // Increase listener cap to avoid warnings in dev/hot-reload environments
        try { typeof process.setMaxListeners === 'function' && process.setMaxListeners(50); } catch {}
        // Only attach if not already attached
        if (process.listenerCount('SIGINT') === 0) {
          process.on('SIGINT', () => { doSave(); setTimeout(() => process.exit(0), 50); });
        }
        if (process.listenerCount('SIGTERM') === 0) {
          process.on('SIGTERM', () => { doSave(); setTimeout(() => process.exit(0), 50); });
        }
        if (process.listenerCount('beforeExit') === 0) {
          process.on('beforeExit', () => { doSave(); });
        }
        global.__bonzFarmShutdownHook = true;
      }
    } catch (e) {
      console.error('[BONZ FARM] onLoad hook error:', e);
    }
  },

  run: async function({ api, event, args }) {
    const { threadId, type } = event;
    const senderId = event?.data?.uidFrom || event?.authorId;
    console.log('[BONZ FARM] Run called with event:', { threadId, senderId, args });
    if (!global.__bonzFarmLoaded) { try { loadFarmData(); } catch (e) {} global.__bonzFarmLoaded = true; }
    
    if (!threadId) {
      console.error('[BONZ FARM] ThreadId is missing from event!');
      return;
    }
    // Enforce profile registration before any game actions
    try {
      if (!profiles.hasProfile(senderId)) {
        return api.sendMessage(
          "⚠️ M chưa có hồ sơ game. Gõ: 'profile create <tên>' để tạo trước rồi quay lại chơi nha.",
          threadId,
          type
        );
      }
    } catch {}
    
    const playerKey = `${threadId}_${senderId}`;
    
    try {
      // Check if first argument is "farm"
      if (!args[0] || args[0].toLowerCase() !== 'farm') {
        return sendChunked(api, "🎮 **GAME MENU**\n\n🚜 **FARM GAME:**\n• game farm - Vào game nông trại\n• game farm create <tên> - Tạo nông trại\n• game farm help - Hướng dẫn\n\n💡 Gõ 'game farm' để bắt đầu!", threadId, type);
      }

      // Remove "farm" from args and process the rest
      const farmArgs = args.slice(1);
      
      if (!farmArgs[0]) {
        return showFarmMenu(api, threadId, type);
      }

      const action = farmArgs[0].toLowerCase();
      
      switch (action) {
        case 'create':
        case 'start':
          return createNewFarm(api, threadId, senderId, type, farmArgs.slice(1).join(' '));
        
        case 'status':
        case 'info':
          return showFarmStatus(api, threadId, senderId, type);
        
        case 'detail':
        case 'details':
          return showFarmDetail(api, threadId, senderId, type);
        
        case 'plant':
          return plantCrop(api, threadId, senderId, type, farmArgs[1], parseInt(farmArgs[2]) || 0);
        
        case 'harvest':
          return harvestCrops(api, threadId, senderId, type);
        
        case 'buy':
          return buyAnimal(api, threadId, senderId, type, farmArgs[1]);
        
        case 'feed':
          return feedAnimals(api, threadId, senderId, type);
        
        case 'collect':
          return collectProducts(api, threadId, senderId, type);
        
        case 'build':
          return buildStructure(api, threadId, senderId, type, farmArgs[1]);
        
        case 'inventory':
        case 'inv':
          return showInventory(api, threadId, senderId, type);
        
        case 'market':
          return showMarket(api, threadId, senderId, type);
        
        case 'help':
          return showHelp(api, threadId, type);
        
        case 'weather':
          return showWeather(api, threadId, senderId, type);
        
        case 'achievements':
        case 'achieve':
          return showAchievements(api, threadId, senderId, type);
        
        case 'quests':
        case 'quest':
          return showQuests(api, threadId, senderId, type);
        
        case 'stats':
          return showStatistics(api, threadId, senderId, type);
        
        case 'trade':
          return handleTrade(api, threadId, senderId, type, farmArgs.slice(1));
        
        case 'expand':
          return expandFarm(api, threadId, senderId, type);
        
        default:
          return showFarmMenu(api, threadId, type);
      }
    } catch (error) {
      console.error('[BONZ FARM] Error:', error);
      return api.sendMessage("❌ Có lỗi xảy ra trong Bonz Farm!", threadId, type);
    }
  }
};

async function showFarmMenu(api, threadId, type) {
  try {
    let message = `🚜 **BONZ FARM - NÔNG TRẠI ẢO**\n\n`;
    message += `📋 **CÁC LỆNH CHÍNH:**\n`;
    message += `• game farm create <tên> - Tạo nông trại\n`;
    message += `• game farm status - Xem thông tin farm\n`;
    message += `• game farm detail - Chi tiết nông trại (phút còn lại)\n`;
    message += `• game farm plant <cây> <vị_trí> - Trồng cây\n`;
    message += `• game farm harvest - Thu hoạch\n`;
    message += `• game farm buy <động_vật> - Mua động vật\n`;
    message += `• game farm feed - Cho ăn động vật\n`;
    message += `• game farm collect - Thu sản phẩm\n`;
    message += `• game farm build <công_trình> - Xây dựng\n`;
    message += `• game farm inventory - Xem kho\n`;
    message += `• game farm market - Chợ nông sản\n`;
    message += `• game farm weather - Xem thời tiết\n`;
    message += `• game farm quests - Nhiệm vụ hàng ngày\n`;
    message += `• game farm achievements - Thành tựu\n`;
    message += `• game farm stats - Thống kê\n`;
    message += `• game farm trade - Giao dịch\n`;
    message += `• game farm expand - Mở rộng\n\n`;
    message += `🌱 **40+ CHỨC NĂNG:**\n`;
    message += `🌾 10 loại cây trồng\n`;
    message += `🐄 8 loại động vật\n`;
    message += `🏗️ 12 loại công trình\n`;
    message += `🌤️ Hệ thống thời tiết & mùa\n`;
    message += `🏆 Thành tựu & nhiệm vụ\n`;
    message += `📊 Thống kê chi tiết\n\n`;
    message += `💡 Gõ "game farm help" để xem hướng dẫn chi tiết!`;
    
    console.log('[BONZ FARM] Sending menu to threadId:', threadId);
    return sendChunked(api, message, threadId, type);
  } catch (error) {
    console.error('[BONZ FARM] Error in showFarmMenu:', error);
    return api.sendMessage("❌ Lỗi hiển thị menu farm!", threadId, type);
  }
}

async function createNewFarm(api, threadId, senderId, type, farmName) {
  try {
    console.log('[BONZ FARM] createNewFarm called with:', { threadId, senderId, farmName });
    
    if (!threadId) {
      console.error('[BONZ FARM] ThreadId is undefined!');
      return;
    }
    
    const playerKey = `${threadId}_${senderId}`;
    
    if (global.bonzFarmData.has(playerKey)) {
      return api.sendMessage("❌ Bạn đã có nông trại rồi! Dùng `game farm status` để xem.", threadId, type);
    }
    
    if (!farmName || farmName.trim() === '') {
      farmName = "Nông Trại Mới";
    }
    
    const farm = createFarm(farmName.trim());
    global.bonzFarmData.set(playerKey, farm);
    saveFarmData();
    
    let message = `🎉 **CHÚC MỪNG! BẠN ĐÃ TẠO NÔNG TRẠI!**\n\n`;
    message += `🚜 **${farm.name}**\n`;
    message += `📊 Level: ${farm.level} | EXP: ${farm.exp}/${farm.expToNext}\n`;
    message += `💰 Coins: ${farm.coins.toLocaleString()}\n`;
    message += `🌱 Plots: 9 ô đất (3x3)\n`;
    message += `🌤️ Thời tiết: ${farm.weather}\n`;
    message += `🌸 Mùa: ${farm.season}\n\n`;
    message += `💡 Bắt đầu bằng cách trồng cây: game farm plant rice 0`;
    
    console.log('[BONZ FARM] Sending message to threadId:', threadId);
    return api.sendMessage(message, threadId, type);
  } catch (error) {
    console.error('[BONZ FARM] Error in createNewFarm:', error);
    return api.sendMessage("❌ Lỗi tạo nông trại!", threadId, type);
  }
}

async function showFarmStatus(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại! Dùng `game farm create <tên>` để tạo.", threadId, type);
  }
  
  let message = `🚜 **NÔNG TRẠI ${farm.name.toUpperCase()}**\n\n`;
  message += `📊 **THÔNG TIN CHUNG:**\n`;
  message += `🎯 Level: ${farm.level} | EXP: ${farm.exp}/${farm.expToNext}\n`;
  message += `💰 Coins: ${farm.coins.toLocaleString()}\n`;
  message += `💎 Tổng thu nhập: ${farm.totalEarnings.toLocaleString()}\n`;
  message += `🌤️ Thời tiết: ${farm.weather} | Mùa: ${farm.season}\n\n`;
  
  // Show plots
  message += `🌱 **ĐẤT TRỒNG (3x3):**\n`;
  for (let i = 0; i < 9; i += 3) {
    let row = '';
    for (let j = 0; j < 3; j++) {
      const plot = farm.plots[i + j];
      if (plot) {
        const crop = CROPS[plot.type];
        const timeLeft = Math.max(0, plot.harvestTime - Date.now());
        if (timeLeft > 0) {
          row += `🌱 `;
        } else {
          row += `🌾 `;
        }
      } else {
        row += `🟫 `;
      }
    }
    message += `${row}\n`;
  }
  
  // Show animals
  if (farm.animals.size > 0) {
    message += `\n🐄 **ĐỘNG VẬT:**\n`;
    for (const [type, count] of farm.animals.entries()) {
      const animal = ANIMALS[type];
      message += `${animal.name}: ${count}\n`;
    }
  }
  
  // Show buildings
  if (farm.buildings.size > 0) {
    message += `\n🏗️ **CÔNG TRÌNH:**\n`;
    for (const [type, count] of farm.buildings.entries()) {
      const building = BUILDINGS[type];
      message += `${building.name}: ${count}\n`;
    }
  }
  
  return api.sendMessage(message, threadId, type);
}

function minutesLeft(ms) {
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60000);
}

async function showFarmDetail(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại! Dùng `game farm create <tên>` để tạo.", threadId, type);
  }

  const now = Date.now();
  updateEnvironment(farm);

  let message = `📋 CHI TIẾT • ${farm.name}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 Level ${farm.level} • ⭐ ${farm.exp}/${farm.expToNext} • 💰 ${farm.coins.toLocaleString()}\n`;
  message += `🌤️ ${(WEATHER_TYPES[farm.weather]?.name)||farm.weather} • 🗓️ ${(SEASONS[farm.season]?.name)||farm.season}\n`;

  // Timers for env
  if (farm.weatherChangeTime) {
    const wMin = minutesLeft(farm.weatherChangeTime - now);
    message += `⏱️ Đổi thời tiết sau: ${wMin} phút\n`;
  }
  if (farm.seasonChangeTime) {
    const sMin = minutesLeft(farm.seasonChangeTime - now);
    message += `📆 Đổi mùa sau: ${sMin} phút\n`;
  }

  // Plots detail
  message += `\n🟩 Ô ĐẤT (phút còn lại)\n`;
  for (let i = 0; i < farm.plots.length; i++) {
    const plot = farm.plots[i];
    if (!plot) {
      message += `• Ô ${i}: Trống\n`;
    } else {
      const crop = CROPS[plot.type];
      const remain = minutesLeft((plot.harvestTime || 0) - now);
      const status = remain > 0 ? `${remain}p` : `0p (Đã chín)`;
      message += `• Ô ${i}: ${crop?.name || plot.type} → ${status}\n`;
    }
  }

  // Animals detail
  message += `\n🐄 VẬT NUÔI`;
  if (farm.animals.size === 0) {
    message += `\n• Chưa có động vật`;
  } else {
    message += `\n`;
    for (const [aType, count] of farm.animals.entries()) {
      const animal = ANIMALS[aType];
      let line = `• ${animal?.name || aType}: ${count}`;
      if (farm.lastFeedTime) {
        const readyAt = farm.lastFeedTime + (animal?.productTime || 0);
        const aRemain = minutesLeft(readyAt - now);
        line += ` | Sản phẩm: ${aRemain > 0 ? `${aRemain}p` : '0p (Sẵn sàng)'}`;
      } else {
        line += ` | Chưa cho ăn`;
      }
      message += line + `\n`;
    }
  }

  // Buildings
  if (farm.buildings.size > 0) {
    message += `\n🏗️ CÔNG TRÌNH\n`;
    for (const [bType, count] of farm.buildings.entries()) {
      const building = BUILDINGS[bType];
      message += `• ${building?.name || bType}: ${count}\n`;
    }
  }

  // Tips
  message += `\n💡 Mẹo: Dùng 'game farm harvest' để thu cây đã chín, 'game farm collect' để lấy sản phẩm vật nuôi.`;

  return api.sendMessage(message, threadId, type);
}

async function plantCrop(api, threadId, senderId, type, cropType, plotIndex) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại! Dùng `game farm create <tên>` để tạo.", threadId, type);
  }
  
  if (!cropType) {
    let message = `🌱 **DANH SÁCH CÂY TRỒNG (CHỌN THEO SỐ):**\n\n`;
    const cropKeys = Object.keys(CROPS);
    cropKeys.forEach((key, idx) => {
      const crop = CROPS[key];
      const time = Math.floor(crop.growTime / (60 * 1000));
      message += `${idx + 1}. ${crop.name} - ${crop.seedCost} coins (${time}p)\n`;
    });
    message += `\n💡 Cú pháp: game farm plant <số|loại_cây> <vị_trí_0-8>`;
    return api.sendMessage(message, threadId, type);
  }
  
  // Cho phép chọn theo số thứ tự hoặc theo mã loại cây
  let cropKey = cropType.toUpperCase();
  if (/^\d+$/.test(cropType)) {
    const idx = parseInt(cropType, 10) - 1;
    const keys = Object.keys(CROPS);
    if (idx >= 0 && idx < keys.length) {
      cropKey = keys[idx];
    } else {
      return api.sendMessage("❌ Số lựa chọn không hợp lệ! Vui lòng chọn theo danh sách.", threadId, type);
    }
  }
  const crop = CROPS[cropKey];
  
  if (!crop) {
    return api.sendMessage("❌ Loại cây không hợp lệ! Dùng `game farm plant` để xem danh sách có đánh số.", threadId, type);
  }
  
  if (plotIndex < 0 || plotIndex > 8) {
    return api.sendMessage("❌ Vị trí không hợp lệ! Chọn từ 0-8.", threadId, type);
  }
  
  if (farm.plots[plotIndex]) {
    return api.sendMessage("❌ Ô đất này đã có cây rồi!", threadId, type);
  }
  
  if (farm.coins < crop.seedCost) {
    return api.sendMessage(`❌ Không đủ coins! Cần ${crop.seedCost} coins.`, threadId, type);
  }
  
  farm.coins -= crop.seedCost;
  farm.plots[plotIndex] = {
    type: cropKey,
    plantTime: Date.now(),
    harvestTime: Date.now() + crop.growTime
  };
  
  saveFarmData();
  
  const time = Math.floor(crop.growTime / (60 * 1000));
  let message = `🌱 **ĐÃ TRỒNG THÀNH CÔNG!**\n\n`;
  message += `${crop.name} tại vị trí ${plotIndex}\n`;
  message += `💰 Chi phí: -${crop.seedCost} coins\n`;
  message += `⏰ Thời gian: ${time} phút\n`;
  message += `💰 Coins còn lại: ${farm.coins.toLocaleString()}`;
  
  return api.sendMessage(message, threadId, type);
}

async function harvestCrops(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);
  }
  
  const now = Date.now();
  let harvested = 0;
  let totalEarnings = 0;
  let totalExp = 0;
  
  for (let i = 0; i < farm.plots.length; i++) {
    const plot = farm.plots[i];
    if (plot && plot.harvestTime && now >= plot.harvestTime) {
      // Normalize stored crop key to avoid crashes with legacy data
      let cropKey = String(plot.type || '').toUpperCase();
      if (/^\d+$/.test(cropKey)) {
        const keys = Object.keys(CROPS);
        const idx = parseInt(cropKey, 10) - 1; // legacy 1-based index
        if (idx >= 0 && idx < keys.length) cropKey = keys[idx];
      }

      const crop = CROPS[cropKey];
      if (!crop) {
        // Unknown crop type, clean the plot and skip
        farm.plots[i] = null;
        continue;
      }

      farm.coins += crop.sellPrice;
      farm.exp += crop.exp;
      totalEarnings += crop.sellPrice;
      totalExp += crop.exp;
      harvested++;

      // Add to inventory using normalized key
      const currentAmount = farm.inventory.get(cropKey) || 0;
      farm.inventory.set(cropKey, currentAmount + 1);

      farm.plots[i] = null;
    }
  }
  
  if (harvested === 0) {
    return api.sendMessage("❌ Không có cây nào sẵn sàng thu hoạch!", threadId, type);
  }
  
  // Level up check
  let levelUp = false;
  while (farm.exp >= farm.expToNext) {
    farm.level++;
    farm.exp -= farm.expToNext;
    farm.expToNext = farm.level * 1000;
    levelUp = true;
  }
  
  farm.totalEarnings += totalEarnings;
  saveFarmData();
  
  let message = `🌾 **THU HOẠCH THÀNH CÔNG!**\n\n`;
  message += `📊 Thu hoạch: ${harvested} cây\n`;
  message += `💰 Thu nhập: +${totalEarnings.toLocaleString()} coins\n`;
  message += `⭐ EXP: +${totalExp}\n`;
  message += `💰 Tổng coins: ${farm.coins.toLocaleString()}\n`;
  
  if (levelUp) {
    message += `\n🎊 **LEVEL UP!** Level ${farm.level}\n`;
    message += `🎁 Mở khóa tính năng mới!`;
  }
  
  return api.sendMessage(message, threadId, type);
}

async function showHelp(api, threadId, type) {
  let message = `📚 **HƯỚNG DẪN BONZ FARM**\n\n`;
  message += `🌱 **TRỒNG TRỌT:**\n`;
  message += `• detail - Xem chi tiết farm (phút còn lại)\n`;
  message += `• plant <số|cây> <vị_trí> - Trồng cây\n`;
  message += `• harvest - Thu hoạch cây chín\n\n`;
  message += `🐄 **CHĂN NUÔI:**\n`;
  message += `• buy <động_vật> - Mua động vật\n`;
  message += `• feed - Cho ăn động vật\n`;
  message += `• collect - Thu sản phẩm\n\n`;
  message += `🏗️ **XÂY DỰNG:**\n`;
  message += `• build <công_trình> - Xây công trình\n`;
  message += `• inventory - Xem kho đồ\n`;
  message += `• market - Chợ mua bán\n\n`;
  message += `💡 **MẸO:**\n`;
  message += `• Vị trí đất: 0-8 (3x3 grid)\n`;
  message += `• Level cao → Mở khóa nhiều tính năng\n`;
  message += `• Thu hoạch đúng lúc để tối đa hóa lợi nhuận`;
  
  return api.sendMessage(message, threadId, type);
}

async function buyAnimal(api, threadId, senderId, type, animalType) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);
  }
  
  if (!animalType) {
    let message = `🐄 **DANH SÁCH ĐỘNG VẬT (CHỌN THEO SỐ):**\n\n`;
    const animalKeys = Object.keys(ANIMALS);
    animalKeys.forEach((key, idx) => {
      const animal = ANIMALS[key];
      const time = Math.floor(animal.productTime / (60 * 1000));
      message += `${idx + 1}. ${animal.name} - ${animal.buyCost.toLocaleString()} coins | SP: ${animal.product} (${time}p)\n`;
    });
    message += `\n💡 Cú pháp: game farm buy <số|loại_động_vật>`;
    return api.sendMessage(message, threadId, type);
  }
  
  // Cho phép chọn theo số thứ tự hoặc theo mã động vật
  let animalKey = animalType.toUpperCase();
  if (/^\d+$/.test(animalType)) {
    const idx = parseInt(animalType, 10) - 1;
    const keys = Object.keys(ANIMALS);
    if (idx >= 0 && idx < keys.length) {
      animalKey = keys[idx];
    } else {
      return api.sendMessage("❌ Số lựa chọn không hợp lệ! Vui lòng chọn theo danh sách.", threadId, type);
    }
  }
  const animal = ANIMALS[animalKey];
  
  if (!animal) {
    return api.sendMessage("❌ Loại động vật không hợp lệ!", threadId, type);
  }
  
  if (farm.coins < animal.buyCost) {
    return api.sendMessage(`❌ Không đủ coins! Cần ${animal.buyCost.toLocaleString()} coins.`, threadId, type);
  }
  
  farm.coins -= animal.buyCost;
  const currentCount = farm.animals.get(animalKey) || 0;
  farm.animals.set(animalKey, currentCount + 1);
  
  saveFarmData();
  
  let message = `🐄 **MUA ĐỘNG VẬT THÀNH CÔNG!**\n\n`;
  message += `${animal.name} x1\n`;
  message += `💰 Chi phí: -${animal.buyCost.toLocaleString()} coins\n`;
  message += `🥛 Sản phẩm: ${animal.product}\n`;
  message += `💰 Coins còn lại: ${farm.coins.toLocaleString()}`;
  
  return api.sendMessage(message, threadId, type);
}

async function feedAnimals(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);
  }
  
  if (farm.animals.size === 0) {
    return api.sendMessage("❌ Bạn chưa có động vật nào!", threadId, type);
  }
  
  let totalCost = 0;
  let fedAnimals = 0;
  
  for (const [type, count] of farm.animals.entries()) {
    const animal = ANIMALS[type];
    const feedCost = animal.feedCost * count;
    totalCost += feedCost;
    fedAnimals += count;
  }
  
  if (farm.coins < totalCost) {
    return api.sendMessage(`❌ Không đủ coins để cho ăn! Cần ${totalCost.toLocaleString()} coins.`, threadId, type);
  }
  
  farm.coins -= totalCost;
  farm.lastFeedTime = Date.now();
  
  saveFarmData();
  
  let message = `🍖 **CHO ĂN ĐỘNG VẬT THÀNH CÔNG!**\n\n`;
  message += `🐄 Số động vật: ${fedAnimals}\n`;
  message += `💰 Chi phí: -${totalCost.toLocaleString()} coins\n`;
  message += `⏰ Sản phẩm sẵn sàng sau vài phút\n`;
  message += `💰 Coins còn lại: ${farm.coins.toLocaleString()}`;
  
  return api.sendMessage(message, threadId, type);
}

async function collectProducts(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);
  }
  
  if (farm.animals.size === 0) {
    return api.sendMessage("❌ Bạn chưa có động vật nào!", threadId, type);
  }
  
  if (!farm.lastFeedTime) {
    return api.sendMessage("❌ Bạn cần cho động vật ăn trước!", threadId, type);
  }
  
  const now = Date.now();
  let totalEarnings = 0;
  let totalExp = 0;
  let productsCollected = [];
  
  for (const [type, count] of farm.animals.entries()) {
    const animal = ANIMALS[type];
    const timeSinceFeed = now - farm.lastFeedTime;
    
    if (timeSinceFeed >= animal.productTime) {
      const earnings = animal.productValue * count;
      totalEarnings += earnings;
      totalExp += count * 10;
      productsCollected.push(`${animal.product} x${count}`);
      
      const currentAmount = farm.inventory.get(type + '_PRODUCT') || 0;
      farm.inventory.set(type + '_PRODUCT', currentAmount + count);
    }
  }
  
  if (totalEarnings === 0) {
    const timeLeft = Math.max(0, Math.min(...Array.from(farm.animals.keys()).map(type => 
      ANIMALS[type].productTime - (now - farm.lastFeedTime)
    )));
    const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
    return api.sendMessage(`❌ Sản phẩm chưa sẵn sàng! Còn ${minutesLeft} phút.`, threadId, type);
  }
  
  farm.coins += totalEarnings;
  farm.exp += totalExp;
  farm.totalEarnings += totalEarnings;
  farm.lastFeedTime = null;
  
  saveFarmData();
  
  let message = `🥛 **THU SẢN PHẨM THÀNH CÔNG!**\n\n`;
  message += `📦 Sản phẩm: ${productsCollected.join(', ')}\n`;
  message += `💰 Thu nhập: +${totalEarnings.toLocaleString()} coins\n`;
  message += `⭐ EXP: +${totalExp}\n`;
  message += `💰 Tổng coins: ${farm.coins.toLocaleString()}`;
  
  return api.sendMessage(message, threadId, type);
}

async function buildStructure(api, threadId, senderId, type, buildingType) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);
  }
  
  if (!buildingType) {
    let message = `🏗️ **DANH SÁCH CÔNG TRÌNH:**\n\n`;
    Object.entries(BUILDINGS).forEach(([key, building]) => {
      message += `${building.name} - ${building.cost.toLocaleString()} coins\n`;
      message += `   Loại: ${building.type}\n`;
    });
    message += `\n💡 Cú pháp: game farm build <công_trình>`;
    return api.sendMessage(message, threadId, type);
  }
  
  const buildingKey = buildingType.toUpperCase();
  const building = BUILDINGS[buildingKey];
  
  if (!building) {
    return api.sendMessage("❌ Loại công trình không hợp lệ!", threadId, type);
  }
  
  if (farm.coins < building.cost) {
    return api.sendMessage(`❌ Không đủ coins! Cần ${building.cost.toLocaleString()} coins.`, threadId, type);
  }
  
  farm.coins -= building.cost;
  const currentCount = farm.buildings.get(buildingKey) || 0;
  farm.buildings.set(buildingKey, currentCount + 1);
  farm.exp += 100;
  
  saveFarmData();
  
  let message = `🏗️ **XÂY DỰNG THÀNH CÔNG!**\n\n`;
  message += `${building.name} x1\n`;
  message += `💰 Chi phí: -${building.cost.toLocaleString()} coins\n`;
  message += `⭐ EXP: +100\n`;
  message += `💰 Coins còn lại: ${farm.coins.toLocaleString()}`;
  
  return api.sendMessage(message, threadId, type);
}

async function showInventory(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);
  }
  
  let message = `📦 **KHO ĐỒ - ${farm.name.toUpperCase()}**\n\n`;
  message += `💰 Coins: ${farm.coins.toLocaleString()}\n`;
  message += `📊 Level: ${farm.level} | EXP: ${farm.exp}/${farm.expToNext}\n\n`;
  
  if (farm.inventory.size === 0) {
    message += `📦 Kho trống! Hãy trồng cây và chăn nuôi để có sản phẩm.`;
  } else {
    message += `📦 **SẢN PHẨM TRONG KHO:**\n`;
    for (const [item, quantity] of farm.inventory.entries()) {
      if (item.includes('_PRODUCT')) {
        const animalType = item.replace('_PRODUCT', '');
        const animal = ANIMALS[animalType];
        if (animal) {
          message += `${animal.product}: ${quantity}\n`;
        }
      } else {
        const crop = CROPS[item];
        if (crop) {
          message += `${crop.name}: ${quantity}\n`;
        }
      }
    }
  }
  
  return api.sendMessage(message, threadId, type);
}

async function showMarket(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  
  if (!farm) {
    return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);
  }
  
  let message = `🏪 CHỢ NÔNG SẢN • ${farm.name.toUpperCase()}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `💰 Coins: ${farm.coins.toLocaleString()}\n\n`;
  
  message += `🌱 HẠT GIỐNG\n`;
  Object.entries(CROPS).forEach(([key, crop]) => {
    const time = Math.floor(crop.growTime / (60 * 1000));
    message += `${crop.name}: ${crop.seedCost} → ${crop.sellPrice} (${time}p)\n`;
  });
  
  message += `\n🐄 ĐỘNG VẬT\n`;
  Object.entries(ANIMALS).forEach(([key, animal]) => {
    message += `${animal.name}: ${animal.buyCost.toLocaleString()} coins\n`;
  });
  
  message += `\n🏗️ CÔNG TRÌNH\n`;
  Object.entries(BUILDINGS).forEach(([key, building]) => {
    message += `${building.name}: ${building.cost.toLocaleString()} coins\n`;
  });
  
  message += `\n💡 Dùng: game farm plant | game farm buy | game farm build`;
  return sendChunked(api, message, threadId, type);
}

// =========================
// EXTRA FEATURES (STUBS)
// =========================

function updateEnvironment(farm) {
  try {
    const now = Date.now();
    // Update weather if time passed
    if (farm.weatherChangeTime && now >= farm.weatherChangeTime) {
      if (typeof WEATHER_TYPES !== 'undefined') {
        const pool = Object.keys(WEATHER_TYPES);
        const pick = pool[Math.floor(Math.random() * pool.length)] || 'SUNNY';
        farm.weather = pick;
      }
      farm.weatherChangeTime = now + 2 * 60 * 60 * 1000;
      if (farm.statistics && farm.statistics.weathersExperienced) {
        try { farm.statistics.weathersExperienced.add?.(farm.weather); } catch {}
      }
    }
    // Update season if time passed
    if (farm.seasonChangeTime && now >= farm.seasonChangeTime) {
      if (typeof SEASONS !== 'undefined') {
        const order = ['SPRING','SUMMER','AUTUMN','WINTER'];
        const idx = Math.max(0, order.indexOf(farm.season));
        farm.season = order[(idx + 1) % order.length];
      }
      farm.seasonChangeTime = now + 7 * 24 * 60 * 60 * 1000;
      if (farm.statistics && farm.statistics.seasonsExperienced) {
        try { farm.statistics.seasonsExperienced.add?.(farm.season); } catch {}
      }
    }
  } catch {}
}

async function showWeather(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  if (!farm) return api.sendMessage("❌ Bạn chưa có nông trại! Dùng `game farm create <tên>` để tạo.", threadId, type);

  updateEnvironment(farm);

  const weatherName = (typeof WEATHER_TYPES !== 'undefined' && WEATHER_TYPES[farm.weather]?.name) || farm.weather || 'SUNNY';
  const seasonName = (typeof SEASONS !== 'undefined' && SEASONS[farm.season]?.name) || farm.season || 'SPRING';
  const cropBoost = (typeof WEATHER_TYPES !== 'undefined' && WEATHER_TYPES[farm.weather]?.cropBoost) || 1.0;
  const animalBoost = (typeof WEATHER_TYPES !== 'undefined' && WEATHER_TYPES[farm.weather]?.animalBoost) || 1.0;

  let msg = `🌤️ THỜI TIẾT & MÙA VỤ\n\n`;
  msg += `• Thời tiết hiện tại: ${weatherName}\n`;
  msg += `• Mùa hiện tại: ${seasonName}\n`;
  msg += `• Tăng trưởng cây: x${cropBoost}\n`;
  msg += `• Năng suất vật nuôi: x${animalBoost}`;
  return api.sendMessage(msg, threadId, type);
}

async function showAchievements(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  if (!farm) return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);

  const achieved = Array.isArray(farm.achievements) ? farm.achievements : [];
  let msg = `🏆 THÀNH TỰU\n\n`;
  if (achieved.length === 0) {
    msg += `Chưa có thành tựu nào. Hãy tiếp tục chơi để mở khóa!`;
  } else {
    for (const a of achieved) {
      const aName = (typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS[a]?.name) || a;
      const aDesc = (typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS[a]?.desc) || '';
      msg += `• ${aName} ${aDesc ? `- ${aDesc}` : ''}\n`;
    }
  }
  return api.sendMessage(msg, threadId, type);
}

async function showQuests(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  if (!farm) return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);

  const quests = Array.isArray(farm.dailyQuests) ? farm.dailyQuests : [];
  let msg = `🗓️ NHIỆM VỤ HÀNG NGÀY\n\n`;
  if (quests.length === 0) {
    msg += `Chưa có nhiệm vụ hôm nay. Hãy quay lại sau!`;
  } else {
    for (const q of quests) {
      const qData = (typeof DAILY_QUESTS !== 'undefined') ? DAILY_QUESTS[q] : null;
      const qName = qData?.name || q;
      const qDesc = qData?.desc || '';
      const qTarget = qData?.target || 0;
      const progress = (farm.questProgress && farm.questProgress.get?.(q)) || 0;
      msg += `• ${qName} - ${qDesc} (${progress}/${qTarget})\n`;
    }
  }
  return api.sendMessage(msg, threadId, type);
}

async function showStatistics(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  if (!farm) return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);

  const s = farm.statistics || {};
  let msg = `📊 THỐNG KÊ NÔNG TRẠI\n\n`;
  msg += `• Trồng: ${s.totalPlanted || 0}\n`;
  msg += `• Thu hoạch: ${s.totalHarvested || 0}\n`;
  msg += `• Động vật sở hữu: ${s.totalAnimalsOwned || 0}\n`;
  msg += `• Công trình: ${s.totalBuildings || 0}\n`;
  msg += `• Lần cho ăn: ${s.totalFeedTimes || 0}\n`;
  msg += `• Tổng thu nhập: ${farm.totalEarnings?.toLocaleString?.() || 0}`;
  return api.sendMessage(msg, threadId, type);
}

async function handleTrade(api, threadId, senderId, type, args) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  if (!farm) return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);

  let msg = `🤝 GIAO DỊCH\n\n`;
  msg += `Tính năng đang phát triển. Cú pháp dự kiến:\n`;
  msg += `• game farm trade offer <userID> <item> <số lượng>\n`;
  msg += `• game farm trade accept <mã_giao_dịch>\n`;
  msg += `• game farm trade cancel <mã_giao_dịch>`;
  return api.sendMessage(msg, threadId, type);
}

async function expandFarm(api, threadId, senderId, type) {
  const playerKey = `${threadId}_${senderId}`;
  const farm = global.bonzFarmData.get(playerKey);
  if (!farm) return api.sendMessage("❌ Bạn chưa có nông trại!", threadId, type);

  const maxPlots = 25; // simple cap
  const cost = 5000;
  if (farm.plots.length >= maxPlots) {
    return api.sendMessage("🏡 Nông trại đã đạt kích thước tối đa!", threadId, type);
  }
  if (farm.coins < cost) {
    return api.sendMessage(`❌ Không đủ coins để mở rộng! Cần ${cost.toLocaleString()} coins.`, threadId, type);
  }

  farm.coins -= cost;
  farm.plots.push(null, null, null); // add 3 plots
  farm.exp = (farm.exp || 0) + 150;
  if (farm.statistics) farm.statistics.totalBuildings = (farm.statistics.totalBuildings || 0); // no-op, keep structure
  saveFarmData();

  let msg = `🧱 MỞ RỘNG NÔNG TRẠI THÀNH CÔNG!\n\n`;
  msg += `• Ô đất mới: +3 (tổng ${farm.plots.length})\n`;
  msg += `• Chi phí: -${cost.toLocaleString()} coins\n`;
  msg += `• EXP: +150\n`;
  msg += `• Coins còn lại: ${farm.coins.toLocaleString()}`;
  return api.sendMessage(msg, threadId, type);
}
