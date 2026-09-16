export class ScreenCaptureError extends Error {
  constructor(
    message: string,
    readonly code: "DENIED" | "FAILED" | "NO_FRAME",
  ) {
    super(message);
    this.name = "ScreenCaptureError";
  }
}

function waitForVideoFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (error?: ScreenCaptureError) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      if (error) reject(error);
      else resolve();
    };

    const timeout = window.setTimeout(() => {
      finish(
        new ScreenCaptureError(
          "Tab lawan terhubung tapi belum ada gambar. Pastikan yang dishare adalah tab Chrome, bukan jendela aplikasi.",
          "NO_FRAME",
        ),
      );
    }, 5000);

    const poll = window.setInterval(() => {
      if (video.videoWidth >= 2 && video.videoHeight >= 2) finish();
    }, 50);

    if (video.videoWidth >= 2 && video.videoHeight >= 2) {
      finish();
      return;
    }

    video.addEventListener(
      "loadeddata",
      () => {
        if (video.videoWidth >= 2 && video.videoHeight >= 2) finish();
      },
      { once: true },
    );
  });
}

function frameToJpeg(video: HTMLVideoElement) {
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new ScreenCaptureError("Gagal membaca frame layar.", "NO_FRAME");
  }
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export async function captureFrameFromVideo(video: HTMLVideoElement | null) {
  if (!video?.srcObject) {
    throw new ScreenCaptureError(
      "Tab lawan belum terhubung. Klik Hubungkan audio lawan, pilih tab yang sama, lalu Analisis layar.",
      "FAILED",
    );
  }

  if (video.paused) {
    await video.play().catch(() => undefined);
  }

  await waitForVideoFrame(video);
  return frameToJpeg(video);
}
