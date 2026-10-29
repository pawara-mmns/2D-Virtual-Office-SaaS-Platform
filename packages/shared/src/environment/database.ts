// Narrow contract for the additive environment migration; no generated-schema edits.
import type { EnvironmentConfig } from './catalog.ts';
export type EnvironmentDatabase = { public: {
  Tables: { office_environment_settings: { Row: {office_id:string;config:unknown;revision:number;updated_at:string;updated_by:string|null}; Insert: {office_id:string;config:unknown;revision?:number;updated_at?:string;updated_by?:string|null}; Update: {config?:unknown}; Relationships: [] } };
  Views: Record<never,never>; Enums: Record<never,never>; CompositeTypes: Record<never,never>;
  Functions: { save_office_environment: { Args: {p_office_id:string;p_expected_revision:number;p_config:EnvironmentConfig}; Returns: unknown } };
} };
