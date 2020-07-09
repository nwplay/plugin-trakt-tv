import resolve from '@rollup/plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import {terser} from "rollup-plugin-terser";
import license from 'rollup-plugin-license';
import * as pkg from './package.json';

export default {
    input: 'plugin.ts',
    output: {
        file: `./dist/${pkg.name}.nwpjs`,
        format: 'umd',
        name: `nwplay-plugin-${pkg.name}`,
        sourcemap: true,
        globals: {
            '@nwplay/core': '@nwplay/core',
            'cheerio': 'cheerio'
        }
    },
    plugins: [
        resolve({
            customResolveOptions: {
                moduleDirectory: 'node_modules'
            },
            preferBuiltins: true
        }),
        typescript({
            typescript: require('typescript')
        }),
        commonjs(),
        json(),
        terser({
            keep_classnames: true,
            keep_fnames: true
        }),
        license({
            banner: `
Bundle of <%= pkg.pluginName %> (<%= pkg.name %>)
Generated: <%= moment().format('YYYY-MM-DD') %>
Version: <%= pkg.version %>
Description: <%= pkg.description %>
Min Core Version: <%= pkg.devDependencies['@nwplay/core'] %>
Dependencies:
<% _.forEach(dependencies, function (dependency) { %>
  <%= dependency.name %> -- <%= dependency.version %>
<% }) %>
            `.trim(),
        })
    ],
    external: [
        '@nwplay/core',
        'cheerio'
    ]
}
