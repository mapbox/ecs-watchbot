var util = require('./util');
var watchbot = require('..');

util.mock('[notifications] send with callback', function(assert) {
  var arn = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var notifications = watchbot.notifications(arn);
  var context = this;
  notifications.send('subject', 'message', function(err) {
    if (err) return assert.end(err);
    assert.deepEqual(context.sns.config, {
      region: 'us-east-1',
      params: { TopicArn: arn }
    }, 'sns client properly configured');
    assert.deepEqual(context.sns.publish, [
      { Subject: 'subject', Message: 'message' }
    ], 'expected message published');
    assert.end();
  });
});

util.mock('[notifications] send without callback', function(assert) {
  var arn = 'arn:aws:sns:us-east-1:123456789:fake-topic';
  var notifications = watchbot.notifications(arn);
  var context = this;
  notifications.send('subject', 'message');
  assert.deepEqual(context.sns.config, {
    region: 'us-east-1',
    params: { TopicArn: arn }
  }, 'sns client properly configured');
  assert.deepEqual(context.sns.publish, [
    { Subject: 'subject', Message: 'message' }
  ], 'expected message published');
  assert.end();
});
