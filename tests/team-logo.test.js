import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {teamLogoUrl} from '../src/team-logo.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
test('every league team with a logo has its small logo on the site (School Sugars Team waits for its new one)',()=>{
 assert.equal(LEAGUE_TEAMS.length,8);assert.equal(teamLogoUrl(7),null);
 for(let t=0;t<7;t++){const url=teamLogoUrl(t);assert.match(url,new RegExp(`/src/assets/team-logos/${t+1}\\.webp$`));
  const size=fs.statSync(fileURLToPath(url)).size;assert.ok(size>500&&size<12000,`team ${t+1}: ${size} bytes`);}
 assert.equal(teamLogoUrl(8),null);
});
