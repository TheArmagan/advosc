[Back to the README](../README.md)

# Tray and backups

## Running in the tray

Closing the window sends ADVOSC to the tray, and everything keeps running with no window at all. To really quit, use **Quit** in the tray menu.

The tray menu also has **Start hidden**, which skips the window on launch. When an update has downloaded, a **Restart to update** item shows up there too.

ADVOSC doesn't use your GPU by default, so it takes up no video memory while you're in game. This matters because closing a window doesn't give video memory back on its own. If the window feels choppy, turn on **GPU acceleration** in Settings and restart.

## Backups

ADVOSC keeps a daily backup of your settings, seven days back. The first one is made after a day of use.

Settings > Backup has those, plus exporting everything to a file and restoring it. Exports include your API keys and tokens, so don't post them anywhere.

**Safety copies** are saved right before a restore or re-import replaces your data, so you can undo one. **Re-import from old version** runs the copy from an older ADVOSC again, if something went missing when you updated.
