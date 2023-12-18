# Alarms

This document describes CloudWatch alarms that Watchbot configures. If one of these alarms is tripped, a message will be sent from CloudWatch to the stack's configured `alarms.action`. That message will contain a description field, with a URL pointing to this document.

**In all cases**, SQS messages that failed and led to these alarms are put back into SQS to be retried. [See the worker retry documentation](/docs/worker-retry-cycle.md) for more info.

<!-- toc -->

- [WorkerErrors](#workererrors)
  * [Why?](#why)
  * [What to do](#what-to-do)
- [QueueSize](#queuesize)
  * [Why?](#why-1)
  * [What to do](#what-to-do-1)
- [DeadLetterQueueSize](#deadletterqueuesize)
  * [Why?](#why-2)
  * [What to do](#what-to-do-2)
- [MemoryUtilization](#memoryutilization)
  * [Why?](#why-3)
  * [What to do](#what-to-do-3)
- [CpuUtilization](#cpuutilization)
  * [Why?](#why-4)
  * [What to do](#what-to-do-4)

<!-- tocstop -->

## WorkerErrors

### Why?

There were more than a threshold number of worker containers that failed to process successfully in the configured period. The threshold is configured using the `alarms.workersErrors.threshold` property. The default threshold is 10 errors per minute.

### What to do

These errors represent situations where an SQS message resulted in the launch of a worker container, and that container exited with an exit code of **anything other than** `0` or `4`. See [/docs/worker-runtime-details.md](/docs/worker-runtime-details.md#worker-completion) for more information about how Watchbot interprets container's exit codes.

This likely represents an error in your worker's code, or an edge-case that your application is unable to cope with. Most of the time, the solution to this problem is deduced by searching through worker logs in CloudWatch logs.

##  QueueSize

### Why?

There were more than a threshold number of messages in the SQS queue for some period of time. Both the threshold and the alarm period are configured when you create your template via `watchbot.template()` through the `options.alarmThreshold` and `options.alarmPeriod` values. The default threshold is 40, and the default period is 2 hours.

### What to do

This represents a situation where messages are piling up in SQS faster than they are being processed. You may need to decrease the rate at which messages are being sent to SQS, or investigate whether there is something else preventing workers from processing effectively.

## DeadLetterQueueSize

### Why?

There are visible messages in the dead letter queue. SQS messages are received by Watchbot's watcher container. If processing the message fails for any reason, the message is sent back to Watchbot's primary queue and will be retried. If the `deadLetterThreshold` number of attempts is reached without successful processing, then the message will be sent to the dead letter queue. [See the worker retry documentation](/docs/worker-retry-cycle.md) for more info.

### What to do

These messages consistently failed processing attempts. It is possible that these messages represent an edge case in your worker's processing code. In this case, you should investigate your system's logs to try and determine how the workers failed.

It is also possible that this represents failure to successfully place workers in your cluster.

## MemoryUtilization

### Why?

The memory utilization metric is the average percent memory used by the ECS tasks in the service. The metric reported to cloudwatch is [calculated with the following formula](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cloudwatch-metrics.html#service_utilization):

```
                                         (Total MiB of memory used by tasks in service) x 100
Service memory utilization =  --------------------------------------------------------------------------------
                              (Total MiB of memory reserved in task definition) x (number of tasks in service)
```
_(really just a fancy way of saying average memory % of all tasks)_

Where "memory reserved in task definition" is based on the soft memory limit set in the cloudformation template. Ideally, average memory utilization should stay around 70%, which will help your cluster resources maintain high utilization while not negatively impacting the operation of the service.

Increasing memory usage could be a sign of a memory leak. If a task bursts above its soft memory limit and there's not enough memory on the EC2 instance to absorb the additional memory requirements, the task may be killed. Aditionally, the spike above 100% could negatively impact other tasks running on the instance.

### What to do

Check for any processes that are continually growing in memory usage. Try to verify whether their growth is expected, or a potential leak. If memory usage appears stable but beyond the alarm threshold, the task memory quota may need to be increased with a bump in the `reservation.softMemory` [option](https://github.com/mapbox/ecs-watchbot/blob/master/docs/building-a-template.md#watchbottemplate-options) in the cloudformation template.

## CpuUtilization

### Why?

The CPUUtilization metric is the average percent CPU used by the ECS tasks in the service. The metric reported to cloudwatch is [calculated with the following formula](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cloudwatch-metrics.html#service_utilization):

```
                                      (Total CPU units used by tasks in service) x 100
Service CPU utilization =  ----------------------------------------------------------------------------
                           (Total CPU units reserved in task definition) x (number of tasks in service)
```

_(really just a fancy way of saying average CPU % used by all tasks)_

You should determine whether there is any impact on the service, such as job slowdown, timeouts, or application errors.

### What to do

If the CPU utilization is regularly breaking the reservation, the task CPU quota may need to be increased with a bump in the `cpu` [property](https://github.com/mapbox/ecs-watchbot/blob/master/lib/watchbot.ts#L61) in the CDK construct.

