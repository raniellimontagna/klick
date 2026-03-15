function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export function shouldIgnoreGlobalShortcut(target: EventTarget | null): boolean {
  if (isEditableTarget(target)) {
    return true;
  }

  if (typeof document === 'undefined') {
    return false;
  }

  if (isEditableTarget(document.activeElement)) {
    return true;
  }

  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}
