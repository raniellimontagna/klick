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
import { CloudSyncSection } from './cloud-sync-section';
import { ShareSection } from './share-section';

type ExportImportMessage = {
  type: 'success' | 'error';
  text: string;
} | null;

export const SettingsContent: React.FC = (): React.ReactElement => {
  const { settings, updateSettings } = useSettingsStore();
  const { exportCurrentSession, exportAllSessions, importSessions } = useSessionsStore();
  const { t } = useI18nStore();
  const { theme, toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [message, setMessage] = useState<ExportImportMessage>(null);

  const handleInspectionDurationChange = (value: number): void => {
    updateSettings({ inspectionDuration: value });
  };

  const handleSoundsToggle = (): void => {
    updateSettings({ soundsEnabled: !settings.soundsEnabled });
  };

  const handleAutoInspectionPenaltyToggle = (): void => {
    updateSettings({ autoInspectionPenalty: !settings.autoInspectionPenalty });
  };

  const downloadFile = (content: string, filename: string): void => {
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

  const handleExportCurrent = (): void => {
    const json = exportCurrentSession();
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(json, `klick-session-${timestamp}.json`);
    setMessage({ type: 'success', text: t.settings.exportImport.exportSuccess });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExportAll = (): void => {
    const json = exportAllSessions();
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(json, `klick-all-sessions-${timestamp}.json`);
    setMessage({ type: 'success', text: t.settings.exportImport.exportSuccess });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleImportClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
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
    <div className="space-y-8">
      {/* Message feedback */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-xl border-2 font-medium ${
              message.type === 'success'
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-danger/10 border-danger/30 text-danger'
            }`}
            role="status"
            aria-live="polite"
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Inspection Duration */}
          <Card className="space-y-6 flex flex-col justify-center min-h-32">
            <header>
              <h3 className="text-sm font-bold uppercase tracking-widest text-text-primary mb-1">
                {t.settings.inspectionDuration.label}
              </h3>
              <p className="text-xs text-text-secondary">
                {t.settings.inspectionDuration.description}
              </p>
            </header>
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <RangeSlider
                  min={5}
                  max={30}
                  step={1}
                  value={settings.inspectionDuration}
                  onChange={handleInspectionDurationChange}
                />
              </div>
              <output className="text-2xl font-mono font-bold text-primary min-w-16 text-right">
                {settings.inspectionDuration}s
              </output>
            </div>
          </Card>

          {/* Configuration Toggles */}
          <Card className="space-y-0 overflow-hidden p-0">
            <ul className="divide-y divide-border/70">
              <li className="flex items-center justify-between p-6 transition-colors hover:bg-surface-hover/55">
                <div className="pr-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-text-primary mb-1">
                    {t.settings.soundsEnabled.label}
                  </h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {t.settings.soundsEnabled.description}
                  </p>
                </div>
                <ToggleButton
                  value={settings.soundsEnabled}
                  onValueChange={handleSoundsToggle}
                  aria-label={t.settings.soundsEnabled.label}
                />
              </li>
              <li className="flex items-center justify-between p-6 transition-colors hover:bg-surface-hover/55">
                <div className="pr-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-text-primary mb-1">
                    {t.settings.autoInspectionPenalty.label}
                  </h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {t.settings.autoInspectionPenalty.description}
                  </p>
                </div>
                <ToggleButton
                  value={settings.autoInspectionPenalty}
                  onValueChange={handleAutoInspectionPenaltyToggle}
                  aria-label={t.settings.autoInspectionPenalty.label}
                />
              </li>
              <li className="flex items-center justify-between p-6 transition-colors hover:bg-surface-hover/55">
                <div className="pr-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-text-primary mb-1">
                    {t.settings.theme.label}
                  </h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {t.settings.theme.description}
                  </p>
                </div>
                <Button
                  onClick={toggleTheme}
                  variant="secondary"
                  className={`flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    theme !== 'light'
                      ? 'glow-border border-primary/35 bg-primary/20 text-primary'
                      : 'border-border/80 bg-surface/75 text-text-primary'
                  }`}
                >
                  {theme === 'light' ? (
                    <>
                      <Sun size={14} aria-hidden="true" />
                      <span>{t.settings.theme.light}</span>
                    </>
                  ) : (
                    <>
                      <Moon size={14} aria-hidden="true" />
                      <span>{t.settings.theme.dark}</span>
                    </>
                  )}
                </Button>
              </li>
            </ul>
          </Card>
        </div>

        <section className="space-y-6">
          <CloudSyncSection />
          <ShareSection />

          {/* Data Persistence Section */}
          <section aria-labelledby="data-mgmt-heading">
            <Card className="h-full space-y-8 flex flex-col">
              <header>
                <h3
                  id="data-mgmt-heading"
                  className="text-sm font-bold uppercase tracking-widest text-text-primary mb-1"
                >
                  {t.settings.exportImport.title}
                </h3>
                <p className="text-xs text-text-secondary">
                  Gerencie a persistência dos seus dados e backup.
                </p>
              </header>

              <div className="flex-1 space-y-8">
                {/* Export area */}
                <div className="space-y-3">
                  <header className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted mb-2">
                    Exportar
                  </header>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      onClick={handleExportCurrent}
                      variant="secondary"
                      className="flex flex-col items-center justify-center gap-2 p-6 bg-white/5 hover:bg-white/10 text-text-primary border border-white/10 group transition-all"
                    >
                      <CloudDownload
                        size={24}
                        className="text-text-muted group-hover:text-primary transition-colors"
                      />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {t.settings.exportImport.exportCurrent}
                      </span>
                    </Button>
                    <Button
                      onClick={handleExportAll}
                      variant="secondary"
                      className="flex flex-col items-center justify-center gap-2 p-6 bg-white/5 hover:bg-white/10 text-text-primary border border-white/10 group transition-all"
                    >
                      <CloudDownload
                        size={24}
                        className="text-text-muted group-hover:text-primary transition-colors"
                      />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {t.settings.exportImport.exportAll}
                      </span>
                    </Button>
                  </div>
                </div>

                {/* Import area */}
                <div className="space-y-4 border-t border-border/70 pt-10">
                  <header className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted mb-4">
                    Importar
                  </header>

                  <RadioGroup
                    name="importMode"
                    value={importMode}
                    onValueChange={(v) => setImportMode(v as 'merge' | 'replace')}
                    className="flex gap-6 mb-4"
                  >
                    <RadioButton value="merge">{t.settings.exportImport.merge}</RadioButton>
                    <RadioButton value="replace">{t.settings.exportImport.replace}</RadioButton>
                  </RadioGroup>

                  <Button
                    onClick={handleImportClick}
                    className="h-14 w-full justify-center gap-3 rounded-xl"
                  >
                    <CloudUpload size={20} />
                    <span className="font-bold uppercase tracking-wider text-sm">
                      {t.settings.exportImport.import}
                    </span>
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>
            </Card>
          </section>
        </section>
      </div>
    </div>
  );
};
