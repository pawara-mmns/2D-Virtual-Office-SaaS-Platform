// Existing non-owner suites must not bundle server actions or create privileged
// clients merely because the optional editor is imported by OfficeCanvas.
export function unusedDecorationActions(plugin){
 plugin.onResolve({filter:/^\.\/actions$/},args=>args.importer.endsWith('decoration-editor.tsx')?{path:'unused-decoration',namespace:'unused-decoration'}:undefined);
 plugin.onLoad({filter:/.*/,namespace:'unused-decoration'},()=>({contents:`export async function loadDecorationAction(){throw Error('Non-owner fixture cannot edit')}export async function saveDecorationAction(){throw Error('Non-owner fixture cannot save')}`,loader:'js'}));
}
