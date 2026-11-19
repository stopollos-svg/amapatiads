import { useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  KeyRound,
  Upload,
  Download,
  Lock,
  RefreshCw,
  BarChart3,
  RotateCcw,
} from 'lucide-react';
import {
  CredentialVerifyResult,
  RevenueSnapshot,
  VerificationLog,
} from '../types';
import {
  AdFormatDonutChart,
  AppRevenueBarChart,
  RevenueTimeSeriesChart,
} from './Charts';

interface AdMobDashboardProps {
  user: User;
  publisherId: string;
  tagId: string;
  snapshot: RevenueSnapshot | null;
  verificationLogs: VerificationLog[];
  onSaveSnapshot: (snapshot: RevenueSnapshot) => Promise<void>;
  onLogVerification: (
    checkType: VerificationLog['checkType'],
    target: string,
    status: VerificationLog['status'],
    summary: string,
    httpStatus: number
  ) => Promise<void>;
  onLockConsole: () => void;
  onResetMfa: () => Promise<void>;
}

function formatCurrency(val: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

export function AdMobDashboard({
  user,
  publisherId: initialPublisherId,
  tagId: initialTagId,
  snapshot,
  verificationLogs,
  onSaveSnapshot,
  onLogVerification,
  onLockConsole,
  onResetMfa,
}: AdMobDashboardProps) {
  const [publisherId, setPublisherId] = useState(initialPublisherId);
  const [tagId, setTagId] = useState(initialTagId);
  const [appId, setAppId] = useState(`ca-app-${initialPublisherId}~4189021140`);
  const [adUnitId, setAdUnitId] = useState(`ca-app-${initialPublisherId}/8912044120`);
  const [oauthToken, setOauthToken] = useState('');
  const [verifyingCreds, setVerifyingCreds] = useState(false);
  const [credResult, setCredResult] = useState<CredentialVerifyResult | null>(null);
  const [credError, setCredError] = useState<string | null>(null);

  const [daysWindow, setDaysWindow] = useState<7 | 14 | 30>(30);
  const [loadingSample, setLoadingSample] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleVerifyCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyingCreds(true);
    setCredError(null);
    try {
      const res = await fetch('/api/admob/verify-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publisherId,
          tagId,
          appId,
          adUnitId,
          oauthAccessToken: oauthToken,
        }),
      });
      const data: CredentialVerifyResult = await res.json();
      setCredResult(data);

      const allSyntaxOk =
        data.checks.publisherIdFormat &&
        data.checks.tagIdFormat &&
        data.checks.appIdFormat &&
        data.checks.adUnitFormat &&
        data.checks.publisherConsistency;

      if (data.liveApi.attempted) {
        await onLogVerification(
          'admob_api',
          publisherId,
          data.liveApi.verified ? 'verified' : 'failed',
          data.liveApi.verified
            ? `Live AdMob API verified (${data.liveApi.accountName}, ${data.liveApi.currencyCode}).`
            : data.liveApi.error || 'Live AdMob API verification failed.',
          data.liveApi.httpStatus || 0
        );
        if (data.liveApi.verified && data.liveApi.reportSnapshot) {
          await onSaveSnapshot(data.liveApi.reportSnapshot);
        }
      } else {
        await onLogVerification(
          'credential_syntax',
          publisherId,
          allSyntaxOk && data.checks.appAdsHostedMatch ? 'verified' : 'warning',
          allSyntaxOk && data.checks.appAdsHostedMatch
            ? 'Publisher ID, App ID, Ad Unit ID, and /app-ads.txt signature verified.'
            : 'Syntax or /app-ads.txt cross-check warning detected.',
          200
        );
      }
    } catch {
      setCredError('Unable to reach credential verification service.');
    } finally {
      setVerifyingCreds(false);
    }
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setCsvError(null);
    try {
      const res = await fetch(
        `/api/admob/sample-preview?publisherId=${encodeURIComponent(publisherId)}`
      );
      const data: RevenueSnapshot = await res.json();
      await onSaveSnapshot(data);
    } catch {
      setCsvError('Failed to load sample report dataset.');
    } finally {
      setLoadingSample(false);
    }
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    try {
      const csvText = await file.text();
      const res = await fetch('/api/admob/parse-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, publisherId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCsvError(data.error || 'Invalid AdMob CSV format.');
        return;
      }
      await onSaveSnapshot(data);
    } catch {
      setCsvError('Failed to parse CSV file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportCsv = () => {
    if (!snapshot || snapshot.dailyMetrics.length === 0) return;
    const header = 'Date,Estimated earnings (USD),Impressions,Ad requests,Matched requests,Match rate (%),Observed eCPM (USD),Clicks';
    const rows = snapshot.dailyMetrics.map(
      (d) =>
        `${d.date},${d.earnings.toFixed(2)},${d.impressions},${d.requests},${d.matchedRequests},${d.matchRate.toFixed(2)},${d.ecpm.toFixed(2)},${d.clicks}`
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admob-revenue-${publisherId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const windowedDaily = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.dailyMetrics.slice(-daysWindow);
  }, [snapshot, daysWindow]);

  const summaryKpis = useMemo(() => {
    if (windowedDaily.length === 0) {
      return { earnings: 0, impressions: 0, ecpm: 0, matchRate: 0 };
    }
    const earnings = windowedDaily.reduce((s, d) => s + d.earnings, 0);
    const impressions = windowedDaily.reduce((s, d) => s + d.impressions, 0);
    const requests = windowedDaily.reduce((s, d) => s + d.requests, 0);
    const matched = windowedDaily.reduce((s, d) => s + d.matchedRequests, 0);
    const ecpm = impressions > 0 ? (earnings / impressions) * 1000 : 0;
    const matchRate = requests > 0 ? (matched / requests) * 100 : 0;
    return { earnings, impressions, ecpm, matchRate };
  }, [windowedDaily]);

  return (
    <div className="space-y-8">
      {/* Secure MFA Session Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              MFA-Verified Publisher Session
            </div>
            <div className="text-xs text-slate-500">
              {user.email} · RFC 6238 TOTP Active · Publisher{' '}
              <span className="font-mono text-slate-800">{publisherId}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void onResetMfa()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Re-enroll MFA</span>
          </button>
          <button
            type="button"
            onClick={onLockConsole}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock Session</span>
          </button>
        </div>
      </div>

      {/* AdMob Credential Verification Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">
            AdMob Credential & Live API Verification
          </h3>
          <p className="text-sm text-slate-600">
            Validate your Publisher ID, App ID, Ad Unit ID, and optional Google AdMob OAuth 2.0 Bearer Token against{' '}
            <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">
              admob.googleapis.com/v1
            </code>{' '}
            and your hosted{' '}
            <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">
              /app-ads.txt
            </code>.
          </p>
        </div>

        <form onSubmit={handleVerifyCredentials} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Publisher ID</label>
              <input
                type="text"
                required
                value={publisherId}
                onChange={(e) => setPublisherId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Google TAG ID</label>
              <input
                type="text"
                required
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">AdMob App ID (Optional)</label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="ca-app-pub-2596010858935461~..."
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Ad Unit ID (Optional)</label>
              <input
                type="text"
                value={adUnitId}
                onChange={(e) => setAdUnitId(e.target.value)}
                placeholder="ca-app-pub-2596010858935461/..."
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1 w-full space-y-1">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                <span>Google AdMob OAuth 2.0 Access Token (Optional — for live AdMob API account & revenue sync)</span>
              </label>
              <input
                type="password"
                value={oauthToken}
                onChange={(e) => setOauthToken(e.target.value)}
                placeholder="ya29.a0... (scopes: admob.readonly, admob.report)"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <button
              type="submit"
              disabled={verifyingCreds}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${verifyingCreds ? 'animate-spin' : ''}`} />
              <span>{verifyingCreds ? 'Verifying...' : 'Verify Credentials'}</span>
            </button>
          </div>
        </form>

        {credError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {credError}
          </p>
        )}

        {credResult && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
            {([
              ['Publisher ID Syntax', credResult.checks.publisherIdFormat],
              ['Google TAG ID', credResult.checks.tagIdFormat],
              ['App ID Syntax', credResult.checks.appIdFormat],
              ['Ad Unit Syntax', credResult.checks.adUnitFormat],
              ['ID Ownership Match', credResult.checks.publisherConsistency],
              ['Hosted /app-ads.txt', credResult.checks.appAdsHostedMatch],
            ] as const).map(([label, ok]) => (
              <div
                key={label}
                className={`p-3 rounded-lg border text-xs ${
                  ok
                    ? 'bg-green-50/70 border-green-200 text-green-900'
                    : 'bg-red-50/70 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  {ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-700 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                  )}
                  <span className="truncate">{label}</span>
                </div>
                <div className="font-mono text-[11px] mt-1">
                  {ok ? 'Verified' : 'Check Required'}
                </div>
              </div>
            ))}
          </div>
        )}

        {credResult?.liveApi.attempted && (
          <div
            className={`p-4 rounded-lg border text-xs ${
              credResult.liveApi.verified
                ? 'bg-teal-50 border-teal-200 text-teal-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            {credResult.liveApi.verified ? (
              <div className="space-y-1">
                <div className="font-semibold">
                  Live AdMob API Connected: {credResult.liveApi.accountName}
                </div>
                <div>
                  Currency: {credResult.liveApi.currencyCode} · Timezone:{' '}
                  {credResult.liveApi.reportingTimeZone} · Registered Apps:{' '}
                  {credResult.liveApi.appsCount ?? 0}
                </div>
              </div>
            ) : (
              <div>
                <strong>AdMob API Response (HTTP {credResult.liveApi.httpStatus || 0}):</strong>{' '}
                {credResult.liveApi.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Revenue Analytics Header & Source Controls */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">
              Revenue Analytics & Mediation Telemetry
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {snapshot
                ? snapshot.source === 'admob_api'
                  ? `Data Source: Live Google AdMob API (${snapshot.publisherId})`
                  : snapshot.source === 'csv_import'
                  ? `Data Source: Imported AdMob CSV Report (${snapshot.publisherId})`
                  : `Data Source: Sample Preview Report Dataset (connect OAuth token or import CSV for your live earnings)`
                : 'Connect a live AdMob OAuth token, upload an AdMob CSV report, or load the sample preview dataset.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {([7, 14, 30] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDaysWindow(days)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    daysWindow === days
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {days}D
                </button>
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload AdMob CSV</span>
            </button>

            <button
              type="button"
              onClick={handleLoadSample}
              disabled={loadingSample}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{loadingSample ? 'Loading...' : 'Load Sample Preview'}</span>
            </button>

            {snapshot && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-medium text-white transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            )}
          </div>
        </div>

        {csvError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {csvError}
          </p>
        )}

        {!snapshot ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <BarChart3 className="w-8 h-8 text-slate-400 mx-auto" />
            <h4 className="text-base font-semibold text-slate-900">
              No revenue report loaded yet
            </h4>
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Verify your credentials with an AdMob OAuth access token above, upload an exported AdMob CSV report, or load the sample preview dataset to explore the interactive analytics charts.
            </p>
            <div className="pt-2 flex flex-wrap justify-center gap-2.5">
              <button
                type="button"
                onClick={handleLoadSample}
                disabled={loadingSample}
                className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors"
              >
                Load Sample Preview Charts
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition-colors"
              >
                Upload AdMob CSV
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 4-Column KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs text-slate-500">
                  Estimated Earnings ({daysWindow}D)
                </div>
                <div className="text-2xl font-mono font-semibold text-slate-900 mt-1.5 tabular-nums">
                  {formatCurrency(summaryKpis.earnings, snapshot.currency)}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs text-slate-500">Observed eCPM</div>
                <div className="text-2xl font-mono font-semibold text-slate-900 mt-1.5 tabular-nums">
                  {formatCurrency(summaryKpis.ecpm, snapshot.currency)}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs text-slate-500">Total Impressions</div>
                <div className="text-2xl font-mono font-semibold text-slate-900 mt-1.5 tabular-nums">
                  {summaryKpis.impressions.toLocaleString()}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs text-slate-500">Match Rate</div>
                <div className="text-2xl font-mono font-semibold text-teal-700 mt-1.5 tabular-nums">
                  {summaryKpis.matchRate.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Primary Time Series Chart */}
            <RevenueTimeSeriesChart data={windowedDaily} currency={snapshot.currency} />

            {/* Secondary App & Format Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AppRevenueBarChart apps={snapshot.appBreakdowns} currency={snapshot.currency} />
              <AdFormatDonutChart formats={snapshot.formatBreakdowns} currency={snapshot.currency} />
            </div>

            {/* Geo Breakdown & Audit Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">
                    Top Geographies
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Regional earnings, eCPM, and fill rate distribution
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 font-medium">Country</th>
                        <th className="py-2 font-medium text-right">Match Rate</th>
                        <th className="py-2 font-medium text-right">eCPM</th>
                        <th className="py-2 font-medium text-right">Earnings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {snapshot.geoBreakdowns.map((geo) => (
                        <tr key={geo.code + geo.country} className="hover:bg-slate-50">
                          <td className="py-2.5 font-medium text-slate-900">{geo.country}</td>
                          <td className="py-2.5 text-right font-mono text-slate-700 tabular-nums">
                            {geo.matchRate.toFixed(1)}%
                          </td>
                          <td className="py-2.5 text-right font-mono text-slate-700 tabular-nums">
                            {formatCurrency(geo.ecpm, snapshot.currency)}
                          </td>
                          <td className="py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(geo.earnings, snapshot.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">
                    Credential & Crawl Audit History
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Recent verification checks recorded to your publisher ledger
                  </p>
                </div>
                {verificationLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    Run a credential or app-ads.txt verification check to record audit entries.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="py-2 font-medium">Check</th>
                          <th className="py-2 font-medium">Target</th>
                          <th className="py-2 font-medium">Summary</th>
                          <th className="py-2 font-medium text-right">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {verificationLogs.slice(0, 8).map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="py-2.5 font-mono text-slate-700 whitespace-nowrap">
                              {log.checkType}
                            </td>
                            <td className="py-2.5 font-mono text-slate-900 truncate max-w-[120px]">
                              {log.target}
                            </td>
                            <td className="py-2.5 text-slate-600 truncate max-w-[190px]" title={log.summary}>
                              {log.summary}
                            </td>
                            <td className="py-2.5 text-right font-medium whitespace-nowrap">
                              <span
                                className={
                                  log.status === 'verified'
                                    ? 'text-green-700'
                                    : log.status === 'warning'
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                                }
                              >
                                {log.status === 'verified'
                                  ? 'Verified'
                                  : log.status === 'warning'
                                  ? 'Warning'
                                  : 'Failed'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
