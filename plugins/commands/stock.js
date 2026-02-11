const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: "stock",
  aliases: ["chung", "ck", "stocks"],
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zeid Bot",
  description: "Chợ chứng khoán giả lập: mua/bán cổ phiếu, giá biến động mỗi giờ",
  commandCategory: "Game",
  usages: "help",
  cooldowns: 2
};

const DATA_DIR = path.join(process.cwd(), 'data');
const MARKET_FILE = path.join(DATA_DIR, 'stock_market.json');
const PORT_FILE = path.join(DATA_DIR, 'stock_portfolios.json');
const ORDERS_FILE = path.join(DATA_DIR, 'stock_orders.json');

// Fees & taxes configuration
const FEES = {
  brokerBuy: 0.001,   // 0.10% phí mua
  brokerSell: 0.001,  // 0.10% phí bán
  taxSell: 0.001      // 0.10% thuế bán
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function nowHour() { return Math.floor(Date.now() / 3600000); }
function currentWeek() { return Math.floor(Date.now() / (7 * 24 * 3600000)); }

const DEFAULT_SYMBOLS = {
  VNI: 1200,
  VIC: 70000,
  VNM: 75000,
  FPT: 130000,
  MWG: 60000,
  VCB: 90000,
  TCB: 40000,
  HPG: 27000,
  VHM: 48000,
  SSI: 32000
};

function loadJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return fallback;
}
function saveJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}

function initMarket() {
  const m = loadJSON(MARKET_FILE, null);
  if (m && m.symbols && m.lastHour != null) return m;
  const symbols = {};
  Object.entries(DEFAULT_SYMBOLS).forEach(([sym, px]) => {
    symbols[sym] = { price: px, history: [{ h: nowHour(), p: px }] };
  });
  const market = { symbols, lastHour: nowHour(), previousClose: {}, news: [], lastNewsHour: null, halts: { all: false, reason: '', symbols: {} }, limits: { pct: 0.07 }, lastLimitDayKey: '' };
  saveJSON(MARKET_FILE, market);
  return market;
}

// VN trading session 09:00-15:00 (UTC+7), Mon-Fri
function vnNow() {
  const now = new Date();
  // Force UTC+7 without relying on system TZ
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + 7 * 3600000);
}
function isWeekdayVN(dateVN) {
  const d = dateVN.getDay(); // 0 Sun ... 6 Sat
  return d >= 1 && d <= 5;
}
function isTradingOpen() {
  const d = vnNow();
  if (!isWeekdayVN(d)) return false;
  const h = d.getHours();
  const m = d.getMinutes();
  const t = h * 60 + m;
  // 09:00 (540) to 15:00 (900) inclusive end treated as closed at 15:00
  return t >= 540 && t < 900;
}
function sessionText() {
  const d = vnNow();
  const open = isTradingOpen();
  return `${open ? 'MỞ CỬA' : 'ĐÓNG CỬA'} • ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} GMT+7`;
}

function maybeDailyRoll(market) {
  // Track previousClose at start of session (09:00)
  try {
    const d = vnNow();
    const h = d.getHours();
    if (h === 9 && isTradingOpen()) {
      if (!market.previousClose) market.previousClose = {};
      for (const sym of Object.keys(market.symbols)) {
        market.previousClose[sym] = market.symbols[sym].price;
      }
      // reset halts & limits for new session
      market.halts = market.halts || { all: false, reason: '', symbols: {} };
      market.halts.all = false; market.halts.reason = '';
      market.halts.symbols = {};
      // mark day key for limits enforcement
      market.lastLimitDayKey = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    }
  } catch {}
}

function generateNewsIfNeeded(market) {
  const hNow = nowHour();
  if (market.lastNewsHour === hNow) return; // once per hour max
  market.lastNewsHour = hNow;
  // 25% chance to generate a news event with modest impact lasting 2-4 hours
  if (Math.random() < 0.25) {
    const types = [
      { title: 'Tin tốt ngành ngân hàng', impact: { VCB: 0.01, TCB: 0.012 } },
      { title: 'Cầu nội địa tăng', impact: { VNM: 0.008, MWG: 0.009 } },
      { title: 'Thị trường chung tích cực', impact: { ALL: 0.006 } },
      { title: 'Tin xấu ngành thép', impact: { HPG: -0.012 } },
      { title: 'Bất động sản ấm lên', impact: { VHM: 0.01, VIC: 0.008 } }
    ];
    const pick = types[Math.floor(Math.random() * types.length)];
    const duration = 2 + Math.floor(Math.random() * 3); // 2-4 hours
    market.news.push({ hStart: hNow, hEnd: hNow + duration, title: pick.title, impact: pick.impact });
    if (market.news.length > 10) market.news = market.news.slice(-10);
  }
}

function evolveMarket(market) {
  const hNow = nowHour();
  while (market.lastHour < hNow) {
    market.lastHour += 1;
    for (const sym of Object.keys(market.symbols)) {
      const cur = market.symbols[sym];
      let p = cur.price;
      let drift = (Math.random() - 0.5) * 0.02; // base ±1%
      // Apply active news impact
      try {
        const actives = (market.news || []).filter(n => n.hStart <= market.lastHour && market.lastHour <= n.hEnd);
        let boost = 0;
        for (const n of actives) {
          if (n.impact.ALL) boost += n.impact.ALL;
          if (n.impact[sym]) boost += n.impact[sym];
        }
        drift += boost;
      } catch {}
      const pct = Math.max(-0.08, Math.min(0.08, drift));
      p = Math.max(100, Math.round(p * (1 + pct)));
      // Enforce daily price limit relative to previous close
      try {
        const prevC = market.previousClose?.[sym];
        const limitPct = market.limits?.pct ?? 0.07;
        if (prevC) {
          const up = Math.round(prevC * (1 + limitPct));
          const dn = Math.round(prevC * (1 - limitPct));
          if (p >= up) { p = up; (market.halts.symbols ||= {}); market.halts.symbols[sym] = true; }
          if (p <= dn) { p = dn; (market.halts.symbols ||= {}); market.halts.symbols[sym] = true; }
        }
      } catch {}
      cur.price = p;
      cur.history.push({ h: market.lastHour, p });
      if (cur.history.length > 168) cur.history = cur.history.slice(-168);
    }
    maybeDailyRoll(market);
    // Market-wide circuit breaker based on VNI vs previous close
    try {
      const prev = market.previousClose?.VNI;
      const curPx = market.symbols.VNI?.price;
      if (prev && curPx) {
        const chPct = (curPx - prev) / prev;
        if (Math.abs(chPct) >= 0.1) { market.halts.all = true; market.halts.reason = 'Circuit breaker 10%'; }
        else if (Math.abs(chPct) >= 0.07) { market.halts.all = true; market.halts.reason = 'Circuit breaker 7%'; }
        else { if (market.halts.reason?.startsWith('Circuit')) { market.halts.all = false; market.halts.reason = ''; } }
      }
    } catch {}
  }
  saveJSON(MARKET_FILE, market);
}

function initPortfolios() {
  const p = loadJSON(PORT_FILE, null) || {};
  return p;
}

function persistPortfolios(p) { saveJSON(PORT_FILE, p); }

function initOrders() {
  const o = loadJSON(ORDERS_FILE, null) || { nextId: 1, items: [] };
  if (typeof o.nextId !== 'number') o.nextId = 1;
  if (!Array.isArray(o.items)) o.items = [];
  return o;
}

function persistOrders(o) { saveJSON(ORDERS_FILE, o); }

function newOrderId(orders) { const id = orders.nextId++; return id; }

function getWalletBalances(threadId, userId) {
  let farmCoins = 0, fishCoins = 0;
  try { const farm = global.bonzFarmData?.get?.(`${threadId}_${userId}`); farmCoins = farm?.coins || 0; } catch {}
  try { const fish = global.fishingPlayerData?.get?.(String(userId)); fishCoins = fish?.coins || 0; } catch {}
  return { farmCoins, fishCoins, total: farmCoins + fishCoins };
}

function deductFromUnified(threadId, userId, amount) {
  try { if (typeof unifiedDeduct === 'function') return unifiedDeduct(threadId, userId, amount); } catch {}
  const fish = global.fishingPlayerData?.get?.(String(userId));
  if (!fish || (fish.coins || 0) < amount) return false;
  fish.coins -= amount;
  try { if (typeof global.saveFishingPlayerData === 'function') global.saveFishingPlayerData(); } catch {}
  return true;
}

function creditToWallet(userId, amount) {
  let fish = null;
  try { fish = global.fishingPlayerData?.get?.(String(userId)); } catch {}
  if (!fish) {
    try {
      if (!global.fishingPlayerData) global.fishingPlayerData = new Map();
      fish = { level: 1, exp: 0, totalCatch: 0, coins: 0, stats: { common: 0, rare: 0, legendary: 0, trash: 0 } };
      global.fishingPlayerData.set(String(userId), fish);
    } catch {}
  }
  fish.coins = (fish.coins || 0) + amount;
  try { if (typeof global.saveFishingPlayerData === 'function') global.saveFishingPlayerData(); } catch {}
}

function ensureLeaderboard() {
  if (!global.gameLeaderboard) {
    global.gameLeaderboard = { caro: new Map(), fishing: new Map(), taixiu: {}, blackjack: {}, poker: {}, roulette: {}, baccarat: {}, stocksWeek: {} };
  }
  if (!global.gameLeaderboard.stocksWeek) global.gameLeaderboard.stocksWeek = {};
}

function resetWeekIfNeeded(portfolios) {
  const w = currentWeek();
  for (const [uid, pf] of Object.entries(portfolios)) {
    if (pf.lastWeek !== w) { pf.lastWeek = w; pf.realizedWeek = 0; }
  }
  persistPortfolios(portfolios);
}

function formatMoney(n) { try { return Number(n).toLocaleString(); } catch { return String(n); } }

function settleIfDue(pf) {
  try {
    const now = Date.now();
    if (!Array.isArray(pf.pending)) pf.pending = [];
    let released = 0;
    const remain = [];
    for (const it of pf.pending) {
      if ((it.releaseAt || 0) <= now) { released += (it.amount || 0); }
      else remain.push(it);
    }
    pf.pending = remain;
    if (released > 0) {
      creditToWallet(pf.userId || '', released);
    }
  } catch {}
}

function sparkline(values) {
  if (!Array.isArray(values) || values.length === 0) return '';
  const chars = '▁▂▃▄▅▆▇█';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map(v => {
    const idx = Math.min(chars.length - 1, Math.max(0, Math.floor(((v - min) / span) * (chars.length - 1))));
    return chars[idx];
  }).join('');
}

module.exports.run = async function({ api, event, args }) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const userId = String(senderId);

  let market = initMarket();
  generateNewsIfNeeded(market);
  evolveMarket(market);
  const portfolios = initPortfolios();
  resetWeekIfNeeded(portfolios);
  ensureLeaderboard();
  const orders = initOrders();

  const sub = (args[0] || 'help').toLowerCase();

  if (sub === 'help') {
    const msg = [
      '📈 CHỢ CHỨNG KHOÁN',
      '━━━━━━━━━━━━━━━━━━━━',
      '• stock status — Trạng thái thị trường (giờ giao dịch, tin tức)',
      '• stock list — Bảng giá & biến động',
      '• stock price <mã> — Giá chi tiết + sparkline',
      '• stock buy <mã> <số_lượng> [giá] — Mua (bỏ giá để khớp thị trường nếu đang mở cửa)',
      '• stock sell <mã> <số_lượng> [giá] — Bán (bỏ giá để khớp thị trường nếu đang mở cửa)',
      '• stock order <buy|sell> <mã> <số_lượng> <giá> — Đặt lệnh giới hạn',
      '• stock orders — Danh sách lệnh đang chờ/còn lại',
      '• stock cancel <id> — Hủy lệnh theo ID',
      '• stock book <mã> — Sổ lệnh top 5 mức giá',
      '• stock pending — Tiền bán chờ về (T+2)',
      '• stock fees — Biểu phí & thuế',
      '• stock me — Danh mục & PnL',
      '• stock top week — Top lợi nhuận tuần'
    ].join('\n');
    return api.sendMessage(msg, threadId, type);
  }

  if (sub === 'status') {
    const open = isTradingOpen();
    const nowTxt = sessionText();
    const latest = (market.news || []).slice(-1)[0];
    const newsTxt = latest ? `📰 ${latest.title} (tác động tới h${latest.hEnd - market.lastHour >= 0 ? (latest.hEnd - market.lastHour) : 0})` : '📰 Không có tin mới';
    const vni = market.symbols.VNI?.price;
    const prev = market.previousClose?.VNI || vni;
    const ch = vni - prev; const pct = prev ? (ch/prev)*100 : 0;
    const haltTxt = market.halts?.all ? `⛔ HALT toàn thị trường: ${market.halts.reason||''}` : '';
    const lines = [
      `⏱️ Thị trường: ${nowTxt}`,
      haltTxt,
      newsTxt,
      `VN-INDEX: ${formatMoney(vni)} (${ch >= 0 ? '+' : ''}${formatMoney(ch)} | ${pct.toFixed(2)}%)`,
      `Biên độ: ±${((market.limits?.pct||0.07)*100).toFixed(0)}%`
    ].filter(Boolean);
    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  if (sub === 'list') {
    const rows = [];
    for (const sym of Object.keys(market.symbols)) {
      const s = market.symbols[sym];
      const hist = s.history;
      const prev = hist.length >= 2 ? hist[hist.length - 2].p : s.price;
      const ch = s.price - prev; const pct = prev ? (ch / prev) * 100 : 0;
      rows.push({ sym, price: s.price, ch, pct, hist });
    }
    rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    const lines = [
      `📊 BẢNG GIÁ HIỆN TẠI (${sessionText()})`,
      '━━━━━━━━━━━━━━━━━━━━',
      'Mã    Giá       Biến động    Xu hướng'
    ];
    for (const r of rows) {
      const arrow = r.ch > 0 ? '📈' : r.ch < 0 ? '📉' : '⏸️';
      const pctTxt = `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%`;
      const spark = sparkline((r.hist.slice(-8)).map(h => h.p));
      lines.push(`${r.sym.padEnd(4)} ${formatMoney(r.price).padStart(8)}   ${arrow} ${pctTxt.padStart(8)}   ${spark}`);
    }
    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  if (sub === 'price' && args[1]) {
    const sym = args[1].toUpperCase();
    const s = market.symbols[sym];
    if (!s) return api.sendMessage('❌ Mã không tồn tại', threadId, type);
    const hist = s.history.slice(-12);
    const prev = hist.length >= 2 ? hist[hist.length - 2].p : s.price;
    const ch = s.price - prev; const pct = prev ? (ch / prev) * 100 : 0;
    const sl = sparkline(hist.map(x => x.p));
    const lines = [
      `💹 ${sym} — ${formatMoney(s.price)} (${ch >= 0 ? '📈' : ch < 0 ? '📉' : '⏸️'} ${ch >= 0 ? '+' : ''}${formatMoney(ch)} | ${pct.toFixed(2)}%)`,
      '━━━━━━━━━━━━━━━━━━━━',
      `⏱️ 12 giờ: ${sl}`
    ];
    for (const h of hist) lines.push(`h-${(nowHour() - h.h)}: ${formatMoney(h.p)}`);
    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  // Place limit order helper
  function placeOrder(side, sym, qty, price, owner) {
    const id = newOrderId(orders);
    orders.items.push({ id, side, sym, qty, price, owner, created: Date.now(), threadId });
    persistOrders(orders);
    return id;
  }

  // Try to immediately execute marketable order at current price
  function tryExecute(side, sym, qty, limitPriceOrNull) {
    const s = market.symbols[sym];
    if (!s) return { ok: false, reason: 'Mã không tồn tại' };
    if (market.halts?.all) return { ok: false, reason: 'Thị trường đang HALT' };
    if (market.halts?.symbols?.[sym]) return { ok: false, reason: 'Mã đang bị HALT' };
    const px = s.price;
    if (limitPriceOrNull != null) {
      if (side === 'buy' && limitPriceOrNull < px) return { ok: false, reason: 'Giá giới hạn chưa khớp' };
      if (side === 'sell' && limitPriceOrNull > px) return { ok: false, reason: 'Giá giới hạn chưa khớp' };
    }
    // Enforce price within daily limits
    const prevC = market.previousClose?.[sym];
    const limitPct = market.limits?.pct ?? 0.07;
    if (prevC) {
      const up = Math.round(prevC * (1 + limitPct));
      const dn = Math.round(prevC * (1 - limitPct));
      if (px > up || px < dn) return { ok: false, reason: 'Ngoài biên độ ngày' };
    }
    return { ok: true, price: px };
  }

  function matchOpenOrders() {
    // Very simple matching: if order is marketable vs current price, fill fully
    const remaining = [];
    for (const od of orders.items) {
      const s = market.symbols[od.sym];
      if (!s) continue; // skip bad symbol
      const exec = tryExecute(od.side, od.sym, od.qty, od.price);
      if (!exec.ok) { remaining.push(od); continue; }
      // Execute
      const px = exec.price;
      const feeRate = od.side === 'buy' ? FEES.brokerBuy : (FEES.brokerSell + FEES.taxSell);
      const gross = Math.round(px * od.qty);
      if (od.side === 'buy') {
        const total = Math.ceil(gross * (1 + FEES.brokerBuy));
        // Deduct from wallet; if fail keep order
        const okPay = deductFromUnified(od.threadId || threadId, od.owner, total);
        if (!okPay) { remaining.push(od); continue; }
        const pf = portfolios[od.owner] || { positions: {}, realizedWeek: 0, realizedAll: 0, lastWeek: currentWeek() };
        pf.userId = od.owner;
        settleIfDue(pf);
        const pos = pf.positions[od.sym] || { shares: 0, avgCost: 0 };
        const newShares = pos.shares + od.qty;
        const newCost = ((pos.shares * pos.avgCost) + gross) / newShares;
        pf.positions[od.sym] = { shares: newShares, avgCost: Math.round(newCost) };
        portfolios[od.owner] = pf;
        persistPortfolios(portfolios);
      } else {
        const pf = portfolios[od.owner];
        if (!pf || !pf.positions[od.sym] || pf.positions[od.sym].shares < od.qty) { remaining.push(od); continue; }
        const proceeds = Math.floor(gross * (1 - (FEES.brokerSell + FEES.taxSell)));
        const pos = pf.positions[od.sym];
        const costBasis = pos.avgCost * od.qty;
        const profit = proceeds - costBasis;
        pos.shares -= od.qty;
        if (pos.shares === 0) delete pf.positions[od.sym]; else pf.positions[od.sym] = pos;
        pf.realizedAll = (pf.realizedAll || 0) + profit;
        pf.realizedWeek = (pf.realizedWeek || 0) + profit;
        pf.lastWeek = currentWeek();
        pf.userId = od.owner;
        // T+2 settlement: push to pending instead of credit now
        if (!Array.isArray(pf.pending)) pf.pending = [];
        pf.pending.push({ amount: proceeds, releaseAt: Date.now() + 2*24*3600*1000 });
        settleIfDue(pf);
        portfolios[od.owner] = pf;
        persistPortfolios(portfolios);
        ensureLeaderboard();
        global.gameLeaderboard.stocksWeek[od.owner] = { profit: pf.realizedWeek };
      }
    }
    orders.items = remaining;
    persistOrders(orders);
  }

  // Run matching at each invocation
  matchOpenOrders();

  if ((sub === 'buy' || sub === 'b') && args[1] && args[2]) {
    const sym = args[1].toUpperCase();
    const qty = parseInt(args[2], 10);
    const s = market.symbols[sym];
    if (!s) return api.sendMessage('❌ Mã không tồn tại', threadId, type);
    if (!Number.isFinite(qty) || qty <= 0) return api.sendMessage('❌ Số lượng không hợp lệ', threadId, type);
    const limit = args[3] ? parseInt(args[3], 10) : null;
    if (!isTradingOpen() && limit == null) {
      return api.sendMessage('⏳ Thị trường đang đóng cửa. Vui lòng đặt giá (lệnh giới hạn) hoặc thử lại giờ giao dịch.', threadId, type);
    }
    if (limit != null) {
      const id = placeOrder('buy', sym, qty, limit, userId);
      matchOpenOrders();
      return api.sendMessage(`📝 Đã đặt lệnh MUA ${qty} ${sym} giá ${formatMoney(limit)} (ID ${id}).`, threadId, type);
    }
    const exec = tryExecute('buy', sym, qty, null);
    if (!exec.ok) return api.sendMessage(`❌ ${exec.reason}`, threadId, type);
    const cost = Math.round(exec.price * qty);
    const total = Math.ceil(cost * (1 + FEES.brokerBuy));
    const ok = deductFromUnified(threadId, userId, total);
    if (!ok) return api.sendMessage(`❌ Không đủ coins. Cần ${formatMoney(total)}`, threadId, type);
    const pf = portfolios[userId] || { positions: {}, realizedWeek: 0, realizedAll: 0, lastWeek: currentWeek() };
    pf.userId = userId;
    settleIfDue(pf);
    const pos = pf.positions[sym] || { shares: 0, avgCost: 0 };
    const newShares = pos.shares + qty;
    const newCost = ((pos.shares * pos.avgCost) + cost) / newShares;
    pf.positions[sym] = { shares: newShares, avgCost: Math.round(newCost) };
    portfolios[userId] = pf;
    persistPortfolios(portfolios);
    return api.sendMessage(`✅ Mua ${qty} ${sym} giá ${formatMoney(exec.price)}. Tổng trừ ${formatMoney(total)}`, threadId, type);
  }

  if ((sub === 'sell' || sub === 's') && args[1] && args[2]) {
    const sym = args[1].toUpperCase();
    const qty = parseInt(args[2], 10);
    const s = market.symbols[sym];
    if (!s) return api.sendMessage('❌ Mã không tồn tại', threadId, type);
    if (!Number.isFinite(qty) || qty <= 0) return api.sendMessage('❌ Số lượng không hợp lệ', threadId, type);
    const pf = portfolios[userId];
    if (!pf || !pf.positions[sym] || pf.positions[sym].shares < qty) return api.sendMessage('❌ Không đủ cổ phiếu để bán', threadId, type);
    const limit = args[3] ? parseInt(args[3], 10) : null;
    if (!isTradingOpen() && limit == null) {
      return api.sendMessage('⏳ Thị trường đang đóng cửa. Vui lòng đặt giá (lệnh giới hạn) hoặc thử lại giờ giao dịch.', threadId, type);
    }
    if (limit != null) {
      const id = placeOrder('sell', sym, qty, limit, userId);
      matchOpenOrders();
      return api.sendMessage(`📝 Đã đặt lệnh BÁN ${qty} ${sym} giá ${formatMoney(limit)} (ID ${id}).`, threadId, type);
    }
    const exec = tryExecute('sell', sym, qty, null);
    if (!exec.ok) return api.sendMessage(`❌ ${exec.reason}`, threadId, type);
    const gross = Math.round(exec.price * qty);
    const proceeds = Math.floor(gross * (1 - (FEES.brokerSell + FEES.taxSell)));
    const pos = pf.positions[sym];
    const costBasis = pos.avgCost * qty;
    const profit = proceeds - costBasis;
    pos.shares -= qty;
    if (pos.shares === 0) delete pf.positions[sym]; else pf.positions[sym] = pos;
    pf.realizedAll = (pf.realizedAll || 0) + profit;
    pf.realizedWeek = (pf.realizedWeek || 0) + profit;
    pf.lastWeek = currentWeek();
    pf.userId = userId;
    if (!Array.isArray(pf.pending)) pf.pending = [];
    pf.pending.push({ amount: proceeds, releaseAt: Date.now() + 2*24*3600*1000 });
    settleIfDue(pf);
    portfolios[userId] = pf;
    persistPortfolios(portfolios);
    ensureLeaderboard();
    global.gameLeaderboard.stocksWeek[userId] = { profit: pf.realizedWeek };
    return api.sendMessage(`✅ Bán ${qty} ${sym} giá ${formatMoney(exec.price)}. Nhận (T+2) ${formatMoney(proceeds)}. Lãi/Lỗ ${profit >= 0 ? '+' : ''}${formatMoney(profit)}`, threadId, type);
  }

  if (sub === 'me') {
    const pf = portfolios[userId] || { positions: {}, realizedWeek: 0, realizedAll: 0, lastWeek: currentWeek() };
    pf.userId = userId;
    settleIfDue(pf);
    const bal = getWalletBalances(threadId, userId);
    const keys = Object.keys(pf.positions);
    let totalValue = 0; let unrealized = 0;
    for (const sym of keys) {
      const pos = pf.positions[sym];
      const cur = market.symbols[sym]?.price || 0;
      totalValue += cur * pos.shares;
      unrealized += (cur - pos.avgCost) * pos.shares;
    }
    const lines = [
      '👤 DANH MỤC',
      '━━━━━━━━━━━━━━━━━━━━',
      `💰 Giá trị danh mục: ${formatMoney(totalValue)}`,
      `📊 PnL chưa thực hiện: ${unrealized >= 0 ? '+' : ''}${formatMoney(unrealized)}`,
      `💼 Realized tuần: ${pf.realizedWeek >= 0 ? '+' : ''}${formatMoney(pf.realizedWeek)}`,
      `🏦 Realized tổng: ${pf.realizedAll >= 0 ? '+' : ''}${formatMoney(pf.realizedAll)}`,
      `💳 Ví chung: ${formatMoney(bal.total)} (Farm ${formatMoney(bal.farmCoins)} + Fishing ${formatMoney(bal.fishCoins)})`,
      ''
    ];
    if (keys.length === 0) {
      lines.push('Danh mục trống');
    } else {
      lines.push('Mã    Số lượng  Avg       Giá       PnL');
      for (const sym of keys) {
        const pos = pf.positions[sym];
        const cur = market.symbols[sym]?.price || 0;
        const pnl = (cur - pos.avgCost) * pos.shares;
        lines.push(`${sym.padEnd(4)} ${String(pos.shares).padStart(7)}  ${formatMoney(pos.avgCost).padStart(8)}  ${formatMoney(cur).padStart(8)}  ${(pnl>=0?'+':'')+formatMoney(pnl)}`);
      }
    }
    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  if (sub === 'top' && (args[1] || '').toLowerCase() === 'week') {
    ensureLeaderboard();
    const stats = global.gameLeaderboard.stocksWeek || {};
    const sorted = Object.entries(stats).map(([userId, s]) => ({ userId, profit: s.profit || 0 }))
      .sort((a, b) => b.profit - a.profit).slice(0, 10);
    if (sorted.length === 0) return api.sendMessage('📈 Chưa có dữ liệu lợi nhuận tuần', threadId, type);
    const out = ['🏆 TOP LỢI NHUẬN TUẦN'];
    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i];
      let name = 'Nhà đầu tư';
      try { const info = await api.getUserInfo(it.userId); name = info?.changed_profiles?.[it.userId]?.displayName || name; } catch {}
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
      out.push(`${medal} ${name} • ${it.profit >= 0 ? '+' : ''}${formatMoney(it.profit)}`);
    }
    return api.sendMessage(out.join('\n'), threadId, type);
  }

  if (sub === 'order' && args[1] && args[2] && args[3] && args[4]) {
    const side = args[1].toLowerCase();
    if (side !== 'buy' && side !== 'sell') return api.sendMessage('❌ Cú pháp: stock order <buy|sell> <mã> <số_lượng> <giá>', threadId, type);
    const sym = args[2].toUpperCase();
    const qty = parseInt(args[3], 10);
    const price = parseInt(args[4], 10);
    if (!market.symbols[sym]) return api.sendMessage('❌ Mã không tồn tại', threadId, type);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) return api.sendMessage('❌ Số lượng/giá không hợp lệ', threadId, type);
    if (side === 'sell') {
      const pf = portfolios[userId];
      if (!pf || !pf.positions[sym] || pf.positions[sym].shares < qty) return api.sendMessage('❌ Không đủ cổ phiếu để đặt bán', threadId, type);
    }
    const id = placeOrder(side, sym, qty, price, userId);
    matchOpenOrders();
    return api.sendMessage(`📝 Đã đặt lệnh ${side.toUpperCase()} ${qty} ${sym} @ ${formatMoney(price)} (ID ${id}).`, threadId, type);
  }

  if (sub === 'orders') {
    const mine = orders.items.filter(o => String(o.owner) === String(userId));
    if (mine.length === 0) return api.sendMessage('📄 Không có lệnh chờ.', threadId, type);
    const lines = ['📄 LỆNH CHỜ'];
    for (const o of mine) {
      lines.push(`#${o.id} • ${o.side.toUpperCase()} ${o.qty} ${o.sym} @ ${formatMoney(o.price)} • ${new Date(o.created).toLocaleString('vi-VN')}`);
    }
    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  if (sub === 'cancel' && args[1]) {
    const id = parseInt(args[1], 10);
    if (!Number.isFinite(id)) return api.sendMessage('❌ ID không hợp lệ', threadId, type);
    const idx = orders.items.findIndex(o => o.id === id && String(o.owner) === String(userId));
    if (idx === -1) return api.sendMessage('❌ Không tìm thấy lệnh hoặc không có quyền hủy', threadId, type);
    orders.items.splice(idx, 1);
    persistOrders(orders);
    return api.sendMessage(`✅ Đã hủy lệnh #${id}`, threadId, type);
  }

  return api.sendMessage('❌ Cú pháp không hợp lệ. Gõ "stock help".', threadId, type);
};
