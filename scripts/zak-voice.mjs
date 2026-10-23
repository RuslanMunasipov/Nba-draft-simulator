// The voice of Зак Онн, the league's lawyer: the facts of a protocol stay as the rules check found them, he only adds
// his remark, a word on the deal's circumstances, now and then a lawyer joke, and his signature. His lines read like a
// 90s American action film where the only plot is law and order. Claude writes them through the owner's subscription
// (scripts/claude-text.mjs, writeVoice below) from the protocol's facts; the bank of lines here is his voice whenever
// Claude cannot write. Every choice of the bank is picked by the protocol's own key, so a protocol always reads the same.
import {claudeJSON} from './claude-text.mjs';
import {TRANSFER_HOURS,FBL_TRANSFERS} from '../src/rules.js';
import {CLUB_LIMIT} from '../src/engine.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
const pick=(lines,seed)=>{let h=0;for(const ch of String(seed))h=(h*31+ch.codePointAt(0))>>>0;return lines[h%lines.length];};

// A clean roster: he approves, without warmth.
const APPROVED=[
 'Чисто. Зак Онн искал, к чему придраться, и не нашёл. Пока.',
 'Регламент соблюдён. Это не похвала. Это норма.',
 'Сделка законна. Зак Онн убирает руку с кобуры.',
 'Закон доволен. Зак Онн — нет. Зак Онн никогда не доволен.',
 'Чисто. Можешь спать спокойно, GM. Зак Онн — не будет.',
 'Город спит. Лига в безопасности. Зак Онн на посту.',
 'Всё по закону. Сегодня — без перестрелки.',
 'Сделка прошла проверку. Зак Онн записал. Зак Онн всё записывает.',
 'Порядок в лиге. Так и должно быть. Всегда.',
 'Чисто, как ствол после чистки. Зак Онн одобряет.',
 'Закон соблюдён. Зак Онн надевает тёмные очки и уходит в закат.',
 'Ни одного нарушения. Скучно. Зак Онн любит, когда скучно.',
 'Нарушений не обнаружено. Подозреваемый свободен. Пока.',
 'Протокол чист. Зак Онн убирает наручники обратно в бардачок.',
 'Закон на месте. Порядок на месте. Зак Онн на месте.',
 'Ни одной улики. Зак Онн даже немного расстроен.',
 'Всё легально. Сегодня обойдёмся без погони.',
 'Чисто. Можно выдохнуть. Но не слишком громко.',
 'Регламент цел. Лига цела. Зак Онн доволен на три процента.',
 'Без нарушений. Зак Онн заносит это в папку «Чудеса».'
];
// A clean roster of a team he is watching.
const APPROVED_WATCHED=[
 'Команда под прицелом. На этот раз — чисто. Прицел остаётся.',
 'Чисто. Зак Онн не моргнул. Он вообще не моргает.',
 'В этот раз без нарушений. Зак Онн отметил. Зак Онн продолжает смотреть.',
 'Неплохо, GM. Но Зак Онн не опускает ствол.',
 'Чисто. Палец Зака Онна всё ещё лежит на спусковом крючке.',
 'Исправляешься? Зак Онн видел таких. Зак Онн подождёт.',
 'Под прицелом и без нарушений. Так и держать, GM.',
 'Зак Онн проверил дважды. Чисто. Проверит и в третий раз.',
 'Хорошее поведение замечено. Досье пока не закрыто.',
 'Один чистый трансфер — ещё не алиби.'
];
// A doubt: he does not accuse yet. By what is in doubt, with general lines for anything else.
const CHECK=[
 'Зак Онн не обвиняет. Пока. Зак Онн проверяет.',
 'На границе закона долго не стоят. Зак Онн выясняет, по какую сторону эта сделка.',
 'Сомнение — не оправдание. Сомнение — повод для проверки.',
 'Что-то здесь не так. Зак Онн чувствует это нутром.',
 'Всем оставаться на местах. Идёт проверка.',
 'Зак Онн поднимает материалы дела. Никто не покидает здание.',
 'Подозрение — ещё не приговор. Но Зак Онн уже рядом.',
 'Журналы изъяты. Свидетели опрашиваются. Зак Онн разбирается.'
];
const CHECK_BY={
 time:['Сделка у самой черты 22:00. Зак Онн сверяет часы со Sports.ru.','Минута туда, минута сюда — для Зака Онна это целая вечность.',
  'Часы тикают. Зак Онн выясняет, на чьей они стороне.','Пограничное время. Пограничная сделка. Зак Онн на границе.'],
 white:['Засчитываемый игрок ушёл. Кто прикроет белое правило — решит лига. Зак Онн проследит.','Белое правило под вопросом. А вопросы здесь задаёт Зак Онн.',
  'Ключевой свидетель белого правила покинул состав. Зак Онн ищет замену в материалах дела.'],
 unmarked:['В составе есть игроки без решения лиги. Зак Онн ждёт заключения.','Личность не установлена. Лига, ваш ход.']
};
// An obvious breach, by the rule that was broken.
const BREACH={
 rookie:['Новичок — не опция. Новичок — закон.','Состав без новичка — это не состав. Это улика.',
  'Где новичок, GM? Зак Онн спрашивает один раз.','Каждой команде — новичок. Это не просьба. Это закон.',
  'Новичка нет. Зато есть проблема.','Без новичка — ни шагу. Таков закон.'],
 white:['Белое правило не обсуждается. Оно исполняется.','Белое правило существует не для красоты.',
  'Белое правило нарушено. Зак Онн снимает пиджак.','Правило есть правило. А это — нарушение правила.',
  'Белое правило не любит, когда о нём забывают. Зак Онн тоже.','Белое правило нарушено. Заседание открыто.'],
 club:['Двое из одного клуба — предел. Третий — повод для разговора.','Лимит клуба NBA — два. Зак Онн умеет считать до трёх.',
  'Трое из одного клуба — это уже не команда. Это банда.','Третий лишний. Зак Онн знает, кто именно.',
  'Слишком много друзей из одного клуба. Это уже сговор.','Это не состав, это филиал клуба NBA. Расформировать.'],
 transfers:['Три трансфера в неделю. Не четыре. Зак Онн умеет считать.','Лимит трансферов — не пожелание.',
  'Четвёртый трансфер? В этом городе так дела не делаются.','Лимит исчерпан. Рынок закрыт. Шериф на месте.',
  'Рынок закрыт до понедельника. Для тебя — особенно.','Ещё один трансфер — и Зак Онн начнёт считать вслух.'],
 time:['08:00–22:00 значит 08:00–22:00. Часы — не украшение.','Ночью лига спит. Зак Онн — нет.',
  'После 22:00 рынок закрыт. Закон работает круглосуточно.','Ночная сделка? Зак Онн видит в темноте.',
  'Комендантский час — с 22:00. Нарушителей ждёт разговор.','Сделки после отбоя? Не в смену Зака Онна.',
  'Ночной рынок — это чёрный рынок. А чёрный рынок — это к Заку Онну.'],
 duplicate:['Один игрок — одна команда. Это не обсуждается.','Чужой игрок в твоём составе? Это называется кража, GM.',
  'Двух одинаковых игроков в лиге не бывает. Бывают нарушители.','Игрок уже занят. Зак Онн тоже — твоим делом.']
};
// More than one rule broken at once.
const BREACH_MANY=['Несколько нарушений за раз? Это уже не ошибка. Это стиль.','Букет нарушений. Зак Онн приобщает его к делу целиком.',
 'Сразу по нескольким статьям. Зак Онн впечатлён. Зак Онн недоволен.'];
const BREACH_WATCHED=[
 'Повторное нарушение. Прицел больше не предупреждение.',
 'Зак Онн предупреждал. Зак Онн не повторяет дважды.',
 'Зак Онн обещал вернуться. Зак Онн вернулся.',
 'Второй шанс был. Третьего не будет.',
 'Это уже не случайность. Это почерк. Зак Онн знает этот почерк.',
 'Игра окончена, GM. Дальше — по закону.',
 'Рецидив. Зак Онн любит это слово. И ненавидит то, что оно значит.',
 'Досье пополнено. Папка стала тяжелее.',
 'Прицел был не для красоты.'
];
// The deal's circumstances: the week's last transfer, an empty or a full bank, an expensive buy, a package, the first
// transfer of the week. One of them, the first that applies.
const CONTEXT={
 lastTransfer:['Последний трансфер недели. Обойма пуста до понедельника.','Лимит выбран. Дальше — только ждать понедельника.',
  'Ноль трансферов в запасе. До понедельника рынок для этой команды закрыт.'],
 emptyBank:['Банк пуст. Как и терпение Зака Онна.','Денег почти ноль. Зак Онн уважает игру ва-банк. Но не очень.',
  'Касса опустела. Зак Онн проверил: всё законно, просто бедно.'],
 bigBuy:['Крупная покупка. Зак Онн проверил чек.','Дорогой трансфер. Зак Онн не завидует. Зак Онн проверяет.',
  'Большие деньги — большая ответственность. Зак Онн следит за обеими.'],
 package:['Сразу несколько сделок. Зак Онн любит пакеты: их удобно приобщать к делу.','Оптовая закупка. Каждая сделка проверена поштучно.'],
 richBank:['В кармане ещё приличная сумма. Зак Онн следит, куда она уйдёт.'],
 firstOfWeek:['Первый трансфер недели. Счётчик запущен.','Неделя открыта. Зак Онн уже считает.']
};
// Dumb American lawyer jokes, told now and then.
const JOKES=[
 'Возражение! — Отклонено. — Но я ещё не сказал, против чего. — Тем более отклонено.',
 'Вы имеете право хранить молчание. Всё, что вы купите на Sports.ru, будет использовано против вас.',
 'Час консультации Зака Онна стоит 500 долларов. Этот протокол — бесплатно. Цените.',
 'Зак Онн проиграл одно дело. Это было дело о том, может ли Зак Онн проиграть.',
 'Свидетель, отвечайте только «да» или «нет». Других ответов Зак Онн не слышит.',
 'Суд удаляется на совещание. Пончики — за счёт нарушителя.',
 'Сколько юристов нужно, чтобы вкрутить лампочку? Один. Зак Онн. И лампочка подпишет признание.',
 'Зак Онн не берёт выходных. Его адвокат пытался. Зак Онн его засудил.',
 'Протест принят к сведению. И выброшен в корзину.',
 'В этой лиге два вида GM: законопослушные и клиенты Зака Онна.',
 'Зак Онн не читает мелкий шрифт. Мелкий шрифт читает Зака Онна.',
 'Пострадали от трансфера? Звоните 1-800-ЗАК-ОНН. Он и так уже в курсе.',
 'Правосудие слепо. Зак Онн — нет. У Зака Онна тёмные очки, но он всё видит.',
 'Присяжные совещались 4 секунды. Зак Онн счёл это затянутым.',
 'Сделка без юриста — как баскетбол без кольца. Можно, но зачем.',
 'Зак Онн подписал этот протокол. Ручка до сих пор дрожит.',
 'Адвокат защиты взял слово. Зак Онн взял его обратно.',
 'Это не угроза. Это юридически обязывающее предупреждение.',
 'Зак Онн выставляет счёт даже за паузы в разговоре. Эта пауза стоила 40 долларов.',
 'Чем Зак Онн отличается от акулы? Акула иногда отдыхает.'
];
const SIGNATURES=[
 'Зак Онн, юрист лиги FBL. Не спит. Не прощает. Не забывает.',
 'Зак Онн. Закон лиги FBL.',
 'Зак Онн, юрист лиги FBL. Видит каждую сделку.',
 'Зак Онн, юрист лиги FBL. Dura lex, sed lex.',
 'Зак Онн. Я и есть закон.',
 'Зак Онн. Закон и порядок. Именно в таком порядке.',
 'Зак Онн, юрист лиги FBL. Без выходных. Без компромиссов.',
 'Зак Онн. Порядок — это не просьба.',
 'Зак Онн, юрист лиги FBL. Правосудие не опаздывает.',
 'Зак Онн. Объявлен перерыв. Закон — нет.',
 'Зак Онн, юрист лиги FBL. Дело закрыто. Пока.'
];
export const LINES={APPROVED,APPROVED_WATCHED,CHECK,CHECK_BY,BREACH,BREACH_MANY,BREACH_WATCHED,CONTEXT,JOKES,SIGNATURES};
// The heading he opens a verdict with.
export const HEADINGS={violation:'⚖️ <b>ЗАК ОНН НЕДОВОЛЕН</b>',check:'🔎 <b>ЗАК ОНН ПРОВЕРЯЕТ</b>',approved:null};

// remark(verdict, rules broken or in doubt, watched?, seed) → his line on the verdict.
export const remark=(...a)=>remarkLines(...a).join(' ');
// His remark as lines: the first is his word on the verdict; a second (a watched team, or several rules broken at once)
// may be left out when the protocol would not fit under his photo.
export function remarkLines(kind,rules=[],watched=false,seed=''){
 if(kind==='violation'){
  // One line for the first broken rule (the protocol lists the rest), then one for a watched team or, otherwise, for
  // several rules broken at once: two lines at most.
  const lines=rules.filter(r=>BREACH[r]).slice(0,1).map(r=>pick(BREACH[r],seed+r));
  if(rules.length>1&&!watched)lines.push(pick(BREACH_MANY,seed));
  if(watched)lines.push(pick(BREACH_WATCHED,seed));
  return lines.length?lines:[pick(BREACH_WATCHED,seed)];
 }
 if(kind==='check'){const r=rules.find(r=>CHECK_BY[r]);return [pick(r?CHECK_BY[r]:CHECK,seed+(r||''))];}
 return [pick(watched?APPROVED_WATCHED:APPROVED,seed)];
}
// circumstance({left, used, bank, moves, maxPrice}) → which circumstance of the deal he speaks to, or null;
// circumstances(…, seed) → his word on it.
export const circumstance=({left,used,bank,moves=1,maxPrice=0})=>
 left===0?'lastTransfer':bank!=null&&bank<200?'emptyBank':maxPrice>=2200?'bigBuy':moves>1?'package':bank>=3000?'richBank':used===1?'firstOfWeek':null;
export function circumstances(deal,seed=''){const key=circumstance(deal);return key?pick(CONTEXT[key],seed+key):null;}
// A joke for every other protocol.
export const tellsJoke=seed=>pick([true,false],seed+'j');
export const joke=seed=>tellsJoke(seed)?pick(JOKES,seed+'joke'):null;
export const signature=seed=>pick(SIGNATURES,seed);

// His voice written by Claude. The facts are the protocol's own (the verdict, the rules, the case, the circumstance),
// in words: no player, no money, no count of the protocol is given, so none can come back wrong.
const RULE={rookie:'правило новичка: в составе всегда есть новичок',
 white:'белое правило: в составе есть засчитываемый игрок из белого списка лиги',
 unmarked:'белое правило: по игрокам состава ещё нет решения лиги',
 club:`лимит клуба NBA: не больше ${CLUB_LIMIT} игроков одного клуба`,
 transfers:`лимит трансферов: ${FBL_TRANSFERS.perWeek} в неделю`,
 time:`время сделок: только с ${TRANSFER_HOURS.from} до ${TRANSFER_HOURS.to} по Москве`,
 duplicate:'уникальность игроков: игрок может быть только в одной команде лиги'};
const CIRCUMSTANCE={lastTransfer:'это последний трансфер команды на этой неделе: до понедельника рынок для неё закрыт',
 emptyBank:'в банке команды почти не осталось денег',bigBuy:'дорогая покупка',package:'несколько сделок одним пакетом',
 richBank:'в банке команды ещё приличная сумма',firstOfWeek:'первый трансфер команды на этой неделе'};
const VERDICT={violation:'нарушение регламента',check:'нужна проверка: явного нарушения нет, но есть сомнение',approved:'одобрено: состав соответствует регламенту'};
// voiceFacts({kind, rules, watched, standing, fixed, team, circumstance, joke}) → the facts Claude writes from. rules: the
// rules broken (a breach) or in doubt (a check), the first is the one his remark speaks to; standing: a breach the
// roster already had; fixed: the rules the deals repaired.
export function voiceFacts({kind,rules=[],watched=false,standing=false,fixed=[],team,circumstance:c=null,joke:j=false}){
 const t=LEAGUE_TEAMS[team];
 return {verdict:VERDICT[kind]||VERDICT.check,
  case:kind==='violation'?(standing?'нарушение не устранено: команда уже нарушала, это рецидив':'новое нарушение: дело открыто')
   :fixed.length?`прежнее нарушение устранено (${fixed.map(r=>RULE[r]?.split(':')[0]||r).join(', ')}): дело закрыто`:null,
  rules:rules.filter(r=>RULE[r]).map(r=>RULE[r]),
  watched:watched?'команда под прицелом Зака Онна':null,
  team:t?.name||null,gm:t?.gm||null,
  circumstance:c?CIRCUMSTANCE[c]||null:null,
  secondLine:kind==='violation'&&(watched||rules.length>1),joke:Boolean(j)};
}

const VOICE=`Ты — Зак Онн, юрист фэнтези-лиги FBL (Fantasy Brothers League) по баскетболу NBA. Адвокат с большой буквы, всегда в красной кепке «God Bless America».
Ты пишешь свою реплику под протоколом трансфера. Факты протокола (сделки, баланс, лимиты, проверка регламента, вердикт) уже написаны ботом: ты их не пересказываешь и не меняешь вердикт.
Твой голос — американский боевик 90-х, где весь сюжет — закон и порядок: короткие рубленые фразы, часто о себе в третьем лице («Зак Онн»), холодная ирония, суровость без грубости и мата. Твой мир — значок, наручники, тёмные очки, ночной город, погоня, допрос, досье, прицел, суд. Грозишь ты только законом.
Ты ничего не понимаешь в программировании и никогда не говоришь о технике (карточки, номера, базы, боты, код): ты знаешь всё о законе, делах и сомнительных типах.
Ты отвечаешь только за закон: регламент лиги, составы, трансферы, лимиты, время сделок. О наградах, ФО, очках и игре игроков, прогнозах и советах ты не говоришь: это не твоё дело.
Тон по вердикту: одобрено — одобряешь без тепла, подозрительность остаётся; одобрено, а команда под прицелом — чисто, но прицел остаётся; дело закрыто — закрываешь, но не улыбаешься; проверка — не обвиняешь, а проверяешь то, что под сомнением; нарушение — жёстко, о нарушенном правиле (первом в списке); рецидив или команда под прицелом — ещё жёстче, ты предупреждал.
Примеры тона (не повторяй их, пиши свои): «Регламент соблюдён. Это не похвала. Это норма.» «Зак Онн обещал вернуться. Зак Онн вернулся.» «Зак Онн. Закон и порядок. Именно в таком порядке.»`;
const RULES=`Правила:
- remark: одна-две короткие фразы о вердикте, до 110 знаков.
- remark2: если secondLine = true — вторая реплика до 110 знаков: для команды под прицелом — о прицеле и рецидиве, иначе о том, что нарушено сразу несколько правил; иначе пустая строка.
- circumstance: если в фактах есть circumstance — одна фраза о нём, до 110 знаков; иначе пустая строка.
- joke: если joke = true — одна тупая шутка про американских юристов и суд в духе 90-х, до 120 знаков; иначе пустая строка.
- signature: подпись — «Зак Онн» и короткий девиз закона и порядка, до 80 знаков.
- Никаких цифр, кроме тех, что есть в фактах. Не называй игроков. Команду и GM называй только так, как в фактах.
- Без эмодзи, HTML и markdown. Ответь строго JSON: {"remark": "...", "remark2": "...", "circumstance": "...", "joke": "...", "signature": "..."}`;
export const VOICE_SCHEMA={type:'object',additionalProperties:false,required:['remark','remark2','circumstance','joke','signature'],
 properties:{remark:{type:'string'},remark2:{type:'string'},circumstance:{type:'string'},joke:{type:'string'},signature:{type:'string'}}};
export const voicePrompt=facts=>({system:`${VOICE}\n\n${RULES}`,prompt:`Протокол трансфера. Факты:\n${JSON.stringify(facts,null,1)}`});

// His lines from Claude's answer, or the reason they cannot go out: a line too long or empty, a number the facts do not
// have, awards or fantasy points (not his business), an approval in a breach, or a signature that is not his.
const LONG=120,cyr='А-Яа-яЁё';
const OFF_DUTY=new RegExp(`(^|[^${cyr}])ФО([^${cyr}]|$)|наград|фэнтези-очк|MVP|прогноз`,'i');
export function voiceLines(x,facts){
 const t=v=>typeof v==='string'?v.replace(/\s+/g,' ').trim():'';
 const remark=t(x?.remark),remark2=facts.secondLine?t(x?.remark2):'',said=facts.circumstance?t(x?.circumstance):'',told=facts.joke?t(x?.joke):'',sign=t(x?.signature);
 const all=[remark,remark2,said,told,sign].filter(Boolean);
 if(!remark)return {error:'no remark'};
 if(!sign||!/Зак Онн/.test(sign)||sign.length>90)return {error:`signature: ${sign||'none'}`};
 const long=all.find(l=>l.length>LONG);if(long)return {error:`too long: ${long}`};
 const allowed=new Set(JSON.stringify(facts).match(/\d+/g)||[]),stray=all.join(' ').match(/\d+/g)?.filter(n=>!allowed.has(n));
 if(stray?.length)return {error:`numbers not in the facts: ${stray.join(', ')}`};
 const off=all.find(l=>OFF_DUTY.test(l));if(off)return {error:`not his business: ${off}`};
 if(facts.verdict===VERDICT.violation&&/одобр/i.test(all.join(' ')))return {error:'approves a breach'};
 if(all.some(l=>/<[a-z/]|[*_`]{2}/i.test(l)))return {error:'markup'};
 return {lines:[remark,...remark2?[remark2]:[],...[said,told].filter(Boolean).map(l=>({extra:l}))],signature:sign};
}
// writeVoice(facts) → {lines, signature}: his remark (and second line), then the extra lines ({extra}: the circumstance,
// a joke) the protocol may drop to fit under his photo, and his signature. An answer that breaks a rule is written once
// more, then null (the bank speaks). A ClaudeError (no CLI, the token, the limit, no answer in time) is thrown.
export async function writeVoice(facts,{write=claudeJSON,attempts=2,timeoutMs=90e3,log=console.warn}={}){
 for(let i=0;i<attempts;i++){
  const {data}=await write({...voicePrompt(facts),schema:VOICE_SCHEMA,timeoutMs});
  const out=voiceLines(data,facts);
  if(!out.error)return out;
  log(`Зак Онн (Claude): answer dropped (${out.error})`);
 }
 return null;
}
