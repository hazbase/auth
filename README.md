# @hazbase/auth
[![npm version](https://badge.fury.io/js/@hazbase%2Fauth.svg)](https://badge.fury.io/js/@hazbase%2Fauth)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Overview
`@hazbase/auth` is an **SDK helper** that integrates with the hazBase backend to provide **wallet‑signature based authentication (JWT issuance)** and **ZK (Groth16) KYC/threshold proofs** using Poseidon commitments and Merkle membership proofs.  
It targets **ESM** environments (`"type": "module"`) and is designed to work with `ethers` signers (`Signer` / `JsonRpcSigner`).

**Highlights**
- `signInWithWallet` — Sign a nonce with a wallet and obtain a **JWT accessToken**.

> Intent: In line with the whitepaper’s principles (multi‑layer governance, staged recovery, circuit breakers), this SDK enables **secure authentication with minimal attribute disclosure** while standardizing **audit logs** (request transactions).

---

## Requirements
- **Node.js**: 18+ (ESM recommended)
- **Deps (used internally)**: `ethers`, `snarkjs`, `circomlibjs`
- **Signer**: `ethers.JsonRpcSigner` (browser wallet or Node signer)
- **Network**: HTTPS reachability to the HAZAMA BASE API
- **Circuits** (for ZK): paths to `*.wasm` and `*.zkey` (use your org’s distributed artifacts)

---

## Installation
```bash
npm i @hazbase/auth
```

---

## Configuration
`@hazbase/auth` does **not** read environment variables directly. Configure it **programmatically** on app startup.

```ts
import { setClientKey } from '@hazbase/auth';

/* Set client key issued by HAZAMA BASE (required for validation & logging) */
setClientKey(process.env.HAZBASE_CLIENT_KEY!);
```

---

## Quick start (JWT sign‑in)
```ts
import type { ethers } from 'ethers';
import { signInWithWallet } from '@hazbase/auth';

/** Perform wallet-based sign-in and obtain a JWT token. */
export async function login(signer: ethers.JsonRpcSigner) {
  // 1) Sign-in with wallet (nonce -> message -> signature -> JWT)
  const { walletAddress, accessToken } = await signInWithWallet({
    signer,
    // Optional: customize the message (nonce will be injected by the SDK)
    buildMessage: (nonce) => `Please sign to authorize login. Nonce: ${nonce}`
  });

  // 2) Use the accessToken for your API calls
  // await fetch('/my/api', { headers: { Authorization: `Bearer ${accessToken}` } });

  return { walletAddress, accessToken };
}
```

---

## Function reference (SDK)

> This package does not expose a CLI. The following are **SDK functions**.

### `signInWithWallet({ signer, buildMessage? }) => Promise<{ walletAddress, accessToken }>`
Fetches a **nonce** bound to the wallet, requests a **signature**, and exchanges it for a **JWT**. Internally calls `ensureClientKeyActive(69)` and `createRequestTransaction(...)` so your **client key is validated** and the action is **logged**.

**Params**
- `signer: ethers.JsonRpcSigner` — Connected wallet signer.
- `buildMessage?: (nonce: string) => string` — Customize the sign‑in message.

**Returns**
- `{ walletAddress: string; accessToken: string; }`

**Example**
```ts
const { accessToken } = await signInWithWallet({ signer });
```

---

### `setClientKey(key: string): void`
Set the **client key** issued by HAZAMA BASE. Required for server checks and logging.

> If not set, internal `requireClientKey()` will throw when validation is needed.

---

## ⚠️ Deprecation

> ZK features have moved to @hazbase/zk.
> ZK helpers in @hazbase/auth are deprecated and removed. New and existing implementations should import from @hazbase/zk.

---

## Best practices
- **Initialize keys early**: call `setClientKey()` during app startup.
- **Domain separation**: use a clear `buildMessage` with a nonce to resist phishing.

---

## Troubleshooting
- **`Client key not set`** — call `setClientKey()` first.
- **`Client-key validation failed` / `inactive`** — check `functionId` / `clientKey`, and the correct environment.
- **`Nonce request failed`** — ensure reachability/CORS/headers for `/api/app/user/nonce`.
- **`Missing accessToken`** — server‑side signature verification failed; verify `walletAddress` & signature.

---

## Tip: common imports
```ts
import { 
  setClientKey,
  signInWithWallet
} from '@hazbase/auth';
```

---

## License
Apache-2.0
