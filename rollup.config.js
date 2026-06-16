import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import {default as json} from '@rollup/plugin-json';

const config = {
  input: 'src/index.js',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: false,
  },
  plugins: [commonjs(), nodeResolve({ preferBuiltins: true }), json()],
};

export default config;
