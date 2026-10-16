export async function fetchDatabase(url,{timeoutMs=10000,attempts=2}={}){
 let error;
 for(let attempt=0;attempt<attempts;attempt++){
  const controller=new AbortController();let timer;
  try{
   return await Promise.race([
    (async()=>{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();})(),
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Превышено время загрузки'));},timeoutMs);})
   ]);
  }catch(e){error=e;}finally{clearTimeout(timer);}
 }
 throw error;
}
