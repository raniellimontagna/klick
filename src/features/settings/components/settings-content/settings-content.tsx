import { CloudDownload, CloudUpload, Moon, Sun } from '@solar-icons/react';
import {
  Button,
  Card,
  RadioButton,
  RadioGroup,
  RangeSlider,
  ToggleButton,
} from '@/shared/components/ui';
import { CloudSyncSection } from '../cloud-sync-section';
import { ShareSection } from '../share-section';
import { useSettingsContent } from './use-settings-content';

function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0 pr-4">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </li>
  );
}

function SummaryItem({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="surface-base rounded-2xl px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-secondary">{helper}</p>
    </div>
  );
}

export function SettingsContent() {
  const {
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
  } = useSettingsContent();

  return (
    <div className="space-y-6">
      {message ? (
        <output
          className={`block rounded-2xl border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'feedback-success text-success'
              : 'feedback-danger text-danger'
          }`}
          role={message.type === 'error' ? 'alert' : 'status'}
          aria-live={message.type === 'error' ? 'assertive' : 'polite'}
        >
          {message.text}
        </output>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
        <div className="space-y-6">
          <Card className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
                  {t.settings.title}
                </p>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-text-primary">
                    {t.pages.settings.description}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
                    {t.settings.inspectionDuration.description}
                  </p>
                </div>
              </div>

              <span className="surface-base inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-text-secondary">
                {themeLabel}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryItem
                label={t.sessions.current}
                value={activeSession?.name ?? '--'}
                helper={`${activeSessionSolveCount} ${
                  activeSessionSolveCount === 1
                    ? t.sessions.solveCountSingular
                    : t.sessions.solveCount
                }`}
              />
              <SummaryItem
                label={t.sessions.title}
                value={String(sessions.length)}
                helper={t.settings.exportImport.title}
              />
              <SummaryItem
                label={t.settings.theme.label}
                value={themeLabel}
                helper={
                  settings.soundsEnabled
                    ? t.settings.soundsEnabled.description
                    : t.settings.theme.description
                }
              />
            </div>

            <div className="surface-base space-y-4 rounded-[1.5rem] px-4 py-5 sm:px-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {t.settings.inspectionDuration.label}
                  </h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t.settings.autoInspectionPenalty.description}
                  </p>
                </div>
                <output className="text-2xl font-black text-primary">
                  {settings.inspectionDuration}s
                </output>
              </div>

              <RangeSlider
                min={5}
                max={30}
                step={1}
                value={settings.inspectionDuration}
                onChange={handleInspectionDurationChange}
              />
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
              <ul className="divide-y divide-border/70">
                <SettingRow
                  title={t.settings.soundsEnabled.label}
                  description={t.settings.soundsEnabled.description}
                  control={
                    <ToggleButton
                      value={settings.soundsEnabled}
                      onValueChange={handleSoundsToggle}
                      aria-label={t.settings.soundsEnabled.label}
                    />
                  }
                />
                <SettingRow
                  title={t.settings.autoInspectionPenalty.label}
                  description={t.settings.autoInspectionPenalty.description}
                  control={
                    <ToggleButton
                      value={settings.autoInspectionPenalty}
                      onValueChange={handleAutoInspectionPenaltyToggle}
                      aria-label={t.settings.autoInspectionPenalty.label}
                    />
                  }
                />
                <SettingRow
                  title={t.settings.theme.label}
                  description={t.settings.theme.description}
                  control={
                    <Button
                      onClick={toggleTheme}
                      variant={theme === 'light' ? 'secondary' : 'primary'}
                      className="min-w-32"
                    >
                      {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                      {themeLabel}
                    </Button>
                  }
                />
              </ul>
            </div>
          </Card>

          <Card className="space-y-5">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
                {t.settings.exportImport.title}
              </p>
              <h3 className="text-lg font-semibold text-text-primary">{t.actions.export}</h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                onClick={handleExportCurrent}
                variant="secondary"
                className="min-h-32 flex-col items-start justify-between px-5 py-5 text-left"
              >
                <span className="surface-base inline-flex h-10 w-10 items-center justify-center rounded-2xl text-primary">
                  <CloudDownload size={20} />
                </span>
                <span className="space-y-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t.settings.exportImport.exportCurrent}
                  </span>
                  <span className="block text-xs leading-relaxed text-text-secondary">
                    {activeSession?.name ?? '--'}
                  </span>
                </span>
              </Button>

              <Button
                onClick={handleExportAll}
                variant="secondary"
                className="min-h-32 flex-col items-start justify-between px-5 py-5 text-left"
              >
                <span className="surface-base inline-flex h-10 w-10 items-center justify-center rounded-2xl text-primary">
                  <CloudDownload size={20} />
                </span>
                <span className="space-y-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t.settings.exportImport.exportAll}
                  </span>
                  <span className="block text-xs leading-relaxed text-text-secondary">
                    {sessions.length} {t.sessions.title.toLowerCase()}
                  </span>
                </span>
              </Button>
            </div>

            <div className="rounded-[1.5rem] border border-border/70 bg-surface/55 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                    {t.actions.import}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                    {t.settings.exportImport.importMode}
                  </p>
                </div>

                <RadioGroup
                  name="importMode"
                  value={importMode}
                  onValueChange={(value) => setImportMode(value as 'merge' | 'replace')}
                  className="flex flex-col gap-3 sm:flex-row"
                >
                  <RadioButton value="merge">{t.settings.exportImport.merge}</RadioButton>
                  <RadioButton value="replace">{t.settings.exportImport.replace}</RadioButton>
                </RadioGroup>

                <Button onClick={handleImportClick} className="w-full justify-center sm:w-auto">
                  <CloudUpload size={18} />
                  {t.settings.exportImport.import}
                </Button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </Card>
        </div>

        <div className="space-y-6">
          <CloudSyncSection />
          <ShareSection />
        </div>
      </div>
    </div>
  );
}
