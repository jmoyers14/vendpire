import mongoose from "mongoose";

let connected = false;

/**
 * Opens the single shared Mongoose connection for the process. Idempotent so
 * repeated calls are harmless. This is the only place the server entry touches
 * the database driver — everything else goes through a repository.
 */
export async function connectDatabase(uri: string): Promise<void> {
  if (connected) {
    return;
  }
  await mongoose.connect(uri);
  connected = true;
}
