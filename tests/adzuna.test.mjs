import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdzunaResult, adzunaSearchSchema } from '../src/lib/adzuna-contract.ts';
const job = { id:'123', title:'<b>Driver</b>', description:'<script>bad</script>Text', company:{display_name:'Example'}, location:{display_name:'Boise'}, redirect_url:'https://www.adzuna.com/details/123' };
test('normalizes actual provider fields, removes markup and deduplicates', () => {
 const r=normalizeAdzunaResult({count:2,results:[job,job]});
 assert.equal(r.jobs.length,1); assert.equal(r.jobs[0].title,'Driver'); assert.ok(!r.jobs[0].description.includes('<'));
});
test('rejects unsafe or non-Adzuna links', () => {
 for(const url of ['javascript:alert(1)','https://adzuna.com.evil.test/a','https://evil.test/','https://user:password@adzuna.com/a']) {
 assert.equal(normalizeAdzunaResult({results:[{...job,redirect_url:url}]}).jobs.length,0);
 }
});
test('validates search bounds before contacting provider', () => {
 assert.throws(()=>adzunaSearchSchema.parse({page:6}));
 assert.throws(()=>adzunaSearchSchema.parse({what:'x'.repeat(121)}));
 assert.throws(()=>adzunaSearchSchema.parse({where:''}));
 assert.deepEqual(adzunaSearchSchema.parse({}),{what:'',where:'Idaho',page:1});
});
test('malformed upstream data is not a successful empty search', () => {
 assert.throws(()=>normalizeAdzunaResult({error:'unauthorized'}));
 assert.equal(normalizeAdzunaResult({results:[]}).total,0);
});
