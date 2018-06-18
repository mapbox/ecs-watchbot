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

## Custom metrics

Custom metrics are collected under the namespace `Mapbox/ecs-watchbot`. They are mined via filters on CloudWatch logs, and can help you learn about the state of your Watchbot stack. Each custom metric is suffixed with your stack's name, e.g. `-MyWatchbotStack`.

Metric | Description | Statistics
--- | --- | ---
**FailedWorkerPlacement** | The total number of times a watcher had difficulty placing a worker on the cluster - This probably means your concurrency is too high, your reservations are too high, or your cluster is too small | Sum
**WorkerErrors** | The total number of failed workers per minute. High levels of this error trigger the `WorkerErrors` alarm | Sum
**MessageReceives** | A metric collected for every received message that indicates how many times the message has been pulled from the queue | Maximum
**WatcherConcurrency** | The number of workers running per watcher | `Sum`and `Average`
**WorkerDuration** | The amount of time taken by a worker to run a task | `Average`, `Minimum` and `Maximum`

