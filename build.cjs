const path = require('node:path');
const fs = require('node:fs');
const webpack = require('webpack');
const { VueLoaderPlugin } = require('vue-loader');
const root = __dirname;
webpack({
  mode: 'production', context: root, entry: './src/index.ts',
  experiments: { outputModule: true },
  output: { path: root, filename: 'index.js', library: { type: 'module' } },
  resolve: { extensions: ['.ts', '.js', '.vue'], extensionAlias:{'.ts':['.ts'],'.js':['.ts','.js']}, alias: { vue$: require.resolve('vue/dist/vue.runtime.esm-bundler.js') } },
  module: { parser: { javascript: { importMeta: false, url: false } }, rules: [
    { test: /\.vue$/, loader: 'vue-loader' },
    { test: /\.ts$/, loader: 'ts-loader', options: { transpileOnly:true, appendTsSuffixTo:[/\.vue$/], compilerOptions:{noEmit:false,allowImportingTsExtensions:false} } },
    { test: /\.css$/, type: 'asset/source' },
    { test: /\.txt$/, type: 'asset/source' }
  ]},
  plugins:[new VueLoaderPlugin(),new webpack.DefinePlugin({__VUE_OPTIONS_API__:false,__VUE_PROD_DEVTOOLS__:false,__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:false})],
  optimization: { minimize: true }, devtool:false, performance: { hints:false }
}, (error,stats)=>{
  if(error || stats.hasErrors()){console.error(error||stats.toString({all:false,errors:true}));process.exitCode=1;return;}
  const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  m.hooks={activate:'onActivate',enable:'onEnable',disable:'onDisable',delete:'onDelete',clean:'onDisable'};
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(m,null,2)+'\n');
  console.log(stats.toString({all:false,assets:true,timings:true}));
});
