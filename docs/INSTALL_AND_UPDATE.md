# Installing & Updating

RPGify Habits installs straight from this site — no app store, no account.

## Try it in your browser first — no install

Not on Android, or don't want to install an APK yet? Open
**[Try in Browser](app/)** — it runs the whole core game (quests, attributes,
decay, your mastery tree, loot) right in the browser, on iOS, Android, or
desktop. Your data stays on your device either way, no account, no server.

- **iPhone/iPad (Safari):** open the link, then **Share → Add to Home
  Screen** to get a full-screen icon like a real app.
- **Android (Chrome):** open the link; Chrome will usually offer **Install**
  or **Add to Home screen** itself, or use the **⋮ menu → Add to Home
  screen**.
- **Desktop:** most browsers show an install icon in the address bar.

Two features need the installed Android app and don't work in the browser
version: the **Doomscroll Mirror** (it reads *which app* is in front of you
system-wide, a permission only a real Android app can hold) and **local
reminders** (water/posture nudges, which need a background OS scheduler).
Everything else is the same app. The Settings screen simply won't show those
two sections in the browser build — nothing is broken, they just don't apply.
You can always install the full APK later without losing anything: **Config →
Export** in the browser, then **Import** in the installed app.

## Install the Android app

Want the full feature set (or you'd rather have an app icon than a browser
tab)?

1. On your phone, tap **Download APK** (top of the page), or open:
   `https://bright3stday.github.io/RPGify_habits/apk/rpgify-latest.apk`
2. Open the downloaded file. The first time, Android asks to allow **"install
   unknown apps"** for your browser or Files app — allow it. (Every sideloaded
   app asks this; it's normal, not a sign anything is wrong.)
3. If **Play Protect** shows a prompt, choose **More details → Install anyway**.

That's it — it runs fully offline.

### If it says "app not installed"

Usually one of:

- **An older copy is already installed** with a different signature. Uninstall it
  first, then install again. (If you have data you want to keep, open the old app
  and use **Config → Export** first.)
- **Play Protect blocked it** — tap **More details → Install anyway**.
- **The download was interrupted** — re-download and try again.

## Updating

- **Most updates arrive automatically, over-the-air.** Open the app and it checks
  for a newer version, shows what's changed, and **asks before installing** —
  nothing downloads or applies without your OK.
- **Occasionally a larger update needs a fresh APK.** Just download the latest
  from the same button/link above and tap it — it installs over the old version
  and keeps your data.

## Your data

Everything stays on your device — no accounts, no servers. **Config → Export**
saves a backup file you can keep or move to another phone; **Import** restores
one. That's the only way data leaves or enters the app.

---

*Want to build, sign, or host your own copy? See `DEVELOPING.md` in the
repository.*
