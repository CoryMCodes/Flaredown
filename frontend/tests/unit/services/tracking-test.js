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

function trackableStub(id) {
  return Ember.Object.create({
    id: id,
    constructor: { modelName: 'treatment' }
  });
}

function trackingRecordStub(trackable, destroyed, result) {
  return Ember.Object.create({
    trackable: trackable,
    trackableType: 'Treatment',
    destroyRecord() {
      destroyed.push(this);

      return result || Ember.RSVP.resolve();
    }
  });
}

// Trackings are what carry a treatment into the next check-in, and they are dated.
// The server cannot work the date out on its own, so it has to come from the check-in
// the user is filling in.
test('it starts a tracking on the check-in date', function(assert) {
  const store = storeStub(Ember.RSVP.resolve('saved'));
  const service = serviceFor(this, store);

  service.track(trackableStub('1'), '4');

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

// The check-in save waits on these promises. Resolving on failure would let the
// check-in report success with nothing to carry the treatment forward - the very
// disappearance this is meant to fix - so the failure has to travel with it.
test('it rejects when saving the tracking fails', function(assert) {
  const done = assert.async();
  const service = serviceFor(this, storeStub(Ember.RSVP.reject(new Error('boom'))));

  service.track(trackableStub('1'), '4').then(
    () => {
      assert.ok(false, 'should not have resolved');
      done();
    },
    error => {
      assert.equal(error.message, 'boom');
      done();
    }
  );
});

test('it rejects when destroying the tracking fails', function(assert) {
  const done = assert.async();
  const service = serviceFor(this, storeStub(Ember.RSVP.resolve()));
  const trackable = trackableStub('1');
  const rejection = Ember.RSVP.reject(new Error('boom'));

  service.set('existingTrackings', Ember.RSVP.resolve([trackingRecordStub(trackable, [], rejection)]));

  service.untrack({ trackable: trackable, trackableType: 'Treatment' }).then(
    () => {
      assert.ok(false, 'should not have resolved');
      done();
    },
    error => {
      assert.equal(error.message, 'boom');
      done();
    }
  );
});

// Treatments stranded by the tracking bug have no tracking at all. That is not a
// failure - there is simply nothing to undo - so the check-in still has to save.
test('it resolves when there is no tracking to untrack', function(assert) {
  const done = assert.async();
  const service = serviceFor(this, storeStub(Ember.RSVP.resolve()));

  service.set('existingTrackings', Ember.RSVP.resolve([]));

  service.untrack({ trackable: trackableStub('1'), trackableType: 'Treatment' }).then(() => {
    assert.ok(true, 'resolved');
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

  service.untrack({ trackable: trackable, trackableType: 'Treatment', onlyNew: true }).then(() => {
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

  service.untrack({ trackable: trackable, trackableType: 'Treatment', onlyNew: true }).then(() => {
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

  service.untrack({ trackable: trackable, trackableType: 'Treatment' }).then(() => {
    assert.equal(destroyed.length, 1);
    done();
  });
});

// A destroyed record left in the cache is found ahead of the live one if the user
// adds the same trackable again, so the second tracking would survive being removed.
test('it drops a destroyed tracking from the new-tracking cache', function(assert) {
  const done = assert.async();
  const service = serviceFor(this, storeStub(Ember.RSVP.resolve()));
  const trackable = trackableStub('1');
  const tracking = trackingRecordStub(trackable, []);

  service.get('newTrackings').pushObject(tracking);

  service.destroyTracking(tracking).then(() => {
    assert.equal(service.get('newTrackings.length'), 0);
    done();
  });
});
