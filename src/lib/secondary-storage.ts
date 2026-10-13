/**
 * Familee - Redis as the secondary storage of better-auth
 *
 * better-auth keeps sessions and rate-limit counters in a key-value cache when
 * one is configured. The official package for it pins ioredis 5, while the
 * project uses the latest ioredis 6, so the small adapter is written here: the
 * interface is four methods and is documented by better-auth itself.
 *
 * Keys carry a prefix, because the Redis database may be shared with other
 * applications of the server.
 */

import type { SecondaryStorage } from "better-auth";
import type { Redis } from "ioredis";

export function redisSecondaryStorage(client: Redis, prefix: string): SecondaryStorage {
    const key = (name: string) => `${prefix}${name}`;

    return {
        async get(name) {
            return client.get(key(name));
        },

        async getAndDelete(name) {
            return client.getdel(key(name));
        },

        async set(name, value, ttl) {
            if (ttl && ttl > 0) {
                await client.set(key(name), value, "EX", ttl);
            } else {
                await client.set(key(name), value);
            }
        },

        async delete(name) {
            await client.del(key(name));
        },

        /**
         * Counts attempts in a window: the window starts with the first attempt
         * and ends `ttl` seconds later, so a burst cannot keep extending it.
         */
        async increment(name, ttl) {
            const counter = key(name);
            const value = await client.incr(counter);
            if (value === 1) {
                await client.expire(counter, ttl);
            }
            return value;
        },
    };
}
