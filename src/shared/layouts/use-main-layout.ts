import { useLayoutEffect, useState } from 'react';

const SHELL_LOCK_CLASS = 'klick-shell-locked';

export function useMainLayout() {
  const [isSessionManagerOpen, setSessionManagerOpen] = useState(false);

  useLayoutEffect(() => {
    const lockTargets = [document.documentElement, document.body, document.getElementById('root')].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );

    for (const element of lockTargets) {
      element.classList.add(SHELL_LOCK_CLASS);
    }

    return () => {
      for (const element of lockTargets) {
        element.classList.remove(SHELL_LOCK_CLASS);
      }
    };
  }, []);

  return {
    isSessionManagerOpen,
    openSessionManager: () => setSessionManagerOpen(true),
    closeSessionManager: () => setSessionManagerOpen(false),
  };
}
