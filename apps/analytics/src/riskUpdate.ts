import { query } from '@repo/db';

export async function updateRiskScores() {
  try {
    const users = await query(`SELECT DISTINCT user_id FROM accounts`);
    for (const { user_id } of users) {
      const stats = await query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN side = 'SELL' AND pnl > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) as win_rate,
                AVG(EXTRACT(EPOCH FROM (trades.created_at - orders.created_at))) as avg_holding
         FROM orders JOIN trades ON trades.order_id = orders.id
         WHERE orders.user_id = $1 AND orders.status = 'FILLED'`,
        [user_id]
      );
      if (stats.length > 0) {
        const s = stats[0];
        let score = 50;
        if (s.win_rate > 0.6) score += 20;
        if (s.total > 100) score += 10;
        if (s.avg_holding < 60) score += 15;
        await query(`UPDATE accounts SET risk_score = $1 WHERE user_id = $2`, [score, user_id]);
      }
    }
  } catch (err) {
    console.error('updateRiskScores error:', err);
  }
}