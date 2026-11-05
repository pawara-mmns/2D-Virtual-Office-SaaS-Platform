'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { defaultEnvironment, layouts, themes, decorPacks, furnitureSets } from '../../../../../packages/shared/src/environment/catalog';

type Data = Record<string, unknown>;
const value = (v: unknown) => v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const date = (v: unknown) => v ? new Date(String(v)).toLocaleString() : '—';
export async function adminRequest(path: string, body?: Data) {
  try {
  let csrf: string | undefined;
  if (body) { const response = await fetch('/api/superadmin/auth/csrf', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); csrf = data.csrf; }
  const response = await fetch(`/api/superadmin/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json', 'X-Admin-Csrf': csrf! } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The request could not be completed.'); return data;
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Administration could not be reached. Check your connection and try again.');
    throw error;
  }
}
type Field = { name: string; label: string; type?: 'password' | 'email' | 'number' | 'checkbox' | 'json' | 'hidden'; value?: unknown; options?: string[]; help?: string; optional?: boolean };
function ActionForm({ path, fields, label, onSuccess, children }: { path: string; fields: Field[]; label: string; onSuccess?: () => void; children?: ReactNode }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage('');
    try {
      const body: Data = {};
      for (const field of fields) { const v = form.get(field.name); body[field.name] = field.type === 'checkbox' ? v === 'on' : field.type === 'number' ? Number(v) : field.type === 'json' ? JSON.parse(String(v)) : v; }
      const result = await adminRequest(path, body); setFailed(false); setMessage('Changes saved.');
      if (result.next) window.location.assign(result.next); else onSuccess?.();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'The request failed.'); }
    finally { setBusy(false); }
  }
  return <form className="pa-form" onSubmit={submit}>
    {children}
    {fields.map(field => field.type === 'hidden' ? <input key={field.name} type="hidden" name={field.name} value={String(field.value ?? '')} /> :
      <label className={field.type === 'checkbox' ? 'pa-check' : ''} key={field.name}>
        <span>{field.label}</span>
        {field.options ? <select name={field.name} defaultValue={String(field.value ?? field.options[0])}>{field.options.map(option => <option key={option}>{option}</option>)}</select> :
          field.type === 'json' ? <textarea name={field.name} rows={8} required defaultValue={JSON.stringify(field.value, null, 2)} /> :
            field.type === 'checkbox' ? <input type="checkbox" name={field.name} defaultChecked={field.value === true} /> :
              <input type={field.type ?? 'text'} name={field.name} required={!field.optional} defaultValue={field.type === 'password' ? undefined : String(field.value ?? '')}
                autoCapitalize="none" spellCheck={false} inputMode={field.name === 'code' ? 'numeric' : undefined} pattern={field.name === 'code' ? '[0-9]{6}' : undefined}
                autoComplete={field.type === 'password' ? field.name === 'newPassword' ? 'new-password' : 'current-password' : field.name === 'username' ? 'username' : field.name === 'code' ? 'one-time-code' : 'off'}
                maxLength={field.name.toLowerCase().includes('password') ? 128 : 254} />}
        {field.help && <small>{field.help}</small>}
      </label>)}
    {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'pa-error' : 'pa-success'}>{message}</p>}
    <button className="pa-button" disabled={busy}>{busy ? 'Working…' : label}</button>
  </form>;
}
const hidden = (name: string, v: unknown): Field => ({ name, label: name, type: 'hidden', value: v });
const confirmation = (expected: unknown): Field => ({ name: 'confirmation', label: `Type “${value(expected)}” to confirm`, help: 'A recent password and MFA verification is required.' });

export function AdminShell({ username, pending, active, children }: { username: string; pending: boolean; active: string; children: ReactNode }) {
  const nav = [['', 'Overview', '◫'], ['organizations', 'Organizations', '▦'], ['users', 'People', '◉'], ['offices', 'Offices', '▤'], ['system', 'Platform settings', '⚙'], ['audit-logs', 'Audit trail', '≡'], ['security', 'Security', '◇']];
  return <div className="pa-app"><aside className="pa-sidebar">
    <Link className="pa-brand" href="/superadmin"><span className="pa-mark">vo</span><span>Virtual Office<small>PLATFORM CONSOLE</small></span></Link>
    <span className="pa-nav-label">WORKSPACE ADMINISTRATION</span>
    <nav aria-label="Platform administration">{nav.filter(([path]) => !pending || path === 'security').map(([path, label, icon]) =>
      <Link aria-current={active === path ? 'page' : undefined} key={path} href={`/superadmin${path ? '/' + path : ''}`}><span aria-hidden>{icon}</span>{label}</Link>)}</nav>
    <div className="pa-sidebar-foot"><span className="pa-avatar">{username.slice(0, 2).toUpperCase()}</span><div><strong>{username}</strong><small>{pending ? 'MFA verification pending' : 'Platform administrator'}</small></div></div>
    <ActionForm path="auth/logout" fields={[]} label="Sign out" />
  </aside><div className="pa-main"><header className="pa-topbar"><span>Platform <span className="pa-slash">/</span> {nav.find(([p]) => p === active)?.[1] ?? 'Overview'}</span>
    {!pending && <form action="/superadmin/users"><label><span className="sr-only">Global user search</span><input name="q" placeholder="Search people by email or user ID…" /></label></form>}
    <span className="pa-badge">{pending ? 'Verification required' : 'Privileged access'}</span></header>
    <main className="pa-content">{children}</main><footer className="pa-footer">Virtual Office · Platform administration <span>Every change is audited</span></footer>
  </div></div>;
}
export function AdminLogin({ configured }: { configured: boolean }) {
  return <main className="pa-login"><div className="pa-login-story"><Link href="/" className="pa-brand"><span className="pa-mark">vo</span>Virtual Office</Link>
    <div><p className="pa-eyebrow">PLATFORM OPERATIONS</p><h1>A clear view.<br />A secure workspace.</h1><p>The control room for your virtual office platform.</p><div className="pa-login-art" aria-hidden><i /><i /><i /><i /><i /></div></div>
    <small>Built around people. Protected by design.</small></div><div className="pa-login-form"><div><span className="pa-badge">RESTRICTED ACCESS</span><h2>Administrator sign in</h2><p>Use your platform credentials. Authenticator verification follows sign in.</p>
    {!configured && <p className="pa-notice">Administration needs local setup. Follow docs/platform-admin.md to configure the private database and bootstrap the first administrator.</p>}
    <ActionForm path="auth/login" fields={[{ name: 'username', label: 'Username' }, { name: 'password', label: 'Password', type: 'password' }]} label="Continue securely" />
    <p className="pa-caption">Platform accounts are separate from workspace accounts. There is no public administrator registration.</p><Link href="/login">Back to workspace sign in ↗</Link>
  </div></div></main>;
}
export function AdminSecurity() {
  const [data, setData] = useState<Data | null>(null), [enrollment, setEnrollment] = useState<Data | null>(null), [error, setError] = useState('');
  const load = useCallback(() => { adminRequest('security').then(setData).catch(e => setError(e.message)); }, []);
  useEffect(load, [load]);
  async function enroll() { try { setEnrollment(await adminRequest('auth/enroll-start', {})); } catch (e) { setError((e as Error).message); } }
  return <><Heading eyebrow="ACCOUNT PROTECTION" title="Security" description="Verify access, manage your credentials, and end active sessions." />
    {error && <p className="pa-error" role="alert">{error}</p>}{!data ? <p role="status">Loading account security…</p> : <div className="pa-grid-2">
      <section className="pa-panel"><h2>{data.mfa ? 'Reauthenticate' : data.enrolled ? 'Verify your authenticator' : 'Set up your authenticator'}</h2>
        <p>{data.mfa ? 'Password and a fresh code authorize changes for five minutes.' : 'A verified authenticator code is required before you can access platform data.'}</p>
        {!data.enrolled && !enrollment && <button className="pa-button" onClick={enroll}>Start MFA enrollment</button>}
        {enrollment && <div className="pa-notice"><p>Add a time-based account to your authenticator using this setup key. Keep it private.</p><code className="pa-secret">{value(enrollment.secret)}</code><p><a href={String(enrollment.uri)}>Open in an authenticator app ↗</a></p></div>}
        {(data.enrolled || enrollment) && <ActionForm path={data.mfa ? 'auth/reauth' : 'auth/mfa'} fields={[
          ...(data.mfa ? [{ name: 'password', label: 'Current password', type: 'password' as const }] : []),
          { name: 'code', label: 'Six-digit authenticator code', help: 'Use a new code; previously accepted codes cannot be reused.' },
        ]} label={data.mfa ? 'Verify again' : 'Verify and enter console'} />}
      </section>
      {data.mfa === true && <section className="pa-panel"><h2>Change password</h2><p>Use a unique password of 15–128 characters. Changing it ends every administrator session.</p>
        <ActionForm path="auth/password" fields={[{ name: 'currentPassword', label: 'Current password', type: 'password' }, { name: 'newPassword', label: 'New password', type: 'password' }]} label="Change password and sign out" /></section>}
      <section className="pa-panel"><h2>Active sessions</h2><p>Sessions expire after eight hours, or thirty minutes of inactivity. Pending verification expires in ten minutes.</p>
        <div className="pa-timeline">{(data.sessions as Data[]).map((session, i) => <div key={i}><strong>{session.current ? 'This device' : 'Other device'}</strong><small>Last active {date(session.last_seen_at)} · Expires {date(session.expires_at)}</small></div>)}</div>
        <ActionForm path="auth/logout-all" fields={[]} label="Sign out of all devices" /></section>
    </div>}</>;
}
function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="pa-heading"><p className="pa-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>;
}
function Status({ children }: { children: unknown }) { const s = value(children); return <span className={`pa-status ${['ACTIVE', 'success', 'true', 'ready'].includes(s) ? 'pa-status-good' : ['SUSPENDED', 'failed', 'denied', 'false', 'not_ready'].includes(s) ? 'pa-status-warn' : ''}`}>{s === 'true' ? 'Available' : s === 'false' ? 'Paused' : s}</span>; }
const titles: Record<string, [string, string]> = {
  organizations: ['Organizations', 'Manage workspaces, ownership, and organization access.'], users: ['People', 'A platform-wide directory of registered workspace accounts.'],
  offices: ['Virtual offices', 'Inspect availability and manage versioned environments.'], system: ['Platform settings', 'Versioned controls for onboarding, availability, and platform limits.'],
  'audit-logs': ['Audit trail', 'A durable record of administrative changes and access decisions.'],
};
export function AdminConsole({ module }: { module: string }) {
  const params = useSearchParams(), router = useRouter();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [selected, setSelected] = useState<Data | null>(null), [detailError, setDetailError] = useState(''), [creating, setCreating] = useState(false);
  const query = params.toString();
  const load = useCallback(() => { setData(null); setError(''); adminRequest(module === '' ? 'dashboard' : `${module}?${query}`).then(setData).catch(e => setError(e.message)); }, [module, query]);
  useEffect(() => { let cancelled = false;
    adminRequest(module === '' ? 'dashboard' : `${module}?${query}`).then(result => { if (!cancelled) { setData(result); setError(''); } }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [module, query]);
  async function detail(row: Data) { setDetailError(''); try { setSelected(await adminRequest(`${module}/${row.id}?page=${params.get('detailPage') || 1}`)); requestAnimationFrame(() => document.getElementById('pa-record-detail')?.focus()); } catch (e) { setDetailError((e as Error).message); requestAnimationFrame(() => document.getElementById('pa-detail-error')?.focus()); } }
  function refresh() { setSelected(null); setCreating(false); load(); }
  const changePage = (page: number) => { const next = new URLSearchParams(query); next.set('page', String(page)); router.push(`?${next}`); };
  if (!module) return <><Heading eyebrow="PLATFORM OVERVIEW" title="A place for every team." description="Workspace health, platform activity, and the controls that keep everything running." />
    {error ? <ErrorState error={error} retry={load} /> : !data ? <p role="status">Loading platform overview…</p> : <>
      <DataSourceNotice source={data.dataSource as Data | undefined} />
      <div className="pa-section-label">DATABASE TOTALS <span>Current records · refreshed on request</span></div>
      <div className="pa-metrics">{Object.entries(data.counts as Data).map(([key, count]) => <section className="pa-metric" key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{value(count)}</strong><small>Database count</small></section>)}</div>
      {(data.dataSource as Data | undefined)?.registeredUsersDefinition && <p className="pa-caption">{value((data.dataSource as Data).registeredUsersDefinition)}{data.diagnostics ? ` Application profiles: ${value((data.diagnostics as Data).profiles)}.` : ''}</p>}
      <div className="pa-section-label">LIVE OPERATIONS <span>Single realtime authority · no voice content</span></div>
      <div className="pa-metrics pa-live">{[['connectedUsers', 'Connected people'], ['realtimeRooms', 'Active rooms'], ['voiceSessions', 'Observed voice sessions']].map(([key, label]) => <section className="pa-metric" key={key}><span>{label}</span><strong>{(data.operations as Data)[key!] === null ? 'Unavailable' : value((data.operations as Data)[key!])}</strong><small>{(data.operations as Data).available ? `Observed ${date((data.operations as Data).observedAt)}` : value((data.operations as Data).message ?? 'Operational telemetry is not connected')}</small></section>)}</div>
      <div className="pa-grid-2"><section className="pa-panel"><div className="pa-panel-title"><h2>Recent administration</h2><Link href="/superadmin/audit-logs">View audit trail ↗</Link></div><Timeline rows={data.recent as Data[]} /></section>
        <section className="pa-panel"><h2>Service readiness</h2><div className="pa-service"><span>Administrator identity store</span><Status>ready</Status></div><div className="pa-service"><span>Tenant data queries</span><Status>ready</Status></div><div className="pa-service"><span>Realtime / voice authority</span><Status>{(data.operations as Data).readiness}</Status></div><p className="pa-caption">Tenant readiness follows successful statistics queries. Voice counts include observed platform admissions only.</p>
          <h2 className="pa-subheading">Recent team events</h2>{data.eventsStatus ? <p className="pa-caption">The private tenant event stream is not exposed by this read-only data connection.</p> : <Timeline rows={(data.events as Data[]).map(e => ({ ...e, action: e.event_type, target_id: e.organization_id }))} />}</section></div>
    </>}</>;
  const [title, description] = titles[module]!;
  const rows = (data?.rows ?? []) as Data[];
  const readOnly = (data?.dataSource as Data | undefined)?.readOnly === true;
  return <><Heading eyebrow="PLATFORM ADMINISTRATION" title={title} description={description} />
    {data && <DataSourceNotice source={data.dataSource as Data | undefined} />}
    {module !== 'system' && <div className="pa-toolbar"><form method="get"><label><span className="sr-only">Search {title}</span><input name="q" defaultValue={params.get('q') ?? ''} placeholder={module === 'audit-logs' ? 'Search action or target ID…' : `Search ${title.toLowerCase()}…`} /></label>
      {module === 'organizations' && <select aria-label="Organization status" name="status" defaultValue={params.get('status') ?? ''}><option value="">All statuses</option><option>ACTIVE</option><option>SUSPENDED</option></select>}
      {module === 'users' && <select name="searchBy" aria-label="People search field" defaultValue={params.get('searchBy') ?? 'account'}><option value="account">Account email / ID</option><option value="profile">Profile name</option></select>}
      {module === 'audit-logs' && <select aria-label="Audit result" name="result" defaultValue={params.get('result') ?? ''}><option value="">All results</option>{['success','denied','failed','pending'].map(s => <option key={s}>{s}</option>)}</select>}
      {module === 'offices' && <input name="organization" aria-label="Filter by organization ID" placeholder="Organization ID (optional)" defaultValue={params.get('organization') ?? ''} />}
      <button className="pa-button pa-secondary">Search</button></form>
      {module === 'organizations' && !readOnly && <button className="pa-button" onClick={() => setCreating(!creating)}>＋ Create organization</button>}</div>}
    {error ? <ErrorState error={error} retry={load} /> : !data ? <p role="status">Loading {title.toLowerCase()}…</p> : module === 'system' ? readOnly ? <section className="pa-panel"><h2>Hosted platform settings</h2><p>This connection reads existing hosted tenant data. The separate administrator store’s settings do not control that project. Editing is disabled until a coordinated privileged backend is configured.</p></section> : <SettingsForm row={rows[0]!} onSuccess={refresh} /> : <section className="pa-panel pa-table-panel">
      <div className="pa-panel-title"><h2>{title} directory</h2><small>Page {value(data.page)} · up to 25 records</small></div>
      {!rows.length ? <div className="pa-empty"><strong>No matching records</strong><p>Try another search or clear the filters.</p></div> : <div className="pa-table-scroll"><table><thead><tr>{columns(module).map(col => <th key={col}>{col.replaceAll('_', ' ')}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {rows.map(row => <tr key={String(row.id)}>{columns(module).map(col => <td key={col}>{['status', 'result', 'is_available'].includes(col) ? <Status>{col === 'is_available' && row[col] === null ? 'Not configured' : row[col]}</Status> : col === 'created_at' ? date(row[col]) : col === 'config' ? <span>{value((row.config as Data | null)?.layout ?? 'Default')}<small>{value((row.config as Data | null)?.theme ?? 'Default theme')}</small></span> : <span>{value(row[col])}{col === (module === 'users' ? 'email' : 'name') && <small className="pa-id">{value(row.id)}</small>}</span>}</td>)}
          <td>{module === 'audit-logs' ? <details><summary>Details</summary><pre>{JSON.stringify({ administrator: row.username ?? row.admin_id, target: row.target_id, request: row.request_id, changes: row.changes }, null, 2)}</pre></details> : <button className="pa-text-button" onClick={() => detail(row)}>{readOnly ? 'Inspect ↗' : 'Manage ↗'}</button>}</td></tr>)}
      </tbody></table></div>}
      <div className="pa-pagination"><button disabled={Number(data.page) <= 1} onClick={() => changePage(Number(data.page) - 1)}>← Previous</button><span>Page {value(data.page)}</span><button disabled={!data.hasNext} onClick={() => changePage(Number(data.page) + 1)}>Next →</button></div>
    </section>}
    {creating && <section className="pa-panel pa-detail"><h2>Create an organization</h2><p>Select an existing verified user as owner. The established provisioning flow creates the organization, owner membership, and main office atomically.</p><ActionForm path="organizations/create" fields={[{ name: 'name', label: 'Organization name' }, { name: 'ownerId', label: 'Verified owner user ID' }, hidden('requestId', crypto.randomUUID())]} label="Create organization" onSuccess={refresh} /></section>}
    {detailError && <p id="pa-detail-error" tabIndex={-1} role="alert" className="pa-error">{detailError}</p>}
    {selected && <section id="pa-record-detail" tabIndex={-1} className="pa-panel pa-detail" aria-label="Record details"><div className="pa-panel-title"><h2>{value(selected.name ?? selected.email)}</h2><button className="pa-text-button" onClick={() => setSelected(null)}>Close details ×</button></div><p className="pa-id">{value(selected.id)}</p>{!readOnly && <p className="pa-notice">Changes require reauthentication within the last five minutes. <Link href="/superadmin/security">Open Security ↗</Link></p>}
      <RecordDetail key={String(selected.id)} module={module} row={selected} onSuccess={refresh} />
      {!!selected.hasNext && <button className="pa-button pa-secondary" onClick={async () => { try { setSelected(await adminRequest(`${module}/${selected.id}?page=${Number(selected.page) + 1}`)); } catch (e) { setDetailError((e as Error).message); } }}>Next detail page →</button>}
    </section>}
  </>;
}
function DataSourceNotice({ source }: { source?: Data }) {
  return source ? <p className="pa-notice">Data source: <strong>{value(source.project)}</strong> · {value(source.transport)}{source.readOnly ? ' · Read-only access; tenant changes are disabled.' : ''}</p> : null;
}
function columns(module: string) { return ({ organizations: ['name','status','members','created_at'], users: ['email','display_name','status','memberships'], offices: ['name','organization','is_available','config','revision'], 'audit-logs': ['created_at','action','result','target_type'] } as Record<string, string[]>)[module]!; }
function ErrorState({ error, retry }: { error: string; retry: () => void }) { return <section className="pa-panel pa-error" role="alert"><h2>Could not load administration</h2><p>{error}</p><button className="pa-button" onClick={retry}>Try again</button><p><Link href="/superadmin/login">Sign in again</Link></p></section>; }
function Timeline({ rows }: { rows: Data[] }) { return rows.length ? <div className="pa-timeline">{rows.map((row, i) => <div key={i}><strong>{value(row.action).replaceAll('.', ' / ')}</strong><small>{date(row.created_at)} {row.result ? `· ${row.result}` : ''}</small>{row.target_id ? <small className="pa-id">{value(row.target_id)}</small> : null}</div>)}</div> : <p className="pa-caption">No recent events.</p>; }
function MiniTable({ rows }: { rows: Data[] }) { return rows.length ? <div className="pa-table-scroll"><table><thead><tr>{Object.keys(rows[0]!).map(k => <th key={k}>{k.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{Object.entries(r).map(([k,v]) => <td key={k}>{value(v)}</td>)}</tr>)}</tbody></table></div> : <p className="pa-caption">No records.</p>; }
function RecordDetail({ module, row, onSuccess }: { module: string; row: Data; onSuccess: () => void }) {
  if ((row.dataSource as Data | undefined)?.readOnly) return <ReadOnlyDetail module={module} row={row} />;
  const target = hidden('id', row.id);
  if (module === 'organizations') return <>
    <div className="pa-grid-2"><section><h3>Organization information</h3><ActionForm path="organizations/update" fields={[target, { name: 'name', label: 'Organization name', value: row.name }]} label="Save organization" onSuccess={onSuccess} /></section>
      <section><h3>Organization access</h3><ActionForm path="organizations/status" fields={[target, { name: 'status', label: 'Status', options: ['ACTIVE','SUSPENDED'], value: row.status }, confirmation(row.name)]} label="Update access" onSuccess={onSuccess} /></section>
      <section><h3>Feature availability</h3><ActionForm path="organizations/features" fields={[target, { name: 'voiceEnabled', label: 'Voice enabled', type: 'checkbox', value: row.voice_enabled }, confirmation(row.name)]} label="Save availability" onSuccess={onSuccess} /></section>
      <section><h3>Transfer ownership</h3><p>The recipient must be an active, verified member. Previous owners become administrators.</p><ActionForm path="organizations/transfer" fields={[target, { name: 'memberId', label: 'Recipient membership ID' }, confirmation(row.name)]} label="Transfer ownership" onSuccess={onSuccess} /></section></div>
    <h3>Members and owners · page {value(row.page)}</h3><MiniTable rows={row.members as Data[]} /><h3>Assigned offices and environments</h3><MiniTable rows={row.offices as Data[]} />
    <div className="pa-grid-2"><section><h3>Manage membership</h3><ActionForm path="memberships/update" fields={[hidden('organizationId', row.id), { name: 'userId', label: 'Registered user ID' }, { name: 'role', label: 'Role', options: ['MEMBER','ADMIN'] }, { name: 'status', label: 'Membership status', options: ['ACTIVE','INACTIVE'] }, confirmation(row.name)]} label="Save membership" onSuccess={onSuccess} /></section>
      <section><h3>Invite a user</h3><ActionForm path="invitations/create" fields={[hidden('organizationId', row.id), { name: 'email', label: 'Email', type: 'email' }, { name: 'role', label: 'Role', options: ['MEMBER','ADMIN'] }]} label="Send invitation" onSuccess={onSuccess} /></section></div>
    <h3>Open invitations · page {value(row.page)}</h3><MiniTable rows={row.invitations as Data[]} />
  </>;
  if (module === 'users') return <><div className="pa-grid-2"><section><h3>Profile</h3><ActionForm path="users/profile" fields={[target, { name: 'displayName', label: 'Display name', value: row.display_name }]} label="Save profile" onSuccess={onSuccess} /></section>
    <section><h3>Account access and recovery</h3><p>Transfer every active ownership before suspension. Account recovery sends the existing Supabase recovery email.</p>{['suspend','reactivate','recovery'].map(action => <details className="pa-action-details" key={action}><summary>{action === 'recovery' ? 'Send recovery email' : `${action} account`}</summary><ActionForm path={`users/${action}`} fields={[target, confirmation(row.id)]} label={`Confirm ${action}`} onSuccess={onSuccess} /></details>)}</section></div><h3>Organization access · page {value(row.page)}</h3><MiniTable rows={row.memberships as Data[]} /><p>Manage roles and organization access from the corresponding organization record.</p></>;
  return <OfficeForm row={row} onSuccess={onSuccess} />;
}
function ReadOnlyDetail({ module, row }: { module: string; row: Data }) {
  if (module === 'organizations') return <><h3>Organization</h3><MiniTable rows={[{ name: row.name, slug: row.slug, status: row.status, created_at: row.created_at }]} /><h3>Members and owners · page {value(row.page)}</h3><MiniTable rows={row.members as Data[]} /><h3>Assigned offices and environments</h3><MiniTable rows={row.offices as Data[]} /><h3>Open invitations · page {value(row.page)}</h3><MiniTable rows={row.invitations as Data[]} /></>;
  if (module === 'users') return <><h3>Account and profile</h3><MiniTable rows={[{ email: row.email, display_name: row.display_name, status: row.status, created_at: row.created_at, last_sign_in_at: row.last_sign_in_at }]} /><h3>Organization access · page {value(row.page)}</h3><MiniTable rows={row.memberships as Data[]} /></>;
  return <><h3>Office environment</h3><p>Revision {value(row.revision)} · Updated {date(row.updated_at)}</p><p>{value(row.availability_note)}</p><pre>{row.config ? JSON.stringify(row.config,null,2) : 'No saved configuration; the existing application default applies.'}</pre></>;
}
function OfficeForm({ row, onSuccess }: { row: Data; onSuccess: () => void }) {
  const config = (row.config ?? defaultEnvironment) as typeof defaultEnvironment;
  const [layout, setLayout] = useState(config.layout), [theme, setTheme] = useState(config.theme), [decor, setDecor] = useState(config.decor), [furniture, setFurniture] = useState(config.furniture);
  const next = { ...config, layout, theme, decor, furniture };
  return <><p>Saving increments the environment revision. Existing realtime polling retires the old room and asks players to reload before rejoining.</p><p>Current revision: {value(row.revision ?? 0)} · Updated {date(row.updated_at)}</p>
    <div className="pa-grid-2">{[[layouts, layout, setLayout, 'Layout'], [themes, theme, setTheme, 'Theme'], [decorPacks, decor, setDecor, 'Decor'], [furnitureSets, furniture, setFurniture, 'Furniture']].map((group, i) => {
      const [options, chosen, setter, label] = group as unknown as [readonly { id: string; name: string }[], string, (v: string) => void, string];
      return <label className="pa-picker" key={i}>{label}<select value={chosen} onChange={e => setter(e.target.value)}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>;
    })}</div>
    <ActionForm path="offices/update" fields={[hidden('id', row.id), { name: 'name', label: 'Office name', value: row.name }, { name: 'isAvailable', label: 'Office available', type: 'checkbox', value: row.is_available }, { name: 'revision', label: 'Revision', type: 'number', value: row.revision ?? 0 },
      { name: 'config', label: 'Versioned environment configuration', type: 'json', value: next, help: 'Only existing catalog options are accepted. Branding, rug, planters, and accent can be edited here.' }, confirmation(row.name)]} label="Save office configuration" onSuccess={onSuccess} key={JSON.stringify(next)} />
    <details className="pa-action-details"><summary>Operational room reload</summary><p>Disconnect the current room safely and ask connected players to rejoin. This does not change the environment.</p><ActionForm path="offices/retire" fields={[hidden('id', row.id), confirmation(row.name)]} label="Retire current room" onSuccess={onSuccess} /></details>
  </>;
}
function SettingsForm({ row, onSuccess }: { row: Data; onSuccess: () => void }) {
  return <section className="pa-panel"><div className="pa-panel-title"><h2>Operational controls</h2><span className="pa-badge">Revision {value(row.version)}</span></div>
    <p className="pa-notice">Changes affect the whole platform. Reauthenticate in <Link href="/superadmin/security">Security</Link> before applying. Maintenance pauses tenant workflows; administrator access remains available.</p>
    <ActionForm path="system/update" fields={[{ name: 'version', label: 'Expected settings revision', type: 'number', value: row.version },
      ...[['maintenance','Maintenance mode'], ['registration_enabled','Registration available'], ['onboarding_enabled','Organization onboarding available'], ['voice_enabled','Platform voice available']].map(([name,label]) => ({ name: name!, label: label!, type: 'checkbox' as const, value: row[name!] })),
      { name: 'max_organizations_per_user', label: 'Maximum organizations created per user (1–100)', type: 'number', value: row.max_organizations_per_user }, confirmation('APPLY PLATFORM SETTINGS')]} label="Apply platform settings" onSuccess={onSuccess} />
    <p className="pa-caption">Registration controls require the documented Supabase Before User Created hook to cover direct Auth API requests. Limits do not change the existing ten-seat office capacity.</p>
  </section>;
}
