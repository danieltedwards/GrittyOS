# Gritty Fit — personal fitness tracker

A phone-first web app for one person. No account, no server, no monthly bill.
It installs to your home screen like a normal app and works offline.

## What's in it

| Tab | What you do there |
| --- | --- |
| **Today** | Dashboard: quick-add buttons, daily accountability checklist (with streaks), calories vs. target, workouts this week, weight trend and distance to goal, active goals with countdowns, and a journal prompt. |
| **Food** | Log calories and protein by meal, step back through previous days, re-add recent foods in one tap, 14-day calorie chart against your target. |
| **Train** | Log workouts (type, minutes, effort, sets/exercises, notes), workout days per week vs. your weekly target. |
| **Body** | Weigh-ins plus body fat %, muscle mass, and tape measurements (waist, chest, hips, arm, thigh, neck), all with trend charts. **Progress photos**: take or upload, then tap any two to compare side by side with the weight on each date. |
| **Goals** | Daily journal check-in (mood, energy, hunger, one win, honest notes, tomorrow's commitment), goals with target dates and your "why", and the daily habits that drive the Today checklist. |
| **⚙ Settings** | Name, lb/kg (switching converts existing entries), calorie/protein/workout targets, goal weight, **backup export/import**, erase. |

## Where your data lives

Everything is stored **only in your phone's browser** (IndexedDB). Nothing is uploaded anywhere.
That keeps it free and private, but it has two consequences:

1. **Use one device.** Data doesn't sync between your phone and your laptop.
2. **Export a backup now and then** (Settings → Export backup). If you clear Safari/Chrome
   website data or lose the phone, the backup file is how you get your history back.

Photos are resized to about 1400 px before they're saved, so they don't take up much space.

## Put it on your phone (free)

It's a folder of static files (HTML, CSS, JS). Any free static host works. Pick one:

**Option A: Cloudflare Pages (recommended; free, no expiry)**
1. Make a free account at <https://pages.cloudflare.com>.
2. *Create a project → Direct Upload*, then drag this `fitness/` folder in.
3. Open the `*.pages.dev` URL it gives you on your phone.

**Option B: Netlify Drop**: drag the `fitness/` folder onto <https://app.netlify.com/drop>
(sign up free so the site doesn't expire).

**Option C: GitHub Pages**: copy this folder into its own *public* repo and enable Pages
(Settings → Pages → deploy from branch). Public is fine: the code has no personal data in it,
since your data never leaves your phone. (Pages on private repos needs a paid GitHub plan.)

Then **add it to your home screen**:
- **iPhone (Safari):** Share button → *Add to Home Screen*.
- **Android (Chrome):** ⋮ menu → *Install app* / *Add to Home screen*.

It then opens full-screen with its own icon and keeps working without signal.

> Use the same URL every time. Each web address has its own separate storage.

## Run it locally

```bash
cd fitness
python3 -m http.server 8080   # then open http://localhost:8080
```

## Updating the app

After changing any file, bump `VERSION` in `sw.js` (e.g. `gritty-fit-v2`) and re-upload.
Phones pick up the new version the next time the app opens with a connection. Your data is untouched.

## Files

```
index.html            page shell + bottom tab bar
app.css               styles (light + dark mode follow the phone setting)
app.js                all screens, forms, and logic
db.js                 on-device storage (IndexedDB)
charts.js             small SVG charts (no libraries)
sw.js                 offline cache
manifest.webmanifest  install-to-home-screen metadata
icon*.{svg,png}       app icons
```

No build step and no dependencies.
