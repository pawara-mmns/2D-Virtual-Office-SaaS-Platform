'use client';
import { useEffect, useState, type PointerEvent } from 'react';
import type { PrimaryInteraction } from '../../../../../../packages/shared/src/interactions.ts';
import {HudIcon} from '@/components/hud-icon';
type Props={primary:PrimaryInteraction|null;online:boolean;interact():void;move(code:string,active:boolean):void};
export function InteractionControls({primary,online,interact,move}:Props) {
  const [run,setRun]=useState(false);
  useEffect(()=>{
    const clear=()=>{setRun(false);for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','TouchRun'])move(key,false);};
    window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);
    return()=>{for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','TouchRun'])move(key,false);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);};
  },[move]);
  useEffect(()=>{if(!online)for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','TouchRun'])move(key,false);},[online,move]);
  const hold=(event:PointerEvent<HTMLButtonElement>,code:string)=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);move('TouchRun',run);move(code,true);};
  if(!online)return null;
  return <div className="office-interactions" aria-label="Office interaction controls">
    {online&&primary&&<button className="office-control office-interaction-prompt" data-action={primary.action} disabled={primary.available===false} aria-label={primary.available===false?'Seat occupied':primary.action==='SIT'?'Sit':'Stand'} onClick={()=>{setRun(false);interact();}} aria-keyshortcuts={primary.available===false?undefined:'E'}><HudIcon name={primary.available===false?'lock':primary.action==='SIT'?'seat':'stand'}/><span>{primary.label}</span>{primary.available!==false&&<kbd aria-hidden="true">E</kbd>}</button>}
    <div className="office-touch-controls" role="group" aria-label="Touch movement" hidden={!online}>
      <div className="office-touch-pad">{[['ArrowUp','Move up','↑'],['ArrowLeft','Move left','←'],['ArrowDown','Move down','↓'],['ArrowRight','Move right','→']].map(([code,label,arrow])=><button key={code} className="office-control" data-direction={code} aria-label={label} onPointerDown={e=>hold(e,code!)} onPointerUp={()=>move(code!,false)} onPointerCancel={()=>move(code!,false)} onLostPointerCapture={()=>move(code!,false)} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();move('TouchRun',run);move(code!,true);}}} onKeyUp={()=>move(code!,false)} onBlur={()=>move(code!,false)}>{arrow}</button>)}</div>
      <button className="office-control office-run-control" aria-label="Toggle running" aria-pressed={run} onClick={()=>{move('TouchRun',!run);setRun(!run);}}>Run <span aria-hidden>{run?'●':'○'}</span></button>
    </div>
  </div>;
}
