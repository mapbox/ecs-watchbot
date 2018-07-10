'use strict';

const test = require('tape');
const fs = require('fs');
const wbg = require('../bin/watchbot-binary-generator');
const AWS = require('@mapbox/mock-aws-sdk-js');
const sinon = require('sinon');

test('getTagForSha: commit found', async (assert) => {
  const execStub = sinon.stub(wbg, 'exec').callsFake((command) => {
    assert.equals(command, 'git ls-remote --tags https://github.com/mapbox/ecs-watchbot');
    return Promise.resolve({ stdout: 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6\t/refs/tags/v4.1.1' });
  });

  const commit = 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6';

  const tag = await wbg.getTagForSha(commit);
  assert.ok(tag, 'tag exists for this commit');
  assert.equals(tag, 'v4.1.1');
  execStub.restore();
  assert.end();
});

test('getTagForSha: commit not found', async (assert) => {
  const execStub = sinon.stub(wbg, 'exec').callsFake((command) => {
    assert.equals(command, 'git ls-remote --tags https://github.com/mapbox/ecs-watchbot');
    return Promise.resolve({ stdout: 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6\t/refs/tags/v4.1.1' });
  });

  const commit = '123456';
  const tag = await wbg.getTagForSha(commit);
  assert.ok(!tag, 'tag does not exist for this commit');
  execStub.restore();
  assert.end();
});

test('uploadBundle: tag found (Tag created using `npm version <patch|minor|major>`)', async (assert) => {
  process.env.CODEBUILD_RESOLVED_SOURCE_VERSION = 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6';

  // stubs and spies
  const execStub = sinon.stub(wbg, 'exec').callsFake(() => {
    return Promise.resolve({ stdout: 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6\t/refs/tags/v4.1.1' });
  });
  const fsCreateReadStreamStub = sinon.stub(fs, 'createReadStream').callsFake((file) => file);
  const s3Stub = AWS.stub('S3', 'putObject', function () {
    this.request.promise.returns(Promise.resolve());
  });
  const log = sinon.spy(console, 'log');

  await wbg.uploadBundle();

  assert.ok(execStub.calledWith('npm ci --production'));
  assert.ok(execStub.calledWith('npm install -g pkg'));
  assert.ok(execStub.calledWith('pkg .'));
  assert.ok(execStub.calledWith('git ls-remote --tags https://github.com/mapbox/ecs-watchbot'));

  assert.ok(s3Stub.calledWith({
    Bucket: 'watchbot-binaries',
    Key: 'linux/v4.1.1/watchbot',
    Body: fs.createReadStream('watchbot-linux'),
    ACL: 'public-read'
  }));
  assert.ok(s3Stub.calledWith({
    Bucket: 'watchbot-binaries',
    Key: 'macosx/v4.1.1/watchbot',
    Body: fs.createReadStream('watchbot-macos'),
    ACL: 'public-read'
  }));
  assert.ok(s3Stub.calledWith({
    Bucket: 'watchbot-binaries',
    Key: 'windows/v4.1.1/watchbot',
    Body: fs.createReadStream('watchbot-win.exe'),
    ACL: 'public-read'
  }));
  assert.ok(log.calledWith('Uploading the package to s3://watchbot-binaries/linux/v4.1.1/watchbot'));
  assert.ok(log.calledWith('Uploading the package to s3://watchbot-binaries/macosx/v4.1.1/watchbot'));
  assert.ok(log.calledWith('Uploading the package to s3://watchbot-binaries/windows/v4.1.1/watchbot'));

  fsCreateReadStreamStub.restore();
  log.restore();
  execStub.restore();
  s3Stub.restore();
  assert.end();
});


test('uploadBundle: tag found (Tag created manually)', async (assert) => {
  process.env.CODEBUILD_RESOLVED_SOURCE_VERSION = 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6';

  // stubs and spies
  const execStub = sinon.stub(wbg, 'exec').callsFake(() => {
    return Promise.resolve({ stdout: 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6\t/refs/tags/4.1.1' });
  });
  const fsCreateReadStreamStub = sinon.stub(fs, 'createReadStream').callsFake((file) => file);
  const s3Stub = AWS.stub('S3', 'putObject', function () {
    this.request.promise.returns(Promise.resolve());
  });
  const log = sinon.spy(console, 'log');

  await wbg.uploadBundle();

  assert.ok(execStub.calledWith('npm ci --production'));
  assert.ok(execStub.calledWith('npm install -g pkg'));
  assert.ok(execStub.calledWith('pkg .'));
  assert.ok(execStub.calledWith('git ls-remote --tags https://github.com/mapbox/ecs-watchbot'));

  assert.ok(s3Stub.calledWith({
    Bucket: 'watchbot-binaries',
    Key: 'linux/4.1.1/watchbot',
    Body: fs.createReadStream('watchbot-linux'),
    ACL: 'public-read'
  }));
  assert.ok(s3Stub.calledWith({
    Bucket: 'watchbot-binaries',
    Key: 'macosx/4.1.1/watchbot',
    Body: fs.createReadStream('watchbot-macos'),
    ACL: 'public-read'
  }));
  assert.ok(s3Stub.calledWith({
    Bucket: 'watchbot-binaries',
    Key: 'windows/4.1.1/watchbot',
    Body: fs.createReadStream('watchbot-win.exe'),
    ACL: 'public-read'
  }));
  assert.ok(log.calledWith('Uploading the package to s3://watchbot-binaries/linux/4.1.1/watchbot'));
  assert.ok(log.calledWith('Uploading the package to s3://watchbot-binaries/macosx/4.1.1/watchbot'));
  assert.ok(log.calledWith('Uploading the package to s3://watchbot-binaries/windows/4.1.1/watchbot'));

  fsCreateReadStreamStub.restore();
  log.restore();
  execStub.restore();
  s3Stub.restore();
  assert.end();
});

test('uploadBundle: tag not found', async (assert) => {
  process.env.CODEBUILD_RESOLVED_SOURCE_VERSION = '123456';

  // stubs and spies
  const execStub = sinon.stub(wbg, 'exec').callsFake(() => {
    return Promise.resolve({ stdout: 'f4815eb9f3bcfba88930bbe12d0888254af7cfa6\t/refs/tags/v4.1.1' });
  });

  const log = sinon.spy(console, 'log');

  await wbg.uploadBundle();

  assert.ok(execStub.calledWith('npm ci --production'));
  assert.ok(execStub.calledWith('npm install -g pkg'));
  assert.ok(execStub.calledWith('pkg .'));
  assert.ok(execStub.calledWith('git ls-remote --tags https://github.com/mapbox/ecs-watchbot'));
  assert.ok(log.calledWith('No tag found for 123456'));

  log.restore();
  execStub.restore();
  assert.end();
});
