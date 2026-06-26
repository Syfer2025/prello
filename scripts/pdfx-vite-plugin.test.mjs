import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPdfxMiddleware } from './pdfx-vite-plugin.mjs';

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'prelo-pdfx-vite-test-'));
  tempDirs.push(dir);
  return dir;
}

function request({ method = 'POST', url = '/api/pdfx', body = '' } = {}) {
  const stream = Readable.from([Buffer.from(body)]);
  stream.method = method;
  stream.url = url;
  return stream;
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: Buffer.alloc(0),
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk = '') {
      this.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    },
  };
}

describe('pdfx Vite plugin middleware', () => {
  it('ignores unrelated routes', async () => {
    const next = vi.fn();
    const middleware = createPdfxMiddleware();

    await middleware(request({ url: '/x' }), response(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects non-POST requests on /api/pdfx', async () => {
    const res = response();
    const middleware = createPdfxMiddleware();

    await middleware(request({ method: 'GET' }), res, vi.fn());

    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('POST');
    expect(res.body.toString()).toContain('Method not allowed');
  });

  it('writes the uploaded vector PDF to a temp file and returns the converted PDF/X bytes', async () => {
    const workDir = tempDir();
    const convertPdfToPdfx = vi.fn(({ inputPath, outputPath }) => {
      expect(readFileSync(inputPath, 'utf8')).toBe('%PDF vector');
      writeFileSync(outputPath, '%PDF pdfx');
      return { outputPath, iccPath: '/icc/default_cmyk.icc', usingGenericIcc: true, colorMode: 'CMYK' };
    });
    const middleware = createPdfxMiddleware({
      convertPdfToPdfx,
      mkdtempSync: () => workDir,
    });
    const res = response();

    await middleware(request({ body: '%PDF vector' }), res, vi.fn());

    expect(convertPdfToPdfx).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('prelo-pdfx.pdf');
    expect(res.headers['x-prelo-pdfx-icc']).toBe('/icc/default_cmyk.icc');
    expect(res.headers['x-prelo-pdfx-generic-icc']).toBe('true');
    expect(res.body.toString()).toBe('%PDF pdfx');
    expect(existsSync(workDir)).toBe(false);
  });
});
