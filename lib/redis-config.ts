import type { RedisClientOptions } from 'redis';

/**
 * Typed Redis configuration parsing (F-031).
 *
 * Precedence:
 *   1. REDIS_URL (may be redis:// or rediss://) - used directly when present.
 *   2. Individual fields: REDIS_HOST, REDIS_PORT, REDIS_USERNAME,
 *      REDIS_PASSWORD, REDIS_TLS.
 *
 * No credentials are ever logged; errors never contain connection strings.
 * This module is side-effect free so it can be unit-tested without mocking
 * the redis client.
 */

export function parseStrictBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  // Invalid boolean values fail safely (treated as the fallback, never true)
  return fallback;
}

export function parsePort(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }
  return port;
}

export interface RedisConfigResult {
  clientConfig: RedisClientOptions | undefined;
  error?: string;
}

export function buildRedisConfig(env: NodeJS.ProcessEnv = process.env): RedisConfigResult {
  const url = env.REDIS_URL;
  const host = env.REDIS_HOST;
  const port = parsePort(env.REDIS_PORT);
  const username = env.REDIS_USERNAME;
  const password = env.REDIS_PASSWORD;
  const tls = parseStrictBoolean(env.REDIS_TLS);

  if (url) {
    // REDIS_URL takes precedence over individual fields (documented).
    // rediss:// implies TLS. redis:// with REDIS_TLS=true is refused when the
    // caller intends TLS and the scheme would silently use plaintext.
    if (url.startsWith('redis://') && tls) {
      return {
        clientConfig: undefined,
        error:
          'REDIS_TLS=true cannot be combined with a redis:// REDIS_URL; use rediss:// or REDIS_* fields',
      };
    }
    return {
      clientConfig: {
        url,
        socket: {
          connectTimeout: 3000,
          reconnectStrategy: (retry: number) =>
            retry > 3 ? false : Math.min(retry * 1000, 3000),
        },
        commandsQueueMaxLength: 5,
        disableOfflineQueue: true,
      },
    };
  }

  // Individual fields
  if (!host || port === undefined) {
    // Redis is optional (memory fallback exists). Absence is a safe condition,
    // not a misconfiguration.
    return { clientConfig: undefined, error: undefined };
  }

  const socket: RedisClientOptions['socket'] = {
    host,
    port,
    connectTimeout: 3000,
    reconnectStrategy: (retry: number) =>
      retry > 3 ? false : Math.min(retry * 1000, 3000),
    ...(tls ? { tls: true as const } : {}),
  };

  const clientConfig: RedisClientOptions = {
    socket,
    commandsQueueMaxLength: 5,
    disableOfflineQueue: true,
  };
  // When no username is configured, the redis client defaults the ACL
  // username to "default"; never hardcode a username when one is configured.
  if (username && username !== 'default') {
    clientConfig.username = username;
  }
  if (password) {
    clientConfig.password = password;
  }

  return { clientConfig };
}