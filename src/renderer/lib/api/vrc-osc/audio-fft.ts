import { writable, derived, get } from "svelte/store";

// FFT analysis results
export interface FFTData {
  // Raw FFT data (values between 0 and 255)
  frequencyData: Uint8Array<ArrayBuffer>;
  timeDomainData: Uint8Array<ArrayBuffer>;

  // Frequency bands (normalized between 0 and 1)
  subBass: number; // 20-60 Hz - Deep bass, lower part of the kick
  bass: number; // 60-250 Hz - Bass, kick drum
  lowMid: number; // 250-500 Hz - Low mids
  mid: number; // 500-2000 Hz - Mid frequencies, vocals
  highMid: number; // 2000-4000 Hz - Upper mids
  high: number; // 4000-8000 Hz - Treble
  brilliance: number; // 8000-20000 Hz - Brilliance

  // Monstercat-style logarithmic bands (0-1 range)
  bands: number[];
  bandCount: number;

  // Derived values
  kick: number; // Kick drum detection (subBass + bass combination)
  snare: number; // Snare detection (mid + highMid combination)
  hihat: number; // Hi-hat detection (high + brilliance)
  overall: number; // Overall sound level
  peak: number; // Highest frequency value
  peakFrequency: number; // Frequency of the highest peak in Hz
}

export interface AudioFFTConfig {
  fftSize: number; // FFT size (256, 512, 1024, 2048, etc.)
  smoothingTimeConstant: number; // Smoothing (0-1 range)
  minDecibels: number; // Minimum decibels
  maxDecibels: number; // Maximum decibels
  bandCount: number; // Monstercat-style band count (default 24)
  minFrequency: number; // Minimum frequency (Hz)
  maxFrequency: number; // Maximum frequency (Hz)
}

const defaultConfig: AudioFFTConfig = {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  minDecibels: -90,
  maxDecibels: -10,
  bandCount: 24,
  minFrequency: 20,
  maxFrequency: 20000,
};

const defaultFFTData: FFTData = {
  frequencyData: new Uint8Array(0),
  timeDomainData: new Uint8Array(0),
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  high: 0,
  brilliance: 0,
  bands: [],
  bandCount: 24,
  kick: 0,
  snare: 0,
  hihat: 0,
  overall: 0,
  peak: 0,
  peakFrequency: 0,
};

// Stores
export const audioFFTConfig = writable<AudioFFTConfig>(defaultConfig);
export const audioFFTData = writable<FFTData>(defaultFFTData);
export const audioFFTActive = writable<boolean>(false);
export const audioFFTError = writable<string | null>(null);
export const availableAudioDevices = writable<MediaDeviceInfo[]>([]);
export const selectedAudioDeviceId = writable<string | null>(null);

// Derived stores for easy access
export const kickValue = derived(audioFFTData, ($data) => $data.kick);
export const bassValue = derived(audioFFTData, ($data) => $data.bass);
export const subBassValue = derived(audioFFTData, ($data) => $data.subBass);
export const overallValue = derived(audioFFTData, ($data) => $data.overall);
export const bandsValue = derived(audioFFTData, ($data) => $data.bands);

// Internal state
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let animationFrameId: number | null = null;
let frequencyData: Uint8Array<ArrayBuffer> | null = null;
let timeDomainData: Uint8Array<ArrayBuffer> | null = null;

// Calculate the frequency band average
function getFrequencyRangeAverage(
  dataArray: Uint8Array,
  sampleRate: number,
  fftSize: number,
  lowFreq: number,
  highFreq: number
): number {
  const nyquist = sampleRate / 2;
  const lowIndex = Math.round((lowFreq / nyquist) * (dataArray.length - 1));
  const highIndex = Math.round((highFreq / nyquist) * (dataArray.length - 1));

  if (lowIndex >= highIndex || lowIndex < 0 || highIndex >= dataArray.length) {
    return 0;
  }

  let sum = 0;
  let count = 0;

  for (let i = lowIndex; i <= highIndex; i++) {
    sum += dataArray[i];
    count++;
  }

  return count > 0 ? sum / count / 255 : 0;
}

// Find the peak frequency
function findPeakFrequency(
  dataArray: Uint8Array,
  sampleRate: number
): { peak: number; frequency: number } {
  const nyquist = sampleRate / 2;
  let maxValue = 0;
  let maxIndex = 0;

  for (let i = 0; i < dataArray.length; i++) {
    if (dataArray[i] > maxValue) {
      maxValue = dataArray[i];
      maxIndex = i;
    }
  }

  const frequency = (maxIndex / dataArray.length) * nyquist;
  return { peak: maxValue / 255, frequency };
}

// Calculate Monstercat-style logarithmic bands
function calculateLogarithmicBands(
  dataArray: Uint8Array<ArrayBuffer>,
  sampleRate: number,
  bandCount: number,
  minFreq: number,
  maxFreq: number
): number[] {
  const nyquist = sampleRate / 2;
  const bands: number[] = new Array(bandCount).fill(0);

  // Logarithmic frequency distribution (Monstercat style)
  // Narrower bands at low frequencies, wider bands at high frequencies
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const logStep = (logMax - logMin) / bandCount;

  for (let i = 0; i < bandCount; i++) {
    // Frequency range for this band
    const freqLow = Math.pow(10, logMin + logStep * i);
    const freqHigh = Math.pow(10, logMin + logStep * (i + 1));

    // FFT bin indices
    const indexLow = Math.floor((freqLow / nyquist) * dataArray.length);
    const indexHigh = Math.ceil((freqHigh / nyquist) * dataArray.length);

    // Safe bounds
    const safeIndexLow = Math.max(0, Math.min(indexLow, dataArray.length - 1));
    const safeIndexHigh = Math.max(safeIndexLow + 1, Math.min(indexHigh, dataArray.length));

    // Take the maximum value in this range (instead of average - more reactive)
    let maxVal = 0;
    let sum = 0;
    let count = 0;

    for (let j = safeIndexLow; j < safeIndexHigh; j++) {
      const val = dataArray[j];
      if (val > maxVal) maxVal = val;
      sum += val;
      count++;
    }

    // Blend max and average for a more natural look
    const avg = count > 0 ? sum / count : 0;
    const mixed = maxVal * 0.7 + avg * 0.3;

    // Normalize (0-1)
    bands[i] = mixed / 255;
  }

  return bands;
}

// Analyze FFT data
function analyzeFFTData(): FFTData {
  if (!analyser || !frequencyData || !timeDomainData || !audioContext) {
    return defaultFFTData;
  }

  analyser.getByteFrequencyData(frequencyData);
  analyser.getByteTimeDomainData(timeDomainData);

  const sampleRate = audioContext.sampleRate;
  const fftSize = analyser.fftSize;

  // Frequency bands
  const subBass = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 20, 60);
  const bass = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 60, 250);
  const lowMid = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 250, 500);
  const mid = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 500, 2000);
  const highMid = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 2000, 4000);
  const high = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 4000, 8000);
  const brilliance = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 8000, 20000);

  // Derived values
  const kick = Math.min(1, (subBass * 0.6 + bass * 0.4) * 1.5); // Kick usually lives in subBass + bass
  const snare = Math.min(1, (mid * 0.4 + highMid * 0.6) * 1.3); // Snare lives in upper mids
  const hihat = Math.min(1, (high * 0.5 + brilliance * 0.5) * 1.2); // Hi-hat lives in high frequencies

  // Overall level
  let overallSum = 0;
  for (let i = 0; i < frequencyData.length; i++) {
    overallSum += frequencyData[i];
  }
  const overall = overallSum / frequencyData.length / 255;

  // Peak
  const { peak, frequency: peakFrequency } = findPeakFrequency(frequencyData, sampleRate);

  // Monstercat-style bands
  const config = get(audioFFTConfig);
  const bands = calculateLogarithmicBands(
    frequencyData,
    sampleRate,
    config.bandCount,
    config.minFrequency,
    config.maxFrequency
  );

  return {
    frequencyData: new Uint8Array(frequencyData),
    timeDomainData: new Uint8Array(timeDomainData),
    subBass,
    bass,
    lowMid,
    mid,
    highMid,
    high,
    brilliance,
    bands,
    bandCount: config.bandCount,
    kick,
    snare,
    hihat,
    overall,
    peak,
    peakFrequency,
  };
}

// Analysis loop
function analysisLoop() {
  if (!get(audioFFTActive)) {
    return;
  }

  const data = analyzeFFTData();
  audioFFTData.set(data);

  animationFrameId = requestAnimationFrame(analysisLoop);
}

// List available audio devices
export async function listAudioDevices(): Promise<MediaDeviceInfo[]> {
  try {
    // Request permission first (required to list devices)
    await navigator.mediaDevices.getUserMedia({ audio: true });

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === "audioinput");

    availableAudioDevices.set(audioInputs);
    return audioInputs;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list audio devices";
    audioFFTError.set(message);
    return [];
  }
}

// Start microphone FFT
export async function startAudioFFT(deviceId?: string): Promise<boolean> {
  try {
    // Clean up the previous session
    await stopAudioFFT();

    audioFFTError.set(null);

    // Create audio context
    audioContext = new AudioContext();

    // Request microphone access
    const constraints: MediaStreamConstraints = {
      audio: deviceId
        ? { deviceId: { exact: deviceId } }
        : {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
    };

    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    if (deviceId) {
      selectedAudioDeviceId.set(deviceId);
    }

    // Create analyser
    const config = get(audioFFTConfig);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = config.fftSize;
    analyser.smoothingTimeConstant = config.smoothingTimeConstant;
    analyser.minDecibels = config.minDecibels;
    analyser.maxDecibels = config.maxDecibels;

    // Create data arrays
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    timeDomainData = new Uint8Array(analyser.frequencyBinCount);

    // Connect microphone
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(analyser);

    // Start analysis
    audioFFTActive.set(true);
    analysisLoop();

    console.log("[AudioFFT] Started", {
      sampleRate: audioContext.sampleRate,
      fftSize: analyser.fftSize,
      frequencyBinCount: analyser.frequencyBinCount,
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Microphone access failed";
    audioFFTError.set(message);
    console.error("[AudioFFT] Error:", error);
    await stopAudioFFT();
    return false;
  }
}

// Stop microphone FFT
export async function stopAudioFFT(): Promise<void> {
  audioFFTActive.set(false);

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (analyser) {
    analyser.disconnect();
    analyser = null;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }

  frequencyData = null;
  timeDomainData = null;

  audioFFTData.set(defaultFFTData);

  console.log("[AudioFFT] Stopped");
}

// Update settings
export function updateAudioFFTConfig(newConfig: Partial<AudioFFTConfig>): void {
  audioFFTConfig.update((current) => {
    const updated = { ...current, ...newConfig };

    // If the analyser exists, apply updated settings
    if (analyser) {
      if (newConfig.fftSize !== undefined) {
        analyser.fftSize = updated.fftSize;
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        timeDomainData = new Uint8Array(analyser.frequencyBinCount);
      }
      if (newConfig.smoothingTimeConstant !== undefined) {
        analyser.smoothingTimeConstant = updated.smoothingTimeConstant;
      }
      if (newConfig.minDecibels !== undefined) {
        analyser.minDecibels = updated.minDecibels;
      }
      if (newConfig.maxDecibels !== undefined) {
        analyser.maxDecibels = updated.maxDecibels;
      }
    }

    return updated;
  });
}

// Check whether it is active
export function isAudioFFTActive(): boolean {
  return get(audioFFTActive);
}

// Get an FFT snapshot without subscribing to the store
export function getAudioFFTSnapshot(): FFTData {
  return get(audioFFTData);
}

// Get the value of a specific frequency range
export function getFrequencyRange(lowFreq: number, highFreq: number): number {
  if (!analyser || !frequencyData || !audioContext) {
    return 0;
  }

  analyser.getByteFrequencyData(frequencyData);
  return getFrequencyRangeAverage(
    frequencyData,
    audioContext.sampleRate,
    analyser.fftSize,
    lowFreq,
    highFreq
  );
}

// Threshold-based beat detection check
export function isBeatDetected(
  type: "kick" | "snare" | "hihat" | "bass",
  threshold: number = 0.7
): boolean {
  const data = get(audioFFTData);
  switch (type) {
    case "kick":
      return data.kick > threshold;
    case "snare":
      return data.snare > threshold;
    case "hihat":
      return data.hihat > threshold;
    case "bass":
      return data.bass > threshold;
    default:
      return false;
  }
}

export const audioFFT = {
  start: startAudioFFT,
  stop: stopAudioFFT,
  listDevices: listAudioDevices,
  updateConfig: updateAudioFFTConfig,
  isActive: isAudioFFTActive,
  getSnapshot: getAudioFFTSnapshot,
  getFrequencyRange: getFrequencyRange,
  isBeatDetected: isBeatDetected,
  bandsValue,
  kickValue,
  bassValue,
  subBassValue,
  overallValue,
}