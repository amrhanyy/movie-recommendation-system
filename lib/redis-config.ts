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
  const rawUrl = env.REDIS_URL?.trim() || undefined;
  const host = env.REDIS_HOST?.trim() || undefined;
  const port = parsePort(env.REDIS_PORT);
  // Redis Cloud / ACL auth requires the 'default' user when only a password
  // is provisioned. Default here so hosted instances connect without forcing
  // every deployment to set REDIS_USERNAME explicitly.
  const username = env.REDIS_USERNAME?.trim() || (env.REDIS_PASSWORD ? 'default' : undefined);
  const password = env.REDIS_PASSWORD;
  const tls = parseStrictBoolean(env.REDIS_TLS);

  const url = rawUrl;
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
        // rediss:// URLs carry TLS in the scheme; node-redis honors it from
        // the URL directly, so no extra socket.tls is required here.
        socket: {
          connectTimeout: 3000,
          reconnectStrategy: (retry: number) =>
            retry > 3 ? false : Math.min(retry * 1000, 3000),
        },
        // REDIS-CAL: commandsQueueMaxLength 500 absorbs cross-request
        // summation on a shared serverless instance (e.g. home burst of
        // single-key getOrSet calls + one cold watchlist/details fan-out of
        // ~100 commands). Memory cost is bounded queued command refs only.
        commandsQueueMaxLength: 500,
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
    // REDIS-CAL: same 500 calibration as the URL branch above.
    commandsQueueMaxLength: 500,
    disableOfflineQueue: true,
  };
  // Redis Cloud provisions ACL auth as user 'default' + password. The node-redis
  // client defaults to 'default' when no username is set, so only attach an
  // explicit non-default username.
  if (username && username !== 'default') {
    clientConfig.username = username;
  }
  if (password) {
    clientConfig.password = password;
  }

  return { clientConfig };
}