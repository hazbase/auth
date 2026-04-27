import { getApiEndpoint } from './config';
import { getAddress, hexlify, randomBytes, Wallet } from 'ethers';
import type {
  BuildX402PaymentHeaderRequest,
  BuildX402PaymentHeaderResult,
  SupportedPaymentsResult,
  X402HazbaseWalletPayRequest,
  X402HazbaseWalletPayResult,
  X402PaymentPayload,
  X402Requirement,
  X402RequirementsRequest,
  X402RequirementsResult,
  X402ResponseBody,
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

const ETH_ADDR_REGEX = /^0x[0-9a-fA-F]{40}$/;
const X402_VERSION = 1;

export const SUPPORTED_X402_BUYER_NETWORKS = {
  base: {
    chainId: 8453,
    label: 'Base',
    usdcName: 'USD Coin',
    usdcVersion: '2',
  },
  'base-sepolia': {
    chainId: 84532,
    label: 'Base Sepolia',
    usdcName: 'USDC',
    usdcVersion: '2',
  },
} as const;

type SupportedX402BuyerNetwork = keyof typeof SUPPORTED_X402_BUYER_NETWORKS;

function encodeBase64(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized + padding, 'base64').toString('utf8');
  }
  const binary = atob(normalized + padding);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function assertX402Requirement(requirement: X402Requirement): void {
  if (!ETH_ADDR_REGEX.test(String(requirement.payTo || ''))) {
    throw new Error('x402 payment requirement has an invalid payTo address');
  }
  if (!ETH_ADDR_REGEX.test(String(requirement.asset || ''))) {
    throw new Error('x402 payment requirement has an invalid asset address');
  }
  if (!/^\d+$/u.test(String(requirement.maxAmountRequired || ''))) {
    throw new Error('x402 payment requirement has an invalid amount');
  }
}

function supportedBuyerNetwork(network: string): (typeof SUPPORTED_X402_BUYER_NETWORKS)[SupportedX402BuyerNetwork] | null {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_X402_BUYER_NETWORKS, network)
    ? SUPPORTED_X402_BUYER_NETWORKS[network as SupportedX402BuyerNetwork]
    : null;
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

export function parseX402ResponseBody(input: string | X402ResponseBody): X402ResponseBody {
  if (typeof input !== 'string') return input;
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object') return parsed as X402ResponseBody;
  } catch {}

  const match = input.match(
    /<script[^>]+type=["']application\/x-x402\+json["'][^>]*>([\s\S]*?)<\/script>/iu,
  );
  if (match) {
    try {
      return JSON.parse(match[1]) as X402ResponseBody;
    } catch {}
  }
  throw new Error('HTTP 402 response did not contain a valid x402 JSON body');
}

export function selectX402PaymentRequirement(
  x402: X402ResponseBody,
  {
    scheme = 'exact',
    networks = Object.keys(SUPPORTED_X402_BUYER_NETWORKS),
  }: {
    scheme?: string;
    networks?: string[];
  } = {},
): X402Requirement {
  const accepts = Array.isArray(x402?.accepts) ? x402.accepts : [];
  const allowedNetworks = new Set(networks.map((network) => String(network)));
  const requirement = accepts.find((item) =>
    item &&
    String(item.scheme || '') === scheme &&
    allowedNetworks.has(String(item.network || '')),
  );
  if (!requirement) {
    const offered = accepts.map((item) => item?.network).filter(Boolean).join(', ') || 'none';
    throw new Error(`No supported x402 ${scheme} payment option found (offered: ${offered})`);
  }
  assertX402Requirement(requirement);
  return requirement;
}

export function getX402PaymentRequestId(x402: X402ResponseBody, requirement?: X402Requirement): string {
  const value =
    x402.paymentRequestId ||
    x402.hazbase?.paymentRequestId ||
    String(requirement?.extra?.paymentRequestId ?? '');
  return /^[a-zA-Z0-9:_-]{8,160}$/u.test(value) ? value : '';
}

export async function buildX402PaymentHeader({
  requirement,
  privateKey,
  nonce,
  validAfter,
  validBefore,
  now = Math.floor(Date.now() / 1000),
}: BuildX402PaymentHeaderRequest): Promise<BuildX402PaymentHeaderResult> {
  assertX402Requirement(requirement);
  const networkKey = String(requirement.network);
  const network = supportedBuyerNetwork(networkKey);
  if (!network) throw new Error(`Unsupported buyer network: ${networkKey}`);

  const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const maxTimeout = Number(requirement.maxTimeoutSeconds || 60);
  const authorization = {
    from: wallet.address,
    to: getAddress(String(requirement.payTo)),
    value: String(requirement.maxAmountRequired),
    validAfter: String(validAfter ?? Math.max(0, now - 30)),
    validBefore: String(validBefore ?? now + Math.max(30, Math.min(300, Number.isFinite(maxTimeout) ? maxTimeout : 60))),
    nonce: nonce || hexlify(randomBytes(32)),
  };
  const domain = {
    name: String(requirement.extra?.name || network.usdcName),
    version: String(requirement.extra?.version || network.usdcVersion),
    chainId: network.chainId,
    verifyingContract: getAddress(String(requirement.asset)),
  };
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };
  const signature = await wallet.signTypedData(domain, types, authorization);
  const payload: X402PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: String(requirement.scheme || 'exact'),
    network: networkKey,
    payload: {
      signature,
      authorization,
    },
  };
  return {
    header: encodeBase64(JSON.stringify(payload)),
    payer: wallet.address,
    payload,
  };
}

export function decodeXPaymentResponseHeader(value?: string | null): Record<string, unknown> | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeBase64(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { raw };
  } catch {
    return { raw };
  }
}

export async function payX402WithHazbaseWallet({
  emailSession,
  endpoint = '/api/payments/x402/hazbase-wallet/pay',
  ...body
}: X402HazbaseWalletPayRequest & { endpoint?: string }): Promise<X402HazbaseWalletPayResult> {
  return postJson<X402HazbaseWalletPayResult>(endpoint, body as Record<string, unknown>, authHeader(emailSession));
}
