const fsp = require('node:fs/promises');
const path = require('node:path');

async function readJson(file, fallback) {
  try {
    const text = await fsp.readFile(file, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fsp.rename(tmp, file);
}

module.exports = { readJson, writeJson };
