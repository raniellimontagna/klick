// A versão deste app: um id por build, que o Vite grava no código (vite.config.ts, `define`). O sync a anota quando um lote do servidor tem
// algo que esta versão recusa e, na primeira abertura de outra versão, baixa a conta de novo (a revisão final, I2). Fora do build (os
// testes), 'dev'.
declare const __KLICK_BUILD__: string | undefined;

export const BUILD_ID: string = typeof __KLICK_BUILD__ === 'string' ? __KLICK_BUILD__ : 'dev';
