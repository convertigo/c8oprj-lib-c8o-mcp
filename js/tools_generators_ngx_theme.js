/*
 * ngx-theme-apply: the visual identity of an NGX app from a small token set (a preset, a brand color, radius,
 * density, toolbar style, light or dark). It writes the app-level UIStyle AppTheme, which sets the Ionic CSS variables
 * (each color with its rgb, contrast, shade and tint, background, text, step colors) and the --app-* tokens the AppLayout
 * classes of ngx-page-create read (spacing and type scale, radius, surfaces, toolbar), and sets the light or dark mode on
 * the starter's GetThemeAction. The starter's LightTheme, AutoDarkTheme and TailwindTheme stay underneath as they are:
 * AppTheme comes after them and uses their root classes (force-light, force-dark).
 * ngx-page-create applies the default preset to a new app (js/tools_generators_ngx.js).
 */
include("js/tools_generators.js");

(function () {
  var G = C8O.generators;
  var H = G._;
  var str = H.str, isObj = H.isObj, parseJson = H.parseJson, qnameOf = H.qnameOf, childNamed = H.childNamed, invalid = H.invalid,
    projectOf = H.projectOf, batchErrors = H.batchErrors, Session = H.Session;

  // --- colors ------------------------------------------------------------------------------------

  function parseHex(value) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str(value));
    if (!m) {
      return null;
    }
    var h = m[1].length === 3 ? m[1].replace(/(.)/g, "$1$1") : m[1];
    return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
  }

  function hex(c) {
    var part = function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length < 2 ? "0" + s : s;
    };
    return "#" + part(c.r) + part(c.g) + part(c.b);
  }

  // weight of b in the mix, 0 to 1.
  function mix(a, b, weight) {
    var ca = parseHex(a), cb = parseHex(b);
    return hex({ r: ca.r + (cb.r - ca.r) * weight, g: ca.g + (cb.g - ca.g) * weight, b: ca.b + (cb.b - ca.b) * weight });
  }

  function rgb(value) {
    var c = parseHex(value);
    return c.r + "," + c.g + "," + c.b;
  }

  function luminance(value) {
    var c = parseHex(value);
    var lin = function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }

  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // The text color that reads best on a background: white or the given dark ink.
  function readableOn(background, ink) {
    return contrast("#ffffff", background) >= contrast(ink, background) ? "#ffffff" : ink;
  }

  // Moves a color towards white (dark mode) or black (light mode) until it reaches the contrast asked on a background.
  function withContrast(color, background, min, towards) {
    var out = color;
    for (var i = 1; i <= 25 && contrast(out, background) < min; i++) {
      out = mix(color, towards, i * 0.04);
    }
    return out;
  }

  // Ionic's own convention: shade 12 % black, tint 10 % white.
  function colorVars(name, base, ink) {
    var contrastColor = readableOn(base, ink);
    return [
      ["--ion-color-" + name, base],
      ["--ion-color-" + name + "-rgb", rgb(base)],
      ["--ion-color-" + name + "-contrast", contrastColor],
      ["--ion-color-" + name + "-contrast-rgb", rgb(contrastColor)],
      ["--ion-color-" + name + "-shade", mix(base, "#000000", 0.12)],
      ["--ion-color-" + name + "-tint", mix(base, "#ffffff", 0.1)]
    ];
  }

  // --- tokens ------------------------------------------------------------------------------------

  var FONT = "\"IBM Plex Sans\", \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif";

  // Presets: a starting point, never the brand. Each one differs by color, toolbar, radius and density.
  var PRESETS = {
    institutional: { description: "sober and institutional: deep blue-grey primary, colored toolbar, small radius, comfortable spacing",
      primary: "#1f4e79", secondary: "#56738f", tertiary: "#a35c00", background: "#f3f5f8", surface: "#ffffff", text: "#17212e",
      radius: 6, density: "comfortable", toolbar: "primary", headingWeight: 600 },
    modern: { description: "modern product: violet primary, white toolbar, rounded cards and soft shadows",
      primary: "#5b4bdb", secondary: "#0f8c7e", tertiary: "#d9480f", background: "#f6f6fb", surface: "#ffffff", text: "#151728",
      radius: 14, density: "comfortable", toolbar: "surface", headingWeight: 700 },
    dense: { description: "dense data screens: teal primary, dark toolbar, compact spacing and type, square corners",
      primary: "#0b7285", secondary: "#5c6b7a", tertiary: "#b8460b", background: "#eef1f4", surface: "#ffffff", text: "#1b2430",
      radius: 4, density: "compact", toolbar: "dark", headingWeight: 600 }
  };
  var DEFAULT_PRESET = "institutional";
  var STATUS = { success: "#2b8a3e", warning: "#e8a317", danger: "#c92a2a", medium: "#64748b" };
  var SCALES = {
    comfortable: { space: [4, 8, 12, 16, 24, 32], font: { xs: 12, sm: 14, base: 16, lg: 18, xl: 22, "2xl": 28 }, row: 52 },
    compact: { space: [2, 4, 8, 12, 16, 24], font: { xs: 11, sm: 13, base: 14, lg: 16, xl: 19, "2xl": 24 }, row: 40 }
  };
  var MODES = ["light", "auto", "dark"];
  var TOOLBARS = ["primary", "surface", "dark"];
  G.THEME_PRESETS = PRESETS;

  // The token set: the preset, then what the call gives. Errors are collected, nothing is written.
  G.themeTokens = function (spec, errors) {
    spec = spec || {};
    var presetName = str(spec.preset) || DEFAULT_PRESET;
    var preset = PRESETS[presetName];
    if (!preset) {
      errors.push("preset must be " + Object.keys(PRESETS).join(", ") + " (" + Object.keys(PRESETS).map(function (k) { return k + ": " + PRESETS[k].description; }).join("; ") + ").");
      preset = PRESETS[DEFAULT_PRESET];
    }
    var t = { preset: presetName };
    ["primary", "secondary", "tertiary", "background", "surface", "text"].forEach(function (k) {
      var given = str(spec[k]);
      if (given.length && !parseHex(given)) {
        errors.push(k + " must be a hex color such as #1f4e79 (given " + given + ").");
      }
      t[k] = parseHex(given) ? hex(parseHex(given)) : preset[k];
    });
    t.brand = t.primary;
    t.radius = spec.radius !== undefined && str(spec.radius).length ? Number(spec.radius) : preset.radius;
    if (!(t.radius >= 0 && t.radius <= 32) || Math.round(t.radius) !== t.radius) {
      errors.push("radius must be a whole number of pixels from 0 to 32.");
      t.radius = preset.radius;
    }
    t.density = str(spec.density) || preset.density;
    if (!SCALES[t.density]) {
      errors.push("density must be comfortable or compact.");
      t.density = preset.density;
    }
    t.toolbar = str(spec.toolbar) || preset.toolbar;
    if (TOOLBARS.indexOf(t.toolbar) < 0) {
      errors.push("toolbar must be " + TOOLBARS.join(", ") + ".");
      t.toolbar = preset.toolbar;
    }
    t.mode = str(spec.mode) || "light";
    if (MODES.indexOf(t.mode) < 0) {
      errors.push("mode must be light (the default: the app stays light in a dark browser), auto (follows the browser) or dark.");
      t.mode = "light";
    }
    t.font = str(spec.font) || FONT;
    if (/[;{}<>]/.test(t.font)) {
      errors.push("font must be a CSS font-family list, such as \"Inter\", Arial, sans-serif.");
      t.font = FONT;
    }
    t.headingWeight = preset.headingWeight;
    t.appName = str(spec.appName);
    return t;
  };

  // Light and dark palettes from the tokens, with the contrast of each pair a reader depends on.
  G.themePalettes = function (t) {
    var adjusted = [];
    var ink = t.text;
    // Primary is also the color of texts (clear and outline buttons, links, selected menu entry): a brand too light on the
    // background is darkened for them, the toolbar keeps the brand as given.
    var primary = t.primary;
    if (contrast(primary, t.surface) < 3) {
      primary = withContrast(t.primary, t.surface, 4.5, "#000000");
      adjusted.push("primary " + t.primary + " reads at " + round2(contrast(t.primary, t.surface)) + ":1 on the surface: " + primary +
        " is used for texts, buttons and links, " + t.primary + " stays the toolbar color.");
    }
    var light = { background: t.background, surface: t.surface, text: t.text };
    light.surface2 = mix(t.surface, primary, 0.04);
    light.border = mix(t.surface, t.text, 0.13);
    light.muted = withContrast(mix(t.text, t.surface, 0.4), t.surface, 4.5, t.text);
    light.colors = { primary: primary, secondary: withContrast(t.secondary, t.surface, 3, "#000000"), tertiary: withContrast(t.tertiary, t.surface, 3, "#000000"),
      success: STATUS.success, warning: STATUS.warning, danger: STATUS.danger, medium: STATUS.medium,
      light: mix(t.background, t.text, 0.04), dark: mix(t.text, "#000000", 0.1) };
    if (t.toolbar === "primary") {
      light.toolbar = t.brand;
    } else if (t.toolbar === "dark") {
      light.toolbar = mix("#111827", t.primary, 0.12);
    } else {
      light.toolbar = t.surface;
    }
    light.toolbarText = t.toolbar === "surface" ? t.text : readableOn(light.toolbar, t.text);
    light.toolbarBorder = t.toolbar === "surface" ? light.border : light.toolbar;
    light.ink = ink;

    var dark = { background: mix("#0b0f14", t.primary, 0.06) };
    dark.surface = mix(dark.background, "#ffffff", 0.05);
    dark.text = "#e7eaf0";
    dark.surface2 = mix(dark.surface, t.primary, 0.1);
    dark.border = mix(dark.surface, dark.text, 0.15);
    dark.muted = withContrast(mix(dark.text, dark.surface, 0.38), dark.surface, 4.5, "#ffffff");
    dark.ink = dark.background;
    dark.colors = {};
    ["primary", "secondary", "tertiary", "success", "warning", "danger", "medium"].forEach(function (k) {
      dark.colors[k] = withContrast(k === "primary" ? t.primary : light.colors[k], dark.surface, 4.5, "#ffffff");
    });
    // The starter's dark theme swaps light and dark.
    dark.colors.light = mix(dark.surface, "#ffffff", 0.06);
    dark.colors.dark = "#f1f5f9";
    dark.toolbar = t.toolbar === "primary" ? mix(dark.background, t.brand, 0.45) : (t.toolbar === "dark" ? mix(dark.background, "#000000", 0.35) : dark.surface);
    dark.toolbarText = readableOn(dark.toolbar, dark.background);
    dark.toolbarBorder = t.toolbar === "surface" ? dark.border : dark.toolbar;

    var report = function (p) {
      return {
        textOnBackground: round2(contrast(p.text, p.background)),
        textOnSurface: round2(contrast(p.text, p.surface)),
        mutedOnSurface: round2(contrast(p.muted, p.surface)),
        primaryOnSurface: round2(contrast(p.colors.primary, p.surface)),
        primaryButtonText: round2(contrast(readableOn(p.colors.primary, p.ink), p.colors.primary)),
        toolbarText: round2(contrast(p.toolbarText, p.toolbar))
      };
    };
    return { light: light, dark: dark, adjusted: adjusted, contrast: { light: report(light), dark: report(dark) } };
  };

  function declarations(pairs, indent) {
    return pairs.map(function (p) { return indent + p[0] + ": " + p[1] + ";"; }).join("\n");
  }

  function paletteVars(p, scheme) {
    var pairs = [];
    ["primary", "secondary", "tertiary", "success", "warning", "danger", "medium", "light", "dark"].forEach(function (k) {
      pairs = pairs.concat(colorVars(k, p.colors[k], p.ink));
    });
    pairs.push(["--ion-background-color", p.background], ["--ion-background-color-rgb", rgb(p.background)],
      ["--ion-text-color", p.text], ["--ion-text-color-rgb", rgb(p.text)], ["--ion-border-color", p.border],
      ["--ion-item-background", p.surface], ["--ion-card-background", p.surface], ["--ion-toolbar-background", p.surface],
      ["--ion-tab-bar-background", p.surface]);
    // Steps: Ionic 8 reads --ion-background-color-step-N and --ion-text-color-step-N, older code --ion-color-step-N.
    for (var n = 50; n <= 950; n += 50) {
      var step = mix(p.background, p.text, n / 1000);
      pairs.push(["--ion-color-step-" + n, step], ["--ion-background-color-step-" + n, step],
        ["--ion-text-color-step-" + n, mix(p.text, p.background, n / 1000)]);
    }
    pairs.push(["--app-surface", p.surface], ["--app-surface-2", p.surface2], ["--app-muted", p.muted], ["--app-border", p.border],
      ["--app-toolbar-background", p.toolbar], ["--app-toolbar-color", p.toolbarText], ["--app-toolbar-border", p.toolbarBorder],
      ["--app-shadow-sm", scheme === "dark" ? "0 1px 2px rgba(0,0,0,.45)" : "0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.08)"],
      ["--app-shadow-md", scheme === "dark" ? "0 6px 16px rgba(0,0,0,.45)" : "0 6px 16px rgba(15,23,42,.10)"],
      ["--tw-shadow-sm", "var(--app-shadow-sm)"], ["--tw-shadow-md", "var(--app-shadow-md)"],
      ["color-scheme", scheme]);
    return pairs;
  }

  function sharedVars(t) {
    var scale = SCALES[t.density];
    var pairs = [["--ion-font-family", t.font], ["--tw-font-sans", t.font],
      ["--app-radius-sm", Math.max(2, Math.round(t.radius * 0.6)) + "px"], ["--app-radius", t.radius + "px"], ["--app-radius-lg", Math.round(t.radius * 1.4) + "px"],
      ["--tw-radius-sm", "var(--app-radius-sm)"], ["--tw-radius-md", "var(--app-radius)"], ["--tw-radius-lg", "var(--app-radius-lg)"],
      ["--app-heading-weight", String(t.headingWeight)], ["--app-row-height", scale.row + "px"]];
    scale.space.forEach(function (v, i) {
      pairs.push(["--app-space-" + (i + 1), v + "px"]);
    });
    Object.keys(scale.font).forEach(function (k) {
      pairs.push(["--app-font-size-" + k, scale.font[k] + "px"]);
    });
    return pairs;
  }

  // The starter's themes also set the page colors on body, ion-app, ion-content and ion-menu themselves (a variable set on
  // an element wins over the one of the root): the scheme repeats them there, after the starter's rules.
  function elementBlock(roots, p, indent) {
    var selector = [];
    roots.forEach(function (root) {
      ["body", "ion-app", "ion-content", "ion-menu"].forEach(function (el) {
        selector.push(root + " " + el);
      });
    });
    return indent + selector.join(",\n" + indent) + " {\n" + declarations([["--ion-background-color", p.background], ["--ion-text-color", p.text],
      ["--ion-border-color", p.border], ["--ion-item-background", p.surface], ["--ion-card-background", p.surface], ["--ion-toolbar-background", p.surface],
      ["--ion-tab-bar-background", p.surface], ["--background", p.background], ["background", p.background], ["color", p.text]], indent + "  ") + "\n" + indent + "}";
  }

  function scheme(roots, p, name, indent) {
    return indent + roots.join(", ") + " {\n" + declarations(paletteVars(p, name), indent + "  ") + "\n" + indent + "}\n" + elementBlock(roots, p, indent);
  }

  // The stylesheet of AppTheme. html:root outranks the :root rules of Ionic's core.css and of TailwindTheme, which
  // the build puts after the app styles; the force-light and force-dark classes are the ones GetThemeAction sets.
  G.themeCss = function (t, palettes) {
    var out = ["/* AppTheme, written by ngx-theme-apply: preset " + t.preset + ", primary " + t.brand + ", toolbar " + t.toolbar +
      ", density " + t.density + ", mode " + t.mode + ". Call ngx-theme-apply again to change it: LightTheme, AutoDarkTheme and " +
      "TailwindTheme stay the starter's defaults underneath. */"];
    if (t.mode === "dark") {
      out.push(scheme([":root.force-light"], palettes.light, "light", ""), scheme(["html:root", ":root.force-dark"], palettes.dark, "dark", ""));
    } else {
      out.push(scheme(["html:root", ":root.force-light"], palettes.light, "light", ""), scheme([":root.force-dark"], palettes.dark, "dark", ""));
    }
    if (t.mode === "auto") {
      out.push("@media (prefers-color-scheme: dark) {\n" + scheme([":root:not(.force-light)"], palettes.dark, "dark", "  ") + "\n}");
    } else if (t.mode === "light") {
      // Before GetThemeAction sets force-light, a dark browser would show the starter's dark theme.
      out.push("@media (prefers-color-scheme: dark) {\n" + scheme([":root:not(.force-dark)"], palettes.light, "light", "  ") + "\n}");
    }
    out.push("html:root {\n" + declarations(sharedVars(t), "  ") + "\n}");
    out.push([
      "/* App shell: page toolbars, side menu */",
      "ion-header ion-toolbar { --background: var(--app-toolbar-background); --color: var(--app-toolbar-color); --border-color: var(--app-toolbar-border); }",
      // TailwindTheme sets ion-toolbar ion-title { color: var(--tw-text) }: the title follows the toolbar color here.
      "ion-header ion-toolbar ion-title { color: var(--app-toolbar-color); --color: var(--app-toolbar-color); font-weight: var(--app-heading-weight); letter-spacing: -0.01em; }",
      // ion-button.in-toolbar outranks TailwindTheme's ion-button[fill="clear"] { --color: var(--tw-text) }, and its
      // ion-toolbar ion-icon { color: var(--tw-text) } left the home icon dark on a colored toolbar.
      "ion-header ion-toolbar ion-button.in-toolbar, ion-header ion-toolbar ion-back-button, ion-header ion-toolbar ion-menu-button { --color: var(--app-toolbar-color); color: var(--app-toolbar-color); --background: transparent; --box-shadow: none; }",
      "ion-header ion-toolbar ion-icon { color: var(--app-toolbar-color); }",
      "ion-menu ion-content { --background: var(--app-surface); }",
      "ion-menu.md ion-item, ion-menu.ios ion-item { --border-radius: var(--app-radius-sm); margin-bottom: 2px; }",
      "ion-menu.md ion-item ion-icon, ion-menu.ios ion-item ion-icon { color: var(--app-muted); }",
      "ion-menu.md ion-item.selected, ion-menu.ios ion-item.selected { --background: rgba(var(--ion-color-primary-rgb), 0.12); --color: var(--ion-color-primary); font-weight: 600; }",
      "ion-menu.md ion-item.selected ion-icon, ion-menu.ios ion-item.selected ion-icon { color: var(--ion-color-primary); }"
    ].join("\n"));
    return out.join("\n\n") + "\n";
  };

  // --- apply -------------------------------------------------------------------------------------

  function directChildren(dbo) {
    var out = [];
    try {
      var all = dbo.getAllChildren();
      for (var i = 0; i < all.size(); i++) {
        out.push(all.get(i));
      }
    } catch (_noChildren) {}
    return out;
  }

  function ionBeanName(dbo) {
    try {
      var bean = typeof dbo.getIonBean === "function" ? dbo.getIonBean() : null;
      return bean ? str(bean.getName()) : "";
    } catch (_noBean) {
      return "";
    }
  }

  // The starter's GetThemeAction of the app init event: it applies force-light or force-dark at start.
  function getThemeActions(app) {
    var found = [];
    directChildren(app).forEach(function (child) {
      if (/UIAppEvent/.test(String(child.getClass().getName()))) {
        directChildren(child).forEach(function (action) {
          if (ionBeanName(action) === "GetThemeAction") {
            found.push(action);
          }
        });
      }
    });
    return found;
  }

  function setProperties(dbo, properties) {
    var res = C8O.dbo.batchApply({ target: qnameOf(dbo), operations: [{ type: "setProperties", qname: qnameOf(dbo), properties: properties }],
      onError: "stop", autoSave: false, triggerMobileBuilder: false });
    return !res || res.status === "failed" || (res.errors && res.errors.length) ? batchErrors(res).join(" | ") || "failed" : "";
  }

  // Writes AppTheme (created or replaced) and the mode, in an app already resolved. Used by ngx-theme-apply and by
  // ngx-page-create (default preset of a new app). Returns the description of what was done.
  G.applyTheme = function (projectDbo, app, spec, session, tool) {
    var errors = [];
    var t = G.themeTokens(spec, errors);
    // ngx-page-create checks its theme option before creating anything; these are the errors of ngx-theme-apply itself.
    if (errors.length) {
      invalid(tool, errors);
    }
    var palettes = G.themePalettes(t);
    var css = G.themeCss(t, palettes);
    var warnings = palettes.adjusted.slice();
    var style = childNamed(app, "AppTheme");
    var status;
    if (style) {
      var why = setProperties(style, { styleContent: css });
      if (why.length) {
        invalid(tool, ["AppTheme could not be written: " + why]);
      }
      status = "updated";
    } else {
      session.create(qnameOf(app), { className: "ngx.components.UIStyle#UIStyle", name: "AppTheme",
        properties: { styleContent: css, comment: "Visual identity of the app (preset " + t.preset + ", primary " + t.brand + "), written by ngx-theme-apply." } });
      status = "created";
    }
    // Mode: light and dark set the GetThemeAction of the app init event so that the app ignores the browser preference;
    // auto lets it follow the browser. A user's own choice (the starter's theme button) is still kept in storage.
    var modeProps = { useSystem: { mode: "PLAIN", value: t.mode === "auto" ? "true" : "false" },
      fallbackDark: { mode: "PLAIN", value: t.mode === "dark" ? "true" : "false" } };
    var actions = getThemeActions(app);
    var modeStatus;
    if (!actions.length) {
      modeStatus = "no GetThemeAction in the app init event: the app follows the browser preference";
      if (t.mode !== "auto") {
        warnings.push("The app has no GetThemeAction in its onAppInit event (the starter's AppEvent): AppTheme alone keeps it " + t.mode +
          " in most cases, but a page in a " + (t.mode === "light" ? "dark" : "light") + " browser can mix both themes. Add a GetThemeAction " +
          "with applyTheme true and useSystem false to the app init event.");
      }
    } else {
      actions.forEach(function (a) {
        var why2 = setProperties(a, modeProps);
        if (why2.length) {
          warnings.push("The mode could not be set on " + qnameOf(a) + ": " + why2);
        }
        // GetThemeAction applies the mode by calling the code of SetThemeAction, which the build only includes when the app
        // has one: the starter's theme button, gone with the starter page. Without it no root class was ever set, and a
        // dark browser mixed the starter's dark rules with the light theme (31/10). This child keeps that code in the app.
        if (!childNamed(a, "ApplyTheme")) {
          session.create(qnameOf(a), { className: "ngx.components.UIDynamicAction#SetThemeAction", name: "ApplyTheme", properties: {
            dark: { mode: "SCRIPT", value: "!!out?.dark" }, persist: { mode: "PLAIN", value: "false" }, useSystem: modeProps.useSystem,
            fallbackDark: modeProps.fallbackDark, comment: "Sets the force-light or force-dark class GetTheme resolved (written by ngx-theme-apply)." } });
        }
      });
      modeStatus = qnameOf(actions[0]) + " useSystem " + modeProps.useSystem.value + ", fallbackDark " + modeProps.fallbackDark.value + ", ApplyTheme sets the root class";
    }
    // The menu header shows the app name instead of the starter's "Navigation" key.
    var menuTitle = "";
    if (t.appName.length) {
      var menu = childNamed(app, "Menu");
      var text = menu ? C8O.dbo.resolve(qnameOf(menu) + ".Header.ToolBar.BarTitle.Text", { optional: true }) : null;
      if (text) {
        var why3 = setProperties(text, { textValue: { mode: "PLAIN", value: t.appName }, i18n: false });
        menuTitle = why3.length ? "" : t.appName;
        if (why3.length) {
          warnings.push("The menu title could not be set: " + why3);
        }
      } else {
        warnings.push("appName: the app has no Menu.Header.ToolBar.BarTitle.Text (the starter's menu title) to write it in.");
      }
    }
    var pick = function (p) {
      return { primary: p.colors.primary, background: p.background, surface: p.surface, text: p.text, muted: p.muted, toolbar: p.toolbar, toolbarText: p.toolbarText };
    };
    return {
      style: "AppTheme " + status,
      preset: t.preset,
      mode: t.mode,
      modeAction: modeStatus,
      tokens: { brand: t.brand, toolbar: t.toolbar, density: t.density, radius: t.radius, font: t.font, light: pick(palettes.light), dark: pick(palettes.dark) },
      contrast: palettes.contrast,
      menuTitle: menuTitle,
      warnings: warnings
    };
  };

  G.ngxThemeApply = function (args) {
    var tool = "ngx-theme-apply";
    var projectDbo = projectOf(args.project, tool);
    var projectName = String(projectDbo.getName());
    var spec = {};
    ["preset", "primary", "secondary", "tertiary", "background", "surface", "text", "radius", "density", "toolbar", "mode", "font", "appName"].forEach(function (k) {
      if (args[k] !== undefined && args[k] !== null && str(args[k]) !== "") {
        spec[k] = args[k];
      }
    });
    if (args.theme !== undefined && str(args.theme).length) {
      var extra = parseJson(args.theme, "theme", "object") || {};
      Object.keys(extra).forEach(function (k) {
        if (spec[k] === undefined) {
          spec[k] = extra[k];
        }
      });
    }
    var app = null;
    try {
      app = projectDbo.getMobileApplication().getApplicationComponent();
    } catch (_noApp) {
      app = null;
    }
    if (app == null) {
      invalid(tool, [projectName + " has no NGX application (start from template_ngxBuilderIonic with marketplace-import)."]);
    }
    var session = new Session(tool, projectDbo);
    var applied = G.applyTheme(projectDbo, app, spec, session, tool);
    var finish = session.finish(app);
    applied.status = "ok";
    applied.project = projectName;
    applied.saved = finish.saved;
    applied.mobileBuilder = finish.mobileBuilder;
    applied.warnings = applied.warnings.concat(session.warnings);
    applied.presets = Object.keys(PRESETS).map(function (k) { return k + ": " + PRESETS[k].description; });
    applied.next = "mobile-builder-open({project:\"" + projectName + "\", stateOnly:true}) to wait for the build, then look at a page in light and in dark " +
      "(browser-verify reports designSuggestions).";
    return applied;
  };
})();
