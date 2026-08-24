import Ember from 'ember';
import { moduleFor, test } from 'ember-qunit';

moduleFor('service:tracking', 'Unit | Service | tracking');

function storeStub(saveResult) {
  const created = [];

  return {
    created: created,
    createRecord(type, attrs) {
      const record = Ember.Object.create(Ember.merge({ type: type }, attrs));

      record.save = () => saveResult;
      record.deleteRecord = () => {};
      created.push(record);

      return record;
    }
  };
}

function serviceFor(context, store) {
  const service = context.subject({ store: store });

  service.setup({ at: '2016-01-06', trackableType: 'Treatment' });

  return service;
}

// Trackings are what carry a treatment into the next check-in, and they are dated.
// The server cannot work the date out on its own, so it has to come from the check-in
// the user is filling in.
test('it starts a tracking on the check-in date', function(assert) {
  const store = storeStub(Ember.RSVP.resolve('saved'));
  const service = serviceFor(this, store);

  service.track({ id: '1' }, '4');

  assert.equal(store.created[0].get('startAt'), '2016-01-06');
});

test('it ends a tracking on the check-in date', function(assert) {
  assert.expect(1);

  const service = serviceFor(this, storeStub(Ember.RSVP.resolve()));
  const tracking = Ember.Object.create({
    destroyRecord(options) {
      assert.equal(options.adapterOptions.date, '2016-01-06');

      return Ember.RSVP.resolve();
    }
  });

  service.destroyTracking(tracking);
});

// The callback resolves the promise the check-in save waits on. Dropping it on
// failure leaves that promise pending forever and the check-in never saves.
test('it still invokes the callback when saving the tracking fails', function(assert) {
  const done = assert.async();
  const service = serviceFor(this, storeStub(Ember.RSVP.reject(new Error('boom'))));

  service.track({ id: '1' }, '4', () => {
    assert.ok(true, 'callback was invoked');
    done();
  });
});

function trackableStub(id) {
  return Ember.Object.create({
    id: id,
    constructor: { modelName: 'treatment' }
  });
}

function trackingRecordStub(trackable, destroyed) {
  return Ember.Object.create({
    trackable: trackable,
    trackableType: 'Treatment',
    destroyRecord() {
      destroyed.push(this);

      return Ember.RSVP.resolve();
    }
  });
}

// Treatments stranded by the tracking bug have no tracking at all. Without a callback
// here the check-in save waits on a promise that never settles.
test('it invokes the callback when there is no tracking to untrack', function(assert) {
  const done = assert.async();
  const service = serviceFor(this, storeStub(Ember.RSVP.resolve()));

  service.set('existingTrackings', Ember.RSVP.resolve([]));

  service.untrack({ trackable: trackableStub('1'), trackableType: 'Treatment' }, () => {
    assert.ok(true, 'callback was invoked');
    done();
  });
});

// onlyNew is how an earlier day's check-in undoes a tracking it just started without
// ending one the user had all along.
test('with onlyNew it undoes a tracking started on this screen', function(assert) {
  const done = assert.async();
  const destroyed = [];
  const service = serviceFor(this, storeStub(Ember.RSVP.resolve()));
  const trackable = trackableStub('1');

  service.set('existingTrackings', Ember.RSVP.resolve([]));
  service.get('newTrackings').pushObject(trackingRecordStub(trackable, destroyed));

  service.untrack({ trackable: trackable, trackableType: 'Treatment', onlyNew: true }, () => {
    assert.equal(destroyed.length, 1);
    done();
  });
});

test('with onlyNew it leaves a pre-existing tracking alone', function(assert) {
  const done = assert.async();
  const destroyed = [];
  const service = serviceFor(this, storeStub(Ember.RSVP.resolve()));
  const trackable = trackableStub('1');

  service.set('existingTrackings', Ember.RSVP.resolve([trackingRecordStub(trackable, destroyed)]));

  service.untrack({ trackable: trackable, trackableType: 'Treatment', onlyNew: true }, () => {
    assert.equal(destroyed.length, 0);
    done();
  });
});

test('without onlyNew it ends a pre-existing tracking', function(assert) {
  const done = assert.async();
  const destroyed = [];
  const service = serviceFor(this, storeStub(Ember.RSVP.resolve()));
  const trackable = trackableStub('1');

  service.set('existingTrackings', Ember.RSVP.resolve([trackingRecordStub(trackable, destroyed)]));

  service.untrack({ trackable: trackable, trackableType: 'Treatment' }, () => {
    assert.equal(destroyed.length, 1);
    done();
  });
});
