[![Build Status](https://travis-ci.org/mapbox/ecs-watchbot.svg?branch=master)](https://travis-ci.org/mapbox/ecs-watchbot)

# watchbot

A library to help run a highly-scalable AWS service that performs data processing tasks in response to external events. You provide the the messages and the logic to process them, while Watchbot handles making sure that your processing task is run at least once for each message. Watchbot is similar in many regards to AWS Lambda, but is more configurable, more focused on data processing, and not subject to several of Lambda's limitations.

## Helpful lingo

- **queue**: [An SQS queue](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/SQSConcepts.html) is a "backlog" of messages for your stack to process that helps to guarantee every message gets processed at least once.
- **message**: A message in the queue represents some job to be processed. Generally, you are responsible for sending messages to your stack by [publishing to Watchbot's SNS topic](http://docs.aws.amazon.com/sns/latest/dg/PublishTopic.html), or optionally by POST to a webhook endpoint (see `WatchbotUseWebhooks` in the parameters section below).
- **task**: A container responsible for processing a single message. You define the work performed by the task through your own ECS image. Watchbot sets environment variables on the container that represent the content of a single message.
- **watcher**: A Watchbot-defined container that polls the queue, spawns tasks to process messages, and tracks results. You specify how many watchers to run, and how many tasks each watcher is responsible for.
- **notifications**: SNS messages that are published if a task fails or is retried. You can subscribe to Watchbot's notification topic in order to receive these notifications (e.g. via email).
- **cluster**: [An ECS cluster](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_clusters.html) of EC2s that are used to run the watcher and task containers that make up your service.
- **template**: [A CloudFormation template](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-whatis-concepts.html#d0e3428) defining the resources Watchbot needs

## What you provide:

- a cluster that Watchbot will run on
- a docker image representing your task, housed in [an ECR repository](http://docs.aws.amazon.com/AmazonECR/latest/userguide/Repositories.html) and tagged with a git sha or a git tag
- a CloudFormation template defining any configuration Parameters, Resources, and Outputs that your service needs in order to perform its processing.

**:bulb: Other prerequisites:**

- `cloudformation-kms-production` deployed according to the instructions in [cloudformation-kms](https://github.com/mapbox/cloudformation-kms). Makes encryption of sensitive environment variables that need to be passed to ECS simple using [cfn-config](https://github.com/mapbox/cfn-config).

## What Watchbot provides:

- a queue for you to send messages to in order to trigger your tasks to run
- [an AWS access key](http://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html) with permission to send messages to the queue
- [an ECS TaskDefinition](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_defintions.html) for your task, using the image you provide
- watcher container(s) that runs on your cluster and polls the queue, runs your task for each message, removes messages from the queue as tasks complete, and sends notifications if tasks fail or are retried
- a script to help you include the resources Watchbot needs to run in your template

## Building a Watchbot service

1. Create a Github repository for your code.
2. Write and test the code that a worker will perform in response to a message.
3. Write a Dockerfile at the root of your repository which defines the steps required to bootstrap a worker. If you specify a `CMD` instructions, this will be executed when your worker is launched in response to a message. Note that message details will be provided as environment variables to your worker, and that your worker's exit code will determine whether the message is deleted or returned to the queue (see below).
4. Use the Dockerfile to build an image and store it in an ECR repository. See [ecs-conex](https://github.com/mapbox/ecs-conex) for a CI framework to do this for you whenever you commit to the repository.
5. Write and deploy your service using a CloudFormation template. See instructions below for more details about building the template.

## Task runtime environment

In addition to any environment variables pre-configured for your task via `watchbot.template()` (see below), Watchbot will provide each task with a set of environment variables representing the details of the message which it should process:

Name | Description
--- | ---
Subject | the message's subject
Message | the message's body
MessageId | the message's ID defined by SQS
SentTimestamp | the time the message was sent
ApproximateFirstReceiveTimestamp | the time the message was first received
ApproximateReceiveCount | the number of times the message has been received

The environment will also contain some variables referencing resources that Watchbot created:

Name | Description
--- | ---
WorkTopic | the ARN of the SNS topic that provides messages to SQS
LogGroup | the name of the CloudWatch LogGroup where logs are sent

**:lock: Encrypting & decrypting environment variables**

The recommended flow for deploying `watchbot` stacks is to use `cfn-config` which provides a `--kms` option for automatically encrypting CloudFormation parameters marked with `[secure]`. To decrypt at runtime, install [decrypt-kms-env](https://github.com/mapbox/decrypt-kms-env) as a dependency in your Dockerfile and invoke it in your `CMD`. Example:

```Dockerfile
RUN eval $(./node_modules/.bin/decrypt-kms-env) && npm start
```

## Task completion

The exit code from your task determines what the watcher will do with the message that was being processed. Your options are:

Exit code | Description | Outcome
--- | --- | ---
0 | completed successfully | message is removed from the queue without notification
3 | rejected the message | message is removed from the queue and a notification is sent
4 | no-op | message is returned to the queue without notification
other | failure | message is returned to the queue and a notification is sent

## Building a Watchbot template

Watchbot provides two important methods to help you build a CloudFormation template:

- **watchbot.template(options)** creates CloudFormation JSON objects for the various Resources that Watchbot needs in order to do its job.
- **watchbot.merge(...templates)** takes multiple CloudFormation templates and merges them together into a single JSON template.

With those two tools in hand, creating a Watchbot stack will generally involve:
- determine the appropriate `options` to provide to `watchbot.template` for your situation. See the table below for more details on the various required options, optional ones, and default values.
- write a CloudFormation template that defines the configuration parameters, stack outputs, permissions required by your worker containers, and any additional resources that are required in order to process jobs.
- write a script which merges the two templates, adding Watchbot's resources to your template.
- use [cfn-config](https://github.com/mapbox/cfn-config) to deploy the template by referencing the script that you've written.

As an example, consider a service where the workers are expected to manipulate objects in an S3 bucket. In the CloudFormation template, we wish to create the S3 bucket that our workers will interact with, and then build the Watchbot resources required to perform the task in response to SNS events.

```js
var watchbot = require('@mapbox/watchbot');

// Build the parameters, resources, and outputs that your service needs
var myTemplate = {
  Parameters: {
    GitSha: { Type: 'String' },
    Cluster: { Type: 'String' },
    AlarmEmail: { Type: 'String' }
  },
  Resources: {
    MyBucket: {
      Type: 'AWS::S3::Bucket',
      Properties: {
        Name: 'my-bucket'
      }
    }
  }
};

// Generate Watchbot resources. You can use references to parameters and
// resources that were defined above.
var watch = watchbot.template({
  cluster: { Ref: 'Cluster' },
  service: 'my-repo-name',
  serviceVersion: { Ref: 'GitSha' },
  env: { BucketName: 'my-bucket' },
  workers: 5,
  reservation: { memory: 512 },
  notificationEmail: { Ref: 'AlarmEmail' },
  permissions: [
    {
      Effect: 'Allow',
      Action: ['s3:*'],
      Resource: {
        'Fn::Join': ['', ['arn:aws:s3:::', { Ref: 'MyBucket' }]]
      }
    }
  ]
});

module.exports = watchbot.merge(myTemplate, watch);
```

### watchbot.template options

Use the following configuration options to adjust the resources that Watchbot will provide. Bold options must be provided.

Name | Default | Description
--- | --- | ---
**cluster** | | the ARN for an ECS cluster
**service** | | the name of the worker service
**serviceVersion** | | the version of the worker service to use
**notificationEmail** | | the email address to receive failure notifications
permissions | [] | permissions to any AWS resources that the worker will need to perform a task. Be sure to unwrap any `PolicyDocument` objects. The use of `PolicyDocument` here will pass `aws cloudformation validate-template`, but will prevent your stack from being created successfully.
env | {} | environment variables to set on worker containers
command | undefined | overrides a Dockerfile's `CMD`
watchbotVersion | installed version | the version of watchbot to use
prefix | Watchbot | a prefix for logical resource names
user | false | create an IAM user with permission to publish
webhook | false | create an HTTPS endpoint to accept jobs
webbhookKey | false | require an access token on the webhook endpoint
reduce | false | enable reduce-mode (see below)
readCapacityUnits | 30 | approximate reads per second to progress table in reduce-mode
writeCapacityUnits | 30 | approximate writes per second to progress table in reduce-mode
watchers | 1 | number of watcher containers
workers | 1 | number of concurrent worker containers per watcher
backoff | true | retry jobs with exponential backoff
logAggregationFunction | | the ARN of the log collection Lambda function
mounts | '' | defines container mount points from host EC2s
reservation | {} | specify desired memory/cpu reservations for worker containers
reservation.cpu | | specify a soft CPU limit
reservation.memory | 64 | specify a hard memory limit
reservation.softMemory | | specify a soft memory limit
messageTimeout | 600 | max seconds it takes to process a job
messageRetention | 1209600 | max seconds a message can remain in SQS
alarmThreshold | 40 | number of jobs in SQS to trigger alarm
alarmPeriods | 24 | number of 5-min intervals SQS must be above threshold to alarm
debugLogs | false | enable verbose watcher logging
notifyAfterRetries | 0 | retry on any exit codes other than 0, 3, and 4 before alarm
privileged | false | give the container elevated privileges on the host container instance

### watchbot.template references

After building Watchbot resources using `watchbot.template()`, you may wish to reference some of those resources. The object returned from `watchbot.template()` provides references to a few of its resources through a `.ref` property:

Name | Description
--- | ---
.ref.logGroup | the CloudWatch LogGroup where watcher and worker container's logs are written
.ref.topic | the SNS topic that you can publish messages to in order to have them processed by Watchbot
.ref.queueUrl | the URL of the SQS Queue Watchbot built
.ref.queueArn | the ARN of the SQS Queue Watchbot built
.ref.queueName | the name of the SQS Queue Watchbot built
.ref.webhookEnpoint | [conditional] if requested, the URL for the webhook endpoint
.ref.webhookKey | [conditional] if requested, the access token for making webhook requests
.ref.accessKeyId | [conditional] if requested, an AccessKeyId with permission to publish to Watchbot's SNS topic
.ref.secretAccessKey | [conditional] if requested, a SecretAccessKey with permission to publish to Watchbot's SNS topic
.ref.progressTable | [conditional] if running in reduce-mode, the name of the DynamoDB table that tracks job progress

These properties each return CloudFormation references (i.e. `{ "Ref": "..." }` objects) that can be used in your template. In the above example, if I wanted my stack to output the SNS topic built by Watchbot, I could:

```js
var outputs = {
  Outputs: { SnsTopic: { Value: watcher.ref.topic } }
};

module.exports.watchbot.merge(myTemplate, watcher, outputs);
```

## Logging

Each Watchbot stack will write all its logs to a single CloudWatch LogGroup. The [awscli](http://docs.aws.amazon.com/cli/latest/reference/logs/index.html) or [cwlogs](https://github.com/mapbox/cwlogs) are a couple of tools that can be used to view log events in a LogGroup.

If your host EC2s **are not** built from [ECS-optimized AMIs](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html), make sure that the `awslogs` driver is enabled on the ecs-agent by setting the following agent configuration:

```
ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs"]
```

See [the AWS documentation](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html) for more information.

### Formatting log messages

In order to help isolate and aggregate logs from any single message, watchbot provides a logging helper that will prefix each line with the ID of the message being processed. Use these utilities in your worker scripts to make sure that your logs are consistent and easy to search.

```js
var watchbot = require('@mapbox/watchbot');

// watchbot.log() works just like console.log()
var breakfast = 'eggs and beans';
watchbot.log('This is something that I want logged: %s', breakfast);
// [Thu, 28 Jul 2016 00:12:37 GMT] [worker] [e2c045cc-5606-4950-964b-20877900bccb] This is something that I want logged: eggs and beans

// watchbot.logStream() creates a writable stream that will log everything with watchbot.log
var logstream = watchbot.logStream();
require('child_process').exec('cat ~/.bashrc').stdout.pipe(logstream);
```

There is also a CLI tool to accomplish the same task:

```bash
# Perform this global installation in your Dockerfile
$ npm install -g watchbot

# Log a single line instead of using `echo`
$ watchbot-log "This is something that I want logged: eggs and beans"

# Pipe another command's output into watchbot-log
$ echo "This is something that I want logged: eggs and beans" | watchbot-log
```

## Reduce mode

By setting the `Reduce` parameter to true, Watchbot will be capable of helping track the
progress of distributed map-reduce operations. This is useful if your stack performs
a bunch of individual jobs that need to be "rolled up" into a final output of some sort.

### Messaging patterns

Generally, a reduce-enabled Watchbot stack should be built in order to process three types
of messages: one type that kicks of a map-reduce operation, one type that processes
individual parts, and another type that performs the reduce or "roll up" operation.

Your code should include all the logic required to interpret these different types
of messages. The flow of messages will generally be as follows:

1. You (or some AWS resource) sends the initial message to your Watchbot stack's SNS
topic. When your code receives this message, it should:
  - determine how the work will be split across multiple parts
  - generate an identifier for the entire map-reduce operation
  - report to Watchbot the identifier, and the number of parts
  - send SNS messages to Watchbot's SNS topic for each part, providing the identifier
  for the operation, and the part number. Part numbers start a `1` and increase up
  to the total number of parts.
2. Watchbot will receive the "work" jobs that were sent by your initial message processor.
When your code receives these messages, it should:
  - perform appropriate processing
  - once processing is complete, report the identifier and the part number of the job
  to Watchbot. In response, Watchbot will inform your code as to whether or not all
  the parts in the map-reduce operation are completed.
  - if the worker receives the notification that all parts are complete, the worker
  should send a single message to Watchbot's SNS topic to trigger the reduce step
3. Upon receiving the reduce message, your code should take any appropriate roll-up
action.

### Using watchbot-progress

`watchbot-progress` is a CLI command that is available to use on a reduce-enabled
stack. This is one mechanism by which you can report progress to Watchbot as part
ofthe above messaging flow.

For usage examples and and additional documentation, see [watchbot-progress](https://github.com/mapbox/watchbot-progress).

Install Watchbot globally as part of your worker's Dockerfile to gain access to the
CLI command on your workers at runtime:

```
RUN npm install -g watchbot
```

```
$ watchbot-progress <command> <job-id> [options]
```

Note that by default, workers in reduce-enabled Watchbot stacks will have the `$ProgressTable`
environment variable set automatically. For more information on this command, see

#### Reporting progress in JavaScript

A JavaScript module is also available as a mechanism for progress reporting.

```js
var progress = require('@mapbox/watchbot').progress();
```
