import {planAdvice} from './plan.js';
self.onmessage=({data})=>{
 try{self.postMessage({requestId:data.requestId,advice:planAdvice(data.state,{runs:data.runs,adjust:data.adjust||{},white:data.white||[]})});}
 catch(error){self.postMessage({requestId:data.requestId,error:error.message});}
};
