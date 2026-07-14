import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  completeEmailStepUp,
  createStepUpBrowserBinding,
  readEmailStepUpHandoff,
  requestEmailStepUp,
  setApiEndpoint,
} from './dist/index.mjs';

setApiEndpoint('https://api.example.test');

const binding = await createStepUpBrowserBinding();
assert.equal(binding.hash, createHash('sha256').update(binding.secret).digest('hex'));
assert.match(binding.secret, /^[A-Za-z0-9_-]{43}$/u);

const handoff = {
  version: 1,
  challengeId: 'stepup_test',
  token: 'delivery-token',
  origin: 'https://app.example.test',
  purpose: 'example_action',
};
const encoded = Buffer.from(JSON.stringify(handoff), 'utf8').toString('base64url');
assert.deepEqual(readEmailStepUpHandoff(`#hazbaseStepUp=${encoded}`), handoff);
assert.equal(readEmailStepUpHandoff('#hazbaseStepUp=broken'), null);

const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), init });
  const path = new URL(String(url)).pathname;
  if (path.endsWith('/request')) {
    return Response.json({
      challengeId: 'stepup_test',
      origin: 'https://app.example.test',
      purpose: 'example_action',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
  }
  return Response.json({
    assuranceToken: 'su1.test.signature',
    assurance: 'email_link',
    purpose: 'example_action',
    origin: 'https://app.example.test',
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  });
};

try {
  const challenge = await requestEmailStepUp({
    emailSession: 'session-token',
    purpose: 'example_action',
    browserBindingHash: binding.hash,
    origin: 'https://app.example.test',
    returnUrl: 'https://app.example.test/confirm?source=test',
  });
  assert.equal(challenge.challengeId, 'stepup_test');
  const requestBody = JSON.parse(requests[0].init.body);
  assert.equal(requestBody.origin, 'https://app.example.test');
  assert.equal(requestBody.returnUrl, 'https://app.example.test/confirm?source=test');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer session-token');

  const assurance = await completeEmailStepUp({
    emailSession: 'session-token',
    challengeId: challenge.challengeId,
    purpose: 'example_action',
    browserBindingSecret: binding.secret,
    code: '123456',
    origin: 'https://app.example.test',
  });
  assert.equal(assurance.assurance, 'email_link');
  assert.equal(assurance.purpose, 'example_action');

  await assert.rejects(() => requestEmailStepUp({
    emailSession: 'session-token',
    purpose: 'example_action',
    browserBindingHash: binding.hash,
    origin: 'https://app.example.test',
    returnUrl: 'https://attacker.example/confirm',
  }), /returnUrl must use the step-up origin/u);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Step-up SDK checks passed.');
