import { hc } from 'hono/client';
import { createAuthClient } from 'better-auth/react';
import type { InventoryApi } from '../server/inventory-api.js';
import type { AssetIdentifier } from '../server/identity.js';

export const api = hc<InventoryApi>('/api');
export const authClient = createAuthClient();

export async function unwrap<T>(response: { ok: boolean; json(): Promise<T> }): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Request failed');
  }
  return data;
}

export function assetPath(identifier: AssetIdentifier): string {
  return '/asset?' + new URLSearchParams(identifier).toString();
}
