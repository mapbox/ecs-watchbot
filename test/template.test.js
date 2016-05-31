var test = require('tape');
var watchbot = require('..');

test('[template] with taskEnv', function(assert) {
  var taskEnv = { key1: 'value1', key2: 'value2' };
  var template = watchbot.template({ taskEnv: taskEnv });
  assert.equal(typeof template, 'object', 'returns cloudformation template');
  assert.deepEqual(template.Resources.WatchbotTask.Properties.ContainerDefinitions[0].Environment, [
    { Name: 'key1', Value: 'value1' }, { Name: 'key2', Value: 'value2' }
  ], 'sets worker environment variables on worker task definition');
  assert.end();
});

test('[template] without taskEnv', function(assert) {
  var template = watchbot.template();
  assert.equal(typeof template, 'object', 'returns cloudformation template');
  assert.deepEqual(
    template.Resources.WatchbotTask.Properties.ContainerDefinitions[0].Environment,
    [],
    'blank worker environment variables on worker task definition');
  assert.end();
});
