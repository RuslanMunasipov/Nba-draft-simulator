import {readStored,writeStored} from './storage.js';
const select=document.getElementById('theme');
function apply(value){document.documentElement.dataset.theme=value;select.value=value;}
apply(readStored('fbl-theme')==='light'?'light':'dark');
select.onchange=()=>{apply(select.value);writeStored('fbl-theme',select.value);};
