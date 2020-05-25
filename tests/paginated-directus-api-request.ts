import { IAPIMetaList, IAPIResponse } from '@directus/sdk-js/dist/types/schemes/APIResponse';
import { PaginatedDirectusApiRequest } from '../src/directus-service/paginated-request';
import { QueryParams } from '@directus/sdk-js/dist/types/schemes/http/Query';

type MockAggregation = number[];
type MockResponse = IAPIResponse<MockAggregation, IAPIMetaList>;

const buildResponse = (data: MockAggregation, total_count?: number): MockResponse => ({
  data,
  meta: {
    result_count: data.length,
    total_count: total_count ?? data.length,
  },
});

describe('PaginatedDirectusApiRequest', () => {
  let mockDataSet: MockAggregation;
  let mockResponses: MockResponse[];
  let mockMakeApiRequest: jest.Mock<Promise<IAPIResponse<MockAggregation, IAPIMetaList>>, [QueryParams]>;
  let mockRequest: PaginatedDirectusApiRequest<number>;

  let flushAll: (req: PaginatedDirectusApiRequest) => Promise<void>;
  let flushCount: (req: PaginatedDirectusApiRequest, count: number) => Promise<void>;

  beforeEach(() => {
    mockDataSet = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    mockResponses = [
      buildResponse(mockDataSet.slice(0, 4), mockDataSet.length),
      buildResponse(mockDataSet.slice(4, 8), mockDataSet.length),
      buildResponse(mockDataSet.slice(8), mockDataSet.length),
    ];

    mockMakeApiRequest = jest.fn(async ({ page }: any) => {
      return mockResponses[page - 1];
    });

    mockRequest = new PaginatedDirectusApiRequest({ id: 'mock-request', makeApiRequest: mockMakeApiRequest });

    flushAll = async (req: PaginatedDirectusApiRequest): Promise<void> => {
      while (!(await req.exec()).done) {
        void 0;
      }
    };
    flushCount = async (req: PaginatedDirectusApiRequest, count: number): Promise<void> => {
      let i = 0;
      while (i < count && !(await req.exec()).done) {
        i++;
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
});
