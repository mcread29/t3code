import { execFileSync } from "node:child_process";

type CliOptions = {
  remote: string;
  failIfBehind: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let remote = "upstream";
  let failIfBehind = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--remote") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --remote.");
      }
      remote = value;
      index += 1;
      continue;
    }

    if (arg === "--fail-if-behind") {
      failIfBehind = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { remote, failIfBehind };
}

function runGit(args: string[], options?: { stdio?: "inherit" }): string {
  const output = execFileSync("git", args, {
    encoding: "utf8",
    stdio: options?.stdio ?? "pipe",
  });

  return typeof output === "string" ? output.trim() : "";
}

function getRemoteDefaultBranch(remote: string): string {
  const output = runGit(["ls-remote", "--symref", remote, "HEAD"]);
  const headLine = output
    .split("\n")
    .find((line) => line.startsWith("ref: refs/heads/") && line.endsWith("\tHEAD"));

  if (!headLine) {
    throw new Error(`Could not resolve the default branch for remote "${remote}".`);
  }

  return headLine.slice("ref: refs/heads/".length, headLine.indexOf("\tHEAD"));
}

function main(): void {
  const { remote, failIfBehind } = parseArgs(process.argv.slice(2));

  const remotes = runGit(["remote"]).split("\n").filter(Boolean);
  if (!remotes.includes(remote)) {
    throw new Error(`Remote "${remote}" is not configured in this repository.`);
  }

  const defaultBranch = getRemoteDefaultBranch(remote);
  const remoteRef = `${remote}/${defaultBranch}`;

  console.log(`Fetching ${remote}/${defaultBranch}...`);
  runGit(["fetch", remote, defaultBranch], { stdio: "inherit" });

  const counts = runGit(["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`]);
  const [aheadText, behindText] = counts.split("\t");
  const ahead = Number(aheadText);
  const behind = Number(behindText);

  if (Number.isNaN(ahead) || Number.isNaN(behind)) {
    throw new Error(`Unexpected rev-list output: ${counts}`);
  }

  console.log(`Local branch is ${ahead} commit(s) ahead and ${behind} commit(s) behind ${remoteRef}.`);

  if (behind === 0) {
    console.log(`No upstream-only commits found on ${remoteRef}.`);
    return;
  }

  const upstreamCommits = runGit(["log", "--oneline", `HEAD..${remoteRef}`]);
  console.log(`Upstream-only commits on ${remoteRef}:`);
  console.log(upstreamCommits);

  if (failIfBehind) {
    process.exitCode = 1;
  }
}

main();
