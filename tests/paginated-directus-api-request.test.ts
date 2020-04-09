import { PaginatedDirectusApiRequest, PaginatedRequest } from '../src/directus-service/paginated-request';

describe('PaginatedDirectusApiRequest', () => {
  it('Should throw if config is malformed', () => {
    expect(() => {
      new PaginatedDirectusApiRequest();
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest(undefined);
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest(null);
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest(4);
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest('');
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest('abc');
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest({});
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest(['3']);
    }).toThrowError(TypeError);
  });

  it('Should throw if config.sendNextRequest is malformed', () => {
    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: undefined });
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: null });
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: 4 });
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: '' });
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: 'abc' });
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: {} });
    }).toThrowError(TypeError);

    expect(() => {
      new PaginatedDirectusApiRequest({ sendNextRequest: ['3'] });
    }).toThrowError(TypeError);
  });

  it('Should allow creation from minimal config', () => {
    expect(
      new PaginatedDirectusApiRequest<any, any>({ sendNextRequest: (): Promise<any> => Promise.resolve() }),
    ).toBeInstanceOf(PaginatedDirectusApiRequest);
  });

  it('Should be an instance of PaginatedRequest', () => {
    expect(
      new PaginatedDirectusApiRequest<any, any>({ sendNextRequest: (): Promise<any> => Promise.resolve() }),
    ).toBeInstanceOf(PaginatedRequest);
  });
});
