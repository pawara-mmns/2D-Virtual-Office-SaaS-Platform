import {pathToFileURL} from 'node:url';
import {picture} from './office-pixel-art.mjs';
import {avatarAtlasEntries,AVATAR_ATLAS_WIDTH,AVATAR_ATLAS_HEIGHT,AVATAR_FRAMES,drawAvatarLayer} from '../packages/shared/src/avatar-art.ts';
export function generateModularAvatars(){
  const atlas=picture(AVATAR_ATLAS_WIDTH,AVATAR_ATLAS_HEIGHT);
  avatarAtlasEntries.forEach(({body,layer,option},row)=>{
    for(let frame=0;frame<AVATAR_FRAMES;frame++)for(const[x,y,w,h,color]of drawAvatarLayer(body,layer,option,frame))atlas.rect(frame*32+x,row*32+y,w,h,color);
  });
  atlas.png('avatar-layers.png');
  console.info(`Generated original modular avatar atlas: ${avatarAtlasEntries.length} shared layer rows, ${AVATAR_FRAMES} aligned frames each, ${AVATAR_ATLAS_WIDTH}x${AVATAR_ATLAS_HEIGHT}.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)generateModularAvatars();
