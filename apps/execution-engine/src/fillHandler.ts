// // apps/execution-engine/src/fillHandler.ts
// import { createRedisClient } from '@repo/redis';
// import { query } from '@repo/db';
// import { processOrder, upsertPosition } from './tradeLogic';

// const redis = createRedisClient();
// const sub = redis.duplicate();

// export function startFillListener() {
//   sub.subscribe('exchange_updates');
//   sub.on('message', async (channel, message) => {
//     if (channel === 'exchange_updates') {
//       const update = JSON.parse(message);
//       await handleFillUpdate(update);
//     }
//   });
// }

// async function handleFillUpdate(update: any) {
//   const { clientOrderId, status, executedQuantity, lastPrice } = update;

//   const orderRows = await query(
//     `SELECT * FROM orders WHERE client_order_id = $1`,
//     [clientOrderId]
//   );
//   if (orderRows.length === 0) return;

//   const order = orderRows[0];

//   if (status === 'PARTIALLY_FILLED' || status === 'FILLED') {
//     // Calculate how much was newly filled since last trade
//     const filledSoFarResult = await query(
//       `SELECT COALESCE(SUM(quantity), 0) as filled FROM trades WHERE order_id = $1`,
//       [order.id]
//     );
//     const filledBefore = parseFloat(filledSoFarResult[0].filled);
//     const newlyFilled = executedQuantity - filledBefore;

//     if (newlyFilled > 0) {
//       // Insert a trade for the newly filled portion
//       await query(
//         `INSERT INTO trades (order_id, symbol, quantity, price) VALUES ($1,$2,$3,$4)`,
//         [order.id, order.symbol, newlyFilled, lastPrice]
//       );

//       // Recalculate weighted average price
//       const allTrades = await query(
//         `SELECT * FROM trades WHERE order_id = $1`,
//         [order.id]
//       );
//       const totalQty = allTrades.reduce((sum: number, t: any) => sum + t.quantity, 0);
//       const weightedPrice = allTrades.reduce((sum: number, t: any) => sum + t.quantity * t.price, 0) / totalQty;

//       await query(
//         `UPDATE orders SET executed_price = $1, remaining_quantity = quantity - $2 WHERE id = $3`,
//         [weightedPrice, totalQty, order.id]
//       );

//       // Update position (call your existing upsertPosition logic)
//       await upsertPosition(
//         order.account_id, order.user_id, order.symbol,
//         order.side, newlyFilled, lastPrice
//       );
//     }

//     // Update order status
//     await query(
//       `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
//       [status, order.id]
//     );

//     if (status === 'FILLED') {
//       await processOrder(order.id);
//     }
//   }
// }

// // These two functions should be imported from your existing position/balance logic
// // I'll assume they are in a separate file 'tradeLogic.ts' (you can merge with existing index.ts)

