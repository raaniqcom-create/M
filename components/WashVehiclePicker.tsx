'use client';
import {useState} from 'react';
import {VEHICLE_LABELS, VEHICLE_TYPES, rememberSize, type VehicleCounts, type VehicleType} from '@/lib/wash';
import {WashUIIcon as Icon} from './WashUIIcon';
/** الصورُ نفسُها التي يعرضها VehicleArtwork — من public/vehicles لا نسخةً ثانية. */
const VEHICLE_IMAGES = { small: '/vehicles/small.png', mid: '/vehicles/mid.png', large: '/vehicles/large.png' } as const;
export function WashVehiclePicker({value,onChange}:{value:VehicleCounts;onChange:(v:VehicleCounts)=>void}) {
 const [broken,setBroken]=useState<string[]>([]);
 const selected=VEHICLE_TYPES.filter(v=>(value[v]??0)>0);
 function choose(v:VehicleType){const next={[v]:1};rememberSize(next);onChange(next);}
 return <section className="wash-vehicles" aria-labelledby="vehicle-title">
  <div className="wash-section-heading"><div className="wash-heading-group"><span className="wash-step">01</span><div><h2 id="vehicle-title">البداية من سيارتك</h2><p>اختر حجمها، وخلّ الباقي علينا.</p></div></div><a href="/wash/size/">أكثر من سيارة<Icon name="arrow" size={17}/></a></div>
  <div className="wash-vehicle-grid">{(['small','mid','large'] as const).map((v,i)=><button key={v} className="wash-vehicle" type="button" aria-pressed={selected.includes(v)} onClick={()=>choose(v)}>
   <span className="wash-vehicle-radio">{selected.includes(v)&&<Icon name="check" size={12}/>}</span>
   <div className="wash-vehicle-photo">{broken.includes(v)?<Icon name="car" size={70}/>:<img src={VEHICLE_IMAGES[v]} alt="" width="240" height="140" onError={()=>setBroken(x=>[...x,v])}/>}</div>
   <div className="wash-vehicle-caption"><strong>{VEHICLE_LABELS[v]}</strong><small>{['صالون · هاتشباك','كروس أوفر · دفع رباعي','فان · بيك أب'][i]}</small></div>
  </button>)}</div>
  <div className="wash-size-foot"><span role="status"><Icon name="check" size={14}/>{selected.length?`الاختيار محفوظ: ${selected.map(v=>VEHICLE_LABELS[v]+((value[v]??0)>1?` × ${value[v]}`:'')).join('، ')}`:'اختيارك يُحفظ للحجز القادم'}</span><a href="/wash/size/">سيارتي بحجم آخر</a></div>
 </section>;
}
