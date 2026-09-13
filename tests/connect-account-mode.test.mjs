import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveModeVerifiedAccount } from '../src/lib/connect-account-mode.server.ts';

for (const live of [true, false]) {
  test(`account without livemode uses scoped balance (${live ? 'live' : 'test'})`, async () => {
    const calls = [];
    const result = await retrieveModeVerifiedAccount('acct_verified', async (path, init) => {
      calls.push([path, init]);
      return path.startsWith('/v1/accounts/')
        ? { id: 'acct_verified', details_submitted: true, payouts_enabled: true }
        : { livemode: live };
    });
    assert.equal(result.livemode, live);
    assert.equal(result.payouts_enabled, true);
    assert.deepEqual(calls[1], ['/v1/balance', { headers: { 'Stripe-Account': 'acct_verified' } }]);
  });
}
test('unavailable mode is an error, not a stale-account reset result', async () => {
  await assert.rejects(retrieveModeVerifiedAccount('acct_verified', async () => ({})), /could not be verified/);
  await assert.rejects(retrieveModeVerifiedAccount('acct_verified', async () => { throw Error('Network failure'); }), /Network failure/);
});
