import { AddCircle, CloseCircle, FolderOpen, Pen, TrashBin2 } from '@solar-icons/react';
import { ConfirmDialog, Toast } from '@/shared';
import { Button, Modal } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionManagerModal } from './use-session-manager-modal';

interface SessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SessionManagerModal: React.FC<SessionManagerModalProps> = ({
  isOpen,
  onClose,
}: SessionManagerModalProps): React.ReactElement | null => {
  const { t } = useI18nStore();
  const {
    sessions,
    activeSessionId,
    editingId,
    editingName,
    setEditingName,
    newSessionName,
    setNewSessionName,
    deletingId,
    setDeletingId,
    showCreateSuccess,
    setShowCreateSuccess,
    showRenameSuccess,
    setShowRenameSuccess,
    showDeleteSuccess,
    setShowDeleteSuccess,
    showCannotDeleteError,
    setShowCannotDeleteError,
    handleCreate,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleConfirmDelete,
    handleKeyDown,
    getSolveCountText,
    setActiveSession,
  } = useSessionManagerModal();

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="md"
        ariaLabel={t.sessions.manage}
        className="flex max-h-[90vh] flex-col"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/70 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="surface-base inline-flex h-11 w-11 items-center justify-center rounded-2xl text-primary">
              <FolderOpen size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">
                {t.sessions.title}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-text-primary">{t.sessions.manage}</h2>
            </div>
          </div>

          <Button onClick={onClose} variant="ghost" size="icon" aria-label={t.actions.close}>
            <CloseCircle size={20} className="text-text-muted" />
          </Button>
        </header>

        <section className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            <div className="surface-base rounded-[1.5rem] px-5 py-5">
              <label
                htmlFor="new-session-name"
                className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted"
              >
                {t.sessions.create}
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  id="new-session-name"
                  type="text"
                  value={newSessionName}
                  onChange={(event) => setNewSessionName(event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, handleCreate)}
                  placeholder={t.sessions.namePlaceholder}
                  className="h-11 flex-1 rounded-2xl border border-border/75 bg-background/40 px-4 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
                />
                <Button
                  onClick={handleCreate}
                  disabled={!newSessionName.trim()}
                  className="justify-center sm:min-w-40"
                >
                  <AddCircle size={18} />
                  {t.actions.create}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {t.sessions.title}
                </h3>
                <span className="surface-base rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                  {sessions.length}
                </span>
              </div>

              <ul className="grid gap-3" aria-label="Lista de sessões">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className={`rounded-[1.5rem] border px-4 py-4 ${
                      session.id === activeSessionId
                        ? 'border-primary/35 bg-primary/10'
                        : 'border-border/70 bg-surface/65'
                    }`}
                  >
                    {editingId === session.id ? (
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => handleKeyDown(event, handleSaveEdit)}
                          className="h-11 flex-1 rounded-2xl border border-border/75 bg-background/40 px-4 text-sm text-text-primary focus:border-primary focus:outline-none"
                          aria-label="Renomear sessão"
                        />
                        <div className="flex gap-2">
                          <Button onClick={handleSaveEdit} variant="success" size="sm">
                            {t.actions.save}
                          </Button>
                          <Button onClick={handleCancelEdit} variant="secondary" size="sm">
                            {t.actions.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <button
                          type="button"
                          onClick={() => setActiveSession(session.id)}
                          className="min-w-0 flex-1 text-left outline-none"
                          aria-label={`Selecionar sessão ${session.name}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-text-primary">
                              {session.name}
                            </span>
                            {session.id === activeSessionId ? (
                              <span className="rounded-full border border-primary/25 bg-primary/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                                {t.sessions.active || 'Ativa'}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-text-secondary">
                            {session.solves.length}{' '}
                            {getSolveCountText(
                              session.solves.length,
                              t.sessions.solveCountSingular,
                              t.sessions.solveCount,
                            )}
                          </p>
                        </button>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => handleStartEdit(session.id, session.name)}
                            variant="ghost"
                            size="sm"
                            title={t.sessions.rename}
                            aria-label={t.sessions.rename}
                          >
                            <Pen size={16} />
                            {t.sessions.rename}
                          </Button>
                          <Button
                            onClick={() => setDeletingId(session.id)}
                            variant="ghost"
                            size="sm"
                            title={t.sessions.delete}
                            aria-label={t.sessions.delete}
                            className="text-danger hover:text-danger"
                          >
                            <TrashBin2 size={16} />
                            {t.sessions.delete}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer className="flex justify-end border-t border-border/70 px-6 py-5">
          <Button onClick={onClose} variant="secondary">
            {t.actions.close}
          </Button>
        </footer>
      </Modal>

      <ConfirmDialog
        isOpen={deletingId !== null}
        onClose={() => setDeletingId(null)}
        onConfirm={handleConfirmDelete}
        title={t.sessions.deleteConfirm.title}
        message={t.sessions.deleteConfirm.message}
        confirmText={t.actions.delete}
        cancelText={t.actions.cancel}
        variant="danger"
      />

      {showCreateSuccess ? (
        <Toast
          message={t.sessions.createSuccess}
          type="success"
          onClose={() => setShowCreateSuccess(false)}
        />
      ) : null}
      {showRenameSuccess ? (
        <Toast
          message={t.sessions.renameSuccess}
          type="success"
          onClose={() => setShowRenameSuccess(false)}
        />
      ) : null}
      {showDeleteSuccess ? (
        <Toast
          message={t.sessions.deleteSuccess}
          type="success"
          onClose={() => setShowDeleteSuccess(false)}
        />
      ) : null}
      {showCannotDeleteError ? (
        <Toast
          message={t.sessions.cannotDeleteLast}
          type="error"
          onClose={() => setShowCannotDeleteError(false)}
        />
      ) : null}
    </>
  );
};
