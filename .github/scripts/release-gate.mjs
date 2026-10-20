const REPOSITORIES = {
  owner: "genairit",
  backend: "Gen-Air-Backend",
  frontend: "Gen-Air-Frontend",
};
const STATUS_CONTEXT = "Backend compatibility";
const COMMIT_STATES = { PENDING: "pending", SUCCESS: "success", FAILURE: "failure" };
const RELEASE_BRANCHES = { DEV: "dev", TEST: "test" };
const PROMOTIONS = {
  [RELEASE_BRANCHES.TEST]: RELEASE_BRANCHES.DEV,
};
const RELEASE_TARGETS = Object.keys(PROMOTIONS);

export const validatePullRequest = context => {
  const request = context.payload.pull_request;
  const isFrontend = context.repo.repo === REPOSITORIES.frontend;
  const isOwner = context.repo.owner === REPOSITORIES.owner;
  const isPullRequest = context.eventName === "pull_request";
  if (!isFrontend || !isOwner || !isPullRequest || !request) {
    throw new Error("Only Gen-Air-Frontend pull requests can call the release gate.");
  }

  const target = request.base.ref;
  if (!RELEASE_TARGETS.includes(target)) {
    throw new Error(
      `Unsupported automatic release target: ${target}. Feature → dev is verified by QA.`,
    );
  }

  const isWrongSource = request.head.ref !== PROMOTIONS[target];
  const isSameRepository =
    request.head.repo?.full_name === `${REPOSITORIES.owner}/${REPOSITORIES.frontend}`;
  if (!isSameRepository || isWrongSource) {
    throw new Error("Automatic gates allow only dev → test within Gen-Air-Frontend.");
  }

  return { request, target };
};

const writeStatus = async ({ github, request, state, description }) => {
  await github.rest.repos.createCommitStatus({
    owner: REPOSITORIES.owner,
    repo: REPOSITORIES.frontend,
    sha: request.head.sha,
    context: STATUS_CONTEXT,
    description,
    state,
  });
};

export const prepare = async ({ github, context, core }) => {
  const { request, target } = validatePullRequest(context);
  if (!/^[a-f0-9]{40}$/.test(process.env.AUTOMATION_REF ?? "")) {
    throw new Error("Automation must be pinned to a full commit SHA.");
  }

  await writeStatus({
    github,
    request,
    state: COMMIT_STATES.PENDING,
    description: `Testing backend ${target}; merge backend dependencies first.`,
  });
  const { data: current } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: request.number,
  });
  const isCurrentHead = current.head.sha === request.head.sha;
  const isCurrentBase = current.base.sha === request.base.sha && current.base.ref === target;
  if (!isCurrentHead || !isCurrentBase || !current.merge_commit_sha || current.mergeable !== true) {
    throw new Error(
      "PR changed or cannot merge. Update the branch and run a fresh pull-request check.",
    );
  }

  const { data: backend } = await github.rest.repos.getCommit({
    owner: REPOSITORIES.owner,
    repo: REPOSITORIES.backend,
    ref: target,
  });
  core.setOutput("backend-ref", backend.sha);
  core.setOutput("frontend-ref", current.merge_commit_sha);
  await core.summary
    .addHeading("Pinned release revisions")
    .addTable([
      ["Repository", "Revision"],
      ["Frontend candidate merge", current.merge_commit_sha],
      [`Backend ${target}`, backend.sha],
      ["Automation", process.env.AUTOMATION_REF],
    ])
    .write();
};

export const finish = async ({ github, context, core }) => {
  const { request, target } = validatePullRequest(context);
  const { data: backend } = await github.rest.repos.getCommit({
    owner: REPOSITORIES.owner,
    repo: REPOSITORIES.backend,
    ref: target,
  });
  const { data: current } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: request.number,
  });
  const backendIsCurrent = backend.sha === process.env.TESTED_BACKEND_REF;
  const frontendIsCurrent =
    current.head.sha === request.head.sha &&
    current.base.sha === request.base.sha &&
    current.base.ref === target;
  const passed =
    process.env.SUITE_OUTCOME === COMMIT_STATES.SUCCESS && backendIsCurrent && frontendIsCurrent;
  const description = passed
    ? `Passed against backend ${backend.sha.slice(0, 12)}`
    : "Failed or stale: merge backend dependencies first, then rerun the frontend gate.";
  await writeStatus({
    github,
    request,
    state: passed ? COMMIT_STATES.SUCCESS : COMMIT_STATES.FAILURE,
    description,
  });
  if (!passed) {
    core.setFailed(description);
  }
};
