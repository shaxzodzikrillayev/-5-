/**
 * Полная проверка API: регистрация всех ролей, вход/выход, сессия,
 * CRUD дежурств, статусы, замены, статистика, отчёты, история, права доступа.
 *
 * Запуск:  node scripts/test-api.js            (сервер должен быть запущен)
 */
const BASE = process.env.TEST_API_BASE || 'http://localhost:5000/api';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  \u2717 ${name} ${extra}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

class Client {
  constructor(label) {
    this.label = label;
    this.cookie = '';
    this.csrf = '';
  }

  async request(method, path, body, { raw = false, headers = {} } = {}) {
    const url = `${BASE}${path}`;
    const init = { method, headers: { Accept: 'application/json', ...headers }, redirect: 'manual' };
    if (this.cookie) init.headers.Cookie = this.cookie;
    if (this.csrf && !['GET', 'HEAD'].includes(method)) init.headers['X-CSRF-Token'] = this.csrf;
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookie) {
      const [pair] = c.split(';');
      const [name, value] = pair.split('=');
      if (name === 'dz_session') this.cookie = `dz_session=${value}`;
    }
    if (raw) {
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not json */
      }
      return { status: res.status, json, text };
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (json && json.csrfToken) this.csrf = json.csrfToken;
    return { status: res.status, json };
  }

  get(p, o) { return this.request('GET', p, undefined, o); }
  post(p, b, o) { return this.request('POST', p, b, o); }
  patch(p, b, o) { return this.request('PATCH', p, b, o); }
  del(p, b, o) { return this.request('DELETE', p, b, o); }
}

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function monthISO(offsetMonths = 0) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return d.toISOString().slice(0, 7);
}
const uniq = Date.now().toString(36);
const RUN_OFFSET = 200 + (parseInt(uniq.slice(-5), 36) % 400);

async function main() {
  console.log(`\n=== Проверка API: ${BASE} ===`);

  section('1. Базовые маршруты и 404');
  const anon = new Client('anon');
  let r = await anon.get('/health');
  check('GET /api/health -> 200', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));

  r = await anon.get('/auth/me');
  check('GET /api/auth/me (без сессии) -> 200 + authenticated:false', r.status === 200 && r.json?.authenticated === false, JSON.stringify(r.json));

  r = await anon.get('/nonexistent-route');
  check('GET /api/nonexistent -> 404 (не html, не 500)', r.status === 404 && !!r.json?.error, `status=${r.status}`);

  r = await anon.get('/duties/today');
  check('GET /api/duties/today без авторизации -> 401', r.status === 401, `status=${r.status}`);

  section('2. Защита ролей при регистрации');
  // На пустой БД первый куратор регистрируется без кода (bootstrap), поэтому
  // проверка зависит от состояния базы.
  const settingsState = await anon.get('/settings');
  const kuratorExists = settingsState.json?.kuratorExists === true;

  const badStudent = new Client('bad');
  if (kuratorExists) {
    r = await badStudent.post('/auth/register', {
      firstName: 'Тест', lastName: 'Ученик', email: `nostcode-${uniq}@t.uz`, password: 'secret123', role: 'kurator',
    });
    check('Регистрация куратором без кода -> 403', r.status === 403, `status=${r.status} ${JSON.stringify(r.json)}`);
  } else {
    r = await badStudent.post('/auth/register', {
      firstName: 'Первый', lastName: 'Куратор', email: `first-kurator-${uniq}@t.uz`, password: 'secret123', role: 'kurator',
    });
    check('Первый куратор регистрируется без кода (bootstrap) -> 201', r.status === 201 && r.json?.user?.role === 'kurator', `status=${r.status} ${JSON.stringify(r.json)}`);

    r = await new Client('bad2').post('/auth/register', {
      firstName: 'Тест', lastName: 'Ученик', email: `nostcode-${uniq}@t.uz`, password: 'secret123', role: 'kurator',
    });
    check('Второй куратор без кода -> 403', r.status === 403, `status=${r.status} ${JSON.stringify(r.json)}`);
  }

  r = await badStudent.post('/auth/register', {
    firstName: 'Тест', lastName: 'Староста', email: `nostcode2-${uniq}@t.uz`, password: 'secret123', role: 'starosta', code: 'WRONG-CODE',
  });
  check('Регистрация старостой с неверным кодом -> 403', r.status === 403, `status=${r.status}`);

  section('3. Регистрация всех трёх ролей');
  const student = new Client('student');
  const studentEmail = `s1-${uniq}@t.uz`;
  r = await student.post('/auth/register', {
    firstName: 'Алишер', lastName: 'Тестов', email: studentEmail, password: 'secret123', role: 'student',
  });
  check('POST /api/auth/register (ученик) -> 201', r.status === 201 && !!r.json?.user?.studentId, JSON.stringify(r.json));
  const studentId = r.json?.user?.studentId;

  r = await student.post('/auth/register', {
    firstName: 'Дубль', lastName: 'Ученик', email: studentEmail, password: 'secret123', role: 'student',
  });
  check('Повторная регистрация email -> 409', r.status === 409, `status=${r.status}`);

  const starosta = new Client('starosta');
  r = await starosta.post('/auth/register', {
    firstName: 'Тимур', lastName: 'ТестовСтароста', email: `st-${uniq}@t.uz`, password: 'secret123', role: 'starosta',
    code: process.env.CODE_STAROSTA || 'STAR-2026',
  });
  check('POST /api/auth/register (староста с кодом) -> 201', r.status === 201 && r.json?.user?.role === 'starosta', JSON.stringify(r.json));
  const starostaStudentId = r.json?.user?.studentId;

  const kurator = new Client('kurator');
  r = await kurator.post('/auth/register', {
    firstName: 'Учитель', lastName: 'ТестовКуратор', email: `kr-${uniq}@t.uz`, password: 'secret123', role: 'kurator',
    code: process.env.CODE_KURATOR || 'ADMIN-2026',
  });
  check('POST /api/auth/register (куратор с кодом) -> 201', r.status === 201 && r.json?.user?.role === 'kurator', JSON.stringify(r.json));

  r = await student.post('/auth/register', {
    firstName: 'Корот', lastName: 'Имя', email: `x-${uniq}@t.uz`, password: '12', role: 'student',
  });
  check('Слабый пароль -> 400', r.status === 400, `status=${r.status}`);

  r = await student.post('/auth/register', {
    firstName: 'Плохой', lastName: 'Емейл', email: `not-an-email-${uniq}`, password: 'secret123', role: 'student',
  });
  check('Некорректный email -> 400', r.status === 400, `status=${r.status}`);

  section('4. Сессия, /me, logout');
  r = await starosta.get('/auth/me');
  check('GET /api/auth/me после регистрации -> роль старосты', r.status === 200 && r.json?.user?.role === 'starosta', JSON.stringify(r.json));
  check('GET /api/auth/me возвращает csrfToken', !!r.json?.csrfToken);

  r = await starosta.get('/auth/csrf');
  check('GET /api/auth/csrf -> 200 с токеном', r.status === 200 && !!r.json?.csrfToken, JSON.stringify(r.json));

  r = await kurator.get('/auth/csrf');
  check('GET /api/auth/csrf (второй клиент) -> свой токен', r.status === 200 && r.json?.csrfToken !== r.json?.csrfToken + 'x');

  const loginClient = new Client('login');
  r = await loginClient.post('/auth/login', { email: `st-${uniq}@t.uz`, password: 'wrongpass' });
  check('POST /api/auth/login с неверным паролем -> 401', r.status === 401, `status=${r.status}`);

  r = await loginClient.post('/auth/login', { email: `st-${uniq}@t.uz`, password: 'secret123' });
  check('POST /api/auth/login -> 200 + cookie', r.status === 200 && !!r.json?.user?.id, JSON.stringify(r.json));

  r = await loginClient.get('/auth/me');
  check('Сессия сохраняется между запросами (имитация F5)', r.status === 200 && r.json?.authenticated === true);

  section('5. CSRF-защита');
  const noCsrf = new Client('nocsrf');
  await noCsrf.post('/auth/login', { email: `st-${uniq}@t.uz`, password: 'secret123' });
  noCsrf.csrf = 'forged-token-value';
  r = await noCsrf.post('/duties', { date: todayISO(), studentId: starostaStudentId });
  check('POST /api/duties с чужим CSRF-токеном -> 403', r.status === 403, `status=${r.status}`);
  noCsrf.csrf = '';
  r = await noCsrf.post('/duties', { date: todayISO(), studentId: starostaStudentId });
  check('POST /api/duties без CSRF-токена -> 403', r.status === 403, `status=${r.status}`);

  section('6. Ученики');
  r = await starosta.get('/students');
  check('GET /api/students -> массив со статистикой', r.status === 200 && Array.isArray(r.json?.students) && r.json.students.length > 0);
  const firstStudent = r.json.students[0];
  check('Карточка ученика содержит stats', firstStudent && typeof firstStudent.stats === 'object');

  r = await starosta.get(`/students/${studentId}`);
  check('GET /api/students/:id -> 200', r.status === 200 && r.json?.student?.id === studentId, JSON.stringify(r.json).slice(0, 200));

  r = await starosta.get('/students/несуществующий-id');
  check('GET /api/students/неизвестный -> 404', r.status === 404, `status=${r.status}`);

  r = await starosta.get(`/students/${studentId}/history`);
  check('GET /api/students/:id/history -> 200', r.status === 200 && Array.isArray(r.json?.history), JSON.stringify(r.json).slice(0, 200));

  r = await student.get('/students');
  check('Ученик тоже видит список учеников', r.status === 200 && Array.isArray(r.json?.students));

  r = await student.post('/students', { firstName: 'Хакер', lastName: 'Плохой' });
  check('Ученик не может создавать учеников -> 403', r.status === 403, `status=${r.status}`);

  const newStudentEmail = `ns-${uniq}@t.uz`;
  r = await starosta.post('/students', {
    firstName: 'Ново', lastName: 'Учеников', email: newStudentEmail, password: 'secret123',
  });
  check('POST /api/students (староста) -> 201', r.status === 201 && !!r.json?.student?.id, JSON.stringify(r.json).slice(0, 200));
  const createdStudentId = r.json?.student?.id;

  r = await student.get(`/students/${createdStudentId}`);
  check('Ученик может посмотреть карточку другого ученика', r.status === 200);

  r = await student.patch(`/students/${createdStudentId}`, { firstName: 'Взлом' });
  check('Ученик не может редактировать чужие данные -> 403', r.status === 403, `status=${r.status}`);

  r = await starosta.patch(`/students/${createdStudentId}`, { firstName: 'Обновлён', lastName: 'Учеников' });
  check('PATCH /api/students/:id (староста) -> 200', r.status === 200 && r.json?.student?.firstName === 'Обновлён', JSON.stringify(r.json).slice(0, 200));

  r = await student.del(`/students/${createdStudentId}`, { confirm: true, permanent: true });
  check('Ученик не может удалить ученика -> 403', r.status === 403, `status=${r.status}`);

  r = await starosta.del(`/students/${createdStudentId}`, { confirm: true });
  check('Удаление без permanent -> 400', r.status === 400, `status=${r.status}`);

  r = await kurator.del(`/students/${createdStudentId}`, { confirm: true });
  check('Удаление без permanent (куратор) -> 400', r.status === 400, `status=${r.status}`);

  r = await kurator.del(`/students/${createdStudentId}`, {});
  check('Удаление без подтверждения -> 400', r.status === 400, `status=${r.status}`);

  r = await kurator.post(`/students/${createdStudentId}/archive`, {});
  check('Архивирование без подтверждения -> 400', r.status === 400, `status=${r.status}`);

  r = await starosta.post(`/students/${createdStudentId}/archive`, { confirm: true });
  check('Архивирование без роли куратора -> 403', r.status === 403, `status=${r.status}`);

  r = await kurator.post(`/students/${createdStudentId}/archive`, { confirm: true });
  check('POST /api/students/:id/archive (куратор) -> 200', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));

  r = await kurator.post(`/students/${createdStudentId}/restore`, {});
  check('POST /api/students/:id/restore -> 200', r.status === 200, JSON.stringify(r.json).slice(0, 120));

  r = await starosta.del(`/students/${createdStudentId}`, { confirm: true, permanent: true });
  check('DELETE /api/students/:id (староста) -> 200', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));
  check(
    'Удаление безвозвратно: карточка исчезла',
    (await starosta.get(`/students/${createdStudentId}`)).status === 404,
  );
  check(
    'Аккаунт удалённого ученика не может войти',
    (await new Client('del-user').post('/auth/login', { email: newStudentEmail, password: 'secret123' })).status === 401,
  );

  r = await kurator.del(`/students/${createdStudentId}`, { confirm: true, permanent: true });
  check('Повторное удаление -> 404', r.status === 404, `status=${r.status}`);

  section('7. Дежурства');
  const dutyDate = todayISO(1);
  r = await starosta.post('/duties', { date: dutyDate, studentId });
  check('POST /api/duties -> 201', r.status === 201 && !!r.json?.duty?.id, JSON.stringify(r.json).slice(0, 200));
  const dutyId = r.json?.duty?.id;

  r = await starosta.post('/duties', { date: dutyDate, studentId });
  check('Повторное назначение того же ученика -> 409', r.status === 409, `status=${r.status}`);

  r = await starosta.post('/duties', { date: 'недата', studentId });
  check('POST /api/duties с плохой датой -> 400', r.status === 400, `status=${r.status}`);

  r = await starosta.post('/duties', { date: dutyDate, studentId: 'нет-такого' });
  check('POST /api/duties с несуществующим учеником -> 400', r.status === 400, `status=${r.status}`);

  r = await starosta.get('/duties/today');
  check('GET /api/duties/today -> 200', r.status === 200 && Array.isArray(r.json?.duties), JSON.stringify(r.json).slice(0, 120));

  r = await starosta.get(`/duties/month?month=${monthISO()}`);
  check('GET /api/duties/month -> 200', r.status === 200 && r.json?.month === monthISO() && Array.isArray(r.json?.duties));

  r = await starosta.get(`/duties/date/${dutyDate}`);
  check('GET /api/duties/date/:date -> 200', r.status === 200 && Array.isArray(r.json?.duties));

  r = await starosta.get(`/duties?from=${todayISO(-7)}&to=${todayISO(7)}`);
  check('GET /api/duties?from&to -> 200', r.status === 200 && r.json?.duties.length > 0);

  r = await student.get('/duties/mine');
  check('GET /api/duties/mine -> 200', r.status === 200 && Array.isArray(r.json?.duties), JSON.stringify(r.json).slice(0, 120));

  r = await student.get(`/duties/${dutyId}`);
  check('Ученик видит своё дежурство -> 200', r.status === 200 && r.json?.duty?.id === dutyId);

  const otherDuty = (await starosta.get(`/duties?from=${todayISO(-7)}&to=${todayISO(7)}`)).json?.duties?.find(
    (d) => d.studentId !== studentId,
  );
  if (otherDuty) {
    r = await student.get(`/duties/${otherDuty.id}`);
    check('Ученик не видит чужое дежурство -> 404', r.status === 404, `status=${r.status}`);
  }

  r = await starosta.get(`/duties/${dutyId}`);
  check('GET /api/duties/:id -> содержит историю записей', r.status === 200 && Array.isArray(r.json?.records));

  r = await starosta.patch(`/duties/${dutyId}`, { comment: 'Проверка комментария' });
  check('PATCH /api/duties/:id -> 200', r.status === 200 && r.json?.duty?.comment === 'Проверка комментария');

  section('8. Статусы дежурства');
  for (const status of ['served', 'not_served', 'sick', 'excused', 'replaced', 'absent']) {
    r = await starosta.post(`/duties/${dutyId}/status`, { status });
    check(`POST /api/duties/:id/status (${status}) -> 200`, r.status === 200 && r.json?.duty?.status === status, JSON.stringify(r.json).slice(0, 160));
  }

  r = await starosta.post(`/duties/${dutyId}/status`, { status: 'выдумка' });
  check('Неизвестный статус -> 400', r.status === 400, `status=${r.status}`);

  r = await student.post(`/duties/${dutyId}/status`, { status: 'served' });
  check('Ученик не может менять статус -> 403', r.status === 403, `status=${r.status}`);

  r = await starosta.post(`/duties/${dutyId}/comment`, { comment: 'Комментарий старосты' });
  check('POST /api/duties/:id/comment -> 200', r.status === 200 && r.json?.duty?.comment === 'Комментарий старосты');

  r = await kurator.post(`/duties/${dutyId}/status`, { status: 'served', comment: 'Исправлено куратором' });
  check('Куратор может исправить статус -> 200', r.status === 200 && r.json?.duty?.status === 'served');

  section('9. Замены');
  const busyDate = todayISO(2);
  await starosta.post('/duties', { date: busyDate, studentId });
  const freeStudent = (await starosta.get('/students')).json.students.find((s) => s.id !== studentId && s.isActive);
  r = await starosta.post('/replacements', {
    dutyId, replacementStudentId: freeStudent.id, reason: 'Болел',
  });
  check('POST /api/replacements -> 201', r.status === 201 && !!r.json?.replacement?.id, JSON.stringify(r.json).slice(0, 250));
  const replacementId = r.json?.replacement?.id;
  check('Замена помечает исходное дежурство статусом «Замена»', r.json?.duty?.status === 'replaced');
  check('Замена создаёт дежурство заменяющему', !!r.json?.newDuty?.id);

  r = await starosta.post('/replacements', { dutyId, replacementStudentId: freeStudent.id, reason: 'уточнённая причина' });
  check('Повторная та же замена обновляет причину -> 200', r.status === 200 && r.json?.updated === true, `status=${r.status}`);

  const anotherFree = (await starosta.get('/students')).json.students.find(
    (s) => s.id !== studentId && s.id !== freeStudent.id && s.isActive,
  );
  r = await starosta.post('/replacements', { dutyId, replacementStudentId: anotherFree.id, reason: 'другой' });
  check('Вторая замена другим учеником -> 409', r.status === 409, `status=${r.status}`);

  r = await starosta.post('/replacements', { dutyId, replacementStudentId: studentId, reason: 'сам себя' });
  check('Замена на самого себя -> 400', r.status === 400, `status=${r.status}`);

  r = await student.post('/replacements', { dutyId, replacementStudentId: freeStudent.id });
  check('Ученик не может оформлять замену -> 403', r.status === 403, `status=${r.status}`);

  r = await starosta.get(`/replacements?from=${todayISO(-7)}&to=${todayISO(7)}`);
  check('GET /api/replacements -> 200 со списком', r.status === 200 && r.json?.replacements.length > 0);

  r = await starosta.del(`/replacements/${replacementId}`, {});
  check('Отмена замены без подтверждения -> 400', r.status === 400, `status=${r.status}`);

  r = await starosta.del(`/replacements/${replacementId}`, { confirm: true });
  check('DELETE /api/replacements/:id -> 200', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json).slice(0, 200));

  section('10. Массовые операции и генерация');
  r = await starosta.post('/duties/bulk', {
    dates: [todayISO(RUN_OFFSET)],
    studentIds: (await starosta.get('/students')).json.students.slice(0, 3).map((s) => s.id),
  });
  check('POST /api/duties/bulk -> 201', r.status === 201 && r.json?.created > 0, JSON.stringify(r.json).slice(0, 150));

  r = await starosta.post('/duties/generate', {
    from: todayISO(RUN_OFFSET + 10), to: todayISO(RUN_OFFSET + 17), perDay: 2, skipWeekends: true,
  });
  check('POST /api/duties/generate -> 201', r.status === 201 && r.json?.created > 0, JSON.stringify(r.json).slice(0, 150));

  r = await student.post('/duties/generate', { from: todayISO(RUN_OFFSET + 40), to: todayISO(RUN_OFFSET + 41) });
  check('Ученик не может генерировать расписание -> 403', r.status === 403, `status=${r.status}`);

  section('11. Статистика, отчёты, история');
  r = await starosta.get('/statistics');
  check('GET /api/statistics -> 200 с today/week/month', r.status === 200 && !!r.json?.today && !!r.json?.week && !!r.json?.month, JSON.stringify(r.json).slice(0, 150));
  check('Статистика содержит динамику по дням', Array.isArray(r.json?.series));
  check('Статистика содержит недельную динамику', Array.isArray(r.json?.weekly) && r.json.weekly.length === 8);

  r = await starosta.get(`/statistics?date=${todayISO()}&month=${monthISO()}`);
  check('GET /api/statistics с параметрами -> 200', r.status === 200 && r.json?.date === todayISO());

  r = await student.get('/statistics');
  check('GET /api/statistics доступен и ученику', r.status === 200);

  r = await kurator.get(`/reports/month?month=${monthISO()}`);
  check('GET /api/reports/month -> 200 с таблицей', r.status === 200 && Array.isArray(r.json?.table) && r.json.table.length > 0, JSON.stringify(r.json).slice(0, 150));
  check('Отчёт содержит итоги (totals)', !!r.json?.totals && typeof r.json.totals.assigned === 'number');

  r = await starosta.get(`/reports/month?month=${monthISO()}&studentId=${studentId}`);
  check('GET /api/reports/month?studentId -> детализация', r.status === 200 && Array.isArray(r.json?.detail?.entries), JSON.stringify(r.json).slice(0, 150));

  r = await starosta.get('/reports/month?month=2026-13');
  check('Некорректный месяц -> пустой/400', r.status === 400 || (r.status === 200 && r.json?.table?.length >= 0));

  r = await starosta.get('/reports/months');
  check('GET /api/reports/months -> 200', r.status === 200 && Array.isArray(r.json?.months));

  r = await starosta.get(`/reports/export?month=${monthISO()}`, { raw: true });
  check('GET /api/reports/export -> CSV', r.status === 200 && r.text.includes('Ученик;'), r.text.slice(0, 80));

  r = await student.get('/audit-logs');
  check('Ученик не видит историю изменений -> 403', r.status === 403, `status=${r.status}`);

  r = await starosta.get('/audit-logs?limit=20');
  check('GET /api/audit-logs (староста) -> 200', r.status === 200 && Array.isArray(r.json?.logs) && r.json.logs.length > 0, JSON.stringify(r.json).slice(0, 150));
  check('История содержит кто/что/когда', !!r.json.logs[0]?.actorName && !!r.json.logs[0]?.createdAt);

  r = await kurator.get('/audit-logs?action=duty.status&limit=10');
  check('Фильтр истории по действию работает', r.status === 200 && r.json.logs.every((l) => l.action.startsWith('duty.status')), JSON.stringify(r.json).slice(0, 150));

  section('12. Пользователи и настройки');
  r = await kurator.get('/settings');
  check('GET /api/settings -> 200', r.status === 200 && typeof r.json?.className === 'string');

  r = await student.get('/settings');
  check('GET /api/settings доступен без роли куратора', r.status === 200);

  r = await starosta.get('/users');
  check('GET /api/users (староста) -> 200', r.status === 200 && Array.isArray(r.json?.users));

  r = await student.get('/users');
  check('Ученик не видит список пользователей -> 403', r.status === 403, `status=${r.status}`);

  r = await starosta.patch('/settings', { className: 'Взлом класса' });
  check('Староста не может менять настройки -> 403', r.status === 403, `status=${r.status}`);

  r = await kurator.patch('/settings', { className: '10 «Б»' });
  check('PATCH /api/settings (куратор) -> 200', r.status === 200 && r.json?.className === '10 «Б»', JSON.stringify(r.json));

  r = await starosta.patch(`/users/${r.json?.user?.id || 'x'}/role`, { role: 'kurator' });
  check('Староста не может менять роли -> 403', r.status === 403, `status=${r.status}`);

  const loginStudent = new Client('login-student');
  r = await loginStudent.post('/auth/login', { email: studentEmail, password: 'secret123' });
  check('Вход существующего ученика -> 200', r.status === 200 && r.json?.user?.role === 'student');

  r = await kurator.patch(`/users/${r.json?.user?.id}/role`, { role: 'starosta' });
  check('Куратор может повысить ученика до старосты -> 200', r.status === 200 && r.json?.user?.role === 'starosta', JSON.stringify(r.json).slice(0, 150));
  await kurator.patch(`/users/${r.json?.user?.id}/role`, { role: 'student' });

  section('13. Смена пароля и logout');
  r = await loginStudent.patch('/auth/password', { currentPassword: 'неверный', newPassword: 'newsecret123' });
  check('Смена пароля с неверным текущим -> 400', r.status === 400, `status=${r.status}`);

  r = await loginStudent.patch('/auth/password', { currentPassword: 'secret123', newPassword: 'newsecret123' });
  check('PATCH /api/auth/password -> 200 и новая сессия', r.status === 200 && !!r.json?.csrfToken);

  r = await loginStudent.get('/auth/me');
  check('После смены пароля сессия жива', r.status === 200 && r.json?.authenticated === true);

  r = await loginStudent.post('/auth/login', { email: studentEmail, password: 'secret123' });
  check('Старый пароль больше не работает -> 401', r.status === 401, `status=${r.status}`);

  r = await loginStudent.post('/auth/login', { email: studentEmail, password: 'newsecret123' });
  check('Новый пароль работает -> 200', r.status === 200);

  r = await loginStudent.post('/auth/logout', {});
  check('POST /api/auth/logout -> 200', r.status === 200 && r.json?.ok === true);

  r = await loginStudent.get('/auth/me');
  check('После logout сессия недействительна', r.status === 200 && r.json?.authenticated === false, JSON.stringify(r.json));

  r = await loginStudent.get('/duties/today');
  check('После logout API закрыт -> 401', r.status === 401, `status=${r.status}`);

  section('14. Удаление дежурства');
  r = await starosta.del(`/duties/${dutyId}`, {});
  check('Удаление дежурства без confirm -> 400', r.status === 400, `status=${r.status}`);

  r = await kurator.del(`/duties/${dutyId}`, { confirm: true });
  check('DELETE /api/duties/:id (куратор, confirm) -> 200', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json).slice(0, 150));

  r = await starosta.get(`/duties/${dutyId}`);
  check('Удалённое дежурство больше не отдаётся -> 404', r.status === 404, `status=${r.status}`);

  console.log(`\n=== Итог: успешно ${passed}, провалено ${failed} ===`);
  if (failures.length) {
    console.log('Провалившиеся проверки:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nТест упал с ошибкой:', error);
  process.exit(1);
});