import {parsePath,prepare,offsetLine,place,distance,alignCorners,interiorSides,fitWalls} from './geometry.js?v=two-svg-1';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const colors={A:'#2864b2',B:'#bb4935'};
const state={sources:[],pathSources:[],doc:null,paths:[],view:[0,0,2480,3505],base:[0,0,2480,3505],latest:null,cache:new Map(),calculations:0};
const node=(name,attrs,parent)=>{const e=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent?.append(e);return e;};
const message=text=>$('message').textContent=text;
for(const name of ['A','B']){
 const div=document.createElement('div');div.className='line';div.dataset.name=name;
 div.innerHTML=`<h3>線${name}</h3><label>カット線<select id="path${name}"></select></label><div class="grid"><label>始点 %<input id="start${name}" type="number" min="0" max="100" step="0.1" value="0"></label><label>終点 %<input id="end${name}" type="number" min="0" max="100" step="0.1" value="100"></label></div><label>始点を調整<input id="rangeStart${name}" type="range" min="0" max="100" step="0.1" value="0"></label><label>終点を調整<input id="rangeEnd${name}" type="range" min="0" max="100" step="0.1" value="100"></label><div class="grid"><label>穴を置く側<select id="side${name}"><option value="auto">内側（自動）</option><option value="1">右（手動）</option><option value="-1">左（手動）</option></select></label><label>オフセット mm<input id="offset${name}" type="number" min="0" max="100" step="0.1" value="3" disabled></label></div><label><input id="snap${name}" type="checkbox" checked>3mmに固定</label><button id="reverse${name}">始点と終点を入れ替え</button>`;
 for(const end of ['start','end']){
  const controls=document.createElement('div');controls.className='grid';
  controls.innerHTML=`<label>${end==='start'?'始点':'終点'}の角を揃える<select id="corner${end}${name}"><option value="">揃えない</option></select></label><label>隣の辺のオフセット方向<select id="cornerSide${end}${name}"><option value="auto">内側（自動）</option><option value="1">隣の辺の右（手動）</option><option value="-1">隣の辺の左</option></select></label>`;
  const pick=document.createElement('button');pick.id='pickCorner'+end+name;pick.className='pick-corner';pick.textContent=`${end==='start'?'始点':'終点'}の隣の辺を図で選ぶ`;
  pick.onclick=()=>{document.activeElement?.blur();$('stage').focus({preventScroll:true});$('active').value=name;$('mode').value='corner'+end;$('mode').onchange();message(`線${name}の${end==='start'?'始点':'終点'}で角を揃える隣の辺をタップしてください。ドラッグで移動もできます。`);};
  const autoPick=document.createElement('button');autoPick.id='autoWall'+end+name;autoPick.className='pick-corner';autoPick.textContent=`${end==='start'?'始点':'終点'}を壁から3mmに自動調整`;
  autoPick.onclick=()=>{document.activeElement?.blur();$('stage').focus({preventScroll:true});$('corner'+end+name).value='auto';calculate();message($('warning').textContent||'壁が見つかった端は3mm手前へ、見つからない端は元の位置を使います。');};
  controls.append(autoPick,pick);div.append(controls);
  for(const id of ['corner'+end+name,'cornerSide'+end+name])controls.querySelector('#'+id).onchange=schedule;
 }
 const help=document.createElement('p');help.className='hint';help.textContent='角を揃える：「隣の辺を図で選ぶ」を押して、型紙の線をタップ。選んだ辺はAが青、Bが赤、始点は実線・終点は破線で表示します。選んだ隣の辺も同じ距離でオフセットし、その交点に端の穴を合わせます。「壁から3mmに自動調整」はカーブを延ばして最初の壁を探します。壁が見つからない端は元の位置を使います。折り返す場合は停止します。自動中の始終点%は探索の基準区間で、調整後の端は図の点線で確認できます。手動選択で複数の交点がある場合は指定端に近い交点を使います。';div.append(help);
 const advanced=document.createElement('details');advanced.className='line-details';
 const summary=document.createElement('summary');summary.textContent='端点・オフセット・角合わせ';advanced.append(summary);
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
 $('reverse'+name).onclick=()=>{const a=$('start'+name),b=$('end'+name);[a.value,b.value]=[b.value,a.value];syncRanges(name);calculate();};
 $('path'+name).onchange=()=>{for(const endpoint of ['start','end'])$('corner'+endpoint+name).value='';$('start'+name).value=0;$('end'+name).value=100;syncRanges(name);calculate();};
}
function syncRanges(name){$('rangeStart'+name).value=$('start'+name).value;$('rangeEnd'+name).value=$('end'+name).value;}
function number(id,min,max){const el=$(id),n=el.valueAsNumber;if(!Number.isFinite(n)||n<min||n>max)throw Error(`${el.parentElement.textContent.trim()}：${min}〜${max}の数値を入力してください。`);return n;}
let frame=0;function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(calculate);}
for(const id of ['width','width2','diameter','count','pitch','countMode',...['A','B'].flatMap(n=>['side','offset','snap'].map(k=>k+n))])$(id).addEventListener('input',schedule);
// History stores editor values and immutable source text, never generated hole SVG.
const history=[],future=[];let previous=null,restoring=false,editGroup=null,groupRecorded=false;
const fields=()=>[...document.querySelectorAll('aside input[id],aside select[id]')].filter(e=>e.type!=='file'&&e.type!=='range'&&e.id!=='exportSource');
function snapshot(){return {source:state.sourceText,name:state.sourceLabel,sources:state.sources.map(s=>({text:s.text,name:s.name,width:s.width})),view:[...state.view],values:fields().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])};}
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
  if(!same(saved.sources.map(s=>[s.text,s.name]),state.sources.map(s=>[s.text,s.name]))){
   for(const [id,value] of saved.values)if(id==='width'||id==='width2')$(id).value=value;
   state.sources=saved.sources.map(s=>({...readSource(s.text,s.name),width:s.width}));rebuildScene(true);populateChoices();
  }
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
 if(!state.inside[index])throw Error(state.sources[state.pathSources[index]].insideError);
 return state.inside[index]*(reverse?-1:1);
}
function recalculate(){
 state.autoWalls={};state.calculations++;state.latest=null;$('save').disabled=$('share').disabled=true;$('warning').textContent='';$('stats').replaceChildren();
 for(const id of ['guides','holes','markers'])$(id).replaceChildren();
 for(const name of ['A','B']){
  const fixed=$('snap'+name).checked;$('offset'+name).disabled=fixed;if(fixed)$('offset'+name).value=3;
  $('offsetHint'+name).textContent=fixed?'カット線から穴の中心まで3mmに固定。オフにすると距離を変更できます。':'固定を解除中。「オフセット mm」を変更してください。オフにするだけでは距離は変わりません。';
 }
 for(const name of ['A','B'])for(const end of ['start','end'])for(const o of $('corner'+end+name).options)if(o.value!==''&&o.value!=='auto')o.disabled=state.pathSources[+o.value]!==state.pathSources[+$('path'+name).value];
 renderCornerSelections();
 try{
  if(!state.doc)return;
  const width=number('width',1,10000);if(state.sources[1])number('width2',1,10000);rebuildScene();
  const units=state.sources[0].box[2]/width,diameter=number('diameter',.1,10),minPitch=number('pitch',10,1000);
  const auto=$('countMode').value==='auto';
  const count=auto?13:number('count',2,1000);$('count').disabled=auto;
  if($('pathA').value===$('pathB').value)throw Error('AとBは異なるカット線を選んでください。');
  const lines=[],cornerErrors=[];
  for(const name of ['A','B']){
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
   guide.setAttribute('d',line.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '));
   }catch(e){cornerErrors.push(`線${name}：${e.message}`);guide.setAttribute('data-corner-error','true');}
   lines.push(line);
  }
  renderCornerSelections();
  if(cornerErrors.length)throw Error(cornerErrors.join(' ')+' 角合わせできない側は調整前の点線を表示しています。隣辺を選び直すか、↶で戻してください。');
  const result=place(...lines,{mode:$('countMode').value,count,minPitch});
  if(auto)$('count').value=result.count;
  result.rows.forEach((row,j)=>{
   const name=j?'B':'A';
   row.holes.forEach((p,i)=>node('circle',{cx:p.x,cy:p.y,r:diameter*units/2,'data-hole':`${name}_${i+1}`},$('holes')));
   for(const [p,end,label] of [[row.holes[0],'start',name+'始点'],[row.holes.at(-1),'end',name+'終点']]){
    const marker=node('g',{'data-endpoint':end+name,'data-x':p.x,'data-y':p.y},$('markers'));
    node('circle',{cx:0,cy:0,r:5,fill:colors[name]},marker);
    node('text',{x:name==='A'?-8:8,y:-8,'text-anchor':name==='A'?'end':'start',style:'font-size:14px;stroke-width:3px'},marker).textContent=label;
   }
   const div=document.createElement('div');div.className='result';div.textContent=`${name}：${result.count}穴 ／ 縫い線 ${(lines[j].len/units).toFixed(3)}mm ／ 弧長ピッチ ${row.pitch.toFixed(3)}mm ／ 中心の直線距離 ${row.minChord.toFixed(3)}〜${row.maxChord.toFixed(3)}mm${Object.keys(lines[j].autoWalls||{}).map(end=>` ／ ${end==='start'?'始点':'終点'}：壁から3mm（自動）`).join('')}${(lines[j].unchangedEnds||[]).map(end=>` ／ ${end==='start'?'始点':'終点'}：壁未検出・元の位置`).join('')}`;$('stats').append(div);
  });
  updateMarkerScale();
  $('warning').textContent=result.warning;
  if(result.valid){state.latest={result,lines,units,width,diameter,rowSources:['A','B'].map(n=>state.pathSources[+$('path'+n).value])};$('save').disabled=false;$('share').disabled=!navigator.canShare;}
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
 if(paths.length<1||paths.length>100)throw Error('1〜100本のサブパスを含むSVGを指定してください。');
 return {box,paths};
}
function readSource(text,name){
 const doc=new DOMParser().parseFromString(text,'image/svg+xml'),{box,paths}=validateDocument(doc);
 let inside=null,insideError='';try{inside=interiorSides(paths,box[2]/210);}catch(e){insideError=e.message;}
 return {doc,text,name,box,paths,inside,insideError};
}
function rebuildScene(force=false){
 if(!state.sources.length)return;
 const widths=state.sources.map((s,i)=>{const id=i?'width2':'width',value=$(id).valueAsNumber;return force&&(!Number.isFinite(value)||value<1||value>10000)?s.width||210:number(id,1,10000);}),key=JSON.stringify(widths);
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
 if(force){state.view=[...state.base];applyView();}
 $('sourceName').textContent=state.sources.map((s,i)=>`型紙${i+1}：${s.name}`).join(' ／ ');
 $('firstSourceName').textContent=state.sources[0].name;
 $('secondSourceName').textContent=state.sources[1]?.name||'';
 $('secondSource').hidden=!state.sources[1];$('removeSecond').disabled=!state.sources[1];
 $('exportSource').disabled=!state.sources[1];$('exportSource').options[1].disabled=!state.sources[1];
 if(!state.sources[1])$('exportSource').value='0';
}
function pathLabel(i){const source=state.pathSources[i],local=i-state.pathSources.indexOf(source);return `${state.sources.length>1?'型紙'+(source+1)+' · ':''}カット線 ${local+1}`;}
function populateChoices(){
 for(const name of ['A','B']){
  const select=$('path'+name);select.replaceChildren();state.paths.forEach((_,i)=>select.append(new Option(pathLabel(i),String(i))));
  for(const end of ['start','end']){
   const corners=$('corner'+end+name);corners.replaceChildren(new Option('揃えない',''),new Option('壁から3mmに自動調整','auto'));
   state.paths.forEach((_,i)=>corners.append(new Option(pathLabel(i),String(i))));
  }
 }
}
function resetLine(name,index){
 $('path'+name).value=index;$('side'+name).value='auto';$('start'+name).value=0;$('end'+name).value=100;
 for(const end of ['start','end']){$('corner'+end+name).value='';$('cornerSide'+end+name).value='auto';}syncRanges(name);
}
export function loadSVG(text,name='SVG',slot=0){
 if(slot!==0&&slot!==1)throw Error('型紙は2枚までです。');
 if(slot===1&&!state.sources[0])throw Error('先に型紙1を読み込んでください。');
 const source=readSource(text,name); // Validate before replacing either document.
 const oldValues=fields().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value]);
 const oldFirstCount=state.sources[0]?.paths.length||0;
 state.sources[slot]=source;
 const physical=(source.doc.documentElement.getAttribute('width')||'').match(/^\s*([\d.]+)\s*(mm|cm|in)\s*$/i);
 if(physical){const w=+physical[1]*({mm:1,cm:10,in:25.4}[physical[2].toLowerCase()]);if(w>=1&&w<=10000)$(slot?'width2':'width').value=w;}
 // Invalid dimension edits must not prevent replacing a file with a valid one.
 for(const id of ['width','width2'])if(!Number.isFinite($(id).valueAsNumber)||$(id).valueAsNumber<1||$(id).valueAsNumber>10000)$(id).value=210;
 rebuildScene(true);populateChoices();
 for(const [id,value] of oldValues)if(/^(path|side|start|end|corner|snap|offset)/.test(id)){
  const e=$(id);if(e.type==='checkbox')e.checked=value;else e.value=value;
 }
 for(const lineName of ['A','B']){
  const oldIndex=+oldValues.find(([id])=>id==='path'+lineName)[1],owner=oldIndex<oldFirstCount?0:1;
  if(slot===0&&owner===1&&state.sources[1]){
   // The second file stays independent when the first file is replaced.
   $('path'+lineName).value=source.paths.length+oldIndex-oldFirstCount;
   for(const end of ['start','end']){
    const id='corner'+end+lineName,value=oldValues.find(([key])=>key===id)[1];
    $(id).value=value!==''&&value!=='auto'?String(source.paths.length+Number(value)-oldFirstCount):value;
   }
  }else if(slot===0){
   resetLine(lineName,Math.max(0,Math.min(lineName==='A'?5:6,source.paths.length-(lineName==='A'&&!state.sources[1]?2:1))));
  }else if(lineName==='B')resetLine('B',state.sources[0].paths.length);
  else if(owner===1)resetLine('A',0);
  syncRanges(lineName);
 }
 calculate();message('型紙から縫い合わせる辺A・Bを選んでください。ドラッグで移動、2本指でズーム。');
}
export const loadSecondSVG=(text,name='SVG 2')=>loadSVG(text,name,1);
$('removeSecond').onclick=()=>{
 const firstCount=state.sources[0].paths.length,values=fields().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value]);
 state.sources=state.sources.slice(0,1);rebuildScene(true);populateChoices();
 for(const [id,value] of values)if(/^(path|side|start|end|corner|snap|offset)/.test(id)){
  const e=$(id);if(e.type==='checkbox')e.checked=value;else e.value=value;
 }
 for(const name of ['A','B']){
  const oldIndex=+values.find(([id])=>id==='path'+name)[1];
  if(oldIndex>=firstCount)resetLine(name,Math.min(name==='A'?5:6,firstCount-1));
  else for(const end of ['start','end'])if(+$('corner'+end+name).value>=firstCount)$('corner'+end+name).value='';
  syncRanges(name);
 }
 calculate();message('型紙2を外しました。↶で元に戻せます。');
};
async function sample(){try{const r=await fetch('assets/source/名称未設定 3.svg');if(!r.ok)throw Error('サンプルを読み込めません。');loadSVG(await r.text(),'原本サンプル');$('boot').textContent='操作の準備ができました';}catch(e){message(e.message);$('boot').textContent='起動に失敗しました。SafariでWebページとして開いてください。';}}
$('sample').onclick=sample;
for(const [id,slot] of [['file',0],['file2',1]])$(id).onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2e6)throw Error('SVGは1枚2MB以内にしてください。');loadSVG(await file.text(),file.name,slot);}catch(err){message(err.message);}finally{e.target.value='';}};
function updateMarkerScale(){
 const ctm=$('canvas').getScreenCTM();if(!ctm)return;
 const scale=Math.hypot(ctm.a,ctm.b);if(!Number.isFinite(scale)||scale<=0)return;
 for(const marker of $('markers').children)marker.setAttribute('transform',`translate(${marker.dataset.x} ${marker.dataset.y}) scale(${1/scale})`);
}
function applyView(){$('canvas').setAttribute('viewBox',state.view.join(' '));updateMarkerScale();}
new ResizeObserver(updateMarkerScale).observe($('canvas'));
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
  const index=value==='auto'?state.autoWalls?.[end+name]:+value;const path=state.paths[index];if(!path)continue;
  const d='M'+path.start.x+','+path.start.y+path.segments.map(c=>(c.length===2?'L':c.length===3?'Q':'C')+c.slice(1).map(p=>p.x+','+p.y).join(' ')).join(' ');
  const mark=node('path',{d,fill:'none',stroke:colors[name],'stroke-width':5,'stroke-opacity':.65,'vector-effect':'non-scaling-stroke','stroke-dasharray':end==='end'?'8 4':'none','data-corner':end+name},group);
  node('title',{},mark).textContent=`線${name}の${end==='start'?'始点':'終点'}の隣辺`;
 }
}
function nearest(points,p){let best={d:Infinity,s:0};for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,f=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),q={x:a.x+dx*f,y:a.y+dy*f},d=distance(q,p);if(d<best.d)best={d,s:a.s+(b.s-a.s)*f};}return best;}
function hit(x,y){
 const mode=$('mode').value;if(mode==='pan'||!state.doc)return;
 const p=local(x,y),q=local(x+28,y),limit=distance(p,q),units=state.sources[0].box[2]/number('width',1,10000);
 const corner=mode==='cornerstart'||mode==='cornerend';
 const candidates=mode==='A'||mode==='B'||corner?state.paths.map((_,i)=>i).filter(i=>!corner||(i!==+$('path'+$('active').value).value&&state.pathSources[i]===state.pathSources[+$('path'+$('active').value).value])):[+$('path'+$('active').value).value];
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
export function exportSVG(sourceIndex=0){
 if(!state.latest)throw Error('条件を満たす配置を作成してください。');
 const source=state.sources[sourceIndex];if(!source)throw Error('保存する型紙を選んでください。');
 const {result,diameter}=state.latest,units=source.box[2]/source.width,width=source.width,doc=source.doc.cloneNode(true),root=doc.documentElement;
 root.setAttribute('width',width+'mm');root.setAttribute('height',(source.box[3]/units)+'mm');
 const g=doc.createElementNS(NS,'g');let id='stitch_holes',suffix=1;while(root.querySelector(`[id="${id}"]`))id='stitch_holes_'+suffix++;g.setAttribute('id',id);g.setAttribute('fill','none');g.setAttribute('stroke','black');g.setAttribute('stroke-width',.08*units);root.append(g);
 result.rows.forEach((row,j)=>{if(state.latest.rowSources[j]!==sourceIndex)return;row.holes.forEach((p,i)=>{const c=doc.createElementNS(NS,'circle');for(const [k,v] of Object.entries({cx:((p.x-source.tx)/source.scale).toFixed(6),cy:((p.y-source.ty)/source.scale).toFixed(6),r:(diameter*units/2).toFixed(6),'data-hole':`${j?'B':'A'}_${String(i+1).padStart(2,'0')}`}))c.setAttribute(k,v);g.append(c);});});
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(root);
}
function file(){const index=+$('exportSource').value;return new File([exportSVG(index)],state.sources.length>1?`型紙${index+1}_${state.sources[index].name.replace(/\.svg$/i,'')}_針穴.svg`:'針穴配置済み.svg',{type:'image/svg+xml'});}
$('save').onclick=()=>{try{calculate();const f=file(),url=URL.createObjectURL(f),a=document.createElement('a');a.href=url;a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);message('SVGを作成しました。Safariのダウンロード、または「ファイルを共有」から保存してください。');}catch(e){message(e.message);}};
$('share').onclick=async()=>{try{calculate();const f=file();if(!navigator.canShare?.({files:[f]}))throw Error('このブラウザでは共有できません。SVGを保存してください。');await navigator.share({files:[f]});}catch(e){if(e.name!=='AbortError')message(e.message);}};
// Read-only diagnostics used by the regression suite; no external requests.
window.stitch={state,loadSVG,loadSecondSVG,exportSVG,calculate};
window.addEventListener('error',e=>{message('エラー：'+e.message);$('boot').textContent='エラーが発生しました';});
sample();
