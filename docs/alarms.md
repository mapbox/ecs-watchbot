# Alarms

This document describes CloudWatch alarms that Watchbot configures. If one of these alarms is tripped, a message will be sent from CloudWatch to the stack's configured `NotificationEmail` or `NotificationTopic`. That message will contain a description field, with a URL pointing to this document.

**In all cases**, SQS messages that failed and led to these alarms are put back into SQS to be retried. [See the worker retry documentation](./worker-retry-cycle.md) for more info.

## FailedWorkerPlacement

### Why?

There were more than 5 attempts to place a worker container in 60 seconds that could not be placed. The failed placement could be due to:

- insufficient CPU or memory was available on the cluster
- failure to start a docker container on a host EC2 because of disk I/O exhaustion
- any other scenario that may have caused the worker not to be placed

### What to do

Most of the time, this is due to a lack of available cluster resources. Use [the provided CLI command](./command-line-utilities.md#assessing-worker-capacity-in-your-service's cluster) to get a sense of how much space is free in your cluster. If necessary, increase available resources on your cluster by removing other tasks or launching new EC2s.

If resource availability on the cluster does not appear to be the problem, then you'll need to dig into logs in order to understand what the problem is. Check watcher logs for any indication of the reason for job placement failure by searching for `failedPlacement`.

## WorkerErrors

### Why?

There were more than a threshold number of worker containers that failed to process successfully in a 60 second period. The threshold is configured when you create your template via `watchbot.template()` through the `options.errorThreshold` value. The default threshold is 10 errors per minute.

### What to do

These errors represent situations where an SQS message resulted in the launch of a worker container, and that container exited with an exit code of **anything other than** `0` or `4`. See [the readme](./worker-runtime-details.md#worker-completion) for more information about how Watchbot interprets container's exit codes.

This likely represents an error in your worker's code, or an edge-case that your application is unable to cope with. Most of the time, the solution to this problem is deduced by searching through worker logs in CloudWatch logs.

##  QueueSize

### Why?

There were more than a threshold number of messages in the SQS queue for some period of time. Both the threshold and the alarm period are configured when you create your template via `watchbot.template()` through the `options.alarmThreshold` and `options.alarmPeriod` values. The default threshold is 40, and the default period is 2 hours.

### What to do

This represents a situation where messages are piling up in SQS faster than they are being processed. You may need to decrease the rate at which messages are being sent to SQS, or investigate whether there is something else preventing workers from processing effectively.

## DeadLetter

### Why?

There are visible messages in the dead letter queue. SQS messages are received by Watchbot's watcher container. If processing the message fails for any reason, the message is sent back to Watchbot's primary queue and will be retried. If 10 attempts to process a message result in a failure, then the message will be sent to the dead letter queue. [See the worker retry documentation](./worker-retry-cycle.md) for more info.

### What to do

These messages consistently failed processing attempts. It is possible that these messages represent an edge case in your worker's processing code. In this case, you should investigate your system's logs to try and determine how the workers failed.

It is also possible that this represents failure to successfully place workers in your cluster. If this is the case, then you will also have seen alarms on FailedWorkerPlacement (see above).
