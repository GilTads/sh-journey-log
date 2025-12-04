// logger.ts (no-op no build web; use apenas em runtime nativo)
// Evita import de @capacitor/filesystem no bundle web.

const buildLine = (tag: string, message: string) => {
  const ts = new Date().toISOString();
  return `[${ts}] ${tag}: ${message}\n`;
};

export const logToFile = async (tag: string, message: string) => {
  const line = buildLine(tag, message);
  // Build web: apenas log no console. Para persistir em nativo, trocar esta função para usar Filesystem em runtime nativo.
  console.log(line.trim());
};

export const logErrorToFile = async (tag: string, error: unknown) => {
  const msg = error instanceof Error ? `${error.message}` : `${error}`;
  await logToFile(tag, `ERROR: ${msg}`);
};
