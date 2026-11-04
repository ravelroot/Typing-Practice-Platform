import { el, icon, logoSvg } from './ui.ts';

interface Item {
  icon: string;
  name: string;
  kbd?: string;
  text: string;
  target?: string;
}

interface Step {
  targets: string[];
  title: string;
  text: string;
  items: Item[];
}

export const STEPS: Step[] = [
  {
    targets: ['modeSeg'],
    title: 'Modos',
    text: 'Escolha como quer treinar.',
    items: [
      { icon: 'feather', name: 'Livre', text: 'Sem cronômetro. Os textos vão chegando e você encerra quando quiser.', target: '#modeSeg button:nth-of-type(1)' },
      { icon: 'clock', name: 'Teste', text: 'O tempo começa no primeiro toque e para no último. No fim, vem o diagnóstico.', target: '#modeSeg button:nth-of-type(2)' },
    ],
  },
  {
    targets: ['kindDrop'],
    title: 'O que digitar',
    text: 'Abra a lista para trocar o conteúdo.',
    items: [
      { icon: 'text', name: 'Texto e Sem acentos', text: 'Frases e parágrafos em português, com ou sem acentos e cedilha.' },
      { icon: 'words', name: 'Palavras e Alfabeto', text: 'Palavras soltas ou o alfabeto em ordem, espaçado ou embaralhado.' },
      { icon: 'hash', name: 'Números e Teclado num.', text: 'Valores, datas e horas na fileira de cima, ou contas no teclado numérico, com Enter.' },
      { icon: 'mix', name: 'Misto', text: 'Palavras, números, letras, onomatopeias e símbolos, tudo junto.' },
      { icon: 'data', name: 'Dados e Customizado', text: 'Pedidos e notas como numa planilha, ou o seu texto, colado ou enviado em PDF, DOCX, DOC, ODT ou TXT.' },
    ],
  },
  {
    targets: ['sizeSeg', 'complexitySeg'],
    title: 'Tamanho e complexidade',
    text: 'Ajuste o desafio.',
    items: [
      { icon: 'next', name: 'Curto, Médio e Longo', text: 'De uma frase a um parágrafo inteiro.', target: '#sizeSeg' },
      { icon: 'zap', name: 'Fácil, Média e Difícil', text: 'No difícil entram acentos, pontuação, números e símbolos.', target: '#complexitySeg' },
    ],
  },
  {
    targets: ['typing'],
    title: 'Digitar',
    text: 'É só começar: não precisa clicar em nada.',
    items: [
      { icon: 'check', name: 'Acertos e erros', text: 'O cursor desliza pelas letras; acertos ganham cor e erros ficam em vermelho.' },
      { icon: 'restart', name: 'Recomeçar', kbd: 'Esc', text: 'Volta ao começo do mesmo texto.' },
      { icon: 'next', name: 'Novo texto', kbd: 'Tab', text: 'Troca por outro texto do mesmo tipo.' },
      { icon: 'close', name: 'Apagar', kbd: 'Backspace', text: 'Corrige o último caractere; Ctrl+Backspace apaga a palavra.' },
    ],
  },
  {
    targets: ['keyboardWrap'],
    title: 'Teclado na tela',
    text: 'Um guia para não olhar para as mãos.',
    items: [
      { icon: 'keyboard', name: 'Próxima tecla', kbd: 'Alt+K', text: 'Acende a tecla e a cor do dedo certo; o botão no topo mostra ou esconde o teclado.' },
      { icon: 'accent', name: 'Acentos', text: 'Mostra a sequência do padrão ABNT2: primeiro o acento (´ ~ ^ `), depois a letra.' },
    ],
  },
  {
    targets: ['hud'],
    title: 'Diagnóstico',
    text: 'Ao terminar um teste, ou ao encerrar o modo Livre:',
    items: [
      { icon: 'clock', name: 'Tempo, erros e acertos', text: 'Tempo final, toques brutos, acertos, erros corrigidos e não corrigidos.' },
      { icon: 'target', name: 'Precisão e toques líquidos', text: 'Toques líquidos = toques brutos − 5 × erros não corrigidos.' },
      { icon: 'flag', name: 'Encerrar a sessão livre', kbd: 'Ctrl+Enter', text: 'Mostra o diagnóstico de todos os textos da sessão.' },
    ],
  },
  {
    targets: ['historyBtn'],
    title: 'Histórico e recordes',
    text: 'Tudo fica salvo neste navegador.',
    items: [
      { icon: 'history', name: 'Histórico', kbd: 'Alt+H', text: 'Seus resultados, a evolução e o recorde de cada categoria.' },
      { icon: 'download', name: 'Exportar', text: 'Baixe o histórico em CSV para abrir numa planilha.' },
    ],
  },
  {
    targets: ['soundBtn', 'paletteBtn', 'themeBtn'],
    title: 'Visual e preferências',
    text: 'Deixe o Pluma do seu jeito.',
    items: [
      { icon: 'palette', name: 'Paleta de cores', text: 'Quatro paletas, cada uma com versão clara e escura.', target: '#paletteBtn' },
      { icon: 'moon', name: 'Tema', kbd: 'Alt+T', text: 'Alterna entre claro e escuro.', target: '#themeBtn' },
      { icon: 'volume', name: 'Som das teclas', kbd: 'Alt+S', text: 'Clique suave a cada toque.', target: '#soundBtn' },
      { icon: 'settings', name: 'Preferências', kbd: 'Alt+P', text: 'Cursor, tamanho da letra, efeitos e o menu do logo, onde este tutorial fica.', target: '#menuBtn' },
    ],
  },
];

function rectOf(selectors: string[]): DOMRect | null {
  const rects = selectors
    .map((s) => (s.startsWith('#') || s.includes(' ') ? document.querySelector<HTMLElement>(s) : document.getElementById(s)))
    .filter((n): n is HTMLElement => !!n && n.offsetParent !== null)
    .map((n) => n.getBoundingClientRect());
  if (!rects.length) return null;
  const l = Math.min(...rects.map((r) => r.left));
  const t = Math.min(...rects.map((r) => r.top));
  const r = Math.max(...rects.map((x) => x.right));
  const b = Math.max(...rects.map((x) => x.bottom));
  return new DOMRect(l, t, r - l, b - t);
}

export function startTour(onDone: () => void, welcome = true) {
  let index = -1;
  let focusTarget: string[] | null = null;
  const hole = el('div', { class: 'tour-hole', 'aria-hidden': 'true' });
  const card = el('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tutorial rápido' });
  const finish = () => {
    hole.remove();
    card.remove();
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', keys, true);
    onDone();
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish();
    } else if (e.key === 'ArrowRight' && index >= 0) {
      e.preventDefault();
      e.stopPropagation();
      go(index + 1);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      e.stopPropagation();
      go(index - 1);
    } else if (e.key === 'Tab') {
      const buttons = [...card.querySelectorAll<HTMLElement>('button')];
      if (!buttons.length) return;
      const i = buttons.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      e.stopPropagation();
      buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    } else if (!(e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' '))) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const place = () => {
    if (index < 0) {
      hole.style.cssText = `left:${window.innerWidth / 2}px;top:${window.innerHeight / 2}px;width:0;height:0;`;
      card.style.left = `${Math.max(12, (window.innerWidth - card.offsetWidth) / 2)}px`;
      card.style.top = `${Math.max(12, (window.innerHeight - card.offsetHeight) / 2)}px`;
      return;
    }
    const step = STEPS[index] as Step;
    const r = rectOf(focusTarget ?? step.targets);
    if (!r) return;
    const pad = 6;
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;`;
    const main = rectOf(step.targets) ?? r;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    let top = main.bottom + 16;
    if (top + ch > window.innerHeight - 12) top = main.top - ch - 16;
    if (top < 12) top = Math.max(12, Math.min(window.innerHeight - ch - 12, main.top + 24));
    const left = Math.min(window.innerWidth - cw - 12, Math.max(12, main.left + main.width / 2 - cw / 2));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  };
  const go = (i: number) => {
    if (i >= STEPS.length) return finish();
    index = i;
    focusTarget = null;
    card.replaceChildren();
    if (index < 0) {
      const logo = el('span', { class: 'logo' });
      logo.append(logoSvg());
      card.append(
        el('div', { class: 'tour-top' }, logo, el('h3', { text: 'Boas-vindas ao Pluma' })),
        el('p', { text: 'Quer um tutorial rápido? São oito passos curtos pelos modos, conteúdos, atalhos e o diagnóstico. Ele fica sempre no menu do logo, em Tutorial rápido.' }),
        el(
          'div',
          { class: 'row' },
          el('button', { class: 'btn ghost', type: 'button', onclick: finish, text: 'Agora não' }),
          el('button', { class: 'btn primary', type: 'button', onclick: () => go(0) }, icon('play', 14), 'Ver tutorial'),
        ),
      );
    } else {
      const step = STEPS[index] as Step;
      const list = el('ul', { class: 'tour-items' });
      for (const it of step.items) {
        const li = el(
          'li',
          {},
          el('span', { class: 'ic' }, icon(it.icon, 16)),
          el('span', { class: 'nm' }, it.name, it.kbd ? el('kbd', { text: it.kbd }) : null),
          el('span', { class: 'tx', text: it.text }),
        );
        if (it.target) {
          const sel = it.target;
          li.addEventListener('mouseenter', () => {
            focusTarget = [sel];
            place();
          });
          li.addEventListener('mouseleave', () => {
            focusTarget = null;
            place();
          });
        }
        list.append(li);
      }
      card.append(
        el('div', { class: 'tour-top' }, el('span', { class: 'tour-step', text: `Passo ${index + 1} de ${STEPS.length}` }), el('button', { class: 'tour-skip', type: 'button', onclick: finish, text: 'Pular tutorial' })),
        el('h3', { text: step.title }),
        el('p', { text: step.text }),
        list,
        el(
          'div',
          { class: 'row' },
          el('span', { class: 'dots' }, ...STEPS.map((_, j) => el('i', { class: j === index ? 'on' : '' }))),
          el(
            'span',
            { class: 'grp' },
            index > 0 ? el('button', { class: 'btn ghost', type: 'button', onclick: () => go(index - 1), text: 'Voltar' }) : null,
            el('button', { class: 'btn primary', type: 'button', onclick: () => go(index + 1), text: index === STEPS.length - 1 ? 'Começar a digitar' : 'Próximo' }),
          ),
        ),
      );
    }
    requestAnimationFrame(place);
    (card.querySelector('.btn.primary') as HTMLElement | null)?.focus({ preventScroll: true });
  };
  document.body.append(hole, card);
  window.addEventListener('resize', place);
  document.addEventListener('keydown', keys, true);
  go(welcome ? -1 : 0);
}
