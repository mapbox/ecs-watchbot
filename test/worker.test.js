'use strict';

const stream = require('stream');
const events = require('events');
const child_process = require('child_process');
const fs = require('fs');
const fsExtra = require('fs-extra');
const test = require('tape');
const sinon = require('sinon');
const FakeEnv = require('fake-env');
const Worker = require('../lib/worker');
const Message = require('../lib/message');
const Logger = require('../lib/logger');
const stubber = require('./stubber');

test('[worker] constructor', (assert) => {
  assert.throws(() => new Worker(), /Invalid Message object/, 'must provide a message object');

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
  const worker = new Worker(message, {
    command: 'echo hello world',
    volumes: ['/tmp']
  });

  assert.equal(worker.message, message, 'sets .message');
  assert.equal(worker.command, 'echo hello world', 'sets .command');

  assert.end();
});

test('[worker] factory', (assert) => {
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world', volumes: ['/tmp'] };
  const worker = Worker.create(message, options);
  assert.ok(worker instanceof Worker, 'returns a Worker object');
  assert.end();
});

test('[worker] fail', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world', volumes: ['/tmp'] };
  const worker = new Worker(message, options);

  const results = {
    code: 124,
    signal: 'SIGTERM',
    duration: 12345,
    response_duration: 12345
  };
  await worker.fail(results);

  assert.ok(logger.workerFailure.calledWith(results), 'logs worker failure');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  logger.teardown();
  assert.end();
});

test('[worker] noop', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world', volumes: ['/tmp'] };
  const worker = new Worker(message, options);

  const results = { code: 4, duration: 12345, response_duration: 12345 };
  await worker.noop(results);

  assert.ok(logger.workerSuccess.calledWith(results), 'logs worker result');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  logger.teardown();
  assert.end();
});

test('[worker] ignore', async (assert) => {
  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world', volumes: ['/tmp'] };
  const worker = new Worker(message, options);

  const results = { code: 3, duration: 12345, response_duration: 12345 };
  await worker.ignore(results);

  assert.ok(logger.workerFailure.calledWith(results), 'logs worker result');
  assert.equal(message.complete.callCount, 1, 'calls message.complete()');

  logger.teardown();
  assert.end();
});

test('[worker] success', async (assert) => {
  const logger = stubber(Logger).setup();

  const message = sinon.createStubInstance(Message);
  const options = { command: 'echo hello world', volumes: ['/tmp'] };
  const worker = new Worker(message, options);

  const results = { code: 0, duration: 12345, response_duration: 12345 };
  await worker.success(results);

  assert.ok(logger.workerSuccess.calledWith(results), 'logs worker result');
  assert.equal(message.complete.callCount, 1, 'calls message.complete()');

  logger.teardown();
  assert.end();
});

test.skip('[worker] waitFor, exit 0', async (assert) => {
  sinon.stub(Date.prototype, 'toGMTString').returns('Fri, 09 Feb 2018 21:57:55 GMT');

  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  message.id = '895ab607-3767-4bbb-bd45-2a3b341cbc46';
  message.env = {
    Message: 'banana',
    SentTimestamp: '2019-02-09T21:57:55.000Z'
  };

  const fakeEnv = new FakeEnv({
    fake: 'environment'
  });

  const options = { command: 'echo ${Message}', volumes: ['/tmp', '/var/tmp'] };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');
  sinon.spy(process.stdout, 'write');
  sinon.spy(process.stderr, 'write');
  sinon.spy(fsExtra, 'emptyDir');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  const data = process.stdout.write.args[0][0];
  process.stdout.write.restore();
  process.stderr.write.restore();

  assert.equal(
    data,
    '[Fri, 09 Feb 2018 21:57:55 GMT] [worker] [895ab607-3767-4bbb-bd45-2a3b341cbc46] banana\n',
    'prefixed worker output'
  );

  assert.ok(
    child_process.spawn.calledWith('echo ${Message}', {
      env: Object.assign(message.env, process.env),
      shell: true,
      stdio: [process.stdin, 'pipe', 'pipe']
    }),
    'spawned child process properly'
  );

  const results = logger.workerSuccess.args[0][0];
  assert.equal(results.code, 0, 'logged worker success exit code');
  assert.ok(results.duration, 'logged worker success duration');
  assert.ok(results.response_duration, 'logged worker response duration');
  assert.equal(message.complete.callCount, 1, 'called message.complete()');

  assert.equal(fsExtra.emptyDir.callCount, 2, 'called fsExtra.emptyDir() twice');
  assert.ok(fsExtra.emptyDir.calledWith('/tmp'), 'called fsExtra.emptyDir() on /tmp');
  assert.ok(fsExtra.emptyDir.calledWith('/var/tmp'), 'called fsExtra.emptyDir() on /tmp');

  fsExtra.emptyDir.restore();
  Date.prototype.toGMTString.restore();
  child_process.spawn.restore();
  fakeEnv.restore();
  logger.teardown();
  assert.end();
});

test.skip('[worker] waitFor, write to /tmp, exit 0', async (assert) => {
  sinon.stub(Date.prototype, 'toGMTString').returns('Fri, 09 Feb 2018 21:57:55 GMT');

  const logger = stubber(Logger).setup();
  const message = sinon.createStubInstance(Message);
  message.id = '895ab607-3767-4bbb-bd45-2a3b341cbc46';
  message.env = {
    Message: 'banana',
    SentTimestamp: '2019-02-09T21:57:55.000Z'
  };

  logger.log.restore();
  logger.stream.restore();
  logger.type = 'worker';
  logger.message = message;

  const options = {
    command: 'echo ${Message} > /tmp/banana.txt && cat /tmp/banana.txt',
    volumes: ['/tmp']
  };
  const worker = new Worker(message, options);

  const fakeEnv = new FakeEnv({
    fake: 'environment'
  });

  sinon.spy(child_process, 'spawn');
  sinon.spy(process.stdout, 'write');
  sinon.spy(process.stderr, 'write');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  const data = process.stdout.write.args[0][0];
  process.stdout.write.restore();
  process.stderr.write.restore();

  assert.equal(
    data,
    '[Fri, 09 Feb 2018 21:57:55 GMT] [worker] [895ab607-3767-4bbb-bd45-2a3b341cbc46] banana\n',
    'prefixed worker output'
  );

  assert.ok(
    child_process.spawn.calledWith('echo ${Message} > /tmp/banana.txt && cat /tmp/banana.txt', {
      env: Object.assign(message.env, process.env),
      shell: true,
      stdio: [process.stdin, 'pipe', 'pipe']
    }),
    'spawned child process properly'
  );

  const results = logger.workerSuccess.args[0][0];
  assert.equal(results.code, 0, 'logged worker success exit code');
  assert.ok(results.duration, 'logged worker success duration');
  assert.ok(results.response_duration, 'logged worker response duration');
  assert.equal(message.complete.callCount, 1, 'called message.complete()');

  const tmpFiles = fs.readdirSync('/tmp');
  assert.equal(tmpFiles.length, 0, 'all files in /tmp are cleared out after the worker complets');

  Date.prototype.toGMTString.restore();
  child_process.spawn.restore();
  fakeEnv.restore();
  logger.teardown();
  assert.end();
});

test.skip('[worker] waitFor, exit 1', async (assert) => {
  const logger = stubber(Logger).setup();
  logger.log.restore();
  logger.stream.restore();
  const message = sinon.createStubInstance(Message);
  message.env = {
    Message: 'banana',
    SentTimestamp: '2019-02-09T21:57:55.000Z'
  };
  const options = { command: 'exit 1', volumes: ['/tmp'] };
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
  assert.ok(results.response_duration, 'logged worker response duration');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});

test.skip('[worker] waitFor, exit 3', async (assert) => {
  const logger = stubber(Logger).setup();
  logger.log.restore();
  logger.stream.restore();
  const message = sinon.createStubInstance(Message);
  message.env = {
    Message: 'banana',
    SentTimestamp: '2019-02-09T21:57:55.000Z'
  };
  const options = { command: 'exit 3', volumes: ['/tmp'] };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  const results = logger.workerFailure.args[0][0];
  assert.equal(results.code, 3, 'logged worker failure exit code');
  assert.ok(results.duration, 'logged worker failure duration');
  assert.ok(results.response_duration, 'logged worker response duration');
  assert.equal(message.complete.callCount, 1, 'calls message.complete()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});

test.skip('[worker] waitFor, exit 4', async (assert) => {
  const logger = stubber(Logger).setup();
  logger.log.restore();
  logger.stream.restore();
  const message = sinon.createStubInstance(Message);
  message.env = {
    Message: 'banana',
    SentTimestamp: '2019-02-09T21:57:55.000Z'
  };
  const options = { command: 'exit 4', volumes: ['/tmp'] };
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
  assert.ok(results.response_duration, 'logged worker response duration');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});

test.skip('[worker] waitFor, child_process.spawn failure', async (assert) => {
  const logger = stubber(Logger).setup();
  logger.log.restore();
  logger.stream.restore();
  const message = sinon.createStubInstance(Message);
  message.env = {
    Message: 'banana',
    SentTimestamp: '2019-02-09T21:57:55.000Z'
  };
  const options = { command: 'echo ${Message}', volumes: ['/tmp'] };
  const worker = new Worker(message, options);
  const err = new Error('foo');

  sinon.stub(child_process, 'spawn').callsFake(() => {
    const p = new events.EventEmitter();
    p.stdout = new stream.Readable({
      read: function () {
        this.push(null);
      }
    });
    p.stderr = new stream.Readable({
      read: function () {
        this.push(null);
      }
    });
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

test.skip('[worker] waitFor, 0 maxJobDuration 2 second task success', async (assert) => {
  const logger = stubber(Logger).setup();
  logger.log.restore();
  logger.stream.restore();
  const message = sinon.createStubInstance(Message);
  message.env = {
    Message: 'banana',
    SentTimestamp: '2019-02-09T21:57:55.000Z'
  };

  const options = {
    command: 'sleep 2; exit 0',
    volumes: ['/tmp'],
    maxJobDuration: 0
  };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  const results = logger.workerSuccess.args[0][0];
  assert.equal(results.code, 0, 'Success!');
  assert.ok(results.duration, 'logged worker success duration');
  assert.ok(results.response_duration, 'logged worker response duration');
  assert.equal(message.retry.callCount, 0, 'does not call message.retry()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});

test.skip('[worker] waitFor, 2 second task completes', async (assert) => {
  const logger = stubber(Logger).setup();
  logger.log.restore();
  logger.stream.restore();
  const message = sinon.createStubInstance(Message);
  message.env = {
    Message: 'banana',
    SentTimestamp: '2019-02-09T21:57:55.000Z'
  };

  const options = {
    command: 'sleep 2; exit 0',
    volumes: ['/tmp'],
    maxJobDuration: 3
  };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  const results = logger.workerSuccess.args[0][0];
  assert.equal(results.code, 0, 'Success!');
  assert.ok(results.duration, 'logged worker success duration');
  assert.ok(results.response_duration, 'logged worker response duration');
  assert.equal(message.retry.callCount, 0, 'does not call message.retry()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});

test.skip('[worker] waitFor, timeout error', async (assert) => {
  const logger = stubber(Logger).setup();
  logger.log.restore();
  logger.stream.restore();
  const message = sinon.createStubInstance(Message);
  message.env = {
    Message: 'banana',
    SentTimestamp: '2019-02-09T21:57:55.000Z'
  };

  const options = {
    command: 'while true; do echo ${Message}; sleep 2; done;',
    volumes: ['/tmp'],
    maxJobDuration: 3
  };
  const worker = new Worker(message, options);

  sinon.spy(child_process, 'spawn');

  try {
    await worker.waitFor();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  const results = logger.workerFailure.args[0][0];
  assert.equal(results.code, null, 'Timeout has null result code');
  assert.ok(results.duration, 'logged worker failure duration');
  assert.ok(results.response_duration, 'logged worker response duration');
  assert.equal(message.retry.callCount, 1, 'calls message.retry()');

  child_process.spawn.restore();
  logger.teardown();
  assert.end();
});
