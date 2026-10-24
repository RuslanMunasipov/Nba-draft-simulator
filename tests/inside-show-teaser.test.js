// The show's launch in the league chat (data/inside-show-teaser.json, owner 24.10.2026): the hosts' own bots, Russian
// only, the studio's photo there, its caption within Telegram's limit, the schedule of the Monday.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {HOSTS,latinIn} from '../awards-bot/inside-show.js';
const t=JSON.parse(readFileSync(new URL('../data/inside-show-teaser.json',import.meta.url),'utf8'));
test('Inside FBL teaser: every host speaks from his own bot, in Russian, with the schedule',()=>{
 assert.ok(existsSync(new URL('../'+t.photo,import.meta.url)));
 assert.deepEqual([...new Set(t.messages.map(m=>m.by))].sort(),Object.keys(HOSTS).sort());
 assert.ok(t.messages[0].text.replace(/<[^>]+>/g,'').length<=1024,'a photo caption');
 for(const m of t.messages){assert.deepEqual(latinIn(m.text.replace(/<[^>]+>/g,''),{}),[],m.by);assert.ok(m.text.length<=4096);}
 const zak=t.messages.find(m=>m.by==='zak').text;assert.doesNotMatch(zak,/бот|код|карточ|баз[аеуы]|ФО|наград/iu,'Zak speaks law only');
 const last=t.messages.at(-1).text;assert.match(last,/12:00/);assert.match(last,/18:00/);
});
