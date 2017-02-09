#!/usr/bin/env node

var argv = require('minimist')(process.argv.slice(2));
var run = require('../lib/capacity').run;

run(argv, (err, result) => {
  if (err) console.log('\n' + err + '\n');
  if (result.capacity) console.log('\n' + result.cluster + ' currently has enough space for an additional ' + result.capacity + ' ' + argv.stack + ' workers.\n');
});
