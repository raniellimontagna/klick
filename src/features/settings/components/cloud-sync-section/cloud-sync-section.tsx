import { CloudDownload, ShieldCheck, User } from '@solar-icons/react';
import { Button, Card } from '@/shared/components/ui';
import { useCloudSyncSection } from './use-cloud-sync-section';

function StatusChip({ label }: { label: string }) {
  return (
    <span className="surface-base inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-primary">
      {label}
    </span>
  );
}

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
    <Card className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
            {t.settings.cloudSync.title}
          </p>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              {t.settings.cloudSync.description}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {t.settings.cloudSync.lastSyncLabel}: {lastSyncLabel}
            </p>
          </div>
        </div>

        <StatusChip label={statusLabel} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-base rounded-2xl px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
            {t.settings.cloudSync.statusLabel}
          </p>
          <p className="mt-2 text-base font-semibold text-text-primary">{statusLabel}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            {canManageCloud && user?.email
              ? `${t.settings.cloudSync.connectedAs}: ${user.email}`
              : lastSyncLabel}
          </p>
        </div>

        <div className="surface-base rounded-2xl px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
            {t.settings.cloudSync.lastSyncLabel}
          </p>
          <p className="mt-2 text-base font-semibold text-text-primary">{lastSyncLabel}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            {isSyncing ? t.settings.cloudSync.syncingAction : t.settings.cloudSync.syncNow}
          </p>
        </div>
      </div>

      {error ? (
        <p
          className="feedback-danger rounded-2xl border px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {t.settings.cloudSync.errorPrefix} {error}
        </p>
      ) : null}

      {feedback ? (
        <output
          className={`block rounded-2xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'feedback-success text-success'
              : 'feedback-danger text-danger'
          }`}
          role={feedback.type === 'error' ? 'alert' : 'status'}
          aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
        >
          {feedback.text}
        </output>
      ) : null}

      {!isConfigured ? (
        <div className="feedback-warning rounded-[1.5rem] border px-5 py-5 text-sm text-warning">
          <p className="font-semibold text-text-primary">
            {t.settings.cloudSync.notConfiguredTitle}
          </p>
          <p className="mt-2 leading-relaxed text-text-secondary">
            {t.settings.cloudSync.notConfiguredDescription}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="surface-base rounded-2xl px-4 py-3 font-mono text-xs text-text-secondary">
              VITE_SUPABASE_URL
            </div>
            <div className="surface-base rounded-2xl px-4 py-3 font-mono text-xs text-text-secondary">
              VITE_SUPABASE_ANON_KEY
            </div>
          </div>
        </div>
      ) : canManageCloud ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="surface-base flex items-start gap-3 rounded-[1.5rem] px-4 py-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <ShieldCheck size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">
                {t.settings.cloudSync.connectedAs}
              </p>
              <p className="mt-1 break-all text-sm leading-relaxed text-text-secondary">
                {user?.email ?? '--'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <Button
              onClick={handleSyncNow}
              variant="secondary"
              disabled={isSyncing}
              className="min-w-44"
            >
              <CloudDownload size={18} />
              {isSyncing ? t.settings.cloudSync.syncingAction : t.settings.cloudSync.syncNow}
            </Button>
            <Button onClick={handleSignOut} variant="ghost" disabled={isSyncing}>
              {t.settings.cloudSync.signOut}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <Button
            onClick={handleGoogleSignIn}
            className="min-h-32 flex-col items-start justify-between px-5 py-5"
            disabled={isSyncing}
          >
            <span className="surface-base inline-flex h-10 w-10 items-center justify-center rounded-2xl text-primary">
              <ShieldCheck size={18} />
            </span>
            <span className="space-y-1 text-left">
              <span className="block text-sm font-semibold text-white">
                {t.settings.cloudSync.googleSignIn}
              </span>
              <span className="block text-xs leading-relaxed text-white/80">
                {t.settings.cloudSync.description}
              </span>
            </span>
          </Button>

          <form
            onSubmit={handleMagicLinkSubmit}
            className="surface-base rounded-[1.5rem] px-4 py-4 sm:px-5"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-info/10 text-info">
                <User size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {t.settings.cloudSync.magicLinkLabel}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {t.settings.cloudSync.magicLinkPlaceholder}
                </p>
              </div>
            </div>

            <label htmlFor="magic-link-email" className="mt-4 block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                {t.settings.cloudSync.magicLinkLabel}
              </span>
              <input
                id="magic-link-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t.settings.cloudSync.magicLinkPlaceholder}
                className="h-11 w-full rounded-2xl border border-border/75 bg-background/40 px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
                autoComplete="email"
              />
            </label>

            <div className="mt-4 flex justify-end">
              <Button type="submit" variant="secondary" disabled={isSyncing}>
                {t.settings.cloudSync.magicLinkSend}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
