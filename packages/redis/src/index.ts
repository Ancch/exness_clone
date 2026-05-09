
import Redis from "ioredis";

export function createRedisClient() {
    let url = process.env.REDIS_URL;
    if (!url) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error("REDIS_URL environment variable is not set");
        }
        // Development fallback — warn and connect to local Redis if available
        url = 'redis://127.0.0.1:6379';
        // eslint-disable-next-line no-console
        console.warn(`REDIS_URL not set — falling back to ${url} (development only)`);
    }

    return new Redis(url, {
        maxRetriesPerRequest: null
    });
}