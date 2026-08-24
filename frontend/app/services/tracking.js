import Ember from 'ember';

export default Ember.Service.extend({
  store: Ember.inject.service(),

  setup: function(options) {
    this.setProperties({
      at: options.at,
      trackableType: options.trackableType
    });
    this.set('newTrackings', Ember.A([]));
  },

  existingTrackings: Ember.computed('at', 'trackableType', function() {
    return this.get('store').query('tracking', {
      at: this.get('at'), trackable_type: this.get('trackableType')
    });
  }),

  track: function(trackable, colorId) {
    //save new tracking for trackable and then add it to cache
    //so that user can see it immediately without having to re-query the store
    var tracking = this.get('store').createRecord('tracking', {
      trackable: trackable,
      colorId: colorId,
      // The day being tracked is the check-in's, which the server cannot work out on
      // its own - see TrackingsController#at_date.
      startAt: this.get('at')
    });

    return tracking.save().then(
      savedTracking => {
        this.get('newTrackings').pushObject(savedTracking);

        return savedTracking;
      },
      error => {
        // The check-in save waits on this. Swallowing the failure would let the
        // check-in report success with nothing to carry the trackable forward, which
        // is the disappearance this is meant to fix, so it travels with the promise.
        tracking.deleteRecord();
        Ember.Logger.error('Failed to save tracking', error);

        throw error;
      }
    );
  },

  /* params can be either:
       {tracking: aTracking}
     or:
       {
         trackable: aTrackable,
         trackableType: 'Condition' | 'Symptom' | 'Treatment'
       }
  */
  untrack: function(params) {
    if (Ember.isPresent(params.tracking)) {
      return this.destroyTracking(params.tracking);
    }

    this.set('trackableType', params.trackableType);

    // A tracking started on this screen is always undone, whichever day is being
    // filled in - the user is taking back what they just did.
    const newTracking = this.get('newTrackings').find(record => {
      return this.compare(record, params.trackable);
    });

    if (Ember.isPresent(newTracking)) {
      return this.destroyTracking(newTracking);
    }

    // An older tracking is only ended from today's check-in - see untrackRemovedTracked.
    if (params.onlyNew) {
      return Ember.RSVP.resolve();
    }

    return this.get('existingTrackings').then(trackings => {
      const tracking = trackings.find(record => {
        return this.compare(record, params.trackable);
      });

      // Nothing to untrack is not a failure: a trackable stranded by an earlier bug
      // has no tracking at all, and the check-in still has to save.
      if (Ember.isNone(tracking)) { return; }

      return this.destroyTracking(tracking);
    });
  },

  compare: function(tracking, trackable) {
    return Ember.isEqual(tracking.get('trackable.id'), trackable.get('id')) &&
           Ember.isEqual(tracking.get('trackableType').toLowerCase(), trackable.get('constructor.modelName'));
  },

  destroyTracking: function(tracking) {
    // DELETE carries no body, so the check-in's date travels as a query param - see
    // adapters/tracking.js.
    return tracking.destroyRecord({ adapterOptions: { date: this.get('at') } }).then(
      () => {
        // A destroyed record left in the cache is found ahead of the live one if the
        // trackable is added again, so the next removal would miss.
        this.get('newTrackings').removeObject(tracking);
      },
      error => {
        // Travels with the promise: the check-in must not report the trackable as
        // removed while its tracking is still active - see track().
        Ember.Logger.error('Failed to destroy tracking', error);

        throw error;
      }
    );
  }

});
