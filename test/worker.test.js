'use strict';

const events = require('events');
const child_process = require('child_process');
const test = require('tape');
const sinon = require('sinon');
const Worker = require('../lib/worker');
const Message = require('../lib/message');
const Logger = require('../lib/logger');
const stubber = require('./stubber');

test('[worker] constructor', (assert) => {
  assert.throws(
    () => new Worker(),
    /Invalid Message object/,
    'must provide a message object'
  );

  assert.throws(
    () => new Worker({}),
    /Invalid Message object/,
    'message object must be of correct type'
  );

  assert.throws(
    () => new Worker(sinon.createStubInstance(Message)),
    /Missing options: command/,
    'must provide a command'
  );

  const message = sinon.createStubInstance(Message);
  const worker = new Worker(message, { command: 'echo hello world' });

  assert.equal(worker.message, message, 'sets .message');
  assert.equal(worker.command, 'echo hello world', 'sets .command');

  assert.end();
});

test('[worker] factory', (assert) => {
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world' };
  const worker = Worker.create(message, options);
  assert.ok(worker instanceof Worker, 'returns a Worker object');
  assert.end();
});

test('[worker] fail', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world' };
  const worker = new Worker(message, options);

  const results = { code: 124, signal: 'SIGTERM', duration: 12345 };
  await worker.fail(results);

  assert.ok(logger.workerFailure.calledWith(results), 'logs worker failure');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  logger.teardown();
  assert.end();
});

test('[worker] noop', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world' };
  const worker = new Worker(message, options);

  const results = { code: 4, duration: 12345 };
  await worker.noop(results);

  assert.ok(logger.workerSuccess.calledWith(results), 'logs worker result');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  logger.teardown();
  assert.end();
});

test('[worker] ignore', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world' };
  const worker = new Worker(message, options);

  const results = { code: 3, duration: 12345 };
  await worker.ignore(results);

  assert.ok(logger.workerSuccess.calledWith(results), 'logs worker result');
  assert.equal(message.complete.callCount, 1, 'calls message.complete()');

  logger.teardown();
  assert.end();
});

test('[worker] success', async (assert) => {
  const logger = stubber(Logger).setup();

  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world' };
  const worker = new Worker(message, options);

  const results = { code: 0, duration: 12345 };
  await worker.success(results);

  assert.ok(logger.workerSuccess.calledWith(results), 'logs worker result');
  assert.equal(message.complete.callCount, 1, 'calls message.complete()');

  logger.teardown();
  assert.end();
});

test('[worker] waitFor, exit 0', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  message.env = { Message: 'banana' };
  const options = { command: 'echo ${Message}' };
  const worker = new Worker(message, options);

  const env = process.env;
  process.env = { fake: 'environment' };

  sinon.spy(child_process, 'spawn');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(
    child_process.spawn.calledWith('echo ${Message}', {
      env: Object.assign(message.env, process.env),
      shell: true,
      stdio: 'inherit'
    }),
    'spawned child process properly'
  );

  const results = logger.workerSuccess.args[0][0];
  assert.equal(results.code, 0, 'logged worker success exit code');
  assert.ok(results.duration, 'logged worker success duration');
  assert.equal(message.complete.callCount, 1, 'called message.complete()');

  child_process.spawn.restore();
  process.env = env;
  logger.teardown();
  assert.end();
});

test('[worker] waitFor, exit 1', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  message.env = { Message: 'banana' };
  const options = { command: 'exit 1' };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  const results = logger.workerFailure.args[0][0];
  assert.equal(results.code, 1, 'logged worker failure exit code');
  assert.ok(results.duration, 'logged worker failure duration');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});

test('[worker] waitFor, exit 3', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  message.env = { Message: 'banana' };
  const options = { command: 'exit 3' };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  const results = logger.workerSuccess.args[0][0];
  assert.equal(results.code, 3, 'logged worker success exit code');
  assert.ok(results.duration, 'logged worker success duration');
  assert.equal(message.complete.callCount, 1, 'calls message.complete()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});

test('[worker] waitFor, exit 4', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  message.env = { Message: 'banana' };
  const options = { command: 'exit 4' };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  const results = logger.workerSuccess.args[0][0];
  assert.equal(results.code, 4, 'logged worker success exit code');
  assert.ok(results.duration, 'logged worker success duration');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});

test('[worker] waitFor, child_process.spawn failure', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  message.env = { Message: 'banana' };
  const options = { command: 'echo ${Message}' };
  const worker = new Worker(message, options);
  const err = new Error('foo');

  sinon.stub(child_process, 'spawn').callsFake(() => {
    const p = new events.EventEmitter();
    setImmediate(() => p.emit('error', err));
    return p;
  });

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(logger.workerError.calledWith(err), 'logged worker error');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});
