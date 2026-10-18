import {analyzeRecommendations} from './analysis.js';
let state,advice,risky;
self.onmessage=({data})=>{
 try{
  if(data.state){state=data.state;advice=null;risky=null;}
  if(!state)throw Error('No draft state');
  if(!advice){
   advice=analyzeRecommendations(state);
   self.postMessage({requestId:data.requestId,advice,risky:[],focused:[],pending:true});
  }
  if(!risky)risky=analyzeRecommendations(state,null,true).slice(0,3);
  self.postMessage({requestId:data.requestId,advice,risky,focused:(data.focus||[]).map(p=>analyzeRecommendations(state,p)[0])});
 }catch(error){self.postMessage({requestId:data.requestId,error:error.message});}
};
