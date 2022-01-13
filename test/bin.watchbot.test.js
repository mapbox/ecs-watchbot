'use strict';

const test = require('tape');
const stubber = require('./stubber');
const watchbot = require('../bin/watchbot');
const Watcher = require('../lib/watcher');
const Logger = require('../lib/logger');

class MockArgs {
  constructor (args) {
    this._original = process.argv;
    process.argv = ['', ''].concat(args);
  }

  restore() {
    process.argv = this._original;
  }
}

test('[bin.watchbot] success', async (assert) => {
  const watcher = stubber(Watcher).setup();

  const mockArgs = new MockArgs(['listen', 'echo', 'hello', 'world']);
  process.env.QueueUrl = 'https://faker';
  process.env.Volumes = '/tmp,/mnt';
  process.env.maxJobDuration = 180;
  process.env.structuredLogging = 'true';

  try {
    await watchbot();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(
    Watcher.create.calledWith({
      queueUrl: 'https://faker',
      writableFilesystem: false,
      structuredLogging: true,
      workerOptions: {
        command: 'echo hello world',
        volumes: ['/tmp', '/mnt'],
        maxJobDuration: 180
      }
    }),
    'watcher created with expected arguments'
  );

  assert.equal(watcher.listen.callCount, 1, 'called watcher.listen()');

  delete process.env.QueueUrl;
  delete process.env.Volumes;
  delete process.env.structuredLogging;
  mockArgs.restore();
  watcher.teardown();
  assert.end();
});

test('[bin.watchbot] error handling', async (assert) => {
  const watcher = stubber(Watcher).setup();
  const logger = stubber(Logger).setup();
  const err = new Error('foo');
  watcher.listen.returns(Promise.reject(err));

  const mockArgs = new MockArgs(['listen', 'echo', 'hello', 'world']);
  process.env.QueueUrl = 'https://faker';
  process.env.Volumes = '/tmp,/mnt';

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
  delete process.env.Volumes;
  mockArgs.restore();
  logger.teardown();
  watcher.teardown();
  assert.end();
});

test('[bin.watchbot] bad arguments', async (assert) => {
  const mockArgs = new MockArgs(['watch', 'echo', 'hello', 'world']);
  process.env.QueueUrl = 'https://faker';
  process.env.Volumes = '/tmp,/mnt';

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
  delete process.env.Volumes;
  mockArgs.restore();
  assert.end();
});


test('[bin.watchbot] invalid maxJobDuration', async (assert) => {
  const mockArgs = new MockArgs(['listen', 'echo', 'hello', 'world']);
  process.env.QueueUrl = 'https://faker';
  process.env.Volumes = '/tmp,/mnt';
  process.env.maxJobDuration = 'not a number here';


  try {
    await watchbot();
  } catch (err) {
    assert.equal(
      err.message,
      'maxJobDuration: not a number',
      'throws error on invalid arguments'
    );
  }

  delete process.env.QueueUrl;
  delete process.env.Volumes;
  delete process.env.maxJobDuration;
  mockArgs.restore();
  assert.end();
});

