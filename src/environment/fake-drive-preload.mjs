import Module from "node:module";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { PUBLICATION_EFFECT } from "../constants/quotation-publication.constant.ts";

const originalLoad = Module._load;
const folderMimeType = "application/vnd.google-apps.folder";
const projectIdFrom = (id, prefix) => (id.startsWith(prefix) ? id.slice(prefix.length) : null);
const item = (id, name, mimeType, parents) => ({
  id,
  name,
  mimeType,
  parents,
  version: "1",
  trashed: false,
});
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
const createdMetadata = new Map();
const foldersByParentAndName = new Map();
const legacyRelocated = new Set();
const folderKey = (parentId, name) => JSON.stringify([parentId, name]);
const loadedLegacyItems = new Set();
const registerLegacyFolder = source => {
  if (source.mimeType !== folderMimeType || source.parents.length !== 1) {
    return;
  }
  const key = folderKey(source.parents[0], source.name);
  if (foldersByParentAndName.has(key)) {
    return;
  }
  foldersByParentAndName.set(key, source.id);
};
const loadLegacyFixtures = () => {
  const directory = process.env.GEN_AIR_FAKE_DRIVE_STATE_DIR;
  const path = directory ? join(directory, "existing-folder-fixtures.jsonl") : null;
  if (!path || !existsSync(path)) {
    return;
  }
  const rows = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  for (const row of rows) {
    for (const source of JSON.parse(row).items) {
      if (loadedLegacyItems.has(source.id)) {
        continue;
      }
      createdMetadata.set(source.id, source);
      loadedLegacyItems.add(source.id);
      registerLegacyFolder(source);
    }
  }
};
const recordFolderCreation = async source => {
  const directory = process.env.GEN_AIR_FAKE_DRIVE_STATE_DIR;
  if (!directory) {
    return;
  }
  await mkdir(directory, { recursive: true });
  await appendFile(join(directory, "folder-creations.jsonl"), `${JSON.stringify(source)}\n`);
};

const applyLegacyMarker = id => {
  const directory = process.env.GEN_AIR_FAKE_DRIVE_STATE_DIR;
  const folder = createdMetadata.get(id);
  if (!directory || !folder || legacyRelocated.has(id)) {
    return;
  }
  if (!existsSync(join(directory, `legacy-${id}`))) {
    return;
  }
  createdMetadata.set(id, { ...folder, parents: ["qa-drive-root"] });
  legacyRelocated.add(id);
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
    prefix: "qa-revised-plan-",
    create: (id, projectId) =>
      item(id, "תוכנית לביצוע מעודכנת.pdf", "application/pdf", [nestedFolder(projectId)]),
  },
  {
    prefix: "qa-zip-",
    create: (id, projectId) => item(id, "מסמכים.zip", "application/zip", [nestedFolder(projectId)]),
  },
];

const metadata = id => {
  loadLegacyFixtures();
  applyLegacyMarker(id);
  if (createdMetadata.has(id)) {
    return createdMetadata.get(id);
  }
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

const publicationState = { stopped: false };
const publicationRevisions = new Map();
const assertPublicationRunning = () => {
  if (publicationState.stopped) {
    throw new Error("Publication executor is draining");
  }
};
const publicationDirectory = () => {
  const directory = process.env.GEN_AIR_FAKE_DRIVE_STATE_DIR;
  if (!directory) {
    throw new Error("Fake Drive state directory is required");
  }
  return directory;
};
const recordPublication = async (action, file, bytes = null) => {
  const directory = publicationDirectory();
  await mkdir(directory, { recursive: true });
  if (bytes) {
    await writeFile(join(directory, `${file.id}-${file.revisionId}.pdf`), bytes);
  }
  await appendFile(
    join(directory, "publication-effects.jsonl"),
    `${JSON.stringify({ action, ...file })}\n`,
  );
};
const publicationFile = source => ({
  ...source,
  md5: source.md5 ?? null,
  revisionId: source.revisionId ?? null,
  properties: source.properties ?? {},
});
const publicationMethods = {
  stopPublicationEffects: () => {
    publicationState.stopped = true;
  },
  reservePublicationId: async () => {
    assertPublicationRunning();
    return `qa-reserved-${randomUUID()}`;
  },
  inspectPublicationFile: async id => {
    assertPublicationRunning();
    const source = metadata(id);
    return source ? publicationFile(source) : null;
  },
  listPublicationChildren: async id => {
    assertPublicationRunning();
    loadLegacyFixtures();
    return [...createdMetadata.values()]
      .filter(source => source.parents.includes(id))
      .map(displayItem);
  },
  createPublicationFile: async input => {
    assertPublicationRunning();
    if (metadata(input.id)) {
      throw Object.assign(new Error("File already exists"), { code: 409 });
    }
    const revisionId = input.bytes ? randomUUID() : null;
    const file = {
      ...item(input.id, input.name, input.mimeType, [input.parentId]),
      properties: input.properties,
      revisionId,
      md5: input.bytes ? createHash("md5").update(input.bytes).digest("hex") : null,
    };
    createdMetadata.set(file.id, file);
    registerLegacyFolder(file);
    if (revisionId) {
      publicationRevisions.set(revisionId, { fileId: file.id, md5: file.md5, retained: true });
    }
    await recordPublication(PUBLICATION_EFFECT.CREATE, file, input.bytes);
  },
  replacePublicationMedia: async input => {
    assertPublicationRunning();
    const source = metadata(input.id);
    if (!source) {
      throw Object.assign(new Error("File unavailable"), { code: 404 });
    }
    const revisionId = randomUUID();
    const file = {
      ...source,
      name: input.name,
      revisionId,
      md5: createHash("md5").update(input.bytes).digest("hex"),
    };
    createdMetadata.set(file.id, file);
    publicationRevisions.set(revisionId, { fileId: file.id, md5: file.md5, retained: true });
    await recordPublication(PUBLICATION_EFFECT.REPLACE, file, input.bytes);
  },
  retainPublicationRevision: async (fileId, revisionId, expectedMd5) => {
    assertPublicationRunning();
    const revision = publicationRevisions.get(revisionId);
    if (!revision || revision.fileId !== fileId || revision.md5 !== expectedMd5) {
      throw new Error("Drive did not retain the PDF revision");
    }
    revision.retained = true;
    await recordPublication(PUBLICATION_EFFECT.RETAIN, {
      ...metadata(fileId),
      id: fileId,
      revisionId,
      md5: expectedMd5,
    });
  },
  movePublicationFile: async (fileId, sourceParents, destinationId) => {
    assertPublicationRunning();
    const source = metadata(fileId);
    if (!source || JSON.stringify(source.parents) !== JSON.stringify(sourceParents)) {
      throw new Error("Fake Drive source parent changed");
    }
    const file = { ...source, parents: [destinationId] };
    createdMetadata.set(fileId, file);
    await recordPublication(PUBLICATION_EFFECT.MOVE, file);
  },
};

const fakeMethods = {
  isConfigured: () => true,
  getProjectsRootFolderId: () => "qa-drive-root",
  getFileMetadata: async id => {
    const file = metadata(id);
    const directory = process.env.GEN_AIR_FAKE_DRIVE_STATE_DIR;
    if (!file || !directory) {
      return file;
    }
    const version = await readFile(join(directory, `version-${id}`), "utf8").catch(error => {
      if (error.code === "ENOENT") {
        return file.version;
      }
      throw error;
    });
    return { ...file, version: version.trim() };
  },
  findParentIds: async id => metadata(id)?.parents ?? null,
  ensureFolder: async (name, parentId, projectId) => {
    loadLegacyFixtures();
    const key = folderKey(parentId, name);
    const existing = foldersByParentAndName.get(key);
    if (existing) {
      return existing;
    }
    const id = projectId ? projectRoot(projectId) : `qa-folder-${createdMetadata.size + 1}`;
    createdMetadata.set(id, item(id, name, folderMimeType, [parentId]));
    foldersByParentAndName.set(key, id);
    await recordFolderCreation(createdMetadata.get(id));
    return id;
  },
  uploadFile: async ({ name, localPath, parentId, mimeType }) => {
    const id = `qa-upload-${createdMetadata.size + 1}`;
    const uploaded = item(id, name, mimeType, [parentId]);
    createdMetadata.set(id, uploaded);
    const directory = process.env.GEN_AIR_FAKE_DRIVE_STATE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      const content = await readFile(localPath);
      const bytes = content.length;
      const sha256 = createHash("sha256").update(content).digest("hex");
      await appendFile(
        join(directory, "uploads.jsonl"),
        `${JSON.stringify({ id, name, parentId, mimeType, bytes, sha256 })}\n`,
      );
    }
    return displayItem(uploaded);
  },
  moveFile: async ({ fileId, parentIds, destinationFolderId }) => {
    const source = metadata(fileId);
    if (!source || JSON.stringify(source.parents) !== JSON.stringify(parentIds)) {
      throw new Error("Fake Drive source parent changed");
    }
    createdMetadata.set(fileId, { ...source, parents: [destinationFolderId] });
    foldersByParentAndName.set(folderKey(destinationFolderId, source.name), fileId);
  },
  countDescendantFiles: async ids => new Map(ids.map(id => [id, 2])),
  listChildren: async id => {
    loadLegacyFixtures();
    const created = [...createdMetadata.values()]
      .filter(candidate => candidate.parents.includes(id))
      .map(displayItem);
    const projectId = projectIdFrom(id, "qa-project-");
    if (projectId) {
      return [...created, displayItem(metadata(nestedFolder(projectId)))];
    }

    const nestedProjectId = projectIdFrom(id, "qa-nested-");
    if (nestedProjectId) {
      return [
        ...created,
        ...[planFile(nestedProjectId), zipFile(nestedProjectId)].map(fileId =>
          displayItem(metadata(fileId)),
        ),
      ];
    }

    return created;
  },
  downloadFile: async id => {
    const contentByPrefix = {
      "qa-plan-": Buffer.from("%PDF-1.4\nQA plan\n"),
      "qa-revised-plan-": Buffer.from("%PDF-1.4\nQA revised plan\n"),
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
    Object.assign(loaded.GoogleDriveService.prototype, fakeMethods, publicationMethods);
  }
  return loaded;
};
