import { writable, derived, get } from "svelte/store";

// FFT Analiz Sonuçları
export interface FFTData {
  // Ham FFT verisi (0-255 arası değerler)
  frequencyData: Uint8Array<ArrayBuffer>;
  timeDomainData: Uint8Array<ArrayBuffer>;

  // Frekans bantları (0-1 arası normalize edilmiş)
  subBass: number; // 20-60 Hz - Derin bass, kick'in alt kısmı
  bass: number; // 60-250 Hz - Bass, kick drum
  lowMid: number; // 250-500 Hz - Alt orta
  mid: number; // 500-2000 Hz - Orta frekanslar, vokal
  highMid: number; // 2000-4000 Hz - Üst orta
  high: number; // 4000-8000 Hz - Tiz
  brilliance: number; // 8000-20000 Hz - Parlaklık

  // Monstercat tarzı logaritmik bantlar (0-1 arası)
  bands: number[];
  bandCount: number;

  // Özel değerler
  kick: number; // Kick drum algılama (subBass + bass kombinasyonu)
  snare: number; // Snare algılama (mid + highMid kombinasyonu)
  hihat: number; // Hi-hat algılama (high + brilliance)
  overall: number; // Genel ses seviyesi
  peak: number; // En yüksek frekans değeri
  peakFrequency: number; // En yüksek frekansın Hz değeri
}

export interface AudioFFTConfig {
  fftSize: number; // FFT boyutu (256, 512, 1024, 2048, vb.)
  smoothingTimeConstant: number; // Yumuşatma (0-1 arası)
  minDecibels: number; // Minimum desibel
  maxDecibels: number; // Maximum desibel
  bandCount: number; // Monstercat tarzı bant sayısı (varsayılan 24)
  minFrequency: number; // Minimum frekans (Hz)
  maxFrequency: number; // Maximum frekans (Hz)
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

// Frekans bandını hesapla
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

// Peak frekansı bul
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

// Monstercat tarzı logaritmik bantları hesapla
function calculateLogarithmicBands(
  dataArray: Uint8Array<ArrayBuffer>,
  sampleRate: number,
  bandCount: number,
  minFreq: number,
  maxFreq: number
): number[] {
  const nyquist = sampleRate / 2;
  const bands: number[] = new Array(bandCount).fill(0);

  // Logaritmik frekans dağılımı (Monstercat tarzı)
  // Düşük frekanslarda daha dar bantlar, yüksekte daha geniş
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const logStep = (logMax - logMin) / bandCount;

  for (let i = 0; i < bandCount; i++) {
    // Bu bant için frekans aralığı
    const freqLow = Math.pow(10, logMin + logStep * i);
    const freqHigh = Math.pow(10, logMin + logStep * (i + 1));

    // FFT bin indeksleri
    const indexLow = Math.floor((freqLow / nyquist) * dataArray.length);
    const indexHigh = Math.ceil((freqHigh / nyquist) * dataArray.length);

    // Güvenli sınırlar
    const safeIndexLow = Math.max(0, Math.min(indexLow, dataArray.length - 1));
    const safeIndexHigh = Math.max(safeIndexLow + 1, Math.min(indexHigh, dataArray.length));

    // Bu aralıktaki maksimum değeri al (ortalama yerine - daha reaktif)
    let maxVal = 0;
    let sum = 0;
    let count = 0;

    for (let j = safeIndexLow; j < safeIndexHigh; j++) {
      const val = dataArray[j];
      if (val > maxVal) maxVal = val;
      sum += val;
      count++;
    }

    // Maksimum ve ortalamayı karıştır (daha doğal görünüm)
    const avg = count > 0 ? sum / count : 0;
    const mixed = maxVal * 0.7 + avg * 0.3;

    // Normalize et (0-1)
    bands[i] = mixed / 255;
  }

  return bands;
}

// FFT verisini analiz et
function analyzeFFTData(): FFTData {
  if (!analyser || !frequencyData || !timeDomainData || !audioContext) {
    return defaultFFTData;
  }

  analyser.getByteFrequencyData(frequencyData);
  analyser.getByteTimeDomainData(timeDomainData);

  const sampleRate = audioContext.sampleRate;
  const fftSize = analyser.fftSize;

  // Frekans bantları
  const subBass = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 20, 60);
  const bass = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 60, 250);
  const lowMid = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 250, 500);
  const mid = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 500, 2000);
  const highMid = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 2000, 4000);
  const high = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 4000, 8000);
  const brilliance = getFrequencyRangeAverage(frequencyData, sampleRate, fftSize, 8000, 20000);

  // Özel değerler
  const kick = Math.min(1, (subBass * 0.6 + bass * 0.4) * 1.5); // Kick genelde subBass + bass
  const snare = Math.min(1, (mid * 0.4 + highMid * 0.6) * 1.3); // Snare orta-üst frekanslarda
  const hihat = Math.min(1, (high * 0.5 + brilliance * 0.5) * 1.2); // Hi-hat yüksek frekanslarda

  // Genel seviye
  let overallSum = 0;
  for (let i = 0; i < frequencyData.length; i++) {
    overallSum += frequencyData[i];
  }
  const overall = overallSum / frequencyData.length / 255;

  // Peak
  const { peak, frequency: peakFrequency } = findPeakFrequency(frequencyData, sampleRate);

  // Monstercat tarzı bantlar
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

// Analiz döngüsü
function analysisLoop() {
  if (!get(audioFFTActive)) {
    return;
  }

  const data = analyzeFFTData();
  audioFFTData.set(data);

  animationFrameId = requestAnimationFrame(analysisLoop);
}

// Mevcut ses cihazlarını listele
export async function listAudioDevices(): Promise<MediaDeviceInfo[]> {
  try {
    // Önce izin al (cihaz listesi için gerekli)
    await navigator.mediaDevices.getUserMedia({ audio: true });

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === "audioinput");

    availableAudioDevices.set(audioInputs);
    return audioInputs;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ses cihazları listelenemedi";
    audioFFTError.set(message);
    return [];
  }
}

// Mikrofon FFT'yi başlat
export async function startAudioFFT(deviceId?: string): Promise<boolean> {
  try {
    // Önceki oturumu temizle
    await stopAudioFFT();

    audioFFTError.set(null);

    // Audio Context oluştur
    audioContext = new AudioContext();

    // Mikrofon erişimi al
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

    // Analyser oluştur
    const config = get(audioFFTConfig);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = config.fftSize;
    analyser.smoothingTimeConstant = config.smoothingTimeConstant;
    analyser.minDecibels = config.minDecibels;
    analyser.maxDecibels = config.maxDecibels;

    // Veri dizilerini oluştur
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    timeDomainData = new Uint8Array(analyser.frequencyBinCount);

    // Mikrofonu bağla
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(analyser);

    // Analizi başlat
    audioFFTActive.set(true);
    analysisLoop();

    console.log("[AudioFFT] Başlatıldı", {
      sampleRate: audioContext.sampleRate,
      fftSize: analyser.fftSize,
      frequencyBinCount: analyser.frequencyBinCount,
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mikrofon erişimi başarısız";
    audioFFTError.set(message);
    console.error("[AudioFFT] Hata:", error);
    await stopAudioFFT();
    return false;
  }
}

// Mikrofon FFT'yi durdur
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

  console.log("[AudioFFT] Durduruldu");
}

// Ayarları güncelle
export function updateAudioFFTConfig(newConfig: Partial<AudioFFTConfig>): void {
  audioFFTConfig.update((current) => {
    const updated = { ...current, ...newConfig };

    // Eğer analyser varsa, ayarları uygula
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

// Aktif mi kontrol et
export function isAudioFFTActive(): boolean {
  return get(audioFFTActive);
}

// Anlık FFT verisi al (store subscribe etmeden)
export function getAudioFFTSnapshot(): FFTData {
  return get(audioFFTData);
}

// Belirli bir frekans aralığının değerini al
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

// Beat detection için threshold bazlı kontrol
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