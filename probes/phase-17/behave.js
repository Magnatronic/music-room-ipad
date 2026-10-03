// Phase 17 §5: what the room PC (Edge) sees, and the iPad path driven as far as
// Edge can drive it. Real gestures throughout: mouse clicks and CDP touches.
//
//  A  no key → boost 1×: masterGain equals Volume exactly (room PC unchanged)
//  B  the Setup chips: render, click 3× → key written, gain = vol×3; another app
//     on the same origin picks it up; 1× removes the key; ↺ Defaults leaves it
//  C  a context suspended behind our back resumes on a real click / touch end
//  D  Edge: hiding the page does NOT suspend (Soundscape behind a window)
//  E  simulated WebKit (navigator.audioSession present): hiding suspends,
//     showing again resumes
//  F  pagehide suspends; Back to the page → next tap plays
//  G  Show performance line carries "audio: running"
//  H  Speaker boost row fits the Setup pane at Menu size 1.5
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DIR = process.env.DIR || 'C:/Local Docs/Coding/musicapps';
const U = (f, q = '') => `file:///${DIR}/${f}${q}`;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tap(page, x = 900, y = 400) { await page.mouse.click(x, y); await page.waitForTimeout(150); }
async function openSetup(page) {
  await page.click('.bbar[data-mode="setup"]');
  await page.waitForTimeout(250);
}
const boostChips = page => page.$$eval('#setupContent .ctlh', hs => {
  const h = hs.find(x => x.textContent === 'Speaker boost'); if (!h) return null;
  return [...h.nextElementSibling.querySelectorAll('.chip')].map(c => ({ t: c.textContent, on: c.classList.contains('active') }));
});
async function clickBoost(page, label) {
  const h = await page.evaluateHandle(l => {
    const hd = [...document.querySelectorAll('#setupContent .ctlh')].find(x => x.textContent === 'Speaker boost');
    return [...hd.nextElementSibling.querySelectorAll('.chip')].find(c => c.textContent === l);
  }, label);
  await h.asElement().scrollIntoViewIfNeeded(); await h.asElement().click(); await page.waitForTimeout(300);
}
const gain = page => page.evaluate(() => masterGain ? masterGain.gain.value : null);

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const errs = [];
  const watch = p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); };

  console.log('A  no key = 1×');
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); watch(page);
    await page.goto(U('flock.html', '?s=volume:0.42')); await page.waitForTimeout(400); await tap(page); await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ g: masterGain.gain.value, v: SETTINGS.volume, k: localStorage.getItem('speaker-boost'), b: speakerBoost }));
    ok(r.k === null && r.b === 1, `key absent, boost ${r.b}`);
    ok(Math.abs(r.g - r.v) < 1e-6, `masterGain ${r.g.toFixed(4)} = volume ${r.v}`);
    // mute still silences
    await page.evaluate(() => { SETTINGS.mute = true; applyVolume(); }); await page.waitForTimeout(500);
    ok((await gain(page)) < 0.01, 'mute still takes gain to 0');
    await ctx.close(); }

  console.log('B  Setup chips');
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); watch(page);
    await page.goto(U('flock.html', '?s=volume:0.3')); await page.waitForTimeout(400); await tap(page);
    await openSetup(page);
    let ch = await boostChips(page);
    ok(ch && ch.map(c => c.t).join(' ') === '1× 2× 3×', 'chips ' + (ch ? ch.map(c => c.t + (c.on ? '*' : '')).join(' ') : 'MISSING'));
    ok(ch && ch[0].on, '1× active by default');
    await clickBoost(page, '3×');
    const k = await page.evaluate(() => localStorage.getItem('speaker-boost'));
    const g = await gain(page);
    ok(k === '3', 'key written: ' + k);
    ok(Math.abs(g - 0.9) < 0.01, `masterGain ${g.toFixed(3)} = 0.3 × 3`);
    // another app, same origin
    const p2 = await ctx.newPage(); watch(p2);
    await p2.goto(U('fluid_sensory.html', '?s=volume:0.5')); await p2.waitForTimeout(400); await tap(p2, 700, 300); await p2.waitForTimeout(300);
    const g2 = await gain(p2);
    ok(Math.abs(g2 - 1.5) < 0.01, `Fluid Sensory picks it up: ${g2.toFixed(3)} = 0.5 × 3`);
    await openSetup(p2);
    ch = await boostChips(p2); ok(ch && ch[2].on, 'Fluid Sensory shows 3× active');
    // ↺ Defaults leaves it
    await p2.evaluate(() => applyDefaults()); await p2.waitForTimeout(300);
    ok((await p2.evaluate(() => localStorage.getItem('speaker-boost'))) === '3' && (await p2.evaluate(() => speakerBoost)) === 3, '↺ Defaults leaves the boost alone');
    // a preset does not carry it
    const snapHas = await p2.evaluate(() => { const s = JSON.stringify(SETTINGS); return /speaker|boost/i.test(s); });
    ok(!snapHas, 'SETTINGS (so every preset) has no boost in it');
    await openSetup(p2); await openSetup(p2);
    if (!(await boostChips(p2))) await openSetup(p2);
    await clickBoost(p2, '1×');
    ok((await p2.evaluate(() => localStorage.getItem('speaker-boost'))) === null, '1× removes the key');
    await ctx.close(); }

  console.log('C  resume from a suspended context on a real gesture');
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true }); const page = await ctx.newPage(); watch(page);
    await page.goto(U('flock.html')); await page.waitForTimeout(400); await tap(page);
    await page.evaluate(() => audioCtx.suspend()); await page.waitForTimeout(200);
    ok((await page.evaluate(() => audioCtx.state)) === 'suspended', 'suspended behind its back');
    await tap(page, 900, 500); await page.waitForTimeout(300);
    ok((await page.evaluate(() => audioCtx.state)) === 'running', 'mouse click → running');
    await page.evaluate(() => audioCtx.suspend()); await page.waitForTimeout(200);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 800, y: 400, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ s: audioCtx.state, n: audioResumes }));
    ok(r.s === 'running', `touch → ${r.s} (resumes counted: ${r.n})`);
    await ctx.close(); }

  console.log('D  Edge: hidden does not suspend');
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); watch(page);
    await page.goto(U('soundscape.html')); await page.waitForTimeout(500); await tap(page, 700, 400); await page.waitForTimeout(300);
    const has = await page.evaluate(() => ({ a: AUDIO_PAUSE_WHEN_HIDDEN, as: 'audioSession' in navigator }));
    ok(!has.a && !has.as, 'Edge: no audioSession, pause-when-hidden off');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    ok((await page.evaluate(() => audioCtx.state)) === 'running', 'Soundscape hidden in Edge: still running');
    await ctx.close(); }

  console.log('E  simulated WebKit: hidden suspends, visible resumes');
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { navigator.audioSession = { type: 'auto' }; });
    const page = await ctx.newPage(); watch(page);
    await page.goto(U('flock.html')); await page.waitForTimeout(400); await tap(page);
    ok(await page.evaluate(() => AUDIO_PAUSE_WHEN_HIDDEN), 'audioSession present → pause-when-hidden on');
    const setVis = h => page.evaluate(h => { Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange')); }, h);
    await setVis(true); await page.waitForTimeout(300);
    ok((await page.evaluate(() => audioCtx.state)) === 'suspended', 'hidden → suspended');
    await setVis(false); await page.waitForTimeout(300);
    ok((await page.evaluate(() => audioCtx.state)) === 'running', 'visible → running');
    await page.evaluate(() => audioCtx.suspend()); await page.waitForTimeout(200);
    await tap(page); await page.waitForTimeout(300);
    const v = await page.evaluate(() => ({ s: audioCtx.state, n: soundingVoices }));
    ok(v.s === 'running' && v.n > 0, `then a tap plays: ${v.s}, voices ${v.n}`);
    await ctx.close(); }

  console.log('F  pagehide suspends; Back → next tap plays');
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); watch(page);
    await page.goto(U('flock.html')); await page.waitForTimeout(400); await tap(page);
    await page.evaluate(() => { window.__ph = null; addEventListener('pagehide', () => { window.__ph = audioCtx.state; setTimeout(()=>{}, 0); }); });
    // the suspend itself is async; observe it by dispatching pagehide on a page that stays
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await page.waitForTimeout(300);
    ok((await page.evaluate(() => audioCtx.state)) === 'suspended', 'pagehide → suspended');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.waitForTimeout(300);
    ok((await page.evaluate(() => audioCtx.state)) === 'running', 'pageshow → running');
    // and the real thing: navigate to the launcher and press Back
    await page.goto(U('index.html')); await page.waitForTimeout(400);
    await page.goBack(); await page.waitForTimeout(600);
    await tap(page, 900, 450); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ s: audioCtx && audioCtx.state, n: soundingVoices }));
    ok(r.s === 'running' && r.n > 0, `after Home → Back, a tap plays: ${r.s}, voices ${r.n}`);
    await ctx.close(); }

  console.log('G  Show performance');
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); watch(page);
    await page.goto(U('flock.html', '?s=showStats:true')); await page.waitForTimeout(400); await tap(page); await page.waitForTimeout(1200);
    const t = await page.evaluate(() => document.getElementById('stats').textContent);
    ok(/audio: running/.test(t), 'readout: ' + t.trim());
    await ctx.close(); }

  console.log('H  fits at Menu size 1.5');
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => localStorage.setItem('ui-scale', '1.5'));
    const page = await ctx.newPage(); watch(page);
    await page.goto(U('flock.html')); await page.waitForTimeout(500);
    await openSetup(page);
    const r = await page.evaluate(() => {
      const hd = [...document.querySelectorAll('#setupContent .ctlh')].find(x => x.textContent === 'Speaker boost');
      const box = hd.nextElementSibling, pane = document.getElementById('setupContent');
      const pb = pane.getBoundingClientRect();
      const cs = [...box.querySelectorAll('.chip')].map(c => c.getBoundingClientRect());
      return { right: Math.max(...cs.map(c => c.right)), paneRight: pb.right, rows: new Set(cs.map(c => Math.round(c.top))).size,
        h: Math.min(...cs.map(c => c.height)), sw: pane.scrollWidth, cw: pane.clientWidth };
    });
    ok(r.right <= r.paneRight + 0.5 && r.sw <= r.cw, `chips inside the pane (right ${r.right.toFixed(0)} ≤ ${r.paneRight.toFixed(0)}, no sideways scroll), ${r.rows} row(s), chip height ${r.h.toFixed(0)}px`);
    await page.screenshot({ path: __dirname + '/setup-1.5.png' });
    await ctx.close(); }

  await browser.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
})();
