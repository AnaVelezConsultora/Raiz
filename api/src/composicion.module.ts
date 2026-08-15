import { Module } from '@nestjs/common';
import { RegistrarCasoService } from './aplicacion/registrar-caso.service';
import { CASO_REPOSITORIO, SALUD, VERIFICADOR_TOKEN } from './dominio/puertos';
import { CasosController } from './entrada/casos.controller';
import { SaludController } from './entrada/salud.controller';
import { VerificadorToken } from './infra/identidad/verificador-token';
import { CasoRepositorioPostgres } from './infra/postgres/caso-repositorio.postgres';
import { PostgresPool } from './infra/postgres/pool';
import { SaludPostgres } from './infra/postgres/salud.postgres';

/**
 * Composicion del servidor.
 *
 * Aqui, y solo aqui, se decide que implementacion concreta satisface cada puerto. Es
 * el equivalente de `app.config.ts` en la PWA: cambiar de base de datos o de proveedor
 * de identidad se hace en este archivo, y ningun servicio se entera.
 */
@Module({
  controllers: [CasosController, SaludController],
  providers: [
    PostgresPool,
    RegistrarCasoService,
    { provide: CASO_REPOSITORIO, useClass: CasoRepositorioPostgres },
    { provide: VERIFICADOR_TOKEN, useClass: VerificadorToken },
    { provide: SALUD, useClass: SaludPostgres }
  ]
})
export class ComposicionModule {}
