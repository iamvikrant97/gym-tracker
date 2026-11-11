# Setting up the Gym app

This takes about 20 minutes, once. You need a computer for steps 1 to 3 and your phone for steps 4 and 5.

Nothing secret is stored in the code. Your Sheet link, your key and your Spotify Client ID are only typed into the app on your phone.

---

## 0. Make a backup copy of your Google Sheet first

The first time the app connects, it changes your Sheet a little:

- on rows where you left the date, day or exercise blank (because the row above already had it), it fills those cells in, and
- it adds an id to every logged row in column AB and hides that column, so the app can find the row again later.

Your numbers and formulas are not changed, but make a copy before you start, just in case:

1. Open the Sheet.
2. Click **File → Make a copy**.
3. Name it "Gym log backup" and click **Make a copy**.

Keep using the original. The copy is only there if something goes wrong.

---

## 1. Put the app online (GitHub)

1. Sign in at **github.com**.
2. Click **+** (top right) → **New repository**.
3. Repository name: `gym-tracker` (exactly this, all lowercase).
4. Choose **Public**, then click **Create repository**.
5. Put the app code on the `main` branch with git (`git push origin build:main`), not with the "Upload files" button: the web upload easily leaves out the hidden `.github` folder, and then nothing gets built. If someone is helping you, they can push it for you.
6. In the repository, click **Settings** → **Pages** (left side).
7. Under **Build and deployment → Source**, choose **GitHub Actions**.
8. Click the **Actions** tab and wait for the green tick (about 2 minutes). If there is no run, click **Deploy** (left) → **Run workflow**.
9. Your app is now at `https://<your-github-username>.github.io/gym-tracker/`. Write this address down.

---

## 2. Connect the Google Sheet (Apps Script)

1. Open your Google Sheet (the original, not the copy).
2. Click **Extensions → Apps Script**. A new tab opens.
3. Delete everything in the editor, then paste the whole content of the file `apps-script/Code.gs`.
4. Click the **Save** icon (floppy disk).
5. Make up a key: any long password you like, for example `squat-rack-blue-4417-mango`. Write it down. (You do not need to run anything in the script: the key is set only in the next step.)
6. On the left, click the **gear icon (Project Settings)**.
7. Scroll down to **Script properties** → **Add script property**.
   - Property: `KEY` (capital letters, exactly this)
   - Value: the key you made up
   - Click **Save script properties**.
8. Top right, click **Deploy → New deployment**.
9. Click the gear next to "Select type" and choose **Web app**.
10. Fill in:
    - Description: `Gym app`
    - Execute as: **Me**
    - Who has access: **Anyone** (not "Anyone with Google account": the app cannot sign in to Google)
11. Click **Deploy**. Google asks you to allow access: click **Authorize access**, pick your account, then **Advanced → Go to (project name) (unsafe)** → **Allow**. This is normal for your own script.
12. Copy the **Web app URL**. It starts with `https://script.google.com/macros/s/` and ends with `/exec`.

If you change `Code.gs` later, use **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**, so the URL stays the same.

---

## 3. Connect Spotify (optional)

You need Spotify Premium to control music from the app.

1. Go to **developer.spotify.com/dashboard** and log in with your Spotify account.
2. Click **Create app**.
3. Fill in:
   - App name: `Gym`
   - App description: `My gym app`
   - Redirect URI: `https://<your-github-username>.github.io/gym-tracker/` and click **Add**.
     It must match exactly: `https`, your username in lowercase, and the `/` at the end.
   - Under "Which API/SDKs are you planning to use?" tick **Web API**.
4. Tick the terms box and click **Save**.
5. Open the app's **Settings** and copy the **Client ID**.

The app's own Settings screen also shows the exact Redirect URI to paste, with a Copy button.

---

## 4. Install the app on your phone

1. On the phone, open **Chrome** (not Samsung Internet).
2. Go to `https://<your-github-username>.github.io/gym-tracker/`.
3. Tap the **⋮** menu (top right) → **Install app** (on some phones it says **Add to Home screen**) → **Install**.
4. Open **Gym** from your home screen from now on.
5. **Open it once while you have internet, before you go to the gym.** The first open saves the app on the phone; after that it works with no signal. After every update, open it once online too.

---

## 5. Fill in Settings in the app

1. On the Today screen, tap the **gear** (top right).
2. **Google Sheet:**
   - paste the **Web app URL** from step 2,
   - type the **Key** from step 2,
   - tap **Test connection**. It should say "Connected".
   - tap **Save and import**. It says "Imported N sets": your history from the Sheet is now in the app.
3. **Spotify:**
   - paste the **Client ID** from step 3,
   - tap **Connect Spotify**, log in and tap **Agree**. You come back to the app.
4. **Training:** check "Sessions per week" (6 = Monday to Saturday) and your body weight.
5. **Exercises:** weight steps are 2.5 kg by default. If a machine moves in 5 kg, change its step here.

Done. Log a set, and within a few seconds it appears in the Sheet. The dot on the Today screen shows "Synced" with the time.

---

## 6. If something does not work

| What you see | What to do |
|---|---|
| "The key does not match the one in the script" | The key in the app and the `KEY` script property are different. Retype both. No spaces. |
| "This is the test URL…" or "should end in /exec" | You copied the wrong URL. Use **Deploy → Manage deployments** and copy the Web app URL ending in `/exec`. |
| "That URL did not answer like the script" | "Who has access" is not **Anyone**. Fix it in **Deploy → Manage deployments → edit**, choose **New version**, Deploy. |
| "Could not reach the script" | No internet. Your sets are safe on the phone and are sent later by themselves. |
| "The Sheet is taking long…" (first import) | The script is still working. Wait a minute and tap **Try again**. Nothing is duplicated. |
| The workout says it closed after an hour without a set | Tap **Continue workout** (or just log the next set): the same workout carries on, for up to 3 hours, the same day. |
| Today shows "Offline · saved on phone" | Same: no internet. Nothing is lost. |
| Today shows "Sheet needs a look" | The Sheet refused some sets several times. Open Settings to see how many. Check that the **Log** and **Exercises** tabs still have their original names. |
| Spotify says "Open Spotify" | Spotify is not playing on any device. Open the Spotify app, start any song, then come back. |
| Spotify says "Reconnect" | Your Spotify login expired. Tap **Reconnect**. |
| Spotify login says "INVALID_CLIENT: Invalid redirect URI" | The Redirect URI in the Spotify dashboard is not exactly the one shown in the app's Settings. Copy it from the app and paste it again. |
| The app looks old after an update | Close it fully (swipe it away) and open it again. |
| You want a second copy of everything | Settings → **Backup → Export backup** saves a file to Downloads. **Import backup file** puts it back (nothing is duplicated). |

Your data lives on the phone first, and in the Sheet. Clearing Chrome's data for the site, or uninstalling the app, deletes the phone copy. The Sheet keeps everything that was synced. Use **Save and import** to get it back.

---

## Known limits

- **A workout closes by itself after 60 minutes without a set** if you forget Finish. The same day, within 3 hours, logging another set or tapping Continue workout reopens it.
- **No alerts when the app is closed.** The rest timer vibrates only while the app is open. If you switch to another app, the timer keeps the right time and shows it when you come back.
- **Spotify needs internet and an active device.** The phone must be online, and Spotify must be open (or recently playing) on some device. Playback control needs Premium.
- **Suggested playlists are community playlists.** Spotify does not let new apps see its own editorial playlists, so "For your workout" shows popular user-made gym playlists. Pin the ones you like.
- **Editing the Sheet by hand is not copied back** to the app. Make changes in the app. New rows typed in the Sheet can be pulled in with **Save and import**.
- **The app needs Chrome on Android** to install. Other browsers may work but are not tested.
