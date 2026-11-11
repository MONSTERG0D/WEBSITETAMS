/* Anything under /api/ that is not a real route answers with a JSON 404
   instead of the site's HTML "page not found". */
import { fail } from "../_lib/http.js";

export function onRequest() {
  return fail(404, "not_found", "No such API route.");
}
