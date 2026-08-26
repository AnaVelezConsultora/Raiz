import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Caso, FotoLocal } from '../domain/caso.model';
import {
  CASO_STORAGE,
  FOTO_STORAGE,
  SINCRONIZACION,
  CasoStoragePort,
  FotoStoragePort,
  SincronizacionPort,
} from '../domain/ports';
import { RedService } from './red.service';
import { SincronizacionService } from './sincronizacion.service';

describe('SincronizacionService · HU 1.3.15', () => {
  const foto = { id: 'foto-1', casoId: 'caso-1' } as FotoLocal;

  let enLinea: boolean;
  let permiteEnvioAutomatico: ReturnType<typeof signal<boolean>>;
  let casos: CasoStoragePort;
  let fotos: FotoStoragePort;
  let transporte: SincronizacionPort;

  beforeEach(() => {
    enLinea = true;
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => enLinea);
    permiteEnvioAutomatico = signal(true);

    casos = {
      guardar: vi.fn(async () => 'caso-1'),
      obtener: vi.fn(async () => ({ codigo: 'RZ-2026-000001' }) as Caso),
      listar: vi.fn(async () => []),
      pendientesDeSync: vi.fn(async () => []),
      marcarSync: vi.fn(async () => undefined),
      contarPendientes: vi.fn(async () => 0),
      eliminar: vi.fn(async () => undefined),
      eliminarSincronizadosAntesDe: vi.fn(async () => 0),
    };

    fotos = {
      guardar: vi.fn(async () => 'foto-1'),
      porCaso: vi.fn(async () => [foto]),
      pendientesDeSync: vi.fn(async () => [foto]),
      marcarSync: vi.fn(async () => undefined),
      contarPendientes: vi.fn(async () => 1),
      bytesPendientes: vi.fn(async () => 204_800),
      contarDetenidas: vi.fn(async () => 0),
      reactivarDetenidas: vi.fn(async () => 0),
      eliminar: vi.fn(async () => undefined),
    };

    transporte = {
      disponible: vi.fn(async () => true),
      enviarCaso: vi.fn(async () => ({ exito: true, reintentable: false })),
      enviarFoto: vi.fn(async () => ({ exito: true, reintentable: false })),
      cancelarFoto: vi.fn(async () => undefined),
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('sube las fotografias al abrir con cualquier conexion', async () => {
    crearServicio();
    TestBed.flushEffects();

    await vi.waitFor(() =>
      expect(transporte.enviarFoto).toHaveBeenCalledWith(foto, expect.any(Function)),
    );
    expect(fotos.marcarSync).toHaveBeenCalledWith({
      fotoId: 'foto-1',
      urlRemota: undefined,
    });
    expect(fotos.reactivarDetenidas).not.toHaveBeenCalled();
  });

  it('no envia con ahorro de datos y arranca al desactivarlo', async () => {
    permiteEnvioAutomatico.set(false);
    crearServicio();
    TestBed.flushEffects();

    await vi.waitFor(() => expect(fotos.contarPendientes).toHaveBeenCalled());
    expect(transporte.enviarFoto).not.toHaveBeenCalled();

    permiteEnvioAutomatico.set(true);
    TestBed.flushEffects();

    await vi.waitFor(() => expect(transporte.enviarFoto).toHaveBeenCalledOnce());
  });

  it('espera sin conexion y envia al recibir el evento online', async () => {
    enLinea = false;
    crearServicio();
    TestBed.flushEffects();

    await vi.waitFor(() => expect(fotos.contarPendientes).toHaveBeenCalled());
    expect(transporte.enviarFoto).not.toHaveBeenCalled();

    enLinea = true;
    window.dispatchEvent(new Event('online'));

    await vi.waitFor(() => expect(transporte.enviarFoto).toHaveBeenCalledOnce());
  });

  it('permite forzar el envio y reactivar detenidas de forma manual', async () => {
    permiteEnvioAutomatico.set(false);
    const servicio = crearServicio();
    TestBed.flushEffects();

    await vi.waitFor(() => expect(fotos.contarPendientes).toHaveBeenCalled());
    await servicio.sincronizar();

    expect(fotos.reactivarDetenidas).toHaveBeenCalledOnce();
    expect(transporte.enviarFoto).toHaveBeenCalledOnce();
  });

  function crearServicio(): SincronizacionService {
    TestBed.configureTestingModule({
      providers: [
        SincronizacionService,
        { provide: CASO_STORAGE, useValue: casos },
        { provide: FOTO_STORAGE, useValue: fotos },
        { provide: SINCRONIZACION, useValue: transporte },
        {
          provide: RedService,
          useValue: {
            permiteEnvioAutomatico: permiteEnvioAutomatico.asReadonly(),
          },
        },
      ],
    });
    return TestBed.inject(SincronizacionService);
  }
});
