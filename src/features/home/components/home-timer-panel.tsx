import { Bolt, ClockCircle, Stopwatch, Target } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Penalty, TimerState } from '@/shared/types';

interface HomeTimerPanelProps {
  state: TimerState;
  timeMs: number;
  inspectionTimeLeft: number;
  inspectionDuration: number;
  isNewBest: boolean;
  lastPenalty: Penalty;
}

function getStatusLabel(
  state: TimerState,
  isNewBest: boolean,
  penalty: Penalty,
  strings: ReturnType<typeof useI18nStore.getState>['t'],
) {
  if (state === 'inspection') {
    return strings.homeRevamp.timer.inspectionLabel;
  }

  if (state === 'running') {
    return strings.homeRevamp.timer.runningLabel;
  }

  if (state === 'stopped' && isNewBest) {
    return strings.homeRevamp.timer.personalBest;
  }

  if (state === 'stopped' && penalty === '+2') {
    return strings.homeRevamp.timer.plusTwoApplied;
  }

  if (state === 'stopped' && penalty === 'DNF') {
    return strings.homeRevamp.timer.dnfApplied;
  }

  return strings.timer.ready;
}

export function HomeTimerPanel({
  state,
  timeMs,
  inspectionTimeLeft,
  inspectionDuration,
  isNewBest,
  lastPenalty,
}: HomeTimerPanelProps) {
  const { t } = useI18nStore();
  const isInspection = state === 'inspection';

  const progressPercent = Math.max(
    0,
    Math.min(100, (inspectionTimeLeft / Math.max(inspectionDuration, 1)) * 100),
  );

  const statusLabel = getStatusLabel(state, isNewBest, lastPenalty, t);

  const timerToneClass =
    state === 'running'
      ? 'text-emerald-300'
      : state === 'inspection'
        ? 'text-amber-300'
        : state === 'stopped' && lastPenalty === 'DNF'
          ? 'text-rose-300'
          : 'text-zinc-100';

  return (
    <section
      data-onboarding="timer"
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,#2a2156_0%,#0f1524_52%,#090d14_100%)] p-5 sm:p-8"
      aria-label={t.homeRevamp.timer.sectionLabel}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(57,255,136,0.08),transparent_30%,transparent_70%,rgba(124,77,255,0.2))]" />

      <div className="relative z-10 flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
            <Stopwatch size={16} />
            {statusLabel}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">
              {t.homeRevamp.timer.modeLabel}
            </p>
            <p className="text-sm font-semibold text-zinc-200">{t.homeRevamp.timer.spaceHint}</p>
          </div>
        </div>

        <div className="space-y-5">
          <motion.div
            key={`${state}-${Math.floor(timeMs / 100)}`}
            animate={{ scale: state === 'running' ? 1.03 : 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            className={`font-mono text-center text-6xl font-black tracking-tight tabular-nums sm:text-7xl lg:text-8xl ${timerToneClass}`}
            role="timer"
            aria-valuenow={timeMs}
          >
            {formatTime(timeMs)}
          </motion.div>

          {isInspection && (
            <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-300/10 p-4">
              <div className="flex items-center justify-between text-amber-100">
                <div className="inline-flex items-center gap-2 text-sm font-semibold">
                  <ClockCircle size={18} />
                  {t.homeRevamp.timer.inspectionCountdown}
                </div>
                <span className="font-mono text-xl font-black tabular-nums">
                  {Math.ceil(inspectionTimeLeft)}s
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-amber-500/20">
                <div
                  className="h-full rounded-full bg-amber-300 transition-all duration-100"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="mb-1 text-xs uppercase tracking-[0.16em] text-zinc-400">
              {t.homeRevamp.timer.finishLabel}
            </p>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Target size={16} />
              {t.homeRevamp.timer.finishHint}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
            <p className="mb-1 text-xs uppercase tracking-[0.16em] text-emerald-100/90">
              {t.homeRevamp.timer.feedbackLabel}
            </p>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-100">
              <Bolt size={16} />
              {isNewBest ? t.homeRevamp.timer.personalBest : t.homeRevamp.timer.feedbackHint}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
