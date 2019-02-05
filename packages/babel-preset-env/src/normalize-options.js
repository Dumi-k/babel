//@flow

import { coerce } from "semver";
import invariant from "invariant";
import corejs2Polyfills from "../data/corejs2-built-ins.json";
import { defaultWebIncludes } from "./defaults";
import corejs3Polyfills from "core-js-compat/data";
import moduleTransformations from "./module-transformations";
import { isBrowsersQueryValid } from "./targets-parser";
import { getValues, findSuggestion } from "./utils";
import pluginsList from "../data/plugins.json";
import { TopLevelOptions, ModulesOption, UseBuiltInsOption } from "./options";
import type { Targets, Options, ModuleOption, BuiltInsOption } from "./types";

const validateTopLevelOptions = (options: Options) => {
  for (const option in options) {
    if (!TopLevelOptions[option]) {
      const validOptions = getValues(TopLevelOptions);
      throw new Error(
        `Invalid Option: ${option} is not a valid top-level option.
        Maybe you meant to use '${findSuggestion(validOptions, option)}'?`,
      );
    }
  }
};

const allPluginsList = [
  ...Object.keys(pluginsList),
  ...Object.keys(moduleTransformations).map(m => moduleTransformations[m]),
];

const validIncludesAndExcludesWithoutCoreJS = new Set(allPluginsList);

const validIncludesAndExcludesWithCoreJS2 = new Set([
  ...allPluginsList,
  ...Object.keys(corejs2Polyfills),
  ...defaultWebIncludes,
]);

const validIncludesAndExcludesWithCoreJS3 = new Set([
  ...allPluginsList,
  ...Object.keys(corejs3Polyfills),
]);

const pluginToRegExp = (plugin: any): ?RegExp => {
  if (plugin instanceof RegExp) return plugin;
  try {
    return new RegExp(`^${normalizePluginName(plugin)}$`);
  } catch (e) {
    return null;
  }
};

const selectPlugins = (regexp: ?RegExp, corejs: number): Array<string> =>
  Array.from(
    corejs
      ? corejs == 2
        ? validIncludesAndExcludesWithCoreJS2
        : validIncludesAndExcludesWithCoreJS3
      : validIncludesAndExcludesWithoutCoreJS,
  ).filter(item => regexp instanceof RegExp && regexp.test(item));

const flatten = array => [].concat(...array);

const expandIncludesAndExcludes = (
  plugins: Array<string | RegExp> = [],
  type: string,
  corejs: number,
): Array<string> => {
  if (plugins.length === 0) return [];

  const selectedPlugins = plugins.map(plugin =>
    selectPlugins(pluginToRegExp(plugin), corejs),
  );
  const invalidRegExpList = plugins.filter(
    (p, i) => selectedPlugins[i].length === 0,
  );

  invariant(
    invalidRegExpList.length === 0,
    `Invalid Option: The plugins/built-ins '${invalidRegExpList.join(
      ", ",
    )}' passed to the '${type}' option are not
    valid. Please check data/[plugin-features|built-in-features].js in babel-preset-env`,
  );

  return flatten(selectedPlugins);
};

export const normalizePluginName = (plugin: string): string =>
  plugin.replace(/^(@babel\/|babel-)(plugin-)?/, "");

export const checkDuplicateIncludeExcludes = (
  include: Array<string> = [],
  exclude: Array<string> = [],
): void => {
  const duplicates = include.filter(opt => exclude.indexOf(opt) >= 0);

  invariant(
    duplicates.length === 0,
    `Invalid Option: The plugins/built-ins '${duplicates.join(
      ", ",
    )}' were found in both the "include" and
    "exclude" options.`,
  );
};

const normalizeTargets = (targets: any): Targets => {
  // TODO: Allow to use only query or strings as a targets from next breaking change.
  if (isBrowsersQueryValid(targets)) {
    return { browsers: targets };
  }
  return {
    ...targets,
  };
};

export const validateConfigPathOption = (
  configPath: string = process.cwd(),
) => {
  invariant(
    typeof configPath === "string",
    `Invalid Option: The configPath option '${configPath}' is invalid, only strings are allowed.`,
  );
  return configPath;
};

export const validateBoolOption = (
  name: string,
  value: ?boolean,
  defaultValue: boolean,
) => {
  if (typeof value === "undefined") {
    value = defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Preset env: '${name}' option must be a boolean.`);
  }

  return value;
};

export const validateIgnoreBrowserslistConfig = (
  ignoreBrowserslistConfig: boolean,
) =>
  validateBoolOption(
    TopLevelOptions.ignoreBrowserslistConfig,
    ignoreBrowserslistConfig,
    false,
  );

export const validateModulesOption = (
  modulesOpt: ModuleOption = ModulesOption.auto,
) => {
  invariant(
    ModulesOption[modulesOpt] ||
      ModulesOption[modulesOpt] === ModulesOption.false,
    `Invalid Option: The 'modules' option must be one of \n` +
      ` - 'false' to indicate no module processing\n` +
      ` - a specific module type: 'commonjs', 'amd', 'umd', 'systemjs'` +
      ` - 'auto' (default) which will automatically select 'false' if the current\n` +
      `   process is known to support ES module syntax, or "commonjs" otherwise\n`,
  );

  return modulesOpt;
};

export const validateUseBuiltInsOption = (
  builtInsOpt: BuiltInsOption = false,
): BuiltInsOption => {
  invariant(
    UseBuiltInsOption[builtInsOpt] ||
      UseBuiltInsOption[builtInsOpt] === UseBuiltInsOption.false,
    `Invalid Option: The 'useBuiltIns' option must be either
    'false' (default) to indicate no polyfill,
    '"entry"' to indicate replacing the entry polyfill, or
    '"usage"' to import only used polyfills per file`,
  );

  return builtInsOpt;
};

export default function normalizeOptions(opts: Options) {
  validateTopLevelOptions(opts);

  let corejs = null;
  if (opts.useBuiltIns && opts.corejs === undefined) {
    corejs = coerce("2");
    console.log(
      "\nWith `useBuiltIns` option, required direct setting of `corejs` option\n",
    );
  } else if (["string", "number"].includes(typeof opts.corejs)) {
    corejs = coerce(String(opts.corejs));
  }

  if (opts.useBuiltIns && (!corejs || corejs.major < 2 || corejs.major > 3)) {
    throw new RangeError("Supported only core-js@2 and core-js@3.");
  }

  const include = expandIncludesAndExcludes(
    opts.include,
    TopLevelOptions.include,
    corejs && corejs.major,
  );
  const exclude = expandIncludesAndExcludes(
    opts.exclude,
    TopLevelOptions.exclude,
    corejs && corejs.major,
  );

  checkDuplicateIncludeExcludes(include, exclude);

  return {
    configPath: validateConfigPathOption(opts.configPath),
    debug: validateBoolOption(TopLevelOptions.debug, opts.debug, false),
    include,
    exclude,
    forceAllTransforms: validateBoolOption(
      TopLevelOptions.forceAllTransforms,
      opts.forceAllTransforms,
      false,
    ),
    ignoreBrowserslistConfig: validateIgnoreBrowserslistConfig(
      opts.ignoreBrowserslistConfig,
    ),
    loose: validateBoolOption(TopLevelOptions.loose, opts.loose, false),
    modules: validateModulesOption(opts.modules),
    shippedProposals: validateBoolOption(
      TopLevelOptions.shippedProposals,
      opts.shippedProposals,
      false,
    ),
    spec: validateBoolOption(TopLevelOptions.spec, opts.spec, false),
    targets: normalizeTargets(opts.targets),
    useBuiltIns: validateUseBuiltInsOption(opts.useBuiltIns),
    corejs,
  };
}
