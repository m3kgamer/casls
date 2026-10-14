// Camera barcode reading. The library only extracts the number from the image;
// identification happens exclusively against the user's own Supabase `foods` table.
import { t } from './i18n.js';

export class BarcodeScanner {
  /**
   * @param {string} elementId id of the container element for the live preview
   * @param {{onDetect:(code:string)=>void, onError:(msg:string)=>void, onState?:(s:{running:boolean,torch:boolean})=>void}} cb
   */
  constructor(elementId, cb) {
    this.id = elementId;
    this.cb = cb;
    this.q = null;
    this.running = false;
    this.torchOn = false;
    this.handled = false;
  }

  async start() {
    if (this.running) return;
    const lib = window.Html5Qrcode;
    if (!lib) return this.cb.onError(t('scan.libMissing'));
    if (!window.isSecureContext) return this.cb.onError(t('scan.needHttps'));
    if (!navigator.mediaDevices?.getUserMedia) return this.cb.onError(t('scan.noCamera'));
    this.handled = false;
    const F = window.Html5QrcodeSupportedFormats;
    this.q = new lib(this.id, {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    try {
      await this.q.start(
        { facingMode: 'environment' }, // rear camera on phones
        { fps: 10, qrbox: (w, h) => ({ width: Math.floor(Math.min(w * 0.9, 340)), height: Math.floor(Math.min(h * 0.5, 160)) }), aspectRatio: 1.333 },
        (text) => {
          if (this.handled) return;
          this.handled = true;
          this.cb.onDetect(text);
        },
        () => {},
      );
      this.running = true;
      this.cb.onState?.({ running: true, torch: this.torchSupported() });
    } catch (e) {
      this.running = false;
      this.q = null;
      const name = e?.name || String(e);
      this.cb.onError(/NotAllowed|Permission/i.test(name + e) ? t('scan.denied')
        : /NotFound|Devices/i.test(name + e) ? t('scan.noCamera')
        : /NotReadable|Track/i.test(name + e) ? t('scan.busy') : t('scan.error'));
    }
  }

  torchSupported() {
    try { return !!this.q?.getRunningTrackCapabilities?.().torch; } catch { return false; }
  }

  async toggleTorch() {
    if (!this.running) return false;
    try {
      this.torchOn = !this.torchOn;
      await this.q.applyVideoConstraints({ advanced: [{ torch: this.torchOn }] });
      return this.torchOn;
    } catch {
      this.torchOn = false;
      this.cb.onError(t('scan.noTorch'));
      return false;
    }
  }

  async stop() {
    const q = this.q;
    this.q = null;
    this.running = false;
    this.torchOn = false;
    if (!q) return;
    try { await q.stop(); } catch { /* already stopped */ }
    try { q.clear(); } catch { /* ignore */ }
    this.cb.onState?.({ running: false, torch: false });
  }
}

/** Format check for barcodes: 6–14 digits (matches the database constraint). */
export function validBarcode(code) {
  return /^\d{6,14}$/.test(code);
}
