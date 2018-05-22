
'use strict';

const test = require('tape');
const sinon = require('sinon');
const stubber = require('./stubber');
const Watcher = require('../lib/watcher');
const Message = require('../lib/message');
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

  messages.teardown();
  assert.end();
});

test('[watcher] listens exactly once', async (assert) => {
  const messages = stubber(Messages).setup();
  const message1 = sinon.createStubInstance(Message);
  const message2 = sinon.createStubInstance(Message);

  messages.waitFor
    .onCall(0)
    .returns(Promise.resolve([message1]))
    .onCall(1)
    .returns(Promise.resolve([message2]));

  const watcher = new Watcher({
    queueUrl: 'https://faker',
    workerOptions: { command: 'echo hello world' }
  });

  await watcher.listen();

  assert.equals(
    messages.waitFor.callCount, 1,
    'messages.waitFor is called once.'
  );
  messages.teardown();
  assert.end();
});

test('[watcher] listen', async (assert) => {
  let count = 0;

  const messages = stubber(Messages).setup();
  const worker = stubber(Worker).setup();
  const workerOptions = { command: 'echo hello world' };

  const watcher = new Watcher({
    queueUrl: 'https://faker',
    workerOptions
  });

  const message1 = sinon.createStubInstance(Message);
  const message2 = sinon.createStubInstance(Message);

  messages.waitFor
    .onCall(0)
    .returns(Promise.resolve([message1, message2]));

  worker.waitFor.returns(Promise.resolve());

  try {
    await watcher.listen();
  } catch (err) {
    assert.ifError(err, 'blahblah');
  }

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

});

test('[watcher] factory', (assert) => {
  const watcher = Watcher.create({
    queueUrl: 'https://faker',
    workerOptions: { command: 'echo hello world' }
  });

  assert.ok(watcher instanceof Watcher, 'creates a Watcher object');
  assert.end();
});
