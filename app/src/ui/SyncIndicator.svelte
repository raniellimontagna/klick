<script lang="ts">
  // O indicador do sync na barra de cima (spec 9.3): só com conta, ao lado da data. Quatro estados (sincronizado, sincronizando, esperando
  // rede e erro), com o estado no rótulo acessível. Não anima com o timer ocupado. Um toque leva a Ajustes, em "Conta e sync". Não é uma
  // região aria-live: o anúncio da falha e da volta é só do AccountState, e uma troca de ícone nunca anuncia nada.
  // O desenho (spec 6): a nuvem só em contorno e, no canto de baixo à direita, um cubinho 3×3 como selo. O recorte do selo na nuvem é de uma
  // <mask> (não de uma cor de fundo pintada), então vale em qualquer fundo, tema e estado do botão. O estado vai nas peças (cores em CSS).
  import { onDestroy, tick } from 'svelte';
  import { T } from '../strings';
  import type { AppState } from './state/app.svelte';
  import { type SyncIcon, syncIcon, syncLine } from './sync-status';

  let { app }: { app: AppState } = $props();

  const account = $derived(app.account);
  const icon = $derived(account ? syncIcon(account.status) : 'synced');
  const quiet = $derived(app.timerBusy);

  // Um id por instância: hoje só um indicador existe, mas dois no mesmo documento não podem dividir o id da máscara.
  const uid = $props.id();
  const maskId = `sync-badge-mask-${uid}`;
  const PIECES = Array.from({ length: 9 }, (_, i) => ({ x: [16.4, 18.3, 20.2][i % 3], y: [15.6, 17.5, 19.4][Math.floor(i / 3)] }));

  // O pulinho: ao passar de "sincronizando" para "sincronizado", uma vez, ~600 ms. Com o timer ocupado nada se mexe (nem marca).
  let justSynced = $state(false);
  let previous: SyncIcon = 'synced'; // o efeito roda ao montar e guarda o ícone de partida
  let hopTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const now = icon;
    const wasSyncing = previous === 'syncing';
    previous = now;
    if (wasSyncing && now === 'synced' && !quiet) {
      clearTimeout(hopTimer);
      justSynced = true;
      hopTimer = setTimeout(() => (justSynced = false), 600);
    }
  });
  onDestroy(() => clearTimeout(hopTimer));

  async function go(): Promise<void> {
    app.openAccount();
    await tick();
    const section = document.querySelector<HTMLElement>('[data-slot="conta"]');
    section?.scrollIntoView({ block: 'start' });
    section?.querySelector<HTMLElement>('button')?.focus();
  }
</script>

{#if account?.signedIn}
  <button
    type="button"
    class="sync-ind"
    data-sync={icon}
    data-quiet={quiet ? 'true' : 'false'}
    data-just-synced={justSynced && !quiet ? 'true' : undefined}
    aria-label={T.conta.indicator(syncLine(account.status, Date.now()))}
    onclick={go}
  >
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="white" />
        <rect x="15.4" y="14.6" width="7.4" height="7.4" rx="2" fill="black" />
      </mask>
      <g mask="url(#{maskId})">
        <path class="sync-cloud" d="M15 18.5H8.5a6.5 6.5 0 1 1 6.2-8.5h1.6a4 4 0 0 1 3.4 6.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </g>
      <g data-badge class:spin={icon === 'syncing' && !quiet}>
        {#each PIECES as p, i (i)}
          <rect data-badge-piece data-center={icon === 'error' && i === 4 ? '' : undefined} x={p.x} y={p.y} width="1.5" height="1.5" rx="0.4" />
        {/each}
      </g>
    </svg>
  </button>
{/if}
