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

