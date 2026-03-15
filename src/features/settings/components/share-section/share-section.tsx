import { Link, LinkBroken, Lock, ShieldCheck, User } from '@solar-icons/react';
import { Button, Card, ToggleButton } from '@/shared/components/ui';
import { useShareSection } from './use-share-section';

function ShareControlRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0 pr-4">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </li>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="surface-base rounded-2xl px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">{helper}</p>
    </div>
  );
}

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
    activeSession,
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
    <Card className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
            {t.settings.sharing.title}
          </p>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              {t.settings.sharing.description}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {activeSession
                ? `${activeSession.name} • ${activeSession.puzzleType}`
                : t.sessions.current}
            </p>
          </div>
        </div>

        <span className="surface-base inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-primary">
          {preferences.sharingEnabled
            ? t.settings.sharing.visibility.public
            : t.settings.sharing.visibility.private}
        </span>
      </div>

      {!isConfigured ? (
        <div className="feedback-warning rounded-[1.5rem] border px-5 py-5 text-sm text-warning">
          <p className="font-semibold text-text-primary">{t.settings.sharing.notConfiguredTitle}</p>
          <p className="mt-2 leading-relaxed text-text-secondary">
            {t.settings.sharing.notConfiguredDescription}
          </p>
        </div>
      ) : null}

      {isConfigured && !isAuthenticated ? (
        <div className="surface-base rounded-[1.5rem] px-5 py-5 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">{t.settings.sharing.loginRequiredTitle}</p>
          <p className="mt-2 leading-relaxed">{t.settings.sharing.loginRequiredDescription}</p>
        </div>
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

      {canManageSharing ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              label={t.sessions.current}
              value={activeSession?.name ?? '--'}
              helper={activeSession?.puzzleType ?? '3x3'}
            />
            <SummaryCard
              label={t.settings.sharing.listTitle}
              value={String(activeLinks.length)}
              helper={`${links.length} ${t.settings.sharing.listItemTitle.toLowerCase()}`}
            />
            <SummaryCard
              label={t.settings.sharing.controls.profileVisibility}
              value={
                preferences.profileVisibility === 'public'
                  ? t.settings.sharing.visibility.public
                  : preferences.profileVisibility === 'friends'
                    ? t.settings.sharing.visibility.friends
                    : t.settings.sharing.visibility.private
              }
              helper={t.settings.sharing.privacyTitle}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
              <ul className="divide-y divide-border/70">
                <ShareControlRow
                  title={t.settings.sharing.controls.enableSharing}
                  description={t.settings.sharing.controls.enableSharingHint}
                  control={
                    <ToggleButton
                      value={preferences.sharingEnabled}
                      onValueChange={() => void updateSharingEnabled(!preferences.sharingEnabled)}
                      aria-label={t.settings.sharing.controls.enableSharing}
                      disabled={isSaving}
                    />
                  }
                />
                <ShareControlRow
                  title={t.settings.sharing.controls.profileVisibility}
                  description={
                    preferences.profileVisibility === 'public'
                      ? t.settings.sharing.controls.profilePublic
                      : preferences.profileVisibility === 'friends'
                        ? t.settings.sharing.controls.profileFriends
                        : t.settings.sharing.controls.profilePrivate
                  }
                  control={
                    <Button
                      variant="secondary"
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
                  }
                />
                <ShareControlRow
                  title={t.settings.sharing.controls.rankingVisibility}
                  description={
                    preferences.rankingVisibility === 'public'
                      ? t.settings.sharing.controls.rankingPublic
                      : preferences.rankingVisibility === 'friends'
                        ? t.settings.sharing.controls.rankingFriends
                        : t.settings.sharing.controls.rankingPrivate
                  }
                  control={
                    <Button
                      variant="secondary"
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
                  }
                />
              </ul>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
              <ul className="divide-y divide-border/70">
                <ShareControlRow
                  title={t.settings.sharing.controls.shareSingle}
                  description={t.settings.sharing.controls.shareSingleHint}
                  control={
                    <ToggleButton
                      value={preferences.shareSingle}
                      onValueChange={() =>
                        void updateMetricFlag('shareSingle', !preferences.shareSingle)
                      }
                      aria-label={t.settings.sharing.controls.shareSingle}
                      disabled={!preferences.sharingEnabled || isSaving}
                    />
                  }
                />
                <ShareControlRow
                  title={t.settings.sharing.controls.shareAverages}
                  description={t.settings.sharing.controls.shareAveragesHint}
                  control={
                    <ToggleButton
                      value={preferences.shareAverages}
                      onValueChange={() =>
                        void updateMetricFlag('shareAverages', !preferences.shareAverages)
                      }
                      aria-label={t.settings.sharing.controls.shareAverages}
                      disabled={!preferences.sharingEnabled || isSaving}
                    />
                  }
                />
                <ShareControlRow
                  title={t.settings.sharing.controls.shareProgress}
                  description={t.settings.sharing.controls.shareProgressHint}
                  control={
                    <ToggleButton
                      value={preferences.shareProgress}
                      onValueChange={() =>
                        void updateMetricFlag('shareProgress', !preferences.shareProgress)
                      }
                      aria-label={t.settings.sharing.controls.shareProgress}
                      disabled={!preferences.sharingEnabled || isSaving}
                    />
                  }
                />
              </ul>
            </div>
          </div>

          <div className="feedback-info rounded-[1.5rem] border px-5 py-5 text-sm text-text-secondary">
            <p className="flex items-center gap-2 font-semibold text-text-primary">
              <ShieldCheck size={16} className="text-primary" />
              {t.settings.sharing.privacyTitle}
            </p>
            <p className="mt-2 leading-relaxed">{t.settings.sharing.privacyDescription}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <Button
              onClick={handleCreateShareLink}
              disabled={!preferences.sharingEnabled || isSaving}
              className="justify-center"
            >
              <Link size={18} />
              {t.settings.sharing.actions.createLink}
            </Button>
            {activeLinks.length > 0 ? (
              <Button
                onClick={() => void updateSharingEnabled(false)}
                variant="ghost"
                disabled={isSaving}
              >
                <LinkBroken size={18} />
                {t.settings.sharing.actions.revokeAll}
              </Button>
            ) : null}
          </div>

          <section className="space-y-3" aria-labelledby="share-links-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4
                id="share-links-title"
                className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted"
              >
                {t.settings.sharing.listTitle}
              </h4>
              {isLoading ? (
                <span className="text-xs text-text-muted">{t.settings.sharing.loading}</span>
              ) : null}
            </div>

            {links.length === 0 ? (
              <div className="surface-base rounded-[1.5rem] px-5 py-5 text-sm text-text-secondary">
                {t.settings.sharing.empty}
              </div>
            ) : (
              <ul className="grid gap-3">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="surface-base rounded-[1.5rem] px-5 py-5"
                    aria-label={`${t.settings.sharing.listItemTitle} ${link.slug}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary">{link.title}</p>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                              link.isActive
                                ? 'feedback-success text-success'
                                : 'surface-interactive border-border/60 text-text-muted'
                            }`}
                          >
                            {link.isActive
                              ? t.settings.sharing.status.active
                              : t.settings.sharing.status.revoked}
                          </span>
                        </div>

                        <p className="mt-2 break-all font-mono text-xs text-text-muted">
                          {resolveShareUrl(link.slug)}
                        </p>
                        <p className="mt-2 text-xs text-text-secondary">
                          {t.settings.sharing.createdAt}: {formatDateTime(link.createdAt)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
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
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </Card>
  );
}
