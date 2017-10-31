var AMDDefineDependency = require('webpack/lib/dependencies/AMDDefineDependency');
var ConstDependency = require('webpack/lib/dependencies/ConstDependency');
var ContextDependency = require('webpack/lib/dependencies/ContextDependency');

var cachePrefix = require('./util').cachePrefix;

var HardContextDependency = require('./dependencies').HardContextDependency;
var HardModuleDependency = require('./dependencies').HardModuleDependency;
var HardNullDependency = require('./dependencies').HardNullDependency;

function flattenPrototype(obj) {
  if (typeof obj === 'string') {
    return obj;
  }
  var copy = {};
  for (var key in obj) {
    copy[key] = obj[key];
  }
  return copy;
}

function HardBasicDependencyPlugin() {}

HardBasicDependencyPlugin.prototype.apply = function(compiler) {
  compiler.plugin('--hard-source-freeze-dependency', function(frozen, dependency, extra) {
    if (dependency instanceof ContextDependency) {
      return {
        type: 'ContextDependency',
        critical: dependency.critical,
        request: dependency.request,
        recursive: dependency.recursive,
        regExp: dependency.regExp ? dependency.regExp.source : false,
        async: dependency.async,
        optional: dependency.optional,
      };
    }
    else if (
      dependency instanceof ConstDependency ||
      dependency instanceof AMDDefineDependency
    ) {
      return {
        type: 'NullDependency',
      };
    }
    else if (!frozen && dependency.request) {
      return {
        type: 'ModuleDependency',
        request: dependency.request,
        optional: dependency.optional,
      };
    }

    return frozen;
  });

  compiler.plugin('--hard-source-after-freeze-dependency', function(frozen, dependency, extra) {
    if (frozen && dependency.loc) {
      frozen.loc = flattenPrototype(dependency.loc);
    }

    return frozen;
  });

  var walkDependencyBlock = function(block, callback) {
    block.dependencies.forEach(callback);
    block.variables.forEach(function(variable) {
      variable.dependencies.forEach(callback);
    })
    block.blocks.forEach(function(block) {
      walkDependencyBlock(block, callback);
    });
  };

  compiler.plugin('compilation', function(compilation) {
    compilation.plugin('seal', function() {
      compilation.modules.forEach(function(module) {
        walkDependencyBlock(module, function(dep) {
          if (dep.module) {
            dep.__hardSource_resolvedModuleIdentifier = dep.module.identifier();
          }
        });
      });
    });
  });

  compiler.plugin('--hard-source-after-freeze-dependency', function(frozen, dependency, extra) {
    if (!frozen) {return frozen;}

    var module = extra.module;
    var compilation = extra.compilation;
    var identifierPrefix = cachePrefix(compilation);

    if (identifierPrefix !== null) {
      // The identifier this dependency should resolve to.
      var _resolvedModuleIdentifier =
        dependency.module && dependency.__hardSource_resolvedModuleIdentifier;
      // An identifier to dereference a dependency under a module to some per
      // dependency value
      var _inContextDependencyIdentifier = module && JSON.stringify([module.context, frozen]);
      // An identifier from the dependency to the cached resolution information
      // for building a module.
      var _moduleResolveCacheId = module && frozen.request && JSON.stringify([identifierPrefix, module.context, frozen.request]);
      frozen._resolvedModuleIdentifier = _resolvedModuleIdentifier;
      frozen._inContextDependencyIdentifier = _inContextDependencyIdentifier;
      frozen._moduleResolveCacheId = _moduleResolveCacheId;
    }

    return frozen;
  });

  compiler.plugin('--hard-source-thaw-dependency', function(dependency, frozen, extra) {
    if (frozen.type === 'ContextDependency') {
      dependency = new HardContextDependency(frozen.request, frozen.recursive, frozen.regExp ? new RegExp(frozen.regExp) : false);
      dependency.critical = frozen.critical;
      dependency.async = frozen.async;
      if (frozen.optional) {
        dependency.optional = true;
      }
      return dependency;
    }
    else if (frozen.type === 'NullDependency') {
      return new HardNullDependency();
    }
    else if (frozen.type === 'ModuleDependency') {
      dependency = new HardModuleDependency(frozen.request);
      if (frozen.optional) {
        dependency.optional = true;
      }
      return dependency;
    }

    return dependency;
  });

  compiler.plugin('--hard-source-after-thaw-dependency', function(dependency, frozen, extra) {
    if (dependency && frozen.loc) {
      dependency.loc = frozen.loc;
    }

    return dependency;
  });
};

module.exports = HardBasicDependencyPlugin;
