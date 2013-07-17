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
		if (!options.identify) options.identify = identity;
		if (!options.compare) options.compare = compareById;
		if (!options.selector) options.selector = qsa;

		var rdom = new Reactive(root, options);

		return {
			updateModel: function (changes) {
				return rdom.update(changes);
			},
			setModel: function (all) {
				return rdom.set(all);
			}
		};
	}

	return reactive;

	function identity (obj) { return obj; }

	function compareById (a, b) {
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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