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

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="md"
        ariaLabel={t.sessions.manage}
        backdropClassName="bg-black/80 backdrop-blur-sm"
        containerClassName="p-4"
        className="flex flex-col max-h-[90vh]"
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <FolderOpen className="text-primary" size={24} aria-hidden="true" />
              <h2 className="text-xl font-bold text-text-primary">{t.sessions.manage}</h2>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="hover:bg-white/10 text-text-secondary hover:text-text-primary -mr-2 -mt-2"
              aria-label={t.actions.close}
            >
              <CloseCircle size={20} className="text-text-muted" />
            </Button>
          </header>

          {/* Content */}
          <section className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
            {/* Create New Session */}
            <div className="mb-8">
              <label
                htmlFor="new-session-name"
                className="block text-sm font-medium text-text-secondary mb-2"
              >
                {t.sessions.create}
              </label>
              <div className="flex gap-2">
                <input
                  id="new-session-name"
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleCreate)}
                  placeholder={t.sessions.namePlaceholder}
                  className="flex-1 px-4 py-2.5 bg-black/20 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
                <Button
                  onClick={handleCreate}
                  disabled={!newSessionName.trim()}
                  className="flex items-center gap-2 px-6 py-2.5"
                >
                  <AddCircle size={18} />
                  <span className="hidden sm:inline">{t.actions.create}</span>
                </Button>
              </div>
            </div>

            {/* Sessions List */}
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-3">{t.sessions.title}</h3>
              <ul className="space-y-3" aria-label="Lista de sessões">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className={`p-1 rounded-xl border-2 transition-all ${
                      session.id === activeSessionId
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent bg-white/5 hover:border-white/10'
                    }`}
                  >
                    {editingId === session.id ? (
                      // Edit Mode
                      <div className="flex gap-2 p-3">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, handleSaveEdit)}
                          className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          aria-label="Renomear sessão"
                        />
                        <Button
                          onClick={handleSaveEdit}
                          variant="success"
                          size="sm"
                          className="px-4"
                        >
                          {t.actions.save}
                        </Button>
                        <Button
                          onClick={handleCancelEdit}
                          variant="secondary"
                          size="sm"
                          className="px-4 bg-white/10 hover:bg-white/20 text-text-primary border-none"
                        >
                          {t.actions.cancel}
                        </Button>
                      </div>
                    ) : (
                      // View Mode
                      <div className="flex items-center justify-between p-3">
                        <button
                          type="button"
                          onClick={() => setActiveSession(session.id)}
                          className="flex-1 text-left group outline-none"
                          aria-label={`Selecionar sessão ${session.name}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-primary group-hover:text-primary transition-colors">
                              {session.name}
                            </span>
                            {session.id === activeSessionId && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-primary/20 text-primary border border-primary/30 rounded">
                                {t.sessions.active || 'Ativa'}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-text-muted mt-0.5">
                            {session.solves.length}{' '}
                            {getSolveCountText(
                              session.solves.length,
                              t.sessions.solveCountSingular,
                              t.sessions.solveCount,
                            )}
                          </p>
                        </button>
                        <div className="flex gap-1">
                          <Button
                            onClick={() => handleStartEdit(session.id, session.name)}
                            variant="ghost"
                            size="icon"
                            className="text-text-muted hover:text-text-primary hover:bg-white/10 rounded-lg"
                            title={t.sessions.rename}
                            aria-label={t.sessions.rename}
                          >
                            <Pen size={18} />
                          </Button>
                          <Button
                            onClick={() => setDeletingId(session.id)}
                            variant="ghost"
                            size="icon"
                            className="text-danger/60 hover:text-danger hover:bg-danger/10 rounded-lg"
                            title={t.sessions.delete}
                            aria-label={t.sessions.delete}
                          >
                            <TrashBin2 size={18} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Footer */}
          <footer className="p-6 border-t border-white/10 flex justify-end shrink-0">
            <Button
              onClick={onClose}
              variant="secondary"
              className="px-8 py-2.5 bg-white/5 hover:bg-white/10 text-text-primary border-none"
            >
              {t.actions.close}
            </Button>
          </footer>
        </div>
      </Modal>

      {/* Delete Confirmation */}
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

      {/* Success Toasts */}
      {showCreateSuccess && (
        <Toast
          message={t.sessions.createSuccess}
          type="success"
          onClose={() => setShowCreateSuccess(false)}
        />
      )}
      {showRenameSuccess && (
        <Toast
          message={t.sessions.renameSuccess}
          type="success"
          onClose={() => setShowRenameSuccess(false)}
        />
      )}
      {showDeleteSuccess && (
        <Toast
          message={t.sessions.deleteSuccess}
          type="success"
          onClose={() => setShowDeleteSuccess(false)}
        />
      )}
      {showCannotDeleteError && (
        <Toast
          message={t.sessions.cannotDeleteLast}
          type="error"
          onClose={() => setShowCannotDeleteError(false)}
        />
      )}
    </>
  );
};
