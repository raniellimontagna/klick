import { useCallback, useState } from 'react';
import { shouldPlaySound, sounds } from '@/shared/lib';
import { useSettingsStore } from '@/shared/store/settings-store';

export function useScrambleBox(scramble: string) {
  const [copied, setCopied] = useState(false);
  const { settings } = useSettingsStore();

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(scramble);
    setCopied(true);

    // Play success sound
    if (shouldPlaySound(settings.soundsEnabled)) {
      sounds.success();
    }

    setTimeout(() => setCopied(false), 2000);
  }, [scramble, settings.soundsEnabled]);

  return {
    copied,
    copyToClipboard,
  };
}
