
export type AccountType = 'standard' | 'raw' | 'zero';

export const AccountTypeConfig: Record<AccountType, {
  spreadMultiplier: number;
  commissionRate: number;
  fixedSpread?: number;
  leverage: number;                // new
}> = {
  standard: {
    spreadMultiplier: 1.0,
    commissionRate: 0.0,
    leverage: 100,                 // 1:100
  },
  raw: {
    spreadMultiplier: 0.1,
    commissionRate: 0.001,
    leverage: 200,                 // higher for scalpers
  },
  zero: {
    spreadMultiplier: 1.2,
    commissionRate: 0.0,
    fixedSpread: 0.0002,
    leverage: 50,                  // more conservative
  },
};