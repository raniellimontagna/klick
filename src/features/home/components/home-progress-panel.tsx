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
    <section className="rounded-3xl border border-white/10 bg-zinc-900/70 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {t.progressHub.title}
          </p>
          <p className="mt-1 text-sm text-zinc-300">{t.progressHub.subtitle}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            {t.progressHub.streakLabel}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-2xl font-black tracking-tight text-zinc-100">
            <ShieldCheck size={18} />
            {t.progressHub.streakValue.replace('{count}', String(summary.currentStreak))}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            {t.progressHub.bestStreakLabel.replace('{count}', String(summary.bestStreak))}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            {t.progressHub.levelLabel}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-2xl font-black tracking-tight text-zinc-100">
            <MedalRibbon size={18} />
            Lv. {summary.level}
          </p>
          <p className="mt-2 text-xs text-zinc-300">
            {t.progressHub.xpLabel}: {summary.xpIntoLevel}/{summary.xpIntoLevel + summary.xpToNextLevel}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#7C4DFF,#39FF88)] transition-all"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
        </article>

        <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            {t.progressHub.weeklyGoalLabel}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-2xl font-black tracking-tight text-zinc-100">
            <Target size={18} />
            {summary.weeklySolveCount}/{summary.weeklySolveTarget}
          </p>
          <p className="mt-2 text-xs text-zinc-300">
            {summary.weeklyGoalCompleted
              ? t.progressHub.weeklyGoalStatusDone
              : t.progressHub.weeklyGoalStatusPending.replace('{remaining}', String(weeklyRemaining))}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${weeklyProgress}%` }}
            />
          </div>
        </article>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
          {t.progressHub.challengesTitle}
        </p>

        {challenges.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-white/20 bg-black/20 p-6 text-center text-sm text-zinc-300">
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
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">
                        {getChallengeTitle(challenge, t)}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                        {getChallengeDescription(challenge, t)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                        challenge.isCompleted
                          ? 'border border-emerald-300/30 bg-emerald-300/15 text-emerald-200'
                          : 'border border-white/15 bg-white/5 text-zinc-300'
                      }`}
                    >
                      {challenge.isCompleted
                        ? t.progressHub.challengeDone
                        : t.progressHub.challengeInProgress}
                    </span>
                  </div>

                  <p className="mt-3 text-xs font-semibold text-zinc-300">
                    {t.progressHub.progressText
                      .replace('{current}', String(challenge.progressValue))
                      .replace('{target}', String(challenge.targetValue))}
                  </p>

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${
                        challenge.isCompleted ? 'bg-emerald-300' : 'bg-primary'
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
