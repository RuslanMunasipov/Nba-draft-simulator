// Confidence of a transfer: the chance that it really gains over a horizon. The model's own z (expected gain over its
// spread) is mapped to the share of such swaps that gained in the backtest of 2024/25 and 2025/26
// (data/confidence-calibration.json, scripts/confidence_calibration.mjs), per horizon and phase of the season.
export const HORIZONS=['week','month','season'],PHASES=['early','mid','late'];
export function normalCdf(z){const t=1/(1+.2316419*Math.abs(z)),d=.3989423*Math.exp(-z*z/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p;}
// Phase of the season of a date (Moscow or US, YYYY-MM-DD): October-November, December-January, February on.
export const phaseOf=day=>{const m=Number(String(day||'').slice(5,7));return m===12||m===1?'mid':m>=2&&m<=9?'late':'early';};
// A step map's value at z: the first block whose top is at or above z (the last block: everything above).
export function interpolate(knots,z){return (knots.find(k=>k.upTo===null||z<=k.upTo)||knots.at(-1)).p;}
// The calibrated chance for z over horizon `h` on `day`: the backtest's isotonic map (knots) or probit (a, b); without a
// map for them, Φ(z) as before. Above the largest z the backtest saw (zMax) there is no evidence: the map's top step or
// Φ(z), the larger (a sale of a player who scores nothing for the team is certain).
export function calibrated(maps,z,h,day){
 const m=maps?.[h]?.[phaseOf(day)];
 if(!Number.isFinite(z))return z>0?1:0;
 if(m?.knots){const p=interpolate(m.knots,z);return Number.isFinite(m.zMax)&&z>m.zMax?Math.max(p,normalCdf(z)):p;}
 return m?normalCdf(m.a+m.b*Math.max(-6,Math.min(6,z))):normalCdf(z);
}
