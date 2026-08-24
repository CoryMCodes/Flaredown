import { moduleForComponent, test } from 'ember-qunit';
import moment from 'moment';

moduleForComponent('checkin/trackables-step', 'Unit | Component | checkin/trackables step', {
  unit: true,
  needs: ['service:tracking', 'service:selectable-data']
});

function componentFor(context, date) {
  return context.subject({
    trackableType: 'treatment',
    parentView: { model: { checkin: { date: date } } }
  });
}

// Adding a treatment only creates a Tracking - the record that carries it over to
// the next check-in - when isTodaysCheckin is true, so this comparison has to be a
// plain calendar-date comparison. It used to be fed an ISO timestamp from the API,
// which the browser re-read in local time and shifted by a day every evening.
test('isTodaysCheckin is true for a check-in dated today', function(assert) {
  const component = componentFor(this, moment().format('YYYY-MM-DD'));

  assert.equal(component.get('isTodaysCheckin'), true);
});

test('isTodaysCheckin is false for a check-in dated yesterday', function(assert) {
  const component = componentFor(this, moment().subtract(1, 'day').format('YYYY-MM-DD'));

  assert.equal(component.get('isTodaysCheckin'), false);
});

// `at` is sent to GET /trackings, which resolves it to a calendar date. Wrapping it
// in a Date anchors it to UTC midnight, so it comes back as the previous day for
// everyone west of UTC.
test('it looks up trackings by the check-in calendar date', function(assert) {
  const component = componentFor(this, '2016-01-06');

  component.setupTracking();

  assert.equal(component.get('tracking.at'), '2016-01-06');
});
