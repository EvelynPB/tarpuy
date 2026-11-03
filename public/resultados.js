import {$,esc,api,message} from './common.js';
let catalog=[],allResults=[],timer,mode='grade';
function updateGrades(){const selected=$('#grade').value;const list=catalog.filter(g=>!$('#level').value||g.nivel===$('#level').value);$('#grade').innerHTML='<option value="">Todos</option>'+list.map(g=>`<option>${esc(g.grado)}</option>`).join('');if(list.some(g=>g.grado===selected))$('#grade').value=selected;}
function render(){
 const search=$('#search').value.trim().toLocaleLowerCase('es'),school=$('#school').value,type=$('#type').value;
 const level=$('#level').value,grade=$('#grade').value;
 const rows=allResults.filter(r=>(!level||r.nivel===level)&&(!grade||r.grado===grade)&&(!school||r.institucion===school)&&(!search||r.nombre.toLocaleLowerCase('es').includes(search))&&(!type||(type==='Alumno libre'?r.institucion==='Alumno libre':r.institucion!=='Alumno libre')));
 const schools=[...new Set(allResults.map(r=>r.institucion))].sort((a,b)=>a.localeCompare(b,'es')),old=$('#school').value;
 $('#school').innerHTML='<option value="">Todos</option>'+schools.map(s=>`<option>${esc(s)}</option>`).join('');$('#school').value=old;
 $('#result-count').textContent=`${rows.length} de ${allResults.length} resultados · ${rows.filter(r=>!r.rindio).length} no rindieron`;
 $('#source-note').hidden=!allResults.length;$('#source-note').textContent='Resultados transcritos de la captura. Se recuperaron 99 de los 416 alumnos indicados; 317 filas no son visibles en la imagen. Siete registros no muestran su grado.';
 const grouped=new Map();for(const row of rows){const key=mode==='all'?'Ranking general':row.grado||'Grado no visible en la captura';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
 const grades=[...new Set(allResults.map(r=>r.grado).filter(Boolean))];$('#grade-chips').innerHTML=grades.map(g=>`<button type="button" class="${$('#grade').value===g?'active':''}" data-grade="${esc(g)}">${esc(g)}</button>`).join('');
 for(const chip of document.querySelectorAll('[data-grade]'))chip.onclick=()=>{$('#level').value='';$('#grade').value=$('#grade').value===chip.dataset.grade?'':chip.dataset.grade;updateGrades();load();};
 $('#results-table').innerHTML=rows.length?[...grouped].map(([title,items])=>`<section class="result-group"><h2>${esc(title)}</h2><div class="table-wrap"><table><thead><tr><th>Mérito ▲</th><th>Alumno</th><th>Colegio</th><th>Puntaje</th><th>Hora de entrega</th></tr></thead><tbody>${items.map((r,i)=>`<tr class="${r.rindio?'':'did-not-attend'}"><td>${r.rindio?(mode==='grade'?r.puesto:i+1):'—'}</td><td class="name">${esc(r.nombre)}</td><td class="name">${esc(r.institucion)}</td><td class="score">${Number(r.puntaje).toFixed(2)}${r.rindio?'':' <span class="muted">No rindió</span>'}</td><td>${esc(r.hora_entrega||'—')}</td></tr>`).join('')}</tbody></table></div></section>`).join(''):'<div class="empty"><h2>No se encontraron resultados</h2><p>Prueba con otro nombre o colegio.</p></div>';
}
async function load(){try{const params=new URLSearchParams({nivel:$('#level').value,grado:$('#grade').value});const data=await api('/api/resultados?'+params);$('#message').hidden=true;$('#waiting').hidden=data.publicados;$('#published').hidden=!data.publicados;allResults=data.resultados||[];render();}catch(e){message(e.message);}}
$('#level').onchange=()=>{updateGrades();load();};$('#grade').onchange=load;$('#search').oninput=()=>{clearTimeout(timer);timer=setTimeout(render,150);};$('#school').onchange=render;$('#type').onchange=render;$('#refresh').onclick=load;
$('#grade-mode').onclick=()=>{mode='grade';$('#grade-mode').setAttribute('aria-selected','true');$('#overall-mode').setAttribute('aria-selected','false');render();};
$('#overall-mode').onclick=()=>{mode='all';$('#grade-mode').setAttribute('aria-selected','false');$('#overall-mode').setAttribute('aria-selected','true');render();};
$('#clear').onclick=()=>{$('#level').value='';$('#grade').value='';$('#school').value='';$('#type').value='';$('#search').value='';updateGrades();load();};
try{catalog=(await api('/api/catalogo')).grados;updateGrades();await load();}catch(e){message(e.message);}
setInterval(()=>{if(!document.hidden)load();},20000);
