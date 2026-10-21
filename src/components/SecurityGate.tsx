import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import {
  fingerPrintOutline,
  shieldCheckmarkOutline,
  closeOutline,
  backspaceOutline,
  keyOutline,
  refreshOutline,
} from 'ionicons/icons';
import './SecurityGate.css';

const PIN_STORE_KEY = 'afa-admin-pin-v1';
const LOCKOUT_STORE_KEY = 'afa-admin-pin-lockout-v1';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

interface StoredPin {
  salt: string;
  hash: string;
}

// Lockout state lives in sessionStorage (not just component state) so a
// page reload cannot bypass the 5-attempt limit. Cleared on success.
const readLockout = (): { attempts: number; lockUntil: number } => {
  try {
    const raw = sessionStorage.getItem(LOCKOUT_STORE_KEY);
    if (!raw) return { attempts: 0, lockUntil: 0 };
    const parsed = JSON.parse(raw) as { attempts?: number; lockUntil?: number };
    return {
      attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 0,
      lockUntil: typeof parsed.lockUntil === 'number' ? parsed.lockUntil : 0,
    };
  } catch {
    return { attempts: 0, lockUntil: 0 };
  }
};

const writeLockout = (attempts: number, lockUntil: number) => {
  try {
    if (attempts <= 0 && lockUntil <= 0) {
      sessionStorage.removeItem(LOCKOUT_STORE_KEY);
    } else {
      sessionStorage.setItem(LOCKOUT_STORE_KEY, JSON.stringify({ attempts, lockUntil }));
    }
  } catch {
    /* storage blocked — lockout stays in-memory for this page session */
  }
};

const readStoredPin = (): StoredPin | null => {
  try {
    const raw = localStorage.getItem(PIN_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPin;
    return parsed?.salt && parsed?.hash ? parsed : null;
  } catch {
    return null;
  }
};

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const hashPin = async (pin: string, salt: string): Promise<string> => {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
};

const randomSalt = (): string => toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);

const canUseWebAuthn = async (): Promise<boolean> => {
  try {
    if (typeof window === 'undefined') return false;
    if (!window.PublicKeyCredential || !navigator.credentials?.get) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

const verifyWithBiometric = async (): Promise<boolean> => {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: challenge as unknown as BufferSource,
      rpId: window.location.hostname,
      userVerification: 'required',
      timeout: 60_000,
    },
  });
  return !!credential;
};

const haptic = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration unsupported — non-critical */
  }
};

interface SecurityGateProps {
  open: boolean;
  /** Human-readable reason shown on the sheet, e.g. "Approve 5 registrations". */
  reason: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * M3 re-authentication sheet for high-risk admin actions.
 *
 * Tries the platform authenticator (Android fingerprint/face via WebAuthn)
 * first and falls back to a device-local PIN keypad (SHA-256 + salt in
 * localStorage — presence verification, not a server-side credential).
 */
export const SecurityGate: React.FC<SecurityGateProps> = ({ open, reason, onSuccess, onCancel }) => {
  const [stored, setStored] = useState<StoredPin | null>(null);
  const [mode, setMode] = useState<'biometric' | 'pin-entry' | 'pin-setup'>('biometric');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    setPin('');
    setConfirmPin(null);
    setError('');
    setBusy(false);
    const pinRecord = readStoredPin();
    setStored(pinRecord);
    const lock = readLockout();
    if (lock.lockUntil > Date.now()) {
      setAttempts(lock.attempts);
      setLockUntil(lock.lockUntil);
    } else {
      setAttempts(0);
      setLockUntil(0);
      if (lock.attempts > 0 || lock.lockUntil > 0) writeLockout(0, 0);
    }
    void (async () => {
      const hasBio = await canUseWebAuthn();
      setMode(hasBio ? 'biometric' : pinRecord ? 'pin-entry' : 'pin-setup');
    })();
  }, [open]);

  // Tick while locked out so the countdown re-renders.
  useEffect(() => {
    if (!open || !lockUntil) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [open, lockUntil]);

  const lockedFor = Math.max(0, Math.ceil((lockUntil - now) / 1000));

  const finish = useCallback(() => {
    haptic(15);
    onSuccess();
  }, [onSuccess]);

  const handleBiometric = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const ok = await verifyWithBiometric();
      if (ok) finish();
      else {
        setError('Biometric check was not completed');
        setMode(readStoredPin() ? 'pin-entry' : 'pin-setup');
      }
    } catch {
      haptic([4, 40, 4]);
      setError('Biometric unlock unavailable — use your PIN');
      setMode(readStoredPin() ? 'pin-entry' : 'pin-setup');
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async () => {
    if (busy || !pin) return;
    if (Date.now() < lockUntil) return;

    if (!stored) {
      // Setup: confirm step, then persist salted hash.
      if (confirmPin === null) {
        if (pin.length < 4) {
          setError('PIN must be at least 4 digits');
          return;
        }
        setConfirmPin(pin);
        setPin('');
        setError('');
        return;
      }
      if (pin !== confirmPin) {
        haptic([4, 40, 4]);
        setError('PINs do not match — try again');
        setConfirmPin(null);
        setPin('');
        return;
      }
      const salt = randomSalt();
      const hash = await hashPin(pin, salt);
      try {
        localStorage.setItem(PIN_STORE_KEY, JSON.stringify({ salt, hash }));
      } catch {
        /* storage blocked — PIN won't persist this session */
      }
      finish();
      return;
    }

    setBusy(true);
    const hash = await hashPin(pin, stored.salt);
    setBusy(false);
    if (hash === stored.hash) {
      setAttempts(0);
      writeLockout(0, 0);
      finish();
      return;
    }
    haptic([4, 40, 4]);
    const next = attempts + 1;
    setPin('');
    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_MS;
      setLockUntil(until);
      setNow(Date.now());
      setAttempts(0);
      writeLockout(0, until);
      setError('Too many attempts — locked for 30 seconds');
    } else {
      setAttempts(next);
      writeLockout(next, 0);
      setError(`Incorrect PIN (${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? '' : 's'} left)`);
    }
  };

  const onDigit = (d: string) => {
    if (busy || Date.now() < lockUntil) return;
    haptic(4);
    setError((prev) => (prev.startsWith('Incorrect') || prev.startsWith('PIN') ? '' : prev));
    setPin((p) => (p.length >= 8 ? p : p + d));
  };

  const onBackspace = () => {
    haptic(4);
    setPin((p) => p.slice(0, -1));
  };

  const resetPin = () => {
    try {
      localStorage.removeItem(PIN_STORE_KEY);
    } catch {
      /* ignore */
    }
    setStored(null);
    setPin('');
    setConfirmPin(null);
    setError('');
    setAttempts(0);
    setLockUntil(0);
    writeLockout(0, 0);
    setMode('pin-setup');
  };

  if (!open) return null;

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const setupNeedsConfirm = confirmPin !== null;

  return createPortal(
    <>
      <div className="sg-scrim" onClick={busy ? undefined : onCancel} aria-hidden="true" />
      <div className="sg-sheet" role="dialog" aria-modal="true" aria-label="Security verification">
        <div className="m3-sheet-handle" aria-hidden="true" />

        <div className="sg-header">
          <span className="sg-shield">
            <IonIcon icon={shieldCheckmarkOutline} />
          </span>
          <div>
            <p className="sg-title">Verify it&apos;s you</p>
            <p className="sg-reason">{reason}</p>
          </div>
          <button type="button" className="sg-close" onClick={onCancel} aria-label="Cancel action" disabled={busy}>
            <IonIcon icon={closeOutline} />
          </button>
        </div>

        {mode === 'biometric' && (
          <div className="sg-bio">
            <button type="button" className="sg-bio-btn" onClick={() => void handleBiometric()} disabled={busy}>
              <IonIcon icon={fingerPrintOutline} />
              <span>{busy ? 'Waiting for authenticator…' : 'Unlock with biometrics'}</span>
            </button>
            {error && <p className="sg-error">{error}</p>}
            <button type="button" className="sg-link-btn" onClick={() => setMode(readStoredPin() ? 'pin-entry' : 'pin-setup')}>
              <IonIcon icon={keyOutline} />
              <span>Use PIN instead</span>
            </button>
          </div>
        )}

        {mode !== 'biometric' && (
          <div className="sg-pin">
            <p className="sg-pin-label">
              {!stored
                ? setupNeedsConfirm
                  ? 'Confirm your new PIN'
                  : 'Create a PIN for admin actions'
                : 'Enter your admin PIN'}
            </p>

            <div className="sg-dots" aria-hidden="true">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span key={i} className={`sg-dot ${i < pin.length ? 'sg-dot--on' : ''}`} />
              ))}
            </div>

            {error && <p className="sg-error">{error}</p>}
            {lockedFor > 0 && <p className="sg-lockout">Locked — retry in {lockedFor}s</p>}

            <div className="sg-keypad">
              {digits.map((d) => (
                <button key={d} type="button" className="sg-key" onClick={() => onDigit(d)} disabled={lockedFor > 0}>
                  {d}
                </button>
              ))}
              <button
                type="button"
                className="sg-key sg-key--bio"
                onClick={() => setMode('biometric')}
                disabled={busy}
                aria-label="Use biometrics"
              >
                <IonIcon icon={fingerPrintOutline} />
              </button>
              <button key="0" type="button" className="sg-key" onClick={() => onDigit('0')} disabled={lockedFor > 0}>
                0
              </button>
              <button type="button" className="sg-key sg-key--back" onClick={onBackspace} aria-label="Delete digit" disabled={busy}>
                <IonIcon icon={backspaceOutline} />
              </button>
            </div>

            <button
              type="button"
              className="sg-submit"
              onClick={() => void submitPin()}
              disabled={busy || pin.length < 4 || lockedFor > 0}
            >
              {busy ? 'Verifying…' : stored ? 'Verify' : 'Save PIN & continue'}
            </button>

            {stored && (
              <button type="button" className="sg-link-btn" onClick={resetPin} disabled={busy || lockedFor > 0}>
                <IonIcon icon={refreshOutline} />
                <span>Forgot PIN? Reset</span>
              </button>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

export default SecurityGate;
