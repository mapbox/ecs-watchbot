'use strict';

/* NOTE: this scipt is meant to be run via Jest, not Tape */

const assert = require('assert');
const template = require('../lib/template');
const cf = require('@mapbox/cloudfriend');

test('[template]', () => {
  assert.throws(
    () => template(),
    /options.service is required/,
    'throws when missing required options'
  );

  const builtWithDefaults = cf.merge(template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    notificationEmail: 'hello@mapbox.pagerduty.com'
  }));

  expect(builtWithDefaults).toMatchSnapshot('defaults');

  const setsAllOptions = cf.merge(template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    permissions: [
      {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::bucket/*'
      }
    ],
    env: {
      MyKey: 'MyValue'
    },
    prefix: 'Soup',
    family: 'abc-123',
    maxSize: 90,
    mounts: '/data,/ephemeral',
    reservation: {
      memory: 512,
      softMemory: 128,
      cpu: 4096
    },
    privileged: true,
    reduce: true,
    maxJobDuration: 300,
    messageRetention: 1096,
    notificationEmail: 'hello@mapbox.pagerduty.com'
  }));

  expect(setsAllOptions).toMatchSnapshot('all-properties');
});
