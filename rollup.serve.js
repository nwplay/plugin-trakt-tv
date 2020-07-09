import serve from 'rollup-plugin-serve'
import config from './rollup.config';

config.plugins.push(serve({
    port: 8065,
    host: '127.0.0.1',
    contentBase: 'dist',
    historyApiFallback: '/' + config.output.file.split('/').pop()
}))
export default config;
