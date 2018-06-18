#!/usr/bin/env node

/* eslint-disable no-console */

var meow = require('meow');

var cli = meow({
  help: `
    USAGE: watchbot <command> [OPTIONS]
    Commands:
      dead-letter         triage messages in dead letter queue
    Options:
      -h, --help          show this help message
      -s, --stack-name    the full name of a watchbot stack
      -r, --region        the region of the stack (default us-east-1)
  `,
  description: 'Helper utilities for interacting with watchbot stacks'
}, {
  alias: { s: 'stack-name', r: 'region' },
  defaults: { region: 'us-east-1' }
});

var command = cli.input[0];
if (!command) {
  console.error('ERROR: You must specify a command');
  cli.showHelp(1);
}

var fn;
try { fn = require(`../lib/${command}`); }
catch(err) {
  console.error('"' + command + '" is not a valid command');
  cli.showHelp(1);
}

fn(cli.flags, function(err) {
  if (err) {
    console.error(err.stack);
    cli.showHelp(1);
  }
});
