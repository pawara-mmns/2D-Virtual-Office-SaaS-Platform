import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studioDraft, studioSignature, withAvatarOption, optionCrop } from './studio-model.ts';
import { defaultCustomization, encodeCustomization, parseCustomization, avatarCatalog } from '../../../../../packages/shared/src/avatar-customization.ts';
test('studio comparison ignores preview controls and detects/reverts real edits without rewriting legacy preferences', () => {
  const initial = studioDraft('plum', 'Taylor');
  const signature = studioSignature(initial);
  assert.equal(initial.custom, false);
  assert.equal(studioSignature({ ...initial, config: { ...initial.config, hair: 'bun' } }), signature, 'Legacy config stays dormant until customization is chosen');
  const modular = studioDraft('plum', 'Taylor', encodeCustomization(defaultCustomization));
  const changed = { ...modular, config: withAvatarOption(modular.config, 'hair', 'bob') };
  assert.notEqual(studioSignature(changed), studioSignature(modular));
  assert.equal(studioSignature({ ...changed, config: withAvatarOption(changed.config, 'hair', 'short') }), studioSignature(modular));
  assert.notEqual(studioSignature({ ...modular, name: 'New name' }), studioSignature(modular));
  assert.equal(studioSignature(studioDraft('plum', 'Taylor')), signature);
});
test('every thumbnail is a valid game appearance, including compatible dress transitions', () => {
  for (const [part, values] of Object.entries(avatarCatalog)) for (const value of values) {
    if (part === 'bottom' && value === 'none') continue;
    assert.doesNotThrow(() => parseCustomization(withAvatarOption(defaultCustomization, part as keyof typeof avatarCatalog, value)));
  }
  const dress = withAvatarOption(defaultCustomization, 'top', 'dress');
  assert.equal(dress.bottom, 'none');
  assert.equal(withAvatarOption(dress, 'top', 'jacket').bottom, 'pants');
  assert.equal(defaultCustomization.bottom, 'pants');
  for (const part of Object.keys(avatarCatalog) as (keyof typeof avatarCatalog)[]) {
    const { crop } = optionCrop(part);
    if (crop) assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 32 && crop.y + crop.height <= 32);
  }
});
