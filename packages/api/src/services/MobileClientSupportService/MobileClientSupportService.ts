export type UpdateRequirement = "none" | "recommended" | "required";

export interface ClientRequest {
  header: string | string[] | undefined;
  path: string;
}

export interface MobileClientSupportService {
  /** Where the update wall sends people. */
  readonly updateUrl: string;
  /** Verdict for a reported iOS build (CFBundleVersion, not the marketing version). */
  verdictFor(build: number): UpdateRequirement;
  /** Whether this request must be refused with `426`. */
  isUnsupportedRequest(request: ClientRequest): boolean;
}
