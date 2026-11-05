import 'server-only';
import { adminDatabase } from './database';
import { createPlatformDataGateway, platformDataConfig, PlatformDataError, assertPlatformDataWritable } from './data-access';
import { createTenantReadService } from './tenant-reads';
export function platformDataReader() {
  const config = platformDataConfig(process.env);
  return createTenantReadService(adminDatabase(), config, config.mode === 'supabase' ? createPlatformDataGateway(config) : undefined);
}
export function requireWritablePlatformData() { assertPlatformDataWritable(platformDataConfig(process.env)); }
export function sanitizedDataFailure(error: unknown, operation: string, requestId: string) {
  const known = ['dashboard','organizations','users','offices','system','audit-logs'].includes(operation) ? operation : 'unknown';
  if (error instanceof PlatformDataError) console.warn('Platform data read failed.', { category: error.category, operation: known, requestId });
}
