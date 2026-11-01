#!/usr/bin/env node
/**
 * bump-version.js
 * Bumps the patch version in lib/version.json before each push.
 * 6.2.81 → 6.2.82 (patch keeps counting up)
 */
const fs   = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'lib', 'version.json')
const data = JSON.parse(fs.readFileSync(file, 'utf-8'))

let [major, minor, patch] = data.version.split('.').map(Number)

patch++

data.version = `${major}.${minor}.${patch}`
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')

console.log(`Version bumped to ${data.version}`)
