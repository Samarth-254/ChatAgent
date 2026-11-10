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

      // Rule: Domain layer must not import from application, infrastructure, or interfaces
      if (normalizedPath.includes('/domain/')) {
        if (/from\s+['"].*\/(infrastructure|interfaces|application)\//.test(content)) {
          violations.push(`Boundary Violation in ${fullPath}: Domain cannot import from outer layers.`);
        }
      }

      // Rule: Application layer must not import from interfaces
      if (normalizedPath.includes('/application/')) {
        if (/from\s+['"].*\/interfaces\//.test(content)) {
          violations.push(`Boundary Violation in ${fullPath}: Application cannot import from interfaces.`);
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

