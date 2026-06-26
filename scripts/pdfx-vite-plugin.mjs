import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertPdfToPdfx } from './pdfx-converter.mjs';

const PDFX_ROUTE = '/api/pdfx';
const MAX_PDF_BYTES = 300 * 1024 * 1024;

export function preloPdfxPlugin() {
  return {
    name: 'prelo-pdfx-endpoint',
    configureServer(server) {
      const middleware = createPdfxMiddleware();
      server.middlewares.use((req, res, next) => {
        void middleware(req, res, next).catch((error) => {
          respondText(res, 500, error instanceof Error ? error.message : String(error));
        });
      });
    },
  };
}

export function createPdfxMiddleware({
  convertPdfToPdfx: convert = convertPdfToPdfx,
  mkdtempSync: makeTempDir = mkdtempSync,
} = {}) {
  return async function pdfxMiddleware(req, res, next) {
    if (requestPath(req) !== PDFX_ROUTE) {
      next();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      respondText(res, 405, 'Method not allowed');
      return;
    }

    const workDir = makeTempDir(join(tmpdir(), 'prelo-pdfx-api-'));
    const inputPath = join(workDir, 'prelo-vector.pdf');
    const outputPath = join(workDir, 'prelo-pdfx.pdf');

    try {
      const inputBytes = await readRequestBytes(req, MAX_PDF_BYTES);
      if (inputBytes.length === 0) {
        respondText(res, 400, 'Empty PDF upload');
        return;
      }

      writeFileSync(inputPath, inputBytes);
      const result = await convert({ inputPath, outputPath });
      const outputBytes = readFileSync(result.outputPath);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="prelo-pdfx.pdf"');
      res.setHeader('Content-Length', String(outputBytes.length));
      res.setHeader('X-Prelo-Pdfx-Icc', result.iccPath);
      res.setHeader('X-Prelo-Pdfx-Generic-Icc', String(result.usingGenericIcc));
      res.end(outputBytes);
    } catch (error) {
      respondText(res, 500, error instanceof Error ? error.message : String(error));
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  };
}

export async function readRequestBytes(req, maxBytes = MAX_PDF_BYTES) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error(`PDF upload exceeds ${maxBytes} bytes`);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function requestPath(req) {
  return new URL(req.url ?? '/', 'http://localhost').pathname;
}

function respondText(res, statusCode, text) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}
