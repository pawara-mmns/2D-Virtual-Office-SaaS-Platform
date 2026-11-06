import assert from 'node:assert/strict';
import {test} from 'node:test';
import {attachMovementInput,runningIntent,movement} from './movement.ts';
function key(code:string,repeat=false){const e=new Event('keydown',{cancelable:true});Object.defineProperties(e,{code:{value:code},repeat:{value:repeat}});return e;}
test('Shift intent stays focus-scoped, E is edge-triggered, and blur/disposal clear run and movement',()=>{
  const target=new EventTarget(),global=new EventTarget();let focused=true,calls=0;
  const control=attachMovementInput(target,()=>focused,global,()=>calls++);
  target.dispatchEvent(key('KeyD'));target.dispatchEvent(key('ShiftLeft'));
  assert.equal(runningIntent(control.pressed),true);assert.equal(movement(control.pressed).x,1);
  target.dispatchEvent(key('KeyE'));assert.equal(calls,1);assert.equal(control.pressed.size,0);
  target.dispatchEvent(key('KeyE',true));assert.equal(calls,1);
  focused=false;target.dispatchEvent(key('KeyE'));target.dispatchEvent(key('ShiftRight'));assert.equal(calls,1);assert.equal(control.pressed.size,0);
  focused=true;target.dispatchEvent(key('ShiftRight'));global.dispatchEvent(new Event('blur'));assert.equal(runningIntent(control.pressed),false);
  control.destroy();target.dispatchEvent(key('KeyE'));assert.equal(calls,1);
});
