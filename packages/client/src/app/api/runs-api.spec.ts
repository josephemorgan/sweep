import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Issue } from '@sweep/core';
import { ApiError, isRetryable } from './api-error';
import { RunsApi } from './runs-api';

const ISSUE: Issue = {
  severity: 'error',
  code: 'limit',
  message: 'The guide took too long to check.',
  file: null,
  line: null,
  column: null,
  path: null,
};

describe('RunsApi', () => {
  let api: RunsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(RunsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists runs', async () => {
    const result = api.listRuns();
    http.expectOne({ method: 'GET', url: '/api/runs' }).flush([]);
    await expect(result).resolves.toEqual([]);
  });

  it('dry-runs an upload as multipart with ?dryRun=true', async () => {
    const result = api.dryRunCreate(new File(['sweep: 1'], 'guide.yaml'));
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.urlWithParams === '/api/runs?dryRun=true',
    );
    expect(((req.request.body as FormData).get('file') as File).name).toBe('guide.yaml');
    req.flush({ issues: [], summary: null });
    await expect(result).resolves.toEqual({ issues: [], summary: null });
  });

  it('creates a run, sending the name only when given', async () => {
    const named = api.createRun(new File(['x'], 'a.yaml'), 'My run');
    const req = http.expectOne({ method: 'POST', url: '/api/runs' });
    expect((req.request.body as FormData).get('name')).toBe('My run');
    req.flush({ runId: 'r1' }, { status: 201, statusText: 'Created' });
    await expect(named).resolves.toEqual({ runId: 'r1' });

    const unnamed = api.createRun(new File(['x'], 'a.yaml'), null);
    const req2 = http.expectOne({ method: 'POST', url: '/api/runs' });
    expect((req2.request.body as FormData).has('name')).toBe(false);
    req2.flush({ runId: 'r2' }, { status: 201, statusText: 'Created' });
    await unnamed;
  });

  it('sends progress writes as PUTs with the DTO bodies', async () => {
    const cases = [
      [api.setSection('r1', 'village', true), '/api/runs/r1/sections/village', { cleared: true }],
      [api.setPin('r1', null), '/api/runs/r1/pin', { sectionId: null }],
      [
        api.setTask('r1', 'lost-cat', 'dont-care'),
        '/api/runs/r1/tasks/lost-cat',
        { state: 'dont-care' },
      ],
      [api.setCategory('r1', 'lore', null), '/api/runs/r1/categories/lore', { tracked: null }],
    ] as const;
    for (const [promise, url, body] of cases) {
      const req = http.expectOne({ method: 'PUT', url });
      expect(req.request.body).toEqual(body);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await promise;
    }
  });

  it('renames with PATCH and deletes with DELETE', async () => {
    const renamed = api.renameRun('r1', 'New name');
    const patch = http.expectOne({ method: 'PATCH', url: '/api/runs/r1' });
    expect(patch.request.body).toEqual({ name: 'New name' });
    patch.flush({ id: 'r1', name: 'New name' });
    await expect(renamed).resolves.toMatchObject({ name: 'New name' });

    const deleted = api.deleteRun('r1');
    http
      .expectOne({ method: 'DELETE', url: '/api/runs/r1' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await deleted;
  });

  it('sends baseVersion with a guide update dry run and apply', async () => {
    const preview = api.dryRunUpdate('r1', new File(['x'], 'g.md'), 3);
    const dry = http.expectOne((r) => r.urlWithParams === '/api/runs/r1/guide?dryRun=true');
    expect((dry.request.body as FormData).get('baseVersion')).toBe('3');
    dry.flush({ issues: [], diff: null });
    await preview;

    const apply = api.applyUpdate('r1', new File(['x'], 'g.md'), 3);
    const req = http.expectOne((r) => r.urlWithParams === '/api/runs/r1/guide');
    expect((req.request.body as FormData).get('baseVersion')).toBe('3');
    req.flush({ run: { id: 'r1' }, guide: {}, progress: {} });
    await apply;
  });

  it('maps an API error body to ApiError', async () => {
    const result = api.createRun(new File(['x'], 'g.yaml'), null);
    http
      .expectOne({ method: 'POST', url: '/api/runs' })
      .flush(
        { error: { code: 'invalid-guide', message: 'The guide has errors.', issues: [ISSUE] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await expect(result).rejects.toMatchObject({
      status: 422,
      code: 'invalid-guide',
      issues: [ISSUE],
    });
  });

  it('maps a network failure to status 0', async () => {
    const result = api.getRun('r1');
    http.expectOne('/api/runs/r1').error(new ProgressEvent('error'));
    const err = await result.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isNetwork).toBe(true);
  });

  it('classifies retryable failures (spec §5.7)', () => {
    for (const status of [0, 408, 429, 500, 503]) {
      expect(isRetryable(new ApiError(status, 'x', 'x'))).toBe(true);
    }
    for (const status of [400, 401, 403, 404, 409, 413, 422]) {
      expect(isRetryable(new ApiError(status, 'x', 'x'))).toBe(false);
    }
  });
});
