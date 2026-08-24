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

  track: function(trackable, colorId, callback) {
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
        this.runCallback(callback, savedTracking);
      },
      error => {
        // The callback resolves the promise the check-in save waits on. Skipping it
        // here would leave that promise pending and the check-in would never save.
        tracking.deleteRecord();
        Ember.Logger.error('Failed to save tracking', error);
        this.runCallback(callback);
      }
    );
  },

  runCallback: function(callback, arg) {
    if (Ember.isPresent(callback)) {
      callback(arg);
    }
  },

  /* params can be either:
       {tracking: aTracking}
     or:
       {
         trackable: aTrackable,
         trackableType: 'Condition' | 'Symptom' | 'Treatment'
       }
  */
  untrack: function(params, callback) {
    if (Ember.isPresent(params.tracking)) {
      this.destroyTracking(params.tracking, callback);
      return;
    }

    this.set('trackableType', params.trackableType);

    // A tracking started on this screen is always undone, whichever day is being
    // filled in - the user is taking back what they just did.
    const newTracking = this.get('newTrackings').find(record => {
      return this.compare(record, params.trackable);
    });

    if (Ember.isPresent(newTracking)) {
      this.destroyTracking(newTracking, callback);
      return;
    }

    // An older tracking is only ended from today's check-in - see untrackRemovedTracked.
    if (params.onlyNew) {
      this.runCallback(callback);
      return;
    }

    this.get('existingTrackings').then(
      trackings => {
        const tracking = trackings.find(record => {
          return this.compare(record, params.trackable);
        });

        if (Ember.isPresent(tracking)) {
          this.destroyTracking(tracking, callback);
        } else {
          // Nothing to untrack - a trackable stranded by an earlier bug has no
          // tracking at all. Hand control back anyway, or the check-in save waits on
          // a promise that never settles.
          this.runCallback(callback);
        }
      },
      error => {
        Ember.Logger.error('Failed to load trackings', error);
        this.runCallback(callback);
      }
    );
  },

  compare: function(tracking, trackable) {
    return Ember.isEqual(tracking.get('trackable.id'), trackable.get('id')) &&
           Ember.isEqual(tracking.get('trackableType').toLowerCase(), trackable.get('constructor.modelName'));
  },

  destroyTracking: function(tracking, callback) {
    // DELETE carries no body, so the check-in's date travels as a query param - see
    // adapters/tracking.js.
    return tracking.destroyRecord({ adapterOptions: { date: this.get('at') } }).then(
      () => this.runCallback(callback),
      error => {
        Ember.Logger.error('Failed to destroy tracking', error);
        this.runCallback(callback);
      }
    );
  }

});
