import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=['index.html','style.css','app.js','model.js','reel-motion.js','release.js','sw.js','manifest.webmanifest','assets/icon.svg','assets/course.svg','assets/press-start-2p.woff2','assets/OFL.txt'];
for(const file of files){await fs.mkdir(path.dirname(path.join(root,'dist',file)),{recursive:true});await fs.copyFile(path.join(root,file),path.join(root,'dist',file));}
const buildId=process.env.RENDER_GIT_COMMIT||process.env.GITHUB_SHA||'local-preview';
await fs.writeFile(path.join(root,'dist','release.js'),'export const BUILD_ID='+JSON.stringify(buildId)+';\n');
await fs.writeFile(path.join(root,'dist','version.json'),JSON.stringify({commit:buildId,builtAt:new Date().toISOString()},null,2));
console.log('Built static app in dist/ ('+(files.length+1)+' files).');
