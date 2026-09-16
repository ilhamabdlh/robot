export class OtherAudioError extends Error {
  constructor(
    message: string,
    readonly code: "NO_AUDIO_TRACK" | "DENIED" | "FAILED",
  ) {
    super(message);
    this.name = "OtherAudioError";
  }
}

export type OtherAudioCapture = {
  displayStream: MediaStream;
  recordStream: MediaStream;
  getLevel: () => number;
  stop: () => void;
};

export async function captureOtherAudio(
  videoEl: HTMLVideoElement,
): Promise<OtherAudioCapture> {
  let displayStream: MediaStream;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 8, max: 15 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      preferCurrentTab: false,
      selfBrowserSurface: "exclude",
      systemAudio: "include",
      surfaceSwitching: "include",
    } as DisplayMediaStreamOptions);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new OtherAudioError(
        "Pilih tab meeting dibatalkan. Klik Hubungkan audio lawan lagi.",
        "DENIED",
      );
    }
    throw new OtherAudioError(
      "Gagal membuka share tab. Pakai Chrome/Edge, pilih tab Zoom/Meet, centang Share tab audio.",
      "FAILED",
    );
  }

  const audioTracks = displayStream.getAudioTracks();
  if (audioTracks.length === 0) {
    displayStream.getTracks().forEach((track) => track.stop());
    throw new OtherAudioError(
      "Tidak ada audio di share itu. Pilih tab Chrome (bukan jendela Zoom), lalu centang Share tab audio.",
      "NO_AUDIO_TRACK",
    );
  }

  for (const track of audioTracks) {
    track.enabled = true;
  }

  videoEl.srcObject = displayStream;
  videoEl.muted = true;
  videoEl.playsInline = true;
  await videoEl.play().catch(() => undefined);

  const videoTrack = displayStream.getVideoTracks()[0];
  if (videoTrack) {
    await videoTrack
      .applyConstraints({
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 8, max: 15 },
      })
      .catch(() => undefined);
  }

  const context = new AudioContext();
  if (context.state === "suspended") {
    await context.resume();
  }

  const source = context.createMediaStreamSource(new MediaStream(audioTracks));
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  const destination = context.createMediaStreamDestination();
  source.connect(analyser);
  analyser.connect(destination);

  const samples = new Uint8Array(analyser.fftSize);

  const recordStream =
    destination.stream.getAudioTracks().length > 0
      ? destination.stream
      : new MediaStream(audioTracks);

  return {
    displayStream,
    recordStream,
    getLevel() {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      return Math.sqrt(sum / samples.length);
    },
    stop() {
      displayStream.getTracks().forEach((track) => track.stop());
      void context.close();
      videoEl.srcObject = null;
    },
  };
}

export function otherAudioHint(code?: OtherAudioError["code"]) {
  if (code === "NO_AUDIO_TRACK") {
    return "Share jendela aplikasi atau seluruh layar di Mac biasanya tanpa suara. Pilih Chrome Tab meeting, centang Share tab audio.";
  }
  return "Supaya lawan terdengar: buka Zoom/Meet di tab Chrome, lalu share tab itu dan centang Share tab audio.";
}

export function microphoneErrorMessage(error: unknown) {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";

  if (name === "TimeoutError" || message.startsWith("TIMEOUT:")) {
    return "Izin mikrofon tidak muncul. Buka http://localhost:3000 (bukan IP 192.168...), klik gembok di address bar → Microphone → Allow. Di Mac: System Settings → Privacy & Security → Microphone, centang browser Anda.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Izin mikrofon ditolak. Klik ikon gembok di address bar → Site settings → Microphone → Allow, lalu klik Mulai mendengar lagi.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Mikrofon tidak ditemukan. Cek System Settings → Privacy & Security → Microphone.";
  }
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") {
    return "Mikrofon sedang dikunci aplikasi lain, atau permintaan izin dibatalkan. Tutup Zoom desktop, lalu coba lagi.";
  }
  if (name === "SecurityError") {
    return "Browser memblokir mikrofon. Buka http://localhost:3000 di Chrome, bukan file:// atau http://192.168.x.x.";
  }
  return message || "Gagal mengakses mikrofon.";
}

const MIC_TIMEOUT_MS = 10000;
const MIC_TIMEOUT_MESSAGE =
  "TIMEOUT: izin mikrofon tidak muncul dalam 10 detik.";

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const error = new Error(message);
      error.name = "TimeoutError";
      reject(error);
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sleep(ms: number) {
  return new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), ms);
  });
}

function isLanHostname(hostname: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return false;
  }
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.endsWith(".local");
}

async function requestMicrophoneStream() {
  // Jangan await permissions.query tanpa batas — di beberapa browser/Mac query ini bisa hang
  // dan UI stuck di "Menunggu izin" meskipun getUserMedia sebenarnya sudah siap.
  try {
    const permission = await Promise.race([
      navigator.permissions.query({ name: "microphone" as PermissionName }),
      sleep(400),
    ]);
    if (permission?.state === "denied") {
      throw new DOMException("Microphone permission denied", "NotAllowedError");
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") throw error;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    throw error;
  }
}

export async function captureMicrophone() {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error(
      "Mikrofon diblokir karena halaman tidak aman. Pakai http://localhost:3000, bukan http://192.168.x.x.",
    );
  }

  if (typeof window !== "undefined" && isLanHostname(window.location.hostname)) {
    throw new Error(
      "Mikrofon sering gagal di alamat IP jaringan. Buka http://localhost:3000 di Chrome, bukan http://192.168.x.x.",
    );
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Browser ini tidak mendukung mikrofon. Pakai Chrome atau Edge, dan buka lewat http://localhost:3000.",
    );
  }

  return withTimeout(requestMicrophoneStream(), MIC_TIMEOUT_MS, MIC_TIMEOUT_MESSAGE);
}
