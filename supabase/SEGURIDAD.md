# Raíz — Revisión de seguridad del esquema

Corte: 13 de agosto de 2026. Antes de crear el proyecto en Supabase.

Se revisó el esquema buscando fugas de datos personales. Se encontraron seis
problemas, dos de ellos graves. Todos están corregidos en `schema.sql`.

Se documentan porque **el próximo cambio al esquema puede reintroducirlos**, y porque
quien tome F3 debe verificar cada uno contra el proyecto real, no confiar en este
documento.

> **La numeración continúa en [docs/hallazgos-revision.md](../docs/hallazgos-revision.md)**,
> donde una revisión independiente reportó H7 a H14 contrastando la documentación
> contra el código. Ahí está, entre otros, el fallo bloqueante que impedía crear el
> esquema. Los dos archivos son un solo registro de hallazgos con numeración corrida.

---

## H1 · Grave · Las vistas saltaban el control de acceso

En PostgreSQL una vista se ejecuta con los permisos de **su dueño**, no de quien
consulta. Por defecto eso **anula las políticas de acceso por fila**.

`v_familias_tablero` expone nombre, apellidos y teléfono. Cualquier usuario
autenticado —incluido un líder que solo debería ver sus propios casos— podía consultar
esa vista por la API y obtener **el censo completo con identidad**. Lo mismo
`v_posibles_duplicados`, que expone documento y teléfono.

**Corregido:** ambas vistas se crean con `security_invoker = true`, de modo que
respetan las políticas de quien consulta.

Las vistas agregadas (`v_mapa_publico`, `v_estadisticas`, `v_estado_gestion`) se dejan
a propósito con el comportamiento por defecto: su única razón de existir es ser una
ventana controlada y anonimizada.

## H2 · Grave · La auditoría no tenía control de acceso

`auditoria` guarda `to_jsonb(old)` y `to_jsonb(new)` de cada cambio sobre `familias`.
Eso incluye nombre, apellidos y número de documento.

La tabla no tenía RLS. Cualquier usuario autenticado podía leerla por la API y
reconstruir el censo entero con identidad, **saltándose todas las políticas de las
tablas originales**. Una puerta trasera al lado de la puerta con llave.

**Corregido:** RLS activo, lectura restringida a custodio y coordinador, y escritura
revocada para todos: solo escribe el disparador, que corre como definer.

Este hallazgo tiene consecuencia jurídica y está anotado también en
[F7](../docs/cumplimiento/README.md): el derecho de supresión no se cumple borrando la
fila de `familias` si la identidad sobrevive en la auditoría.

## H3 · Alto · Los voluntarios no podían crear casos

La única política de inserción era `with check (mi_rol() = 'digitador')`. Un líder no
podía insertar nada. La aplicación habría fallado al primer envío de un enlace
territorial, que es exactamente el usuario principal del sistema.

**Corregido:** cualquier usuario activo puede crear un caso, pero solo a su propio
nombre. La condición `registrador_perfil_id = auth.uid()` impide firmar un registro
como si lo hubiera levantado otra persona.

## H4 · Alto · El líder perdía de vista sus propios casos

`registrador_perfil_id` no tenía valor por defecto y el adaptador de sincronización no
lo enviaba. Quedaba nulo.

La política "el líder ve lo suyo" compara ese campo con `auth.uid()`, así que **el
voluntario grababa un caso y acto seguido dejaba de verlo**. En campo eso se lee como
"la aplicación me borró el trabajo" y el voluntario deja de usarla.

**Corregido:** la columna tiene `default auth.uid()`.

## H5 · Medio · Nadie podía asignar roles

`perfiles` solo tenía política de lectura. Sin política de actualización, ningún
usuario podía modificar un perfil, y como todos entran con el rol mínimo, **todo el
equipo quedaba atrapado en el rol de líder para siempre**.

**Corregido:** el custodio de datos puede actualizar perfiles. Nadie más.

## H6 · Medio · Tablas sin RLS por olvido

`sync_kobo`, `organizaciones` y `entidades` no tenían RLS. No son datos sensibles, pero
la regla debe ser **todo denegado salvo lo declarado**, para no depender de que alguien
se acuerde de revisar tabla por tabla cuando agregue la siguiente.

**Corregido:** RLS activo en las tres, con políticas explícitas.

---

## Lo que hay que verificar en el proyecto real

Este documento describe lo que dice el archivo. Lo que importa es lo que quede en el
servidor. Quien tome F3 debe comprobar, con el proyecto ya creado:

1. **El asesor de seguridad de Supabase no reporta advertencias.** Detecta vistas sin
   `security_invoker` y tablas sin RLS.
2. **Prueba de líder.** Crear dos usuarios con rol líder, capturar un caso con cada
   uno, y confirmar que ninguno ve el del otro. Ni en la tabla ni en las vistas.
3. **Prueba de anónimo.** Con la clave anónima y sin sesión, intentar leer `familias`,
   `v_familias_tablero` y `auditoria`. Las tres deben devolver vacío o error.
   `v_mapa_publico` debe responder.
4. **Prueba de suplantación.** Intentar insertar una familia con
   `registrador_perfil_id` de otro usuario. Debe ser rechazada.
5. **Prueba de escalada.** Con un usuario líder, intentar cambiar su propio rol a
   coordinador. Debe ser rechazada.
6. **Almacenamiento de fotos.** El bucket es un sistema aparte con sus propias
   políticas. Nada de lo anterior lo cubre. Un bucket público expone todas las
   fotografías por URL directa, sin autenticación.

El punto 6 es el que más se olvida y probablemente sea el hallazgo de la próxima revisión: ninguna política de tabla cubre el almacenamiento de archivos.

---

## Principios que se aplicaron

- **Todo denegado salvo lo declarado.** RLS activo en cada tabla, incluso en las que
  hoy no parecen sensibles.
- **Ninguna ruta alterna.** Si una tabla está protegida, ninguna vista, función ni
  tabla de auditoría puede exponer lo mismo por otro camino.
- **El cliente no es la seguridad.** Las guardas de ruta y los botones ocultos son
  comodidad de navegación. Quien quiera saltárselos lo hace desde la consola del
  navegador en dos minutos. Lo único que protege un dato es una política que corre en
  el servidor.
- **El rol por defecto es el mínimo.** Ascender a alguien es una acción deliberada.
