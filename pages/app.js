(() => {
const runtime = './runtime-v7/';
const verifier = document.querySelector('meta[name=codeforge-verifier]')?.content;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sent = new Map();
const storageKey = 'codeforge-project';
const filenamePattern = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;
let vm;
let send;
let waiting;
let terminalLine = '';
let result;
let job;
let examples;

function getScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load ' + url));
        document.head.append(script);
    });
}

function response(test, timeout) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            waiting = null;
            reject(new Error('The VM stopped responding. Reload the page to restart it.'));
        }, timeout);
        waiting = line => {
            if (!test(line)) return;
            clearTimeout(timer);
            waiting = null;
            resolve(line);
        };
    });
}

function receive(data) {
    terminalLine += typeof data === 'string' ? data : decoder.decode(data, {stream: true});
    let newline;
    while ((newline = terminalLine.indexOf('\n')) >= 0) {
        const line = terminalLine.slice(0, newline).replace(/\r/g, '');
        terminalLine = terminalLine.slice(newline + 1);
        if (line.startsWith('CF_DONE ')) {
            const [, code, encoded] = line.split(' ');
            const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
            result = {code: Number(code), output: new TextDecoder().decode(bytes)};
        }
        waiting?.(line);
    }
}

async function loadDisk(updatePhase) {
    const start = performance.now();
    const [size, disk] = await Promise.all([
        fetch(runtime + 'disk-size.txt'),
        fetch(runtime + 'eiffel.ext4.gz'),
    ]);
    if (!size.ok || !disk.ok) throw new Error('The browser VM download is unavailable.');
    const source = disk.headers.get('X-CodeForge-Runtime-Cache') || 'unknown';
    if (source === 'hit') updatePhase('Loading the browser VM from this device…');
    const bytes = new Uint8Array(Number(await size.text()));
    const reader = disk.body.pipeThrough(new DecompressionStream('gzip')).getReader();
    let offset = 0;
    try {
        for (;;) {
            const {value, done} = await reader.read();
            if (done) break;
            bytes.set(value, offset);
            offset += value.length;
        }
    } finally {
        reader.releaseLock();
    }
    if (offset !== bytes.length) throw new Error('The browser VM download is incomplete.');
    performance.measure('codeforge:disk', {start, end: performance.now(), detail: {source}});
    return bytes;
}

async function startVM(updatePhase) {
    updatePhase('Downloading the browser VM on first use…');
    const [bytes] = await Promise.all([
        loadDisk(updatePhase),
        getScript(runtime + 'xterm.js'),
        getScript(runtime + 'pty.js'),
    ]);
    const start = performance.now();
    const term = new Terminal();
    term.write = (data, done) => { receive(data); done?.(); };
    const {master, slave} = openpty();
    term.loadAddon(master);
    send = command => master.ldisc.writeFromLower(encoder.encode(command + '\n'));
    const callbacks = [];
    slave.onReadable(() => callbacks.splice(0).forEach(callback => callback()));
    const config = {
        pty: slave,
        mainScriptUrlOrBlob: new URL(runtime + 'out.js', location.href).href,
        locateFile: file => new URL(runtime + file, location.href).href,
        preRun: [],
    };
    window.Module = config;
    await getScript(runtime + 'load.js');
    config.preRun.push(mod => {
        mod.FS.writeFile('/pack/eiffel.ext4', bytes, {canOwn: true});
        mod.TTY.stream_ops.poll = (stream, timeout, callback) => {
            if (slave.readable) return 1;
            if (callback) {
                callbacks.push(callback);
                callback.registerCleanupFunc(() => {
                    const index = callbacks.indexOf(callback);
                    if (index >= 0) callbacks.splice(index, 1);
                });
            }
            return 0;
        };
    });
    config.arguments = [
        '-nographic', '-m', '1024M', '-smp', '1', '-accel', 'tcg,tb-size=128,thread=multi',
        '-L', '/pack', '-nic', 'none',
        '-drive', 'if=virtio,format=raw,readonly=on,file=/pack/eiffel.ext4',
        '-kernel', '/pack/bzImage',
        '-append', 'console=ttyS0 root=/dev/vda rootwait ro init=/usr/local/sbin/codeforge-init loglevel=4',
    ];
    const {default: initialize} = await import(runtime + 'out.js');
    const ready = response(line => line.endsWith('CF_READY'), 120000);
    updatePhase('Starting the browser VM…');
    await Promise.all([ready, initialize(config)]);
    performance.measure('codeforge:boot', {start, end: performance.now()});
}

async function command(input, timeout = 15000) {
    const reply = response(line => /^CF_ACK \d+$/.test(line), timeout);
    send(input);
    if (await reply !== 'CF_ACK 0') throw new Error('The VM could not complete ' + input.split(' ')[0] + '.');
}

async function syncProject(language, files) {
    await command('LANGUAGE ' + language);
    if (!sent.has(language)) sent.set(language, new Map());
    const previous = sent.get(language);
    const snapshot = new Map(files.map(({name, content}) => [name, content]));
    for (const name of previous.keys()) {
        if (snapshot.has(name)) continue;
        await command('REMOVE ' + name);
        previous.delete(name);
    }
    for (const [name, source] of snapshot) {
        if (previous.get(name) === source) continue;
        await command('BEGIN');
        const bytes = encoder.encode(source);
        for (let offset = 0; offset < bytes.length; offset += 768) {
            const chunk = bytes.subarray(offset, offset + 768);
            await command('CHUNK ' + btoa(String.fromCharCode(...chunk)));
        }
        await command('SAVE ' + name);
        previous.set(name, source);
    }
}

function proofOutput(output) {
    const report = new DOMParser().parseFromString(output, 'text/html');
    const table = document.createElement('table');
    let count = 0;
    let failed = 0;
    for (const row of report.querySelectorAll('tbody tr')) {
        const copy = table.insertRow();
        count++;
        const color = row.style.backgroundColor;
        copy.style.backgroundColor = color;
        if (color !== 'rgb(221, 255, 221)') failed++;
        for (const cell of row.cells) copy.insertCell().textContent = cell.textContent;
    }
    if (count) return {output: table.outerHTML, message: count + ' proof results · ' + failed + ' failed', failed};
    const log = document.createElement('pre');
    log.textContent = output;
    return {output: log.outerHTML, message: 'AutoProof returned no proof results.', failed: 1};
}

async function enableIsolation(current, project, timeout, updatePhase) {
    if (crossOriginIsolated) return;
    if (!navigator.serviceWorker) throw new Error('This browser cannot isolate the VM.');
    updatePhase('Preparing browser isolation…');
    await navigator.serviceWorker.register('./coi.js', {updateViaCache: 'none'});
    await navigator.serviceWorker.ready;
    if (current.cancelled) return;
    if (sessionStorage.getItem('codeforge-isolation-retried')) {
        throw new Error('The browser could not isolate the VM.');
    }
    sessionStorage.setItem('codeforge-isolation-retried', '1');
    // The next navigation receives the isolation headers.
    const data = {operation: current.operation_type, timeout, project};
    sessionStorage.setItem('codeforge-resume', JSON.stringify(data));
    location.reload();
    await new Promise(() => {});
}

async function verifyInBrowser(current, files, timeout) {
    current.phase = 'Loading AutoProof…';
    const started = performance.now();
    current.began = started;
    const controller = new AbortController();
    current.abort = () => controller.abort();
    const [module, config] = await Promise.all([
        import(verifier),
        fetch('./autoproof.ecf', {signal: controller.signal}),
    ]);
    if (!config.ok) throw new Error('The AutoProof configuration is unavailable.');
    const project = Object.fromEntries(files.map(({name, content}) => [name, content]));
    project['Ace.ecf'] = await config.text();
    current.phase = null;
    const {code, lines} = await module.verifyProject(project, ['-batch', '-autoproof', '-html'], {
        signal: controller.signal,
        timeoutMs: Math.max(0, timeout * 1000 - (performance.now() - started)),
    });
    performance.measure('codeforge:verify', {start: started, end: performance.now()});
    const proof = proofOutput(lines.join('\n'));
    current.exit_code = code;
    current.success = code === 0 && proof.failed === 0;
    current.message = proof.message;
    current.output = proof.output;
}

async function execute(current, project, timeout) {
    const {language, files, main_file} = project;
    const phase = message => { current.phase = message; };
    try {
        await enableIsolation(current, {lang: language, files, activeFile: window.fileManager.getActiveFile()?.name},
            timeout, phase);
        if (current.cancelled) return;
        if (current.operation_type === 'verify' && verifier) {
            await verifyInBrowser(current, files, timeout);
            return;
        }
        await (vm ??= startVM(phase));
        if (current.cancelled) return;
        phase('Updating changed source files…');
        const syncStarted = performance.now();
        await syncProject(language, files);
        performance.measure('codeforge:source-sync', {start: syncStarted, end: performance.now()});
        if (current.cancelled) return;

        result = null;
        const workStarted = performance.now();
        await command('START ' + [language, current.operation_type, timeout, main_file].join(' '));
        current.began = performance.now();
        current.phase = null;
        let cancelSent = false;
        while (!result) {
            if (current.cancelled && !cancelSent) {
                await command('CANCEL');
                cancelSent = true;
            }
            await command('RESULT', 90000);
            if (!result) await new Promise(resolve => setTimeout(resolve, 250));
        }
        performance.measure('codeforge:' + current.operation_type, {start: workStarted, end: performance.now()});
        const {code, output} = result;
        current.exit_code = code;
        current.success = code === 0;
        if (current.cancelled) {
            current.success = false;
            current.message = 'Execution cancelled';
        } else if (code === 124 || code === 137) {
            current.message = 'Execution timed out';
        } else if (current.operation_type === 'verify') {
            const proof = proofOutput(output);
            current.message = proof.message;
            current.success = current.success && proof.failed === 0;
            current.output = proof.output;
        } else {
            current.message = current.operation_type === 'compile'
                ? (current.success ? 'Compilation succeeded' : 'Compilation failed')
                : (current.success ? 'Execution completed' : 'Execution failed');
        }
        if (current.output === undefined) {
            current.output = current.operation_type === 'verify' ? proofOutput(output).output : output;
        }
    } catch (error) {
        current.message = current.cancelled ? 'Execution cancelled' : error.message;
        current.success = false;
    } finally {
        current.message ??= 'Execution cancelled';
        delete current.abort;
        current.phase = null;
        current.running = false;
        current.completed = true;
    }
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
}

function catalog() {
    return examples ??= fetch('./examples.json').then(response => {
        if (!response.ok) throw new Error('Could not load the examples.');
        return response.json();
    });
}

async function request(path, options) {
    const [, resource, first, second] = path.split('/');
    if (resource === 'examples') {
        const items = await catalog();
        if (!first) return json(items);
        const example = items[first]?.[second];
        if (!example) return json({detail: 'Example unavailable'}, 404);
        const url = new URL(example, location.origin);
        const params = url.searchParams;
        const project = await URLCompression.parseFromURL(params);
        return json({url: location.pathname + url.search.replace('?', '#'), code: project?.files[0]?.content, project});
    }
    if (resource === 'eiffel') {
        const mappings = await fetch('./mappings.json').then(response => response.json());
        if (first === 'mappings') return json({success: true, mappings, count: Object.keys(mappings).length});
        const name = decodeURIComponent(second).toUpperCase();
        const mapped = mappings[name] || name;
        if (/^[A-Z][A-Z0-9_]*$/.test(mapped)) {
            const source = await fetch(runtime + 'library/' + mapped + '.e');
            if (source.ok) return json({success: true, mapped_class_name: mapped, source_code: await source.text()});
        }
        return json({success: false, message: 'Class ' + name + ' is unavailable.'});
    }
    if (resource === 'status') {
        if (job?.id !== first) return json({running: false, message: 'Execution unavailable'});
        return json({...job, elapsed_time: job.began ? (performance.now() - job.began) / 1000 : 0});
    }
    if (resource === 'cancel') {
        if (!job?.running || job.id !== options.body.get('execution_id')) return json({success: false, message: 'Execution already finished'});
        job.cancelled = true;
        job.abort?.();
        return json({success: true, pending: true, message: 'Cancelling…'});
    }
    const project = JSON.parse(options.body);
    const {language, files, main_file} = project;
    if (language !== 'eiffel') return json({success: false, message: 'Select an Eiffel project.'});
    if (!files.length || !files.every(file => filenamePattern.test(file.name))
        || !files.some(file => file.name === main_file)) {
        return json({success: false, message: 'Use filenames starting with a letter, digit or underscore.'});
    }
    if (job?.running) return json({success: false, message: 'An operation is already running.'});
    const timeout = Math.min(600, Math.max(5, parseInt(project.timeout, 10) || 600));
    job = {id: crypto.randomUUID(), operation_type: resource, running: true, phase: 'Preparing Eiffel…'};
    void execute(job, project, timeout);
    return json({started: true, execution_id: job.id});
}

function restoreProject(params) {
    if (params.has('files') || params.has('code')) return null;
    try {
        const stored = JSON.parse(localStorage.getItem(storageKey));
        if (stored?.lang === 'eiffel' && stored.files?.length) return stored;
        const previous = JSON.parse(localStorage.getItem('codeforge-eiffel-files'));
        if (previous?.length) return {lang: 'eiffel', files: previous.map(([name, content]) => ({name, content}))};
    } catch {
        return null;
    }
    return null;
}

window.codeforgeBrowser = {
    request,
    restoreProject,
    saveProject(project) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(project));
        } catch {
            // A shared link can still preserve the project if storage is unavailable.
        }
    },
    takePendingAction() {
        const action = sessionStorage.getItem('codeforge-resume');
        sessionStorage.removeItem('codeforge-resume');
        if (crossOriginIsolated) sessionStorage.removeItem('codeforge-isolation-retried');
        return JSON.parse(action);
    },
};
})();
