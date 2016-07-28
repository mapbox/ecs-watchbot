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
- [an IAM role](http://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html) that the [EC2s in the cluster can assume](http://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html)
- a docker image representing your task, housed in [an ECR repository](http://docs.aws.amazon.com/AmazonECR/latest/userguide/Repositories.html) and tagged with a git sha or a git tag

## What Watchbot provides:

- a queue for you to send messages to in order to trigger your tasks to run
- [an AWS access key](http://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html) with permission to send messages to the queue
- [an ECS TaskDefinition](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_defintions.html) for your task, using the image you provide
- watcher container(s) that runs on your cluster and polls the queue, runs your task for each message, removes messages from the queue as tasks complete, and sends notifications if tasks fail or are retried
- a template-building CLI tool to get you started with a Watchbot template

## Task runtime environment

In addition to any environment variables pre-configured for your task in the template, Watchbot will provide each task with a set of environment variables representing the details of the message which it should process:

Name | Description
--- | ---
Subject | the message's subject
Message | the message's body
MessageId | the message's ID defined by SQS
SentTimestamp | the time the message was sent
ApproximateFirstReceiveTimestamp | the time the message was first received
ApproximateReceiveCount | the number of times the message has been received

## Task completion

The exit code from your task determines what the watcher will do with the message that was being processed. Your options are:

Exit code | Description | Outcome
--- | --- | ---
0 | completed successfully | message is removed from the queue without notification
3 | rejected the message | message is removed from the queue and a notification is sent
4 | no-op | message is returned to the queue without notification
other | failure | message is returned to the queue and a notification is sent

## Building a Watchbot template

You can use Watchbot's template builder by installing this library globally:

```
> git clone https://github.com/mapbox/ecs-watchbot
> cd ecs-watchbot
> npm link
> watchbot-template-builder --help
watchbot template builder v4.2.0

Usage: watchbot-template-builder [OPTIONS] <template-file>

Options:
 --env, -e           environment variables to set (e.g. --env HOST=my-host)
 --description, -d   the template description
 --verbose, -v       also print the template to stdout
 --help, -h          show this message
```

You must provide the path to a file where the template will be written. You will be prompted to select any parameters, resources, or outputs from the template that you wish to have provided as environment variables to your tasks.

After building this template, there are several customizations that you'll likely want to make:

- **Add task permissions**: You must define any [IAM permissions](http://docs.aws.amazon.com/IAM/latest/UserGuide/introduction_access-management.html) that your task will need in order to complete its work. For example, if your task will write to S3, you must add a statement providing your task with appropriate permission to perform PutObject requests to your bucket.

  Add statements to the template by expanding the array here:

  ```
  .Resources.WatchbotTaskPolicy.Properties.PolicyDocument.Statement
  ```

- **Add other resources**: Your task may rely on other resources not defined by Watchbot's default template. For example, your task may write records to [a backend DynamoDB table](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-dynamodb-table.html), and you may wish to include the definition for that table in your template.

- **Fine-tune your task's environment**: You may wish to provide [additional environment variables to your task](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-ecs-taskdefinition-containerdefinitions.html#cfn-ecs-taskdefinition-containerdefinition-environment) at runtime. In the above example where you've added a DynamoDB table resource, you may wish to add this table's name to your task's runtime environment.

  Add environment variables as name-value objects to the array here:

  ```
  .Resources.WatchbotTask.Properties.ContainerDefinitions[0].Environment
  ```

## Watchbot's parameters

The default template will ask you to provide the following parameters:

- **TaskRepo & TaskGitSha**: These parameters taken together define the URI for your task's docker image:

  ```
  ${AWS Account ID}.dkr.ecr.${AWS Region}.amazonaws.com/${TaskRepo}:${TaskGitSha}
  ```

- **TaskMemory**: The number of MB of RAM to reserve for each running task

- **WatchbotGitSha**: The git sha or git tag of Watchbot's watcher to run

- **WatchbotUseWebhooks**: If set to `true`, the template will build an [API Gateway endpoint](http://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html) that can act as a proxy for sending an SNS message. Stack outputs will include an endpoint URL and an API key. By sending a POST request to this endpoint, you can trigger your tasks to run.

- **WatchbotCluster & WatchbotClusterRole**: The name of [the ECS cluster](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_clusters.html) that Watchbot will run on, and the name of [an IAM role](http://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html) that can be assumed by the EC2s in that cluster. Watchbot will append additional permissions to this role in order to perform the work of the watcher and task containers.

- **WatchbotWatchers & WatchbotTasks**: These parameters are your control over how fast messages can be pulled from the queue and how many tasks can be run concurrently. The maximum concurrency will be `WatchbotWatchers * WatchbotTasks`, as each watcher is responsible for a maximum of `WatchbotTasks` number of concurrent tasks.

  `WatchbotWatchers` is your primary control on how fast messages can be pulled from the queue. A single watcher will pull _at best_ 10 messages per second from the queue. If your messages need to be picked up and processed more quickly, add more watchers.

  If you don't need messages pulled from the queue more rapidly, increasing `WatchbotTasks` and leaving `WatchbotWatchers` at one may provide a little more clarity into your task concurrency.

- **WatchbotNotificationEmail**: An email address that will be subscribed to notifications about task failures and retries. You will need to manually confirm the subscription via email.

- **WatchbotBackoff**: If `false`, when a task is retried, the message is returned to the queue and immediately visible, allowing another task to attempt it right away. If `true`, tasks will be held invisible for an increasing period of time if they are retried more than once.

- **WatchbotMessageTimeout**: The number of seconds that before a message will be automatically made visible in the queue again. This prevents jobs from being lost if the task or watcher dies for an unexpected reason. Failure to set this value greater than the time it takes for your tasks to complete their work will lead to messages being processed more than once.

- **WatchbotQueueSizeAlarm & WatchbotQueueSizeAlarmPeriod**: These values determine the threshold for an alarm based on there being too many messages in the queue.

- **WatchbotMessageRetentionPeriod**: The maximum number of seconds a message can remain in the queue. The default value is the max allowed by SQS, 14 days.

## Logging

Each Watchbot stack will write all its logs to a single CloudWatch LogGroup. The name of this LogGroup is provided as a CloudFormation stack output called `WatchbotLogGroup`. The [awscli](http://docs.aws.amazon.com/cli/latest/reference/logs/index.html) or [cwlogs](https://github.com/mapbox/cwlogs) are a couple of tools that can be used to view log events in a LogGroup.

If your host EC2s **are not** built from [ECS-optimized AMIs](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html), make sure that the `awslogs` driver is enabled on the ecs-agent by setting the following agent configuration:

```
ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs"]
```

See [the AWS documentation](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html) for more information.

In order to help isolate and aggregate logs from any single message, watchbot provides a logging helper that will prefix each line with the ID of the message being processed.

```js
var watchbot = require('watchbot');

// watchbot.log() works just like console.log()
var breakfast = 'eggs and beans';
watchbot.log('This is something that I want logged: ', breakfast);
// [Thu, 28 Jul 2016 00:12:37 GMT] [worker] [e2c045cc-5606-4950-964b-20877900bccb] This is something that I want logged: eggs and beans
```

There is also a CLI tool to accomplish the same task:

```bash
# Perform this global installation in your Dockerfile
$ npm install -g watchbot

# Log a single line instead of using `echo`
$ watchbot-log "This is something that I want logged: eggs and beans"

# Pipe another command's stdio into watchbot-log
$ echo "This is something that I want logged: eggs and beans" | watchbot-log
```
