import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RegistrarCasoService } from './aplicacion/registrar-caso.service';
import { RegistrarVoluntarioService } from './aplicacion/registrar-voluntario.service';
import { SesionService } from './aplicacion/sesion.service';
import {
  ADMINISTRADOR_IDENTIDAD,
  CASO_REPOSITORIO,
  PERFIL_REPOSITORIO,
  PROVEEDOR_IDENTIDAD,
  SALUD,
  VERIFICADOR_TOKEN
} from './dominio/puertos';
import { CasosController } from './entrada/casos.controller';
import { SaludController } from './entrada/salud.controller';
import { SesionController } from './entrada/sesion.controller';
import { SesionGuard } from './entrada/sesion.guard';
import { VoluntariosController } from './entrada/voluntarios.controller';
import { CognitoAdministrador } from './infra/identidad/cognito-admin';
import { CognitoIdentidad } from './infra/identidad/cognito';
import { VerificadorToken } from './infra/identidad/verificador-token';
import { CasoRepositorioPostgres } from './infra/postgres/caso-repositorio.postgres';
import { PerfilRepositorioPostgres } from './infra/postgres/perfil-repositorio.postgres';
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
  controllers: [CasosController, SaludController, SesionController, VoluntariosController],
  providers: [
    PostgresPool,
    RegistrarCasoService,
    SesionService,
    RegistrarVoluntarioService,
    { provide: CASO_REPOSITORIO, useClass: CasoRepositorioPostgres },
    { provide: VERIFICADOR_TOKEN, useClass: VerificadorToken },
    { provide: SALUD, useClass: SaludPostgres },
    { provide: PROVEEDOR_IDENTIDAD, useClass: CognitoIdentidad },
    { provide: ADMINISTRADOR_IDENTIDAD, useClass: CognitoAdministrador },
    { provide: PERFIL_REPOSITORIO, useClass: PerfilRepositorioPostgres },

    // Global: toda ruta pide token salvo las marcadas con @RutaAbierta(). Registrarla
    // controlador por controlador dejaria abierta la que alguien olvide.
    { provide: APP_GUARD, useClass: SesionGuard }
  ]
})
export class ComposicionModule {}
