// Geometry uses SVG coordinates (+y down). Right normal = (-dy, dx).
export const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const mix = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const point = (x,y) => ({x,y});
const arity = {M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,Z:0};
export function parsePath(d) {
  const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)||[];
  if(d.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?|[\s,]/g,'')) throw Error('SVGパスに不正な文字があります。');
  let i=0,cmd='',cur=point(0,0),start=cur,prev='',control=null,sub=null;const paths=[];
  while(i<tokens.length){
    if(/^[a-z]$/i.test(tokens[i]))cmd=tokens[i++];
    const op=cmd.toUpperCase(),relative=cmd!==op;
    if(!(op in arity))throw Error('対応パスは M/L/H/V/C/S/Q/T/Z です。円弧Aはベジェに変換してください。');
    if(op==='Z'){
      if(!sub)throw Error('閉じる対象がありません。');
      if(distance(cur,start)>1e-10)sub.segments.push([cur,start]);
      sub.closed=true;cur=start;prev='Z';control=null;cmd='';continue;
    }
    const n=arity[op],a=tokens.slice(i,i+n).map(Number);
    if(a.length!==n||a.some(v=>!Number.isFinite(v)))throw Error('SVGパスの数値が不正です。');
    i+=n;
    const xy=(j)=>point(a[j]+(relative?cur.x:0),a[j+1]+(relative?cur.y:0));
    const reflect=()=>control?point(2*cur.x-control.x,2*cur.y-control.y):cur;
    let end,seg;
    if(op==='M'){
      end=xy(0);sub={segments:[],start:end,closed:false};paths.push(sub);start=end;cmd=relative?'l':'L';
    }else{
      if(!sub)throw Error('パスはMから開始してください。');
      if(op==='L')end=xy(0),seg=[cur,end];
      if(op==='H')end=point(a[0]+(relative?cur.x:0),cur.y),seg=[cur,end];
      if(op==='V')end=point(cur.x,a[0]+(relative?cur.y:0)),seg=[cur,end];
      if(op==='C')end=xy(4),seg=[cur,xy(0),xy(2),end];
      if(op==='S')end=xy(2),seg=[cur,/^[CS]$/.test(prev)?reflect():cur,xy(0),end];
      if(op==='Q')end=xy(2),seg=[cur,xy(0),end];
      if(op==='T')end=xy(0),seg=[cur,/^[QT]$/.test(prev)?reflect():cur,end];
      sub.segments.push(seg);
    }
    control=/^[CSQT]$/.test(op)?seg[seg.length-2]:null;cur=end;prev=op;
  }
  if(paths.some(p=>!p.segments.length))throw Error('長さのないサブパスが含まれています。');
  return paths;
}
export function evaluate(controls,t){
  let p=controls;while(p.length>1)p=p.slice(0,-1).map((v,i)=>mix(v,p[i+1],t));return p[0];
}
export function tangent(controls,t){
  let v=controls.slice(0,-1).map((p,i)=>point(controls[i+1].x-p.x,controls[i+1].y-p.y));
  let d=evaluate(v,t),length=Math.hypot(d.x,d.y);
  // Endpoint zero derivatives: first nonzero control-polygon direction is the exact limit.
  if(length<1e-12){
    if(t===0){d=controls.slice(1).map(p=>point(p.x-controls[0].x,p.y-controls[0].y)).find(p=>Math.hypot(p.x,p.y)>1e-12);}
    else if(t===1){const end=controls.at(-1);d=controls.slice(0,-1).reverse().map(p=>point(end.x-p.x,end.y-p.y)).find(p=>Math.hypot(p.x,p.y)>1e-12);}
    else throw Error('曲線内の接線がゼロです。区間を分けて指定してください。');
    if(!d)throw Error('長さゼロの線は配置できません。');length=Math.hypot(d.x,d.y);
  }
  return point(d.x/length,d.y/length);
}
// Table subdivision tests quarter points as well as midpoint (avoids missing S bends).
function sample(fn,t0,t1,maxStep,tolerance){
  const first={...fn(t0),t:t0},out=[first];let calls=0;
  function visit(a,b,depth){
    if(++calls>100000)throw Error('形状が複雑すぎます。対象区間を短くしてください。');
    const ts=[.25,.5,.75],middle=ts.map(f=>({...fn(a.t+(b.t-a.t)*f),t:a.t+(b.t-a.t)*f}));
    const all=[a,...middle,b],arc=all.slice(1).reduce((s,p,i)=>s+distance(p,all[i]),0);
    const err=Math.max(...middle.map((p,i)=>distance(p,mix(a,b,ts[i]))));
    if(arc>maxStep||err>tolerance){
      if(depth>=24)throw Error('曲線を十分な精度で計算できません。');
      visit(a,middle[1],depth+1);visit(middle[1],b,depth+1);
    }else out.push(...middle,b);
  }
  visit(first,{...fn(t1),t:t1},0);
  let len=0;out[0].s=0;for(let i=1;i<out.length;i++)out[i].s=len+=distance(out[i-1],out[i]);
  return {points:out,len,fn};
}
function at(table,s){
  const p=table.points;if(s<=0)return p[0];if(s>=table.len)return p.at(-1);
  let l=1,r=p.length-1;while(l<r){const m=(l+r)>>1;if(p[m].s<s)l=m+1;else r=m;}
  const a=p[l-1],b=p[l],t=a.t+(b.t-a.t)*(s-a.s)/(b.s-a.s||1);
  return {...table.fn(t),t};
}
export function prepare(path,units,{reference=false}={}){
  const tables=path.segments.map(c=>sample(t=>evaluate(c,t),0,1,.5*units,.0002*units));
  const total=tables.reduce((s,t)=>s+t.len,0);
  if(total<1e-8)throw Error('長さゼロの線です。');
  return {path,tables,total,units,reference};
}
export function offsetLine(prepared,start,end,offset,side){
  if(![start,end,offset,side].every(Number.isFinite)||start<0||end<0||start>1||end>1||start===end)throw Error('始点と終点を異なる0〜100%で指定してください。');
  const reverse=start>end,lo=Math.min(start,end)*prepared.total,hi=Math.max(start,end)*prepared.total;
  const chunks=[];let passed=0;
  prepared.tables.forEach((table,index)=>{
    const from=Math.max(0,lo-passed),to=Math.min(table.len,hi-passed);passed+=table.len;
    if(to<=from||table.len<1e-10)return;
    const base=passed-table.len,c=prepared.path.segments[index],t0=at(table,from).t,t1=at(table,to).t;
    const fn=t=>{const p=evaluate(c,t),v=tangent(c,t),sign=side*(reverse?-1:1),q=point(p.x-v.y*offset*sign,p.y+v.x*offset*sign);if(prepared.reference){let l=1,r=table.points.length-1;while(l<r){const m=(l+r)>>1;if(table.points[m].t<t)l=m+1;else r=m;}const a=table.points[l-1],b=table.points[l];q.reference=(base+a.s+(b.s-a.s)*(t-a.t)/(b.t-a.t||1))/prepared.total;}return q;};
    const result=sample(fn,t0,t1,.25*prepared.units,.0001*prepared.units);
    result.center=evaluate(c,t0);chunks.push(result);
  });
  const joined=[];
  for(const chunk of chunks){
    if(joined.length){
      const a=joined.at(-1).points.at(-1),b=chunk.points[0],center=chunk.center;
      if(distance(a,b)>.000001*prepared.units){
        const r=distance(a,center),angle0=Math.atan2(a.y-center.y,a.x-center.x);
        let delta=Math.atan2(b.y-center.y,b.x-center.x)-angle0;
        delta=Math.atan2(Math.sin(delta),Math.cos(delta));
        if(Math.abs(delta)>Math.PI/12)throw Error('15度を超える角があります。滑らかな区間を選んでください。');
        // Tiny tangent discontinuities in exported CAD splines: join normals by a circular fan.
        joined.push(sample(t=>{const p=point(center.x+r*Math.cos(angle0+delta*t),center.y+r*Math.sin(angle0+delta*t));if(prepared.reference)p.reference=chunk.points[0].reference;return p;},0,1,.25*prepared.units,.0001*prepared.units));
      }
    }
    joined.push(chunk);
  }
  chunks.splice(0,chunks.length,...joined);
  if(reverse)chunks.reverse();
  const points=[];let len=0;
  for(const chunk of chunks){
    const arr=reverse?[...chunk.points].reverse():chunk.points;
    for(const p of arr){if(points.length)len+=distance(points.at(-1),p);points.push({...p,s:len,chunk});}
  }
  if(points.length<2||len<1e-8)throw Error('有効な縫い区間がありません。');
  return {points,len,units:prepared.units};
}
export function along(line,s){
  const p=line.points;if(s<=0)return p[0];if(s>=line.len)return p.at(-1);
  let l=1,r=p.length-1;while(l<r){const m=(l+r)>>1;if(p[m].s<s)l=m+1;else r=m;}
  const a=p[l-1],b=p[l],f=(s-a.s)/(b.s-a.s||1);
  // Evaluate on the offset curve rather than interpolating the normal or radius.
  return a.chunk===b.chunk?a.chunk.fn(a.t+(b.t-a.t)*f):mix(a,b,f);
}
export function place(a,b,{mode='fixed',count=13,minPitch=10}={}){
  if(!Number.isFinite(minPitch)||minPitch<10)throw Error('最小ピッチは10mm以上にしてください。');
  if(mode==='auto')count=Math.floor(Math.min(a.len/a.units,b.len/b.units)/(minPitch+.0001))+1;
  if(!Number.isInteger(count)||count<2||count>1000)throw Error('固定した両端と最小ピッチで配置できません。穴数は2〜1000個です。');
  const rows=[a,b].map(line=>{
    const holes=Array.from({length:count},(_,i)=>along(line,line.len*i/(count-1)));
    const chords=holes.slice(1).map((p,i)=>distance(p,holes[i])/line.units);
    return {holes,pitch:line.len/line.units/(count-1),minChord:Math.min(...chords),maxChord:Math.max(...chords)};
  });
  const valid=rows.every(r=>r.pitch>=minPitch);
  return {count,rows,valid,warning:!valid?'弧長ピッチが下限未満です。区間を広げるか穴数を減らしてください。':rows.some(r=>r.minChord<minPitch)?'弧長条件は満たしますが、穴中心の直線距離が下限未満です。':''};
}

// Find intersections of two sampled offset curves in root SVG coordinates.
// The small adaptive-polyline error is inherited from offsetLine's tolerance.
export function cornerIntersections(line,neighbor){
  const hits=[],b=neighbor.points;
  const segments=b.slice(1).map((q,i)=>{const p=b[i];return {p,q,minX:Math.min(p.x,q.x),maxX:Math.max(p.x,q.x),minY:Math.min(p.y,q.y),maxY:Math.max(p.y,q.y)};});
  for(let i=1;i<line.points.length;i++){
    const p=line.points[i-1],q=line.points[i],dx=q.x-p.x,dy=q.y-p.y;
    const minX=Math.min(p.x,q.x),maxX=Math.max(p.x,q.x),minY=Math.min(p.y,q.y),maxY=Math.max(p.y,q.y);
    for(const seg of segments){
      if(seg.maxX<minX-1e-8||seg.minX>maxX+1e-8||seg.maxY<minY-1e-8||seg.minY>maxY+1e-8)continue;
      const ex=seg.q.x-seg.p.x,ey=seg.q.y-seg.p.y,den=dx*ey-dy*ex;
      if(Math.abs(den)<1e-14)continue;
      const ax=seg.p.x-p.x,ay=seg.p.y-p.y,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;
      if(t< -1e-8||t>1+1e-8||u< -1e-8||u>1+1e-8)continue;
      const s=p.s+Math.max(0,Math.min(1,t))*(q.s-p.s);
      if(!hits.some(h=>Math.abs(h.s-s)<1e-7))hits.push({s,x:p.x+t*dx,y:p.y+t*dy,...(Number.isFinite(along(line,s).reference)?{reference:along(line,s).reference}:{}),...(p.chunk===q.chunk?{chunk:p.chunk,t:p.t+Math.max(0,Math.min(1,t))*(q.t-p.t)}:{})});
    }
  }
  return hits;
}
export function alignCorners(line,{start=null,end=null}={}){
  function pick(other,endpoint){
    const hits=cornerIntersections(line,other);
    if(!hits.length)throw Error('角の交点がありません。隣の辺・左右方向を確認し、始終点の区間を広げてください。');
    return hits.reduce((best,p)=>Math.abs(p.s-endpoint)<Math.abs(best.s-endpoint)?p:best);
  }
  const a=start?pick(start,0):{...line.points[0],s:0};
  const b=end?pick(end,line.len):{...line.points.at(-1),s:line.len};
  if(b.s-a.s<1e-7)throw Error('角を揃えると始点と終点が逆転または一致します。隣の辺を確認してください。');
  const points=[a,...line.points.filter(p=>p.s>a.s+1e-8&&p.s<b.s-1e-8),b].map(p=>({...p,s:p.s-a.s}));
  return {...line,points,len:b.s-a.s};
}

// Join geometrically coincident endpoints without changing source paths.
// Only unambiguous closed contours are accepted; nested contours use even/odd fill.
export function interiorSides(paths,scale=1){
 const fail=()=>{throw Error('内側を判定できません。線の端点が閉じた輪郭につながっているか確認するか、手動の右／左を選んでください。');};
 const nodes=[],edges=[],epsilon=scale*1e-6;
 const nodeFor=p=>{let n=nodes.find(n=>distance(n.p,p)<=epsilon);if(!n){n={p,edges:[]};nodes.push(n);}return n;};
 paths.forEach((path,index)=>{
  const a=nodeFor(path.start),b=nodeFor(path.segments.at(-1).at(-1));
  const points=prepare(path,scale).tables.flatMap(t=>t.points);
  const edge={a,b,points,index};edges.push(edge);a.edges.push(edge);b.edges.push(edge);
 });
 if(nodes.some(n=>n.edges.length!==2))fail();
 const visited=new Set(),loops=[];
 for(const first of edges){
  if(visited.has(first))continue;
  let edge=first,node=first.a;const polygon=[],members=[];
  do{
   if(visited.has(edge))fail();visited.add(edge);
   const forward=edge.a===node;
   polygon.push(...(forward?edge.points:[...edge.points].reverse()));
   members.push({index:edge.index,forward});node=forward?edge.b:edge.a;
   edge=node.edges.find(e=>!visited.has(e));
  }while(edge);
  if(node!==first.a)fail();
  const area=polygon.slice(1).reduce((s,p,i)=>s+polygon[i].x*p.y-p.x*polygon[i].y,0);
  if(Math.abs(area)<epsilon*epsilon)fail();
  loops.push({polygon,members,area});
 }
 const contains=(poly,p)=>{let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }return inside;};
 const sides=[];
 for(const loop of loops){
  const depth=loops.filter(other=>other!==loop&&contains(other.polygon,loop.polygon[0])).length;
  const side=Math.sign(loop.area)*(depth%2?-1:1);
  for(const m of loop.members)sides[m.index]=side*(m.forward?1:-1);
 }
 return sides;
}

// Follow the offset curve, continuing its end Bezier polynomial when necessary.
// Walls are sampled original cut lines; a spatial index tests the 3mm clearance band.
export function fitWalls(prepared,start,end,offset,side,walls,{startAuto=false,endAuto=false,clearance=3,maxLength=1000,extend=true,baseLine=null}={}){
 const units=prepared.units,r=(clearance+.0003)*units,cell=Math.max(r,units),grid=new Map();
 for(const wall of walls)for(const table of wall.prepared.tables)for(let i=1;i<table.points.length;i++){
  const a=table.points[i-1],b=table.points[i];
  for(let x=Math.floor((Math.min(a.x,b.x)-r)/cell);x<=Math.floor((Math.max(a.x,b.x)+r)/cell);x++)
   for(let y=Math.floor((Math.min(a.y,b.y)-r)/cell);y<=Math.floor((Math.max(a.y,b.y)+r)/cell);y++){
    const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push({a,b,index:wall.index});
   }
 }
 function near(p){
  let best={d:Infinity,index:null};
  for(const {a,b,index} of grid.get(Math.floor(p.x/cell)+','+Math.floor(p.y/cell))||[]){
   const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),d=distance(p,mix(a,b,t));
   if(d<best.d)best={d,index};
  }return best;
 }
 const reverse=start>end,base=baseLine||offsetLine(prepared,start,end,offset,side);
 const full=baseLine||offsetLine(prepared,startAuto?(reverse?1:0):start,endAuto?(reverse?0:1):end,offset,side);
 const center=along(base,base.len/2);let anchor=0;
 for(let i=1;i<full.points.length;i++)if(distance(full.points[i],center)<distance(full.points[anchor],center))anchor=i;
 if(near(full.points[anchor]).d<=r)throw Error(`区間の中央が壁から${clearance}mm以内です。始点・終点を見直してください。`);
 const autoWalls={};
 function follow(isStart){
  const points=isStart?full.points.slice(0,anchor+1).reverse():full.points.slice(anchor);
  const kept=[points[0]];
  function advance(p){
   if(near(p).d<=r){
    const a=kept.at(-1);let lo=0,hi=1;
    for(let k=0;k<35;k++){const f=(lo+hi)/2,q=a.chunk===p.chunk?a.chunk.fn(a.t+(p.t-a.t)*f):mix(a,p,f);if(near(q).d<=r)hi=f;else lo=f;}
    const f=(lo+hi)/2,q=a.chunk===p.chunk?{...a.chunk.fn(a.t+(p.t-a.t)*f),t:a.t+(p.t-a.t)*f,chunk:a.chunk}:mix(a,p,f);
    autoWalls[isStart?'start':'end']=near(q).index;kept.push(q);return true;
   }kept.push(p);return false;
  }
  let travelled=0;
  for(const p of points.slice(1)){travelled+=distance(kept.at(-1),p);if(advance(p))return kept;}
  if(!extend)return null;
  const sourceStart=isStart?!reverse:reverse,c=sourceStart?prepared.path.segments[0]:prepared.path.segments.at(-1),boundary=sourceStart?0:1,step=sourceStart?-.125:.125;
  const v0=tangent(c,boundary),sign=side*(reverse?-1:1);
  const fn=t=>{const v=tangent(c,t);if(v.x*v0.x+v.y*v0.y<=0)throw Error('カーブの延長が折り返します。自動調整を解除して端点を指定してください。');const p=evaluate(c,t);return point(p.x-v.y*offset*sign,p.y+v.x*offset*sign);};
  for(let k=0;k<32;k++){
   const chunk=sample(fn,boundary+step*k,boundary+step*(k+1),.25*units,.0001*units);
   for(const p of chunk.points.slice(1)){
    travelled+=distance(kept.at(-1),p);if(travelled>maxLength*units)return null;
    if(advance({...p,chunk}))return kept;
   }
  }return null;
 }
 const unchangedEnds=[];
 function originalHalf(isStart){
  const endpoint=isStart?base.points[0]:base.points.at(-1);let best={d:Infinity,s:0};
  for(let i=1;i<full.points.length;i++){
   const a=full.points[i-1],b=full.points[i],dx=b.x-a.x,dy=b.y-a.y,f=Math.max(0,Math.min(1,((endpoint.x-a.x)*dx+(endpoint.y-a.y)*dy)/(dx*dx+dy*dy||1))),d=distance(endpoint,mix(a,b,f));
   if(d<best.d)best={d,s:a.s+(b.s-a.s)*f};
  }
  return isStart?[full.points[anchor],...full.points.filter(p=>p.s<full.points[anchor].s&&p.s>best.s).reverse(),endpoint]:[full.points[anchor],...full.points.filter(p=>p.s>full.points[anchor].s&&p.s<best.s),endpoint];
 }
 function endpointHalf(isStart,enabled){
  if(!enabled)return isStart?full.points.slice(0,anchor+1).reverse():full.points.slice(anchor);
  const found=follow(isStart);if(found)return found;
  unchangedEnds.push(isStart?'start':'end');return originalHalf(isStart);
 }
 const a=endpointHalf(true,startAuto),b=endpointHalf(false,endAuto);
 if((!startAuto||unchangedEnds.includes('start'))&&(!endAuto||unchangedEnds.includes('end')))return {...base,autoWalls,unchangedEnds};
 const points=[...a.reverse(),...b.slice(1)];let len=0;
 for(let i=0;i<points.length;i++){if(i)len+=distance(points[i-1],points[i]);points[i]={...points[i],s:len};}
 if(len<1e-7)throw Error(`壁から${clearance}mmを確保できる区間がありません。`);
 return {points,len,units,autoWalls,unchangedEnds};
}

// Detect only walls touching this cut endpoint; a distant wall must not move an open tip.
export function touchingWalls(prepared,fraction,walls){
 let remaining=fraction*prepared.total,p=prepared.path.start;
 for(const table of prepared.tables){if(remaining<=table.len){p=at(table,remaining);break;}remaining-=table.len;p=table.points.at(-1);}
 const tolerance=.001*prepared.units;
 return walls.filter(w=>w.prepared.tables.some(table=>table.points.slice(1).some((b,i)=>{
  const a=table.points[i],dx=b.x-a.x,dy=b.y-a.y,f=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return distance(p,mix(a,b,f))<=tolerance;
 })));
}
export function trimLine(line,startDistance=0,endDistance=0){
 if(startDistance<0||endDistance<0||startDistance+endDistance>=line.len-1e-7)throw Error('控え量が大きすぎます。縫い区間を広げるか控え量を減らしてください。');
 const end=line.len-endDistance;
 const points=[{...along(line,startDistance),s:startDistance},...line.points.filter(p=>p.s>startDistance&&p.s<end),{...along(line,end),s:end}].map(p=>({...p,s:p.s-startDistance}));
 return {...line,points,len:end-startDistance};
}
// No shared hole at the join: leave at least one minimum pitch across the boundary on A.
export function placeJoined(a,b,c,{split=.5,mode='auto',count=13,minPitch=10}={}){
 if(!Number.isFinite(split)||split<=0||split>=1)throw Error('分割位置は0%より大きく100%より小さくしてください。');
 const boundary=a.len*split,gap=(minPitch+.0001)*a.units;
 const first=trimLine(a,0,a.len-boundary+gap/2),second=trimLine(a,boundary+gap/2,0);
 const pairs=[place(first,b,{mode,count,minPitch}),place(second,c,{mode,count,minPitch})];
 const holes=[...pairs[0].rows[0].holes,...pairs[1].rows[0].holes],chords=holes.slice(1).map((p,i)=>distance(p,holes[i])/a.units);
 const pitches=[pairs[0].rows[0].pitch,pairs[1].rows[0].pitch,gap/a.units];
 return {pairs,parts:[first,second],boundary:along(a,boundary),gap:distance(along(a,boundary-gap/2),along(a,boundary+gap/2))/a.units,
  rows:[{holes,pitch:Math.min(...pitches),maxPitch:Math.max(...pitches),minChord:Math.min(...chords),maxChord:Math.max(...chords)},pairs[0].rows[1],pairs[1].rows[1]],valid:pairs.every(p=>p.valid),warning:pairs.map(p=>p.warning).filter(Boolean).join(' ')};
}

export function distanceToWalls(p,walls){
 let nearest=Infinity;
 for(const wall of walls)for(const table of wall.prepared.tables)for(let i=1;i<table.points.length;i++){
  const a=table.points[i-1],b=table.points[i],dx=b.x-a.x,dy=b.y-a.y,f=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  nearest=Math.min(nearest,distance(p,mix(a,b,f)));
 }return nearest;
}

// Ordered, disconnected sewing sections. Gaps are not sewing intervals.
export function placeSequences(a,b,{mode='auto',count,minPitch=10}={}){
 if(!Number.isFinite(minPitch)||minPitch<10)throw Error('最小ピッチは10mm以上にしてください。');
 if(!a.length||!b.length)throw Error('AとBにそれぞれ区間を追加してください。');
 const capacities=lines=>lines.map(l=>Math.floor(l.len/l.units/(minPitch+.0001))+1);
 const ca=capacities(a),cb=capacities(b);
 if([...ca,...cb].some(n=>n<2))throw Error('短すぎる区間があります。各区間に2穴以上・最小ピッチを確保してください。');
 const cap=Math.min(ca.reduce((s,n)=>s+n,0),cb.reduce((s,n)=>s+n,0),1000),minimum=2*Math.max(a.length,b.length);
 if(cap<minimum)throw Error('区間数に対して縫える長さが足りません。短い区間を広げるか区間数を減らしてください。');
 if(mode==='auto')count=cap;
 if(!Number.isInteger(count)||count<minimum||count>cap)throw Error(`総穴数は片側${minimum}〜${cap}穴の範囲で指定してください。区間数や長さも見直せます。`);
 const distribute=(lines,caps)=>{const counts=lines.map(()=>2);for(let remaining=count-counts.length*2;remaining>0;remaining--){let best=-1,score=-Infinity;lines.forEach((l,i)=>{const next=l.len/l.units/counts[i];if(counts[i]<caps[i]&&next>score){best=i;score=next;}});if(best<0)throw Error('区間へ穴数を割り当てられません。');counts[best]++;}return counts.map((n,i)=>place(lines[i],lines[i],{mode:'fixed',count:n,minPitch}).rows[0]);};
 const ar=distribute(a,ca),br=distribute(b,cb),rows=[...ar,...br];
 return {count,rows,sideRows:{A:ar,B:br},valid:rows.every(r=>r.pitch>=minPitch),warning:rows.some(r=>r.minChord<minPitch)?'弧長条件は満たしますが、区間内の穴中心の直線距離が下限未満です。':''};
}

// Approximation: the same normalized cut-edge station maps to the same assembled seam station.
// Disconnected sections share one cumulative cut-length coordinate (gaps excluded).
// Each station belongs to one section on each side; never space across a gap.
export function placeRegisteredSequences(a,b,{mode='auto',count,minPitch=10}={}){
 if(!Number.isFinite(minPitch)||minPitch<10)throw Error('最小ピッチは10mm以上にしてください。');
 if(!a.length||!b.length)throw Error('AとBにそれぞれ区間を追加してください。');
 const profiles=lines=>{
  const lengths=lines.map(l=>l.cutLength),total=lengths.reduce((s,n)=>s+n,0);let base=0;
  if(lengths.some(n=>!Number.isFinite(n)||n<=0))throw Error('区間のカット線長を追跡できません。辺を選び直してください。');
  return lines.map((line,index)=>{
   const [start,end]=line.cutRange||[],weight=lengths[index]/total;
   const points=[];
   for(const p of line.points){const next={q:base+weight*(p.reference-start)/(end-start),s:p.s/line.units},previous=points.at(-1);
    if(previous&&Math.abs(next.q-previous.q)<1e-12&&Math.abs(next.s-previous.s)<1e-8)points[points.length-1]=next;else points.push(next);
   }base+=weight;
   if(points.length<2||points.some(p=>!Number.isFinite(p.q)||!Number.isFinite(p.s))||points.some((p,i)=>i&&(p.q<=points[i-1].q||p.s<=points[i-1].s)))throw Error('共通Cの基準位置を追跡できません。角合わせ・壁への延長を解除して元カット線内の区間を使ってください。');
   return {line,index,points,lo:Math.max(0,points[0].q),hi:Math.min(1,points.at(-1).q)};
  });
 };
 const interpolate=(points,value,key,out)=>{
  if(value<=points[0][key])return points[0][out];if(value>=points.at(-1)[key])return points.at(-1)[out];
  let l=1,r=points.length-1;while(l<r){const m=(l+r)>>1;if(points[m][key]<value)l=m+1;else r=m;}
  const x=points[l-1],y=points[l];return x[out]+(y[out]-x[out])*(value-x[key])/(y[key]-x[key]);
 };
 const pa=profiles(a),pb=profiles(b),stations=[],last=[new Map(),new Map()],pitch=minPitch+.0001;
 let i=0,j=0;
 while(i<pa.length&&j<pb.length){
  const pair=[pa[i],pb[j]],lo=Math.max(pair[0].lo,pair[1].lo),hi=Math.min(pair[0].hi,pair[1].hi);
  if(hi>=lo){let q=lo;
   for(;;){
    for(let side=0;side<2;side++){
     const p=pair[side],previous=last[side].get(p.index);
     if(previous!==undefined){const target=previous+pitch;if(target>p.points.at(-1).s+1e-9){q=Infinity;break;}q=Math.max(q,interpolate(p.points,target,'s','q'));}
    }
    if(q>hi+1e-12)break;q=Math.min(q,hi);
    const positions=pair.map(p=>interpolate(p.points,q,'q','s'));
    stations.push({q,indices:[i,j],positions});positions.forEach((s,side)=>last[side].set(pair[side].index,s));
    if(stations.length>100000)throw Error('共通Cの配置候補が多すぎます。区間を短くするか最小ピッチを広げてください。');
   }
  }
  if(pa[i].hi<=pb[j].hi)i++;else j++;
 }
 const counts=[a.map(()=>0),b.map(()=>0)];for(const s of stations)s.indices.forEach((index,side)=>counts[side][index]++);
 if(counts.some(side=>side.some(n=>n<2)))throw Error('共通Cの対応と最小ピッチでは各区間に2穴を確保できません。区間の長さ・順序・控えを見直してください。');
 if(mode==='auto')count=Math.min(1000,stations.length);
 {
  if(!Number.isInteger(count)||count<2*Math.max(a.length,b.length)||count>stations.length)throw Error(`総穴数は共通Cの対応を保つ${2*Math.max(a.length,b.length)}〜${stations.length}穴の範囲で指定してください。`);
  while(stations.length>count){
   let best=-1,score=Infinity;
   stations.forEach((s,k)=>{if(s.indices.some((index,side)=>counts[side][index]<=2))return;
    const before=stations[k-1],after=stations[k+1],cost=before&&after?after.q-before.q:Infinity;
    if(best<0||cost<score){best=k;score=cost;}});
   if(best<0)throw Error('この総穴数では全区間2穴と共通Cの対応を保てません。穴数を増やしてください。');
   const [removed]=stations.splice(best,1);removed.indices.forEach((index,side)=>counts[side][index]--);
  }
 }
 const sideRows={};for(const [side,lines,name] of [[0,a,'A'],[1,b,'B']])sideRows[name]=lines.map((line,index)=>{
  const selected=stations.filter(s=>s.indices[side]===index),holes=selected.map(s=>({...along(line,s.positions[side]*line.units),seamReference:s.q}));
  const pitches=selected.slice(1).map((s,k)=>s.positions[side]-selected[k].positions[side]),chords=holes.slice(1).map((p,k)=>distance(p,holes[k])/line.units);
  return {holes,pitch:Math.min(...pitches),maxPitch:Math.max(...pitches),minChord:Math.min(...chords),maxChord:Math.max(...chords)};
 });
 const rows=[...sideRows.A,...sideRows.B];
 return {count:stations.length,rows,sideRows,references:stations.map(s=>s.q),estimated:true,referenceKind:'orderedCutC',valid:rows.every(r=>r.pitch>=minPitch-1e-6),warning:'推定対応：区間順につないだカット線の累積長の同じ割合を共通Cの位置と仮定します。区間間の空きは除外し、対応のため端の穴が控えられる場合があります。実際の3D形状・ねじれ・伸びは未再現です。'+(rows.some(r=>r.minChord<minPitch)?' 穴中心の直線距離が下限未満の箇所があります。':'')};
}

export function placeRegistered(a,b,{mode='auto',count=13,minPitch=10}={}){
 if(!Number.isFinite(minPitch)||minPitch<10)throw Error('最小ピッチは10mm以上にしてください。');
 const profile=line=>{const [start,end]=line.cutRange||[0,1],points=line.points.map(p=>({q:(p.reference-start)/(end-start),s:p.s}));if(points.some(p=>!Number.isFinite(p.q)))throw Error('推定対応で基準位置を追跡できません。角合わせ・壁への延長を解除して元カット線内の区間を使ってください。');if(points.some((p,i)=>i&&p.q<points[i-1].q-1e-8))throw Error('基準線の対応が逆転しています。区間を短くしてください。');const result=[];for(const p of points){if(result.length&&p.q-result.at(-1).q<1e-10)result[result.length-1]=p;else result.push(p);}if(result.length<2)throw Error('推定できる区間が短すぎます。');return result;};
 const pa=profile(a),pb=profile(b),lo=Math.max(pa[0].q,pb[0].q,0),hi=Math.min(pa.at(-1).q,pb.at(-1).q,1);if(hi<=lo)throw Error('対応する共通の縫合区間がありません。');
 const at=(ps,q)=>{if(q<=ps[0].q)return ps[0].s;if(q>=ps.at(-1).q)return ps.at(-1).s;let l=1,r=ps.length-1;while(l<r){const m=(l+r)>>1;if(ps[m].q<q)l=m+1;else r=m;}const x=ps[l-1],y=ps[l];return x.s+(y.s-x.s)*(q-x.q)/(y.q-x.q);};
 const qs=[...new Set([lo,...pa.map(p=>p.q).filter(q=>q>lo&&q<hi),...pb.map(p=>p.q).filter(q=>q>lo&&q<hi),hi])].sort((x,y)=>x-y);let total=0;const knots=qs.map((q,i)=>{if(i)total+=Math.min((at(pa,q)-at(pa,qs[i-1]))/a.units,(at(pb,q)-at(pb,qs[i-1]))/b.units);return {q,s:total};});
 const capacity=Math.min(1000,Math.floor(total/(minPitch+.0001))+1);if(mode==='auto')count=capacity;if(!Number.isInteger(count)||count<2||count>capacity)throw Error('共通の縫合位置と最小ピッチを満たす穴数にできません。区間を広げるか穴数を減らしてください。');
 const references=Array.from({length:count},(_,i)=>{const target=total*i/(count-1);if(i===count-1)return hi;let l=1,r=knots.length-1;while(l<r){const m=(l+r)>>1;if(knots[m].s<target)l=m+1;else r=m;}const x=knots[l-1],y=knots[l];return x.q+(y.q-x.q)*(target-x.s)/(y.s-x.s||1);});
 const rows=[[a,pa],[b,pb]].map(([line,ps])=>{const positions=references.map(q=>at(ps,q)),holes=positions.map(s=>along(line,s)),pitches=positions.slice(1).map((s,i)=>(s-positions[i])/line.units),chords=holes.slice(1).map((p,i)=>distance(p,holes[i])/line.units);return {holes,pitch:Math.min(...pitches),maxPitch:Math.max(...pitches),minChord:Math.min(...chords),maxChord:Math.max(...chords)};});
 return {count,rows,references,valid:rows.every(r=>r.pitch>=minPitch-1e-6),warning:'推定対応：両カット線の同じ割合を、組み上がりの同じ縫合位置と仮定。実際の3D形状・伸びは未検証です。'+(rows.some(r=>r.minChord<minPitch)?' 穴中心の直線距離が下限未満の箇所があります。':''),estimated:true};
}
