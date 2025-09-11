import { getApiEndpoint } from './config';
import type { SignInResult } from './types';
import type { ethers } from 'ethers';
import { ensureClientKeyActive, createRequestTransaction } from './config';

/**
 * Fetch a nonce tied to the wallet address.
 */
async function fetchNonce(walletAddress: string): Promise<string> {
  const res = await fetch(
    `${getApiEndpoint()}/api/app/user/nonce?walletAddress=${walletAddress}`
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Nonce request failed: ${err || res.statusText}`);
  }

  const { data } = await res.json();
  return data.nonce as string;
}

/**
 * Sign‑in to HAZAMA BASE with an arbitrary EIP‑191 / EIP‑712 capable wallet.
 *
 * @param signer       ethers.JsonRpcSigner already connected to the wallet
 * @param buildMessage Optional custom message builder
 * @returns { walletAddress, accessToken }
 */
export async function signInWithWallet(
  {
    signer,
    buildMessage = (nonce: string) =>
      `Please sign to authorize user with nonce: ${nonce}`
  }: {
    signer: ethers.JsonRpcSigner;
    buildMessage?: (nonce: string) => string;
  }
): Promise<SignInResult> {
  await ensureClientKeyActive(69);
  /* 1. Get address & nonce ------------------------------------------------ */
  const walletAddress = await signer.getAddress();
  const nonce = await fetchNonce(walletAddress);

  /* 2. User signs the auth message --------------------------------------- */
  const message   = buildMessage(nonce);
  const signature = await signer.signMessage(message);

  /* 3. POST to /auth/sign‑in‑with‑crypto‑wallet --------------------------- */
  const res = await fetch(
    `${getApiEndpoint()}/api/auth/sign-in-with-crypto-wallet`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, walletAddress })
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Sign‑in failed: ${err || res.statusText}`);
  }

  const { data } = await res.json();
  const accessToken = data?.jwt?.accessToken as string | undefined;
  if (!accessToken) throw new Error('Missing accessToken in response');

  createRequestTransaction({
    functionId: 69,
    walletAddress,
    status: 'succeeded',
    isCount: true,
  })

  return { walletAddress, accessToken };
}
