import { useEffect } from 'react';
import { FACE_MOVE_KEYS } from '@/shared/lib/cube-platform/moves';

interface UseCubePlatformKeyboardProps {
  applyMove: (move: string) => void;
  enabled?: boolean;
}

/**
 * Hook to handle keyboard controls for the Rubik's cube.
 * Maps WCA notation keys to cube moves:
 * - F, L, R, U, D, B → Clockwise rotation
 * - Shift + key → Counter-clockwise rotation (F', L', R', U', D', B')
 */
export function useCubePlatformKeyboard({
  applyMove,
  enabled = true,
}: UseCubePlatformKeyboardProps) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (e.repeat) {
        return;
      }

      const validKeys = FACE_MOVE_KEYS.map((faceKey) => faceKey.toLowerCase());

      if (validKeys.includes(key)) {
        e.preventDefault();

        // Convert to uppercase for move notation
        const moveKey = key.toUpperCase();

        // If Shift is pressed, add prime (') for counter-clockwise
        const move = e.shiftKey ? `${moveKey}'` : moveKey;

        applyMove(move);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyMove, enabled]);
}
