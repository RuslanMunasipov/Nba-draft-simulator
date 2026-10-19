// Telegram HTML formatting for the FBL notifier: the decision on top in bold, the reasoning in a collapsed quote.
export const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const signed=n=>(n>=0?'+':'−')+Math.abs(Math.round(n));
export const gains=(season,month)=>`${signed(season)} ФО за сезон · ${signed(month)} за 4 нед.`;
// Numbered one-for-one swaps and the bank after them.
export const moveLines=(pairs,bankAfter)=>[...pairs.map((x,i)=>`${i+1}. ${esc(x.out)} → <b>${esc(x.in)}</b>`),`Банк после: ${bankAfter}`];
// Details stay one tap away: Telegram shows the first lines of an expandable quote and hides the rest.
export const details=lines=>lines.length?`<blockquote expandable>${lines.join('\n')}</blockquote>`:'';
export const message=(...blocks)=>blocks.flat().filter(x=>x!==null&&x!==undefined).join('\n');
export const plainText=html=>html.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
