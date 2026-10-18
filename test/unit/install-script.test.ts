import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { it } from "node:test";

const INSTALLER = path.resolve("install.mjs");
const FORK_URL = "https://github.com/datspike/nb-pi-subagents.git";
const UPSTREAM_URL = "https://github.com/nicobailon/pi-subagents.git";

function runExistingInstall(remoteUrl: string) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-install-script-"));
	const bin = path.join(root, "bin");
	const extensionDir = path.join(root, ".pi", "agent", "extensions", "subagent");
	const logPath = path.join(root, "git-log.jsonl");
	fs.mkdirSync(bin, { recursive: true });
	fs.mkdirSync(path.join(extensionDir, ".git"), { recursive: true });
	const fakeGit = path.join(bin, process.platform === "win32" ? "git.exe" : "git");
	const fakeGitBody = `import fs from "node:fs";
const command = process.platform === "win32" ? process.argv[1] : null;
const args = process.platform === "win32" ? [command ? command.split(/[\\\\/]/).pop() : "git", ...process.argv.slice(2)] : process.argv.slice(2);
fs.appendFileSync(process.env.GIT_LOG, JSON.stringify(args) + "\\n");
if (args.join(" ") === "remote get-url origin") console.log(process.env.FAKE_REMOTE);
`;
	if (process.platform === "win32") {
		fs.copyFileSync(process.execPath, fakeGit);
		for (const command of ["remote", "pull"]) fs.writeFileSync(path.join(extensionDir, command), fakeGitBody);
	} else {
		fs.writeFileSync(fakeGit, `#!/usr/bin/env node\n${fakeGitBody}`);
		fs.chmodSync(fakeGit, 0o755);
	}
	const env = {
		...process.env,
		HOME: root,
		USERPROFILE: root,
		FAKE_REMOTE: remoteUrl,
		GIT_LOG: logPath,
		PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
	};
	try {
		execFileSync(process.execPath, [INSTALLER], { env, encoding: "utf-8" });
		return fs.readFileSync(logPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

it("migrates an existing upstream checkout before pulling", () => {
	assert.deepEqual(runExistingInstall(UPSTREAM_URL), [
		["remote", "get-url", "origin"],
		["remote", "set-url", "origin", FORK_URL],
		["pull"],
	]);
});

it("does not replace an unrelated existing remote", () => {
	assert.deepEqual(runExistingInstall("git@github.com:someone/custom-pi-subagents.git"), [
		["remote", "get-url", "origin"],
		["pull"],
	]);
});
