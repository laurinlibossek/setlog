// The app shares its training logic with the Setlog web app: setlog/js/core in
// this repo, imported as '@setlog/core' (see tsconfig.json "paths").
// Watching that folder means edits to the core reload the app right away.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '../setlog/js/core')];

module.exports = config;
