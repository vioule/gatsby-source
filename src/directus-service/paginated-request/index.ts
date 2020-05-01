import { QueueableRequest } from '../request-queue';
import { IAPIResponse, IAPIMetaList } from '@directus/sdk-js/dist/types/schemes/APIResponse';
import { QueryParams } from '@directus/sdk-js/dist/types/schemes/http/Query';

/**
 * A small interface representing the state for paginated requests.
 * Used to execute the correct
 */
export interface PageInfo {
  currentOffset: number;
  resultCount: number;
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
   * A function called before each page request with the current pagination info.
   * A boolean can be returned to indicate if the request should continue.
   */
  beforeNextPage?: (pageInfo: PageInfo, request: PaginatedRequest) => boolean;
}

export abstract class PaginatedRequest<T = unknown, R = unknown> implements QueueableRequest<T> {
  private _results: T | void = undefined;
  private _responseGenerator: AsyncGenerator<T>;

  private _beforeNextPage: (pageInfo: PageInfo, request: PaginatedRequest) => boolean = () => true;

  private _errorListeners: Set<(e: Error) => void> = new Set();
  private _completeListeners: Set<() => void> = new Set();

  constructor(config: PaginatedRequestConfig) {
    this._responseGenerator = this._createResponseGenerator();

    if (typeof config.beforeNextPage === 'function') {
      this._beforeNextPage = config.beforeNextPage;
    }
  }

  public async exec(): Promise<IteratorResult<T>> {
    return this._responseGenerator.next();
  }

  public results(): T | void {
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
    this._results = undefined;
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for await (const result of this._responseGenerator) {
      yield result;
    }
  }

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
      hasNextPage: true,
    };

    while (pageInfo.hasNextPage && this._beforeNextPage(pageInfo, this)) {
      try {
        const response = await this._sendNextRequest(pageInfo);
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

  private _handleError(e: Error): void {
    this._errorListeners.forEach(l => l(e));
  }

  private _handleComplete(): void {
    this._completeListeners.forEach(l => l());
  }
}

export interface PaginatedDirectusApiRequestConfig<T = unknown> extends PaginatedRequestConfig {
  makeApiRequest(params: QueryParams): Promise<IAPIResponse<T | T[], IAPIMetaList>>;
  initialParams?: QueryParams;
}

export class PaginatedDirectusApiRequest<T = unknown> extends PaginatedRequest<
  T[],
  IAPIResponse<T | T[], IAPIMetaList>
> {
  private _initialParams: QueryParams;
  private _makeApiRequest: (params: QueryParams) => Promise<IAPIResponse<T | T[], IAPIMetaList>>;

  constructor({ makeApiRequest, initialParams = {}, ...restConfig }: PaginatedDirectusApiRequestConfig<T>) {
    super(restConfig);
    this._initialParams = initialParams;
    this._makeApiRequest = makeApiRequest;
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
      meta: { result_count, total_count },
    } = response;

    // eslint-disable-next-line @typescript-eslint/camelcase
    if (typeof result_count !== 'number' || typeof total_count !== 'number') {
      throw new Error('Unable to determine result or total count');
    }

    return {
      // eslint-disable-next-line @typescript-eslint/camelcase
      currentOffset: currentPageInfo.currentOffset + result_count,
      // eslint-disable-next-line @typescript-eslint/camelcase
      hasNextPage: currentPageInfo.currentOffset < total_count,
      // eslint-disable-next-line @typescript-eslint/camelcase
      resultCount: result_count,
    };
  }

  protected _sendNextRequest(pageInfo: PageInfo): Promise<IAPIResponse<T | T[], IAPIMetaList>> {
    const params: QueryParams = {
      ...this._initialParams,
      meta: '*',
      offset: pageInfo.currentOffset,
    };

    return this._makeApiRequest(params);
  }
}
