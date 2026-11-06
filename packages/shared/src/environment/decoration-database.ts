import type {DecorationDocument} from './decoration.ts';
export type DecorationDatabase={public:{Tables:{office_decoration_settings:{Row:{office_id:string;published:unknown;revision:number;published_revision:number;base_revision:number;updated_at:string;updated_by:string|null};Insert:never;Update:never;Relationships:[]}};Views:Record<never,never>;Enums:Record<never,never>;CompositeTypes:Record<never,never>;Functions:{
  load_office_decoration_draft:{Args:{p_office_id:string};Returns:unknown};
  write_office_decoration:{Args:{p_office_id:string;p_actor:string;p_expected_revision:number;p_base_revision:number;p_operation:'draft'|'publish'|'rollback';p_document:DecorationDocument};Returns:unknown};
}}};
export type DecorationWorkspace={revision:number;publishedRevision:number;baseRevision:number;draftBaseRevision:number;draft:DecorationDocument;published:DecorationDocument;previous:DecorationDocument|null;previousBaseRevision:number|null;updatedAt:string|null;updatedBy:string|null};
