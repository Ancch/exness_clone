

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createRedisClient } from '@repo/redis';
import { query } from '@repo/db';
import { processOrder } from './tradeLogic';

const redis = createRedisClient();
const consumerGroup = 'execution_engine';
const streamName = 'orders_stream';

async function initConsumerGroup() {
  try {
    await redis.xgroup('CREATE', streamName, consumerGroup, '$', 'MKSTREAM');
  } catch (err: any) {
    if (!err.message.includes('BUSYGROUP')) throw err;
  }
}

async function startOrderConsumer() {
  await initConsumerGroup();
  console.log('Execution engine consumer started');

  while (true) {
    try {
      const results = await redis.xreadgroup(
        'GROUP', consumerGroup, 'engine-worker-1',
        'BLOCK', 5000,
        'STREAMS', streamName, '>'
      );
      if (results) {
        for (const [, messages] of results as any) {
          for (const [id, fields] of messages) {
            const orderId = fields[1]; // ['orderId', 'uuid']
            console.log(`Processing order ${orderId}`);

            // Mark as QUEUED (so UI knows)
            await query(`UPDATE orders SET status = 'QUEUED' WHERE id = $1`, [orderId]);

            // Process (sends to internal exchange, waits, fills)
            await processOrder(orderId);

            // Fetch final status and log completion for observability
            try {
              const rows = await query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
              const finalStatus = rows?.[0]?.status || 'unknown';
              console.log(`Completed order ${orderId} status=${finalStatus}`);
            } catch (err) {
              console.warn('Could not fetch final order status after processing', err);
            }

            // Acknowledge stream
            await redis.xack(streamName, consumerGroup, id);
          }
        }
      }
    } catch (err) {
      console.error('Consumer loop error:', err);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Main
async function main() {
  startOrderConsumer().catch(console.error);
  console.log('Execution engine running (internal exchange mode)');
}

main();