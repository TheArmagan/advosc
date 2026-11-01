import { soundEngine } from "./engine";

export const soundEffects = {
  pickFiles: soundEngine.pickFiles,
  removeSound: soundEngine.removeSound,
  reload: soundEngine.reload,
  listAudioOutputs: soundEngine.listAudioOutputs,
  play: soundEngine.play,
  playRandom: soundEngine.playRandom,
  stop: soundEngine.stop,
  stopVoice: soundEngine.stopVoice,
  stopAll: soundEngine.stopAll,
};
