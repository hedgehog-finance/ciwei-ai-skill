import { readFileSync } from 'node:fs';

export function readJsonParams(args) {
  const inlineJson = args[0] && !args[0].startsWith('--') ? args[0] : undefined;
  const fileIndex = args.findIndex((arg) => arg === '--params-file');
  const equalsArg = args.find((arg) => arg.startsWith('--params-file='));
  if (fileIndex !== -1 && equalsArg) throw new Error('--params-file can only be provided once');
  const paramsFile = fileIndex !== -1 ? args[fileIndex + 1] : equalsArg?.slice('--params-file='.length);
  if (fileIndex !== -1 && (!paramsFile || paramsFile.startsWith('--'))) {
    throw new Error('--params-file requires a file path');
  }
  if (equalsArg !== undefined && !paramsFile) throw new Error('--params-file requires a file path');
  const consumed = (inlineJson === undefined ? 0 : 1) + (fileIndex === -1 ? 0 : 2) + (equalsArg === undefined ? 0 : 1);
  if (args.length !== consumed) throw new Error('Unsupported or duplicate parameter argument');
  if (inlineJson !== undefined && paramsFile !== undefined) {
    throw new Error('<params-json> and --params-file are mutually exclusive');
  }
  if (inlineJson === undefined && paramsFile === undefined) return {};

  let raw = inlineJson;
  let source = '<params-json>';
  if (paramsFile !== undefined) {
    source = `--params-file ${paramsFile}`;
    try {
      raw = readFileSync(paramsFile, 'utf8');
    } catch (error) {
      throw new Error(`Unable to read ${source}: ${error.message}`);
    }
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Invalid JSON from ${source}: ${error.message}`);
  }
}
