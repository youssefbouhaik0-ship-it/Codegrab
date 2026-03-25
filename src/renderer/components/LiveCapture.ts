/**
 * LiveCapture — manages a live desktopCapturer MediaStream.
 *
 * Flow:
 *   1. Main process provides the screen source ID (via getScreenSourceId IPC).
 *   2. This class opens a getUserMedia stream using that source ID.
 *   3. Caller calls captureFrame() to get a JPEG dataURL of the current video frame.
 *   4. That dataURL is sent to main via sendFrameForOcr IPC for Tesseract processing.
 *
 * The "reframe interval" (how often we grab + OCR) is controlled by the caller,
 * not this class — keeping separation of concerns so it can be tuned independently.
 */
export class LiveCapture {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private _isRunning = false;

  constructor() {
    // Hidden video element — never rendered visibly
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.style.cssText =
      'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-1px;left:-1px;';
    document.body.appendChild(this.video);

    this.canvas = document.createElement('canvas');
    // Dimensions set on first capture once we know video size
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * Start the video stream using the desktopCapturer source ID from main.
   * Throws if getUserMedia fails (e.g. permission denied).
   */
  async start(sourceId: string): Promise<void> {
    this.stop(); // clean up any existing stream first

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        // @ts-expect-error — Electron/Chromium-specific constraint properties
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 5, // 5 fps is plenty for OCR; keeps GPU load minimal
        },
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;

    // Wait for video to be playable
    await new Promise<void>((resolve, reject) => {
      this.video.oncanplay = () => resolve();
      this.video.onerror = (e) => reject(new Error(`Video error: ${e}`));
      this.video.play().catch(reject);
    });

    this._isRunning = true;
  }

  /**
   * Capture the current video frame as a JPEG dataURL.
   * Returns null if the stream isn't running yet.
   */
  captureFrame(): string | null {
    if (!this._isRunning || this.video.readyState < 2) return null;

    // Resize canvas to match actual video dimensions on first call
    const vw = this.video.videoWidth  || 1920;
    const vh = this.video.videoHeight || 1080;
    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width  = vw;
      this.canvas.height = vh;
    }

    this.ctx.drawImage(this.video, 0, 0, vw, vh);
    // JPEG at 0.85 quality — good enough for OCR, much smaller than PNG
    return this.canvas.toDataURL('image/jpeg', 0.85);
  }

  stop(): void {
    this._isRunning = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.video.pause();
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  destroy(): void {
    this.stop();
    this.video.parentNode?.removeChild(this.video);
  }
}
