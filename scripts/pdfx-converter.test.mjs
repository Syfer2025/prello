import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildGsArgs,
  buildPdfxDef,
  convertPdfToPdfx,
  defaultOutputPath,
  findDefaultCmykIcc,
  findGhostscript,
  parseArgs,
  restorePdfPageBoxesFromSource,
} from './pdfx-converter.mjs';

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'prelo-pdfx-test-'));
  tempDirs.push(dir);
  return dir;
}

async function createPdfWithBoxes({ trimBox, bleedBox } = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  if (trimBox) page.setTrimBox(trimBox.x, trimBox.y, trimBox.width, trimBox.height);
  if (bleedBox) page.setBleedBox(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height);
  return pdf.save({ useObjectStreams: false });
}

describe('pdfx converter shared module', () => {
  it('keeps the verified Ghostscript PDF/X-1a argument set reusable outside the CLI', () => {
    const args = buildGsArgs({
      defPath: '/tmp/def.ps',
      inputPath: '/tmp/in.pdf',
      outputPath: '/tmp/out.pdf',
      iccPath: '/icc/cmyk.icc',
    });

    expect(args).toContain('-dPDFX=1');
    expect(args).not.toContain('-dBlackText=true');
    expect(args).not.toContain('-dBlackVector=true');
    expect(args).toContain('-sColorConversionStrategy=CMYK');
    expect(args).toContain('-sProcessColorModel=DeviceCMYK');
    expect(args).toContain('-sDEVICE=pdfwrite');
    expect(args).toContain('-sOutputFile=/tmp/out.pdf');
    expect(args).toContain('--permit-file-read=/icc/cmyk.icc');
    expect(args.indexOf('/tmp/def.ps')).toBeLessThan(args.indexOf('/tmp/in.pdf'));
  });

  it('exposes CLI-compatible argument parsing and default output naming', () => {
    expect(parseArgs(['in.pdf', 'out.pdf', '--gray'])).toMatchObject({
      input: 'in.pdf',
      output: 'out.pdf',
      gray: true,
    });
    expect(defaultOutputPath('/a/livro.pdf')).toBe('/a/livro-pdfx.pdf');
  });

  it('finds Ghostscript and the bundled CMYK ICC profile through injectable filesystem probes', () => {
    const root = tempDir();
    const gsPath = join(root, 'bin', 'gs');
    const iccPath = join(root, 'share', 'ghostscript', '10.07.0', 'iccprofiles', 'default_cmyk.icc');
    mkdirSync(join(root, 'bin'), { recursive: true });
    mkdirSync(join(root, 'share', 'ghostscript', '10.07.0', 'iccprofiles'), { recursive: true });
    writeFileSync(gsPath, '');
    writeFileSync(iccPath, '', { flag: 'w' });

    expect(findGhostscript(() => gsPath)).toBe(gsPath);
    expect(
      findDefaultCmykIcc(gsPath, {
        existsSync: (path) => path === root || path === join(root, 'share', 'ghostscript') || path === join(root, 'share', 'ghostscript', '10.07.0') || path === iccPath,
        readdirSync: () => ['10.07.0'],
        statSync: () => ({ isDirectory: () => true }),
        envIccPath: undefined,
      })
    ).toBe(iccPath);
  });

  it('restores print boxes from the source PDF after Ghostscript rewrites the PDF/X file', async () => {
    const sourcePdfBytes = await createPdfWithBoxes({
      bleedBox: { x: 10, y: 10, width: 180, height: 280 },
      trimBox: { x: 20, y: 20, width: 160, height: 260 },
    });
    const convertedPdfBytes = await createPdfWithBoxes();

    const restoredBytes = await restorePdfPageBoxesFromSource({
      sourcePdfBytes,
      convertedPdfBytes,
      pdfVersion: '1.3',
    });
    const restored = await PDFDocument.load(restoredBytes);
    const page = restored.getPage(0);

    expect(Buffer.from(restoredBytes).subarray(0, 8).toString()).toBe('%PDF-1.3');
    expect(page.getMediaBox()).toMatchObject({ x: 0, y: 0, width: 200, height: 300 });
    expect(page.getCropBox()).toMatchObject({ x: 0, y: 0, width: 200, height: 300 });
    expect(page.getBleedBox()).toMatchObject({ x: 10, y: 10, width: 180, height: 280 });
    expect(page.getTrimBox()).toMatchObject({ x: 20, y: 20, width: 160, height: 260 });
  });

  it('converts a vector PDF through an injected Ghostscript binary, preserves print boxes, and reports the output path', async () => {
    const dir = tempDir();
    const inputPath = join(dir, 'book.pdf');
    const outputPath = join(dir, 'book-pdfx.pdf');
    const iccPath = join(dir, 'press.icc');
    const gsPath = join(dir, 'gs-fake.mjs');
    const convertedByGsPath = join(dir, 'gs-output.pdf');

    writeFileSync(
      inputPath,
      await createPdfWithBoxes({
        bleedBox: { x: 10, y: 10, width: 180, height: 280 },
        trimBox: { x: 20, y: 20, width: 160, height: 260 },
      })
    );
    writeFileSync(convertedByGsPath, await createPdfWithBoxes());
    writeFileSync(iccPath, 'icc');
    writeFileSync(
      gsPath,
      `#!/usr/bin/env node
import { copyFileSync } from 'node:fs';
const outputArg = process.argv.find((arg) => arg.startsWith('-sOutputFile='));
if (!outputArg) process.exit(9);
copyFileSync(${JSON.stringify(convertedByGsPath)}, outputArg.slice('-sOutputFile='.length));
`
    );
    chmodSync(gsPath, 0o755);

    const result = await convertPdfToPdfx({ inputPath, outputPath, iccPath, gsPath });
    const output = await PDFDocument.load(readFileSync(outputPath));
    const page = output.getPage(0);

    expect(result).toMatchObject({
      outputPath,
      iccPath,
      usingGenericIcc: false,
      colorMode: 'CMYK',
    });
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath).subarray(0, 8).toString()).toBe('%PDF-1.3');
    expect(page.getBleedBox()).toMatchObject({ x: 10, y: 10, width: 180, height: 280 });
    expect(page.getTrimBox()).toMatchObject({ x: 20, y: 20, width: 160, height: 260 });
  });

  it('emits a PDF/X-1a OutputIntent def pointing at the chosen ICC', () => {
    const def = buildPdfxDef({ iccPath: '/icc/fogra39.icc', condition: 'Coated FOGRA39', conditionId: 'FOGRA39' });
    expect(def).toContain('/GTS_PDFXVersion (PDF/X-1a:2001)');
    expect(def).toContain('/ICCProfile (/icc/fogra39.icc) def');
    expect(def).toContain('/N 4');
    expect(def).toContain('/S /GTS_PDFX');
    expect(def).toContain('Coated FOGRA39');
  });
});
