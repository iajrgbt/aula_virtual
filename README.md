# Aula Virtual CAP

Aplicación mínima para impartir formación CAP por aula virtual conforme al art. 24 del RD 487/2026:
- Cámara del alumno obligatoria (sin botón para apagarla, e incidencias registradas si se apaga igualmente).
- Registro automático de conexión/desconexión, con duración, guardado en base de datos.
- Panel `/admin` para crear sesiones y obtener el código de sala a compartir con los alumnos.
- Panel `/inspector` con conexiones en directo e histórico completo (nunca se borra).

## Antes de usarla con alumnos reales, ten en cuenta:

1. **Vídeo**: usa la infraestructura pública y gratuita de Jitsi (`meet.jit.si`). Es válida para
   empezar y para grupos pequeños/medianos. Si más adelante das muchas clases simultáneas o quieres
   control total, lo siguiente es alojar tu propio servidor Jitsi en el VPS.
2. **RGPD**: estás tratando DNI y vídeo de menores/adultos. Necesitas una política de privacidad
   visible para los alumnos y, si tienes dudas, que un asesor revise el tratamiento de datos.
3. **Procedimiento ante el órgano competente**: antes de anunciar plazas en aula virtual, confirma
   con la Dirección General de Transporte de tu comunidad autónoma el procedimiento exacto de
   comunicación/homologación y cómo quieren que sea el acceso de inspección en la práctica (esta
   app te da la base técnica, pero el trámite administrativo lo tienes que hacer tú).
4. **Contraseñas**: cambia `ADMIN_PASSWORD` e `INSPECTOR_PASSWORD` por contraseñas fuertes antes de
   publicar la app. No las compartas salvo con quien deba usarlas.

## Variables de entorno necesarias

Copia `.env.example` como referencia y configura estas variables en EasyPanel:
- `PORT` (normalmente 3000, EasyPanel lo gestiona)
- `ADMIN_PASSWORD`
- `INSPECTOR_PASSWORD`

## Almacenamiento persistente

La carpeta `/app/data` dentro del contenedor debe montarse como volumen persistente en EasyPanel,
para que el registro de conexiones no se pierda si el contenedor se reinicia.
