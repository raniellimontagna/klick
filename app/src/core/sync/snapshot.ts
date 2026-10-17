// A cópia diária da conta (spec 8.3), no formato do export do Klick (KlickExport): o Worker a escreve a partir dos registros, e o app a lê
// como qualquer arquivo. Puro, para o Worker e os testes de unidade.
import type { KlickExport, Practice, Profile, ProfilePatch, Session, Solve } from '../types';
import { defaultDeviceProfile, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from './prefs';
import { changeToPref, fromChange, isCompacted, type StampedRecord } from './records';
import type { Change } from './types';

const bare = <R extends object>(c: Change): R => {
  const { deletionStamp: _d, ...rec } = fromChange<StampedRecord>(c) as StampedRecord & Record<string, unknown>;
  return rec as unknown as R;
};

// Os registros da conta como arquivo: sessões e solves com a lixeira, o treino que existe, e o perfil da conta com os ajustes do aparelho no
// padrão (o servidor não guarda os do aparelho). As marcas compactadas (records.ts) ficam de fora: sem os campos de um solve, sem `at`,
// quebrariam a ordem, e o import do arquivo as recusaria.
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
  const profile = joinProfile(defaultDeviceProfile(), profileFromPrefs(of('prefs').map(changeToPref)));
  return { format: 'klick', version: 1, exportedAt: at, sessions, solves, profile, practice };
}

// As chaves da conta de um perfil de arquivo, todas (o padrão por baixo do que faltar): o que restaurar a cópia grava (restoreChanges).
export function accountPrefsOf(profile: ProfilePatch | null): Map<string, unknown> | null {
  if (!profile) return null;
  const base = joinProfile(undefined, profileFromPrefs([]));
  const full: Profile = {
    ...base,
    ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)),
    settings: { ...base.settings, ...profile.settings, sound: { ...base.settings.sound, ...profile.settings?.sound } },
  };
  return prefsFromProfile(splitProfile(full).account, { withDefaults: true });
}
