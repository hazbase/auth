export interface SignInResult {
  walletAddress: string;
  accessToken: string;
}

export interface SupportedChainSummary {
  chainId: number;
  key: string;
  name: string;
  kind: 'testnet' | 'mainnet';
  rpcUrl: string;
  bundlerRpcUrl?: string | null;
  entryPointAddress: string;
  paymasterAddress?: string | null;
  defaultAccountVariant?: string;
  defaultProfileKey?: string | null;
  blockExplorerUrl?: string | null;
  capabilities?: {
    owner: boolean;
    session: boolean;
    sponsor: boolean;
    firstPartyProfiles: boolean;
  };
}

export interface SupportedChainsResult {
  defaultChainId: number;
  chains: SupportedChainSummary[];
  status?: string;
}

export interface EmailOtpAccountSummary {
  smartAccountAddress: string;
  chainId: number;
  accountVariant?: string;
  relayMode?: string;
  primaryDeviceBindingId?: string;
  updatedAt?: string;
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
  accountVariant?: string;
  relayMode?: string;
  accounts?: EmailOtpAccountSummary[];
}

export type PasskeyAssertionPurpose = 'bootstrap' | 'migration' | 'reauth' | 'session';
export type PasskeyAlgorithm = 'ES256' | 'RS256';

export interface PasskeyPartnerOriginOptions {
  origin: string;
  rpId?: string;
  clientKey?: string;
}

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
  accountVariant?: string;
  relayMode?: string;
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
  accountVariant?: string;
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
  chainId?: number;
}

export interface LookupPasskeyAccountResult {
  smartAccountAddress?: string;
  ownerValidator?: string;
  ownerConfigHash?: string;
  accountVariant?: string;
  relayMode?: string;
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
  chainId?: number;
  userOpHash: string;
  validForSec?: number;
}

export interface OwnerUserOpAuthorizationResult {
  ownerValidator: string;
  ownerConfigHash: string;
  accountVariant?: string;
  relayMode?: string;
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
  chainId?: number;
  deviceBindingId: string;
  actionProfileKey: string;
  highTrustToken: string;
  sessionKeyAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddedSessionGrantResult {
  sessionId?: string;
  chainId?: number;
  sessionKeyAddress?: string;
  validUntil?: string | number;
  level?: number | string;
  profileKey?: string;
  gasBudgetInitial?: string;
  gasBudgetRemaining?: string;
  accountVariant?: string;
  grantStatus?: string;
  grantTxHash?: string;
  revokeTxHash?: string;
  revokeStatus?: string;
  sessionVersion?: number;
  grantedTargets?: string[];
  grantedSelectors?: Record<string, string[]>;
  relayMode?: string;
  submittedUserOpHash?: string | null;
  receipt?: Record<string, unknown> | null;
  status?: string;
  [key: string]: unknown;
}

export interface GrantEmbeddedSessionRequest {
  emailSession: string;
  embeddedSessionId: string;
  smartAccountAddress: string;
  deviceBindingId: string;
  highTrustToken: string;
}

export interface ExecuteEmbeddedSessionUserOp {
  sender: string;
  nonce: string;
  initCode?: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface ExecuteEmbeddedSessionRequest {
  emailSession: string;
  embeddedSessionId: string;
  userOp: ExecuteEmbeddedSessionUserOp;
  target: string;
  data: string;
  value?: string;
  paymasterValiditySec?: string;
  metadata?: Record<string, unknown>;
  waitForReceipt?: boolean;
}

export interface ExecuteEmbeddedSessionResult {
  chainId?: number;
  accountVariant?: string;
  relayMode?: string;
  bundlerRpcUrl?: string;
  rpcUrl?: string;
  smartAccountAddress?: string;
  relayerAddress?: string;
  beneficiary?: string;
  nonce?: string;
  initCode?: string;
  target?: string;
  data?: string;
  value?: string;
  localUserOpHash?: string;
  submittedUserOpHash?: string | null;
  transactionHash?: string;
  receipt?: Record<string, unknown> | null;
  sponsor?: SponsorUserOpResult;
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
  chainId?: number;
  deviceBindingId: string;
  actionProfileKey: string;
  sessionKeyAddress?: string;
  validUntil?: string;
  gasBudgetRemaining?: string;
  createdAt?: string;
  accountVariant?: string;
  grantStatus?: string;
  grantTxHash?: string | null;
  sessionVersion?: number;
  relayMode?: string | null;
  lastExecutionTxHash?: string | null;
  lastExecutionAt?: string | null;
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
  chainId?: number;
  accountVariant?: string;
  relayMode?: string;
  revokeTxHash?: string | null;
  submittedUserOpHash?: string | null;
  revokeStatus?: string;
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
  chainId?: number | null;
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
export interface PaymentNetworkSummary {
  network: string;
  name: string;
  chainId: number | null;
  kind: 'testnet' | 'mainnet';
  family?: 'evm' | 'liquid';
  scheme?: string;
  enabled?: boolean;
  asset: string;
  assetAddress: string;
  assetId?: string;
  decimals: number;
  eip712?: {
    name: string;
    version: string;
  } | null;
  assets?: Array<{
    asset: string;
    symbol: string;
    name: string;
    assetAddress: string;
    assetId?: string;
    decimals: number;
    settlementMode?: string;
    eip712?: {
      name: string;
      version: string;
    } | null;
  }>;
  hazbaseWalletPayoutAvailable?: boolean;
  capabilities?: {
    owner: boolean;
    session: boolean;
    sponsor: boolean;
    firstPartyProfiles: boolean;
  };
}

export interface SupportedPaymentsResult {
  defaultNetwork: string;
  networks: PaymentNetworkSummary[];
  status?: string;
}

export type PaymentPayoutMethod =
  | {
      kind: 'external_eoa';
      address: string;
    }
  | {
      kind: 'hazbase_wallet';
      address?: never;
    };

export interface X402Requirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  mimeType?: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  asset: string;
  extra?: Record<string, unknown>;
}

export interface X402ResponseBody {
  x402Version: number;
  accepts: X402Requirement[];
  error: string;
  paymentRequestId?: string;
  hazbase?: {
    paymentRequestId?: string;
  };
}

export interface X402RequirementsRequest {
  emailSession?: string;
  resourceId: string;
  resourceUrl: string;
  description?: string;
  mimeType?: string;
  network: string;
  asset: string;
  priceAtomic: string;
  payoutMethod: PaymentPayoutMethod;
  metadata?: Record<string, unknown>;
}

export interface X402RequirementsResult {
  paymentRequestId: string;
  chainId: number;
  network: string;
  asset: string;
  payoutAddress: string;
  payoutKind: string;
  payoutOriginKind?: string;
  x402: X402ResponseBody;
  status?: string;
}

export interface X402VerifyRequest {
  paymentRequestId: string;
  xPayment: string;
}

export interface X402VerifyResult {
  paymentRequestId: string;
  paymentAttemptId?: string;
  xPaymentHash?: string;
  verified: boolean;
  invalidReason?: string;
  errorCode?: string;
  payer?: string | null;
  network?: string;
  facilitator?: Record<string, unknown>;
  responsePreview?: {
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  };
  status?: string;
}

export interface X402SettleRequest {
  paymentRequestId: string;
  xPayment: string;
}

export interface X402SettleResult {
  paymentRequestId: string;
  paymentAttemptId?: string;
  xPaymentHash?: string;
  settled: boolean;
  errorCode?: string;
  transactionHash?: string | null;
  facilitator?: Record<string, unknown>;
  status?: string;
}

export interface X402PaymentAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  asset?: string;
  paymentRequestId?: string;
  payload: {
    signature: string;
    authorization: X402PaymentAuthorization;
  };
}

export interface BuildX402PaymentHeaderRequest {
  requirement: X402Requirement;
  privateKey: string;
  nonce?: string;
  validAfter?: string | number;
  validBefore?: string | number;
  now?: number;
  /**
   * Caller-supplied spend cap (atomic units). If the server-quoted
   * `requirement.maxAmountRequired` exceeds this, signing is rejected.
   */
  maxValue?: string | number | bigint;
  /** Require the server's payTo recipient to match this address, else reject. */
  expectedPayTo?: string;
  /** Require the server's asset token to match this address, else reject. */
  expectedAsset?: string;
}

export interface BuildX402PaymentHeaderResult {
  header: string;
  payer: string;
  payload: X402PaymentPayload;
}

export interface X402HazbaseWalletPayRequest {
  emailSession: string;
  paymentRequestId: string;
  deviceBindingId: string;
  highTrustToken: string;
  smartAccountAddress?: string;
  accountSalt?: string;
  waitForReceipt?: boolean;
}

export interface X402HazbaseWalletPayResult {
  paymentRequestId: string;
  paymentAttemptId?: string;
  xPaymentHash?: string;
  paid: boolean;
  verified?: boolean;
  settled?: boolean;
  payer?: string;
  chainId?: number;
  network?: string;
  relayMode?: string;
  submittedUserOpHash?: string | null;
  transactionHash?: string | null;
  gasEstimate?: Record<string, unknown>;
  xPayment: string;
  receipt?: Record<string, unknown> | null;
  status?: string;
}
