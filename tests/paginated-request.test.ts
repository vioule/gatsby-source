import { PaginatedRequest, PageInfo, PaginatedRequestConfig } from '../src/directus-service/paginated-request';

type MockResponse = { data: number[]; total: number };
type MockAggregation = number[];

/**
 * Implements a super basic mock PaginatedRequest to test the abstract class.
 */
class MockPaginatedRequest extends PaginatedRequest<MockAggregation, MockResponse> {
  public _sendNextRequestMock: jest.Mock<Promise<MockResponse>, []>;

  constructor(config: PaginatedRequestConfig<MockResponse>) {
    super(config);
    this._sendNextRequestMock = config.sendNextRequest as any;
  }

  public _resolveResults = jest.fn(
    (response: MockResponse): MockAggregation => {
      return response.data;
    },
  );

  public _mergeResults = jest.fn(
    (currentResults: MockAggregation = [], newResults: MockAggregation): MockAggregation => {
      return [...currentResults, ...newResults];
    },
  );

  public _resolveNextPageInfo = jest.fn(
    (currentPageInfo: PageInfo, response: MockResponse): PageInfo => {
      const currentOffset = currentPageInfo.currentOffset + response.data.length;
      return {
        currentOffset,
        hasNextPage: currentOffset < response.total,
      };
    },
  );
}

describe('PaginatedRequest', () => {
  let mockRequest: MockPaginatedRequest;
  let flushAll: (req: MockPaginatedRequest) => Promise<void>;
  const fullMockDataSet = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const mockResponses: MockResponse[] = [
    { data: fullMockDataSet.slice(0, 4), total: fullMockDataSet.length },
    { data: fullMockDataSet.slice(4, 8), total: fullMockDataSet.length },
    { data: fullMockDataSet.slice(8, fullMockDataSet.length), total: fullMockDataSet.length },
  ];

  beforeEach(() => {
    mockRequest = new MockPaginatedRequest({
      sendNextRequest: ((): any => {
        let i = 0;
        return jest.fn((): Promise<MockResponse> => Promise.resolve(mockResponses[i++]));
      })(),
    });
    flushAll = async (req: MockPaginatedRequest): Promise<void> => {
      while (!(await req.exec()).done) {
        void 0;
      }
    };
  });

  it(`Should throw when instantiated with invalid config`, () => {
    expect(() => {
      new MockPaginatedRequest(null as any);
    }).toThrow(TypeError);
    expect(() => {
      new MockPaginatedRequest(undefined as any);
    }).toThrow(TypeError);
    expect(() => {
      new MockPaginatedRequest(9 as any);
    }).toThrow(TypeError);
    expect(() => {
      new MockPaginatedRequest(['test'] as any);
    }).toThrow(TypeError);
    expect(() => {
      new MockPaginatedRequest('random' as any);
    }).toThrow(TypeError);
  });

  it(`Should throw when a non-function 'config.sendNextRequest' is provided`, () => {
    expect(() => {
      new MockPaginatedRequest({} as any);
    }).toThrow(TypeError);
    expect(() => {
      new MockPaginatedRequest({ sendNextRequest: null } as any);
    }).toThrow(TypeError);
    expect(() => {
      new MockPaginatedRequest({ sendNextRequest: undefined } as any);
    }).toThrow(TypeError);
    expect(() => {
      new MockPaginatedRequest({ sendNextRequest: 9 } as any);
    }).toThrow(TypeError);
    expect(() => {
      new MockPaginatedRequest({ sendNextRequest: ['test'] } as any);
    }).toThrow(TypeError);
    expect(() => {
      new MockPaginatedRequest({ sendNextRequest: 'random' } as any);
    }).toThrow(TypeError);
  });

  it(`Should return 'void' for results before executing`, () => {
    expect(mockRequest.results()).toBeUndefined();
  });

  it(`Should return iterated responses correctly`, async () => {
    expect.assertions(mockResponses.length + 1);
    let i = 0;

    let result: IteratorResult<MockAggregation, any>;

    while (!(result = await mockRequest.exec()).done) {
      expect(result.value).toEqual(mockResponses[i++].data);
    }

    expect(i).toBe(mockResponses.length);
  });

  it(`Should return the aggregated results correctly after each request`, async () => {
    expect.assertions(mockResponses.length + 1);
    let i = 0;
    const dataSoFar = [];

    while (!(await mockRequest.exec()).done) {
      dataSoFar.push(...mockResponses[i++].data);
      expect(mockRequest.results()).toEqual(dataSoFar);
    }

    expect(mockRequest.results()).toEqual(fullMockDataSet);
  });

  it(`Should call the 'sendNextRequest' function with the correct arguments`, async () => {
    expect.assertions(mockResponses.length + 1);

    const expectedPageInfos: PageInfo[] = [
      {
        currentOffset: 0,
        hasNextPage: true,
      },
    ];

    for (const response of mockResponses) {
      expectedPageInfos.push({
        currentOffset: expectedPageInfos[expectedPageInfos.length - 1].currentOffset + response.data.length,
        hasNextPage:
          expectedPageInfos[expectedPageInfos.length - 1].currentOffset + response.data.length < fullMockDataSet.length,
      });
    }

    await flushAll(mockRequest);

    let i = 0;

    // The last page info should return 'false' to the request runner and
    // should result in no more calls to _sendNextRequest.
    expect(mockRequest._sendNextRequestMock.mock.calls.length).toBe(expectedPageInfos.length - 1);

    for (const [firstArg] of mockRequest._sendNextRequestMock.mock.calls as any) {
      expect(firstArg).toEqual(expectedPageInfos[i++]);
    }
  });

  it(`Should call the concrete '_resolveResults' function with the correct arguments`, async () => {
    expect.assertions(mockResponses.length + 1);

    await flushAll(mockRequest);

    let i = 0;

    expect(mockRequest._resolveResults.mock.calls.length).toBe(mockResponses.length);

    for (const [firstArg] of mockRequest._resolveResults.mock.calls as any) {
      expect(firstArg).toEqual(mockResponses[i++]);
    }
  });

  it(`Should call the concrete '_mergeResults' function with the correct arguments`, async () => {
    expect.assertions(mockResponses.length + 1);

    // Build the expected args. the 'ith' call should be passed the data
    // from calls 0..i-1 & the current response data. The first call should
    // receive 'undefined' as the data so far.
    const expectedAggArgument: (void | number[])[] = mockResponses.reduce(
      (agg, res) => {
        const lastResult: number[] = (agg[agg.length - 1] as any) ?? [];
        agg.push([...lastResult, ...res.data]);
        return agg;
      },
      [undefined] as (void | number[])[],
    );

    await flushAll(mockRequest);

    // We should have to merge results for each generated result exactly once.
    expect(mockRequest._mergeResults.mock.calls.length).toEqual(mockResponses.length);

    let i = 0;
    for (const args of mockRequest._mergeResults.mock.calls as any) {
      expect(args).toEqual([expectedAggArgument[i], mockResponses[i].data]);
      i++;
    }
  });

  it(`Should not throw away results when 'config.sendNextRequest' throws`, async () => {
    expect.assertions(2);
    const midpoint = Math.floor(mockResponses.length / 2);
    const testRequest = new MockPaginatedRequest({
      sendNextRequest: ((): any => {
        let i = 0;
        return jest.fn(
          (): Promise<MockResponse> =>
            i < midpoint ? Promise.resolve(mockResponses[i++]) : Promise.reject(new Error('TEST_REJECTION')),
        );
      })(),
    });

    const expectedResults = mockResponses
      .slice(0, midpoint)
      .reduce((agg, { data }) => [...agg, ...data], [] as number[]);

    await expect(flushAll(testRequest)).rejects.toThrow();
    expect(testRequest.results()).toEqual(expectedResults);
  });

  it(`Should use the same iterator for subsequent 'exec' calls`, () => {
    expect(1).toBe(2);
  });

  it(`Should continue to behave as a normal iterator when iteration is done`, () => {
    expect(1).toBe(2);
  });

  it(`Should reset it's state completely when 'reset' is called`, () => {
    expect(1).toBe(2);
  });
});
