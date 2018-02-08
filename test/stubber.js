'use strict';

const sinon = require('sinon');

module.exports = (cls) => {
  const stub = sinon.createStubInstance(cls);

  // spy on, don't stub, event emitter functionality
  stub.on.restore();
  sinon.spy(stub, 'on');
  stub.emit.restore();
  sinon.spy(stub, 'emit');

  stub.setup = () => {
    sinon.stub(cls, 'create').returns(stub);
    return stub;
  };

  stub.teardown = () => {
    cls.create.restore();
  };

  return stub;
};
