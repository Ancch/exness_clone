// // apps/execution-engine/src/orderExecutor.ts
// import { createRedisClient } from '@repo/redis';
// import { query } from '@repo/db';
// import { v4 as uuid } from 'uuid';

// const redis = createRedisClient();

// export async function executeOrder(orderId: string) {
//   const orderRows = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
//   if (orderRows.length === 0) return;
//   const order = orderRows[0];
//   if (order.status !== 'QUEUED') return;

//   // Mark as SENT_TO_EXCHANGE and set client_order_id
//   await query(
//     `UPDATE orders SET status = 'SENT_TO_EXCHANGE', client_order_id = $1, updated_at = NOW() WHERE id = $2`,
//     [orderId, orderId]
//   );

//   const requestId = uuid();

//   await redis.xadd(
//     'exchange_commands',
//     '*',
//     'action', 'NEW_ORDER',
//     'orderId', order.id,
//     'clientOrderId', order.id,
//     'symbol', order.symbol,
//     'side', order.side,
//     'quantity', String(order.quantity),
//     'requestId', requestId
//   );

//   try {
//     const response = await waitForResponse(requestId, 10000);
//     if (response.success) {
//       await query(`UPDATE orders SET status = 'ACKNOWLEDGED', updated_at = NOW() WHERE id = $1`, [orderId]);
//     } else {
//       await query(`UPDATE orders SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`, [orderId]);
//     }
//   } catch (err) {
//     console.error('Order execution timeout / error:', err);
//     await query(`UPDATE orders SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`, [orderId]);
//   }
// }

// async function waitForResponse(requestId: string, timeoutMs: number): Promise<any> {
//   const start = Date.now();
//   while (Date.now() - start < timeoutMs) {
//     // First, check recent entries (avoid race where response was written before we started waiting)
//     try {
//       const recent = await (redis as any).xrevrange('exchange_responses', '+', '-', 'COUNT', 50);
//       if (recent && recent.length) {
//         for (const [id, fields] of recent) {
//           const { requestId: msgReqId, payload } = parseMessageFields(fields as string[]);
//           if (msgReqId === requestId) {
//             try { await redis.xdel('exchange_responses', id); } catch (e) {}
//             return JSON.parse(payload as string);
//           }
//         }
//       }
//     } catch (e) {
//       // ignore if XREVRANGE not supported, fall back to blocking read below
//     }

//     // If not found, block-wait for new responses (short timeout)
//     try {
//       const res = await (redis as any).xread('BLOCK', 500, 'STREAMS', 'exchange_responses', '$');
//       if (res) {
//         for (const [, messages] of res as any) {
//           for (const [id, fields] of messages) {
//             const { requestId: msgReqId, payload } = parseMessageFields(fields as string[]);
//             if (msgReqId === requestId) {
//               try { await redis.xdel('exchange_responses', id); } catch (e) {}
//               return JSON.parse(payload as string);
//             }
//           }
//         }
//       }
//     } catch (e) {
//       // ignore transient redis errors
//     }
//     // small delay to avoid hot loop
//     await new Promise(r => setTimeout(r, 100));
//   }
//   throw new Error('Timeout waiting for exchange response');
// }

// function parseMessageFields(fields: string[]): Record<string, string> {
//   const obj: Record<string, string> = {};
//   for (let i = 0; i < fields.length; i += 2) {
//     const key = fields[i];
//     const value = fields[i + 1];
//     if (typeof key !== 'string') continue;
//     obj[key] = typeof value === 'string' ? value : '';
//   }
//   return obj;
// }