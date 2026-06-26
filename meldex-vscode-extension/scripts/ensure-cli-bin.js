#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const cliPath = path.join(root, "out", "cli", "main.js");
const wrapperDir = path.join(root, "meldex-agent-cli", "bin");
const wrapperPath = path.join(wrapperDir, "meldex-agent.js");
const wrapper = "#!/usr/bin/env node\nrequire(\"../../out/cli/main.js\");\n";

if (!fs.existsSync(cliPath)) {
  console.error(`Meldex CLI build missing: ${cliPath}`);
  process.exit(1);
}

const current = fs.readFileSync(cliPath, "utf8");
if (!current.startsWith("#!/usr/bin/env node")) {
  fs.writeFileSync(cliPath, `#!/usr/bin/env node\n${current}`, "utf8");
}

fs.chmodSync(cliPath, 0o755);
fs.mkdirSync(wrapperDir, { recursive: true });
fs.writeFileSync(wrapperPath, wrapper, "utf8");
fs.chmodSync(wrapperPath, 0o755);

console.log(`Meldex CLI ready: ${path.relative(root, cliPath)}`);
