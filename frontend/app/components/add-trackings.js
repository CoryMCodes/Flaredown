import Ember from 'ember';
import moment from 'moment';
import TrackablesFromType from 'flaredown/mixins/trackables-from-type';

const {
  get,
} = Ember;

export default Ember.Component.extend(TrackablesFromType, {

  tracking: Ember.inject.service(),

  setupTracking: Ember.on('init', function() {
    this.get('tracking').setup({
      // Send a plain calendar date: a full timestamp gets re-read in UTC on the
      // server, which lands on the wrong day for users whose local date is not
      // the UTC one.
      at: moment().format('YYYY-MM-DD'),
      trackableType: this.get('trackableType').capitalize()
    });
  }),

  existingTrackings: Ember.computed.alias('tracking.existingTrackings'),
  newTrackings: Ember.computed.alias('tracking.newTrackings'),

  actions: {
    trackSelected(selectedTrackable) {
      this.track(selectedTrackable);
    },
    remove(tracking) {
      this.get('tracking').untrack({
        tracking: tracking
      });
    }
  },

  track: function(trackable) {
    const trackableType = get(this, 'trackableType').capitalize();
    const trackableIds = this.get('store').peekAll('tracking').filterBy('trackableType', trackableType).map((tr) => {
      return get(tr, 'trackable.id');
    });

    if (!trackableIds.includes(get(trackable, 'id'))) {
      this.get('tracking').track(trackable, null, () => {
        this.set('selectedTrackable', null);
      });
    }
  }

});
