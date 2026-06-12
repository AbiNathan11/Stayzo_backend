import sharp from 'sharp';

/**
 * Adds a semi-transparent watermark text to a base64-encoded image to prevent misuse.
 * Returns the watermarked image as a base64 data URL.
 */
export async function watermarkImage(base64DataUrl: string): Promise<string> {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:image/')) {
    return base64DataUrl;
  }

  try {
    const parts = base64DataUrl.split(';base64,');
    if (parts.length !== 2) {
      return base64DataUrl;
    }

    const mimeType = parts[0].replace('data:', ''); // e.g., image/png, image/jpeg
    const base64Content = parts[1];
    const imageBuffer = Buffer.from(base64Content, 'base64');

    // Get image dimensions to scale watermark SVG
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;

    // Create an SVG watermark overlay matching dimensions
    const fontSize = Math.max(16, Math.floor(width / 18));
    const strokeWidth = Math.max(1, Math.floor(width / 600));
    
    // Diagonal text overlay
    const svgWatermark = `
      <svg width="${width}" height="${height}">
        <style>
          .watermark-txt {
            fill: rgba(255, 255, 255, 0.45);
            stroke: rgba(0, 0, 0, 0.35);
            stroke-width: ${strokeWidth}px;
            font-family: Arial, sans-serif;
            font-size: ${fontSize}px;
            font-weight: 900;
            text-anchor: middle;
            letter-spacing: 2px;
          }
        </style>
        <text 
          x="${width / 2}" 
          y="${height / 2}" 
          transform="rotate(-28 ${width / 2} ${height / 2})" 
          class="watermark-txt"
        >
          STAYZO ONLY - FOR VERIFICATION
        </text>
      </svg>
    `;

    const watermarkedBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: Buffer.from(svgWatermark),
          top: 0,
          left: 0,
        }
      ])
      .toBuffer();

    return `data:${mimeType};base64,${watermarkedBuffer.toString('base64')}`;
  } catch (err) {
    console.error('Failed to watermark image, falling back to original:', err);
    return base64DataUrl;
  }
}
