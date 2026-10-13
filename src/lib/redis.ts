/**
 * Familee - the Redis connection
 *
 * Redis already runs on the server (container "redis"). The application uses it
 * as the cache of sessions and rate-limit counters for better-auth: the sessions
 * themselves are also kept in Postgres, so a Redis restart signs nobody out for good.
 *
 * In development the client is cached in globalThis, as the database pool is,
 * so that hot reloads do not open a new connection every time.
 */

import { Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { famileeRedis?: Redis };

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    throw new Error("REDIS_URL is not set. Example: redis://redis:6379/3");
}

export const redis: Redis =
    globalForRedis.famileeRedis ??
    new Redis(redisUrl, {
        /**
         * Connect on the first command, not on import: the image build imports this
         * module without any Redis running.
         */
        lazyConnect: true,
        /**
         * Commands sent before the connection is ready wait in the queue instead of
         * failing; a request is still cut off after two retries when Redis is down.
         */
        maxRetriesPerRequest: 2,
    });

if (process.env.NODE_ENV !== "production") {
    globalForRedis.famileeRedis = redis;
}
