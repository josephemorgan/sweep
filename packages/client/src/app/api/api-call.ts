import { firstValueFrom, type Observable } from 'rxjs';
import { toApiError } from './api-error';

/** Resolve a request to its body, rejecting with `ApiError` only. */
export async function apiCall<T>(request: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(request);
  } catch (err) {
    throw toApiError(err);
  }
}
