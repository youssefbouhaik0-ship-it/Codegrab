import { cleanCode } from './code-cleanup.js';

// ── Public types ─────────────────────────────────────────────────────────────

export interface AIAnalysisResult {
  cleaned_code: string;
  language: string;
  simple_explanation: string;
  placement_warning: string | null;
  missing_context: string[];
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Analyse raw OCR text like a friendly coding mentor.
 * Returns a structured JSON-serialisable object with cleaned code,
 * language guess, beginner explanation, placement warning, and
 * a list of variables/functions/imports used but not defined in the snippet.
 *
 * Runs 100 % locally — no API calls.
 */
export function analyzeOcrCode(rawOcrText: string): AIAnalysisResult {
  const { code, language, lineCount } = cleanCode(rawOcrText);

  return {
    cleaned_code: code,
    language: prettifyLang(language),
    simple_explanation: generateExplanation(code, language, lineCount),
    placement_warning: generatePlacementWarning(code, language),
    missing_context: detectMissingContext(code, language),
  };
}

// ── Language label ───────────────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  cpp: 'C++',
  go: 'Go',
  rust: 'Rust',
  css: 'CSS',
  text: 'Plain Text',
};

function prettifyLang(lang: string): string {
  return LANG_LABELS[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}

// ── Explanation generator ────────────────────────────────────────────────────

function generateExplanation(code: string, lang: string, lineCount: number): string {
  const parts: string[] = [];

  // ── React component / hook patterns ────────────────────────────────────
  const reactComponent = code.match(
    /(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(/,
  );
  if (reactComponent) {
    parts.push(
      `This defines a React component called "${reactComponent[1]}".`,
    );
  }

  const useHook = code.match(/\bconst\s+\[(\w+),\s*set\w+\]\s*=\s*use(\w+)\(/);
  if (useHook) {
    parts.push(
      `It uses the React \`use${useHook[2]}\` hook to manage the "${useHook[1]}" value.`,
    );
  }

  if (parts.length > 0) return parts.join(' ');

  // ── Function definition ────────────────────────────────────────────────
  if (lang === 'python') {
    const fn = code.match(/def\s+(\w+)\s*\(([^)]*)\)/);
    if (fn) {
      const args = fn[2].trim();
      return args
        ? `This defines a Python function called "${fn[1]}" that takes ${describeArgs(args)}.`
        : `This defines a Python function called "${fn[1]}" with no parameters.`;
    }
    const cls = code.match(/class\s+(\w+)/);
    if (cls) return `This defines a Python class called "${cls[1]}".`;
  }

  if (lang === 'javascript' || lang === 'typescript') {
    const arrowFn = code.match(
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/,
    );
    if (arrowFn)
      return `This defines an arrow function called "${arrowFn[1]}".`;

    const namedFn = code.match(
      /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
    );
    if (namedFn) {
      const args = namedFn[2].trim();
      return args
        ? `This defines a function called "${namedFn[1]}" that takes ${describeArgs(args)}.`
        : `This defines a function called "${namedFn[1]}" with no parameters.`;
    }
  }

  if (lang === 'java') {
    const method = code.match(
      /(?:public|private|protected)\s+(?:static\s+)?(\w+)\s+(\w+)\s*\(/,
    );
    if (method) return `This defines a Java method called "${method[2]}" that returns ${method[1]}.`;
  }

  if (lang === 'go') {
    const fn = code.match(/func\s+(\w+)\s*\(/);
    if (fn) return `This defines a Go function called "${fn[1]}".`;
  }

  if (lang === 'rust') {
    const fn = code.match(/fn\s+(\w+)\s*\(/);
    if (fn) return `This defines a Rust function called "${fn[1]}".`;
  }

  // ── Import / require block ─────────────────────────────────────────────
  if (/^(?:import |from |const\s+\w+\s*=\s*require\()/.test(code.trimStart())) {
    return 'This is a block of import statements — it loads external libraries or modules the code needs.';
  }

  // ── API / SDK call patterns ────────────────────────────────────────────
  const apiCall = code.match(/\b(\w+)\.(\w+)\s*\(/m);
  if (apiCall) {
    const [, obj, method] = apiCall;
    // Detect common SDK patterns
    if (/^(client|api|sdk|conn|db|session|http)$/i.test(obj)) {
      return `This calls ${obj}.${method}() — it makes an API or service call. Make sure "${obj}" is properly initialized above this code.`;
    }
    if (/create|send|post|get|put|delete|fetch|request|query/i.test(method)) {
      return `This calls ${obj}.${method}() — it appears to make a network or database request.`;
    }
  }

  // ── Script / top-level code ────────────────────────────────────────────
  if (lang === 'python' && /\b(input|print)\s*\(/.test(code)) {
    return `This is a ${lineCount}-line Python script that interacts with the user via input/output.`;
  }

  // ── Class definition (generic) ─────────────────────────────────────────
  const genericClass = code.match(/class\s+(\w+)/);
  if (genericClass)
    return `This defines a class called "${genericClass[1]}".`;

  // ── Generic fallback ───────────────────────────────────────────────────
  return `This is a ${lineCount}-line snippet of ${prettifyLang(lang)} code.`;
}

function describeArgs(args: string): string {
  const names = args.split(',').map((a) => a.trim().split(/[=:]/)[0].trim());
  if (names.length === 1) return `one parameter ("${names[0]}")`;
  if (names.length <= 3) return `parameters ${names.map((n) => `"${n}"`).join(', ')}`;
  return `${names.length} parameters`;
}

// ── Placement warning ────────────────────────────────────────────────────────

function generatePlacementWarning(code: string, lang: string): string | null {
  // React hooks must be inside a component, before the return
  if (/\buse[A-Z]\w*\s*\(/.test(code) && (lang === 'javascript' || lang === 'typescript')) {
    return 'This uses a React hook — place it inside your component function, before the return statement.';
  }

  // Methods that reference `this` → probably inside a class
  if (/\bthis\./.test(code) && !code.match(/class\s+\w+/)) {
    return 'This code references "this", so it likely belongs inside a class method.';
  }

  // Python indented block without def/class → probably inside a function
  if (lang === 'python') {
    const lines = code.split('\n');
    const allIndented = lines.every(
      (l) => l.startsWith('    ') || l.startsWith('\t') || l.trim() === '',
    );
    if (allIndented && !code.match(/^(def |class )/m)) {
      return 'This code is indented — make sure it goes inside the correct function or block. Watch your indentation!';
    }
  }

  // Express/Koa route handlers
  if (/\b(app|router)\.(get|post|put|delete|patch)\s*\(/.test(code)) {
    return 'This is a route handler — place it after your Express/Koa app is initialised but before app.listen().';
  }

  // useEffect / lifecycle
  if (/\buseEffect\s*\(/.test(code)) {
    return 'This is a useEffect hook — place it inside your component, after your state declarations but before the return.';
  }

  return null;
}

// ── Missing context detector ─────────────────────────────────────────────────

/**
 * Detect identifiers used but not defined in the snippet.
 *
 * STRICT mode: only flag when we are highly confident something is truly
 * missing. We'd rather show zero warnings than a wall of false positives.
 *
 * Rules:
 *   - Ignore all builtins, common libraries, short/generic variable names
 *   - Ignore anything called as a method (obj.foo() — foo is from obj, not missing)
 *   - Ignore string literals and comments
 *   - Require a standalone call/access to flag (not inside a string or comment)
 *   - Only flag free-standing function calls and bare identifiers that are
 *     clearly undefined and not plausibly a local/parameter
 */
function detectMissingContext(code: string, lang: string): string[] {
  const missing: string[] = [];
  const lines = code.split('\n');

  // ── Step 1: Collect all identifiers defined in the snippet ────────────

  const defined = new Set<string>();

  for (const line of lines) {
    // JS/TS const/let/var
    const varMatch = line.match(/(?:const|let|var)\s+(?:\{[^}]+\}|(\w+))/);
    if (varMatch?.[1]) defined.add(varMatch[1]);
    // Destructured
    const destructured = line.match(/(?:const|let|var)\s+\{([^}]+)\}/);
    if (destructured) {
      destructured[1].split(',').forEach((v) => {
        const name = v.trim().split(/[:\s]/)[0];
        if (name) defined.add(name);
      });
    }
    // Array destructuring
    const arrDestructured = line.match(/(?:const|let|var)\s+\[([^\]]+)\]/);
    if (arrDestructured) {
      arrDestructured[1].split(',').forEach((v) => {
        const name = v.trim();
        if (name && /^\w+$/.test(name)) defined.add(name);
      });
    }
    // Function defs
    const fnMatch = line.match(/function\s+(\w+)/);
    if (fnMatch) defined.add(fnMatch[1]);
    // Arrow function assignments
    const arrowMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/);
    if (arrowMatch) defined.add(arrowMatch[1]);
    // Python def/class
    const pyFn = line.match(/def\s+(\w+)/);
    if (pyFn) defined.add(pyFn[1]);
    const pyCls = line.match(/class\s+(\w+)/);
    if (pyCls) defined.add(pyCls[1]);
    // Go func
    const goFn = line.match(/func\s+(\w+)/);
    if (goFn) defined.add(goFn[1]);
    // Rust fn / let
    const rustFn = line.match(/fn\s+(\w+)/);
    if (rustFn) defined.add(rustFn[1]);
    const rustLet = line.match(/let\s+(?:mut\s+)?(\w+)/);
    if (rustLet) defined.add(rustLet[1]);
    // Parameters (simple)
    const params = line.match(/(?:def|function|func|fn)\s+\w+\s*\(([^)]*)\)/);
    if (params) {
      params[1].split(',').forEach((p) => {
        const name = p.trim().split(/[=:\s]/)[0];
        if (name && /^\w+$/.test(name)) defined.add(name);
      });
    }
    // For-loop variables
    const forOf = line.match(/for\s*\(\s*(?:const|let|var)\s+(\w+)/);
    if (forOf) defined.add(forOf[1]);
    const forIn = line.match(/for\s*\(\s*(?:const|let|var)\s+\[?(\w+)/);
    if (forIn) defined.add(forIn[1]);
    const pyFor = line.match(/for\s+(\w+)\s+in\b/);
    if (pyFor) defined.add(pyFor[1]);
    // Python assignments: name = expr (but not comparisons ==)
    const pyAssign = line.match(/^\s*(\w+)\s*=[^=]/);
    if (pyAssign && lang === 'python') defined.add(pyAssign[1]);
    // JS assignments (not inside functions)
    const jsAssign = line.match(/^\s*(\w+)\s*=[^=]/);
    if (jsAssign && (lang === 'javascript' || lang === 'typescript')) defined.add(jsAssign[1]);

    // import X from / import { X }
    const importDefault = line.match(/import\s+(\w+)\s+from/);
    if (importDefault) defined.add(importDefault[1]);
    const importNamed = line.match(/import\s+\{([^}]+)\}/);
    if (importNamed) {
      importNamed[1].split(',').forEach((v) => {
        const alias = v.trim().split(/\s+as\s+/);
        defined.add((alias[1] || alias[0]).trim());
      });
    }
    // Python import X / from X import Y
    const pyImport = line.match(/^\s*import\s+(\w+)/);
    if (pyImport) defined.add(pyImport[1]);
    const pyFromImport = line.match(/^\s*from\s+\S+\s+import\s+(.+)/);
    if (pyFromImport) {
      pyFromImport[1].split(',').forEach((v) => {
        const alias = v.trim().split(/\s+as\s+/);
        defined.add((alias[1] || alias[0]).trim());
      });
    }
    // Catch/except variable
    const catchVar = line.match(/catch\s*\(\s*(\w+)/);
    if (catchVar) defined.add(catchVar[1]);
    const exceptVar = line.match(/except\s+\w+\s+as\s+(\w+)/);
    if (exceptVar) defined.add(exceptVar[1]);
  }

  // ── Step 2: Comprehensive builtins + ignore list ──────────────────────

  const BUILTINS = new Set([
    // JS globals
    'console', 'window', 'document', 'Math', 'Date', 'JSON', 'Array',
    'Object', 'String', 'Number', 'Boolean', 'Promise', 'Map', 'Set',
    'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Intl', 'BigInt',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
    'decodeURIComponent', 'encodeURI', 'decodeURI', 'atob', 'btoa',
    'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
    'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
    'URIError', 'EvalError', 'AggregateError',
    'RegExp', 'Symbol', 'ArrayBuffer', 'SharedArrayBuffer',
    'DataView', 'Float32Array', 'Float64Array',
    'Int8Array', 'Int16Array', 'Int32Array',
    'Uint8Array', 'Uint16Array', 'Uint32Array', 'Uint8ClampedArray',
    'process', 'module', 'exports', 'require', 'global', 'globalThis',
    'Buffer', '__dirname', '__filename',
    'fetch', 'Request', 'Response', 'Headers', 'URL', 'URLSearchParams',
    'AbortController', 'AbortSignal', 'FormData', 'Blob', 'File',
    'TextEncoder', 'TextDecoder', 'ReadableStream', 'WritableStream',
    'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
    'alert', 'confirm', 'prompt', 'event', 'this', 'arguments', 'super',
    'performance', 'crypto', 'structuredClone',
    'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
    'EventTarget', 'Event', 'CustomEvent', 'HTMLElement', 'Element',
    'Node', 'NodeList', 'DocumentFragment',
    // Python builtins
    'print', 'len', 'range', 'int', 'str', 'float', 'list', 'dict',
    'tuple', 'set', 'frozenset', 'bool', 'type', 'input', 'open', 'super',
    'self', 'cls', 'None', 'True', 'False', 'isinstance', 'issubclass',
    'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed',
    'max', 'min', 'sum', 'abs', 'all', 'any', 'next', 'iter',
    'hasattr', 'getattr', 'setattr', 'delattr', 'vars', 'dir',
    'help', 'id', 'hash', 'callable', 'property', 'staticmethod',
    'classmethod', 'round', 'hex', 'oct', 'bin', 'chr', 'ord',
    'repr', 'format', 'bytes', 'bytearray', 'memoryview',
    'object', 'complex', 'divmod', 'pow', 'exec', 'eval', 'compile',
    'globals', 'locals', 'breakpoint', 'exit', 'quit',
    'Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError',
    'IndexError', 'AttributeError', 'NameError', 'ImportError',
    'ModuleNotFoundError', 'OSError', 'IOError', 'FileNotFoundError',
    'FileExistsError', 'PermissionError', 'IsADirectoryError',
    'NotADirectoryError', 'ConnectionError', 'TimeoutError',
    'RuntimeError', 'StopIteration', 'StopAsyncIteration',
    'GeneratorExit', 'SystemExit', 'KeyboardInterrupt',
    'AssertionError', 'NotImplementedError', 'ZeroDivisionError',
    'OverflowError', 'RecursionError', 'UnicodeError',
    'UnicodeDecodeError', 'UnicodeEncodeError',
    // Common Python stdlib + third-party (reduce false positives)
    'openai', 'OpenAI', 'requests', 'flask', 'Flask', 'django',
    'pandas', 'pd', 'numpy', 'np', 'matplotlib', 'plt', 'scipy',
    'torch', 'nn', 'optim', 'tensorflow', 'tf', 'keras',
    'sklearn', 'cv2', 'PIL', 'Image', 'FastAPI', 'fastapi',
    'pydantic', 'BaseModel', 'Field', 'SQLAlchemy', 'sqlalchemy',
    'celery', 'redis', 'boto3', 'botocore', 'httpx', 'aiohttp',
    'os', 'sys', 'json', 'csv', 'datetime', 'time', 'math',
    're', 'pathlib', 'Path', 'logging', 'argparse', 'typing',
    'collections', 'itertools', 'functools', 'subprocess',
    'abc', 'copy', 'io', 'threading', 'asyncio', 'multiprocessing',
    'unittest', 'pytest', 'mock', 'dataclasses', 'dataclass',
    'contextlib', 'warnings', 'traceback', 'inspect', 'textwrap',
    'random', 'secrets', 'hashlib', 'hmac', 'base64',
    'struct', 'socket', 'http', 'urllib', 'email',
    'shutil', 'tempfile', 'glob', 'fnmatch',
    // Common JS/TS libraries
    'express', 'axios', 'lodash', 'moment', 'dayjs', 'fs', 'path',
    'http', 'https', 'crypto', 'util', 'stream', 'child_process',
    'zlib', 'os', 'net', 'dns', 'tls', 'cluster', 'worker_threads',
    'EventEmitter', 'events', 'readline', 'vm',
    'cheerio', 'puppeteer', 'playwright', 'prisma', 'mongoose',
    'sequelize', 'knex', 'typeorm', 'drizzle',
    'zod', 'yup', 'joi', 'ajv',
    'jest', 'describe', 'it', 'test', 'expect', 'beforeEach',
    'afterEach', 'beforeAll', 'afterAll', 'vi', 'cy',
    'supertest', 'sinon', 'chai', 'assert',
    // React / Next.js
    'React', 'useState', 'useEffect', 'useRef', 'useMemo',
    'useCallback', 'useContext', 'useReducer', 'useLayoutEffect',
    'useImperativeHandle', 'useDebugValue', 'useDeferredValue',
    'useTransition', 'useId', 'useSyncExternalStore',
    'Component', 'PureComponent', 'Fragment', 'Suspense', 'lazy',
    'createContext', 'forwardRef', 'memo', 'createRef',
    'createPortal', 'flushSync', 'startTransition',
    'NextRequest', 'NextResponse', 'useRouter', 'usePathname',
    'useSearchParams', 'useParams', 'Link', 'Image', 'Head',
    // Vue
    'ref', 'reactive', 'computed', 'watch', 'watchEffect',
    'onMounted', 'onUnmounted', 'defineComponent', 'defineProps',
    'defineEmits', 'defineExpose', 'nextTick', 'toRef', 'toRefs',
    // Java
    'System', 'Scanner', 'ArrayList', 'HashMap', 'LinkedList',
    'HashSet', 'TreeMap', 'TreeSet', 'Collections', 'Arrays',
    'Files', 'Paths', 'Thread', 'Runnable', 'Callable', 'Future',
    'Optional', 'Stream', 'Collectors', 'StringBuilder',
    'Integer', 'Long', 'Double', 'Character', 'Byte', 'Short',
    'Float', 'Void', 'Class', 'Method', 'Field',
    // Go
    'fmt', 'log', 'errors', 'context', 'sync', 'io', 'bufio',
    'strings', 'strconv', 'bytes', 'encoding', 'net',
    // Rust
    'Vec', 'Box', 'Rc', 'Arc', 'Cell', 'RefCell', 'Mutex',
    'Option', 'Some', 'Ok', 'Err', 'Result', 'panic',
    'println', 'eprintln', 'format', 'write', 'writeln',
    'String', 'str', 'HashMap', 'HashSet', 'BTreeMap', 'BTreeSet',
    // Common short / generic identifiers (almost never worth flagging)
    'app', 'e', 'i', 'j', 'k', 'n', 'x', 'y', 'z', 'v', 's', 'c',
    'f', 'r', 'p', 'q', 't', 'w', 'h', 'd', 'a', 'b', 'm', 'l',
    'el', 'ev', 'ex', 'op', 'id', 'ok', 'on', 'to',
    'err', 'res', 'req', 'ret', 'val', 'key', 'idx', 'tmp', 'buf',
    'acc', 'cur', 'prev', 'sum', 'cnt', 'len', 'pos', 'ptr', 'ref',
    'src', 'dst', 'out', 'opt', 'cfg', 'env', 'obj', 'arr', 'str',
    'num', 'col', 'row', 'min', 'max', 'avg', 'ctx',
    'next', 'args', 'kwargs', 'cb', 'fn', 'evt', 'cmd', 'dir',
    'msg', 'data', 'result', 'response', 'request', 'config',
    'client', 'conn', 'db', 'session', 'user', 'item', 'node',
    'state', 'props', 'params', 'query', 'body', 'headers',
    'options', 'settings', 'payload', 'output', 'input',
    'handler', 'callback', 'listener', 'emitter', 'stream',
    'reader', 'writer', 'parser', 'builder', 'factory',
    'logger', 'timer', 'counter', 'cache', 'store', 'queue',
    'router', 'route', 'server', 'socket', 'port', 'host',
    'model', 'schema', 'record', 'entry', 'field', 'value',
    'name', 'type', 'kind', 'mode', 'level', 'status', 'code',
    'index', 'count', 'size', 'length', 'offset', 'limit',
    'start', 'end', 'begin', 'stop', 'step', 'delta',
    'width', 'height', 'depth', 'left', 'right', 'top', 'bottom',
    'parent', 'child', 'children', 'root', 'head', 'tail',
    'text', 'label', 'title', 'description', 'content', 'message',
    'error', 'warning', 'info', 'debug', 'trace',
  ]);

  // ── Step 3: Strip strings and comments to avoid false matches ─────────

  let stripped = code;
  // Remove string literals (single/double/template, non-greedy)
  stripped = stripped.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '""');
  // Remove single-line comments
  stripped = stripped.replace(/\/\/.*$/gm, '');
  stripped = stripped.replace(/#.*$/gm, '');
  // Remove multi-line comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');

  // ── Step 4: Find standalone function calls (NOT method calls) ─────────

  // Match name( but NOT preceded by . (which means it's a method call on an object)
  const callPattern = /(?<!\.)(?<![.\w])([a-zA-Z_]\w*)\s*\(/g;
  let callMatch: RegExpExecArray | null;
  const calledFunctions = new Set<string>();
  while ((callMatch = callPattern.exec(stripped)) !== null) {
    const name = callMatch[1];
    if (
      !defined.has(name) &&
      !BUILTINS.has(name) &&
      !name.startsWith('set') &&          // React setState setters
      !name.startsWith('use') &&          // React hooks (custom or standard)
      !name.startsWith('get') &&          // Common getters
      !name.startsWith('is') &&           // Common predicates
      !name.startsWith('has') &&          // Common checks
      !name.startsWith('on') &&           // Event handlers
      !name.startsWith('handle') &&       // Event handlers
      !name.startsWith('_') &&            // Private/internal
      !/^[A-Z]{2,}/.test(name) &&         // ALL_CAPS constants
      !/^[A-Z]\w*$/.test(name) &&         // PascalCase (likely class/component — too noisy to flag)
      name.length > 2                     // Skip very short names (a, fn, cb, etc.)
    ) {
      calledFunctions.add(name);
    }
  }

  // ── Step 5: Only flag missing items we're very confident about ────────

  // JSX components that are used but not imported (these ARE worth flagging)
  if (lang === 'javascript' || lang === 'typescript') {
    const jsxPattern = /<([A-Z]\w+)/g;
    let jsxMatch: RegExpExecArray | null;
    while ((jsxMatch = jsxPattern.exec(stripped)) !== null) {
      const name = jsxMatch[1];
      // Only flag if not defined AND not a well-known HTML-like element
      if (
        !defined.has(name) &&
        !BUILTINS.has(name) &&
        // Only flag if it appears more than once (single usage could be a typo/noise)
        (stripped.match(new RegExp(`<${name}[\\s/>]`, 'g'))?.length ?? 0) >= 1
      ) {
        missing.push(`import ${name}`);
      }
    }
  }

  // Python module access without import — only flag if we see mod.method pattern
  // AND the module isn't imported anywhere in the snippet
  if (lang === 'python') {
    const moduleAccess = /\b([a-z]\w{2,})\.\w+/g; // min 3 chars to avoid false positives
    let modMatch: RegExpExecArray | null;
    const flaggedModules = new Set<string>();
    while ((modMatch = moduleAccess.exec(stripped)) !== null) {
      const name = modMatch[1];
      if (
        !defined.has(name) &&
        !BUILTINS.has(name) &&
        !flaggedModules.has(name) &&
        !code.match(new RegExp(`^\\s*(?:import\\s+${name}|from\\s+${name})`, 'm'))
      ) {
        flaggedModules.add(name);
        missing.push(`import ${name}`);
      }
    }
  }

  // Only add called functions if they appear 2+ times (reduces one-off noise)
  for (const fn of calledFunctions) {
    const occurrences = (stripped.match(new RegExp(`\\b${fn}\\s*\\(`, 'g')) ?? []).length;
    if (occurrences >= 2) {
      missing.push(`${fn}() function`);
    }
  }

  // We intentionally do NOT flag property accesses (obj.prop) — too many false positives.
  // The object itself may come from a parameter, a higher scope, or an import we can't see.

  // Deduplicate and cap at 3 warnings max to avoid overwhelming the user
  const unique = [...new Set(missing)];
  return unique.slice(0, 3);
}
