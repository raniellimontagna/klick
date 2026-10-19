import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/duel.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './ui/App.svelte';
import { askReload, offerUpdate, onUpdateLookup } from './ui/state/update.svelte';

// O service worker não troca a versão sozinho: a nova espera a pessoa aceitar o aviso (UpdatePrompt), que só aparece com o timer parado.
const updateSW = registerSW({
  onNeedRefresh() {
    offerUpdate(() => updateSW(true));
  },
  // Um 426 do sync (o servidor pede um app mais novo) procura a versão nova por aqui, uma vez (lookForUpdate).
  onRegisteredSW(_url, registration) {
    if (registration) onUpdateLookup(() => registration.update());
  },
  // Outra aba aceitou a versão nova: o padrão recarregaria esta aba já, no meio de um solve. Aqui só se pede; o UpdatePrompt
  // recarrega quando a tela estiver livre.
  onNeedReload() {
    askReload();
  },
});

mount(App, { target: document.getElementById('app')! });
