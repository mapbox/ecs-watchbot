'use strict';

const test = require('tape');
const sinon = require('sinon');
const stubber = require('./stubber');
const watchbot = require('../bin/watchbot');
const Watcher = require('../lib/watcher');

test('[bin.watchbot] success', async (assert) => {
  const watcher = stubber(Watcher).setup();

  const argv = process.argv;
  process.argv = ['', '', 'listen', 'echo', 'hello', 'world'];
  process.env.QueueUrl = 'https://faker';

  try {
    await watchbot();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(
    Watcher.create.calledWith({
      queueUrl: 'https://faker',
      workerOptions: { command: 'echo hello world' }
    }),
    'watcher created with expected arguments'
  );

  assert.ok(
    watcher.on.calledWith('error', sinon.match.func),
    'setup error listener on watcher'
  );

  assert.equal(watcher.listen.callCount, 1, 'called watcher.listen()');

  delete process.env.QueueUrl;
  process.argv = argv;
  watcher.teardown();
  assert.end();
});

test('[bin.watchbot] error handling', async (assert) => {
  const watcher = stubber(Watcher).setup();
  const err = new Error('foo');
  watcher.listen.callsFake(() => watcher.emit('error', err));

  sinon.spy(console, 'log');

  const argv = process.argv;
  process.argv = ['', '', 'listen', 'echo', 'hello', 'world'];
  process.env.QueueUrl = 'https://faker';

  try {
    await watchbot();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(
    console.log.calledWith(err),
    'logged error from watcher to console'
  );

  delete process.env.QueueUrl;
  process.argv = argv;
  console.log.restore();
  watcher.teardown();
  assert.end();
});

test('[bin.watchbot] bad arguments', async (assert) => {
  const argv = process.argv;
  process.argv = ['', '', 'watch', 'echo', 'hello', 'world'];
  process.env.QueueUrl = 'https://faker';

  try {
    await watchbot();
  } catch (err) {
    assert.equal(
      err.message,
      'Invalid arguments: watch echo hello world',
      'throws error on invalid arguments'
    );
  }

  delete process.env.QueueUrl;
  process.argv = argv;
  assert.end();
});
