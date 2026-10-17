import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const mode = process.argv[2];
const configs = {
	unit: {
		loader: "./test/support/isolated-temp-root.mjs",
		directory: "test/unit",
		pattern: "test/unit/*.test.ts",
	},
	integration: {
		loader: "./test/support/register-loader.mjs",
		directory: "test/integration",
		pattern: "test/integration/*.test.ts",
	},
};
const config = configs[mode];
if (!config) {
	console.error(`Usage: node scripts/run-test-shards.mjs <unit|integration>`);
	process.exit(2);
}

const parsePositiveInt = (name, fallback) => {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 1) {
		console.error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
		process.exitCode = 2;
		return fallback;
	}
	return value;
};

const testFileCount = readdirSync(resolve(process.cwd(), config.directory), { withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
	.length;
const shardCount = parsePositiveInt("PI_SUBAGENTS_TEST_SHARDS", 6);
const testConcurrency = parsePositiveInt("PI_SUBAGENTS_TEST_CONCURRENCY", 2);
const maxTestConcurrency = 16;
if (process.exitCode) process.exit();
if (testConcurrency > maxTestConcurrency) {
	console.error(`PI_SUBAGENTS_TEST_CONCURRENCY cannot exceed ${maxTestConcurrency}, got ${testConcurrency}`);
	process.exit(2);
}
if (shardCount > testFileCount) {
	console.error(`PI_SUBAGENTS_TEST_SHARDS cannot exceed ${testFileCount} test files for ${mode}, got ${shardCount}`);
	process.exit(2);
}

const childArgs = (shard) => [
	"--experimental-strip-types",
	"--import",
	config.loader,
	"--test",
	`--test-concurrency=${testConcurrency}`,
	`--test-shard=${shard}/${shardCount}`,
	config.pattern,
];

const children = new Set();
let terminatingSignal;
const signalNumber = { SIGINT: 2, SIGTERM: 15 };
const forwardSignal = (signal) => {
	if (terminatingSignal) return;
	terminatingSignal = signal;
	for (const child of children) {
		if (child.exitCode === null && !child.killed) {
			try { child.kill(signal); } catch {}
		}
	}
};
const onSigint = () => forwardSignal("SIGINT");
const onSigterm = () => forwardSignal("SIGTERM");
process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);

const run = (shard) => new Promise((resolveResult) => {
	const child = spawn(process.execPath, childArgs(shard), {
		cwd: process.cwd(),
		env: process.env,
		stdio: "inherit",
		windowsHide: true,
	});
	children.add(child);
	const settle = (code) => {
		children.delete(child);
		resolveResult(code);
	};
	child.once("error", (error) => {
		console.error(`test shard ${shard}/${shardCount} failed to start: ${error.message}`);
		settle(1);
	});
	child.once("exit", (code, signal) => {
		if (signal) {
			console.error(`test shard ${shard}/${shardCount} exited with signal ${signal}`);
			settle(1);
			return;
		}
		settle(code ?? 1);
	});
});

const results = await Promise.all(Array.from({ length: shardCount }, (_, index) => run(index + 1)));
process.removeListener("SIGINT", onSigint);
process.removeListener("SIGTERM", onSigterm);
if (terminatingSignal) {
	process.exitCode = 128 + signalNumber[terminatingSignal];
} else {
	const failed = results.filter((code) => code !== 0);
	if (failed.length > 0) {
		console.error(`${failed.length}/${shardCount} test shard(s) failed`);
		process.exitCode = 1;
	}
}
