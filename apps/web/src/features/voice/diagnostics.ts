export type VoiceStageName='permission'|'capture'|'authorization'|'connection'|'publication'|'generation'|'cleanup'|'microphone';
export type VoiceCategory='started'|'ready'|'cancelled'|'denied'|'missing_device'|'device_busy'|'unavailable'|'expired'|'conflict'|'rate_limited'|'failed'|'retired'|'reconciled'|'unknown';
export class VoiceFailure extends Error {
  readonly stage:VoiceStageName;readonly category:VoiceCategory;
  constructor(stage:VoiceStageName,category:VoiceCategory,message:string){super(message);this.stage=stage;this.category=category;}
}
export function voiceDiagnostic(stage:VoiceStageName,category:VoiceCategory,detail:{permission?:'granted'|'denied'|'prompt'|'unknown';connectionState?:'connected'|'connecting'|'disconnected'|'reconnecting'|'signalReconnecting';errorName?:string;desired?:'off'|'muted'|'on';rawEnabled?:boolean;sdkMuted?:boolean;published?:boolean;generation?:number;revision?:number}={}) {
  if(process.env.NODE_ENV!=='development')return;
  const allowed=['NotAllowedError','PermissionDeniedError','NotFoundError','NotReadableError','OverconstrainedError','AbortError','ConnectionError'];
  console.info('Voice development.',{stage,category,permission:detail.permission,connectionState:detail.connectionState,desired:detail.desired,rawEnabled:detail.rawEnabled,sdkMuted:detail.sdkMuted,published:detail.published,generation:detail.generation,revision:detail.revision,errorName:detail.errorName?(allowed.includes(detail.errorName)?detail.errorName:'OtherError'):undefined});
}
export function captureFailure(error:unknown):VoiceFailure {
  if(error instanceof VoiceFailure)return error;
  const name=error&&typeof error==='object'&&'name'in error?String(error.name):'';
  const category=name==='NotAllowedError'||name==='PermissionDeniedError'?'denied':name==='NotFoundError'?'missing_device':name==='NotReadableError'?'device_busy':'failed';
  const message=category==='denied'?'Microphone permission denied. Allow access in your browser and retry.':category==='missing_device'?'No microphone found. Connect one and retry.':category==='device_busy'?'Microphone unavailable. Check the device and other apps.':'Microphone acquisition failed. Check your input device and retry.';
  voiceDiagnostic('capture',category,{errorName:name});return new VoiceFailure('capture',category,message);
}
export function authorizationFailure(status:number) {
  const category:VoiceCategory=status===401||status===403?'denied':status===409?'conflict':status===429?'rate_limited':'unavailable';
  voiceDiagnostic('authorization',category);
  return new VoiceFailure('authorization',category,status===401||status===403?'Voice authorization failed or expired. Retry audio in settings.':status===409?'Previous audio session is still closing. Wait a moment and retry.':status===429?'Voice requests are limited. Wait a moment and retry.':'Voice server unavailable. Check the local realtime service and retry audio.');
}
