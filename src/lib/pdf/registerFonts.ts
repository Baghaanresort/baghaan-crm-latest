import path from 'node:path';
import { Font } from '@react-pdf/renderer';

// Bundled static TTFs (see src/lib/pdf/fonts). Registered once per server
// process. next.config's outputFileTracingIncludes ensures these files are
// traced into the serverless function for the /api/pdf/* routes.
const dir = path.join(process.cwd(), 'src', 'lib', 'pdf', 'fonts');

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: 'Lora',
    fonts: [
      { src: path.join(dir, 'Lora_400Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'Lora_400Regular_Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: path.join(dir, 'Lora_500Medium.ttf'), fontWeight: 500 },
      { src: path.join(dir, 'Lora_600SemiBold.ttf'), fontWeight: 600 },
    ],
  });

  Font.register({
    family: 'Cormorant Garamond',
    fonts: [
      { src: path.join(dir, 'CormorantGaramond_600SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(dir, 'CormorantGaramond_700Bold.ttf'), fontWeight: 700 },
    ],
  });

  // Keep Indian amount words / numbers on one piece — disable hyphenation.
  Font.registerHyphenationCallback(word => [word]);

  registered = true;
}
