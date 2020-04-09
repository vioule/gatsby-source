import { QueueableRequest } from '../request-queue';
import { IAPIResponse, IAPIMetaList } from '@directus/sdk-js/dist/types/schemes/APIResponse';

export interface PageInfo {
  currentOffset: number;
  hasNextPage: boolean;
}

/**
 * The configuration used to create a new instance of the PaginatedRequest
 * class.
 *
 * @typeparam R Indicates the server response shape, including any pagination details.
 */
export interface PaginatedRequestConfig<R = unknown> {
  /**
   * A function that accepts the current page info, and returns a Promise that resolves with the next
   * server response.
   */
  sendNextRequest: (pageInfo: PageInfo) => Promise<R>;
  /**
   * A function called before each page request with the current pagination info.
   * A boolean can be returned to indicate if the request should continue.
   */
  beforeNextPage?: (pageInfo: PageInfo) => boolean;
}

export abstract class PaginatedRequest<T = unknown, R = unknown> implements QueueableRequest<T> {
  private _results: T | void = undefined;

  private _sendNextRequest: (pageInfo: PageInfo) => Promise<R>;
  private _beforeNextPage: (pageInfo: PageInfo) => boolean = () => true;

  constructor(config: PaginatedRequestConfig<R>) {
    if (typeof config?.sendNextRequest !== 'function') {
      throw new TypeError(`Unable to create a PaginatedRequest without a 'config.sendNextRequest' implementation`);
    }

    this._sendNextRequest = config.sendNextRequest;

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
      currentOffset: 0,
      hasNextPage: true,
    };

    while (pageInfo.hasNextPage && this._beforeNextPage(pageInfo)) {
      const response = await this._sendNextRequest(pageInfo);
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
      currentOffset: currentPageInfo.currentOffset + result_count,
      // eslint-disable-next-line @typescript-eslint/camelcase
      hasNextPage: currentPageInfo.currentOffset < total_count,
    };
  }
}
