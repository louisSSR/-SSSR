const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const webpack = require('webpack');
const root = __dirname;
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const canonical = value => JSON.stringify(value, null, 2) + '\n';
webpack({
  mode: 'production', context: root, entry: './src/index.ts',
  output: { path: path.join(root, 'build'), filename: 'theme-script.js', iife: true },
  resolve: { extensions: ['.ts', '.js'] },
  module: { rules: [
    { test: /\.ts$/, loader: 'ts-loader', options: { transpileOnly: true, compilerOptions: { noEmit: false } } },
    { test: /\.css$/, type: 'asset/source' },
    { test: /\.png$/, type: 'asset/inline' },
  ] },
  optimization: { minimize: true }, devtool: false, performance: { hints: false },
}, (error, stats) => {
  if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; return; }
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'script-spec.json'), 'utf8'));
  spec.items[0].value.content = fs.readFileSync(path.join(root, 'build/theme-script.js'), 'utf8');
  const relativePath = `${spec.items[0].artifactName}.script.json`;
  const body = canonical(spec.items[0].value);
  const manifest = { schemaVersion: 1, deliveryMode: 'component', kind: 'helper-script', artifacts: [
    { artifactName: spec.items[0].artifactName, id: spec.items[0].value.id, kind: 'helper-script', relativePath, sha256: sha(body) },
  ] };
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build/component-spec.json'), canonical(spec));
  fs.writeFileSync(path.join(root, 'dist', relativePath), body);
  fs.writeFileSync(path.join(root, 'dist/component-update-manifest.json'), canonical(manifest));
  console.log(stats.toString({ all: false, assets: true, timings: true }));
  console.log(JSON.stringify({ relativePath, bytes: Buffer.byteLength(body), sha256: sha(body), cardOutputs: 0 }, null, 2));
});
