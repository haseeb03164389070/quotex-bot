// QUOTEX BOT - CONFIGURATION FILE

const CONFIG = {
  SERVER_PORT: 3000,
  QUOTEX_URL: 'https://quotex.net.in/',
  
  DEMO_MODE: true,
  EMAIL: process.env.QUOTEX_EMAIL || 'your-email@gmail.com',
  PASSWORD: process.env.QUOTEX_PASSWORD || 'your-password',
  
  ANALYSIS_REFRESH_RATE: 5000,
  
  RISK_PER_TRADE: 100,
  MAX_CONCURRENT_TRADES: 3,
  STOP_LOSS_POINTS: 20,
  TAKE_PROFIT_POINTS: 30,
  
  RSI: {
    PERIOD: 14,
    OVERSOLD: 30,
    OVERBOUGHT: 70,
    ENABLED: true
  },
  
  EMA: {
    PERIOD: 20,
    ENABLED: true
  },
  
  MACD: {
    FAST: 12,
    SLOW: 26,
    SIGNAL: 9,
    ENABLED: true
  },
  
  MIN_SIGNAL_CONFIDENCE: 50,
  MIN_INDICATOR_AGREEMENT: 2,
  
  ASSETS: [
    'EUR/USD',
    'GBP/USD',
    'BTC/USD',
    'ETH/USD',
    'XAU/USD',
    'SPX500',
  ],
  
  EXPIRY_TIME: '5m',
  
  NO_TRADE_HOURS: {
    START: 22,
    END: 6,
    ENABLED: false
  },
  
  TRADE_COOLDOWN: 10000,
  
  DAILY_PROFIT_TARGET: 500,
  ENABLE_DAILY_TARGET: false,
  
  DAILY_LOSS_LIMIT: -500,
  ENABLE_LOSS_LIMIT: true,
  
  NOTIFICATIONS: {
    ENABLED: false,
    TELEGRAM: {
      ENABLED: false,
      BOT_TOKEN: 'your-token',
      CHAT_ID: 'your-chat-id'
    }
  },
  
  LOGGING: {
    LOG_TO_FILE: true,
    LOG_FILE: 'trading.log',
    LOG_LEVEL: 'info',
    SAVE_TRADE_DATA: true,
    TRADE_DATA_FILE: 'trades.json'
  },
  
  BROWSER: {
    HEADLESS: false,
    SHOW_BROWSER_CONSOLE: true,
    WINDOW_WIDTH: 1920,
    WINDOW_HEIGHT: 1080,
    TIMEOUT: 10000
  }
};

module.exports = CONFIG;
