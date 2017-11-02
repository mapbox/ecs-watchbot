[![Build Status](https://travis-ci.org/mapbox/ecs-watchbot.svg?branch=master)](https://travis-ci.org/mapbox/ecs-watchbot)

# watchbot

A library to help run a highly-scalable AWS service that performs data processing tasks in response to external events. You provide the messages and the logic to process them, while Watchbot handles making sure that your processing task is run at least once for each message. Watchbot is similar in many regards to AWS Lambda, but is more configurable, more focused on data processing, and not subject to several of Lambda's limitations.

## Helpful lingo

- **queue**: [An SQS queue](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/SQSConcepts.html) is a "backlog" of messages for your stack to process that helps to guarantee every message gets processed at least once.
- **message**: A message in the queue represents some job to be processed. Generally, you are responsible for sending messages to your stack by [publishing to Watchbot's SNS topic](http://docs.aws.amazon.com/sns/latest/dg/PublishTopic.html), or optionally by POST to a webhook endpoint (see `WatchbotUseWebhooks` in the parameters section below).
- **worker**: [An ECS task](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_defintions.html) responsible for processing a single message. You define the work performed by the worker through your own ECS image. Watchbot sets environment variables on the container that represent the content of a single message.
- **watcher**: A Watchbot-defined [An ECS task](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_defintions.html) that polls the queue, spawns workers to process messages, and tracks results. You specify how many watchers to run, and how many workers each watcher is responsible for.
- **cluster**: [An ECS cluster](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_clusters.html) of EC2s that are used to run the watcher and worker containers that make up your service.
- **template**: [A CloudFormation template](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-whatis-concepts.html#d0e3428) defining the resources Watchbot needs

## What you provide:

- a cluster that Watchbot will run on
- a docker image representing your worker, housed in [an ECR repository](http://docs.aws.amazon.com/AmazonECR/latest/userguide/Repositories.html) and tagged with a git sha or a git tag
- a CloudFormation template defining any configuration Parameters, Resources, and Outputs that your service needs in order to perform its processing.

**:bulb: Other prerequisites:**

- `cloudformation-kms-production` deployed according to the instructions in [cloudformation-kms](https://github.com/mapbox/cloudformation-kms). Makes encryption of sensitive environment variables that need to be passed to ECS simple using [cfn-config](https://github.com/mapbox/cfn-config).

## What Watchbot provides:

- a queue for you to send messages to in order to trigger your workers to run
- [optionally] [an AWS access key](http://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html) with permission to send messages to the queue
- [an ECS TaskDefinition](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_defintions.html) for your worker, using the image you provide
- one or more watcher containers that run continuously on your cluster, polling the queue, running a worker for each message, removing messages from the queue as workers complete, and managing worker failures and retries
- a script to help you include the resources Watchbot needs to run in your template


## Building a Watchbot service

1. Create a Github repository for your code.
2. Write and test the code that a worker will perform in response to a message.
3. Write a Dockerfile at the root of your repository which defines the steps required to bootstrap a worker. If you specify a `CMD` instructions, this will be executed when your worker is launched in response to a message. Note that message details will be provided as environment variables to your worker, and that your worker's exit code will determine whether the message is deleted or returned to the queue (see below).
4. Use the Dockerfile to build an image and store it in an ECR repository. See [ecs-conex](https://github.com/mapbox/ecs-conex) for a CI framework to do this for you whenever you commit to the repository.
5. Write and deploy your service using a CloudFormation template that watchbot helps you to build.

## More documentation

1. [Building a Watchbot template](./docs/building-a-template.md)
2. [The worker's runtime environment](./docs/worker-runtime-details.md)
3. [What happens when workers fail?](./docs/worker-retry-cycle.md)
4. [Logging and metrics](./docs/logging-and-metrics.md)
5. [Using Watchbot's reduce-mode](./docs/reduce-mode.md)
6. [Watchbot's command-line utilities](./docs/command-line-utilities.md)
7. [Watchbot's CloudWatch alarms](./docs/alarms.md)
