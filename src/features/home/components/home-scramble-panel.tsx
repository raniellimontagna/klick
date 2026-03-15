import { memo } from 'react';
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

export const HomeScramblePanel = memo(function HomeScramblePanel({
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
        className="surface-panel rounded-3xl p-4 sm:p-5"
        aria-label={t.homeRevamp.scramble.sectionLabel}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              {t.homeRevamp.scramble.title}
            </p>
            <h2 className="mt-1 text-base font-semibold text-text-primary sm:text-lg">
              {t.homeRevamp.scramble.subtitle}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-2xl text-text-secondary hover:text-text-primary"
              onClick={openGuide}
              aria-label={t.scramble.guide}
              title={t.scramble.guide}
            >
              <QuestionCircle size={18} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="rounded-2xl border-border/75 bg-surface/72 text-text-primary"
              onClick={onCopy}
            >
              {copied ? <CheckCircle size={16} className="text-emerald-300" /> : <Copy size={16} />}
              {copied ? t.scramble.copySuccess : t.scramble.copy}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-10 w-10 rounded-2xl text-text-primary"
              onClick={onNewScramble}
              aria-label={t.scramble.new}
              title={t.scramble.new}
            >
              <Restart size={16} />
            </Button>
          </div>
        </div>

        <p className="mt-4 rounded-2xl border border-border/75 bg-surface/62 p-4 font-mono text-base font-semibold leading-relaxed tracking-tight text-text-primary sm:text-xl">
          {scramble || t.scramble.generating}
        </p>

        <div
          className="mt-4 rounded-2xl border border-border/75 bg-surface/66 p-1"
          role="tablist"
          aria-label={t.homeRevamp.scramble.viewModeLabel}
        >
          <div className="grid grid-cols-2 gap-1">
            <Button
              size="sm"
              variant={visualizationMode === '3d' ? 'primary' : 'ghost'}
              className={
                visualizationMode === '3d'
                  ? 'rounded-[1rem]'
                  : 'rounded-[1rem] border border-transparent text-text-secondary hover:bg-surface-hover/75'
              }
              onClick={() => onChangeVisualizationMode('3d')}
              aria-pressed={visualizationMode === '3d'}
            >
              <Box size={16} />
              {t.homeRevamp.scramble.view3d}
            </Button>
            <Button
              size="sm"
              variant={visualizationMode === '2d' ? 'primary' : 'ghost'}
              className={
                visualizationMode === '2d'
                  ? 'rounded-[1rem]'
                  : 'rounded-[1rem] border border-transparent text-text-secondary hover:bg-surface-hover/75'
              }
              onClick={() => onChangeVisualizationMode('2d')}
              aria-pressed={visualizationMode === '2d'}
            >
              <Widget size={16} />
              {t.homeRevamp.scramble.view2d}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-text-muted">{t.homeRevamp.scramble.viewHint}</p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border/75 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--color-surface-hover)_72%,transparent)_0%,color-mix(in_srgb,var(--color-background)_95%,transparent)_100%)]">
          {isFocusMode ? (
            <div className="flex h-44 items-center justify-center px-6 text-center text-sm text-text-secondary sm:h-56">
              {t.homeRevamp.scramble.focusModeMessage}
            </div>
          ) : visualizationMode === '3d' ? (
            <div className="h-44 w-full sm:h-56">
              <CubePlatform
                algorithm={scramble}
                mode="static"
                interactive={false}
                cameraPreset="home"
                showPlaybackControls={false}
                className="h-full w-full"
              />
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
              className="h-44 border-none bg-transparent sm:h-56"
            />
          ) : (
            <div className="flex h-44 items-center justify-center px-6 text-center text-sm text-text-secondary sm:h-56">
              {t.homeRevamp.scramble.visualUnavailable}
            </div>
          )}
        </div>
      </section>

      <ScrambleGuideModal isOpen={isOpen} onClose={closeGuide} />
    </>
  );
});
