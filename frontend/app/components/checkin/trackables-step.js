import Ember from 'ember';
import moment from 'moment';
import TrackablesFromType from 'flaredown/mixins/trackables-from-type';

const {
  get,
  set,
  computed,
  computed: { alias },
  inject: { service },
  Component,
  isNone,
  run: { next },
  RSVP: { all }
} = Ember;

export default Component.extend(TrackablesFromType, {
  classNames: ['trackables-step'],

  model: alias('parentView.model'),

  tracking: service(),

  setupTracking() {
    this.get('tracking').setup({
      // The API sends a bare calendar date. Wrapping it in a Date would anchor it
      // to UTC midnight, which lands on the previous day west of UTC.
      at: this.get('checkin.date'),
      trackableType: this.get('trackableType').capitalize()
    });
  },

  checkin: alias('model.checkin'),

  // checkin.date is a bare calendar date, so this compares calendar days in the
  // browser's own timezone rather than re-reading a UTC instant.
  isTodaysCheckin: computed('checkin.date', function() {
    return moment(this.get('checkin.date')).isSame(new Date(), 'day');
  }),

  sortedTrackeds: computed('trackeds.{[],@each.position}', function() {
    return this.get('trackeds').toArray().sortBy('position');
  }),

  didReceiveAttrs() {
    this._super(...arguments);

    this.setupTracking();
  },

  removedTracked: null,
  addedTracked: null,

  actions: {
    remove(tracked) {
      tracked.prepareForDestroy();
      this.set('removedTracked', tracked);
      this.saveCheckin();
    },

    add(selectedTrackable) {
      const trackeds = get(this, 'trackeds');

      if (get(trackeds, 'isFulfilled')) {
        this.addTrackable(get(trackeds, 'content'), selectedTrackable);
      } else {
        this.addTrackable(trackeds, selectedTrackable);
      }
    },

    move(draggedId, droppedId) {
      // Return if the item has been dropped onto its own dropzone
      if (Ember.isEqual(draggedId, droppedId)) { return; }
      let sortedTrackeds = this.get('sortedTrackeds');
      let draggedItem = sortedTrackeds.findBy('id', draggedId);
      // draggedItem might not be found if it's dragged from a different
      // trackables' collection (this might happen in summary screen)
      if (Ember.isNone(draggedItem)) { return; }
      let draggedPosition = draggedItem.get('position');
      let droppedPosition = 0;
      if (Ember.isEqual(droppedId, 'after-last')) {
        droppedPosition = sortedTrackeds.get('length');
      } else {
        let droppedItem = sortedTrackeds.findBy('id', droppedId);
        droppedPosition = droppedItem.get('position');
      }
      // Return if the item has been dropped onto its next item's dropzone
      if (Ember.isEqual(droppedPosition, draggedPosition + 1)) { return; }
      if (draggedPosition > droppedPosition) {
        // Case 1: Item Moved Up
        // Shift down items between droppedPosition and draggedPosition
        for (let i = droppedPosition; i < draggedPosition; i++) {
          sortedTrackeds[i].set('position', i + 1);
        }
        draggedItem.set('position', droppedPosition);
      } else {
        // Case 2: Move Down
        // Shift up items between draggedPosition and droppedPosition
        for (let i = draggedPosition + 1; i < droppedPosition; i++) {
          sortedTrackeds[i].set('position', i - 1);
        }
        draggedItem.set('position', droppedPosition - 1);
      }
      this.set('clickedTrackableId', null);
      this.saveCheckin();
    },

    onTrackableClicked(trackableId) {
      if (Ember.isPresent(this.get('clickedTrackableId'))) {
        if (Ember.isEqual(trackableId, this.get('clickedTrackableId'))) {
          this.set('clickedTrackableId', null);
        } else {
          this.set('clickedTrackableId', trackableId);
        }
      } else {
        this.set('clickedTrackableId', trackableId);
      }
    },

    saveChanges() {
      this.saveCheckin();
    },

    completeStep() {
      this.get('onStepCompleted')();
    },
    goBack() {
      this.get('onGoBack')();
    }
  },

  addTrackable(trackeds, trackable) {
    const trackableType = get(this, 'trackableType');
    const foundTrackable = trackeds.findBy(`${trackableType}.id`, trackable.get('id'));

    if (isNone(foundTrackable)) {
      const recordAttrs = {
        colorId: this.computeNewColorId(),
        position: trackeds.get('length'),
        [trackableType]: trackable
      };
      const recordType = `checkin_${trackableType}`.camelize();
      const tracked = this.store.createRecord(recordType, recordAttrs);

      trackeds.pushObject(tracked);

      set(this, 'addedTracked', tracked);
      this.saveCheckin();
    }

    set(this, 'selectedTrackable', null);
  },

  computeNewColorId() {
    var nColors = 32;
    let usedColorIds = this.get('checkin.allColorIds');
    // if all colors have been used
    if (usedColorIds.length >= nColors) {
      // re-use them again in the same order
      return usedColorIds[(usedColorIds.length % nColors)];
    } else {
      // return a random unused color
      let randomColor = '';
      do {
        randomColor = Math.floor(Math.random()*nColors)+'';
      } while (usedColorIds.includes(randomColor));
      return randomColor;
    }
  },

  saveCheckin() {
    set(this, 'checkin.hasDirtyAttributes', true);
    next(this, () => {
      set(this, 'isSaving', true);

      all([
          this.untrackRemovedTracked(),
          this.trackAddedTracked()
        ])
        .then(() => this.get('checkin').save())
        .then(
          () => {
            Ember.Logger.info('Checkin successfully saved');

            return this.onCheckinSaved();
          },
          (error) => {
            this.get('checkin').handleSaveError(error);
          }
        )
        .then(() => this.get('chartsVisibilityService').refresh())
        .finally(() => {
          set(this, 'isSaving', false);
        });
      });
  },

  onCheckinSaved() {
    const checkin = this.get('checkin');

    this.deleteAddedTracked();
    checkin.set('hasDirtyAttributes', false);
    checkin.deleteTrackablesPreparedForDestroy();
    this.set('addedTracked', null);
    this.set('removedTracked', null);
  },

  untrackRemovedTracked() {
    const removedTracked = get(this, 'removedTracked');

    if (isNone(removedTracked)) { return Ember.RSVP.resolve(); }

    return this.resolveTrackable(removedTracked).then(trackable => {
      if (isNone(trackable)) { return; }

      // Off an earlier day only a tracking started on this screen is undone: removing
      // a trackable from a past check-in corrects that day's record, it doesn't mean
      // the user has stopped. From today's check-in it stops the tracking for good.
      return this.get('tracking').untrack({
        trackable: trackable,
        trackableType: get(this, 'trackableType').capitalize(),
        onlyNew: !get(this, 'isTodaysCheckin')
      });
    });
  },

  trackAddedTracked() {
    const addedTracked = get(this, 'addedTracked');

    if (isNone(addedTracked)) { return Ember.RSVP.resolve(); }

    return this.resolveTrackable(addedTracked).then(trackable => {
      if (isNone(trackable)) { return; }

      // Start tracking from this check-in's date on, so the trackable carries over to
      // later check-ins whichever day is being filled in.
      return this.get('tracking').track(trackable, get(addedTracked, 'colorId'));
    });
  },

  // The trackable may still be an unresolved DS.PromiseObject; RSVP follows it to the
  // record either way.
  resolveTrackable(tracked) {
    return Ember.RSVP.resolve(get(tracked, get(this, 'trackableType')));
  },

  deleteAddedTracked() {
    // remove addedTracked to avoid 'ghost' record
    let addedTracked = this.get('addedTracked');
    if (Ember.isPresent(addedTracked)) {
      addedTracked.deleteRecord();
    }
  }

});
