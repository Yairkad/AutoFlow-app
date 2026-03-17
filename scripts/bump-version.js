#!/usr/bin/env node
/**
 * bump-version.js
 * Bumps the patch version in lib/version.json before each push.
 * 0.0.9 → 0.1.0 | 0.9.9 → 1.0.0
 */
const fs   = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'lib', 'version.json')
const data = JSON.parse(fs.readFileSync(file, 'utf-8'))

let [major, minor, patch] = data.version.split('.').map(Number)

patch++
if (patch > 9) { patch = 0; minor++ }
if (minor > 9) { minor = 0; major++ }

data.version = `${major}.${minor}.${patch}`
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')

console.log(`Version bumped to ${data.version}`)
