# @hazbase/auth
[![npm version](https://badge.fury.io/js/@hazbase%2Fauth.svg)](https://badge.fury.io/js/@hazbase%2Fauth)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Overview
`@hazbase/auth` is an **SDK for hazBase application sessions, passkey flows, account bootstrap, and sponsor signing**.  
It wraps the backend APIs used by first-party or allowlisted partner apps so web clients can move through **email OTP -> passkey binding -> account bootstrap -> owner authorization -> sponsored user operation** with a consistent TypeScript interface.

- Scope: email OTP sessions, passkey registration/assertion, account descriptor/bootstrap, owner userOp authorization, sponsor signing
- Design: **ESM-first**, browser/backend friendly fetch wrappers, minimal runtime assumptions
- Goal: Let apps integrate hazBase auth and smart-wallet flows **without rewriting request/response plumbing**

---

## Requirements
- Node.js **>= 18.18** (or a modern browser/runtime with `fetch`)
- TypeScript **>= 5.2**
- A hazBase backend that exposes the auth/account/sponsor endpoints
- For passkey flows: a browser/runtime that supports WebAuthn

**`package.json` (example)**
```jsonc
{
  "type": "module",
  "engines": { "node": ">=18.18" }
}
```

---

## Installation
```bash
pnpm add @hazbase/auth
# or
npm i @hazbase/auth
```

---

## Environment / backend assumptions
`@hazbase/auth` is a thin client SDK. It does not create email OTP, passkey, or sponsor policies by itself.  
You are expected to provide a backend that exposes the current hazBase auth routes.

Default route family:
- `/api/auth/email/request-otp`
- `/api/auth/email/verify-otp`
- `/api/auth/passkey/register/challenge`
- `/api/auth/passkey/register/complete`
- `/api/auth/passkey/assert/challenge`
- `/api/auth/passkey/assert/complete`
- `/api/auth/account/descriptor`
- `/api/auth/account/bootstrap`
- `/api/auth/account/lookup`
- `/api/auth/account/authorize-userop`
- `/api/auth/account/devices`
- `/api/auth/account/sessions`
- `/api/auth/account/revoke-device`
- `/api/auth/account/revoke-session`
- `/api/wallet/session/start`
- `/api/wallet/session/grant`
- `/api/wallet/session/execute`
- `/api/wallet/session/end`
- `/api/wallet/sponsor-action`

Important model assumptions:
- `email OTP` starts an **application session**. It is not wallet ownership on its own.
- Web owner approval is **passkey-centered**.
- Embedded session issuance requires a fresh `purpose=session` high-trust token.
- Listing devices and embedded sessions uses only app-session authentication.
- Revoking a device or embedded session requires a fresh `purpose=reauth` high-trust token.
- Device revoke cascades to active embedded sessions on that device.
- `sponsorUserOp` only succeeds for actions that match the embedded-session snapshot and on-chain session policy.
- Session-mode sponsorship returns an `accountSignature` only for the exact sponsored payload it just approved.
- Embedded-session execution can be driven either as a sponsor-only flow or as a backend-executed session flow with `grantEmbeddedSession()` and `executeEmbeddedSession()`.

Deployment portability notes:
- `@hazbase/auth` stays backend-contract based. It does not expose cloud-specific SDK modes.
- The same client code should work with any hazBase-compatible backend as long as the backend API contract stays the same.

---

## Quick start: email OTP -> passkey binding -> account bootstrap -> sponsor

**`scripts/passkey-account.ts`**
```ts
import {
  authorizeOwnerUserOp,
  bootstrapPasskeyAccount,
  completePasskeyAssertion,
  completePasskeyRegistration,
  requestEmailOtp,
  requestPasskeyAccountDescriptor,
  requestPasskeyAssertionChallenge,
  requestPasskeyRegistrationChallenge,
  sponsorUserOp,
  startEmbeddedSession,
  verifyEmailOtp,
} from '@hazbase/auth';

async function main() {
  const email = 'demo@example.com';

  await requestEmailOtp({
    email,
    purpose: 'smart_wallet_sign_in',
  });

  const session = await verifyEmailOtp({
    email,
    code: '123456',
    purpose: 'smart_wallet_sign_in',
  });

  const registerChallenge = await requestPasskeyRegistrationChallenge({
    emailSession: session.accessToken,
    deviceLabel: 'Chrome on MacBook',
  });

  const device = await completePasskeyRegistration({
    emailSession: session.accessToken,
    challengeId: registerChallenge.challengeId,
    credential: registrationCredential,
    deviceLabel: 'Chrome on MacBook',
  });

  const bootstrapChallenge = await requestPasskeyAssertionChallenge({
    emailSession: session.accessToken,
    purpose: 'bootstrap',
    deviceBindingId: device.deviceBindingId,
  });

  const bootstrapAssertion = await completePasskeyAssertion({
    emailSession: session.accessToken,
    challengeId: bootstrapChallenge.challengeId,
    credential: authenticationCredential,
    purpose: 'bootstrap',
    deviceBindingId: device.deviceBindingId,
  });

  const descriptor = await requestPasskeyAccountDescriptor({
    emailSession: session.accessToken,
    deviceBindingId: device.deviceBindingId,
    chainId: 11155111,
    accountSalt: 'user-owned-account',
  });

  const account = await bootstrapPasskeyAccount({
    emailSession: session.accessToken,
    deviceBindingId: device.deviceBindingId,
    highTrustToken: bootstrapAssertion.highTrustToken!,
    chainId: descriptor.chainId,
    accountSalt: descriptor.accountSalt,
  });

  const ownerAuth = await authorizeOwnerUserOp({
    emailSession: session.accessToken,
    deviceBindingId: device.deviceBindingId,
    highTrustToken: bootstrapAssertion.highTrustToken!,
    smartAccountAddress: account.smartAccountAddress,
    userOpHash: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });

  const sessionChallenge = await requestPasskeyAssertionChallenge({
    emailSession: session.accessToken,
    purpose: 'session',
    deviceBindingId: device.deviceBindingId,
  });

  const sessionAssertion = await completePasskeyAssertion({
    emailSession: session.accessToken,
    challengeId: sessionChallenge.challengeId,
    credential: authenticationCredential,
    purpose: 'session',
    deviceBindingId: device.deviceBindingId,
  });

  const embedded = await startEmbeddedSession({
    emailSession: session.accessToken,
    smartAccountAddress: account.smartAccountAddress,
    deviceBindingId: device.deviceBindingId,
    actionProfileKey: 'first_party_l2',
    highTrustToken: sessionAssertion.highTrustToken!,
  });

  const sponsored = await sponsorUserOp({
    emailSession: session.accessToken,
    embeddedSessionId: embedded.sessionId!,
    sender: account.smartAccountAddress,
    nonce: '0',
    callData: '0x12345678',
    callGasLimit: '150000',
    verificationGasLimit: '120000',
    target: '0x1111111111111111111111111111111111111111',
    data: '0x12345678',
    value: '0',
    signingMode: 'session',
  });

  console.log({
    deviceBindingId: device.deviceBindingId,
    smartAccountAddress: account.smartAccountAddress,
    ownerValidator: ownerAuth.ownerValidator,
    paymasterAddress: sponsored.paymasterAddress,
    sessionKeyAddress: sponsored.sessionKeyAddress,
    sponsoredUserOpHash: sponsored.sponsoredUserOpHash,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

---

## Common operations (snippets)

### 1) Start an application session with email OTP
```ts
await requestEmailOtp({
  email: 'demo@example.com',
  purpose: 'smart_wallet_sign_in',
});

const session = await verifyEmailOtp({
  email: 'demo@example.com',
  code: '123456',
  purpose: 'smart_wallet_sign_in',
});
```

### 2) Step up with passkey before bootstrap or owner approval
```ts
const challenge = await requestPasskeyAssertionChallenge({
  emailSession: session.accessToken,
  purpose: 'reauth',
  deviceBindingId: 'devb_demo',
});

const assertion = await completePasskeyAssertion({
  emailSession: session.accessToken,
  challengeId: challenge.challengeId,
  credential: authenticationCredential,
  purpose: 'reauth',
  deviceBindingId: 'devb_demo',
});
```

### 3) Fetch or bootstrap the current account descriptor
```ts
const descriptor = await requestPasskeyAccountDescriptor({
  emailSession: session.accessToken,
  deviceBindingId: 'devb_demo',
  chainId: 11155111,
  accountSalt: 'user-owned-account',
});

const account = await bootstrapPasskeyAccount({
  emailSession: session.accessToken,
  deviceBindingId: 'devb_demo',
  highTrustToken: assertion.highTrustToken!,
  chainId: descriptor.chainId,
  accountSalt: descriptor.accountSalt,
});
```

### 4) Authorize an owner userOp or request sponsor signing
```ts
const ownerAuth = await authorizeOwnerUserOp({
  emailSession: session.accessToken,
  deviceBindingId: 'devb_demo',
  highTrustToken: assertion.highTrustToken!,
  smartAccountAddress: account.smartAccountAddress,
  userOpHash,
});

const sessionChallenge = await requestPasskeyAssertionChallenge({
  emailSession: session.accessToken,
  purpose: 'session',
  deviceBindingId: 'devb_demo',
});

const sessionAssertion = await completePasskeyAssertion({
  emailSession: session.accessToken,
  challengeId: sessionChallenge.challengeId,
  credential: authenticationCredential,
  purpose: 'session',
  deviceBindingId: 'devb_demo',
});

const embedded = await startEmbeddedSession({
  emailSession: session.accessToken,
  smartAccountAddress: account.smartAccountAddress,
  deviceBindingId: 'devb_demo',
  actionProfileKey: 'first_party_l2',
  highTrustToken: sessionAssertion.highTrustToken!,
});

const sponsored = await sponsorUserOp({
  emailSession: session.accessToken,
  embeddedSessionId: embedded.sessionId!,
  sender: account.smartAccountAddress,
  nonce: '0',
  callData: '0x12345678',
  callGasLimit: '150000',
  verificationGasLimit: '120000',
  target: '0x1111111111111111111111111111111111111111',
  data: '0x12345678',
  value: '0',
  signingMode: 'session',
});
```

---

## Helper names
- `requestEmailOtp`
- `verifyEmailOtp`
- `requestPasskeyRegistrationChallenge`
- `completePasskeyRegistration`
- `requestPasskeyAssertionChallenge`
- `completePasskeyAssertion`
- `requestPasskeyAccountDescriptor`
- `bootstrapPasskeyAccount`
- `lookupPasskeyAccount`
- `authorizeOwnerUserOp`
- `sponsorUserOp`
- `signInWithWallet`

---

## Notes
- `email OTP` is an application-session primitive, not a wallet-ownership proof.
- Web owner approval is passkey-centered; browser-held secp256k1 owner storage is no longer part of the public flow.
- `authorizeOwnerUserOp` returns a backend-issued owner authorization payload, not a raw local private-key signature.
- Embedded session issuance requires a fresh `purpose=session` high-trust token. Existing active sessions can be reused until revoked or expired.
- `sponsorUserOp` evaluates the embedded-session snapshot taken at issuance time, so later action-profile broadening does not widen already-issued sessions.
- `sponsorUserOp({ signingMode: 'session' })` returns `paymasterAndData`, `sponsoredUserOpHash`, and the final session-mode `accountSignature` for that exact sponsored payload.

---

## Troubleshooting (FAQ)
- **`401` during `sponsorUserOp`** — the action likely falls outside the embedded session profile, gas budget, or paymaster validity window.
- **`404` during account bootstrap/lookup** — the current `deviceBindingId` is missing, revoked, or not bound to the requested account.
- **Passkey assertion succeeds but owner action fails** — confirm you are using the returned `highTrustToken` for the same device binding and account flow.
- **`email OTP` works but wallet flow does not** — OTP only creates an app session; you still need passkey binding plus account bootstrap.

---

## Account security inventory and revoke
These low-level helpers are meant for account-security surfaces such as “active devices” and “active sessions”.

Listing endpoints use only the app session:
- `listPasskeyDevices()`
- `listEmbeddedSessions()`

Revoke endpoints require a fresh `purpose=reauth` high-trust token:
- `revokePasskeyDevice()`
- `revokeEmbeddedSession()`

Device revoke cascades to the linked passkey credential and all active embedded sessions on that device.

---

## License
Apache-2.0
