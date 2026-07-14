import { getApiEndpoint } from './config';
import type {
  BootstrapPasskeyAccountRequest,
  BootstrapPasskeyAccountResult,
  CompletePasskeyAssertionRequest,
  CompletePasskeyAssertionResult,
  CompletePasskeyRegistrationRequest,
  CompletePasskeyRegistrationResult,
  EmailOtpRequestResult,
  EmailOtpSessionResult,
  EmailSessionRefreshResult,
  EmailStepUpHandoff,
  EmailStepUpRequestResult,
  EmbeddedSessionGrantResult,
  EndEmbeddedSessionRequest,
  ExecuteEmbeddedSessionRequest,
  ExecuteEmbeddedSessionResult,
  GrantEmbeddedSessionRequest,
  GetActivityRequest,
  GetActivityResult,
  GetBalanceRequest,
  GetBalanceResult,
  GetTokenInfoRequest,
  GetTokenInfoResult,
  ListEmbeddedSessionsRequest,
  ListEmbeddedSessionsResult,
  ListTokensRequest,
  ListTokensResult,
  ListPasskeyDevicesRequest,
  ListPasskeyDevicesResult,
  SupportedChainsResult,
  LookupPasskeyAccountRequest,
  LookupPasskeyAccountResult,
  OwnerUserOpAuthorizationRequest,
  OwnerUserOpAuthorizationResult,
  PasskeyAssertionChallengeResult,
  PasskeyAssertionCredential,
  PasskeyAssertionPurpose,
  PasskeyAccountDescriptorResult,
  PrepareTransferRequest,
  PrepareTransferResult,
  PasskeyRegistrationCredential,
  PasskeyRegistrationChallengeResult,
  PasskeyPartnerOriginOptions,
  RevokeEmbeddedSessionRequest,
  RevokeEmbeddedSessionResult,
  RevokePasskeyDeviceRequest,
  RevokePasskeyDeviceResult,
  SignInResult,
  SponsorUserOpRequest,
  SponsorUserOpResult,
  StepUpAssurance,
  StepUpBrowserBinding,
  StepUpResult,
  StepUpVerificationResult,
  StartEmbeddedSessionRequest,
  SubmitTransferRequest,
  SubmitTransferResult,
} from './types';
import type { ethers } from 'ethers';
import { ensureClientKeyActive, createRequestTransaction } from './config';

export type HazbaseApiErrorBody = {
  message?: string | { message?: string; code?: string; errorCode?: string };
  error?: string;
  reason?: string;
  code?: string;
  errorCode?: string;
};

export class HazbaseApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: HazbaseApiErrorBody;

  constructor(message: string, status: number, code?: string, body?: HazbaseApiErrorBody) {
    super(message);
    this.name = 'HazbaseApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export type HazbasePasskeyErrorCode =
  | 'passkey_cancelled'
  | 'passkey_timeout'
  | 'browser_no_passkey'
  | 'https_required'
  | 'passkey_unavailable';

export class HazbasePasskeyError extends Error {
  readonly code: HazbasePasskeyErrorCode;

  constructor(code: HazbasePasskeyErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'HazbasePasskeyError';
    this.code = code;
  }
}

export interface CurrentPasskeyPartnerOriginOptions {
  clientKey: string;
  location?: Pick<Location, 'origin' | 'protocol' | 'hostname'>;
  secureContext?: boolean;
  allowIpHostname?: boolean;
}

export interface PasskeyAvailabilityOptions {
  location?: Pick<Location, 'protocol' | 'hostname'>;
  secureContext?: boolean;
  allowIpHostname?: boolean;
}

export interface RegisterPasskeyRequest {
  emailSession: string;
  deviceId?: string;
  deviceLabel?: string;
  partnerOrigin?: PasskeyPartnerOriginOptions;
  metadata?: Record<string, unknown>;
  challengeEndpoint?: string;
  completeEndpoint?: string;
}

export interface AssertPasskeyRequest {
  emailSession: string;
  purpose?: PasskeyAssertionPurpose;
  deviceBindingId?: string;
  partnerOrigin?: PasskeyPartnerOriginOptions;
  challengeEndpoint?: string;
  completeEndpoint?: string;
}

async function readData<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => undefined);
  return (json?.data ?? json) as T;
}

async function readApiError(res: Response, path: string): Promise<HazbaseApiError> {
  const text = await res.text().catch(() => '');
  const parsed = text ? tryParseJson(text) : undefined;
  const body = (parsed ?? {}) as HazbaseApiErrorBody;
  const nested = typeof body.message === 'object' ? body.message : undefined;
  const parsedMessage = typeof body.message === 'string'
    ? body.message
    : nested?.message ?? body.error ?? body.reason ?? text;
  const message = parsedMessage || `${path} failed: ${res.statusText}`;
  const code = body.code ?? body.errorCode ?? nested?.code ?? nested?.errorCode;
  return new HazbaseApiError(message, res.status, code, parsed ? body : undefined);
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
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
    throw await readApiError(res, path);
  }

  return readData<T>(res);
}

async function getJson<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${getApiEndpoint()}${path}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw await readApiError(res, path);
  }

  return readData<T>(res);
}
function authHeader(emailSession: string): Record<string, string> {
  return { Authorization: `Bearer ${emailSession}` };
}

async function auditIfEnabled(params: {
  functionId?: number;
  status: string;
  walletAddress?: string;
  reason?: string;
  apiRequests?: unknown[];
}) {
  if (params.functionId == null) return;
  await ensureClientKeyActive(params.functionId);
  await createRequestTransaction({
    functionId: params.functionId,
    status: params.status,
    ...(params.walletAddress ? { walletAddress: params.walletAddress } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
    ...(params.apiRequests ? { apiRequests: params.apiRequests } : {}),
  });
}

async function fetchNonce(walletAddress: string): Promise<string> {
  const res = await fetch(`${getApiEndpoint()}/api/app/user/nonce?walletAddress=${encodeURIComponent(walletAddress)}`);
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Nonce request failed: ${err || res.statusText}`);
  }
  const { nonce } = await readData<{ nonce: string }>(res);
  return nonce;
}

export async function listSupportedChains({
  endpoint = '/api/meta/chains',
}: {
  endpoint?: string;
} = {}): Promise<SupportedChainsResult> {
  return getJson<SupportedChainsResult>(endpoint);
}

export async function listTokens({
  chainId,
  endpoint = '/api/wallet/tokens',
}: ListTokensRequest & { endpoint?: string } = {}): Promise<ListTokensResult> {
  const query = chainId != null ? `?chainId=${encodeURIComponent(String(chainId))}` : '';
  return getJson<ListTokensResult>(`${endpoint}${query}`);
}

export async function getTokenInfo({
  chainId,
  token,
  endpoint = '/api/wallet/token-info',
}: GetTokenInfoRequest & { endpoint?: string }): Promise<GetTokenInfoResult> {
  return postJson<GetTokenInfoResult>(endpoint, {
    token,
    ...(chainId != null ? { chainId } : {}),
  });
}

export async function getBalance({
  chainId,
  token,
  account,
  endpoint = '/api/wallet/balance',
}: GetBalanceRequest & { endpoint?: string }): Promise<GetBalanceResult> {
  return postJson<GetBalanceResult>(endpoint, {
    token,
    account,
    ...(chainId != null ? { chainId } : {}),
  });
}

export async function getActivity({
  chainId,
  token,
  account,
  limit,
  cursor,
  fromBlock,
  toBlock,
  endpoint = '/api/wallet/activity',
}: GetActivityRequest & { endpoint?: string }): Promise<GetActivityResult> {
  return postJson<GetActivityResult>(endpoint, {
    token,
    account,
    ...(chainId != null ? { chainId } : {}),
    ...(limit != null ? { limit } : {}),
    ...(cursor ? { cursor } : {}),
    ...(fromBlock != null ? { fromBlock } : {}),
    ...(toBlock != null ? { toBlock } : {}),
  });
}

export async function prepareTransfer({
  chainId,
  token,
  account,
  recipient,
  amount,
  metadata,
  endpoint = '/api/wallet/transfer/prepare',
}: PrepareTransferRequest & { endpoint?: string }): Promise<PrepareTransferResult> {
  return postJson<PrepareTransferResult>(endpoint, {
    token,
    account,
    recipient,
    amount,
    ...(chainId != null ? { chainId } : {}),
    ...(metadata ? { metadata } : {}),
  });
}

export async function submitTransfer({
  emailSession,
  chainId,
  token,
  account,
  recipient,
  amount,
  deviceBindingId,
  highTrustToken,
  accountSalt,
  paymasterValiditySec,
  waitForReceipt,
  metadata,
  endpoint = '/api/wallet/transfer/submit',
}: SubmitTransferRequest & { endpoint?: string }): Promise<SubmitTransferResult> {
  return postJson<SubmitTransferResult>(endpoint, {
    token,
    account,
    recipient,
    amount,
    deviceBindingId,
    highTrustToken,
    ...(chainId != null ? { chainId } : {}),
    ...(accountSalt ? { accountSalt } : {}),
    ...(paymasterValiditySec != null ? { paymasterValiditySec } : {}),
    ...(waitForReceipt != null ? { waitForReceipt } : {}),
    ...(metadata ? { metadata } : {}),
  }, authHeader(emailSession));
}

export async function signInWithWallet(
  {
    signer,
    buildMessage = (nonce: string) => `Please sign to authorize user with nonce: ${nonce}`,
  }: {
    signer: ethers.JsonRpcSigner;
    buildMessage?: (nonce: string) => string;
  },
): Promise<SignInResult> {
  await ensureClientKeyActive(69);
  const walletAddress = await signer.getAddress();
  const nonce = await fetchNonce(walletAddress);
  const message = buildMessage(nonce);
  const signature = await signer.signMessage(message);
  const data = await postJson<{ jwt?: { accessToken?: string } }>('/api/auth/sign-in-with-crypto-wallet', { signature, walletAddress });
  const accessToken = data?.jwt?.accessToken as string | undefined;
  if (!accessToken) throw new Error('Missing accessToken in response');
  await createRequestTransaction({ functionId: 69, walletAddress, status: 'succeeded', isCount: true });
  return { walletAddress, accessToken };
}

export async function requestEmailOtp({
  email,
  purpose = 'smart_wallet_sign_in',
  functionId,
  endpoint = '/api/auth/email/request-otp',
}: {
  email: string;
  purpose?: string;
  functionId?: number;
  endpoint?: string;
}): Promise<EmailOtpRequestResult> {
  await auditIfEnabled({ functionId, status: 'pending' });
  try {
    const result = await postJson<EmailOtpRequestResult>(endpoint, { email, purpose });
    await auditIfEnabled({ functionId, status: 'succeeded' });
    return { ...result, email: result.email ?? email };
  } catch (error) {
    await auditIfEnabled({ functionId, status: 'failed', reason: (error as Error).message });
    throw error;
  }
}

export async function verifyEmailOtp({
  email,
  code,
  purpose = 'smart_wallet_sign_in',
  functionId,
  endpoint = '/api/auth/email/verify-otp',
}: {
  email: string;
  code: string;
  purpose?: string;
  functionId?: number;
  endpoint?: string;
}): Promise<EmailOtpSessionResult> {
  await auditIfEnabled({ functionId, status: 'pending' });
  try {
    const result = await postJson<EmailOtpSessionResult>(endpoint, { email, code, purpose });
    await auditIfEnabled({ functionId, status: 'succeeded' });
    return { ...result, email: result.email ?? email };
  } catch (error) {
    await auditIfEnabled({ functionId, status: 'failed', reason: (error as Error).message });
    throw error;
  }
}

export async function refreshEmailSession({
  refreshToken,
  endpoint = '/api/auth/email/refresh-session',
}: {
  refreshToken: string;
  endpoint?: string;
}): Promise<EmailSessionRefreshResult> {
  return postJson<EmailSessionRefreshResult>(endpoint, { refreshToken });
}

export async function createStepUpBrowserBinding(): Promise<StepUpBrowserBinding> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues || !cryptoApi.subtle) {
    throw new Error('Secure browser cryptography is required for step-up authentication.');
  }
  const secretBytes = cryptoApi.getRandomValues(new Uint8Array(32));
  const secret = bytesToBase64Url(secretBytes);
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return { secret, hash: bytesToHex(new Uint8Array(digest)) };
}

export async function requestEmailStepUp({
  emailSession,
  purpose,
  browserBindingHash,
  origin,
  returnUrl,
  endpoint = '/api/auth/step-up/email/request',
}: {
  emailSession: string;
  purpose: string;
  browserBindingHash: string;
  origin?: string;
  returnUrl?: string;
  endpoint?: string;
}): Promise<EmailStepUpRequestResult> {
  const resolvedOrigin = resolveStepUpOrigin(origin);
  const resolvedReturnUrl = resolveStepUpReturnUrl(returnUrl, resolvedOrigin);
  return postJson<EmailStepUpRequestResult>(endpoint, {
    origin: resolvedOrigin,
    purpose,
    browserBindingHash,
    returnUrl: resolvedReturnUrl,
  }, { ...authHeader(emailSession), Origin: resolvedOrigin });
}

export async function completeEmailStepUp({
  emailSession,
  challengeId,
  purpose,
  browserBindingSecret,
  token,
  code,
  origin,
  endpoint = '/api/auth/step-up/email/complete',
}: {
  emailSession: string;
  challengeId: string;
  purpose: string;
  browserBindingSecret: string;
  token?: string;
  code?: string;
  origin?: string;
  endpoint?: string;
}): Promise<StepUpResult> {
  const resolvedOrigin = resolveStepUpOrigin(origin);
  return postJson<StepUpResult>(endpoint, {
    challengeId,
    origin: resolvedOrigin,
    purpose,
    browserBindingSecret,
    ...(token ? { token } : {}),
    ...(code ? { code } : {}),
  }, { ...authHeader(emailSession), Origin: resolvedOrigin });
}

export async function completePasskeyStepUp({
  emailSession,
  purpose,
  highTrustToken,
  origin,
  endpoint = '/api/auth/step-up/passkey/complete',
}: {
  emailSession: string;
  purpose: string;
  highTrustToken: string;
  origin?: string;
  endpoint?: string;
}): Promise<StepUpResult> {
  const resolvedOrigin = resolveStepUpOrigin(origin);
  return postJson<StepUpResult>(endpoint, {
    origin: resolvedOrigin,
    purpose,
    highTrustToken,
  }, { ...authHeader(emailSession), Origin: resolvedOrigin });
}

export async function verifyStepUpAssurance({
  emailSession,
  assuranceToken,
  purpose,
  minimumAssurance = 'email_link',
  origin,
  endpoint = '/api/auth/step-up/verify',
}: {
  emailSession: string;
  assuranceToken: string;
  purpose: string;
  minimumAssurance?: StepUpAssurance;
  origin?: string;
  endpoint?: string;
}): Promise<StepUpVerificationResult> {
  const resolvedOrigin = resolveStepUpOrigin(origin);
  return postJson<StepUpVerificationResult>(endpoint, {
    assuranceToken,
    origin: resolvedOrigin,
    purpose,
    minimumAssurance,
  }, { ...authHeader(emailSession), Origin: resolvedOrigin });
}

export function readEmailStepUpHandoff(fragment?: string): EmailStepUpHandoff | null {
  const value = fragment ?? (typeof location === 'undefined' ? '' : location.hash);
  const params = new URLSearchParams(value.replace(/^#/u, ''));
  const encoded = params.get('hazbaseStepUp');
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(base64UrlToUtf8(encoded)) as Partial<EmailStepUpHandoff>;
    if (
      parsed.version !== 1 ||
      typeof parsed.challengeId !== 'string' || !parsed.challengeId ||
      typeof parsed.token !== 'string' || !parsed.token ||
      typeof parsed.origin !== 'string' || !parsed.origin ||
      typeof parsed.purpose !== 'string' || !parsed.purpose
    ) return null;
    return parsed as EmailStepUpHandoff;
  } catch {
    return null;
  }
}

export function consumeEmailStepUpHandoffFromLocation({
  clear = true,
}: {
  clear?: boolean;
} = {}): EmailStepUpHandoff | null {
  if (typeof location === 'undefined') return null;
  const handoff = readEmailStepUpHandoff(location.hash);
  if (!handoff || !clear || typeof history === 'undefined') return handoff;
  const url = new URL(location.href);
  const params = new URLSearchParams(url.hash.replace(/^#/u, ''));
  params.delete('hazbaseStepUp');
  url.hash = params.toString();
  history.replaceState(history.state, '', url.toString());
  return handoff;
}

export async function requestPasskeyRegistrationChallenge({
  emailSession,
  deviceId,
  deviceLabel,
  partnerOrigin,
  endpoint = '/api/auth/passkey/register/challenge',
}: {
  emailSession: string;
  deviceId?: string;
  deviceLabel?: string;
  partnerOrigin?: PasskeyPartnerOriginOptions;
  endpoint?: string;
}): Promise<PasskeyRegistrationChallengeResult> {
  return postJson<PasskeyRegistrationChallengeResult>(endpoint, {
    ...(deviceId ? { deviceId } : {}),
    ...(deviceLabel ? { deviceLabel } : {}),
    ...(partnerOrigin?.origin ? { origin: partnerOrigin.origin } : {}),
    ...(partnerOrigin?.rpId ? { rpId: partnerOrigin.rpId } : {}),
    ...(partnerOrigin?.clientKey ? { clientKey: partnerOrigin.clientKey } : {}),
  }, authHeader(emailSession));
}

export async function completePasskeyRegistration({
  emailSession,
  challengeId,
  credential,
  deviceId,
  deviceLabel,
  metadata,
  endpoint = '/api/auth/passkey/register/complete',
}: CompletePasskeyRegistrationRequest & { endpoint?: string }): Promise<CompletePasskeyRegistrationResult> {
  return postJson<CompletePasskeyRegistrationResult>(endpoint, {
    challengeId,
    credential,
    ...(deviceId ? { deviceId } : {}),
    ...(deviceLabel ? { deviceLabel } : {}),
    ...(metadata ? { metadata } : {}),
  }, authHeader(emailSession));
}

export async function requestPasskeyAssertionChallenge({
  emailSession,
  purpose = 'reauth',
  deviceBindingId,
  partnerOrigin,
  endpoint = '/api/auth/passkey/assert/challenge',
}: {
  emailSession: string;
  purpose?: PasskeyAssertionPurpose;
  deviceBindingId?: string;
  partnerOrigin?: PasskeyPartnerOriginOptions;
  endpoint?: string;
}): Promise<PasskeyAssertionChallengeResult> {
  return postJson<PasskeyAssertionChallengeResult>(endpoint, {
    purpose,
    ...(deviceBindingId ? { deviceBindingId } : {}),
    ...(partnerOrigin?.origin ? { origin: partnerOrigin.origin } : {}),
    ...(partnerOrigin?.rpId ? { rpId: partnerOrigin.rpId } : {}),
    ...(partnerOrigin?.clientKey ? { clientKey: partnerOrigin.clientKey } : {}),
  }, authHeader(emailSession));
}

export async function completePasskeyAssertion({
  emailSession,
  challengeId,
  credential,
  purpose,
  deviceBindingId,
  endpoint = '/api/auth/passkey/assert/complete',
}: CompletePasskeyAssertionRequest & { endpoint?: string }): Promise<CompletePasskeyAssertionResult> {
  return postJson<CompletePasskeyAssertionResult>(endpoint, {
    challengeId,
    credential,
    ...(purpose ? { purpose } : {}),
    ...(deviceBindingId ? { deviceBindingId } : {}),
  }, authHeader(emailSession));
}

export async function registerPasskey({
  emailSession,
  deviceId,
  deviceLabel,
  partnerOrigin,
  metadata,
  challengeEndpoint,
  completeEndpoint,
}: RegisterPasskeyRequest): Promise<CompletePasskeyRegistrationResult> {
  const challenge = await requestPasskeyRegistrationChallenge({
    emailSession,
    deviceId,
    deviceLabel,
    partnerOrigin,
    ...(challengeEndpoint ? { endpoint: challengeEndpoint } : {}),
  });
  const credential = await createPasskeyRegistrationCredential(challenge);
  return completePasskeyRegistration({
    emailSession,
    challengeId: challenge.challengeId,
    credential,
    ...(deviceId ? { deviceId } : {}),
    ...(deviceLabel ? { deviceLabel } : {}),
    ...(metadata ? { metadata } : {}),
    ...(completeEndpoint ? { endpoint: completeEndpoint } : {}),
  });
}

export async function assertPasskey({
  emailSession,
  purpose = 'reauth',
  deviceBindingId,
  partnerOrigin,
  challengeEndpoint,
  completeEndpoint,
}: AssertPasskeyRequest): Promise<CompletePasskeyAssertionResult> {
  const challenge = await requestPasskeyAssertionChallenge({
    emailSession,
    purpose,
    ...(deviceBindingId ? { deviceBindingId } : {}),
    partnerOrigin,
    ...(challengeEndpoint ? { endpoint: challengeEndpoint } : {}),
  });
  const credential = await createPasskeyAssertionCredential(challenge);
  return completePasskeyAssertion({
    emailSession,
    challengeId: challenge.challengeId,
    purpose,
    deviceBindingId: challenge.deviceBindingId ?? deviceBindingId,
    credential,
    ...(completeEndpoint ? { endpoint: completeEndpoint } : {}),
  });
}

export function canUseDirectPartnerPasskey(options: PasskeyAvailabilityOptions = {}): boolean {
  const currentLocation = options.location ?? safeLocation();
  if (!currentLocation) return false;
  const secureContext = options.secureContext ?? globalThis.isSecureContext;
  if (!secureContext) return false;
  if (currentLocation.protocol !== 'https:') return false;
  if (!canUsePasskeyCredential()) return false;
  if (!options.allowIpHostname && isIpHostname(currentLocation.hostname)) return false;
  return true;
}

export function getCurrentPasskeyPartnerOrigin(options: CurrentPasskeyPartnerOriginOptions): PasskeyPartnerOriginOptions {
  const currentLocation = options.location ?? safeLocation();
  if (!currentLocation || !canUseDirectPartnerPasskey(options)) {
    throw new HazbasePasskeyError('https_required', 'Direct passkey setup needs an HTTPS hostname.');
  }
  return {
    origin: currentLocation.origin,
    rpId: currentLocation.hostname,
    clientKey: options.clientKey,
  };
}

export function canUsePasskeyCredential(): boolean {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.credentials)
    && typeof globalThis.PublicKeyCredential !== 'undefined';
}

export async function createPasskeyRegistrationCredential(
  challenge: PasskeyRegistrationChallengeResult,
): Promise<PasskeyRegistrationCredential> {
  assertBrowserPasskeyAvailable();
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: base64UrlToArrayBuffer(challenge.challenge),
      rp: {
        id: challenge.rpId,
        name: challenge.rpName || 'hazBase',
      },
      user: {
        id: base64UrlToArrayBuffer(challenge.userHandle),
        name: challenge.userName,
        displayName: challenge.userDisplayName || challenge.userName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: challenge.timeoutMs ?? 300_000,
      excludeCredentials: (challenge.excludeCredentialIds ?? []).map((id) => ({
        id: base64UrlToArrayBuffer(id),
        type: 'public-key' as const,
      })),
      attestation: 'none',
    },
  }).catch((error: unknown) => {
    throw toPasskeyError(error);
  });

  const publicKeyCredential = globalThis.PublicKeyCredential;
  if (!publicKeyCredential || !(credential instanceof publicKeyCredential)) {
    throw new HazbasePasskeyError('passkey_cancelled', 'Passkey registration was cancelled.');
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey?.();
  const publicKeyAlgorithm = response.getPublicKeyAlgorithm?.();
  const authenticatorData = response.getAuthenticatorData?.();
  if (!publicKey || publicKeyAlgorithm == null || !authenticatorData) {
    throw new HazbasePasskeyError('browser_no_passkey', 'This browser does not expose the WebAuthn registration details required.');
  }

  return {
    username: challenge.userName,
    credential: {
      id: credential.id,
      publicKey: bytesToBase64(new Uint8Array(publicKey)),
      algorithm: publicKeyAlgorithm === -257 ? 'RS256' : 'ES256',
    },
    authenticatorData: bytesToBase64(new Uint8Array(authenticatorData)),
    clientData: bytesToBase64(new Uint8Array(response.clientDataJSON)),
    attestationData: bytesToBase64(new Uint8Array(response.attestationObject)),
  };
}

export async function createPasskeyAssertionCredential(
  challenge: PasskeyAssertionChallengeResult,
): Promise<PasskeyAssertionCredential> {
  assertBrowserPasskeyAvailable();
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: base64UrlToArrayBuffer(challenge.challenge),
      rpId: challenge.rpId,
      timeout: challenge.timeoutMs ?? 300_000,
      userVerification: 'required',
      allowCredentials: (challenge.credentialIds ?? []).map((id) => ({
        id: base64UrlToArrayBuffer(id),
        type: 'public-key' as const,
      })),
    },
  }).catch((error: unknown) => {
    throw toPasskeyError(error);
  });

  const publicKeyCredential = globalThis.PublicKeyCredential;
  if (!publicKeyCredential || !(credential instanceof publicKeyCredential)) {
    throw new HazbasePasskeyError('passkey_cancelled', 'Passkey check was cancelled.');
  }

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    credentialId: credential.id,
    authenticatorData: bytesToBase64(new Uint8Array(response.authenticatorData)),
    clientData: bytesToBase64(new Uint8Array(response.clientDataJSON)),
    signature: bytesToBase64(new Uint8Array(response.signature)),
    ...(response.userHandle ? { userHandle: bytesToBase64(new Uint8Array(response.userHandle)) } : {}),
  };
}

export async function requestPasskeyAccountDescriptor({
  emailSession,
  deviceBindingId,
  accountSalt,
  chainId,
  accountVariant,
  endpoint = '/api/auth/account/descriptor',
}: {
  emailSession: string;
  deviceBindingId: string;
  accountSalt?: string;
  chainId?: number;
  accountVariant?: string;
  endpoint?: string;
}): Promise<PasskeyAccountDescriptorResult> {
  return postJson<PasskeyAccountDescriptorResult>(endpoint, {
    deviceBindingId,
    ...(accountSalt ? { accountSalt } : {}),
    ...(chainId != null ? { chainId } : {}),
    ...(accountVariant ? { accountVariant } : {}),
  }, authHeader(emailSession));
}

export async function bootstrapPasskeyAccount({
  emailSession,
  deviceBindingId,
  highTrustToken,
  accountSalt,
  chainId,
  accountVariant,
  metadata,
  endpoint = '/api/auth/account/bootstrap',
}: BootstrapPasskeyAccountRequest & { endpoint?: string }): Promise<BootstrapPasskeyAccountResult> {
  return postJson<BootstrapPasskeyAccountResult>(endpoint, {
    deviceBindingId,
    highTrustToken,
    ...(accountSalt ? { accountSalt } : {}),
    ...(chainId != null ? { chainId } : {}),
    ...(accountVariant ? { accountVariant } : {}),
    ...(metadata ? { metadata } : {}),
  }, authHeader(emailSession));
}

export async function lookupPasskeyAccount({
  emailSession,
  deviceBindingId,
  smartAccountAddress,
  chainId,
  endpoint = '/api/auth/account/lookup',
}: LookupPasskeyAccountRequest & { endpoint?: string }): Promise<LookupPasskeyAccountResult> {
  return postJson<LookupPasskeyAccountResult>(endpoint, {
    ...(deviceBindingId ? { deviceBindingId } : {}),
    ...(smartAccountAddress ? { smartAccountAddress } : {}),
    ...(chainId != null ? { chainId } : {}),
  }, authHeader(emailSession));
}

export async function authorizeOwnerUserOp({
  emailSession,
  deviceBindingId,
  highTrustToken,
  smartAccountAddress,
  chainId,
  userOpHash,
  validForSec,
  endpoint = '/api/auth/account/authorize-userop',
}: OwnerUserOpAuthorizationRequest & { endpoint?: string }): Promise<OwnerUserOpAuthorizationResult> {
  return postJson<OwnerUserOpAuthorizationResult>(endpoint, {
    deviceBindingId,
    highTrustToken,
    smartAccountAddress,
    ...(chainId != null ? { chainId } : {}),
    userOpHash,
    ...(validForSec != null ? { validForSec } : {}),
  }, authHeader(emailSession));
}

export async function startEmbeddedSession({
  emailSession,
  smartAccountAddress,
  chainId,
  deviceBindingId,
  actionProfileKey,
  highTrustToken,
  sessionKeyAddress,
  metadata,
  endpoint = '/api/wallet/session/start',
}: StartEmbeddedSessionRequest & { endpoint?: string }): Promise<EmbeddedSessionGrantResult> {
  return postJson<EmbeddedSessionGrantResult>(endpoint, {
    smartAccountAddress,
    ...(chainId != null ? { chainId } : {}),
    deviceBindingId,
    actionProfileKey,
    highTrustToken,
    ...(sessionKeyAddress ? { sessionKeyAddress } : {}),
    ...(metadata ? { metadata } : {}),
  }, authHeader(emailSession));
}

export async function endEmbeddedSession({
  emailSession,
  embeddedSessionId,
  endpoint = '/api/wallet/session/end',
}: EndEmbeddedSessionRequest & { endpoint?: string }): Promise<void> {
  await postJson(endpoint, { embeddedSessionId }, authHeader(emailSession));
}

export async function grantEmbeddedSession({
  emailSession,
  embeddedSessionId,
  smartAccountAddress,
  deviceBindingId,
  highTrustToken,
  endpoint = '/api/wallet/session/grant',
}: GrantEmbeddedSessionRequest & { endpoint?: string }): Promise<EmbeddedSessionGrantResult> {
  return postJson<EmbeddedSessionGrantResult>(endpoint, {
    embeddedSessionId,
    smartAccountAddress,
    deviceBindingId,
    highTrustToken,
  }, authHeader(emailSession));
}

export async function executeEmbeddedSession({
  emailSession,
  embeddedSessionId,
  userOp,
  target,
  data,
  value,
  paymasterValiditySec,
  metadata,
  waitForReceipt,
  endpoint = '/api/wallet/session/execute',
}: ExecuteEmbeddedSessionRequest & { endpoint?: string }): Promise<ExecuteEmbeddedSessionResult> {
  return postJson<ExecuteEmbeddedSessionResult>(endpoint, {
    embeddedSessionId,
    userOp,
    target,
    data,
    ...(value != null ? { value } : {}),
    ...(paymasterValiditySec != null ? { paymasterValiditySec } : {}),
    ...(metadata ? { metadata } : {}),
    ...(waitForReceipt != null ? { waitForReceipt } : {}),
  }, authHeader(emailSession));
}

export async function listPasskeyDevices({
  emailSession,
  endpoint = '/api/auth/account/devices',
}: ListPasskeyDevicesRequest & { endpoint?: string }): Promise<ListPasskeyDevicesResult> {
  return postJson<ListPasskeyDevicesResult>(endpoint, {}, authHeader(emailSession));
}

export async function revokePasskeyDevice({
  emailSession,
  deviceBindingId,
  highTrustToken,
  endpoint = '/api/auth/account/revoke-device',
}: RevokePasskeyDeviceRequest & { endpoint?: string }): Promise<RevokePasskeyDeviceResult> {
  return postJson<RevokePasskeyDeviceResult>(endpoint, { deviceBindingId, highTrustToken }, authHeader(emailSession));
}

export async function listEmbeddedSessions({
  emailSession,
  endpoint = '/api/auth/account/sessions',
}: ListEmbeddedSessionsRequest & { endpoint?: string }): Promise<ListEmbeddedSessionsResult> {
  return postJson<ListEmbeddedSessionsResult>(endpoint, {}, authHeader(emailSession));
}

export async function revokeEmbeddedSession({
  emailSession,
  embeddedSessionId,
  highTrustToken,
  endpoint = '/api/auth/account/revoke-session',
}: RevokeEmbeddedSessionRequest & { endpoint?: string }): Promise<RevokeEmbeddedSessionResult> {
  return postJson<RevokeEmbeddedSessionResult>(endpoint, { embeddedSessionId, highTrustToken }, authHeader(emailSession));
}

export async function sponsorUserOp({
  emailSession,
  embeddedSessionId,
  sender,
  nonce,
  initCode,
  callData,
  callGasLimit,
  verificationGasLimit,
  preVerificationGas,
  maxFeePerGas,
  maxPriorityFeePerGas,
  target,
  data,
  value,
  paymasterValiditySec,
  signingMode,
  metadata,
  endpoint = '/api/wallet/sponsor-action',
}: SponsorUserOpRequest & { endpoint?: string }): Promise<SponsorUserOpResult> {
  return postJson<SponsorUserOpResult>(endpoint, {
    embeddedSessionId,
    sender,
    nonce,
    ...(initCode ? { initCode } : {}),
    callData,
    callGasLimit,
    verificationGasLimit,
    ...(preVerificationGas != null ? { preVerificationGas } : {}),
    ...(maxFeePerGas != null ? { maxFeePerGas } : {}),
    ...(maxPriorityFeePerGas != null ? { maxPriorityFeePerGas } : {}),
    target,
    data,
    ...(value != null ? { value } : {}),
    ...(paymasterValiditySec != null ? { paymasterValiditySec } : {}),
    ...(signingMode ? { signingMode } : {}),
    ...(metadata ? { metadata } : {}),
  }, authHeader(emailSession));
}

function safeLocation(): Pick<Location, 'origin' | 'protocol' | 'hostname'> | null {
  return typeof location === 'undefined' ? null : location;
}

function resolveStepUpOrigin(value?: string): string {
  const input = value?.trim() || safeLocation()?.origin || '';
  if (!input) throw new Error('origin is required outside a browser.');
  const url = new URL(input);
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin !== input.replace(/\/$/u, '')) {
    throw new Error('origin must be an exact HTTP(S) origin.');
  }
  return url.origin;
}

function resolveStepUpReturnUrl(value: string | undefined, origin: string): string {
  const input = value?.trim() || (typeof location === 'undefined' ? `${origin}/` : location.href);
  const url = new URL(input, origin);
  if (url.origin !== origin) throw new Error('returnUrl must use the step-up origin.');
  url.hash = '';
  return url.toString();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64UrlToUtf8(value: string): string {
  const bytes = new Uint8Array(base64UrlToArrayBuffer(value));
  return new TextDecoder().decode(bytes);
}

function isIpHostname(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/u.test(hostname) || hostname.includes(':');
}

function toPasskeyError(error: unknown): unknown {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return new HazbasePasskeyError('passkey_cancelled', error.message);
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return new HazbasePasskeyError('passkey_timeout', error.message);
    if (error.name === 'NotSupportedError' || error.name === 'SecurityError') return new HazbasePasskeyError('passkey_unavailable', error.message);
  }
  return error;
}

function assertBrowserPasskeyAvailable(): void {
  if (!canUsePasskeyCredential()) {
    throw new HazbasePasskeyError('passkey_unavailable', 'Passkeys are not available in this browser.');
  }
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
