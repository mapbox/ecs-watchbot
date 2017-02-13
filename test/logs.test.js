/* eslint-disable no-console */

var watchbot = require('..');
var test = require('tape');
var util = require('util');
var exec = require('child_process').exec;
var path = require('path');
var sinon = require('sinon');
var cwlogs = require('cwlogs');
var stream = require('stream');
var crypto = require('crypto');

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

test('[logs] via JS streaming API: adds prefixes, formats strings', function(assert) {
  process.env.MessageId = 'testing';

  var passes = false;
  var i = 0;
  console.log = function() {
    var msg = util.format.apply(null, arguments);
    i++;
    passes = /\[worker\] \[testing\] ham and eggs/.test(msg) || /\[worker\] \[testing\] and toast/.test(msg);
  };

  var logstream = watchbot.logStream();
  logstream.write('ham and eggs\nand toast');
  logstream.end();
  console.log = log;

  assert.ok(passes, 'printed expected messages');
  assert.equal(i, 2, 'printed both lines');
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

test('[logs] fetch a ton of logs', function(assert) {
  var logGroupArn = 'arn:aws:logs:eu-west-1:123456789012:log-group:some-log-group:*';
  var messageId = 'message-id';

  var logs = '';
  for (var i = 0; i < 70; i++) logs += crypto.randomBytes(512).toString('hex') + '\n';
  logs += '\n' + crypto.randomBytes(25 * 1024).toString('hex') + '\n';

  sinon.stub(cwlogs, 'readable', function(options) {
    var tminus6 = Date.now() - 6 * 60 * 60 * 1000;
    assert.ok(Math.abs(tminus6 - options.start) < 10000, 'queries last 6 hours of logs');
    delete options.start;
    
    assert.deepEqual(options, {
      region: 'eu-west-1',
      group: 'some-log-group',
      pattern: 'message-id',
      messages: true
    }, 'creates cwlog reader with expected options');

    var readable = new stream.Readable();
    readable._read = function() {
      readable.push(logs);
      readable.push(null);
    };

    return readable;
  });

  watchbot.fetch(logGroupArn, messageId, function(err, data) {
    if (err) return assert.end(err);

    assert.ok(data.length < 50 * 1024, 'output limited to 50kb');
    var lastFound = data.split('\n').slice(-2)[0];
    var lastExpected = logs.split('\n').slice(-2)[0];

    // returns either whole or truncated log
    assert.ok(lastFound === lastExpected || lastExpected.includes(lastFound.match(/(.*)...$/)[1]), 'returned most recent log');

    cwlogs.readable.restore();
    assert.end();
  });
});
