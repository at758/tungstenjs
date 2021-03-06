'use strict';

var _ = require('underscore');
var logger = require('../../src/utils/logger');
var errors = require('../../src/utils/errors');

var modelFunctionsToMap = ['trigger', 'set', 'get', 'has', 'doSerialize', 'save', 'fetch', 'sync', 'validate', 'isValid'];
var modelFunctionsToDummy = ['on', 'off', 'listenTo'];

var getDummyFunction = function(fn) {
  return function() {
    logger.warn(errors.componentFunctionMayNotBeCalledDirectly(fn));
  };
};

if (typeof TUNGSTENJS_DEBUG_MODE !== 'undefined') {
  modelFunctionsToMap.push('getDebugName');
}

/**
 * Similar to BackboneViewWidget, but more simplistic
 * @param {Function} ViewConstructor Constructor function for the view
 * @param {Object}   model           Model data
 * @param {Function} template        Template function
 * @param {Object}   options         Options object from set call
 * @param {String}   key             VDom Key
 */
function ComponentWidget(ViewConstructor, model, template, options, key) {
  this.ViewConstructor = ViewConstructor;
  this.model = model;
  this.model.isComponentModel = true;
  this.template = template;
  this.key = key || _.uniqueId('w_component');
  this.model.session = (this.model.session || []).concat(['content', 'yield']);
  if (typeof TUNGSTENJS_DEBUG_MODE !== 'undefined') {
    this.model._private = {
      content: true, yield: true
    };
  }

  // Start with generic model functions
  var methodsToExpose = modelFunctionsToMap;
  // Add any methods declared by the model
  if (model.exposedFunctions && _.isArray(model.exposedFunctions)) {
    methodsToExpose = methodsToExpose.concat(model.exposedFunctions);
  }
  // Add any methods declared by the component
  if (options && options.exposedFunctions && _.isArray(options.exposedFunctions)) {
    methodsToExpose = methodsToExpose.concat(options.exposedFunctions);
  }
  // dedupe
  methodsToExpose = _.uniq(methodsToExpose);

  var i, fn;
  for (i = 0; i < methodsToExpose.length; i++) {
    fn = methodsToExpose[i];
    if (typeof model[fn] === 'function') {
      if (typeof this[fn] === 'undefined') {
        this[fn] = _.bind(model[fn], model);
      } else {
        logger.warn(errors.cannotOverwriteComponentMethod(fn));
      }
    }
  }

  if (options && options.exposedEvents === true || model.exposedEvents === true) {
    this.exposedEvents = true;
  } else {
    this.exposedEvents = [];
    if (options && options.exposedEvents && _.isArray(options.exposedEvents)) {
      this.exposedEvents = this.exposedEvents.concat(options.exposedEvents);
    }
    if (model.exposedEvents && _.isArray(model.exposedEvents)) {
      this.exposedEvents = this.exposedEvents.concat(model.exposedEvents);
    }
    this.exposedEvents = _.uniq(this.exposedEvents);
  }

  // Other model functions should be present, but noops
  for (i = 0; i < modelFunctionsToDummy.length; i++) {
    fn = modelFunctionsToDummy[i];
    this[fn] = getDummyFunction(fn);
  }
  // Setting some values for Collection use
  this.idAttribute = 'key';
  this.attributes = model.attributes;
  this.cid = model.cid;

  if (options && options.collection) {
    // If passed a collection during construction, save a reference
    this.collection = options.collection;
  }

  // Ensure that destroying the model destroys the component
  if (typeof this.model.destroy === 'function') {
    var self = this;
    var _destroy = _.bind(this.model.destroy, this.model);
    this.model.destroy = function(opts) {
      if (self.collection) {
        self.collection.remove(self);
      } else if (self.parent) {
        self.parent.unset(self.parentProp);
      }
      _destroy(opts);
    };
  }
}

/**
 * Type indicator for Virtual-Dom
 * @type {String}
 */
ComponentWidget.prototype.type = 'Widget';

/**
 * Type indicator for Lookups
 * @type {String}
 */
ComponentWidget.prototype.isComponent = true;

/**
 * Render the view's template to DOM nodes and attach a view to it
 * @return {Element} DOM node with the child view attached
 */
ComponentWidget.prototype.init = function init() {
  this.view = new this.ViewConstructor({
    template: this.template,
    model: this.model,
    dynamicInitialize: true,
    isComponentView: true
  });
  return this.view.el;
};

/**
 * Pass through to the view's destroy method
 */
ComponentWidget.prototype.destroy = function destroy() {
  if (this.view && this.view.destroy) {
    this.view.destroy();
  }
};

/**
 * Attaches the childView to the given DOM node
 * Used for initial startup where a full render and update is excessive
 * @param  {Element}            elem DOM node to act upon
 */
ComponentWidget.prototype.attach = function attach(elem) {
  this.view = new this.ViewConstructor({
    el: elem,
    model: this.model,
    template: this.template,
    isComponentView: true
  });
};

/**
 * Handle for component lambdas to be updated less-expensively but less-flexibly
 * @param  {Template} tmpl Template to use as content
 */
ComponentWidget.prototype.updateContent = function updateContent(template) {
  // Attach to a fake view to avoid template wrapping or unnecessary construction
  var thisView = {
    childViews: this.ViewConstructor.prototype.childViews,
    el: false
  };
  var contentTemplate = template.attachView(thisView);

  this.model.set({
    'content': contentTemplate,
    'yield': template
  });
};

/**
 * Updates an existing childView;  should not be possible with
 * components since they're standalone
 */
ComponentWidget.prototype.update = _.noop;

ComponentWidget.isComponent = function(obj) {
  if (obj && obj.type === ComponentWidget.prototype.type && obj.model && obj.model.tungstenModel) {
    return true;
  }
  return false;
};

if (typeof TUNGSTENJS_DEBUG_MODE !== 'undefined') {
/**
 * Function to allow the Widget to control how it is viewed on the debug panel
 * ChildViews are displayed as a clickable link
 *
 * @return {string} Debug panel version of this widget
 */
  ComponentWidget.prototype.templateToString = function() {
    if (!this.view) {
      return;
    }
    var name = this.view.getDebugName();
    return '<span class="js-view-list-item u-clickable u-underlined" data-id="' + name + '">[' + name + ']</span>';
  };
}

module.exports = ComponentWidget;
