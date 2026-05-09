export type Tick = {
  symbol: string;        // BTCUSDT
  price: number;
  quantity: number;
  timestamp: number;     // milliseconds
};

export type Ticker = {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
};