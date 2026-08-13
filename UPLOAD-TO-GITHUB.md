# Putting this on GitHub Pages

The one thing that goes wrong: uploading the **folder** instead of the
**files inside it**. GitHub Pages only serves from the top level of a
repository, so if `index.html` ends up one level down, every page is a 404.

## Steps

1. Create a new **public** repository on GitHub.
2. Click **Add file → Upload files**.
3. On your computer, **open this folder** so you can see `index.html`,
   `config.js`, `css`, `js` and the rest.
4. Select them all — `Ctrl+A` on Windows, `Cmd+A` on Mac.
5. Drag that selection onto the GitHub upload area.
6. Scroll down, click **Commit changes**.
7. Go to **Settings → Pages**. Source: `Deploy from a branch`.
   Branch: `main`, folder: `/ (root)`. Save.
8. Wait about a minute, then open the URL shown at the top of that page.

## The test that tells you it worked

Look at your repository's main page. You should see this, directly:

```
404.html
CLAUDE.md
README.md
SETUP.md
config.js
css/
firestore.indexes.json
firestore.rules
index.html
js/
tests.html
```

If instead you see **one folder** you have to click into, the upload went in
one level too deep. Delete it (click the folder → ⋯ → Delete directory →
commit) and redo from step 2, being careful at step 4.

## Still 404 after all that?

- **Settings → Pages** may say the site is still building. Give it 2 minutes.
- Check the branch name matches the one you uploaded to.
- Make sure the repository is **public**. Private repos need a paid plan for Pages.
- Hard-refresh with `Ctrl+Shift+R` — GitHub caches the old 404 aggressively.

## Honestly, though

Netlify Drop (<https://app.netlify.com/drop>) takes about 40 seconds, accepts
the folder as-is, and has none of these traps. GitHub Pages is worth it only
if you specifically want the code in version control.
