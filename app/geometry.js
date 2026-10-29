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
export function prepare(path,units){
  const tables=path.segments.map(c=>sample(t=>evaluate(c,t),0,1,.5*units,.0002*units));
  const total=tables.reduce((s,t)=>s+t.len,0);
  if(total<1e-8)throw Error('長さゼロの線です。');
  return {path,tables,total,units};
}
export function offsetLine(prepared,start,end,offset,side){
  if(![start,end,offset,side].every(Number.isFinite)||start<0||end<0||start>1||end>1||start===end)throw Error('始点と終点を異なる0〜100%で指定してください。');
  const reverse=start>end,lo=Math.min(start,end)*prepared.total,hi=Math.max(start,end)*prepared.total;
  const chunks=[];let passed=0;
  prepared.tables.forEach((table,index)=>{
    const from=Math.max(0,lo-passed),to=Math.min(table.len,hi-passed);passed+=table.len;
    if(to<=from||table.len<1e-10)return;
    const c=prepared.path.segments[index],t0=at(table,from).t,t1=at(table,to).t;
    const fn=t=>{const p=evaluate(c,t),v=tangent(c,t),sign=side*(reverse?-1:1);return point(p.x-v.y*offset*sign,p.y+v.x*offset*sign);};
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
        joined.push(sample(t=>point(center.x+r*Math.cos(angle0+delta*t),center.y+r*Math.sin(angle0+delta*t)),0,1,.25*prepared.units,.0001*prepared.units));
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
      if(!hits.some(h=>Math.abs(h.s-s)<1e-7))hits.push({s,x:p.x+t*dx,y:p.y+t*dy});
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
