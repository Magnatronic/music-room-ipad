// Phase 17 §6 step 1: what level actually leaves the limiter, from REAL touches.
//
//   node level.js            1 finger and 5 fingers, every voice, at volume 0.30
//                            and 1.0, effects off/on, with the gain after Volume
//                            scaled ×1..×4 (what a Speaker boost would do).
//
// Taps are CDP touch events on the canvas - the gesture a student makes - not
// synthesised onDown(). The level is read by an AnalyserNode hung off the
// limiter's OUTPUT, so it is what reaches the speakers, limiter included.
// Before the boost exists, ×N is simulated by writing volume×N straight to
// masterGain, which is exactly the product the design specifies.
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DIR = process.env.DIR || 'C:/Local Docs/Coding/musicapps';
const APP = process.env.APP || 'flock.html';
const VOICES = (process.env.VOICES || 'pure,warm,bell,glass,deep,harp,epiano,musicbox,marimba,kalimba,synth').split(',');
const BOOSTS = (process.env.BOOSTS || '1,2,3,4').split(',').map(Number);
const FINGERS = (process.env.FINGERS || '1,5').split(',').map(Number);
const FX = (process.env.FX || '0,1').split(',').map(Number);
const VOLS = (process.env.VOLS || '0.3,1').split(',').map(Number);
const USE_BOOST_KEY = !!process.env.USE_BOOST_KEY;   // after build: set the real key instead
const db = v => v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const rows = [];
  for (const voice of VOICES) for (const fx of FX) for (const vol of VOLS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const s = `voice:${voice},volume:${vol},reverb:${!!fx},echo:${!!fx},chorus:${!!fx},yAxis:none,mute:false`;
    await page.goto(`file:///${DIR}/${APP}?s=${s}`);
    await page.waitForTimeout(500);
    const cdp = await ctx.newCDPSession(page);
    for (const boost of BOOSTS) for (const n of FINGERS) {
      if (USE_BOOST_KEY) {
        await page.evaluate(b => { localStorage.setItem('speaker-boost', String(b)); }, boost);
        await page.reload(); await page.waitForTimeout(500);
      }
      // One tap first so the context and graph exist, then hang the meter.
      const pts = Array.from({ length: n }, (_, i) => ({ x: 300 + i * 160, y: 300 + (i % 2) * 120, id: i }));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 1200, y: 760, id: 99 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(2500);   // let that tap's tail die away
      await page.evaluate(({ boost, useKey }) => {
        if (!useKey) masterGain.gain.setValueAtTime(SETTINGS.volume * boost, audioCtx.currentTime);
        if (!window.__an) { window.__an = audioCtx.createAnalyser(); window.__an.fftSize = 2048; (typeof safetyOut !== 'undefined' && safetyOut && speakerBoost > 1 ? safetyOut : limiter).connect(window.__an); }
        window.__pk = 0; window.__ss = 0; window.__nn = 0; window.__clip = 0;
        const buf = new Float32Array(2048);
        clearInterval(window.__iv);
        window.__iv = setInterval(() => {
          window.__an.getFloatTimeDomainData(buf);
          for (const x of buf) { const a = Math.abs(x); if (a > window.__pk) window.__pk = a;
            if (a >= 0.999) window.__clip++; window.__ss += x * x; window.__nn++; }
        }, 20);
      }, { boost, useKey: USE_BOOST_KEY });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
        touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id })) });
      await page.waitForTimeout(900);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => { clearInterval(window.__iv);
        return { pk: window.__pk, rms: Math.sqrt(window.__ss / Math.max(1, window.__nn)), clip: window.__clip,
          state: audioCtx.state, gr: limiter.reduction }; });
      rows.push({ voice, fx, vol, boost, n, ...r });
      console.log(`${voice.padEnd(9)} fx:${fx} vol:${vol.toFixed(2)} x${boost} ${n}f  peak ${db(r.pk).padStart(6)} dBFS  rms ${db(r.rms).padStart(6)}  clipped ${r.clip}  ${r.state}`);
    }
    if (errs.length) console.log('  ERRORS', errs);
    await ctx.close();
  }
  await browser.close();
  // Summary: the worst peak per boost, and the loudest single note per boost.
  console.log('\n=== summary ===');
  for (const b of BOOSTS) {
    const at = rows.filter(r => r.boost === b);
    const worst = at.reduce((m, r) => r.pk > m.pk ? r : m, { pk: 0 });
    const clips = at.reduce((s, r) => s + r.clip, 0);
    const one = at.filter(r => r.n === 1 && r.vol === 1 && r.fx === 0);
    const lo = one.reduce((m, r) => r.pk < m.pk ? r : m, { pk: 9 }), hi = one.reduce((m, r) => r.pk > m.pk ? r : m, { pk: 0 });
    console.log(`x${b}: worst peak ${db(worst.pk)} dBFS (${worst.voice} ${worst.n}f fx:${worst.fx} vol:${worst.vol}); clipped samples ${clips}; one note at vol 1: ${db(lo.pk)}..${db(hi.pk)} dBFS`);
  }
  require('fs').writeFileSync(__dirname + '/level-' + (process.env.TAG || 'run') + '.json', JSON.stringify(rows, null, 1));
})();
