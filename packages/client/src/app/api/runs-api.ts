import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type {
  CreateRunResponseDto,
  DryRunCreateResponseDto,
  DryRunUpdateResponseDto,
  RenameRunBody,
  RunDto,
  RunPayloadDto,
  RunSummaryDto,
  SetCategoryBody,
  SetPinBody,
  SetSectionBody,
  SetTaskBody,
  TaskState,
} from '@sweep/core';
import { apiCall } from './api-call';

const RUNS = '/api/runs';
const DRY_RUN = { dryRun: 'true' } as const;
const id = encodeURIComponent;

function uploadBody(file: File, fields: Record<string, string> = {}): FormData {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  body.append('file', file, file.name);
  return body;
}

/** The runs API (spec §6.2). Every method rejects with `ApiError` only. */
@Service()
export class RunsApi {
  private readonly http = inject(HttpClient);

  listRuns(): Promise<RunSummaryDto[]> {
    return apiCall(this.http.get<RunSummaryDto[]>(RUNS));
  }

  getRun(runId: string): Promise<RunPayloadDto> {
    return apiCall(this.http.get<RunPayloadDto>(`${RUNS}/${id(runId)}`));
  }

  dryRunCreate(file: File): Promise<DryRunCreateResponseDto> {
    return apiCall(
      this.http.post<DryRunCreateResponseDto>(RUNS, uploadBody(file), { params: DRY_RUN }),
    );
  }

  createRun(file: File, name: string | null): Promise<CreateRunResponseDto> {
    const fields: Record<string, string> = name === null ? {} : { name };
    return apiCall(this.http.post<CreateRunResponseDto>(RUNS, uploadBody(file, fields)));
  }

  renameRun(runId: string, name: string): Promise<RunDto> {
    const body: RenameRunBody = { name };
    return apiCall(this.http.patch<RunDto>(`${RUNS}/${id(runId)}`, body));
  }

  async deleteRun(runId: string): Promise<void> {
    await apiCall(this.http.delete<null>(`${RUNS}/${id(runId)}`));
  }

  async setSection(runId: string, sectionId: string, cleared: boolean): Promise<void> {
    const body: SetSectionBody = { cleared };
    await apiCall(this.http.put<null>(`${RUNS}/${id(runId)}/sections/${id(sectionId)}`, body));
  }

  async setPin(runId: string, sectionId: string | null): Promise<void> {
    const body: SetPinBody = { sectionId };
    await apiCall(this.http.put<null>(`${RUNS}/${id(runId)}/pin`, body));
  }

  async setTask(runId: string, taskId: string, state: TaskState | null): Promise<void> {
    const body: SetTaskBody = { state };
    await apiCall(this.http.put<null>(`${RUNS}/${id(runId)}/tasks/${id(taskId)}`, body));
  }

  async setCategory(runId: string, categoryId: string, tracked: boolean | null): Promise<void> {
    const body: SetCategoryBody = { tracked };
    await apiCall(this.http.put<null>(`${RUNS}/${id(runId)}/categories/${id(categoryId)}`, body));
  }

  dryRunUpdate(runId: string, file: File, baseVersion: number): Promise<DryRunUpdateResponseDto> {
    const body = uploadBody(file, { baseVersion: String(baseVersion) });
    return apiCall(
      this.http.post<DryRunUpdateResponseDto>(`${RUNS}/${id(runId)}/guide`, body, {
        params: DRY_RUN,
      }),
    );
  }

  applyUpdate(runId: string, file: File, baseVersion: number): Promise<RunPayloadDto> {
    const body = uploadBody(file, { baseVersion: String(baseVersion) });
    return apiCall(this.http.post<RunPayloadDto>(`${RUNS}/${id(runId)}/guide`, body));
  }
}
