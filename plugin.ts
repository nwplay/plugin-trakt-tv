import * as pkg from './package.json';

export const pluginName = pkg.pluginName;
export const pluginVersion = pkg.version;
export const pluginDescription = pkg.description;
export const pluginId = pkg.id;
export const pluginRequiredCoreVersion = pkg.devDependencies['@nwplay/core'];
export * from './src/main';
