if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUi = C8O.crudUi || {};

(function () {
  if (C8O.crudUi._nodesInitialized === true) {
    return;
  }
  C8O.crudUi._nodesInitialized = true;

  function trimmed(ctx, value) {
    return ctx.trimmed(value);
  }

  function ensureArray(ctx, value) {
    return ctx.ensureArray(value);
  }

  function toBoolean(ctx, value, defaultValue) {
    return ctx.toBoolean(value, defaultValue);
  }

  function scriptLiteral(_ctx, value) {
    if (value === null || value === undefined) {
      return "''";
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return "'" + String(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n") + "'";
  }

  function compVariableNode(_ctx, name, valueExpression, comment) {
    var node = {
      className: "ngx.components.UICompVariable#UICompVariable",
      name: name
    };
    var properties = {};
    if (comment) {
      properties.comment = String(comment);
    }
    properties.value = valueExpression || "''";
    node.properties = properties;
    return node;
  }

  function useVariableNode(_ctx, name, valueExpression, comment) {
    var smartValue = null;
    if (valueExpression && typeof valueExpression === "object" && valueExpression.mode) {
      smartValue = valueExpression;
    } else {
      smartValue = {
        mode: "SCRIPT",
        value: valueExpression || "''"
      };
    }
    var node = {
      className: "ngx.components.UIUseVariable#UIUseVariable",
      name: name,
      properties: {
        varValue: smartValue
      }
    };
    if (comment) {
      node.properties.comment = String(comment);
    }
    return node;
  }

  function controlVariableNode(_ctx, name, valueExpression, comment) {
    var smartValue = null;
    if (valueExpression && typeof valueExpression === "object" && valueExpression.mode) {
      smartValue = valueExpression;
    } else {
      smartValue = {
        mode: "SCRIPT",
        value: valueExpression || "''"
      };
    }
    var node = {
      className: "ngx.components.UIControlVariable#UIControlVariable",
      name: name,
      properties: {
        varValue: smartValue
      }
    };
    if (comment) {
      node.properties.comment = String(comment);
    }
    return node;
  }

  function pageEventNode(ctx, name, viewEvent, children, comment) {
    var node = {
      className: "ngx.components.UIPageEvent#UIPageEvent",
      name: name,
      properties: {
        viewEvent: trimmed(ctx, viewEvent || "onWillEnter")
      },
      children: ensureArray(ctx, children)
    };
    if (comment) {
      node.properties.comment = String(comment);
    }
    return node;
  }

  function callSequenceActionNode(ctx, name, requestableQName, variables, options) {
    var extra = options && typeof options === "object" ? options : {};
    var properties = {
      requestable: trimmed(ctx, requestableQName)
    };
    if (extra.threshold != null) {
      properties.threshold = String(extra.threshold);
    }
    if (extra.noLoading != null) {
      properties.noLoading = String(toBoolean(ctx, extra.noLoading, false));
    }
    if (extra.cacheTtl != null) {
      properties.cacheTtl = String(extra.cacheTtl);
    }
    if (extra.timeout != null) {
      properties.timeout = String(extra.timeout);
    }
    if (trimmed(ctx, extra.comment).length) {
      properties.comment = String(extra.comment);
    }
    return {
      className: "ngx.components.UIDynamicAction#CallSequenceAction",
      name: name,
      properties: properties,
      children: ensureArray(ctx, variables)
    };
  }

  function customAsyncActionNode(ctx, name, actionValue, comment) {
    var properties = {
      actionValue: actionValue || "return;"
    };
    if (trimmed(ctx, comment).length) {
      properties.comment = String(comment);
    }
    return {
      className: "ngx.components.UICustomAsyncAction#UICustomAsyncAction",
      name: name,
      properties: properties
    };
  }

  function smartTextNode(_ctx, name, smartValue) {
    return {
      className: "ngx.components.UIText#UIText",
      name: name,
      properties: {
        textValue: smartValue
      }
    };
  }

  function plainTextNode(ctx, name, value) {
    return smartTextNode(ctx, name, {
      mode: "PLAIN",
      value: value == null ? "" : String(value)
    });
  }

  function scriptTextNode(ctx, name, valueExpression) {
    return smartTextNode(ctx, name, {
      mode: "SCRIPT",
      value: valueExpression || "''"
    });
  }

  function attributeNode(_ctx, name, attrName, smartValue) {
    return {
      className: "ngx.components.UIAttribute#UIAttribute",
      name: name,
      properties: {
        attrName: String(attrName),
        attrValue: smartValue
      }
    };
  }

  function labelNode(ctx, name, value) {
    return {
      className: "ngx.components.UIDynamicElement#Label",
      name: name,
      children: [
        plainTextNode(ctx, name + "Text", value)
      ]
    };
  }

  function textElementNode(_ctx, className, name, textNode) {
    return {
      className: className,
      name: name,
      children: [textNode]
    };
  }

  function sharedSourceValue(_ctx, projectName, priority, variableName) {
    return {
      mode: "SOURCE",
      value: JSON.stringify({
        filter: "Shared",
        project: projectName,
        input: "",
        model: {
          data: [{ priority: Number(priority), regular: true }],
          path: "?." + variableName,
          prefix: "",
          suffix: "",
          custom: "",
          useCustom: false
        }
      })
    };
  }

  function sequenceSourceValue(ctx, projectName, sequenceName, path, options) {
    var sequenceQName = trimmed(ctx, sequenceName);
    var extra = options && typeof options === "object" ? options : {};
    return {
      mode: "SOURCE",
      value: JSON.stringify({
        filter: "Sequence",
        project: projectName,
        input: trimmed(ctx, extra.input || ""),
        model: {
          data: [{ sequence: sequenceQName, marker: "" }],
          path: trimmed(ctx, path || ""),
          prefix: extra.prefix == null ? "" : String(extra.prefix),
          suffix: extra.suffix == null ? "" : String(extra.suffix),
          custom: extra.custom == null ? "" : String(extra.custom),
          useCustom: toBoolean(ctx, extra.useCustom, false)
        }
      })
    };
  }

  function globalSourceValue(ctx, projectName, path, options) {
    var extra = options && typeof options === "object" ? options : {};
    return {
      mode: "SOURCE",
      value: JSON.stringify({
        filter: "Global",
        project: projectName,
        input: trimmed(ctx, extra.input || ""),
        model: {
          data: [{ sharedObject: "router.sharedObject" }],
          path: trimmed(ctx, path || ""),
          prefix: extra.prefix == null ? "" : String(extra.prefix),
          suffix: extra.suffix == null ? "" : String(extra.suffix),
          custom: extra.custom == null ? "" : String(extra.custom),
          useCustom: toBoolean(ctx, extra.useCustom, false)
        }
      })
    };
  }

  function iterationSourceValue(_ctx, projectName, inputExpression) {
    return {
      mode: "SOURCE",
      value: JSON.stringify({
        filter: "Iteration",
        project: projectName,
        input: String(inputExpression || "")
      })
    };
  }

  function buildUseSharedNode(_ctx, sharedQName, name, variables) {
    return {
      className: "ngx.components.UIUseShared#UIUseShared",
      name: name,
      properties: {
        sharedcomponent: sharedQName
      },
      children: variables || []
    };
  }

  function ifDirectiveNode(ctx, name, expression, children) {
    return {
      className: "ngx.components.UIControlDirective#UIControlDirective",
      name: name,
      properties: {
        directiveName: "If",
        directiveExpression: String(expression || "false")
      },
      children: ensureArray(ctx, children)
    };
  }

  function iterationDirectiveNode(ctx, name, projectName, itemName, inputExpression, children) {
    return {
      className: "ngx.components.UIControlDirective#UIControlDirective",
      name: name,
      properties: {
        directiveItemName: trimmed(ctx, itemName || "item"),
        directiveSource: iterationSourceValue(ctx, projectName, inputExpression)
      },
      children: ensureArray(ctx, children)
    };
  }

  function sourceDirectiveNode(ctx, name, itemName, sourceValue, children, indexName) {
    var properties = {
      directiveItemName: trimmed(ctx, itemName || "item"),
      directiveSource: sourceValue
    };
    if (trimmed(ctx, indexName).length) {
      properties.directiveIndexName = String(indexName);
    }
    return {
      className: "ngx.components.UIControlDirective#UIControlDirective",
      name: name,
      properties: properties,
      children: ensureArray(ctx, children)
    };
  }

  function controlEventNode(ctx, name, children, options) {
    var node = {
      className: "ngx.components.UIControlEvent#UIControlEvent",
      name: name,
      children: ensureArray(ctx, children)
    };
    var extra = options && typeof options === "object" ? options : {};
    var properties = {};
    if (trimmed(ctx, extra.attrName).length) {
      properties.attrName = String(extra.attrName);
    }
    if (trimmed(ctx, extra.eventName).length) {
      properties.eventName = String(extra.eventName);
    }
    if (trimmed(ctx, extra.comment).length) {
      properties.comment = String(extra.comment);
    }
    if (Object.keys(properties).length) {
      node.properties = properties;
    }
    return node;
  }

  function stackVariableNode(_ctx, name, defaultValue) {
    var node = {
      className: "ngx.components.UIStackVariable#UIStackVariable",
      name: name
    };
    if (defaultValue != null) {
      node.properties = {
        value: String(defaultValue)
      };
    }
    return node;
  }

  function setGlobalActionNode(_ctx, name, propertyName, valueExpression) {
    return {
      className: "ngx.components.UIDynamicAction#SetGlobalAction",
      name: name,
      properties: {
        Property: {
          mode: "PLAIN",
          value: String(propertyName || "")
        },
        Value: {
          mode: "SCRIPT",
          value: valueExpression || "''"
        }
      }
    };
  }

  function setLocalActionNode(_ctx, name, propertyName, valueExpression) {
    return {
      className: "ngx.components.UIDynamicAction#SetLocalAction",
      name: name,
      properties: {
        Property: {
          mode: "PLAIN",
          value: String(propertyName || "")
        },
        Value: {
          mode: "SCRIPT",
          value: valueExpression || "''"
        }
      }
    };
  }

  function dynamicInvokeNode(ctx, name, stackQName, variables) {
    return {
      className: "ngx.components.UIDynamicInvoke#InvokeAction",
      name: name,
      properties: {
        stack: String(stackQName || "")
      },
      children: ensureArray(ctx, variables)
    };
  }

  function actionStackNode(ctx, name, variables, children, comment) {
    var stackChildren = [];
    var vars = ensureArray(ctx, variables);
    for (var i = 0; i < vars.length; i++) {
      stackChildren.push(vars[i]);
    }
    stackChildren = stackChildren.concat(ensureArray(ctx, children));
    var node = {
      className: "ngx.components.UIActionStack#UIActionStack",
      name: name,
      children: stackChildren
    };
    if (trimmed(ctx, comment).length) {
      node.properties = {
        comment: String(comment)
      };
    }
    return node;
  }

  C8O.crudUi.scriptLiteral = scriptLiteral;
  C8O.crudUi.compVariableNode = compVariableNode;
  C8O.crudUi.useVariableNode = useVariableNode;
  C8O.crudUi.controlVariableNode = controlVariableNode;
  C8O.crudUi.pageEventNode = pageEventNode;
  C8O.crudUi.callSequenceActionNode = callSequenceActionNode;
  C8O.crudUi.customAsyncActionNode = customAsyncActionNode;
  C8O.crudUi.smartTextNode = smartTextNode;
  C8O.crudUi.plainTextNode = plainTextNode;
  C8O.crudUi.scriptTextNode = scriptTextNode;
  C8O.crudUi.attributeNode = attributeNode;
  C8O.crudUi.labelNode = labelNode;
  C8O.crudUi.textElementNode = textElementNode;
  C8O.crudUi.sharedSourceValue = sharedSourceValue;
  C8O.crudUi.sequenceSourceValue = sequenceSourceValue;
  C8O.crudUi.globalSourceValue = globalSourceValue;
  C8O.crudUi.iterationSourceValue = iterationSourceValue;
  C8O.crudUi.buildUseSharedNode = buildUseSharedNode;
  C8O.crudUi.ifDirectiveNode = ifDirectiveNode;
  C8O.crudUi.iterationDirectiveNode = iterationDirectiveNode;
  C8O.crudUi.sourceDirectiveNode = sourceDirectiveNode;
  C8O.crudUi.controlEventNode = controlEventNode;
  C8O.crudUi.stackVariableNode = stackVariableNode;
  C8O.crudUi.setGlobalActionNode = setGlobalActionNode;
  C8O.crudUi.setLocalActionNode = setLocalActionNode;
  C8O.crudUi.dynamicInvokeNode = dynamicInvokeNode;
  C8O.crudUi.actionStackNode = actionStackNode;
})();
