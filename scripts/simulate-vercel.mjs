/**
 * Локальная имитация serverless-окружения Vercel: вызывает api/index.js
 * так же, как это делает платформа, и печатает ответы.
 *
 * Запуск: node scripts/simulate-vercel.mjs [--vercel-env]
 */
process.env.NODE_ENV = 'production';
process.env.SESSION_SECRET ||= 'sim-secret-for-local-checks-only';
if (process.argv.includes('--vercel-env')) {
  process.env.VERCEL = '1';
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_FILE;
}

// Импорт строго после установки переменных: конфиг читает их в момент загрузки.
const { default: handler } = await import('../api/index.js');

function call(method, url, { headers = {}, body, cookies } = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      url,
      originalUrl: url,
      path: url.replace(/^\/api/, '') || '/',
      headers: {
        host: '5-tau-puce.vercel.app',
        origin: 'https://5-tau-puce.vercel.app',
        'x-forwarded-host': '5-tau-puce.vercel.app',
        'x-forwarded-proto': 'https',
        ...headers,
      },
      body,
      query: Object.fromEntries(new URL(url, 'http://x').searchParams),
      params: {},
      get(name) {
        return this.headers[String(name).toLowerCase()];
      },
      getHeader(name) {
        return this.headers[String(name).toLowerCase()];
      },
      cookies: Object.fromEntries(
        (cookies || '')
          .split(';')
          .map((c) => c.trim().split('='))
          .filter((p) => p[0]),
      ),
      socket: {},
    };
    const res = {
      statusCode: 200,
      headers: {},
      headersSent: false,
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return this.headers[String(k).toLowerCase()];
      },
      removeHeader(k) {
        delete this.headers[String(k).toLowerCase()];
      },
      getHeaderNames() {
        return Object.keys(this.headers);
      },
      writeHead(status, extra = {}) {
        this.statusCode = status;
        Object.entries(extra).forEach(([k, v]) => this.setHeader(k, v));
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        this.headersSent = true;
        resolve({ status: this.statusCode, body: payload });
      },
      send(payload) {
        this.body = payload;
        this.headersSent = true;
        resolve({ status: this.statusCode, body: payload });
      },
      end(payload) {
        if (payload) this.body = payload;
        this.headersSent = true;
        resolve({ status: this.statusCode, body: this.body });
      },
      on() {},
      once() {},
      emit() {},
    };
    Promise.resolve(handler(req, res)).catch((error) => {
      resolve({ status: 500, body: { thrown: error.message } });
    });
  });
}

const checks = [
  ['GET', '/api/health', null],
  ['GET', '/api/auth/me', null],
  ['GET', '/api/settings', null],
  ['POST', '/api/auth/register', {
    firstName: 'Симуляция',
    lastName: 'Проверка',
    email: `sim-${Date.now()}@t.uz`,
    password: 'secret123',
    role: 'student',
  }],
];

let failed = 0;
for (const [method, url, body] of checks) {
  const r = await call(method, url, {
    headers: body ? { 'content-type': 'application/json' } : {},
    body,
  });
  const ok = r.status < 500;
  if (!ok) failed += 1;
  const text = typeof r.body === 'string' ? r.body.slice(0, 120) : JSON.stringify(r.body).slice(0, 160);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${method} ${url} -> ${r.status} ${text}`);
}

console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки прошли (5xx нет)');
process.exit(failed ? 1 : 0);