import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A política de privacidade (spec 9.5 e 10): uma página estática em public/privacidade. Antes de ir ao ar, os dados do controlador
// (Portão D do plano) substituem os marcadores.
const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../public/privacidade/index.html'), 'utf8');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('a página /privacidade', () => {
  it('tem os dados do controlador, sem nenhum marcador sobrando', () => {
    expect(html).not.toContain('{{');
    expect(text).toMatch(/CNPJ \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    expect(html).toMatch(/href="mailto:[^"@\s]+@[^"\s]+"/);
  });

  it('diz o que é guardado, para quê, onde, por quanto tempo, quem recebe e os direitos', () => {
    for (const part of ['O que guardamos', 'Para quê', 'Onde', 'Por quanto tempo', 'Quem recebe', 'Seus direitos']) expect(text).toContain(part);
    for (const fact of ['Estados Unidos', '30 dias', 'Cloudflare', 'Resend', 'Apagar minha conta', 'Exportar']) expect(text).toContain(fact);
    // O que o código guarda de fato (spec 10): o e-mail no registro do código, a identificação do navegador na sessão (o IP não), os
    // pedidos de código embaralhados por uma hora e o histórico de 30 dias dos bancos depois de apagar a conta.
    for (const fact of ['10 minutos', 'identificação do navegador', 'A sessão não guarda o endereço IP', 'uma hora', 'histórico de 30 dias']) expect(text).toContain(fact);
    // E o resto (revisão da Task 19): quem só pede um código, o registro de cada aparelho, o que a passkey guarda, as aulas e o tour, o
    // código até ser usado ou até a limpeza, os registros técnicos, a Cloudflare recebendo o IP e o legítimo interesse dos limites.
    for (const fact of [
      'quem só pede um código',
      'identificador gerado no aparelho',
      'modelo do autenticador',
      'as aulas',
      'o tour',
      'até ser usado',
      'registros técnicos',
      'até 7 dias',
      'recebe o endereço IP',
      'legítimo interesse',
    ])
      expect(text).toContain(fact);
  });

  it('os direitos dizem o que o app faz de fato: o que o export leva, onde ficam passkeys e sessões, e o que se pede por e-mail', () => {
    for (const fact of ['Exportar (Klick)', 'sessões, solves, treino e ajustes', 'Passkeys', 'Sair de todos os aparelhos', 'trocar o e-mail']) expect(text).toContain(fact);
    expect(text).not.toContain('baixa tudo'); // o arquivo não leva o e-mail, as passkeys nem as sessões
  });

  it('tem a data desta versão', () => {
    expect(text).toContain('versão de 16 de outubro de 2026');
  });

  it('é uma página em português, legível no celular', () => {
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('name="viewport"');
  });
});
