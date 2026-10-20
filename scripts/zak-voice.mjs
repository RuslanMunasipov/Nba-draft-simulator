// The voice of Зак Онн, the league's lawyer: the facts of a protocol stay as the rules check found them, he only adds
// his remark and his signature. Lines are chosen by the verdict, the broken rule and whether the team is on his
// watchlist, and picked by the protocol's own key, so a protocol always reads the same.
const pick=(lines,seed)=>{let h=0;for(const ch of String(seed))h=(h*31+ch.codePointAt(0))>>>0;return lines[h%lines.length];};

// A clean roster: he approves, without warmth.
const APPROVED=[
 'Чисто. Зак Онн искал, к чему придраться, и не нашёл. Пока.',
 'Регламент соблюдён. Это не похвала. Это норма.',
 'Сделка законна. Зак Онн фиксирует и смотрит дальше.',
 'Нарушений нет. Зак Онн слегка разочарован, но закон есть закон.',
 'Всё по правилам. Зак Онн запомнил и это.',
 'Состав чист. Зак Онн возвращается к журналам.'
];
// A clean roster of a team he is watching.
const APPROVED_WATCHED=[
 'Команда под прицелом. На этот раз — чисто. Прицел остаётся.',
 'Чисто. Зак Онн не моргнул. Он вообще не моргает.',
 'В этот раз без нарушений. Зак Онн отметил. Зак Онн продолжает смотреть.'
];
// A doubt: he does not accuse yet.
const CHECK=[
 'Зак Онн не обвиняет. Пока. Зак Онн проверяет.',
 'На границе закона долго не стоят. Зак Онн выясняет, по какую сторону эта сделка.',
 'Сомнение — не оправдание. Сомнение — повод для проверки.'
];
// An obvious breach, by the rule that was broken.
const BREACH={
 rookie:['Новичок — не опция. Новичок — закон.','Состав без новичка — это не состав. Это нарушение.'],
 white:['Белое правило не обсуждается. Оно исполняется.','Белое правило существует не для красоты.'],
 club:['Двое из одного клуба — предел. Третий — повод для разговора.','Лимит клуба NBA — два. Зак Онн умеет считать до трёх.'],
 transfers:['Три трансфера в неделю. Не четыре. Зак Онн умеет считать.','Лимит трансферов — не пожелание.'],
 time:['08:00–22:00 значит 08:00–22:00. Часы — не украшение.','Ночью лига спит. Зак Онн — нет.']
};
const BREACH_WATCHED=['Повторное нарушение. Прицел больше не предупреждение.','Зак Онн предупреждал. Зак Онн не повторяет дважды.'];
const SIGNATURES=[
 'Зак Онн, юрист лиги FBL. Не спит. Не прощает. Не забывает.',
 'Зак Онн. Закон лиги FBL.',
 'Зак Онн, юрист лиги FBL. Видит каждую сделку.',
 'Зак Онн, юрист лиги FBL. Dura lex, sed lex.'
];
// The heading he opens a verdict with.
export const HEADINGS={violation:'⚖️ <b>ЗАК ОНН НЕДОВОЛЕН</b>',check:'🔎 <b>ЗАК ОНН ПРОВЕРЯЕТ</b>',approved:null};

// remark(verdict, rules broken, watched?, seed) → his line; signature(seed) → how he signs.
export function remark(kind,rules=[],watched=false,seed=''){
 if(kind==='violation'){
  // One line for the first broken rule (the protocol lists the rest), and one more for a watched team.
  const lines=rules.filter(r=>BREACH[r]).slice(0,1).map(r=>pick(BREACH[r],seed+r));
  if(watched)lines.push(pick(BREACH_WATCHED,seed));
  return lines.join(' ')||pick(BREACH_WATCHED,seed);
 }
 if(kind==='check')return pick(CHECK,seed);
 return pick(watched?APPROVED_WATCHED:APPROVED,seed);
}
export const signature=seed=>pick(SIGNATURES,seed);
