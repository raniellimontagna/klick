import { Link, LinkBroken, Lock, ShieldCheck, User } from '@solar-icons/react';
import { Button, Card, ToggleButton } from '@/shared/components/ui';
import { useShareSection } from './use-share-section';

export function ShareSection() {
  const {
    t,
    isConfigured,
    isAuthenticated,
    canManageSharing,
    preferences,
    links,
    feedback,
    isLoading,
    isSaving,
    resolveShareUrl,
    formatDateTime,
    updateSharingEnabled,
    cycleProfileVisibility,
    cycleRankingVisibility,
    updateMetricFlag,
    handleCreateShareLink,
    handleCopyShareLink,
    handleRevokeShareLink,
  } = useShareSection();

  const activeLinks = links.filter((link) => link.isActive);

  return (
    <Card className="space-y-6">
      <header className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-primary">
          {t.settings.sharing.title}
        </h3>
        <p className="text-xs text-text-secondary">{t.settings.sharing.description}</p>
      </header>

      {!isConfigured && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <p className="font-semibold">{t.settings.sharing.notConfiguredTitle}</p>
          <p className="mt-2 text-xs leading-relaxed">{t.settings.sharing.notConfiguredDescription}</p>
        </div>
      )}

      {isConfigured && !isAuthenticated && (
        <div className="rounded-xl border border-border/70 bg-surface/65 p-4 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">{t.settings.sharing.loginRequiredTitle}</p>
          <p className="mt-2 text-xs leading-relaxed">{t.settings.sharing.loginRequiredDescription}</p>
        </div>
      )}

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

      {canManageSharing && (
        <>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-surface/65">
            <li className="flex items-center justify-between gap-4 p-4">
              <div className="pr-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {t.settings.sharing.controls.enableSharing}
                </p>
                <p className="mt-1 text-sm text-text-secondary">{t.settings.sharing.controls.enableSharingHint}</p>
              </div>
              <ToggleButton
                value={preferences.sharingEnabled}
                onValueChange={() => void updateSharingEnabled(!preferences.sharingEnabled)}
                aria-label={t.settings.sharing.controls.enableSharing}
                disabled={isSaving}
              />
            </li>

            <li className="flex items-center justify-between gap-4 p-4">
              <div className="pr-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {t.settings.sharing.controls.profileVisibility}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {preferences.profileVisibility === 'public'
                    ? t.settings.sharing.controls.profilePublic
                    : preferences.profileVisibility === 'friends'
                      ? t.settings.sharing.controls.profileFriends
                    : t.settings.sharing.controls.profilePrivate}
                </p>
              </div>
              <Button
                variant="secondary"
                className="h-10 px-4"
                onClick={() => void cycleProfileVisibility()}
                disabled={!preferences.sharingEnabled || isSaving}
              >
                <User size={16} />
                {preferences.profileVisibility === 'public'
                  ? t.settings.sharing.visibility.public
                  : preferences.profileVisibility === 'friends'
                    ? t.settings.sharing.visibility.friends
                  : t.settings.sharing.visibility.private}
              </Button>
            </li>

            <li className="flex items-center justify-between gap-4 p-4">
              <div className="pr-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {t.settings.sharing.controls.rankingVisibility}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {preferences.rankingVisibility === 'public'
                    ? t.settings.sharing.controls.rankingPublic
                    : preferences.rankingVisibility === 'friends'
                      ? t.settings.sharing.controls.rankingFriends
                      : t.settings.sharing.controls.rankingPrivate}
                </p>
              </div>
              <Button
                variant="secondary"
                className="h-10 px-4"
                onClick={() => void cycleRankingVisibility()}
                disabled={!preferences.sharingEnabled || isSaving}
              >
                <ShieldCheck size={16} />
                {preferences.rankingVisibility === 'public'
                  ? t.settings.sharing.visibility.public
                  : preferences.rankingVisibility === 'friends'
                    ? t.settings.sharing.visibility.friends
                    : t.settings.sharing.visibility.private}
              </Button>
            </li>

            <li className="flex items-center justify-between gap-4 p-4">
              <div className="pr-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {t.settings.sharing.controls.shareSingle}
                </p>
                <p className="mt-1 text-sm text-text-secondary">{t.settings.sharing.controls.shareSingleHint}</p>
              </div>
              <ToggleButton
                value={preferences.shareSingle}
                onValueChange={() => void updateMetricFlag('shareSingle', !preferences.shareSingle)}
                aria-label={t.settings.sharing.controls.shareSingle}
                disabled={!preferences.sharingEnabled || isSaving}
              />
            </li>

            <li className="flex items-center justify-between gap-4 p-4">
              <div className="pr-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {t.settings.sharing.controls.shareAverages}
                </p>
                <p className="mt-1 text-sm text-text-secondary">{t.settings.sharing.controls.shareAveragesHint}</p>
              </div>
              <ToggleButton
                value={preferences.shareAverages}
                onValueChange={() => void updateMetricFlag('shareAverages', !preferences.shareAverages)}
                aria-label={t.settings.sharing.controls.shareAverages}
                disabled={!preferences.sharingEnabled || isSaving}
              />
            </li>

            <li className="flex items-center justify-between gap-4 p-4">
              <div className="pr-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {t.settings.sharing.controls.shareProgress}
                </p>
                <p className="mt-1 text-sm text-text-secondary">{t.settings.sharing.controls.shareProgressHint}</p>
              </div>
              <ToggleButton
                value={preferences.shareProgress}
                onValueChange={() => void updateMetricFlag('shareProgress', !preferences.shareProgress)}
                aria-label={t.settings.sharing.controls.shareProgress}
                disabled={!preferences.sharingEnabled || isSaving}
              />
            </li>
          </ul>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-text-secondary">
            <p className="flex items-center gap-2 font-semibold text-text-primary">
              <ShieldCheck size={16} className="text-primary" />
              {t.settings.sharing.privacyTitle}
            </p>
            <p className="mt-2 leading-relaxed">{t.settings.sharing.privacyDescription}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              onClick={handleCreateShareLink}
              disabled={!preferences.sharingEnabled || isSaving}
              className="h-11"
            >
              <Link size={18} />
              {t.settings.sharing.actions.createLink}
            </Button>
            {activeLinks.length > 0 && (
              <Button
                onClick={() => updateSharingEnabled(false)}
                variant="ghost"
                className="h-11"
                disabled={isSaving}
              >
                <LinkBroken size={18} />
                {t.settings.sharing.actions.revokeAll}
              </Button>
            )}
          </div>

          <section className="space-y-3" aria-labelledby="share-links-title">
            <header className="flex items-center justify-between gap-3">
              <h4
                id="share-links-title"
                className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted"
              >
                {t.settings.sharing.listTitle}
              </h4>
              {isLoading && <span className="text-xs text-text-muted">{t.settings.sharing.loading}</span>}
            </header>

            {links.length === 0 ? (
              <div className="rounded-xl border border-border/70 bg-surface/65 p-4 text-sm text-text-secondary">
                {t.settings.sharing.empty}
              </div>
            ) : (
              <ul className="space-y-2">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="rounded-xl border border-border/70 bg-surface/65 p-4"
                    aria-label={`${t.settings.sharing.listItemTitle} ${link.slug}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-text-primary">{link.title}</p>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          link.isActive
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-white/15 bg-white/5 text-text-muted'
                        }`}
                      >
                        {link.isActive ? t.settings.sharing.status.active : t.settings.sharing.status.revoked}
                      </span>
                    </div>

                    <p className="mt-2 truncate font-mono text-xs text-text-muted">{resolveShareUrl(link.slug)}</p>

                    <p className="mt-2 text-xs text-text-secondary">
                      {t.settings.sharing.createdAt}: {formatDateTime(link.createdAt)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCopyShareLink(link.slug)}
                        disabled={!link.isActive}
                      >
                        {t.settings.sharing.actions.copy}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevokeShareLink(link.id)}
                        disabled={!link.isActive || isSaving}
                      >
                        <Lock size={14} />
                        {t.settings.sharing.actions.revoke}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Card>
  );
}
