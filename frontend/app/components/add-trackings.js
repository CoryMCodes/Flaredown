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
      // The service logs the failure; there is no save waiting on it here.
      this.get('tracking').untrack({ tracking: tracking }).catch(() => {});
    }
  },

  track: function(trackable) {
    const trackableType = get(this, 'trackableType').capitalize();
    const trackableIds = this.get('store').peekAll('tracking').filterBy('trackableType', trackableType).map((tr) => {
      return get(tr, 'trackable.id');
    });

    if (!trackableIds.includes(get(trackable, 'id'))) {
      this.get('tracking').track(trackable, null)
        .then(() => this.set('selectedTrackable', null))
        // The service logs the failure; there is no save waiting on it here.
        .catch(() => {});
    }
  }

});
