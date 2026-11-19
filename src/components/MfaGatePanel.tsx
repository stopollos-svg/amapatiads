import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
  Lock,
  Smartphone,
  RotateCcw,
} from 'lucide-react';
import { MfaConfig } from '../types';

interface MfaGatePanelProps {
  user: User | null;
  mfaConfig: MfaConfig | null;
  mfaLoading: boolean;
  onGoogleSignIn: () => Promise<void>;
  onSaveEnrollment: (secretBase32: string, backupCodeHashes: string[]) => Promise<void>;
  onConsumeBackupCode: (usedIndex: number) => Promise<void>;
  onMfaVerified: () => void;
  onSignOut: () => Promise<void>;
}

interface EnrollmentPayload {
  secretBase32: string;
  otpauthUri: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
  backupCodeHashes: string[];
  remainingSeconds: number;
}

export function MfaGatePanel({
  user,
  mfaConfig,
  mfaLoading,
  onGoogleSignIn,
  onSaveEnrollment,
  onConsumeBackupCode,
  onMfaVerified,
  onSignOut,
}: MfaGatePanelProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [enrollData, setEnrollData] = useState<EnrollmentPayload | null>(null);
  const [enrollInitLoading, setEnrollInitLoading] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [pendingBackupCodes, setPendingBackupCodes] = useState<string[] | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(30 - (Math.floor(Date.now() / 1000) % 30));

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user || mfaLoading || mfaConfig?.enabled || enrollData || pendingBackupCodes) {
      return;
    }
    let cancelled = false;
    const initEnroll = async () => {
      setEnrollInitLoading(true);
      try {
        const res = await fetch('/api/mfa/enroll-init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email || 'publisher@adverify.studio' }),
        });
        const data = await res.json();
        if (!cancelled && res.ok) {
          setEnrollData(data);
        }
      } catch {
        if (!cancelled) {
          setVerifyError('Unable to initialize authenticator enrollment.');
        }
      } finally {
        if (!cancelled) setEnrollInitLoading(false);
      }
    };
    void initEnroll();
    return () => {
      cancelled = true;
    };
  }, [user, mfaLoading, mfaConfig, enrollData, pendingBackupCodes]);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await onGoogleSignIn();
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleCopySecret = async () => {
    if (!enrollData) return;
    try {
      await navigator.clipboard.writeText(enrollData.secretBase32);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleVerifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollData) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretBase32: enrollData.secretBase32,
          code: codeInput,
          backupCodeHashes: [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setVerifyError(data.error || 'Code did not match. Ensure device clock is synced.');
        return;
      }
      await onSaveEnrollment(enrollData.secretBase32, enrollData.backupCodeHashes);
      setPendingBackupCodes(enrollData.backupCodes);
      setCodeInput('');
    } catch {
      setVerifyError('Verification failed. Please retry.');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaConfig) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretBase32: mfaConfig.totpSecret,
          code: codeInput,
          backupCodeHashes: mfaConfig.backupCodeHashes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setVerifyError(data.error || 'Invalid authenticator or recovery code.');
        return;
      }
      if (data.method === 'backup_code' && typeof data.usedBackupIndex === 'number') {
        await onConsumeBackupCode(data.usedBackupIndex);
      }
      setCodeInput('');
      onMfaVerified();
    } catch {
      setVerifyError('Unable to verify code.');
    } finally {
      setVerifying(false);
    }
  };

  // Factor 1: Google Sign-In
  if (!user) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-lg mx-auto space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-teal-700">
            <Lock className="w-4 h-4" />
            <span>Step 1 of 2 · Publisher Identity</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-900">
            Sign in to access the AdMob Console
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Authenticate with your Google account first, then complete RFC 6238 TOTP Multi-Factor Authentication to unlock credential verification and revenue analytics.
          </p>
        </div>

        {authError && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={signingIn}
          className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-800 transition-colors disabled:opacity-60"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
        </button>
      </div>
    );
  }

  if (mfaLoading || enrollInitLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-lg mx-auto text-center space-y-3">
        <RotateCcw className="w-5 h-5 text-teal-700 animate-spin mx-auto" />
        <p className="text-sm text-slate-600">Checking Multi-Factor Authentication state...</p>
      </div>
    );
  }

  // Newly enrolled recovery backup codes display
  if (pendingBackupCodes) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-lg mx-auto space-y-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-green-700">
            <ShieldCheck className="w-4 h-4" />
            <span>MFA Enrolled Successfully</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-900">
            Save Your Single-Use Recovery Codes
          </h3>
          <p className="text-sm text-slate-600">
            Store these 6 recovery codes in a password manager. Each code can unlock your dashboard once if you lose access to your authenticator app.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-sm text-slate-900">
          {pendingBackupCodes.map((code) => (
            <div key={code} className="bg-white border border-slate-200 rounded px-3 py-1.5 text-center">
              {code}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setPendingBackupCodes(null);
            onMfaVerified();
          }}
          className="w-full px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors"
        >
          I Have Saved These Codes — Enter Console
        </button>
      </div>
    );
  }

  // Factor 2A: First-time TOTP Enrollment
  if (!mfaConfig?.enabled && enrollData) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-2xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-teal-700">
              <Smartphone className="w-4 h-4" />
              <span>Step 2 of 2 · Enroll Authenticator App (TOTP)</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900">
              Configure Multi-Factor Authentication
            </h3>
            <p className="text-xs text-slate-500">
              Signed in as {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4"
          >
            Switch Account
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-5 flex flex-col items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <img
              src={enrollData.qrCodeDataUrl}
              alt="Scan this QR code with Google Authenticator or Authy"
              referrerPolicy="no-referrer"
              className="w-44 h-44 rounded-lg bg-white p-2 border border-slate-200"
            />
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              Window refreshes in {secondsLeft}s
            </span>
          </div>

          <div className="md:col-span-7 space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm text-slate-700 font-medium">
                1. Scan with Google Authenticator, Authy, or 1Password
              </p>
              <p className="text-xs text-slate-500">
                Or enter this Base32 setup key manually:
              </p>
              <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <code className="text-xs font-mono text-slate-900 break-all">
                  {enrollData.secretBase32}
                </code>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-200/60 shrink-0"
                  aria-label="Copy setup key"
                >
                  {copiedSecret ? <Check className="w-3.5 h-3.5 text-green-700" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <form onSubmit={handleVerifyEnroll} className="space-y-3 pt-1">
              <div className="space-y-1">
                <label htmlFor="totp-enroll-code" className="text-sm font-medium text-slate-700 block">
                  2. Enter 6-digit verification code
                </label>
                <input
                  id="totp-enroll-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="000000"
                  className="w-full px-3.5 py-2.5 text-base font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              {verifyError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  {verifyError}
                </p>
              )}

              <button
                type="submit"
                disabled={verifying || codeInput.length !== 6}
                className="w-full px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {verifying ? 'Verifying...' : 'Verify & Activate MFA'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Factor 2B: Existing MFA Challenge
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-teal-700">
            <KeyRound className="w-4 h-4" />
            <span>Step 2 of 2 · Authenticator Challenge</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-900">
            Enter Two-Factor Code
          </h3>
          <p className="text-xs text-slate-500">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4"
        >
          Sign Out
        </button>
      </div>

      <form onSubmit={handleVerifyExisting} className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="totp-login-code" className="font-medium text-slate-700">
              6-digit TOTP code or recovery code (XXXX-XXXX)
            </label>
            <span className="font-mono text-slate-500 tabular-nums">
              {secondsLeft}s window
            </span>
          </div>
          <input
            id="totp-login-code"
            type="text"
            autoComplete="one-time-code"
            required
            maxLength={12}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="123456 or A1B2-C3D4"
            className="w-full px-3.5 py-2.5 text-base font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
          />
        </div>

        {verifyError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
            {verifyError}
          </p>
        )}

        <button
          type="submit"
          disabled={verifying || codeInput.trim().length < 6}
          className="w-full px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {verifying ? 'Verifying...' : 'Unlock AdMob Console'}
        </button>
      </form>
    </div>
  );
}
