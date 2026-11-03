import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const password=randomBytes(18).toString('base64url');
try{await writeFile('.env',`PORT=3000\nHOST=127.0.0.1\nADMIN_PASSWORD=${password}\nNODE_ENV=development\n`,{flag:'wx'});console.log('Configuración local creada en .env.');console.log('Contraseña del organizador:',password);console.log('Ejecuta npm.cmd start y abre http://localhost:3000');}catch(e){if(e.code==='EEXIST')console.log('Ya existe .env. Se conservó tu configuración.');else throw e;}
