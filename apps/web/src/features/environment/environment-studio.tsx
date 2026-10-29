"use client";
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { accents, decorPacks, defaultEnvironment, environmentCombinations, furnitureSets, layouts, planters, rugs, themes, type EnvironmentConfig } from '../../../../../packages/shared/src/environment/catalog';
import { EnvironmentPreview } from './environment-preview';
import { saveEnvironmentAction, type EnvironmentSaveState } from './actions';
import type { EnvironmentRecord } from './service';
export function EnvironmentStudio({initial,officeId,organizationId}:{initial:EnvironmentRecord;officeId:string;organizationId:string}){
  const [draft,setDraft]=useState<EnvironmentConfig>(initial.config??defaultEnvironment),[revision,setRevision]=useState(initial.revision);
  const [state,action,pending]=useActionState(async(previous:EnvironmentSaveState,form:FormData)=>{const result=await saveEnvironmentAction(previous,form);if(result.status==='success'&&result.revision)setRevision(result.revision);return result;},{status:'idle'});
  const options=(label:string,key:'layout'|'theme'|'decor'|'furniture',values:readonly{id:string;name:string;description:string}[])=><label className="environment-field" htmlFor={'environment-'+key}><span>{label}</span><select id={'environment-'+key} className="auth-input" value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})}>{values.map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select><small>{values.find(v=>v.id===draft[key])?.description}</small></label>;
  return <div className="environment-studio">
    <div className="environment-studio-heading"><div><p className="text-xs font-semibold uppercase tracking-widest text-muted">Owner settings</p><h1 className="mt-2 text-3xl font-semibold">Shape your office</h1><p className="mt-3 text-sm leading-6 text-muted">Choose a floor plan and give it your team&apos;s character. Preview changes before applying them.</p></div><Link href={`/workspace/${organizationId}/office`} className="auth-text-link">Enter office</Link></div>
    {!initial.available&&<p role="alert" className="ui-notice ui-notice-warning">Preview is available. Saving needs the office environment database migration; ask your administrator to finish setup. The current office remains available.</p>}
    {/* Every field is controlled; retain the reviewed draft when React requests
        its native form reset after a successful or handled-error action. */}
    <div className="environment-studio-grid"><form action={action} onReset={event=>event.preventDefault()}>
      <input type="hidden" name="officeId" value={officeId}/><input type="hidden" name="organizationId" value={organizationId}/><input type="hidden" name="revision" value={revision}/><input type="hidden" name="config" value={JSON.stringify(draft)}/>
      <fieldset disabled={pending}><legend className="sr-only">Office configuration</legend><div className="environment-options">
        {options('Layout','layout',layouts)}{options('Visual theme','theme',themes)}{options('Decor pack','decor',decorPacks)}{options('Furniture set','furniture',furnitureSets)}
        <details className="environment-overrides"><summary>Personalize the details</summary><div className="environment-options">
          <label className="environment-field">Accent<select className="auth-input" aria-label="Office accent" value={draft.overrides.accent} onChange={e=>setDraft({...draft,overrides:{...draft.overrides,accent:e.target.value as EnvironmentConfig['overrides']['accent']}})}>{accents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="environment-field">Rug<select className="auth-input" aria-label="Office rug" value={draft.overrides.rug} onChange={e=>setDraft({...draft,overrides:{...draft.overrides,rug:e.target.value as EnvironmentConfig['overrides']['rug']}})}>{rugs.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className="environment-field">Planters<select className="auth-input" aria-label="Office planters" value={draft.overrides.planter} onChange={e=>setDraft({...draft,overrides:{...draft.overrides,planter:e.target.value as EnvironmentConfig['overrides']['planter']}})}>{planters.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="environment-field" htmlFor="environment-branding">Company wall sign<input id="environment-branding" className="auth-input" maxLength={64} value={draft.overrides.branding} onChange={e=>setDraft({...draft,overrides:{...draft.overrides,branding:Array.from(e.target.value.trimStart()).slice(0,32).join('')}})} onBlur={()=>setDraft({...draft,overrides:{...draft.overrides,branding:draft.overrides.branding.trim()}})} /><small>Up to 32 characters. Plain text; no uploaded assets.</small></label>
        </div></details>
      </div><button className="auth-button mt-6 w-full" disabled={!initial.available||pending}>{pending?'Applying setup...':'Save and apply office setup'}</button></fieldset>
      <p className="mt-3 text-xs leading-5 text-muted">Applying changes asks connected teammates to reload. Their avatars respawn safely in the new office; voice requires joining again.</p>
      {state.message&&<p role={state.status==='error'?'alert':'status'} className={'ui-notice mt-4 '+(state.status==='error'?'ui-notice-error':'ui-notice-success')}>{state.message}</p>}
    </form><div className="environment-preview-column"><EnvironmentPreview config={draft}/><p className="mt-3 text-xs leading-5 text-muted">225 base combinations. {environmentCombinations.toLocaleString('en-US')} configurations with accents, rugs and planters. One shared environment for everyone in this office.</p></div></div>
  </div>;
}
