import {analyzeRecommendations} from './analysis.js';
self.onmessage=({data})=>{
 try{self.postMessage({advice:analyzeRecommendations(data.state),risky:analyzeRecommendations(data.state,null,true).slice(0,3),focused:(data.focus||[]).map(p=>analyzeRecommendations(data.state,p)[0])});}
 catch(error){self.postMessage({error:error.message});}
};
