import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import type { WeeklyReport } from '../types';

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
  standLabel?: string;
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

  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(18, 20, pageWidth - 36, pageHeight - 40, 6, 6, 'FD');

  const hex = options.primaryColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 15;
  const g = parseInt(hex.substring(2, 4), 16) || 118;
  const b = parseInt(hex.substring(4, 6), 16) || 110;
  pdf.setFillColor(r, g, b);
  pdf.roundedRect(18, 20, pageWidth - 36, 8, 3, 3, 'F');

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

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.text(options.businessName, pageWidth / 2, cursorY, { align: 'center', maxWidth: 150 });
  cursorY += 9;

  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(
    options.standLabel ? `${options.category} · ${options.standLabel}` : options.category,
    pageWidth / 2,
    cursorY,
    { align: 'center', maxWidth: 155 },
  );
  cursorY += 13;

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Scan to Share Your Experience', pageWidth / 2, cursorY, { align: 'center' });
  cursorY += 8;

  pdf.setTextColor(71, 85, 105);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  const welcomeLines = pdf.splitTextToSize(
    options.welcomeMessage || 'Tap a few quick options and get an instant review draft you can edit and post on Google.',
    140,
  );
  pdf.text(welcomeLines, pageWidth / 2, cursorY, { align: 'center' });
  cursorY += welcomeLines.length * 5 + 10;

  const qrSize = 86;
  const qrX = (pageWidth - qrSize) / 2;
  pdf.setDrawColor(226, 232, 240);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(qrX - 6, cursorY - 6, qrSize + 12, qrSize + 12, 4, 4, 'FD');
  pdf.addImage(qrDataUrl, 'PNG', qrX, cursorY, qrSize, qrSize);
  cursorY += qrSize + 18;

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('1. Scan QR Code   ·   2. Tap Feedback   ·   3. Post on Google', pageWidth / 2, cursorY, {
    align: 'center',
  });
  cursorY += 9;

  pdf.setTextColor(100, 116, 139);
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(9.5);
  pdf.text(options.reviewUrl, pageWidth / 2, cursorY, { align: 'center', maxWidth: 160 });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Powered by ReviewFlow', pageWidth / 2, pageHeight - 28, { align: 'center' });

  const standSuffix = options.standLabel
    ? `-${options.standLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28)}`
    : '';
  pdf.save(`reviewflow-poster-${options.slug}${standSuffix}.pdf`);
}

export function downloadWeeklyReportPdf(report: WeeklyReport): void {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  pdf.setFillColor(15, 118, 110);
  pdf.roundedRect(margin, y, contentWidth, 24, 3, 3, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('ReviewFlow Weekly Performance Report', margin + 6, y + 10);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(
    `${report.businessName}  |  Week: ${report.weekStart} to ${report.weekEnd}`,
    margin + 6,
    y + 18,
  );
  y += 32;

  const drawSectionHeader = (title: string, subtitle: string) => {
    if (y > pageHeight - 40) {
      pdf.addPage();
      y = 18;
    }
    pdf.setFillColor(240, 253, 250);
    pdf.setDrawColor(204, 251, 241);
    pdf.roundedRect(margin, y, contentWidth, 12, 2, 2, 'FD');
    pdf.setTextColor(15, 118, 110);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, margin + 4, y + 5.5);
    pdf.setTextColor(71, 85, 105);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(subtitle, margin + 4, y + 10);
    y += 16;
  };

  const drawMetricGrid = (items: Array<{ label: string; value: string }>) => {
    const colWidth = (contentWidth - 6) / 3;
    for (let i = 0; i < items.length; i += 3) {
      if (y > pageHeight - 28) {
        pdf.addPage();
        y = 18;
      }
      const row = items.slice(i, i + 3);
      row.forEach((item, idx) => {
        const x = margin + idx * (colWidth + 3);
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(x, y, colWidth, 16, 2, 2, 'FD');
        pdf.setTextColor(100, 116, 139);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(item.label, x + 3, y + 5.5, { maxWidth: colWidth - 6 });
        pdf.setTextColor(15, 23, 42);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(item.value, x + 3, y + 12.5, { maxWidth: colWidth - 6 });
      });
      y += 19;
    }
  };

  const rg = report.reviewGenMetrics;
  drawSectionHeader(
    '1. Review Generation & In-Store QR Performance',
    'Funnel telemetry across active in-store QR stands and Google handoffs',
  );
  drawMetricGrid([
    { label: 'Total QR Scans', value: String(rg.totalScans) },
    { label: 'Unique Sessions', value: String(rg.uniqueSessions) },
    { label: 'Review Forms Started', value: String(rg.formsStarted) },
    { label: 'AI Drafts Generated', value: String(rg.draftsGenerated) },
    { label: 'Google Link Clicks', value: String(rg.googleRedirects) },
    {
      label: 'Confirmed Google Reviews',
      value: `${rg.confirmedGoogleReviews} (${rg.averageGoogleRating.toFixed(1)} avg)`,
    },
    {
      label: 'Best QR Stand',
      value: rg.bestStandName ? `${rg.bestStandName} (${rg.bestStandScans})` : 'N/A',
    },
    {
      label: 'Lowest QR Stand',
      value: rg.lowestStandName ? `${rg.lowestStandName} (${rg.lowestStandScans})` : 'N/A',
    },
  ]);

  const ar = report.autoReplyMetrics;
  drawSectionHeader(
    '2. Google Business Profile AI Auto Reply',
    'Sync volume, automated responses, and approval queue status',
  );
  drawMetricGrid([
    { label: 'New Google Reviews', value: String(ar.totalNewReviews) },
    { label: 'AI Replies Generated', value: String(ar.aiRepliesGenerated) },
    { label: 'Auto-Published (5-Star)', value: String(ar.autoPublished) },
    { label: 'Manually Approved', value: String(ar.manuallyApproved) },
    { label: 'Waiting Approval', value: String(ar.waitingApproval) },
    { label: 'Failed / Ignored', value: `${ar.failedReplies} failed · ${ar.ignoredReviews} ignored` },
  ]);

  const ai = report.aiUsageMetrics;
  drawSectionHeader(
    '3. AI Model Usage & Estimated Cost',
    'Exact provider, model breakdown, tokens processed, and estimated USD cost',
  );
  drawMetricGrid([
    { label: 'Total AI Requests', value: String(ai.totalRequests) },
    {
      label: 'Success / Failed',
      value: `${ai.successfulRequests} ok · ${ai.failedRequests} failed`,
    },
    {
      label: 'Tokens & Est. Cost',
      value: `${ai.totalTokens.toLocaleString()} tok · $${ai.estimatedCostUsd.toFixed(4)}`,
    },
  ]);

  if (ai.byModel.length > 0) {
    if (y > pageHeight - 36) {
      pdf.addPage();
      y = 18;
    }
    pdf.setFillColor(241, 245, 249);
    pdf.rect(margin, y, contentWidth, 8, 'F');
    pdf.setTextColor(71, 85, 105);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text('Provider', margin + 3, y + 5.5);
    pdf.text('Model ID', margin + 34, y + 5.5);
    pdf.text('Requests', margin + 96, y + 5.5);
    pdf.text('Tokens', margin + 124, y + 5.5);
    pdf.text('Est. Cost', margin + 154, y + 5.5);
    y += 9;

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(15, 23, 42);
    for (const row of ai.byModel) {
      if (y > pageHeight - 20) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(row.provider, margin + 3, y + 5);
      pdf.text(row.modelId, margin + 34, y + 5, { maxWidth: 58 });
      pdf.text(`${row.successCount}/${row.count}`, margin + 96, y + 5);
      pdf.text(row.totalTokens.toLocaleString(), margin + 124, y + 5);
      pdf.text(`$${row.estimatedCostUsd.toFixed(4)}`, margin + 154, y + 5);
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, y + 7.5, margin + contentWidth, y + 7.5);
      y += 8;
    }
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(148, 163, 184);
  pdf.text(
    `Generated by ReviewFlow  ·  Report Window ${report.weekStart} – ${report.weekEnd}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' },
  );

  pdf.save(`reviewflow-weekly-report-${report.businessId}-${report.weekStart}.pdf`);
}

const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;

export async function compressLogoFile(file: File): Promise<string> {
  if (!ALLOWED_LOGO_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Please upload a PNG, JPG, WebP, or GIF image (SVG is not permitted).');
  }
  if (file.size > MAX_LOGO_FILE_BYTES) {
    throw new Error('Logo image must be 5 MB or smaller.');
  }

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
