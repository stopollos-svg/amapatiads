import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  Plus,
  Search,
  Trash2,
  Pencil,
  Smartphone,
  X,
} from 'lucide-react';
import { AccentKey, AppAdsStatus, PlatformType, PublisherApp } from '../types';
import { AppEmblem } from './AppEmblem';
import { BLUEPRINT_LIMITS } from '../lib/firebase';

interface AppPortfolioSectionProps {
  apps: PublisherApp[];
  loading: boolean;
  canManage: boolean;
  publisherId: string;
  onAddApp: (app: Omit<PublisherApp, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateApp: (id: string, app: Omit<PublisherApp, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteApp: (id: string) => Promise<void>;
  onRequestConsoleAccess: () => void;
}

const STATUS_DISPLAY: Record<AppAdsStatus, { label: string; colorClass: string; Icon: typeof CheckCircle2 }> = {
  verified: { label: 'app-ads.txt Verified', colorClass: 'text-green-700', Icon: CheckCircle2 },
  pending_crawl: { label: '24h Crawl Pending', colorClass: 'text-amber-700', Icon: Clock },
  action_required: { label: 'Action Required', colorClass: 'text-red-700', Icon: AlertTriangle },
};

export function AppPortfolioSection({
  apps,
  loading,
  canManage,
  publisherId,
  onAddApp,
  onUpdateApp,
  onDeleteApp,
  onRequestConsoleAccess,
}: AppPortfolioSectionProps) {
  const [platformFilter, setPlatformFilter] = useState<'All' | PlatformType>('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<PublisherApp | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('Android');
  const [category, setCategory] = useState('Productivity');
  const [storeUrl, setStoreUrl] = useState('https://play.google.com/store/apps/details?id=');
  const [admobAppId, setAdmobAppId] = useState(`ca-app-${publisherId}~`);
  const [appAdsStatus, setAppAdsStatus] = useState<AppAdsStatus>('verified');
  const [adUnitsCount, setAdUnitsCount] = useState(3);
  const [description, setDescription] = useState('');
  const [accentKey, setAccentKey] = useState<AccentKey>('emerald');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');

  const filteredApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((app) => {
      if (platformFilter !== 'All' && app.platform !== platformFilter) return false;
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        app.bundleId.toLowerCase().includes(q) ||
        app.category.toLowerCase().includes(q) ||
        app.admobAppId.toLowerCase().includes(q)
      );
    });
  }, [apps, platformFilter, search]);

  const openCreateModal = () => {
    setEditingApp(null);
    setName('');
    setBundleId('');
    setPlatform('Android');
    setCategory('Productivity');
    setStoreUrl('https://play.google.com/store/apps/details?id=');
    setAdmobAppId(`ca-app-${publisherId}~`);
    setAppAdsStatus('verified');
    setAdUnitsCount(3);
    setDescription('');
    setAccentKey('emerald');
    setVisibility('public');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (app: PublisherApp) => {
    setEditingApp(app);
    setName(app.name);
    setBundleId(app.bundleId);
    setPlatform(app.platform);
    setCategory(app.category);
    setStoreUrl(app.storeUrl);
    setAdmobAppId(app.admobAppId);
    setAppAdsStatus(app.appAdsStatus);
    setAdUnitsCount(app.adUnitsCount);
    setDescription(app.description);
    setAccentKey(app.accentKey);
    setVisibility(app.visibility);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim().slice(0, BLUEPRINT_LIMITS.APP_NAME_MAX);
    const cleanBundle = bundleId.trim().slice(0, BLUEPRINT_LIMITS.BUNDLE_ID_MAX);
    const cleanStore = storeUrl.trim().slice(0, BLUEPRINT_LIMITS.STORE_URL_MAX);
    const cleanAdmob = admobAppId.trim().slice(0, BLUEPRINT_LIMITS.ADMOB_APP_ID_MAX);

    if (!cleanName || cleanBundle.length < 3 || !BLUEPRINT_LIMITS.BUNDLE_ID_REGEX.test(cleanBundle)) {
      setFormError('Enter a valid app name and bundle ID (e.g. com.studio.appname).');
      return;
    }
    if (cleanStore.length < 8 || !cleanStore.startsWith('http')) {
      setFormError('Enter a valid Google Play or App Store URL starting with https://.');
      return;
    }
    if (cleanAdmob.length < 10) {
      setFormError('Enter a valid AdMob App ID (e.g. ca-app-pub-2596010858935461~1234567890).');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: cleanName,
        bundleId: cleanBundle,
        platform,
        category: category.trim().slice(0, BLUEPRINT_LIMITS.CATEGORY_MAX) || 'Utilities',
        storeUrl: cleanStore,
        admobAppId: cleanAdmob,
        publisherId,
        appAdsStatus,
        adUnitsCount: Math.max(0, Math.min(500, Number(adUnitsCount) || 0)),
        description: description.trim().slice(0, BLUEPRINT_LIMITS.DESCRIPTION_MAX),
        accentKey,
        visibility,
      };
      if (editingApp) {
        await onUpdateApp(editingApp.id, payload);
      } else {
        await onAddApp(payload);
      }
      setModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Unable to save app record.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="app-portfolio" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-medium text-teal-700 tracking-wide">
            Developer App Directory
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Published Applications & AdMob Inventory
          </h2>
          <p className="text-sm text-slate-600">
            All Google Play and App Store titles linked to publisher{' '}
            <span className="font-mono text-slate-900">{publisherId}</span> and authorized by this domain&apos;s{' '}
            <span className="font-mono text-slate-900">/app-ads.txt</span>.
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add App</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onRequestConsoleAccess}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Sign In to Manage Apps</span>
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(['All', 'Android', 'iOS'] as const).map((plat) => (
            <button
              key={plat}
              type="button"
              onClick={() => setPlatformFilter(plat)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                platformFilter === plat
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {plat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search app name, bundle ID..."
            aria-label="Search published apps"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
          />
        </div>
      </div>

      {/* App Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((skeleton) => (
            <div
              key={skeleton}
              className="h-44 bg-white border border-slate-200 rounded-xl p-5 animate-pulse"
            />
          ))}
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <Smartphone className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">
              {apps.length === 0 ? 'No apps published in your directory yet' : 'No matching apps found'}
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              {apps.length === 0
                ? 'Add your Android and iOS apps here so Google Play, App Store, and AdMob crawlers can trace them back to your verified developer website.'
                : 'Try clearing your search filter or switching the platform selector.'}
            </p>
          </div>
          {apps.length === 0 && (
            <div className="pt-2">
              {canManage ? (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Your First App</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRequestConsoleAccess}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
                >
                  <span>Sign In with MFA to Publish Apps</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredApps.map((app) => {
            const statusMeta = STATUS_DISPLAY[app.appAdsStatus] || STATUS_DISPLAY.verified;
            const StatusIcon = statusMeta.Icon;
            return (
              <article
                key={app.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <AppEmblem name={app.name} accentKey={app.accentKey} />
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-900 truncate">
                          {app.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {app.platform} · {app.category} · {app.adUnitsCount} ad units
                        </p>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(app)}
                          aria-label={`Edit ${app.name}`}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteApp(app.id)}
                          aria-label={`Remove ${app.name}`}
                          className="p-1.5 text-slate-500 hover:text-red-700 rounded-md hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {app.description && (
                    <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
                      {app.description}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs font-mono">
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 truncate">
                      <span className="text-slate-500 font-sans block text-[11px]">
                        Bundle / Package ID
                      </span>
                      <span className="text-slate-900">{app.bundleId}</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 truncate">
                      <span className="text-slate-500 font-sans block text-[11px]">
                        AdMob App ID
                      </span>
                      <span className="text-slate-900">{app.admobAppId}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                  <span className={`inline-flex items-center gap-1.5 font-medium ${statusMeta.colorClass}`}>
                    <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{statusMeta.label}</span>
                  </span>

                  <a
                    href={app.storeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-teal-700 transition-colors whitespace-nowrap"
                  >
                    <span>{app.platform === 'Android' ? 'Google Play' : 'App Store'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Add / Edit App Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <h3 id="app-modal-title" className="text-lg font-semibold text-slate-900">
                {editingApp ? 'Edit Published App' : 'Add App to Developer Directory'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">App Name</label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.APP_NAME_MAX}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ChronoPulse Focus"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Platform</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as PlatformType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="Android">Android (Google Play)</option>
                    <option value="iOS">iOS (App Store)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Bundle / Package ID</label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.BUNDLE_ID_MAX}
                    value={bundleId}
                    onChange={(e) => setBundleId(e.target.value)}
                    placeholder="com.studio.chronopulse"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Category</label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.CATEGORY_MAX}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Productivity"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">AdMob App ID</label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.ADMOB_APP_ID_MAX}
                  value={admobAppId}
                  onChange={(e) => setAdmobAppId(e.target.value)}
                  placeholder={`ca-app-${publisherId}~1234567890`}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Store Listing URL</label>
                <input
                  type="url"
                  required
                  maxLength={BLUEPRINT_LIMITS.STORE_URL_MAX}
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  placeholder="https://play.google.com/store/apps/details?id=com.studio.app"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">app-ads.txt Status</label>
                  <select
                    value={appAdsStatus}
                    onChange={(e) => setAppAdsStatus(e.target.value as AppAdsStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="verified">Verified</option>
                    <option value="pending_crawl">24h Crawl Pending</option>
                    <option value="action_required">Action Required</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Active Ad Units</label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={adUnitsCount}
                    onChange={(e) => setAdUnitsCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Emblem Tone</label>
                  <select
                    value={accentKey}
                    onChange={(e) => setAccentKey(e.target.value as AccentKey)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="emerald">Emerald</option>
                    <option value="slate">Slate</option>
                    <option value="indigo">Indigo</option>
                    <option value="amber">Amber</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Short App Description</label>
                <textarea
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.DESCRIPTION_MAX}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief overview displayed on your developer app directory..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              {formError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingApp ? 'Save Changes' : 'Publish App'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
