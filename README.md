# Olimpiada Tarpuyana 2026

Plataforma de inscripciones, panel del organizador y consulta pública de resultados. Implementada a partir del documento de proyecto SENATI incluido en esta carpeta y de sus capturas.

## Ejecutar en Windows

Requiere **Node.js 24 o superior**. En PowerShell, desde esta carpeta:

```powershell
npm.cmd run setup
npm.cmd start
```

Abre **http://localhost:3000**. `setup` crea `.env` con una contraseña aleatoria y la muestra en tu terminal. Puedes consultar o cambiar `ADMIN_PASSWORD` en `.env`; reinicia el servidor después de modificarla. Si `.env` ya existe, `setup` lo conserva. Nunca se habilita una contraseña predeterminada.

### Desarrollo con recarga automática

```powershell
npm.cmd run dev
```

El modo desarrollo usa `node --watch` (incluido en Node.js 24), reinicia el servidor cuando cambia el código de `server/` o `public/` y se sirve en **http://localhost:3001**. Así puedes conservar otra instancia abierta en el puerto 3000. Recarga el navegador para ver los cambios visuales. Pulsa `Ctrl+C` para detenerlo. Usa `DEV_PORT=3002` si el puerto 3001 también está ocupado.

| Página | Dirección |
|---|---|
| Portada e inscripción | http://localhost:3000/ |
| Inscripciones | http://localhost:3000/inscripciones |
| Consulta de resultados | http://localhost:3000/resultados |
| Panel del organizador | http://localhost:3000/admin |

## Tecnologías

La sección 7 del Word define HTML5, CSS3, JavaScript ES6+, Fetch API, Canvas, las fuentes Fraunces, DM Sans y Exo 2, Node.js, Express, PostgreSQL con ORM, bcrypt, Git/GitHub, Docker y Fly.io. Esta implementación conserva esa arquitectura y evita introducir React, que el documento propone solo como mejora futura.

Para instalar el conjunto de producción cuando tengas acceso al registro de npm:

```powershell
npm.cmd install --cache .npm-cache
```

Con las dependencias instaladas, el servidor usa **Express 5** y **bcryptjs**. Si defines `DATABASE_URL`, usa **PostgreSQL mediante Sequelize**, consultas parametrizadas y transacciones. Sin `DATABASE_URL`, usa SQLite relacional persistente en `data/tarpuy.sqlite`.

**Modo local sin conexión:** funciona sin instalar paquetes mediante HTTP nativo de Node.js, SQLite de Node 24 y hash scrypt en memoria. No es una implementación local de Express ni de PostgreSQL. Es un adaptador de desarrollo para poder ejecutar y probar el proyecto en este entorno, donde no se pudo acceder al registro de npm. En producción se exige Express y bcrypt; configura PostgreSQL para ajustarte al despliegue descrito en el Word. No se ha verificado la conexión a un servidor PostgreSQL en este entorno.

La exportación genera un archivo **.xlsx OOXML real** mediante un empaquetador ZIP incluido, sin depender de ExcelJS. Las fuentes de Google se cargan cuando hay conexión; existen alternativas del sistema para trabajar sin Internet.

## Funcionalidades implementadas

| Requerimiento del Word | Implementación |
|---|---|
| RF-01–RF-04 | Modalidad delegación/libre, datos de la I.E., asesor por nivel, alumnos por grado, máximo 10 por grado |
| RF-05–RF-07 | Total calculado por el servidor: S/ 13 por alumno de delegación y S/ 15 por libre; pago, operaciones separadas por comas y confirmación con código |
| RF-08–RF-10 | Inicio/cierre de sesión, cookie HttpOnly y SameSite, listado administrativo, actualización cada 20 segundos y verificación de pagos |
| RF-11–RF-12 | Alertas por operaciones repetidas, exportación de todos los inscritos o solo la lista oficial a Excel |
| RF-13 | Registro/edición por DNI e importación CSV de puntajes; importaciones transaccionales |
| RF-14–RF-16 | Ranking por grado, desempates, publicación controlada y filtros públicos por nivel/grado/nombre o DNI exacto |

También incluye consentimiento, validación en cliente y servidor, DNI único en toda la base de datos, limitación de intentos de login, cabeceras de seguridad, control de origen y ocultamiento de DNI y contactos en las respuestas públicas.

Las inscripciones adicionales se realizan desde **Alumnos → Inscribir alumno**. La inscripción queda pendiente y el organizador verifica el pago antes de registrar puntajes. Un alumno con pago desmarcado desaparece del ranking público incluso si ya tenía un resultado.

No se conecta a los datos reales del sitio original, no importa menores ni utiliza sus credenciales. La base local comienza vacía. El pago y la calificación se realizan fuera de la aplicación, como establece el documento. Los números de Yape y cuenta bancaria no se inventaron: el formulario pide solicitarlos al colegio.

## Puntajes y desempate

El documento exige desempates pero no precisa una fórmula numérica. Se adopta esta regla explícita: **puntaje descendente → más correctas → menos incorrectas → puesto compartido**. Los puestos se calculan dentro de cada grado (1, 1, 3 en un empate). El nombre solo ordena visualmente los empates. El puntaje final se introduce como valor ya calificado; no se inventa una penalización por respuesta.

Archivo de importación:

```csv
dni,puntaje,correctas,incorrectas,blanco
12345678,85,17,2,1
```

Se admiten coma o punto y coma como separador, y punto decimal. Los DNI deben conservar sus ceros iniciales. `dni` y `puntaje` son obligatorios; los conteos omitidos se consideran cero. El lote se rechaza íntegramente si hay un DNI desconocido, repetido, sin pago verificado o un valor inválido. El panel permite descargar una plantilla vacía.

## API REST

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/catalogo` | Público |
| POST | `/api/fichas` | Público |
| POST | `/api/libres` | Público |
| POST | `/api/admin/login` | Público |
| POST | `/api/admin/logout` | Sesión |
| GET | `/api/admin/data` | Sesión |
| PATCH | `/api/admin/verify` | Sesión |
| GET | `/api/admin/export.xlsx` | Sesión |
| POST | `/api/admin/resultados` | Sesión |
| PATCH | `/api/admin/publicacion` | Sesión |
| GET | `/api/resultados` | Público |
| GET | `/api/health` | Público |

Los cuerpos enviados deben ser JSON. Las sesiones caducan a las 8 horas y sus tokens se guardan como SHA-256 en la base. En producción la cookie incluye `Secure` y se requiere HTTPS. Reiniciar conserva datos y sesiones. Las limitaciones de peticiones son por IP de conexión; si se despliega detrás de un proxy, configurar una política de proxy confiable antes de exponer una instancia con alto tráfico.

## Pruebas

```powershell
npm.cmd test
```

Pruebas de integración con una base temporal y credenciales aleatorias: rutas, acceso sin sesión, login/logout, validaciones, duplicados, límite por grado, asesores, pagos, importación con rollback, ranking, desempates, filtros, privacidad, publicación y exportación Excel. No se escriben datos de prueba en la base de la aplicación. El archivo de comprobación de Excel queda en `test-output/verificacion-inscritos.xlsx`.

## Docker y PostgreSQL

Añade `POSTGRES_PASSWORD` y `ADMIN_PASSWORD` a `.env`. Para la cadena de conexión de Compose, utiliza una contraseña de PostgreSQL con caracteres alfanuméricos; si contiene caracteres reservados, codifícalos en la URL o ajusta la configuración.

```powershell
docker compose up --build
```

Compose sirve HTTP local, por eso usa `NODE_ENV=development` para que la cookie funcione en localhost. El contenedor instala Express y bcrypt y usa PostgreSQL; no se probó Docker en este equipo.

## Fly.io

1. Instala las dependencias y prueba PostgreSQL.
2. Copia `fly.toml.example` como `fly.toml` y asigna un nombre de aplicación único de tu cuenta.
3. Crea la aplicación y configura los secretos `DATABASE_URL` y `ADMIN_PASSWORD_HASH` (bcrypt) o `ADMIN_PASSWORD`.
4. Configura `DATABASE_SSL=true` si el proveedor PostgreSQL lo exige.
5. Ejecuta `fly deploy` y revisa el estado y `/api/health`.

Para producción en Fly.io utiliza PostgreSQL externo persistente. No dependas del disco efímero del contenedor. El proyecto no se ha desplegado ni se han creado recursos de pago.

## Alcance de fidelidad

El sitio de origen no fue accesible por HTTP desde el entorno de desarrollo; el navegador automatizado se detuvo al no poder verificar su URL. Por ello no se afirma una copia píxel a píxel. El diseño reproduce la identidad azul/cian, el encabezado, las tarjetas y los formularios presentes en las capturas del Word; las demás pantallas se reconstruyen con sus requisitos. El logotipo se recortó de la captura incluida en el documento (`referencias/image14.png`). No se pudo realizar una comparación visual en navegador ni verificar las pantallas privadas originales.
"# tarpuy" 
