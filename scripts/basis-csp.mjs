import { createHash } from 'node:crypto';

// Three r181's embind glue uses Function() to build synchronous invokers.
// Replace the generated dispatch functions with equivalent plain closures;
// the matching WASM binary is unchanged. Keep strict Content Security Policies intact.
// Upstream tracking: https://github.com/mrdoob/three.js/issues/34389
export function cspSafeBasis(source) {
  const expected = '8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1';
  if (createHash('sha256').update(source).digest('hex') !== expected) {
    throw Error('Basis transcoder changed. Review its CSP compatibility before updating the pinned glue adapter.');
  }
  const start = source.indexOf('function craftInvokerFunction(');
  const end = source.indexOf('var __embind_register_class_constructor=', start);
  if (start < 0 || end < 0) throw Error('Basis invoker boundaries changed');
  const patched = source.slice(0, start) + `
function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc, isAsync) {
  if (isAsync || argTypes.length < 2) throwBindingError('Unsupported Basis invoker signature');
  var method = argTypes[1] !== null && classType !== null;
  var stackNeeded = usesDestructorStack(argTypes);
  var returns = argTypes[0].name !== 'void';
  return createNamedFunction(humanName, function() {
    if (arguments.length !== argTypes.length - 2) throwBindingError('Invalid argument count for ' + humanName);
    var destructors = stackNeeded ? [] : null;
    var wired = [cppTargetFunc];
    if (method) wired.push(argTypes[1].toWireType(destructors, this));
    for (var i = 0; i < arguments.length; i++) wired.push(argTypes[i + 2].toWireType(destructors, arguments[i]));
    var result = cppInvokerFunc.apply(null, wired);
    if (stackNeeded) runDestructors(destructors);
    else for (var i = method ? 1 : 2; i < argTypes.length; i++) {
      if (argTypes[i].destructorFunction !== null) argTypes[i].destructorFunction(wired[i - (method ? 0 : 1)]);
    }
    return returns ? argTypes[0].fromWireType(result) : undefined;
  });
}
` + source.slice(end);
  const callerStart = patched.indexOf('var __emval_get_method_caller=');
  const callerEnd = patched.indexOf('var __emval_get_module_property=', callerStart);
  if (callerStart < 0 || callerEnd < 0) throw Error('Basis method caller boundaries changed');
  return patched.slice(0, callerStart) + `
var __emval_get_method_caller = (argCount, argTypes, kind) => {
  var types = emval_lookupTypes(argCount, argTypes);
  var returnType = types.shift();
  if (kind !== 0 && kind !== 1) throwBindingError('Unsupported Basis method caller');
  return emval_addMethodCaller(function(obj, func, destructorsRef, pointer) {
    var args = [], offset = 0;
    for (var type of types) {
      args.push(type.readValueFromPointer(pointer + offset));
      offset += type.argPackAdvance;
    }
    var result = kind === 1 ? Reflect.construct(func, args) : func.apply(obj, args);
    if (!returnType.isVoid) return emval_returnValue(returnType, destructorsRef, result);
  });
};
` + patched.slice(callerEnd);
}
