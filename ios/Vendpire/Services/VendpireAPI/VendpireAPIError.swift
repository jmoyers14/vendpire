import Foundation

/// A documented failure from the API, carrying the server's own sentence.
///
/// The generated client's `response.ok` shorthand throws
/// `RuntimeError.unexpectedResponseStatus` for every other status, and its
/// `localizedDescription` is an enum dump — unreadable in a red row under a
/// text field. The attach path needs the real message: a 409 names the record
/// the barcode is already on, which is what the not-found sheet's one-tap
/// recovery is built on.
///
/// `statusCode` travels with it so a caller can recognise a conflict without
/// matching prose.
struct VendpireAPIError: LocalizedError, Equatable {
    let statusCode: Int
    let message: String

    /// A documented failure whose body didn't parse still has to say
    /// something, so the message falls back to the status.
    init(statusCode: Int, message: String?) {
        self.statusCode = statusCode
        self.message = message ?? "The server returned \(statusCode)."
    }

    var errorDescription: String? { message }
}
