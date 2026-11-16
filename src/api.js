import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { fakeGestoMs } from './human.js';

const BASE = 'https://solranch.fun';
const API = `${BASE}/api`;

export class SolRanchAPI {
  constructor(privateKeyBase58) {
    const secretKey = bs58.decode(privateKeyBase58);
    this.keypair = Keypair.fromSecretKey(secretKey);
    this.address = this.keypair.publicKey.toBase58();
    this.cookies = '';
    this.deviceId = this.generateDeviceId();
    this.serverTime = Date.now();
    this.perfBase = Date.now();
    this.loteCounter = 0;
  }

  generateDeviceId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('base64url').replace(/=+$/, '');
  }

  generateLoteId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return 'l' + bs58.encode(bytes);
  }

  now() {
    return Math.round(this.serverTime + (Date.now() - this.perfBase));
  }

  updateClock(serverNow, rtt) {
    if (!Number.isFinite(serverNow) || rtt > 2000) return;
    this.serverTime = serverNow + rtt / 2;
    this.perfBase = Date.now();
  }

  async request(method, path, body, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = Date.now();

    try {
      const opts = {
        method,
        headers: {
          'Cookie': this.cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Origin': BASE,
          'Referer': `${BASE}/play`,
        },
        signal: controller.signal,
      };

      if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }

      const res = await fetch(API + path, opts);

      const setCookies = res.headers.getSetCookie?.() || [];
      if (setCookies.length) {
        const parsed = setCookies.map(c => c.split(';')[0]).join('; ');
        const existing = this.cookies ? this.cookies.split('; ') : [];
        const map = {};
        for (const c of existing) {
          const [k] = c.split('=');
          if (k) map[k.trim()] = c;
        }
        for (const c of parsed.split('; ')) {
          const [k] = c.split('=');
          if (k) map[k.trim()] = c;
        }
        this.cookies = Object.values(map).join('; ');
      }

      let json = null;
      try { json = await res.json(); } catch { }

      const rtt = Date.now() - t0;
      return { status: res.status, json, rtt, espera: Number(res.headers.get('retry-after')) || 0 };
    } catch (e) {
      return { status: 0, json: null, rtt: Date.now() - t0, espera: 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck() {
    const r = await this.request('GET', '/saude');
    if (r.json?.jogo === 'solranch') {
      if (r.json.agora) this.updateClock(r.json.agora, r.rtt);
      return { ok: true, data: r.json };
    }
    return { ok: false, error: 'Server down or unreachable' };
  }

  async login() {
    console.log(`[AUTH] Logging in with wallet ${this.address}...`);

    const challenge = await this.request('POST', '/login/desafio', { endereco: this.address });
    if (!challenge.json?.ok) {
      throw new Error(`Challenge failed: ${challenge.json?.erro || 'no response'}`);
    }

    const message = challenge.json.mensagem;
    const nonce = challenge.json.nonce;

    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, this.keypair.secretKey);
    const sigBase64 = Buffer.from(signature).toString('base64');

    const loginBody = {
      endereco: this.address,
      nonce,
      assinatura: sigBase64,
      fusoMin: new Date().getTimezoneOffset(),
      dispositivo: this.deviceId,
    };

    const r = await this.request('POST', '/login/entrar', loginBody);
    if (!r.json?.ok) {
      throw new Error(`Login failed: ${r.json?.erro || 'no response'}`);
    }

    if (r.json.agora) this.updateClock(r.json.agora, r.rtt);
    console.log(`[AUTH] Logged in successfully!`);
    return r.json;
  }

  async getState() {
    const r = await this.request('GET', '/estado');
    if (r.status === 401) throw new Error('Session expired');
    if (r.json?.ok && r.json.agora) this.updateClock(r.json.agora, r.rtt);
    return r.json;
  }

  injectGesto(params) {
    return { ...params, gesto: fakeGestoMs() };
  }

  async sendActions(actions) {
    const loteId = this.generateLoteId();
    const body = {
      loteId,
      lote: actions.map(a => ({
        nome: a.name,
        params: this.injectGesto(a.params || {}),
      })),
    };

    const r = await this.request('POST', '/acoes', body);
    if (r.status === 401) throw new Error('Session expired');
    if (r.json?.ok && r.json.agora) this.updateClock(r.json.agora, r.rtt);
    return r.json;
  }

  async sendAction(name, params = {}) {
    return this.sendActions([{ name, params }]);
  }

  async pvp(method, path, body) {
    if (body && typeof body === 'object') body = this.injectGesto(body);
    const r = await this.request(method, path, body);
    if (r.status === 401) throw new Error('Session expired');
    if (r.json?.ok && r.json?.jogo?.agora) this.updateClock(r.json.jogo.agora, r.rtt);
    return r.json;
  }
}
