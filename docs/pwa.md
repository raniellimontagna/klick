# Progressive Web App (PWA)

## Recursos

| Feature | Descrição |
|---------|-----------|
| **Instalável** | Adicionar à tela inicial |
| **Offline** | Funciona sem internet |
| **Cache** | Assets em cache para performance |
| **Atualizações** | Notificação de novas versões |

## Configuração

Usando `vite-plugin-pwa` em `/vite.config.ts`.

```ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Klick',
        short_name: 'Klick',
        theme_color: '#0D1117',
        // ...
      }
    })
  ]
});
```

## Instalação

### Android

1. Acessar pelo Chrome
2. Menu (⋮) → "Instalar app" ou "Adicionar à tela inicial"

### iOS

1. Acessar pelo Safari
2. Ícone de compartilhar → "Adicionar à Tela de Início"

## Componente PWAUpdatePrompt

**Path:** `/src/components/pwaUpdatePrompt/`

Exibe notificação quando há atualização disponível.

```tsx
// Em App.tsx
<PWAUpdatePrompt />
```

## Service Worker

Gerenciado automaticamente pelo `vite-plugin-pwa`:
- Cache de assets estáticos
- Estratégia de atualização: prompt ao usuário
- Workbox para gerenciamento de cache

## Manifest

Localizado em `/public/manifest.webmanifest` (gerado automaticamente).

Ícones configurados para múltiplos tamanhos (192x192, 512x512).
