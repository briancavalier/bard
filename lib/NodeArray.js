(function (define) {
define(function (require) {

	var extractBindings = require('./extractBindings');
	var createAccessors = require('./createAccessors');
	var jsonPath = require('./jsonPath');
	var dom = require('./dom');

	var sectionAttr = 'data-bard-section';

	/**
	 * Binds a dom node to data.
	 * @constructor
	 * @param {HTMLElement} rootNode
	 * @param {Object} options
	 * @param {String} [options.sectionName] is the name of the topmost list
	 *   section under rootNode, if the top section is an array.
	 * @param {Function} options.identify is a function that returns a unique
	 *   identifier for an object.  The returned value does not have to be a
	 *   string.
	 * @param {Function} options.compare is a function that compares two
	 *   objects to determine their sort order and should return -1, 0, or 1.
	 * @param {Function} options.selector is a query selector
	 *   function like jQuery(selector) or dojo.query(selector).
	 * @param {Array} [options.cssBindings] (TODO) if omitted, assumes data-bard-bind
	 *   and data-bard-section attributes in the dom describe the bindings.
	 * @param {Boolean} [options.preserve] should be set to truthy
	 *   to leave the data-bard-bind attrs in the dom after processing
	 *   a node tree.
	 */
	function NodeArray (rootNode, options) {
		var topSection, itemNode;

		options = Object.create(options);

		if (!options.selector) options.selector = dom.qsa;

		// TODO: support a top-level model instead of list via modelName
		topSection = options.selector(rootNode, '[' + sectionAttr + '="' + options.sectionName + '"]')[0] || rootNode;

		// yank out the contents from top section and use it as a template.
		// if there are no sections, use the root node.
		// TODO: support dom fragments and legacy browsers that don't have firstElementChild
		itemNode = topSection.removeChild(topSection.firstElementChild);

		this.rootNode = rootNode;
		this.sectionNode = topSection;
		this.itemNode = itemNode;
		this.options = options;

		this.bindings = [];
		// binding = { data, node, push, pull }

	}

	NodeArray.prototype = {

		// Note: array.splice(n, ...) causes array.length-n+1 change records!
		update: function (changes) {
			// TODO: support path property on change objects
			// TODO: also support changes property to compare to path
			// changes is an array of objects: { type, object, name [, oldValue] }
			// type can be "new", "deleted", "updated", or "reconfigured"
			changes.forEach(function (change) {
				var item;

				if (!Array.isArray(change.object)) throw new Error('Change record is not for an array.');
				if (isNaN(change.name)) return;

				item = change.object[change.name];

				if ('new' == change.type) {
					this.insertItem(item);
				}
				else if ('deleted' == change.type) {
					this.deleteItem(change.oldValue);
				}
				else if ('updated' == change.type) {
					this.updateItem(item, change.oldValue);
				}

			}, this);
		},

		set: function (model) {
			this.clear();
			model.forEach(function (item) {
				this.insertItem(item);
			}, this);
		},

		findItem: function (nodeOrEvent) {
			var node, data;
			node = dom.toNode(nodeOrEvent);
			data = null;
			// if this node isn't in our tree, bail early
			if (!this.containsNode(this.rootNode, node)) return data;
			// for each top-level item, compare position.
			// the cost of not using attribute turds is that we must loop
			// through all possible nodes.
			// TODO: use poly/array array.find()
			this.bindings.some(function (binding) {
				if (this.containsNode(binding.node, node)) {
					return data = binding.data;
				}
			}, this);
			return data;
		},

		insertItem: function (newData) {
			var newBinding, newPos, bindings, accessors;

			newBinding = {
				data: newData,
				node: this.itemNode.cloneNode(true)
			};

			newPos = this.sortedPos(newData);

			this.bindings.splice(newPos, 0, newBinding);

			this.insertItemNode(newBinding.node, newPos);
			bindings = extractBindings(newBinding.node, this.options);
			accessors = createAccessors(bindings, this.options);
			newBinding.push = accessors.push;
			newBinding.pull = accessors.pull;

			// push data into the dom
			this.pushData(newBinding);

			return newData;
		},

		updateItem: function (newData, oldData) {
			var item, oldPos, newPos;

			oldPos = this.exactPos(oldData);
			newPos = this.sortedPos(newData);

			item = this.bindings[oldPos];
			item.data = newData;

			this.bindings.splice(oldPos, 1);
			this.bindings.splice(newPos, 0, item);

			this.insertItemNode(item.node, newPos);

			// push data into the dom
			this.pushData(item);

			return newData;
		},

		deleteItem: function (oldData) {
			var oldPos, oldItem;

			oldPos = this.exactPos(oldData);
			oldItem = this.bindings[oldPos];

			this.bindings.splice(oldPos, 1);

			this.deleteItemNode(oldItem.node);

			return oldData;
		},

		clear: function () {
			this.bindings.forEach(function (item) {
				this.deleteItemNode(item.node);
			}, this);
			this.bindings = [];
		},

		sortedPos: function (item) {
			var compare, bindings, pos;
			compare = this.options.compare;
			bindings = this.bindings;
			return this.binarySearch(
				0,
				this.bindings.length,
				function (pos) { return compare(bindings[pos].data, item); }
			);
		},

		exactPos: function (item) {
			var compare, identify, bindings, approx, id;
			compare = this.options.compare;
			identify = this.options.identify;
			bindings = this.bindings;
			approx = this.sortedPos(item);
			id = identify(item);
			return this.gropeSearch(
				approx,
				0,
				this.bindings.length,
				function (pos) { return identify(bindings[pos].data) === id; },
				function (pos) { return compare(bindings[pos].data, item); }
			);
		},

		insertItemNode: function (itemNode, pos) {
			var sibling, siblingNode;
			// find previous sibling (undefined is ok)
			sibling = this.bindings[pos - 1];
			siblingNode = sibling && sibling.node;
			// insert node into dom
			this.sectionNode.insertBefore(itemNode, siblingNode);
			return itemNode;
		},

		deleteItemNode: function (itemNode) {
			this.sectionNode.removeChild(itemNode);
			return itemNode;
		},

		pushData: function (binding) {
			var model = binding.data;
			binding.push(function (key) {
				// get value
				return jsonPath.get(model, key);
			});
		},

		pullData: function (binding) {
			var model = binding.data;
			binding.pull(function (key, value) {
				// set value
				jsonPath.set(model, key, value);
			});
		},

		containsNode: function (refNode, testNode) {
			return dom.contains(refNode, testNode);
		},

		binarySearch: binarySearch,

		gropeSearch: grope

	};

	return NodeArray;

	/**
	 * Searches through a list of items, looking for the correct slot
	 * position for an item.
	 * @param {Number} min points at the first possible slot
	 * @param {Number} max points at the slot after the last possible slot
	 * @param {Function} compare is a function to determine how well the
	 *   current position is correct. must return a number, but only cares if
	 *   the number is positive, negative, or zero.
	 * @returns {Number} returns the slot where the item should be placed
	 *   into the list.
	 */
	function binarySearch (min, max, compare) {
		var mid, diff;
		if (max <= min) return min;
		do {
			mid = Math.floor((min + max) / 2);
			diff = compare(mid);
			// if we've narrowed down to a choice of just two slots
			if (max - min <= 1) {
				return diff == 0 ? mid : diff > 0 ? max : min;
			}
			// don't use mid +/- 1 or we may miss in-between values
			if (diff > 0) min = mid;
			else if (diff < 0) max = mid;
			else return mid;
		}
 		while (true);
	}

	/**
	 * Gropes around a given position in a list to find an exact item.  Uses
	 * the match function to determine if it has a match.  Uses the proximal
	 * function to know if it has groped too far.
	 * @param {Number} approx
	 * @param {Number} min points at the first possible slot
	 * @param {Number} max points at the slot after the last possible slot
	 * @param {Function} match must return true if the item at given position
	 *   is an exact match.
	 * @param {Function} proximal is a function to determine how well the
	 *   current position is correct. must return a number, but only cares if
	 *   the number is positive, negative, or zero.
	 * @return {Number}
	 */
	function grope (approx, min, max, match, proximal) {
		var offset = 1, low, high, tooHigh, tooLow;

		if (match(approx)) return approx;

		do {
			high = approx + offset;
			tooHigh = tooHigh || high >= max;
			if (!tooHigh) {
				if (match(high)) return high;
				tooHigh = proximal(high) > 0;
			}
			low = approx - offset;
			tooLow = tooLow || low < min;
			if (!tooLow) {
				if (match(low)) return low;
				tooLow = proximal(low) < 0;
			}
			offset++;
		}
		while (!tooHigh || !tooLow);

		return -1;
	}

});
}(
	typeof define == 'function' && define.amd
		? define
		: function (factory) { module.exports = factory(require); }
));