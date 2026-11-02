[Back to the README](../README.md)

# Toy control

This controls a real device on someone's body, so I'd rather tell you exactly how it behaves than promise it's perfect.

It's off by default. ADVOSC doesn't connect to anything until you turn it on in Settings, and the Lovense page stays hidden until then. Turning it on asks you to set a panic hotkey that actually works and a max strength, which starts at 50%.

There are three ways to connect, and you can use more than one:

| Connection | What you need |
|------------|---------------|
| **Lovense Remote on this PC** | Lovense Remote running, with Game Mode and Enable LAN on |
| **Lovense Remote on your phone** | Phone and PC on the same network, Game Mode and Enable LAN on, then type in the IP and port it shows |
| **Intiface Central** | Intiface running on this PC. Also works with toys that aren't Lovense |

Toys are driven by automations, so anything ADVOSC can read can drive one. A **Live** rule can have a toy follow an avatar float, a **Once** rule can pulse for a few seconds, and rules can play Lovense's presets or your own patterns on one toy, several, or all of them. There's also a **Stop** action.

Max strength also limits how on/off devices behave: anything set below 100% keeps them off, because they have no in-between.

## Safety

- **Panic stop** is in the title bar, on the Lovense page, on your hotkey, and available as a module input for VR. Once toy control is on, it's in the tray menu too. It stops everything and stays stopped until you re-arm. After a re-arm, rules that were running stay quiet until their value goes inactive once, so nothing jumps back on.
- **Max strength** applies to everything, including test buttons and patterns.
- **Commands run out by themselves.** Lovense toys get short commands that keep being renewed, so if ADVOSC crashes or your PC dies, the toy stops within a few seconds.
- **ADVOSC stops toys when VRChat closes.** If OSC goes quiet it pauses Live and While rules, then picks back up on the next message. That wait is **Pause after silence**, 120 seconds by default, and 0 turns it off. Stopping on avatar change is optional.
- **If the app keeps crashing**, it restarts in safe mode with toys, automations and the chatbox loop off, so you can still reach the window.
- **Toy rules never leave your PC in a share.** Share codes always strip them, and a share code someone gives you has them stripped again on import. Other rules from a share arrive turned off, and toy rules in an imported settings file arrive turned off too.

## What's been tested

I've tested the Lovense side on a real toy.

Intiface is different, and you should know this before you use it. Intiface can't run a command for a limited time, so ADVOSC can't make a command expire the way it does with Lovense. If ADVOSC dies, it's relying on the connection closing, and I haven't confirmed that Intiface stops devices when that happens.

So with Intiface, set a ping time in Intiface Central. ADVOSC shows a warning if you haven't. Keep your toy's own controls within reach too.
