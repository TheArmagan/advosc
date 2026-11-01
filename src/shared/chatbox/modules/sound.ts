import type { ChatboxModuleOptions } from "../module-base";

export const soundOptions: ChatboxModuleOptions = {
  id: "Sound",
  name: "Sound",
  description: "Plays sounds from your Sound Effects library. Actions fire once when the condition turns true (or once when the placeholder shows up if there's no condition) and render as nothing.",
  examplePlaceholders: {
    "Play;SoundName;Condition": {
      value: "",
      description: "Plays a sound once when the optional condition turns true.",
      fillText: "Sound;Play;${1:soundName};${2:[[OSCData:/avatar/parameters/Booped]]}"
    },
    "Loop;SoundName;Condition": {
      value: "",
      description: "Loops a sound while the condition is true and stops it when the condition turns false or the placeholder goes away.",
      fillText: "Sound;Loop;${1:soundName};${2:[[OSCData:/avatar/parameters/Booped]]}"
    },
    "Stop;SoundName;Condition": {
      value: "",
      description: "Stops every playing copy of a sound when the optional condition turns true.",
      fillText: "Sound;Stop;${1:soundName};${2:condition}"
    },
    "StopAll;Condition": {
      value: "",
      description: "Stops every playing sound when the optional condition turns true.",
      fillText: "Sound;StopAll;${1:condition}"
    },
    "Volume;0-100;Condition": {
      value: "",
      description: "Sets the master volume when the optional condition turns true.",
      fillText: "Sound;Volume;${1:50};${2:condition}"
    },
    "IsPlaying;SoundName": {
      value: "false",
      description: "Returns 'true' while the sound is playing, 'false' otherwise.",
      fillText: "Sound;IsPlaying;${1:soundName}"
    },
    "Playing": {
      value: "boop, vine boom",
      description: "Names of the sounds playing right now, separated by commas.",
      fillText: "Sound;Playing"
    },
  }
};
