import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avatarCatalog, avatarColorKeys, defaultCustomization, parseCustomization, encodeCustomization, decodeCustomization, legacyCustomization, randomCustomization } from '../../../../../packages/shared/src/avatar-customization.ts';
import { artColors, avatarAtlasEntries, drawAvatarLayer, appearanceLayers } from '../../../../../packages/shared/src/avatar-art.ts';
import { loadAvatarProfile, saveAvatarPreference } from './service.ts';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/supabase/database.types.ts';
const id = '00000000-0000-4000-8000-000000000001';
const verified = { id, email: 'fixture@avatar.invalid', email_confirmed_at: '2026-01-01', is_anonymous: false };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const client = (fetcher: typeof fetch) => createClient<Database>('https://avatar.example.invalid', 'fixture', { global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false } });

test('v1 catalog rejects unknown IDs, extra/missing keys, colors, incompatible dresses and future versions', () => {
  assert.deepEqual(decodeCustomization(encodeCustomization(defaultCustomization)), defaultCustomization);
  for (const [key] of Object.entries(avatarCatalog)) assert.throws(() => parseCustomization({ ...defaultCustomization, [key]: '../bad' }));
  for (const key of avatarColorKeys) for (const value of [null, '#fff', 'red', '#GG0000', 'url(x)', 123]) assert.throws(() => parseCustomization({ ...defaultCustomization, [key]: value }));
  for (const value of [null, [], 'x', {}, { ...defaultCustomization, version: 2 }, { ...defaultCustomization, url: 'x' }, { ...defaultCustomization, hair: undefined }, { ...defaultCustomization, top: 'dress' }, { ...defaultCustomization, bottom: 'none' }]) assert.equal(decodeCustomization(value), undefined);
  assert.equal(parseCustomization({ ...defaultCustomization, hairColor: '#ABCDEF' }).hairColor, '#abcdef');
  for (let i = 0; i < 1000; i++) assert.doesNotThrow(() => parseCustomization(randomCustomization()));
});
test('every layer option has bounded integer artwork for every body, direction, step and cardinal seat', () => {
  assert.equal(avatarAtlasEntries.length, 144);
  for (const { body, layer, option } of avatarAtlasEntries) for (let frame = 0; frame < 24; frame++) {
    const rects = drawAvatarLayer(body, layer, option, frame);
    for (const [x, y, width, height, color] of rects) {
      assert.ok([x, y, width, height].every(Number.isInteger));
      assert.ok(x >= 0 && y >= 0 && x + width <= 32 && y + height <= 32, `${body}/${layer}/${option}/${frame} clips`);
      assert.match(color, /^[0-9a-f]{6}$/);
      assert.ok((Object.values(artColors) as string[]).includes(color), 'every pixel uses an explicit mask or intentional fixed detail');
    }
    if (!['none', 'bald'].includes(option) && ['body', 'top', 'bottom', 'shoes', 'hair'].includes(layer)) assert.ok(rects.length > 0);
  }
  assert.notDeepEqual(drawAvatarLayer('classic', 'top', 'shirt', 0), drawAvatarLayer('classic', 'top', 'shirt', 1), 'Clothes follow animated shoulders and arms');
  for (const layer of ['body', 'bottom', 'shoes'] as const) assert.equal(new Set([12, 15, 18, 21].map(frame => JSON.stringify(drawAvatarLayer('classic', layer, layer === 'body' ? 'classic' : layer === 'bottom' ? 'pants' : 'casual', frame)))).size, 4);
  const front = appearanceLayers(defaultCustomization, 0), rear = appearanceLayers(defaultCustomization, 3);
  assert.ok(front.indexOf('hairBack') < front.indexOf('body'));
  assert.ok(rear.indexOf('hairBack') > rear.indexOf('top'));
  assert.ok(front.indexOf('hat') > front.indexOf('hair'));
});
test('legacy mapping is deterministic, never mutates saved defaults, and invalid wire data safely falls back', () => {
  assert.notDeepEqual(legacyCustomization('fern'), legacyCustomization('plum'));
  assert.deepEqual(legacyCustomization('unknown'), legacyCustomization('fern'));
  const mapped = legacyCustomization('fern'); mapped.top = 'hoodie'; assert.equal(defaultCustomization.top, 'shirt');
  assert.equal(decodeCustomization('x'.repeat(100000)), undefined);
});
test('customized save/reload uses verified identity, stores JSON metadata, confirms writes, and can restore legacy', async context => {
  let profile: { avatar_key: string; display_name: string; avatar_appearance: unknown } = { avatar_key: 'plum', display_name: 'Taylor', avatar_appearance: null };
  const db = client(async (url, options) => {
    assert.equal(new URL(String(url)).searchParams.get('id'), `eq.${id}`);
    if (options?.method === 'PATCH') { profile = { ...profile, ...JSON.parse(String(options.body)) }; return json([profile]); }
    return json(profile);
  });
  context.mock.method(db.auth, 'getUser', async () => ({ data: { user: verified }, error: null }));
  await saveAvatarPreference(db, 'plum', 'Taylor', defaultCustomization);
  assert.equal((await loadAvatarProfile(db, id)).appearance, encodeCustomization(defaultCustomization));
  await saveAvatarPreference(db, 'plum', 'New name');
  assert.deepEqual(profile.avatar_appearance, defaultCustomization, 'Unrelated legacy saves preserve customization');
  await saveAvatarPreference(db, 'harbor', 'Taylor', null);
  assert.equal((await loadAvatarProfile(db, id)).appearance, undefined);
});
test('invalid metadata never writes; missing migrations retain legacy reads and never report custom save success', async context => {
  let calls = 0;
  const db = client(async (_url, options) => {
    calls++;
    return options?.method === 'PATCH' || calls === 1 ? json({ code: '42703' }, 400) : json({ avatar_key: 'slate', display_name: 'Taylor' });
  });
  await assert.rejects(() => saveAvatarPreference(db, 'fern', 'Taylor', { ...defaultCustomization, version: 2 }));
  assert.equal(calls, 0);
  assert.deepEqual(await loadAvatarProfile(db, id), { avatarKey: 'slate', displayName: 'Taylor' });
  context.mock.method(db.auth, 'getUser', async () => ({ data: { user: verified }, error: null }));
  await assert.rejects(() => saveAvatarPreference(db, 'fern', 'Taylor', defaultCustomization), /migration/);
});
