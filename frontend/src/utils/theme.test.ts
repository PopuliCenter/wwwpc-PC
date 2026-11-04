import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';

interface Options {
  embed?: boolean;
  systemDark?: boolean;
}

/** Tiruan matchMedia yang bisa dipicu dari test. */
function stubMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: dark,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq),
  );
  return {
    change(next: boolean) {
      mq.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

async function loadTheme({ embed = false, systemDark = false }: Options = {}) {
  vi.resetModules();
  vi.doMock('./embed', () => ({ isEmbedMode: embed }));
  const system = stubMatchMedia(systemDark);
  const theme = await import('./theme');
  return { ...theme, system };
}

function blockStorage(method: 'getItem' | 'setItem') {
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new Error('storage diblokir');
  });
}

describe('theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF" />';
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('./embed');
    window.history.replaceState(null, '', '/');
  });

  it('bawaan mengikuti sistem', async () => {
    const dark = await loadTheme({ systemDark: true });
    expect(dark.readThemePreference()).toBe('system');
    expect(dark.resolveTheme('system')).toBe('dark');

    const light = await loadTheme({ systemDark: false });
    expect(light.resolveTheme('system')).toBe('light');
  });

  it('pilihan eksplisit mengalahkan sistem', async () => {
    const { resolveTheme } = await loadTheme({ systemDark: true });
    expect(resolveTheme('light')).toBe('light');

    const dark = await loadTheme({ systemDark: false });
    expect(dark.resolveTheme('dark')).toBe('dark');
  });

  it('nilai tersimpan yang tidak dikenal dianggap system', async () => {
    window.localStorage.setItem('theme', 'ungu');
    const { readThemePreference } = await loadTheme();
    expect(readThemePreference()).toBe('system');
  });

  it('menyimpan pilihan dan memasangnya ke dokumen', async () => {
    const { setThemePreference } = await loadTheme();
    setThemePreference('dark');

    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#1a2023',
    );

    setThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#FFFFFF',
    );
  });

  it('initTheme mengikuti perubahan sistem hanya saat preferensi system', async () => {
    const { initTheme, setThemePreference, system } = await loadTheme({ systemDark: false });
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');

    system.change(true);
    expect(document.documentElement.dataset.theme).toBe('dark');

    setThemePreference('light');
    system.change(true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  describe('mode embed selalu terang', () => {
    it('saat isEmbedMode aktif, walau tersimpan dark dan sistem gelap', async () => {
      window.localStorage.setItem('theme', 'dark');
      const { initTheme, resolveTheme, isThemeLocked } = await loadTheme({
        embed: true,
        systemDark: true,
      });
      initTheme();
      expect(isThemeLocked()).toBe(true);
      expect(resolveTheme('dark')).toBe('light');
      expect(resolveTheme('system')).toBe('light');
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('saat parameter embed ada tetapi isEmbedMode gagal terdeteksi', async () => {
      window.history.replaceState(null, '', '/?embed=1');
      const { resolveTheme } = await loadTheme({ embed: false, systemDark: true });
      expect(resolveTheme('dark')).toBe('light');
    });

    it('saat halaman berada di dalam iframe', async () => {
      const { resolveTheme } = await loadTheme({ embed: false, systemDark: true });
      vi.stubGlobal('top', {});
      expect(resolveTheme('dark')).toBe('light');
    });
  });

  describe('tahan localStorage gagal', () => {
    it('membaca: jatuh ke system tanpa melempar', async () => {
      blockStorage('getItem');
      const { readThemePreference, resolveTheme } = await loadTheme({ systemDark: true });
      expect(readThemePreference()).toBe('system');
      expect(resolveTheme('system')).toBe('dark');
    });

    it('menyimpan: pilihan tetap berlaku tanpa melempar', async () => {
      blockStorage('setItem');
      const { setThemePreference } = await loadTheme();
      expect(() => setThemePreference('dark')).not.toThrow();
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  describe('skrip awal di index.html', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? '';
    const runScript = () => new Function(script)();
    const theme = () => document.documentElement.dataset.theme;

    it('mengikuti preferensi tersimpan dan sistem', () => {
      stubMatchMedia(true);
      runScript();
      expect(theme()).toBe('dark');
      expect(document.documentElement.style.colorScheme).toBe('dark');
      expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
        '#1a2023',
      );

      window.localStorage.setItem('theme', 'light');
      runScript();
      expect(theme()).toBe('light');

      stubMatchMedia(false);
      window.localStorage.setItem('theme', 'dark');
      runScript();
      expect(theme()).toBe('dark');
    });

    it('selalu terang di mode embed', () => {
      stubMatchMedia(true);
      window.localStorage.setItem('theme', 'dark');

      window.history.replaceState(null, '', '/?embed=1');
      runScript();
      expect(theme()).toBe('light');

      window.history.replaceState(null, '', '/');
      window.sessionStorage.setItem('embedMode', '1');
      runScript();
      expect(theme()).toBe('light');
      window.sessionStorage.removeItem('embedMode');
    });

    it('tahan storage diblokir', () => {
      stubMatchMedia(true);
      blockStorage('getItem');
      expect(runScript).not.toThrow();
      expect(theme()).toBe('dark');
    });

    it('tahan matchMedia tidak tersedia', () => {
      vi.stubGlobal('matchMedia', undefined);
      expect(runScript).not.toThrow();
      expect(theme()).toBe('light');
    });
  });

  it('syncNativeBars no-op di web', async () => {
    const { syncNativeBars } = await loadTheme();
    expect(() => syncNativeBars('dark')).not.toThrow();
  });

  describe('syncNativeBars di native', () => {
    async function loadNativeTheme(setAppearance: ReturnType<typeof vi.fn>) {
      const registerPlugin = vi.fn(() => ({ setAppearance }));
      vi.doMock('@capacitor/core', () => ({
        Capacitor: { isNativePlatform: () => true },
        registerPlugin,
      }));
      return { ...(await loadTheme()), registerPlugin };
    }

    afterEach(() => {
      vi.doUnmock('@capacitor/core');
    });

    it('mengirim tema dan asal pilihan ke plugin', async () => {
      const setAppearance = vi.fn().mockResolvedValue(undefined);
      const { setThemePreference, registerPlugin } = await loadNativeTheme(setAppearance);

      setThemePreference('dark');
      expect(setAppearance).toHaveBeenLastCalledWith({ dark: true, followSystem: false });

      setThemePreference('light');
      expect(setAppearance).toHaveBeenLastCalledWith({ dark: false, followSystem: false });

      setThemePreference('system');
      expect(setAppearance).toHaveBeenLastCalledWith({ dark: false, followSystem: true });

      // Plugin hanya didaftarkan sekali.
      expect(registerPlugin).toHaveBeenCalledTimes(1);
      expect(registerPlugin).toHaveBeenCalledWith('PopuliTheme');
    });

    it('perubahan sistem saat Ikuti sistem ikut diteruskan', async () => {
      const setAppearance = vi.fn().mockResolvedValue(undefined);
      const { initTheme, system } = await loadNativeTheme(setAppearance);

      initTheme();
      system.change(true);
      expect(setAppearance).toHaveBeenLastCalledWith({ dark: true, followSystem: true });
    });

    it('plugin gagal tidak mengganggu halaman', async () => {
      const setAppearance = vi.fn().mockRejectedValue(new Error('tidak tersedia'));
      const { syncNativeBars } = await loadNativeTheme(setAppearance);

      expect(() => syncNativeBars('dark')).not.toThrow();
      // Penolakan yang tidak ditangani akan menggagalkan vitest.
      await new Promise((resolve) => setTimeout(resolve));
    });
  });

  it('tanpa matchMedia tetap terang', async () => {
    vi.resetModules();
    vi.doMock('./embed', () => ({ isEmbedMode: false }));
    vi.stubGlobal('matchMedia', undefined);
    const { resolveTheme } = await import('./theme');
    expect(resolveTheme('system')).toBe('light');
  });
});
