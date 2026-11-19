import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
  Lock,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import {
  AppAdsVerifyResult,
  MfaConfig,
  PublisherApp,
  PublisherSettings,
  RevenueSnapshot,
  VerificationLog,
} from './types';
import { AppPortfolioSection } from './components/AppPortfolioSection';
import { AppAdsSection } from './components/AppAdsSection';
import { MfaGatePanel } from './components/MfaGatePanel';
import { AdMobDashboard } from './components/AdMobDashboard';

const DEFAULT_PUBLISHER_ID = 'pub-2596010858935461';
const DEFAULT_TAG_ID = 'f08c47fec0942fa0';
const DEFAULT_APP_ADS_LINES = [
  'google.com, pub-2596010858935461, DIRECT, f08c47fec0942fa0',
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);

  const [publicApps, setPublicApps] = useState<PublisherApp[]>([]);
  const [ownerApps, setOwnerApps] = useState<PublisherApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);

  const [settings, setSettings] = useState<PublisherSettings | null>(null);
  const [mfaConfig, setMfaConfig] = useState<MfaConfig | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<RevenueSnapshot | null>(null);
  const [snapshotExists, setSnapshotExists] = useState(false);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>([]);

  const [serverAppAdsLines, setServerAppAdsLines] = useState<string[]>(DEFAULT_APP_ADS_LINES);
  const [copiedHeroSnippet, setCopiedHeroSnippet] = useState(false);

  useEffect(() => {
    void fetch('/api/app-ads-config')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.lines) && d.lines.length > 0) {
          setServerAppAdsLines(d.lines);
        }
      })
      .catch(() => {});
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setMfaVerified(false);
        setMfaConfig(null);
        setSettings(null);
        setSnapshot(null);
        setSnapshotExists(false);
        setVerificationLogs([]);
        setOwnerApps([]);
      }
    });
    return () => unsub();
  }, []);

  // Public apps listener (visible on the developer website)
  useEffect(() => {
    const q = query(
      collection(db, 'apps'),
      where('visibility', '==', 'public')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PublisherApp[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PublisherApp, 'id'>),
        }));
        setPublicApps(list);
        setAppsLoading(false);
      },
      (error) => {
        setAppsLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'apps');
      }
    );
    return () => unsub();
  }, []);

  // Authenticated owner listeners
  useEffect(() => {
    if (!authReady || !user) return;
    setMfaLoading(true);

    const unsubOwnerApps = onSnapshot(
      query(collection(db, 'apps'), where('ownerId', '==', user.uid)),
      (snap) => {
        setOwnerApps(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PublisherApp, 'id'>),
          }))
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'apps')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'publisherSettings', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PublisherSettings;
          setSettings(data);
          if (Array.isArray(data.appAdsLines) && data.appAdsLines.length > 0) {
            setServerAppAdsLines(data.appAdsLines);
            void fetch('/api/app-ads-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lines: data.appAdsLines }),
            }).catch(() => {});
          }
        }
      },
      (error) =>
        handleFirestoreError(error, OperationType.GET, `publisherSettings/${user.uid}`)
    );

    const unsubMfa = onSnapshot(
      doc(db, 'mfaConfig', user.uid),
      (snap) => {
        setMfaConfig(snap.exists() ? (snap.data() as MfaConfig) : null);
        setMfaLoading(false);
      },
      (error) => {
        setMfaLoading(false);
        handleFirestoreError(error, OperationType.GET, `mfaConfig/${user.uid}`);
      }
    );

    const unsubSnapshot = onSnapshot(
      doc(db, 'revenueSnapshots', user.uid),
      (snap) => {
        setSnapshotExists(snap.exists());
        setSnapshot(snap.exists() ? (snap.data() as RevenueSnapshot) : null);
      },
      (error) =>
        handleFirestoreError(error, OperationType.GET, `revenueSnapshots/${user.uid}`)
    );

    const unsubLogs = onSnapshot(
      query(
        collection(db, 'verificationLogs'),
        where('ownerId', '==', user.uid)
      ),
      (snap) => {
        const logs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<VerificationLog, 'id'>),
        }));
        logs.sort((a, b) => {
          const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setVerificationLogs(logs);
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, 'verificationLogs')
    );

    return () => {
      unsubOwnerApps();
      unsubSettings();
      unsubMfa();
      unsubSnapshot();
      unsubLogs();
    };
  }, [authReady, user]);

  // Merge public apps + owner's private apps cleanly without duplicates
  const mergedApps = (() => {
    const map = new Map<string, PublisherApp>();
    publicApps.forEach((a) => map.set(a.id, a));
    ownerApps.forEach((a) => map.set(a.id, a));
    return Array.from(map.values());
  })();

  const activePublisherId = settings?.publisherId || DEFAULT_PUBLISHER_ID;
  const activeTagId = settings?.tagId || DEFAULT_TAG_ID;
  const activeAppAdsLines = settings?.appAdsLines || serverAppAdsLines;

  const handleGoogleSignIn = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const handleSignOut = async () => {
    setMfaVerified(false);
    await signOut(auth);
  };

  const handleSaveMfaEnrollment = async (
    secretBase32: string,
    backupCodeHashes: string[]
  ) => {
    if (!user) return;
    const path = `mfaConfig/${user.uid}`;
    try {
      if (mfaConfig) {
        await updateDoc(doc(db, 'mfaConfig', user.uid), {
          enabled: true,
          totpSecret: secretBase32,
          backupCodeHashes,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'mfaConfig', user.uid), {
          ownerId: user.uid,
          enabled: true,
          totpSecret: secretBase32,
          backupCodeHashes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleConsumeBackupCode = async (usedIndex: number) => {
    if (!user || !mfaConfig) return;
    const updated = mfaConfig.backupCodeHashes.filter((_, i) => i !== usedIndex);
    const path = `mfaConfig/${user.uid}`;
    try {
      await updateDoc(doc(db, 'mfaConfig', user.uid), {
        backupCodeHashes: updated,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleResetMfa = async () => {
    if (!user) return;
    const path = `mfaConfig/${user.uid}`;
    try {
      await deleteDoc(doc(db, 'mfaConfig', user.uid));
      setMfaVerified(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSaveAppAdsLines = async (lines: string[]) => {
    setServerAppAdsLines(lines);
    if (!user) return;
    const path = `publisherSettings/${user.uid}`;
    try {
      if (settings) {
        await updateDoc(doc(db, 'publisherSettings', user.uid), {
          appAdsLines: lines,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'publisherSettings', user.uid), {
          ownerId: user.uid,
          publisherId: DEFAULT_PUBLISHER_ID,
          tagId: DEFAULT_TAG_ID,
          developerDomain: window.location.host,
          appAdsLines: lines,
          lastCrawlStatus: 'verified',
          lastCrawlDomain: window.location.host,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleAddApp = async (
    payload: Omit<PublisherApp, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'apps'), {
        ...payload,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'apps');
    }
  };

  const handleUpdateApp = async (
    id: string,
    payload: Omit<PublisherApp, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'apps', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `apps/${id}`);
    }
  };

  const handleDeleteApp = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'apps', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `apps/${id}`);
    }
  };

  const handleSaveSnapshot = async (next: RevenueSnapshot) => {
    setSnapshot(next);
    if (!user) return;
    const path = `revenueSnapshots/${user.uid}`;
    try {
      const payload = {
        source: next.source,
        publisherId: next.publisherId,
        currency: next.currency,
        dailyMetrics: next.dailyMetrics.slice(-60),
        appBreakdowns: next.appBreakdowns.slice(0, 25),
        formatBreakdowns: next.formatBreakdowns.slice(0, 10),
        geoBreakdowns: next.geoBreakdowns.slice(0, 15),
        updatedAt: serverTimestamp(),
      };
      if (snapshotExists) {
        await updateDoc(doc(db, 'revenueSnapshots', user.uid), payload);
      } else {
        await setDoc(doc(db, 'revenueSnapshots', user.uid), {
          ownerId: user.uid,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleLogVerification = async (
    checkType: VerificationLog['checkType'],
    target: string,
    status: VerificationLog['status'],
    summary: string,
    httpStatus: number
  ) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'verificationLogs'), {
        ownerId: user.uid,
        checkType,
        target: target.slice(0, 200),
        status,
        summary: summary.slice(0, 300),
        httpStatus,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'verificationLogs');
    }
  };

  const handleLogCrawlResult = async (res: AppAdsVerifyResult) => {
    if (!user || !mfaVerified) return;
    await handleLogVerification(
      'app_ads_txt',
      res.targetUrl.slice(0, 200),
      res.exactSnippetMatch ? 'verified' : res.fetchError ? 'failed' : 'warning',
      res.exactSnippetMatch
        ? `Verified exact AdMob line (${res.validLines} valid records).`
        : res.fetchError || 'AdMob pub-2596010858935461 authorization line not matched.',
      res.httpStatus
    );
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(DEFAULT_APP_ADS_LINES[0]);
      setCopiedHeroSnippet(true);
      setTimeout(() => setCopiedHeroSnippet(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="#overview"
            className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            AdVerify Studio
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#overview"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Overview
            </a>
            <a
              href="#app-portfolio"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              App Portfolio
            </a>
            <a
              href="#app-ads-txt"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              app-ads.txt
            </a>
            <a
              href="#console"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Revenue Console
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => scrollToSection('console')}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Console Access
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-10 space-y-16">
        {/* Hero Split + 4-Column Summary Strip */}
        <section id="overview" className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center space-y-5">
              <div className="space-y-3">
                <p className="text-xs font-medium text-teal-700 tracking-wide">
                  AdMob Publisher Verification & Developer Portal
                </p>
                <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-900 leading-[1.15] text-balance">
                  Verify AdMob credentials, host app-ads.txt, and track revenue securely.
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                  Your official developer website hosting{' '}
                  <code className="font-mono text-xs bg-slate-200/70 px-1.5 py-0.5 rounded text-slate-900">
                    /app-ads.txt
                  </code>{' '}
                  at root, showcasing all Google Play and App Store apps, and protecting live AdMob revenue analytics behind RFC 6238 Multi-Factor Authentication.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => scrollToSection('console')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors whitespace-nowrap"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{mfaVerified ? 'Open AdMob Analytics' : 'Unlock Console with MFA'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="/app-ads.txt"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-medium transition-colors whitespace-nowrap"
                >
                  <span>Inspect /app-ads.txt</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 bg-slate-950 text-slate-100 rounded-xl p-6 flex flex-col justify-between gap-5 border border-slate-800">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <span className="text-xs font-mono text-slate-300">
                  GET /app-ads.txt · 200 OK
                </span>
                <span className="text-xs font-medium text-teal-400">
                  IAB Tech Lab Valid
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Live Authorized Seller Record served at root:
                </p>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-teal-300 overflow-x-auto">
                  {activeAppAdsLines.map((line, i) => (
                    <div key={i} className="whitespace-nowrap">
                      {line}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-slate-400">
                  Link this site URL in Play Console & App Store Connect
                </span>
                <button
                  type="button"
                  onClick={copySnippet}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors shrink-0"
                >
                  {copiedHeroSnippet ? (
                    <Check className="w-3.5 h-3.5 text-teal-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedHeroSnippet ? 'Copied' : 'Copy Line'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4-Column Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">AdMob Publisher ID</div>
              <div className="text-sm font-mono font-semibold text-slate-900 mt-1 tabular-nums">
                {activePublisherId}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Google TAG Authority</div>
              <div className="text-sm font-mono font-semibold text-slate-900 mt-1 tabular-nums">
                {activeTagId}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Published Directory Apps</div>
              <div className="text-sm font-mono font-semibold text-slate-900 mt-1 tabular-nums">
                {mergedApps.length} {mergedApps.length === 1 ? 'Application' : 'Applications'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Dashboard Security</div>
              <div className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                {mfaVerified ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-green-700 shrink-0" />
                    <span className="text-green-800">MFA Unlocked</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-slate-600 shrink-0" />
                    <span>Google + TOTP MFA</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Public Developer App Portfolio */}
        <AppPortfolioSection
          apps={mergedApps}
          loading={appsLoading}
          canManage={Boolean(user && mfaVerified)}
          publisherId={activePublisherId}
          onAddApp={handleAddApp}
          onUpdateApp={handleUpdateApp}
          onDeleteApp={handleDeleteApp}
          onRequestConsoleAccess={() => scrollToSection('console')}
        />

        {/* app-ads.txt Guide & Real-Time Domain Crawler */}
        <AppAdsSection
          publisherId={activePublisherId}
          tagId={activeTagId}
          customLines={activeAppAdsLines}
          canEdit={Boolean(user && mfaVerified)}
          onSaveLines={handleSaveAppAdsLines}
          onLogVerification={handleLogCrawlResult}
        />

        {/* Secure MFA-Protected AdMob Verification & Revenue Analytics Console */}
        <section id="console" className="space-y-6 pt-4 border-t border-slate-200">
          <div className="space-y-1.5 max-w-2xl">
            <p className="text-xs font-medium text-teal-700 tracking-wide">
              Protected Publisher Workspace
            </p>
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
              AdMob Credential Verification & Revenue Analytics
            </h2>
            <p className="text-sm text-slate-600">
              Protected by two-factor authentication (Google Identity + RFC 6238 Authenticator TOTP) for verifying AdMob API credentials and analyzing revenue reports.
            </p>
          </div>

          {user && mfaVerified ? (
            <AdMobDashboard
              user={user}
              publisherId={activePublisherId}
              tagId={activeTagId}
              snapshot={snapshot}
              verificationLogs={verificationLogs}
              onSaveSnapshot={handleSaveSnapshot}
              onLogVerification={handleLogVerification}
              onLockConsole={() => setMfaVerified(false)}
              onResetMfa={handleResetMfa}
            />
          ) : (
            <MfaGatePanel
              user={user}
              mfaConfig={mfaConfig}
              mfaLoading={mfaLoading}
              onGoogleSignIn={handleGoogleSignIn}
              onSaveEnrollment={handleSaveMfaEnrollment}
              onConsumeBackupCode={handleConsumeBackupCode}
              onMfaVerified={() => setMfaVerified(true)}
              onSignOut={handleSignOut}
            />
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            AdVerify Studio · Publisher{' '}
            <span className="font-mono text-slate-700">{activePublisherId}</span>
          </span>
          <div className="flex items-center gap-6">
            <a href="/app-ads.txt" target="_blank" rel="noreferrer" className="hover:text-slate-900">
              /app-ads.txt
            </a>
            <a href="#app-portfolio" className="hover:text-slate-900">
              Published Apps
            </a>
            <a href="#app-ads-txt" className="hover:text-slate-900">
              Setup Guide
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
