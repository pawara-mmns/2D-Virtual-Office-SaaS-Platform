'use client';
export default function Error({ reset }: { reset: () => void }) { return <main style={{ padding: 48 }}><h1>Administration is temporarily unavailable</h1><p>Refresh the session or check the local setup.</p><button onClick={reset}>Try again</button></main>; }
