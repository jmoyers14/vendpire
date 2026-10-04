import { injectable } from "tsyringe";
import { JobModel } from "../../models/Job.ts";
import type {
  Job,
  JobInput,
  JobRepository,
  JobStatus,
} from "./JobRepository.ts";

type JobDoc = {
  _id: unknown;
  jobType: string;
  dedupKey: string;
  orgId: string | null;
  payload: unknown;
  result: unknown;
  status: JobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose-backed JobRepository. Documents are mapped to the plain Job entity so
 * Mongoose types never escape.
 */
@injectable()
export class JobRepositoryImpl implements JobRepository {
  async enqueuePending({
    jobType,
    dedupKey,
    orgId,
    payload,
  }: JobInput): Promise<Job> {
    // $setOnInsert only. A repeat request must find its existing job exactly as
    // it left it — resetting a succeeded job to pending would re-run the work,
    // which is the failure mode this whole table prevents.
    const doc = await JobModel.findOneAndUpdate(
      { jobType, dedupKey },
      {
        $setOnInsert: {
          orgId,
          payload,
          result: null,
          status: "pending",
          attempts: 0,
          lastError: null,
        },
      },
      { upsert: true, returnDocument: "after" },
    ).lean<JobDoc>();

    return toJob(doc);
  }

  async markRunning(id: string): Promise<Job | null> {
    const doc = await JobModel.findByIdAndUpdate(
      id,
      { $set: { status: "running" }, $inc: { attempts: 1 } },
      { returnDocument: "after" },
    ).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async markSucceeded(id: string, result?: unknown): Promise<Job | null> {
    const doc = await JobModel.findByIdAndUpdate(
      id,
      { $set: { status: "succeeded", result: result ?? null, lastError: null } },
      { returnDocument: "after" },
    ).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async markFailed(id: string, error: string): Promise<Job | null> {
    const doc = await JobModel.findByIdAndUpdate(
      id,
      { $set: { status: "failed", lastError: error } },
      { returnDocument: "after" },
    ).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async findByKey(jobType: string, dedupKey: string): Promise<Job | null> {
    const doc = await JobModel.findOne({ jobType, dedupKey }).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async findForOrg(orgId: string, id: string): Promise<Job | null> {
    const doc = await JobModel.findOne({ _id: id, orgId }).lean<JobDoc | null>();
    return doc ? toJob(doc) : null;
  }

  async findByStatus(status: JobStatus, limit: number): Promise<Job[]> {
    const docs = await JobModel.find({ status })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean<JobDoc[]>();
    return docs.map(toJob);
  }
}

export function toJob(doc: JobDoc): Job {
  return {
    id: String(doc._id),
    jobType: doc.jobType,
    dedupKey: doc.dedupKey,
    orgId: doc.orgId ?? null,
    payload: doc.payload ?? null,
    result: doc.result ?? null,
    status: doc.status,
    attempts: doc.attempts,
    lastError: doc.lastError ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
