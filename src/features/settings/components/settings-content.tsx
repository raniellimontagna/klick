import { CloudDownload, CloudUpload, Moon, Sun } from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState } from 'react';
import {
  Button,
  Card,
  RadioButton,
  RadioGroup,
  RangeSlider,
  ToggleButton,
} from '@/shared/components/ui';
import { useTheme } from '@/shared/hooks/use-theme';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { useSettingsStore } from '@/shared/store/settings-store';

type ExportImportMessage = {
  type: 'success' | 'error';
  text: string;
} | null;

export function SettingsContent() {
  const { settings, updateSettings } = useSettingsStore();
  const { exportCurrentSession, exportAllSessions, importSessions } = useSessionsStore();
  const { t } = useI18nStore();
  const { theme, toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [message, setMessage] = useState<ExportImportMessage>(null);

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
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCurrent = () => {
    const json = exportCurrentSession();
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(json, `klick-session-${timestamp}.json`);
    setMessage({ type: 'success', text: t.settings.exportImport.exportSuccess });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExportAll = () => {
    const json = exportAllSessions();
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(json, `klick-all-sessions-${timestamp}.json`);
    setMessage({ type: 'success', text: t.settings.exportImport.exportSuccess });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = importSessions(content, importMode);

      if (result.success) {
        setMessage({ type: 'success', text: t.settings.exportImport.importSuccess });
      } else {
        setMessage({
          type: 'error',
          text: `${t.settings.exportImport.importError} ${result.error || ''}`,
        });
      }
      setTimeout(() => setMessage(null), 5000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Message feedback */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-lg border ${
              message.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inspection Duration */}
      <Card className="space-y-4">
        <div>
          <div className="block text-sm font-semibold text-text-primary mb-1">
            {t.settings.inspectionDuration.label}
          </div>
          <p className="text-xs text-text-secondary">{t.settings.inspectionDuration.description}</p>
        </div>
        <div className="flex items-center gap-4">
          <RangeSlider
            min={5}
            max={30}
            step={1}
            value={settings.inspectionDuration}
            onChange={handleInspectionDurationChange}
          />
          <span className="text-lg font-bold text-primary min-w-12 text-right">
            {settings.inspectionDuration}s
          </span>
        </div>
      </Card>

      {/* Sounds */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="block text-sm font-semibold text-text-primary mb-1">
              {t.settings.soundsEnabled.label}
            </div>
            <p className="text-xs text-text-secondary">{t.settings.soundsEnabled.description}</p>
          </div>
          <ToggleButton
            value={settings.soundsEnabled}
            onValueChange={handleSoundsToggle}
            aria-label={t.settings.soundsEnabled.label}
          />
        </div>
      </Card>

      {/* Auto Inspection Penalty */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="block text-sm font-semibold text-text-primary mb-1">
              {t.settings.autoInspectionPenalty.label}
            </div>
            <p className="text-xs text-text-secondary">
              {t.settings.autoInspectionPenalty.description}
            </p>
          </div>
          <ToggleButton
            value={settings.autoInspectionPenalty}
            onValueChange={handleAutoInspectionPenaltyToggle}
            aria-label={t.settings.autoInspectionPenalty.label}
          />
        </div>
      </Card>

      {/* Theme */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="block text-sm font-semibold text-text-primary mb-1">
              {t.settings.theme.label}
            </div>
            <p className="text-xs text-text-secondary">{t.settings.theme.description}</p>
          </div>
          <Button
            onClick={toggleTheme}
            variant="secondary"
            className={`flex items-center gap-2 px-4 py-2 font-medium border transition-colors ${
              theme !== 'light' &&
              'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30'
            }`}
          >
            {theme === 'light' ? (
              <>
                <Sun size={16} />
                <span className="text-sm">{t.settings.theme.light}</span>
              </>
            ) : (
              <>
                <Moon size={16} />
                <span className="text-sm">{t.settings.theme.dark}</span>
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Export/Import */}
      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            {t.settings.exportImport.title}
          </h3>
          <p className="text-xs text-text-secondary">Exporte ou importe suas sessões</p>
        </div>

        {/* Export buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            onClick={handleExportCurrent}
            variant="secondary"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30"
          >
            <CloudDownload size={16} />
            <span className="text-sm font-medium">{t.settings.exportImport.exportCurrent}</span>
          </Button>
          <Button
            onClick={handleExportAll}
            variant="secondary"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30"
          >
            <CloudDownload size={16} />
            <span className="text-sm font-medium">{t.settings.exportImport.exportAll}</span>
          </Button>
        </div>

        {/* Import section */}
        <div className="space-y-3 pt-3 border-t border-border">
          <RadioGroup
            name="importMode"
            value={importMode}
            onValueChange={(v) => setImportMode(v as 'merge' | 'replace')}
          >
            <RadioButton value="merge">{t.settings.exportImport.merge}</RadioButton>
            <RadioButton value="replace">{t.settings.exportImport.replace}</RadioButton>
          </RadioGroup>
          <Button
            onClick={handleImportClick}
            variant="secondary"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-border hover:bg-border/80 text-text-primary border-none"
          >
            <CloudUpload size={16} />
            <span className="text-sm font-medium">{t.settings.exportImport.import}</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </Card>
    </div>
  );
}
