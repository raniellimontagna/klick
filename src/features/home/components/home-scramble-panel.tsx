import {
  Box,
  CheckCircle,
  Copy,
  QuestionCircle,
  Restart,
  Widget,
} from '@solar-icons/react';
import type { CubeState } from '@/features/home/lib/scramble/cube-solver';
import { CubePlatform, CubeVisualizer } from '@/shared';
import { ScrambleGuideModal, useScrambleGuideModal } from '@/shared/components/scramble-guide-modal';
import { Button } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { HomeVisualizationMode } from '../hooks/use-home-timer-dashboard';

interface HomeScramblePanelProps {
  scramble: string;
  cubeState: CubeState | null;
  copied: boolean;
  isFocusMode: boolean;
  visualizationMode: HomeVisualizationMode;
  onCopy: () => Promise<void>;
  onNewScramble: () => void;
  onChangeVisualizationMode: (mode: HomeVisualizationMode) => void;
}

export function HomeScramblePanel({
  scramble,
  cubeState,
  copied,
  isFocusMode,
  visualizationMode,
  onCopy,
  onNewScramble,
  onChangeVisualizationMode,
}: HomeScramblePanelProps) {
  const { t } = useI18nStore();
  const { isOpen, openGuide, closeGuide } = useScrambleGuideModal();

  return (
    <>
      <section
        data-onboarding="scramble"
        className="surface-panel rounded-3xl p-5 sm:p-6"
        aria-label={t.homeRevamp.scramble.sectionLabel}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              {t.homeRevamp.scramble.title}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-text-primary">{t.homeRevamp.scramble.subtitle}</h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-text-secondary hover:text-text-primary"
              onClick={openGuide}
              aria-label={t.scramble.guide}
              title={t.scramble.guide}
            >
              <QuestionCircle size={18} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="border-border/75 bg-surface/72 text-text-primary"
              onClick={onCopy}
            >
              {copied ? <CheckCircle size={16} className="text-emerald-300" /> : <Copy size={16} />}
              {copied ? t.scramble.copySuccess : t.scramble.copy}
            </Button>
            <Button variant="primary" size="sm" onClick={onNewScramble}>
              <Restart size={16} />
              {t.scramble.new}
            </Button>
          </div>
        </div>

        <p className="mt-4 rounded-2xl border border-border/75 bg-surface/60 p-4 font-mono text-lg font-semibold leading-relaxed tracking-tight text-text-primary sm:text-2xl">
          {scramble || t.scramble.generating}
        </p>

        <div className="mt-4 flex items-center gap-2" role="tablist" aria-label={t.homeRevamp.scramble.viewModeLabel}>
          <Button
            size="sm"
            variant={visualizationMode === '3d' ? 'primary' : 'secondary'}
            className={visualizationMode === '3d' ? '' : 'border-border/75 bg-surface/70 text-text-secondary'}
            onClick={() => onChangeVisualizationMode('3d')}
            aria-pressed={visualizationMode === '3d'}
          >
            <Box size={16} />
            {t.homeRevamp.scramble.view3d}
          </Button>
          <Button
            size="sm"
            variant={visualizationMode === '2d' ? 'primary' : 'secondary'}
            className={visualizationMode === '2d' ? '' : 'border-border/75 bg-surface/70 text-text-secondary'}
            onClick={() => onChangeVisualizationMode('2d')}
            aria-pressed={visualizationMode === '2d'}
          >
            <Widget size={16} />
            {t.homeRevamp.scramble.view2d}
          </Button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border/75 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--color-surface-hover)_78%,transparent)_0%,color-mix(in_srgb,var(--color-background)_95%,transparent)_100%)]">
          {isFocusMode ? (
            <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-text-secondary">
              {t.homeRevamp.scramble.focusModeMessage}
            </div>
          ) : visualizationMode === '3d' ? (
            <div className="h-72 w-full">
              <CubePlatform algorithm={scramble} interactive={false} className="h-full w-full" />
            </div>
          ) : cubeState ? (
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
              className="h-72 border-none bg-transparent"
            />
          ) : (
            <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-text-secondary">
              {t.homeRevamp.scramble.visualUnavailable}
            </div>
          )}
        </div>
      </section>

      <ScrambleGuideModal isOpen={isOpen} onClose={closeGuide} />
    </>
  );
}
