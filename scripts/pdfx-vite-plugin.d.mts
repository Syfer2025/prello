import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

interface PdfxConversionResult {
  outputPath: string;
  iccPath: string;
  usingGenericIcc: boolean;
  colorMode: 'CMYK' | 'Gray';
}

interface PdfxMiddlewareOptions {
  convertPdfToPdfx?: (options: { inputPath: string; outputPath: string }) => PdfxConversionResult | Promise<PdfxConversionResult>;
  mkdtempSync?: (prefix: string) => string;
}

export function preloPdfxPlugin(): Plugin;

export function createPdfxMiddleware(
  options?: PdfxMiddlewareOptions
): (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>;

export function readRequestBytes(req: AsyncIterable<Buffer | string>, maxBytes?: number): Promise<Buffer>;
