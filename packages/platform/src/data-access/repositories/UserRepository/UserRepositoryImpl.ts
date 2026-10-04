import { injectable } from "tsyringe";
import { UserModel } from "../../models/User.ts";
import type { User, UserInput, UserRepository } from "./UserRepository.ts";

type UserDoc = {
  _id: unknown;
  authUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose-backed UserRepository. Documents are mapped to the plain User entity
 * so Mongoose types never escape.
 */
@injectable()
export class UserRepositoryImpl implements UserRepository {
  async upsertByAuthId({ authUserId, ...fields }: UserInput): Promise<User> {
    // $set (not $setOnInsert) on the mutable fields: this is a sync, so a later
    // delivery SHOULD overwrite — that's how a changed name or avatar lands.
    const doc = await UserModel.findOneAndUpdate(
      { authUserId },
      { $set: fields },
      { upsert: true, returnDocument: "after" },
    ).lean<UserDoc>();

    return toUser(doc);
  }

  async findByAuthId(authUserId: string): Promise<User | null> {
    const doc = await UserModel.findOne({ authUserId }).lean<UserDoc | null>();
    return doc ? toUser(doc) : null;
  }

  async deleteByAuthId(authUserId: string): Promise<void> {
    await UserModel.deleteOne({ authUserId });
  }
}

export function toUser(doc: UserDoc): User {
  return {
    id: String(doc._id),
    authUserId: doc.authUserId,
    email: doc.email ?? null,
    firstName: doc.firstName ?? null,
    lastName: doc.lastName ?? null,
    imageUrl: doc.imageUrl ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
