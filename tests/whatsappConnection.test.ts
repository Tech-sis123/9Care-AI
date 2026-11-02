import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const fake = vi.hoisted(() => {
  const authPath = `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/wa-auth-test-${process.pid}`;
  process.env.WHATSAPP_AUTH_PATH = authPath;
  return { authPath, clients: [] as any[], failNextInit: null as Error | null };
});

vi.mock('whatsapp-web.js', async () => {
  const { EventEmitter } = await import('events');
  class Client extends EventEmitter {
    options: any;
    info: any = null;
    initialize = vi.fn(() => {
      const err = fake.failNextInit;
      fake.failNextInit = null;
      return err ? Promise.reject(err) : Promise.resolve();
    });
    destroy = vi.fn().mockResolvedValue(undefined);
    logout = vi.fn().mockResolvedValue(undefined);
    sendMessage = vi.fn().mockResolvedValue({ id: { id: 'm1' } });
    constructor(options: any) {
      super();
      this.options = options;
      fake.clients.push(this);
    }
  }
  class LocalAuth {
    constructor(public opts: any) {}
  }
  return { Client, LocalAuth };
});

vi.mock('qrcode-terminal', () => ({ default: { generate: vi.fn() } }));
vi.mock('../src/config/redis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { redis: new RedisMock() };
});
vi.mock('../src/config/prisma', () => ({
  default: { notificationsLog: { create: vi.fn().mockResolvedValue({}) } },
}));

vi.mock('../src/services/chromeForWhatsapp', () => ({
  findChrome: vi.fn(() => null),
  downloadChrome: vi.fn(async () => '/downloaded/chrome'),
  desktopUserAgent: vi.fn(() => 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'),
  killChromeUsingProfile: vi.fn(() => 0),
  killProcessTree: vi.fn(),
  isProcessAlive: vi.fn(() => false),
  serverResources: vi.fn(() => ({ memory_used_mb: 300, memory_limit_mb: 2048, chrome_processes: 0 })),
}));

import { downloadChrome, isProcessAlive, killChromeUsingProfile, killProcessTree } from '../src/services/chromeForWhatsapp';
import { getWhatsAppStatus, logoutWhatsApp, startWhatsApp, whatsappService } from '../src/services/whatsapp';

const flush = () => new Promise((r) => setTimeout(r, 0));
const last = () => fake.clients[fake.clients.length - 1];
// Chrome is located before WhatsApp Web opens, so the client appears a tick later
const start = async (opts?: { restart?: boolean }) => {
  const s = await startWhatsApp(opts);
  await flush();
  return s;
};

describe('clinic WhatsApp connection', () => {
  beforeEach(async () => {
    await logoutWhatsApp();
    fake.clients.length = 0;
  });

  it('is stopped until a doctor asks for a QR code', async () => {
    const s = await getWhatsAppStatus();
    expect(s.status).toBe('stopped');
    expect(s.qr_image).toBeNull();
    expect(s.has_saved_login).toBe(false);
  });

  it('shows the QR code as an image, and does not open a second WhatsApp for repeat clicks', async () => {
    expect((await start()).status).toBe('starting');
    last().emit('qr', '2@abc,def,ghi');
    const s = await getWhatsAppStatus();
    expect(s.status).toBe('qr');
    expect(s.qr_image).toMatch(/^data:image\/png;base64,/);
    expect(s.qr_updated_at).toBeInstanceOf(Date);

    await start();
    expect(fake.clients).toHaveLength(1);
  });

  it('reports the linked number once scanned', async () => {
    await start();
    const c = last();
    c.emit('qr', 'code');
    c.emit('authenticated');
    expect((await getWhatsAppStatus()).status).toBe('authenticating');
    c.info = { wid: { user: '2348034027044' }, pushname: '9Care Clinic' };
    c.emit('ready');
    const s = await getWhatsAppStatus();
    expect(s).toMatchObject({ status: 'ready', phone: '+2348034027044', name: '9Care Clinic', qr_image: null });
  });

  it('sends messages only when connected', async () => {
    expect((await whatsappService.sendMessage({ to: '+2348011111111', message: 'hi' })).message_id).toBeNull();
    await start();
    last().info = { wid: { user: '2348034027044' } };
    last().emit('ready');
    expect((await whatsappService.sendMessage({ to: '+2348011111111', message: 'hi' })).message_id).toBe('m1');
    expect(last().sendMessage).toHaveBeenCalledWith('2348011111111@c.us', 'hi');
  });

  it('can be restarted for a fresh code, ignoring the old one', async () => {
    await start();
    const old = last();
    old.emit('qr', 'old-code');
    await start({ restart: true });
    expect(old.destroy).toHaveBeenCalled();
    expect(fake.clients).toHaveLength(2);
    old.emit('ready');
    expect((await getWhatsAppStatus()).status).toBe('starting');
  });

  it('marks the code expired when nobody scans it, and a new request starts again', async () => {
    await start();
    last().emit('disconnected', 'Max qrcode retries reached');
    expect((await getWhatsAppStatus()).status).toBe('expired');
    await start();
    expect(fake.clients).toHaveLength(2);
    expect(last().options.qrMaxRetries).toBeGreaterThan(0);
  });

  it('explains when WhatsApp Web cannot start on the server', async () => {
    fake.failNextInit = new Error('Browser was not found at the configured executablePath');
    await start();
    await flush();
    const s = await getWhatsAppStatus();
    expect(s.status).toBe('failed');
    expect(s.error).toMatch(/Chrome.*was not found on the server/);
    expect(s.detail).toContain('Browser was not found');
  });

  it('says plainly when the server is missing system files for Chrome', async () => {
    fake.failNextInit = new Error('Failed to launch the browser process! chrome: error while loading shared libraries: libnss3.so');
    await start();
    await flush();
    expect((await getWhatsAppStatus()).error).toMatch(/missing system files/);
  });

  describe('on a server without Chrome (e.g. Render)', () => {
    const realPlatform = process.platform;
    beforeEach(() => Object.defineProperty(process, 'platform', { value: 'linux' }));
    afterEach(() => Object.defineProperty(process, 'platform', { value: realPlatform }));

    it('downloads Chrome first, showing that on the page, then opens WhatsApp with it', async () => {
      let finish!: (path: string) => void;
      vi.mocked(downloadChrome).mockReturnValueOnce(new Promise((r) => (finish = r)));
      await start();
      expect(await getWhatsAppStatus()).toMatchObject({ status: 'starting', stage: 'downloading_browser' });
      expect(fake.clients).toHaveLength(0);

      finish('/srv/.cache/puppeteer/chrome/linux/chrome');
      await flush();
      expect(fake.clients).toHaveLength(1);
      expect(last().options.puppeteer.executablePath).toBe('/srv/.cache/puppeteer/chrome/linux/chrome');
      expect(last().options.puppeteer.args).toContain('--disable-dev-shm-usage');
      // a normal desktop Chrome, never "HeadlessChrome", or WhatsApp says "update Chrome"
      expect(last().options.userAgent).toMatch(/ Chrome\/146\./);
      expect(last().options.userAgent).not.toMatch(/Headless/);
      expect((await getWhatsAppStatus()).stage).toBeNull();
    });

    it('explains if Chrome cannot be downloaded', async () => {
      vi.mocked(downloadChrome).mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND storage.googleapis.com'));
      await start();
      await flush();
      expect(await getWhatsAppStatus()).toMatchObject({ status: 'failed', detail: expect.stringContaining('ENOTFOUND') });
      expect(fake.clients).toHaveLength(0);
    });
  });

  it('tries again by itself when WhatsApp Web reloads while starting', async () => {
    fake.failNextInit = new Error('Protocol error (Runtime.callFunctionOn): Execution context was destroyed.');
    await start();
    await flush();
    await flush();
    expect(fake.clients).toHaveLength(2);
    expect(fake.clients[0].destroy).toHaveBeenCalled();
    expect((await getWhatsAppStatus()).status).toBe('starting');
    last().emit('qr', 'code');
    expect((await getWhatsAppStatus()).status).toBe('qr');
  });

  it('explains a start-up timeout as the server being short of memory', async () => {
    fake.failNextInit = new Error("Runtime.callFunctionOn timed out. Increase the 'protocolTimeout' setting in launch/connect calls for a higher timeout if needed.");
    await start();
    await flush();
    const s = await getWhatsAppStatus();
    expect(s.status).toBe('failed');
    expect(s.error).toMatch(/took too long.*short of memory/);
    expect(s.server).toMatchObject({ memory_limit_mb: 2048 });
  });

  it('force-stops a frozen Chrome that does not close, so it cannot pile up', async () => {
    vi.useFakeTimers();
    try {
      await startWhatsApp();
      await vi.advanceTimersByTimeAsync(1);
      const frozen = last();
      frozen.pupBrowser = { process: () => ({ pid: 4242 }) };
      frozen.destroy.mockReturnValue(new Promise(() => {})); // never answers
      vi.mocked(isProcessAlive).mockReturnValueOnce(true);
      const restarting = startWhatsApp({ restart: true });
      await vi.advanceTimersByTimeAsync(15000);
      await restarting;
      expect(killProcessTree).toHaveBeenCalledWith(4242);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears out leftover Chrome on the profile before opening a new one', async () => {
    vi.mocked(killChromeUsingProfile).mockClear();
    await start();
    expect(killChromeUsingProfile).toHaveBeenCalledWith(expect.stringMatching(/session$/));
  });

  it('says when WhatsApp rejects the login', async () => {
    await start();
    last().emit('auth_failure', 'bad session');
    expect(await getWhatsAppStatus()).toMatchObject({ status: 'failed', detail: 'bad session' });
  });

  it('only counts a login as saved once a phone has actually linked', async () => {
    // whatsapp-web.js makes this folder even when nobody scans
    fs.mkdirSync(path.join(fake.authPath, 'session'), { recursive: true });
    expect((await getWhatsAppStatus()).has_saved_login).toBe(false);
    await start();
    last().info = { wid: { user: '2348034027044' } };
    last().emit('ready');
    expect((await getWhatsAppStatus()).has_saved_login).toBe(true);
  });

  it('forgets the login when the phone unlinks it', async () => {
    await start();
    last().emit('ready');
    expect((await getWhatsAppStatus()).has_saved_login).toBe(true);
    last().emit('disconnected', 'LOGOUT');
    expect((await getWhatsAppStatus()).has_saved_login).toBe(false);
  });

  it('unlinks: logs out, deletes the saved login and stops', async () => {
    fs.mkdirSync(path.join(fake.authPath, 'session'), { recursive: true });
    await start();
    const c = last();
    c.emit('ready');
    expect((await getWhatsAppStatus()).has_saved_login).toBe(true);
    const s = await logoutWhatsApp();
    expect(c.logout).toHaveBeenCalled();
    expect(s).toMatchObject({ status: 'stopped', phone: null, has_saved_login: false });
    expect(fs.existsSync(path.join(fake.authPath, 'session'))).toBe(false);
  });
});
