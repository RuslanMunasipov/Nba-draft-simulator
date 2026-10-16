import {batchSimulations} from './simulation.js';
self.onmessage=({data})=>{
 try{self.postMessage({result:batchSimulations(data.state,{runs:100,seed:data.seed})});}
 catch(error){self.postMessage({error:error.message});}
};
