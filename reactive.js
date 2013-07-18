(function (define) {
define(function (require) {

	var Reactive = require('./lib/Reactive');

	/**
	 * Binds a dom node to data.
	 * @param {HTMLElement} root
	 * @param {Object} options @see {Reactive}
	 * @return {Object} with a push(updates) function and a pull() function.
	 */
	function reactive (root, options) {

		if (!options) options = {};
		if (!options.selector) options.selector = qsa;
		if (!options.identify) {
			options.identify = createIdentifyForProperty(options.id || 'id');
		}
		if (!options.compare) {
			options.compare = createCompareForProperty(options.sortBy || 'id');
		}

		var rdom = new Reactive(root, options);

		return {
			updateModel: function (changes) {
				return rdom.update(changes);
			},
			setModel: function (all) {
				return rdom.set(all);
			},
			findItem: function (nodeOrEvent) {
				return rdom.findItem(nodeOrEvent);
			}
		};
	}

	return reactive;

	function createIdentifyForProperty (prop) {
		return function (obj) { return Object(obj)[prop]; };
	}

	function createCompareForProperty (prop) {
		return function (a, b) {
			return compare(Object(a), Object(b), prop);
		};
	}

	function compare (a, b, prop) {
		return a[prop] < b[prop] ? -1 : a[prop] > b[prop] ? 1 : 0;
	}

	function qsa (node, selector) {
		return node.querySelectorAll(selector);
	}

});
}(
	typeof define == 'function' && define.amd
		? define
		: function (factory) { module.exports = factory(require); }
));