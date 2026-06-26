export interface ParsedError {
  title: string;
  file?: string;
  line?: number;
  column?: number;
  message: string;
  probableCause: string;
  fixStrategy: string;
  confidence: number;
  kind:
    | "next"
    | "vite"
    | "typescript"
    | "eslint"
    | "react"
    | "node"
    | "python"
    | "php"
    | "prisma"
    | "port"
    | "dependency"
    | "script"
    | "syntax"
    | "unknown";
}

export function parseAgentError(output: string): ParsedError {
  const text = output.trim();
  const compact = text.replace(/\r/g, "").split("\n").filter(Boolean).slice(-80).join("\n");
  const lower = compact.toLowerCase();

  const port = compact.match(/(?:EADDRINUSE|address already in use).*?(?::|port\s+)(\d+)/i) || compact.match(/port\s+(\d+)\s+.*already in use/i);
  if (port) {
    return parsed("Port already in use", "port", compact, {
      probableCause: `Port ${port[1]} is busy.`,
      fixStrategy: "Choose the next available port and restart the preview server.",
      confidence: 0.95,
    });
  }

  const missingDep = compact.match(/Cannot find module ['"]([^'"]+)['"]/i) || compact.match(/Failed to resolve import ['"]([^'"]+)['"]/i);
  if (missingDep) {
    return parsed(`Missing dependency: ${missingDep[1]}`, "dependency", compact, {
      probableCause: `The project imports ${missingDep[1]} but it is not available.`,
      fixStrategy: "Prefer fixing the import. Ask before installing the dependency if it is truly required.",
      confidence: 0.9,
    });
  }

  const missingScript = compact.match(/missing script:?\s+["']?([^"'\n]+)["']?/i) || compact.match(/script ["']([^"']+)["'] not found/i);
  if (missingScript) {
    return parsed(`Missing npm script: ${missingScript[1]}`, "script", compact, {
      probableCause: "The selected command is not defined in package.json.",
      fixStrategy: "Select an existing script or add the minimal missing script if appropriate.",
      confidence: 0.9,
    });
  }

  const ts = compact.match(/(.+\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/i)
    || compact.match(/(.+\.(?:ts|tsx|js|jsx)):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+)/i);
  if (ts) {
    return parsed(`${ts[4]} in ${shortFile(ts[1])}`, "typescript", compact, {
      file: cleanFile(ts[1]),
      line: Number(ts[2]),
      column: Number(ts[3]),
      message: ts[5],
      probableCause: "TypeScript compilation failed.",
      fixStrategy: "Patch the referenced file with the smallest type-safe change.",
      confidence: 0.92,
    });
  }

  const eslint = compact.match(/(.+\.(?:ts|tsx|js|jsx))\n\s*(\d+):(\d+)\s+(error|warning)\s+(.+)/i);
  if (eslint) {
    return parsed(`ESLint issue in ${shortFile(eslint[1])}`, "eslint", compact, {
      file: cleanFile(eslint[1]),
      line: Number(eslint[2]),
      column: Number(eslint[3]),
      message: eslint[5],
      probableCause: "Lint rule violation.",
      fixStrategy: "Adjust only the reported code to satisfy the lint rule.",
      confidence: 0.82,
    });
  }

  const vite = compact.match(/(?:\[vite\]|vite).*?(.+\.(?:ts|tsx|js|jsx|css|html)):(\d+):(\d+)/is);
  if (vite) {
    return parsed(`Vite error in ${shortFile(vite[1])}`, "vite", compact, {
      file: cleanFile(vite[1]),
      line: Number(vite[2]),
      column: Number(vite[3]),
      probableCause: "Vite failed while transforming or resolving a module.",
      fixStrategy: "Fix the referenced import, syntax, or component code.",
      confidence: 0.78,
    });
  }

  const next = compact.match(/(?:Failed to compile|Build error|Next\.js).*?\n([\s\S]*?)(?:\n\n|$)/i);
  if (next || lower.includes("next")) {
    const loc = compact.match(/(.+\.(?:ts|tsx|js|jsx|css)):(\d+):(\d+)/);
    return parsed("Next.js build failed", "next", compact, {
      file: loc ? cleanFile(loc[1]) : undefined,
      line: loc ? Number(loc[2]) : undefined,
      column: loc ? Number(loc[3]) : undefined,
      probableCause: "Next.js build or compilation error.",
      fixStrategy: "Patch the referenced route/component/config with a minimal build-safe change.",
      confidence: loc ? 0.82 : 0.65,
    });
  }

  const syntax = compact.match(/SyntaxError:\s*(.+)/i) || compact.match(/Unexpected token\s+(.+)/i);
  if (syntax) {
    const loc = compact.match(/(.+\.(?:ts|tsx|js|jsx|py|php)):(\d+):?(\d+)?/);
    return parsed("Syntax error", "syntax", compact, {
      file: loc ? cleanFile(loc[1]) : undefined,
      line: loc ? Number(loc[2]) : undefined,
      column: loc?.[3] ? Number(loc[3]) : undefined,
      message: syntax[1],
      probableCause: "Invalid syntax in source code.",
      fixStrategy: "Correct the syntax around the reported line.",
      confidence: 0.84,
    });
  }

  const python = compact.match(/File "([^"]+)", line (\d+)[\s\S]*?\n(.+Error: .+)/i);
  if (python) {
    return parsed("Python runtime error", "python", compact, {
      file: cleanFile(python[1]),
      line: Number(python[2]),
      message: python[3],
      probableCause: "Python raised an exception.",
      fixStrategy: "Patch the referenced Python file near the failing line.",
      confidence: 0.86,
    });
  }

  const php = compact.match(/PHP (?:Fatal error|Parse error):\s*(.+?) in (.+?) on line (\d+)/i);
  if (php) {
    return parsed("PHP error", "php", compact, {
      file: cleanFile(php[2]),
      line: Number(php[3]),
      message: php[1],
      probableCause: "PHP failed to parse or execute the file.",
      fixStrategy: "Patch the referenced PHP line with a minimal fix.",
      confidence: 0.86,
    });
  }

  const prisma = compact.match(/Prisma(?:Client)?(?:KnownRequest)?Error:?\s*([\s\S]+)/i);
  if (prisma || lower.includes("prisma")) {
    return parsed("Prisma error", "prisma", compact, {
      probableCause: "Prisma schema, migration, or query failed.",
      fixStrategy: "Inspect schema.prisma and the failing query before patching.",
      confidence: 0.7,
    });
  }

  const node = compact.match(/(?:Error|TypeError|ReferenceError):\s*(.+)/i);
  if (node) {
    const loc = compact.match(/at .*?\((.+\.(?:js|ts|tsx|jsx)):(\d+):(\d+)\)/);
    return parsed("Node runtime error", "node", compact, {
      file: loc ? cleanFile(loc[1]) : undefined,
      line: loc ? Number(loc[2]) : undefined,
      column: loc ? Number(loc[3]) : undefined,
      message: node[1],
      probableCause: "Runtime exception during command execution.",
      fixStrategy: "Patch the smallest failing code path.",
      confidence: loc ? 0.78 : 0.62,
    });
  }

  return parsed("Command failed", "unknown", compact, {
    probableCause: "The command failed; inspect logs for the exact cause.",
    fixStrategy: "Use logs and recent changes to produce a minimal patch.",
    confidence: 0.35,
  });
}

export function errorFingerprint(error: ParsedError): string {
  return [
    error.kind,
    error.file ?? "",
    error.line ?? "",
    error.message.replace(/\d+/g, "#").slice(0, 160),
  ].join("|");
}

function parsed(
  title: string,
  kind: ParsedError["kind"],
  raw: string,
  overrides: Partial<ParsedError>
): ParsedError {
  return {
    title,
    kind,
    message: overrides.message ?? firstUsefulLine(raw),
    probableCause: overrides.probableCause ?? "Unknown failure.",
    fixStrategy: overrides.fixStrategy ?? "Inspect the referenced files and patch minimally.",
    confidence: overrides.confidence ?? 0.5,
    file: overrides.file,
    line: overrides.line,
    column: overrides.column,
  };
}

function firstUsefulLine(value: string): string {
  return value.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith(">")) ?? "Command failed";
}

function cleanFile(value: string): string {
  return value.trim().replace(/^file:\/\//, "").replace(process.cwd() + "/", "");
}

function shortFile(value: string): string {
  return cleanFile(value).split(/[\\/]/).pop() ?? value;
}
