// Phase 17 gates (CLAUDE.md): 1. all 27 pages load clean from file://.
// 2. every Speaker boost chip clicked AND played into, in an app on each engine
//    path: synth voices (Flock), noise grains (Bubbles), Soundscape's loops,
//    samples (Strummer). Errors are what this catches; the gain is checked too.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DIR = process.env.DIR || 'C:/Local Docs/Coding/musicapps';
(async () => {
  const pages = ['', 'archive/', 'bench/'].flatMap(d =>
    fs.readdirSync(path.join(DIR, d)).filter(f => f.endsWith('.html')).sort().map(f => d + f));
  const browser = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let bad = 0;
  console.log(`=== gate 1: ${pages.length} pages ===`);
  for (const f of pages) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('requestfailed', r => errs.push('failed: ' + r.url().split('/').pop()));
    await page.goto('file:///' + DIR + '/' + f); await page.waitForTimeout(700); await page.close();
    if (errs.length) { bad++; console.log(`  FAIL  ${f}: ${errs[0]}`); }
  }
  console.log(bad ? `  ${bad} FAILED` : `  ${pages.length}/${pages.length} clean`);

  console.log('=== gate 2: boost chips played into ===');
  for (const app of ['flock.html', 'bubbles.html', 'soundscape.html', 'strummer.html']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto('file:///' + DIR + '/' + app); await page.waitForTimeout(600);
    const line = [];
    for (const label of ['1×', '2×', '3×']) {
      if (!(await page.$('#setupContent .chips'))) {}
      const open = await page.evaluate(() => typeof currentQuickMode !== 'undefined' ? currentQuickMode : null);
      if (open !== 'setup') { await page.click('.bbar[data-mode="setup"]'); await page.waitForTimeout(250); }
      const el = await page.evaluateHandle(l => {
        const hd = [...document.querySelectorAll('#setupContent .ctlh')].find(x => x.textContent === 'Speaker boost');
        return hd && [...hd.nextElementSibling.querySelectorAll('.chip')].find(c => c.textContent === l);
      }, label);
      if (!el.asElement()) { errs.push('no chip ' + label); break; }
      await el.asElement().scrollIntoViewIfNeeded(); await el.asElement().click(); await page.waitForTimeout(200);
      // close the pane and play: a sweep across the activity
      await page.click('.bbar[data-mode="setup"]'); await page.waitForTimeout(250);
      await page.mouse.move(500, 300); await page.mouse.down();
      for (let i = 0; i < 20; i++) { await page.mouse.move(500 + i * 30, 300 + i * 10); await page.waitForTimeout(14); }
      await page.mouse.up(); await page.waitForTimeout(400);
      const r = await page.evaluate(() => ({ g: masterGain ? masterGain.gain.value : null, v: SETTINGS.volume, b: speakerBoost, s: audioCtx && audioCtx.state, n: soundingVoices }));
      const want = r.v * parseInt(label);
      if (r.g == null || Math.abs(r.g - want) > 0.02 || r.b !== parseInt(label)) errs.push(`${label}: gain ${r.g} want ${want}`);
      line.push(`${label} g=${r.g == null ? '-' : r.g.toFixed(2)} ${r.s}`);
    }
    await ctx.close();
    if (errs.length) { bad++; console.log(`  FAIL  ${app}: ${errs[0]}`); } else console.log(`  ok    ${app.padEnd(16)} ${line.join('  ')}`);
  }
  await browser.close();
  console.log(bad ? `\n${bad} FAILED` : '\nall clean');
})();
