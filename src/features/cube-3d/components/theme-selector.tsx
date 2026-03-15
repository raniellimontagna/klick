import { Palette, Restart } from '@solar-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui';
import { Button } from '@/shared/components/ui/button';
import { useTranslation } from '@/shared/hooks/use-translation';
import { cn } from '@/shared/lib';
import { THEME_PRESETS } from '@/shared/lib/cube-platform/themes';
import { useCubePlatformThemeStore } from '@/shared/store/cube-platform-theme-store';

export function ThemeSelector() {
  const {
    currentThemeId,
    setTheme,
    resetToPreset,
    customColors,
    updateFaceColor,
    getCurrentPalette,
  } = useCubePlatformThemeStore();
  const { t } = useTranslation();
  const copy = t.cubeViewer.theme;
  const palette = getCurrentPalette();

  const faceNames = {
    UP: copy.faces.UP,
    DOWN: copy.faces.DOWN,
    FRONT: copy.faces.FRONT,
    BACK: copy.faces.BACK,
    LEFT: copy.faces.LEFT,
    RIGHT: copy.faces.RIGHT,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="rounded-xl">
          <Palette size={18} />
          {copy.trigger}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          {copy.presets}
        </div>

        {THEME_PRESETS.map((themePreset) => (
          <DropdownMenuItem
            key={themePreset.id}
            onClick={() => setTheme(themePreset.id)}
            className={cn(
              'flex cursor-pointer items-center justify-between gap-2',
              currentThemeId === themePreset.id && 'bg-primary/12 text-primary',
            )}
          >
            <span>{themePreset.name}</span>
            <div className="flex gap-1">
              {Object.entries(themePreset.colors)
                .slice(0, 4)
                .map(([key, color]) => (
                  <span
                    key={key}
                    className="h-2.5 w-2.5 rounded-full border border-black/10"
                    style={{ backgroundColor: color }}
                  />
                ))}
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          <span>{copy.custom}</span>
          {customColors ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                resetToPreset();
              }}
              className="rounded-full p-1 text-text-secondary transition-colors hover:text-primary"
              title={copy.reset}
            >
              <Restart size={12} />
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          {Object.entries(faceNames).map(([key, name]) => (
            <label key={key} className="space-y-1">
              <span className="text-[11px] text-text-secondary">{name}</span>
              <input
                type="color"
                value={palette[key as keyof typeof palette]}
                onChange={(event) => updateFaceColor(key, event.target.value)}
                className="h-8 w-full cursor-pointer overflow-hidden rounded-xl border border-border/70 bg-background/80 p-0"
              />
            </label>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
