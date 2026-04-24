import { getApiEndpoint } from './config';
import type {
  SupportedPaymentsResult,
  X402RequirementsRequest,
  X402RequirementsResult,
  X402SettleRequest,
  X402SettleResult,
  X402VerifyRequest,
  X402VerifyResult,
} from './types';

async function readData<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => undefined);
  return (json?.data ?? json) as T;
}

function createRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `req_${uuid}`;
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function authHeader(emailSession?: string): Record<string, string> {
  return emailSession ? { Authorization: `Bearer ${emailSession}` } : {};
}

async function postJson<T>(path: string, body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<T> {
  const requestId = headers['x-request-id'] ?? headers['X-Request-Id'] ?? createRequestId();
  const res = await fetch(`${getApiEndpoint()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`${path} failed: ${err || res.statusText}`);
  }

  return readData<T>(res);
}

async function getJson<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${getApiEndpoint()}${path}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`${path} failed: ${err || res.statusText}`);
  }

  return readData<T>(res);
}

export async function listSupportedPayments({
  endpoint = '/api/meta/payments',
}: {
  endpoint?: string;
} = {}): Promise<SupportedPaymentsResult> {
  return getJson<SupportedPaymentsResult>(endpoint);
}

export async function buildX402Requirements({
  emailSession,
  endpoint = '/api/payments/x402/requirements',
  ...body
}: X402RequirementsRequest & { endpoint?: string }): Promise<X402RequirementsResult> {
  return postJson<X402RequirementsResult>(endpoint, body as Record<string, unknown>, authHeader(emailSession));
}

export async function verifyX402Payment({
  endpoint = '/api/payments/x402/verify',
  ...body
}: X402VerifyRequest & { endpoint?: string }): Promise<X402VerifyResult> {
  return postJson<X402VerifyResult>(endpoint, body as Record<string, unknown>);
}

export async function settleX402Payment({
  endpoint = '/api/payments/x402/settle',
  ...body
}: X402SettleRequest & { endpoint?: string }): Promise<X402SettleResult> {
  return postJson<X402SettleResult>(endpoint, body as Record<string, unknown>);
}
