import { readFileSync } from 'node:fs';

export function readJsonParams(args) {
  let inlineJson;
  let paramsFile;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--params-file') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--params-file 需要文件路径');
      paramsFile = value;
      i += 1;
    } else if (arg.startsWith('--params-file=')) {
      paramsFile = arg.slice('--params-file='.length);
      if (!paramsFile) throw new Error('--params-file 需要文件路径');
    } else if (arg.startsWith('--')) {
      throw new Error(`不支持的参数: ${arg}`);
    } else if (inlineJson === undefined) {
      inlineJson = arg;
    } else {
      throw new Error('只能提供一个内联 JSON 参数');
    }
  }

  if (inlineJson !== undefined && paramsFile !== undefined) {
    throw new Error('<params-json> 与 --params-file 不能同时使用');
  }
  if (inlineJson === undefined && paramsFile === undefined) return {};

  let raw = inlineJson;
  let source = '<params-json>';
  if (paramsFile !== undefined) {
    source = `--params-file ${paramsFile}`;
    try {
      raw = readFileSync(paramsFile, 'utf8');
    } catch (error) {
      throw new Error(`无法读取 ${source}: ${error.message}`);
    }
  }

  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${source} JSON 解析失败: ${error.message}`);
  }
}
