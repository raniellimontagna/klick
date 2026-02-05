import { Palette, Restart } from '@solar-icons/react';
import { Button } from '@/shared/components/ui/button';
import { useCubeTheme } from '../hooks/use-cube-theme';
import { THEME_PRESETS } from '../lib/cube-themes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui';

export function ThemeSelector() {
  const {
    currentThemeId,
    setTheme,
    resetToPreset,
    customColors,
    updateFaceColor,
    getCurrentPalette,
  } = useCubeTheme();
  const palette = getCurrentPalette();

  const faceNames = {
    UP: 'Top (White)',
    DOWN: 'Bottom (Yellow)',
    FRONT: 'Front (Green)',
    BACK: 'Back (Blue)',
    LEFT: 'Left (Orange)',
    RIGHT: 'Right (Red)',
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="gap-2 bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60"
        >
          <Palette size={16} />
          <span>Themes</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 bg-surface/90 backdrop-blur-xl border-white/10"
      >
        <div className="p-2 text-xs font-bold text-white/40 uppercase tracking-widest">Presets</div>
        {THEME_PRESETS.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className={`flex items-center justify-between gap-2 cursor-pointer ${
              currentThemeId === theme.id ? 'bg-primary/20 text-primary' : ''
            }`}
          >
            <span>{theme.name}</span>
            <div className="flex gap-0.5">
              {Object.entries(theme.colors)
                .slice(0, 4)
                .map(([key, c]) => (
                  <div key={key} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                ))}
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="bg-white/5" />

        <div className="p-2 text-xs font-bold text-white/40 uppercase tracking-widest flex justify-between items-center">
          Custom Colors
          {customColors && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                resetToPreset();
              }}
              className="hover:text-primary transition-colors text-white/40"
              title="Reset to preset"
            >
              <Restart size={12} />
            </button>
          )}
        </div>

        <div className="p-2 grid grid-cols-2 gap-2">
          {Object.entries(faceNames).map(([key, name]) => (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-[10px] text-white/60 truncate" title={name}>
                {name.split(' ')[0]}
              </span>
              <input
                type="color"
                value={palette[key as keyof typeof palette]}
                onChange={(e) => updateFaceColor(key, e.target.value)}
                className="w-full h-6 rounded bg-black/20 border-none cursor-pointer p-0 overflow-hidden"
              />
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
