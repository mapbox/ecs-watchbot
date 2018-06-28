#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */

const AWS = require('aws-sdk');
const inquirer = require('inquirer');
const stream = require('stream');
const Queue = require('p-queue');
const Spinner = require('cli-spinner').Spinner;

const main = async(callback) => {
  console.log('inside async()');

  const options = {
    stackName: process.argv[2],
    region: process.argv[3] || 'us-east-1'
  };

  const sqs = new AWS.SQS({ region: options.region });
  const cfn = new AWS.CloudFormation({ region: options.region });

  const actions = { purge, writeOut, replay, triage };
  try {
    const queues = await findQueues(cfn, options);
    let queue;
    if (queues) {
      queue = await selectQueue(queues);
    }
    let data;
    if (queue) {
      data = await triageSelection(queue);
    }

    if (data) {
      await actions[data.action](sqs, data.queue);
    }
  } catch (err) {
	  throw err;
	}
};

async function findQueues(cfn, options) {
  console.log('inside findQueues');
  const res = await cfn.describeStacks({ StackName: options.stackName }).promise();
  console.log(res);
  if (!res.Stacks[0]) {
    throw new Error(`Could not find ${options.stackName} in ${options.region}`);
  }
  const deadLetterQueues = res.Stacks[0].Outputs
    .filter((o) => /DeadLetterQueueUrl/.test(o.OutputKey))
    .map((o) => ({
      prefix: o.OutputKey.replace('DeadLetterQueueUrl', ''),
      url: o.OutputValue
    }));

  const workQueues = res.Stacks[0].Outputs
    .filter((o) => /QueueUrl/.test(o.OutputKey) && !/DeadLetterQueueUrl/.test(o.OutputKey))
    .map((o) => ({
      prefix: o.OutputKey.replace('QueueUrl', ''),
      url: o.OutputValue
    }));
  const logGroups = res.Stacks[0].Outputs
    .filter((o) => /LogGroup/.test(o.OutputKey))
    .map((o) => ({
      prefix: o.OutputKey.replace('LogGroup', ''),
      arn: o.OutputValue
    }));

  return { deadLetterQueues, workQueues, logGroups };
}

async function selectQueue(queues) {
	console.log('inside selectQueue');
  if (queues.deadLetterQueues.length === 1) return Promise.resolve({
    deadLetter: queues.deadLetterQueues[0].url,
    work: queues.workQueues.find((queue) => queue.prefix === queues.deadLetterQueues[0].prefix).url,
    logs: queues.logGroups.find((group) => group.prefix === queues.deadLetterQueues[0].prefix).arn
  });
  const answers = await inquirer.prompt({
    type: 'list',
    name: 'queue',
    message: 'Which queue would you like to triage?',
    choices: queues.deadLetterQueues.map((queue) => queue.prefix)
  });
  const deadLetterQueue = queues.deadLetterQueues.find((queue) => queue.prefix === answers.queue);
  return {
    deadLetter: deadLetterQueue.url,
    work: queues.workQueues.find((queue) => queue.prefix === deadLetterQueue.prefix).url,
    logs: queues.logGroups.find((group) => group.prefix === deadLetterQueue.prefix).arn
  };
}

async function triageSelection(queue) {
  const answers = await inquirer.prompt({
    type: 'list',
    name: 'action',
    message: 'Would you like to:',
    choices: [
      'Triage dead messages individually?',
      'Print out all dead messages?',
      'Return all dead messages to the work queue?',
      'Purge the dead letter queue?'
    ]
  });
  const mapping = {
    'Purge the dead letter queue?': 'purge',
    'Return all dead messages to the work queue?': 'replay',
    'Triage dead messages individually?': 'triage',
    'Print out all dead messages?': 'writeOut'
  };
  return { queue, action: mapping[answers.action] };
}

async function purge(sqs, queue) {
  const answers = await inquirer.prompt({
    type: 'confirm',
    name: 'purge',
    message: 'You are about to remove all jobs from the dead letter queue permanently. Are you sure?'
  });
  if (answers.purge)
    return await sqs.purgeQueue({ QueueUrl: queue.deadLetter }).promise();
}

async function writeOut(sqs, queue) {
  const reciever = await receiveAll(sqs, queue.deadLetter);
  const stringifier = new stream.Transform({
    objectMode: true,
    transform: function(msg, _, callback) {
      const data = { subject: msg.subject, message: msg.message };
      this.push(`${JSON.stringify(data)}\n`);
      stringifier.handles.push(msg.handle);
      callback();
    }
  });
  stringifier.handles = [];
  const done = await returnMany(sqs, queue.deadLetter, stringifier.handles);
  reciever
    .pipe(stringifier)
    .on('end', done)
    .pipe(process.stdout);
}

async function replay(sqs, queue) {
  const answers = await inquirer.prompt({
    type: 'confirm',
    name: 'replayAll',
    message: 'You are about to return all messages in the dead letter queue to the work queue. Are you sure?'
  });

  if (!answers.replayAll) return Promise.resolve();

  const spinner = new Spinner('Returning all dead messages to the work queue...');
  spinner.setSpinnerString('⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆');
  spinner.start();
  const reciever = await receiveAll(sqs, queue.deadLetter);
  const replayer = new stream.Writable({
    objectMode: true,
    write: async function(msg, _, callback) {
      await replayOne(sqs, queue.work, msg);
      await deleteOne(sqs, queue.deadLetter, msg);
      callback();
    }
  });
  new Promise((resolve, reject) => {
    reciever
      .on('error', reject)
      .pipe(replayer)
      .on('error', reject)
      .on('finish', resolve);
  });
  return await spinner.stop(true);
}

async function triage(sqs, queue) {
  for (;;) {
    const done = await triageOne(sqs, queue);
    if (done) return;
  }
}

async function triagePrompts(sqs, queue, message) {
  const actions = { replayOne, returnOne, deleteOne };
  const answers = await inquirer.prompt({
    type: 'list',
    name: 'action',
    message: 'Would you like to:',
    choices: [
      'Return this message to the work queue?',
      'Return this message to the dead letter queue?',
      'Delete this message entirely?',
      'Stop individual triage?'
    ]
  });
  const mapping = {
    'Return this message to the work queue?': 'replayOne',
    'Return this message to the dead letter queue?': 'returnOne',
    'Delete this message entirely?': 'deleteOne',
    'Stop individual triage?': 'stop'
  };

  const choice = mapping[answers.action];
  const queueUrl = choice === 'replayOne' ? queue.work : queue.deadLetter;

  if (choice === 'stop') {
    await returnOne(sqs, queueUrl, message);
    return true;
  }
  if (choice === 'replayOne') {
    await replayOne(sqs, queueUrl, message);
    await deleteOne(sqs, queue.deadLetter, message);
  }
  return actions[choice](sqs, queueUrl, message);
}

async function triageOne(sqs, queue) {
  const messages = await receive(sqs, 1, queue.deadLetter);
  const message = messages[0];
  console.log('message');
  console.log(message);
  if (!message) return true;
  console.log('');
  console.log(`Subject: ${message.subject}`);
  console.log(`Message: ${message.message}`);
  return triagePrompts(sqs, queue, message);
}

async function receive(sqs, count, queueUrl) {
  let data = await sqs.receiveMessage({
    QueueUrl: queueUrl,
    WaitTimeSeconds: 1,
    MaxNumberOfMessages: count,
    VisibilityTimeout: 10 * 60
  }).promise();

  if (data.Messages) {
    data = data.Messages.map((message) => ({
      id: message.MessageId,
      body: message.Body,
      subject: JSON.parse(message.Body).Subject,
      message: JSON.parse(message.Body).Message,
      handle: message.ReceiptHandle
    }));
  }
  return data;
}


async function returnOne(sqs, queueUrl, message) {
  const handle = typeof message === 'string' ? message : message.handle;
  return await sqs.changeMessageVisibility({
    QueueUrl: queueUrl,
    ReceiptHandle: handle,
    VisibilityTimeout: 0
  }).promise();
}

async function returnMany(sqs, queueUrl, handles) {
  const spinner = new Spinner(`Returning ${handles.length} jobs to the queue...`);
  spinner.setSpinnerString('⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆');
  spinner.start();
  const queue = new Queue({ concurrency: 10 });
  const returns = handles.map((handle) => queue.add(() => returnOne(sqs, queueUrl, handle)));
  const returnManyResult = await Promise.all(returns);
  spinner.stop(true);
  return returnManyResult;
}

async function replayOne(sqs, queueUrl, message) {
  return await sqs.sendMessage({
    QueueUrl: queueUrl,
    MessageBody: message.body
  }).promise();
}

async function deleteOne(sqs, queueUrl, message) {
  return await sqs.deleteMessage({
    QueueUrl: queueUrl,
    ReceiptHandle: message.handle
  }).promise();
}

async function receiveAll(sqs, queueUrl) {
  const messages = [];
  let pending = false;
  let next = async function() {
    pending = true;
    const msgs = await receive(sqs, 10, queueUrl);
    if (msgs) {
      pending = false;
      msgs.forEach((msg) => messages.push(msg));
      if (!msgs.length) next = null;
    }
    return msgs;
  };
  console.log('new stream.Readable');
  return new stream.Readable({
    objectMode: true,
    read: function() {
      let status = true;
      while (status && messages.length) status = this.push(messages.shift());
      if (messages.length)  return;
      if (!next) return this.push(null);
      if (status && !pending) return next()
        .then(() => this._read())
        .catch((err) => this.emit('error', err));
    }
  });
}

module.exports = main;

if (require.main === module) main();
