const fs = require('fs');
const path = require('path');

const moves = [
  { src: 'app/s', dest: 'app/[locale]/s' },
];

async function move() {
  for (const { src, dest } of moves) {
    const sourcePath = path.resolve(src);
    const destPath = path.resolve(dest);
    
    if (fs.existsSync(sourcePath)) {
      console.log(`Moving ${src} to ${dest}...`);
      try {
        await fs.promises.cp(sourcePath, destPath, { recursive: true });
        console.log(`Copied ${src}`);
        await fs.promises.rm(sourcePath, { recursive: true, force: true });
        console.log(`Deleted source ${src}`);
        console.log(`Success: ${src}`);
      } catch (err) {
        console.error(`Error moving ${src}:`, err);
      }
    } else {
      console.log(`Source not found: ${src}`);
    }
  }
}

move();
