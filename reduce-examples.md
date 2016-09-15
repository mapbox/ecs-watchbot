# watchbot-reduce examples

Simple examples of how you may wish to use watchbot's progress tracking tools.

## Bash

```sh
#!/usr/bin/env bash

set -e

# In this example, `./worker` provides worker-* functions that actually perform
# processing. This example script just covers the interactions with watchbot-progress.
source ./worker

case "${Subject}" in
  "start-job") startup;;
  "map") map;;
  "reduce") reduce;;
esac

function startup() {
  numParts=$(worker-start-job ${Message})
  job=${MessageId}

  watchbot-progress set-total ${job} --total ${numParts}

  part=0
  while part < ${numParts}; do
    aws sns publish --topic-arn ${WorkTopic} --subject "map" --message "${job} ${part}"
    part=$((part + 1))
  done
}

function map() {
  message=(${Message})
  job=${message[0]}
  part=${message[1]}

  status=$(watchbot-progress status ${job})
  failure=$(jq -r '.failed' <<< ${status})
  [ "${failure}" != "" ] && exit 0

  code=0
  fail=$(worker-process-part ${job} ${part}) || code=$?
  [ "${fail}" != "" ] && watchbot-progress fail-job ${job} ${fail} && exit 0
  [ "${code}" != "0" ] && exit ${code}

  complete=$(watchbot-progress complete-part ${job} --part ${part})
  if [ "${complete}" == "true" ]; then
    aws sns publish --topic-arn ${WorkTopic} --subject "reduce" --message "${job}"
  fi
}

function reduce() {
  worker-complete-job ${Message}
}
```

## JavaScript

```js
#!/usr/bin/env node

var AWS = require('aws-sdk');
var progress = require('watchbot').progress();

// In this example, the `./worker.js` module contains the actual logic for
// processing jobs. This example script just covers the interactions with
// watchbot.progress.
var worker = require('./worker');

switch(process.env.Subject) {
  case 'start-job':
    startup(process.env.Message);
    break;
  case 'map':
    map(process.env.Message);
    break;
  case 'reduce':
    reduce(process.env.Message);
    break;
}

function startup(message) {
  var job = worker.startJob(message);

  progress.setTotal(job.id, job.parts).then(() => {
    var topic = process.env.WorkTopic;
    var sns = new AWS.SNS({
      region: topic.split(':')[3],
      params: { TopicArn: topic, Subject: 'map' }
    });

    var messages = [];

    for (var i = 0; i < job.parts; i++) {
      var msg = { id: job.id, part: i };
      var publish = sns.publish({ Message: JSON.stringify(msg) }).promise();
      messages.push(publish);
    }

    return Promise.all(messages);
  });
}

function map(message) {
  message = JSON.parse(message);

  progress.status(message.id).then(status => {
    if (status.failed) return console.log(`Skipping part ${message.part} from failed job ${message.id}`);

    worker.processPart(message)
      .then(() => progress.completePart(message.id, message.part))
      .then(isComplete => {
        if (isComplete) {
          var topic = process.env.WorkTopic;
          var sns = new AWS.SNS({ region: topic.split(':')[3]});
          var params = {
            TopicArn: topic,
            Subject: 'reduce',
            Message: JSON.stringify({ id: message.id })
          };

          return sns.publish(params).promise();
        }
      })
      .catch(err => {
        if (worker.isRetryable(err)) process.exit(1);
        else progress.failJob(message.id, err.message);
      });
  });
}

function reduce(message) {
  worker.completeJob(message);
}
```
