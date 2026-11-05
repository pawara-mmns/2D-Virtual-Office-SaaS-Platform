import type { Metadata } from 'next';
import './superadmin.css';
export const metadata: Metadata = { title: 'Platform Console · Virtual Office', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
