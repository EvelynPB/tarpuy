import {spawn} from 'node:child_process';
const port=process.env.DEV_PORT|| (process.env.PORT&&process.env.PORT!=='3000'?process.env.PORT:'3001');
const child=spawn(process.execPath,['--watch','--env-file-if-exists=.env','server/index.js'],{stdio:'inherit',env:{...process.env,PORT:port}});
child.on('error',error=>{console.error('No se pudo iniciar el servidor de desarrollo:',error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{if(signal)process.exitCode=1;else process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
