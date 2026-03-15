import { Button, Card } from '@/shared/components/ui';
import { useCloudSyncSection } from './use-cloud-sync-section';

export function CloudSyncSection() {
  const {
    t,
    isConfigured,
    statusLabel,
    user,
    error,
    email,
    setEmail,
    feedback,
    isSyncing,
    canManageCloud,
    lastSyncLabel,
    handleGoogleSignIn,
    handleMagicLinkSubmit,
    handleSyncNow,
    handleSignOut,
  } = useCloudSyncSection();

  return (
    <Card className="space-y-6">
      <header className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-primary">
          {t.settings.cloudSync.title}
        </h3>
        <p className="text-xs text-text-secondary">{t.settings.cloudSync.description}</p>
      </header>

      <div className="rounded-xl border border-border/70 bg-surface/65 p-4 text-sm text-text-secondary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold text-text-primary">{t.settings.cloudSync.statusLabel}</span>
          <span className="rounded-full border border-border/70 bg-surface/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-primary">
            {statusLabel}
          </span>
        </div>

        <p className="mt-3 text-xs text-text-muted">
          {t.settings.cloudSync.lastSyncLabel}: {lastSyncLabel}
        </p>

        {canManageCloud && user?.email && (
          <p className="mt-2 text-xs text-text-secondary">
            {t.settings.cloudSync.connectedAs}: <span className="text-text-primary">{user.email}</span>
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {t.settings.cloudSync.errorPrefix} {error}
          </p>
        )}
      </div>

      {feedback && (
        <output
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger'
          }`}
          aria-live="polite"
        >
          {feedback.text}
        </output>
      )}

      {!isConfigured ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <p className="font-semibold">{t.settings.cloudSync.notConfiguredTitle}</p>
          <p className="mt-2 text-xs leading-relaxed">{t.settings.cloudSync.notConfiguredDescription}</p>
          <ul className="mt-3 space-y-1 font-mono text-xs">
            <li>VITE_SUPABASE_URL</li>
            <li>VITE_SUPABASE_ANON_KEY</li>
          </ul>
        </div>
      ) : canManageCloud ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button onClick={handleSyncNow} variant="secondary" disabled={isSyncing} className="h-11">
            {isSyncing ? t.settings.cloudSync.syncingAction : t.settings.cloudSync.syncNow}
          </Button>
          <Button onClick={handleSignOut} variant="ghost" disabled={isSyncing} className="h-11">
            {t.settings.cloudSync.signOut}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Button onClick={handleGoogleSignIn} className="h-11 w-full" disabled={isSyncing}>
            {t.settings.cloudSync.googleSignIn}
          </Button>

          <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
            <label
              htmlFor="magic-link-email"
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-text-muted"
            >
              {t.settings.cloudSync.magicLinkLabel}
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="magic-link-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t.settings.cloudSync.magicLinkPlaceholder}
                className="h-11 flex-1 rounded-lg border border-border/75 bg-surface/70 px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
                autoComplete="email"
              />
              <Button type="submit" variant="secondary" className="h-11 sm:px-5" disabled={isSyncing}>
                {t.settings.cloudSync.magicLinkSend}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
