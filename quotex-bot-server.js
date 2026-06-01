// QUOTEX HYBRID TRADING BOT - BACKEND SERVER
// Node.js + Express + WebSocket Integration
// Real-time market analysis + Auto-trading

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Configuration
const CONFIG = {
  quotexUrl: 'wss://api.quotex.io/socket.io/?transport=websocket',
  refreshRate: 5000,
  riskPerTrade: 100,
  maxConcurrentTrades: 3,
  stopLoss: 20,
  takeProfit: 30,
};

// Global State
let botState = {
  isRunning: false,
  balance: 10000,
  trades: [],
  signals: [],
  marketData: {},
  connectedAssets: {},
  analysisInterval: null,
};

// TECHNICAL ANALYSIS FUNCTIONS
function calculateRSI(prices, period = 14) {
  if (prices.length < period) return 50;
  
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period = 20) {
  if (prices.length < period) return prices[prices.length - 1];
  
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  return { macd, signal: ema12, histogram: macd - ema12 };
}

function analyzeMarket(asset, priceHistory) {
  const prices = priceHistory.slice(-50);
  if (prices.length < 14) return { signal: 'WAIT', confidence: 0 };
  
  const rsi = calculateRSI(prices);
  const ema20 = calculateEMA(prices, 20);
  const currentPrice = prices[prices.length - 1];
  const { macd, histogram } = calculateMACD(prices);
  
  let signal = 'WAIT';
  let confidence = 0;
  
  if (rsi < 30 && currentPrice < ema20 && histogram < 0) {
    signal = 'BUY';
    confidence = Math.min(100, (30 - rsi) + (ema20 - currentPrice) * 100);
  }
  else if (rsi > 70 && currentPrice > ema20 && histogram > 0) {
    signal = 'SELL';
    confidence = Math.min(100, (rsi - 70) + (currentPrice - ema20) * 100);
  }
  
  return {
    signal,
    confidence: Math.round(confidence),
    rsi: Math.round(rsi * 10) / 10,
    ema20: Math.round(ema20 * 10000) / 10000,
    macd: Math.round(macd * 10000) / 10000,
    price: currentPrice
  };
}

// REAL-TIME MARKET DATA SIMULATION
function simulateMarketData(asset) {
  if (!botState.marketData[asset]) {
    botState.marketData[asset] = {
      prices: [Math.random() * 2 + 0.5],
      timestamp: Date.now()
    };
  }
  
  const current = botState.marketData[asset].prices;
  const lastPrice = current[current.length - 1];
  const newPrice = lastPrice + (Math.random() - 0.49) * 0.003;
  
  current.push(Math.max(newPrice, 0.1));
  if (current.length > 100) current.shift();
  
  botState.marketData[asset].timestamp = Date.now();
  return newPrice;
}

// AUTO-TRADING LOGIC
async function executeAutoTrade(asset, analysis) {
  if (!botState.isRunning || !analysis.signal || analysis.signal === 'WAIT') return;
  if (botState.trades.filter(t => !t.closed).length >= CONFIG.maxConcurrentTrades) return;
  
  const trade = {
    id: Date.now(),
    asset,
    type: analysis.signal,
    entry: analysis.price,
    entryTime: new Date().toLocaleTimeString(),
    riskAmount: CONFIG.riskPerTrade,
    stopLoss: analysis.signal === 'BUY' 
      ? analysis.price - (CONFIG.stopLoss * 0.0001)
      : analysis.price + (CONFIG.stopLoss * 0.0001),
    takeProfit: analysis.signal === 'BUY'
      ? analysis.price + (CONFIG.takeProfit * 0.0001)
      : analysis.price - (CONFIG.takeProfit * 0.0001),
    closed: false,
    pnl: 0
  };
  
  botState.trades.push(trade);
  broadcastUpdate({
    type: 'NEW_TRADE',
    trade,
    balance: botState.balance
  });
}

// CLOSE TRADES
function checkCloseTrades() {
  botState.trades.forEach(trade => {
    if (trade.closed) return;
    
    const currentPrice = botState.marketData[trade.asset]?.prices.slice(-1)[0] || trade.entry;
    let shouldClose = false;
    let pnl = 0;
    
    if (trade.type === 'BUY') {
      if (currentPrice >= trade.takeProfit) {
        pnl = CONFIG.riskPerTrade * (CONFIG.takeProfit / 100);
        shouldClose = true;
      } else if (currentPrice <= trade.stopLoss) {
        pnl = -CONFIG.riskPerTrade;
        shouldClose = true;
      }
    } else {
      if (currentPrice <= trade.takeProfit) {
        pnl = CONFIG.riskPerTrade * (CONFIG.takeProfit / 100);
        shouldClose = true;
      } else if (currentPrice >= trade.stopLoss) {
        pnl = -CONFIG.riskPerTrade;
        shouldClose = true;
      }
    }
    
    if (shouldClose) {
      trade.closed = true;
      trade.exit = currentPrice;
      trade.exitTime = new Date().toLocaleTimeString();
      trade.pnl = pnl;
      botState.balance += pnl;
      
      broadcastUpdate({
        type: 'TRADE_CLOSED',
        trade,
        balance: botState.balance
      });
    }
  });
}

// ANALYSIS LOOP
function startAnalysisLoop() {
  botState.analysisInterval = setInterval(() => {
    if (!botState.isRunning) return;
    
    const assets = ['EUR/USD', 'BTC/USD', 'GBP/USD', 'XAU/USD', 'SPX500'];
    
    assets.forEach(asset => {
      const price = simulateMarketData(asset);
      const analysis = analyzeMarket(asset, botState.marketData[asset].prices);
      
      if (analysis.signal !== 'WAIT') {
        botState.signals.push({
          asset,
          ...analysis,
          timestamp: new Date().toLocaleTimeString()
        });
        
        if (botState.signals.length > 20) botState.signals.shift();
        
        executeAutoTrade(asset, analysis);
      }
    });
    
    checkCloseTrades();
    broadcastUpdate({ type: 'UPDATE', state: botState });
  }, CONFIG.refreshRate);
}

// WEBSOCKET SERVER
wss.on('connection', (ws) => {
  console.log('🟢 Client connected');
  
  ws.send(JSON.stringify({
    type: 'INIT',
    state: botState,
    config: CONFIG
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleClientMessage(data, ws);
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });
  
  ws.on('close', () => console.log('🔴 Client disconnected'));
});

function handleClientMessage(data, ws) {
  switch(data.type) {
    case 'START_BOT':
      botState.isRunning = true;
      if (!botState.analysisInterval) startAnalysisLoop();
      broadcastUpdate({ type: 'BOT_STARTED' });
      break;
      
    case 'STOP_BOT':
      botState.isRunning = false;
      broadcastUpdate({ type: 'BOT_STOPPED' });
      break;
      
    case 'MANUAL_TRADE':
      executeAutoTrade(data.asset, {
        signal: data.type,
        confidence: 100,
        price: botState.marketData[data.asset]?.prices.slice(-1)[0] || 1
      });
      break;
      
    case 'UPDATE_CONFIG':
      Object.assign(CONFIG, data.config);
      broadcastUpdate({ type: 'CONFIG_UPDATED', config: CONFIG });
      break;
      
    case 'GET_STATE':
      ws.send(JSON.stringify({ type: 'STATE', state: botState }));
      break;
  }
}

function broadcastUpdate(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// REST API ENDPOINTS
app.get('/api/state', (req, res) => {
  res.json(botState);
});

app.post('/api/start', (req, res) => {
  botState.isRunning = true;
  if (!botState.analysisInterval) startAnalysisLoop();
  res.json({ status: 'Bot started', balance: botState.balance });
});

app.post('/api/stop', (req, res) => {
  botState.isRunning = false;
  res.json({ status: 'Bot stopped', balance: botState.balance });
});

app.post('/api/trade', (req, res) => {
  const { asset, type } = req.body;
  const analysis = analyzeMarket(asset, botState.marketData[asset].prices);
  analysis.signal = type;
  executeAutoTrade(asset, analysis);
  res.json({ status: 'Trade executed', trade: botState.trades.slice(-1)[0] });
});

app.get('/api/trades', (req, res) => {
  res.json(botState.trades);
});

app.get('/api/signals', (req, res) => {
  res.json(botState.signals.slice(-10));
});
// DASHBOARD ROUTE
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<title>Quotex Trading Bot</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; font-family: Arial; }
body { background: #0a0a0a; color: #fff; }
.header { background: #111; padding: 15px 20px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
.header h1 { color: #00ff88; font-size: 20px; }
.balance { font-size: 24px; color: #00ff88; font-weight: bold; }
.grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; padding: 20px; }
.card { background: #111; border: 1px solid #222; border-radius: 8px; padding: 15px; }
.card h3 { color: #888; font-size: 12px; margin-bottom: 10px; }
.signal { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1a1a1a; }
.buy { color: #00ff88; } .sell { color: #ff4444; } .wait { color: #888; }
.trade { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1a1a1a; font-size: 13px; }
.profit { color: #00ff88; } .loss { color: #ff4444; }
.btn { padding: 12px 30px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; }
.btn-start { background: #00ff88; color: #000; } .btn-stop { background: #ff4444; color: #fff; }
.status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
.running { background: #00ff8822; color: #00ff88; border: 1px solid #00ff88; }
.stopped { background: #ff444422; color: #ff4444; border: 1px solid #ff4444; }
.controller { position: fixed; bottom: 30px; right: 30px; background: #111; border: 1px solid #333; border-radius: 12px; padding: 20px; cursor: move; z-index: 1000; min-width: 200px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
.controller h4 { color: #888; font-size: 11px; margin-bottom: 15px; letter-spacing: 2px; }
.ctrl-btn { width: 80px; height: 80px; border: none; border-radius: 50%; font-size: 30px; cursor: pointer; margin: 5px; }
.ctrl-up { background: #00ff88; } .ctrl-down { background: #ff4444; }
.asset-select { background: #1a1a1a; color: #fff; border: 1px solid #333; padding: 6px; border-radius: 4px; width: 100%; margin-bottom: 10px; }
</style>
</head>
<body>
<div class="header">
  <h1>🤖 QUOTEX TRADING BOT</h1>
  <div>
    <span id="status" class="status stopped">● STOPPED</span>
    <span style="margin-left:20px; font-size:13px; color:#888;">Balance: </span>
    <span id="balance" class="balance">$10,000</span>
  </div>
</div>
<div class="grid">
  <div class="card">
    <h3>📊 LIVE SIGNALS</h3>
    <div id="signals"><div style="color:#555; text-align:center; margin-top:20px">Start bot to see signals...</div></div>
  </div>
  <div class="card">
    <h3>💰 OPEN TRADES</h3>
    <div id="open-trades"><div style="color:#555; text-align:center; margin-top:20px">No open trades</div></div>
  </div>
  <div class="card">
    <h3>📈 TRADE HISTORY</h3>
    <div id="trade-history"><div style="color:#555; text-align:center; margin-top:20px">No trades yet</div></div>
  </div>
</div>
<div style="padding: 0 20px 20px; display:flex; gap:10px;">
  <button class="btn btn-start" onclick="startBot()">▶ START BOT</button>
  <button class="btn btn-stop" onclick="stopBot()">■ STOP BOT</button>
</div>
<div class="controller" id="controller">
  <h4>⚡ CONTROLLER</h4>
  <select id="asset" class="asset-select">
    <option>EUR/USD</option><option>BTC/USD</option><option>GBP/USD</option>
    <option>XAU/USD</option><option>SPX500</option>
  </select>
  <div>
    <button class="ctrl-btn ctrl-up" onclick="manualTrade('BUY')">▲</button>
  </div>
  <div style="color:#888; font-size:11px; margin:5px 0;">UP = BUY | DOWN = SELL</div>
  <div>
    <button class="ctrl-btn ctrl-down" onclick="manualTrade('SELL')">▼</button>
  </div>
</div>
<script>
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(proto + '//' + location.host);
let state = {};
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.state) state = data.state;
  if (data.balance !== undefined || (data.state && data.state.balance !== undefined)) {
    const bal = data.balance || (data.state && data.state.balance) || 10000;
    document.getElementById('balance').textContent = '$' + bal.toFixed(2);
  }
  if (data.state && data.state.signals) updateSignals(data.state.signals);
  if (data.state && data.state.trades) updateTrades(data.state.trades);
  if (data.type === 'BOT_STARTED') { document.getElementById('status').textContent = '● RUNNING'; document.getElementById('status').className = 'status running'; }
  if (data.type === 'BOT_STOPPED') { document.getElementById('status').textContent = '● STOPPED'; document.getElementById('status').className = 'status stopped'; }
};
function updateSignals(signals) {
  if (!signals.length) return;
  document.getElementById('signals').innerHTML = signals.slice(-8).reverse().map(s =>
    '<div class="signal"><span>' + s.asset + '</span><span class="' + s.signal.toLowerCase() + '">' + s.signal + '</span><span style="color:#555">' + s.confidence + '%</span></div>'
  ).join('');
}
function updateTrades(trades) {
  const open = trades.filter(t => !t.closed);
  const closed = trades.filter(t => t.closed);
  document.getElementById('open-trades').innerHTML = open.length ? open.map(t =>
    '<div class="trade"><span>' + t.asset + '</span><span class="' + t.type.toLowerCase() + '">' + t.type + '</span><span>' + t.entry.toFixed(4) + '</span></div>'
  ).join('') : '<div style="color:#555; text-align:center; margin-top:10px">No open trades</div>';
  document.getElementById('trade-history').innerHTML = closed.length ? closed.slice(-8).reverse().map(t =>
    '<div class="trade"><span>' + t.asset + '</span><span class="' + (t.pnl >= 0 ? 'profit' : 'loss') + '">' + (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0) + '</span></div>'
  ).join('') : '<div style="color:#555; text-align:center; margin-top:10px">No trades yet</div>';
}
function startBot() { ws.send(JSON.stringify({type:'START_BOT'})); }
function stopBot() { ws.send(JSON.stringify({type:'STOP_BOT'})); }
function manualTrade(type) { ws.send(JSON.stringify({type:'MANUAL_TRADE', tradeType:type, asset:document.getElementById('asset').value})); }
// Draggable controller
const ctrl = document.getElementById('controller');
let isDragging = false, startX, startY, startLeft, startBottom;
ctrl.addEventListener('mousedown', (e) => { isDragging = true; startX = e.clientX; startY = e.clientY; startLeft = ctrl.offsetLeft; startBottom = parseInt(ctrl.style.bottom) || 30; });
document.addEventListener('mousemove', (e) => { if (!isDragging) return; ctrl.style.left = (startLeft + e.clientX - startX) + 'px'; ctrl.style.right = 'auto'; ctrl.style.bottom = (startBottom - e.clientY + startY) + 'px'; });
document.addEventListener('mouseup', () => isDragging = false);
</script>
</body>
</html>`);
});

app.get('/dashboard', (req, res) => res.redirect('/'));
// START SERVER
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  QUOTEX HYBRID TRADING BOT - RUNNING   ║
║  Server: http://localhost:${PORT}      ║
║  WebSocket: ws://localhost:${PORT}     ║
╚════════════════════════════════════════╝
  `);
});

module.exports = { botState, CONFIG };
