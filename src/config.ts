import { API_ENDPOINT } from './constants';

/** singleton state on globalThis */
interface HazbaseGlobal {
  __hazbase?: {
    clientKey?: string;
    validated?: boolean;
    apiEndpoint?: string;
  };
}
const g = globalThis as HazbaseGlobal;
g.__hazbase ??= { validated: false };

/* ----------------------------------------------------- */
/*  Public helpers                                       */
/* ----------------------------------------------------- */

/** Call once at app bootstrap. */
export function setClientKey(key: string): void {
  g.__hazbase!.clientKey = key;
  g.__hazbase!.validated = false;   // reset cache
  setApiEndpoint();
}

/** Set api endpoint. */
export function setApiEndpoint(uri?: string): void {
  requireClientKey();
  g.__hazbase!.apiEndpoint = uri || API_ENDPOINT;
}

export function getApiEndpoint(): string {
  return g.__hazbase!.apiEndpoint || API_ENDPOINT;
}

/** Throws if the key has not been set. */
export function requireClientKey(): string {
  const key = g.__hazbase!.clientKey;
  if (!key) throw new Error('Client key not set. Call setClientKey() first.');
  return key;
}

/** Returns true if the key was already validated. */
export function isClientKeyValidated(): boolean {
  return !!g.__hazbase!.validated;
}

/** Marks the key as validated (internal use). */
export function markClientKeyValidated(): void {
  g.__hazbase!.validated = true;
}

/** ----------------------------------------------------- */
/**  NEW: Validate key with backend, cached after first   */
/** ----------------------------------------------------- */
export async function ensureClientKeyActive(functionId: number): Promise<string> {
  const key = requireClientKey();
  if (isClientKeyValidated()) return key;
  
  const res = await fetch(
    `${getApiEndpoint()}/api/app/request-transaction/check`,
    {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: key, functionId })
    }
  );
  if (!res.ok) throw new Error('Client‑key validation failed');

  const { data } = await res.json();
  if (!data?.active) throw new Error('Client key is inactive');

  markClientKeyValidated();
  return key;
}

export async function createRequestTransaction({
    functionId,
    walletAddress,
    transactionHash,
    apiRequests = [],
    status,
    reason,
    isCount = true,
  }: {
    functionId: number,
    status: string,
    walletAddress?: string,
    transactionHash?: string,
    apiRequests?: any,
    reason?: string,
    isCount?: boolean
  }) : Promise<void> {
    if (!isCount) return;
    try {
      if (!functionId && functionId !== 0)
        throw new Error('function ID not found.');
  
      if (!status) throw new Error('status is undefined');

      const clientKey = requireClientKey();

      await fetch(
        `${getApiEndpoint()}/api/app/request-transaction`,
        {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                functionId, status,
                ...(walletAddress ? { walletAddress } : {}),
                ...(transactionHash ? { transactionHash } : {}),
                ...(apiRequests?.length ? { apiRequests } : {}),
                ...(reason ? { reason } : {}),
                ...(clientKey ? { clientKey } : {}),
            })
        }
      );
    } catch (e) {
      // do nothing
    }
  }
