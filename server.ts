import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const DEFAULT_APP_ADS_LINES = [
  'google.com, pub-2596010858935461, DIRECT, f08c47fec0942fa0',
];

const APP_ADS_STATE_PATH = path.resolve(__dirname, '.app-ads-state.json');

function loadAppAdsLines(): string[] {
  try {
    if (fs.existsSync(APP_ADS_STATE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(APP_ADS_STATE_PATH, 'utf-8'));
      if (Array.isArray(raw?.lines) && raw.lines.length > 0) {
        return raw.lines.filter((line: unknown): line is string => typeof line === 'string' && line.trim().length > 0);
      }
    }
  } catch {
    // Fall back to default snippet
  }
  return [...DEFAULT_APP_ADS_LINES];
}

function saveAppAdsLines(lines: string[]): void {
  try {
    fs.writeFileSync(
      APP_ADS_STATE_PATH,
      JSON.stringify({ lines, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );
  } catch {
    // Ignore read-only filesystem errors in ephemeral containers
  }
}

let activeAppAdsLines: string[] = loadAppAdsLines();

interface ParsedAppAdsRecord {
  lineNumber: number;
  raw: string;
  valid: boolean;
  domain?: string;
  publisherId?: string;
  relationship?: string;
  certAuthorityId?: string;
  error?: string;
}

function parseAppAdsContent(rawText: string, expectedPubId: string, expectedTagId: string) {
  const lines = rawText.split(/\r?\n/);
  const parsedRecords: ParsedAppAdsRecord[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let googleAdMobMatch = false;
  let exactSnippetMatch = false;

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const cleanLine = trimmed.split('#')[0].trim();
    const parts = cleanLine.split(',').map((p) => p.trim());
    if (parts.length < 3 || parts.length > 4) {
      invalidCount += 1;
      parsedRecords.push({
        lineNumber: idx + 1,
        raw: rawLine,
        valid: false,
        error: 'Expected 3 or 4 comma-separated fields per IAB Tech Lab spec.',
      });
      return;
    }

    const [domain, pubId, relationship, certId] = parts;
    const relUpper = relationship.toUpperCase();
    const isRelValid = relUpper === 'DIRECT' || relUpper === 'RESELLER';
    const isDomainValid = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);

    if (!isDomainValid || !pubId || !isRelValid) {
      invalidCount += 1;
      parsedRecords.push({
        lineNumber: idx + 1,
        raw: rawLine,
        valid: false,
        domain,
        publisherId: pubId,
        relationship,
        certAuthorityId: certId,
        error: !isDomainValid
          ? 'Invalid ad system domain format.'
          : !isRelValid
          ? 'Relationship must be DIRECT or RESELLER.'
          : 'Missing publisher account ID.',
      });
      return;
    }

    validCount += 1;
    if (domain.toLowerCase() === 'google.com' && pubId === expectedPubId) {
      googleAdMobMatch = true;
      if (relUpper === 'DIRECT' && (!expectedTagId || certId === expectedTagId)) {
        exactSnippetMatch = true;
      }
    }

    parsedRecords.push({
      lineNumber: idx + 1,
      raw: rawLine,
      valid: true,
      domain: domain.toLowerCase(),
      publisherId: pubId,
      relationship: relUpper,
      certAuthorityId: certId || undefined,
    });
  });

  return {
    totalLines: parsedRecords.length,
    validLines: validCount,
    invalidLines: invalidCount,
    googleAdMobMatch,
    exactSnippetMatch,
    parsedRecords,
  };
}

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    /^10\./.test(lower) ||
    /^192\.168\./.test(lower) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower) ||
    /^169\.254\./.test(lower)
  ) {
    return true;
  }
  return false;
}

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

function generateBackupCodes(count = 6): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const partA = crypto.randomBytes(2).toString('hex').toUpperCase();
    const partB = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${partA}-${partB}`;
    plain.push(code);
    hashes.push(hashBackupCode(code));
  }
  return { plain, hashes };
}

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function generatePreviewSnapshot(publisherId: string) {
  const today = new Date();
  const dailyMetrics = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const wave = Math.sin(i * 0.45) * 0.14 + Math.cos(i * 0.22) * 0.08;
    const weekendBoost = d.getDay() === 0 || d.getDay() === 6 ? 1.12 : 1.0;
    const requests = Math.round((142000 + i * 950) * (1 + wave * 0.5) * weekendBoost);
    const matchRate = Number((94.2 + Math.sin(i * 0.3) * 1.4).toFixed(2));
    const matchedRequests = Math.round(requests * (matchRate / 100));
    const impressions = Math.round(matchedRequests * 0.86);
    const ecpm = Number((4.85 + Math.cos(i * 0.35) * 0.42 + (weekendBoost > 1 ? 0.18 : 0)).toFixed(2));
    const earnings = Number(((impressions / 1000) * ecpm).toFixed(2));
    const clicks = Math.round(impressions * (0.017 + Math.sin(i * 0.5) * 0.002));
    dailyMetrics.push({
      date: formatDateISO(d),
      earnings,
      impressions,
      requests,
      matchedRequests,
      matchRate,
      ecpm,
      clicks,
    });
  }

  const totalEarnings = dailyMetrics.reduce((acc, r) => acc + r.earnings, 0);

  const appBreakdowns = [
    {
      appName: 'ChronoPulse Focus',
      platform: 'Android',
      admobAppId: `ca-app-${publisherId}~4189021140`,
      earnings: Number((totalEarnings * 0.38).toFixed(2)),
      impressions: Math.round(dailyMetrics.reduce((a, r) => a + r.impressions, 0) * 0.36),
      ecpm: 5.24,
      matchRate: 96.1,
    },
    {
      appName: 'LedgerGrid Notes',
      platform: 'iOS',
      admobAppId: `ca-app-${publisherId}~7720193842`,
      earnings: Number((totalEarnings * 0.29).toFixed(2)),
      impressions: Math.round(dailyMetrics.reduce((a, r) => a + r.impressions, 0) * 0.24),
      ecpm: 6.18,
      matchRate: 94.8,
    },
    {
      appName: 'SkyCompass Weather',
      platform: 'Android',
      admobAppId: `ca-app-${publisherId}~6094128831`,
      earnings: Number((totalEarnings * 0.21).toFixed(2)),
      impressions: Math.round(dailyMetrics.reduce((a, r) => a + r.impressions, 0) * 0.25),
      ecpm: 4.12,
      matchRate: 93.4,
    },
    {
      appName: 'MetricPulse Utility',
      platform: 'iOS',
      admobAppId: `ca-app-${publisherId}~8841205519`,
      earnings: Number((totalEarnings * 0.12).toFixed(2)),
      impressions: Math.round(dailyMetrics.reduce((a, r) => a + r.impressions, 0) * 0.15),
      ecpm: 3.95,
      matchRate: 91.9,
    },
  ];

  const formatBreakdowns = [
    { format: 'Rewarded', earnings: Number((totalEarnings * 0.44).toFixed(2)), share: 44.0, ecpm: 11.45, impressions: 695000 },
    { format: 'Interstitial', earnings: Number((totalEarnings * 0.31).toFixed(2)), share: 31.0, ecpm: 6.82, impressions: 822000 },
    { format: 'Banner', earnings: Number((totalEarnings * 0.16).toFixed(2)), share: 16.0, ecpm: 1.48, impressions: 1954000 },
    { format: 'App Open', earnings: Number((totalEarnings * 0.09).toFixed(2)), share: 9.0, ecpm: 4.95, impressions: 328000 },
  ];

  const geoBreakdowns = [
    { country: 'United States', code: 'US', earnings: Number((totalEarnings * 0.41).toFixed(2)), ecpm: 9.84, matchRate: 96.4 },
    { country: 'United Kingdom', code: 'GB', earnings: Number((totalEarnings * 0.15).toFixed(2)), ecpm: 7.21, matchRate: 95.1 },
    { country: 'Germany', code: 'DE', earnings: Number((totalEarnings * 0.13).toFixed(2)), ecpm: 6.45, matchRate: 94.7 },
    { country: 'Japan', code: 'JP', earnings: Number((totalEarnings * 0.11).toFixed(2)), ecpm: 7.92, matchRate: 93.8 },
    { country: 'Canada', code: 'CA', earnings: Number((totalEarnings * 0.09).toFixed(2)), ecpm: 6.88, matchRate: 94.2 },
    { country: 'Rest of World', code: 'ROW', earnings: Number((totalEarnings * 0.11).toFixed(2)), ecpm: 2.14, matchRate: 91.5 },
  ];

  return {
    source: 'sample_preview',
    publisherId,
    currency: 'USD',
    dailyMetrics,
    appBreakdowns,
    formatBreakdowns,
    geoBreakdowns,
  };
}

function parseAdmobDate(dateVal: string): string {
  const clean = dateVal.trim();
  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return clean;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Serve root /app-ads.txt strictly per IAB Tech Lab spec
  app.get('/app-ads.txt', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send(activeAppAdsLines.join('\n') + '\n');
  });

  // Serve Google Site Verification file permanently at root
  app.get('/google94cdc1e9ee661eed.html', (_req: Request, res: Response) => {
    const attachmentPath = path.resolve(
      __dirname,
      'public/assets/aistudio/google94cdc1e9ee661eed_ee340d0c.html'
    );
    const content = fs.existsSync(attachmentPath)
      ? fs.readFileSync(attachmentPath, 'utf-8')
      : 'google-site-verification: google94cdc1e9ee661eed.html\n';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send(content);
  });

  // Retrieve or update active /app-ads.txt configuration
  app.get('/api/app-ads-config', (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    res.json({
      lines: activeAppAdsLines,
      rawText: activeAppAdsLines.join('\n'),
      publicUrl: `${protocol}://${host}/app-ads.txt`,
    });
  });

  app.post('/api/app-ads-config', (req: Request, res: Response) => {
    const { lines } = req.body as { lines?: unknown };
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 25) {
      res.status(400).json({ error: 'Provide between 1 and 25 app-ads.txt lines.' });
      return;
    }
    const sanitized = lines
      .map((l) => (typeof l === 'string' ? l.trim() : ''))
      .filter((l) => l.length > 0 && l.length <= 200);
    if (sanitized.length === 0) {
      res.status(400).json({ error: 'At least one non-empty app-ads.txt line is required.' });
      return;
    }
    activeAppAdsLines = sanitized;
    saveAppAdsLines(activeAppAdsLines);
    res.json({ ok: true, lines: activeAppAdsLines, rawText: activeAppAdsLines.join('\n') });
  });

  // Real-time server-side app-ads.txt domain crawler & validator
  app.post('/api/verify-app-ads', async (req: Request, res: Response) => {
    const {
      domain = 'self',
      publisherId = 'pub-2596010858935461',
      tagId = 'f08c47fec0942fa0',
    } = req.body as { domain?: string; publisherId?: string; tagId?: string };

    const cleanTarget = String(domain).trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    const isSelf = !cleanTarget || cleanTarget.toLowerCase() === 'self' || cleanTarget.toLowerCase() === requestHost.toLowerCase();

    const startTime = Date.now();

    if (isSelf) {
      const rawBody = activeAppAdsLines.join('\n') + '\n';
      const parsed = parseAppAdsContent(rawBody, publisherId, tagId);
      res.json({
        targetUrl: `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}/app-ads.txt`,
        isSelfHosted: true,
        httpStatus: 200,
        contentType: 'text/plain; charset=utf-8',
        latencyMs: Date.now() - startTime,
        rawBody,
        ...parsed,
      });
      return;
    }

    const hostnameOnly = cleanTarget.split(':')[0];
    if (isBlockedHost(hostnameOnly) || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(hostnameOnly)) {
      res.status(400).json({
        error: 'Please enter a valid public developer domain (for example, sampledomain.com).',
      });
      return;
    }

    const targetUrl = `https://${hostnameOnly}/app-ads.txt`;
    try {
      let response = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'AdVerify-Studio-Crawler/1.0 (+https://iabtechlab.com/app-ads-txt)',
          Accept: 'text/plain, */*',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok && response.status >= 500) {
        response = await fetch(`http://${hostnameOnly}/app-ads.txt`, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
      }

      const rawBody = await response.text();
      const contentType = response.headers.get('content-type') || 'unknown';
      const parsed = parseAppAdsContent(rawBody.slice(0, 65536), publisherId, tagId);

      res.json({
        targetUrl: response.url || targetUrl,
        isSelfHosted: false,
        httpStatus: response.status,
        contentType,
        latencyMs: Date.now() - startTime,
        rawBody: rawBody.slice(0, 8192),
        ...parsed,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to reach domain.';
      res.json({
        targetUrl,
        isSelfHosted: false,
        httpStatus: 0,
        contentType: 'unreachable',
        latencyMs: Date.now() - startTime,
        rawBody: '',
        totalLines: 0,
        validLines: 0,
        invalidLines: 0,
        googleAdMobMatch: false,
        exactSnippetMatch: false,
        parsedRecords: [],
        fetchError: message,
      });
    }
  });

  // RFC 6238 TOTP Multi-Factor Authentication Enrollment Init
  app.post('/api/mfa/enroll-init', async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string };
    const accountLabel = (email || 'publisher@adverify.studio').trim();
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'AdVerify Studio',
      label: accountLabel,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUri = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, {
      margin: 2,
      width: 220,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
    const backup = generateBackupCodes(6);

    res.json({
      secretBase32: secret.base32,
      otpauthUri,
      qrCodeDataUrl,
      backupCodes: backup.plain,
      backupCodeHashes: backup.hashes,
      remainingSeconds: 30 - (Math.floor(Date.now() / 1000) % 30),
    });
  });

  // RFC 6238 TOTP Verification & Backup Code Verification
  app.post('/api/mfa/verify', (req: Request, res: Response) => {
    const { secretBase32, code, backupCodeHashes = [] } = req.body as {
      secretBase32?: string;
      code?: string;
      backupCodeHashes?: string[];
    };

    if (!secretBase32 || !code) {
      res.status(400).json({ valid: false, error: 'Secret and verification code are required.' });
      return;
    }

    const cleanCode = String(code).trim();
    const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);

    // Check 6-digit TOTP first
    if (/^\d{6}$/.test(cleanCode)) {
      const totp = new OTPAuth.TOTP({
        issuer: 'AdVerify Studio',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secretBase32),
      });
      const delta = totp.validate({ token: cleanCode, window: 1 });
      if (delta !== null) {
        res.json({ valid: true, method: 'totp', remainingSeconds });
        return;
      }
    }

    // Check single-use backup code
    if (Array.isArray(backupCodeHashes) && backupCodeHashes.length > 0) {
      const candidateHash = hashBackupCode(cleanCode);
      const matchIndex = backupCodeHashes.indexOf(candidateHash);
      if (matchIndex !== -1) {
        res.json({
          valid: true,
          method: 'backup_code',
          usedBackupIndex: matchIndex,
          remainingSeconds,
        });
        return;
      }
    }

    res.status(401).json({
      valid: false,
      error: 'Invalid 6-digit authenticator code or recovery code.',
      remainingSeconds,
    });
  });

  app.get('/api/mfa/time-window', (_req: Request, res: Response) => {
    res.json({
      remainingSeconds: 30 - (Math.floor(Date.now() / 1000) % 30),
      period: 30,
    });
  });

  // Real AdMob Credential Validation + Optional Live Google AdMob API Verification
  app.post('/api/admob/verify-credentials', async (req: Request, res: Response) => {
    const {
      publisherId = 'pub-2596010858935461',
      tagId = 'f08c47fec0942fa0',
      appId = '',
      adUnitId = '',
      oauthAccessToken = '',
    } = req.body as {
      publisherId?: string;
      tagId?: string;
      appId?: string;
      adUnitId?: string;
      oauthAccessToken?: string;
    };

    const pubValid = /^pub-\d{16}$/.test(publisherId.trim());
    const tagValid = /^[a-f0-9]{16}$/i.test(tagId.trim());
    const appIdValid = !appId.trim() || /^ca-app-pub-\d{16}~\d{10}$/.test(appId.trim());
    const adUnitValid = !adUnitId.trim() || /^ca-app-pub-\d{16}\/\d{10}$/.test(adUnitId.trim());

    const appPubMatch = !appId.trim() || appId.trim().includes(publisherId.trim());
    const unitPubMatch = !adUnitId.trim() || adUnitId.trim().includes(publisherId.trim());

    const appAdsText = activeAppAdsLines.join('\n');
    const appAdsParsed = parseAppAdsContent(appAdsText, publisherId.trim(), tagId.trim());

    let liveApiResult: {
      attempted: boolean;
      verified: boolean;
      httpStatus?: number;
      accountName?: string;
      currencyCode?: string;
      reportingTimeZone?: string;
      appsCount?: number;
      admobApps?: Array<{ appId: string; platform: string; displayName: string; linkedStoreId?: string }>;
      reportSnapshot?: ReturnType<typeof generatePreviewSnapshot>;
      error?: string;
    } = {
      attempted: false,
      verified: false,
    };

    const cleanToken = oauthAccessToken.trim();
    if (cleanToken) {
      liveApiResult.attempted = true;
      try {
        const accountRes = await fetch(
          `https://admob.googleapis.com/v1/accounts/${encodeURIComponent(publisherId.trim())}`,
          {
            headers: { Authorization: `Bearer ${cleanToken}` },
            signal: AbortSignal.timeout(10000),
          }
        );

        liveApiResult.httpStatus = accountRes.status;

        if (!accountRes.ok) {
          const errJson = await accountRes.json().catch(() => ({}));
          liveApiResult.error =
            errJson?.error?.message || `AdMob API returned HTTP ${accountRes.status}. Verify OAuth token scopes (admob.readonly, admob.report).`;
        } else {
          const accountData = await accountRes.json();
          liveApiResult.verified = true;
          liveApiResult.accountName = accountData.name;
          liveApiResult.currencyCode = accountData.currencyCode || 'USD';
          liveApiResult.reportingTimeZone = accountData.reportingTimeZone || 'UTC';

          // Fetch registered apps from AdMob API
          const appsRes = await fetch(
            `https://admob.googleapis.com/v1/accounts/${encodeURIComponent(publisherId.trim())}/apps?pageSize=50`,
            {
              headers: { Authorization: `Bearer ${cleanToken}` },
              signal: AbortSignal.timeout(10000),
            }
          );
          if (appsRes.ok) {
            const appsJson = await appsRes.json();
            const list = Array.isArray(appsJson.apps) ? appsJson.apps : [];
            liveApiResult.appsCount = list.length;
            liveApiResult.admobApps = list.map((a: Record<string, unknown>) => ({
              appId: String(a.appId || ''),
              platform: String(a.platform || 'ANDROID'),
              displayName: String((a.manualAppInfo as Record<string, unknown>)?.displayName || a.linkedAppInfo || a.appId || 'Unnamed App'),
              linkedStoreId: (a.linkedAppInfo as Record<string, unknown>)?.appStoreId
                ? String((a.linkedAppInfo as Record<string, unknown>).appStoreId)
                : undefined,
            }));
          }

          // Fetch last 30 days network report
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(endDate.getDate() - 29);

          const reportRes = await fetch(
            `https://admob.googleapis.com/v1/accounts/${encodeURIComponent(publisherId.trim())}/networkReport:generate`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${cleanToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                reportSpec: {
                  dateRange: {
                    startDate: { year: startDate.getUTCFullYear(), month: startDate.getUTCMonth() + 1, day: startDate.getUTCDate() },
                    endDate: { year: endDate.getUTCFullYear(), month: endDate.getUTCMonth() + 1, day: endDate.getUTCDate() },
                  },
                  dimensions: ['DATE', 'APP', 'FORMAT', 'COUNTRY'],
                  metrics: ['ESTIMATED_EARNINGS', 'IMPRESSIONS', 'AD_REQUESTS', 'MATCHED_REQUESTS', 'CLICKS', 'IMPRESSION_RPM'],
                },
              }),
              signal: AbortSignal.timeout(12000),
            }
          );

          if (reportRes.ok) {
            const rowsJson = await reportRes.json();
            const rows = Array.isArray(rowsJson) ? rowsJson : [];
            const dailyMap = new Map<string, { earnings: number; impressions: number; requests: number; matchedRequests: number; clicks: number }>();
            const appMap = new Map<string, { appName: string; platform: string; admobAppId: string; earnings: number; impressions: number; requests: number; matchedRequests: number }>();
            const formatMap = new Map<string, { earnings: number; impressions: number }>();
            const geoMap = new Map<string, { earnings: number; impressions: number; requests: number; matchedRequests: number }>();

            for (const item of rows) {
              const row = item?.row;
              if (!row) continue;
              const dims = row.dimensionValues || {};
              const mets = row.metricValues || {};
              const dateIso = parseAdmobDate(String(dims.DATE?.value || ''));
              const appLabel = String(dims.APP?.displayLabel || dims.APP?.value || 'Unknown App');
              const appIdVal = String(dims.APP?.value || '');
              const formatLabel = String(dims.FORMAT?.value || 'BANNER');
              const countryCode = String(dims.COUNTRY?.value || 'US');

              const micros = Number(mets.ESTIMATED_EARNINGS?.microsValue || 0);
              const earnings = micros / 1_000_000;
              const impressions = Number(mets.IMPRESSIONS?.integerValue || 0);
              const requests = Number(mets.AD_REQUESTS?.integerValue || 0);
              const matchedRequests = Number(mets.MATCHED_REQUESTS?.integerValue || 0);
              const clicks = Number(mets.CLICKS?.integerValue || 0);

              if (dateIso) {
                const prev = dailyMap.get(dateIso) || { earnings: 0, impressions: 0, requests: 0, matchedRequests: 0, clicks: 0 };
                prev.earnings += earnings;
                prev.impressions += impressions;
                prev.requests += requests;
                prev.matchedRequests += matchedRequests;
                prev.clicks += clicks;
                dailyMap.set(dateIso, prev);
              }

              const prevApp = appMap.get(appIdVal || appLabel) || {
                appName: appLabel,
                platform: 'Mobile',
                admobAppId: appIdVal,
                earnings: 0,
                impressions: 0,
                requests: 0,
                matchedRequests: 0,
              };
              prevApp.earnings += earnings;
              prevApp.impressions += impressions;
              prevApp.requests += requests;
              prevApp.matchedRequests += matchedRequests;
              appMap.set(appIdVal || appLabel, prevApp);

              const prevFmt = formatMap.get(formatLabel) || { earnings: 0, impressions: 0 };
              prevFmt.earnings += earnings;
              prevFmt.impressions += impressions;
              formatMap.set(formatLabel, prevFmt);

              const prevGeo = geoMap.get(countryCode) || { earnings: 0, impressions: 0, requests: 0, matchedRequests: 0 };
              prevGeo.earnings += earnings;
              prevGeo.impressions += impressions;
              prevGeo.requests += requests;
              prevGeo.matchedRequests += matchedRequests;
              geoMap.set(countryCode, prevGeo);
            }

            const dailyMetrics = Array.from(dailyMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(-60)
              .map(([date, m]) => ({
                date,
                earnings: Number(m.earnings.toFixed(2)),
                impressions: m.impressions,
                requests: m.requests,
                matchedRequests: m.matchedRequests,
                matchRate: m.requests > 0 ? Number(((m.matchedRequests / m.requests) * 100).toFixed(2)) : 0,
                ecpm: m.impressions > 0 ? Number(((m.earnings / m.impressions) * 1000).toFixed(2)) : 0,
                clicks: m.clicks,
              }));

            const totalEarnings = dailyMetrics.reduce((s, d) => s + d.earnings, 0);

            liveApiResult.reportSnapshot = {
              source: 'admob_api',
              publisherId: publisherId.trim(),
              currency: liveApiResult.currencyCode || 'USD',
              dailyMetrics,
              appBreakdowns: Array.from(appMap.values())
                .sort((a, b) => b.earnings - a.earnings)
                .slice(0, 25)
                .map((a) => ({
                  appName: a.appName,
                  platform: a.platform,
                  admobAppId: a.admobAppId,
                  earnings: Number(a.earnings.toFixed(2)),
                  impressions: a.impressions,
                  ecpm: a.impressions > 0 ? Number(((a.earnings / a.impressions) * 1000).toFixed(2)) : 0,
                  matchRate: a.requests > 0 ? Number(((a.matchedRequests / a.requests) * 100).toFixed(1)) : 0,
                })),
              formatBreakdowns: Array.from(formatMap.entries())
                .sort((a, b) => b[1].earnings - a[1].earnings)
                .slice(0, 10)
                .map(([format, f]) => ({
                  format,
                  earnings: Number(f.earnings.toFixed(2)),
                  share: totalEarnings > 0 ? Number(((f.earnings / totalEarnings) * 100).toFixed(1)) : 0,
                  ecpm: f.impressions > 0 ? Number(((f.earnings / f.impressions) * 1000).toFixed(2)) : 0,
                  impressions: f.impressions,
                })),
              geoBreakdowns: Array.from(geoMap.entries())
                .sort((a, b) => b[1].earnings - a[1].earnings)
                .slice(0, 15)
                .map(([code, g]) => ({
                  country: code,
                  code,
                  earnings: Number(g.earnings.toFixed(2)),
                  ecpm: g.impressions > 0 ? Number(((g.earnings / g.impressions) * 1000).toFixed(2)) : 0,
                  matchRate: g.requests > 0 ? Number(((g.matchedRequests / g.requests) * 100).toFixed(1)) : 0,
                })),
            };
          }
        }
      } catch (err: unknown) {
        liveApiResult.error = err instanceof Error ? err.message : 'Failed to connect to AdMob API.';
      }
    }

    res.json({
      checks: {
        publisherIdFormat: pubValid,
        tagIdFormat: tagValid,
        appIdFormat: appIdValid,
        adUnitFormat: adUnitValid,
        publisherConsistency: appPubMatch && unitPubMatch,
        appAdsHostedMatch: appAdsParsed.exactSnippetMatch,
      },
      liveApi: liveApiResult,
    });
  });

  // Sample Preview Snapshot (explicitly labeled as sample preview CSV dataset)
  app.get('/api/admob/sample-preview', (req: Request, res: Response) => {
    const publisherId = String(req.query.publisherId || 'pub-2596010858935461');
    res.json(generatePreviewSnapshot(publisherId));
  });

  // Parse AdMob CSV Export
  app.post('/api/admob/parse-csv', (req: Request, res: Response) => {
    const { csvText, publisherId = 'pub-2596010858935461' } = req.body as {
      csvText?: string;
      publisherId?: string;
    };

    if (!csvText || typeof csvText !== 'string') {
      res.status(400).json({ error: 'CSV content is required.' });
      return;
    }

    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      res.status(400).json({ error: 'CSV must include a header row and at least one data row.' });
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const findIdx = (patterns: string[]) =>
      headers.findIndex((h) => patterns.some((p) => h.includes(p)));

    const dateIdx = findIdx(['date']);
    const appIdx = findIdx(['app']);
    const formatIdx = findIdx(['format', 'ad unit']);
    const countryIdx = findIdx(['country']);
    const earnIdx = findIdx(['earnings', 'revenue']);
    const impIdx = findIdx(['impressions']);
    const reqIdx = findIdx(['requests']);
    const matchIdx = findIdx(['matched']);
    const clicksIdx = findIdx(['clicks']);

    if (dateIdx === -1 || earnIdx === -1) {
      res.status(400).json({
        error: 'CSV header must contain Date and Estimated earnings columns.',
      });
      return;
    }

    const dailyMap = new Map<string, { earnings: number; impressions: number; requests: number; matchedRequests: number; clicks: number }>();
    const appMap = new Map<string, { earnings: number; impressions: number; requests: number; matchedRequests: number }>();
    const formatMap = new Map<string, { earnings: number; impressions: number }>();
    const geoMap = new Map<string, { earnings: number; impressions: number; requests: number; matchedRequests: number }>();

    for (let i = 1; i < lines.length; i += 1) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) continue;

      const dateVal = parseAdmobDate(cols[dateIdx] || '');
      const earnings = Number(String(cols[earnIdx] || '0').replace(/[^0-9.-]/g, '')) || 0;
      const impressions = impIdx !== -1 ? Number(String(cols[impIdx] || '0').replace(/[^0-9]/g, '')) || 0 : 0;
      const requests = reqIdx !== -1 ? Number(String(cols[reqIdx] || '0').replace(/[^0-9]/g, '')) || impressions : impressions;
      const matchedRequests = matchIdx !== -1 ? Number(String(cols[matchIdx] || '0').replace(/[^0-9]/g, '')) || impressions : impressions;
      const clicks = clicksIdx !== -1 ? Number(String(cols[clicksIdx] || '0').replace(/[^0-9]/g, '')) || 0 : 0;

      if (dateVal) {
        const prev = dailyMap.get(dateVal) || { earnings: 0, impressions: 0, requests: 0, matchedRequests: 0, clicks: 0 };
        prev.earnings += earnings;
        prev.impressions += impressions;
        prev.requests += requests;
        prev.matchedRequests += matchedRequests;
        prev.clicks += clicks;
        dailyMap.set(dateVal, prev);
      }

      const appName = appIdx !== -1 && cols[appIdx] ? cols[appIdx] : 'Primary App';
      const prevApp = appMap.get(appName) || { earnings: 0, impressions: 0, requests: 0, matchedRequests: 0 };
      prevApp.earnings += earnings;
      prevApp.impressions += impressions;
      prevApp.requests += requests;
      prevApp.matchedRequests += matchedRequests;
      appMap.set(appName, prevApp);

      const fmt = formatIdx !== -1 && cols[formatIdx] ? cols[formatIdx] : 'Banner';
      const prevFmt = formatMap.get(fmt) || { earnings: 0, impressions: 0 };
      prevFmt.earnings += earnings;
      prevFmt.impressions += impressions;
      formatMap.set(fmt, prevFmt);

      const country = countryIdx !== -1 && cols[countryIdx] ? cols[countryIdx] : 'Global';
      const prevGeo = geoMap.get(country) || { earnings: 0, impressions: 0, requests: 0, matchedRequests: 0 };
      prevGeo.earnings += earnings;
      prevGeo.impressions += impressions;
      prevGeo.requests += requests;
      prevGeo.matchedRequests += matchedRequests;
      geoMap.set(country, prevGeo);
    }

    const dailyMetrics = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-60)
      .map(([date, m]) => ({
        date,
        earnings: Number(m.earnings.toFixed(2)),
        impressions: m.impressions,
        requests: m.requests,
        matchedRequests: m.matchedRequests,
        matchRate: m.requests > 0 ? Number(((m.matchedRequests / m.requests) * 100).toFixed(2)) : 0,
        ecpm: m.impressions > 0 ? Number(((m.earnings / m.impressions) * 1000).toFixed(2)) : 0,
        clicks: m.clicks,
      }));

    const totalEarnings = dailyMetrics.reduce((s, d) => s + d.earnings, 0);

    res.json({
      source: 'csv_import',
      publisherId,
      currency: 'USD',
      dailyMetrics,
      appBreakdowns: Array.from(appMap.entries())
        .sort((a, b) => b[1].earnings - a[1].earnings)
        .slice(0, 25)
        .map(([appName, a]) => ({
          appName,
          platform: 'Mobile',
          admobAppId: `ca-app-${publisherId}~csv`,
          earnings: Number(a.earnings.toFixed(2)),
          impressions: a.impressions,
          ecpm: a.impressions > 0 ? Number(((a.earnings / a.impressions) * 1000).toFixed(2)) : 0,
          matchRate: a.requests > 0 ? Number(((a.matchedRequests / a.requests) * 100).toFixed(1)) : 0,
        })),
      formatBreakdowns: Array.from(formatMap.entries())
        .sort((a, b) => b[1].earnings - a[1].earnings)
        .slice(0, 10)
        .map(([format, f]) => ({
          format,
          earnings: Number(f.earnings.toFixed(2)),
          share: totalEarnings > 0 ? Number(((f.earnings / totalEarnings) * 100).toFixed(1)) : 0,
          ecpm: f.impressions > 0 ? Number(((f.earnings / f.impressions) * 1000).toFixed(2)) : 0,
          impressions: f.impressions,
        })),
      geoBreakdowns: Array.from(geoMap.entries())
        .sort((a, b) => b[1].earnings - a[1].earnings)
        .slice(0, 15)
        .map(([country, g]) => ({
          country,
          code: country.slice(0, 2).toUpperCase(),
          earnings: Number(g.earnings.toFixed(2)),
          ecpm: g.impressions > 0 ? Number(((g.earnings / g.impressions) * 1000).toFixed(2)) : 0,
          matchRate: g.requests > 0 ? Number(((g.matchedRequests / g.requests) * 100).toFixed(1)) : 0,
        })),
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AdVerify Studio server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
