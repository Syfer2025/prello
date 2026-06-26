#!/usr/bin/env node
/**
 * to-pdfx — converte o PDF VETORIAL do Prelo (RGB, saído de exportCanvasVectorPdf)
 * em PDF/X-1a CMYK com OutputIntent ICC, via Ghostscript.
 * O preto K puro depende do PDF vetorial do Prelo emitir texto preto como DeviceGray.
 *
 * Roda FORA do navegador (Ghostscript é nativo). Uso:
 *   npm run pdfx -- entrada.pdf [saida.pdf] [--gray] [--icc /caminho/perfil.icc] [--condition "Coated FOGRA39"]
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertPdfToPdfx, parseArgs } from './pdfx-converter.mjs';

export { buildGsArgs, buildPdfxDef, defaultOutputPath, parseArgs } from './pdfx-converter.mjs';

async function main() {
  const { input, output, gray, icc, condition } = parseArgs(process.argv.slice(2));

  if (!input) {
    console.error('Uso: npm run pdfx -- entrada.pdf [saida.pdf] [--gray] [--icc perfil.icc] [--condition "Coated FOGRA39"]');
    process.exit(2);
  }

  try {
    const result = await convertPdfToPdfx({
      inputPath: input,
      outputPath: output,
      gray,
      iccPath: icc,
      condition,
    });

    console.log('✓ PDF/X-1a gerado:', result.outputPath);
    console.log('  Modo de cor:', result.colorMode === 'Gray' ? 'Gray (miolo P&B -> K puro)' : 'CMYK');
    console.log('  Preto K puro: preservado quando o PDF de entrada usa preto DeviceGray do Prelo.');
    console.log('  OutputIntent ICC:', result.iccPath);
    if (result.usingGenericIcc) {
      console.log('  ⚠ ICC GENERICO do Ghostscript. Para offset real, peça o perfil da grafica e use --icc/--condition.');
    }
    console.log('  Confirme antes de enviar: abra no Acrobat (Preflight) ou pergunte à grafica.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
