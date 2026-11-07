import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {matchMaker} from 'colyseus';
test('room admission and WebSocket transport share one Colyseus matchmaker instance',async()=>{
  const require=createRequire(import.meta.url),transport=createRequire(require.resolve('@colyseus/ws-transport'));
  const core=await import(pathToFileURL(transport.resolve('@colyseus/core')).href);
  assert.equal(core.matchMaker,matchMaker,'A split peer dependency graph makes valid seat reservations invisible to the transport.');
});
