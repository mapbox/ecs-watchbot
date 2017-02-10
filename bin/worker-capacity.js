#!/usr/bin/env node

var argv = process.argv.slice(2);
var run = require('../lib/capacity').run;

run(argv, (err, result) => {
  if (err) console.log('\n%s\n', err);
  if (result.capacity) console.log('\n%s currently has enough space for an additional %s %s workers.\n', result.cluster, result.capacity, argv.stack);
});
