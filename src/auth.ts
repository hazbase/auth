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
  EmbeddedSessionGrantResult,
  EndEmbeddedSessionRequest,
  ListEmbeddedSessionsRequest,
  ListEmbeddedSessionsResult,
  ListPasskeyDevicesRequest,
  ListPasskeyDevicesResult,
  LookupPasskeyAccountRequest,
  LookupPasskeyAccountResult,
  OwnerUserOpAuthorizationRequest,
  OwnerUserOpAuthorizationResult,
  PasskeyAssertionChallengeResult,
  PasskeyAssertionPurpose,
  PasskeyAccountDescriptorResult,
  PasskeyRegistrationChallengeResult,
  RevokeEmbeddedSessionRequest,
  RevokeEmbeddedSessionResult,
  RevokePasskeyDeviceRequest,
  RevokePasskeyDeviceResult,
  SignInResult,
  SponsorUserOpRequest,
  SponsorUserOpResult,
  StartEmbeddedSessionRequest,
} from './types';
import type { ethers } from 'ethers';
import { ensureClientKeyActive, createRequestTransaction } from './config';

async function readData<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => undefined);
  return (json?.data ?? json) as T;
}

function createRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `req_${uuid}`;
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
  const res = await fetch(`${getApiEndpoint()}/api/app/user/nonce?walletAddress=${walletAddress}`);
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Nonce request failed: ${err || res.statusText}`);
  }
  const { nonce } = await readData<{ nonce: string }>(res);
  return nonce;
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

export async function requestPasskeyRegistrationChallenge({
  emailSession,
  deviceId,
  deviceLabel,
  endpoint = '/api/auth/passkey/register/challenge',
}: {
  emailSession: string;
  deviceId?: string;
  deviceLabel?: string;
  endpoint?: string;
}): Promise<PasskeyRegistrationChallengeResult> {
  return postJson<PasskeyRegistrationChallengeResult>(endpoint, {
    ...(deviceId ? { deviceId } : {}),
    ...(deviceLabel ? { deviceLabel } : {}),
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
  endpoint = '/api/auth/passkey/assert/challenge',
}: {
  emailSession: string;
  purpose?: PasskeyAssertionPurpose;
  deviceBindingId?: string;
  endpoint?: string;
}): Promise<PasskeyAssertionChallengeResult> {
  return postJson<PasskeyAssertionChallengeResult>(endpoint, {
    purpose,
    ...(deviceBindingId ? { deviceBindingId } : {}),
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

export async function requestPasskeyAccountDescriptor({
  emailSession,
  deviceBindingId,
  accountSalt,
  chainId,
  endpoint = '/api/auth/account/descriptor',
}: {
  emailSession: string;
  deviceBindingId: string;
  accountSalt?: string;
  chainId?: number;
  endpoint?: string;
}): Promise<PasskeyAccountDescriptorResult> {
  return postJson<PasskeyAccountDescriptorResult>(endpoint, {
    deviceBindingId,
    ...(accountSalt ? { accountSalt } : {}),
    ...(chainId != null ? { chainId } : {}),
  }, authHeader(emailSession));
}

export async function bootstrapPasskeyAccount({
  emailSession,
  deviceBindingId,
  highTrustToken,
  accountSalt,
  chainId,
  metadata,
  endpoint = '/api/auth/account/bootstrap',
}: BootstrapPasskeyAccountRequest & { endpoint?: string }): Promise<BootstrapPasskeyAccountResult> {
  return postJson<BootstrapPasskeyAccountResult>(endpoint, {
    deviceBindingId,
    highTrustToken,
    ...(accountSalt ? { accountSalt } : {}),
    ...(chainId != null ? { chainId } : {}),
    ...(metadata ? { metadata } : {}),
  }, authHeader(emailSession));
}

export async function lookupPasskeyAccount({
  emailSession,
  deviceBindingId,
  smartAccountAddress,
  endpoint = '/api/auth/account/lookup',
}: LookupPasskeyAccountRequest & { endpoint?: string }): Promise<LookupPasskeyAccountResult> {
  return postJson<LookupPasskeyAccountResult>(endpoint, {
    ...(deviceBindingId ? { deviceBindingId } : {}),
    ...(smartAccountAddress ? { smartAccountAddress } : {}),
  }, authHeader(emailSession));
}

export async function authorizeOwnerUserOp({
  emailSession,
  deviceBindingId,
  highTrustToken,
  smartAccountAddress,
  userOpHash,
  validForSec,
  endpoint = '/api/auth/account/authorize-userop',
}: OwnerUserOpAuthorizationRequest & { endpoint?: string }): Promise<OwnerUserOpAuthorizationResult> {
  return postJson<OwnerUserOpAuthorizationResult>(endpoint, {
    deviceBindingId,
    highTrustToken,
    smartAccountAddress,
    userOpHash,
    ...(validForSec != null ? { validForSec } : {}),
  }, authHeader(emailSession));
}

export async function startEmbeddedSession({
  emailSession,
  smartAccountAddress,
  deviceBindingId,
  actionProfileKey,
  highTrustToken,
  sessionKeyAddress,
  metadata,
  endpoint = '/api/wallet/session/start',
}: StartEmbeddedSessionRequest & { endpoint?: string }): Promise<EmbeddedSessionGrantResult> {
  return postJson<EmbeddedSessionGrantResult>(endpoint, {
    smartAccountAddress,
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
