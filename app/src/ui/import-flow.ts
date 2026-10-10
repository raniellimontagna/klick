// O fluxo de importar um arquivo, o mesmo para o seletor da seção Seus dados e para o seletor do tour da primeira vez. O arquivo é lido
// aqui: um Klick entra na hora; um csTimer abre o diálogo de importar com as sessões (app.importDraft), para a pessoa escolher o evento
// das que não trazem um. O resumo vai para app.importSummary. O estado fica no AppState, então o ImportDialog (que a seção Ajustes monta)
// mostra o mesmo, qualquer que seja o seletor que o abriu.
import type { EventId } from '../core/types';
import type { KlickExport } from '../data/repository';
import { type CsTimerSession, parseCsTimer, parseKlickJson } from '../data/transfer';
import { T } from '../strings';
import type { AppState, ImportSummary } from './state/app.svelte';

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : T.dados.fileUnreadable);

// Linhas do resumo de uma importação (os textos ficam em strings.ts).
export function summaryLines(s: ImportSummary): string[] {
  // Sem nenhum solve novo nem existente, e só com registros ilegíveis, a linha de contagem não diz nada: fica só o aviso.
  const nothingRead = s.solves === 0 && s.existing === 0 && s.unreadable > 0;
  const lines = nothingRead ? [] : [T.importDialog.result(s.solves, s.existing)];
  if (s.missed > 0) lines.push(T.importDialog.missed(s.missed));
  if (s.skippedSessions > 0) lines.push(T.importDialog.skippedSessions(s.skippedSessions));
  if (s.unreadable > 0) lines.push(T.importDialog.unreadable(s.unreadable));
  if (s.offerNotMarked) lines.push(T.importDialog.offerNotMarked);
  if (s.settingsApplied) lines.push(T.importDialog.settingsApplied);
  return lines;
}

function showSummary(app: AppState, s: ImportSummary): void {
  app.importDraft = null;
  app.importSummary = summaryLines(s);
  app.dialog = 'import';
}

// Lê o arquivo escolhido. Quem chama esvazia o campo do seletor (para o mesmo arquivo poder ser escolhido de novo).
export async function importFile(app: AppState, file: File): Promise<void> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    app.showToast(T.dados.fileUnreadable);
    return;
  }
  await readImportText(app, text, file.name);
}

// Primeiro como Klick (importa na hora); depois como csTimer (abre o diálogo com as sessões). Se os dois falham, o aviso traz a
// mensagem do leitor do tipo que o nome sugere: .json é Klick; o resto, csTimer.
async function readImportText(app: AppState, text: string, name: string): Promise<void> {
  let klick: KlickExport | null = null;
  let klickError: unknown = null;
  try {
    klick = parseKlickJson(text);
  } catch (err) {
    klickError = err;
  }
  if (klick) {
    app.importBusy = true;
    let summary: ImportSummary | null;
    try {
      summary = await app.importKlick(klick);
    } finally {
      app.importBusy = false;
    }
    if (summary) showSummary(app, summary);
    return;
  }
  let sessions: CsTimerSession[];
  try {
    sessions = parseCsTimer(text);
  } catch (err) {
    app.showToast(messageOf(/\.json$/i.test(name) ? klickError : err));
    return;
  }
  app.importDraft = sessions;
  app.importSummary = null;
  app.dialog = 'import';
}

// O botão de confirmar do csTimer: o mapeamento vem do ImportDialog (só as sessões com evento escolhido).
export async function confirmCsTimerImport(app: AppState, mapping: Record<string, EventId | undefined>): Promise<void> {
  const draft = app.importDraft;
  if (!draft || app.importBusy) return;
  app.importBusy = true;
  let summary: ImportSummary | null;
  try {
    summary = await app.importCsTimer(draft, mapping);
  } finally {
    app.importBusy = false;
  }
  if (summary) showSummary(app, summary);
}

// Importar da versão anterior (a seção Seus dados, ou o tour da primeira vez, que antes leva a pessoa para Ajustes).
export async function importV1Flow(app: AppState): Promise<void> {
  if (app.importBusy) return;
  app.importBusy = true;
  let summary: ImportSummary | null;
  try {
    summary = await app.importV1();
  } finally {
    app.importBusy = false;
  }
  if (summary) showSummary(app, summary);
}
