// ESPN's English on the site, in Russian. Short words of the injury report (the type of an injury) by a dictionary;
// news and comments by the translations Claude writes (scripts/translate-espn.mjs, translations.json on the branch
// data/translations), looked up here: a news item by ESPN's id, a comment by the key of its text. Without a
// translation the original is shown.

// What the player card shows of a news item: the headline and the text without HTML.
export function newsText(n){
 return {headline:String(n?.headline||'').trim(),story:String(n?.story||n?.description||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()};
}
// The key of a text: a 53-bit hash (cyrb53) of its words, spaces collapsed.
export function textKey(text){
 const s=String(text||'').replace(/\s+/g,' ').trim();
 let h1=0xdeadbeef,h2=0x41c6ce57;
 for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
 h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
 h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
 return (4294967296*(2097151&h2)+(h1>>>0)).toString(36);
}
// A news item in Russian when translated: {headline, story, translated}.
export function newsRu(tr,n){
 const t=n?.id!=null?tr?.news?.[String(n.id)]:null;
 return t?{headline:t.headline,story:t.story,translated:true}:{...newsText(n),translated:false};
}
// A comment in Russian when translated, else the original.
export function textRu(tr,text){const t=text?tr?.texts?.[textKey(text)]:null;return t?{text:t.text,translated:true}:{text:text||'',translated:false};}

// The kind of an injury in ESPN's report ("Sprain", "Surgery").
export const DETAIL={sprain:'растяжение',strain:'надрыв мышцы',surgery:'операция',soreness:'боль',bruise:'ушиб',contusion:'ушиб',fracture:'перелом',
 ruptured:'разрыв',rupture:'разрыв',tear:'разрыв',torn:'разрыв',inflammation:'воспаление',dislocated:'вывих',dislocation:'вывих',laceration:'рассечение',
 tendinitis:'тендинит',tendinopathy:'тендинопатия',tightness:'забитость',spasms:'спазмы',spasm:'спазм',swelling:'отёк',infection:'инфекция',
 'not specified':'не уточнено',stress:'стрессовая реакция',impingement:'импинджмент',subluxation:'подвывих',hyperextension:'переразгибание',
 'injury recovery':'восстановление',recovery:'восстановление',rest:'отдых',illness:'болезнь',concussion:'сотрясение'};
export const injuryDetail=d=>d?DETAIL[String(d).trim().toLowerCase()]||d:'';
