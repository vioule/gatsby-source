import { IAPIMetaList, IAPIResponse } from '@directus/sdk-js/dist/types/schemes/APIResponse';
import { QueryParams } from '@directus/sdk-js/dist/types/schemes/http/Query';
import { IsDefined, IsInt, IsOptional, IsPositive, Max, Min, validateSync } from 'class-validator';
import { QueueableRequest } from '../request-queue';

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

type PaginatedRequestState = 'complete::error' | 'complete::success' | 'queued' | 'started';

export abstract class PaginatedRequest<T = unknown, R = unknown> implements QueueableRequest<T> {
  private _results: T = this._initResults();
  private _receivedError: Error | void = undefined;
  private _responseGenerator: AsyncGenerator<T>;

  // @IsOptional()
  // @IsInt({ message: 'Expected an integer, received $value' })
  // @IsPositive({ message: 'Expected a positive number, received $value' })
  // @Max(Number.MAX_SAFE_INTEGER, { message: 'Expected a finite number, received $value' })
  private _timeout: number | void;

  private _beforeNextPage: (pageInfo: PageInfo, request: PaginatedRequest) => boolean = () => true;

  private _state: PaginatedRequestState = 'queued';
  private _errorListeners: Set<(e: Error) => void> = new Set();
  private _completeListeners: Set<() => void> = new Set();

  constructor(config: PaginatedRequestConfig = {}) {
    this._responseGenerator = this._createResponseGenerator();

    if (typeof config.beforeNextPage === 'function') {
      this._beforeNextPage = config.beforeNextPage;
    }

    this._timeout = config.timeout;

    const validationErrors = validateSync(this);

    if (validationErrors.length) {
      throw new Error('Validation errors: \n' + validationErrors.join('\n'));
    }
  }

  public async exec(): Promise<IteratorResult<T>> {
    if (this._state === 'queued') this._state = 'started';
    return this._responseGenerator.next();
  }

  public results(): T {
    return this._results;
  }

  public finished(): Promise<T> {
    if (this._state === 'complete::success') {
      return Promise.resolve(this.results());
    } else if (this._state === 'complete::error') {
      return Promise.reject(this._receivedError);
    }

    let onComplete: () => void;
    let onError: (e: Error) => void;

    return new Promise<T>((res, rej) => {
      onComplete = (): void => res(this.results());
      onError = (e: Error): void => rej(e);

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
    this._state = 'queued';
    this._receivedError = undefined;
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

    while (pageInfo.hasNextPage && this._beforeNextPage(pageInfo, this) !== false) {
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

  private _wrapTimeout<W>(prom: Promise<W>, timeout: number | void = 0): Promise<W> {
    if (typeof timeout !== 'number' || isNaN(timeout) || !Number.isFinite(timeout) || timeout <= 0) {
      return prom;
    }

    return Promise.race([
      prom,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Request timed out')), timeout)) as Promise<never>,
    ]);
  }

  private _handleError(e: Error): void {
    this._state = 'complete::error';
    this._receivedError = e;
    this._errorListeners.forEach((l) => l(e));
  }

  private _handleComplete(): void {
    this._state = 'complete::success';
    this._completeListeners.forEach((l) => l());
  }
}

export interface PaginatedDirectusApiRequestConfig<T = unknown> extends PaginatedRequestConfig {
  chunkSize?: number;
  limit?: number;
  makeApiRequest(params: QueryParams): Promise<IAPIResponse<T | T[], IAPIMetaList>>;
  initialParams?: QueryParams;
}

export class PaginatedDirectusApiRequest<T = unknown> extends PaginatedRequest<
  T[],
  IAPIResponse<T | T[], IAPIMetaList>
> {
  // @IsInt({ message: 'Expected an integer chunkSize, received $value' })
  // @Min(0, { message: 'Expected a chunkSize >= 0, received $value' })
  // @Max(Number.MAX_SAFE_INTEGER, { message: 'Expected a finite chunkSize, received $value' })
  public readonly chunkSize: number = 0;

  // @IsInt({ message: 'Expected an integer limit, received $value' })
  // @Min(-1, { message: 'Expected a limit >= -1, received $value' })
  // @Max(Number.MAX_SAFE_INTEGER, { message: 'Expected a finite limit, received $value' })
  public readonly limit: number = -1;

  // We won't validate the initial params, a task that should be delegated to the
  // API service layer.
  private _initialParams: QueryParams;

  // @IsDefined()
  private _makeApiRequest!: (params: QueryParams) => Promise<IAPIResponse<T | T[], IAPIMetaList>>;

  constructor({
    chunkSize,
    limit,
    makeApiRequest,
    initialParams = {},
    ...restConfig
  }: PaginatedDirectusApiRequestConfig<T>) {
    super(restConfig);
    if (typeof chunkSize === 'number') {
      this.chunkSize = chunkSize;
    }

    if (typeof limit === 'number') {
      this.limit = limit;
    }

    this._initialParams = initialParams;

    if (typeof makeApiRequest === 'function') {
      this._makeApiRequest = makeApiRequest;
    }

    const validationErrors = validateSync(this);

    if (validationErrors.length) {
      throw new Error('Validation errors: \n' + validationErrors.join('\n'));
    }
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
