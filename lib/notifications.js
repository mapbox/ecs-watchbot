var AWS = require('aws-sdk');

/**
 * Creates notifications objects
 *
 * @static
 * @memberof watchbot
 * @name notifications
 * @param {string} topic - the ARN of an SNS topic to receive notifications
 * @returns {object} an {@link notifications} object
 */
module.exports = function notifications(topic) {
  var sns = new AWS.SNS({
    region: topic.split(':')[3],
    params: { TopicArn: topic }
  });

  /**
   * An notifications object
   */
  var notifications = {};

  /**
   * Send a notification to the SNS topic
   *
   * @param {string} subject - the subject of the message
   * @param {string} message - the body of the message
   * @param {function} callback - a function to call when the notification has
   * been sent
   */
  notifications.send = function(subject, message, callback) {
    callback = callback || function() {};
    sns.publish({ Subject: subject, Message: message }, callback);
  };

  return notifications;
};
