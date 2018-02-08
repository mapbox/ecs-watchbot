'use strict';

const events = require('events');
const child_process = require('child_process');
const test = require('tape');
const sinon = require('sinon');
const Worker = require('../lib/worker');
const Message = require('../lib/message');

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

test('[worker] fail, emits error', async (assert) => {
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world' };
  const worker = new Worker(message, options);

  const err = new Error('foo');
  let caught;
  worker.on('error', (err) => (caught = err));

  await worker.fail(err);

  assert.equal(caught.message, 'foo', 'emits errors passed to .fail()');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');
  assert.end();
});

test('[worker] fail, no error', async (assert) => {
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world' };
  const worker = new Worker(message, options);

  let caught;
  worker.on('error', (err) => (caught = err));

  await worker.fail();

  assert.notOk(caught, 'nothing was emitted');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');
  assert.end();
});

test('[worker] success', async (assert) => {
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world' };
  const worker = new Worker(message, options);

  await worker.success();

  assert.equal(message.complete.callCount, 1, 'calls message.complete()');
  assert.end();
});

test('[worker] waitFor, exit 0', async (assert) => {
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

  assert.equal(message.complete.callCount, 1, 'called message.complete()');
  child_process.spawn.restore();
  process.env = env;
  assert.end();
});

test('[worker] waitFor, exit 1', async (assert) => {
  const message = sinon.createStubInstance(Message);
  message.env = { Message: 'banana' };
  const options = { command: 'exit 1' };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  let caught;
  worker.on('error', (err) => caught = err);

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  assert.equal(caught.message, 'Unexpected worker exit code', 'emitted error has expected message');
  assert.equal(caught.exitCode, 1, 'emitted error has expected .exitCode');
  assert.equal(caught.signal, null, 'emitted error has expected .signal');

  child_process.spawn.restore();
  assert.end();
});

test('[worker] waitFor, exit 3', async (assert) => {
  const message = sinon.createStubInstance(Message);
  message.env = { Message: 'banana' };
  const options = { command: 'exit 3' };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  let caught;
  worker.on('error', (err) => caught = err);

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(message.complete.callCount, 1, 'calls message.complete()');

  assert.notOk(caught, 'no error emitted');

  child_process.spawn.restore();
  assert.end();
});

test('[worker] waitFor, exit 4', async (assert) => {
  const message = sinon.createStubInstance(Message);
  message.env = { Message: 'banana' };
  const options = { command: 'exit 4' };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  let caught;
  worker.on('error', (err) => caught = err);

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  assert.notOk(caught, 'no error emitted');

  child_process.spawn.restore();
  assert.end();
});

test('[worker] waitFor, child_process.spawn failure', async (assert) => {
  const message = sinon.createStubInstance(Message);
  message.env = { Message: 'banana' };
  const options = { command: 'echo ${Message}' };
  const worker = new Worker(message, options);

  sinon.stub(child_process, 'spawn')
    .callsFake(() => {
      const p = new events.EventEmitter();
      setImmediate(() => p.emit('error', new Error('foo')));
      return p;
    });

  let caught;
  worker.on('error', (err) => caught = err);

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  assert.equal(caught.message, 'foo', 'emits error from spawn failure');

  child_process.spawn.restore();
  assert.end();
});
