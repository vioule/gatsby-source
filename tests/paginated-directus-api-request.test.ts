import { IAPIMetaList, IAPIResponse } from '@directus/sdk-js/dist/types/schemes/APIResponse';
import { PaginatedDirectusApiRequest } from '../src/directus-service/paginated-request';

type MockResponse = IAPIResponse<number[], IAPIMetaList>;

// Simply expose protected members of PaginatedDirectusApiRequest for unit testing
class MockRequest extends PaginatedDirectusApiRequest<number[]> {
  public resolveResults = this._resolveResults;
  public mergeResults = this._mergeResults;
  public resolveNextPageInfo = this._resolveNextPageInfo;
}

const buildResponse = (data: number[], total_count?: number): MockResponse => ({
  data,
  meta: {
    result_count: data.length,
    total_count: total_count ?? data.length,
  },
});

describe('PaginatedDirectusApiRequest', () => {
  let mockRequest: MockRequest;
  let flushAll: (req: MockRequest) => Promise<void>;
  const fullMockDataSet = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const dataParts = [fullMockDataSet.slice(0, 4), fullMockDataSet.slice(4, 8), fullMockDataSet.slice(8)];
  const mockResponses = dataParts.map(part => buildResponse(part));

  beforeEach(() => {
    mockRequest = new MockRequest({
      sendNextRequest: ((): any => {
        let i = 0;
        return jest.fn((): Promise<MockResponse> => Promise.resolve(mockResponses[i++]));
      })(),
    });
    flushAll = async (req: MockRequest): Promise<void> => {
      const iter = req.exec();
      let curs = iter.next();

      while (!(await curs).done) {
        curs = iter.next();
      }
    };
  });

  it('Should throw if config is malformed', () => {
    expect(() => {
      new PaginatedDirectusApiRequest(undefined as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest(null as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest(4 as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest('' as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest('abc' as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest({} as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest(['3'] as any);
    }).toThrowError(TypeError);
  });

  it('Should throw if config.sendNextRequest is malformed', () => {
    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: undefined } as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: null } as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: 4 } as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: '' } as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: 'abc' } as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: {} } as any);
    }).toThrowError(TypeError);
    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: ['3'] } as any);
    }).toThrowError(TypeError);
  });

  it('Should throw if the response returned is null/undefined', () => {
    expect(() => mockRequest.resolveResults(undefined as any)).toThrow();
    expect(() => mockRequest.resolveResults(null as any)).toThrow();
  });

  it(`Should return the 'data' property of the network response.`, () => {
    const testData = [[1, 2, 3], [], [1, 1, 1, 1, 1], [1, 1, undefined, 1, 0]];

    for (const part of testData) {
      expect(mockRequest.resolveResults(buildResponse(part as any))).toEqual(part);
    }
  });

  it(`Should throw when an error is returned by the network response`, () => {
    const errorResponse: MockResponse = {
      data: [1, 2, 3],
      error: {
        code: 500,
        message: 'Internal Error',
      },
      meta: {
        result_count: 3,
        total_count: 3,
      },
    };

    expect(() => mockRequest.resolveResults({ ...errorResponse })).toThrow();
    expect(() =>
      mockRequest.resolveResults({ ...errorResponse, error: { code: null, message: 'Test Error' } as any }),
    ).toThrow();
    expect(() =>
      mockRequest.resolveResults({ ...errorResponse, error: { code: 400, message: undefined } as any }),
    ).toThrow();
    expect(() =>
      mockRequest.resolveResults({ ...errorResponse, error: { code: 400, message: null } as any }),
    ).toThrow();
    expect(() =>
      mockRequest.resolveResults({ ...errorResponse, error: { code: undefined, message: null } as any }),
    ).toThrow();
    expect(() => mockRequest.resolveResults({ ...errorResponse, error: { code: 599 } as any })).toThrow();
    expect(() => mockRequest.resolveResults({ ...errorResponse, error: { code: 500, message: '' } as any })).toThrow();
    expect(() => mockRequest.resolveResults({ ...errorResponse, error: { code: 500, message: 123 } as any })).toThrow();
    expect(() =>
      mockRequest.resolveResults({
        ...errorResponse,
        error: { code: 'random garbage', message: 'Error Message' } as any,
      }),
    ).toThrow();
  });

  it(`Should correctly initialize the merged data.`, () => {
    const testData = [[1, 2, 3], [], [1, 1, 1, 1, 1], [1, 0, 1, 2, 34, 3, 5, 1, 7, 3, 1, 0]];

    for (const part of testData) {
      expect(mockRequest.mergeResults(undefined, [...part] as any)).toEqual(part);
    }
  });

  it(`Should correctly merge data when existing data is provided`, () => {
    const tests = [
      [[1, 2, 3], [4]],
      [[], [4]],
      [[1, 1, 1, 1], []],
      [
        [1, 1, 1],
        [-1, 2, 3],
      ],
      [
        [2, 7],
        [1, 2, 3, 4, 5, 6, 7],
      ],
      [
        [5, 4, 6, 2, 7],
        [1, 2, 3, 4, 5, 6, 7],
      ],
    ];

    for (const [existing, data] of tests) {
      const expected = [...existing, ...data];
      expect(mockRequest.mergeResults(existing as any, data as any)).toEqual(expected);
    }
  });
});
