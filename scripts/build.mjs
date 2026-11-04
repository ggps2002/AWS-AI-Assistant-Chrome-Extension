// Runs both Vite builds: extension pages + service worker, then the content script.
//   node scripts/build.mjs           production build into dist/
//   node scripts/build.mjs --watch   development build that rebuilds on change
import { build } from 'vite';

const watch = process.argv.includes('--watch');
const mode = watch ? 'development' : 'production';

// The content build must run after the pages build, which empties dist/ first.
await build({ configFile: 'vite.config.ts', mode, build: { watch: watch ? {} : null } });
await build({ configFile: 'vite.content.config.ts', mode, build: { watch: watch ? {} : null } });

if (watch) {
  console.log('\nWatching for changes. Reload the extension in chrome://extensions after each rebuild.');
}
