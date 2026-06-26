import { spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

/** Monta o PDFX_def.ps (PostScript) com o OutputIntent/ICC informados. */
export function buildPdfxDef({ iccPath, condition, conditionId }) {
  const cond = condition ?? 'Ghostscript default_cmyk (CMYK generico)';
  const id = conditionId ?? 'Custom';
  return `%!
[ /GTS_PDFXVersion (PDF/X-1a:2001)
  /Title (Prelo)
  /Trapped /False
/DOCINFO pdfmark
/ICCProfile (${iccPath}) def
[/_objdef {icc_PDFX} /type /stream /OBJ pdfmark
[{icc_PDFX} << /N 4 >> /PUT pdfmark
[{icc_PDFX} ICCProfile (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFX} /type /dict /OBJ pdfmark
[{OutputIntent_PDFX} <<
  /Type /OutputIntent
  /S /GTS_PDFX
  /OutputCondition (${cond})
  /Info (${cond})
  /OutputConditionIdentifier (${id})
  /RegistryName (http://www.color.org)
  /DestOutputProfile {icc_PDFX}
>> /PUT pdfmark
[{Catalog} <</OutputIntents [ {OutputIntent_PDFX} ]>> /PUT pdfmark
`;
}

/** Monta os argumentos do Ghostscript. gray=true -> miolo P&B (Gray->K). */
export function buildGsArgs({ defPath, inputPath, outputPath, gray = false, iccPath }) {
  const args = [
    '-dPDFX=1',
    '-dBATCH',
    '-dNOPAUSE',
    '-dNOOUTERSAVE',
    '-dCompatibilityLevel=1.3',
    `-sColorConversionStrategy=${gray ? 'Gray' : 'CMYK'}`,
    `-sProcessColorModel=${gray ? 'DeviceGray' : 'DeviceCMYK'}`,
    '-sDEVICE=pdfwrite',
    `-sOutputFile=${outputPath}`,
  ];
  // Garante leitura do ICC sob o SAFER padrao do gs 10.
  if (iccPath) args.unshift(`--permit-file-read=${iccPath}`);
  args.push(defPath, inputPath);
  return args;
}

export function defaultOutputPath(inputPath) {
  return inputPath.replace(/\.pdf$/i, '') + '-pdfx.pdf';
}

export function parseArgs(argv) {
  const positional = [];
  let gray = false;
  let icc;
  let condition;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--gray') gray = true;
    else if (arg === '--icc') icc = argv[++i];
    else if (arg === '--condition') condition = argv[++i];
    else positional.push(arg);
  }
  return { input: positional[0], output: positional[1], gray, icc, condition };
}

export function findGhostscript(resolveCommand = defaultResolveGhostscriptCommand) {
  try {
    return resolveCommand() || null;
  } catch {
    return null;
  }
}

export function findDefaultCmykIcc(gsPath, probes = {}) {
  const fs = {
    existsSync,
    readdirSync,
    statSync,
    envIccPath: process.env.PRELO_PDFX_ICC,
    ...probes,
  };

  if (fs.envIccPath && fs.existsSync(fs.envIccPath)) return fs.envIccPath;

  const bases = [];
  if (gsPath) {
    const prefix = dirname(dirname(gsPath));
    bases.push(join(prefix, 'share', 'ghostscript'));
  }
  bases.push('/opt/homebrew/share/ghostscript', '/usr/local/share/ghostscript', '/usr/share/ghostscript');

  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const direct = findIccInBase(base, fs);
    if (direct) return direct;
    for (const entry of fs.readdirSync(base)) {
      const sub = join(base, entry);
      try {
        if (fs.statSync(sub).isDirectory()) {
          const hit = findIccInBase(sub, fs);
          if (hit) return hit;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export async function convertPdfToPdfx({
  inputPath,
  outputPath,
  gray = false,
  iccPath,
  condition,
  conditionId,
  gsPath,
}) {
  const resolvedInputPath = resolve(inputPath);
  if (!existsSync(resolvedInputPath)) {
    throw new Error(`Arquivo de entrada nao encontrado: ${resolvedInputPath}`);
  }

  const resolvedGsPath = gsPath ?? findGhostscript();
  if (!resolvedGsPath) {
    throw new Error('Ghostscript nao encontrado. Instale com: brew install ghostscript');
  }

  const resolvedIccPath = iccPath ? resolve(iccPath) : findDefaultCmykIcc(resolvedGsPath);
  if (!resolvedIccPath || !existsSync(resolvedIccPath)) {
    throw new Error('Perfil ICC CMYK nao encontrado. Passe um com: --icc /caminho/perfil.icc');
  }

  const resolvedOutputPath = resolve(outputPath ?? defaultOutputPath(resolvedInputPath));
  const workDir = mkdtempSync(join(tmpdir(), 'prelo-pdfx-'));
  const defPath = join(workDir, 'PDFX_def.ps');
  const usingGenericIcc = !iccPath && !process.env.PRELO_PDFX_ICC;

  try {
    writeFileSync(
      defPath,
      buildPdfxDef({
        iccPath: resolvedIccPath,
        condition: condition ?? (usingGenericIcc ? 'Ghostscript default_cmyk (CMYK generico, NAO FOGRA39)' : undefined),
        conditionId: conditionId ?? (condition ? condition : usingGenericIcc ? 'GenericCMYK' : 'Custom'),
      })
    );

    const args = buildGsArgs({
      defPath,
      inputPath: resolvedInputPath,
      outputPath: resolvedOutputPath,
      gray,
      iccPath: resolvedIccPath,
    });
    const result = spawnSync(resolvedGsPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

    if (result.status !== 0 || !existsSync(resolvedOutputPath)) {
      throw new Error('Falha na conversao Ghostscript:\n' + (result.stderr || result.stdout || ''));
    }

    const restoredBytes = await restorePdfPageBoxesFromSource({
      sourcePdfBytes: readFileSync(resolvedInputPath),
      convertedPdfBytes: readFileSync(resolvedOutputPath),
      pdfVersion: '1.3',
    });
    writeFileSync(resolvedOutputPath, restoredBytes);

    return {
      outputPath: resolvedOutputPath,
      iccPath: resolvedIccPath,
      usingGenericIcc,
      colorMode: gray ? 'Gray' : 'CMYK',
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export async function restorePdfPageBoxesFromSource({ sourcePdfBytes, convertedPdfBytes, pdfVersion = '1.3' }) {
  const source = await PDFDocument.load(sourcePdfBytes);
  const converted = await PDFDocument.load(convertedPdfBytes);
  const sourcePages = source.getPages();
  const convertedPages = converted.getPages();

  if (sourcePages.length !== convertedPages.length) {
    throw new Error(`PDF/X gerado tem ${convertedPages.length} pagina(s), mas o PDF original tem ${sourcePages.length}.`);
  }

  for (let i = 0; i < sourcePages.length; i++) {
    const sourcePage = sourcePages[i];
    const convertedPage = convertedPages[i];
    const mediaBox = sourcePage.getMediaBox();
    const cropBox = sourcePage.getCropBox();
    const bleedBox = sourcePage.getBleedBox();
    const trimBox = sourcePage.getTrimBox();

    convertedPage.setMediaBox(mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height);
    convertedPage.setCropBox(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
    convertedPage.setBleedBox(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height);
    convertedPage.setTrimBox(trimBox.x, trimBox.y, trimBox.width, trimBox.height);
  }

  const savedBytes = await converted.save({ useObjectStreams: false });
  return forcePdfHeaderVersion(savedBytes, pdfVersion);
}

export function forcePdfHeaderVersion(pdfBytes, pdfVersion) {
  const bytes = Buffer.from(pdfBytes);
  const header = Buffer.from(`%PDF-${pdfVersion}`);
  if (header.length !== 8) {
    throw new Error(`Versao PDF invalida para cabecalho: ${pdfVersion}`);
  }
  if (bytes.length < header.length || bytes.subarray(0, 5).toString() !== '%PDF-') {
    return bytes;
  }
  header.copy(bytes, 0);
  return bytes;
}

function defaultResolveGhostscriptCommand() {
  return execSync('command -v gs', { encoding: 'utf8' }).trim();
}

function findIccInBase(base, fs) {
  const hit = join(base, 'iccprofiles', 'default_cmyk.icc');
  return fs.existsSync(hit) ? hit : null;
}
