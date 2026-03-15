import { MedalRibbon, ShieldCheck, Target } from '@solar-icons/react';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { ProgressChallenge, ProgressSummary } from '@/shared/types';

interface HomeProgressPanelProps {
  summary: ProgressSummary;
  challenges: ProgressChallenge[];
}

function getChallengeTitle(
  challenge: ProgressChallenge,
  strings: ReturnType<typeof useI18nStore.getState>['t'],
): string {
  if (challenge.type === 'solve_count') {
    return strings.progressHub.challengeTypes.solveCount.title.replace(
      '{target}',
      String(challenge.targetValue),
    );
  }

  if (challenge.type === 'clean_streak') {
    return strings.progressHub.challengeTypes.cleanStreak.title.replace(
      '{target}',
      String(challenge.targetValue),
    );
  }

  const targetTime = challenge.targetMs ? formatTime(challenge.targetMs) : '--';

  return strings.progressHub.challengeTypes.ao5Target.title.replace('{targetTime}', targetTime);
}

function getChallengeDescription(
  challenge: ProgressChallenge,
  strings: ReturnType<typeof useI18nStore.getState>['t'],
): string {
  if (challenge.type === 'solve_count') {
    return strings.progressHub.challengeTypes.solveCount.description;
  }

  if (challenge.type === 'clean_streak') {
    return strings.progressHub.challengeTypes.cleanStreak.description;
  }

  return strings.progressHub.challengeTypes.ao5Target.description;
}

export function HomeProgressPanel({ summary, challenges }: HomeProgressPanelProps) {
  const { t } = useI18nStore();

  const xpLevelSize = summary.xpIntoLevel + summary.xpToNextLevel;
  const xpPercent = xpLevelSize > 0 ? Math.min(100, (summary.xpIntoLevel / xpLevelSize) * 100) : 0;

  const weeklyProgress =
    summary.weeklySolveTarget > 0
      ? Math.min(100, (summary.weeklySolveCount / summary.weeklySolveTarget) * 100)
      : 0;

  const weeklyRemaining = Math.max(0, summary.weeklySolveTarget - summary.weeklySolveCount);

  return (
    <section className="surface-panel rounded-3xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            {t.progressHub.title}
          </p>
          <p className="mt-1 text-sm text-text-secondary">{t.progressHub.subtitle}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-border/75 bg-surface/62 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {t.progressHub.streakLabel}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-2xl font-black tracking-tight text-text-primary">
            <ShieldCheck size={18} />
            {t.progressHub.streakValue.replace('{count}', String(summary.currentStreak))}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            {t.progressHub.bestStreakLabel.replace('{count}', String(summary.bestStreak))}
          </p>
        </article>

        <article className="rounded-2xl border border-border/75 bg-surface/62 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {t.progressHub.levelLabel}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-2xl font-black tracking-tight text-text-primary">
            <MedalRibbon size={18} />
            Lv. {summary.level}
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            {t.progressHub.xpLabel}: {summary.xpIntoLevel}/{summary.xpIntoLevel + summary.xpToNextLevel}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-hover/70">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#7C4DFF,#39FF88)] transition-all"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
        </article>

        <article className="rounded-2xl border border-border/75 bg-surface/62 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {t.progressHub.weeklyGoalLabel}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-2xl font-black tracking-tight text-text-primary">
            <Target size={18} />
            {summary.weeklySolveCount}/{summary.weeklySolveTarget}
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            {summary.weeklyGoalCompleted
              ? t.progressHub.weeklyGoalStatusDone
              : t.progressHub.weeklyGoalStatusPending.replace('{remaining}', String(weeklyRemaining))}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-hover/70">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${weeklyProgress}%` }}
            />
          </div>
        </article>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          {t.progressHub.challengesTitle}
        </p>

        {challenges.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border/75 bg-surface/58 p-6 text-center text-sm text-text-secondary">
            {t.progressHub.empty}
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-3">
            {challenges.map((challenge) => {
              const progressPercent = Math.min(
                100,
                Math.max(0, (challenge.progressValue / Math.max(challenge.targetValue, 1)) * 100),
              );

              return (
                <li
                  key={`${challenge.dateKey}-${challenge.type}`}
                  className="rounded-2xl border border-border/75 bg-surface/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {getChallengeTitle(challenge, t)}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-text-muted">
                        {getChallengeDescription(challenge, t)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                        challenge.isCompleted
                          ? 'border border-accent/35 bg-accent/16 text-accent'
                          : 'border border-border/80 bg-surface/75 text-text-secondary'
                      }`}
                    >
                      {challenge.isCompleted
                        ? t.progressHub.challengeDone
                        : t.progressHub.challengeInProgress}
                    </span>
                  </div>

                  <p className="mt-3 text-xs font-semibold text-text-secondary">
                    {t.progressHub.progressText
                      .replace('{current}', String(challenge.progressValue))
                      .replace('{target}', String(challenge.targetValue))}
                  </p>

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-hover/70">
                    <div
                      className={`h-full rounded-full transition-all ${
                        challenge.isCompleted ? 'bg-accent' : 'bg-primary'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
