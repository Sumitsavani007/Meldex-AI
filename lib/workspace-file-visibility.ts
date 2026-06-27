const hiddenExactNames = new Set([
  ".cache",
  ".DS_Store",
  ".git",
  ".gitkeep",
  ".meldex",
  ".meldex-ide",
  ".meldex-ide-server",
  ".vscode",
  "node_modules",
  "settings.json",
]);

const hiddenSegments = new Set([
  ".cache",
  ".git",
  ".meldex",
  ".meldex-ide",
  ".meldex-ide-server",
  ".vscode",
  "node_modules",
]);

export function isInternalWorkspaceFile(filePath = "") {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return false;
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => hiddenSegments.has(segment))) return true;
  const name = segments.at(-1) || normalized;
  if (hiddenExactNames.has(name)) return true;
  if (/^\.env(?:\.|$)/i.test(name)) return true;
  if (/token|secret|session|credential|runtime|metadata|session/i.test(name) && segments.some((segment) => segment.startsWith("."))) return true;
  return false;
}

export function isUserVisibleWorkspaceFile(filePath = "") {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return true;
  return !isInternalWorkspaceFile(normalized);
}
