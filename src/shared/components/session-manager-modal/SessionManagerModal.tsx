import { X, Plus, Edit2, Trash2, FolderOpen } from 'lucide-react';
import { useI18nStore } from '@/shared/store/stores/i18nStore';
import { Toast, ConfirmDialog } from '@/shared';
import { Button, Modal } from '@/shared/components/ui';
import { useSessionManagerModal } from './useSessionManagerModal';

interface SessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SessionManagerModal({ isOpen, onClose }: SessionManagerModalProps) {
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
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <FolderOpen className="text-primary" size={24} />
            <h2 className="text-xl font-bold text-white">{t.sessions.manage}</h2>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="hover:bg-gray-700"
            aria-label={t.actions.close}
          >
            <X size={20} className="text-gray-400" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Create New Session */}
          <div className="mb-6">
            <label
              htmlFor="new-session-name"
              className="block text-sm font-medium text-gray-300 mb-2"
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
                className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary"
              />
              <Button
                onClick={handleCreate}
                disabled={!newSessionName.trim()}
                className="flex items-center gap-2 px-4 py-2"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">{t.actions.create}</span>
              </Button>
            </div>
          </div>

          {/* Sessions List */}
          <div>
            <label
              htmlFor="session-list"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              {t.sessions.title}
            </label>
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`p-4 bg-gray-700 rounded-lg border-2 transition-colors ${
                    session.id === activeSessionId ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  {editingId === session.id ? (
                    // Edit Mode
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, handleSaveEdit)}
                        className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-primary"
                      />
                      <Button
                        onClick={handleSaveEdit}
                        variant="success"
                        size="sm"
                        className="px-3 py-2"
                      >
                        {t.actions.save}
                      </Button>
                      <Button
                        onClick={handleCancelEdit}
                        variant="secondary"
                        size="sm"
                        className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white border-none"
                      >
                        {t.actions.cancel}
                      </Button>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-center justify-between">
                      <Button
                        onClick={() => {
                          setActiveSession(session.id);
                        }}
                        variant="ghost"
                        className="flex-1 w-full justify-start text-left text-white"
                      >
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white">{session.name}</p>
                          {session.id === activeSessionId && (
                            <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary border border-primary/30 rounded">
                              Ativa
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                          {session.solves.length}{' '}
                          {getSolveCountText(
                            session.solves.length,
                            t.sessions.solveCountSingular,
                            t.sessions.solveCount,
                          )}
                        </p>
                      </Button>
                      <div className="flex gap-1 ml-2">
                        <Button
                          onClick={() => handleStartEdit(session.id, session.name)}
                          variant="ghost"
                          size="icon"
                          className="hover:bg-gray-600"
                          title={t.sessions.rename}
                        >
                          <Edit2 size={16} className="text-gray-400" />
                        </Button>
                        <Button
                          onClick={() => setDeletingId(session.id)}
                          variant="ghost"
                          size="icon"
                          className="text-red-400 hover:bg-red-600/20"
                          title={t.sessions.delete}
                        >
                          <Trash2 size={16} className="text-red-400" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex justify-end">
          <Button
            onClick={onClose}
            variant="secondary"
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white border-none"
          >
            {t.actions.close}
          </Button>
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
}
