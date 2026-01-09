import { useState, useCallback } from 'react';
import { useSessionsStore } from '@/shared/store/stores/sessionsStore';

export function useSessionManagerModal() {
  const {
    sessions,
    activeSessionId,
    createSession,
    renameSession,
    deleteSession,
    setActiveSession,
  } = useSessionsStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newSessionName, setNewSessionName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const [showRenameSuccess, setShowRenameSuccess] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [showCannotDeleteError, setShowCannotDeleteError] = useState(false);

  const handleCreate = useCallback(() => {
    if (newSessionName.trim()) {
      createSession(newSessionName.trim());
      setNewSessionName('');
      setShowCreateSuccess(true);
    }
  }, [newSessionName, createSession]);

  const handleStartEdit = useCallback((id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingId && editingName.trim()) {
      renameSession(editingId, editingName.trim());
      setEditingId(null);
      setEditingName('');
      setShowRenameSuccess(true);
    }
  }, [editingId, editingName, renameSession]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName('');
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (deletingId) {
      if (sessions.length === 1) {
        setShowCannotDeleteError(true);
        setDeletingId(null);
        return;
      }
      deleteSession(deletingId);
      setDeletingId(null);
      setShowDeleteSuccess(true);
    }
  }, [deletingId, sessions.length, deleteSession]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, action: () => void) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        action();
      } else if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleCancelEdit],
  );

  const getSolveCountText = useCallback((count: number, singular: string, plural: string) => {
    return count === 1 ? singular : plural;
  }, []);

  return {
    // State
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

    // Actions
    handleCreate,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleConfirmDelete,
    handleKeyDown,
    getSolveCountText,
    setActiveSession,
  };
}
