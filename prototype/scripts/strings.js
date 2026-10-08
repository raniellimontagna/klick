// Todo texto que a pessoa lê passa por aqui (pt-BR). Facilita traduzir depois.
// Diferenças em segundos, truncadas no centésimo como os tempos.
const sec = (ms) => (Math.floor(ms / 10) / 100).toFixed(2);

export const MILESTONE_INFO = Object.freeze({
  first: { label: 'Primeiro solve', msg: 'Primeiro solve registrado' },
  sub2: { label: 'Sub-2:00', msg: 'Primeiro solve abaixo de 2 minutos' },
  n100: { label: '100 solves', msg: 'Cem solves registrados' },
  sub130: { label: 'Sub-1:30', msg: 'Primeiro solve abaixo de 1:30' },
  ao5sub130: { label: 'Média de 5 sub-1:30', msg: 'Média de 5 abaixo de 1:30' },
  sub1: { label: 'Sub-1:00', msg: 'Primeiro solve abaixo de 1 minuto' },
  streak7: { label: '7 dias seguidos', msg: 'Sete dias seguidos de treino' },
  ao12sub1: { label: 'Média de 12 sub-1:00', msg: 'Média de 12 abaixo de 1 minuto' },
  n1000: { label: '1.000 solves', msg: 'Mil solves registrados' },
});

export const TRAIL = Object.freeze([
  'Cruz branca',
  'Cantos brancos',
  'Segunda camada',
  'Cruz amarela',
  'Orientar e permutar',
  'F2L intuitivo',
  'OLL em 2 passos',
  'PLL em 2 passos',
  'F2L com algoritmos',
]);

export const FINISH_INFO = Object.freeze({
  fosco: { label: 'Fosco', unlock: 'padrão' },
  brilho: { label: 'Brilho', unlock: 'temporada 1' },
  gelo: { label: 'Gelo', unlock: 'temporada 2' },
  carbono: { label: 'Carbono', unlock: 'temporada 3' },
});

export const T = Object.freeze({
  coach: {
    idle: 'Quando quiser. Segure espaço para armar.',
    idleTouch: 'Quando quiser. Segure com os dois polegares.',
    idleOne: 'Quando quiser. Toque e segure para armar.',
    inspect: 'Inspeção. Segure para armar quando estiver pronto.',
    arming: 'Armando…',
    ready: 'Solte para começar.',
    pbSingle: (diffMs) => `Novo recorde — ${sec(diffMs)} s mais rápido. Vale lembrar o que funcionou.`,
    pbAverage: (label, value) => `Sua ${label} caiu para ${value}. Isso é consistência, não sorte.`,
    milestone: (msg, k) => `${msg}. Marco ${k} de 9.`,
    dailyGoal: (n) => `Meta de ${n} solves feita. O resto é bônus.`,
    stable: 'Cinco solves dentro de 3 segundos. Ritmo estável.',
    fatigue: 'Seus últimos estão subindo. Uma pausa de 5 minutos costuma ajudar.',
    firstDnf: 'DNF acontece. Respira e segue.',
    back: 'Que bom te ver. Começa leve — o primeiro não conta pra nada.',
  },
  chips: {
    vsAo5: (diffMs) => `${diffMs <= 0 ? '▼' : '▲'} ${sec(Math.abs(diffMs))} s vs média de 5`,
    vsPb: (diffMs) => `▲ ${sec(diffMs)} s do recorde`,
    newPb: (diffMs) => `◆ ${sec(diffMs)} s abaixo do recorde`,
    solveN: (n) => `solve #${n}`,
  },
  aria: {
    final: (text) => `Tempo final: ${text}.`,
  },
  toast: {
    deleted: 'Solve excluído',
    undo: 'Desfazer (Z)',
    exportFail: 'Exportação indisponível neste ambiente.',
  },
  progress: {
    best: (text) => `melhor ${text}`,
    count: (n, total) => `${n}/${total}`,
  },
  season: (done, finish) => `Temporada 1 · ${done} de 9 marcos · acabamento ${finish}`,
});
