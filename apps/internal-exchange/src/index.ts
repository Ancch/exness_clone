import { createRedisClient } from '@repo/redis';
import { executeSimulatedOrder } from './executionENgine';

const redis = createRedisClient();
const STREAM_IN = 'execution_requests';
const STREAM_OUT = 'execution_results';
const CONSUMER_GROUP = 'internal_exchange';

async function main() {
  // set up group
  try {
    await redis.xgroup('CREATE', STREAM_IN, CONSUMER_GROUP, '$', 'MKSTREAM');
  } catch (e: any) {
    if (!e.message.includes('BUSYGROUP')) throw e;
  }

  console.log('Internal Exchange running...');
  while (true) {
    try {
      const results = await redis.xreadgroup(
        'GROUP', CONSUMER_GROUP, 'worker-1',
        'BLOCK', 5000,
        'STREAMS', STREAM_IN, '>'
      ) as Array<[string, Array<[string, string[]]>]> | null;
      if (results) {
        for (const [, msgs] of results) {
          for (const [id, fields] of msgs) {
            const data: any = {};
            for (let i = 0; i < fields.length; i += 2) {
              const key = fields[i];
              if (typeof key === 'undefined') continue;
              const value = fields[i + 1];
              data[key] = value;
            }

            const result = await executeSimulatedOrder(data);

            // Publish result to output stream
            await redis.xadd(STREAM_OUT, '*', 'requestId', data.requestId, 'payload', JSON.stringify(result));
            await redis.xack(STREAM_IN, CONSUMER_GROUP, id);
          }
        }
      }
    } catch (err) {
      console.error('Internal exchange loop error:', err);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

main();