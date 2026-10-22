// FBL 2026-27 draft order (straight, 1-8 every round) as published by the commissioner.
export const LEAGUE_TEAMS=[
 {name:'The Balkan Murderers',symbol:'🐎',gm:'Franky Murder'},
 {name:'Saint P Imperial',symbol:'👑',gm:'Коуч I'},
 {name:'Black Jacks',symbol:'♠️',gm:'Jack Pott'},
 {name:'Команда им. Алачаняна А.М.',symbol:'🇦🇲',gm:'Роберт Хачатурян'},
 {name:'Volga Pirates',symbol:'🏴‍☠️',gm:'Капитан Торрес Нью-Вин'},
 {name:'Texas 76 Citrus',symbol:'🍋',gm:''},
 {name:'Karagali Brothers',symbol:'🏜️',gm:'Фы Жил'},
 {name:'School Shooters Team',symbol:'⚰️',gm:''}
];
export function teamName(team){const t=LEAGUE_TEAMS[team];return t?`${t.symbol} ${t.name}`:`GM ${team+1}`;}
export function teamLabel(team){const t=LEAGUE_TEAMS[team];return t?`${team+1}. ${t.symbol} ${t.name}${t.gm?' · GM '+t.gm:''}`:`GM ${team+1}`;}
