import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage();
let sqlite,orm;
if(process.env.NODE_ENV==='production'&&!process.env.DATABASE_URL)throw new Error('Configura DATABASE_URL con PostgreSQL para producción.');
if(process.env.DATABASE_URL){const {Sequelize}=await import('sequelize');orm=new Sequelize(process.env.DATABASE_URL,{logging:false,dialectOptions:process.env.DATABASE_SSL==='true'?{ssl:{require:true,rejectUnauthorized:true}}:{}});await orm.authenticate();}
else{const {DatabaseSync}=await import('node:sqlite');const directory=resolve(process.env.DATA_DIR||'data');mkdirSync(directory,{recursive:true});sqlite=new DatabaseSync(resolve(directory,'tarpuy.sqlite'));sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');}
export const engine=orm?'PostgreSQL / Sequelize':'SQLite local / node:sqlite';
export async function all(sql,params=[]){if(orm){const [rows]=await orm.query(sql,{replacements:params,transaction:context.getStore()});return rows;}return sqlite.prepare(sql).all(...params);}
export async function run(sql,params=[]){if(orm){await orm.query(sql,{replacements:params,transaction:context.getStore()});return;}sqlite.prepare(sql).run(...params);}
let queue=Promise.resolve();
export function transaction(work){const job=queue.then(async()=>{if(orm)return orm.transaction(t=>context.run(t,work));await run('BEGIN');try{const result=await work();await run('COMMIT');return result;}catch(e){await run('ROLLBACK');throw e;}});queue=job.catch(()=>{});return job;}
export async function initDatabase(){for(const sql of [
`CREATE TABLE IF NOT EXISTS inscripcion(id TEXT PRIMARY KEY,modalidad TEXT NOT NULL,institucion TEXT NOT NULL,datos TEXT NOT NULL,operacion TEXT NOT NULL,medio TEXT NOT NULL,pagador TEXT NOT NULL,monto REAL NOT NULL,verificado INTEGER NOT NULL DEFAULT 0,creado TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS asesor(id TEXT PRIMARY KEY,inscripcion_id TEXT NOT NULL REFERENCES inscripcion(id),nivel TEXT NOT NULL,nombre TEXT NOT NULL,telefono TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS alumno(id TEXT PRIMARY KEY,inscripcion_id TEXT NOT NULL REFERENCES inscripcion(id),dni TEXT NOT NULL UNIQUE CHECK(length(dni)=8),nombre TEXT NOT NULL,nivel TEXT NOT NULL,grado TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS resultado(alumno_id TEXT PRIMARY KEY REFERENCES alumno(id),puntaje REAL NOT NULL CHECK(puntaje>=0),correctas INTEGER NOT NULL DEFAULT 0,incorrectas INTEGER NOT NULL DEFAULT 0,blanco INTEGER NOT NULL DEFAULT 0,actualizado TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS resultado_captura(id TEXT PRIMARY KEY,nombre TEXT NOT NULL,institucion TEXT NOT NULL,nivel TEXT,grado TEXT,puesto INTEGER,puntaje REAL NOT NULL,hora_entrega TEXT,rindio INTEGER NOT NULL,fuente TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS configuracion(clave TEXT PRIMARY KEY,valor TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS sesion(token TEXT PRIMARY KEY,expira REAL NOT NULL)`,
`INSERT INTO configuracion(clave,valor) VALUES('publicados','false') ON CONFLICT(clave) DO NOTHING`
])await run(sql);}
