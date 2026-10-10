import { PGlite, types } from '@electric-sql/pglite';
const raw = {}; for (const k of Object.keys(types)) { const v = types[k]; if (typeof v==='number') raw[v]=x=>x; }
const db = new PGlite({ parsers: raw });
await db.exec(`create schema shop; create table shop.t(id int, n numeric(10,2), d timestamp, b bool, big bigint); insert into shop.t values (1, 3.10, '2025-03-01 10:00', true, 10), (2,null,null,false,20);`);
const r = await db.query('select * from shop.t', [], { rowMode: 'array' });
console.log(r.rows, r.fields);
try { await db.query('select 1; select 2'); } catch(e) { console.log('multi:', e.code, e.message); }
await db.exec('BEGIN READ ONLY; SET LOCAL search_path TO shop');
try { await db.query('delete from t'); } catch(e){ console.log('ro:', e.code, e.message); }
await db.exec('ROLLBACK');
try { await db.query('select * from nope'); } catch(e){ console.log(Object.keys(e), e.code, e.position); }
console.log((await db.query('select count(*) from shop.t')).rows);
// division
console.log((await db.query('select 7/2 a, 7/2.0 b, round(2.0/3,2) c', [], {rowMode:'array'})).rows);
const t0=Date.now(); const blob = await db.dumpDataDir('gzip'); console.log('dump', blob.size, Date.now()-t0);
const t1=Date.now(); const db2 = new PGlite({ loadDataDir: blob }); await db2.waitReady; console.log('load', Date.now()-t1, (await db2.query('select count(*) from shop.t')).rows);
