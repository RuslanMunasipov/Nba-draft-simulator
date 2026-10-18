import {planAdvice} from './plan.js';
self.onmessage=({data})=>{
 try{self.postMessage({requestId:data.requestId,advice:planAdvice(data.state,{runs:data.runs,adjust:data.adjust||{}})});}
 catch(error){self.postMessage({requestId:data.requestId,error:error.message});}
};
