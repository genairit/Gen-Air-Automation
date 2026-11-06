import Module from "node:module";
import { existsSync } from "node:fs";

const originalLoad = Module._load;
const folderMimeType = "application/vnd.google-apps.folder";
const projectIdFrom = (id, prefix) => (id.startsWith(prefix) ? id.slice(prefix.length) : null);
const item = (id, name, mimeType, parents) => ({ id, name, mimeType, parents, trashed: false });
const projectRoot = projectId => `qa-project-${projectId}`;
const nestedFolder = projectId => `qa-nested-${projectId}`;
const planFile = projectId => `qa-plan-${projectId}`;
const zipFile = projectId => `qa-zip-${projectId}`;

const fixedMetadata = {
  "qa-drive-root": item("qa-drive-root", "Drive", folderMimeType, []),
  "qa-foreign-root": item("qa-foreign-root", "Foreign", folderMimeType, ["qa-drive-root"]),
  "qa-foreign-plan": item("qa-foreign-plan", "תוכנית זרה.pdf", "application/pdf", [
    "qa-foreign-root",
  ]),
};

const dynamicMetadata = [
  { prefix: "qa-project-", create: id => item(id, "Project", folderMimeType, ["qa-drive-root"]) },
  {
    prefix: "qa-nested-",
    create: (id, projectId) => item(id, "תיקיית משנה", folderMimeType, [projectRoot(projectId)]),
  },
  {
    prefix: "qa-plan-",
    create: (id, projectId) =>
      item(id, "תוכנית לביצוע.pdf", "application/pdf", [nestedFolder(projectId)]),
  },
  {
    prefix: "qa-zip-",
    create: (id, projectId) => item(id, "מסמכים.zip", "application/zip", [nestedFolder(projectId)]),
  },
];

const metadata = id => {
  if (Object.hasOwn(fixedMetadata, id)) {
    return fixedMetadata[id];
  }

  const builder = dynamicMetadata.find(candidate => id.startsWith(candidate.prefix));
  return builder?.create(id, projectIdFrom(id, builder.prefix)) ?? null;
};

const displayItem = source => ({
  id: source.id,
  name: source.name,
  mimeType: source.mimeType,
  isFolder: source.mimeType === folderMimeType,
  size: null,
  modifiedTime: null,
  webViewLink: null,
});

const fakeMethods = {
  isConfigured: () => true,
  getProjectsRootFolderId: () => "qa-drive-root",
  getFileMetadata: async id => metadata(id),
  findParentIds: async id => metadata(id)?.parents ?? null,
  ensureFolder: async (_name, _parent, projectId) =>
    projectId ? projectRoot(projectId) : "qa-template-folder",
  countDescendantFiles: async ids => new Map(ids.map(id => [id, 2])),
  listChildren: async id => {
    const projectId = projectIdFrom(id, "qa-project-");
    if (projectId) {
      return [displayItem(metadata(nestedFolder(projectId)))];
    }

    const nestedProjectId = projectIdFrom(id, "qa-nested-");
    if (nestedProjectId) {
      return [planFile(nestedProjectId), zipFile(nestedProjectId)].map(fileId =>
        displayItem(metadata(fileId)),
      );
    }

    return [];
  },
  downloadFile: async id => {
    const contentByPrefix = {
      "qa-plan-": Buffer.from("%PDF-1.4\nQA plan\n"),
      "qa-zip-": Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]),
    };
    const prefix = Object.keys(contentByPrefix).find(candidate => id.startsWith(candidate));
    if (!prefix) {
      throw new Error(`No fake Drive content for ${id}`);
    }

    return contentByPrefix[prefix];
  },
};

Module._load = (request, parent, isMain) => {
  const loaded = originalLoad.call(Module, request, parent, isMain);
  if (request === "node:fs/promises") {
    return {
      ...loaded,
      readFile: (...args) => {
        const marker = process.env.GEN_AIR_EMAIL_QA_FAIL_LOGO_MARKER;
        const isLogo = String(args[0]).endsWith("/genair-logo.png");
        if (marker && isLogo && existsSync(marker)) {
          return Promise.reject(new Error("Test signature logo unavailable"));
        }
        return loaded.readFile(...args);
      },
    };
  }
  if (request.endsWith("google-drive.service") && loaded.GoogleDriveService) {
    Object.assign(loaded.GoogleDriveService.prototype, fakeMethods);
  }
  return loaded;
};
