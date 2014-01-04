var utils = require('../../../utils'),
	errors = require('../../../errors'),
	store = require('../../store'),
	services = require('../../services'),
	GET = require('../../HTTP').GET;

function processResults(data, resourceName, queryHash) {
	var resource = store[resourceName];

	data = data || [];

	// Query is no longer pending
	delete resource.pendingQueries[queryHash];
	resource.completedQueries[queryHash] = new Date().getTime();

	var temp = [];
	for (var i = 0; i < data.length; i++) {
		temp.push(data[i]);
	}
	// Merge the new values into the cache
	resource.collection = utils.mergeArrays(resource.collection, data, resource.idAttribute || 'id');

	// Update the data store's index for this resource
	resource.index = utils.toLookup(resource.collection, resource.idAttribute || 'id');

	// Update modified timestamp for values that were return by the server
	for (var j = 0; j < temp.length; j++) {
		resource.modified[temp[j][resource.idAttribute || 'id']] = utils.updateTimestamp(resource.modified[temp[j][resource.idAttribute || 'id']]);
	}

	// Update modified timestamp of collection
	resource.collectionModified = utils.updateTimestamp(resource.collectionModified);
	return temp;
}

function _findAll(deferred, resourceName, params, forceRefresh) {
	var resource = store[resourceName];

	params.query = params.query || {};

	var queryHash = utils.toJson(params);

	if (forceRefresh) {
		delete resource.completedQueries[queryHash];
	}

	if (!(queryHash in resource.completedQueries)) {
		// This particular query has never been completed

		if (!resource.pendingQueries[queryHash]) {

			// This particular query has never even been started
			resource.pendingQueries[queryHash] = GET(resource.url, { params: params }).then(function (data) {
				try {
					deferred.resolve(processResults(data, resourceName, queryHash));
				} catch (err) {
					deferred.reject(new errors.UnhandledErrror(err));
				}
			}, deferred.reject);
		}
	} else {
		deferred.resolve(this.filter(resourceName, params));
	}
}

/**
 * @doc method
 * @id DS.async_methods:findAll
 * @name findAll
 * @description
 * `findAll(resourceName[, params][, forceRefresh])`
 *
 * Asynchronously return the resource from the server filtered by the query. The results will be added to the data
 * store when it returns from the server.
 *
 * Example:
 *
 * ```js
 * TODO: findAll(resourceName[, params][, forceRefresh]) example
 * ```
 *
 * @param {string} resourceName The resource type, e.g. 'user', 'comment', etc.
 * @param {object=} params Parameter object that is serialized into the query string. Properties:
 *
 * - `{object=}` - `query` - The query object by which to filter items of the type specified by `resourceName`. Properties:
 *      - `{object=}` - `where` - Where clause.
 *      - `{number=}` - `limit` - Limit clause.
 *      - `{skip=}` - `skip` - Skip clause.
 *
 * @param {boolean=} forceRefresh Bypass the cache.
 *
 * @returns {Promise} Promise produced by the `$q` service.
 *
 * ## ResolvesWith:
 *
 * - `{array}` - `items` - The collection of items returned by the server.
 *
 * ## RejectsWith:
 *
 * - `{IllegalArgumentError}` - `err` - Argument `params` must be an object.
 * - `{RuntimeError}` - `err` - Argument `resourceName` must refer to an already registered resource.
 * - `{UnhandledError}` - `err` - Thrown for any uncaught exception.
 */
function findAll(resourceName, params, forceRefresh) {
	var deferred = services.$q.defer();

	params = params || {};

	if (!store[resourceName]) {
		deferred.reject(new errors.RuntimeError('DS.findAll(resourceName[, params]): ' + resourceName + ' is not a registered resource!'));
	} else if (!utils.isObject(params)) {
		deferred.reject(new errors.IllegalArgumentError('DS.findAll(resourceName[, params]): params: Must be an object!', { params: { actual: typeof params, expected: 'object' } }));
	}

	try {
		_findAll.apply(this, [deferred, resourceName, params, forceRefresh]);
	} catch (err) {
		deferred.reject(new errors.UnhandledErrror(err));
	}

	return deferred.promise;
}

module.exports = findAll;