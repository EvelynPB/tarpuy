import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {randomBytes,randomUUID,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {all,run,transaction,initDatabase,engine} from './database.js';
import {grades,fail,required,student} from './catalog.js';
import {workbook} from './excel.js';
await initDatabase();
const production=process.env.NODE_ENV==='production';
let bcrypt;try{bcrypt=await import('bcryptjs');}catch{}
if(production&&!bcrypt)throw new Error('Instala las dependencias para usar bcrypt en producción.');
if(production&&!process.env.ADMIN_PASSWORD_HASH&&!process.env.ADMIN_PASSWORD)throw new Error('Configura ADMIN_PASSWORD_HASH o ADMIN_PASSWORD.');
const passwordSalt=randomBytes(16);
const passwordHash=process.env.ADMIN_PASSWORD_HASH||(process.env.ADMIN_PASSWORD?(bcrypt?await bcrypt.hash(process.env.ADMIN_PASSWORD,12):scryptSync(process.env.ADMIN_PASSWORD,passwordSalt,64)):null);
const tokenHash=t=>createHash('sha256').update(t).digest('hex');
const limits=new Map();
setInterval(()=>{const now=Date.now();for(const[k,v]of limits)if(v.until<now)limits.delete(k);run('DELETE FROM sesion WHERE expira < ?',[now]).catch(()=>{});},60000).unref();
function rate(req,kind,max){const key=kind+req.socket.remoteAddress;let hit=limits.get(key);if(!hit||hit.until<Date.now()){hit={count:0,until:Date.now()+60000};limits.set(key,hit);}if(++hit.count>max)fail('Demasiados intentos. Vuelve a intentar en un minuto.',429);}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
async function body(req){const chunks=[];let length=0;for await(const part of req){length+=part.length;if(length>1024*1024)fail('El archivo o formulario supera 1 MB.',413);chunks.push(part);}let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{fail('JSON inválido.');}if(!parsed||typeof parsed!=='object')fail('El cuerpo debe ser un objeto JSON.');return parsed;}
function sessionToken(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tarpuy_session='))?.slice(15)||'';}
async function auth(req){const token=sessionToken(req);if(!token||!(await all('SELECT token FROM sesion WHERE token = ? AND expira > ?',[tokenHash(token),Date.now()])).length)fail('Inicia sesión para acceder al panel.',401);}
function cookie(res,token,age=28800){res.setHeader('Set-Cookie',`tarpuy_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${production?'; Secure':''}`);}
async function published(){return(await all("SELECT valor FROM configuracion WHERE clave='publicados'"))[0].valor==='true';}
function contact(value,name){const v=required(value,name,9);if(!/^\d{6,9}$/.test(v))fail(`${name}: ingresa entre 6 y 9 dígitos.`);return v;}
function payment(b){const operacion=required(b.operacion,'N.° de operación',200);if(!/^[a-zA-Z0-9-]+(?:\s*,\s*[a-zA-Z0-9-]+)*$/.test(operacion))fail('Separa los números de operación con comas.');if(!['Yape','Transferencia'].includes(b.medio))fail('Selecciona el medio de pago.');return{operacion,medio:b.medio,pagador:required(b.pagador,'Nombre del pagador')};}
async function register(b,modalidad){
 if(b.consentimiento!==true)fail('Debes aceptar el tratamiento de datos para inscribirte.');
 const pay=payment(b);let students,advisors=[],institution,data;
 if(modalidad==='delegacion'){
   institution=required(b.institucion,'Nombre de la I.E.');
   data={director:required(b.director,'Director(a)'),direccion:required(b.direccion,'Dirección'),telefono:contact(b.telefono,'Teléfono'),correo:required(b.correo,'Correo'),tipo:b.tipo,consentimiento:true};
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo))fail('Ingresa un correo válido.');if(!['Estatal','Privado'].includes(data.tipo))fail('Selecciona el tipo de I.E.');
   if(!Array.isArray(b.alumnos)||!b.alumnos.length||b.alumnos.length>120)fail('Agrega al menos un alumno (máximo 10 por grado).');students=b.alumnos.map(student);
   for(const g of grades)if(students.filter(s=>s.grado===g.grado).length>10)fail(`Máximo 10 alumnos en ${g.grado}.`);
   for(const nivel of new Set(students.map(s=>s.nivel))){const a=b.asesores?.find(x=>x.nivel===nivel);if(!a)fail(`Falta el asesor de ${nivel}.`);advisors.push({nivel,nombre:required(a.nombre,`Asesor de ${nivel}`),telefono:contact(a.telefono,`Teléfono del asesor de ${nivel}`)});}
 }else{students=[student(b)];institution=required(b.institucion||'Alumno libre','Institución');data={telefono:contact(b.telefono,'Teléfono'),consentimiento:true};}
 const amount=students.length*(modalidad==='delegacion'?13:15),id=randomUUID();
 await transaction(async()=>{
  for(const s of students)if((await all('SELECT id FROM alumno WHERE dni = ?',[s.dni])).length)fail(`El DNI ${s.dni} ya está inscrito.`,409);
  if(new Set(students.map(s=>s.dni)).size!==students.length)fail('Hay DNI repetidos en la inscripción.',409);
  await run('INSERT INTO inscripcion(id,modalidad,institucion,datos,operacion,medio,pagador,monto,creado) VALUES(?,?,?,?,?,?,?,?,?)',[id,modalidad,institution,JSON.stringify(data),pay.operacion,pay.medio,pay.pagador,amount,new Date().toISOString()]);
  for(const s of students)await run('INSERT INTO alumno(id,inscripcion_id,dni,nombre,nivel,grado) VALUES(?,?,?,?,?,?)',[randomUUID(),id,s.dni,s.nombre,s.nivel,s.grado]);
  for(const a of advisors)await run('INSERT INTO asesor(id,inscripcion_id,nivel,nombre,telefono) VALUES(?,?,?,?,?)',[randomUUID(),id,a.nivel,a.nombre,a.telefono]);
 });return{id,codigo:'TAR-'+id.slice(0,8).toUpperCase(),alumnos:students.length,monto:amount,message:'Inscripción registrada. El pago está pendiente de verificación.'};
}
async function adminData(){
 const registrations=await all('SELECT * FROM inscripcion ORDER BY creado DESC');
 const alumnos=await all('SELECT a.*,i.institucion,i.modalidad,i.verificado,r.puntaje,r.correctas,r.incorrectas,r.blanco FROM alumno a JOIN inscripcion i ON i.id=a.inscripcion_id LEFT JOIN resultado r ON r.alumno_id=a.id ORDER BY a.nombre');
 const asesores=await all('SELECT * FROM asesor');const counts=new Map();
 for(const r of registrations)for(const op of new Set(r.operacion.split(',').map(o=>o.trim().toLowerCase())))counts.set(op,(counts.get(op)||0)+1);
 return{publicados:await published(),inscripciones:registrations.map(r=>({...r,datos:JSON.parse(r.datos),alumnos:alumnos.filter(a=>a.inscripcion_id===r.id),asesores:asesores.filter(a=>a.inscripcion_id===r.id),duplicado:r.operacion.split(',').some(o=>counts.get(o.trim().toLowerCase())>1)})),alumnos};
}
async function scores(b){
 const values=Array.isArray(b)?b:b.resultados;if(!Array.isArray(values)||!values.length||values.length>5000)fail('Envía entre 1 y 5000 resultados.');
 const seen=new Set();await transaction(async()=>{for(const row of values){
  if(!row||typeof row!=='object')fail('Fila de puntaje inválida.');const dni=required(row.dni,'DNI',8);if(seen.has(dni))fail(`DNI repetido en la importación: ${dni}.`);seen.add(dni);
  const s=(await all('SELECT a.id,i.verificado FROM alumno a JOIN inscripcion i ON i.id=a.inscripcion_id WHERE a.dni=?',[dni]))[0];if(!s)fail(`No existe el DNI ${dni}.`);if(!s.verificado)fail(`El pago del DNI ${dni} no está verificado.`);
  if(row.puntaje===''||row.puntaje===null||row.puntaje===undefined)fail(`Falta el puntaje de ${dni}.`);const points=Number(row.puntaje);if(!Number.isFinite(points)||points<0||points>10000)fail(`Puntaje inválido para ${dni}.`);
  const nums=['correctas','incorrectas','blanco'].map(k=>{const n=Number(row[k]??0);if(!Number.isInteger(n)||n<0||n>1000)fail(`Cantidad de respuestas inválida para ${dni}.`);return n;});
  await run('INSERT INTO resultado(alumno_id,puntaje,correctas,incorrectas,blanco,actualizado) VALUES(?,?,?,?,?,?) ON CONFLICT(alumno_id) DO UPDATE SET puntaje=excluded.puntaje,correctas=excluded.correctas,incorrectas=excluded.incorrectas,blanco=excluded.blanco,actualizado=excluded.actualizado',[s.id,points,...nums,new Date().toISOString()]);
 }});return{message:`${values.length} puntaje(s) guardado(s).`};
}
async function ranking(search){
 let rows=await all('SELECT a.nombre,a.dni,a.nivel,a.grado,i.institucion,r.puntaje,r.correctas,r.incorrectas,r.blanco FROM resultado r JOIN alumno a ON a.id=r.alumno_id JOIN inscripcion i ON i.id=a.inscripcion_id WHERE i.verificado=1 ORDER BY r.puntaje DESC,r.correctas DESC,r.incorrectas ASC,a.nombre ASC');
 const imported=await all('SELECT id,nombre,institucion,nivel,grado,puesto,puntaje,hora_entrega,rindio FROM resultado_captura');for(const r of imported)rows.push({...r,dni:null,correctas:0,incorrectas:0,blanco:0,rindio:Boolean(r.rindio),importado:true});
 const group=new Map();rows=rows.map(r=>{const g=group.get(r.grado)||{count:0,rank:0,key:''};g.count++;const key=`${r.puntaje}/${r.correctas}/${r.incorrectas}`;if(key!==g.key){g.rank=g.count;g.key=key;}group.set(r.grado,g);return{...r,puesto:g.rank};});
 const q=(search.get('q')||'').trim().toLocaleLowerCase('es');return rows.filter(r=>(!search.get('nivel')||r.nivel===search.get('nivel'))&&(!search.get('grado')||r.grado===search.get('grado'))&&(!q||r.nombre.toLocaleLowerCase('es').includes(q)||(/^\d{8}$/.test(q)&&r.dni===q))).map(({dni,...r})=>r);
}
export async function handler(req,res){
 try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
  const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
  if(path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(method)){
    if(!req.headers['content-type']?.startsWith('application/json'))fail('Se requiere Content-Type application/json.',415);
    if(req.headers['sec-fetch-site']==='cross-site')fail('Origen no permitido.',403);
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail('Origen no permitido.',403);
  }
  if(path==='/api/health')return json(res,{ok:true});
  if(path==='/api/catalogo')return json(res,{grados:grades,precios:{delegacion:13,libre:15},adminConfigurado:!!passwordHash});
  if(path==='/api/admin/login'&&method==='POST'){
   rate(req,'login',10);const b=await body(req);if(!passwordHash)fail('Configura ADMIN_PASSWORD en el archivo .env y reinicia el servidor.',503);
   const pass=typeof b.password==='string'?b.password:'';if(pass.length>256)fail('Contraseña inválida.',401);
   let valid;if(typeof passwordHash==='string'){if(!bcrypt)fail('Instala bcryptjs para usar ADMIN_PASSWORD_HASH.',503);valid=await bcrypt.compare(pass,passwordHash);}else{valid=timingSafeEqual(scryptSync(pass,passwordSalt,64),passwordHash);}
   if(!valid)fail('Contraseña incorrecta.',401);const token=randomBytes(32).toString('hex');await run('INSERT INTO sesion(token,expira) VALUES(?,?)',[tokenHash(token),Date.now()+28800000]);cookie(res,token);return json(res,{ok:true});
  }
  if(path.startsWith('/api/admin/'))await auth(req);
  if(path==='/api/admin/logout'&&method==='POST'){await run('DELETE FROM sesion WHERE token=?',[tokenHash(sessionToken(req))]);cookie(res,'',0);return json(res,{ok:true});}
  if(path==='/api/admin/data'&&method==='GET')return json(res,await adminData());
  if(path==='/api/fichas'&&method==='POST'){rate(req,'register',20);return json(res,await register(await body(req),'delegacion'),201);}
  if(path==='/api/libres'&&method==='POST'){rate(req,'register',20);return json(res,await register(await body(req),'libre'),201);}
  if(path==='/api/admin/verify'&&method==='PATCH'){const b=await body(req);if(typeof b.verificado!=='boolean')fail('Verificación inválida.');if(!(await all('SELECT id FROM inscripcion WHERE id=?',[b.id||''])).length)fail('Inscripción no encontrada.',404);await run('UPDATE inscripcion SET verificado=? WHERE id=?',[b.verificado?1:0,b.id]);return json(res,{ok:true});}
  if(path==='/api/admin/resultados'&&method==='POST')return json(res,await scores(await body(req)));
  if(path==='/api/admin/publicacion'&&method==='PATCH'){const b=await body(req);if(typeof b.publicados!=='boolean')fail('Publicación inválida.');if(b.publicados&&!(await all('SELECT r.alumno_id FROM resultado r JOIN alumno a ON a.id=r.alumno_id JOIN inscripcion i ON i.id=a.inscripcion_id WHERE i.verificado=1 LIMIT 1')).length)fail('Registra al menos un puntaje con pago verificado antes de publicar.');await run("UPDATE configuracion SET valor=? WHERE clave='publicados'",[String(b.publicados)]);return json(res,{publicados:b.publicados});}
  if(path==='/api/resultados'&&method==='GET'){const visible=await published();return json(res,{publicados:visible,resultados:visible?await ranking(url.searchParams):[]});}
  if(path==='/api/admin/export.xlsx'&&method==='GET'){
   const data=await adminData(),official=url.searchParams.get('oficial')==='1';const rows=[['DNI','Apellidos y nombres','Institución','Nivel','Grado','Modalidad','Pago verificado','Puntaje']];for(const a of data.alumnos)if(!official||a.verificado)rows.push([a.dni,a.nombre,a.institucion,a.nivel,a.grado,a.modalidad,a.verificado?'Sí':'No',a.puntaje??'']);res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="inscritos-tarpuy-2026.xlsx"'});return res.end(workbook(rows));
  }
  if(path.startsWith('/api/'))fail('Ruta no encontrada.',404);
  if(!['GET','HEAD'].includes(method))fail('Método no permitido.',405);
  const pages={'/':'index.html','/inscripciones':'index.html','/resultados':'resultados.html','/admin':'admin.html'};
  let file=pages[path];if(!file&&/^\/(?:assets\/)?[a-zA-Z0-9_.-]+$/.test(path))file=path.slice(1);if(!file)fail('Página no encontrada.',404);
  let content;try{content=await readFile(resolve('public',file));}catch{fail('Página no encontrada.',404);}
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(method==='HEAD'?undefined:content);
 }catch(error){if(res.headersSent){res.end();return;}const status=error.status||(error.code?.includes('CONSTRAINT')?409:500);if(status===500)console.error(error);json(res,{error:status===500?'No se pudo procesar la solicitud. Inténtalo de nuevo.':error.message},status);}
}
let express;try{express=(await import('express')).default;}catch{}
if(production&&!express)throw new Error('Instala Express antes de desplegar.');
const server=express?createServer(express().disable('x-powered-by').use(handler)):createServer(handler);
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>{console.log(`Tarpuy 2026: http://${host}:${port}`);console.log(`${express?'Express':'HTTP nativo (modo local sin dependencias)'} · ${engine}`);if(!passwordHash)console.log('Panel deshabilitado: configura ADMIN_PASSWORD en .env.');});
