/* eslint-disable */
/**
 * Load test k6 untuk Survei Populi — alur nyata responden.
 *
 * MODE:
 *   browse (default) — login → daftar survei → buka /fill. Repeatable (baca-berat),
 *                      cocok untuk uji kapasitas baca & konkurensi tinggi.
 *   submit           — browse + KIRIM jawaban. Setiap iterasi memakai SATU akun
 *                      unik (1 respons/akun/survei), jadi jumlah iterasi ≤ LOADTEST_USERS.
 *
 * SCENARIO: smoke | load | stress | spike | soak  (lihat opsi di bawah)
 *
 * ENV wajib:
 *   BASE_URL     — mis. http://localhost:3000  (backend langsung)
 *                        atau http://localhost/api  (lewat nginx)
 *   SURVEY_ID    — id survei uji AKTIF (tanpa targeting; tipe pertanyaan sederhana)
 * ENV opsional:
 *   MODE=browse|submit  LOADTEST_USERS=2000  VUS=500  DURATION=3m
 *   P95_MS=800  ERR_RATE=0.01
 *
 * Contoh:
 *   k6 run -e BASE_URL=http://localhost:3000 -e SURVEY_ID=... -e SCENARIO=load script.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const SURVEY_ID = __ENV.SURVEY_ID || '';
const MODE = (__ENV.MODE || 'browse').toLowerCase();
const USERS = parseInt(__ENV.LOADTEST_USERS || '2000', 10);
const PASSWORD = __ENV.LOADTEST_PASSWORD || 'LoadTest12345';
const P95 = parseInt(__ENV.P95_MS || '800', 10);
const ERR = parseFloat(__ENV.ERR_RATE || '0.01');
const VUS = parseInt(__ENV.VUS || '500', 10);
const DURATION = __ENV.DURATION || '3m';

const loginTrend = new Trend('t_login', true);
const fillTrend = new Trend('t_fill', true);
const submitTrend = new Trend('t_submit', true);
const bizErrors = new Rate('business_errors'); // 4xx/5xx yang bukan 409 "sudah isi"

// ── Skenario ────────────────────────────────────────────────────────────────
const SCENARIOS = {
  smoke: { executor: 'constant-vus', vus: 3, duration: '30s' },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: VUS },
      { duration: DURATION, target: VUS },
      { duration: '30s', target: 0 },
    ],
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: VUS },
      { duration: '1m', target: VUS * 2 },
      { duration: '1m', target: VUS * 3 },
      { duration: '1m', target: VUS * 4 },
      { duration: '30s', target: 0 },
    ],
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: VUS },
      { duration: '10s', target: VUS * 3 }, // lonjakan mendadak
      { duration: '1m', target: VUS * 3 },
      { duration: '20s', target: 0 },
    ],
  },
  soak: { executor: 'constant-vus', vus: Math.max(50, Math.floor(VUS / 5)), duration: '30m' },
};
const scenarioName = __ENV.SCENARIO || 'smoke';

export const options = {
  scenarios: { main: SCENARIOS[scenarioName] || SCENARIOS.smoke },
  thresholds: {
    http_req_failed: [`rate<${ERR}`],
    http_req_duration: [`p(95)<${P95}`],
    business_errors: [`rate<${ERR}`],
  },
  // Ringkas: jangan cetak setiap URL.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function uuidv4() {
  // Cukup untuk lolos @IsUUID() (format v4); bukan untuk keamanan.
  let s = '';
  const hex = '0123456789abcdef';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += hex[(Math.floor(Math.random() * 4) + 8)];
    else s += hex[Math.floor(Math.random() * 16)];
  }
  return s;
}

function login(email) {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } },
  );
  loginTrend.add(res.timings.duration);
  const ok = check(res, { 'login 2xx': (r) => r.status === 200 || r.status === 201 });
  if (!ok) {
    bizErrors.add(1);
    return null;
  }
  try {
    return JSON.parse(res.body).accessToken;
  } catch {
    bizErrors.add(1);
    return null;
  }
}

/** Bangun jawaban valid untuk pertanyaan WAJIB dari struktur /fill. */
function buildAnswers(fill) {
  const out = [];
  for (const q of fill.questions || []) {
    if (!q.required) continue;
    let value;
    switch (q.type) {
      case 'single_choice':
      case 'dropdown':
        value = q.options && q.options[0] ? q.options[0].value : 'opt1';
        break;
      case 'multiple_choice':
        value = [q.options && q.options[0] ? q.options[0].value : 'opt1'];
        break;
      case 'numeric_scale':
        value = q.scaleMin != null ? q.scaleMin : 1;
        break;
      case 'rating_scale':
        value = 1;
        break;
      case 'date':
      case 'date_time':
        value = '2026-01-01';
        break;
      case 'phone_number':
        value = '081200000000';
        break;
      default:
        value = 'loadtest';
    }
    out.push({ questionId: q.id, value });
  }
  return out;
}

// setup(): jalankan sekali — ambil struktur survei & siapkan template jawaban.
export function setup() {
  if (!SURVEY_ID) throw new Error('SURVEY_ID wajib diisi (id survei uji aktif).');
  const token = login(`loadtest+000001@loadtest.local`);
  if (!token) throw new Error('Gagal login akun uji #1 — sudah jalankan seed-loadtest?');
  const res = http.get(`${BASE}/surveys/${SURVEY_ID}/fill`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) throw new Error(`GET /fill gagal (${res.status}) — cek SURVEY_ID & status aktif.`);
  const fill = JSON.parse(res.body);
  return { answers: buildAnswers(fill) };
}

// State per-VU (init context) — persist antar-iterasi VU yang sama.
let vuToken = null;

export default function (data) {
  let token;
  if (MODE === 'submit') {
    // Akun UNIK per iterasi (1 respons/akun/survei) → login tiap iterasi.
    const idx = (exec.scenario.iterationInTest % USERS) + 1;
    token = login(`loadtest+${String(idx).padStart(6, '0')}@loadtest.local`);
  } else {
    // browse: user AKTIF realistis — login SEKALI per VU, token dipakai ulang
    // (tanpa ini, bcrypt login tiap iterasi men-dominasi CPU & menyesatkan).
    if (!vuToken) {
      const idx = (exec.vu.idInTest % USERS) + 1;
      vuToken = login(`loadtest+${String(idx).padStart(6, '0')}@loadtest.local`);
    }
    token = vuToken;
  }
  if (!token) return;
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // Baca daftar survei tersedia (endpoint responden; beban baca umum).
  http.get(`${BASE}/surveys/available`, { ...auth, tags: { name: 'available' } });

  // Buka form.
  const fillRes = http.get(`${BASE}/surveys/${SURVEY_ID}/fill`, { ...auth, tags: { name: 'fill' } });
  fillTrend.add(fillRes.timings.duration);
  check(fillRes, { 'fill 2xx': (r) => r.status === 200 });

  if (MODE === 'submit') {
    const startedAt = new Date(Date.now() - 10000).toISOString();
    const payload = JSON.stringify({
      answers: data.answers,
      deviceType: 'loadtest',
      clientSubmissionId: uuidv4(),
      clientStartedAt: startedAt,
    });
    const res = http.post(`${BASE}/surveys/${SURVEY_ID}/responses/submit`, payload, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      tags: { name: 'submit' },
    });
    submitTrend.add(res.timings.duration);
    // 409 = akun ini sudah mengirim (iterasi > jumlah akun) → bukan error server.
    const ok = check(res, { 'submit ok/409': (r) => r.status === 200 || r.status === 201 || r.status === 409 });
    if (!ok) bizErrors.add(1);
    else bizErrors.add(0);
  }

  sleep(Math.random() * 1 + 0.5); // think-time 0.5–1.5s
}
