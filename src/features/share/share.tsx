import { Share, ShieldWarning } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Logo } from '@/shared';
import { Card } from '@/shared/components/ui';
import { fadeIn, formatTime } from '@/shared/lib';
import { useSharePage } from './use-share-page';

function formatSharedMetric(value: number | null): string {
  if (value === null) {
    return 'DNF';
  }

  return formatTime(value);
}

function StandaloneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell relative bg-background text-text-primary">
      <div
        aria-hidden="true"
        className="app-shell-backdrop pointer-events-none absolute inset-0 z-0"
      />
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}

function ShellHeader({
  appTitle,
  tagline,
  backLabel,
}: {
  appTitle: string;
  tagline: string;
  backLabel: string;
}) {
  return (
    <header className="flex items-center justify-between gap-4">
      <Link to="/" className="inline-flex items-center gap-3 text-text-primary">
        <Logo />
        <div>
          <p className="text-sm font-semibold">{appTitle}</p>
          <p className="text-xs text-text-secondary">{tagline}</p>
        </div>
      </Link>

      <Link
        to="/"
        className="surface-interactive inline-flex min-h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-text-primary"
      >
        {backLabel}
      </Link>
    </header>
  );
}

function StateCard({
  title,
  description,
  toneClassName,
}: {
  title: string;
  description: string;
  toneClassName: string;
}) {
  return (
    <Card className="mx-auto w-full max-w-2xl space-y-4 text-center">
      <div
        className={`mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl ${toneClassName}`}
      >
        <ShieldWarning size={24} />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="text-sm leading-relaxed text-text-secondary">{description}</p>
      </div>
    </Card>
  );
}

export function SharePage() {
  const { t, status, shareLink, generatedAt } = useSharePage();

  if (status === 'loading') {
    return (
      <StandaloneShell>
        <ShellHeader appTitle={t.app.title} tagline={t.app.tagline} backLabel={t.actions.back} />
        <main className="flex flex-1 items-center justify-center py-10">
          <StateCard
            title={t.sharePage.loadingLabel}
            description={t.sharePage.loadingDescription}
            toneClassName="bg-primary/12 text-primary"
          />
        </main>
      </StandaloneShell>
    );
  }

  if (status === 'error') {
    return (
      <StandaloneShell>
        <ShellHeader appTitle={t.app.title} tagline={t.app.tagline} backLabel={t.actions.back} />
        <main className="flex flex-1 items-center justify-center py-10">
          <StateCard
            title={t.sharePage.errorTitle}
            description={t.sharePage.errorDescription}
            toneClassName="bg-danger/12 text-danger"
          />
        </main>
      </StandaloneShell>
    );
  }

  if (status === 'not_found' || !shareLink) {
    return (
      <StandaloneShell>
        <ShellHeader appTitle={t.app.title} tagline={t.app.tagline} backLabel={t.actions.back} />
        <main className="flex flex-1 items-center justify-center py-10">
          <StateCard
            title={t.sharePage.notFoundTitle}
            description={t.sharePage.notFoundDescription}
            toneClassName="bg-warning/12 text-warning"
          />
        </main>
      </StandaloneShell>
    );
  }

  const stats = shareLink.payload.stats;
  const metricCards: Array<{ id: string; label: string; value: number | null }> = [];

  if ('single' in stats) {
    metricCards.push({
      id: 'single',
      label: t.sharePage.metrics.single,
      value: stats.single ?? null,
    });
  }

  if ('ao5' in stats) {
    metricCards.push({ id: 'ao5', label: t.sharePage.metrics.ao5, value: stats.ao5 ?? null });
  }

  if ('ao12' in stats) {
    metricCards.push({ id: 'ao12', label: t.sharePage.metrics.ao12, value: stats.ao12 ?? null });
  }

  if ('bestAo5' in stats) {
    metricCards.push({
      id: 'bestAo5',
      label: t.sharePage.metrics.bestAo5,
      value: stats.bestAo5 ?? null,
    });
  }

  if ('bestAo12' in stats) {
    metricCards.push({
      id: 'bestAo12',
      label: t.sharePage.metrics.bestAo12,
      value: stats.bestAo12 ?? null,
    });
  }

  const weeklyGoalProgress = shareLink.payload.progress
    ? Math.min(
        100,
        (shareLink.payload.progress.weeklyGoalProgress /
          Math.max(shareLink.payload.progress.weeklyGoalTarget, 1)) *
          100,
      )
    : 0;

  return (
    <StandaloneShell>
      <ShellHeader appTitle={t.app.title} tagline={t.app.tagline} backLabel={t.actions.back} />

      <main className="flex-1 py-8 sm:py-10">
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="mx-auto flex max-w-5xl flex-col gap-6"
        >
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-4">
                <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  <Share size={14} />
                  {t.sharePage.badge}
                </p>
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-text-primary sm:text-4xl">
                    {shareLink.title}
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {shareLink.payload.sessionName} • {t.sharePage.generatedAt}: {generatedAt}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="surface-base rounded-2xl px-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                    {t.sessions.current}
                  </p>
                  <p className="mt-2 text-base font-semibold text-text-primary">
                    {shareLink.payload.sessionName}
                  </p>
                </div>
                <div className="surface-base rounded-2xl px-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                    {t.sharePage.puzzleType}
                  </p>
                  <p className="mt-2 text-base font-semibold text-text-primary">
                    {shareLink.payload.puzzleType}
                  </p>
                </div>
                <div className="surface-base rounded-2xl px-4 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                    {t.settings.sharing.controls.profileVisibility}
                  </p>
                  <p className="mt-2 text-base font-semibold text-text-primary">
                    {shareLink.payload.profileVisibility === 'public'
                      ? t.settings.sharing.visibility.public
                      : shareLink.payload.profileVisibility === 'friends'
                        ? t.settings.sharing.visibility.friends
                        : t.settings.sharing.visibility.private}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {metricCards.length > 0 ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {metricCards.map((metric) => (
                <Card key={metric.id} className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                    {metric.label}
                  </p>
                  <p className="text-3xl font-black tracking-tight text-text-primary">
                    {formatSharedMetric(metric.value)}
                  </p>
                </Card>
              ))}
            </section>
          ) : null}

          {shareLink.payload.progress ? (
            <section className="grid gap-6 lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
              <Card className="space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
                  {t.sharePage.progressTitle}
                </p>
                <div className="space-y-3">
                  <div className="surface-base rounded-2xl px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      {t.sharePage.progress.level}
                    </p>
                    <p className="mt-2 text-3xl font-black tracking-tight text-text-primary">
                      {shareLink.payload.progress.level}
                    </p>
                  </div>
                  <div className="surface-base rounded-2xl px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      {t.sharePage.progress.xp}
                    </p>
                    <p className="mt-2 text-3xl font-black tracking-tight text-text-primary">
                      {shareLink.payload.progress.xp}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="surface-base rounded-2xl px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      {t.sharePage.progress.currentStreak}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">
                      {shareLink.payload.progress.currentStreak}
                    </p>
                  </div>
                  <div className="surface-base rounded-2xl px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      {t.sharePage.progress.bestStreak}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">
                      {shareLink.payload.progress.bestStreak}
                    </p>
                  </div>
                </div>

                <div className="surface-base rounded-[1.5rem] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      {t.sharePage.progress.weeklyGoal}
                    </p>
                    <p className="text-sm font-semibold text-text-primary">
                      {shareLink.payload.progress.weeklyGoalProgress}/
                      {shareLink.payload.progress.weeklyGoalTarget}
                    </p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-surface-hover/80">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${weeklyGoalProgress}%` }}
                    />
                  </div>
                </div>
              </Card>
            </section>
          ) : null}
        </motion.div>
      </main>
    </StandaloneShell>
  );
}
