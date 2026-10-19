// A cópia diária da conta (spec 8.3), no formato do export do Klick (KlickExport): o Worker a escreve a partir dos registros, e o app a lê
// como qualquer arquivo. Puro, para o Worker e os testes de unidade.
import type { Duel, KlickExport, Practice, Profile, ProfilePatch, Session, Solve } from '../types';
import { defaultDeviceProfile, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from './prefs';
import { changeToPref, fromChange, isCompacted, type StampedRecord } from './records';
import type { Change } from './types';

const bare = <R extends object>(c: Change): R => {
  const { deletionStamp: _d, ...rec } = fromChange<StampedRecord>(c) as StampedRecord & Record<string, unknown>;
  return rec as unknown as R;
};

// Os registros da conta como arquivo: sessões, solves e desafios com a lixeira, o treino que existe, e o perfil da conta com os ajustes do
// aparelho no padrão (o servidor não guarda os do aparelho). As marcas compactadas (records.ts) ficam de fora: sem os campos de um solve, sem
// `at`, quebrariam a ordem, e o import do arquivo as recusaria.
export function exportFromRecords(records: readonly Change[], at: number): KlickExport {
  const of = (store: Change['store']) => records.filter((c) => c.store === store);
  const sessions = of('sessions')
    .map((c) => bare<Session>(c))
    .sort((a, b) => a.order - b.order);
  const solves = of('solves')
    .filter((c) => !isCompacted(c))
    .map((c) => bare<Solve>(c))
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const practice = of('practice')
    .filter((c) => c.deletedAt === null)
    .map((c) => {
      const { updatedAt: _u, deletedAt: _x, ...p } = bare<Practice & { updatedAt: number; deletedAt: null }>(c);
      return p as Practice;
    })
    .sort((a, b) => a.at - b.at);
  // Os desafios em ordem de criação, como o export do aparelho (exportAll).
  const duels = of('duels')
    .map((c) => bare<Duel>(c))
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const profile = joinProfile(defaultDeviceProfile(), profileFromPrefs(of('prefs').map(changeToPref)));
  return { format: 'klick', version: 1, exportedAt: at, sessions, solves, profile, practice, duels };
}

// As chaves da conta de um perfil de arquivo, todas (o padrão por baixo do que faltar): o que restaurar a cópia grava (restoreChanges).
// O nome dos desafios é a única chave mais nova que as cópias na nuvem: uma cópia de antes dele (o perfil sem `duelName`) fica com o da
// conta, lido dos registros de agora (`current`). O padrão por baixo gravaria '' por cima do nome, com a data da restauração, e o sync o
// levaria a todos os aparelhos. É o que o aparelho faz ao restaurar (replaceAll); a cópia que traz o nome vale.
export function accountPrefsOf(profile: ProfilePatch | null, current: readonly Change[]): Map<string, unknown> | null {
  if (!profile) return null;
  const here = profileFromPrefs(current.filter((c) => c.store === 'prefs').map(changeToPref));
  const base = { ...joinProfile(undefined, profileFromPrefs([])), duelName: here.duelName };
  const full: Profile = {
    ...base,
    ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)),
    settings: { ...base.settings, ...profile.settings, sound: { ...base.settings.sound, ...profile.settings?.sound } },
  };
  return prefsFromProfile(splitProfile(full).account, { withDefaults: true });
}
