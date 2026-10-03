// Screenshot the Speaker boost row at Menu size 1.0 and 1.5.
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  for (const s of ['1', '1.5']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(s => localStorage.setItem('ui-scale', s), s);
    const p = await ctx.newPage();
    await p.goto('file:///C:/Local Docs/Coding/musicapps/flock.html'); await p.waitForTimeout(500);
    await p.click('.bbar[data-mode="setup"]'); await p.waitForTimeout(300);
    await p.evaluate(() => [...document.querySelectorAll('#setupContent .ctlh')].find(x => x.textContent === 'Speaker boost').scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(200);
    await p.screenshot({ path: __dirname + '/boost-' + s + '.png', clip: { x: 0, y: 0, width: 700, height: 800 } });
    await ctx.close();
  }
  await b.close();
})();
