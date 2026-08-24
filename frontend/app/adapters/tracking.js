import ApplicationAdapter from './application';

export default ApplicationAdapter.extend({

  // A tracking is ended on the date of the check-in it was removed from, which the
  // server cannot derive on its own. DELETE has no body, so it travels as a query
  // param.
  urlForDeleteRecord(id, modelName, snapshot) {
    const url = this._super(...arguments);
    const date = snapshot.adapterOptions && snapshot.adapterOptions.date;

    return date ? `${url}?date=${encodeURIComponent(date)}` : url;
  }

});
