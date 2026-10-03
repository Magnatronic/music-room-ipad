// Phase 17 §5.3: does Edge (the room browser) expose navigator.audioSession?
// The WebKit-only suspend-on-hide keys off it, so it must be ABSENT here.
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage();
  await p.goto('file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/'));
  const r = await p.evaluate(() => ({
    ua: navigator.userAgent,
    has: 'audioSession' in navigator,
    type: navigator.audioSession ? navigator.audioSession.type : null,
  }));
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
