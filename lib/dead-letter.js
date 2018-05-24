/* eslint-disable no-console */

var AWS = require('aws-sdk');
var inquirer = require('inquirer');
var stream = require('stream');
var Queue = require('p-queue');
var logs = require('./logs');
var Spinner = require('cli-spinner').Spinner;

module.exports = function(options, callback) {
  var cfn = new AWS.CloudFormation({ region: options.region });
  var sqs = new AWS.SQS({ region: options.region });

  var actions = { purge, writeOut, replay, triage };

  findQueues(cfn, options)
    .then((queues) => selectQueue(queues))
    .then((queue) => triageSelection(queue))
    .then((data) => actions[data.action](sqs, data.queue))
    .then(() => callback())
    .catch((err) => callback(err));
};

function findQueues(cfn, options) {
  return cfn.describeStacks({ StackName: options.stackName }).promise().then((res) => {
    if (!res.Stacks[0])
      return Promise.reject(new Error(`Could not find ${options.stackName} in ${options.region}`));

    var deadLetterQueues = res.Stacks[0].Outputs
      .filter((o) => /DeadLetterQueueUrl/.test(o.OutputKey))
      .map((o) => ({
        prefix: o.OutputKey.replace('DeadLetterQueueUrl', ''),
        url: o.OutputValue
      }));

    var workQueues = res.Stacks[0].Outputs
      .filter((o) => /QueueUrl/.test(o.OutputKey) && !/DeadLetterQueueUrl/.test(o.OutputKey))
      .map((o) => ({
        prefix: o.OutputKey.replace('QueueUrl', ''),
        url: o.OutputValue
      }));

    var logGroups = res.Stacks[0].Outputs
      .filter((o) => /LogGroup/.test(o.OutputKey))
      .map((o) => ({
        prefix: o.OutputKey.replace('LogGroup', ''),
        arn: o.OutputValue
      }));

    return { deadLetterQueues, workQueues, logGroups };
  });
}

function selectQueue(queues) {
  if (queues.deadLetterQueues.length === 1) return Promise.resolve({
    deadLetter: queues.deadLetterQueues[0].url,
    work: queues.workQueues.find((queue) => queue.prefix === queues.deadLetterQueues[0].prefix).url,
    logs: queues.logGroups.find((group) => group.prefix === queues.deadLetterQueues[0].prefix).arn
  });

  return inquirer.prompt([
    {
      type: 'list',
      name: 'queue',
      message: 'Which queue would you like to triage?',
      choices: queues.deadLetterQueues.map((queue) => queue.prefix)
    }
  ]).then((answers) => {
    var deadLetterQueue = queues.deadLetterQueues.find((queue) => queue.prefix === answers.queue);
    return {
      deadLetter: deadLetterQueue.url,
      work: queues.workQueues.find((queue) => queue.prefix === deadLetterQueue.prefix).url,
      logs: queues.logGroups.find((group) => group.prefix === deadLetterQueue.prefix).arn
    };
  });
}

function triageSelection(queue) {
  return inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Would you like to:',
      choices: [
        'Triage dead messages individually?',
        'Print out all dead messages?',
        'Return all dead messages to the work queue?',
        'Purge the dead letter queue?'
      ]
    }
  ]).then((answers) => {
    var mapping = {
      'Purge the dead letter queue?': 'purge',
      'Return all dead messages to the work queue?': 'replay',
      'Triage dead messages individually?': 'triage',
      'Print out all dead messages?': 'writeOut'
    };

    return { queue, action: mapping[answers.action] };
  });
}

function purge(sqs, queue) {
  return inquirer.prompt([
    {
      type: 'confirm',
      name: 'purge',
      message: 'You are about to remove all jobs from the dead letter queue permanently. Are you sure?'
    }
  ]).then((answers) => {
    if (answers.purge)
      return sqs.purgeQueue({ QueueUrl: queue.deadLetter }).promise();
    return Promise.resolve();
  });
}

function writeOut(sqs, queue) {
  var reciever = receiveAll(sqs, queue.deadLetter);

  var stringifier = new stream.Transform({
    objectMode: true,
    transform: function(msg, _, callback) {
      var data = { subject: msg.subject, message: msg.message };
      this.push(`${JSON.stringify(data)}\n`);
      stringifier.handles.push(msg.handle);
      callback();
    }
  });
  stringifier.handles = [];

  return new Promise((resolve, reject) => {
    var done = () => returnMany(sqs, queue.deadLetter, stringifier.handles)
      .then(() => resolve())
      .catch((err) => reject(err));

    reciever
        .on('error', reject)
      .pipe(stringifier)
        .on('error', reject)
        .on('end', done)
      .pipe(process.stdout);
  });
}

function replay(sqs, queue) {
  return inquirer.prompt([
    {
      type: 'confirm',
      name: 'replayAll',
      message: 'You are about to return all messages in the dead letter queue to the work queue. Are you sure?'
    }
  ]).then((answers) => {
    if (!answers.replayAll) return Promise.resolve();

    var spinner = new Spinner('Returning all dead messages to the work queue...');
    spinner.setSpinnerString('⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆');
    spinner.start();

    var reciever = receiveAll(sqs, queue.deadLetter);

    var replayer = new stream.Writable({
      objectMode: true,
      write: function(msg, _, callback) {
        replayOne(sqs, queue.work, msg)
          .then(() => deleteOne(sqs, queue.deadLetter, msg))
          .then(() => callback())
          .catch((err) => callback(err));
      }
    });

    return new Promise((resolve, reject) => {
      reciever
          .on('error', reject)
        .pipe(replayer)
          .on('error', reject)
          .on('finish', resolve);
    })
    .then(() => spinner.stop(true));
  });
}

function triage(sqs, queue) {
  return new Promise((resolve, reject) => {
    (function recurse() {
      triageOne(sqs, queue)
        .then(() => recurse())
        .catch((err) => {
          if (err.finished) return resolve();
          reject(err);
        });
    })();
  });
}

function triagePrompts(sqs, queue, message) {
  var actions = { replayOne, returnOne, deleteOne };

  return inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Would you like to:',
      choices: [
        'View this message\'s recent logs?',
        'Return this message to the work queue?',
        'Return this message to the dead letter queue?',
        'Delete this message entirely?',
        'Stop individual triage?'
      ]
    }
  ]).then((answers) => {
    var mapping = {
      'View this message\'s recent logs?': 'logs',
      'Return this message to the work queue?': 'replayOne',
      'Return this message to the dead letter queue?': 'returnOne',
      'Delete this message entirely?': 'deleteOne',
      'Stop individual triage?': 'stop'
    };

    var choice = mapping[answers.action];
    var queueUrl = choice === 'replayOne' ? queue.work : queue.deadLetter;

    if (choice === 'logs') return getLogs(sqs, queue, message);

    if (choice === 'stop') return returnOne(sqs, queueUrl, message)
      .then(() => Promise.reject({ finished: true }));

    if (choice === 'replayOne') return replayOne(sqs, queueUrl, message)
      .then(() => deleteOne(sqs, queue.deadLetter, message));

    return actions[choice](sqs, queueUrl, message);
  });
}

function triageOne(sqs, queue) {
  return receive(sqs, 1, queue.deadLetter)
    .then((messages) => {
      var message = messages[0];
      if (!message) return Promise.reject({ finished: true });

      console.log('');
      console.log(`Subject: ${message.subject}`);
      console.log(`Message: ${message.message}`);

      return triagePrompts(sqs, queue, message);
    });
}

function receive(sqs, count, queueUrl) {
  return sqs.receiveMessage({
    QueueUrl: queueUrl,
    WaitTimeSeconds: 1,
    MaxNumberOfMessages: count,
    VisibilityTimeout: 10 * 60
  }).promise().then((data) => (data.Messages || []).map((message) => ({
    id: message.MessageId,
    body: message.Body,
    subject: JSON.parse(message.Body).Subject,
    message: JSON.parse(message.Body).Message,
    handle: message.ReceiptHandle
  })));
}

function returnOne(sqs, queueUrl, message) {
  var handle = typeof message === 'string' ? message : message.handle;
  return sqs.changeMessageVisibility({
    QueueUrl: queueUrl,
    ReceiptHandle: handle,
    VisibilityTimeout: 0
  }).promise();
}

function returnMany(sqs, queueUrl, handles) {
  var spinner = new Spinner(`Returning ${handles.length} jobs to the queue...`);
  spinner.setSpinnerString('⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆');
  spinner.start();

  var queue = new Queue({ concurrency: 10 });
  var returns = handles.map((handle) => queue.add(() => returnOne(sqs, queueUrl, handle)));
  return Promise.all(returns)
    .then(() => spinner.stop(true));
}

function replayOne(sqs, queueUrl, message) {
  return sqs.sendMessage({
    QueueUrl: queueUrl,
    MessageBody: message.body
  }).promise();
}

function deleteOne(sqs, queueUrl, message) {
  return sqs.deleteMessage({
    QueueUrl: queueUrl,
    ReceiptHandle: message.handle
  }).promise();
}

function receiveAll(sqs, queueUrl) {
  var messages = [];
  var pending = false;

  var next = function() {
    pending = true;
    return receive(sqs, 10, queueUrl).then((msgs) => {
      pending = false;
      msgs.forEach((msg) => messages.push(msg));
      if (!msgs.length) next = null;
    });
  };

  return new stream.Readable({
    objectMode: true,
    read: function() {
      var status = true;
      while (status && messages.length) status = this.push(messages.shift());
      if (messages.length)  return;
      if (!next) return this.push(null);
      if (status && !pending) return next()
        .then(() => this._read())
        .catch((err) => this.emit('error', err));
    }
  });
}

function getLogs(sqs, queue, message) {
  var spinner = new Spinner('Searching CloudWatch logs...');
  spinner.setSpinnerString('⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆');
  spinner.start();

  return new Promise((resolve, reject) => {
    logs.fetch(queue.logs, message.message, (err, data) => {
      if (err) return reject(err);

      var re = new RegExp(`\\[watchbot\\] \\[(.*?)\\] {"subject":".*?","message":"${message.message}"`);
      var line = data.split('\n').find((line) => re.test(line));
      if (!line) return Promise.resolve('Could not find any matching logs\n');

      var id = line.match(re)[1];
      logs.fetch(queue.logs, id, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  }).then((data) => {
    spinner.stop(true);
    console.log();
    console.log(data);
    return triagePrompts(sqs, queue, message);
  });
}
