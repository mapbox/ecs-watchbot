#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */

const AWS = require('aws-sdk');
const inquirer = require('inquirer');
const stream = require('stream');
const Queue = require('p-queue');
const logs = require('..').Logger;
const Spinner = require('cli-spinner').Spinner;

const main = async() => {

  var options = {
    stackName: process.argv[2],
    region: process.argv[3] || 'us-east-1'
  };

  const sqs = new AWS.SQS({ region: options.region });
  const cfn = new AWS.CloudFormation({ region: options.region });

  const actions = { purge, writeOut, replay, triage };

  const queues = await findQueues(cfn, options);
	console.log('queues');
	console.log(queues);
  const queue = await selectQueue(queues);
	console.log('queue');
	console.log(queue);
  const data = await triageSelection(queue);
	console.log('data');
	console.log(data);
  await actions[data.action](sqs, data.queue);
};

async function findQueues(cfn, options) {
  const res = await cfn.describeStacks({ StackName: options.stackName }).promise();
  if (!res.Stacks[0])
    return Promise.reject(new Error(`Could not find ${options.stackName} in ${options.region}`));
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

function writeOut(sqs, queue) {
  const reciever = receiveAll(sqs, queue.deadLetter);
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
  return new Promise((resolve, reject) => {
    const done = returnMany(sqs, queue.deadLetter, stringifier.handles)
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
  const reciever = receiveAll(sqs, queue.deadLetter);
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
  return new Promise((resolve, reject) => {
    async function recurse() {
    await triageOne(sqs, queue);
    await recurse();
  }
  });
}

async function triagePrompts(sqs, queue, message) {
  const actions = { replayOne, returnOne, deleteOne };
  const answers = await inquirer.prompt({
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
  });
  const mapping = {
    'View this message\'s recent logs?': 'logs',
    'Return this message to the work queue?': 'replayOne',
    'Return this message to the dead letter queue?': 'returnOne',
    'Delete this message entirely?': 'deleteOne',
    'Stop individual triage?': 'stop'
  };

  const choice = mapping[answers.action];
  const queueUrl = choice === 'replayOne' ? queue.work : queue.deadLetter;

  if (choice === 'logs') return getLogs(sqs, queue, message);
  if (choice === 'stop') return returnOne(sqs, queueUrl, message)
    .then(() => Promise.reject({ finished: true }));

  if (choice === 'replayOne') return replayOne(sqs, queueUrl, message)
    .then(() => deleteOne(sqs, queue.deadLetter, message));
  return actions[choice](sqs, queueUrl, message);
}

async function triageOne(sqs, queue) {
  const messages = await receive(sqs, 1, queue.deadLetter);
  const message = messages[0];
  if (!message) return Promise.reject({ finished: true });
  console.log('');
  console.log(`Subject: ${message.subject}`);
  console.log(`Message: ${message.message}`);
  return triagePrompts(sqs, queue, message);
}

async function receive(sqs, count, queueUrl) {
  const data = await sqs.receiveMessage({
    QueueUrl: queueUrl,
    WaitTimeSeconds: 1,
    MaxNumberOfMessages: count,
    VisibilityTimeout: 10 * 60
  }).promise();

  if (data.Messages) {
    data.Messages.map((message) => ({
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
  await sqs.changeMessageVisibility({
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
  await Promise.all(returns);
  spinner.stop(true);
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
  return new stream.Readable({
    objectMode: true,
    read: async function() {
      let status = true;
      while (status && messages.length) status = this.push(messages.shift());
      if (messages.length)  return;
      if (!next) return this.push(null);
      if (status && !pending) return next();
      await this._read();
    }
  });
}

async function getLogs(queue, message) {
  const spinner = new Spinner('Searching CloudWatch logs...');
  spinner.setSpinnerString('⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆');
  spinner.start();
  const data = await Promise((resolve, reject) => {
    logs.fetch(queue.logs, message.message, (err, data) => {
      if (err) return reject(err);
      const re = new RegExp(`\\[watchbot\\] \\[(.*?)\\] {"subject":".*?","message":"${message.message}"`);
      const line = data.split('\n').find((line) => re.test(line));
      if (!line) return Promise.resolve('Could not find any matching logs\n');
      const id = line.match(re)[1];
      logs.fetch(queue.logs, id, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  });
  spinner.stop(true);
  console.log();
  console.log(data);
  return triagePrompts(this.sqs, queue, message);
}

module.exports = main;

if (require.main === module) main();
