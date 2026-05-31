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
