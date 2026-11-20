import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

export interface RenderQrOptions {
  canvas: HTMLCanvasElement;
  url: string;
  fgColor: string;
  bgColor: string;
  size?: number;
  includeLogo?: boolean;
  logoSrc?: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export async function renderQrToCanvas({
  canvas,
  url,
  fgColor,
  bgColor,
  size = 360,
  includeLogo = false,
  logoSrc,
}: RenderQrOptions): Promise<void> {
  await QRCode.toCanvas(canvas, url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: includeLogo && logoSrc ? 'H' : 'M',
    color: {
      dark: fgColor || '#0F172A',
      light: bgColor || '#FFFFFF',
    },
  });

  if (includeLogo && logoSrc) {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = await loadImage(logoSrc);
      const badgeSize = Math.round(size * 0.22);
      const x = Math.round((size - badgeSize) / 2);
      const y = Math.round((size - badgeSize) / 2);
      const pad = 6;
      const radius = 12;

      // White protective halo so QR stays reliably scannable
      ctx.save();
      ctx.fillStyle = bgColor || '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, badgeSize + pad * 2, badgeSize + pad * 2, radius);
      ctx.fill();

      ctx.beginPath();
      ctx.roundRect(x, y, badgeSize, badgeSize, Math.max(4, radius - 4));
      ctx.clip();
      ctx.drawImage(img, x, y, badgeSize, badgeSize);
      ctx.restore();
    } catch {
      // If logo fails to decode, keep valid scannable QR without overlay
    }
  }
}

export function downloadQrPng(canvas: HTMLCanvasElement, slug: string): void {
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `reviewflow-qr-${slug}.png`;
  link.href = dataUrl;
  link.click();
}

export async function downloadQrPdf(options: {
  businessName: string;
  category: string;
  welcomeMessage: string;
  reviewUrl: string;
  fgColor: string;
  bgColor: string;
  primaryColor: string;
  includeLogo: boolean;
  logoSrc?: string;
  slug: string;
}): Promise<void> {
  const offscreen = document.createElement('canvas');
  await renderQrToCanvas({
    canvas: offscreen,
    url: options.reviewUrl,
    fgColor: options.fgColor,
    bgColor: options.bgColor,
    size: 720,
    includeLogo: options.includeLogo,
    logoSrc: options.logoSrc,
  });

  const qrDataUrl = offscreen.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Clean framing border
  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(18, 20, pageWidth - 36, pageHeight - 40, 6, 6, 'FD');

  // Accent header strip
  const hex = options.primaryColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 15;
  const g = parseInt(hex.substring(2, 4), 16) || 118;
  const b = parseInt(hex.substring(4, 6), 16) || 110;
  pdf.setFillColor(r, g, b);
  pdf.roundedRect(18, 20, pageWidth - 36, 8, 3, 3, 'F');

  // Optional logo at top
  let cursorY = 42;
  if (options.logoSrc) {
    try {
      const img = await loadImage(options.logoSrc);
      const logoCanvas = document.createElement('canvas');
      logoCanvas.width = 240;
      logoCanvas.height = 240;
      const lCtx = logoCanvas.getContext('2d');
      if (lCtx) {
        lCtx.drawImage(img, 0, 0, 240, 240);
        const logoPng = logoCanvas.toDataURL('image/png');
        pdf.addImage(logoPng, 'PNG', (pageWidth - 26) / 2, cursorY, 26, 26);
        cursorY += 34;
      }
    } catch {
      cursorY += 4;
    }
  }

  // Business Name
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.text(options.businessName, pageWidth / 2, cursorY, { align: 'center', maxWidth: 150 });
  cursorY += 10;

  // Category subtitle
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(options.category, pageWidth / 2, cursorY, { align: 'center' });
  cursorY += 14;

  // Headline
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Scan to Share Your Experience', pageWidth / 2, cursorY, { align: 'center' });
  cursorY += 8;

  // Welcome message
  pdf.setTextColor(71, 85, 105);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  const welcomeLines = pdf.splitTextToSize(
    options.welcomeMessage || 'Tap a few quick options and get an instant review draft you can edit and post on Google.',
    140,
  );
  pdf.text(welcomeLines, pageWidth / 2, cursorY, { align: 'center' });
  cursorY += welcomeLines.length * 5 + 10;

  // QR Frame
  const qrSize = 86;
  const qrX = (pageWidth - qrSize) / 2;
  pdf.setDrawColor(226, 232, 240);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(qrX - 6, cursorY - 6, qrSize + 12, qrSize + 12, 4, 4, 'FD');
  pdf.addImage(qrDataUrl, 'PNG', qrX, cursorY, qrSize, qrSize);
  cursorY += qrSize + 18;

  // Instructions
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('1. Scan QR Code   ·   2. Tap Feedback   ·   3. Post on Google', pageWidth / 2, cursorY, {
    align: 'center',
  });
  cursorY += 9;

  // URL footer
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(9.5);
  pdf.text(options.reviewUrl, pageWidth / 2, cursorY, { align: 'center', maxWidth: 160 });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Powered by ReviewFlow', pageWidth / 2, pageHeight - 28, { align: 'center' });

  pdf.save(`reviewflow-poster-${options.slug}.pdf`);
}

export async function compressLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const compressed = canvas.toDataURL('image/png', 0.9);
        resolve(compressed);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
