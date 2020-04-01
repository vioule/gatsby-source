import { QueueableRequest } from '../request-queue';
import { IAPIResponse, IAPIMetaList } from '@directus/sdk-js/dist/types/schemes/APIResponse';

export interface PageInfo {
  received: number;
  total: number;
}

/**
 * The configuration used to create a new instance of the PaginatedRequest
 * class.
 *
 * @typeparam T Indicates the type of data accumulated by the request and ultimately returned.
 * @typeparam R Indicates the server response shape, including any pagination details.
 */
export interface PaginatedRequestConfig<T = unknown, R = unknown> {
  request: (pageInfo: PageInfo) => Promise<R>;
  beforeNextPage?: (pageInfo: PageInfo) => boolean;
}

export abstract class PaginatedRequest<T = unknown, R = unknown> implements QueueableRequest<T> {
  private _results: T | void = undefined;

  private _request: (pageInfo: PageInfo) => Promise<R>;
  private _beforeNextPage: (pageInfo: PageInfo) => boolean = () => true;

  constructor(config: PaginatedRequestConfig<T, R>) {
    this._request = config.request;

    if (typeof config.beforeNextPage === 'function') {
      this._beforeNextPage = config.beforeNextPage;
    }
  }

  protected abstract _resolveResults(response: R): T;
  protected abstract _mergeResults(currentResults: T | void, newResults: T): T;
  protected abstract _resolveNextPageInfo(currentPageInfo: PageInfo, response: R): PageInfo;

  public async *exec(): AsyncGenerator<T> {
    for await (const result of this._responseGenerator()) {
      yield result;
    }
  }

  protected async *_responseGenerator(): AsyncGenerator<T> {
    let pageInfo: PageInfo = {
      received: 0,
      total: Number.POSITIVE_INFINITY,
    };

    while (pageInfo.received < pageInfo.total && this._beforeNextPage(pageInfo)) {
      const response = await this._request(pageInfo);
      const result = this._resolveResults(response);
      this._results = this._mergeResults(this._results, result);
      pageInfo = this._resolveNextPageInfo(pageInfo, response);

      yield result;
    }
  }

  public results(): T | void {
    return this._results;
  }
}

export class PaginatedDirectusApiRequest<T> extends PaginatedRequest<T, IAPIResponse<T, IAPIMetaList>> {
  protected _resolveResults(response: IAPIResponse<T, IAPIMetaList>): T {
    const { data, error } = response;

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  protected _mergeResults(currentResults: T | void, nextResult: T): T {
    if (Array.isArray(nextResult)) {
      return Array.isArray(currentResults) ? [...currentResults, ...nextResult] : (nextResult as any);
    } else {
      return nextResult;
    }
  }

  protected _resolveNextPageInfo(currentPageInfo: PageInfo, response: IAPIResponse<T, IAPIMetaList>): PageInfo {
    const {
      // eslint-disable-next-line @typescript-eslint/camelcase
      meta: { result_count, total_count },
    } = response;

    return {
      // eslint-disable-next-line @typescript-eslint/camelcase
      received: currentPageInfo.received + result_count,
      // eslint-disable-next-line @typescript-eslint/camelcase
      total: total_count,
    };
  }
}
