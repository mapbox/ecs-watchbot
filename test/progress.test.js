var template = require('..').template;
var progress = require('../lib/progress');
var sinon = require('sinon');
var Dyno = require('dyno');

var resources = template({
  cluster: 'my-cluster',
  service: 'my-service',
  serviceVersion: 'v1.0.0',
  notificationEmail: 'my-email@place.com',
  reduce: true
}).Resources;

var tape = require('tape');
var dynamodb = require('dynamodb-test')(tape, 'watchbot-progress', resources.WatchbotProgressTable.Properties);
var queue = require('d3-queue').queue;

process.env.DynamoDbEndpoint = 'http://localhost:4567';
process.env.AWS_ACCESS_KEY_ID='-';
process.env.AWS_SECRET_ACCESS_KEY='-';

dynamodb.start();

dynamodb.test('[progress] setTotal', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'success');
    dynamodb.dyno.getItem({ Key: { id: jobId } }, function(err, data) {
      assert.ifError(err, 'got record');
      assert.deepEqual(data.Item, {
        id: jobId,
        parts: Dyno.createSet([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        total: 10
      }, 'recorded expected record');
      assert.end();
    });
  });
});

dynamodb.test('[progress] setTotal (no callback)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10).then(function() {
    dynamodb.dyno.getItem({ Key: { id: jobId } }, function(err, data) {
      assert.ifError(err, 'got record');
      assert.deepEqual(data.Item, {
        id: jobId,
        parts: Dyno.createSet([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        total: 10
      }, 'recorded expected record');
      assert.end();
    });
  });
});

dynamodb.test('[progress] completePart (incomplete)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.completePart(jobId, 4, function(err, completed) {
      assert.ifError(err, 'completePart success');
      assert.notOk(completed, 'upload is not complete');
      dynamodb.dyno.getItem({ Key: { id: jobId } }, function(err, data) {
        assert.ifError(err, 'got record');
        assert.deepEqual(data.Item, {
          id: jobId,
          parts: Dyno.createSet([1, 2, 3, 5, 6, 7, 8, 9, 10]),
          total: 10
        }, 'recorded expected record');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] completePart (incomplete, no callback)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.completePart(jobId, 4).then(function(completed) {
      assert.notOk(completed, 'upload is not complete');
      dynamodb.dyno.getItem({ Key: { id: jobId } }, function(err, data) {
        assert.ifError(err, 'got record');
        assert.deepEqual(data.Item, {
          id: jobId,
          parts: Dyno.createSet([1, 2, 3, 5, 6, 7, 8, 9, 10]),
          total: 10
        }, 'recorded expected record');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] completePart (complete)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');

    var async = queue();
    for (var i = 1; i <= 10; i++) {
      async.defer(client.completePart, jobId, i);
    }
    async.awaitAll(function(err, responses) {
      assert.ifError(err, 'completePart requests succeeded');

      var completeCount = responses.reduce(function(completeCount, complete) {
        if (complete) completeCount++;
        return completeCount;
      }, 0);

      assert.equal(completeCount, 1, 'only one complete response');

      dynamodb.dyno.getItem({ Key: { id: jobId } }, function(err, data) {
        assert.ifError(err, 'got record');
        assert.deepEqual(data.Item, {
          id: jobId,
          total: 10
        }, 'recorded expected record');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] failJob', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.failJob(jobId, 'The job failed', function(err) {
      assert.ifError(err, 'failJob success');
      dynamodb.dyno.getItem({ Key: { id: jobId } }, function(err, data) {
        assert.ifError(err, 'got record');
        assert.deepEqual(data.Item, {
          id: jobId,
          parts: Dyno.createSet([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
          total: 10,
          error: 'The job failed'
        }, 'recorded expected record');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] failJob (no callback)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.failJob(jobId, 'The job failed').then(function() {
      dynamodb.dyno.getItem({ Key: { id: jobId } }, function(err, data) {
        assert.ifError(err, 'got record');
        assert.deepEqual(data.Item, {
          id: jobId,
          parts: Dyno.createSet([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
          total: 10,
          error: 'The job failed'
        }, 'recorded expected record');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] setMetadata', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.setMetadata(jobId, { important: 'info' }, function(err) {
      assert.ifError(err, 'setMetadata success');
      dynamodb.dyno.getItem({ Key: { id: jobId } }, function(err, data) {
        assert.ifError(err, 'got record');
        assert.deepEqual(data.Item, {
          id: jobId,
          parts: Dyno.createSet([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
          total: 10,
          metadata: { important: 'info' }
        }, 'recorded expected record');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] setMetadata (no callback)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.setMetadata(jobId, { important: 'info' }).then(function() {
      dynamodb.dyno.getItem({ Key: { id: jobId } }, function(err, data) {
        assert.ifError(err, 'got record');
        assert.deepEqual(data.Item, {
          id: jobId,
          parts: Dyno.createSet([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
          total: 10,
          metadata: { important: 'info' }
        }, 'recorded expected record');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] status (incomplete)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.completePart(jobId, 4, function(err) {
      assert.ifError(err, 'completePart success');
      client.status(jobId, function(err, status) {
        assert.ifError(err, 'status success');
        assert.deepEqual(status, { progress: 0.1 }, 'expected progress');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] status (incomplete, no callback)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.completePart(jobId, 4, function(err) {
      assert.ifError(err, 'completePart success');
      client.status(jobId).then(function(status) {
        assert.deepEqual(status, { progress: 0.1 }, 'expected progress');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] status (complete)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    var async = queue();
    for (var i = 1; i <= 10; i++) {
      async.defer(client.completePart, jobId, i);
    }
    async.awaitAll(function(err) {
      assert.ifError(err, 'completePart requests succeeded');
      client.status(jobId, function(err, status) {
        assert.ifError(err, 'status success');
        assert.deepEqual(status, { progress: 1 }, 'expected progress');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] status (with failure)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.failJob(jobId, 'The job failed', function(err) {
      assert.ifError(err, 'failJob success');
      client.status(jobId, function(err, status) {
        assert.ifError(err, 'status success');
        assert.deepEqual(status, { progress: 0, failed: 'The job failed' }, 'expected progress');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] status (with metadata)', function(assert) {
  var client = progress(`arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`);
  var jobId = 'my-job';
  client.setTotal(jobId, 10, function(err) {
    assert.ifError(err, 'setTotal success');
    client.setMetadata(jobId, { important: 'info' }, function(err) {
      assert.ifError(err, 'setMetadata success');
      client.status(jobId, function(err, status) {
        assert.ifError(err, 'status success');
        assert.deepEqual(status, { progress: 0, metadata: { important: 'info' } }, 'expected progress');
        assert.end();
      });
    });
  });
});

dynamodb.test('[progress] can read table from env', function(assert) {
  assert.throws(progress, /ProgressTable environment variable is not set/, 'without env an error is thrown');
  process.env.ProgressTable = `arn:aws:dynamodb:local:1234567890:table/${dynamodb.tableName}`;
  assert.doesNotThrow(progress, 'no error when env var is set');
  assert.end();
});

dynamodb.close();

tape('[progress] setTotal dynamodb error', function(assert) {
  var update = sinon.stub();
  update.yields(new Error());
  progress.Dyno = function() { return { updateItem: update }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.setTotal('a', 1, function(err) {
    assert.equal(update.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] setTotal dynamodb error (no callback)', function(assert) {
  var update = sinon.stub();
  update.yields(new Error());
  progress.Dyno = function() { return { updateItem: update }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.setTotal('a', 1).catch(function(err) {
    assert.equal(update.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] completePart dynamodb error', function(assert) {
  var update = sinon.stub();
  update.yields(new Error());
  progress.Dyno = function() { return { updateItem: update }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.completePart('a', 1, function(err) {
    assert.equal(update.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] completePart dynamodb error (no callback)', function(assert) {
  var update = sinon.stub();
  update.yields(new Error());
  progress.Dyno = function() { return { updateItem: update }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.completePart('a', 1).catch(function(err) {
    assert.equal(update.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] failJob dynamodb error', function(assert) {
  var update = sinon.stub();
  update.yields(new Error());
  progress.Dyno = function() { return { updateItem: update }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.failJob('a', 'oopsie', function(err) {
    assert.equal(update.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] failJob dynamodb error (no callback)', function(assert) {
  var update = sinon.stub();
  update.yields(new Error());
  progress.Dyno = function() { return { updateItem: update }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.failJob('a', 'oopsie').catch(function(err) {
    assert.equal(update.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] setMetdata dynamodb error', function(assert) {
  var update = sinon.stub();
  update.yields(new Error());
  progress.Dyno = function() { return { updateItem: update }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.setMetadata('a', { eh: 'aye' }, function(err) {
    assert.equal(update.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] setMetdata dynamodb error (no callback)', function(assert) {
  var update = sinon.stub();
  update.yields(new Error());
  progress.Dyno = function() { return { updateItem: update }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.setMetadata('a', { eh: 'aye' }).catch(function(err) {
    assert.equal(update.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] status dynamodb error', function(assert) {
  var get = sinon.stub();
  get.yields(new Error());
  progress.Dyno = function() { return { getItem: get }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.status('a', function(err) {
    assert.equal(get.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] status dynamodb error (no callback)', function(assert) {
  var get = sinon.stub();
  get.yields(new Error());
  progress.Dyno = function() { return { getItem: get }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.status('a').catch(function(err) {
    assert.equal(get.callCount, 1, 'called mock');
    assert.ok(err, 'passes through error from dynamodb');
    progress.Dyno = Dyno;
    assert.end();
  });
});

tape('[progress] status no record', function(assert) {
  var get = sinon.stub();
  get.yields(null, {});
  progress.Dyno = function() { return { getItem: get }; };
  progress.Dyno.createSet = Dyno.createSet;

  var client = progress('arn:aws:dynamodb:local:1234567890:table/fake');
  client.status('a', function(err, status) {
    assert.ifError(err, 'success');
    assert.equal(get.callCount, 1, 'called mock');
    assert.deepEqual(status, { progress: 0 });
    progress.Dyno = Dyno;
    assert.end();
  });
});
