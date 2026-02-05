import { useEffect } from 'react';

interface UseCubeKeyboardProps {
  applyMove: (move: string) => void;
}

/**
 * Hook to handle keyboard controls for the Rubik's cube.
 * Maps WCA notation keys to cube moves:
 * - F, L, R, U, D, B → Clockwise rotation
 * - Shift + key → Counter-clockwise rotation (F', L', R', U', D', B')
 */
export function useCubeKeyboard({ applyMove }: UseCubeKeyboardProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();
      const validKeys = ['f', 'l', 'r', 'u', 'd', 'b'];

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
  }, [applyMove]);
}
