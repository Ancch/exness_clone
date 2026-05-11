import { createRedisClient } from '@repo/redis';
import { query } from '@repo/db';

export function startPnlUpdater() {
  const pub = createRedisClient();
  const sub = createRedisClient();

  // Subscribe to ALL ticker channels using pattern
  sub.psubscribe('prices:ticker:*');

  sub.on('pmessage', async (pattern, channel, message) => {
    try {
      const ticker = JSON.parse(message);
      const symbol = ticker.symbol;   // ticker object always contains symbol

      // Fetch open positions for this symbol
      const positions = await query(
        `SELECT * FROM positions WHERE symbol = $1`,
        [symbol]
      );

      for (const pos of positions) {
        const qty = pos.quantity;
        // Long uses bid to close, short uses ask
        const currentPrice = qty > 0 ? ticker.bid : ticker.ask;
        const entryPrice = pos.avg_price;
        // unrealized PnL: (current - entry) * size (positive for long, negative for short)
        const multiplier = qty > 0 ? 1 : -1;
        const unrealizedPnl = (currentPrice - entryPrice) * Math.abs(qty) * multiplier;

        await query(`UPDATE positions SET unrealized_pnl = $1 WHERE id = $2`, [unrealizedPnl, pos.id]);

        // Publish detailed update
        pub.publish('position_updates', JSON.stringify({
          type: 'position_pnl',
          accountId: pos.account_id,
          symbol,
          quantity: qty,
          avgPrice: entryPrice,
          unrealizedPnl,
          currentPrice,
          marginUsed: pos.margin_used,
          leverage: pos.leverage,
        }));
      }

      // Update equity and free_margin for all affected accounts (can be optimised)
      const accountIds = [...new Set(positions.map(p => p.account_id))];
      for (const accountId of accountIds) {
        const totalUnrealized = (await query(
          `SELECT COALESCE(SUM(unrealized_pnl),0) as total FROM positions WHERE account_id = $1`,
          [accountId]
        ))[0].total;

        await query(
          `UPDATE accounts SET equity = balance + $1, free_margin = (balance + $1) - used_margin WHERE id = $2`,
          [totalUnrealized, accountId]
        );
      }
    } catch (err) {
      console.error('pnlUpdater error:', err);
    }
  });

  console.log('PnL updater started (listening on prices:ticker:*)');
}