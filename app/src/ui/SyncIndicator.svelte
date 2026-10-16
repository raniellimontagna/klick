<script lang="ts">
  // O indicador do sync na barra de cima (spec 9.3): só com conta, ao lado da data. Quatro estados (sincronizado, sincronizando, esperando
  // rede e erro), com o estado no rótulo acessível. Não anima com o timer ocupado. Um toque leva a Ajustes, em "Conta e sync". Não é uma
  // região aria-live: o anúncio da falha e da volta é só do AccountState, e uma troca de ícone nunca anuncia nada.
  import { tick } from 'svelte';
  import { T } from '../strings';
  import type { AppState } from './state/app.svelte';
  import { syncIcon, syncLine } from './sync-status';

  let { app }: { app: AppState } = $props();

  const account = $derived(app.account);
  const icon = $derived(account ? syncIcon(account.status) : 'synced');

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
    data-quiet={app.timerBusy ? 'true' : 'false'}
    aria-label={T.conta.indicator(syncLine(account.status, Date.now()))}
    onclick={go}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18Z" />
      {#if icon === 'synced'}
        <path d="m9.5 13.5 2 2 3.5-4" />
      {:else if icon === 'syncing'}
        <path class="spin" d="M12 11v4m-2-2h4" />
      {:else if icon === 'waiting'}
        <path d="M9 14h.01M12 14h.01M15 14h.01" />
      {:else}
        <path d="M12 11.5v2.5m0 2h.01" />
      {/if}
    </svg>
  </button>
{/if}
