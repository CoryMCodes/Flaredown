import DS from 'ember-data';

export default DS.Model.extend({

  // Attributes
  // Calendar dates, kept as strings so they don't get re-anchored to UTC midnight.
  startAt: DS.attr('string'),
  endAt: DS.attr('string'),
  trackableType: DS.attr('string'),
  colorId: DS.attr('string'),

  // Associations
  user: DS.belongsTo('user'),
  trackable: DS.belongsTo('trackable', { polymorphic: true }),

});
