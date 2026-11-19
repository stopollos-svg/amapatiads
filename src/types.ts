export type PlatformType = 'Android' | 'iOS';
export type AppAdsStatus = 'verified' | 'pending_crawl' | 'action_required';
export type AccentKey = 'emerald' | 'slate' | 'indigo' | 'amber';

export interface PublisherApp {
  id: string;
  ownerId: string;
  name: string;
  bundleId: string;
  platform: PlatformType;
  category: string;
  storeUrl: string;
  admobAppId: string;
  publisherId: string;
  appAdsStatus: AppAdsStatus;
  adUnitsCount: number;
  description: string;
  accentKey: AccentKey;
  visibility: 'public' | 'private';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublisherSettings {
  ownerId: string;
  publisherId: string;
  tagId: string;
  developerDomain: string;
  appAdsLines: string[];
  lastCrawlStatus: 'verified' | 'pending_crawl' | 'error';
  lastCrawlDomain: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MfaConfig {
  ownerId: string;
  enabled: boolean;
  totpSecret: string;
  backupCodeHashes: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VerificationLog {
  id: string;
  ownerId: string;
  checkType: 'app_ads_txt' | 'admob_api' | 'credential_syntax';
  target: string;
  status: 'verified' | 'warning' | 'failed';
  summary: string;
  httpStatus: number;
  createdAt?: unknown;
}

export interface DailyMetric {
  date: string;
  earnings: number;
  impressions: number;
  requests: number;
  matchedRequests: number;
  matchRate: number;
  ecpm: number;
  clicks: number;
}

export interface AppBreakdown {
  appName: string;
  platform: string;
  admobAppId: string;
  earnings: number;
  impressions: number;
  ecpm: number;
  matchRate: number;
}

export interface FormatBreakdown {
  format: string;
  earnings: number;
  share: number;
  ecpm: number;
  impressions: number;
}

export interface GeoBreakdown {
  country: string;
  code: string;
  earnings: number;
  ecpm: number;
  matchRate: number;
}

export interface RevenueSnapshot {
  source: 'admob_api' | 'csv_import' | 'sample_preview';
  publisherId: string;
  currency: string;
  dailyMetrics: DailyMetric[];
  appBreakdowns: AppBreakdown[];
  formatBreakdowns: FormatBreakdown[];
  geoBreakdowns: GeoBreakdown[];
}

export interface ParsedAppAdsRecord {
  lineNumber: number;
  raw: string;
  valid: boolean;
  domain?: string;
  publisherId?: string;
  relationship?: string;
  certAuthorityId?: string;
  error?: string;
}

export interface AppAdsVerifyResult {
  targetUrl: string;
  isSelfHosted: boolean;
  httpStatus: number;
  contentType: string;
  latencyMs: number;
  rawBody: string;
  totalLines: number;
  validLines: number;
  invalidLines: number;
  googleAdMobMatch: boolean;
  exactSnippetMatch: boolean;
  parsedRecords: ParsedAppAdsRecord[];
  fetchError?: string;
}

export interface CredentialVerifyResult {
  checks: {
    publisherIdFormat: boolean;
    tagIdFormat: boolean;
    appIdFormat: boolean;
    adUnitFormat: boolean;
    publisherConsistency: boolean;
    appAdsHostedMatch: boolean;
  };
  liveApi: {
    attempted: boolean;
    verified: boolean;
    httpStatus?: number;
    accountName?: string;
    currencyCode?: string;
    reportingTimeZone?: string;
    appsCount?: number;
    admobApps?: Array<{
      appId: string;
      platform: string;
      displayName: string;
      linkedStoreId?: string;
    }>;
    reportSnapshot?: RevenueSnapshot;
    error?: string;
  };
}
