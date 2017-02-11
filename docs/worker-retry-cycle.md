## Worker retry cycle

Any single Watchbot message will be attempted up to 10 times. Each time the message fails it is put back into the queue with an increasing backoff interval before it can be attempted again. These intervals look like:

attempt number | backoff interval (s)
--- | ---
1 | 2
2 | 4
3 | 8
4 | 16
5 | 32
6 | 64
7 | 128
8 | 256
9 | 512
10 | --> dead letter queue

This means that after a failure on the 9th attempt, the message will be invisible for at least 512 seconds before it is retried. Providing an increasing backoff interval with an increasing number of failures helps alleviate load that your processing may be placing on external systems.

Each time a message fails to during processing, it is recorded in [the WorkerErrors or FailedWorkerPlacement metrics](./logging-and-metrics.md#custom-metrics). The [WorkerErrors alarm](./alarms.md#workererrors) will trigger whenever there are more than a configured number of failed attempts per minute. The [FailedWorkerPlacement alarm](./alarms.md#failedworkerplacement) will trigger if there are more than 5 failed placements per minute.

If the 10th attempt to process a message fails, then the message will have been retrying for a minimum of 17 minutes, and at this point it will fall into a dead letter queue.

**Important: number of attempts != number of times a worker has tried to process a message**. If a cluster is full, Watchbot will attempt to place workers, fail, replace the messages in the queue, and try again. This counts as an attempt. If cluster capacity is a problem, the cluster basically has 17 minutes to accommodate the increased demand before message will start falling into the dead letter queue. During this time, Watchbot will also trip the [FailedWorkerPlacement alarm](./alarms.md#failedworkerplacement), in case manual intervention is required.

## The dead letter queue

If a message fails processing 10 times, Watchbot will stop attempting it. The message will be dropped into a second SQS queue, called a dead letter queue. When there are **any** messages visible in this queue, Watchbot will trip the [DeadLetter alarm](./alarms.md#deadletter). This helps to give visibility into edge-case messages that may highlight a bug in worker code that needs more attention.

Once a message is in the dead letter queue, it will stay there until it is manually removed, or after 14 days. Coming soon: command-line utility to help process messages in the dead letter queue.
