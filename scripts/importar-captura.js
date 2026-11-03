import fs from 'node:fs';
import {initDatabase,run,all,transaction} from '../server/database.js';
await initDatabase();
const source=JSON.parse(fs.readFileSync('fixtures/resultados-captura.json','utf8'));
await transaction(async()=>{await run('DELETE FROM resultado_captura');for(const [i,r] of source.resultados.entries())await run('INSERT INTO resultado_captura(id,nombre,institucion,nivel,grado,puesto,puntaje,hora_entrega,rindio,fuente) VALUES(?,?,?,?,?,?,?,?,?,?)',[`captura-${String(i+1).padStart(3,'0')}`,r.nombre,r.institucion,r.nivel,r.grado,r.puesto,r.puntaje,r.hora_entrega,r.rindio?1:0,source.fuente]);await run("UPDATE configuracion SET valor='true' WHERE clave='publicados'");});
console.log(`Importados ${source.resultados.length} registros visibles de ${source.fuente}. Los DNI y pagos permanecen intactos.`);
