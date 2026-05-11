import { createRedisClient } from '@repo/redis';
import { query } from '@repo/db';
import { AccountTypeConfig } from '@repo/types/account';

const redis = createRedisClient();

export async function executeSimulatedOrder(request: any) {
  const {
    requestId, orderId, accountId, symbol, side, quantity: qtyRaw,
    accountType, leverage: requestedLeverage
  } = request;
  const quantity = parseFloat(qtyRaw);
  const leverage = parseInt(requestedLeverage) || AccountTypeConfig[accountType as keyof typeof AccountTypeConfig]?.leverage || 100;

  // Get raw ticker
  const rawStr = await redis.get(`raw:ticker:${symbol}`);
  if (!rawStr) return { success: false, error: 'No price available' };
  const raw: { bid: number; ask: number; last: number } = JSON.parse(rawStr);

  const config = AccountTypeConfig[accountType as keyof typeof AccountTypeConfig] || AccountTypeConfig.standard;

  // Determine execution price with spread & commission
  let executionPrice: number;
  if (side === 'BUY') {
    executionPrice = raw.ask;
    if (config.fixedSpread) {
      executionPrice = raw.last * (1 + config.fixedSpread / 2);
    } else {
      const baseSpread = (raw.ask - raw.bid) / 2;
      executionPrice = raw.last + baseSpread * config.spreadMultiplier;
    }
  } else {
    executionPrice = raw.bid;
    if (config.fixedSpread) {
      executionPrice = raw.last * (1 - config.fixedSpread / 2);
    } else {
      const baseSpread = (raw.ask - raw.bid) / 2;
      executionPrice = raw.last - baseSpread * config.spreadMultiplier;
    }
  }
  // Simulate slippage
  const slippage = 1 + (Math.random() - 0.5) * 0.0002;
  executionPrice *= slippage;

  // Calculate notional value and required margin
  const notionalValue = executionPrice * quantity;
  const requiredMargin = notionalValue / leverage;

  // Fetch account's free margin from DB
  const account = (await query(`SELECT free_margin FROM accounts WHERE id = $1`, [accountId]))[0];
  if (!account) return { success: false, error: 'Account not found' };
  const freeMargin = account.free_margin;

  if (freeMargin < requiredMargin) {
    return { success: false, error: 'Insufficient free margin' };
  }

  // Success: return execution details + margin use
  const commission = notionalValue * config.commissionRate;

  return {
    success: true,
    requestId,
    executionPrice,
    filledQuantity: quantity,
    commission,
    requiredMargin,
    leverage,
    notionalValue,
    timestamp: Date.now(),
  };
}