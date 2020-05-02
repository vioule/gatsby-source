import { QueueableRequest } from '../request-queue';
import { IAPIResponse, IAPIMetaList } from '@directus/sdk-js/dist/types/schemes/APIResponse';
import { QueryParams } from '@directus/sdk-js/dist/types/schemes/http/Query';
import { log } from '../../utils';

/**
 * A small interface representing the state for paginated requests.
 * Used to execute the correct
 */
export interface PageInfo {
  currentOffset: number;
  resultCount: number;
  currentPage: number;
  totalPageCount: number;
  hasNextPage: boolean;
}

/**
 * The configuration used to create a new instance of the PaginatedRequest
 * class.
 *
 * @typeparam R Indicates the server response shape, including any pagination details.
 */
export interface PaginatedRequestConfig {
  /**
   * Specifies the amount of time (in ms) an individual request can be active before timing out.
   */
  timeout?: number;
  /**
   * A function called before each page request with the current pagination info.
   * A boolean can be returned to indicate if the request should continue.
   */
  beforeNextPage?: (pageInfo: PageInfo, request: PaginatedRequest) => boolean;
}

export abstract class PaginatedRequest<T = unknown, R = unknown> implements QueueableRequest<T> {
  private _results: T = this._initResults();
  private _responseGenerator: AsyncGenerator<T>;

  private _timeout = 15 * 1000;
  private _beforeNextPage: (pageInfo: PageInfo, request: PaginatedRequest) => boolean = () => true;

  private _errorListeners: Set<(e: Error) => void> = new Set();
  private _completeListeners: Set<() => void> = new Set();

  constructor(config: PaginatedRequestConfig) {
    this._responseGenerator = this._createResponseGenerator();

    if (typeof config.beforeNextPage === 'function') {
      this._beforeNextPage = config.beforeNextPage;
    }

    if (
      typeof config.timeout === 'number' &&
      !isNaN(config.timeout) &&
      Number.isFinite(config.timeout) &&
      config.timeout >= 0
    ) {
      this._timeout = config.timeout;
    }
  }

  public async exec(): Promise<IteratorResult<T>> {
    return this._responseGenerator.next();
  }

  public results(): T {
    return this._results;
  }

  public finished(): Promise<T> {
    let onComplete: () => void;
    let onError: (e: Error) => void;

    return new Promise<T>((res, rej) => {
      onComplete = (): void => {
        res(this.results());
      };
      onError = (e: Error): void => {
        rej(e);
      };

      this._completeListeners.add(onComplete);
      this._errorListeners.add(onError);
    }).finally(() => {
      this._completeListeners.delete(onComplete);
      this._errorListeners.delete(onError);
    });
  }

  public reset(): void {
    this._responseGenerator = this._createResponseGenerator();
    this._results = this._initResults();
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for await (const result of this._responseGenerator) {
      yield result;
    }
  }

  protected abstract _initResults(): T;

  /**
   * Responsible for taking the network response, as returned by
   * the 'config.sendNextRequest' function, and resolving the
   * data from that response. Implementors can check responses for errors
   * and throw if necessary.
   *
   * @param response The network response, as returned by 'config.sendNextRequest'.
   */
  protected abstract _resolveResults(response: R): T;

  /**
   * Responsible for taking the current set of aggregated results from
   * prior requests and integrating the new results given by 'newResults'.
   * 'currentResults' will be void for the first resolved request. This allows
   * implementors to initialize the appropriate container as needed. The new
   * complete set of results should be returned.
   *
   * @param currentResults The current results, as collected by prior completed requests. Will be 'undefined' if there have been no prior requests.
   * @param newResults The results as obtained by the current request. These should be added to the 'currentResults' and returned
   */
  protected abstract _mergeResults(currentResults: T | void, newResults: T): T;

  /**
   * Responsible for taking a network response and the last page info
   * and resolving the next pag info for usage with the next request.
   *
   * @param lastPageInfo The page info used.
   * @param response The response as returned by the network.
   */
  protected abstract _resolveNextPageInfo(lastPageInfo: PageInfo, response: R): PageInfo;

  /**
   * Responsible for accepting the current page info, and returning a
   * Promise that resolves with the next server response.
   *
   * @param pageInfo The current page info used for the request.
   */
  protected abstract _sendNextRequest(pageInfo: PageInfo): Promise<R>;

  protected async *_createResponseGenerator(): AsyncGenerator<T> {
    let pageInfo: PageInfo = {
      currentOffset: 0,
      resultCount: 0,
      currentPage: 0,
      totalPageCount: 0,
      hasNextPage: true,
    };

    while (pageInfo.hasNextPage && this._beforeNextPage(pageInfo, this)) {
      try {
        const response = await this._wrapTimeout(this._sendNextRequest(pageInfo), this._timeout);
        const result = this._resolveResults(response);
        this._results = this._mergeResults(this._results, result);
        pageInfo = this._resolveNextPageInfo(pageInfo, response);

        yield result;
      } catch (e) {
        this._handleError(e);
        throw e;
      }
    }

    this._handleComplete();
  }

  private _wrapTimeout<W>(prom: Promise<W>, timeout = 0): Promise<W> {
    if (typeof timeout !== 'number' || isNaN(timeout) || !Number.isFinite(timeout) || timeout <= 0) {
      return prom;
    }

    return Promise.race([
      prom,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Request timed out')), timeout)) as Promise<never>,
    ]);
  }

  private _handleError(e: Error): void {
    this._errorListeners.forEach(l => l(e));
  }

  private _handleComplete(): void {
    this._completeListeners.forEach(l => l());
  }
}

export interface PaginatedDirectusApiRequestConfig<T = unknown> extends PaginatedRequestConfig {
  id: string;
  chunkSize: number;
  limit: number;
  makeApiRequest(params: QueryParams): Promise<IAPIResponse<T | T[], IAPIMetaList>>;
  initialParams?: QueryParams;
}

export class PaginatedDirectusApiRequest<T = unknown> extends PaginatedRequest<
  T[],
  IAPIResponse<T | T[], IAPIMetaList>
> {
  public readonly id: string;

  public readonly chunkSize: number = 0;
  public readonly limit: number = -1;

  private _initialParams: QueryParams;
  private _makeApiRequest: (params: QueryParams) => Promise<IAPIResponse<T | T[], IAPIMetaList>>;

  constructor({
    id,
    chunkSize,
    limit,
    makeApiRequest,
    initialParams = {},
    ...restConfig
  }: PaginatedDirectusApiRequestConfig<T>) {
    super(restConfig);
    this.id = id;
    if (typeof chunkSize === 'number' && chunkSize > 0 && Number.isFinite(chunkSize)) {
      this.chunkSize = chunkSize;
    }
    if (typeof limit === 'number' && limit >= -1 && Number.isFinite(limit)) {
      this.limit = limit;
    }
    this.chunkSize = chunkSize;
    this._initialParams = initialParams;
    this._makeApiRequest = makeApiRequest;
  }

  protected _initResults(): T[] {
    return [];
  }

  protected _resolveResults(response: IAPIResponse<T, IAPIMetaList>): T[] {
    const { data, error } = response;

    if (error) {
      throw new Error(error.message);
    }

    return Array.isArray(data) ? data : [data];
  }

  protected _mergeResults(currentResults: T[] = [], nextResult: T[]): T[] {
    return [...currentResults, ...nextResult];
  }

  protected _resolveNextPageInfo(currentPageInfo: PageInfo, response: IAPIResponse<T | T[], IAPIMetaList>): PageInfo {
    const {
      // eslint-disable-next-line @typescript-eslint/camelcase
      meta: { result_count, page, page_count },
    } = response as any;

    // eslint-disable-next-line @typescript-eslint/camelcase
    if (typeof result_count !== 'number' || typeof page !== 'number' || typeof page_count !== 'number') {
      throw new Error('Unable to determine result or total count');
    }

    // console.log('resolving next page ifo', currentPageInfo, this.id, this._chunkSize);

    const nextOffset =
      currentPageInfo.currentOffset +
      Math.min(result_count, this.limit >= 0 ? this.limit - this.results.length : Number.POSITIVE_INFINITY);

    return {
      // eslint-disable-next-line @typescript-eslint/camelcase
      currentOffset: nextOffset,
      // eslint-disable-next-line @typescript-eslint/camelcase
      hasNextPage: this._resolveHasNextPage(nextOffset, response.meta),
      // eslint-disable-next-line @typescript-eslint/camelcase
      resultCount: result_count,
      currentPage: page,
      totalPageCount: this._resolveTotalPageCount(response.meta),
    };
  }

  private _resolveHasNextPage(nextOffset: number, meta: any): boolean {
    if ((this.limit >= 0 && nextOffset >= this.limit) || meta.page >= meta.page_count) {
      return false;
    }

    return this.chunkSize > 0;
  }

  private _resolveTotalPageCount(meta: any): number {
    if (this.limit >= 0 && this.chunkSize > 0) {
      return Math.ceil(this.limit / this.chunkSize);
    }

    return meta.page_count;
  }

  protected _sendNextRequest(pageInfo: PageInfo): Promise<IAPIResponse<T | T[], IAPIMetaList>> {
    const params: QueryParams = {
      ...this._initialParams,
      meta: '*',
    };

    // Only add the 'offset' when needed. Avoids a bug in the Directus API.
    if (pageInfo.currentOffset > 0) {
      params.offset = pageInfo.currentOffset;
    }

    if (this.limit >= 0 && this.chunkSize > 0) {
      params.limit = Math.min(this.limit, this.chunkSize);
    } else {
      params.limit = this.chunkSize > 0 ? this.chunkSize : this.limit;
    }

    return this._makeApiRequest(params);
  }
}
