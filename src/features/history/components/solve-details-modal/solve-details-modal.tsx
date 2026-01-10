import {
  CalendarMinimalistic,
  ClockCircle,
  CloseCircle,
  Copy,
  DangerTriangle,
} from '@solar-icons/react';
import { useMemo } from 'react';
import { solveCubeState } from '@/features/home/lib/scramble/cube-solver';
import { CubeVisualizer } from '@/shared/components/cube-visualizer/cube-visualizer';
import { Button, Modal } from '@/shared/components/ui';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { useSolveDetailsModal } from './use-solve-details-modal';

interface SolveDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  solveId: string | null;
  solveNumber: number;
}

export function SolveDetailsModal({
  isOpen,
  onClose,
  solveId,
  solveNumber,
}: SolveDetailsModalProps) {
  const { t } = useI18nStore();
  const { getActiveSession } = useSessionsStore();

  // Fetch fresh solve data from store
  const session = getActiveSession();
  const solve = session?.solves.find((s) => s.id === solveId) || null;

  const { copied, copyScramble, formatFullDate, penaltyInfo, togglePenalty } =
    useSolveDetailsModal(solve);

  // Memoize cube state to avoid re-calculating on every render unless scramble changes
  const cubeState = useMemo(() => {
    if (!solve?.scramble) return null;
    try {
      return solveCubeState(solve.scramble);
    } catch (e) {
      console.error('Failed to solve cube state', e);
      return null;
    }
  }, [solve?.scramble]);

  if (!solve) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      ariaLabel={`${t.solveTable.details.title} #${solveNumber}`}
      containerClassName="p-0 max-w-4xl bg-background border border-white/10"
      className="flex flex-col h-[90vh] sm:h-auto sm:max-h-[85vh]"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/5 bg-surface/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex flex-col">
          <h2 className="text-xl sm:text-2xl font-bold text-text-primary">
            {t.solveTable.details.title} #{solveNumber}
          </h2>
          <span className="text-sm text-text-muted flex items-center gap-2 mt-1">
            <CalendarMinimalistic size={14} />
            {formatFullDate(solve.createdAt)}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl glass-button border border-white/10 hover:border-white/20 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-all"
        >
          <CloseCircle size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Visualizer & Scramble */}
        <div className="space-y-6">
          {/* Visualizer */}
          <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center min-h-[200px] bg-gradient-to-b from-white/5 to-transparent">
            {cubeState ? (
              <CubeVisualizer
                config={{
                  faces: [
                    { label: 'U', colors: cubeState.U },
                    { label: 'F', colors: cubeState.F },
                    { label: 'R', colors: cubeState.R },
                    { label: 'D', colors: cubeState.D },
                    { label: 'L', colors: cubeState.L },
                    { label: 'B', colors: cubeState.B },
                  ],
                }}
                className="bg-transparent border-none p-0 scale-90 sm:scale-100"
              />
            ) : (
              <span className="text-text-muted">
                {t.solveTable.details.visualizationUnavailable}
              </span>
            )}
          </div>

          {/* Scramble Text */}
          <div className="glass p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                {t.solveTable.details.scramble}
              </span>
              <Button
                onClick={copyScramble}
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-primary hover:text-primary-hover hover:bg-primary/10"
              >
                {copied ? (
                  <span className="flex items-center gap-1">{t.scramble.copySuccess}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Copy size={12} /> {t.scramble.copy}
                  </span>
                )}
              </Button>
            </div>
            <p className="font-mono text-lg text-text-primary leading-relaxed text-center">
              {solve.scramble}
            </p>
          </div>
        </div>

        {/* Right Column: Stats & Actions */}
        <div className="space-y-6">
          {/* Main Time Card */}
          <div className="glass p-8 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0 opacity-50"></div>

            <span className="text-sm text-text-muted mb-2 font-medium uppercase tracking-widest">
              {t.solveTable.details.finalTime}
            </span>
            <div className="relative">
              <span
                className={`text-6xl sm:text-7xl font-mono font-bold tracking-tighter ${solve.penalty === 'DNF' ? 'text-danger' : 'text-text-primary'}`}
              >
                {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
              </span>
              {solve.penalty === '+2' && (
                <span className="absolute -top-4 -right-8 text-lg font-bold text-warning bg-warning/10 px-2 py-0.5 rounded-full border border-warning/20 transform rotate-12">
                  +2
                </span>
              )}
            </div>

            {/* Penalty Actions */}
            <div className="flex items-center gap-3 mt-8">
              <Button
                onClick={() => togglePenalty('+2')}
                variant={solve.penalty === '+2' ? 'primary' : 'secondary'}
                className={`font-bold transition-all ${solve.penalty === '+2' ? 'bg-warning text-black hover:bg-warning/90' : 'bg-white/5 hover:bg-white/10 border border-white/10'}`}
              >
                +2
              </Button>
              <Button
                onClick={() => togglePenalty('DNF')}
                variant={solve.penalty === 'DNF' ? 'primary' : 'secondary'}
                className={`font-bold transition-all ${solve.penalty === 'DNF' ? 'bg-danger text-white hover:bg-danger/90' : 'bg-white/5 hover:bg-white/10 border border-white/10'}`}
              >
                DNF
              </Button>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass p-4 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 mb-1 text-text-muted">
                <ClockCircle size={16} />
                <span className="text-xs font-bold uppercase">{t.solveTable.details.baseTime}</span>
              </div>
              <span className="text-xl font-mono font-semibold text-text-secondary">
                {formatTime(solve.timeMs)}
              </span>
            </div>
            <div className="glass p-4 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 mb-1 text-text-muted">
                <DangerTriangle size={16} />
                <span className="text-xs font-bold uppercase">{t.solveTable.details.penalty}</span>
              </div>
              <span className={`text-xl font-bold ${penaltyInfo.color}`}>
                {solve.penalty ? solve.penalty : t.penalties.none}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
