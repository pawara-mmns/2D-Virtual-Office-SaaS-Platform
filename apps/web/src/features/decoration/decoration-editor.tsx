'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type ButtonHTMLAttributes,type CSSProperties,type ReactNode,type Ref} from 'react';
import {createPortal} from 'react-dom';
import {Plus,Undo2,Redo2,Save,LogOut,Ellipsis,Move,RotateCw,Copy,Trash2,X,Search,Layers,AlertCircle} from 'lucide-react';
import {documentKey,objectChanges,type LiveSnapshot,type LiveRequest} from '../../../../../packages/shared/src/environment/live-decoration';
import {editorAssets,editorAsset,assetRect,emptyDecoration,parseDecoration,resolvedObjects,moveDecoration,duplicateDecoration,deleteDecoration,createDecorationHistory,validateDecoration,type DecorationDocument,type DecorationObject} from '../../../../../packages/shared/src/environment/decoration';
import type {DecorationWorkspace} from '../../../../../packages/shared/src/environment/decoration-database';
import type {EnvironmentConfig} from '../../../../../packages/shared/src/environment/catalog';
import {environmentAtlas} from '../../../../../packages/shared/src/environment/assets';
import type {EditorView,EditorEvent} from './overlay';
import {contextPosition,editorShortcut,type EditorCommand,type ScreenBounds} from './manipulation';
import {loadDecorationAction,saveDecorationAction} from './actions';

function Tool({label,children,...props}:{label:string;children:ReactNode;ref?:Ref<HTMLButtonElement>}&ButtonHTMLAttributes<HTMLButtonElement>){return <button type="button" className="office-control editor-tool" aria-label={label} title={label} {...props}>{children}<span className="editor-tooltip" aria-hidden="true">{label}</span></button>;}
type DialogState={kind:'exit';intent:'exit'|'reload'}|{kind:'apply';operation:'apply'|'rollback'};
function EditorDialog({children,onCancel}:{children:ReactNode;onCancel():void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=ref.current;if(!node)return;const previous=document.activeElement as HTMLElement|null;node.showModal();return()=>{node.close();previous?.focus({preventScroll:true});};},[]);
  return <dialog ref={ref} aria-labelledby="editor-dialog-title" className="editor-dialog" onCancel={e=>{e.preventDefault();onCancel();}}>{children}</dialog>;
}
class EditorRequestError extends Error{}
export function DecorationEditor({officeId,environment,ready,container,onView,onHandler,onEditing,onCommand,onFocusOffice,live,editLive}:{officeId:string;environment:EnvironmentConfig;ready:boolean;container:HTMLElement|null;onView(view:EditorView|null):void;onHandler(handler:((event:EditorEvent)=>void)|null):void;onEditing(value:boolean):void;onCommand(command:EditorCommand):boolean;onFocusOffice():void;live:LiveSnapshot|null;editLive(request:LiveRequest):Promise<LiveSnapshot>}){
  const [workspace,setWorkspace]=useState<DecorationWorkspace|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[applied,setApplied]=useState(false);
  const [document,setDocument]=useState<DecorationDocument>(emptyDecoration),[saved,setSaved]=useState(''),[selected,setSelected]=useState<string|null>(null),[asset,setAsset]=useState<string|null>(null);
  const [library,setLibrary]=useState(false),[more,setMore]=useState(false),[query,setQuery]=useState(''),[category,setCategory]=useState('all'),[preview,setPreview]=useState(false),[covered,setCovered]=useState(false),[moving,setMoving]=useState(false);
  const [carry,setCarry]=useState<EditorView['carry']>(null),[dialog,setDialog]=useState<DialogState|null>(null),[notice,setNotice]=useState<{error:boolean;text:string}|null>(null);
  const [historyState,setHistoryState]=useState({undo:false,redo:false});
  const confirmed=useRef(live),saveRequest=useRef<LiveRequest|null>(null);
  const history=useRef<ReturnType<typeof createDecorationHistory>|null>(null),busyRef=useRef(false),trigger=useRef<HTMLButtonElement>(null),add=useRef<HTMLButtonElement>(null),moreButton=useRef<HTMLButtonElement>(null),libraryRef=useRef<HTMLElement>(null),context=useRef<HTMLDivElement>(null),contextSize=useRef({width:204,height:58}),anchor=useRef<{bounds:ScreenBounds;visible:boolean}|null>(null);
  const dirty=documentKey(document)!==saved,objects=useMemo(()=>resolvedObjects(environment,document),[environment,document]),object=objects.find(o=>o.id===selected),spec=object&&editorAsset(object.assetId);
  const syncHistory=useCallback(()=>setHistoryState({undo:history.current?.canUndo??false,redo:history.current?.canRedo??false}),[]);
  const positionContext=useCallback(()=>{const node=context.current,value=anchor.current;if(!node||!value)return;const p=contextPosition(value.bounds,{width:innerWidth,height:innerHeight},contextSize.current);node.style.transform=`translate3d(${p.x}px,${p.y}px,0)`;node.style.visibility=value.visible?'visible':'hidden';},[]);
  useEffect(()=>{const node=context.current;if(!node)return;const observer=new ResizeObserver(([entry])=>{const box=entry?.borderBoxSize?.[0];if(box)contextSize.current={width:box.inlineSize,height:box.blockSize};positionContext();});observer.observe(node);positionContext();return()=>observer.disconnect();},[open,selected,covered,preview,busy,applied,positionContext]);
  const cancel=useCallback(()=>{onCommand('cancel');setSelected(null);setCovered(false);setAsset(null);setCarry(null);setMoving(false);setLibrary(false);setMore(false);},[onCommand]);
  const commit=useCallback((next:DecorationDocument,id?:string,record=true)=>{
    if(busyRef.current)return false;
    try{const parsed=parseDecoration(next),valid=validateDecoration(environment,parsed);if(!valid.ok){setNotice({error:true,text:valid.message});return false;}const current=confirmed.current;if(!current)throw Error('Wait for the live layout to synchronize.');if(saveRequest.current)throw Error('Retry the unconfirmed Save before editing further.');const changes=objectChanges(environment,current.document,parsed);if(!changes.length)return true;
      if(record)history.current?.apply(parsed);syncHistory();setDocument(parsed);if(id)setSelected(id);setNotice(null);setApplied(false);setCovered(false);busyRef.current=true;setBusy(true);
      void editLive({officeId,epoch:current.epoch,revision:current.revision,kind:'edit',operationId:crypto.randomUUID(),changes}).then(snapshot=>{confirmed.current=snapshot;setDocument(snapshot.document);setSaved(documentKey(snapshot.published));}).catch(error=>{const snapshot=(error as {snapshot?:LiveSnapshot}).snapshot??confirmed.current;if(snapshot){confirmed.current=snapshot;setDocument(snapshot.document);history.current=createDecorationHistory(snapshot.document);syncHistory();}setNotice({error:true,text:error instanceof Error?error.message:'The live edit was rejected.'});}).finally(()=>{busyRef.current=false;setBusy(false);});return true;
    }catch(error){setNotice({error:true,text:error instanceof Error?error.message:'Choose a valid placement.'});return false;}
  },[environment,syncHistory,editLive,officeId]);
  const place=useCallback((o:DecorationObject)=>{
    try{const next=carry&&carry.object.id===o.id?duplicateDecoration(environment,document,carry.sourceId,o):moveDecoration(environment,document,o);if(commit(next,o.id)){setAsset(null);setCarry(null);setMoving(false);setLibrary(false);}}
    catch(error){setNotice({error:true,text:error instanceof Error?error.message:'Choose a valid placement.'});}
  },[document,environment,carry,commit]);
  useEffect(()=>{
    if(!open)return;const handler=(event:EditorEvent)=>{if(event.type==='anchor'){anchor.current=event;positionContext();}else if(event.type==='live'){if(busyRef.current)return;const snapshot=event.snapshot,old=confirmed.current;confirmed.current=snapshot;setSaved(documentKey(snapshot.published));if(old?.revision!==snapshot.revision||old?.epoch!==snapshot.epoch){setDocument(snapshot.document);history.current=createDecorationHistory(snapshot.document);syncHistory();setNotice({error:false,text:'Live layout updated by another owner.'});cancel();}}else if(event.type==='select'){setSelected(event.id);setCovered(event.covered??false);setAsset(null);setCarry(null);setMoving(false);setMore(false);}else if(event.type==='place')place(event.object);else setNotice({error:true,text:event.message});};
    onHandler(handler);return()=>onHandler(null);
  },[open,onHandler,place,positionContext,syncHistory,cancel]);
  useEffect(()=>{onView(open?{document,assetId:asset,selectedId:selected,preview:preview||busy||!!dialog||applied,carry,movingId:moving?selected:null}:null);},[open,document,asset,selected,preview,busy,dialog,applied,carry,moving,onView]);
  useEffect(()=>()=>{onView(null);onEditing(false);},[onView,onEditing]);
  useEffect(()=>{if(!open||!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[open,dirty]);
  const undo=useCallback(()=>{cancel();if(history.current)commit(history.current.undo(),undefined,false);},[cancel,commit]);
  const redo=useCallback(()=>{cancel();if(history.current)commit(history.current.redo(),undefined,false);},[cancel,commit]);
  const rotate=useCallback(()=>{if(onCommand('rotate'))return;if(!object||!spec)return;if(spec.orientations.length<2){setNotice({error:false,text:'This item keeps its drawn orientation.'});return;}place({...object,orientation:spec.orientations[(spec.orientations.indexOf(object.orientation)+1)%spec.orientations.length]!});},[object,spec,place,onCommand]);
  const duplicate=useCallback(()=>{if(!object)return;onCommand('cancel');setAsset(null);setMoving(false);setCarry({object:{...object,id:'custom/'+crypto.randomUUID()},sourceId:object.id});setSelected(null);onFocusOffice();},[object,onCommand,onFocusOffice]);
  const remove=useCallback(()=>{if(object&&commit(deleteDecoration(environment,document,object.id)))cancel();},[object,environment,document,commit,cancel]);
  useEffect(()=>{
    if(!open||dialog||applied)return;
    const keys=(e:KeyboardEvent)=>{if(e.defaultPrevented||e.repeat||busyRef.current)return;const typing=!!(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true],[role=textbox]'),command=editorShortcut(e,typing);if(!command)return;e.preventDefault();if(command==='undo')undo();else if(command==='redo')redo();else if(command==='rotate')rotate();else if(command==='duplicate')duplicate();else if(command==='delete')remove();else if(library){setLibrary(false);add.current?.focus();}else if(more){setMore(false);moreButton.current?.focus();}else cancel();};
    window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);
  },[open,dialog,applied,undo,redo,rotate,duplicate,remove,cancel,library,more]);
  async function load(){
    if(busyRef.current)return;busyRef.current=true;setBusy(true);
    try{const result=await loadDecorationAction(officeId);if(!result.ok)throw new EditorRequestError(result.message);const row=result.workspace,current=live;if(!current)throw new EditorRequestError('Live editing is unavailable. Restart the updated realtime server and retry.');const initial=current.document;
      confirmed.current=current;history.current=createDecorationHistory(initial);syncHistory();setDocument(initial);setSaved(documentKey(current.published));setWorkspace(row);setOpen(true);onEditing(true);cancel();setPreview(false);setApplied(false);setNotice(null);onFocusOffice();
    }catch(error){setNotice({error:true,text:error instanceof EditorRequestError?error.message:'The editor could not load. Try again.'});}finally{busyRef.current=false;setBusy(false);}
  }
  function close(){cancel();setOpen(false);onEditing(false);setDialog(null);setNotice(null);trigger.current?.focus();}
  async function discard(intent:'exit'|'reload'){
    if(busyRef.current)return;const snapshot=confirmed.current;if(!snapshot)return;
    busyRef.current=true;setBusy(true);setDialog(null);
    try{const changes=objectChanges(environment,snapshot.document,snapshot.published);if(changes.length){const next=await editLive({officeId,epoch:snapshot.epoch,revision:snapshot.revision,operationId:crypto.randomUUID(),kind:'edit',changes});confirmed.current=next;setDocument(next.document);}if(intent==='exit')close();}
    catch(error){setNotice({error:true,text:error instanceof Error?error.message:'Live changes could not be discarded safely.'});}
    finally{busyRef.current=false;setBusy(false);}
    if(intent==='reload')void load();
  }
  function exit(intent:'exit'|'reload'='exit'){setMore(false);if(dirty)setDialog({kind:'exit',intent});else if(intent==='reload')void load();else close();}
  function requestApply(operation:'apply'|'rollback'){
    const result=validateDecoration(environment,operation==='rollback'?workspace?.previous:document);setMore(false);
    if(!result.ok){setNotice({error:true,text:result.message});return;}setNotice(null);setDialog({kind:'apply',operation});
  }
  async function persist(operation:'draft'|'apply'|'rollback',after?:()=>void){
    if(!workspace||busyRef.current)return;
    const value=operation==='rollback'?workspace.previous:document,valid=validateDecoration(environment,value);if(!valid.ok){setNotice({error:true,text:valid.message});setDialog(null);return;}
    busyRef.current=true;setBusy(true);setDialog(null);setMore(false);onCommand('cancel');let current=workspace,succeeded=false;
    try{
      if(operation==='draft'){
        const result=await saveDecorationAction({officeId,revision:current.revision,baseRevision:current.baseRevision,operation:'draft',document});if(!result.ok)throw new EditorRequestError(result.message);current={...current,...result,draft:document,draftBaseRevision:current.baseRevision};setWorkspace(current);setNotice({error:false,text:'Recovery draft saved. Live changes remain unsaved.'});
      }else{
        let snapshot=confirmed.current;if(!snapshot)throw new EditorRequestError('Reconnect before saving.');
        if(operation==='rollback'){snapshot=await editLive({officeId,epoch:snapshot.epoch,revision:snapshot.revision,kind:'edit',operationId:crypto.randomUUID(),changes:objectChanges(environment,snapshot.document,value!)});confirmed.current=snapshot;setDocument(snapshot.document);history.current=createDecorationHistory(snapshot.document);syncHistory();setSelected(null);}
        const request=saveRequest.current??{officeId,epoch:snapshot.epoch,revision:snapshot.revision,kind:'save' as const,operationId:crypto.randomUUID(),savedRevision:current.revision};saveRequest.current=request;
        snapshot=await editLive(request);saveRequest.current=null;confirmed.current=snapshot;
        current={...current,revision:snapshot.savedRevision,publishedRevision:snapshot.publishedRevision,draft:snapshot.document,published:snapshot.document,previous:current.published,previousBaseRevision:current.baseRevision};setWorkspace(current);setDocument(snapshot.document);setSaved(documentKey(snapshot.published));setApplied(false);setNotice({error:false,text:'Saved. Everyone is up to date.'});
      }
      succeeded=true;
    }catch(error){if(error instanceof Error&&!/unconfirmed|confirmed|reconcile|timed out/i.test(error.message))saveRequest.current=null;setNotice({error:true,text:error instanceof Error?error.message:'The office could not be saved. Try again.'});}
    finally{busyRef.current=false;setBusy(false);}
    if(succeeded)after?.();
  }
  function chooseAsset(id:string){onCommand('cancel');setAsset(id);setSelected(null);setCarry(null);setMoving(false);setLibrary(false);setNotice(null);onFocusOffice();}
  const filtered=editorAssets.filter(a=>(category==='all'||a.category===category)&&a.label.toLowerCase().includes(query.toLowerCase()));
  const disabled=busy||applied;
  return <>
    <button ref={trigger} type="button" className="office-control decoration-trigger" title="Edit office" aria-label="Edit office" aria-expanded={open} disabled={!ready||busy} onClick={()=>open?exit():void load()}>Edit<span className="sr-only"> office</span></button>
    {container&&createPortal(<>
      {open&&<>
        <section className="editor-bar" aria-label="Office editing toolbar" data-glass-surface="" data-glass-variant="regular" aria-busy={busy}>
          <span className="editor-state"><i data-dirty={dirty}/>{preview?'Preview':dirty?'Live · unsaved':'Editing office'}</span>
          <div className="editor-bar-tools" role="toolbar" aria-label="Edit office">
            <Tool ref={add} label="Add furniture" aria-expanded={library} disabled={disabled} onClick={()=>{cancel();setLibrary(!library);requestAnimationFrame(()=>libraryRef.current?.querySelector<HTMLInputElement>('input')?.focus());}}><Plus/></Tool>
            <Tool label="Undo" disabled={disabled||!historyState.undo} onClick={undo}><Undo2/></Tool><Tool label="Redo" disabled={disabled||!historyState.redo} onClick={redo}><Redo2/></Tool>
            <button className="office-control editor-apply" disabled={busy||!ready||!!asset||!!carry||moving} onClick={()=>void persist('apply')}><Save/><span>{busy?'Updating…':'Save'}</span></button>
            <Tool ref={moreButton} label="More editor actions" aria-expanded={more} disabled={disabled} onClick={()=>{setMore(!more);setLibrary(false);}}><Ellipsis/></Tool>
            <Tool label="Exit editing" disabled={busy} onClick={()=>exit()}><LogOut/></Tool>
          </div>
        </section>
        {more&&<div className="editor-more" role="group" aria-label="More editor actions" data-glass-surface="" data-glass-variant="elevated">
          <button onClick={()=>void persist('draft')}>Save draft</button><button disabled={!workspace?.previous||workspace.previousBaseRevision!==workspace.baseRevision} onClick={()=>requestApply('rollback')}>Restore previous</button>
          <button onClick={()=>{setPreview(!preview);cancel();}}>{preview?'Resume editing':'Preview layout'}</button><button onClick={()=>{const result=validateDecoration(environment,document);setNotice({error:!result.ok,text:result.ok?'Layout is ready to apply.':result.message});setMore(false);}}>Check layout</button>
          <button onClick={()=>{commit(emptyDecoration());cancel();}}>Reset decorations</button><button onClick={()=>void load()}>Reload draft</button><button onClick={()=>{commit(workspace!.draft);cancel();}}>Recover saved draft</button>
        </div>}
        {library&&<section ref={libraryRef} className="editor-library" aria-label="Furniture library" data-glass-surface="" data-glass-variant="elevated">
          <header><strong>Add to your office</strong><Tool label="Close furniture library" onClick={()=>{setLibrary(false);add.current?.focus();}}><X/></Tool></header>
          <label className="editor-search"><Search aria-hidden="true"/><input aria-label="Search office assets" placeholder="Find furniture…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <label className="sr-only" htmlFor="editor-category">Furniture category</label><select id="editor-category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All furniture</option>{[...new Set(editorAssets.map(a=>a.category))].map(c=><option key={c} value={c}>{c}</option>)}</select>
          <div className="editor-assets">{filtered.map(a=>{const rect=assetRect(a.id,a.orientations[0]!),scale=Math.min(1,64/a.width,48/a.height),style:CSSProperties=rect?{width:a.width*scale,height:a.height*scale,backgroundImage:`url('/office/environments/${environment.theme}.png')`,backgroundSize:`${environmentAtlas.width*scale}px ${environmentAtlas.height*scale}px`,backgroundPosition:`-${rect[0]*scale}px -${rect[1]*scale}px`}:{width:48,height:32,background:'#9ab6a5',border:'3px solid #527562'};
            return <button key={a.id} className="editor-asset" data-asset={a.id} draggable onDragStart={e=>{e.dataTransfer.setData('application/x-office-asset',a.id);e.dataTransfer.effectAllowed='copy';}} onClick={()=>chooseAsset(a.id)}><span className="editor-thumbnail" aria-hidden="true"><span style={style}/></span><strong>{a.label}</strong><small>{a.width/32} × {a.height/32}</small></button>;
          })}{!filtered.length&&<p>No matching furniture.</p>}</div>
        </section>}
        {object&&spec&&!preview&&!disabled&&<div ref={context} className="editor-context" role="toolbar" aria-label={`${spec.label} controls`} data-glass-surface="" data-glass-variant="regular" style={{visibility:'hidden'}}>
          <span className="editor-selection-name">{spec.label}</span>
          <Tool label="Move selected object" aria-pressed={moving} onClick={()=>{setMoving(!moving);setAsset(null);onFocusOffice();}}><Move/></Tool>
          <Tool label={spec.orientations.length>1?'Rotate selected object (R)':'This item has one orientation'} disabled={spec.orientations.length<2} onClick={rotate}><RotateCw/></Tool>
          <Tool label="Duplicate selected object (Ctrl+D)" onClick={duplicate}><Copy/></Tool><Tool label="Delete selected object (Delete)" onClick={remove}><Trash2/></Tool>
          {covered&&<Tool label="Select object underneath (Alt+click)" onClick={()=>onCommand('cycle')}><Layers/></Tool>}
        </div>}
        {(asset||carry||moving)&&<div className="editor-placement" role="status">{carry?'Place a copy':moving?'Choose a new position':editorAsset(asset??'')?.label}<Tool label="Cancel placement" onClick={cancel}><X/></Tool></div>}
      </>}
      {notice&&<div className="editor-notice" role={notice.error?'alert':'status'} data-error={notice.error} data-glass-surface="" data-glass-variant="elevated">{notice.error&&<AlertCircle aria-hidden="true"/>}<span>{notice.text}</span><Tool label="Dismiss editor message" onClick={()=>setNotice(null)}><X/></Tool></div>}
      {dialog&&<EditorDialog onCancel={()=>setDialog(null)}>
        <h2 id="editor-dialog-title">{dialog.kind==='exit'?'Keep your changes?':dialog.operation==='rollback'?'Restore the previous layout?':'Apply this layout?'}</h2>
        {dialog.kind==='exit'?<><p>Live changes are visible to teammates. Save to keep them after the office closes, or keep a recovery draft.</p><div className="editor-dialog-actions"><button className="office-control editor-apply" onClick={()=>void persist('draft',()=>dialog.intent==='reload'?void load():close())}>Save draft</button><button className="office-control" onClick={()=>void discard(dialog.intent)}>Discard changes</button><button className="office-control" autoFocus onClick={()=>setDialog(null)}>Continue editing</button></div></>:<><p>The previous layout will be checked against connected people and occupied seats before restoring.</p><div className="editor-dialog-actions"><button className="office-control editor-apply" onClick={()=>void persist(dialog.operation)}>Restore and save</button><button className="office-control" autoFocus onClick={()=>setDialog(null)}>Cancel</button></div></>}
      </EditorDialog>}
    </>,container)}
  </>;
}
