'use strict';

const test = require('tape');
const sinon = require('sinon');
const Logger = require('../lib/logger');
const Message = require('../lib/message');
const os = require('os');

const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789012/fake';
const sqsMessage = {
  MessageId: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
  ReceiptHandle: 'a',
  Body: JSON.stringify({ Subject: 'one', Message: '1' }),
  Attributes: {
    SentTimestamp: '1518027533772',
    ApproximateFirstReceiveTimestamp: '1518027533772',
    ApproximateReceiveCount: 3
  }
};
const message = new Message(sqsMessage, { queueUrl });

test('[logger] constructor', (assert) => {
  assert.throws(
    () => new Logger({ type: 'pie', structuredLogging: true }),
    /Invalid logger type/,
    'throws error on invalid type'
  );

  assert.throws(
    () => new Logger({ type: 'watcher', structuredLogging: true }, {}),
    /Invalid message/,
    'throws error on invalid message'
  );

  assert.doesNotThrow(
    () => new Logger({ type: 'watcher', structuredLogging: true }),
    'message is not required'
  );

  const logger = new Logger(
    { type: 'worker', structuredLogging: true },
    message
  );

  assert.equal(logger.type, 'worker', 'sets .type');
  assert.equal(logger.message, message, 'sets .message');

  assert.end();
});

test('[logger] factory', (assert) => {
  const message = sinon.createStubInstance(Message);
  const logger = Logger.create(
    { type: 'watcher', structuredLogging: true },
    message
  );
  assert.ok(logger instanceof Logger, 'returns a Logger object');
  assert.equal(logger.message, message, 'sets .message');
  assert.end();
});

test('[logger] messageReceived', (assert) => {
  sinon.stub(Date.prototype, 'toISOString').returns('2021-11-09T06:43:12.123Z');
  sinon.stub(os, 'hostname').returns('my-hostname');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger(
    { type: 'watcher', structuredLogging: true },
    message
  );
  logger.messageReceived();

  const data = JSON.parse(process.stdout.write.args[0][0]);
  delete data.pid;
  assert.same(
    data,
    {
      v: 0,
      level: 30,
      name: 'watcher',
      hostname: 'my-hostname',
      time: '2021-11-09T06:43:12.123Z',
      watchbot_sqs_message_id: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
      subject: 'one',
      message: '1',
      receives: '3'
    },
    'expected message'
  );

  Date.prototype.toISOString.restore();
  process.stdout.write.restore();
  os.hostname.restore();
  assert.end();
});

test('[logger] workerSuccess', (assert) => {
  sinon.stub(Date.prototype, 'toISOString').returns('2021-11-09T06:43:12.123Z');
  sinon.stub(os, 'hostname').returns('my-hostname');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger(
    { type: 'watcher', structuredLogging: true },
    message
  );
  logger.workerSuccess({ code: 0, duration: 12345, response_duration: 12345 });

  const data = JSON.parse(process.stdout.write.args[0][0]);
  delete data.pid;
  assert.same(
    data,
    {
      v: 0,
      level: 30,
      name: 'watcher',
      hostname: 'my-hostname',
      time: '2021-11-09T06:43:12.123Z',
      watchbot_sqs_message_id: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
      worker_event: 'success',
      code: 0,
      duration: 12345,
      response_duration: 12345
    },
    'expected message'
  );

  Date.prototype.toISOString.restore();
  process.stdout.write.restore();
  os.hostname.restore();
  assert.end();
});

test('[logger] workerFailure', (assert) => {
  sinon.stub(Date.prototype, 'toISOString').returns('2021-11-09T06:43:12.123Z');
  sinon.stub(os, 'hostname').returns('my-hostname');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger(
    { type: 'watcher', structuredLogging: true },
    message
  );
  logger.workerFailure({
    code: 124,
    signal: 'SIGTERM',
    duration: 12345,
    response_duration: 12345
  });

  const data = JSON.parse(process.stdout.write.args[0][0]);
  delete data.pid;
  assert.same(
    data,
    {
      v: 0,
      level: 30,
      name: 'watcher',
      hostname: 'my-hostname',
      time: '2021-11-09T06:43:12.123Z',
      watchbot_sqs_message_id: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
      worker_event: 'failure',
      code: 124,
      signal: 'SIGTERM',
      duration: 12345,
      response_duration: 12345
    },
    'expected message'
  );

  Date.prototype.toISOString.restore();
  process.stdout.write.restore();
  os.hostname.restore();
  assert.end();
});

test('[logger] workerError', (assert) => {
  sinon.stub(Date.prototype, 'toISOString').returns('2021-11-09T06:43:12.123Z');
  sinon.stub(os, 'hostname').returns('my-hostname');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger(
    { type: 'watcher', structuredLogging: true },
    message
  );
  logger.workerError(new Error('foo'));

  const data = JSON.parse(process.stdout.write.args[0][0]);
  delete data.pid;
  assert.same(
    data,
    {
      v: 0,
      level: 50,
      name: 'watcher',
      hostname: 'my-hostname',
      time: '2021-11-09T06:43:12.123Z',
      watchbot_sqs_message_id: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
      worker_event: 'error',
      msg: 'foo',
      err: {}
    },
    'expected message'
  );

  Date.prototype.toISOString.restore();
  process.stdout.write.restore();
  os.hostname.restore();
  assert.end();
});

test('[logger] queueError', (assert) => {
  sinon.stub(Date.prototype, 'toISOString').returns('2021-11-09T06:43:12.123Z');
  sinon.stub(os, 'hostname').returns('my-hostname');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger({ type: 'watcher', structuredLogging: true });
  logger.queueError(new Error('foo'));

  const data = JSON.parse(process.stdout.write.args[0][0]);
  delete data.pid;
  assert.same(
    data,
    {
      v: 0,
      level: 50,
      name: 'watcher',
      hostname: 'my-hostname',
      time: '2021-11-09T06:43:12.123Z',
      sqs_event: 'error',
      msg: 'foo',
      err: {}
    },
    'expected message'
  );

  Date.prototype.toISOString.restore();
  os.hostname.restore();
  process.stdout.write.restore();
  assert.end();
});

test('[logger] log', (assert) => {
  sinon.stub(Date.prototype, 'toISOString').returns('2021-11-09T06:43:12.123Z');
  sinon.stub(os, 'hostname').returns('my-hostname');
  sinon.spy(process.stdout, 'write');

  let logger = new Logger({ type: 'worker', structuredLogging: true }, message);
  logger.log('hello there');

  let data = JSON.parse(process.stdout.write.args[0][0]);
  delete data.pid;
  process.stdout.write.restore();
  assert.same(
    data,
    {
      v: 0,
      level: 30,
      name: 'worker',
      hostname: 'my-hostname',
      time: '2021-11-09T06:43:12.123Z',
      watchbot_sqs_message_id: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
      msg: 'hello there'
    },
    'prefixed with timestamp, type, and message id'
  );

  sinon.spy(process.stdout, 'write');
  logger = new Logger({ type: 'watcher', structuredLogging: true });
  logger.log('ok then');

  data = JSON.parse(process.stdout.write.args[0][0]);
  delete data.pid;
  assert.same(
    data,
    {
      v: 0,
      level: 30,
      name: 'watcher',
      hostname: 'my-hostname',
      time: '2021-11-09T06:43:12.123Z',
      msg: 'ok then'
    },
    'prefixed with timestamp, and type'
  );

  Date.prototype.toISOString.restore();
  os.hostname.restore();
  process.stdout.write.restore();
  assert.end();
});

test('[logger] stream', async (assert) => {
  sinon.stub(Date.prototype, 'toISOString').returns('2021-11-09T06:43:12.123Z');
  sinon.stub(os, 'hostname').returns('my-hostname');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger(
    { type: 'worker', structuredLogging: true },
    message
  );
  const writable = logger.stream();

  writable.write('hello there\nhow are you');
  writable
    .on('finish', () => {
      const first = JSON.parse(process.stdout.write.args[0][0]);
      const second = JSON.parse(process.stdout.write.args[1][0]);
      delete first.pid;
      delete second.pid;
      process.stdout.write.restore();
      assert.same(
        first,
        {
          v: 0,
          level: 30,
          name: 'worker',
          hostname: 'my-hostname',
          time: '2021-11-09T06:43:12.123Z',
          watchbot_sqs_message_id: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
          msg: 'hello there'
        },
        'prefixed first line with timestamp, type, and message id'
      );

      assert.same(
        second,
        {
          v: 0,
          level: 30,
          name: 'worker',
          hostname: 'my-hostname',
          time: '2021-11-09T06:43:12.123Z',
          watchbot_sqs_message_id: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
          msg: 'how are you'
        },
        'splits on newline, prefixed second line with timestamp, type, and message id'
      );

      Date.prototype.toISOString.restore();
      os.hostname.restore();
      assert.end();
    })
    .end();
});

test('[logger] stream with JSON output', async (assert) => {
  sinon.stub(Date.prototype, 'toISOString').returns('2021-11-09T06:43:12.123Z');
  sinon.stub(os, 'hostname').returns('my-hostname');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger(
    { type: 'worker', structuredLogging: true },
    message
  );
  const writable = logger.stream();

  writable.write('{"id":123, "content": "asdf"}\nhow are you');
  writable
    .on('finish', () => {
      const first = JSON.parse(process.stdout.write.args[0][0]);
      const second = JSON.parse(process.stdout.write.args[1][0]);
      delete first.pid;
      delete second.pid;
      process.stdout.write.restore();
      assert.same(
        first,
        {
          v: 0,
          level: 30,
          name: 'worker',
          hostname: 'my-hostname',
          time: '2021-11-09T06:43:12.123Z',
          watchbot_sqs_message_id: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
          id: 123,
          content: 'asdf'
        },
        'prefixed first line with timestamp, type, and message id, JSON output merged'
      );

      assert.same(
        second,
        {
          v: 0,
          level: 30,
          name: 'worker',
          hostname: 'my-hostname',
          time: '2021-11-09T06:43:12.123Z',
          watchbot_sqs_message_id: '895ab607-3767-4bbb-bd45-2a3b341cbc46',
          msg: 'how are you'
        },
        'splits on newline, prefixed second line with timestamp, type, and message id, msg property'
      );

      Date.prototype.toISOString.restore();
      os.hostname.restore();
      assert.end();
    })
    .end();
});
