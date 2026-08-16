import { AlmacenamientoService } from './almacenamiento.service';

describe('AlmacenamientoService', () => {
  it('solicita cuota persistente y registra el resultado', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(false);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist, persisted, estimate: vi.fn() }
    });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const service = new AlmacenamientoService();
    const resultado = await service.asegurarPersistencia();

    expect(resultado).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    expect(service.estado()).toBe('persistente');
    expect(info).toHaveBeenCalledWith('[Raíz] solicitud de cuota persistente: concedida');
    info.mockRestore();
  });

  it('avisa antes de alcanzar el limite de cuota', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: vi.fn().mockResolvedValue(true),
        persist: vi.fn(),
        estimate: vi.fn().mockResolvedValue({
          usage: 95 * 1024 * 1024,
          quota: 100 * 1024 * 1024
        })
      }
    });

    const service = new AlmacenamientoService();
    await service.medirUso();

    expect(service.espacioBajo()).toBe(true);
    expect(service.uso()?.disponible).toBe(5 * 1024 * 1024);
    // El numero es cuota del origen, no espacio libre del telefono: el aviso
    // tiene que nombrar lo que mide o manda a borrar fotos personales de mas.
    expect(service.avisoEspacio()).toContain('Queda poco espacio para Raíz (5.0 MB)');
    expect(service.avisoEspacio()).toContain('Libere espacio en el celular');
  });

  it('vigila una sola vez y se puede detener', () => {
    vi.useFakeTimers();
    const estimate = vi.fn().mockResolvedValue({ usage: 0, quota: 100 * 1024 * 1024 });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: vi.fn(), persist: vi.fn(), estimate }
    });
    const quitar = vi.spyOn(document, 'removeEventListener');

    const service = new AlmacenamientoService();
    const detener = service.vigilar();

    // La segunda llamada no monta un segundo temporizador: devuelve el mismo freno.
    expect(service.vigilar()).toBe(detener);

    estimate.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(estimate).toHaveBeenCalledTimes(2);

    detener();
    estimate.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(estimate).not.toHaveBeenCalled();
    expect(quitar).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    quitar.mockRestore();
    vi.useRealTimers();
  });
});
