'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const test = require('tape');
const cf = require('@mapbox/cloudfriend');
const template = require('../lib/template');

test('[template validation] defaults', async (assert) => {
  const builtWithDefaults = template({
    service: 'example',
    serviceVersion: '1',
    command: 'echo hello world',
    cluster: 'processing',
    notificationEmail: 'hello@mapbox.pagerduty.com'
  });

  const tmp = path.join(os.tmpdir(), crypto.randomBytes(8).toString('hex'));
  fs.writeFileSync(tmp, JSON.stringify(builtWithDefaults));

  try {
    await cf.validate(tmp);
    assert.pass('template is valid');
  } catch (err) {
    assert.ifError(err, 'template is not valid');
  }

  assert.end();
});

test('[template validation] options set', async (assert) => {
  const setsAllOptions = template({
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
    workers: 90,
    mounts: '/mnt/data:/data,/ephemeral',
    reservation: {
      memory: 512,
      softMemory: 128,
      cpu: 4096
    },
    privileged: true,
    messageTimeout: 300,
    messageRetention: 1096,
    notificationEmail: 'hello@mapbox.pagerduty.com'
  });

  const tmp = path.join(os.tmpdir(), crypto.randomBytes(8).toString('hex'));
  fs.writeFileSync(tmp, JSON.stringify(setsAllOptions));

  try {
    await cf.validate(tmp);
    assert.pass('template is valid');
  } catch (err) {
    assert.ifError(err, 'template is not valid');
  }

  assert.end();
});
