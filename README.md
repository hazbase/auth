# @hazbase/auth

## Overview
`@hazbase/auth` is an **SDK helper** that integrates with the HAZAMA BASE backend to provide **wallet‑signature based authentication (JWT issuance)** and **ZK (Groth16) KYC/threshold proofs** using Poseidon commitments and Merkle membership proofs.  
It targets **ESM** environments (`"type": "module"`) and is designed to work with `ethers` signers (`Signer` / `JsonRpcSigner`).

**Highlights**
- `signInWithWallet` — Sign a nonce with a wallet and obtain a **JWT accessToken**.
- `generateProof` — Build **Poseidon commitments**, Merkle inclusion, and a **Groth16 proof** (KYC or threshold mode).
- `deriveIdNull` — Derive a per‑user **nullifier** via wallet signature.
- `genValues` — Helper for threshold commitment values.

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

### `deriveIdNull(signer, opts?) => Promise<bigint>`
Derives a per‑user **nullifier** using an EIP‑191 personal signature (`\x19Ethereum Signed Message:`). Default domain message: **`"Hazbase KYC — Generate idNull v1"`**.

**Params (excerpt)**
- `signer: ethers.Signer`
- `opts.message?: string` — Optional additional message content

**Returns**
- `bigint` — user‑scoped nullifier value

---

### `generateProof(kyc, walletAddress, opts) => Promise<ProofBundle>`
Generates a **Groth16 proof** from **KYC inputs** and a **wallet address**, optionally in **threshold mode** (`GTE`, `LTE`, `EQ`). Uses **Poseidon** hashing and an **off‑chain Merkle tree**.

**Types (excerpt)**
```ts
// Natural person
export interface NaturalKYC {
  govId: string;
  name: string;
  dobYMD: number;         // e.g., 19991231
  country: number;        // ISO numeric or org-specific
  salt?: bigint;
}

// Corporation
export interface CorporateKYC {
  corpId: string;
  name: string;
  incDateYMD: number;     // YYYYMMDD
  country: number;
  role?: string;
  salt?: bigint;
}

type ProofMode = 'GTE' | 'LTE' | 'EQ';

export interface GenerateProofOpts {
  mode?: ProofMode;       // default: plain KYC (no threshold)
  threshold?: bigint;     // threshold SCORE
  score?: bigint;         // computed SCORE
  wasmPath?: string;      // circuit.wasm location
  zkeyPath?: string;      // final proving key
  currentRoot?: bigint;   // current Merkle root (0 = empty tree)
  nextIndex?: number;     // leaf index to insert (default 0)
  idNull?: bigint;        // override salt/nullifier
}

export interface ProofBundle {
  proof: { a: string[]; b: string[][]; c: string[] }; // Groth16 proof
  publicSignals: bigint[];
  input: Record<string, any>;
  idNull: bigint;    // salt used for commitment/nullifier
}
```

**Process (conceptual)**
1. Build a **KYC leaf**  
   - Natural: `Poseidon(H2(H2(govIdHash, nameHash), dobYMD), country, salt)` (simplified)  
   - Corporate: `Poseidon(H2(corpIdHash, nameHash), incDateYMD, country, role?, salt)`  
   - Threshold mode: `commitLeaf = H2(score, salt)`
2. **treeLeaf** = `Poseidon(commitLeaf, walletAddress)`
3. Insert into a **Merkle tree** (`currentRoot`/`nextIndex`)
4. Compute **nullifier** = `H2(salt, root)`
5. Load `*.wasm` / `*.zkey` → build witness → **groth16.prove** → return `ProofBundle`

**Example**
```ts
import { generateProof, deriveIdNull } from '@hazbase/auth';

const idNull = await deriveIdNull(signer);

const proof = await generateProof(
  { govId: 'ID-123', name: 'Alice', dobYMD: 19900101, country: 392 }, // NaturalKYC
  '0xYourWallet',
  {
    mode: 'GTE',
    threshold: 700n,
    score: 710n,
    wasmPath: '/circuits/kyc.wasm',
    zkeyPath: '/circuits/kyc_final.zkey',
    currentRoot: 0n,
    nextIndex: 0,
    idNull
  }
);

// Send proof.proof / proof.publicSignals to a verifier contract or API
```

---

### `genValues(n, opts?) => Promise<{ value: number; leafFull: bigint }>`
Returns both a **public 32‑bit value** and a **full field value** for a threshold commitment `H2(n, rand)`. Fix `rand` with `opts.idNull` to make it deterministic.

---

## Best practices
- **Initialize keys early**: call `setClientKey()` during app startup.
- **Domain separation**: use a clear `buildMessage` with a nonce to resist phishing.
- **Circuit & key management**: verify hashes of `*.wasm`/`*.zkey`, and distribute them securely.

---

## Troubleshooting
- **`Client key not set`** — call `setClientKey()` first.
- **`Client-key validation failed` / `inactive`** — check `functionId` / `clientKey`, and the correct environment.
- **`Nonce request failed`** — ensure reachability/CORS/headers for `/api/app/user/nonce`.
- **`Missing accessToken`** — server‑side signature verification failed; verify `walletAddress` & signature.
- **ZK proof build fails** — check `wasmPath`/`zkeyPath`, circuit compatibility, and `bigint` inputs.

---

## Tip: common imports
```ts
import { 
  setClientKey,
  signInWithWallet,
  generateProof, deriveIdNull, genValues
} from '@hazbase/auth';
```

---

## License
Apache-2.0
