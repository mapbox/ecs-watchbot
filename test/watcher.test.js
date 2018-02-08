'use strict';

const events = require('events');
const test = require('tape');
const stubber = require('./stubber');
const Watcher = require('../lib/watcher');
const Messages = require('../lib/messages');
const Worker = require('../lib/worker');

test('[watcher] constructor', (assert) => {
  const messages = stubber(Messages).setup();

  assert.throws(
    () => new Watcher(),
    /Missing options: workerOptions/,
    'throws for missing workerOptions'
  );

  assert.throws(
    () => new Watcher({ workerOptions: {} }),
    /Missing options: queueUrl/,
    'throws for missing queueUrl option'
  );

  const options = {
    queueUrl: 'https://faker',
    workerOptions: { command: 'echo hello world' }
  };
  const watcher = new Watcher(options);

  assert.deepEqual(
    watcher.workerOptions,
    options.workerOptions,
    'sets .workerOptions'
  );
  assert.equal(watcher.queueUrl, options.queueUrl, 'sets .queueUrl');
  assert.ok(watcher.messages instanceof Messages, 'sets .messages');

  watcher.on('error', (err) => {
    assert.equal(
      err.message,
      'foo',
      'setup listener for .messages error events'
    );
    messages.teardown();
    assert.end();
  });

  messages.emit('error', new Error('foo'));
});

test('[watcher] listen listens until you stop it', async (assert) => {
  const messages = stubber(Messages).setup();
  messages.waitFor.returns(Promise.resolve([]));

  const watcher = new Watcher({
    queueUrl: 'https://faker',
    workerOptions: { command: 'echo hello world' }
  });

  setTimeout(() => (watcher.stop = true), 1000);

  await watcher.listen();

  assert.pass('listened until .stop was set to true');
  assert.ok(
    messages.waitFor.callCount > 2,
    'as evidenced by repeated calls to messages.waitFor'
  );
  messages.teardown();
  assert.end();
});

test('[watcher] listen', async (assert) => {
  const messages = stubber(Messages).setup();
  const worker = stubber(Worker).setup();
  const workerOptions = { command: 'echo hello world' };

  const watcher = new Watcher({
    queueUrl: 'https://faker',
    workerOptions
  });

  const message1 = new events.EventEmitter();
  const message2 = new events.EventEmitter();

  messages.waitFor
    .onCall(0)
    .returns(Promise.resolve([]))
    .onCall(1)
    .returns(Promise.resolve([message1, message2]))
    .onCall(2)
    .callsFake(() => {
      message1.emit('error', new Error('foo'));
      worker.emit('error', new Error('bar'));
      watcher.stop = true;
      return Promise.resolve([]);
    });

  worker.waitFor
    .onCall(0)
    .returns(Promise.resolve())
    .onCall(1)
    .callsFake(() => Promise.reject(new Error('baz')));

  const caught = {
    count: 0,
    errors: []
  };

  watcher.on('error', (err) => {
    caught.count++;
    caught.errors.push(err.message);

    if (caught.count === 4) {
      assert.deepEqual(
        caught.errors,
        ['baz', 'foo', 'bar', 'bar'],
        'sets up error handlers for workers and messages'
      );

      assert.ok(
        Worker.create.calledWith(message1, workerOptions),
        'creates worker for message1'
      );

      assert.ok(
        Worker.create.calledWith(message2, workerOptions),
        'creates worker for message2'
      );

      assert.equal(worker.waitFor.callCount, 2, 'waits for both workers');

      messages.teardown();
      worker.teardown();
      assert.end();
    }
  });

  try {
    await watcher.listen();
  } catch (err) {
    assert.ifError(err, 'failed');
  }
});

test('[watcher] factory', (assert) => {
  const watcher = Watcher.create({
    queueUrl: 'https://faker',
    workerOptions: { command: 'echo hello world' }
  });

  assert.ok(watcher instanceof Watcher, 'creates a Watcher object');
  assert.end();
});
