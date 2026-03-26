export interface SignInResult {
  walletAddress: string;
  accessToken: string;
}

export interface EmailOtpRequestResult {
  email: string;
  challengeId?: string;
  requestId?: string;
  expiresAt?: string;
  status?: string;
  debugCode?: string;
}

export interface EmailOtpSessionResult {
  email: string;
  accessToken: string;
  refreshToken?: string;
  sessionId?: string;
  userId?: string;
  ownerBootstrapRequired?: boolean;
  smartAccountAddress?: string;
}

export type PasskeyAssertionPurpose = 'bootstrap' | 'migration' | 'reauth' | 'session';
export type PasskeyAlgorithm = 'ES256' | 'RS256';

export interface PasskeyRegistrationChallengeResult {
  challengeId: string;
  challenge: string;
  rpId: string;
  rpName: string;
  origin: string;
  userHandle: string;
  userName: string;
  userDisplayName: string;
  timeoutMs?: number;
  excludeCredentialIds?: string[];
  status?: string;
}

export interface PasskeyRegistrationCredential {
  username: string;
  credential: {
    id: string;
    publicKey: string;
    algorithm: PasskeyAlgorithm;
  };
  authenticatorData: string;
  clientData: string;
  attestationData?: string;
}

export interface CompletePasskeyRegistrationRequest {
  emailSession: string;
  challengeId: string;
  credential: PasskeyRegistrationCredential;
  deviceId?: string;
  deviceLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface CompletePasskeyRegistrationResult {
  deviceBindingId: string;
  credentialId: string;
  status?: string;
  userId?: string;
}

export interface PasskeyAssertionChallengeResult {
  challengeId: string;
  challenge: string;
  rpId: string;
  origin: string;
  timeoutMs?: number;
  purpose: PasskeyAssertionPurpose;
  deviceBindingId?: string;
  credentialIds?: string[];
  status?: string;
}

export interface PasskeyAssertionCredential {
  credentialId: string;
  authenticatorData: string;
  clientData: string;
  signature: string;
  userHandle?: string;
}

export interface CompletePasskeyAssertionRequest {
  emailSession: string;
  challengeId: string;
  credential: PasskeyAssertionCredential;
  purpose?: PasskeyAssertionPurpose;
  deviceBindingId?: string;
}

export interface CompletePasskeyAssertionResult {
  deviceBindingId: string;
  credentialId: string;
  purpose: PasskeyAssertionPurpose;
  assertedAt?: string;
  highTrustToken?: string;
  highTrustExpiresAt?: string;
  status?: string;
}

export interface PasskeyAccountDescriptorResult {
  chainId: number;
  factoryAddress: string;
  ownerValidator: string;
  ownerConfig: string;
  ownerConfigHash: string;
  predictedAccountAddress: string;
  accountSalt: string;
  credentialId?: string;
  deviceBindingId?: string;
  status?: string;
}

export interface BootstrapPasskeyAccountRequest {
  emailSession: string;
  deviceBindingId: string;
  highTrustToken: string;
  accountSalt?: string;
  chainId?: number;
  metadata?: Record<string, unknown>;
}

export interface BootstrapPasskeyAccountResult extends PasskeyAccountDescriptorResult {
  smartAccountAddress: string;
  userId?: string;
}

export interface LookupPasskeyAccountRequest {
  emailSession: string;
  deviceBindingId?: string;
  smartAccountAddress?: string;
}

export interface LookupPasskeyAccountResult {
  smartAccountAddress?: string;
  ownerValidator?: string;
  ownerConfigHash?: string;
  accountSalt?: string;
  chainId?: number;
  primaryDeviceBindingId?: string;
  credentialId?: string;
  deviceBindingId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface OwnerUserOpAuthorizationRequest {
  emailSession: string;
  deviceBindingId: string;
  highTrustToken: string;
  smartAccountAddress: string;
  userOpHash: string;
  validForSec?: number;
}

export interface OwnerUserOpAuthorizationResult {
  ownerValidator: string;
  ownerConfigHash: string;
  validAfter: number;
  validUntil: number;
  signatureType: number;
  signaturePayload: string;
  accountSignature: string;
  status?: string;
}

export interface StartEmbeddedSessionRequest {
  emailSession: string;
  smartAccountAddress: string;
  deviceBindingId: string;
  actionProfileKey: string;
  highTrustToken: string;
  sessionKeyAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddedSessionGrantResult {
  sessionId?: string;
  sessionKeyAddress?: string;
  validUntil?: string | number;
  level?: number | string;
  profileKey?: string;
  gasBudgetInitial?: string;
  gasBudgetRemaining?: string;
  status?: string;
  [key: string]: unknown;
}

export interface EndEmbeddedSessionRequest {
  emailSession: string;
  embeddedSessionId: string;
}

export interface PasskeyDeviceRecord {
  deviceBindingId: string;
  credentialId: string;
  label?: string | null;
  displayDeviceId?: string | null;
  status: string;
  createdAt?: string;
  lastAssertedAt?: string | null;
}

export interface ListPasskeyDevicesRequest {
  emailSession: string;
}

export interface ListPasskeyDevicesResult {
  devices: PasskeyDeviceRecord[];
  status?: string;
}

export interface RevokePasskeyDeviceRequest {
  emailSession: string;
  deviceBindingId: string;
  highTrustToken: string;
}

export interface RevokePasskeyDeviceResult {
  deviceBindingId: string;
  cascadedEmbeddedSessions?: boolean;
  status?: string;
}

export interface EmbeddedSessionRecord {
  embeddedSessionId: string;
  smartAccountAddress: string;
  deviceBindingId: string;
  actionProfileKey: string;
  sessionKeyAddress?: string;
  validUntil?: string;
  gasBudgetRemaining?: string;
  createdAt?: string;
}

export interface ListEmbeddedSessionsRequest {
  emailSession: string;
}

export interface ListEmbeddedSessionsResult {
  sessions: EmbeddedSessionRecord[];
  status?: string;
}

export interface RevokeEmbeddedSessionRequest {
  emailSession: string;
  embeddedSessionId: string;
  highTrustToken: string;
}

export interface RevokeEmbeddedSessionResult {
  embeddedSessionId: string;
  status?: string;
}

export type SessionSigningMode = 'none' | 'session';

export interface SponsorUserOpRequest {
  emailSession: string;
  embeddedSessionId: string;
  sender: string;
  nonce: string;
  initCode?: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  target: string;
  data: string;
  value?: string;
  paymasterValiditySec?: string;
  signingMode?: SessionSigningMode;
  metadata?: Record<string, unknown>;
}

export interface SponsorUserOpResult {
  decisionId: string;
  approved: boolean;
  expiresAt: string;
  profileKey: string;
  paymasterAndData: string;
  validAfter: number;
  validUntil: number;
  paymasterAddress: string;
  sponsoredUserOpHash?: string;
  sessionKeyAddress?: string;
  accountSignature?: string;
  signingMode?: SessionSigningMode;
  status?: string;
}
