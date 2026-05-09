import { createRedisClient } from '@repo/redis';
import { v4 as uuid } from 'uuid';
import * as binance from './binanceClient';

const redis = createRedisClient();
const consumerGroup = 'exchange_gateway';
const commandsStream = 'exchange_commands';
const responsesStream = 'exchange_responses';

export async function startOrderHandler() {
  try {
    await redis.xgroup('CREATE', commandsStream, consumerGroup, '$', 'MKSTREAM');
  } catch (err: any) {
    if (!err.message.includes('BUSYGROUP')) throw err;
  }

  while (true) {
    const results = await redis.xreadgroup(
      'GROUP', consumerGroup, 'gateway-worker-1',
      'BLOCK', 5000,
      'STREAMS', commandsStream, '>'
    );
    if (!results) continue;

    for (const [stream, messages] of results as any) {
      for (const [id, fields] of messages) {
        const command = fields.reduce((acc: any, curr: string, i: number, arr: string[]) => {
          if (i % 2 === 0) acc[curr] = arr[i + 1];
          return acc;
        }, {});

        const { action, orderId, clientOrderId, symbol, side, quantity, requestId } = command;
        
        let responsePayload = { requestId, success: false, error: '', data: null };

        try {
          if (action === 'NEW_ORDER') {
            console.log('gateway: NEW_ORDER', { requestId, orderId, clientOrderId, symbol, side, quantity });
            const binanceResp = await binance.newOrder({
              symbol,
              side,
              type: 'MARKET',
              quantity: parseFloat(quantity),
              newClientOrderId: clientOrderId,
            });
            console.log('gateway: binanceResp', { requestId, orderId, clientOrderId, binanceResp });
            responsePayload.success = true;
            responsePayload.data = binanceResp; // contains exchange order id, etc.
          } else if (action === 'CANCEL_ORDER') {
            // not yet needed
          }
        } catch (err: any) {
          const errMsg = err.response?.data?.msg || err.message || String(err);
          console.error('gateway: binance error', { requestId, orderId, clientOrderId, err: errMsg });
          responsePayload.error = errMsg;
        }

        // Publish response to the responses stream
        try {
          const xaddId = await redis.xadd(responsesStream, '*', 'requestId', requestId, 'payload', JSON.stringify(responsePayload));
          console.log('gateway: RESPONSE_PUBLISHED', { requestId, xaddId });
        } catch (pubErr) {
          console.error('gateway: failed to publish response', { requestId, err: String(pubErr) });
        }

        // Acknowledge the processed command
        await redis.xack(commandsStream, consumerGroup, id);
      }
    }
  }
}