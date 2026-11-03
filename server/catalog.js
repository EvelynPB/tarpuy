export const grades = [{nivel:'Inicial',grado:'Inicial - 5 años'},...Array.from({length:6},(_,i)=>({nivel:'Primaria',grado:`${i+1}° de Primaria`})),...Array.from({length:5},(_,i)=>({nivel:'Secundaria',grado:`${i+1}° de Secundaria`}))];
// Catalog drives server validation and the public grade filters.
export function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
export function required(value,name,max=200){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${name}: completa un valor válido (máximo ${max} caracteres).`);return value.trim();}
export function student(value){if(!value||typeof value!=='object')fail('Datos del alumno inválidos.');const dni=required(value.dni,'DNI',8);if(!/^\d{8}$/.test(dni))fail('El DNI debe tener exactamente 8 dígitos.');const grade=grades.find(g=>g.grado===value.grado);if(!grade)fail('Selecciona un grado válido.');return {dni,nombre:required(value.nombre,'Apellidos y nombres'),...grade};}
