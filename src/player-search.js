import sportsMap from '../data/sports-player-map.json' with {type:'json'};

// Sports.ru names are source-backed aliases, never inferred identity mappings.
const official=new Map();
for(const p of sportsMap.players){
 for(const key of [p.nbaId&&`nba:${p.nbaId}`,p.espnId&&`espn:${p.espnId}`,p.sportsId&&`sports:${p.sportsId}`].filter(Boolean))official.set(key,p);
}
const teams={ATL:'Atlanta Hawks Атланта Хокс',BOS:'Boston Celtics Бостон Селтикс',BKN:'Brooklyn Nets Бруклин Нетс',CHA:'Charlotte Hornets Шарлотт Хорнетс',CHI:'Chicago Bulls Чикаго Буллз',CLE:'Cleveland Cavaliers Кливленд Кавальерс',DAL:'Dallas Mavericks Даллас Маверикс',DEN:'Denver Nuggets Денвер Наггетс',DET:'Detroit Pistons Детройт Пистонс',GSW:'Golden State Warriors Голден Стэйт Уорриорз',HOU:'Houston Rockets Хьюстон Рокетс',IND:'Indiana Pacers Индиана Пэйсерс',LAC:'Los Angeles Clippers Лос Анджелес Клипперс',LAL:'Los Angeles Lakers Лос Анджелес Лейкерс',MEM:'Memphis Grizzlies Мемфис Гриззлис',MIA:'Miami Heat Майами Хит',MIL:'Milwaukee Bucks Милуоки Бакс',MIN:'Minnesota Timberwolves Миннесота Тимбервулвз',NOP:'New Orleans Pelicans Новый Орлеан Нью Орлеан Пеликанс',NYK:'New York Knicks Нью Йорк Никс',OKC:'Oklahoma City Thunder Оклахома Сити Тандер',ORL:'Orlando Magic Орландо Мэджик',PHI:'Philadelphia 76ers Филадельфия Сиксерс',PHX:'Phoenix Suns Финикс Санз',POR:'Portland Trail Blazers Портленд Трэйл Блэйзерс',SAC:'Sacramento Kings Сакраменто Кингз',SAS:'San Antonio Spurs Сан Антонио Сперс',TOR:'Toronto Raptors Торонто Рэпторс',UTA:'Utah Jazz Юта Джаз',WAS:'Washington Wizards Вашингтон Уизардс'};
Object.assign(teams,{SA:teams.SAS,NY:teams.NYK,GS:teams.GSW,NO:teams.NOP,WSH:teams.WAS,PHO:teams.PHX});
const aliases={1627759:'Джейлен Браун',1628971:'Брюс Браун',1641738:'Коби Браун',1630169:'Тайриз Халибертон Халлибертон',202681:'Кайри Ирвинг',203999:'Никола Йокич',2544:'Леброн Джеймс',1630162:'Энтони Эдвардс',1641705:'Виктор Вембаньяма',203507:'Яннис Адетокунбо',201939:'Стефен Стеф Карри',1629029:'Лука Дончич',203954:'Джоэл Эмбиид Эмбид',203076:'Энтони Дэвис'};
export function normalizeSearch(value){return String(value??'').toLowerCase().replace(/ё/g,'е').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
const letters={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
// This fallback expands search results only; it never joins database identities.
function phonetic(value){return normalizeSearch(value).replace(/[а-я]/g,c=>letters[c]??c).replace(/ch/g,'c').replace(/c/g,'k').replace(/y/g,'i');}
function sourceName(p){return official.get(`nba:${p.nbaId??p.id}`)||official.get(`espn:${p.espnId??String(p.id).replace(/^espn:/,'')}`)||official.get(`sports:${p.sportsId}`);}
const initialVariants={a:['а','э'],b:['б'],c:['к','с'],d:['д'],e:['е','э'],f:['ф'],g:['г','дж','ж'],h:['х','эйч'],i:['и','а'],j:['дж','ж','й','д'],k:['к'],l:['л'],m:['м'],n:['н'],o:['о'],p:['п'],q:['к'],r:['р'],s:['с','ш'],t:['т'],u:['у','ю'],v:['в'],w:['в','у'],x:['кс','з'],y:['й','и'],z:['з']};
const initialTokens=new Set([...Object.keys(initialVariants),...Object.values(initialVariants).flat()]);
function initialsFor(p){
 const first=normalizeSearch(p.name).split(' ')[0]||'';
 const english=first[0]||'';
 const result=new Set([english,...(initialVariants[english]||[])]);
 const alias=normalizeSearch(aliases[p.nbaId??p.id]||'').split(' ')[0];
 if(alias)result.add(alias.startsWith('дж')?'дж':alias[0]);
 return result;
}
export function playerSearchLabel(p){const source=sourceName(p);return [p.name,source?.sportsName||p.sportsName,source?.sportsClub||p.sportsClub||p.team].filter(Boolean).join(' · ');}
export function playerSearchMatches(p,query){
 const tokens=normalizeSearch(query).split(' ').filter(Boolean);if(!tokens.length)return true;
 const initials=initialsFor(p);
 // Only short standalone tokens act as initials; a surname remains mandatory.
 const initialAt=tokens.length>1?tokens.findIndex(token=>initialTokens.has(token)):-1;
 if(initialAt>=0&&!initials.has(tokens[initialAt]))return false;
 const source=sourceName(p);const team=String(p.nbaTeam??p.team??'');
 const text=normalizeSearch([p.name,p.sportsName,p.sportsClub,source?.sportsName,source?.sportsClub,aliases[p.nbaId??p.id],team,teams[team.toUpperCase()]].filter(Boolean).join(' '));
 const fallback=phonetic(text);
 return tokens.every((token,index)=>{if(index===initialAt)return true;const key=phonetic(token);return text.includes(token)||Boolean(key&&fallback.includes(key));});
}
export function playerSearchExact(p,query){const q=normalizeSearch(query);if(!q)return false;const source=sourceName(p);return [p.name,p.sportsName,source?.sportsName].some(name=>name&&normalizeSearch(name)===q);}

