
### 5.0.0

-  Sets `PropagateTags` to `TASK_DEFINITION` on the ECS Service. If you are on the old ARN format currently this will move you to the new ARN format by replacing your current service with a new service. This replacement is safe as AWS directs traffic to the new service before taking down the old one. Details on the new ARN format are below.

**ECS Service**

- Old: arn:aws:ecs:region:account-id:service/service-name
- New: arn:aws:ecs:region:account-id:service/cluster-name/service-name

**ECS Task**

- Old: arn:aws:ecs:region:account-id:task/task-id
- New: arn:aws:ecs:region:account-id:task/cluster-name/task-id

### 4.20.2

- Using InChina instead of NotInChina Cloudformation condition: https://github.com/mapbox/ecs-watchbot/pull/329

### 4.20.1

- Fixes for alpine binary: https://github.com/mapbox/ecs-watchbot/pull/328/files
- Use native code pipeline with alpine-specific target instead of all targets

### 4.20.0

- Upgrades from Node 8 to Node 10: https://github.com/mapbox/ecs-watchbot/pull/325
- Applies lint fixes and updates dependencies by several major versions: https://github.com/mapbox/ecs-watchbot/pull/325

### 4.19.0

- Adds us-west-1 support: https://github.com/mapbox/ecs-watchbot/pull/323


### 4.18.0

- Adds cn-northwest-1 support: https://github.com/mapbox/ecs-watchbot/pull/322

### 4.17.0

- Metrics: Adds (approximate) response duration custom metric.

### 4.16.1

- FIX: Missing properties/type key in CW dashboard change.

### 4.16.0

- Dashboard: Add queue oldest-message wait time, worker duration to CW dashboard

### 4.15.1

- Bump js-yaml from 3.12.0 to 3.13.1 for security reasons
- Small Readme improvements (thanks @nickcordella and @ScottBrenner)

### 4.15.0

- Changes the Lambda functions a watchbot stack creates to use the node 8 runtime

### 4.14.0

- Modifies CloudWatch alarm names to include the AWS region.

### 4.13.3

- Make `Family` property optional in docs
- Upgrade @mapbox/watchbot-progress dependencies

### 4.13.2

- Fixes a regression from v4.13.0 that resulted in an invalid IAM role. https://github.com/mapbox/ecs-watchbot/pull/297

### 4.13.1

- Fixes behavior when a worker exits with code `3`: now an notification will be triggered, as the documentation states.

### 4.13.0

- Adds support for first-in-first-out (FIFO) SQS queues. https://github.com/mapbox/ecs-watchbot/pull/279

### 4.12.0
- Add `options.deadletterAlarm` (default=true) to disable the alarm resource for dead letter queue messages https://github.com/mapbox/ecs-watchbot/pull/288

### 4.11.2
- Patch bug with CPU reservations as cf.ref() introduced in https://github.com/mapbox/ecs-watchbot/pull/282, and addressed with https://github.com/mapbox/ecs-watchbot/pull/289

### 4.11.1
- Re-Introduce `WorkerDuration` and `MessageReceives` metrics (removed since v4)

### 4.11.0
- Remove CPU Alarm: https://github.com/mapbox/ecs-watchbot/pull/282
- Minimum CPU value for watchbot container is now 128

### 4.10.0

- Create a new metric of `TotalMessages` to prevent accidental scaledown: https://github.com/mapbox/ecs-watchbot/pull/267

### 4.9.1

- Hardcode messageTimeout: https://github.com/mapbox/ecs-watchbot/pull/264

### 4.9.0

- Now builds binaries for alpine linux: https://github.com/mapbox/ecs-watchbot/pull/266

### 4.8.3

- Only add the /tmp mount if it isn't already there: https://github.com/mapbox/ecs-watchbot/pull/262

### 4.8.1

- Create binaries when tags are added manually too: https://github.com/mapbox/ecs-watchbot/pull/259

### 4.8.0

- Add reduce mode functionality to version 4: https://github.com/mapbox/ecs-watchbot/pull/221

### 4.7.1

- Fix scaling compatibility with cn-north-1 https://github.com/mapbox/ecs-watchbot/pull/257

### 4.7.0

- Compatiblity with cn-north-1 https://github.com/mapbox/ecs-watchbot/pull/251

### 4.6.0
- Custom Cloudformation resource for watchbot service scaling. Allows maxSize to be parameterized within a template: https://github.com/mapbox/ecs-watchbot/pull/249

### 4.5.6
- Fix undefined this.message within setInterval: https://github.com/mapbox/ecs-watchbot/pull/250

### 4.5.5

- Add a code-pipeline stack for auto-generating watchbot binaries: https://github.com/mapbox/ecs-watchbot/pull/235

### 4.5.4

- Add dead letter queue: https://github.com/mapbox/ecs-watchbot/pull/220

### 4.5.2

- Prefix the dashboard names: https://github.com/mapbox/ecs-watchbot/pull/245

### 4.5.2

- Prefix the alarm names: https://github.com/mapbox/ecs-watchbot/pull/244

### 4.5.1

- Modify logging to prefix all worker logs with `[worker]`: https://github.com/mapbox/ecs-watchbot/pull/225

### 4.5.0

- Add maxJobDuration and a heartbeat for message timeout: https://github.com/mapbox/ecs-watchbot/pull/230

### 4.4.4

- See 4.5

### 4.4.3

- Allow writable file system: https://github.com/mapbox/ecs-watchbot/pull/239

### 4.4.2

- Remove node 8 engine requirement: https://github.com/mapbox/ecs-watchbot/pull/237

### 4.4.1

- Only expose `./lib/template` through `index.js` so people can run node 6 locally: https://github.com/mapbox/ecs-watchbot/pull/236

### 4.4.0

- Change `fresh` mode to `writableFilesystem` mode: https://github.com/mapbox/ecs-watchbot/pull/234

### 4.3.0

- Add CPUUtilization and MemoryUtilization alarms: https://github.com/mapbox/ecs-watchbot/pull/231

### 4.2.0

- Remove watchbot-log binary: https://github.com/mapbox/ecs-watchbot/pull/227
- Use stackName in the `Name` property of the ContainerDefinition: https://github.com/mapbox/ecs-watchbot/pull/226

### 4.1.0

- Add cloudwatch dashboard: https://github.com/mapbox/ecs-watchbot/pull/222

### 4.0.0

- Major revamp of watchbot internals. (refs #184). The system now:
  - Relies on an ECS service for scaling
  - Provides users metrics on cpu and memory utilization of all containers
  - Re-uses the same containers to process multiple jobs, reducing overhead

### 3.5.1

- Clearer error messages from the CLI tool for bad user input.

### 3.5.0

- Adds a log message if the watcher receives an SQS message that it has already launched a task for, and is still waiting to learn whether that task succeeded or failed.
- Upon receiving a duplicate message, the watcher checks if the in-flight task is in `PENDING` state. If so, it stops the task and returns the message to SQS for a retry.

### 3.4.1

- Fixes `DeadLetterAlarm` thresholding: changes `ComparisonOperator` from `GreaterThanThreshold` to `GreaterThanOrEqualToThreshold` so that alarm is triggered when a single message is sent to the DeadLetterQueue.

### 3.4.0

- Makes `EvaluationPeriods` for `FailedWorkerPlacementAlarm` customizable

### 3.3.0

- Adds `.ref.notificationTopic` to the output from `watchbot.template()`

### 3.2.1

- Adjusts watcher permissions on RunTask so that it can only launch its own Worker tasks.

### 3.2.0

- Adds a configuration option to specify `placementConstraints` of watchbot's task definitions

### 3.1.0

- Adds a configuration option to specify a `Family` property of watchbot's task definitions

### 3.0.2

- Adjust CloudWatch Event Rule names to allow stacks to include multiple sets of watchbot resources

### 3.0.1

- Adjusts log group names to allow stacks to include multiple sets of watchbot resources
  - LogGroup names are now `${stack-name}-${region}-${prefix}`, where `prefix` defaults to `watchbot` if not otherwise specified.

### 3.0.0

- **BREAKING** changes to the format with which CloudWatch LogGroups and streams are named. These should be considered breaking changes because upgrading a stack from v2.x to v3.x in-place will result in CloudFormation conflicts. Circumvent the conflicts by manually deleting the existing log group before running the CloudFormation update.
  - LogGroup names are now `${stack-name}-${region}`
  - Streams are now prefixed with `${service-version}` (a GitSha in most cases)

### 2.5.2

- More permissive engines.node

### 2.5.1

- Fixes a regression in 2.5.0, allowing watcher containers to launch workers with new family names.

### 2.5.0

- Task definitions created by Watchbot's `.template(options)` function will now use `options.service` as the task definition's family.

### 2.4.0

- Upgrade node.js runtime to 4.3 for webhook function

### 2.3.1

- Add quotes around `$@` operator in the watchbot-progress.sh script to preserve spaces in metadata arguments [#142](https://github.com/mapbox/ecs-watchbot/pull/142)

### 2.3.0

- Add metric for the amount of time the task spent in `PENDING` state.

### 2.2.4

- find watchbot-progress's path using `require.resolve` to work with Yarn's flat dependency tree [#131](https://github.com/mapbox/ecs-watchbot/issues/131)

### 2.2.3

- set ulimit to 10240 in the container definition

### 2.2.2

- always uses exponential backoff when returning work messages to SQS

### 2.2.1

- fixes error handling for `Cannot*ContainerError` no-op
- stale messages in the TaskEventQueue will be dropped after 20 minutes
- watcher runs on ubuntu 16.04 LTS

### 2.2.0

- `CannotStartContainerError`, `CannotPullContainerError` and `DockerTimeoutError` errors do not cause notifications when AlarmOnEveryError is set

### 2.1.1

- Removes `-event-target` from the ID of the cloudwatch events filter to make it shorter. refs #119

### 2.1.0

- fixes a bug in the changelog
- consolidates CLI commands into a single `watchbot` command
- adds a CLI command for interacting with the dead letter queue. **Note** that you cannot use the CLI unless you're working with a 2.1.0+ stack.

### 2.0.0

- fixes a bug that wouldn't have allowed you to disable exponential backoff
- returns `task.container[n].reason` as `reason` when task finishes, if available
- adds a second SQS queue used for the watcher's internal tracking of CloudWatch task state-change events
- adds ephemeral, or non-persistent, volume compatibility (see [AWS's task data volume documentation](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_data_volumes.html))
- adds mount point object compatibility for cloudfriend operators, and any other operators that use semicolons and commas
- adds a `worker-capacity` script to estimate how many additional worker tasks can be placed in your service's cluster at its current capacity
- adds CloudWatch metrics for worker errors (non-zero exit codes), failed worker container placement, worker duration, watcher concurrency, and message receive counts
- adds an alarm for number of worker errors in 60s, configurable through `watchbot.template(options)` `.errorThreshold`. Defaults to alarms after 10 failures per minute.
- drops polling of DescribeTasks API to learn when workers are completed
- **BREAKING** removes cluster resource polling - workers will try to be placed and fail instead of avoiding placement attempts
- **BREAKING** by default, watchbot no longer sends notification emails each time a worker errors. You can opt-in to this behavior by setting `watchbot.template(options)` `.alarmOnEachFailure: true`.
- **BREAKING** no longer sends notifications on error interacting with SQS. Instead watchbot silently proceeds.
- **BREAKING** watcher log format has changed. Now watcher logs print JSON objects
- **BREAKING** removes `.notifyAfterRetries` option
- **BREAKING** removes `.backoff` option. Workers are always retried with exponential backoff
- **BREAKING** adds a dead letter queue. Messages received more than 14 times by a watcher container will be sent to this queue. Any visible messages in this queue will trip an alarm.

### 1.4.0

- adds `options.reservation.softMemory` which allows the caller to set up a soft memory reservation on worker tasks

### 1.3.6

- bump watchbot-progress to v1.1.1, handles a bug in checking part status on a completed job

### 1.3.5

- move to @mapbox/watchbot, use MemoryReservation soft limit for the Watcher task

### 1.3.4

- update and switch to namespaced package for `@mapbox/watchbot-progress`

### 1.3.3

- reimplement and fix `NotifyAfterRetries` as a watcher environment variable

### 1.3.2

- fix a bug where `NotifyAfterRetries` was still expected in watcher container environment

### 1.3.1

- adds duration (in seconds) to watcher log output when tasks complete
- fix bug with `NotifyAfterRetries` where the environment variable was set in the watcher container, not the worker.

### 1.3.0

- adds `options.privileged` parameter to watchbot's template

### 1.2.0

- Adds `.ref.queueName` to the output from `watchbot.template()`
- Clarifies watcher log messages conveying outcome when tasks finish

### 1.1.1

- Fixes a bug where task launching could fail due to a `startedBy` name longer than 36 characters

### 1.1.0

- Adds support for us-east-2 (Ohio)

### 1.0.4

- Allows `options.logAggregationFunction` to reference a potentially empty stack parameter

### 1.0.3

- Adds event emitter to signal when cluster instances have been identified
- Adds error emitter to signal when there are no cluster instances
- Adds readCapacityUnits & writeCapacityUnits configurable watchbot.template option params
- Adds error handling for log line >50kb edge case
- Exposes notifyAfterRetry concept to retry jobs before sending alarms
- Adds pagination for describeContainerInstances
- Adds watchbot-progress dependency

### 1.0.2

- Adds support for ap-* regions by adding regional mapping for worker/watcher images assuming ecs-conex is doing your image packaging.

### 1.0.1

- Fix bug where watchbot would not retry running a task if it encountered a RESOURCE:CPU contrainst error.

### 1.0.0

- **Breaking** requires KMS key under the CF export `cloudformation-kms-production` to grant worker tasks permission to decrypt secure environment variables. See README and https://github.com/mapbox/cloudformation-kms, https://github.com/mapbox/decrypt-kms-env.

### 0.0.14

- Fix potential race condition when creating `LogForwarding`

### 0.0.13

- Adds EcsWatchbotVersion to template Metadata

### 0.0.12

- allow `workers` and `backoff` to be a ref
- adds `options.debugLogs` to enable verbose logging
- adds log stream prefix to organize worker/watcher logs better
- fix for worker role in reduce mode

### 0.0.11

- fixes a bug that could produce an invalid template if no memory reservation is specified. New default memory is 64MB
- fixes a bug that limited a watcher to maintaining at most 100 concurrent workers
- adds `reduce` option to `watchbot.template()` for tracking map-reduce operations
- adds example recipes for workers using `reduce` mode
- **Breaking** changes the `startedBy` attribute of worker tasks to the stack's name

### 0.0.10

- fixes a bug where `options.command` would break the watcher
- adds `.ref.queueUrl` and `.ref.queueArn` references to object returned by `watchbot.template()`
- automatically provide workers with permission to publish to watchbot's SNS topic
- adds `watchbot.logStream`, a node.js writable stream for prefixing logs
- **Breaking** changes the name of the SQS queue, making it a bit easier to find in the console
- **Breaking** switch to TaskRole instead of grafting permissions onto a predefined role

### 0.0.9

- fixes a template generation bug for callers that do not use mount points

### 0.0.8

- adds `logAggregationFunction` argument to watchbot.template
- allow caller to set container CMD
- template validation, cleanups, default watchbot version

### 0.0.7

- overhauls template building process, providing scripts that expose Watchbot's resources as JavaScript objects

### 0.0.6

- container logs are sent from Docker to CloudWatch Logs instead of syslog
- a watchbot stack creates its own CloudWatch LogGroup and sends all container logs to it
- on task failure, reads recent container logs from CloudWatch and includes them in notifications
- adds helper functions to run as part of the worker which help generate homogeneous, searchable log output

### 0.0.5

- silences `[status]` log messages unless logLevel is set to `debug`
- improved message body in notifications sent when task fail

### 0.0.4

- logs are sent to syslog instead of to a file assumed to be mounted from the host machine
- new template builder arguments to only include certain resources (e.g. webhooks) if you ask for them

### 0.0.3

- watcher pays attention to cluster resource reservation, avoids polling the queue when the cluster is fully utilized, and retries runTask requests if a request fails due to lack of memory.
- template sets up watcher permissions such that updates to the worker's task definition will not lead to permissions failures in the midst of a deploy

### 0.0.2

- watcher logs include message subject and body
- gracefully return messages to the queue if the ECS API fails to run a task
- handle situations where a single watcher receives the same message twice
- adjust alarm description in CloudFormation template

### 0.0.1

- First sketch of Watchbot on ECS
