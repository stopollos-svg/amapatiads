import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Globe,
  RefreshCw,
  AlertTriangle,
  FileText,
  Save,
} from 'lucide-react';
import { AppAdsVerifyResult } from '../types';

const REQUIRED_SNIPPET = 'google.com, pub-2596010858935461, DIRECT, f08c47fec0942fa0';

interface AppAdsSectionProps {
  publisherId: string;
  tagId: string;
  customLines: string[];
  canEdit: boolean;
  onSaveLines?: (lines: string[]) => Promise<void>;
  onLogVerification?: (result: AppAdsVerifyResult) => Promise<void>;
}

export function AppAdsSection({
  publisherId,
  tagId,
  customLines,
  canEdit,
  onSaveLines,
  onLogVerification,
}: AppAdsSectionProps) {
  const [copied, setCopied] = useState(false);
  const [domainInput, setDomainInput] = useState('self');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AppAdsVerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [editorText, setEditorText] = useState(customLines.join('\n'));
  const [savingLines, setSavingLines] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setEditorText(customLines.join('\n'));
  }, [customLines]);

  const runVerification = async (targetDomain: string) => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/verify-app-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: targetDomain,
          publisherId,
          tagId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error || 'Verification request failed.');
      } else {
        setVerifyResult(data);
        if (onLogVerification) {
          await onLogVerification(data);
        }
      }
    } catch {
      setVerifyError('Unable to connect to the verification service.');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    void runVerification('self');
  }, []);

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(REQUIRED_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleSaveEditor = async () => {
    const lines = editorText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setSaveMessage('At least one valid IAB line is required.');
      return;
    }
    setSavingLines(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/app-ads-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSaveMessage(err.error || 'Failed to update /app-ads.txt.');
        return;
      }
      if (onSaveLines) {
        await onSaveLines(lines);
      }
      setSaveMessage('Published to /app-ads.txt and saved.');
      await runVerification('self');
    } catch {
      setSaveMessage('Failed to update /app-ads.txt.');
    } finally {
      setSavingLines(false);
    }
  };

  return (
    <section id="app-ads-txt" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-teal-700 tracking-wide">
            IAB Tech Lab Authorized Sellers
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
            How to set up app-ads.txt for your apps
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            This developer website hosts your live{' '}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-900">
              /app-ads.txt
            </code>{' '}
            file directly at the root URL so Google AdMob crawlers can authorize ad inventory across Google Play and the App Store.
          </p>
        </div>
        <a
          href="/app-ads.txt"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <FileText className="w-3.5 h-3.5 text-teal-700" />
          <span>Open Live /app-ads.txt</span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: 5-step AdMob Guide & Snippet */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-slate-900">
              Required AdMob Authorization Snippet
            </h3>
            <div className="flex items-center justify-between gap-3 bg-slate-950 text-slate-100 rounded-lg px-4 py-3 border border-slate-800">
              <code className="text-xs font-mono overflow-x-auto whitespace-nowrap">
                {REQUIRED_SNIPPET}
              </code>
              <button
                type="button"
                onClick={handleCopySnippet}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <ol className="space-y-3.5 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="font-mono text-xs font-semibold text-teal-700 pt-0.5 shrink-0">
                01.
              </span>
              <span>
                Create an <strong className="font-medium text-slate-900">app-ads.txt</strong> file using the specification provided by IAB Tech Lab.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs font-semibold text-teal-700 pt-0.5 shrink-0">
                02.
              </span>
              <span>
                Copy and paste <code className="font-mono text-xs text-slate-900 bg-slate-100 px-1 py-0.5 rounded">{REQUIRED_SNIPPET}</code> into your file.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs font-semibold text-teal-700 pt-0.5 shrink-0">
                03.
              </span>
              <span>
                Publish <strong className="font-medium text-slate-900">app-ads.txt</strong> at the root of your developer website (for example, <span className="font-mono text-xs text-slate-800">sampledomain.com/app-ads.txt</span>) matching the exact domain listed on Google Play or the App Store.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs font-semibold text-teal-700 pt-0.5 shrink-0">
                04.
              </span>
              <span>
                Wait at least <strong className="font-medium text-slate-900">24 hours</strong> for AdMob crawlers to fetch and verify your hosted file.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs font-semibold text-teal-700 pt-0.5 shrink-0">
                05.
              </span>
              <span>
                Return to AdMob to inspect your <strong className="font-medium text-slate-900">app-ads.txt status</strong> for verification updates or crawl error notifications.
              </span>
            </li>
          </ol>

          {canEdit && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="app-ads-editor" className="text-xs font-semibold text-slate-900">
                  Manage Hosted /app-ads.txt Entries
                </label>
                <span className="text-xs text-slate-500">
                  One IAB line per row
                </span>
              </div>
              <textarea
                id="app-ads-editor"
                rows={4}
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600">{saveMessage || ''}</span>
                <button
                  type="button"
                  onClick={handleSaveEditor}
                  disabled={savingLines}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingLines ? 'Publishing...' : 'Publish to /app-ads.txt'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Domain Crawler & Syntax Verifier */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">
              Live app-ads.txt Crawler & Verifier
            </h3>
            <p className="text-xs text-slate-500">
              Test this website&apos;s root file or enter any external developer domain to verify HTTP status and IAB Tech Lab syntax.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runVerification(domainInput);
            }}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <div className="relative flex-1">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="self or sampledomain.com"
                aria-label="Developer domain to verify"
                className="w-full pl-9 pr-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <button
              type="submit"
              disabled={verifying}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
              <span>{verifying ? 'Crawling...' : 'Verify Domain'}</span>
            </button>
          </form>

          {verifyError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{verifyError}</span>
            </div>
          )}

          {verifyResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {verifyResult.exactSnippetMatch ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-green-800">
                        Verified Authorized AdMob Seller
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-amber-800">
                        {verifyResult.fetchError
                          ? 'Domain Unreachable'
                          : 'Snippet Not Found or Mismatch'}
                      </span>
                    </>
                  )}
                </div>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  HTTP {verifyResult.httpStatus} · {verifyResult.latencyMs}ms
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500">Target Endpoint</div>
                  <div className="font-mono text-slate-900 truncate mt-1" title={verifyResult.targetUrl}>
                    {verifyResult.isSelfHosted ? '/app-ads.txt (This Site)' : verifyResult.targetUrl}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500">Valid IAB Lines</div>
                  <div className="font-mono font-semibold text-slate-900 mt-1 tabular-nums">
                    {verifyResult.validLines} / {verifyResult.totalLines}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500">Publisher Match</div>
                  <div className="font-mono font-semibold text-slate-900 mt-1">
                    {verifyResult.exactSnippetMatch ? 'Exact Match' : verifyResult.googleAdMobMatch ? 'Partial Match' : 'Missing'}
                  </div>
                </div>
              </div>

              {verifyResult.fetchError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  Crawl Notice: {verifyResult.fetchError}
                </p>
              )}

              {verifyResult.parsedRecords.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 font-medium">Exchange</th>
                        <th className="py-2 px-3 font-medium">Publisher ID</th>
                        <th className="py-2 px-3 font-medium">Relation</th>
                        <th className="py-2 px-3 font-medium">TAG ID</th>
                        <th className="py-2 px-3 font-medium text-right">Syntax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {verifyResult.parsedRecords.slice(0, 8).map((rec) => (
                        <tr key={rec.lineNumber} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-900">{rec.domain || '—'}</td>
                          <td className="py-2 px-3 text-slate-700">{rec.publisherId || '—'}</td>
                          <td className="py-2 px-3 text-slate-700">{rec.relationship || '—'}</td>
                          <td className="py-2 px-3 text-slate-500">{rec.certAuthorityId || '—'}</td>
                          <td className="py-2 px-3 text-right">
                            {rec.valid ? (
                              <span className="text-green-700 font-sans font-medium">Valid</span>
                            ) : (
                              <span className="text-red-700 font-sans font-medium" title={rec.error}>
                                Error
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
