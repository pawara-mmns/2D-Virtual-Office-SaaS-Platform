'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {editorAssets,editorAsset,assetRect,emptyDecoration,parseDecoration,resolvedObjects,upsertDecoration,removeDecoration,createDecorationHistory,validateDecoration,type DecorationDocument,type DecorationObject} from '../../../../../packages/shared/src/environment/decoration';
import type {DecorationWorkspace} from '../../../../../packages/shared/src/environment/decoration-database';
import type {EnvironmentConfig} from '../../../../../packages/shared/src/environment/catalog';
import type {EditorView,EditorEvent} from './overlay';
import {loadDecorationAction,saveDecorationAction} from './actions';

export function DecorationEditor({officeId,environment,ready,onView,onHandler,onEditing}:{officeId:string;environment:EnvironmentConfig;ready:boolean;onView(view:EditorView|null):void;onHandler(handler:((event:EditorEvent)=>void)|null):void;onEditing(value:boolean):void}){
  const [workspace,setWorkspace]=useState<DecorationWorkspace|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [document,setDocument]=useState<DecorationDocument>(emptyDecoration),[saved,setSaved]=useState(''),[selected,setSelected]=useState<string|null>(null),[asset,setAsset]=useState<string|null>(null);
  const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[message,setMessage]=useState(''),[preview,setPreview]=useState(false),[discard,setDiscard]=useState(false),[published,setPublished]=useState(false);
  const history=useRef<ReturnType<typeof createDecorationHistory>|null>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLElement>(null);
  const [historyState,setHistoryState]=useState({undo:false,redo:false});
  const syncHistory=useCallback(()=>setHistoryState({undo:history.current?.canUndo??false,redo:history.current?.canRedo??false}),[]);
  const dirty=JSON.stringify(document)!==saved,objects=useMemo(()=>resolvedObjects(environment,document),[environment,document]),object=objects.find(o=>o.id===selected),spec=object&&editorAsset(object.assetId);
  const commit=useCallback((next:DecorationDocument,id?:string)=>{
    try{const parsed=parseDecoration(next),valid=validateDecoration(environment,parsed);if(!valid.ok){setMessage(valid.message);return;}history.current?.apply(parsed);syncHistory();setDocument(parsed);if(id)setSelected(id);setMessage('Placement valid. Save draft before publishing.');setPublished(false);}catch(error){setMessage(error instanceof Error?error.message:'Invalid placement.');}
  },[environment,syncHistory]);
  const place=useCallback((o:DecorationObject)=>{try{commit(upsertDecoration(document,o),o.id);}catch(error){setMessage(error instanceof Error?error.message:'Invalid placement.');}},[document,commit]);
  useEffect(()=>{
    if(!open)return;
    const handler=(event:EditorEvent)=>{if(event.type==='select'){setSelected(event.id);setAsset(null);}else if(event.type==='place')place(event.object);else setMessage(event.message);};
    onHandler(handler);return()=>onHandler(null);
  },[open,onHandler,place]);
  useEffect(()=>{onView(open?{document,assetId:asset,selectedId:selected,preview}:null);},[open,document,asset,selected,preview,onView]);
  useEffect(()=>()=>{onView(null);onEditing(false);},[onView,onEditing]);
  useEffect(()=>{if(!open||!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[open,dirty]);
  const undo=useCallback(()=>{if(history.current){setDocument(history.current.undo());syncHistory();setSelected(null);setMessage('Undo applied.');}},[syncHistory]);
  const redo=useCallback(()=>{if(history.current){setDocument(history.current.redo());syncHistory();setSelected(null);setMessage('Redo applied.');}},[syncHistory]);
  useEffect(()=>{
    if(!open)return;const keys=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();if(e.shiftKey)redo();else undo();}else if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){e.preventDefault();redo();}else if(e.key==='Escape'){setAsset(null);setSelected(null);}};
    window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);
  },[open,undo,redo]);
  async function load(){
    setBusy(true);setMessage('Loading your office draft…');const result=await loadDecorationAction(officeId);setBusy(false);
    if(!result.ok){setMessage(result.message);return;}
    const row=result.workspace;
    // Stale drafts stay recoverable in the DB. Start from the current publication
    // after a base change and require an explicit save against its new revision.
    const initial=row.draftBaseRevision===row.baseRevision?row.draft:row.published;
    history.current=createDecorationHistory(initial);syncHistory();setDocument(initial);setSaved(JSON.stringify(initial));setWorkspace(row);setOpen(true);onEditing(true);setAsset(null);setSelected(null);setDiscard(false);setPreview(false);setPublished(false);
    setMessage(row.draftBaseRevision!==row.baseRevision?'Base environment changed. Review the current office and save a new draft.':'Select furniture, drag to move, or choose an asset and place it on the map. Drag empty space to pan.');
    requestAnimationFrame(()=>panel.current?.querySelector<HTMLInputElement>('input')?.focus());
  }
  function close(){setOpen(false);onEditing(false);setDiscard(false);trigger.current?.focus();}
  async function persist(operation:'draft'|'publish'|'rollback'){
    if(!workspace)return;const valid=validateDecoration(environment,operation==='rollback'?workspace.previous:document);if(!valid.ok){setMessage(valid.message);return;}
    setBusy(true);const result=await saveDecorationAction({officeId,revision:workspace.revision,baseRevision:workspace.baseRevision,operation,document});setBusy(false);
    if(!result.ok){setMessage(result.message);return;}
    const next=operation==='rollback'?workspace.previous!:document;
    setWorkspace({...workspace,revision:result.revision,publishedRevision:result.publishedRevision,draft:next,draftBaseRevision:workspace.baseRevision,...(operation!=='draft'?{previous:workspace.published,previousBaseRevision:workspace.baseRevision,published:next}:{})});
    setDocument(next);setSaved(JSON.stringify(next));setDiscard(false);
    if(operation==='draft')setMessage('Draft saved. Members still see the published office.');else{setPublished(true);setMessage('Published. Connected members will receive a reload notice within a few seconds. Reload to enter the new revision.');}
  }
  function duplicate(){if(!object||!spec)return;for(const [dx,dy]of [[spec.width+32,0],[-spec.width-32,0],[0,spec.height+32],[0,-spec.height-32],[32,0],[0,32]]){
    const copy={...object,id:'custom/'+crypto.randomUUID(),x:object.x+dx!,y:object.y+dy!};try{const next=upsertDecoration(document,copy);if(validateDecoration(environment,next).ok){commit(next,copy.id);return;}}catch{/* bounded candidate search */}
  }setMessage('No safe nearby space for a duplicate. Choose this asset in the library and place it in a clear area.');}
  const filtered=editorAssets.filter(a=>(category==='all'||a.category===category)&&a.label.toLowerCase().includes(query.toLowerCase()));
  return <>
    <button ref={trigger} className="office-control decoration-trigger" title="Edit office" aria-label="Edit office" aria-expanded={open} disabled={!ready||busy} onClick={()=>{if(open){if(dirty)setDiscard(true);else close();}else void load();}}>Edit<span className="sr-only"> office</span></button>
    {!open&&message&&<p className="decoration-load-message" role="status">{message}<button className="office-control" onClick={()=>setMessage('')}>Dismiss</button></p>}
    {open&&<section ref={panel} aria-label="Office decoration editor" className="decoration-panel" data-glass-surface="" data-glass-variant="elevated" data-preview={preview}>
      <header><div><strong>Make this office yours</strong><p>{dirty?'Unsaved changes':published?'Published': 'Draft saved'} · revision {workspace?.revision}</p></div><button className="office-control" aria-label="Close editor" onClick={()=>dirty?setDiscard(true):close()}>×</button></header>
      <div className="decoration-actions" role="toolbar" aria-label="Edit history and preview">
        <button className="office-control" disabled={!historyState.undo||busy} onClick={undo}>Undo</button><button className="office-control" disabled={!historyState.redo||busy} onClick={redo}>Redo</button>
        <button className="office-control" aria-pressed={preview} onClick={()=>{setPreview(!preview);setAsset(null);}}>Preview</button>
        <button className="office-control" onClick={()=>{setAsset(null);setSelected(null);}}>Select / pan</button>
      </div>
      <p role="status" aria-live="polite" className="decoration-feedback">{message}</p>
      {!preview&&<>
        <label className="decoration-search">Find furniture<input aria-label="Search office assets" placeholder="Try chair, plant, desk…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <label className="decoration-category">Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All assets ({editorAssets.length})</option>{[...new Set(editorAssets.map(a=>a.category))].map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        <div className="decoration-library" aria-label="Asset library">{filtered.map(a=>{
          const rect=assetRect(a.id,a.orientations[0]!),style:CSSProperties=rect?{width:a.width/2,height:a.height/2,backgroundImage:`url('/office/environments/${environment.theme}.png')`,backgroundSize:'256px 512px',backgroundPosition:`-${rect[0]/2}px -${rect[1]/2}px`}:{width:48,height:32,background:'#9ab6a5',border:'3px solid #527562'};
          return <button key={a.id} className="decoration-asset" data-asset={a.id} aria-pressed={asset===a.id} draggable onDragStart={e=>{e.dataTransfer.setData('application/x-office-asset',a.id);e.dataTransfer.effectAllowed='copy';}} onClick={()=>{setAsset(a.id);setSelected(null);setMessage(`Place ${a.label} on the map. Grid: 32 px. Escape cancels.`);}}><span className="decoration-thumbnail" aria-hidden="true"><span style={style}/></span><strong>{a.label}</strong><small>{a.width/32} × {a.height/32} tiles · {a.mode}</small></button>;
        })}{!filtered.length&&<p>No matching authored assets.</p>}</div>
        <details className="decoration-object-picker"><summary>Select an existing object ({objects.length})</summary><select aria-label="Select existing furniture" value={selected??''} onChange={e=>{setSelected(e.target.value||null);setAsset(null);}}><option value="">Choose furniture</option>{objects.map(o=><option key={o.id} value={o.id}>{editorAsset(o.assetId)?.label} · {o.x/32}, {o.y/32}</option>)}</select></details>
        {object&&spec&&<div className="decoration-properties" aria-label="Selected furniture controls"><strong>{spec.label}</strong><p>Grid {object.x/32}, {object.y/32} · {object.orientation} · {spec.mode}</p><div className="decoration-actions">
          <button className="office-control" disabled={spec.orientations.length<2} onClick={()=>place({...object,orientation:spec.orientations[(spec.orientations.indexOf(object.orientation)+1)%spec.orientations.length]!})}>Rotate</button>
          <button className="office-control" onClick={duplicate}>Duplicate</button><button className="office-control" onClick={()=>{commit(removeDecoration(document,object.id));setSelected(null);}}>Remove</button>
        </div><div className="decoration-actions" aria-label="Move selected furniture">{[['left',-32,0],['up',0,-32],['down',0,32],['right',32,0]].map(([name,dx,dy])=><button key={name} className="office-control" aria-label={`Move ${name}`} onClick={()=>place({...object,x:object.x+Number(dx),y:object.y+Number(dy)})}>{name}</button>)}</div></div>}
      </>}
      <footer><div className="decoration-actions"><button className="office-control" disabled={busy} onClick={()=>{const result=validateDecoration(environment,document);setMessage(result.ok?'All placements, exits, seat anchors and connected rooms are valid.':result.message);}}>Validate</button><button className="office-control" disabled={busy||published} onClick={()=>void persist('draft')}>Save draft</button><button className="office-control decoration-publish" disabled={busy||dirty||published||!workspace?.revision} onClick={()=>void persist('publish')}>Publish</button></div>
        <div className="decoration-actions"><button className="office-control" disabled={busy||!workspace?.previous||workspace.previousBaseRevision!==workspace.baseRevision} onClick={()=>void persist('rollback')}>Restore previous</button><button className="office-control" disabled={busy} onClick={()=>commit(emptyDecoration())}>Reset decorations</button><button className="office-control" disabled={busy} onClick={()=>dirty?setDiscard(true):void load()}>Reload editor</button></div>
        {workspace?.updatedAt&&<p>Last saved {new Date(workspace.updatedAt).toLocaleString()} by a workspace owner.</p>}
        {discard&&<div role="alert"><p>Discard unsaved local changes? Saved drafts remain available.</p><button className="office-control" onClick={close}>Discard unsaved changes</button><button className="office-control" onClick={()=>setDiscard(false)}>Keep editing</button></div>}
        {published&&<button className="office-control decoration-publish" onClick={()=>window.location.reload()}>Reload published office</button>}
      </footer>
    </section>}
  </>;
}
