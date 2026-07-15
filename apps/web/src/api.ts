export { API_BASE_URL, ApiRequestError } from "./apiCore";
import { adminApi } from "./apiAdmin";
import { aiApi } from "./apiAi";
import { authApi } from "./apiAuth";
import { candidateApi } from "./apiCandidate";

export const api = {
  ...authApi,
  ...adminApi,
  ...candidateApi,
  ...aiApi
};
