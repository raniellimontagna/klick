import { Share, ShieldWarning } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { Card } from '@/shared/components/ui';
import { formatTime } from '@/shared/lib';
import { fadeIn } from '@/shared/lib';
import { useSharePage } from './use-share-page';

function formatSharedMetric(value: number | null): string {
  if (value === null) {
    return 'DNF';
  }

  return formatTime(value);
}

export function SharePage() {
  const { t, status, shareLink, generatedAt } = useSharePage();

  if (status === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-12">
        <Card className="w-full space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
            {t.sharePage.loadingLabel}
          </p>
          <p className="text-sm text-text-secondary">{t.sharePage.loadingDescription}</p>
        </Card>
      </main>
    );
  }

  if (status === 'not_found' || !shareLink) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-12">
        <Card className="w-full space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <ShieldWarning size={22} className="text-warning" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">{t.sharePage.notFoundTitle}</h1>
          <p className="text-sm text-text-secondary">{t.sharePage.notFoundDescription}</p>
        </Card>
      </main>
    );
  }

  const stats = shareLink.payload.stats;
  const metricCards: Array<{ id: string; label: string; value: number | null }> = [];

  if ('single' in stats) {
    metricCards.push({ id: 'single', label: t.sharePage.metrics.single, value: stats.single ?? null });
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10">
      <motion.div variants={fadeIn} initial="hidden" animate="visible" className="space-y-6">
        <Card className="space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Share size={14} />
            {t.sharePage.badge}
          </p>
          <h1 className="text-2xl font-semibold text-text-primary">{shareLink.title}</h1>
          <p className="text-sm text-text-secondary">
            {t.sharePage.generatedAt}: {generatedAt}
          </p>
          <p className="text-xs text-text-muted">
            {t.sharePage.puzzleType}: {shareLink.payload.puzzleType}
          </p>
        </Card>

        {metricCards.length > 0 && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metricCards.map((metric) => (
              <Card key={metric.id} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {metric.label}
                </p>
                <p className="text-2xl font-semibold text-text-primary">{formatSharedMetric(metric.value)}</p>
              </Card>
            ))}
          </section>
        )}

        {shareLink.payload.progress && (
          <section>
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">
                {t.sharePage.progressTitle}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs text-text-muted">{t.sharePage.progress.level}</p>
                  <p className="text-xl font-semibold text-text-primary">{shareLink.payload.progress.level}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">{t.sharePage.progress.xp}</p>
                  <p className="text-xl font-semibold text-text-primary">{shareLink.payload.progress.xp}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">{t.sharePage.progress.currentStreak}</p>
                  <p className="text-xl font-semibold text-text-primary">
                    {shareLink.payload.progress.currentStreak}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">{t.sharePage.progress.bestStreak}</p>
                  <p className="text-xl font-semibold text-text-primary">{shareLink.payload.progress.bestStreak}</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <p className="text-xs text-text-muted">{t.sharePage.progress.weeklyGoal}</p>
                  <p className="text-xl font-semibold text-text-primary">
                    {shareLink.payload.progress.weeklyGoalProgress}/{shareLink.payload.progress.weeklyGoalTarget}
                  </p>
                </div>
              </div>
            </Card>
          </section>
        )}
      </motion.div>
    </main>
  );
}
