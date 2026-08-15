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
    expect(service.avisoEspacio()).toContain('Quedan 5.0 MB');
  });
});
