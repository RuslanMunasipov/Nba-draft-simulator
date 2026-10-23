// FBL 2026-27 draft order (straight, 1-8 every round) as published by the commissioner. kit: the team's colors, as its
// logo (scripts/assets/team-logos) has them, for pictures that dress a player in the team without its logo. A team is
// its place in this order, never its name: Sports.ru may keep an old one (team 8 is still «School Shooters Team» there).
export const LEAGUE_TEAMS=[
 {name:'The Balkan Murderers',symbol:'🐎',gm:'Franky Murder',kit:'black, red and gold'},
 {name:'Saint P Imperial',symbol:'👑',gm:'Коуч I',kit:'black, gold and cream'},
 {name:'Black Jacks',symbol:'♠️',gm:'Jack Pott',kit:'black, red and cream'},
 {name:'Команда им. Алачаняна А.М.',symbol:'🇦🇲',gm:'Роберт Хачатурян',kit:'black, orange and white'},
 {name:'Volga Pirates',symbol:'🏴‍☠️',gm:'Капитан Торрес Нью-Вин',kit:'black, red and white'},
 {name:'Texas 76 Citrus',symbol:'🍋',gm:'Лемариус',kit:'navy blue, lemon yellow and cream'},
 {name:'Karagali Brothers',symbol:'🏜️',gm:'Фы Жил',kit:'dark teal, burnt orange and cream'},
 {name:'School Sugars Team',symbol:'🍬',gm:'Strap Onn',kit:'navy blue, red and white'}
];
export function teamName(team){const t=LEAGUE_TEAMS[team];return t?`${t.symbol} ${t.name}`:`GM ${team+1}`;}
export function teamLabel(team){const t=LEAGUE_TEAMS[team];return t?`${team+1}. ${t.symbol} ${t.name}${t.gm?' · GM '+t.gm:''}`:`GM ${team+1}`;}
