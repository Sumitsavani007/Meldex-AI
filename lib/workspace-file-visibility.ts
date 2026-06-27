const hiddenExactNames = new Set([
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
  ".git",
  ".meldex",
  ".meldex-ide",
  ".meldex-ide-server",
  ".vscode",
  "node_modules",
]);

export function isUserVisibleWorkspaceFile(filePath = "") {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return true;
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => hiddenSegments.has(segment))) return false;
  const name = segments.at(-1) || normalized;
  if (hiddenExactNames.has(name)) return false;
  if (/^\.env(?:\.|$)/i.test(name)) return false;
  if (/token|secret|session|credential/i.test(name) && segments.some((segment) => segment.startsWith("."))) return false;
  return true;
}
