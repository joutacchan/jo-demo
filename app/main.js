import {parsePath,prepare,offsetLine,place,distance,alignCorners,interiorSides} from './geometry.js?v=corner-preview-1';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const colors={A:'#2864b2',B:'#bb4935'};
const state={doc:null,paths:[],view:[0,0,2480,3505],base:[0,0,2480,3505],latest:null,cache:new Map(),calculations:0};
const node=(name,attrs,parent)=>{const e=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent?.append(e);return e;};
const message=text=>$('message').textContent=text;
for(const name of ['A','B']){
 const div=document.createElement('div');div.className='line';div.dataset.name=name;
 div.innerHTML=`<h3>線${name}</h3><label>カット線<select id="path${name}"></select></label><div class="grid"><label>始点 %<input id="start${name}" type="number" min="0" max="100" step="0.1" value="0"></label><label>終点 %<input id="end${name}" type="number" min="0" max="100" step="0.1" value="100"></label></div><label>始点を調整<input id="rangeStart${name}" type="range" min="0" max="100" step="0.1" value="0"></label><label>終点を調整<input id="rangeEnd${name}" type="range" min="0" max="100" step="0.1" value="100"></label><div class="grid"><label>穴を置く側<select id="side${name}"><option value="auto">内側（自動）</option><option value="1">右（手動）</option><option value="-1">左（手動）</option></select></label><label>オフセット mm<input id="offset${name}" type="number" min="0" max="100" step="0.1" value="3" disabled></label></div><label><input id="snap${name}" type="checkbox" checked>3mmにスナップ</label><button id="reverse${name}">始点と終点を入れ替え</button>`;
 for(const end of ['start','end']){
  const controls=document.createElement('div');controls.className='grid';
  controls.innerHTML=`<label>${end==='start'?'始点':'終点'}の角を揃える<select id="corner${end}${name}"><option value="">揃えない</option></select></label><label>隣の辺のオフセット方向<select id="cornerSide${end}${name}"><option value="auto">内側（自動）</option><option value="1">隣の辺の右（手動）</option><option value="-1">隣の辺の左</option></select></label>`;
  const pick=document.createElement('button');pick.id='pickCorner'+end+name;pick.className='pick-corner';pick.textContent=`${end==='start'?'始点':'終点'}の隣の辺を図で選ぶ`;
  pick.onclick=()=>{document.activeElement?.blur();$('stage').focus({preventScroll:true});$('active').value=name;$('mode').value='corner'+end;$('mode').onchange();message(`線${name}の${end==='start'?'始点':'終点'}で角を揃える隣の辺をタップしてください。ドラッグで移動もできます。`);};
  controls.append(pick);div.append(controls);
  for(const id of ['corner'+end+name,'cornerSide'+end+name])controls.querySelector('#'+id).onchange=schedule;
 }
 const help=document.createElement('p');help.className='hint';help.textContent='角を揃える：「隣の辺を図で選ぶ」を押して、型紙の線をタップ。選んだ辺はAが青、Bが赤、始点は実線・終点は破線で表示します。選んだ隣の辺も同じ距離でオフセットし、その交点に端の穴を合わせます。複数の交点がある場合は、指定した始点／終点に一番近い交点を使います。';div.append(help);
 $('lineFields').append(div);
 for(const end of ['Start','End']){
  const id=end.toLowerCase()+name;
  $('range'+end+name).oninput=e=>{$(id).value=e.target.value;schedule();};
  $(id).oninput=e=>{$('range'+end+name).value=e.target.value;schedule();};
 }
 $('reverse'+name).onclick=()=>{const a=$('start'+name),b=$('end'+name);[a.value,b.value]=[b.value,a.value];syncRanges(name);calculate();};
 $('path'+name).onchange=()=>{for(const endpoint of ['start','end'])$('corner'+endpoint+name).value='';$('start'+name).value=0;$('end'+name).value=100;syncRanges(name);calculate();};
}
function syncRanges(name){$('rangeStart'+name).value=$('start'+name).value;$('rangeEnd'+name).value=$('end'+name).value;}
function number(id,min,max){const el=$(id),n=el.valueAsNumber;if(!Number.isFinite(n)||n<min||n>max)throw Error(`${el.parentElement.textContent.trim()}：${min}〜${max}の数値を入力してください。`);return n;}
let frame=0;function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(calculate);}
for(const id of ['width','diameter','count','pitch','countMode',...['A','B'].flatMap(n=>['side','offset','snap'].map(k=>k+n))])$(id).addEventListener('input',schedule);
// History stores editor values and immutable source text, never generated hole SVG.
const history=[],future=[];let previous=null,restoring=false,editGroup=null,groupRecorded=false;
const fields=()=>[...document.querySelectorAll('aside input[id],aside select[id]')].filter(e=>e.type!=='file'&&e.type!=='range');
function snapshot(){return {source:state.sourceText,name:state.sourceLabel,view:[...state.view],values:fields().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])};}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function checkpoint(){
 if(restoring||!state.doc)return;
 const current=snapshot();
 if(previous&&!same(previous,current)){
  future.length=0;
  const key=editGroup?.replace(/^rangeStart/,'start').replace(/^rangeEnd/,'end');
  const grouped=key&&previous.source===current.source&&same(previous.view,current.view)&&current.values.every(([id,v],i)=>id===key||same(previous.values[i],[id,v]));
  if(!grouped||!groupRecorded){history.push(previous);if(history.length>100)history.shift();}
  if(!grouped)editGroup=null;groupRecorded=!!grouped;
 }
 previous=current;updateHistoryButtons();
}
function calculate(){cancelAnimationFrame(frame);frame=0;checkpoint();recalculate();if(!restoring&&state.doc)previous=snapshot();}
// One continuous field edit (typing or dragging a slider) is one undo step.
document.querySelector('aside').addEventListener('focusin',e=>{
 editGroup=e.target.matches('input[type=number],input[type=range]')?e.target.id:null;groupRecorded=false;
});
document.querySelector('aside').addEventListener('focusout',()=>{
 if(frame){cancelAnimationFrame(frame);frame=0;calculate();}editGroup=null;groupRecorded=false;
});
function updateHistoryButtons(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function restoreHistory(from,to,text){
 cancelAnimationFrame(frame);frame=0;
 // Include a pending edit before restoring its predecessor.
 checkpoint();const saved=from.pop();if(!saved)return;
 to.push(snapshot());if(to.length>100)to.shift();
 restoring=true;
 try{
  if(saved.source!==state.sourceText)loadSVG(saved.source,saved.name);
  for(const [id,value] of saved.values){const e=$(id);if(e.type==='checkbox')e.checked=value;else e.value=value;}
  for(const name of ['A','B'])syncRanges(name);
  state.view=[...saved.view];applyView();recalculate();
 }finally{restoring=false;editGroup=null;groupRecorded=false;previous=snapshot();updateHistoryButtons();}
 message(text);
}
$('undo').onclick=()=>restoreHistory(history,future,'1つ前の状態に戻しました。');
$('redo').onclick=()=>restoreHistory(future,history,'1つ先の状態に進みました。');
function resolveSide(value,index,reverse=false){
 if(value!=='auto')return +value;
 if(!state.inside)throw Error(state.insideError);
 return state.inside[index]*(reverse?-1:1);
}
function recalculate(){
 state.calculations++;state.latest=null;$('save').disabled=$('share').disabled=true;$('warning').textContent='';$('stats').replaceChildren();
 for(const id of ['guides','holes','markers'])$(id).replaceChildren();
 renderCornerSelections();
 try{
  if(!state.doc)return;
  const width=number('width',1,10000),units=state.base[2]/width,diameter=number('diameter',.1,10),minPitch=number('pitch',10,1000);
  const auto=$('countMode').value==='auto';
  const count=auto?13:number('count',2,1000);$('count').disabled=auto;
  if($('pathA').value===$('pathB').value)throw Error('AとBは異なるカット線を選んでください。');
  const lines=[],cornerErrors=[];
  for(const name of ['A','B']){
   const idx=+$('path'+name).value,path=state.paths[idx];
   $('offset'+name).disabled=$('snap'+name).checked;
   const offset=$('snap'+name).checked?3:number('offset'+name,0,100);if($('snap'+name).checked)$('offset'+name).value=3;
   const start=number('start'+name,0,100)/100,end=number('end'+name,0,100)/100,side=resolveSide($('side'+name).value,idx,start>end);
   const key=idx+':'+units;
   if(!state.cache.has(key)){if(state.cache.size>30)state.cache.clear();state.cache.set(key,prepare(path,units));}
   let line=offsetLine(state.cache.get(key),start,end,offset*units,side);
   const guide=node('path',{d:line.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),stroke:colors[name],'data-line':name},$('guides'));
   try{
   const corners={};
   for(const endpoint of ['start','end']){
    const chosen=$('corner'+endpoint+name).value;if(chosen==='')continue;
    const neighbor=+chosen;if(neighbor===idx)throw Error('角を揃える隣の辺は、自分以外の線を選んでください。');
    const neighborKey=neighbor+':'+units;
    if(!state.cache.has(neighborKey))state.cache.set(neighborKey,prepare(state.paths[neighbor],units));
    corners[endpoint]=offsetLine(state.cache.get(neighborKey),0,1,offset*units,resolveSide($('cornerSide'+endpoint+name).value,neighbor));
   }
   if(corners.start||corners.end)line=alignCorners(line,corners);
   guide.setAttribute('d',line.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '));
   }catch(e){cornerErrors.push(`線${name}：${e.message}`);guide.setAttribute('data-corner-error','true');}
   lines.push(line);
  }
  if(cornerErrors.length)throw Error(cornerErrors.join(' ')+' 角合わせできない側は調整前の点線を表示しています。隣辺を選び直すか、↶で戻してください。');
  const result=place(...lines,{mode:$('countMode').value,count,minPitch});
  if(auto)$('count').value=result.count;
  result.rows.forEach((row,j)=>{
   const name=j?'B':'A';
   row.holes.forEach((p,i)=>node('circle',{cx:p.x,cy:p.y,r:diameter*units/2,'data-hole':`${name}_${i+1}`},$('holes')));
   const px=state.view[2]/$('canvas').getBoundingClientRect().width;
   for(const [p,label] of [[row.holes[0],name+'始'],[row.holes.at(-1),name+'終']]){
    node('circle',{cx:p.x,cy:p.y,r:5*px,fill:colors[name]},$('markers'));
    node('text',{x:p.x+8*px,y:p.y-8*px,'font-size':12*px,style:`font-size:${12*px}px`},$('markers')).textContent=label;
   }
   const div=document.createElement('div');div.className='result';div.textContent=`${name}：${result.count}穴 ／ 縫い線 ${(lines[j].len/units).toFixed(3)}mm ／ 弧長ピッチ ${row.pitch.toFixed(3)}mm ／ 中心の直線距離 ${row.minChord.toFixed(3)}〜${row.maxChord.toFixed(3)}mm`;$('stats').append(div);
  });
  $('warning').textContent=result.warning;
  if(result.valid){state.latest={result,lines,units,width,diameter};$('save').disabled=false;$('share').disabled=!navigator.canShare;}
 }catch(e){$('warning').textContent=e.message;}
}
function validateDocument(doc){
 if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('正しいSVGファイルを指定してください。');
 const root=doc.documentElement;
 // Keep accepted documents unchanged. Reject active/external content instead of silently altering it.
 for(const e of root.querySelectorAll('*')){
  if(!['g','path','title','desc','metadata'].includes(e.localName))throw Error('対応する要素はpathとgです。図形や円弧をパスに変換してください。');
 }
 for(const e of [root,...root.querySelectorAll('*')])for(const a of e.attributes){
  if(/^on/i.test(a.name)||/href$/i.test(a.name)||/url\s*\(|@import|expression\s*\(/i.test(a.value))throw Error('スクリプトや外部参照を含むSVGは読み込めません。');
  if(a.name==='transform'||a.name==='style'&&/transform|display\s*:|visibility\s*:|clip-path|mask|filter/i.test(a.value))throw Error('変換・非表示・クリップ指定を適用してからSVGを書き出してください。');
 }
 const box=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
 if(box.length!==4||box.some(v=>!Number.isFinite(v))||box[2]<=0||box[3]<=0)throw Error('有効なviewBoxが必要です。');
 const paths=[...root.querySelectorAll('path')].flatMap(el=>parsePath(el.getAttribute('d')||''));
 if(paths.length<2||paths.length>100)throw Error('2〜100本のサブパスを含むSVGを指定してください。');
 return {box,paths};
}
export function loadSVG(text,name='SVG'){
 const doc=new DOMParser().parseFromString(text,'image/svg+xml'),{box,paths}=validateDocument(doc);
 state.sourceText=text;state.sourceLabel=name;state.doc=doc;state.paths=paths;state.inside=null;state.insideError='';try{state.inside=interiorSides(paths,box[2]/210);}catch(e){state.insideError=e.message;}state.base=box;state.cache.clear();state.view=[...box];
 const drawing=$('drawing');drawing.replaceChildren();drawing.setAttribute('style',doc.documentElement.getAttribute('style')||'');
 for(const e of doc.documentElement.children)drawing.append(document.importNode(e,true));
 for(const name of ['A','B']){
  $('side'+name).value='auto';
  const select=$('path'+name);select.replaceChildren();
  paths.forEach((_,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`カット線 ${i+1}`;select.append(o);});
  select.value=Math.min(name==='A'?5:6,paths.length-(name==='A'?2:1));
  for(const endpoint of ['start','end']){
   const corners=$('corner'+endpoint+name);corners.replaceChildren(new Option('揃えない',''));
   paths.forEach((_,i)=>corners.append(new Option('カット線 '+(i+1),String(i))));
   $('cornerSide'+endpoint+name).value='auto';
  }
  $('start'+name).value=0;$('end'+name).value=100;syncRanges(name);
 }
 $('sourceName').textContent=`${name} · ${doc.querySelectorAll('path').length}パス / ${paths.length}サブパス`;
 applyView();calculate();message('ドラッグで移動、2本指でズーム。タップで線や端点を指定できます。');
}
async function sample(){try{const r=await fetch('assets/source/名称未設定 3.svg');if(!r.ok)throw Error('サンプルを読み込めません。');loadSVG(await r.text(),'原本サンプル');$('boot').textContent='操作の準備ができました';}catch(e){message(e.message);$('boot').textContent='起動に失敗しました。SafariでWebページとして開いてください。';}}
$('sample').onclick=sample;
$('file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2e6)throw Error('SVGは2MB以内にしてください。');loadSVG(await file.text(),file.name);}catch(err){message(err.message);}finally{e.target.value='';}};
function applyView(){$('canvas').setAttribute('viewBox',state.view.join(' '));}
function local(x,y){return new DOMPoint(x,y).matrixTransform($('canvas').getScreenCTM().inverse());}
function zoom(factor,x,y){
 const before=local(x,y),v=state.view,w=Math.max(state.base[2]/40,Math.min(state.base[2]*4,v[2]/factor)),ratio=w/v[2];
 state.view=[before.x+(v[0]-before.x)*ratio,before.y+(v[1]-before.y)*ratio,w,v[3]*ratio];applyView();
}
for(const [id,f] of [['plus',1.4],['minus',1/1.4]])$(id).onclick=()=>{const r=$('canvas').getBoundingClientRect();zoom(f,r.x+r.width/2,r.y+r.height/2);checkpoint();};
$('fit').onclick=()=>{state.view=[...state.base];applyView();checkpoint();};
$('mode').onchange=()=>{renderCornerSelections();$('modeHint').textContent=`現在のモード：${$('mode').selectedOptions[0].textContent} ／ 編集対象：${$('active').value}。ドラッグで上下左右に移動、2本指で拡大・移動。タップで選択・端点指定。`};$('active').onchange=$('mode').onchange;
function renderCornerSelections(){
 const group=$('neighbors');group.replaceChildren();if(!state.doc)return;
 for(const name of ['A','B'])for(const end of ['start','end']){
  const value=$('corner'+end+name).value;if(value==='')continue;
  const path=state.paths[+value];if(!path)continue;
  const d='M'+path.start.x+','+path.start.y+path.segments.map(c=>(c.length===2?'L':c.length===3?'Q':'C')+c.slice(1).map(p=>p.x+','+p.y).join(' ')).join(' ');
  const mark=node('path',{d,fill:'none',stroke:colors[name],'stroke-width':5,'stroke-opacity':.65,'vector-effect':'non-scaling-stroke','stroke-dasharray':end==='end'?'8 4':'none','data-corner':end+name},group);
  node('title',{},mark).textContent=`線${name}の${end==='start'?'始点':'終点'}の隣辺`;
 }
}
function nearest(points,p){let best={d:Infinity,s:0};for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,f=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),q={x:a.x+dx*f,y:a.y+dy*f},d=distance(q,p);if(d<best.d)best={d,s:a.s+(b.s-a.s)*f};}return best;}
function hit(x,y){
 const mode=$('mode').value;if(mode==='pan'||!state.doc)return;
 const p=local(x,y),q=local(x+28,y),limit=distance(p,q),units=state.base[2]/number('width',1,10000);
 const corner=mode==='cornerstart'||mode==='cornerend';
 const candidates=mode==='A'||mode==='B'||corner?state.paths.map((_,i)=>i).filter(i=>!corner||i!==+$('path'+$('active').value).value):[+$('path'+$('active').value).value];
 let best={d:Infinity};
 for(const i of candidates){const key=i+':'+units;if(!state.cache.has(key))state.cache.set(key,prepare(state.paths[i],units));const prep=state.cache.get(key);let passed=0;for(const table of prep.tables){const match=nearest(table.points,p);if(match.d<best.d)best={d:match.d,index:i,percent:100*(passed+match.s)/prep.total};passed+=table.len;}}
 if(best.d>limit){message('線の近くをタップしてください。番号リストからも選択できます。');return;}
 if(corner){const name=$('active').value;$(mode+name).value=best.index;calculate();message($('warning').textContent||`線${name}の${mode==='cornerstart'?'始点':'終点'}の隣辺を選びました。図の太い線で確認できます。別の辺をタップすると変更できます。`);}
 else if(mode==='A'||mode==='B'){$('path'+mode).value=best.index;$('path'+mode).onchange();message(`線${mode}にカット線${best.index+1}を選びました。`);}
 else{const name=$('active').value;$(mode+name).value=best.percent.toFixed(1);syncRanges(name);calculate();message(`線${name}の${mode==='start'?'始点':'終点'}を変更しました。`);}
}
const pointers=new Map();let gesture=null,multi=false;
const pinch=()=>{const a=[...pointers.values()];return a.length<2?null:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,d:Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y))};};
$('stage').onpointerdown=e=>{if(e.pointerType==='mouse'&&e.button!==0)return;$('stage').setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false});if(pointers.size>1){multi=true;gesture=pinch();}};
$('stage').onpointermove=e=>{
 const p=pointers.get(e.pointerId);if(!p)return;const before=local(p.x,p.y);p.x=e.clientX;p.y=e.clientY;p.moved ||=Math.hypot(p.x-p.sx,p.y-p.sy)>6;
 if(pointers.size>1){const next=pinch();if(gesture){const anchor=local(gesture.x,gesture.y);zoom(next.d/gesture.d,gesture.x,gesture.y);const now=local(next.x,next.y);state.view[0]+=anchor.x-now.x;state.view[1]+=anchor.y-now.y;applyView();}gesture=next;}
 else if(p.moved){const now=local(p.x,p.y);state.view[0]+=before.x-now.x;state.view[1]+=before.y-now.y;applyView();}
};
function endPointer(e,cancel=false){const p=pointers.get(e.pointerId);if(!p)return;if(!cancel&&!multi&&!p.moved)try{hit(e.clientX,e.clientY);}catch(err){message(err.message);}pointers.delete(e.pointerId);gesture=pinch();if(!pointers.size){multi=false;checkpoint();}}
$('stage').onpointerup=e=>endPointer(e);$('stage').onpointercancel=e=>endPointer(e,true);$('stage').onlostpointercapture=e=>endPointer(e,true);
export function exportSVG(){
 if(!state.latest)throw Error('条件を満たす配置を作成してください。');
 const {result,units,width,diameter}=state.latest,doc=state.doc.cloneNode(true),root=doc.documentElement;
 root.setAttribute('width',width+'mm');root.setAttribute('height',(state.base[3]/units)+'mm');
 const g=doc.createElementNS(NS,'g');let id='stitch_holes',suffix=1;while(root.querySelector(`[id="${id}"]`))id='stitch_holes_'+suffix++;g.setAttribute('id',id);g.setAttribute('fill','none');g.setAttribute('stroke','black');g.setAttribute('stroke-width',.08*units);root.append(g);
 result.rows.forEach((row,j)=>row.holes.forEach((p,i)=>{const c=doc.createElementNS(NS,'circle');for(const [k,v] of Object.entries({cx:p.x.toFixed(6),cy:p.y.toFixed(6),r:(diameter*units/2).toFixed(6),'data-hole':`${j?'B':'A'}_${String(i+1).padStart(2,'0')}`}))c.setAttribute(k,v);g.append(c);}));
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(root);
}
function file(){return new File([exportSVG()],'針穴配置済み.svg',{type:'image/svg+xml'});}
$('save').onclick=()=>{try{calculate();const f=file(),url=URL.createObjectURL(f),a=document.createElement('a');a.href=url;a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);message('SVGを作成しました。Safariのダウンロード、または「ファイルを共有」から保存してください。');}catch(e){message(e.message);}};
$('share').onclick=async()=>{try{calculate();const f=file();if(!navigator.canShare?.({files:[f]}))throw Error('このブラウザでは共有できません。SVGを保存してください。');await navigator.share({files:[f]});}catch(e){if(e.name!=='AbortError')message(e.message);}};
// Read-only diagnostics used by the regression suite; no external requests.
window.stitch={state,loadSVG,exportSVG,calculate};
window.addEventListener('error',e=>{message('エラー：'+e.message);$('boot').textContent='エラーが発生しました';});
sample();
