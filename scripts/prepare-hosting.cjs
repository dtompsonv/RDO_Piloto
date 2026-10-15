// Only application files belong in Hosting; tests, rules and local files stay private to the repository.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'public');
const allowed = ['index.html', 'app.js'];
fs.mkdirSync(destination, { recursive: true });
for (const file of fs.readdirSync(destination)) {
  if (!allowed.includes(file) || fs.lstatSync(path.join(destination, file)).isSymbolicLink()) {
    throw Error('Arquivo inesperado em public/: '+file+'. Remova-o antes de publicar.');
  }
}
for (const file of allowed) fs.copyFileSync(path.join(root, file), path.join(destination, file));
console.log('Hosting preparado: public/index.html e public/app.js');
