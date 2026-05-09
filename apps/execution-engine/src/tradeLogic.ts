import path from 'path';
import dotenv from 'dotenv';

// Load env files early so packages that create DB/Redis pools see the values.
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });


// apps/execution-engine/src/tradeLogic.ts
import { createRedisClient } from '@repo/redis';
import { query } from '@repo/db';
import { v4 as uuid } from 'uuid';
import { AccountTypeConfig, AccountType } from '@repo/types/account';

const redis = createRedisClient();
const redisPub = redis.duplicate();

// ... existing waitForExecutionResult, parseStreamFields (keep them)

export async function processOrder(orderId: string) {
  const order = (await query(`SELECT * FROM orders WHERE id = $1`, [orderId]))[0];
  if (!order) return;

  const account = (await query(`SELECT * FROM accounts WHERE id = $1`, [order.account_id]))[0];
  const accountType: AccountType = (account.account_type ?? 'standard') as AccountType;
  const riskScore = account.risk_score || 50;
  const route = riskScore > 70 ? 'A_BOOK' : 'B_BOOK';

  const leverage = order.leverage || AccountTypeConfig[accountType].leverage || 100;

  // Send to internal exchange
  const requestId = uuid();
  await redis.xadd('execution_requests', '*',
    'requestId', requestId,
    'orderId', order.id,
    'accountId', order.account_id,
    'symbol', order.symbol,
    'side', order.side,
    'quantity', String(order.quantity),
    'accountType', accountType,
    'leverage', String(leverage),
    'route', route
  );

  // Update order status to SENT_TO_EXCHANGE
  await query(`UPDATE orders SET status = 'SENT_TO_EXCHANGE', client_order_id = $1, updated_at = NOW() WHERE id = $2`, [orderId, orderId]);

  const result = await waitForExecutionResult(requestId, 10000);
  if (!result.success) {
    await query(`UPDATE orders SET status = 'REJECTED' WHERE id = $1`, [orderId]);
    return;
  }

  const {
    executionPrice, commission = 0, requiredMargin, leverage: lev
  } = result;
  const qty = order.quantity;

  // 1. Reserve margin: decrease free_margin, increase used_margin
  await query(`UPDATE accounts SET free_margin = free_margin - $1, used_margin = used_margin + $1 WHERE id = $2`,
    [requiredMargin, order.account_id]);

  // 2. Update order
  try {
    await query(`UPDATE orders SET status = 'FILLED', executed_price = $1, commission = $2, leverage = $3 WHERE id = $4`,
      [executionPrice, commission, lev, order.id]);
  } catch (err) {
    // Some DB schemas may not have a commission column; try without it
    console.warn('orders UPDATE with commission failed (column missing?), retrying without commission:', String(err));
    try {
      await query(`UPDATE orders SET status = 'FILLED', executed_price = $1, leverage = $2 WHERE id = $3`,
        [executionPrice, lev, order.id]);
    } catch (err2) {
      console.error('Failed to update orders row (without commission) -- continuing processing to avoid crash:', String(err2));
    }
  }

  // 3. Create trade
  const tradeId = uuid();
  await query(`INSERT INTO trades (id, order_id, symbol, quantity, price) VALUES ($1,$2,$3,$4,$5)`,
    [tradeId, order.id, order.symbol, qty, executionPrice]);

  // 4. Upsert position with margin details
  await upsertPosition(order.account_id, order.user_id, order.symbol,
    order.side, qty, executionPrice, lev, requiredMargin);

  // 5. Deduct commission from balance (not from margin)
  if (commission > 0) {
    await query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [commission, order.account_id]);
    await query(`INSERT INTO ledger (account_id, change_amount, reason) VALUES ($1,$2,'commission')`,
      [order.account_id, -commission]);
  }

  // 6. Update account equity = balance + sum(unrealized_pnl)
  // We'll do this in a separate PnL service; for now equity = balance (will be updated by PnL service)
  // Publish updates
  await redisPub.publish('orders_updates', JSON.stringify({
    type: 'order_filled', orderId: order.id, executionPrice, commission
  }));
  await redisPub.publish('position_updates', JSON.stringify({
    type: 'position_changed', accountId: order.account_id, symbol: order.symbol
  }));
}

export async function upsertPosition(
  accountId: string, userId: string, symbol: string,
  side: string, quantity: number, price: number,
  leverage: number, marginUsed: number
) {
  const existing = await query(`SELECT * FROM positions WHERE account_id = $1 AND symbol = $2`, [accountId, symbol]);
  if (existing.length === 0) {
    // New position (LONG if BUY, SHORT if SELL)
    const size = side === 'BUY' ? quantity : -quantity;
    await query(
      `INSERT INTO positions (user_id, account_id, symbol, quantity, avg_price, leverage, margin_used, unrealized_pnl)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0)`,
      [userId, accountId, symbol, size, price, leverage, marginUsed]
    );
  } else {
    const pos = existing[0];
    const currentQty = pos.quantity;
    const currentAvg = pos.avg_price;
    const currentMargin = pos.margin_used;
    const newQty = side === 'BUY' ? currentQty + quantity : currentQty - quantity;

    // Calculate new average price
    const totalOldNotional = Math.abs(currentQty) * currentAvg;
    const newNotional = quantity * price;
    const totalNotional = side === 'BUY' ? totalOldNotional + newNotional : totalOldNotional - newNotional;
    const newAvg = newQty !== 0 ? Math.abs(totalNotional / newQty) : 0;

    // New total margin (simplified: proportional to new notional)
    const oldNotional = Math.abs(currentQty) * currentAvg;
    const newTotalNotional = Math.abs(newQty) * newAvg;
    const newMargin = newQty !== 0 ? (newTotalNotional / leverage) : 0; // recalc margin entirely based on new size
    // Alternative: keep weighted method; but safer to recalc from notional value.
    // We'll recalc based on total notional value:
    const leverageUsed = pos.leverage || leverage;
    const marginRequired = newTotalNotional / leverageUsed;

    if (newQty === 0) {
      // Position closed
      // Release margin back to free_margin
      await query(`UPDATE accounts SET free_margin = free_margin + $1, used_margin = used_margin - $1 WHERE id = $2`,
        [currentMargin, accountId]);

      // Calculate realized PnL
      const totalCost = Math.abs(currentQty) * currentAvg;
      // Use close price - avg price * quantity for realized PnL when closing position.
      // We'll compute realizedPnl below based on position sign and side.
      // (previous cashFlow/revenue variants removed to avoid duplicate declarations)
      let realizedPnl = 0;
      if (pos.quantity > 0) { // was long
        if (side === 'SELL') {
          realizedPnl = (price - currentAvg) * quantity; // closing profit
        } else {
          // same direction (reducing position?) not typical
        }
      } else if (pos.quantity < 0) { // was short
        if (side === 'BUY') {
          realizedPnl = (currentAvg - price) * quantity;
        }
      }
      // Adjust balance by realized PnL (plus any commission already handled)
      await query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [realizedPnl, accountId]);
      await query(`INSERT INTO ledger (account_id, change_amount, reason) VALUES ($1,$2,'realized_pnl')`,
        [accountId, realizedPnl]);

      await query(`DELETE FROM positions WHERE id = $1`, [pos.id]);
    } else {
      // Update existing position
      // Recalculate margin (release old margin, lock new margin)
      await query(`UPDATE accounts SET free_margin = free_margin + $1 - $2, used_margin = used_margin - $1 + $2 WHERE id = $3`,
        [currentMargin, marginRequired, accountId]);

      await query(
        `UPDATE positions SET quantity = $1, avg_price = $2, margin_used = $3, updated_at = NOW() WHERE id = $4`,
        [newQty, newAvg, marginRequired, pos.id]
      );
    }
  }
}


// // apps/execution-engine/src/tradeLogic.ts
// import { createRedisClient } from '@repo/redis';
// import { query } from '@repo/db';
// import { v4 as uuid } from 'uuid';
// import { Ticker } from '@repo/types/market';

// const redis = createRedisClient();
// const redisPub = redis.duplicate();

function parseStreamFields(fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (typeof key === 'string') obj[key] = typeof value === 'string' ? value : '';
  }
  return obj;
}

async function waitForExecutionResult(requestId: string, timeoutMs: number): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Check recent results first (avoid race)
      const recent = await (redis as any).xrevrange('execution_results', '+', '-', 'COUNT', 50);
      if (recent) {
        for (const [id, fields] of recent) {
          const data = parseStreamFields(fields as string[]);
          if (data.requestId === requestId) {
            await redis.xdel('execution_results', id);
            return JSON.parse(data.payload!);
          }
        }
      }
    } catch (_) {}

    // Block waiting for new results
    try {
      const res = await (redis as any).xread('BLOCK', 500, 'STREAMS', 'execution_results', '$');
      if (res) {
        for (const [, msgs] of res) {
          for (const [id, fields] of msgs) {
            const data = parseStreamFields(fields as string[]);
            if (data.requestId === requestId) {
              await redis.xdel('execution_results', id);
              return JSON.parse(data.payload!);
            }
          }
        }
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Timeout waiting for execution result');
}

// export async function processOrder(orderId: string) {
//   const order = (await query(`SELECT * FROM orders WHERE id = $1`, [orderId]))[0];
//   if (!order) return;

//   const account = (await query(`SELECT * FROM accounts WHERE id = $1`, [order.account_id]))[0];
//   const riskScore = account.risk_score || 50;
//   const accountType = account.account_type || 'standard';

//   // A/B routing decision (both go to internal exchange, but we stamp the route)
//   const route = riskScore > 70 ? 'A_BOOK' : 'B_BOOK';

//   const requestId = uuid();
//   await redis.xadd('execution_requests', '*',
//     'requestId', requestId,
//     'orderId', order.id,
//     'accountId', order.account_id,
//     'symbol', order.symbol,
//     'side', order.side,
//     'quantity', String(order.quantity),
//     'accountType', accountType,
//     'route', route
//   );

//   // Update status to indicate submission
//   await query(`UPDATE orders SET status = 'SENT_TO_EXCHANGE', client_order_id = $1, updated_at = NOW() WHERE id = $2`, [orderId, orderId]);

//   const result = await waitForExecutionResult(requestId, 10000);

//   if (!result.success) {
//     await query(`UPDATE orders SET status = 'REJECTED' WHERE id = $1`, [orderId]);
//     return;
//   }

//   const execPrice = result.executionPrice;
//   const commission = result.commission || 0;
//   const qty = order.quantity;

//   // Determine balance change
//   const tradeCost = order.side === 'BUY' ? execPrice * qty : -execPrice * qty;
//   const balanceChange = order.side === 'BUY' ? -tradeCost - commission : -tradeCost - commission; // careful with signs

//   // Simplified: net balance movement
//   const netChange = order.side === 'BUY' ? -(execPrice * qty + commission) : (execPrice * qty - commission);

//   // Update account balance
//   await query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [netChange, order.account_id]);

//   // Create trade
//   const tradeId = uuid();
//   await query(
//     `INSERT INTO trades (id, order_id, symbol, quantity, price) VALUES ($1,$2,$3,$4,$5)`,
//     [tradeId, order.id, order.symbol, qty, execPrice]
//   );

//   // Update order (note: some DB schemas may not have a commission column)
//   try {
//     await query(`UPDATE orders SET status = 'FILLED', executed_price = $1 WHERE id = $2`,
//       [execPrice, order.id]);
//   } catch (err) {
//     console.error('Failed to update orders row with executed_price (possibly missing column), error:', err);
//     // Don't throw — continue to update positions/ledger so the system progresses
//   }

//   // Upsert position
//   await upsertPosition(order.account_id, order.user_id, order.symbol, order.side, qty, execPrice);

//   // Equity = balance (for now)
//   await query(`UPDATE accounts SET equity = balance WHERE id = $1`, [order.account_id]);

//   // Ledger
//   await query(`INSERT INTO ledger (account_id, change_amount, reason) VALUES ($1,$2,'trade')`,
//     [order.account_id, netChange]);

//   // Broadcast updates
//   await redisPub.publish('orders_updates', JSON.stringify({
//     type: 'order_filled', orderId: order.id, executedPrice: execPrice, commission
//   }));
//   await redisPub.publish('position_updates', JSON.stringify({
//     type: 'position_changed', accountId: order.account_id, symbol: order.symbol
//   }));
// }

// export async function upsertPosition(accountId: string, userId: string, symbol: string, side: string, quantity: number, price: number) {
//   // Your existing upsertPosition code (unchanged)
//   const existing = await query(`SELECT * FROM positions WHERE account_id = $1 AND symbol = $2`, [accountId, symbol]);
//   if (existing.length === 0) {
//     const sign = side === 'BUY' ? 1 : -1;
//     await query(`INSERT INTO positions (user_id, account_id, symbol, quantity, avg_price) VALUES ($1,$2,$3,$4,$5)`,
//       [userId, accountId, symbol, sign * quantity, price]);
//   } else {
//     const pos = existing[0];
//     const currentQty = pos.quantity;
//     const currentAvg = pos.avg_price;
//     const newQty = side === 'BUY' ? currentQty + quantity : currentQty - quantity;
//     if (newQty === 0) {
//       // Position closed – calculate PnL and remove
//       const costBasis = Math.abs(currentQty) * currentAvg;
//       const pnl = (side === 'BUY' ? -1 : 1) * (currentQty > 0 ? 1 : -1) * (quantity * price - costBasis);
//       await query(`DELETE FROM positions WHERE id = $1`, [pos.id]);
//       // Optionally insert realized PnL into ledger
//     } else {
//       const newAvg = currentQty + (side === 'BUY' ? quantity : -quantity) !== 0
//         ? (currentQty * currentAvg + (side === 'BUY' ? quantity * price : -quantity * price)) / newQty
//         : 0;
//       await query(`UPDATE positions SET quantity = $1, avg_price = $2, updated_at = NOW() WHERE id = $3`,
//         [newQty, newAvg, pos.id]);
//     }
//   }
// }