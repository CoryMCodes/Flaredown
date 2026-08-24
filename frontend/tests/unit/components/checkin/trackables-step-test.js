import Ember from 'ember';
import moment from 'moment';
import { moduleForComponent, test } from 'ember-qunit';

moduleForComponent('checkin/trackables-step', 'Unit | Component | checkin/trackables step', {
  unit: true,
  needs: ['service:tracking', 'service:selectable-data']
});

function trackingStub() {
  return Ember.Object.create({
    tracked: [],
    untracked: [],
    setup(options) {
      this.setProperties(options);
    },
    track(trackable, colorId, callback) {
      this.get('tracked').push(trackable);
      callback();
    },
    untrack(params, callback) {
      this.get('untracked').push(params);
      callback();
    }
  });
}

function componentFor(context, date, tracking) {
  return context.subject({
    trackableType: 'treatment',
    tracking: tracking,
    parentView: { model: { checkin: { date: date } } }
  });
}

function pastDate() {
  return moment().subtract(3, 'days').format('YYYY-MM-DD');
}

// `at` is sent to GET /trackings, which resolves it to a calendar date. Wrapping it
// in a Date anchors it to UTC midnight, so it comes back as the previous day for
// everyone west of UTC.
test('it looks up trackings by the check-in calendar date', function(assert) {
  const component = componentFor(this, '2016-01-06', trackingStub());

  component.setupTracking();

  assert.equal(component.get('tracking.at'), '2016-01-06');
});

// Treatments have to carry over no matter which day is being filled in: catching up
// on missed days is normal use, and for hours each evening a check-in the user thinks
// of as today is dated yesterday somewhere in the stack.
test('it tracks an added treatment on a past check-in', function(assert) {
  const done = assert.async();
  const tracking = trackingStub();
  const component = componentFor(this, pastDate(), tracking);
  const treatment = Ember.Object.create({ id: '1' });

  component.set('addedTracked', Ember.Object.create({ treatment: treatment, colorId: '4' }));

  component.trackAddedTracked().then(() => {
    assert.deepEqual(tracking.get('tracked'), [treatment]);
    done();
  });
});

// Removing is not symmetrical with adding: taking a treatment off an earlier day
// corrects that day's record, it does not mean the user has stopped taking it. The
// service reads onlyNew to tell the two apart.
test('it stops the tracking for a treatment removed from today\'s check-in', function(assert) {
  const done = assert.async();
  const tracking = trackingStub();
  const component = componentFor(this, moment().format('YYYY-MM-DD'), tracking);
  const treatment = Ember.Object.create({ id: '1' });

  component.set('removedTracked', Ember.Object.create({ treatment: treatment }));

  component.untrackRemovedTracked().then(() => {
    assert.equal(tracking.get('untracked.0.trackable'), treatment);
    assert.equal(tracking.get('untracked.0.onlyNew'), false);
    done();
  });
});

test('it only undoes a just-started tracking for a treatment removed from a past check-in', function(assert) {
  const done = assert.async();
  const tracking = trackingStub();
  const component = componentFor(this, pastDate(), tracking);
  const treatment = Ember.Object.create({ id: '1' });

  component.set('removedTracked', Ember.Object.create({ treatment: treatment }));

  component.untrackRemovedTracked().then(() => {
    assert.equal(tracking.get('untracked.0.trackable'), treatment);
    assert.equal(tracking.get('untracked.0.onlyNew'), true);
    done();
  });
});

test('isTodaysCheckin is true for a check-in dated today', function(assert) {
  const component = componentFor(this, moment().format('YYYY-MM-DD'), trackingStub());

  assert.equal(component.get('isTodaysCheckin'), true);
});

test('isTodaysCheckin is false for a check-in dated yesterday', function(assert) {
  const component = componentFor(this, moment().subtract(1, 'day').format('YYYY-MM-DD'), trackingStub());

  assert.equal(component.get('isTodaysCheckin'), false);
});
