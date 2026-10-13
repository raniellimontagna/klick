// Catálogo dos 13 eventos WCA do produto. A ordem de EVENTS é a ordem em que a interface os mostra.
import type { EventId } from './types';

export interface EventInfo {
  id: EventId;
  name: string; // nome por extenso
  short: string; // rótulo curto (pílula da sessão, filtros)
  inspection: boolean; // 15 s de inspeção WCA; o 3BLD não tem, a memorização conta no tempo
  average: 'ao5' | 'mo3'; // média oficial do evento
  scrambleId: string; // id do evento no cubing.js
  puzzle: string; // peça do twisty-player (imagem 2D do embaralhamento)
  csTimer: string; // tipo de embaralhamento (scrType) do csTimer
  milestones: boolean; // marcos da temporada 1, que valem só para o 3×3
}

// O que muda de um evento para o outro. inspection, average e milestones saem das regras em toEventInfo.
type EventRow = Pick<EventInfo, 'id' | 'name' | 'short' | 'scrambleId' | 'puzzle' | 'csTimer'>;

const ROWS: readonly EventRow[] = [
  { id: '333', name: '3×3', short: '3×3', scrambleId: '333', puzzle: '3x3x3', csTimer: '333' },
  { id: '222', name: '2×2', short: '2×2', scrambleId: '222', puzzle: '2x2x2', csTimer: '222so' },
  { id: '444', name: '4×4', short: '4×4', scrambleId: '444', puzzle: '4x4x4', csTimer: '444wca' },
  { id: '555', name: '5×5', short: '5×5', scrambleId: '555', puzzle: '5x5x5', csTimer: '555wca' },
  { id: '666', name: '6×6', short: '6×6', scrambleId: '666', puzzle: '6x6x6', csTimer: '666wca' },
  { id: '777', name: '7×7', short: '7×7', scrambleId: '777', puzzle: '7x7x7', csTimer: '777wca' },
  { id: '333oh', name: '3×3 com uma mão', short: '3×3 OH', scrambleId: '333oh', puzzle: '3x3x3', csTimer: '333oh' },
  { id: '333bf', name: '3×3 às cegas', short: '3BLD', scrambleId: '333bf', puzzle: '3x3x3', csTimer: '333ni' },
  { id: 'minx', name: 'Megaminx', short: 'Megaminx', scrambleId: 'minx', puzzle: 'megaminx', csTimer: 'mgmp' },
  { id: 'pyram', name: 'Pyraminx', short: 'Pyraminx', scrambleId: 'pyram', puzzle: 'pyraminx', csTimer: 'pyrso' },
  { id: 'skewb', name: 'Skewb', short: 'Skewb', scrambleId: 'skewb', puzzle: 'skewb', csTimer: 'skbso' },
  { id: 'sq1', name: 'Square-1', short: 'Square-1', scrambleId: 'sq1', puzzle: 'square1', csTimer: 'sqrs' },
  { id: 'clock', name: 'Clock', short: 'Clock', scrambleId: 'clock', puzzle: 'clock', csTimer: 'clkwca' },
];

// Média oficial de 3 (simples, sem descarte): 6×6, 7×7 e 3BLD. Os demais usam a média de 5.
const MO3_EVENTS: readonly EventId[] = ['666', '777', '333bf'];

function toEventInfo(row: EventRow): EventInfo {
  const info: EventInfo = {
    ...row,
    inspection: row.id !== '333bf',
    average: MO3_EVENTS.includes(row.id) ? 'mo3' : 'ao5',
    milestones: row.id === '333',
  };
  return Object.freeze(info);
}

export const EVENTS: readonly EventInfo[] = Object.freeze(ROWS.map(toEventInfo));
export const EVENT_IDS: readonly EventId[] = Object.freeze(EVENTS.map((e) => e.id));

const BY_ID: ReadonlyMap<EventId, EventInfo> = new Map(EVENTS.map((e) => [e.id, e]));

export function eventInfo(id: EventId): EventInfo {
  const info = BY_ID.get(id);
  if (!info) throw new Error(`Evento desconhecido: ${id}`);
  return info;
}

// O solve conta para os marcos da temporada? Sem lançar: um id fora do catálogo (um solve de uma versão mais nova, depois de voltar a
// esta) simplesmente não conta.
export const countsForMilestones = (id: EventId): boolean => BY_ID.get(id)?.milestones ?? false;

// scrType do csTimer. Sem tipo (ou vazio) é a sessão padrão do csTimer, o 3×3; tipo fora do catálogo (ZBLL etc.) é null.
export function eventFromCsTimer(scrType: string | undefined): EventId | null {
  if (!scrType) return '333';
  return EVENTS.find((e) => e.csTimer === scrType)?.id ?? null;
}
