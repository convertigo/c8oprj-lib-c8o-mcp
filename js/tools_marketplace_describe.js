/*
 * marketplace-describe: what a marketplace library offers and how to use it, before importing it.
 * marketplace-list gives one line per entry. Deciding to reuse a library needs more: its readme (sequences and their
 * variables, shared components, setup, symbols) and, once it is in the workspace, its callable sequences and shared
 * NGX components and actions as the Studio sees them. The readme comes from the local project when it is loaded,
 * else from the library's GitHub repository.
 */
if (typeof C8O.marketplace === "undefined") {
  include("js/marketplace.js");
}
C8O.marketplaceDescribe = C8O.marketplaceDescribe || {};

(function (api) {
  var README_MAX = 12000;

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  // https://github.com/<owner>/<repo>(.git) -> raw URLs of its readme on that branch.
  api.readmeUrls = function (cloneUrl, branch) {
    var m = /github\.com[:\/]([^\/]+)\/([^\/.]+?)(?:\.git)?\/?$/i.exec(str(cloneUrl));
    if (!m) {
      return [];
    }
    var base = "https://raw.githubusercontent.com/" + m[1] + "/" + m[2] + "/" + (str(branch) || "master") + "/";
    return [base + "readme.md", base + "README.md"];
  };

  // Keeps the readme readable within the budget: whole when short, else cut at a line end with a note.
  api.trimReadme = function (text) {
    var value = String(text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (value.length <= README_MAX) {
      return { text: value, truncated: false };
    }
    var cut = value.lastIndexOf("\n", README_MAX);
    return { text: value.substring(0, cut > README_MAX / 2 ? cut : README_MAX), truncated: true };
  };

  function httpGet(url) {
    var Http = java.net.http;
    var client = Http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(10))
      .followRedirects(Http.HttpClient.Redirect.NORMAL).build();
    var request = Http.HttpRequest.newBuilder(java.net.URI.create(url)).timeout(java.time.Duration.ofSeconds(20)).GET().build();
    var response = client.send(request, Http.HttpResponse.BodyHandlers.ofString());
    return { status: Number(response.statusCode()), body: String(response.body()) };
  }

  function readLocalReadme(project) {
    var dir = new java.io.File(String(project.getDirPath()));
    var names = ["readme.md", "README.md", "project.md"];
    for (var i = 0; i < names.length; i++) {
      var file = new java.io.File(dir, names[i]);
      if (file.isFile()) {
        return { source: "workspace " + names[i], text: String(new java.lang.String(java.nio.file.Files.readAllBytes(file.toPath()), "UTF-8")) };
      }
    }
    return null;
  }

  // Sequences another project can call: not Private, with their comment and variables.
  function callableSequences(project) {
    var out = [];
    var list = project.getSequencesList();
    for (var i = 0; i < list.size(); i++) {
      var sequence = list.get(i);
      var accessibility = "";
      try {
        accessibility = String(sequence.getAccessibility());
      } catch (_noAccessibility) {}
      if (/private/i.test(accessibility)) {
        continue;
      }
      var variables = [];
      var vars = sequence.getVariablesList();
      for (var v = 0; v < vars.size(); v++) {
        variables.push({ name: String(vars.get(v).getName()), description: str(vars.get(v).getDescription()) });
      }
      var comment = str(sequence.getComment()).split("\n")[0];
      out.push({ qname: String(project.getName()) + "." + String(sequence.getName()), accessibility: accessibility,
        comment: comment.length > 200 ? comment.substring(0, 197) + "..." : comment, variables: variables });
    }
    return out;
  }

  api.describe = function (params, host) {
    var name = str(params.project);
    if (!name.length) {
      throw new Error("project is required: a marketplace entry name from marketplace-list, for example lib_csv_response.");
    }
    var entry = C8O.marketplace.resolveEntry({ project: name });
    var project = C8O.marketplace.resolveProject(entry ? entry.name : name);
    if (!entry && project == null) {
      throw new Error("No marketplace entry named " + name + ". Call marketplace-list to find the exact name.");
    }
    var result = {
      name: entry ? entry.name : String(project.getName()),
      technicalName: entry ? str(entry.technicalName) : "",
      description: entry ? str(entry.description) : str(project.getComment()),
      topics: entry ? entry.topics || [] : [],
      defaultBranch: entry ? str(entry.defaultBranch) : "",
      status: project != null ? "loaded" : "available",
      readme: "",
      readmeSource: "",
      readmeTruncated: false,
      sequences: [],
      sharedComponents: [],
      sharedActions: [],
      importCall: "marketplace-import({project:\"" + (entry ? entry.name : name) + "\", targetProject:\"<your project>\"})",
      warnings: []
    };
    var readme = project != null ? readLocalReadme(project) : null;
    if (!readme && entry) {
      var urls = api.readmeUrls(entry.cloneUrl, entry.defaultBranch);
      for (var u = 0; u < urls.length && !readme; u++) {
        try {
          var got = host.get(urls[u]);
          if (got.status === 200 && got.body.length) {
            readme = { source: urls[u], text: got.body };
          }
        } catch (getError) {
          result.warnings.push("Could not read " + urls[u] + ": " + str(getError && getError.message ? getError.message : getError));
        }
      }
    }
    if (readme) {
      var trimmed = api.trimReadme(readme.text);
      result.readme = trimmed.text;
      result.readmeSource = readme.source;
      result.readmeTruncated = trimmed.truncated;
    } else {
      result.warnings.push("No readme found for " + result.name + ".");
    }
    if (project != null) {
      result.sequences = callableSequences(project);
      var shared = C8O.marketplace.getProjectSharedCatalog(project);
      result.sharedComponents = shared.sharedComponents || [];
      result.sharedActions = shared.sharedActions || [];
    } else {
      result.warnings.push("Not in the workspace yet: the sequences and shared components come from the readme. After marketplace-import, " +
        "call marketplace-describe again for the exact QNames.");
    }
    return result;
  };

  api.execute = function (params) {
    return api.describe(params, { get: httpGet });
  };
})(C8O.marketplaceDescribe);
