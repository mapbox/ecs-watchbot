var http = require('http');
var AWS = require('aws-sdk');

module.exports = introspection;

function introspection(watcherContainerName, cluster, callback) {
  listHostTasks(function(err, data) {
    if (err) return callback(err);

    var watcher = data.Tasks.find(function(task) {
      return task.Containers.find(function(container) {
        return container.Name === watcherContainerName;
      });
    });

    if (!watcher) return callback(new Error('Watcher introspection failed'));

    findServiceId(watcher.Arn, cluster, callback);
  });
}

function listHostTasks(callback) {
  http.get('http://localhost:51678/v1/tasks', function(res) {
    var data = '';
    res
      .on('error', callback)
      .on('data', function(d) { data += d; })
      .on('end', function() { callback(null, JSON.parse(data)); });
  });
}

function findServiceId(arn, cluster, callback) {
  var region = arn.split(':')[3];
  var ecs = new AWS.ECS({ region: region });

  ecs.describeTasks({ tasks: [arn], cluster: cluster }, function(err, data) {
    if (err) return callback(err);
    callback(data.tasks[0].startedBy);
  });
}
