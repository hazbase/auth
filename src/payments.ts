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

let reqIdCounter = 0;
function createRequestId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return `req_${c.randomUUID()}`;
  if (c?.getRandomValues) {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return `req_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  // No CSPRNG available: time + monotonic counter (NOT secret — this is only an
  // x-request-id correlation header, never used as a security token).
  return `req_${Date.now().toString(36)}_${(reqIdCounter++).toString(36)}`;
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

// Trusted, per-network metadata. The EIP-712 domain (name/version/verifyingContract)
// used for signing MUST be derived from this table, never from the untrusted 402
// server response, otherwise a malicious server can induce domain confusion or a
// transfer authorization for an arbitrary token. `usdcAddress` is the canonical
// Circle-issued USDC contract (verified against developers.circle.com).
export const SUPPORTED_X402_BUYER_NETWORKS = {
  base: {
    chainId: 8453,
    label: 'Base',
    eip712Name: 'USD Coin',
    eip712Version: '2',
    usdcName: 'USD Coin',
    usdcVersion: '2',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  'base-sepolia': {
    chainId: 84532,
    label: 'Base Sepolia',
    eip712Name: 'USDC',
    eip712Version: '2',
    usdcName: 'USDC',
    usdcVersion: '2',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  polygon: {
    chainId: 137,
    label: 'Polygon',
    eip712Name: 'USD Coin',
    eip712Version: '2',
    usdcName: 'USD Coin',
    usdcVersion: '2',
    usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  'polygon-amoy': {
    chainId: 80002,
    label: 'Polygon Amoy',
    eip712Name: 'USDC',
    eip712Version: '2',
    usdcName: 'USDC',
    usdcVersion: '2',
    usdcAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
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
  maxValue,
  expectedPayTo,
  expectedAsset,
}: BuildX402PaymentHeaderRequest): Promise<BuildX402PaymentHeaderResult> {
  assertX402Requirement(requirement);
  const networkKey = String(requirement.network);
  const network = supportedBuyerNetwork(networkKey);
  if (!network) throw new Error(`Unsupported buyer network: ${networkKey}`);

  // The 402 requirement comes from an untrusted resource server. Before signing a
  // fund-moving ERC-3009 authorization, pin everything that controls WHAT is signed
  // to trusted, caller-controlled values — never to server-supplied fields.

  // 1) Token must be the canonical USDC for this network (this SDK is USDC-only).
  //    This both fixes EIP-712 domain confusion and prevents authorizing an
  //    attacker-named token contract.
  const canonicalAsset = getAddress(network.usdcAddress);
  const requestedAsset = getAddress(String(requirement.asset));
  if (requestedAsset !== canonicalAsset) {
    throw new Error(
      `x402 asset ${requestedAsset} is not the canonical token (${canonicalAsset}) for network "${networkKey}"`,
    );
  }

  // 2) Optional caller-supplied expectations (defense against a compromised server).
  if (expectedAsset && getAddress(String(expectedAsset)) !== requestedAsset) {
    throw new Error(`x402 asset ${requestedAsset} does not match expectedAsset`);
  }
  const payTo = getAddress(String(requirement.payTo));
  if (expectedPayTo && getAddress(String(expectedPayTo)) !== payTo) {
    throw new Error(`x402 payTo ${payTo} does not match expectedPayTo`);
  }

  // 3) Enforce a caller-supplied spend cap on the (server-quoted) amount.
  const value = BigInt(String(requirement.maxAmountRequired));
  if (maxValue != null && value > BigInt(String(maxValue))) {
    throw new Error(`x402 amount ${value} exceeds the caller-specified maxValue ${String(maxValue)}`);
  }

  const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const maxTimeout = Number(requirement.maxTimeoutSeconds || 60);
  const authorization = {
    from: wallet.address,
    to: payTo,
    value: value.toString(),
    validAfter: String(validAfter ?? Math.max(0, now - 30)),
    validBefore: String(validBefore ?? now + Math.max(30, Math.min(300, Number.isFinite(maxTimeout) ? maxTimeout : 60))),
    nonce: nonce || hexlify(randomBytes(32)),
  };
  // EIP-712 domain is derived ENTIRELY from the trusted network table; server-supplied
  // requirement.extra.name/version are intentionally ignored to prevent domain confusion.
  const domain = {
    name: network.eip712Name,
    version: network.eip712Version,
    chainId: network.chainId,
    verifyingContract: canonicalAsset,
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
    asset: canonicalAsset,
    paymentRequestId: String(requirement.extra?.paymentRequestId ?? '') || undefined,
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
