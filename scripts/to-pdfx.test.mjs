import { describe, expect, it } from 'vitest';
import {
  buildGsArgs,
  buildPdfxDef,
  defaultOutputPath,
  parseArgs,
} from './to-pdfx.mjs';

describe('to-pdfx CLI helpers', () => {
  it('builds the verified Ghostscript PDF/X-1a argument set (CMYK, pure-K black)', () => {
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
    // def antes do input (ordem importa para o gs aplicar o pdfmark antes de processar).
    expect(args.indexOf('/tmp/def.ps')).toBeLessThan(args.indexOf('/tmp/in.pdf'));
  });

  it('switches to Gray device for a black-and-white interior', () => {
    const args = buildGsArgs({ defPath: 'd', inputPath: 'i', outputPath: 'o', gray: true });
    expect(args).toContain('-sColorConversionStrategy=Gray');
    expect(args).toContain('-sProcessColorModel=DeviceGray');
  });

  it('emits a PDF/X-1a OutputIntent def pointing at the chosen ICC', () => {
    const def = buildPdfxDef({ iccPath: '/icc/fogra39.icc', condition: 'Coated FOGRA39', conditionId: 'FOGRA39' });
    expect(def).toContain('/GTS_PDFXVersion (PDF/X-1a:2001)');
    expect(def).toContain('/ICCProfile (/icc/fogra39.icc) def');
    expect(def).toContain('/N 4');
    expect(def).toContain('/S /GTS_PDFX');
    expect(def).toContain('Coated FOGRA39');
  });

  it('parses positional paths and flags', () => {
    expect(parseArgs(['in.pdf', 'out.pdf', '--gray'])).toMatchObject({
      input: 'in.pdf',
      output: 'out.pdf',
      gray: true,
    });
    expect(parseArgs(['in.pdf', '--icc', 'p.icc', '--condition', 'X'])).toMatchObject({
      input: 'in.pdf',
      icc: 'p.icc',
      condition: 'X',
    });
  });

  it('derives a -pdfx.pdf output name from the input', () => {
    expect(defaultOutputPath('/a/livro.pdf')).toBe('/a/livro-pdfx.pdf');
    expect(defaultOutputPath('/a/LIVRO.PDF')).toBe('/a/LIVRO-pdfx.pdf');
  });
});
