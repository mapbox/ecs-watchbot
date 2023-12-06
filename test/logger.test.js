'use strict';

const test = require('tape');
const sinon = require('sinon');
const Logger = require('../lib/logger');
const Message = require('../lib/message');

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
    () => new Logger('pie'),
    /Invalid logger type/,
    'throws error on invalid type'
  );

  assert.throws(
    () => new Logger('watcher', {}),
    /Invalid message/,
    'throws error on invalid message'
  );

  assert.doesNotThrow(() => new Logger('watcher'), 'message is not required');

  const logger = new Logger('worker', message);

  assert.equal(logger.type, 'worker', 'sets .type');
  assert.equal(logger.message, message, 'sets .message');

  assert.end();
});

test('[logger] factory', (assert) => {
  const message = sinon.createStubInstance(Message);
  const logger = Logger.create('watcher', message);
  assert.ok(logger instanceof Logger, 'returns a Logger object');
  assert.equal(logger.message, message, 'sets .message');
  assert.end();
});

test('[logger] messageReceived', (assert) => {
  sinon
    .stub(Date.prototype, 'toGMTString')
    .returns('Fri, 09 Feb 2018 21:57:55 GMT');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger('watcher', message);
  logger.messageReceived();

  const data = process.stdout.write.args[0][0];
  assert.equal(
    data,
    '[Fri, 09 Feb 2018 21:57:55 GMT] [watcher] [895ab607-3767-4bbb-bd45-2a3b341cbc46] {"subject":"one","message":"1","receives":"3"}\n',
    'expected message'
  );

  Date.prototype.toGMTString.restore();
  process.stdout.write.restore();
  assert.end();
});

test('[logger] workerSuccess', (assert) => {
  sinon
    .stub(Date.prototype, 'toGMTString')
    .returns('Fri, 09 Feb 2018 21:57:55 GMT');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger('watcher', message);
  logger.workerSuccess({ code: 0, duration: 12345, response_duration: 12345 });

  const data = process.stdout.write.args[0][0];
  assert.equal(
    data,
    '[Fri, 09 Feb 2018 21:57:55 GMT] [watcher] [895ab607-3767-4bbb-bd45-2a3b341cbc46] {"code":0,"duration":12345,"response_duration":12345}\n',
    'expected message'
  );

  Date.prototype.toGMTString.restore();
  process.stdout.write.restore();
  assert.end();
});

test('[logger] workerFailure', (assert) => {
  sinon
    .stub(Date.prototype, 'toGMTString')
    .returns('Fri, 09 Feb 2018 21:57:55 GMT');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger('watcher', message);
  logger.workerFailure({
    code: 124,
    signal: 'SIGTERM',
    duration: 12345,
    response_duration: 12345
  });

  const data = process.stdout.write.args[0][0];
  assert.equal(
    data,
    '[Fri, 09 Feb 2018 21:57:55 GMT] [watcher] [895ab607-3767-4bbb-bd45-2a3b341cbc46] [failure] {"code":124,"signal":"SIGTERM","duration":12345,"response_duration":12345}\n',
    'expected message'
  );

  Date.prototype.toGMTString.restore();
  process.stdout.write.restore();
  assert.end();
});

test('[logger] workerError', (assert) => {
  sinon
    .stub(Date.prototype, 'toGMTString')
    .returns('Fri, 09 Feb 2018 21:57:55 GMT');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger('watcher', message);
  logger.workerError(new Error('foo'));

  const data = process.stdout.write.args[0][0];
  assert.equal(
    data,
    '[Fri, 09 Feb 2018 21:57:55 GMT] [watcher] [895ab607-3767-4bbb-bd45-2a3b341cbc46] [error] [worker] foo\n',
    'expected message'
  );

  Date.prototype.toGMTString.restore();
  process.stdout.write.restore();
  assert.end();
});

test('[logger] queueError', (assert) => {
  sinon
    .stub(Date.prototype, 'toGMTString')
    .returns('Fri, 09 Feb 2018 21:57:55 GMT');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger('watcher');
  logger.queueError(new Error('foo'));

  const data = process.stdout.write.args[0][0];
  assert.equal(
    data,
    '[Fri, 09 Feb 2018 21:57:55 GMT] [watcher] [error] [sqs] foo\n',
    'expected message'
  );

  Date.prototype.toGMTString.restore();
  process.stdout.write.restore();
  assert.end();
});

test('[logger] log', (assert) => {
  sinon
    .stub(Date.prototype, 'toGMTString')
    .returns('Fri, 09 Feb 2018 21:57:55 GMT');
  sinon.spy(process.stdout, 'write');

  let logger = new Logger('worker', message);
  logger.log('hello there');

  let data = process.stdout.write.args[0][0];
  process.stdout.write.restore();
  assert.equal(
    data,
    '[Fri, 09 Feb 2018 21:57:55 GMT] [worker] [895ab607-3767-4bbb-bd45-2a3b341cbc46] hello there\n',
    'prefixed with timestamp, type, and message id'
  );

  sinon.spy(process.stdout, 'write');
  logger = new Logger('watcher');
  logger.log('ok then');

  data = process.stdout.write.args[0][0];
  process.stdout.write.restore();
  assert.equal(
    data,
    '[Fri, 09 Feb 2018 21:57:55 GMT] [watcher] ok then\n',
    'prefixed with timestamp, and type'
  );

  Date.prototype.toGMTString.restore();
  assert.end();
});

test('[logger] stream', async (assert) => {
  sinon
    .stub(Date.prototype, 'toGMTString')
    .returns('Fri, 09 Feb 2018 21:57:55 GMT');
  sinon.spy(process.stdout, 'write');

  const logger = new Logger('worker', message);
  const writable = logger.stream();

  writable.write('hello there\nhow are you');
  writable
    .on('finish', () => {
      const first = process.stdout.write.args[0][0];
      const second = process.stdout.write.args[1][0];
      process.stdout.write.restore();
      assert.equal(
        first,
        '[Fri, 09 Feb 2018 21:57:55 GMT] [worker] [895ab607-3767-4bbb-bd45-2a3b341cbc46] hello there\n',
        'prefixed first line with timestamp, type, and message id'
      );

      assert.equal(
        second,
        '[Fri, 09 Feb 2018 21:57:55 GMT] [worker] [895ab607-3767-4bbb-bd45-2a3b341cbc46] how are you\n',
        'splits on newline, prefixed second line with timestamp, type, and message id'
      );

      Date.prototype.toGMTString.restore();
      assert.end();
    })
    .end();
});
