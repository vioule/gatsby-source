import { PaginatedDirectusApiRequest, PaginatedRequest } from '../src/directus-service/paginated-request';

describe('PaginatedDirectusApiRequest', () => {
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

  it('Should allow creation from minimal config', () => {
    expect(
      new PaginatedDirectusApiRequest<any>({ sendNextRequest: (): Promise<any> => Promise.resolve() }),
    ).toBeInstanceOf(PaginatedDirectusApiRequest);
  });

  it('Should be an instance of PaginatedRequest', () => {
    expect(
      new PaginatedDirectusApiRequest<any>({ sendNextRequest: (): Promise<any> => Promise.resolve() }),
    ).toBeInstanceOf(PaginatedRequest);
  });
});
