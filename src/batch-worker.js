import {scenarioAnalysis} from './simulation.js';
self.onmessage=({data})=>{
 const started=performance.now();
 try{self.postMessage({result:{...scenarioAnalysis(data.state,{seed:data.seed}),elapsedMs:performance.now()-started}});}
 catch(error){self.postMessage({error:error.message});}
};
