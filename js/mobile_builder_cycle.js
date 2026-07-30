if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.mobileBuilderCycle = C8O.mobileBuilderCycle || {};

(function () {
  var PREFIX = "convertigo.mcp.mobileBuilder.pending.";
  var MAX_AGE_MS = 120000;
  var generationApiChecked = false;
  var generationApi = null;

  function key(projectName) {
    return PREFIX + String(projectName || "");
  }

  function getGenerationApi() {
    if (generationApiChecked) {
      return generationApi;
    }
    generationApiChecked = true;
    try {
      java.lang.Class.forName("com.twinsoft.convertigo.engine.mobile.MobileBuilderGeneration");
      generationApi = Packages.com.twinsoft.convertigo.engine.mobile.MobileBuilderGeneration;
    } catch (_ignoreGenerationApi) {
      generationApi = null;
    }
    return generationApi;
  }

  function fallbackState(projectName) {
    var propertyKey = key(projectName);
    var value = java.lang.System.getProperty(propertyKey);
    if (value == null) {
      return {
        supported: false,
        id: 0,
        startedAt: 0,
        completedAt: 0,
        status: "none",
        changedFileCount: 0,
        error: ""
      };
    }
    var timestamp = parseInt(String(value), 10);
    var now = Number(java.lang.System.currentTimeMillis());
    if (isNaN(timestamp) || timestamp <= 0 || now - timestamp > MAX_AGE_MS) {
      java.lang.System.clearProperty(propertyKey);
      timestamp = 0;
    }
    return {
      supported: false,
      id: timestamp,
      startedAt: timestamp,
      completedAt: 0,
      status: timestamp > 0 ? "pending" : "none",
      changedFileCount: 0,
      error: ""
    };
  }

  C8O.mobileBuilderCycle.mark = function (projectName) {
    var api = getGenerationApi();
    if (api != null) {
      var state = api.begin(String(projectName || ""));
      return Number(state.getId());
    }
    var timestamp = Number(java.lang.System.currentTimeMillis());
    java.lang.System.setProperty(key(projectName), String(timestamp));
    return timestamp;
  };

  C8O.mobileBuilderCycle.completeAfterBatch = function (projectName, id) {
    var api = getGenerationApi();
    if (api == null || !(Number(id) > 0)) {
      return false;
    }
    api.completeAfterBatch(String(projectName || ""), Number(id));
    return true;
  };

  C8O.mobileBuilderCycle.fail = function (projectName, id, message) {
    var api = getGenerationApi();
    if (api == null || !(Number(id) > 0)) {
      return false;
    }
    api.fail(String(projectName || ""), Number(id), String(message || ""));
    return true;
  };

  C8O.mobileBuilderCycle.readState = function (projectName) {
    var api = getGenerationApi();
    if (api == null) {
      return fallbackState(projectName);
    }
    var state = api.get(String(projectName || ""));
    if (state == null) {
      return {
        supported: true,
        id: 0,
        startedAt: 0,
        completedAt: 0,
        status: "none",
        changedFileCount: 0,
        error: ""
      };
    }
    return {
      supported: true,
      id: Number(state.getId()),
      startedAt: Number(state.getStartedAt()),
      completedAt: Number(state.getCompletedAt()),
      status: String(state.getStatus()),
      changedFileCount: Number(state.getChangedFileCount()),
      error: String(state.getError() || "")
    };
  };

  C8O.mobileBuilderCycle.read = function (projectName) {
    var state = C8O.mobileBuilderCycle.readState(projectName);
    return state.status === "pending" || state.status === "changed" ? state.startedAt : 0;
  };

  C8O.mobileBuilderCycle.clear = function (projectName, expectedId) {
    var api = getGenerationApi();
    if (api != null) {
      return api.clear(String(projectName || ""), Number(expectedId || 0)) === true;
    }
    var propertyKey = key(projectName);
    var current = java.lang.System.getProperty(propertyKey);
    if (current == null) {
      return false;
    }
    if (expectedId != null && Number(expectedId) > 0 && String(current) !== String(expectedId)) {
      return false;
    }
    java.lang.System.clearProperty(propertyKey);
    return true;
  };
})();
