// utils/barcodeReader.ts
//
// Reads a product barcode (UPC-A, UPC-E, EAN-13, EAN-8, Code 128) from a still photo, on the
// phone, offline: the open-source ZXing decoder inside html5-qrcode (already a dependency). It is
// loaded only when first used, so it does not slow down the app's start. It reads one barcode per
// photo, the clearest one; it does not recognise packaging, flavors or how many items there are.
let reader: Promise<{ scan: (file: File) => Promise<string | null> }> | null = null;

const load = () =>
  (reader ??= import('html5-qrcode').then(({ Html5Qrcode, Html5QrcodeSupportedFormats: F }) => {
    let holder = document.getElementById('deli-barcode-reader');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'deli-barcode-reader';
      holder.style.display = 'none';
      document.body.appendChild(holder);
    }
    const decoder = new Html5Qrcode('deli-barcode-reader', {
      verbose: false,
      formatsToSupport: [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8, F.CODE_128],
      useBarCodeDetectorIfSupported: false,
    });
    return {
      scan: async (file: File) => {
        try {
          const result = await decoder.scanFileV2(file, false);
          return result.decodedText.replace(/\D/g, '') || null;
        } catch {
          return null; // nothing readable in this photo
        } finally {
          try {
            decoder.clear();
          } catch {
            // already clear
          }
        }
      },
    };
  }));

/** The barcode digits in this photo, or null when none can be read. */
export const readBarcode = async (image: File | string): Promise<string | null> => {
  const file =
    typeof image === 'string'
      ? new File([await (await fetch(image)).blob()], 'photo.jpg', { type: 'image/jpeg' })
      : image;
  return (await load()).scan(file);
};
