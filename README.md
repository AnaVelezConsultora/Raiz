# Raíz

Caracterización y seguimiento de familias afectadas por desastres.

Levantamiento en **Sevilla, Valle del Cauca** —casco urbano y zona veredal— tras el
sismo. El objetivo no es contar damnificados: es caracterizar, remitir a la entidad
competente con número de radicado y hacer seguimiento hasta la reconstrucción.

---

## La restricción que define todo el diseño

No hay capacidad de ir al terreno y en la zona veredal no hay señal. **Quien captura es
un líder que ya vive allá, con el celular que ya tiene.** Por eso la aplicación funciona
sin conexión y sincroniza después.

Cualquier decisión técnica que rompa eso está mal, por elegante que sea.

## Principio de arquitectura

**Un solo registro de hogares.** No existen bases separadas para rural, urbano y
convenio. Existe un registro único con marcadores (`zona`, `afiliacion`,
`aplica_convenio`) y los reportes a cada entidad son filtros sobre ese mismo dato.

Razón: una familia afiliada entraría en dos listados y los totales no cuadrarían al
compararlos entre entidades. **El total consolidado es la palanca de negociación; si no
cuadra, se pierde.**

La unidad de registro es el **hogar**, no la vivienda: un inmueble puede alojar varias
familias. Los arrendatarios se registran, y las familias no afiliadas también.

---

## Dónde estamos hoy

| | |
|---|---|
| Captura sin conexión, con fotos y coordenada | Construida y probada en navegador |
| Cola de envío, identidad y control de acceso | Construidos |
| Servicio de recepción de la API | Construido, sin probar contra base real |
| Esquema, políticas de acceso y auditoría | Escritos y revisados |
| **Prueba en un Android de verdad** | **No ha ocurrido** |
| **Servidor desplegado** | **No existe todavía** |

**Ningún líder ha registrado aún a una familia real con esta herramienta.** Lo que hay
es el método y el instrumento. Las cifras se reportarán cuando existan y estén
verificadas.

Estado completo y honesto: **[docs/ESTADO.md](docs/ESTADO.md)**.

---

## Estructura

```text
raiz/
  dominio/     Contrato compartido entre la PWA y la API. Si cruza la red, vive aquí
  frontend/    PWA Angular. Captura sin señal, fotos y GPS
  api/         Servicio NestJS. Recibe lo que el voluntario capturó
  supabase/    Esquema PostgreSQL, políticas de acceso y revisión de seguridad
  entorno/     Entorno local reproducible con pruebas de acceso ejecutables
  tablero/     Tablero público estático con mapa
  docs/        Estado, frentes, roles, gobernanza, ADR y backlog
```

**El paquete `dominio/` no es una carpeta más.** Es lo que impide que el cliente y el
servidor diverjan: los tipos que cruzan la red y la regla de consentimiento están
escritos una sola vez y los importan los dos. Escritos dos veces serían una intención;
escritos una vez son una propiedad del sistema.

---

## Empezar

```bash
git clone https://github.com/anavelezconsultoria/raiz.git
cd raiz
npm install
cd frontend && npm start
```

Requiere Node 20.19 o 22.12 en adelante.

**Ojo:** `npm start` **no** activa el modo sin conexión. Para probar lo único que hace
útil a Raíz:

```bash
npm run servir
```

Compila y sirve en el puerto 4300. Ahí: registrar un caso, F12 → Network → Offline,
recargar. La aplicación debe abrir igual y el caso seguir ahí.

Guía completa, convenciones y solución de problemas:
**[docs/DESARROLLO.md](docs/DESARROLLO.md)**.

---

## Si llega a colaborar

1. **[docs/ESTADO.md](docs/ESTADO.md)** — objetivo, decisiones cerradas, qué funciona y
   qué falta.
2. **[docs/FRENTES.md](docs/FRENTES.md)** — ocho frentes que avanzan en paralelo sin
   pisarse. Escoja uno y avise cuál toma.
3. **[docs/ROLES-Y-ESFUERZO.md](docs/ROLES-Y-ESFUERZO.md)** — quién responde por qué y
   cuánto cuesta cada frente.
4. **[docs/backlog/](docs/backlog/)** — las historias de usuario dentro de cada hito.

Las decisiones de arquitectura ya tomadas están en **[docs/adr/](docs/adr/)**. Antes de
reabrir una, lea el registro correspondiente: casi siempre la pregunta ya está
respondida ahí, con el porqué.

**Lo más útil que puede hacer alguien hoy no requiere programar:** instalar la
aplicación en un Android real, ponerla en modo avión, registrar un caso y contar todo lo
que incomodó. Es el frente F6 y sigue sin dueño.

### Cómo se trabaja

`main` está protegida: todo entra por propuesta de cambio con una aprobación.

```bash
git checkout -b tipo/lo-que-hace
git commit -m "..."
git push -u origin tipo/lo-que-hace
```

Convenciones: nunca el tipo `any`; montos en enteros de centavos; métodos pequeños con
una responsabilidad; y **las decisiones técnicas se escriben en el repositorio, no solo
en el chat** — lo que solo vive en un chat se pierde en dos semanas.

---

## Protección de datos

Datos personales y sensibles de población vulnerable, sujetos a la **Ley 1581 de 2012**.

- Autorización previa obligatoria. Sin autorización se registra el caso sin identidad ni
  fotografías, y la regla se aplica **en el borde de escritura del servidor**, no solo
  en la interfaz.
- La versión nominal se comparte únicamente con la entidad destinataria, por canal
  formal y con radicado.
- Acceso por rol y auditado. Cada líder ve únicamente lo que él mismo reportó, y eso lo
  controla la base de datos, no la pantalla.
- **Nunca datos reales en desarrollo ni en pruebas.** Datos inventados siempre.
- En el grupo de chat no se publican nombres, cédulas, teléfonos ni fotografías.

El marco completo y las brechas abiertas están en
**[docs/ESTANDAR-PROBATORIO.md](docs/ESTANDAR-PROBATORIO.md)** y en
**[supabase/SEGURIDAD.md](supabase/SEGURIDAD.md)**.

---

Trabajo voluntario. Código abierto: lo que se construya aquí debe servirle a la próxima
emergencia en otro municipio.
