export interface Order {
  id: string;
  userId: string;
  accountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  requestedPrice?: number;
  executedPrice?: number;
  status: 'PENDING' | 'QUEUED' | 'EXECUTING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  quantity: number;
  price: number;
  createdAt: string;
}

export interface Position {
  id: string;
  userId: string;
  accountId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  pnl: number;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  changeAmount: number;
  reason: string;
  createdAt: string;
}