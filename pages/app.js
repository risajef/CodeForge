const byId = id => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sample = 'class HELLO_WORLD\n\ncreate\n    make\n\nfeature\n    make\n        do\n            check True end\n        end\nend\n';
const project = new Map(JSON.parse(localStorage.getItem('codeforge-eiffel-files') || 'null')
    || [['hello_world.e', sample]]);
const sent = new Map();
let active = project.keys().next().value;
let vm;
let waiting;
let terminalLine = '';
let report = '';
let send;
const setStatus = message => { byId('status').textContent = message; };

function selectFile(name) {
    active = name;
    byId('files').replaceChildren(...[...project.keys()].map(key => new Option(key, key)));
    byId('files').value = name;
    byId('editor').value = project.get(name);
    byId('remove').disabled = project.size < 2;
}

function saveProject() {
    localStorage.setItem('codeforge-eiffel-files', JSON.stringify([...project]));
}

byId('editor').oninput = () => {
    project.set(active, byId('editor').value);
    saveProject();
};
byId('files').onchange = event => selectFile(event.target.value);
byId('add').onclick = () => {
    const name = prompt('New Eiffel filename', 'new_class.e')?.trim();
    if (!name) return;
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*\.e$/.test(name) || project.has(name)) {
        setStatus('Enter a unique filename ending in .e.');
        return;
    }
    project.set(name, '');
    selectFile(name);
    saveProject();
};
byId('remove').onclick = () => {
    if (project.size < 2) return;
    project.delete(active);
    selectFile(project.keys().next().value);
    saveProject();
};
selectFile(active);

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
            reject(new Error('The VM did not respond in time. Reload the page to restart it.'));
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
    const value = typeof data === 'string' ? data : decoder.decode(data, {stream: true});
    terminalLine += value;
    let newline;
    while ((newline = terminalLine.indexOf('\n')) >= 0) {
        const line = terminalLine.slice(0, newline).replace(/\r/g, '');
        terminalLine = terminalLine.slice(newline + 1);
        if (line.startsWith('CF_RESULT ')) {
            report = new TextDecoder().decode(Uint8Array.from(atob(line.slice(10)), c => c.charCodeAt(0)));
        } else if (!line.startsWith('CF_') && line.trim()) {
            byId('output').append(line + '\n');
        }
        waiting?.(line);
    }
}

async function startVM() {
    setStatus('Downloading the Eiffel VM. The first download is about 400 MiB.');
    await Promise.all([getScript('./runtime-v3/xterm.js'), getScript('./runtime-v3/pty.js')]);
    const term = new Terminal();
    term.write = (data, done) => { receive(data); done?.(); };
    const {master, slave} = openpty();
    term.loadAddon(master);
    send = command => master.ldisc.writeFromLower(encoder.encode(command + '\n'));
    const callbacks = [];
    slave.onReadable(() => callbacks.splice(0).forEach(callback => callback()));
    const config = {
        pty: slave,
        mainScriptUrlOrBlob: new URL('./runtime-v3/out.js', location.href).href,
        locateFile: file => new URL('./runtime-v3/' + file, location.href).href,
        preRun: [],
    };
    window.Module = config;
    await getScript('./runtime-v3/load.js');
    const disk = await fetch('./runtime-v3/eiffel.ext4.gz');
    if (!disk.ok) throw new Error('The Eiffel VM download is unavailable.');
    const bytes = new Uint8Array(await new Response(
        disk.body.pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer());
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
        '-nographic', '-m', '768M', '-smp', '1', '-accel', 'tcg,tb-size=128,thread=multi',
        '-L', '/pack', '-nic', 'none',
        '-drive', 'if=virtio,format=raw,readonly=on,file=/pack/eiffel.ext4',
        '-kernel', '/pack/bzImage',
        '-append', 'console=ttyS0 root=/dev/vda rootwait ro init=/usr/local/sbin/codeforge-init loglevel=4',
    ];
    const {default: initialize} = await import('./runtime-v3/out.js');
    const ready = response(line => line.endsWith('CF_READY'), 120000);
    setStatus('Starting the Eiffel VM…');
    await Promise.all([ready, initialize(config)]);
}

async function command(input, timeout = 10000) {
    const reply = response(line => /^CF_ACK \d+$/.test(line), timeout);
    send(input);
    if (await reply !== 'CF_ACK 0') throw new Error('The VM could not complete ' + input.split(' ')[0] + '.');
}

function displayReport(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...doc.querySelectorAll('tbody tr')];
    if (!rows.length) {
        setStatus('AutoProof returned no proof results.');
        return;
    }
    const failed = rows.filter(row => (row.getAttribute('style') || '').includes('#fdd')).length;
    setStatus(`${rows.length} result${rows.length === 1 ? '' : 's'} · ${failed} failed`);
    byId('output').textContent += '\n' + rows.map(row =>
        [...row.cells].map(cell => cell.textContent.trim()).filter(Boolean).join(' — '),
    ).join('\n');
}

byId('verify').onclick = async () => {
    byId('verify').disabled = true;
    report = '';
    byId('output').textContent = '';
    try {
        await (vm ??= startVM());
        setStatus('Updating changed source files…');
        const snapshot = new Map(project);
        for (const name of sent.keys()) {
            if (!snapshot.has(name)) {
                await command('REMOVE ' + name);
                sent.delete(name);
            }
        }
        for (const [name, source] of snapshot) {
            if (sent.get(name) === source) continue;
            await command('BEGIN');
            const bytes = encoder.encode(source);
            for (let offset = 0; offset < bytes.length; offset += 768) {
                const chunk = bytes.subarray(offset, offset + 768);
                await command('CHUNK ' + btoa(String.fromCharCode(...chunk)));
            }
            await command('SAVE ' + name);
            sent.set(name, source);
        }
        byId('output').textContent = '';
        setStatus('AutoProof is checking the project. You can keep editing.');
        await command('VERIFY', 600000);
        displayReport(report);
    } catch (error) {
        setStatus(error.message);
    } finally {
        byId('verify').disabled = false;
    }
};

if (!crossOriginIsolated) {
    byId('verify').disabled = true;
    if (!navigator.serviceWorker) {
        setStatus('This browser cannot enable the isolation required by the VM.');
    } else {
        setStatus('Preparing browser isolation…');
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once: true});
        navigator.serviceWorker.register('./coi.js').then(() => {
            if (navigator.serviceWorker.controller && !sessionStorage.getItem('codeforge-coi-reload')) {
                sessionStorage.setItem('codeforge-coi-reload', '1');
                location.reload();
            }
        }).catch(error => setStatus(error.message));
    }
}
