import {rookieTimingStudy} from './rookie-timing.js';
self.onmessage=({data})=>{try{self.postMessage({result:rookieTimingStudy(data.state,{runs:12,seed:2026})});}catch(error){self.postMessage({error:error.message});}};
