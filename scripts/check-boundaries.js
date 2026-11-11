import fs from 'fs';
import path from 'path';

const violations = [];

function checkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkDir(fullPath);
    } else if (entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const normalizedPath = fullPath.replace(/\\/g, '/');

      // Rule 1: Domain layer must not import from application, infrastructure, interfaces, or config
      if (normalizedPath.includes('/domain/')) {
        if (/from\s+['"].*\/(infrastructure|interfaces|application|config)\//.test(content)) {
          violations.push(`[Rule 1 Violation] in ${fullPath}: Domain cannot import from outer layers (infrastructure, interfaces, application, config).`);
        }
      }

      // Rule 2: Application layer must only import from domain, ports, shared, or node stdlib. Never infrastructure, interfaces, config.
      if (normalizedPath.includes('/application/') && !normalizedPath.includes('/ports/')) {
        if (/from\s+['"].*\/(infrastructure|interfaces|config)\//.test(content)) {
          violations.push(`[Rule 2 Violation] in ${fullPath}: Application cannot import from infrastructure, interfaces, or config.`);
        }
      }

      // Rule 3: Infrastructure must not import from application or interfaces
      if (normalizedPath.includes('/infrastructure/')) {
        if (/from\s+['"].*\/(application|interfaces)\//.test(content)) {
          violations.push(`[Rule 3 Violation] in ${fullPath}: Infrastructure cannot import from application or interfaces.`);
        }
      }
    }
  }
}

const serverSrc = path.resolve('apps/server/src');
if (fs.existsSync(serverSrc)) {
  checkDir(serverSrc);
}

if (violations.length > 0) {
  console.error('\n❌ Architectural boundary violations detected:');
  violations.forEach(v => console.error(` - ${v}`));
  process.exit(1);
} else {
  console.log('✅ Architectural boundaries verified: 0 violations found.');
}
