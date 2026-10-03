# UAT — Phase 17: sound on an iPad

**Branch:** `fix-ipad-audio` · **Design:** `PHASE-17-IPAD-AUDIO.md`
**Test site:** <https://magnatronic.github.io/music-room-ipad/>. This is a separate copy, and
the live site (`/music-room/`) is unchanged.

**Before you start**

- Use the iPad that had the problem, in **Safari**, with the iPad volume turned right up.
- The test site and the live site share this iPad's saved settings and presets. If you change
  Volume or a preset here, the live site on this iPad will show it. **Speaker boost** is the one
  new thing saved, and the live site ignores it.
- **The room PC is not affected by any of this**, because its files have not been copied.

## A. Loud enough

| # | Do this | Expect |
|---|---|---|
| 1 | Open the test site and pick any app with notes (e.g. Flock). Tap the screen twice. | The first tap may be silent: Safari only allows sound after a finger lifts. The second plays. |
| 2 | **Setup**. Scroll to **Speaker boost**. | Chips **1× · 2× · 3×**, with 1× selected, under Menu size. |
| 3 | Pick **3×**, close the menu, and play at the app's normal volume. | Clearly louder than before. |
| 4 | **Sound → Volume** all the way up. Play. | **Loud enough for the students?** Say if it isn't. |
| 5 | Put five fingers down and move them around, still at 3× with Volume up. Then try with **Effects** (reverb, echo) on. | Loud, no crackle or harsh distortion. |
| 6 | Go **Home** and open a different app. Open **Setup**. | Speaker boost already shows **3×**, and the app is loud straight away. It is set once for the iPad. |
| 7 | In that app, open **Presets** and pick **↺ Defaults**. Check Setup again. | Still **3×**. Defaults does not touch it. |

## B. Sound comes back

Turn on **Setup → This computer → Show performance** in the app you use for these steps. The small
line at the top should include **`audio: running`**.

| # | Do this | Expect |
|---|---|---|
| 8 | Lock the iPad. Wait a minute. Unlock and tap. | Plays, on the first or second tap. |
| 9 | Press Home, use another app that makes sound (YouTube, Music) for a bit, wait **5 minutes or more**, come back to Safari and tap. | Plays, on the first or second tap. |
| 10 | Leave the iPad untouched until it locks itself, ideally **10+ minutes**, the way it went silent before. Unlock and tap. | Plays. |
| 11 | Go back and forth: Home → app → Home → another app, through **10 or more apps**, over 15 minutes or so, like a real session. Include **Soundscape**. | Every app plays. Soundscape's sounds come back after you return to it. |

**If it goes silent at any point**, before quitting Safari:

1. Read the **`audio:`** part of the Show performance line, e.g. `audio: interrupted (6 resumes)`.
2. Note which apps you had opened, and what you did just before.
3. Send me both. That tells us whether iOS refused to restart the audio or Safari's audio is stuck
   below the page.

## C. Pass

Phase 17 passes if A3–A6 are loud enough without distortion and B8–B11 never needed Safari quitting.
Once you say so, it merges to `main` and goes to the live site. The room PC gets it only when you
next copy the files across. At 1× it sounds exactly as it does now.
