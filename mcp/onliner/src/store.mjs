import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;

export function defaultStateDirectory() {
  return process.env.ONLINER_STATE_DIR
    ? path.resolve(process.env.ONLINER_STATE_DIR)
    : path.join(os.homedir(), ".forsalelister", "onliner");
}

export class JsonStateStore {
  constructor(directory = defaultStateDirectory(), clock = () => new Date()) {
    this.directory = directory;
    this.clock = clock;
    this.approvalsPath = path.join(directory, "approvals.json");
    this.attemptsPath = path.join(directory, "attempts.json");
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  async readJson(filePath) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  async writeJson(filePath, value) {
    await this.initialize();
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  }

  async saveApproval(approvalId, listing, digest) {
    const approvals = await this.readJson(this.approvalsPath);
    const createdAt = this.clock();
    approvals[approvalId] = {
      approval_id: approvalId,
      digest,
      listing,
      created_at: createdAt.toISOString(),
      expires_at: new Date(createdAt.getTime() + DAY_MS).toISOString(),
    };
    await this.writeJson(this.approvalsPath, approvals);
    return approvals[approvalId];
  }

  async getApproval(approvalId) {
    const approvals = await this.readJson(this.approvalsPath);
    const approval = approvals[approvalId];
    if (!approval) return null;
    if (new Date(approval.expires_at).getTime() <= this.clock().getTime()) {
      return { ...approval, expired: true };
    }
    return { ...approval, expired: false };
  }

  async getAttempt(approvalId) {
    const attempts = await this.readJson(this.attemptsPath);
    return attempts[approvalId] ?? null;
  }

  async claimPublish(approvalId) {
    await this.initialize();
    const safeId = String(approvalId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const claimPath = path.join(this.directory, `${safeId}.publish-claimed`);
    try {
      const handle = await open(claimPath, "wx", 0o600);
      await handle.writeFile(`${this.clock().toISOString()}\n`, "utf8");
      await handle.close();
      return true;
    } catch (error) {
      if (error.code === "EEXIST") return false;
      throw error;
    }
  }

  async saveAttempt(approvalId, update) {
    const attempts = await this.readJson(this.attemptsPath);
    const previous = attempts[approvalId] ?? {};
    attempts[approvalId] = {
      ...previous,
      ...update,
      approval_id: approvalId,
      updated_at: this.clock().toISOString(),
    };
    await this.writeJson(this.attemptsPath, attempts);
    return attempts[approvalId];
  }
}
