import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_PORTS = getDefaultPorts();

function getDefaultPorts() {
  try {
    const configPath = resolve(process.cwd(), 'config', 'ports.json');
    const raw = readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    const ports = [config.web, config.api, config.publisher]
      .map((value) => Number.parseInt(String(value), 10))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (ports.length > 0) {
      return [...new Set(ports)];
    }
  } catch {
  }

  return [3000, 3001, 3002];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const mode = args.includes('--force') ? 'force' : 'check';

  const cliPorts = args
    .filter((value) => !value.startsWith('--'))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (cliPorts.length > 0) {
    return { mode, ports: [...new Set(cliPorts)] };
  }

  if (process.env.PORTS) {
    const envPorts = process.env.PORTS.split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (envPorts.length > 0) {
      return { mode, ports: [...new Set(envPorts)] };
    }
  }

  return { mode, ports: DEFAULT_PORTS };
}

function getPidsForPortWindows(port) {
  try {
    const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const pids = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 5 && parts[3] === 'LISTENING')
      .map((parts) => Number.parseInt(parts[4], 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);

    return [...new Set(pids)];
  } catch {
    return [];
  }
}

function killPidWindows(pid, port) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    console.log(`[ports] Stopped PID ${pid} on port ${port}`);
  } catch {
    console.log(`[ports] Failed to stop PID ${pid} on port ${port}`);
  }
}

function getPidsForPortUnix(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return output
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function killPidUnix(pid, port) {
  try {
    process.kill(pid, 'SIGKILL');
    console.log(`[ports] Stopped PID ${pid} on port ${port}`);
  } catch {
    console.log(`[ports] Failed to stop PID ${pid} on port ${port}`);
  }
}

function getPidsForPort(port) {
  return process.platform === 'win32'
    ? getPidsForPortWindows(port)
    : getPidsForPortUnix(port);
}

function killPid(pid, port) {
  if (process.platform === 'win32') {
    killPidWindows(pid, port);
  } else {
    killPidUnix(pid, port);
  }
}

function checkPorts(ports) {
  let hasConflicts = false;

  for (const port of ports) {
    const pids = getPidsForPort(port);
    if (pids.length === 0) {
      console.log(`[ports] Port ${port} is free`);
      continue;
    }

    hasConflicts = true;
    console.log(`[ports] Port ${port} is in use by PID(s): ${pids.join(', ')}`);
  }

  if (hasConflicts) {
    console.log('[ports] Conflicts found. Re-run with --force to stop listed PIDs.');
    process.exitCode = 1;
  } else {
    console.log('[ports] All requested ports are free.');
  }
}

function freePorts(ports) {
  for (const port of ports) {
    const pids = getPidsForPort(port);

    if (pids.length === 0) {
      console.log(`[ports] Port ${port} is already free`);
      continue;
    }

    for (const pid of pids) {
      killPid(pid, port);
    }
  }
}

const { mode, ports } = parseArgs();
console.log(`[ports] Mode: ${mode}`);
console.log(`[ports] Checking ports: ${ports.join(', ')}`);

if (mode === 'force') {
  freePorts(ports);
} else {
  checkPorts(ports);
}
