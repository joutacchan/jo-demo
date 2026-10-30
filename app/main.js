import {parsePath,prepare,offsetLine,place,distance,alignCorners,interiorSides,fitWalls,touchingWalls,distanceToWalls,trimLine,placeJoined,tangent,evaluate} from './geometry.js?v=free-layout-1';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const colors={A:'#2864b2',B:'#bb4935',C:'#8564a7'},lineNames=['A','B','C'];
const activeNames=()=>$('seamMode').value==='joined'?lineNames:$('seamMode').value==='single'?['A']:['A','B'];
let sourceSequence=0;
const state={rotation:0,partOffsets:{},partOrder:[],fixed:[],committedSignature:null,completed:[],sources:[],pathSources:[],doc:null,paths:[],view:[0,0,2480,3505],base:[0,0,2480,3505],latest:null,cache:new Map(),calculations:0};
const node=(name,attrs,parent)=>{const e=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent?.append(e);return e;};
const message=text=>$('message').textContent=text;
for(const name of lineNames){
 const div=document.createElement('div');div.className='line';div.dataset.name=name;div.hidden=name==='C';
 div.innerHTML=`<h3>線${name}</h3><label>カット線<select id="path${name}"></select></label><div class="grid"><label>始点 %<input id="start${name}" type="number" min="0" max="100" step="0.1" value="0"></label><label>終点 %<input id="end${name}" type="number" min="0" max="100" step="0.1" value="100"></label></div><label>始点を調整<input id="rangeStart${name}" type="range" min="0" max="100" step="0.1" value="0"></label><label>終点を調整<input id="rangeEnd${name}" type="range" min="0" max="100" step="0.1" value="100"></label><div class="grid"><label>穴を置く側<select id="side${name}"><option value="auto">内側（自動）</option><option value="outside">外側（自動）</option><option value="1">右（手動）</option><option value="-1">左（手動）</option></select></label><label>オフセット mm<input id="offset${name}" type="number" min="0" max="100" step="0.1" value="3" disabled></label></div><label><input id="snap${name}" type="checkbox" checked>3mmに固定</label><button id="reverse${name}">始点と終点を入れ替え</button>`;
 for(const end of ['start','end']){
  const controls=document.createElement('div');controls.className='grid';
  controls.innerHTML=`<label>${end==='start'?'始点':'終点'}の角を揃える<select id="corner${end}${name}"><option value="">揃えない</option></select></label><label>隣の辺のオフセット方向<select id="cornerSide${end}${name}"><option value="auto">内側（自動）</option><option value="1">隣の辺の右（手動）</option><option value="-1">隣の辺の左</option></select></label>`;
  const inset=document.createElement('div');inset.className='grid inset-controls';
  inset.innerHTML=`<label>${end==='start'?'始点':'終点'}の控え<select id="insetMode${end}${name}"><option value="offset" selected>壁に接する時はオフセットと同じ</option><option value="manual">数値で指定</option><option value="off">控えない</option></select></label><label>控え量 mm<input id="inset${end}${name}" type="number" min="0" max="100" step="0.1" value="3" disabled></label>`;
  for(const id of ['insetMode'+end+name,'inset'+end+name])inset.querySelector('#'+id).addEventListener('input',schedule);
  div.append(inset);
  const pick=document.createElement('button');pick.id='pickCorner'+end+name;pick.className='pick-corner';pick.textContent=`${end==='start'?'始点':'終点'}の隣の辺を図で選ぶ`;
  pick.onclick=()=>{document.activeElement?.blur();$('stage').focus({preventScroll:true});$('active').value=name;$('mode').value='corner'+end;$('mode').onchange();message(`線${name}の${end==='start'?'始点':'終点'}で角を揃える隣の辺をタップしてください。ドラッグで移動もできます。`);};
  const autoPick=document.createElement('button');autoPick.id='autoWall'+end+name;autoPick.className='pick-corner';autoPick.textContent=`${end==='start'?'始点':'終点'}を壁から3mmに自動調整`;
  autoPick.onclick=()=>{document.activeElement?.blur();$('stage').focus({preventScroll:true});$('corner'+end+name).value='auto';calculate();message($('warning').textContent||'壁が見つかった端は3mm手前へ、見つからない端は元の位置を使います。');};
  controls.append(autoPick,pick);div.append(controls);
  for(const id of ['corner'+end+name,'cornerSide'+end+name])controls.querySelector('#'+id).onchange=schedule;
 }
 const help=document.createElement('p');help.className='hint';help.textContent='始点・終点とも、壁に接する場合だけ穴中心をオフセットと同じ距離だけ壁から離します。壁に接しない端は元の位置を保ちます。選択した縫い合わせる辺同士は壁に含めません。数値指定で控え量を変更できます。壁のない端では縫い線に沿って指定mmだけ控えます。角合わせは詳細から指定できます。';div.append(help);
 const advanced=document.createElement('details');advanced.className='line-details';
 const summary=document.createElement('summary');summary.textContent='端点・控え量・オフセット';advanced.append(summary);
 for(const child of [...div.children].slice(2))advanced.append(child);
 const pickLine=document.createElement('button');pickLine.className='pick-line';pickLine.id='pickLine'+name;pickLine.textContent='図で辺'+name+'を選ぶ';
 pickLine.onclick=()=>{document.activeElement?.blur();$('stage').focus({preventScroll:true});$('active').value=name;$('mode').value=name;$('mode').onchange();message('型紙の辺をタップしてください。');};
 div.append(pickLine,advanced);$('lineFields').append(div);
 const offsetHint=document.createElement('p');offsetHint.id='offsetHint'+name;offsetHint.className='hint';
 $('snap'+name).parentElement.after(offsetHint);$('offset'+name).setAttribute('aria-describedby',offsetHint.id);
 $('snap'+name).addEventListener('change',()=>message($('snap'+name).checked?`線${name}：穴中心までの距離を3mmに固定しました。`:`線${name}：固定を解除しました。「オフセット mm」の数値を変えると穴が移動します。`));
 for(const end of ['Start','End']){
  const id=end.toLowerCase()+name;
  $('range'+end+name).oninput=e=>{$(id).value=e.target.value;schedule();};
  $(id).oninput=e=>{$('range'+end+name).value=e.target.value;schedule();};
 }
 $('reverse'+name).onclick=()=>{const a=$('start'+name),b=$('end'+name);[a.value,b.value]=[b.value,a.value];for(const end of ['start','end']){$('corner'+end+name).value='';$('insetMode'+end+name).value='offset';}syncRanges(name);calculate();message($('warning').textContent||'始点と終点を入れ替え、壁に接する端の控えを自動で設定しました。');};
 $('path'+name).onchange=()=>{for(const endpoint of ['start','end']){$('corner'+endpoint+name).value='';$('insetMode'+endpoint+name).value='offset';}$('start'+name).value=0;$('end'+name).value=100;syncRanges(name);calculate();};
}
function syncRanges(name){$('rangeStart'+name).value=$('start'+name).value;$('rangeEnd'+name).value=$('end'+name).value;}
function number(id,min,max){const el=$(id),n=el.valueAsNumber;if(!Number.isFinite(n)||n<min||n>max)throw Error(`${el.parentElement.textContent.trim()}：${min}〜${max}の数値を入力してください。`);return n;}
let frame=0;function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(calculate);}
for(const id of ['width','width2','width3','seamMode','split','diameter','count','pitch','countMode',...lineNames.flatMap(n=>['side','offset','snap'].map(k=>k+n))])$(id).addEventListener('input',schedule);
// History stores editor values and immutable source text, never generated hole SVG.
const history=[],future=[];let previous=null,restoring=false,editGroup=null,groupRecorded=false;
const fields=()=>[...document.querySelectorAll('aside input[id],aside select[id]')].filter(e=>e.type!=='file'&&e.type!=='range'&&e.id!=='exportSource');
function snapshot(){return {partOffsets:structuredClone(state.partOffsets),rotation:state.rotation,partOrder:[...state.partOrder],source:state.sourceText,name:state.sourceLabel,sources:state.sources.map(s=>({text:s.text,name:s.name,width:s.width,id:s.id})),fixed:[...state.fixed],completed:[...state.completed],committedSignature:state.committedSignature,view:[...state.view],values:fields().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])};}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function checkpoint(){
 if(restoring||!state.doc)return;
 const current=snapshot();
 if(previous&&!same(previous,current)){
  future.length=0;
  const key=editGroup?.replace(/^rangeStart/,'start').replace(/^rangeEnd/,'end');
  const grouped=key&&same(previous.sources.map(s=>[s.text,s.name]),current.sources.map(s=>[s.text,s.name]))&&same(previous.view,current.view)&&current.values.every(([id,v],i)=>id===key||same(previous.values[i],[id,v]));
  if(!grouped||!groupRecorded){history.push(previous);if(history.length>100)history.shift();}
  if(!grouped)editGroup=null;groupRecorded=!!grouped;
 }
 previous=current;updateHistoryButtons();
}
function calculate(){cancelAnimationFrame(frame);frame=0;checkpoint();recalculate();syncPartLayout();if(!restoring&&state.doc)previous=snapshot();}
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
  if(!same(saved.sources.map(s=>[s.text,s.name,s.id]),state.sources.map(s=>[s.text,s.name,s.id]))){
   state.fixed=[...(saved.fixed||[])];state.completed=[...(saved.completed||[])];state.committedSignature=saved.committedSignature;
  for(const [id,value] of saved.values)if(/^width\d*$/.test(id)&&$(id))$(id).value=value;
   state.sources=saved.sources.map(s=>({...readSource(s.text,s.name),width:s.width,id:s.id}));ensureSourceControls();rebuildScene(true);populateChoices();
  }
  state.fixed=[...(saved.fixed||[])];state.completed=[...(saved.completed||[])];state.committedSignature=saved.committedSignature;
  for(const [id,value] of saved.values){const e=$(id);if(e.type==='checkbox')e.checked=value;else e.value=value;}
  for(const name of lineNames)syncRanges(name);
  state.partOffsets=structuredClone(saved.partOffsets||{});state.rotation=saved.rotation||0;state.partOrder=[...(saved.partOrder||[])];state.view=[...saved.view];applyView();recalculate();syncPartLayout();
 }finally{restoring=false;editGroup=null;groupRecorded=false;previous=snapshot();updateHistoryButtons();}
 message(text);
}
$('undo').onclick=()=>restoreHistory(history,future,'1つ前の状態に戻しました。');
$('redo').onclick=()=>restoreHistory(future,history,'1つ先の状態に進みました。');
function resolveSide(value,index,reverse=false){
 if(value!=='auto'&&value!=='outside')return +value;
 if(!state.inside[index])throw Error(state.sources[state.pathSources[index]].insideError);
 return state.inside[index]*(reverse?-1:1)*(value==='outside'?-1:1);
}
function recalculate(){
 const joinedMode=$('seamMode').value==='joined',singleMode=$('seamMode').value==='single';
 $('singleModeButton').setAttribute('aria-pressed',singleMode);$('pairModeButton').setAttribute('aria-pressed',!singleMode);
 $('mode').querySelector('option[value=B]').disabled=singleMode;[...$('active').options].find(o=>o.value==='B').disabled=singleMode;if(singleMode&&$('active').value==='B')$('active').value='A';if(singleMode&&$('mode').value==='B')$('mode').value='A';
 let cOption=$('mode').querySelector('option[value=C]');if(!cOption){cOption=new Option('線Cを選択','C');$('mode').append(cOption);$('active').append(new Option('C','C'));}
 cOption.disabled=!joinedMode;$('active').querySelector('option[value=C]').disabled=!joinedMode;if(!joinedMode&&$('active').value==='C')$('active').value='A';if(!joinedMode&&$('mode').value==='C')$('mode').value='pan';
 state.autoWalls={};state.calculations++;state.latest=null;$('fixSet').disabled=true;$('save').disabled=!state.fixed.length;$('share').disabled=!state.fixed.length||!navigator.canShare;renderFixed();$('warning').textContent='';$('stats').replaceChildren();$('saveAll').disabled=!state.fixed.length;
 for(const id of ['guides','holes','markers'])$(id).replaceChildren();
 for(const name of lineNames){
  document.querySelector(`.line[data-name=${name}]`).hidden=!activeNames().includes(name);
  document.querySelector(`.line[data-name=${name}] h3`).textContent=$('seamMode').value==='joined'?({A:'A · つなぐ長い辺',B:'B · 前半につなぐ辺',C:'C · 後半につなぐ辺'}[name]):'線'+name;
  for(const end of ['start','end'])$('inset'+end+name).disabled=$('insetMode'+end+name).value!=='manual';
  const fixed=$('snap'+name).checked;$('offset'+name).disabled=fixed;if(fixed)$('offset'+name).value=3;
  $('offsetHint'+name).textContent=fixed?'カット線から穴の中心まで3mmに固定。オフにすると距離を変更できます。':'固定を解除中。「オフセット mm」を変更してください。オフにするだけでは距離は変わりません。';
 }
 for(const name of lineNames)for(const end of ['start','end'])for(const o of $('corner'+end+name).options)if(o.value!==''&&o.value!=='auto')o.disabled=state.pathSources[+o.value]!==state.pathSources[+$('path'+name).value];
 renderCornerSelections();
 try{
  if(!state.doc)return;
  renderFixed();
  const width=number('width',1,10000);for(let i=1;i<state.sources.length;i++)number('width'+(i+1),1,10000);rebuildScene();renderFixed();
  $('joinedSettings').hidden=$('seamMode').value!=='joined';$('countLabel').textContent=singleMode?'穴数':joinedMode?'各組の穴数':'片側の穴数';
  const units=state.sources[0].box[2]/width,diameter=number('diameter',.1,10),minPitch=number('pitch',10,1000);
  const auto=$('countMode').value==='auto';
  const count=auto?13:number('count',2,1000);$('count').disabled=auto;
  if(joinedMode&&new Set(activeNames().map(n=>$('path'+n).value)).size!==activeNames().length)throw Error('A・B・Cには異なるカット線を選んでください。');
  const lines=[],cornerErrors=[];
  for(const name of activeNames()){
   const idx=+$('path'+name).value,path=state.paths[idx];
   const offset=$('snap'+name).checked?3:number('offset'+name,0,100);
   const start=number('start'+name,0,100)/100,end=number('end'+name,0,100)/100,side=resolveSide($('side'+name).value,idx,start>end);
   const key=idx+':'+units;
   if(!state.cache.has(key)){if(state.cache.size>30)state.cache.clear();state.cache.set(key,prepare(path,units));}
   let line=offsetLine(state.cache.get(key),start,end,offset*units,side);
   const guide=node('path',{d:line.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),stroke:colors[name],'data-line':name},$('guides'));
   try{
   const startAuto=$('cornerstart'+name).value==='auto',endAuto=$('cornerend'+name).value==='auto';
   if(startAuto||endAuto){
    if(state.inside[idx]&&side!==state.inside[idx]*(start>end?-1:1))throw Error('壁の自動調整は内側への配置で使ってください。');
    const walls=state.paths.flatMap((p,i)=>{
     if(i===idx||state.pathSources[i]!==state.pathSources[idx])return [];const key=i+':'+units;
     if(!state.cache.has(key))state.cache.set(key,prepare(p,units));return [{index:i,prepared:state.cache.get(key)}];
    });
    line=fitWalls(state.cache.get(key),start,end,offset*units,side,walls,{startAuto,endAuto,clearance:3,maxLength:2*Math.hypot(...state.sources[state.pathSources[idx]].box.slice(2))*state.sources[state.pathSources[idx]].scale/units});
    for(const [endpoint,index] of Object.entries(line.autoWalls))state.autoWalls[endpoint+name]=index;
   }
   const corners={};
   for(const endpoint of ['start','end']){
    const chosen=$('corner'+endpoint+name).value;if(chosen===''||chosen==='auto')continue;
    const neighbor=+chosen;if(neighbor===idx)throw Error('角を揃える隣の辺は、自分以外の線を選んでください。');
    if(state.pathSources[neighbor]!==state.pathSources[idx])throw Error('隣の辺は同じ型紙から選んでください。');
    const neighborKey=neighbor+':'+units;
    if(!state.cache.has(neighborKey))state.cache.set(neighborKey,prepare(state.paths[neighbor],units));
    corners[endpoint]=offsetLine(state.cache.get(neighborKey),0,1,offset*units,resolveSide($('cornerSide'+endpoint+name).value,neighbor));
   }
   if(corners.start||corners.end)line=alignCorners(line,corners);
   const allWalls=state.paths.flatMap((p,i)=>{if(i===idx||state.pathSources[i]!==state.pathSources[idx]||activeNames().some(n=>n!==name&&+$('path'+n).value===i))return [];const k=i+':'+units;if(!state.cache.has(k))state.cache.set(k,prepare(p,units));return [{index:i,prepared:state.cache.get(k)}];});
   const insets={};
   for(const endpoint of ['start','end']){
    if($('corner'+endpoint+name).value!=='')continue;
    const mode=$('insetMode'+endpoint+name).value,amount=mode==='manual'?number('inset'+endpoint+name,0,100):offset;
    if(mode==='off'||amount===0)continue;
    const walls=touchingWalls(state.cache.get(key),endpoint==='start'?start:end,allWalls);
    if(walls.length){
     const before=line;line=fitWalls(state.cache.get(key),start,end,offset*units,side,walls,{startAuto:endpoint==='start',endAuto:endpoint==='end',clearance:amount,extend:false,baseLine:line});
     if(line.autoWalls?.[endpoint]===undefined){if(distanceToWalls(endpoint==='start'?line.points[0]:line.points.at(-1),walls)<amount*units)throw Error('この控え量で壁から離せません。控え量か区間を見直してください。');else continue;}
     line.autoWalls={...before.autoWalls,...line.autoWalls};state.autoWalls[endpoint+name]=line.autoWalls[endpoint];insets[endpoint]=amount;
    }else if(mode==='manual'){line=trimLine(line,endpoint==='start'?amount*units:0,endpoint==='end'?amount*units:0);insets[endpoint]=amount;}
   }
   line.insets=insets;

   guide.setAttribute('d',line.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '));
   }catch(e){cornerErrors.push(`線${name}：${e.message}`);guide.setAttribute('data-corner-error','true');}
   lines.push(line);
  }
  renderCornerSelections();
  if(cornerErrors.length)throw Error(cornerErrors.join(' ')+' 角合わせできない側は調整前の点線を表示しています。隣辺を選び直すか、↶で戻してください。');
  const joined=$('seamMode').value==='joined';
  const result=joined?placeJoined(...lines,{split:number('split',.1,99.9)/100,mode:$('countMode').value,count,minPitch}):place(lines[0],lines[1]||lines[0],{mode:$('countMode').value,count,minPitch});
  if($('seamMode').value==='single')result.rows=result.rows.slice(0,1);
  if(auto)$('count').value=joined?result.pairs[0].count:result.count;
  result.rows.forEach((row,j)=>{
   const name=lineNames[j];
   row.holes.forEach((p,i)=>node('circle',{cx:p.x,cy:p.y,r:diameter*units/2,'data-hole':`${name}_${i+1}`},$('holes')));
   for(const [p,end,label] of [[row.holes[0],'start',name+'始点'],[row.holes.at(-1),'end',name+'終点']]){
    const marker=node('g',{'data-endpoint':end+name,'data-x':p.x,'data-y':p.y},$('markers'));
    node('circle',{cx:0,cy:0,r:5,fill:colors[name]},marker);
    node('text',{x:name==='A'?-8:8,y:-8,'text-anchor':name==='A'?'end':'start',style:'font-size:14px;stroke-width:3px'},marker).textContent=label;
   }
   const div=document.createElement('div');div.className='result';div.textContent=`${name}：${row.holes.length}穴 ／ 縫い線 ${(lines[j].len/units).toFixed(3)}mm ／ 弧長ピッチ ${row.pitch.toFixed(3)}${row.maxPitch?'〜'+row.maxPitch.toFixed(3):''}mm ／ 中心の直線距離 ${row.minChord.toFixed(3)}〜${row.maxChord.toFixed(3)}mm${Object.keys(lines[j].autoWalls||{}).map(end=>` ／ ${end==='start'?'始点':'終点'}：壁から${lines[j].insets?.[end]??3}mm（自動）`).join('')}${(lines[j].unchangedEnds||[]).map(end=>` ／ ${end==='start'?'始点':'終点'}：壁未検出・元の位置`).join('')}`;$('stats').append(div);
  });
  if(joined){const info=document.createElement('p');info.className='hint';info.textContent=`A前半 ↔ B：${result.pairs[0].count}穴 ／ A後半 ↔ C：${result.pairs[1].count}穴。境目は縫い線に沿って${(minPitch+.0001).toFixed(2)}mm空けています。`;$('stats').append(info);const m=node('g',{'data-x':result.boundary.x,'data-y':result.boundary.y},$('markers'));node('text',{x:8,y:20,style:'font-size:14px;stroke-width:3px'},m).textContent='Aの分割';}
  updateMarkerScale();
  $('warning').textContent=result.warning;
  if(result.valid){state.latest={result,lines,units,width,diameter,rowSources:activeNames().map(n=>state.pathSources[+$('path'+n).value])};$('save').disabled=false;$('saveAll').disabled=false;$('share').disabled=!navigator.canShare;$('fixSet').disabled=draftSignature()===state.committedSignature;
   if($('fixSet').disabled){$('holes').replaceChildren();$('markers').replaceChildren();$('guides').replaceChildren();}}
 }catch(e){$('warning').textContent=e.message;}
}
// Split only selection geometry at sharp corners; original SVG documents remain untouched.
function splitSharpPath(path){
 const runs=[];let segments=[];
 for(const segment of path.segments){
  if(segments.length){const a=tangent(segments.at(-1),1),b=tangent(segment,0);if(a.x*b.x+a.y*b.y<Math.cos(Math.PI/12)-1e-9){runs.push({start:segments[0][0],segments,closed:false});segments=[];}}
  segments.push(segment);
 }
 if(!runs.length)return [path];
 runs.push({start:segments[0][0],segments,closed:false});return runs;
}
function validateDocument(doc){
 if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('正しいSVGファイルを指定してください。');
 const root=doc.documentElement;
 // Keep accepted documents unchanged. Reject active/external content instead of silently altering it.
 for(const e of root.querySelectorAll('*')){
  if(!['g','path','circle','title','desc','metadata'].includes(e.localName))throw Error('対応する要素はpathとgです。図形や円弧をパスに変換してください。');
 }
 for(const e of [root,...root.querySelectorAll('*')])for(const a of e.attributes){
  if(/^on/i.test(a.name)||/href$/i.test(a.name)||/url\s*\(|@import|expression\s*\(/i.test(a.value))throw Error('スクリプトや外部参照を含むSVGは読み込めません。');
  if(a.name==='style'&&/transform|display\s*:|visibility\s*:|clip-path|mask|filter/i.test(a.value))throw Error('変換・非表示・クリップ指定を適用してからSVGを書き出してください。');
 }
 const box=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
 if(box.length!==4||box.some(v=>!Number.isFinite(v))||box[2]<=0||box[3]<=0)throw Error('有効なviewBoxが必要です。');
 const paths=[...root.querySelectorAll('path,circle')].flatMap(el=>{
  let matrix=new DOMMatrix();const chain=[];for(let e=el;e;e=e.parentElement){chain.unshift(e);if(e===root)break;}
  for(const e of chain)if(e.hasAttribute('transform')){
   const probe=document.createElementNS(NS,'g');probe.setAttribute('transform',e.getAttribute('transform'));
   const t=probe.transform.baseVal.consolidate();if(!t)throw Error('SVGの変換指定を解析できません。');matrix=matrix.multiply(t.matrix);
  }
  if(![matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].every(Number.isFinite)||Math.abs(matrix.a*matrix.d-matrix.b*matrix.c)<1e-12)throw Error('SVGの変換が不正または線を潰しています。');
  let parsed;
  if(el.localName==='circle'){
   const value=(name,fallback)=>{const raw=el.getAttribute(name)??fallback;if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()))throw Error('円の座標と半径は数値で指定してください。');return +raw;};
   const x=value('cx','0'),y=value('cy','0'),r=value('r','0'),k=.5522847498307936;
   if(r<=0)throw Error('円の半径は0より大きくしてください。');
   parsed=parsePath(`M${x+r} ${y} C${x+r} ${y+k*r} ${x+k*r} ${y+r} ${x} ${y+r} C${x-k*r} ${y+r} ${x-r} ${y+k*r} ${x-r} ${y} C${x-r} ${y-k*r} ${x-k*r} ${y-r} ${x} ${y-r} C${x+k*r} ${y-r} ${x+r} ${y-k*r} ${x+r} ${y} Z`);
  }else parsed=parsePath(el.getAttribute('d')||'');
  const map=p=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f});
  return parsed.map(p=>({...p,start:map(p.start),segments:p.segments.map(c=>c.map(map))}));
 }).flatMap(splitSharpPath);
 if(paths.length<1||paths.length>1000)throw Error('1〜1000本のサブパスを含むSVGを指定してください。');
 return {box,paths};
}
function widthControl(i){return $(i?'width'+(i+1):'width');}
function ensureSourceControls(){
 for(let i=3;i<state.sources.length;i++)if(!widthControl(i)){
  const box=document.createElement('div');box.className='source-card';box.dataset.sourceSlot=i;
  const label=document.createElement('label');label.textContent=`型紙${i+1}の横幅 mm`;const input=document.createElement('input');input.id='width'+(i+1);input.type='number';input.min=1;input.max=10000;input.step=.1;input.value=state.sources[i].width||210;input.addEventListener('input',schedule);label.append(input);
  const name=document.createElement('p');name.textContent=state.sources[i].name;name.id='extraSourceName'+i;name.className='filename';box.append(name,label);$('extraSources').append(box);
 }
 for(const box of $('extraSources').children){const i=+box.dataset.sourceSlot;box.hidden=!state.sources[i];if(state.sources[i])$('extraSourceName'+i).textContent=state.sources[i].name;}
}
function pathD(path){return 'M'+path.start.x+','+path.start.y+path.segments.map(c=>(c.length===2?'L':c.length===3?'Q':'C')+c.slice(1).map(p=>p.x+','+p.y).join(' ')).join(' ');}
function detectParts(paths,units){
 const parent=paths.map((_,i)=>i),root=i=>parent[i]===i?i:parent[i]=root(parent[i]),tol=.001*units,cells=new Map();
 paths.forEach((path,i)=>{for(const p of [path.start,path.segments.at(-1).at(-1)]){
  const x=Math.floor(p.x/tol),y=Math.floor(p.y/tol);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of cells.get((x+dx)+','+(y+dy))||[])if(distance(p,other.p)<=tol)parent[root(i)]=root(other.i);
  const key=x+','+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push({p,i});
 }});
 const groups=new Map();paths.forEach((_,i)=>{const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
 const parts=[...groups.values()].map(indices=>{
  const points=indices.flatMap(i=>paths[i].segments.flat()),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const box=[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];
  const edges=indices.flatMap(i=>paths[i].segments.flatMap(c=>{const n=c.length===2?1:24;return Array.from({length:n},(_,k)=>[evaluate(c,k/n),evaluate(c,(k+1)/n)]);}));
  return {indices,box,edges};
 });
 function contains(part,p){let inside=false;for(const [a,b] of part.edges)if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;return inside;}
 const owners=parts.map((p,i)=>{const point=paths[p.indices[0]].segments[0],sample=evaluate(point,.5);let owner=i,area=Infinity;
  parts.forEach((q,j)=>{const [x,y,w,h]=q.box,[a,b,c,d]=p.box,size=w*h;if(i!==j&&size>c*d+tol*tol&&a>=x-tol&&b>=y-tol&&a+c<=x+w+tol&&b+d<=y+h+tol&&size<area&&contains(q,sample)){owner=j;area=size;}});return owner;});
 const result=new Map();parts.forEach((p,i)=>{let owner=i;while(owners[owner]!==owner)owner=owners[owner];if(!result.has(owner))result.set(owner,{indices:[],box:parts[owner].box});result.get(owner).indices.push(...p.indices);});
 return [...result.values()].map(p=>({...p,indices:p.indices.sort((a,b)=>a-b)}));
}
function partShift(source,pi){const o=state.partOffsets[source.id+':'+pi]||{x:0,y:0};return {x:o.x*source.scale,y:o.y*source.scale};}
function pathShift(i){const si=state.pathSources[i],source=state.sources[si];if(!source)return {x:0,y:0};const local=i-state.pathSources.indexOf(si);return partShift(source,source.parts.findIndex(p=>p.indices.includes(local)));}
function lineShift(name){return pathShift(+$('path'+name).value);}
function syncPartLayout(){
 let layer=$('partDrawing');if(!layer){layer=node('g',{id:'partDrawing','pointer-events':'none'},$('camera'));$('camera').insertBefore(layer,$('neighbors'));}layer.replaceChildren();
 const moved=Object.values(state.partOffsets).some(o=>o.x||o.y);$('drawing').style.display=moved?'none':'';
 if(moved)state.sources.forEach(source=>source.parts.forEach((part,pi)=>{const shift=partShift(source,pi),g=node('g',{transform:`translate(${source.tx+shift.x} ${source.ty+shift.y}) scale(${source.scale})`},layer);for(const i of part.indices)node('path',{d:pathD(source.paths[i]),fill:'none',stroke:'black','stroke-width':1,'vector-effect':'non-scaling-stroke'},g);}));
 const translate=(el,shift)=>el.setAttribute('transform',`translate(${shift.x} ${shift.y})`);
 for(const el of $('guides').children)translate(el,lineShift(el.dataset.line||'A'));
 for(const el of $('holes').children)translate(el,lineShift(el.dataset.hole?.[0]||'A'));
 for(const el of $('neighbors').children){const id=el.dataset.corner;if(id){const name=id.slice(-1),end=id.slice(0,-1),value=$('corner'+end+name).value;translate(el,pathShift(value==='auto'||value===''?state.autoWalls?.[end+name]:+value));}}
 for(const el of $('fixedHoles')?.children||[]){const key=el.dataset.part;if(key){const source=state.sources.find(s=>key.startsWith(s.id+':'));if(source)translate(el,partShift(source,+key.split(':')[1]));}}
 updateMarkerScale();
}
function focusPart(source,part){
 const pad=8*source.scale*source.box[2]/source.width;
 state.view=rotatedBox([part.box[0]*source.scale+source.tx-pad,part.box[1]*source.scale+source.ty-pad,Math.max(part.box[2]*source.scale,source.scale)+2*pad,Math.max(part.box[3]*source.scale,source.scale)+2*pad]);const shift=partShift(source,source.parts.indexOf(part)),v=new DOMPoint(shift.x,shift.y).matrixTransform(new DOMMatrix().rotate(state.rotation));state.view[0]+=v.x;state.view[1]+=v.y;applyView();
}
function renderLibrary(){
 if(!$('partCards'))return;const container=$('partCards'),scrollTop=container.scrollTop;container.replaceChildren();let total=0;
 state.sources.forEach((source,si)=>source.parts.forEach((part,pi)=>{
  total++;const key=source.id+':'+pi,done=state.completed.includes(key),count=state.fixed.filter(g=>g.rows.some(r=>r.sourceId===source.id&&r.partIndex===pi)).length;
  const card=document.createElement('div');card.dataset.key=key;card.className='part-card'+(done?' complete':'');const show=document.createElement('button');show.className='part-show';
  const svg=node('svg',{viewBox:[part.box[0]-2,part.box[1]-2,Math.max(1,part.box[2])+4,Math.max(1,part.box[3])+4].join(' '),'aria-hidden':'true'});
  for(const index of part.indices)node('path',{d:pathD(source.paths[index]),fill:'none',stroke:'#304a3b','stroke-width':1,'vector-effect':'non-scaling-stroke'},svg);
  show.append(svg,document.createTextNode(`型紙${si+1}・パーツ${pi+1}　${done?'完了':count?count+'配置済み':'未配置'}`));
  show.onclick=()=>{focusPart(source,part);checkpoint();message(`型紙${si+1}・パーツ${pi+1}を表示。1辺モードまたは組み合わせモードで辺をタップしてください。`);};
  const complete=document.createElement('button');complete.textContent=done?'完了を戻す':'完了にする';complete.onclick=()=>{state.completed=done?state.completed.filter(v=>v!==key):[...state.completed,key];calculate();};card.append(show,complete);const move=document.createElement('button');move.textContent='図でこのパーツを移動';move.onclick=()=>{state.movingPart=key;focusPart(source,part);$('mode').value='partMove';message('このパーツを1本指でドラッグして移動。2本指で視点の回転・ズームができます。');};card.append(move);container.append(card);
 }));
 container.scrollTop=scrollTop;
 $('librarySummary').textContent=`${state.sources.length} SVG ／ ${total}パーツ ／ ${state.completed.length}パーツ完了`;
}
let sourceRequest=0;
function importStatus(text,error=false){const el=$('importStatus');el.hidden=false;el.textContent=text;el.className=error?'import-error':'hint';message(text);}
async function readSVGFile(file){
 if(file.size>2e6)throw Error('SVGは1枚2MB以内にしてください。');
 if(typeof file.text==='function')return file.text();
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('ファイルを読み取れません。端末の「ファイル」に保存して選び直してください。'));reader.readAsText(file);});
}
async function importBatch(files){
 if(!files.length)return;const replaceSample=state.sources.length===1&&state.sources[0].name==='原本サンプル'&&!state.fixed.length;
 if((replaceSample?0:state.sources.length)+files.length>32)throw Error('SVGは32ファイルまで追加できます。');
 const loaded=[];for(const file of files){if(file.size>2e6)throw Error(`${file.name}：1枚2MB以内にしてください。`);const s=readSource(await readSVGFile(file),file.name);s.width=suggestedWidth(s)||210;if(s.width<1||s.width>10000||!Number.isFinite(s.width))s.width=210;loaded.push(s);}
 const old=[...state.sources],owners=[...state.pathSources],values=savedLineValues();if(replaceSample){state.sources=[];state.completed=[];}const start=state.sources.length;state.sources.push(...loaded);ensureSourceControls();state.sources.forEach((s,i)=>{if(i>=start)widthControl(i).value=s.width;});
 rebuildScene(true);populateChoices();if(replaceSample){resetLine('A',0);resetLine('B',Math.min(1,state.paths.length-1));resetLine('C',Math.min(2,state.paths.length-1));}else remapSelections(values,owners,old);
 $('sourceFiles').open=false;focusPart(state.sources[start],state.sources[start].parts[0]);calculate();message(`${files.length}個のSVGを追加しました。パーツ一覧の図を押して拡大・編集できます。`);
}
$('batchFiles').onchange=async e=>{const files=[...e.target.files];if(!files.length)return;++sourceRequest;importStatus(`${files.length}個のSVGを読込中…`);try{await importBatch(files);importStatus(`${files.map(f=>f.name).join('、')}：読込完了。パーツ一覧から選べます。`);}catch(err){importStatus(`読込できませんでした：${err.message}`,true);}finally{e.target.value='';}};
function suggestedWidth(source){
 const physical=(source.doc.documentElement.getAttribute('width')||'').match(/^\s*([\d.]+)\s*(mm|cm|in)\s*$/i);
 if(physical)return +physical[1]*({mm:1,cm:10,in:25.4}[physical[2].toLowerCase()]);
 const ratio=source.box[2]/source.box[3];if(Math.abs(ratio-297/210)<.005)return 297;if(Math.abs(ratio-210/297)<.005)return 210;return null;
}
function readSource(text,name){
 const doc=new DOMParser().parseFromString(text,'image/svg+xml'),{box,paths}=validateDocument(doc);
 const parts=detectParts(paths,box[2]/210);let inside=Array(paths.length).fill(null),insideError='内側を判定できません。右／左を手動で選んでください。';
 for(const part of parts){
  let indices=[...part.indices],changed=true;
  while(changed){changed=false;const counts=new Map(),key=p=>Math.round(p.x/(box[2]/210*.000001))+','+Math.round(p.y/(box[2]/210*.000001));
   for(const i of indices)for(const point of [paths[i].start,paths[i].segments.at(-1).at(-1)])counts.set(key(point),(counts.get(key(point))||0)+1);
   const next=indices.filter(i=>counts.get(key(paths[i].start))>=2&&counts.get(key(paths[i].segments.at(-1).at(-1)))>=2);changed=next.length!==indices.length;indices=next;
  }
  try{const sides=interiorSides(indices.map(i=>paths[i]),box[2]/210);indices.forEach((i,k)=>inside[i]=sides[k]);}catch(e){insideError=e.message;}
 }
 return {doc,text,name,box,paths,inside,insideError,parts,id:++sourceSequence};
}
function rebuildScene(force=false){
 if(!state.sources.length)return;
 const widths=state.sources.map((s,i)=>{const id=i?'width'+(i+1):'width',value=$(id).valueAsNumber;return force&&(!Number.isFinite(value)||value<1||value>10000)?s.width||210:number(id,1,10000);}),key=JSON.stringify(widths);
 if(!force&&state.layoutKey===key)return;state.layoutKey=key;
 const first=state.sources[0],units=first.box[2]/widths[0],drawing=$('drawing');
 state.doc=first.doc;state.sourceText=first.text;state.sourceLabel=first.name;
 state.paths=[];state.pathSources=[];state.inside=[];state.cache.clear();drawing.replaceChildren();drawing.removeAttribute('style');
 let right=first.box[0],height=0;
 state.sources.forEach((source,i)=>{
  source.width=widths[i];source.scale=units*widths[i]/source.box[2];
  source.tx=right-source.box[0]*source.scale;source.ty=first.box[1]-source.box[1]*source.scale;
  const map=p=>({x:p.x*source.scale+source.tx,y:p.y*source.scale+source.ty});
  source.paths.forEach((p,j)=>{state.paths.push({...p,start:map(p.start),segments:p.segments.map(c=>c.map(map))});state.pathSources.push(i);state.inside.push(source.inside?.[j]||null);});
  const group=node('g',{'data-source':i,transform:`translate(${source.tx} ${source.ty}) scale(${source.scale})`},drawing);
  // A nested SVG preserves root presentation attributes in the preview as well as export.
  const svg=document.importNode(source.doc.documentElement,true);svg.setAttribute('x',source.box[0]);svg.setAttribute('y',source.box[1]);svg.setAttribute('width',source.box[2]);svg.setAttribute('height',source.box[3]);group.append(svg);
  right+=source.box[2]*source.scale+(i<state.sources.length-1?20*units:0);height=Math.max(height,source.box[3]*source.scale);
 });
 state.base=[first.box[0],first.box[1],right-first.box[0],height];
 if(force){state.view=rotatedBox(state.base);applyView();}
 $('sourceName').textContent=state.sources.map((s,i)=>`型紙${i+1}：${s.name}`).join(' ／ ');
 $('firstSourceName').textContent=state.sources[0].name;
 $('secondSourceName').textContent=state.sources[1]?.name||'';
 $('secondSource').hidden=!state.sources[1];$('removeSecond').disabled=!state.sources[1];
 $('thirdSourceName').textContent=state.sources[2]?.name||'';$('thirdSource').hidden=!state.sources[2];$('removeThird').disabled=!state.sources[2];$('file3').disabled=!state.sources[1];
 const exportValue=$('exportSource').value;$('exportSource').replaceChildren(...Array.from({length:Math.max(3,state.sources.length)},(_,i)=>{const o=new Option('型紙'+(i+1)+(state.sources[i]?' · '+state.sources[i].name:''),String(i));o.disabled=!state.sources[i];return o;}));$('exportSource').value=+exportValue<state.sources.length?exportValue:'0';$('exportSource').disabled=state.sources.length===1;renderLibrary();
 if(+$('exportSource').value>=state.sources.length)$('exportSource').value='0';
 if(!state.sources[1])$('exportSource').value='0';
}
function pathLabel(i){const source=state.pathSources[i],local=i-state.pathSources.indexOf(source),part=state.sources[source].parts.findIndex(p=>p.indices.includes(local));return `${state.sources.length>1?'型紙'+(source+1)+' · ':''}パーツ${part+1} · カット線 ${local+1}`;}
function populateChoices(){
 for(const name of lineNames){
  const select=$('path'+name);select.replaceChildren();state.paths.forEach((_,i)=>select.append(new Option(pathLabel(i),String(i))));
  for(const end of ['start','end']){
   const corners=$('corner'+end+name);corners.replaceChildren(new Option('揃えない',''),new Option('壁から3mmに自動調整','auto'));
   state.paths.forEach((_,i)=>corners.append(new Option(pathLabel(i),String(i))));
  }
 }
}
function resetLine(name,index){
 $('path'+name).value=index;$('side'+name).value='auto';$('start'+name).value=0;$('end'+name).value=100;
 for(const end of ['start','end']){$('insetMode'+end+name).value='offset';$('corner'+end+name).value='';$('cornerSide'+end+name).value='auto';}syncRanges(name);
}
function savedLineValues(){return fields().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value]);}
function restoreLineValues(values){for(const [id,value] of values)if(/^(path|side|start|end|corner|snap|offset|inset)/.test(id)){const e=$(id);if(e.type==='checkbox')e.checked=value;else e.value=value;}}
function remapSelections(values,oldOwners,oldSources,replaced=-1,removed=-1){
 restoreLineValues(values);
 const starts=oldSources.map((_,i)=>oldOwners.indexOf(i));
 const remap=index=>{let owner=oldOwners[index];if(owner===undefined||owner===removed||owner===replaced)return null;const local=index-starts[owner];if(removed>=0&&owner>removed)owner--;const first=state.pathSources.indexOf(owner);return first>=0&&local<state.sources[owner].paths.length?first+local:null;};
 for(const name of lineNames){
  const previousIndex=+values.find(([id])=>id==='path'+name)[1],next=remap(previousIndex);
  if(next===null)resetLine(name,name==='A'&&replaced>0?0:Math.max(0,Math.min(name==='A'?5:name==='B'?6:7,state.paths.length-1)));
  else{
   $('path'+name).value=next;
   for(const end of ['start','end']){const id='corner'+end+name,value=values.find(([k])=>k===id)[1];$(id).value=value===''||value==='auto'?value:remap(+value)??'';}
  }syncRanges(name);
 }
}
export function loadSVG(text,name='SVG',slot=0){
 if(!Number.isInteger(slot)||slot<0||slot>31)throw Error('SVGは32ファイルまでです。');
 if(slot>0&&!state.sources[slot-1])throw Error(`先に型紙${slot}を読み込んでください。`);
 if(state.sources[slot]&&state.fixed.some(g=>g.rows.some(r=>r.sourceId===state.sources[slot].id)))throw Error('この型紙には固定済みの針穴があります。固定を外してから型紙を交換してください。');
 const source=readSource(text,name),oldSources=[...state.sources],oldOwners=[...state.pathSources],values=savedLineValues();
 if(state.sources[slot])state.completed=state.completed.filter(k=>!k.startsWith(state.sources[slot].id+':'));state.sources[slot]=source;ensureSourceControls();
 const physicalWidth=suggestedWidth(source);if(physicalWidth>=1&&physicalWidth<=10000)widthControl(slot).value=physicalWidth;
 for(const id of ['width','width2','width3'])if(!Number.isFinite($(id).valueAsNumber)||$(id).valueAsNumber<1||$(id).valueAsNumber>10000)$(id).value=210;
 ensureSourceControls();rebuildScene(true);populateChoices();remapSelections(values,oldOwners,oldSources,slot);
 if(slot===0&&!oldSources[1]){resetLine('A',Math.max(0,Math.min(5,source.paths.length-2)));resetLine('B',Math.min(6,source.paths.length-1));}
 if(slot>0&&slot<3)resetLine(lineNames[slot],state.pathSources.indexOf(slot));
 if(slot===0&&oldSources.length===1&&activeNames().length===3&&source.paths.length>=3)resetLine('C',2);
 calculate();message('辺A・Bを選択。前半・後半につなぐ場合は「1つの辺 ↔ 2つの辺」に切り替え、Cも選んでください。');
}
export const loadSecondSVG=(text,name='SVG 2')=>loadSVG(text,name,1);
export const loadThirdSVG=(text,name='SVG 3')=>loadSVG(text,name,2);
function removeSource(slot){
 if(state.fixed.some(g=>g.rows.some(r=>r.sourceId===state.sources[slot]?.id))){message('固定済みの針穴を外してから型紙を外してください。');return;}
 const oldSources=[...state.sources],oldOwners=[...state.pathSources],values=savedLineValues();
 state.completed=state.completed.filter(k=>!k.startsWith(state.sources[slot].id+':'));state.sources.splice(slot,1);state.sources.forEach((s,i)=>{if(i>=slot)widthControl(i).value=s.width;});
 ensureSourceControls();rebuildScene(true);populateChoices();remapSelections(values,oldOwners,oldSources,-1,slot);
 calculate();message(`型紙${slot+1}を外しました。↶で元に戻せます。`);
}
$('removeSecond').onclick=()=>removeSource(1);$('removeThird').onclick=()=>removeSource(2);
async function sample(){const request=++sourceRequest;try{const r=await fetch('assets/source/名称未設定 3.svg');if(!r.ok)throw Error('サンプルを読み込めません。');const text=await r.text();if(request!==sourceRequest)return;loadSVG(text,'原本サンプル');$('boot').textContent='操作の準備ができました';}catch(e){if(request!==sourceRequest)return;message(e.message);$('boot').textContent='起動に失敗しました。SafariでWebページとして開いてください。';}}
$('sample').onclick=sample;
for(const [id,slot] of [['file',0],['file2',1],['file3',2]])$(id).onchange=async e=>{const file=e.target.files[0];if(!file)return;++sourceRequest;importStatus(`${file.name}：読込中…`);try{loadSVG(await readSVGFile(file),file.name,slot);importStatus(`${file.name}：読込完了。型紙${slot+1}へ反映しました。`);$('boot').textContent='操作の準備ができました';}catch(err){importStatus(`${file.name}：読込できませんでした。${err.message}`,true);}finally{e.target.value='';}};
function updateMarkerScale(){
 const ctm=$('canvas').getScreenCTM();if(!ctm)return;
 const scale=Math.hypot(ctm.a,ctm.b);if(!Number.isFinite(scale)||scale<=0)return;
 for(const marker of $('markers').children)marker.setAttribute('transform',`translate(${+marker.dataset.x+lineShift(marker.dataset.endpoint?.slice(-1)||'A').x} ${+marker.dataset.y+lineShift(marker.dataset.endpoint?.slice(-1)||'A').y}) scale(${1/scale})`);
}
function applyView(){$('camera').setAttribute('transform',`rotate(${state.rotation})`);$('rotationLabel').textContent=`表示 ${Math.round(state.rotation)}°`;$('canvas').setAttribute('viewBox',state.view.join(' '));updateMarkerScale();}
new ResizeObserver(updateMarkerScale).observe($('canvas'));
function viewLocal(x,y){return new DOMPoint(x,y).matrixTransform($('canvas').getScreenCTM().inverse());}
function local(x,y){return new DOMPoint(x,y).matrixTransform($('camera').getScreenCTM().inverse());}
function rotatedBox(box,angle=state.rotation){const m=new DOMMatrix().rotate(angle),[x,y,w,h]=box,ps=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([a,b])=>new DOMPoint(a,b).matrixTransform(m));const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);return [Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];}
for(const [id,delta] of [['rotateLeft',-90],['rotateRight',90]])$(id).onclick=()=>{state.rotation=(state.rotation+delta+360)%360;state.view=rotatedBox(state.view,delta);applyView();checkpoint();};
function zoom(factor,x,y){
 const before=viewLocal(x,y),v=state.view,w=Math.max(state.base[2]/40,Math.min(state.base[2]*4,v[2]/factor)),ratio=w/v[2];
 state.view=[before.x+(v[0]-before.x)*ratio,before.y+(v[1]-before.y)*ratio,w,v[3]*ratio];applyView();
}
for(const [id,f] of [['plus',1.4],['minus',1/1.4]])$(id).onclick=()=>{const r=$('canvas').getBoundingClientRect();zoom(f,r.x+r.width/2,r.y+r.height/2);checkpoint();};
$('fit').onclick=()=>{const boxes=state.sources.flatMap(s=>s.parts.map((p,i)=>{const d=partShift(s,i);return [p.box[0]*s.scale+s.tx+d.x,p.box[1]*s.scale+s.ty+d.y,p.box[2]*s.scale,p.box[3]*s.scale];}));const x=Math.min(...boxes.map(b=>b[0])),y=Math.min(...boxes.map(b=>b[1]));state.view=rotatedBox([x,y,Math.max(...boxes.map(b=>b[0]+b[2]))-x,Math.max(...boxes.map(b=>b[1]+b[3]))-y]);applyView();checkpoint();};
$('mode').onchange=()=>{renderCornerSelections();$('modeHint').textContent=`現在のモード：${$('mode').selectedOptions[0].textContent} ／ 編集対象：${$('active').value}。ドラッグで上下左右に移動、2本指で拡大・移動。タップで選択・端点指定。`};$('active').onchange=$('mode').onchange;
function renderCornerSelections(){
 const group=$('neighbors');group.replaceChildren();if(!state.doc)return;
 for(const name of activeNames())for(const end of ['start','end']){
  const value=$('corner'+end+name).value;if(value===''&&state.autoWalls?.[end+name]===undefined)continue;
  const index=value==='auto'||value===''?state.autoWalls?.[end+name]:+value;const path=state.paths[index];if(!path)continue;
  const d='M'+path.start.x+','+path.start.y+path.segments.map(c=>(c.length===2?'L':c.length===3?'Q':'C')+c.slice(1).map(p=>p.x+','+p.y).join(' ')).join(' ');
  const mark=node('path',{d,fill:'none',stroke:colors[name],'stroke-width':5,'stroke-opacity':.65,'vector-effect':'non-scaling-stroke','stroke-dasharray':end==='end'?'8 4':'none','data-corner':end+name},group);
  node('title',{},mark).textContent=`線${name}の${end==='start'?'始点':'終点'}の隣辺`;
 }
}
function nearest(points,p){let best={d:Infinity,s:0};for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,f=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),q={x:a.x+dx*f,y:a.y+dy*f},d=distance(q,p);if(d<best.d)best={d,s:a.s+(b.s-a.s)*f};}return best;}
function hit(x,y){
 const mode=$('mode').value;if(mode==='pan'||mode==='partMove'||!state.doc)return;
 const p=local(x,y),q=local(x+28,y),limit=distance(p,q),units=state.sources[0].box[2]/number('width',1,10000);
 const corner=mode==='cornerstart'||mode==='cornerend';
 const candidates=lineNames.includes(mode)||corner?state.paths.map((_,i)=>i).filter(i=>!corner||(i!==+$('path'+$('active').value).value&&state.pathSources[i]===state.pathSources[+$('path'+$('active').value).value])):[+$('path'+$('active').value).value];
 let best={d:Infinity};
 for(const i of candidates){const key=i+':'+units;if(!state.cache.has(key))state.cache.set(key,prepare(state.paths[i],units));const prep=state.cache.get(key);let passed=0;for(const table of prep.tables){const shift=pathShift(i),match=nearest(table.points,{x:p.x-shift.x,y:p.y-shift.y});if(match.d<best.d)best={d:match.d,index:i,percent:100*(passed+match.s)/prep.total};passed+=table.len;}}
 if(best.d>limit){message('線の近くをタップしてください。番号リストからも選択できます。');return;}
 if(corner){const name=$('active').value;$(mode+name).value=best.index;calculate();message($('warning').textContent||`線${name}の${mode==='cornerstart'?'始点':'終点'}の隣辺を選びました。図の太い線で確認できます。別の辺をタップすると変更できます。`);}
 else if(lineNames.includes(mode)){$('path'+mode).value=best.index;$('path'+mode).onchange();$('active').value=mode;message($('warning').textContent||`線${mode}にカット線${best.index+1}を選びました。`);}
 else{const name=$('active').value;$(mode+name).value=best.percent.toFixed(1);syncRanges(name);calculate();message(`線${name}の${mode==='start'?'始点':'終点'}を変更しました。`);}
}
document.querySelector('.view-tools').addEventListener('pointerdown',e=>e.stopPropagation());
$('expandView').addEventListener('pointerdown',e=>e.stopPropagation());
function expandView(expanded){document.body.classList.toggle('expanded-view',expanded);$('expandView').textContent=expanded?'設定に戻る':'図を広げる';$('expandView').setAttribute('aria-pressed',String(expanded));document.querySelector('aside').inert=expanded;}
$('expandView').onclick=()=>expandView(!document.body.classList.contains('expanded-view'));
document.addEventListener('keydown',e=>{if(e.key==='Escape')expandView(false);});
const pointers=new Map();let gesture=null,multi=false;
const pinch=()=>{const a=[...pointers.values()];return a.length<2?null:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,angle:Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x),d:Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y))};};
$('stage').onpointerdown=e=>{if(e.pointerType==='mouse'&&e.button!==0)return;$('stage').setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false});if(pointers.size===2){multi=true;const g=pinch();gesture={...g,view:[...state.view],rotation:state.rotation,anchor:local(g.x,g.y)};}};
$('stage').onpointermove=e=>{
 const p=pointers.get(e.pointerId);if(!p)return;const oldPoint=local(p.x,p.y),before=viewLocal(p.x,p.y);p.x=e.clientX;p.y=e.clientY;p.moved ||=Math.hypot(p.x-p.sx,p.y-p.sy)>6;
 if(pointers.size>1){const next=pinch();if(gesture){
  const width=Math.max(state.base[2]/40,Math.min(state.base[2]*4,gesture.view[2]*gesture.d/next.d)),ratio=width/gesture.view[2];
  state.rotation=gesture.rotation+(next.angle-gesture.angle)*180/Math.PI;
  const anchor=new DOMPoint(gesture.anchor.x,gesture.anchor.y).matrixTransform(new DOMMatrix().rotate(state.rotation));
  state.view=[gesture.view[0],gesture.view[1],width,gesture.view[3]*ratio];applyView();
  const now=viewLocal(next.x,next.y);state.view[0]+=anchor.x-now.x;state.view[1]+=anchor.y-now.y;applyView();
 }}
 else if(p.moved&&$('mode').value==='partMove'&&state.movingPart){const source=state.sources.find(s=>state.movingPart.startsWith(s.id+':'));if(source){const now=local(p.x,p.y),offset=state.partOffsets[state.movingPart]||{x:0,y:0};state.partOffsets[state.movingPart]={x:offset.x+(now.x-oldPoint.x)/source.scale,y:offset.y+(now.y-oldPoint.y)/source.scale};syncPartLayout();}}
 else if(p.moved){const now=viewLocal(p.x,p.y);state.view[0]+=before.x-now.x;state.view[1]+=before.y-now.y;applyView();}
};
function endPointer(e,cancel=false){const p=pointers.get(e.pointerId);if(!p)return;if(!cancel&&!multi&&!p.moved)try{hit(e.clientX,e.clientY);}catch(err){message(err.message);}pointers.delete(e.pointerId);gesture=null;if(pointers.size>=2){const g=pinch();gesture={...g,view:[...state.view],rotation:state.rotation,anchor:local(g.x,g.y)};}for(const remaining of pointers.values()){remaining.sx=remaining.x;remaining.sy=remaining.y;if(multi)remaining.moved=true;}if(!pointers.size){multi=false;checkpoint();}}
$('stage').onpointerup=e=>endPointer(e);$('stage').onpointercancel=e=>endPointer(e,true);$('stage').onlostpointercapture=e=>endPointer(e,true);
export function exportSVG(sourceIndex=0){
 if(!state.latest&&!state.fixed.length)throw Error('条件を満たす配置を作成してください。');
 const source=state.sources[sourceIndex];if(!source)throw Error('保存する型紙を選んでください。');
 const units=source.box[2]/source.width,width=source.width,doc=source.doc.cloneNode(true),root=doc.documentElement;
 root.setAttribute('width',width+'mm');root.setAttribute('height',(source.box[3]/units)+'mm');
 const g=doc.createElementNS(NS,'g');let id='stitch_holes',suffix=1;while(root.querySelector(`[id="${id}"]`))id='stitch_holes_'+suffix++;g.setAttribute('id',id);g.setAttribute('fill','none');g.setAttribute('stroke','black');g.setAttribute('stroke-width',.08*units);root.append(g);
 const seen=new Set();
 function appendHole(p,r,label){const key=[p.x.toFixed(6),p.y.toFixed(6),r.toFixed(6)].join(':');if(seen.has(key))return;seen.add(key);const c=doc.createElementNS(NS,'circle');for(const [k,v] of Object.entries({cx:p.x.toFixed(6),cy:p.y.toFixed(6),r:r.toFixed(6),'data-hole':label}))c.setAttribute(k,v);g.append(c);}
 state.fixed.forEach((set,k)=>set.rows.filter(r=>r.sourceId===source.id).forEach(row=>row.holes.forEach((p,i)=>appendHole(p,row.radius,`S${k+1}_${row.name}_${i+1}`))));
 if(state.latest&&draftSignature()!==state.committedSignature)state.latest.result.rows.forEach((row,j)=>{if(state.latest.rowSources[j]!==sourceIndex)return;row.holes.forEach((p,i)=>appendHole({x:(p.x-source.tx)/source.scale,y:(p.y-source.ty)/source.scale},state.latest.diameter*units/2,`${lineNames[j]}_${String(i+1).padStart(2,'0')}`));});
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(root);
}
function draftSignature(){return JSON.stringify({sources:state.sources.map(s=>s.id),values:fields().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])});}
function renderFixed(){
 renderLibrary();
 let layer=$('fixedHoles');if(!layer){layer=node('g',{id:'fixedHoles','pointer-events':'none'},$('camera'));$('camera').insertBefore(layer,$('holes'));}layer.replaceChildren();
 $('fixedList').replaceChildren();$('fixedSummary').textContent=state.fixed.length?`${state.fixed.length}件の配置を固定済み。次の辺を選んで続けられます。`:'配置を固定すると、次の編集をしても針穴が残ります。';
 state.sources.forEach((s,i)=>{const locked=state.fixed.some(g=>g.rows.some(r=>r.sourceId===s.id));$(i?'width'+(i+1):'width').disabled=locked;if($(i?'file'+(i+1):'file'))$(i?'file'+(i+1):'file').disabled=locked;if(i===0)$('sample').disabled=locked;});
 state.fixed.forEach((set,index)=>{
  for(const row of set.rows){const source=state.sources.find(s=>s.id===row.sourceId);if(!source)continue;for(const points of row.guides||[])node('path',{d:points.map((p,i)=>`${i?'L':'M'}${p.x*source.scale+source.tx},${p.y*source.scale+source.ty}`).join(' '),fill:'none',stroke:['#3b7759','#8564a7','#b77735','#397b91'][index%4],'stroke-width':2,'stroke-dasharray':'6 4','vector-effect':'non-scaling-stroke','data-fixed-set':index+1,'data-part':row.sourceId+':'+row.partIndex,'data-fixed-edge':row.name},layer);row.holes.forEach(p=>node('circle',{cx:p.x*source.scale+source.tx,cy:p.y*source.scale+source.ty,r:row.radius*source.scale,'data-part':row.sourceId+':'+row.partIndex,fill:'#375c48','fill-opacity':.7,stroke:'white','stroke-width':.7,'vector-effect':'non-scaling-stroke'},layer));}
  const line=document.createElement('div');line.className='result';const label=document.createElement('span');label.textContent=`配置${index+1} · ${set.label} · ${set.rows.map(r=>r.holes.length).join(' / ')}穴 `;const remove=document.createElement('button');remove.textContent='固定を外す';remove.onclick=()=>{state.fixed.splice(index,1);calculate();};line.append(label,remove);$('fixedList').append(line);
 });
}
$('fixSet').onclick=()=>{
 calculate();if(!state.latest||draftSignature()===state.committedSignature)return;
 const latest=state.latest;const rows=latest.result.rows.map((row,j)=>{const source=state.sources[latest.rowSources[j]];const local=+$('path'+lineNames[j]).value-state.pathSources.indexOf(latest.rowSources[j]);const guides=(j===0&&latest.result.parts?latest.result.parts:[latest.lines[j]]).map(l=>l.points.map(p=>({x:(p.x-source.tx)/source.scale,y:(p.y-source.ty)/source.scale})));return {sourceId:source.id,partIndex:source.parts.findIndex(p=>p.indices.includes(local)),guides,name:lineNames[j],radius:latest.diameter*source.box[2]/source.width/2,holes:row.holes.map(p=>({x:(p.x-source.tx)/source.scale,y:(p.y-source.ty)/source.scale}))};});
 state.fixed.push({rows,label:$('seamMode').selectedOptions[0].textContent});state.committedSignature=draftSignature();calculate();message('この配置を固定しました。次の辺を選んで続けてください。');
};
$('singleModeButton').onclick=()=>{$('seamMode').value='single';calculate();message('1辺だけに配置します。パーツや辺Aを選んでください。');};
$('pairModeButton').onclick=()=>{$('seamMode').value='pair';calculate();message('辺A・Bの組み合わせに配置します。');};
function printParts(){
 const items=[];
 state.sources.forEach((source,si)=>source.parts.forEach((part,pi)=>{
  const holes=[];
  state.fixed.forEach(set=>set.rows.filter(r=>r.sourceId===source.id&&r.partIndex===pi).forEach(row=>row.holes.forEach(p=>holes.push({...p,r:row.radius}))));
  if(state.latest&&draftSignature()!==state.committedSignature)state.latest.result.rows.forEach((row,j)=>{const index=+$('path'+lineNames[j]).value-state.pathSources.indexOf(si);if(state.latest.rowSources[j]!==si||!part.indices.includes(index))return;row.holes.forEach(p=>holes.push({x:(p.x-source.tx)/source.scale,y:(p.y-source.ty)/source.scale,r:state.latest.diameter*source.box[2]/source.width/2}));});
  const mm=source.width/source.box[2],pad=1/mm;
  const minX=Math.min(part.box[0],...holes.map(p=>p.x-p.r))-pad,minY=Math.min(part.box[1],...holes.map(p=>p.y-p.r))-pad;
  const maxX=Math.max(part.box[0]+part.box[2],...holes.map(p=>p.x+p.r))+pad,maxY=Math.max(part.box[1]+part.box[3],...holes.map(p=>p.y+p.r))+pad;
  items.push({source,part,holes,mm,box:[minX,minY,maxX-minX,maxY-minY],w:(maxX-minX)*mm,h:(maxY-minY)*mm,label:`型紙${si+1} パーツ${pi+1} · ${source.name}`});
 }));return items;
}
function buildPrintDocument(){
 const items=printParts(),pages=[];let page=null,x=0,y=0,rowHeight=0;
 const newPage=()=>{if(pages.length>=500)throw Error('500ページを超えます。SVGの横幅mmを確認してください。');page=[];pages.push(page);x=0;y=0;rowHeight=0;};
 for(const item of [...items].sort((a,b)=>b.h-a.h)){
  const rotated=item.w>190&&item.w<=255&&item.h<=190,w=rotated?item.h:item.w,h=rotated?item.w:item.h;
  if(w>190||h>255){
   const cols=Math.max(1,Math.ceil((item.w-10)/180)),rows=Math.max(1,Math.ceil((item.h-10)/245));
   if(pages.length+cols*rows>500)throw Error('500ページを超えます。SVGの横幅mmを確認してください。');
   for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)pages.push([{item,x:0,y:0,w:190,h:255,box:[item.box[0]+c*180/item.mm,item.box[1]+r*245/item.mm,190/item.mm,255/item.mm],tile:`分割 ${r+1}/${rows}行・${c+1}/${cols}列（重なり10mm）`}]);
   page=null;continue;
  }
  if(!page)newPage();if(x+w>190+.00001){x=0;y+=rowHeight+4;rowHeight=0;}
  if(y+h+5>260+.00001)newPage();
  page.push({item,x,y,w,h,rotated,box:item.box});x+=w+4;rowHeight=Math.max(rowHeight,h+5);
 }
 const doc=document.implementation.createHTMLDocument('A4実寸型紙');doc.documentElement.lang='ja';
 const style=doc.createElement('style');style.textContent='@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif}.controls{padding:16px;background:#edf2e7}button{font:inherit;padding:10px}.sheet{width:210mm;height:297mm;position:relative;break-after:page;page-break-after:always;overflow:hidden;background:white}.sheet:last-child{break-after:auto;page-break-after:auto}.heading{position:absolute;left:10mm;top:4mm;font-size:3mm}.art{position:absolute;left:10mm;top:15mm;width:190mm;height:260mm}.ruler{position:absolute;left:10mm;bottom:4mm;width:60mm;height:8mm}@media screen{body{background:#ddd}.sheet{margin:12px auto;box-shadow:0 1px 6px #999}}@media print{.controls{display:none}.sheet{margin:0;box-shadow:none}}';doc.head.append(style);
 const controls=doc.createElement('div');controls.className='controls';controls.textContent=`${pages.length}枚のA4。倍率100%・用紙A4・余白なし・ヘッダー/フッターなしで印刷してください。用紙に合わせる縮小はOFF。まず50mm目盛りを実測してください。幅が未校正のSVGは実寸未確認です。 `;
 const button=doc.createElement('button');button.textContent='印刷／PDFとして保存';button.setAttribute('onclick','window.print()');controls.append(button);doc.body.append(controls);
 pages.forEach((placements,index)=>{
  const sheet=doc.createElement('section');sheet.className='sheet';const heading=doc.createElement('div');heading.className='heading';heading.textContent=`A4 ${index+1}/${pages.length} · 実寸100%${placements[0]?.tile?' · '+placements[0].tile:''}`;sheet.append(heading);
  const svg=doc.createElementNS(NS,'svg');svg.classList.add('art');svg.setAttribute('viewBox','0 0 190 260');sheet.append(svg);
  for(const placement of placements){const {item}=placement;const label=node('text',{x:placement.x,y:placement.y+3,'font-size':2.5},svg);label.textContent=item.label;
   const parent=placement.rotated?node('g',{transform:`translate(${placement.x+placement.w} ${placement.y+5}) rotate(90)`},svg):svg;
   const partSvg=node('svg',{x:placement.rotated?0:placement.x,y:placement.rotated?0:placement.y+5,width:placement.rotated?item.w:placement.w,height:placement.rotated?item.h:placement.h,viewBox:placement.box.join(' '),overflow:'hidden'},parent);
   for(const i of item.part.indices)node('path',{d:pathD(item.source.paths[i]),fill:'none',stroke:'black','stroke-width':.15/item.mm},partSvg);
   const seen=new Set();for(const p of item.holes){const key=[p.x,p.y,p.r].map(v=>v.toFixed(6)).join(':');if(seen.has(key))continue;seen.add(key);node('circle',{cx:p.x,cy:p.y,r:p.r,fill:'none',stroke:'black','stroke-width':.1/item.mm},partSvg);}
  }
  const ruler=doc.createElementNS(NS,'svg');ruler.classList.add('ruler');ruler.setAttribute('viewBox','0 0 60 8');node('path',{d:'M0 2V5M0 4H50M50 2V5',stroke:'black','stroke-width':.2,fill:'none'},ruler);node('text',{x:15,y:7.5,'font-size':2.5},ruler).textContent='この長さが50mm';sheet.append(ruler);doc.body.append(sheet);
 });
 return {html:'<!doctype html>'+doc.documentElement.outerHTML,pages,items};
}
$('printA4').onclick=()=>{const popup=window.open('','_blank');if(!popup){message('印刷画面を開けません。ポップアップを許可してください。');return;}try{calculate();const result=buildPrintDocument();popup.document.open();popup.document.write(result.html);popup.document.close();}catch(e){popup.close();message(e.message);}};
function file(){const index=+$('exportSource').value;return new File([exportSVG(index)],state.sources.length>1?`型紙${index+1}_${state.sources[index].name.replace(/\.svg$/i,'')}_針穴.svg`:'針穴配置済み.svg',{type:'image/svg+xml'});}
// Uncompressed UTF-8 ZIP, written locally without uploading the imported SVGs.
function zipSVGs(){
 const encoder=new TextEncoder(),chunks=[],directory=[];let offset=0;
 function header(size,signature){const bytes=new Uint8Array(size),v=new DataView(bytes.buffer);v.setUint32(0,signature,true);return {bytes,v};}
 state.sources.forEach((source,index)=>{
  const name=encoder.encode(`型紙${index+1}_${source.name.replace(/[\/\\]/g,'_').replace(/\.svg$/i,'')}_針穴.svg`),data=encoder.encode(exportSVG(index));let crc=0xffffffff;for(const b of data){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const h=header(30,0x04034b50);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint32(14,crc,true);h.v.setUint32(18,data.length,true);h.v.setUint32(22,data.length,true);h.v.setUint16(26,name.length,true);chunks.push(h.bytes,name,data);
  const c=header(46,0x02014b50);c.v.setUint16(4,20,true);c.v.setUint16(6,20,true);c.v.setUint16(8,0x800,true);c.v.setUint32(16,crc,true);c.v.setUint32(20,data.length,true);c.v.setUint32(24,data.length,true);c.v.setUint16(28,name.length,true);c.v.setUint32(42,offset,true);directory.push(c.bytes,name);offset+=30+name.length+data.length;
 });
 const size=directory.reduce((n,b)=>n+b.length,0),end=header(22,0x06054b50);end.v.setUint16(8,state.sources.length,true);end.v.setUint16(10,state.sources.length,true);end.v.setUint32(12,size,true);end.v.setUint32(16,offset,true);
 return new File([...chunks,...directory,end.bytes],'針穴配置済み_全SVG.zip',{type:'application/zip'});
}
$('saveAll').onclick=()=>{try{calculate();const f=zipSVGs(),url=URL.createObjectURL(f),a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);message('全SVGをZIPにまとめました。');}catch(e){message(e.message);}};
$('save').onclick=()=>{try{calculate();const f=file(),url=URL.createObjectURL(f),a=document.createElement('a');a.href=url;a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);message('SVGを作成しました。Safariのダウンロード、または「ファイルを共有」から保存してください。');}catch(e){message(e.message);}};
$('share').onclick=async()=>{try{calculate();const f=file();if(!navigator.canShare?.({files:[f]}))throw Error('このブラウザでは共有できません。SVGを保存してください。');await navigator.share({files:[f]});}catch(e){if(e.name!=='AbortError')message(e.message);}};
// Read-only diagnostics used by the regression suite; no external requests.
window.stitch={state,loadSVG,loadSecondSVG,loadThirdSVG,importBatch,exportSVG,calculate,buildPrintDocument};
window.addEventListener('error',e=>{message('エラー：'+e.message);$('boot').textContent='エラーが発生しました';});
sample();
