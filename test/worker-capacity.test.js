// var AWS = require('@mapbox/mock-aws-sdk-js');
var file = require('../bin/worker-capacity');
var test = require('tape');

test('calculateRoom', (assert) => {
  var rsvps = { Cpu: '256', Memory: '512' };
  var resources = [
    [{ name: 'CPU', integerValue: '20000' }, { name: 'MEMORY', integerValue: '30000' }],
    [{ name: 'CPU', integerValue: '40000' }, { name: 'MEMORY', integerValue: '40000' }],
    [{ name: 'CPU', integerValue: '60000' }, { name: 'MEMORY', integerValue: '50000' }]
  ];

  var result = file.calculateRoom(resources, rsvps);
  var expected = Math.min((resources[0][0].integerValue/rsvps.Cpu).toFixed(0), (resources[0][1].integerValue/rsvps.Memory).toFixed(0)) +
                 Math.min((resources[1][0].integerValue/rsvps.Cpu).toFixed(0), (resources[1][1].integerValue/rsvps.Memory).toFixed(0)) +
                 Math.min((resources[2][0].integerValue/rsvps.Cpu).toFixed(0), (resources[2][1].integerValue/rsvps.Memory).toFixed(0));
  assert.equal(result, expected, 'should equal sum of tasks per instance based on most limited resource');
  assert.end();
});
