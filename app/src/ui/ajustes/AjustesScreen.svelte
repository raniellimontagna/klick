<script lang="ts">
  // A tela Ajustes: porte de prototype/scripts/ui/ajustes-view.js, com o mesmo markup e as mesmas classes. Cada controle grava na hora,
  // pelo AppState. Os elementos não são recriados depois de uma mudança, então o foco fica onde estava. Os textos ficam em strings.ts.
  import type { ProfilePatch } from '../../data/repository';
  import { T } from '../../strings';
  import type { AppState } from '../state/app.svelte';
  import DataSection from './DataSection.svelte';

  type Patch = NonNullable<ProfilePatch['settings']>;

  let { app }: { app: AppState } = $props();

  const s = $derived(app.profile.settings);

  // Um switch grava na hora. Se a gravação falha, a caixa volta ao que está salvo (o aviso já saiu pela casca).
  async function flip(box: HTMLInputElement, patch: Patch, saved: () => boolean): Promise<void> {
    await app.updateSettings(patch);
    box.checked = saved();
  }
</script>

{#snippet caption(label: string, hint?: string)}
  <span>{label}{#if hint}<small>{hint}</small>{/if}</span>
{/snippet}

<section class="screen" data-screen="ajustes" aria-label={T.tabs.ajustes}>
  <div class="page-h"><h1>{T.tabs.ajustes}</h1></div>
  <div class="settings">
    <fieldset>
      <legend>{T.ajustes.timer}</legend>
      <label class="setting">
        {@render caption(T.ajustes.inspection, T.ajustes.inspectionHint)}
        <input
          type="checkbox"
          class="switch"
          data-toggle="inspection"
          checked={s.inspection}
          onchange={(e) => flip(e.currentTarget, { inspection: e.currentTarget.checked }, () => app.profile.settings.inspection)}
        />
      </label>
      <div class="setting">
        {@render caption(T.ajustes.hold, T.ajustes.holdHint)}
        <div class="seg" role="group" aria-label={T.ajustes.hold}>
          {#each T.ajustes.holdOptions as [ms, label] (ms)}
            <button
              type="button"
              data-set="holdMs"
              data-val={ms}
              aria-pressed={s.holdMs === ms ? 'true' : 'false'}
              onclick={() => app.updateSettings({ holdMs: ms })}>{label}</button
            >
          {/each}
        </div>
      </div>
      <div class="setting">
        {@render caption(T.ajustes.mobileArm, T.ajustes.mobileArmHint)}
        <div class="seg" role="group" aria-label={T.ajustes.mobileArm}>
          {#each T.ajustes.mobileArmOptions as [value, label] (value)}
            <button
              type="button"
              data-set="mobileArm"
              data-val={value}
              aria-pressed={s.mobileArm === value ? 'true' : 'false'}
              onclick={() => app.updateSettings({ mobileArm: value })}>{label}</button
            >
          {/each}
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>{T.ajustes.look}</legend>
      <div class="setting">
        {@render caption(T.ajustes.theme)}
        <div class="seg" role="group" aria-label={T.ajustes.theme}>
          {#each T.ajustes.themeOptions as [value, label] (value)}
            <button
              type="button"
              data-set="theme"
              data-val={value}
              aria-pressed={s.theme === value ? 'true' : 'false'}
              onclick={() => app.updateSettings({ theme: value })}>{label}</button
            >
          {/each}
        </div>
      </div>
      <label class="setting">
        {@render caption(T.ajustes.scrambleImage, T.ajustes.scrambleImageHint)}
        <input
          type="checkbox"
          class="switch"
          data-toggle="scrambleImage"
          checked={s.scrambleImage}
          onchange={(e) => flip(e.currentTarget, { scrambleImage: e.currentTarget.checked }, () => app.profile.settings.scrambleImage)}
        />
      </label>
      <label class="setting">
        {@render caption(T.ajustes.soundKlick, T.ajustes.soundKlickHint)}
        <input
          type="checkbox"
          class="switch"
          data-toggle="sound.klick"
          checked={s.sound.klick}
          onchange={(e) => flip(e.currentTarget, { sound: { klick: e.currentTarget.checked } }, () => app.profile.settings.sound.klick)}
        />
      </label>
      <label class="setting">
        {@render caption(T.ajustes.soundInsp, T.ajustes.soundInspHint)}
        <input
          type="checkbox"
          class="switch"
          data-toggle="sound.insp"
          checked={s.sound.insp}
          onchange={(e) => flip(e.currentTarget, { sound: { insp: e.currentTarget.checked } }, () => app.profile.settings.sound.insp)}
        />
      </label>
      <label class="setting">
        {@render caption(T.ajustes.soundPb)}
        <input
          type="checkbox"
          class="switch"
          data-toggle="sound.pb"
          checked={s.sound.pb}
          onchange={(e) => flip(e.currentTarget, { sound: { pb: e.currentTarget.checked } }, () => app.profile.settings.sound.pb)}
        />
      </label>
    </fieldset>

    <fieldset>
      <legend>{T.ajustes.coach}</legend>
      <label class="setting">
        {@render caption(T.ajustes.silent, T.ajustes.silentHint)}
        <input
          type="checkbox"
          class="switch"
          data-toggle="silent"
          checked={s.silent}
          onchange={(e) => flip(e.currentTarget, { silent: e.currentTarget.checked }, () => app.profile.settings.silent)}
        />
      </label>
      <div class="setting">
        {@render caption(T.ajustes.reducedMotion)}
        <div class="seg" role="group" aria-label={T.ajustes.reducedMotion}>
          {#each T.ajustes.reducedMotionOptions as [value, label] (value)}
            <button
              type="button"
              data-set="reducedMotion"
              data-val={value}
              aria-pressed={s.reducedMotion === value ? 'true' : 'false'}
              onclick={() => app.updateSettings({ reducedMotion: value })}>{label}</button
            >
          {/each}
        </div>
      </div>
      <div class="setting">
        {@render caption(T.ajustes.language, T.ajustes.languageHint)}
        <span class="muted">{T.ajustes.languageValue}</span>
      </div>
    </fieldset>

    <DataSection {app} />
  </div>
</section>
