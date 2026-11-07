import { AdminLogin } from '@/features/platform-admin/admin-ui';
export default function Page() { return <AdminLogin configured={!!process.env.PLATFORM_ADMIN_DATABASE_URL && !!process.env.PLATFORM_ADMIN_MFA_KEY && !!(process.env.PLATFORM_ADMIN_ORIGIN || process.env.APP_URL)} />; }
