import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ComposicionModule } from './composicion.module';
import { FiltroErrores } from './entrada/filtro-errores';

/**
 * Arranque de la API de Raiz.
 *
 * @version 0.1.0
 */
async function arrancar(): Promise<void> {
  const log = new Logger('Raiz');
  const app = await NestFactory.create(ComposicionModule, { bufferLogs: false });

  // El origen se declara explicitamente. La PWA se sirve desde otro dominio y no
  // conviene abrir la API a cualquiera: lo que se recibe son datos de familias.
  app.enableCors({
    origin: (process.env['ORIGENES_PERMITIDOS'] ?? 'http://localhost:4200,http://localhost:4300')
      .split(',')
      .map((o) => o.trim()),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600
  });

  app.useGlobalFilters(new FiltroErrores());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Un caso con sus datos ronda los 3 KB. El limite deja margen de sobra y corta un
  // envio anomalo antes de que llegue a la base.
  app.use((await import('express')).json({ limit: '256kb' }));

  // PUERTO es el nombre del proyecto; PORT es el que inyectan las plataformas de
  // contenedores. Se aceptan los dos para que la misma imagen sirva sin tocarla en
  // local, en App Runner o donde la pongan.
  const puerto = Number(process.env['PUERTO'] ?? process.env['PORT'] ?? 3000);

  // Se ata a todas las interfaces explicitamente. Dentro de un contenedor, atarse
  // solo a localhost hace que el servicio arranque bien, responda bien desde adentro
  // y nadie de afuera lo alcance: la comprobacion de salud falla y la plataforma
  // recicla la tarea en bucle sin decir por que.
  await app.listen(puerto, '0.0.0.0');

  log.log(`API escuchando en el puerto ${puerto}`);
  if (!process.env['DATABASE_URL']) {
    log.warn('DATABASE_URL no esta definida: ninguna escritura va a funcionar.');
  }
}

void arrancar();
