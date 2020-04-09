import { PaginatedRequest, PageInfo } from '../src/directus-service/paginated-request';

type MockResponse = { data: number[]; total: number };
type MockAggregation = number[];

/**
 * Implements a super basic mock PaginatedRequest to test the abstract class.
 */
class MockPaginatedRequest extends PaginatedRequest<MockAggregation, MockResponse> {
  protected _resolveResults(response: MockResponse): MockAggregation {
    return response.data;
  }

  protected _mergeResults(currentResults: MockAggregation = [], newResults: MockAggregation): MockAggregation {
    return [...currentResults, ...newResults];
  }

  protected _resolveNextPageInfo(currentPageInfo: PageInfo, response: MockResponse): PageInfo {
    return {
      currentOffset: currentPageInfo.currentOffset + response.data.length,
      hasNextPage: currentPageInfo.currentOffset < response.total,
    };
  }
}

describe('PaginatedRequest', () => {
  let mockRequest: MockPaginatedRequest;
  const mockResponses: MockResponse[] = [
    { data: [1, 2, 3, 4], total: 10 },
    { data: [5, 6, 7, 8], total: 10 },
    { data: [9, 10], total: 10 },
  ];

  beforeEach(() => {
    mockRequest = new MockPaginatedRequest({
      sendNextRequest: ((): any => {
        let i = 0;
        return (): Promise<MockResponse> => Promise.resolve(mockResponses[i++]);
      })(),
    });
  });
});
