var watchbot = require('..');
var test = require('tape');
var util = require('util');
var exec = require('child_process').exec;
var path = require('path');

var log = console.log.bind(console);
var logger = path.resolve(__dirname, '..', 'bin', 'watchbot-log.js');

test('[logs] via JS: adds prefixes, formats strings', function(assert) {
  process.env.MessageId = 'testing';

  var passes = false;

  console.log = function() {
    passes = /\[worker\] \[testing\] ham and eggs/.test(util.format.apply(null, arguments));
  };

  watchbot.log('ham and %s', 'eggs');
  console.log = log;

  assert.ok(passes, 'printed expected message');
  delete process.env.MessageId;
  assert.end();
});

test('[logs] via CLI: adds prefixes to provided argument', function(assert) {
  process.env.MessageId = 'testing';
  exec([logger, '"ham and eggs"'].join(' '), function(err, stdout) {
    if (err) return assert.end(err);
    assert.ok(/\[worker\] \[testing\] ham and eggs/.test(stdout), 'printed expected message');
    delete process.env.MessageId;
    assert.end();
  });
});

test('[logs] via CLI: adds prefixes to stdin', function(assert) {
  process.env.MessageId = 'testing';

  var logging = exec(logger, function(err, stdout) {
    if (err) return assert.end(err);
    assert.ok(/\[worker\] \[testing\] ham and eggs/.test(stdout), 'printed expected message');
    delete process.env.MessageId;
    assert.end();
  });

  logging.stdin.write('ham and eggs');
  logging.stdin.end();
});

test('[logs] via CLI: adds prefixes to stdin, splits multiline', function(assert) {
  process.env.MessageId = 'testing';

  var logging = exec(logger, function(err, stdout) {
    if (err) return assert.end(err);

    stdout = stdout.trim().split('\n');
    assert.equal(stdout.length, 3, 'split into 3 lines');

    assert.ok(/\[worker\] \[testing\] ham and eggs/.test(stdout[0]), 'printed expected first line');
    assert.ok(/\[worker\] \[testing\] bacon lettuce and tomato/.test(stdout[1]), 'printed expected second line');
    assert.ok(/\[worker\] \[testing\] roast beef and cheddar/.test(stdout[2]), 'printed expected third line');
    delete process.env.MessageId;
    assert.end();
  });

  logging.stdin.write('ham and eggs\nbacon lettuce and tomato\n');
  logging.stdin.write('roast beef and cheddar');
  logging.stdin.end();
});
