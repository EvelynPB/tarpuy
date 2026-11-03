import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync('referencias/ocr/filas.json','utf8'));
const schools=['IEP NUESTRA SEÑORA DEL ROSARIO','MIGUEL ÁNGEL ASTURIAS','CASTILLO DE TALENTOS','Nuestra Señora de Fátima','COLEGIO DE LIDERES','LEONARDO DA VINCI','JEAN PIAGET','Alumno libre','THALES'];
const overrides={
 'AYRA QUISPE BAYRON MILER':{hora_entrega:'09:20:00'},
 'Gonzales García Lucas Gael':{hora_entrega:'09:22:22'},
 'CHERO BELTRAN LEO COLIN':{hora_entrega:'09:27:00'},
 'Hideki Sam Quino Torres':{hora_entrega:'09:25:59'},
 'Paulo Gael Lucas Isidro':{hora_entrega:'09:37:00'},
 'Emma Choque Encinas':{hora_entrega:'09:43:00'},
 'RODRIGUEZ YARASCA ANDRE':{hora_entrega:'09:30:08'},
 'Mayte Alizee Esteban Barzola':{hora_entrega:'09:41:25'},
 'MANAYAY INOCENTE ANNIE CARLA':{hora_entrega:'09:36:43'},
 "NINAHUANCA BALTAZAR MISHEL ESTEFAN'":{nombre:'NINAHUANCA BALTAZAR MISHEL ESTEFANI'},
 'CRUZATT AVALOS ANGELA CAROLINA':{hora_entrega:'10:00:50'},
 'Atosca Garcia Salvador Thiago':{hora_entrega:'10:00:00'},
 'MACHACUAY QUISPE ADRIANO LIAM GAEL':{hora_entrega:'10:00:00'},
 'MATTHWS VICTOR ESPINOZA':{nombre:'MATTHWS VICTOR ESPINOZA'},
 'LIAM SEBASTIAN ARMAS LÁZARO':{hora_entrega:'09:34:32',puesto:1}
};
const results=[];
for(const row of rows){
 if(row.y<900)continue;
 const text=row.cols.join(' ').replace(/\s+/g,' ').trim();
 const school=schools.find(s=>text.includes(s));if(!school)continue;
 const split=text.indexOf(school);let before=text.slice(0,split).trim();const after=text.slice(split+school.length).trim();const score=after.match(/^(\d+\.\d{2})\b/);if(!score)continue;
 const rank=before.match(/^(\d+)\s+/);if(rank)before=before.slice(rank[0].length);
 let grade=null,level=null;if(row.y<2200){grade='Inicial - 4 años';level='Inicial';}else if(row.y<4160){grade='Inicial - 5 años';level='Inicial';}else if(row.y<5750){grade='1° de Primaria';level='Primaria';}else if(row.y<6000){grade='2° de Primaria';level='Primaria';}
 const absent=/No\s+rindi[oó]/i.test(after);
 const result={nombre:before,institucion:school,nivel:level,grado:grade,puesto:rank?Number(rank[1]):null,puntaje:Number(score[1]),hora_entrega:after.match(/\b\d{2}:\d{2}:\d{2}\b/)?.[0]??null,rindio:!absent,tipo:null,fuente_y:row.y};
 Object.assign(result,overrides[before]||{});results.push(result);
}
if(results.length!==99)throw new Error(`Se esperaban 99 filas recuperables; se extrajeron ${results.length}. Revisa la captura.`);
const source={fuente:'resultados-concursomat2026.fly.dev_resultados.png',total_indicado:416,no_rindieron_indicado:20,registros_recuperados:results.length,registros_no_visibles:416-results.length,nota:'Transcripción de los registros legibles de la captura aportada. Siete registros no tienen encabezado de grado visible. El tipo de colegio, los DNI y los datos administrativos no aparecen en la captura.',resultados:results};
fs.mkdirSync('fixtures',{recursive:true});fs.writeFileSync('fixtures/resultados-captura.json',JSON.stringify(source,null,2)+'\n');console.log(`Extraídos ${results.length} resultados; ${results.filter(r=>!r.grado).length} sin grado visible; ${results.filter(r=>!r.rindio).length} no rindieron.`);
