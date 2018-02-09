'use strict';

const test = require('tape');
const stubber = require('./stubber');
const watchbot = require('../bin/watchbot');
const Watcher = require('../lib/watcher');
const Logger = require('../lib/logger');

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

  assert.equal(watcher.listen.callCount, 1, 'called watcher.listen()');

  delete process.env.QueueUrl;
  process.argv = argv;
  watcher.teardown();
  assert.end();
});

test('[bin.watchbot] error handling', async (assert) => {
  const watcher = stubber(Watcher).setup();
  const logger = stubber(Logger).setup();
  const err = new Error('foo');
  watcher.listen.returns(Promise.reject(err));

  const argv = process.argv;
  process.argv = ['', '', 'listen', 'echo', 'hello', 'world'];
  process.env.QueueUrl = 'https://faker';

  try {
    await watchbot();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(
    logger.log.calledWith(`[error] ${err.stack}`),
    'logged error from watcher to console'
  );

  delete process.env.QueueUrl;
  process.argv = argv;
  logger.teardown();
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
