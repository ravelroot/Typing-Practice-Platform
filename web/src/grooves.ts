export const GROOVE_IDS = ['chip', 'synthwave', 'rock', 'punk', 'pop', 'disco', 'house', 'funk', 'samba', 'bossa', 'baiao', 'reggae', 'lofi', 'jazz', 'dnb', 'metal', 'frevo', 'blues'] as const;
export type GrooveId = (typeof GROOVE_IDS)[number];

export const VOICES = ['kick', 'snare', 'clap', 'hat', 'open', 'rim', 'shaker', 'bell', 'bass', 'stab'] as const;
export type Voice = (typeof VOICES)[number];

export type Pattern = Partial<Record<Voice, string>> & { kick: string; bass: string };
export type BassMove = 'root' | 'octave' | 'fifth' | 'pulse' | 'walk' | 'boogie';
export type Fill = 'snare' | 'tom' | 'soft';

export interface Groove {
  label: string;
  move: BassMove;
  fill: Fill;
  verse: Pattern;
  chorus: Pattern;
}

export const GROOVES: Record<GrooveId, Groove> = {
  chip: {
    label: 'Chiptune',
    move: 'octave',
    fill: 'snare',
    verse: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.', bass: 'x.x.x.x.x.x.x.x.' },
    chorus: { kick: 'x.....x.x..x....', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', bass: 'x.xxx.x.x.xxx.x.' },
  },
  synthwave: {
    label: 'Synthwave',
    move: 'pulse',
    fill: 'tom',
    verse: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', bass: 'xoxoxoxoxoxoxoxo' },
    chorus: { kick: 'x.......x.......', snare: '....x.......x...', clap: '....x.......x...', hat: 'oxoxoxoxoxoxoxox', bass: 'xoxoxoxoxoxoxoxo' },
  },
  rock: {
    label: 'Rock',
    move: 'root',
    fill: 'tom',
    verse: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.' },
    chorus: { kick: 'x.....x.x.x.....', snare: '....x.......x...', open: 'x.x.x.x.x.x.x.x.', bass: 'x.xxx.x.x.xxx.x.' },
  },
  punk: {
    label: 'Punk',
    move: 'root',
    fill: 'tom',
    verse: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.' },
    chorus: { kick: 'x...x...x...x...', snare: '..x...x...x...x.', open: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.' },
  },
  pop: {
    label: 'Pop',
    move: 'fifth',
    fill: 'snare',
    verse: { kick: 'x.......x.x.....', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x..x..x.x..x..x.' },
    chorus: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', bass: 'x.x.x.x.x.x.x.x.', stab: '..x.....x.x.....' },
  },
  disco: {
    label: 'Disco',
    move: 'octave',
    fill: 'snare',
    verse: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x...x...x...x...', open: '..x...x...x...x.', bass: 'x.x.x.x.x.x.x.x.' },
    chorus: { kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', open: '..x...x...x...x.', bass: 'xxx.x.xxx.x.xxx.', stab: '..x...x...x...x.' },
  },
  house: {
    label: 'House',
    move: 'root',
    fill: 'soft',
    verse: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', open: '..x...x...x...x.', bass: '..x...x...x...x.' },
    chorus: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'oooooooooooooooo', open: '..x...x...x...x.', bass: '..x.x.x...x.x.x.', stab: '..x..x....x..x..' },
  },
  funk: {
    label: 'Funk',
    move: 'octave',
    fill: 'snare',
    verse: { kick: 'x..x......x.....', snare: '....x..o.o..x...', hat: 'xoxoxoxoxoxoxoxo', bass: 'x..x..x...xx..x.' },
    chorus: { kick: 'x..x...x..x.....', snare: '....x..o.o..x..o', hat: 'xoxoxoxoxoxoxoxo', open: '..............x.', bass: 'x..x.xx...xx.x..', stab: '..x....x..x....x' },
  },
  samba: {
    label: 'Samba',
    move: 'fifth',
    fill: 'snare',
    verse: { kick: 'o...x...o...x...', rim: 'x.x..x.x..x.x...', shaker: 'xoooxoooxoooxooo', bass: 'x.....x.x.....x.' },
    chorus: { kick: 'o...x...o...x...', rim: 'x.x..x.x..x.x...', shaker: 'xoooxoooxoooxooo', bell: 'x.o...x.x.o...x.', snare: 'o.o.o.oxo.o.o.ox', bass: 'x..x..x.x..x..x.' },
  },
  bossa: {
    label: 'Bossa nova',
    move: 'fifth',
    fill: 'soft',
    verse: { kick: 'x.....x.x.....x.', rim: 'x..x..x...x..x..', shaker: 'o.o.o.o.o.o.o.o.', bass: 'x.....x.x.....x.' },
    chorus: { kick: 'x.....x.x.....x.', rim: 'x..x..x...x..x..', hat: 'o.o.o.o.o.o.o.o.', bass: 'x.....x.x.....x.', stab: 'x..x..x...x..x..' },
  },
  baiao: {
    label: 'Baião',
    move: 'fifth',
    fill: 'snare',
    verse: { kick: 'x.....x.x.......', snare: '....o.......o...', hat: 'oxoxoxoxoxoxoxox', bass: 'x.....x.x.......' },
    chorus: { kick: 'x.....x.x.....x.', snare: '....x.......x...', hat: 'oxoxoxoxoxoxoxox', bell: 'x.......x.......', bass: 'x.....x.x.....x.', stab: '..x...x...x...x.' },
  },
  reggae: {
    label: 'Reggae',
    move: 'root',
    fill: 'soft',
    verse: { kick: '........x.......', rim: '........x.......', hat: 'x.x.x.x.x.x.x.x.', bass: 'x..x....x.x...x.', stab: '....x.......x...' },
    chorus: { kick: 'x...x...x...x...', rim: '........x.......', hat: 'xoxoxoxoxoxoxoxo', bass: 'x..x..x.x..x..x.', stab: '..x...x...x...x.' },
  },
  lofi: {
    label: 'Lo-fi',
    move: 'root',
    fill: 'soft',
    verse: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.......x.....x.', stab: 'x.......x.......' },
    chorus: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.', shaker: 'o.o.o.o.o.o.o.o.', bass: 'x.....x.x.......', stab: 'x.......x.....x.' },
  },
  jazz: {
    label: 'Jazz',
    move: 'walk',
    fill: 'soft',
    verse: { kick: 'o.......o.......', hat: 'x...x.x.x...x.x.', rim: '....x.......x...', bass: 'x...x...x...x...' },
    chorus: { kick: 'o.......o.......', hat: 'x...x.x.x...x.x.', rim: '....x.......x...', snare: '......o...o...o.', bass: 'x...x...x...x...', stab: '..x.......x.....' },
  },
  dnb: {
    label: 'Drum and bass',
    move: 'root',
    fill: 'snare',
    verse: { kick: 'x.........x.....', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', bass: 'x.........x.....' },
    chorus: { kick: 'x.........x..x..', snare: '....x..o....x...', hat: 'xoxoxoxoxoxoxoxo', open: '..............x.', bass: 'x.....x...x.....' },
  },
  metal: {
    label: 'Metal',
    move: 'pulse',
    fill: 'tom',
    verse: { kick: 'xoxxxoxxxoxxxoxx', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.xxx.xxx.xxx.xx' },
    chorus: { kick: 'xoxoxoxoxoxoxoxo', snare: '....x.......x...', open: 'x...x...x...x...', bass: 'xoxoxoxoxoxoxoxo' },
  },
  frevo: {
    label: 'Frevo',
    move: 'octave',
    fill: 'snare',
    verse: { kick: 'x...x...x...x...', snare: 'o.oxo.oxo.oxo.ox', bass: 'x.x.x.x.x.x.x.x.' },
    chorus: { kick: 'x...x...x...x...', snare: 'oooxoooxoooxooox', clap: '....x.......x...', bell: 'x...x...x...x...', bass: 'x.x.x.x.x.x.x.x.', stab: '..x...x...x...x.' },
  },
  blues: {
    label: 'Blues',
    move: 'boogie',
    fill: 'snare',
    verse: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.' },
    chorus: { kick: 'x.......x.......', snare: '....x.......x...', open: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', stab: '....x.......x...' },
  },
};

export const hitAt = (pattern: string | undefined, step: number): number => {
  const c = pattern?.[step];
  return c === 'x' ? 1 : c === 'o' ? 0.55 : 0;
};

export const hitIndex = (pattern: string, step: number): number => {
  let n = 0;
  for (let i = 0; i < step; i++) if (pattern[i] === 'x' || pattern[i] === 'o') n++;
  return n;
};
