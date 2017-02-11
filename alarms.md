# Alarms

This document describes CloudWatch alarms that Watchbot configures. If one of these alarms is tripped, a message will be sent from CloudWatch to the stack's configured `NotificationEmail` or `NotificationTopic`. That message will contain a description field, with a URL pointing to this document.

**In all cases**, SQS messages that failed and led to these alarms are put back into SQS to be retried.

## FailedWorkerPlacement

### Why?

There were more than 5 attempts to place a worker container in 60 seconds that could not be placed. The failed placement could be due to:

- insufficient CPU or memory was available on the cluster
- failure to start a docker container on a host EC2 because of disk I/O exhaustion
- any other scenario that may have caused the worker not to be placed

### What to do

Most of the time, this is due to a lack of available cluster resources. Use [the provided CLI command](./readme.md#assessing-worker-capacity-in-your-service's cluster) to get a sense of how much space is free in your cluster. If necessary, increase available resources on your cluster by removing other tasks or launching new EC2s.

If resource availability on the cluster does not appear to be the problem, then you'll need to dig into logs in order to understand what the problem is. Check watcher logs for any indication of the reason for job placement failure by searching for `failedPlacement`.

## WorkerErrors

### Why?

There were more than a threshold number of worker containers that failed to process successfully in a 60 second period. The threshold is configured when you create your template via `watchbot.template()` through the `options.errorThreshold` value. The default threshold is 10 errors per minute.

### What to do

These errors represent situations where an SQS message resulted in the launch of a worker container, and that container exited with an exit code of **anything other than** `0` or `4`. See [the readme](./readme.md#task-completion) for more information about how watchbot interprets container's exit codes.

This likely represents an error in your worker's code, or an edge-case that your application is unable to cope with. Most of the time, the solution to this problem is deduced by searching through worker logs in CloudWatch logs.

##  QueueSize

### Why?

There were more than a threshold number of messages in the SQS queue for some period of time. Both the threshold and the alarm period are configured when you create your template via `watchbot.tempalte()` through the `options.alarmThreshold` and `options.alarmPeriod` values. The default threshold is 40, and the default period is 2 hours.

### What to do?

This represents a situation where messages are piling up in SQS faster than they are being processed. You may need to decrease the rate at which messages are being sent to SQS, or investigate whether there is something else preventing workers from processing effectively.
