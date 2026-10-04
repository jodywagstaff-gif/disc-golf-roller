import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=['index.html','style.css','app.js','model.js','sw.js','manifest.webmanifest','assets/icon.svg','assets/course.svg','assets/press-start-2p.woff2','assets/OFL.txt'];
for(const file of files){await fs.mkdir(path.dirname(path.join(root,'dist',file)),{recursive:true});await fs.copyFile(path.join(root,file),path.join(root,'dist',file));}
console.log('Built static app in dist/ ('+files.length+' files).');
