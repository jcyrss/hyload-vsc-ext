set outdir=.\

npx esbuild  monitor.jsx --charset=utf8 --target=es2020 --outdir=%outdir% --minify
