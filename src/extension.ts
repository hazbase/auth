import type {
  CompletePasskeyAssertionResult,
  CompletePasskeyRegistrationResult,
  PasskeyAssertionPurpose,
} from './types';
import { API_ENDPOINT } from './constants';

export type PasskeyBridgeMode = 'registration' | 'assertion';

export type PasskeyBridgeResult =
  | {
      ok: true;
      mode: 'registration';
      requestId: string;
      registration: CompletePasskeyRegistrationResult;
    }
  | {
      ok: true;
      mode: 'assertion';
      requestId: string;
      assertion: CompletePasskeyAssertionResult;
    }
  | {
      ok: false;
      mode?: PasskeyBridgeMode;
      requestId?: string;
      reason: string;
      code?: string;
    };

export type PasskeyBridgeRunInput = {
  mode: PasskeyBridgeMode;
  emailSession: string;
  apiEndpoint?: string;
  purpose?: PasskeyAssertionPurpose;
  deviceBindingId?: string;
  deviceLabel?: string;
};

export type PasskeyBridgeSurface = {
  windowId?: number;
  tabId?: number;
};

export type CreatePasskeyBridgeControllerOptions = {
  extensionId: string;
  fallbackApiEndpoint?: string;
  openBridgeWindow: (url: string) => Promise<PasskeyBridgeSurface>;
  timeoutMs?: number;
  createRequestId?: () => string;
};

export type PasskeyBridgeRuntimeLike = {
  lastError?: { message?: string };
  sendMessage?: (message: unknown, callback: (response: PasskeyBridgeResult) => void) => void;
};

export type RequestExtensionPasskeyBridgeOptions = {
  runtime?: PasskeyBridgeRuntimeLike;
  messageType?: string;
  unavailableMessage?: string;
  failedMessage?: string;
};

export type RequestPasskeyBridgePopupOptions = {
  bridgeEndpoint?: string;
  returnOrigin?: string;
  timeoutMs?: number;
  windowName?: string;
  windowFeatures?: string;
  openWindow?: (url: string, name: string, features: string) => Window | null;
};

export type PasskeyBridgeExternalMessageResult =
  | { handled: true; response: { ok: true } | { ok: false; reason: string } }
  | { handled: false; response?: undefined };

type PendingBridge = {
  mode: PasskeyBridgeMode;
  resolve: (result: PasskeyBridgeResult) => void;
  timer: ReturnType<typeof setTimeout>;
  bridgeEndpoint: string;
  windowId?: number;
  tabId?: number;
};

export function createPasskeyBridgeController(options: CreatePasskeyBridgeControllerOptions) {
  const pending = new Map<string, PendingBridge>();
  const timeoutMs = options.timeoutMs ?? 180_000;

  function finish(result: PasskeyBridgeResult): PasskeyBridgeResult {
    const requestId = result.requestId ?? '';
    const entry = pending.get(requestId);
    if (!entry) return result;
    clearTimeout(entry.timer);
    pending.delete(requestId);
    entry.resolve(result);
    return result;
  }

  return {
    run(input: PasskeyBridgeRunInput): Promise<PasskeyBridgeResult> {
      if (!input.emailSession) return Promise.resolve({ ok: false, mode: input.mode, reason: 'Sign in first.' });
      const requestId = options.createRequestId?.() ?? createBridgeRequestId();
      const bridgeEndpoint = normalizePasskeyBridgeEndpoint(input.apiEndpoint, options.fallbackApiEndpoint);
      const url = createPasskeyBridgeUrl({
        bridgeEndpoint,
        extensionId: options.extensionId,
        requestId,
        ...input,
      });

      return new Promise<PasskeyBridgeResult>((resolve) => {
        const timer = setTimeout(() => {
          finish({
            ok: false,
            mode: input.mode,
            requestId,
            reason: 'Passkey approval timed out.',
            code: 'passkey_timeout',
          });
        }, timeoutMs);
        pending.set(requestId, { mode: input.mode, resolve, timer, bridgeEndpoint });
        void options.openBridgeWindow(url)
          .then((surface) => {
            const entry = pending.get(requestId);
            if (!entry) return;
            entry.windowId = surface.windowId;
            entry.tabId = surface.tabId;
          })
          .catch((error) => {
            finish({
              ok: false,
              mode: input.mode,
              requestId,
              reason: error instanceof Error ? error.message : String(error),
            });
          });
      });
    },

    handleExternalMessage(message: unknown, senderUrl: string): PasskeyBridgeExternalMessageResult {
      const record = isRecord(message) ? message : {};
      if (record.type !== 'hazbaseAccount:passkeyBridgeResult') {
        return { handled: false };
      }
      const requestId = typeof record.requestId === 'string' ? record.requestId : '';
      const entry = pending.get(requestId);
      if (!entry) {
        return { handled: true, response: { ok: false, reason: 'No pending passkey request.' } };
      }
      if (!senderUrl.startsWith(`${entry.bridgeEndpoint}/auth/passkey/bridge`)) {
        return { handled: true, response: { ok: false, reason: 'Unsupported external message origin.' } };
      }
      finish(normalizePasskeyBridgeResult(record));
      return { handled: true, response: { ok: true } };
    },

    finishClosedBridge(surface: PasskeyBridgeSurface): void {
      for (const [requestId, entry] of pending) {
        const windowClosed = surface.windowId !== undefined && entry.windowId === surface.windowId;
        const tabClosed = surface.tabId !== undefined && entry.tabId === surface.tabId;
        if (!windowClosed && !tabClosed) continue;
        finish({
          ok: false,
          mode: entry.mode,
          requestId,
          reason: 'Passkey approval was cancelled.',
          code: 'passkey_cancelled',
        });
      }
    },

    hasPending(requestId: string): boolean {
      return pending.has(requestId);
    },
  };
}

export function requestExtensionPasskeyBridge(
  input: PasskeyBridgeRunInput,
  options: RequestExtensionPasskeyBridgeOptions = {},
): Promise<PasskeyBridgeResult> {
  const runtime = options.runtime ?? defaultRuntime();
  if (!runtime?.sendMessage) {
    return Promise.resolve({
      ok: false,
      mode: input.mode,
      reason: options.unavailableMessage ?? 'Extension bridge is unavailable.',
    });
  }
  const sendMessage = runtime.sendMessage;
  return new Promise((resolve) => {
    sendMessage({ type: options.messageType ?? 'hazbase:passkeyBridge', ...input }, (response: PasskeyBridgeResult) => {
      if (runtime.lastError) {
        resolve({
          ok: false,
          mode: input.mode,
          reason: runtime.lastError.message ?? options.failedMessage ?? 'Extension bridge failed.',
        });
        return;
      }
      resolve(response);
    });
  });
}

export function createPasskeyBridgeUrl(input: PasskeyBridgeRunInput & {
  bridgeEndpoint: string;
  extensionId?: string;
  returnOrigin?: string;
  requestId: string;
}): string {
  const fragment = new URLSearchParams({
    mode: input.mode,
    requestId: input.requestId,
    accessToken: input.emailSession,
  });
  if (input.extensionId) fragment.set('extensionId', input.extensionId);
  if (input.returnOrigin) fragment.set('returnOrigin', input.returnOrigin);
  if (input.deviceLabel) fragment.set('deviceLabel', input.deviceLabel);
  if (input.purpose) fragment.set('purpose', input.purpose);
  if (input.deviceBindingId) fragment.set('deviceBindingId', input.deviceBindingId);
  return `${input.bridgeEndpoint}/auth/passkey/bridge#${fragment.toString()}`;
}

export function requestPasskeyBridgePopup(
  input: PasskeyBridgeRunInput,
  options: RequestPasskeyBridgePopupOptions = {},
): Promise<PasskeyBridgeResult> {
  if (typeof window === 'undefined' || typeof location === 'undefined') {
    return Promise.resolve({ ok: false, mode: input.mode, reason: 'Passkey popup requires a browser.' });
  }
  if (!input.emailSession) {
    return Promise.resolve({ ok: false, mode: input.mode, reason: 'Sign in first.' });
  }
  const bridgeEndpoint = normalizePasskeyBridgeEndpoint(input.apiEndpoint, options.bridgeEndpoint);
  const returnOrigin = options.returnOrigin?.trim() || location.origin;
  if (new URL(returnOrigin).origin !== returnOrigin.replace(/\/$/u, '')) {
    return Promise.resolve({ ok: false, mode: input.mode, reason: 'returnOrigin must be an exact origin.' });
  }
  const requestId = createBridgeRequestId();
  const url = createPasskeyBridgeUrl({
    ...input,
    bridgeEndpoint,
    requestId,
    returnOrigin,
  });
  const openWindow = options.openWindow ?? ((target, name, features) => window.open(target, name, features));
  const popup = openWindow(
    url,
    options.windowName ?? 'hazbase-passkey',
    options.windowFeatures ?? 'popup=yes,width=760,height=860,resizable=yes,scrollbars=yes',
  );
  if (!popup) {
    return Promise.resolve({
      ok: false,
      mode: input.mode,
      requestId,
      reason: 'Passkey popup was blocked.',
      code: 'popup_blocked',
    });
  }

  return new Promise<PasskeyBridgeResult>((resolve) => {
    let settled = false;
    const expectedOrigin = new URL(bridgeEndpoint).origin;
    const timeoutMs = options.timeoutMs ?? 180_000;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      clearInterval(closedTimer);
    };
    const finish = (result: PasskeyBridgeResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!popup.closed) popup.close();
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin || event.source !== popup || !isRecord(event.data)) return;
      if (event.data.type !== 'hazbaseAccount:passkeyBridgeResult' || event.data.requestId !== requestId) return;
      finish(normalizePasskeyBridgeResult(event.data));
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish({
      ok: false,
      mode: input.mode,
      requestId,
      reason: 'Passkey approval timed out.',
      code: 'passkey_timeout',
    }), timeoutMs);
    const closedTimer = setInterval(() => {
      if (!popup.closed) return;
      finish({
        ok: false,
        mode: input.mode,
        requestId,
        reason: 'Passkey approval was cancelled.',
        code: 'passkey_cancelled',
      });
    }, 400);
  });
}

export function normalizePasskeyBridgeEndpoint(value: unknown, fallback = API_ENDPOINT): string {
  if (typeof value !== 'string' || !value.trim()) return normalizeFallbackEndpoint(fallback);
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return normalizeFallbackEndpoint(fallback);
    return url.origin;
  } catch {
    return normalizeFallbackEndpoint(fallback);
  }
}

export function normalizePasskeyBridgeResult(record: Record<string, unknown>): PasskeyBridgeResult {
  const requestId = typeof record.requestId === 'string' ? record.requestId : '';
  const mode = record.mode === 'registration' || record.mode === 'assertion' ? record.mode : undefined;
  if (record.ok === true && mode === 'registration') {
    return {
      ok: true,
      mode,
      requestId,
      registration: record.registration as CompletePasskeyRegistrationResult,
    };
  }
  if (record.ok === true && mode === 'assertion') {
    return {
      ok: true,
      mode,
      requestId,
      assertion: record.assertion as CompletePasskeyAssertionResult,
    };
  }
  return {
    ok: false,
    ...(mode ? { mode } : {}),
    requestId,
    reason: typeof record.reason === 'string' ? record.reason : 'Passkey bridge failed.',
    ...(typeof record.code === 'string' ? { code: record.code } : {}),
  };
}

function normalizeFallbackEndpoint(fallback = API_ENDPOINT): string {
  try {
    return new URL(fallback).origin;
  } catch {
    return fallback.replace(/\/+$/u, '');
  }
}

function createBridgeRequestId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `passkey_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function defaultRuntime(): PasskeyBridgeRuntimeLike | undefined {
  return (globalThis as typeof globalThis & { chrome?: { runtime?: PasskeyBridgeRuntimeLike } }).chrome?.runtime;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
