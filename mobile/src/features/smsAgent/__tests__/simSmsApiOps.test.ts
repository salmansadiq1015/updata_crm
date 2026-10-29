import { ApiError } from '@/services/api/apiErrors';

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('@/services/api/apiClient', () => ({
  api: { post: (...a: unknown[]) => mockPost(...a), get: (...a: unknown[]) => mockGet(...a) },
}));

// eslint-disable-next-line import/first
import { simSmsApi } from '../api/simSmsApi';

const notFound = () => new ApiError({ kind: 'http', status: 404, message: 'Not found' });

it('heartbeat and callbacks tolerate a server without the endpoints (404)', async () => {
  mockPost.mockRejectedValueOnce(notFound());
  mockGet.mockRejectedValueOnce(notFound());
  await expect(simSmsApi.heartbeat({} as never)).resolves.toBeNull();
  await expect(simSmsApi.callbacks()).resolves.toEqual([]);
});

it('other errors still surface', async () => {
  mockGet.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 500, message: 'boom' }));
  await expect(simSmsApi.callbacks()).rejects.toBeInstanceOf(ApiError);
});
