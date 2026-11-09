import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../worker.js';

// Execute the production migration and queries against SQLite, rather than
// mocking SQL results. The adapter provides the D1 binding methods in Node.
class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(readFileSync(new URL('../migrations/0001_users.sql', import.meta.url), 'utf8'));
  }
  withSession(mode) { assert.equal(mode, 'first-primary'); return this; }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql);
    let values = [];
    return {
      bind(...parameters) { values = parameters; return this; },
      async first() { const result = statement.get(...values); return result ? {...result} : null; },
      async run() {
        if (/\bRETURNING\b/i.test(sql)) return {results:statement.all(...values).map(row => ({...row})), success:true};
        const result = statement.run(...values);
        return {results:[], success:true, meta:{changes:Number(result.changes)}};
      }
    };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

function setup(t) {
  const USER_DB = new TestD1();
  const kv = new Map();
  t.after(() => USER_DB.sqlite.close());
  return {USER_DB, BLOG_TITLE:'Test Blog', ADMIN_USER:'admin', ADMIN_PASS:'admin-secret', BLOG_KV:{
    async get(key, type) { const value = kv.get(key); return value == null ? null : type === 'json' ? JSON.parse(value) : value; },
    async put(key, value) { kv.set(key, value); },
    async delete(key) { kv.delete(key); }
  }};
}

function send(env, path, {method = 'GET', data, cookie, origin = 'https://blog.example', ip = '203.0.113.1', headers = {}} = {}) {
  const requestHeaders = new Headers({'CF-Connecting-IP':ip, ...headers});
  if (cookie) requestHeaders.set('Cookie', cookie);
  if (method === 'POST') {
    if (origin !== null) requestHeaders.set('Origin', origin);
    if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
  }
  return worker.fetch(new Request(`https://blog.example${path}`, {
    method, headers:requestHeaders, ...(data !== undefined ? {body:new URLSearchParams(data).toString()} : {})
  }), env);
}

const credentials = (username = 'Reader', password = 'a long unique password') => ({username, password, confirm_password:password});
async function register(env, username = 'Reader', password = 'a long unique password', options = {}) {
  const response = await send(env, '/register', {method:'POST', data:credentials(username, password), ...options});
  assert.equal(response.status, 303, await response.clone().text());
  assert.equal(response.headers.get('Location'), '/account');
  return response.headers.get('Set-Cookie').split(';')[0];
}
const tokenHash = cookie => createHash('sha256').update(cookie.split('=')[1]).digest('hex');

test('register, read account, show login state, and log out end to end', async t => {
  const env = setup(t);
  const home = await send(env, '/');
  assert.match(await home.text(), /href="\/register"/);
  const page = await send(env, '/register');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  assert.match(await page.text(), /autocomplete="new-password"/);

  const cookie = await register(env);
  const user = env.USER_DB.sqlite.prepare('SELECT * FROM users').get();
  assert.equal(user.username_key, 'reader');
  assert.notEqual(user.password_hash, credentials().password);
  assert.match(user.password_salt, /^[a-f0-9]{32}$/);
  assert.match(user.password_hash, /^[a-f0-9]{64}$/);
  assert.equal(user.password_iterations, 100000);
  assert.ok(!JSON.stringify(user).includes(credentials().password));
  const stored = env.USER_DB.sqlite.prepare('SELECT * FROM user_sessions').get();
  assert.equal(stored.token_hash, tokenHash(cookie));
  assert.equal(stored.expires_at - stored.created_at, 604800000);

  const account = await send(env, '/account', {cookie});
  assert.equal(account.status, 200);
  assert.match(await account.text(), /你好，Reader/);
  const loggedInHome = await send(env, '/', {cookie});
  assert.match(await loggedInHome.text(), /href="\/account"/);
  assert.equal(loggedInHome.headers.get('Cache-Control'), 'no-store');
  for (const path of ['/register', '/user/login']) {
    assert.equal((await send(env, path, {cookie})).headers.get('Location'), '/account');
  }
  const logout = await send(env, '/user/logout', {method:'POST', cookie});
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(env.USER_DB.sqlite.prepare('SELECT count(*) AS n FROM user_sessions').get().n, 0);
  assert.equal((await send(env, '/account', {cookie})).headers.get('Location'), '/user/login');
});

test('passwords preserve whitespace; login is case insensitive; sessions rotate', async t => {
  const env = setup(t);
  const password = '  significant whitespace  ';
  const original = await register(env, 'Reader', password);
  const wrong = await send(env, '/user/login', {method:'POST', data:{username:'reader', password:password.trim()}});
  assert.equal(wrong.status, 401);
  assert.doesNotMatch(await wrong.text(), /value="  significant/);
  const login = await send(env, '/user/login', {method:'POST', cookie:original, data:{username:'READER', password}});
  assert.equal(login.status, 303);
  assert.match(login.headers.get('Set-Cookie'), /HttpOnly; SameSite=Lax; Max-Age=604800; Secure/);
  assert.notEqual(login.headers.get('Set-Cookie').split(';')[0], original);
  assert.equal((await send(env, '/account', {cookie:original})).status, 303);
  assert.equal(env.USER_DB.sqlite.prepare('SELECT count(*) AS n FROM user_sessions').get().n, 1);
});

test('unique usernames include normalization and concurrent creation', async t => {
  const env = setup(t);
  const responses = await Promise.all(['Reader', 'reader'].map(username => send(env, '/register', {method:'POST', data:credentials(username)})));
  assert.deepEqual(responses.map(r => r.status).sort(), [303, 409]);
  assert.equal(env.USER_DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  const duplicate = await send(env, '/register', {method:'POST', data:credentials(' READER ')});
  assert.equal(duplicate.status, 409);
});

test('reject invalid names, short/oversized passwords, mismatches, and HTML injection', async t => {
  const env = setup(t);
  for (const data of [credentials('ab'), credentials('<script>'), credentials('reader', 'short'), credentials('reader', 'x'.repeat(129)), {...credentials(), confirm_password:'different'}]) {
    const response = await send(env, '/register', {method:'POST', data});
    assert.equal(response.status, 400);
    assert.doesNotMatch(await response.text(), /value="<script>/);
  }
  assert.equal(env.USER_DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  const unknown = await send(env, '/user/login', {method:'POST', data:credentials('unknown')});
  assert.equal(unknown.status, 401);
  assert.match(await unknown.text(), /用户名或密码错误/);
});

test('visitor sessions cannot authorize any admin read or mutation; admin login still works', async t => {
  const env = setup(t);
  const visitorCookie = await register(env, 'admin');
  for (const [path, method] of [['/admin','GET'], ['/admin/new','GET'], ['/admin/new','POST'], ['/admin/edit/test','GET'], ['/admin/edit/test','POST'], ['/admin/delete/test','POST']]) {
    const response = await send(env, path, {method, cookie:visitorCookie, ...(method === 'POST' ? {data:{title:'unauthorized'}} : {})});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), '/login');
  }
  const adminLogin = await send(env, '/login', {method:'POST', data:{username:'admin', password:'admin-secret'}});
  assert.equal(adminLogin.status, 302);
  const adminCookie = adminLogin.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await send(env, '/admin', {cookie:adminCookie})).status, 200);
  assert.equal((await send(env, '/account', {cookie:adminCookie})).headers.get('Location'), '/user/login');
  // A cookie whose name only ends in "session" must not count as admin auth.
  assert.equal((await send(env, '/admin', {cookie:`user_${adminCookie}`})).headers.get('Location'), '/login');
  const both = `${visitorCookie}; ${adminCookie}`;
  assert.equal((await send(env, '/admin', {cookie:both})).status, 200);
  await send(env, '/user/logout', {method:'POST', cookie:both});
  assert.equal((await send(env, '/admin', {cookie:adminCookie})).status, 200);
});

test('reject missing, malformed, forged, expired, and revoked visitor sessions', async t => {
  const env = setup(t);
  for (const cookie of [undefined, 'user_session=invalid', `user_session=${'a'.repeat(64)}`]) {
    assert.equal((await send(env, '/account', {cookie})).headers.get('Location'), '/user/login');
  }
  const cookie = await register(env);
  env.USER_DB.sqlite.prepare('UPDATE user_sessions SET expires_at = ?').run(Date.now() - 1000);
  const response = await send(env, '/account', {cookie});
  assert.equal(response.headers.get('Location'), '/user/login');
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
});

test('cross-origin login, registration, and logout are rejected without mutations', async t => {
  const env = setup(t);
  const cookie = await register(env);
  for (const path of ['/register', '/user/login', '/user/logout']) {
    for (const origin of ['https://evil.example', 'null', null]) {
      const response = await send(env, path, {method:'POST', cookie, data:credentials('other'), origin});
      assert.equal(response.status, 403);
    }
  }
  assert.equal(env.USER_DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  assert.equal((await send(env, '/account', {cookie})).status, 200);
  const fallback = await send(env, '/user/logout', {method:'POST', cookie, origin:null, headers:{Referer:'https://blog.example/account'}});
  assert.equal(fallback.status, 303);
  assert.equal((await send(env, '/user/logout')).status, 405);
});

test('registration rate limits persist in D1 and expire', async t => {
  const env = setup(t);
  for (let i = 0; i < 5; i++) await register(env, `reader${i}`);
  const limited = await send(env, '/register', {method:'POST', data:credentials('reader5')});
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Content-Type'), 'text/html; charset=UTF-8');
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  assert.equal(env.USER_DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 5);
  env.USER_DB.sqlite.prepare('UPDATE auth_rate_limits SET expires_at = ?').run(Date.now() - 1);
  await register(env, 'reader5');
});

test('login is rate limited by normalized account across different IPs', async t => {
  const env = setup(t);
  await register(env);
  for (let i = 0; i < 10; i++) {
    assert.equal((await send(env, '/user/login', {method:'POST', data:credentials(i % 2 ? 'Reader' : 'READER', 'wrong password value'), ip:`203.0.113.${i + 2}`})).status, 401);
  }
  const limited = await send(env, '/user/login', {method:'POST', data:credentials(), ip:'203.0.113.100'});
  assert.equal(limited.status, 429);
});

test('unsupported methods, invalid content types, and oversized bodies fail safely', async t => {
  const env = setup(t);
  assert.equal((await send(env, '/register', {method:'PUT'})).status, 405);
  assert.equal((await send(env, '/account', {method:'POST', data:{}})).status, 405);
  const json = await send(env, '/register', {method:'POST', data:{}, headers:{'Content-Type':'application/json'}});
  assert.equal(json.status, 415);
  const oversized = await send(env, '/register', {method:'POST', data:{password:'x'.repeat(17000)}});
  assert.equal(oversized.status, 413);
  assert.equal(oversized.headers.get('Content-Type'), 'text/html; charset=UTF-8');
  assert.equal(env.USER_DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('missing or unavailable user database fails closed without breaking public reading', async t => {
  const env = setup(t);
  delete env.USER_DB;
  assert.equal((await send(env, '/register')).status, 503);
  assert.equal((await send(env, '/account')).status, 503);
  assert.equal((await send(env, '/')).status, 200);
  env.USER_DB = {withSession() { throw new Error('sensitive database details'); }};
  const unavailable = await send(env, '/user/login', {method:'POST', data:credentials()});
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /sensitive database details|a long unique password/);
  assert.equal((await send(env, '/', {cookie:`user_session=${'a'.repeat(64)}`})).status, 200);
});
