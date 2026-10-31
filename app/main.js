import {parsePath,prepare,offsetLine,place,distance,alignCorners,interiorSides,fitWalls,touchingWalls,distanceToWalls,trimLine,placeJoined,placeSequences,tangent,evaluate} from './geometry.js?v=preview-plus-1';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const colors={A:'#2864b2',B:'#bb4935',C:'#8564a7'},lineNames=['A','B','C'];
const activeNames=()=>$('seamMode').value==='joined'?lineNames:$('seamMode').value==='single'?['A']:['A','B'];
let sourceSequence=0;
const state={chains:{A:null,B:null,C:null},sections:null,sectionSelected:{A:0,B:0},rotation:0,partOffsets:{},partOrder:[],fixed:[],committedSignature:null,completed:[],sources:[],pathSources:[],doc:null,paths:[],view:[0,0,2480,3505],base:[0,0,2480,3505],latest:null,cache:new Map(),calculations:0};
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
  pick.onclick=()=>{closeLayers();document.activeElement?.blur();$('stage').focus({preventScroll:true});$('active').value=name;$('mode').value='corner'+end;$('mode').onchange();message(`線${name}の${end==='start'?'始点':'終点'}で角を揃える隣の辺をタップしてください。ドラッグで移動もできます。`);};
  const autoPick=document.createElement('button');autoPick.id='autoWall'+end+name;autoPick.className='pick-corner';autoPick.textContent=`${end==='start'?'始点':'終点'}を壁から3mmに自動調整`;
  autoPick.onclick=()=>{closeLayers();document.activeElement?.blur();$('stage').focus({preventScroll:true});$('corner'+end+name).value='auto';calculate();message($('warning').textContent||'壁が見つかった端は3mm手前へ、見つからない端は元の位置を使います。');};
  controls.append(autoPick,pick);div.append(controls);
  for(const id of ['corner'+end+name,'cornerSide'+end+name])controls.querySelector('#'+id).onchange=schedule;
 }
 const help=document.createElement('p');help.className='hint';help.textContent='始点・終点とも、壁に接する場合だけ穴中心をオフセットと同じ距離だけ壁から離します。壁に接しない端は元の位置を保ちます。選択した縫い合わせる辺同士は壁に含めません。数値指定で控え量を変更できます。壁のない端では縫い線に沿って指定mmだけ控えます。角合わせは詳細から指定できます。';div.append(help);
 const advanced=document.createElement('details');advanced.className='line-details';
 const summary=document.createElement('summary');summary.textContent='端点・控え量・オフセット';advanced.append(summary);
 for(const child of [...div.children].slice(2))advanced.append(child);
 const pickLine=document.createElement('button');pickLine.className='pick-line';pickLine.id='pickLine'+name;pickLine.textContent='図で辺'+name+'を選ぶ';
 pickLine.onclick=()=>{closeLayers();document.activeElement?.blur();$('stage').focus({preventScroll:true});$('active').value=name;$('mode').value=name;$('mode').onchange();message('型紙の辺をタップしてください。');};
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
 $('path'+name).onchange=()=>{state.chains[name]=curveChain(+$('path'+name).value);for(const endpoint of ['start','end']){$('corner'+endpoint+name).value='';$('insetMode'+endpoint+name).value='offset';}$('start'+name).value=0;$('end'+name).value=100;syncRanges(name);calculate();};
}
const sectionFields=['path','side','start','end','snap','offset','cornerstart','cornerend','cornerSidestart','cornerSideend','insetModestart','insetModeend','insetstart','insetend'];
function captureSection(name){const values=Object.fromEntries(sectionFields.map(k=>{const e=$(k+name);return [k,e.type==='checkbox'?e.checked:e.value];})),i=+values.path,si=state.pathSources[i];return {chain:structuredClone(state.chains[name]),values,sourceId:state.sources[si]?.id,local:i-state.pathSources.indexOf(si)};}
function sectionPath(section){const si=state.sources.findIndex(s=>s.id===section.sourceId);if(si<0||!state.sources[si].paths[section.local])throw Error('原本が変更された区間があります。その区間を削除して追加し直してください。');return state.pathSources.indexOf(si)+section.local;}
function showSection(name,section){const path=sectionPath(section);state.chains[name]=structuredClone(section.chain||null);for(const [key,value] of Object.entries(section.values)){const e=$(key+name);if(e.type==='checkbox')e.checked=value;else e.value=key==='path'?path:value;}syncRanges(name);}
function persistSections(){if($('seamMode').value!=='sequence'||!state.sections||!state.sectionModeActive)return;for(const name of ['A','B']){const old=state.sections[name][state.sectionSelected[name]];if(old&&state.sources.some(s=>s.id===old.sourceId))state.sections[name][state.sectionSelected[name]]=captureSection(name);}}
function renderSections(){if($('seamMode').value==='sequence'&&['A','B'].some(n=>$('path'+n).value==='')){for(const name of ['A','B'])$('sections'+name).hidden=true;return;}const enabled=$('seamMode').value==='sequence',entering=enabled&&!state.sectionModeActive;const existing=!!state.sections;if(enabled&&!state.sections){state.sections={A:[captureSection('A')],B:[captureSection('B')]};state.sectionSelected={A:0,B:0};}if(entering&&existing)for(const name of ['A','B'])try{showSection(name,state.sections[name][state.sectionSelected[name]]);}catch(e){message(e.message);}state.sectionModeActive=enabled;for(const name of ['A','B']){const option=[...$('active').options].find(o=>o.value===name);if(option){option.value=name;option.textContent=enabled?name+(state.sectionSelected[name]+1):name;}}
 for(const name of ['A','B']){const panel=$('sections'+name);panel.hidden=!enabled;if(!enabled)continue;const list=$('sectionList'+name);list.replaceChildren();state.sections[name].forEach((section,i)=>{const row=document.createElement('div');row.className='section-row';const edit=document.createElement('button');let caption='原本変更・再追加が必要';try{caption=pathLabel(sectionPath(section));}catch{}edit.textContent=`${name}${i+1} · ${caption}：${section.values.start}% → ${section.values.end}%${i===state.sectionSelected[name]?'（編集中）':''}`;edit.setAttribute('aria-pressed',String(i===state.sectionSelected[name]));edit.onclick=()=>{persistSections();state.sectionSelected[name]=i;$('active').value=name;if(lineNames.includes($('mode').value))$('mode').value=name;try{showSection(name,section);}catch(e){message(e.message);}calculate();};row.append(edit);
 for(const [text,delta] of [['↑',-1],['↓',1],['削除',0]]){const b=document.createElement('button');b.textContent=text;b.setAttribute('aria-label',`${name}${i+1} ${text}`);b.disabled=delta?i+delta<0||i+delta>=state.sections[name].length:state.sections[name].length===1;b.onclick=()=>{persistSections();const sections=state.sections[name];if(delta)[sections[i],sections[i+delta]]=[sections[i+delta],sections[i]];else sections.splice(i,1);state.sectionSelected[name]=delta?i+delta:Math.min(i,sections.length-1);showSection(name,sections[state.sectionSelected[name]]);calculate();};row.append(b);}list.append(row);});
 document.querySelector(`.line[data-name=${name}] h3`).textContent=`線${name} · ${name}${state.sectionSelected[name]+1}を編集中`;
 }}
for(const name of ['A','B']){const panel=document.createElement('div');panel.id='sections'+name;panel.hidden=true;const add=document.createElement('button');add.id='addSection'+name;add.textContent='複数選ぶ';add.setAttribute('aria-label',`線${name}を複数選ぶ`);add.onclick=()=>{ensureSequenceMode();persistSections();state.sections[name].push(captureSection(name));state.sectionSelected[name]=state.sections[name].length-1;$('active').value=name;if(lineNames.includes($('mode').value))$('mode').value=name;calculate();message(`${name}${state.sectionSelected[name]+1}を追加しました。同じ辺の離れた区間なら始点・終点を変更してください。`);};const list=document.createElement('div');list.id='sectionList'+name;panel.append(list);const linePanel=document.querySelector(`.line[data-name=${name}]`);linePanel.append(panel,add);const split=document.createElement('button');split.id='splitSection'+name;split.textContent='分割';split.setAttribute('aria-label',`線${name}を分割`);split.onclick=()=>splitSection(name);const options=document.createElement('details');options.innerHTML=`<summary>分割位置・空きを指定</summary><label>区間内の分割位置 %<input data-section-tool id="sectionSplit${name}" type="number" min="0.1" max="99.9" step="0.1" value="50"></label><label>分割箇所の空き mm（元カット線沿い）<input data-section-tool id="sectionGap${name}" type="number" min="0.1" step="0.1" value="10"></label>`;linePanel.append(split,options);}
function ensureSequenceMode(){if($('seamMode').value!=='sequence'){$('seamMode').value='sequence';calculate();}}
function splitSection(name){try{ensureSequenceMode();persistSections();const position=number('sectionSplit'+name,.1,99.9)/100,gap=number('sectionGap'+name,.1,10000),i=state.sectionSelected[name],section=state.sections[name][i],path=sectionPath(section),units=state.sources[0].box[2]/number('width',1,10000),length=prepare(editorPath(name,path),units).total/units,start=+section.values.start,end=+section.values.end,sign=Math.sign(end-start),cut=start+(end-start)*position,half=gap/length*50;
 const leftEnd=cut-sign*half,rightStart=cut+sign*half;if(!sign||sign*(leftEnd-start)<=0||sign*(end-rightStart)<=0)throw Error('分割位置と空きが区間に収まりません。空きを小さくするか区間を広げてください。');
 const left=structuredClone(section),right=structuredClone(section);left.values.end=String(leftEnd);right.values.start=String(rightStart);left.values.cornerend='';left.values.insetModeend='off';right.values.cornerstart='';right.values.insetModestart='off';state.sections[name].splice(i,1,left,right);showSection(name,left);$('active').value=name;$('mode').value=name;calculate();message(`${name}${i+1}と${name}${i+2}へ分割しました。分割箇所は元カット線沿いに${gap}mm空けています。`);
 }catch(e){$('warning').textContent=e.message;message(e.message);}}
function sectionCurve(section){const members=section.chain?.members||[{local:section.local,reverse:false}],forward=JSON.stringify(members.map(m=>[m.local,m.reverse])),backward=JSON.stringify([...members].reverse().map(m=>[m.local,!m.reverse]));return {key:section.sourceId+':'+(forward<backward?forward:backward),flip:forward>backward};}
function calculateSections(units,width,diameter,minPitch,count){
 const saved={A:captureSection('A'),B:captureSection('B')},entries=[],groups={A:[],B:[]},errors=[];
 try{const excluded=['A','B'].flatMap(n=>state.sections[n].flatMap(s=>{try{return [sectionPath(s),...chainIndices(s.chain)];}catch{return [];}}));for(const name of ['A','B'])for(const [i,section] of state.sections[name].entries()){try{showSection(name,section);const path=sectionPath(section),line=buildLine(name,units,false,excluded);entries.push({name,label:name+(i+1),path,line,section});groups[name].push(line);}catch(e){errors.push(`${name}${i+1}：${e.message}`);}}}
 finally{for(const name of ['A','B'])showSection(name,saved[name]);}
 for(const {name,label,path,line} of entries){node('path',{d:line.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),stroke:colors[name],'data-line':name,'data-path':path,'data-section':label},$('guides'));for(const [p,end] of [[line.points[0],'始点'],[line.points.at(-1),'終点']]){const m=node('g',{'data-path':path,'data-x':p.x,'data-y':p.y,'data-section':label},$('markers'));node('text',{x:8,y:end==='始点'?-10:22,style:'font-size:14px;stroke-width:3px'},m).textContent=label+end;}}
 if(errors.length)throw Error(errors.join(' '));
 for(const name of ['A','B']){const sections=state.sections[name];for(let i=0;i<sections.length;i++)for(let j=i+1;j<sections.length;j++){const a=sections[i],b=sections[j],av=a.values,bv=b.values,ac=sectionCurve(a),bc=sectionCurve(b),physical=(v,section,c)=>resolveSide(v.side,sectionPath(section),+v.start>+v.end)*(+v.start>+v.end?-1:1)*(c.flip?-1:1),offset=v=>v.snap?3:+v.offset,range=(v,c)=>[+v.start,+v.end].map(x=>c.flip?100-x:x).sort((a,b)=>a-b),ar=range(av,ac),br=range(bv,bc);if(ac.key===bc.key&&offset(av)===offset(bv)&&(offset(av)===0||physical(av,a,ac)===physical(bv,b,bc))&&Math.max(ar[0],br[0])<=Math.min(ar[1],br[1])+1e-7)throw Error(`${name}${i+1}と${name}${j+1}が重なるか同じ端点を使っています。区間の間を空けてください。`);}}
 const result=placeSequences(groups.A,groups.B,{mode:$('countMode').value,count,minPitch});if($('countMode').value==='auto')$('count').value=result.count;
 for(const id of ['guides','markers'])$(id).replaceChildren();
 const numbers={A:0,B:0};result.rows.forEach((row,j)=>{const entry=entries[j],{name,label,path,line}=entry,start=numbers[name]+1;numbers[name]+=row.holes.length;const end=numbers[name];entry.firstNumber=start;entry.lastNumber=end;
 node('path',{d:line.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),stroke:colors[name],'data-line':name,'data-path':path,'data-section':label},$('guides'));
 row.holes.forEach((p,i)=>node('circle',{cx:p.x,cy:p.y,r:diameter*units/2,'data-hole':`${name}_${start+i}`,'data-path':path,'data-section':label},$('holes')));
 for(const [p,endpoint,index] of [[row.holes[0],'始点',start],[row.holes.at(-1),'終点',end]]){const m=node('g',{'data-path':path,'data-x':p.x,'data-y':p.y,'data-section':label},$('markers'));node('circle',{cx:0,cy:0,r:5,fill:colors[name]},m);node('text',{x:8,y:endpoint==='始点'?-10:22,style:'font-size:14px;stroke-width:3px'},m).textContent=`${label}${endpoint} #${index}`;}
 const info=document.createElement('p');info.textContent=`${label}：#${start}〜#${end} ／ ${row.holes.length}穴 ／ 弧長ピッチ ${row.pitch.toFixed(3)}mm`;$('stats').append(info);
 });
 state.autoWalls={};for(const entry of entries){if(entry.label===entry.name+(state.sectionSelected[entry.name]+1))for(const [end,index] of Object.entries(entry.line.autoWalls||{}))state.autoWalls[end+entry.name]=index;}renderCornerSelections();
 const summary=document.createElement('p');summary.textContent=`A全体 ${result.count}穴 ↔ B全体 ${result.count}穴。区間の番号順に対応し、区間間の空きには穴を置きません。`;$('stats').prepend(summary);$('warning').textContent=result.warning;
 if(result.valid){state.latest={result,lines:entries.map(e=>e.line),units,width,diameter,rowSources:entries.map(e=>state.pathSources[e.path]),rowPaths:entries.map(e=>e.path),rowNames:entries.map(e=>e.label),rowNumbers:entries.map(e=>[e.firstNumber,e.lastNumber])};$('save').disabled=false;$('saveAll').disabled=false;$('share').disabled=!navigator.canShare;$('fixSet').disabled=draftSignature()===state.committedSignature;if($('fixSet').disabled)for(const id of ['holes','guides','markers'])$(id).replaceChildren();}updateMarkerScale();
}

function syncRanges(name){$('rangeStart'+name).value=$('start'+name).value;$('rangeEnd'+name).value=$('end'+name).value;}
function number(id,min,max){const el=$(id),n=el.valueAsNumber;if(!Number.isFinite(n)||n<min||n>max)throw Error(`${el.parentElement.textContent.trim()}：${min}〜${max}の数値を入力してください。`);return n;}
let frame=0;function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(calculate);}
$('seamMode').addEventListener('change',()=>{if($('seamMode').value!=='sequence')state.sectionModeActive=false;});
for(const id of ['width','width2','width3','seamMode','split','diameter','count','pitch','countMode',...lineNames.flatMap(n=>['side','offset','snap'].map(k=>k+n))])$(id).addEventListener('input',schedule);
// History stores editor values and immutable source text, never generated hole SVG.
const history=[],future=[];let previous=null,restoring=false,editGroup=null,groupRecorded=false;
const fields=()=>[...document.querySelectorAll('aside input[id],aside select[id],#lineFields input[id],#lineFields select[id],#seamModeControls select[id]')].filter(e=>e.type!=='file'&&e.type!=='range'&&e.id!=='exportSource'&&!e.hasAttribute('data-section-tool')).sort((a,b)=>a.id.localeCompare(b.id));
function snapshot(){return {chains:structuredClone(state.chains),sections:structuredClone(state.sections),sectionSelected:{...state.sectionSelected},partOffsets:structuredClone(state.partOffsets),rotation:state.rotation,partOrder:[...state.partOrder],source:state.sourceText,name:state.sourceLabel,sources:state.sources.map(s=>({text:s.text,name:s.name,width:s.width,id:s.id})),fixed:[...state.fixed],completed:[...state.completed],committedSignature:state.committedSignature,view:[...state.view],values:fields().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])};}
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
function calculate(){cancelAnimationFrame(frame);frame=0;persistSections();checkpoint();recalculate();syncPartLayout();if(!restoring&&state.doc)previous=snapshot();}
// One continuous field edit (typing or dragging a slider) is one undo step.
document.addEventListener('focusin',e=>{if(!e.target.closest('aside,#lineFields'))return;
 editGroup=e.target.matches('input[type=number],input[type=range]')?e.target.id:null;groupRecorded=false;
});
document.addEventListener('focusout',e=>{if(!e.target.closest('aside,#lineFields'))return;
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
  state.chains=structuredClone(saved.chains||{A:null,B:null,C:null});state.sections=structuredClone(saved.sections||null);state.sectionSelected={...(saved.sectionSelected||{A:0,B:0})};state.partOffsets=structuredClone(saved.partOffsets||{});state.rotation=saved.rotation||0;state.partOrder=[...(saved.partOrder||[])];state.view=[...saved.view];applyView();recalculate();syncPartLayout();
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
function chainIndices(chain){if(!chain)return [];const si=state.sources.findIndex(s=>s.id===chain.sourceId);if(si<0)throw Error('曲線の原本が変更されています。辺を選び直してください。');const first=state.pathSources.indexOf(si);return chain.members.map(m=>{if(!state.sources[si].paths[m.local])throw Error('曲線の辺が変更されています。辺を選び直してください。');return first+m.local;});}
function curveChain(index){const si=state.pathSources[index],source=state.sources[si];if(!source)return null;const first=state.pathSources.indexOf(si),part=source.parts.find(p=>p.indices.includes(index-first));if(!part)return null;
 const tol=.01*(state.sources[0].box[2]/(+$('width').value||210)),used=new Set([index]),members=[{index,reverse:false}];
 const segments=m=>m.reverse?[...state.paths[m.index].segments].reverse().map(c=>[...c].reverse()):state.paths[m.index].segments;
 const curved=cs=>{const a=cs[0][0],b=cs.at(-1).at(-1),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<tol)return true;return cs.some(c=>[.25,.5,.75].some(t=>{const p=evaluate(c,t);return Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))/length>Math.max(tol,.005*length);}));};
 const joins=(a,b)=>{const last=a.at(-1),head=b[0];if(!curved(a)||!curved(b)||last.length===2||head.length===2||distance(last.at(-1),head[0])>tol)return false;const u=tangent(last,1),v=tangent(head,0);return u.x*v.x+u.y*v.y>=Math.cos(Math.PI/12)-1e-9;};
 for(const prepend of [false,true])for(let step=0;step<part.indices.length;step++){const current=segments(prepend?members[0]:members.at(-1)),candidates=[],junction=prepend?current[0][0]:current.at(-1).at(-1);const incident=part.indices.reduce((n,local)=>{const path=state.paths[first+local];return n+(distance(path.start,junction)<=tol?1:0)+(distance(path.segments.at(-1).at(-1),junction)<=tol?1:0);},0);if(incident!==2)break;for(const local of part.indices){const i=first+local;if(used.has(i)||(source.inside[local]!=null)!==(source.inside[index-first]!=null))continue;for(const reverse of [false,true]){const m={index:i,reverse},cs=segments(m);if(prepend?joins(cs,current):joins(current,cs))candidates.push(m);}}
 if(candidates.length!==1)break;const m=candidates[0];used.add(m.index);if(prepend)members.unshift(m);else members.push(m);}
 return members.length>1?{sourceId:source.id,members:members.map(m=>({local:m.index-first,reverse:m.reverse}))}:null;
}
function editorPath(name,index){const chain=state.chains[name];if(!chain)return state.paths[index];const indices=chainIndices(chain);if(!indices.includes(index))return state.paths[index];const segments=chain.members.flatMap((m,i)=>m.reverse?[...state.paths[indices[i]].segments].reverse().map(c=>[...c].reverse()):state.paths[indices[i]].segments);return {start:segments[0][0],segments,closed:distance(segments[0][0],segments.at(-1).at(-1))<1e-9};}
function curveMembers(name){return chainIndices(state.chains[name]);}
function buildLine(name,units,draw=true,excluded=[]){
   const idx=+$('path'+name).value,path=editorPath(name,idx),members=curveMembers(name);
   const offset=$('snap'+name).checked?3:number('offset'+name,0,100);
   const start=number('start'+name,0,100)/100,end=number('end'+name,0,100)/100,side=resolveSide($('side'+name).value,idx,start>end);
   const key=idx+':'+units+':'+JSON.stringify(state.chains[name]);
   if(!state.cache.has(key)){if(state.cache.size>30)state.cache.clear();state.cache.set(key,prepare(path,units));}
   let line=offsetLine(state.cache.get(key),start,end,offset*units,side);
   const guide=draw?node('path',{d:line.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),stroke:colors[name],'data-line':name},$('guides')):null;
   try{
   const startAuto=$('cornerstart'+name).value==='auto',endAuto=$('cornerend'+name).value==='auto';
   if(startAuto||endAuto){
    if(state.inside[idx]&&side!==state.inside[idx]*(start>end?-1:1))throw Error('壁の自動調整は内側への配置で使ってください。');
    const walls=state.paths.flatMap((p,i)=>{
     if(i===idx||members.includes(i)||!sameRegion(i,idx))return [];const key=i+':'+units;
     if(!state.cache.has(key))state.cache.set(key,prepare(p,units));return [{index:i,prepared:state.cache.get(key)}];
    });
    line=fitWalls(state.cache.get(key),start,end,offset*units,side,walls,{startAuto,endAuto,clearance:3,maxLength:2*Math.hypot(...state.sources[state.pathSources[idx]].box.slice(2))*state.sources[state.pathSources[idx]].scale/units});
    for(const [endpoint,index] of Object.entries(line.autoWalls))state.autoWalls[endpoint+name]=index;
   }
   const corners={};
   for(const endpoint of ['start','end']){
    const chosen=$('corner'+endpoint+name).value;if(chosen===''||chosen==='auto')continue;
    const neighbor=+chosen;if(neighbor===idx||members.includes(neighbor))throw Error('角を揃える隣の辺は、自分以外の線を選んでください。');
    if(state.pathSources[neighbor]!==state.pathSources[idx])throw Error('隣の辺は同じ型紙から選んでください。');
    const neighborKey=neighbor+':'+units;
    if(!state.cache.has(neighborKey))state.cache.set(neighborKey,prepare(state.paths[neighbor],units));
    corners[endpoint]=offsetLine(state.cache.get(neighborKey),0,1,offset*units,resolveSide($('cornerSide'+endpoint+name).value,neighbor));
   }
   if(corners.start||corners.end)line=alignCorners(line,corners);
   const allWalls=state.paths.flatMap((p,i)=>{if(i===idx||members.includes(i)||!sameRegion(i,idx)||excluded.includes(i)||activeNames().some(n=>n!==name&&(+$('path'+n).value===i||curveMembers(n).includes(i))))return [];const k=i+':'+units;if(!state.cache.has(k))state.cache.set(k,prepare(p,units));return [{index:i,prepared:state.cache.get(k)}];});
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

   guide?.setAttribute('d',line.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '));
   }catch(e){guide?.setAttribute('data-corner-error','true');throw Error(`線${name}：${e.message}`);}

return line;
}
function recalculate(){
 const joinedMode=$('seamMode').value==='joined',singleMode=$('seamMode').value==='single';
 $('singleModeButton').setAttribute('aria-pressed',singleMode);$('pairModeButton').setAttribute('aria-pressed',!singleMode);
 $('mode').querySelector('option[value=B]').disabled=singleMode;[...$('active').options].find(o=>o.value==='B').disabled=singleMode;if(singleMode&&$('active').value==='B')$('active').value='A';if(singleMode&&$('mode').value==='B')$('mode').value='A';
 if($('active').value==='C')$('active').value='A';if($('mode').value==='C')$('mode').value='pan';
 state.autoWalls={};state.calculations++;state.latest=null;$('fixSet').disabled=true;$('save').disabled=!state.fixed.length;$('share').disabled=!state.fixed.length||!navigator.canShare;renderFixed();$('warning').textContent='';$('stats').replaceChildren();$('saveAll').disabled=!state.fixed.length;
 for(const id of ['guides','holes','markers'])$(id).replaceChildren();
 for(const name of lineNames){
  if(name!=='C'){const empty=['A','B'].some(n=>$('path'+n).value==='');$('addSection'+name).disabled=empty;$('splitSection'+name).disabled=empty;}
  document.querySelector(`.line[data-name=${name}]`).hidden=!activeNames().includes(name);
  document.querySelector(`.line[data-name=${name}] h3`).textContent=$('seamMode').value==='joined'?({A:'A · つなぐ長い辺',B:'B · 前半につなぐ辺',C:'C · 後半につなぐ辺'}[name]):'線'+name;
  for(const end of ['start','end'])$('inset'+end+name).disabled=$('insetMode'+end+name).value!=='manual';
  const fixed=$('snap'+name).checked;$('offset'+name).disabled=fixed;if(fixed)$('offset'+name).value=3;
  $('offsetHint'+name).textContent=fixed?'カット線から穴の中心まで3mmに固定。オフにすると距離を変更できます。':'固定を解除中。「オフセット mm」を変更してください。オフにするだけでは距離は変わりません。';
 }
 renderSections();
 for(const name of lineNames)for(const end of ['start','end'])for(const o of $('corner'+end+name).options)if(o.value!==''&&o.value!=='auto')o.disabled=state.pathSources[+o.value]!==state.pathSources[+$('path'+name).value];
 renderCornerSelections();
 try{
  if(!state.doc)return;
  if(activeNames().some(n=>$('path'+n).value==='')){$('warning').textContent='A/Bの辺を選んでください。固定した配置は残っています。';return;}
  renderFixed();
  const width=number('width',1,10000);for(let i=1;i<state.sources.length;i++)number('width'+(i+1),1,10000);rebuildScene();renderFixed();
  $('joinedSettings').hidden=$('seamMode').value!=='joined';$('countLabel').textContent=$('seamMode').value==='sequence'?'片側の総穴数':singleMode?'穴数':joinedMode?'各組の穴数':'片側の穴数';
  const units=state.sources[0].box[2]/width,diameter=number('diameter',.1,10),minPitch=number('pitch',10,1000);
  const auto=$('countMode').value==='auto';
  const count=auto?13:number('count',2,1000);$('count').disabled=auto;
  if($('seamMode').value==='sequence'){calculateSections(units,width,diameter,minPitch,count);return;}
  if(joinedMode&&new Set(activeNames().map(n=>$('path'+n).value)).size!==activeNames().length)throw Error('A・B・Cには異なるカット線を選んでください。');
  const lines=[],cornerErrors=[];
  for(const name of activeNames()){
   try{lines.push(buildLine(name,units));}catch(e){cornerErrors.push(e.message);}
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
// Trace bounded faces of endpoint-connected curves; source SVG remains untouched.
function enclosedRegions(paths,units){
 const tol=.01*units,nodes=[],edges=[];
 const vertex=p=>{let i=nodes.findIndex(n=>distance(n.p,p)<=tol);if(i<0){i=nodes.length;nodes.push({p,out:[]});}return i;};
 const sameCurve=(a,b,reverse)=>{const bs=reverse?[...b.segments].reverse().map(c=>[...c].reverse()):b.segments;return a.segments.length===bs.length&&a.segments.every((c,i)=>c.length===bs[i].length&&c.every((p,j)=>distance(p,bs[i][j])<=tol));};
 paths.forEach((path,index)=>{const a=vertex(path.start),b=vertex(path.segments.at(-1).at(-1));if(edges.some(e=>(e.a===a&&e.b===b&&sameCurve(path,e.path,false))||(e.a===b&&e.b===a&&sameCurve(path,e.path,true))))return;
 const e={a,b,path,index,id:edges.length};edges.push(e);for(const reverse of [false,true]){const c=reverse?path.segments.at(-1):path.segments[0],t=tangent(c,reverse?1:0),v=reverse?-1:1;const h={edge:e,reverse,from:reverse?b:a,to:reverse?a:b,angle:Math.atan2(v*t.y,v*t.x)};nodes[h.from].out.push(h);}
 });
 if(!nodes.some(n=>n.out.length>2))return null;
 nodes.forEach(n=>n.out.sort((a,b)=>a.angle-b.angle));const visited=new Set(),faces=[];
 for(const n of nodes)for(const start of n.out){const key=h=>h.edge.id+':'+h.reverse;if(visited.has(key(start)))continue;const ring=[];let h=start;
 for(let step=0;step<=edges.length*2;step++){if(visited.has(key(h)))break;visited.add(key(h));ring.push(h);const out=nodes[h.to].out,j=out.findIndex(o=>o.edge===h.edge&&o.reverse!==h.reverse);h=out[(j+out.length-1)%out.length];if(h===start)break;}
 if(h!==start)continue;const points=ring.flatMap(h=>{let cs=h.reverse?[...h.edge.path.segments].reverse().map(c=>[...c].reverse()):h.edge.path.segments;return cs.flatMap(c=>Array.from({length:c.length===2?1:24},(_,i)=>evaluate(c,i/(c.length===2?1:24))));});
 let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}
 if(area<=tol*tol)continue;const counts=new Map();ring.forEach(h=>counts.set(h.edge.id,(counts.get(h.edge.id)||0)+1));const boundary=ring.filter(h=>counts.get(h.edge.id)===1);if(boundary.length)faces.push({ring:boundary,points,area});
 }
 const usage=new Map();faces.forEach(f=>f.ring.forEach(h=>usage.set(h.edge.id,(usage.get(h.edge.id)||0)+1)));
 for(let i=faces.length-1;i>=0;i--){const f=faces[i];let perimeter=0;for(let j=0;j<f.points.length;j++)perimeter+=distance(f.points[j],f.points[(j+1)%f.points.length]);if(f.ring.every(h=>usage.get(h.edge.id)>1)&&f.area/(2*perimeter)<.05*units)faces.splice(i,1);}
 if(faces.length<2)return null;
 const contains=(f,p)=>{let v=false;for(let i=0;i<f.points.length;i++){const a=f.points[i],b=f.points[(i+1)%f.points.length];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)v=!v;}return v;};
 // Nested closed loops remain holes of the containing part.
 const outer=faces.filter(f=>!faces.some(q=>q!==f&&q.area>f.area+tol*tol&&f.points.every(p=>contains(q,p))));
 const resultPaths=[],parts=[],inside=[];const used=new Set();
 outer.forEach(f=>{
  const pieces=f.ring.map(h=>{used.add(h.edge.id);return {segments:h.reverse?[...h.edge.path.segments].reverse().map(c=>[...c].reverse()):h.edge.path.segments};});
  const joins=(a,b)=>{const last=a.segments.at(-1),first=b.segments[0],u=tangent(last,1),v=tangent(first,0);return distance(last.at(-1),first[0])<=tol&&u.x*v.x+u.y*v.y>=Math.cos(Math.PI/12)-1e-9;};
  const firstBreak=pieces.findIndex((p,i)=>!joins(p,pieces[(i+1)%pieces.length]));
  const ordered=firstBreak<0?pieces:[...pieces.slice(firstBreak+1),...pieces.slice(0,firstBreak+1)],runs=[];
  for(const piece of ordered){if(runs.length&&joins(runs.at(-1),piece))runs.at(-1).segments.push(...piece.segments);else runs.push({segments:[...piece.segments]});}
  const indices=[];for(const run of runs){indices.push(resultPaths.length);resultPaths.push({start:run.segments[0][0],segments:run.segments,closed:firstBreak<0});inside.push(1);}parts.push({indices,face:f});
 });
 edges.forEach(e=>{if(used.has(e.id))return;const p=evaluate(e.path.segments[0],.5);const owner=parts.filter(p=>p.face&&contains(p.face,evaluate(e.path.segments[0],.5))).sort((a,b)=>a.face.area-b.face.area)[0];if(owner){owner.indices.push(resultPaths.length);resultPaths.push(e.path);inside.push(null);}else{parts.push({indices:[resultPaths.length],face:null});resultPaths.push(e.path);inside.push(null);}});
 for(const part of parts){const ps=part.indices.flatMap(i=>resultPaths[i].segments.flat()),xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);part.box=[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];delete part.face;}
 if(resultPaths.length>1000)throw Error('領域分割後の辺が1000本を超えます。');return {paths:resultPaths,parts,inside};
}
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
function sameRegion(a,b){if(state.pathSources[a]!==state.pathSources[b])return false;const si=state.pathSources[a],s=state.sources[si];if(!s?.regionSplit)return true;const first=state.pathSources.indexOf(si);return s.parts.some(p=>p.indices.includes(a-first)&&p.indices.includes(b-first));}
function partShift(source,pi){const o=state.partOffsets[source.id+':'+pi]||{x:0,y:0};return {x:o.x*source.scale,y:o.y*source.scale};}
function pathShift(i){const si=state.pathSources[i],source=state.sources[si];if(!source)return {x:0,y:0};const local=i-state.pathSources.indexOf(si);return partShift(source,source.parts.findIndex(p=>p.indices.includes(local)));}
function lineShift(name){return pathShift(+$('path'+name).value);}
function syncPartLayout(){
 let layer=$('partDrawing');if(!layer){layer=node('g',{id:'partDrawing','pointer-events':'none'},$('camera'));$('camera').insertBefore(layer,$('neighbors'));}layer.replaceChildren();
 const moved=Object.values(state.partOffsets).some(o=>o.x||o.y);$('drawing').style.display=moved?'none':'';
 if(moved)state.sources.forEach(source=>source.parts.forEach((part,pi)=>{const shift=partShift(source,pi),g=node('g',{transform:`translate(${source.tx+shift.x} ${source.ty+shift.y}) scale(${source.scale})`},layer);for(const i of part.indices)node('path',{d:pathD(source.paths[i]),fill:'none',stroke:'black','stroke-width':1,'vector-effect':'non-scaling-stroke'},g);}));
 const translate=(el,shift)=>el.setAttribute('transform',`translate(${shift.x} ${shift.y})`);
 for(const el of $('guides').children)translate(el,el.hasAttribute('data-path')?pathShift(+el.dataset.path):lineShift(el.dataset.line||'A'));
 for(const el of $('holes').children)translate(el,el.hasAttribute('data-path')?pathShift(+el.dataset.path):lineShift(el.dataset.hole?.[0]||'A'));
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
 const doc=new DOMParser().parseFromString(text,'image/svg+xml'),parsed=validateDocument(doc),box=parsed.box,regions=enclosedRegions(parsed.paths,box[2]/210),paths=regions?.paths||parsed.paths;
 const parts=regions?.parts||detectParts(paths,box[2]/210);let inside=regions?.inside||Array(paths.length).fill(null),insideError='内側を判定できません。右／左を手動で選んでください。';
 for(const part of regions?[]:parts){
  let indices=[...part.indices],changed=true;
  while(changed){changed=false;const counts=new Map(),key=p=>Math.round(p.x/(box[2]/210*.000001))+','+Math.round(p.y/(box[2]/210*.000001));
   for(const i of indices)for(const point of [paths[i].start,paths[i].segments.at(-1).at(-1)])counts.set(key(point),(counts.get(key(point))||0)+1);
   const next=indices.filter(i=>counts.get(key(paths[i].start))>=2&&counts.get(key(paths[i].segments.at(-1).at(-1)))>=2);changed=next.length!==indices.length;indices=next;
  }
  try{const sides=interiorSides(indices.map(i=>paths[i]),box[2]/210);indices.forEach((i,k)=>inside[i]=sides[k]);}catch(e){insideError=e.message;}
 }
 return {doc,text,name,box,paths,inside,insideError,parts,regionSplit:!!regions,id:++sourceSequence};
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
  const select=$('path'+name);select.replaceChildren(new Option('未選択',''));state.paths.forEach((_,i)=>select.append(new Option(pathLabel(i),String(i))));
  for(const end of ['start','end']){
   const corners=$('corner'+end+name);corners.replaceChildren(new Option('揃えない',''),new Option('壁から3mmに自動調整','auto'));
   state.paths.forEach((_,i)=>corners.append(new Option(pathLabel(i),String(i))));
  }
 }
}
function resetLine(name,index){
 $('path'+name).value=index;state.chains[name]=curveChain(+index);$('side'+name).value='auto';$('start'+name).value=0;$('end'+name).value=100;
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
 for(const fixed of document.querySelectorAll('[data-fixed-label]')){const key=fixed.dataset.part,source=state.sources.find(s=>key.startsWith(s.id+':'));if(!source)continue;const d=partShift(source,+key.split(':')[1]);fixed.setAttribute('transform',`translate(${+fixed.dataset.x+d.x} ${+fixed.dataset.y+d.y}) scale(${1/scale})`);}
 for(const marker of $('markers').children){const shift=marker.hasAttribute('data-path')?pathShift(+marker.dataset.path):lineShift(marker.dataset.endpoint?.slice(-1)||'A');marker.setAttribute('transform',`translate(${+marker.dataset.x+shift.x} ${+marker.dataset.y+shift.y}) scale(${1/scale})`);}
}
function applyView(){$('camera').setAttribute('transform',`rotate(${state.rotation})`);$('rotationLabel').textContent=`表示 ${Math.round(state.rotation)}°`;$('canvas').setAttribute('viewBox',state.view.join(' '));updateMarkerScale();}
new ResizeObserver(updateMarkerScale).observe($('canvas'));
function viewLocal(x,y){return new DOMPoint(x,y).matrixTransform($('canvas').getScreenCTM().inverse());}
function local(x,y){return new DOMPoint(x,y).matrixTransform($('camera').getScreenCTM().inverse());}
function rotatedBox(box,angle=state.rotation){const m=new DOMMatrix().rotate(angle),[x,y,w,h]=box,ps=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([a,b])=>new DOMPoint(a,b).matrixTransform(m));const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);return [Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];}

function zoom(factor,x,y){
 const before=viewLocal(x,y),v=state.view,w=Math.max(state.base[2]/40,Math.min(state.base[2]*4,v[2]/factor)),ratio=w/v[2];
 state.view=[before.x+(v[0]-before.x)*ratio,before.y+(v[1]-before.y)*ratio,w,v[3]*ratio];applyView();
}
for(const [id,f] of [['plus',1.4],['minus',1/1.4]])$(id).onclick=()=>{const r=$('canvas').getBoundingClientRect();zoom(f,r.x+r.width/2,r.y+r.height/2);checkpoint();};
$('fit').onclick=()=>{const boxes=state.sources.flatMap(s=>s.parts.map((p,i)=>{const d=partShift(s,i);return [p.box[0]*s.scale+s.tx+d.x,p.box[1]*s.scale+s.ty+d.y,p.box[2]*s.scale,p.box[3]*s.scale];}));const x=Math.min(...boxes.map(b=>b[0])),y=Math.min(...boxes.map(b=>b[1]));state.view=rotatedBox([x,y,Math.max(...boxes.map(b=>b[0]+b[2]))-x,Math.max(...boxes.map(b=>b[1]+b[3]))-y]);applyView();checkpoint();};
$('mode').onchange=()=>{if(lineNames.includes($('mode').value))$('active').value=$('mode').value;renderCornerSelections();$('modeHint').textContent=`現在のモード：${$('mode').selectedOptions[0].textContent} ／ 編集対象：${$('active').value}。ドラッグで上下左右に移動、2本指で拡大・移動。タップで選択・端点指定。`};$('active').onchange=()=>{if(lineNames.includes($('mode').value))$('mode').value=$('active').value;$('mode').onchange();};
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
 for(const i of candidates){const whole=!lineNames.includes(mode)&&!corner,name=$('active').value,key=i+':'+units+(whole?':'+JSON.stringify(state.chains[name]):'');if(!state.cache.has(key))state.cache.set(key,prepare(whole?editorPath(name,i):state.paths[i],units));const prep=state.cache.get(key);let passed=0;for(const table of prep.tables){const shift=pathShift(i),match=nearest(table.points,{x:p.x-shift.x,y:p.y-shift.y});if(match.d<best.d)best={d:match.d,index:i,percent:100*(passed+match.s)/prep.total};passed+=table.len;}}
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
 if(state.latest&&draftSignature()!==state.committedSignature)state.latest.result.rows.forEach((row,j)=>{if(state.latest.rowSources[j]!==sourceIndex)return;row.holes.forEach((p,i)=>appendHole({x:(p.x-source.tx)/source.scale,y:(p.y-source.ty)/source.scale},state.latest.diameter*units/2,`${state.latest.rowNames?.[j]||lineNames[j]}_${String(i+1).padStart(2,'0')}`));});
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(root);
}
function draftSignature(){return JSON.stringify({sources:state.sources.map(s=>s.id),chains:$('seamMode').value==='sequence'?null:state.chains,sections:$('seamMode').value==='sequence'?state.sections:null,values:fields().map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])});}
function renderFixed(){
 renderLibrary();
 let layer=$('fixedHoles');if(!layer){layer=node('g',{id:'fixedHoles','pointer-events':'none'},$('camera'));$('camera').insertBefore(layer,$('holes'));}layer.replaceChildren();
 $('fixedList').replaceChildren();$('fixedSummary').textContent=state.fixed.length?`${state.fixed.length}件の配置を固定済み。次の辺を選んで続けられます。`:'配置を固定すると、次の編集をしても針穴が残ります。';
 state.sources.forEach((s,i)=>{const locked=state.fixed.some(g=>g.rows.some(r=>r.sourceId===s.id));$(i?'width'+(i+1):'width').disabled=locked;if($(i?'file'+(i+1):'file'))$(i?'file'+(i+1):'file').disabled=locked;if(i===0)$('sample').disabled=locked;});
 state.fixed.forEach((set,index)=>{
  for(const row of set.rows){const source=state.sources.find(s=>s.id===row.sourceId);if(!source)continue;for(const points of row.guides||[])node('path',{d:points.map((p,i)=>`${i?'L':'M'}${p.x*source.scale+source.tx},${p.y*source.scale+source.ty}`).join(' '),fill:'none',stroke:['#3b7759','#8564a7','#b77735','#397b91'][index%4],'stroke-width':2,'stroke-dasharray':'6 4','vector-effect':'non-scaling-stroke','data-fixed-set':index+1,'data-part':row.sourceId+':'+row.partIndex,'data-fixed-edge':row.name},layer);row.holes.forEach(p=>node('circle',{cx:p.x*source.scale+source.tx,cy:p.y*source.scale+source.ty,r:row.radius*source.scale,'data-part':row.sourceId+':'+row.partIndex,fill:'#375c48','fill-opacity':.7,stroke:'white','stroke-width':.7,'vector-effect':'non-scaling-stroke'},layer));if(row.numbers)for(const [p,end,number] of [[row.holes[0],'始点',row.numbers[0]],[row.holes.at(-1),'終点',row.numbers[1]]]){const g=node('g',{'data-fixed-label':row.name,'data-part':row.sourceId+':'+row.partIndex,'data-x':p.x*source.scale+source.tx,'data-y':p.y*source.scale+source.ty},layer);node('text',{x:8,y:end==='始点'?-10:22,style:'font-size:14px;fill:#375c48;stroke:white;stroke-width:3px;paint-order:stroke'},g).textContent=`${row.name}${end} #${number}`;}}
  const line=document.createElement('div');line.className='result';const label=document.createElement('span');label.textContent=`配置${index+1} · ${set.label} · ${set.rows.map(r=>r.holes.length).join(' / ')}穴 `;const remove=document.createElement('button');remove.textContent='固定を外す';remove.onclick=()=>{state.fixed.splice(index,1);calculate();};line.append(label,remove);$('fixedList').append(line);
 });
}
$('fixSet').onclick=()=>{
 calculate();if(!state.latest||draftSignature()===state.committedSignature)return;
 const latest=state.latest;const rows=latest.result.rows.map((row,j)=>{const source=state.sources[latest.rowSources[j]];const local=(latest.rowPaths?.[j]??+$('path'+lineNames[j]).value)-state.pathSources.indexOf(latest.rowSources[j]);const guides=(j===0&&latest.result.parts?latest.result.parts:[latest.lines[j]]).map(l=>l.points.map(p=>({x:(p.x-source.tx)/source.scale,y:(p.y-source.ty)/source.scale})));return {sourceId:source.id,partIndex:source.parts.findIndex(p=>p.indices.includes(local)),guides,numbers:latest.rowNumbers?.[j],name:latest.rowNames?.[j]||lineNames[j],radius:latest.diameter*source.box[2]/source.width/2,holes:row.holes.map(p=>({x:(p.x-source.tx)/source.scale,y:(p.y-source.ty)/source.scale}))};});
 state.fixed.push({rows,label:$('seamMode').selectedOptions[0].textContent});state.committedSignature=draftSignature();calculate();message('この配置を固定しました。次の辺を選んで続けてください。');
};
$('singleModeButton').onclick=()=>{$('seamMode').value='single';calculate();message('1辺だけに配置します。パーツや辺Aを選んでください。');};
$('pairModeButton').onclick=()=>{$('seamMode').value='pair';calculate();message('辺A・Bの組み合わせに配置します。');};
function printParts(){
 const items=[];
 state.sources.forEach((source,si)=>source.parts.forEach((part,pi)=>{
  const holes=[];
  state.fixed.forEach(set=>set.rows.filter(r=>r.sourceId===source.id&&r.partIndex===pi).forEach(row=>row.holes.forEach(p=>holes.push({...p,r:row.radius}))));
  if(state.latest&&draftSignature()!==state.committedSignature)state.latest.result.rows.forEach((row,j)=>{const index=(state.latest.rowPaths?.[j]??+$('path'+lineNames[j]).value)-state.pathSources.indexOf(si);if(state.latest.rowSources[j]!==si||!part.indices.includes(index))return;row.holes.forEach(p=>holes.push({x:(p.x-source.tx)/source.scale,y:(p.y-source.ty)/source.scale,r:state.latest.diameter*source.box[2]/source.width/2}));});
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
const drawerItems=['seamModeControls','lineFields','fixedSummary','fixedList'].map(id=>{const el=$(id),anchor=document.createComment('drawer '+id);el.after(anchor);return {el,anchor};});
function closeLayers(){if($('layersDrawer').hidden)return;for(const {el,anchor} of drawerItems)anchor.parentNode.insertBefore(el,anchor);for(const line of document.querySelectorAll('#lineFields .line')){line.classList.remove('layer-collapsed');const h=line.querySelector('h3');h.removeAttribute('role');h.removeAttribute('tabindex');h.removeAttribute('aria-expanded');}$('layersDrawer').hidden=true;$('layersToggle').setAttribute('aria-expanded','false');$('layersToggle').focus({preventScroll:true});}
$('layersToggle').onclick=()=>{if(!$('layersDrawer').hidden){closeLayers();return;}for(const {el} of drawerItems)$(['seamModeControls','lineFields'].includes(el.id)?'layerEditor':'layerFixed').append(el);$('layersDrawer').hidden=false;for(const line of document.querySelectorAll('#lineFields .line')){const name=line.dataset.name,h=line.querySelector('h3'),collapsed=name!==$('active').value;line.classList.toggle('layer-collapsed',collapsed);h.setAttribute('role','button');h.tabIndex=0;h.setAttribute('aria-expanded',String(!collapsed));h.onclick=()=>{if($('layersDrawer').hidden)return;for(const other of document.querySelectorAll('#lineFields .line')){const closed=other!==line;other.classList.toggle('layer-collapsed',closed);other.querySelector('h3').setAttribute('aria-expanded',String(!closed));}$('active').value=name;if(lineNames.includes($('mode').value))$('mode').value=name;};h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();h.click();}};}$('layersToggle').setAttribute('aria-expanded','true');$('layersClose').focus({preventScroll:true});};$('layersClose').onclick=closeLayers;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLayers();});
$('addSelectionPreview').onclick=()=>{const name=$('active').value==='B'?'B':'A',add=$('addSection'+name);if(add.disabled){message('先にA/Bの辺を選んでください。');return;}add.onclick();$('mode').value=name;$('active').value=name;$('mode').onchange();closeLayers();message(`${name}${state.sectionSelected[name]+1}へ追加する辺をタップしてください。同じ辺なら始点・終点を変更できます。`);};
$('fixSetPreview').onclick=()=>{if(!$('fixSet').disabled)$('fixSet').onclick();};new MutationObserver(()=>$('fixSetPreview').disabled=$('fixSet').disabled).observe($('fixSet'),{attributes:true,attributeFilter:['disabled']});
$('clearSelection').onclick=()=>{closeLayers();for(const name of lineNames){$('path'+name).value='';state.chains[name]=null;for(const end of ['start','end'])$('corner'+end+name).value='';}state.sections=null;state.sectionSelected={A:0,B:0};state.sectionModeActive=false;state.committedSignature=null;for(const o of $('active').options)o.textContent=o.value;$('mode').value='A';$('active').value='A';calculate();message('編集中の選択をクリアしました。固定した配置は残しています。↶で戻せます。');};
// Read-only diagnostics used by the regression suite; no external requests.
window.stitch={state,loadSVG,loadSecondSVG,loadThirdSVG,importBatch,exportSVG,calculate,buildPrintDocument};
window.addEventListener('error',e=>{message('エラー：'+e.message);$('boot').textContent='エラーが発生しました';});
sample();
