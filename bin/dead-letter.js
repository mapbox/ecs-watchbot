/* eslint-disable no-console */

var AWS = require('aws-sdk');
var inquirer = require('inquirer');
var stream = require('stream');
var Queue = require('p-queue');
var logs = require('./logger');
var Spinner = require('cli-spinner').Spinner;


class DeadLetter {
  constructor(options = {}) {
    if (!options.queueUrl)
      throw new Error('queueUrl is undefined');
    this.options = options;
    this.sqs = new AWS.SQS({
      region: url.parse(options.queueUrl).host.split('.')[1],
      params: { QueueUrl: options.queueUrl }
    });

    this.cfn = new AWS.CloudFormation({
      region: url.parse(options.queueUrl).host.split('.')[1],
    });

    const actions = { purse, writeOut, replay, triage };

    findQueues(this.cfn, options);
    const queues = await selectQueue(queues);
    const queue = await triageSelection(queue);
    const data = await actions[data.action](sqs, data.queue);
  }

  async findQueues(options) {
    return new Promise((resolve) => {
      let res = await this.cfn.describeStacks({ StackName: options.stackName}).promise();

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

      var logGroups = res.Stacks[0].Outputs
      .filter((o) => /Logs/.test(o.OutputKey))
      .map((o) => ({
        prefix: o.OutputKey.replace('Logs', ''),
        arn: o.OutputValue
      }));

      return { deadLetterQueues, workQueues, logGroups };
    });
  }

  async selectQueue(queues) {
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

    var deadLetterQueue = queues.deadLetterQueues.find((queue) => queue.prefix === answers.queue);
    return {
      deadLetter: deadLetterQueue.url,
      work: queues.workQueues.find((queue) => queue.prefix === deadLetterQueue.prefix).url,
      logs: queues.logGroups.find((group) => group.prefix === deadLetterQueue.prefix).arn
    };
  }

  async triageSelection(queue) {
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
    var mapping = {
      'Purge the dead letter queue?': 'purge',
      'Return all dead messages to the work queue?': 'replay',
      'Triage dead messages individually?': 'triage',
      'Print out all dead messages?': 'writeOut'
    };

    return { queue, action: mapping[answers.action] };
  }

  async purge(queue) {
    const answers = await inquirer.prompt({
      type: 'confirm',
      name: 'purge',
      message: 'You are about to remove all jobs from the dead letter queue permanently. Are you sure?'
    });
    if (answers.purge)
      return await this.sqs.purgeQueue({ QueueUrl: queue.deadLetter }).promise();
  }

  async writeOut(queue) {
    var reciever = receiveAll(queue.deadLetter);
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
      var done = () => returnMany(this.sqs, queue.deadLetter, stringifier.handles)
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

  async replay(queue) {
    const answers = await inquirer.prompt({
      type: 'confirm',
      name: 'replayAll',
      message: 'You are about to return all messages in the dead letter queue to the work queue. Are you sure?'
    });

    if (!answers.replayAll) return Promise.resolve();

    var spinner = new Spinner('Returning all dead messages to the work queue...');
    spinner.setSpinnerString('⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆');
    spinner.start();

    var reciever = receiveAll(this.sqs, queue.deadLetter);

    var replayer = new stream.Writable({
      objectMode: true,
      write: function(msg, _, callback) {
        replayOne(this.sqs, queue.work, msg)
          .then(() => deleteOne(this.sqs, queue.deadLetter, msg))
          .then(() => callback())
          .catch((err) => callback(err));
      }
    });

    new Promise((resolve, reject) => {
      reciever
        .on('error', reject)
        .pipe(replayer)
          .on('error', reject)
          .on('finish', resolve);
    })
    return await spinner.stop(true);
  }

  async triage(queue) {
    return new Promise((resolve, reject) => {
      (function recurse() {
        triageOne(this.sqs, queue)
        await recurse();
        .catch((err) => {
          if (err.finished) return resolve();
          reject(err);
        });
      })();
    });
  }

  async triagePrompts(queue, message) {
    var actions = { replayOne, returnOne, deleteOne };
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
    var mapping = {
      'View this message\'s recent logs?': 'logs',
      'Return this message to the work queue?': 'replayOne',
      'Return this message to the dead letter queue?': 'returnOne',
      'Delete this message entirely?': 'deleteOne',
      'Stop individual triage?': 'stop'
    };

    var choice = mapping[answers.action];
    var queueUrl = choice === 'replayOne' ? queue.work : queue.deadLetter;

    if (choice === 'logs') return getLogs(this.sqs, queue, message);
    if (choice === 'stop') return returnOne(this.sqs, queueUrl, message)
      .then(() => Promise.reject({ finished: true }));

    if (choice === 'replayOne') return replayOne(this.sqs, queueUrl, message)
       .then(() => deleteOne(this.sqs, queue.deadLetter, message));

    return actions[choice](this.sqs, queueUrl, message);
  }

  async triageOne(queue) {
    return receive(this.sqs, 1, queue.deadLetter)
    .then((messages) => {
      var message = messages[0];
      if (!message) return Promise.reject({ finished: true });

      console.log('');
      console.log(`Subject: ${message.subject}`);
      console.log(`Message: ${message.message}`);

      return triagePrompts(sqs, queue, message);
    });
  }

  async receive(count, queueUrl) {
    await data = this.sqs.receiveMessage({
      QueueUrl: queueUrl,
      WaitTimeSeconds: 1,
      MaxNumberOfMessages: count,
      VisibilityTimeout: 10 * 60
    }).promise();

    if (data.Messages) {
      data.map((message) => ({
        id: message.MessageId,
        body: message.Body,
        subject: JSON.parse(message.Body).Subject,
        message: JSON.parse(message.Body).Message,
        handle: message.ReceiptHandle;
      }));
    }
  }

  async returnOne(queueUrl, message) {
    var handle = typeof message === 'string' ? message : message.handle;
    await this.sqs.changeMessageVisibility({
      QueueUrl: queueUrl,
      ReceiptHandle: handle,
      VisibilityTimeout: 0
    }).promise();
  }

  async returnMany(queueUrl, handles) {
    var spinner = new Spinner(`Returning ${handles.length} jobs to the queue...`);
    spinner.setSpinnerString('⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆');
    spinner.start();
    var queue = new Queue({ concurrency: 10 });
    var returns = handles.map((handle) => queue.add(() => returnOne(this.sqs, queueUrl, handle)));
    return await Promise.all(returns)
    spinner.stop(true);
  }

  async replayOne(queueUrl, message) {
    return await this.sqs.sendMessage({
      QueueUrl: queueUrl,
      MessageBody: message.body
    }).promise();
  }

  async deleteOne(queueUrl, message) {
    return await this.sqs.deleteMessage({
      QueueUrl: queueUrl,
      ReceiptHandle: message.handle
    }).promise();
  }

  async receiveAll(queueUrl) {
    var messages = [];
    var pending = false;
    var next = function() {
      pending = true;
      msgs = await receive(this.sqs, 10, queueUrl)
      if (msgs) {
        pending = false;
        msgs.forEach((msg) => messages.push(msg));
        if (!msgs.length) next = null;
      }
      return msgs;
    }

    return new stream.Readable({
      objectMode: true,
      read: function() {
        var status = true;
        while (status && messages.length) status = this.push(messages.shift());
        if (messages.length)  return;
        if (!next) return this.push(null);
        if (status && !pending) return next()
        await this._read();
      }
    });
  }

  async getLogs(queue, message) {
    var spinner = new Spinner('Searching CloudWatch logs...');
    spinner.setSpinnerString('⠄⠆⠇⠋⠙⠸⠰⠠⠰⠸⠙⠋⠇⠆');
    spinner.start();
    const data = await Promise((resolve, reject) => {
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
    });
    spinner.stop(true);
    console.log();
    console.log(data);
    return triagePrompts(this.sqs, queue, message);
  }
};

module.exports = DeadLetter;
