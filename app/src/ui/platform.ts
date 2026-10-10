// Plataforma e contexto do navegador: iPhone e iPad, app instalado, iframe. Os padrões leem o navegador; as funções que recebem
// os dados (ua, toque) são puras, para os testes.

// O evento que o Chromium manda antes de oferecer a instalação. Não está no lib.dom do TypeScript. A casca o guarda desde o começo.
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

// iPhone, iPad e iPod, e o iPad que se apresenta como Mac (esse tem tela de toque).
export function isIOS(ua: string = navigator.userAgent, maxTouchPoints: number = navigator.maxTouchPoints): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 0;
}

// Dentro de um iframe o topo da janela é outra janela (e o navegador costuma bloquear os downloads).
export function isFramed(win: Window = window): boolean {
  return win.top !== win.self;
}

// Aberto como app instalado: pela media query de display-mode, ou pela propriedade do Safari no iOS.
export function isStandalone(win: Window = window): boolean {
  if (typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches) return true;
  return (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// O guia de instalação só faz sentido no iOS, fora do app instalado, e enquanto a pessoa não o dispensou.
export function shouldShowInstallGuide(o: { ua: string; maxTouchPoints: number; standalone: boolean; dismissed: boolean }): boolean {
  return isIOS(o.ua, o.maxTouchPoints) && !o.standalone && !o.dismissed;
}
