import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/shared/hooks/use-theme';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { useSettingsStore } from '@/shared/store/settings-store';

type ExportImportMessage = {
  type: 'success' | 'error';
  text: string;
} | null;

type ImportMode = 'merge' | 'replace';

export function useSettingsContent() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const sessions = useSessionsStore((state) => state.sessions);
  const getActiveSession = useSessionsStore((state) => state.getActiveSession);
  const exportCurrentSession = useSessionsStore((state) => state.exportCurrentSession);
  const exportAllSessions = useSessionsStore((state) => state.exportAllSessions);
  const importSessions = useSessionsStore((state) => state.importSessions);
  const { t } = useI18nStore();
  const { theme, toggleTheme } = useTheme();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [message, setMessage] = useState<ExportImportMessage>(null);

  const activeSession = getActiveSession();
  const activeSessionSolveCount = activeSession?.solves.length ?? 0;
  const themeLabel = theme === 'light' ? t.settings.theme.light : t.settings.theme.dark;

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const publishMessage = (nextMessage: NonNullable<ExportImportMessage>, duration = 4500) => {
    setMessage(nextMessage);

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setMessage(null);
      timeoutRef.current = null;
    }, duration);
  };

  const handleInspectionDurationChange = (value: number) => {
    updateSettings({ inspectionDuration: value });
  };

  const handleSoundsToggle = () => {
    updateSettings({ soundsEnabled: !settings.soundsEnabled });
  };

  const handleAutoInspectionPenaltyToggle = () => {
    updateSettings({ autoInspectionPenalty: !settings.autoInspectionPenalty });
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleExportCurrent = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(exportCurrentSession(), `klick-session-${timestamp}.json`);
    publishMessage({ type: 'success', text: t.settings.exportImport.exportSuccess });
  };

  const handleExportAll = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(exportAllSessions(), `klick-all-sessions-${timestamp}.json`);
    publishMessage({ type: 'success', text: t.settings.exportImport.exportSuccess });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = (loadEvent) => {
      const content = loadEvent.target?.result as string;
      const result = importSessions(content, importMode);

      if (result.success) {
        publishMessage({ type: 'success', text: t.settings.exportImport.importSuccess }, 5200);
      } else {
        publishMessage(
          {
            type: 'error',
            text: `${t.settings.exportImport.importError} ${result.error ?? ''}`.trim(),
          },
          5600,
        );
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  };

  return {
    t,
    settings,
    sessions,
    activeSession,
    activeSessionSolveCount,
    theme,
    themeLabel,
    toggleTheme,
    fileInputRef,
    importMode,
    setImportMode,
    message,
    handleInspectionDurationChange,
    handleSoundsToggle,
    handleAutoInspectionPenaltyToggle,
    handleExportCurrent,
    handleExportAll,
    handleImportClick,
    handleFileChange,
  };
}
