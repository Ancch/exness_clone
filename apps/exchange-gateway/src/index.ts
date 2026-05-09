import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createRedisClient } from '@repo/redis';
import { startOrderHandler } from './orderHandler';
import { startUserDataStream } from './userDataStream';

const redis = createRedisClient();

async function main() {
  // Start consuming commands
  startOrderHandler().catch(console.error);

  // Start private WebSocket and forward fills to Redis channel if API key present
  if (process.env.BINANCE_API_KEY) {
    startUserDataStream((executionReport) => {
      // Normalize and publish
      redis.publish('exchange_updates', JSON.stringify({
        type: 'EXECUTION_UPDATE',
        orderId: executionReport.orderId,
        clientOrderId: executionReport.clientOrderId,
        symbol: executionReport.symbol,
        status: executionReport.status,
        executedQuantity: executionReport.executedQuantity,
        lastPrice: executionReport.price,
        timestamp: executionReport.timestamp,
      }));
    });
  } else {
    console.warn('BINANCE_API_KEY not set — skipping user data stream (set BINANCE_API_KEY or .env in apps/exchange-gateway)');
  }

  console.log('Exchange Gateway running');
}
main();