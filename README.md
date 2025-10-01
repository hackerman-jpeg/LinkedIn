# LinkedIn Browser Scripts

![Made with JavaScript](https://img.shields.io/badge/Made%20with-JavaScript-yellow?style=for-the-badge&logo=javascript)
![Status](https://img.shields.io/badge/Status-Experimental-orange?style=for-the-badge&logo=linkedin)

⚠️ **Disclaimer**  
May not work, but I got it functional on my Safari browser.  

---

## Features

- **Bulk Unfollow** – Automatically unfollow people you’re following.  
- **Bulk Unlike** – Automatically remove likes/reactions from posts.  
- **Bulk Delete My Comments** – Delete all your comments, one by one.  
- **Control Panel** – Start, stop, and monitor progress via console commands.  

---

## How to Use

1. **Navigate** to the relevant LinkedIn page:  
   - 👥 Unfollow → [See here](https://www.linkedin.com/help/linkedin/answer/a546122/viewing-recent-activity?lang=en)
   - 👍 Unlike → [See here](https://www.linkedin.com/help/linkedin/answer/a546122/viewing-recent-activity?lang=en)  
   - 💬 Delete Comments → [See here](https://www.linkedin.com/help/linkedin/answer/a546122/viewing-recent-activity?lang=en)   

2. **Open Developer Console**  
   - Safari: `Option + Command + C`  
   - Chrome/Edge: `Ctrl + Shift + J` (Windows/Linux) or `Command + Option + J` (Mac)  
   - Firefox: `Ctrl + Shift + K`  

3. **Copy & Paste** the script into the console and press **Enter**.  

4. Watch the console logs as the script runs.  


## Controls

Each script attaches a control object to the `window`:

| Action        | Object      | Methods Available |
|---------------|------------|-------------------|
| Unfollow      | `liUnfollow` | `.start()` `.stop()` `.status()` |
| Unlike        | `liUnlike`   | `.start()` `.stop()` `.status()` |
| Delete Comment| `liDelCmt`   | `.start()` `.stop()` `.status()` |

### Example  
```js
liDelCmt.stop()     // Immediately stop deleting comments
liDelCmt.start()    // Resume from current state
liDelCmt.status()   // Show stats (deleted count, remaining, etc.)
```


### Notes & Recommendations
- Delays are built in (~1.2–1.5s per action). Increase if LinkedIn rate-limits you.
- Batch Mode: Set maxPerRun in the script to process only a limited number (e.g., 25 per run).
- Localization: If your LinkedIn is not in English, update text labels ("Following", "Delete", etc.) inside the scripts.
- Scroll Behavior:
- - Unfollow & Unlike → auto-scrolls to load more.
  - Delete Comments → scrolls only to new posts with your comments (ignores “Load more comments” so it doesn’t touch other people’s threads).


### Example Run
```
Delete my comments started. Use liDelCmt.stop() to halt.
Found 3 of your comments
Deleting comment…
Finished. Deleted 3 comments.
```


