import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { AUTH } from './core/domain/auth.model';
import { CASO_STORAGE, FOTO_STORAGE, SINCRONIZACION, TABLERO } from './core/domain/ports';
import { DexieCasoStorageService } from './core/infra/dexie-caso-storage.service';
import { DexieFotoStorageService } from './core/infra/dexie-foto-storage.service';
import { ApiAuthAdapter } from './core/infra/api-auth.adapter';
import { ApiSyncAdapter } from './core/infra/api-sync.adapter';
import { ApiTableroAdapter } from './core/infra/api-tablero.adapter';

/**
 * Composicion de la aplicacion.
 *
 * Aqui, y solo aqui, se decide que implementacion concreta satisface cada puerto del
 * dominio. Sustituir Supabase por un backend propio en la fase 3 es cambiar una
 * linea de este archivo.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),

    // El service worker es lo que permite abrir la aplicacion sin senal. Se registra
    // 30 segundos despues de estabilizar para no competir con la carga inicial en
    // celulares de gama baja.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),

    { provide: CASO_STORAGE, useExisting: DexieCasoStorageService },
    { provide: FOTO_STORAGE, useExisting: DexieFotoStorageService },
    { provide: SINCRONIZACION, useExisting: ApiSyncAdapter },
    { provide: AUTH, useExisting: ApiAuthAdapter },
    { provide: TABLERO, useExisting: ApiTableroAdapter }
  ]
};
