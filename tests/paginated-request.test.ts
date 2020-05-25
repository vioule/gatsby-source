import { PageInfo, PaginatedRequest, PaginatedRequestConfig } from '../src/directus-service/paginated-request';

type MockResponse = Readonly<{ data: MockAggregation; pageInfo: PageInfo }>;
type MockAggregation = Readonly<number[]>;

interface MockPaginatedRequestConfig extends PaginatedRequestConfig {
  mockDataSet: MockAggregation;
  mockResponses: MockResponse[];
}

/**
 * Implements a super basic mock PaginatedRequest to test the abstract class.
 */
class MockPaginatedRequest extends PaginatedRequest<MockAggregation, MockResponse> {
  public currentRequestIndex = 0;
  public throwErrorOnRequest: Error | void = undefined;
  public networkDelay = 0;

  public mockDataSet: MockAggregation;
  public mockResponses: MockResponse[];

  constructor(config: MockPaginatedRequestConfig) {
    super(config);
    this.mockDataSet = config.mockDataSet;
    this.mockResponses = config.mockResponses;
  }

  public reset(): void {
    super.reset();
    this.currentRequestIndex = 0;
    this.networkDelay = 0;
    this.throwErrorOnRequest = undefined;
  }

  public _initResults(): MockAggregation {
    return [];
  }

  public _sendNextRequest = jest.fn(
    async (_: PageInfo): Promise<MockResponse> => {
      if (this.networkDelay > 0) await new Promise(r => setTimeout(() => r(), this.networkDelay));
      if (this.throwErrorOnRequest) return Promise.reject(this.throwErrorOnRequest);
      return Promise.resolve(this.mockResponses[this.currentRequestIndex++]);
    },
  );

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

  public _resolveNextPageInfo = jest.fn((_: PageInfo, { pageInfo }: MockResponse): PageInfo => pageInfo);
}

describe('PaginatedRequest', () => {
  let mockDataSet: MockAggregation;
  let mockResponses: MockResponse[];
  let mockRequest: MockPaginatedRequest;
  let flushAll: (req: MockPaginatedRequest) => Promise<void>;
  let flushCount: (req: MockPaginatedRequest, count: number) => Promise<void>;

  beforeEach(() => {
    mockDataSet = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    mockResponses = [
      {
        data: mockDataSet.slice(0, 4),
        pageInfo: {
          currentOffset: 4,
          currentPage: 1,
          hasNextPage: true,
          resultCount: mockDataSet.length,
          totalPageCount: 3,
        },
      },
      {
        data: mockDataSet.slice(4, 8),
        pageInfo: {
          currentOffset: 8,
          currentPage: 2,
          hasNextPage: true,
          resultCount: mockDataSet.length,
          totalPageCount: 3,
        },
      },
      {
        data: mockDataSet.slice(8),
        pageInfo: {
          currentOffset: mockDataSet.length,
          currentPage: 3,
          hasNextPage: false,
          resultCount: mockDataSet.length,
          totalPageCount: 3,
        },
      },
    ];
    mockRequest = new MockPaginatedRequest({ mockDataSet, mockResponses });
    flushAll = async (req: MockPaginatedRequest): Promise<void> => {
      while (!(await req.exec()).done) {
        void 0;
      }
    };
    flushCount = async (req: MockPaginatedRequest, count: number): Promise<void> => {
      let i = 0;
      while (i < count && !(await req.exec()).done) {
        i++;
      }
    };
  });

  it(`Should throw when instantiated with invalid config`, () => {
    expect(() => {
      new MockPaginatedRequest(null as any);
    }).toThrow(TypeError);
  });

  it(`Should initialize the results container correctly`, () => {
    expect(mockRequest.results()).toEqual([]);
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

    expect(mockRequest.results()).toEqual(mockDataSet);
  });

  it(`Should call the 'sendNextRequest' function with the correct arguments`, async () => {
    expect.assertions(mockResponses.length + 1);

    const expectedPageInfos: PageInfo[] = [
      {
        currentOffset: 0,
        currentPage: 0,
        resultCount: 0,
        totalPageCount: 0,
        hasNextPage: true,
      },
    ];

    for (const { pageInfo } of mockResponses) {
      expectedPageInfos.push({ ...pageInfo });
    }

    await flushAll(mockRequest);

    let i = 0;

    // The last page info should return 'false' to the request runner and
    // should result in no more calls to _sendNextRequest.
    expect(mockRequest._sendNextRequest.mock.calls.length).toBe(expectedPageInfos.length - 1);

    for (const [firstArg] of mockRequest._sendNextRequest.mock.calls as any) {
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
    // receive '[]' as the data so far.
    const expectedAggArgument: (void | number[])[] = mockResponses.reduce(
      (agg, res) => {
        const lastResult: number[] = (agg[agg.length - 1] as any) ?? [];
        agg.push([...lastResult, ...res.data]);
        return agg;
      },
      [[]] as number[][],
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

  it(`Should not throw away results when '_sendNextRequest' throws`, async () => {
    expect.assertions(2);
    const midpoint = Math.floor(mockResponses.length / 2);

    const expectedResults = mockResponses
      .slice(0, midpoint)
      .reduce((agg, { data }) => [...agg, ...data], [] as number[]);

    await flushCount(mockRequest, midpoint);
    mockRequest.throwErrorOnRequest = new Error('TEST_REJECTION');

    await expect(flushAll(mockRequest)).rejects.toThrow();
    expect(mockRequest.results()).toEqual(expectedResults);
  });

  it(`Should not throw away container when 'config.sendNextRequest' only throws`, async () => {
    expect.assertions(2);
    mockRequest.throwErrorOnRequest = new Error('TEST_REJECTION');

    await expect(flushAll(mockRequest)).rejects.toThrow();
    expect(mockRequest.results()).toEqual([]);
  });

  it(`Should continue to behave as a normal iterator when iteration is done`, async () => {
    expect.assertions(2);

    await flushAll(mockRequest);

    expect(mockRequest.results()).toEqual(mockDataSet);

    await flushAll(mockRequest);
    await flushAll(mockRequest);

    expect(mockRequest.results()).toEqual(mockDataSet);
  });

  it(`Should reset any results completely when 'reset' is called`, async () => {
    expect.assertions(6);

    await flushAll(mockRequest);
    expect(mockRequest.results()).toEqual(mockDataSet);

    mockRequest.reset();
    expect(mockRequest.results()).toEqual([]);

    await flushAll(mockRequest);
    expect(mockRequest.results()).toEqual(mockDataSet);

    mockRequest.reset();
    expect(mockRequest.results()).toEqual([]);

    await flushCount(mockRequest, 1);
    expect(mockRequest.results()).toEqual(mockResponses[0].data);

    mockRequest.reset();
    expect(mockRequest.results()).toEqual([]);
  });

  it(`Should reset any error completely when 'reset' is called`, async () => {
    expect.assertions(8);

    mockRequest.throwErrorOnRequest = new Error('TEST_ERROR');
    await expect(flushAll(mockRequest)).rejects.toThrow();
    expect(mockRequest.results()).toEqual([]);

    mockRequest.reset();
    expect(mockRequest.results()).toEqual([]);
    await flushAll(mockRequest);
    expect(mockRequest.results()).toEqual(mockDataSet);

    mockRequest.reset();
    await flushCount(mockRequest, 1);
    expect(mockRequest.results()).toEqual(mockResponses[0].data);

    mockRequest.throwErrorOnRequest = new Error('TEST_ERROR');
    await expect(flushAll(mockRequest)).rejects.toThrow();

    mockRequest.reset();
    expect(mockRequest.results()).toEqual([]);
    await flushAll(mockRequest);
    expect(mockRequest.results()).toEqual(mockDataSet);
  });

  it(`Should resolve the 'finished()' promise once complete all pages fetched`, async () => {
    expect.assertions(1);
    setImmediate(() => flushAll(mockRequest));

    await expect(
      Promise.race([
        mockRequest.finished(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 10 * 5000)),
      ]),
    ).resolves.toEqual(mockDataSet);
  });

  it(`Should reject the 'finished()' promise if an error is encountered`, async () => {
    expect.assertions(1);

    setImmediate(async () => {
      await flushCount(mockRequest, 1);
      mockRequest.throwErrorOnRequest = new Error('TEST_ERROR');
      flushAll(mockRequest).catch(() => void 0);
    });

    await expect(
      Promise.race([
        mockRequest.finished(),
        // Resolve with timeout error as we're expecting a rejection.
        new Promise(res => setTimeout(() => res(new Error('TIMEOUT')), 10 * 5000)),
      ]),
    ).rejects.toBeInstanceOf(Error);
  });

  it(`Should auto-resolve the 'finished()' promise if the request is already done.`, async () => {
    expect.assertions(1);

    await flushAll(mockRequest);

    await expect(
      Promise.race([
        mockRequest.finished(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 10 * 5000)),
      ]),
    ).resolves.toEqual(mockDataSet);
  });

  it(`Should auto-reject the 'finished()' promise if an error was already encountered`, async () => {
    expect.assertions(1);

    await flushCount(mockRequest, 1);
    mockRequest.throwErrorOnRequest = new Error('TEST_ERROR');
    await flushAll(mockRequest).catch(() => void 0);

    await expect(
      Promise.race([
        mockRequest.finished(),
        // Resolve with timeout error as we're expecting a rejection.
        new Promise(res => setTimeout(() => res(new Error('TIMEOUT')), 10 * 5000)),
      ]),
    ).rejects.toBeInstanceOf(Error);
  });

  it(`Should not allow the 'finished()' promise resolution to be affected by 'reset' calls`, async () => {
    expect.assertions(1);

    setImmediate(async () => {
      mockRequest.reset();
      await flushCount(mockRequest, 1);
      mockRequest.reset();
      await flushCount(mockRequest, mockResponses.length - 1);
      mockRequest.reset();
      flushAll(mockRequest);
    });

    await expect(
      Promise.race([
        mockRequest.finished(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 10 * 5000)),
      ]),
    ).resolves.toEqual(mockDataSet);
  });

  it(`Should not allow the 'finished()' promise rejection to be affected by 'reset' calls`, async () => {
    expect.assertions(1);

    setImmediate(async () => {
      mockRequest.reset();
      await flushCount(mockRequest, 1);
      mockRequest.reset();
      await flushCount(mockRequest, mockResponses.length - 1);
      mockRequest.reset();
      await flushCount(mockRequest, 1);
      mockRequest.throwErrorOnRequest = new Error('TEST_ERROR');
      flushAll(mockRequest).catch(() => void 0);
    });

    await expect(
      Promise.race([
        mockRequest.finished(),
        // Resolve with timeout error as we're expecting a rejection.
        new Promise(res => setTimeout(() => res(new Error('TIMEOUT')), 10 * 5000)),
      ]),
    ).rejects.toBeInstanceOf(Error);
  });

  it(`Should call 'config.beforeNextRequest' before the next request.`, async () => {
    // expect.assertions(mockDataSet.length + 1);
    expect.assertions(mockResponses.length * 2 + 1);

    const beforeNextPage = jest.fn((_: PageInfo, request: PaginatedRequest) => true);

    mockRequest = new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage });

    await flushAll(mockRequest);

    const expectedPageInfos: PageInfo[] = [
      {
        currentOffset: 0,
        currentPage: 0,
        hasNextPage: true,
        resultCount: 0,
        totalPageCount: 0,
      },
      ...mockResponses.slice(0, mockResponses.length - 1).map(({ pageInfo }) => pageInfo),
    ];

    expect(beforeNextPage.mock.calls.length).toBe(expectedPageInfos.length);

    let i = 0;
    for (const [firstArg, secondArg] of beforeNextPage.mock.calls) {
      expect(firstArg).toEqual(expectedPageInfos[i++]);
      expect(secondArg).toBe(mockRequest);
    }
  });

  it(`Should not continue if 'config.beforeNextRequest' returns 'false'`, async () => {
    expect.assertions(2);

    const beforeNextPage = jest.fn((p: PageInfo, _: PaginatedRequest) => p.currentPage < 2);
    const expectedResults = mockResponses[0].data.concat(mockResponses[1].data);

    mockRequest = new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage });

    await flushAll(mockRequest);

    expect(beforeNextPage.mock.calls.length).toBe(3);
    expect(mockRequest.results()).toEqual(expectedResults);
  });

  it(`Should continue if 'config.beforeNextRequest' returns values that aren't 'false'`, async () => {
    const mocks: MockPaginatedRequest[] = [
      new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage: (): boolean => undefined as any }),
      new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage: (): boolean => null as any }),
      new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage: (): boolean => 0 as any }),
      new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage: (): boolean => [] as any }),
      new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage: (): boolean => ({} as any) }),
      new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage: (): boolean => -1 as any }),
      new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage: (): boolean => '' as any }),
      new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage: (): boolean => 'false' as any }),
      new MockPaginatedRequest({ mockDataSet, mockResponses, beforeNextPage: (): boolean => new Error() as any }),
    ];

    expect.assertions(mocks.length);

    await Promise.all(mocks.map(r => flushAll(r)));

    for (const r of mocks) {
      expect(r.results()).toEqual(mockDataSet);
    }
  });

  it(`Should throw if an invalid 'config.timeout' is provided`, () => {
    expect(() => new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: -1 as any })).toThrow();
    expect(
      () => new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: Number.POSITIVE_INFINITY as any }),
    ).toThrow();
    expect(
      () => new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: Number.NEGATIVE_INFINITY as any }),
    ).toThrow();
    expect(() => new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: [] as any })).toThrow();
    expect(() => new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: {} as any })).toThrow();
    expect(() => new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: '' as any })).toThrow();
    expect(() => new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: 'false' as any })).toThrow();
    expect(() => new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: new Error() as any })).toThrow();
  });

  it(`Should throw if the given timeout is exceeded`, async () => {
    expect.assertions(2);

    // Test timeout for first request
    const request_1 = new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: 500 });
    request_1.networkDelay = 1500;
    await expect(flushAll(request_1)).rejects.toBeInstanceOf(Error);

    // Test timeout for middle request
    const request_2 = new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: 500 });
    await flushCount(request_2, 1);
    request_2.networkDelay = 1500;
    await expect(flushAll(request_2)).rejects.toBeInstanceOf(Error);
  });

  it(`Should not throw if the timeout is not exceeded`, async () => {
    expect.assertions(2);

    // Test timeout for first request
    const request_1 = new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: 1500 });
    request_1.networkDelay = 100;
    await flushAll(request_1);
    expect(request_1.results()).toEqual(mockDataSet);

    // Test timeout for middle request
    const request_2 = new MockPaginatedRequest({ mockDataSet, mockResponses, timeout: 1500 });
    await flushCount(request_2, 1);
    request_2.networkDelay = 100;
    await flushAll(request_2);
    expect(request_2.results()).toEqual(mockDataSet);
  });
});
