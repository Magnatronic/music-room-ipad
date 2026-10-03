# Phase 17 — sound on an iPad: loud enough, and it comes back

**Status:** built on branch `fix-ipad-audio` (opened 2026-10-03). Edge gates pass.
Awaiting UAT on the iPad at magnatronic.github.io/music-room-ipad (`UAT-PHASE-17.md`).

**Trigger:** this touches `framework.js`'s audio engine, which every app goes
through, and it adds a value stored on the device. Both are design-doc triggers
in `CLAUDE.md`.

## 1. The report

The user tried the hosted site (magnatronic.github.io/music-room) in Safari on
an iPad. The apps run well in Edge in the sensory room, but on the iPad:

1. **Too quiet.** It is quiet at the default Volume, and students still needed
   more with the slider and the iPad's own volume both at maximum.
2. **Silent after a while.** After a period of inactivity the apps stopped making
   sound, and the only fix was to quit Safari and open it again.

Neither happens in the room. Neither can be reproduced here: the test harness is
Chromium on Windows, not iOS WebKit. Everything in §2 comes from reading the code
and from documented WebKit behaviour. The iPad is the only place the result can
be confirmed, which makes the user's UAT the actual test, not a formality.

## 2. Causes

### 2.1 Quiet: the engine leaves 10–15 dB unused

With one note playing, the signal passes through these stages
(`framework.js`):

| stage | value | where |
|---|---|---|
| Volume (`SETTINGS.volume`, the slider) | **0.30** default, 0–1 | `:160`, `masterGain` `:883` |
| voice level `V.gain` | 0.12 (Pure, Bell) to 0.20 (Marimba, Kalimba) | `:769-798` |
| height, only when the Y axis is set to loudness | 0.30–1.0 | `yLoudness` `:861` |
| auto-mixer `polyGain` | 1.0 for one or two voices | `:946` |
| limiter threshold | −9 dBFS, soft knee 12, ratio 8 | `:908` |

**One note at default Volume peaks at about 0.036–0.06, roughly −25 to −29 dBFS.
At Volume 1.0 it is 0.12–0.20, roughly −14 to −18 dBFS.** That is still 5–9 dB
below the limiter threshold, which a single note never reaches, and 14–18 dB
below full scale.

The room hides this because the PC plays through an amplifier. The iPad's
built-in speakers have nothing after them to make up the difference.

Nothing here is a bug, and the per-voice levels were chosen to leave headroom
for five fingers plus effects. The fault is that **nothing lets a device with
weak speakers use that headroom.**

> These numbers come from reading the code. Build step 1 (§6) measures them in a
> real page, along with the worst-case peak that sets how much boost is safe.

### 2.2 Silent: iOS pauses the audio and nothing restarts it

iOS pauses a page's `AudioContext` when the screen locks, when Safari goes to the
background, and when a call, Siri, an alarm or a notification takes the audio.
WebKit reports a state of its own for this, **`'interrupted'`**, which other
browsers do not have.

Three things in the engine combine to leave it silent:

1. **`getAudio()` resumes only from `'suspended'`** (`:928`). It never resumes a
   context that is `'interrupted'`.
2. **It resumes on `touchstart`** (`:1330` → `onDown` → `startVoice` →
   `getAudio`). In WebKit, `touchstart` is not a user activation: audio is only
   allowed to start on `touchend`, `pointerup`, `click` or a key. So even a
   correct resume made at that moment can be refused.
3. **The engine is created once and kept** (`:877`). If the context ends up
   unusable, nothing replaces it, and only a fresh page gets a fresh one.

**Point 2 was already found once and fixed in one app only.** `soundscape.html:1084-1089`
retries `resume()` on every `pointerup`/`touchend`, with the comment
*"Touchscreens only grant audio permission on touch RELEASE"*. The other 19 apps
never got that fix. This is the generalisation miss that
`feedback-check-it-generalises` describes.

**Answered 2026-10-03: a reload did NOT bring the sound back.** Only quitting
Safari did. A reload is a new page with a new `AudioContext`, so that means the
broken thing is **Safari's audio session on the iPad**, which every page in that
Safari process shares, and not anything inside our page. Once that session is
stuck, no page code can unstick it, because a reload already does more than any
in-page rebuild could.

So restarting the audio (§3.2) stays, because it is right for the ordinary
pause. But it cannot be the whole fix: the job is to **stop the session getting
stuck in the first place.** Two things the engine does are prime suspects. Both
are invisible on a PC.

1. **It never lets go of the audio.** The context is created on the first touch
   and never suspended. On top of that, the keep-alive loop (`:916-922`), which
   was added for HDMI pops on the room PC, plays a −80 dB noise floor for ever.
   As far as iOS can tell, the page is *always playing*, including while the
   screen dims and locks. A page that is still playing when the iPad locks is
   exactly the case that WebKit has to interrupt rather than pause cleanly.
2. **Every app the iPad visits stays alive and holds a context.** Safari's
   back-forward cache keeps a page frozen in memory after navigating away so
   that Back is instant. Going Home → app → Home → another app leaves each of
   those pages cached **with its `AudioContext` still open**, because nothing
   closes or suspends it on `pagehide` (`framework.js` uses `pagehide` only for
   fullscreen, `:341`). Over a session the iPad builds up a stack of contexts,
   all still attached to the one audio session. That fits "after a while" as
   well as inactivity does: it is a guess at the mechanism, not a measurement.

Neither can be measured here. Both fixes (§3.3) are cheap, framework-only and
harmless on the PC, so they ship together, and the readout in §3.4 is what tells
us next time whether they were enough.

### 2.3 Safari may treat the sound like a ringtone

By default, iOS gives Web Audio the *ambient* audio category, which the iPad's
silent mode mutes. Safari 16.4+ provides `navigator.audioSession.type`, and
setting it to `'playback'` puts the page in the same category as a video. That
makes silent mode irrelevant and the behaviour predictable. This probably does
not explain the low level, but it removes one variable and costs one line.

## 3. Design

### 3.1 Speaker boost: one value per device, in Setup

Add a **Speaker boost** control, with three chips: **1× · 2× · 3×**. The design
proposed four, and measurement set the top at 3× (§3.1a). The
boost multiplies `masterGain`:

```
masterGain = mute ? 0 : volume × boost
```

**It belongs to the DEVICE, not to the app or the student.** It answers "what are
this machine's speakers like?", the same kind of question as **Menu size**
(`ui-scale`) and **Fullscreen** (`fullscreen`). Like those two, it gets a global
localStorage key **`speaker-boost`**, outside `SETTINGS`.

It goes in **Setup**, beside Menu size, because that is where a therapist already
sets the machine up. Confirmed by the user 2026-10-03: "setup tab makes sense
so it is persistent across all apps".

**Alternatives considered and rejected:**

- **Widen the Volume slider (0–3).** `volume` is stored **per app**
  (`STORE_KEY = 'settings:' + page`), so the iPad would need raising in each of
  20 apps separately. Every preset would also carry the iPad's loudness onto the
  room PC.
- **Raise the default Volume.** `saveSettings()` writes the whole `SETTINGS`
  object, so every app the room PC has ever saved already stores
  `volume: 0.30`. A new default would change only the apps nobody has opened
  there, which leaves the room inconsistent from one app to the next, and does
  not fix "not loud enough at maximum" anyway.
- **Raise every voice's `V.gain`.** Same result as a boost, except it also makes
  the room louder, and it is 14 numbers instead of one.

The boost covers **both** halves of the report. At 3×, the default Volume 0.30
plays like 0.90 does today, and Volume 1.0 reaches the limiter.

### 3.1a Measured: the limiter is not a ceiling, so above 1× there is a safety stage

`probes/phase-17/level.js` plays real CDP touches (1 and 5 fingers) on every
voice, with effects off and on, at Volume 1.0, and reads the output with an
`AnalyserNode`. On `main`'s engine, with the gain scaled the way a boost would:

| boost | worst peak | clipped samples | one note, Volume 1.0 |
|---|---|---|---|
| 1× | −2.8 dBFS | 0 | −19.6 … −9.8 dBFS |
| 2× | −0.2 dBFS | 0 | −13.6 … −4.9 |
| 3× | **+0.8 dBFS** | **207** | −10.1 … −3.2 |
| 4× | **+1.7 dBFS** | **1927** | −7.7 … −2.4 |

**The design said "the limiter keeps the output under full scale". Measured,
it does not.** It is a compressor (8:1, soft knee, 4 ms attack), and five fingers
at 3× go straight past it.

So above 1× the limiter's output goes through a **WaveShaper safety stage**. It
leaves everything below 0.7 (−3 dBFS) untouched, then eases toward 1.0 and never
reaches it. It is wired in **only when the boost is above 1×** (`routeOutput()`),
so at 1× the graph is exactly `main`'s. With it, measured on the branch through
the real key:

| boost | worst peak | clipped samples | one note, Volume 1.0 |
|---|---|---|---|
| 1× | −1.4 dBFS | 0 | −19.6 … −9.8 dBFS (same as `main`) |
| 2× | −0.5 dBFS | 0 | −13.6 … −4.9 |
| 3× | −0.3 dBFS | 0 | −10.1 … −3.4 |

**Why 3× and not 4×:** at 4× the five-finger chords would sit in the safety
stage's curve the whole time, an audible thickening, while a single note gains
only another 2.5 dB. 3× is +9.5 dB over today's maximum.

**Worst-peak figures with effects move by about 1.5 dB from run to run**, because
the reverb impulse is random noise generated at every load. `main` against itself
measured −14.8 and −12.9 on the same note. So the 1× rows above are the same
engine. Without effects, the branch and `main` agreed to 0.1 dB on every note
tested.

**Volume keeps its meaning exactly.** At boost 1×, which is the default and what
an absent key means, every machine sounds exactly as it does today, sample for
sample. The room PC never has the key, so the room does not change.

### 3.2 Restarting the audio

All of this is in `framework.js` and needs nothing from the apps:

- `getAudio()` resumes from **any state that is not `'running'` or `'closed'`**.
  That covers `'suspended'` and `'interrupted'`.
- **On every user-activation event** — `pointerup`, `touchend`, `click`,
  `keydown` on `window` — try a resume if the context is not running. This moves
  Soundscape's fix into the framework. Soundscape's own copy is then removed, so
  only one place owns it.
- On `visibilitychange` (visible), `pageshow` and `focus`, try a resume. It may
  be refused for lack of a gesture. That is harmless, and the next touch retries.
- Listen to `audioCtx.onstatechange` only to keep the readout in §3.4 accurate.
  It has no other effect.
- ~~Set `navigator.audioSession.type = 'playback'`.~~ **Dropped while building
  (2026-10-03).** Voice Visuals and Sampler use the microphone, and on iOS
  capture needs the play-and-record category. Forcing `'playback'` from the
  framework could break recording on the very device this phase is for, and that
  cannot be tested here. Its only benefit was the silent-mode hypothesis in
  §2.3, which nothing in the report points to. Per the rule that a guard is a
  hypothesis, it stays out. The property is still **read**, as the WebKit test
  in §3.3, but never written.

**First touch:** the note under the first finger can still be silent. It is
asked for on `touchstart`, before WebKit will let audio start. The `touchend`
resume then unlocks the context, and every later note plays. Today a **first**
tap on the iPad already behaves this way. Making the first note play would mean
delaying it to `touchend`, and a note that starts when the finger lifts is worse
everywhere else. **Accepted, not fixed.**

### 3.3 Letting go of the audio, so the session does not get stuck

Both measures are in `framework.js` alone, and both use `suspend()`, never
`close()`. A suspended context keeps every node the apps hold — Soundscape's
loops, Voice Visuals' analysers, the noise buffers — so `resume()` brings it
all back. That makes it the only kind of release that needs nothing from the
apps.

- **On `pagehide`, in every browser, suspend the context.** The page is leaving,
  so nothing audible is lost. If the page comes back from the back-forward cache
  (`pageshow` with `persisted`), §3.2's resume brings the context back on the
  next touch. On the room PC this changes nothing anyone can hear: Edge is
  already navigating away.
- **When the page is hidden, suspend the context — on WebKit only.** This covers
  the screen locking, the Home button and switching apps. The context then
  goes into iOS's interruption already suspended by us, instead of being caught
  mid-play.
  - **Why WebKit only:** in the room, a therapist might put Soundscape's ambience
    behind another window and expect it to keep playing. Suspending on hide in
    Edge would silence it. That would be a change to software people are using,
    for a fault Edge does not have.
  - **How WebKit is detected:** by `navigator.audioSession` being present. It is
    a proxy for "Safari, 16.4 or later", which is the browser that has the
    fault, and it is what §3.2 already uses. Old iPads on earlier iOS would not
    get this measure. Stated rather than hidden.
  - **Coming back:** §3.2's resume on `visibilitychange` and on the next touch.

**The keep-alive loop stays.** Once the context is suspended while hidden, the
loop is no longer audio playing while the iPad is locked. Removing it would bring
back the room PC's HDMI pops it was added to stop.

**Rebuilding the context** was in an earlier draft as a fallback. It is
**removed**, because the reload test answers it: a reload is a complete rebuild,
and it did not help. The rebuild also had a cost of its own: closing the context
would have left every app's own nodes dead, and needed a hook in each one.

### 3.4 Showing the audio state

Add the context's state to the **Show performance** readout (`updateStats`,
`:487`), for example `audio: interrupted`, plus a count of resumes made.

If the iPad goes silent again with that readout on, the user can read the state
off the screen. If it is `interrupted` or `suspended` and never changes, iOS is
refusing the resume. If it is `running` while nothing plays, the session is stuck
in a way we did not prevent. Either way, the next round starts from a fact
rather than a guess.

## 4. Lifecycle — the `speaker-boost` key

**Cardinality:** **one value per browser origin.** On the iPad that is
magnatronic.github.io in Safari. It is shared by every app and every student on
that device. It is not in `SETTINGS`, not in presets, and not in a launch link.

| event | what happens |
|---|---|
| **added** | Key absent = 1×. Nothing is written until a therapist picks a chip. |
| **changed** | Applied to `masterGain` immediately, with the same 0.05 s ramp as Volume, so there is no click. It is written to the key, and every app on the device uses it from its next load. |
| **duplicated** | Cannot happen: there is one key per origin. Two tabs open: the other tab picks up the change when it next loads. A live `storage` listener is not worth it for a setting chosen once. |
| **replaced** | Picking another chip overwrites the key. |
| **removed** | Clearing site data, or picking 1×, means 1×. Today's sound exactly. |
| **conflicts with a preset** | It can't: presets do not carry it. A student's preset sets their Volume, and the device's boost still applies on top of it. That is the intended split. |
| **conflicts with a launch link** | A link cannot name it, because it is outside `SETTINGS`, as `ui-scale` and `fullscreen` are. |
| **↺ Defaults** | Leaves it alone, the way Defaults leaves Menu size alone. Defaults resets an activity, not the hardware. |
| **inherited by the next person on the device** | **Yes, deliberately.** The speakers stay the same from one session to the next. The risk is the iPad later being plugged into a powerful speaker while still on 3×. That is bounded: above 1× the safety stage (§3.1a) keeps the output under full scale, and the iPad's own volume still governs. The chip shows the boost at all times. |
| **the room PC** | Never has the key. Its sound is unchanged. |

**The context (§3.2, §3.3)** stores nothing, so its lifecycle is its own state:

| event | state after |
|---|---|
| first touch | created; `running` after the touch ends (WebKit) or at once (Edge) |
| page hidden (iPad lock, Home button, another app) | WebKit: **suspended by us**. Edge: unchanged, still playing. |
| iOS interruption (call, Siri, alarm) while visible | `interrupted` (WebKit), set by iOS |
| page visible again, or next touch | `resume()` tried → `running` |
| navigate away | **suspended by us**; the page may sit in the back-forward cache |
| Back to a cached page | resumed on the next touch |
| reload | old page gone; the new page has no context until a touch |

**Inherited by the next person:** not for the page, since every page load starts
without a context. **The iPad's audio session, though, IS inherited.** It
outlives pages, and a stuck one is what the user had to quit Safari to clear.
That is why §3.3 exists.

## 5. Acceptance criteria

**Verified here (Edge/Chromium):**

1. **Boost 1× is identical to today.** In a real page driven by a real tap, the
   peak and RMS after the limiter are equal to `main`'s for the same note, voice
   and Volume.
2. **The top boost is safe.** Under the worst case — five fingers, the loudest
   voice, reverb, echo and chorus on, Volume 1.0 — the output after the limiter
   stays at or below 0 dBFS, with no sample clipping. The highest boost that
   meets this becomes the top chip.
3. `navigator.audioSession` is absent in Edge, or setting it is harmless there.
   **If it is present in Edge, the WebKit-only suspend on hide (§3.3) needs a
   different test, and the build stops to say so.**
   **Measured 2026-10-03: absent** in Edge 154 (`probes/phase-17/edge-audiosession.js`:
   `'audioSession' in navigator` is `false`). If a future Edge adds it, the worst
   outcome is that a hidden Edge tab pauses its sound until the next touch. That
   is not a failure state, and the room would notice it only with Soundscape
   playing behind another window.
4. Soundscape behaves the same after its own resume code is removed. In Edge its
   ambience **keeps playing** when the tab is hidden.
4a. After going to the launcher and pressing Back, the context resumes on the
   next tap and plays.
5. All 27 pages load clean. Every chip on Setup is clicked, and a note played,
   in at least one app that uses each engine path: synth voices, samples
   (Sampler), noise (Bubbles), Soundscape's loops.

**Verified by the user on the iPad (UAT):**

6. With the boost at 3×, the default Volume is comfortably audible, and Volume
   1.0 is loud enough for the students.
7. Lock the iPad, wait, then unlock: the next tap or the one after plays.
8. Switch to another app, wait 5 minutes or more, come back: sound returns
   without quitting Safari.
8a. Go back and forth between the launcher and ten or more apps, over a session
   like a real one. Sound keeps working.
9. If it does go silent, read `audio:` off the Show performance line and report
   it, along with which apps had been opened.

## 6. Build steps

1. **Measure:** add a probe in `probes/phase-17/` that taps a real page and reads
   the peak and RMS after the limiter through an `AnalyserNode`. Get the 1×
   baseline on `main` and the worst case at 2×, 3× and 4×. Set the chip range from
   the result.
2. Speaker boost: the key, the reader, `applyVolume()` using `volume × boost`,
   and the chips in Setup next to Menu size.
3. Audio restart (§3.2) and `audioSession`. Remove Soundscape's copy.
3a. Suspend on `pagehide`, and on hide on WebKit only (§3.3).
4. Show performance readout (§3.4).
5. Gates (§5 items 1–5), docs (`IMPROVEMENT-PLAN.md`, `APPS.md` where Soundscape
   is described, `README.md`'s framework description), `UAT-PHASE-17.md`.

## 7. Not in this phase

- **Rebuilding the context** — removed, because a reload did not help (§3.3).
- **A guaranteed fix for a stuck session.** If §3.3 does not prevent it, the
  fault is in iOS, and the only fix is quitting Safari. If UAT finds that, it
  goes in the README as a known iPad limitation.
- **Voice Visuals and Sampler's microphone after an interruption.** iOS also ends
  a microphone stream. Those two apps would need their own re-ask. Not reported,
  so not built. Noted in case it is.
- **Making the very first note play** (§3.2) — accepted.
