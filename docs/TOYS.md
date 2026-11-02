[Back to the README](../README.md)

# Toy control

Off by default. ADVOSC doesn't connect to anything until you turn it on in Settings, and the Lovense page stays hidden until then. Turning it on asks you to set a panic hotkey that actually works and a max strength, which starts at 50%.

There are three ways to connect, and you can use more than one:

| Connection | What you need |
|------------|---------------|
| **Lovense Remote on this PC** | Lovense Remote running, with Game Mode on |
| **Lovense Remote on your phone** | Phone and PC on the same network, Game Mode on, then type in the IP and port it shows |
| **Intiface Central** | Intiface running on this PC. Also works with toys that aren't Lovense |

Toys are driven by automations, so anything ADVOSC can read can drive one. A **Live** rule can link an avatar float to strength, a **Once** rule can pulse for a few seconds, and rules can play Lovense's presets or your own patterns on one toy, several, or all of them.

Safety works like this:

- **Panic stop** is in the title bar, on the Lovense page, in the tray menu, on your hotkey, and available as a module input for VR. It stops everything and stays stopped until you re-arm. After a re-arm, rules that were running stay quiet until their value goes inactive once, so nothing jumps back on.
- **Max strength** applies to everything, including test buttons and patterns.
- **Commands run out by themselves.** Lovense toys get short commands that keep being renewed, so if ADVOSC crashes or your PC dies, the toy stops within a few seconds.
- **ADVOSC stops toys when VRChat closes.** If OSC goes quiet for a while it pauses Live and While rules and picks back up on the next message. Stopping on avatar change is optional.
- **Toy rules never leave your PC.** Share codes always strip them, and a share code someone gives you has them stripped again on import. Other rules from a share arrive turned off, and toy rules in an imported settings file arrive turned off too.

Intiface can't run a command for a limited time, so it's safer to set a ping time in Intiface Central. ADVOSC shows a warning if it isn't set.
