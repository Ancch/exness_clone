import { createRedisClient } from '@repo/redis';
import { query } from '@repo/db';

const redis = createRedisClient();
const pub = redis.duplicate();
const sub = redis.duplicate();

async function main() {
  // Subscribe to ticker channel (raw ticker for accuracy)
  await sub.subscribe('prices:ticker:BTCUSDT'); // later support multiple symbols

  sub.on('message', async (channel, msg) => {
    const ticker = JSON.parse(msg);
    // Get all open positions for that symbol
    const positions = await query(
      `SELECT * FROM positions WHERE symbol = $1`,
      [ticker.symbol]
    );

    for (const pos of positions) {
      const currentPrice = pos.quantity > 0 ? ticker.bid : ticker.ask; // for closing
      const entryPrice = pos.avg_price;
      const qty = pos.quantity;
      const multiplier = qty > 0 ? 1 : -1; // long use bid, short use ask
      const unrealizedPnl = (currentPrice - entryPrice) * Math.abs(qty) * (qty > 0 ? 1 : -1);

      // Update DB (optional, but for real-time display we can just publish)
      await query(`UPDATE positions SET unrealized_pnl = $1 WHERE id = $2`, [unrealizedPnl, pos.id]);

      // Publish update
      pub.publish('position_updates', JSON.stringify({
        type: 'position_pnl',
        accountId: pos.account_id,
        symbol: pos.symbol,
        quantity: pos.quantity,
        avgPrice: entryPrice,
        unrealizedPnl,
        currentPrice,
        marginUsed: pos.margin_used,
        leverage: pos.leverage,
      }));

      // Update account equity: balance + sum of unrealized PnL for that account
      const totalUnrealized = (await query(
        `SELECT COALESCE(SUM(unrealized_pnl),0) as total FROM positions WHERE account_id = $1`,
        [pos.account_id]
      ))[0].total;
      await query(`UPDATE accounts SET equity = balance + $1 WHERE id = $2`, [totalUnrealized, pos.account_id]);
      await query(
        `UPDATE accounts 
        SET free_margin = equity - used_margin 
        WHERE id = $1`,
        [pos.account_id]
    );
    }
  });
}

main().catch(console.error);